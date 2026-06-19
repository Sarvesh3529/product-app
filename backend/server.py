from fastapi import FastAPI, UploadFile, File, Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from rembg import remove
import io
import os
import uvicorn

app = FastAPI()

# Enable CORS configurations to allow the internal node proxy to make pipeline hops
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/remove-bg")
async def remove_background(file: UploadFile = File(...)):
    """
    Removes the background from an uploaded image file.
    Expects a multipart/form-data upload with an image file.
    Returns a PNG image with a transparent background.
    """
    contents = await file.read()
    input_image = Image.open(io.BytesIO(contents)).convert("RGBA")
    output_image = remove(input_image)

    output_buffer = io.BytesIO()
    output_image.save(output_buffer, format="PNG")
    return Response(content=output_buffer.getvalue(), media_type="image/png")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("server:app", host="0.0.0.0", port=port)