import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
import path from "path";
import fs from "fs/promises";
import { augmentPrompt } from "@/utils/promptAugmentor";
import { Client } from "@gradio/client";
import { NextResponse } from "next/server"; // Added missing import

export async function POST(req) {
  try {
    console.log("DEBUG: Hugging Face Gradio generation request started.");

    // Sanity check for Hugging Face Token
    if (!process.env.HF_TOKEN) {
      throw new Error("Missing HF_TOKEN in environment variables. Please check your .env.local file.");
    }

    const { prompt } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Enhance prompt for better structural generation
    const enhancedPrompt = augmentPrompt(prompt);

    // Step 1: Generate 2D Image using direct Hugging Face Inference API
    console.log("DEBUG: Generating 2D reference image via Direct HTTP API...");

    let generatedImageData;
    try {
      // Hardcoded endpoint configuration with explicitly handled headers
      const url = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell";
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${String(process.env.HF_TOKEN).trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: enhancedPrompt
        }),
      }).catch((err) => {
        throw new Error(`Local Network/DNS Blocker: ${err.message}`);
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hugging Face API responded with status ${response.status}: ${errorText}`);
      }

      // Convert the raw image binary output directly to a data URL format for TripoSR
      const buffer = await response.arrayBuffer();
      const base64Image = Buffer.from(buffer).toString("base64");
      generatedImageData = `data:image/jpeg;base64,${base64Image}`;

    } catch (error) {
      console.error("Direct HF API Error (Flux):", error);
      return NextResponse.json(
        { error: `Flux image generation failed: ${error.message || error}` },
        { status: 500 }
      );
    }

    // Step 2: Convert Image to 3D Mesh using TripoSR (High Speed)
    console.log("DEBUG: Converting image to 3D mesh via TripoSR...");
    const tripoClient = await Client.connect("stabilityai/TripoSR", {
      token: `Bearer ${process.env.HF_TOKEN}`,
    });

    // TripoSR predict endpoint usually takes [image, remove_background]
    let meshResult;
    try {
      meshResult = await tripoClient.predict("/predict", [
        generatedImageData,
        true, // remove_background
      ]);
    } catch (error) {
      console.error("Gradio Client Error (TripoSR):", error);
      return NextResponse.json({
        error: `3D Mesh conversion failed: ${error.message}`,
        details: error.data || error.toString()
      }, { status: 500 });
    }

    // The .glb file is usually the first output in the result array
    const glbFile = meshResult.data?.[0];
    if (!glbFile || !glbFile.url) {
      throw new Error("No GLB output returned from TripoSR prediction.");
    }

    // Step 3: Download the GLB binary
    console.log("DEBUG: Downloading GLB from URL:", glbFile.url);
    const glbResponse = await fetch(glbFile.url);
    if (!glbResponse.ok) {
      throw new Error(`Failed to download GLB: ${glbResponse.status}`);
    }
    const arrayBuffer = await glbResponse.arrayBuffer();

    // Step 4: Store GLB file locally
    const requestId = Date.now().toString();
    const dirPath = path.join(process.cwd(), "public", "generated", requestId);

    console.log("DEBUG: Creating directory:", dirPath);
    await fs.mkdir(dirPath, { recursive: true });

    const filePath = path.join(dirPath, "model.glb");
    console.log("DEBUG: Writing file:", filePath);
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));

    console.log("DEBUG: Generation successful.");
    const modelUrl = `/generated/${requestId}/model.glb`;
    
    return NextResponse.json({ modelUrl }, { status: 200 });

  } catch (error) {
    // Robust error diagnostics
    console.error("DEBUG BACKEND FAIL:", error);
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}