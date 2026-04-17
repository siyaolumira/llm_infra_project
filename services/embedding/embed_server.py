from fastapi import FastAPI
from sentence_transformers import SentenceTransformer
import os

MODEL_NAME = os.getenv("EMBED_MODEL_NAME", "all-MiniLM-L6-v2")
app = FastAPI()
model = SentenceTransformer(MODEL_NAME)

@app.post("/embed")
def embed(data: dict):
    texts = data["input"]  # list[str]
    vecs = model.encode(texts).tolist()
    return {"embeddings": vecs}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model is not None
    }
