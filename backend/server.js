import express from "express";
import axios from "axios";
import sharp from "sharp";
import cors from "cors";
import FormData from "form-data";

const app = express();
const port = 5000;

const ACCOUNT_ID = process.env.ACCOUNT_ID
const API_TOKEN = process.env.API_TOKEN

app.use(cors({ origin: "*" }));
app.use(express.json());

function normalizePrompt(userPrompt) {
    return `technical silhouette of ${userPrompt}, single object only, centered, orthographic side view, isolated object, pure white background, black silhouette, vector style, clean outline, no shadows, no reflections, no labels, no text, no logos, no watermark, high contrast`;
}

app.post("/api/generate-heightmap", async (req, res) => {
    const { prompt } = req.body;
    const normalizedPrompt = normalizePrompt(prompt);

    console.log("Original Prompt:", prompt);
    console.log("Normalized Prompt:", normalizedPrompt);

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
    }

    try {
        console.log(`[HOP 1] ✅ Request received from frontend. Prompt: "${prompt}"`);

        // 1. Generate image (Cloudflare)
        console.log(`[HOP 2] ⏳ Calling Cloudflare Flux API...`);
        const response = await axios.post(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
            {
                prompt: normalizedPrompt
            },
            {
                headers: {
                    Authorization: `Bearer ${API_TOKEN}`
                }
            }
        );
        console.log(`[HOP 2] ✅ Cloudflare responded. Status: ${response.status}`);
        console.log(`[HOP 2] Response keys:`, Object.keys(response.data));

        if (!response.data?.result?.image) {
            console.error(`[HOP 2] ❌ No image in response. Full data:`, JSON.stringify(response.data).slice(0, 500));
            return res.status(500).json({ error: "Cloudflare did not return an image" });
        }

        const base64Image = response.data.result.image;
        const inputBuffer = Buffer.from(base64Image, "base64");
        console.log(`[HOP 2] Image buffer size: ${inputBuffer.length} bytes`);

        // 2. Send image to Python service for background removal
        console.log(`[HOP 3] ⏳ Sending image to Python service at http://localhost:3000/remove-bg ...`);
        const formData = new FormData();
        formData.append('file', inputBuffer, {
            filename: 'image.png',
            contentType: 'image/png',
        });

        const pythonServiceResponse = await axios.post(
            "http://localhost:3000/remove-bg",
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                },
                responseType: 'arraybuffer',
            }
        );
        console.log(`[HOP 3] ✅ Python service responded. Status: ${pythonServiceResponse.status}, Size: ${pythonServiceResponse.data.byteLength} bytes`);

        const noBgBuffer = Buffer.from(pythonServiceResponse.data);

        // 3. Clean image for heightmap
        console.log(`[HOP 4] ⏳ Processing with Sharp...`);
        const processed = await sharp(noBgBuffer)
            .resize(128, 128)
            .grayscale()
            .threshold(120)
            .png()
            .toBuffer();

        console.log(`[HOP 4] ✅ Sharp processing complete. Output size: ${processed.length} bytes`);

        const finalBase64 = processed.toString("base64");

        console.log(`[HOP 5] ✅ Sending response to frontend. Base64 length: ${finalBase64.length}`);
        return res.json({
            image: `data:image/png;base64,${finalBase64}`
        });

    } catch (error) {
        console.error(`[ERROR] ❌ Pipeline failed at some stage:`);
        console.error(`[ERROR] Message: ${error.message}`);
        console.error(`[ERROR] Code: ${error.code || 'N/A'}`);
        if (error.response) {
            console.error(`[ERROR] HTTP Status: ${error.response.status}`);
            console.error(`[ERROR] Response headers:`, error.response.headers);
            if (error.response.data) {
                const dataStr = error.response.data instanceof Buffer
                    ? error.response.data.toString('utf-8').slice(0, 1000)
                    : JSON.stringify(error.response.data).slice(0, 1000);
                console.error(`[ERROR] Response data: ${dataStr}`);
            }
        } else if (error.request) {
            console.error(`[ERROR] No response received. Request was made but no response came back.`);
            console.error(`[ERROR] This usually means the target service is DOWN or unreachable.`);
        }
        console.error(`[ERROR] Full stack:`, error.stack);
        return res.status(500).json({
            error: "generation failed",
            details: error.message,
            code: error.code || null
        });
    }
});

app.listen(port, () => {
    console.log(`3D PROXY ENGINE RUNNING ON http://localhost:${port}`);
});