# LLM Infrastructure System (RAG + Qdrant + Ollama + Rust)

A modular, fully local LLM infrastructure system that integrates a Rust API gateway, a Python-based RAG engine, Qdrant vector database, and Ollama for local model inference.

The system supports end-to-end retrieval-augmented generation and includes observability features such as latency tracking and token-level monitoring.

This project was initially built to ingest and track Anthropic-related updates, and later evolved into a generalized LLM infrastructure system for building and querying a personal knowledge base.

---

## 🧠 Overview

The system consists of two main pipelines:

### 1. Data Ingestion Pipeline

Handles data preparation and indexing:

* Manual trigger for data ingestion
* Content hashing for deduplication
* LLM-generated summaries using Ollama
* Dual storage:

  * SQLite (backup and traceability)
  * Qdrant (vector indexing)

### 2. Query & Retrieval Pipeline

Handles query processing and response generation:

* Retrieve relevant context from Qdrant
* Apply reranking for relevance improvement
* Generate responses using a local LLM

This enables a fully local and controllable question-answering system without relying on external APIs.

---

## 🏗 Architecture

### Data Ingestion

```
Manual Trigger
→ Hashing
→ LLM Summarization (Ollama)
→ SQLite Storage
→ Qdrant Vector Storage
```

### Query Pipeline

```
User Request
→ Rust Gateway (API Layer)
→ Embedding Service
→ Qdrant (Vector Search)
→ Python RAG Engine (Retrieval + Rerank)
→ Ollama (LLM Inference)
→ Response
```

---

## ⚙️ Tech Stack

* **Rust (axum)** — API Gateway
* **Python (FastAPI)** — RAG Engine
* **Qdrant** — Vector Database
* **Ollama** — Local LLM Inference
* **Docker Compose** — Service Orchestration
* **BeautifulSoup** — Data ingestion / parsing

---

## 🚀 Features

* Fully local execution (no external APIs)
* Retrieval-augmented generation (RAG) pipeline
* Reranking for improved retrieval quality
* Modular service-based architecture
* Dockerized deployment
* Basic observability (latency and token tracking)

---

## 🧪 Example Usage

```bash
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is Anthropic?"}'
```

---

## 🛠 Setup

```bash
git clone <your-repo>
cd llm_infra_project

docker compose up
```

### View logs

```bash
docker compose logs -f
```

### Trigger data ingestion

```bash
docker exec -it rag-engine bash
python -m apps.ingestion.personal_intelligent_engine_ingestion
```

---

## ⚠️ Notes

* No local data, model weights, or API keys are included
* Intended for learning and experimentation with LLM systems
* Users can build their own knowledge base via ingestion
* The current ingestion pipeline is primarily focused on Anthropic-related data

---

## 🔍 Challenges & Learnings

During development, several real-world engineering challenges were encountered:

* Service boundary design and refactoring for maintainability
* Version compatibility issues (Qdrant client vs server; sentence-transformers vs FlagEmbedding)
* Breaking API changes across versions
* Docker networking (localhost vs container communication)
* LLM latency and timeout handling
* Logging design and configuration across multiple services
* Retrieval quality and noisy context in RAG systems

These highlight that building LLM systems is primarily a **systems and infrastructure problem**, not just a modeling problem.

---

## 🔮 Future Improvements

* Generalize the ingestion pipeline to support multiple data sources (e.g., APIs, web content, documents)
* Add a safety and authorization layer for controlled access
* Improve retrieval quality with better chunking, filtering, and multi-stage retrieval strategies
* Add detailed observability (request tracing, latency breakdown, token usage analytics)
* Improve system robustness (retry mechanisms, timeout handling, fallback strategies)
* Introduce evaluation metrics for retrieval and response quality
* Introduce a simple UI layer for improved user experience
* Optimize Qdrant performance (e.g., batching) and improve SQLite concurrency handling

---

## 📌 Summary

This project focuses on building an end-to-end LLM system with emphasis on:

* system design
* modular architecture
* real-world engineering challenges

---

## 📄 License

MIT License
