from base_config import *
from qdrant_client import QdrantClient
from FlagEmbedding import FlagReranker
import re
import time

reranker = FlagReranker(RERANK_MODEL_NAME)
qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

def normalize_query(q):
    q = q.strip()
    q = q.replace("\n"," ")
    q = re.sub(r"\s+", " ", q)
    return q

def rerank(question, docs):
    pairs = [[question, d] for d in docs]
    scores = reranker.compute_score(pairs)

    ranked = sorted(zip(docs, scores), key=lambda x: x[1], reverse=True)
    return [r[0] for r in ranked[:5]]

def rag_search_with_vector(vector, question, request_id=None, top_k=5):
    start = time.time()
    question = normalize_query(question)

    vs_start = time.time()
    result = qdrant.query_points(
        collection_name=COLLECTION_NAME,
        query=vector,
        limit=15,
        with_payload=True,
        with_vectors=False
)

    if isinstance(result, tuple):
        hits = result[0]
    elif hasattr(result, "points"):
        hits = result.points
    else:
        hits = result
        
    raw_docs = [h.payload["text"] for h in hits]
    raw_scores = [h.score for h in hits]
    vector_search_ms = int((time.time() - vs_start) * 1000)

    rr_start = time.time()
    pairs = [(doc, score) for doc, score in zip(raw_docs, raw_scores)]
    rerank_pairs = [[question, doc] for doc, _ in pairs]
    rerank_scores = reranker.compute_score(rerank_pairs)
    combined = [(doc, r_score, v_score) for (doc, v_score), r_score in zip(pairs, rerank_scores)]
    combined_sorted = sorted(combined, key=lambda x: x[1], reverse=True)
    top_combined = combined_sorted[:top_k]
    top_docs = [x[0] for x in top_combined]
    top_rerank_scores = [x[1] for x in top_combined]
    top_vector_scores = [x[2] for x in top_combined]
    rerank_ms = int((time.time() - rr_start) * 1000)

    total_ms = int((time.time() - start) * 1000)

    return {
        "docs": top_docs,                    
        "context": "\n\n".join(top_docs),    
        "top_k": len(top_docs),
        "rerank_scores": top_rerank_scores,
        "vector_scores": top_vector_scores,
        "vector_search_ms": vector_search_ms,
        "rerank_ms": rerank_ms,
        "total_ms": total_ms
    }
