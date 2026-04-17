import os
from dotenv import load_dotenv
load_dotenv()

# storage
SQLITE_PATH = os.getenv("SQLITE_PATH", "/apps/database/knowledge_base.db")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "ollama_docker")

# ollama model
OLLAMA_HOST = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
OLLAMA_MODEL_SUMMARY = os.getenv("OLLAMA_MODEL_SUMMARY", "llama3:8b")
OLLAMA_MODEL_QA = os.getenv("OLLAMA_MODEL_QA", "llama3:8b")

# embedding model
EMBED_MODEL_NAME = os.getenv("EMBED_MODEL_NAME", "all-MiniLM-L6-v2")
EMBED_DIM = int(os.getenv("EMBED_DIM", 384))
EMBEDDING_URL = os.getenv("EMBEDDING_URL", "http://embedding:9001")

# rag
RAG_ENGINE_URL = os.getenv("RAG_ENGINE_URL", "http://rag-engine:9000")

# rerank model
RERANK_MODEL_NAME = os.getenv("RERANK_MODEL_NAME", "BAAI/bge-reranker-base")

# qdrant
QDRANT_HOST = os.getenv("QDRANT_HOST", "qdrant")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", 6333))

# chunk
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 500))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", 100))

# safety
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", 180))
LLM_RETRY = int(os.getenv("LLM_RETRY", 3))
INGEST_SLEEP = float(os.getenv("INGEST_SLEEP", 1.2))

# crawl
CRAWL_SOURCES = [
    {
        "name": "Anthropic News",
        "url": "https://www.anthropic.com/news"
    }
]
# ingestion prompt
INGESTION_PROMPT = """
generate three summaries for the announcement below. 
Please output strictly according to the following format:

【long_summary】
（A Chinese summary within 150 words, with a clear structure and easy to understand）

【short_cn】
（A Chinese summary within 20 words, easy to understand）

【short_en】
（An English summary within 20 words, easy to understand）

The announcement content is as follows:
{text}
"""
# qa prompt
QA_PROMPT = """
Answer based on context.
Context:
{context}
Question:
{query}
"""