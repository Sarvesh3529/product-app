# Background Removal Service

A FastAPI-based microservice for removing image backgrounds using `rembg`.

### Installation
Install the required dependencies using pip:
```bash
pip install -r requirements.txt
```

### Running the Server
Start the service using Uvicorn:
```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

### API Usage
- **Endpoint**: `POST http://localhost:8000/remove-bg`
- **Payload**: `multipart/form-data` with a `file` field containing the image.
- **Output**: Returns a PNG image with a transparent background.