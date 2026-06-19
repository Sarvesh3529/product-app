import fs from "fs";
import path from "path";
import express from "express";
import axios from "axios";
import sharp from "sharp";
import cors from "cors";
import FormData from "form-data";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const app = express();
const PORT = process.env.PORT || 5000;

const ACCOUNT_ID = process.env.ACCOUNT_ID;
const API_TOKEN = process.env.API_TOKEN;

console.log("ACCOUNT_ID:", process.env.ACCOUNT_ID);
console.log("API_TOKEN exists:", !!process.env.API_TOKEN);
console.log("HF_TOKEN exists:", !!process.env.HF_TOKEN);

app.use(cors({ origin: "*" }));
app.use(express.json());

function normalizePrompt(userPrompt) {
    return `Create exactly this object and no other object: "${userPrompt}". Center it as one complete product-shaped object on a plain white background. Use a clean solid dark silhouette suitable for 3D reconstruction. Do not generate a bottle unless the requested object is a bottle. No text, no labels, no scene, no shadows, no extra objects.`;
}

app.post("/api/generate-heightmap", async (req, res) => {
    const prompt = String(req.body?.prompt || "").trim();

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
    }

    const normalizedPrompt = normalizePrompt(prompt);
    res.set("Cache-Control", "no-store");

    try {
        console.log(`[HOP 1] ✅ Request received from frontend. Prompt: "${prompt}"`);

        // 1. Generate image (Cloudflare)
        console.log('⏳ [STEP 1] Calling Cloudflare...');
        const response = await axios.post(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
            { prompt: normalizedPrompt },
            { headers: { Authorization: `Bearer ${API_TOKEN}` } }
        );
        console.log(`[HOP 2] ✅ Cloudflare responded. Status: ${response.status}`);

        if (!response.data?.result?.image) {
            return res.status(500).json({ error: "Cloudflare did not return an image" });
        }

        const base64Image = response.data.result.image;
        const inputBuffer = Buffer.from(base64Image, "base64");

        // 2. Send image to Python service for background removal (Explicitly targeting 8080)
        console.log('⏳ [STEP 2] Calling Python Worker...');
        const formData = new FormData();
        formData.append('file', inputBuffer, {
            filename: 'image.png',
            contentType: 'image/png',
        });

        const pythonWorkerUrl = process.env.PYTHON_WORKER_URL || "http://localhost:8080";
        const pythonServiceResponse = await axios.post(
            `${pythonWorkerUrl.replace(/\/$/, "")}/remove-bg`,
            formData,
            {
                headers: { ...formData.getHeaders() },
                responseType: 'arraybuffer',
                timeout: 10000 // 10s absolute network cutoff guard
            }
        );
        console.log(`[HOP 3] ✅ Python service responded. Status: ${pythonServiceResponse.status}`);

        const noBgBuffer = Buffer.from(pythonServiceResponse.data);

        // Safety verification check of incoming image data bounds
        if (!noBgBuffer || noBgBuffer.length < 100) {
            throw new Error("Received an invalid or empty image buffer from the Python background removal worker.");
        }

        // 3. Clean image for heightmap with explicit promise wrapping protection
        console.log(`[HOP 4] ⏳ Processing with Sharp...`);

        const processed = await Promise.race([
            sharp(noBgBuffer)
                .ensureAlpha()
                .flatten({ background: { r: 255, g: 255, b: 255 } })
                .resize(128, 128)
                .grayscale()
                .threshold(240)
                .negate({ alpha: false })
                .png()
                .toBuffer(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Sharp pipeline timed out")), 5000))
        ]);

        console.log(`[HOP 4] ✅ Sharp processing complete. Output size: ${processed.length} bytes`);

        // --- DEBUG LAYER: SAVE TO DISK ---
        const debugPath = path.join(process.cwd(), "debug_output.jpg");
        fs.writeFileSync(debugPath, processed);
        console.log(`[DEBUG] 💾 Image saved locally to: ${debugPath}`);
        // ---------------------------------

        const finalBase64 = processed.toString("base64");
        return res.json({ image: `data:image/png;base64,${finalBase64}`, prompt });

    } catch (error) {
        console.error(`[ERROR] ❌ Pipeline failed at some stage:`);
        console.error(`[ERROR] Message: ${error.message}`);
        return res.status(500).json({
            error: "generation failed",
            details: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 3D PROXY ENGINE RUNNING ON port ${PORT}`);
});
