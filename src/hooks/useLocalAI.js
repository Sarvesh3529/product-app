"use client";
import { useState, useEffect, useRef } from "react";

// Fallback recipe used when the model fails to produce valid JSON
const FALLBACK_RECIPE = {
  baseShape: "cylinder",
  hollow: false,
  features: [],
  scaleX: 1.0,
  scaleY: 1.0,
  scaleZ: 1.0,
};

/**
 * Custom hook that lazily downloads & runs Xenova/Qwen1.5-0.5B-Chat
 * entirely on the client via @huggingface/transformers (v3 successor to
 * @xenova/transformers). The pipeline is stored in a ref so that React
 * state updates never cause the heavy model to be re-initialised.
 *
 * @param {string} modelId  HuggingFace model id (default: Xenova/Qwen1.5-0.5B-Chat)
 * @returns {{ loading: boolean, error: string|null, infer: (prompt:string)=>Promise<object> }}
 */
export default function useLocalAI(modelId = "Xenova/Qwen1.5-0.5B-Chat") {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  // Store the heavy pipeline object in a ref – not state – so it is never
  // serialised by React and never triggers unnecessary re-renders.
  const generatorRef = useRef(null);

  useEffect(() => {
    // Guard: this must only run in the browser.
    if (typeof window === "undefined") return;

    let cancelled = false;

    const init = async () => {
      try {
        // Dynamic import keeps the WASM bundle out of the server build.
        // @huggingface/transformers v3 ships proper ESM and avoids the
        // "Cannot convert undefined or null to object" crash that v2 caused
        // under Turbopack.
        const { pipeline } = await import("@huggingface/transformers");

        const gen = await pipeline("text-generation", modelId, {
          // q4 quantised weights – tiny download, runs on CPU via WASM
          dtype: "q4",
          // Prevent the lib from trying to access the Node.js file-system
          device: "wasm",
        });

        if (!cancelled) {
          generatorRef.current = gen;
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[useLocalAI] Failed to load transformer model:", e);
          setError(e?.message ?? String(e));
          setLoading(false);
        }
      }
    };

    init();

    // Cleanup: flag the effect as cancelled so stale async results are ignored
    return () => { cancelled = true; };
  }, [modelId]);

  /**
   * Run inference and return a parsed designRecipe object.
   * Falls back to FALLBACK_RECIPE if the model output cannot be parsed.
   */
  const infer = async (userPrompt) => {
    if (loading || !generatorRef.current) {
      console.warn("[useLocalAI] Model not ready – falling back to defaults");
      return FALLBACK_RECIPE;
    }

    // ChatML prompt for Qwen1.5-0.5B-Chat
    const chatPrompt =
`<|im_start|>system
You are a precise 3D design compiler. Your only job is to convert natural language descriptions into a raw JSON object matching this schema:
{
  "baseShape": "cylinder" | "cube" | "sphere" | "torus",
  "hollow": boolean,
  "features": ["top-nozzle" | "handle"],
  "scaleX": number,
  "scaleY": number,
  "scaleZ": number
}
Rules:
- "thin"/"slender" -> scaleX: 0.6, scaleZ: 0.6
- "wide"/"thick"   -> scaleX: 1.4, scaleZ: 1.4
- "tall"           -> scaleY: 1.4
- "sipper"/"nozzle"/"cap" -> features include "top-nozzle"
- Output ONLY valid JSON inside a markdown \`\`\`json block. No extra text.
<|im_end|>
<|im_start|>user
Description: "${userPrompt}"
<|im_end|>
<|im_start|>assistant
`;

    try {
      const result = await generatorRef.current(chatPrompt, {
        max_new_tokens: 200,
        temperature: 0.0,
        do_sample: false,
      });

      const text = result?.[0]?.generated_text ?? "";

      // Extract JSON from markdown fenced block, or bare object
      const jsonMatch =
        text.match(/```json\s*([\s\S]*?)\s*```/i) ||
        text.match(/(\{[\s\S]*?\})/);

      if (!jsonMatch) {
        console.warn("[useLocalAI] No JSON block found in model output, using fallback");
        return FALLBACK_RECIPE;
      }

      const jsonStr = jsonMatch[1] ?? jsonMatch[0];
      const parsed  = JSON.parse(jsonStr);

      return {
        baseShape: parsed.baseShape                              ?? FALLBACK_RECIPE.baseShape,
        hollow:    typeof parsed.hollow === "boolean" ? parsed.hollow : FALLBACK_RECIPE.hollow,
        features:  Array.isArray(parsed.features)    ? parsed.features : FALLBACK_RECIPE.features,
        scaleX:    typeof parsed.scaleX === "number"  ? parsed.scaleX  : FALLBACK_RECIPE.scaleX,
        scaleY:    typeof parsed.scaleY === "number"  ? parsed.scaleY  : FALLBACK_RECIPE.scaleY,
        scaleZ:    typeof parsed.scaleZ === "number"  ? parsed.scaleZ  : FALLBACK_RECIPE.scaleZ,
      };
    } catch (e) {
      console.error("[useLocalAI] Inference / JSON parse error:", e);
      return FALLBACK_RECIPE;
    }
  };

  return { loading, error, infer };
}
