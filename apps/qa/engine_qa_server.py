from fastapi import FastAPI
from apps.qa.personal_intelligent_engine_qa import rag_search_with_vector
from pydantic import BaseModel
from typing import List

app = FastAPI()
class RagRequest(BaseModel):
    vector: List[float]
    question: str
    request_id: str

@app.post("/search")
def search(req: RagRequest): 
    vector = req.vector
    question = req.question
    request_id = req.request_id 

    result = rag_search_with_vector(vector, question, request_id)

    return result

@app.get("/health")
def health():
    return {"status": "ok"}