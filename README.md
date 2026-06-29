# Local AI Platform

A modular local AI infrastructure platform built with React, Rust, Python, Qdrant, Ollama, and Retrieval-Augmented Generation (RAG).

---

## 🤔 Why This Project

The goals are to:

- Preserve personal and organizational knowledge in a long-term searchable format
- Ground responses in traceable and auditable sources
- Reduce the need for repeated context injection
- Lower operational costs through local execution
- Maintain ownership of data and infrastructure
- Better understand the engineering challenges behind modern AI systems

---

## 🏗 Architecture

High-level architecture of the platform, showing the query pipeline and knowledge ingestion pipeline.

<img width="11688" height="9960" alt="AI Platform Project" src="https://github.com/user-attachments/assets/4fe15756-c956-43f2-98dd-6033f94927f0" />

---

## 🚀 Features

- React-based web UI
- Request inspector for pipeline status and execution details
- Backend log visualization
- Fully local execution without external APIs
- Retrieval-Augmented Generation (RAG) pipeline
- Reranking for improved retrieval quality
- Modular service-based architecture
- Dockerized deployment

---

## ⚙️ Tech Stack

- React — Web UI
- Node.js / Express — UI-to-gateway bridge and log streaming
- Rust (Axum) — API Gateway
- Python (FastAPI) — RAG Engine
- Qdrant — Vector Database
- Ollama — Local LLM Inference
- SQLite — Persistence, backup, and traceability
- Docker Compose — Service orchestration
- BeautifulSoup — Data ingestion and parsing

---

## 🖥️ Interface Showcase

The UI is intentionally lightweight. Its purpose is not to be a polished frontend product, but to provide a practical interface for testing the local RAG pipeline and inspecting request execution details.

<img width="1500" height="1558" alt="UI Screenshot" src="https://github.com/user-attachments/assets/87c85403-0612-45bb-b9c3-3869a3c62ecf" />

## 🧭 Design Decisions

### Why React Web UI?

The system can be tested through terminal commands and API calls, and developers can still choose to use the CLI workflow directly.

The React UI was added as an optional interface layer to make day-to-day interaction easier. It provides a simpler way to ask questions, view responses, and inspect request execution details through a lightweight request inspector.

Raw logs remain available for debugging, but they are hidden by default in the UI to reduce noise during normal use.

### Why Rust for the API Gateway?

Rust was chosen for the API gateway because its strong type system, compile-time safety, minimal runtime overhead, and excellent concurrency support make it well suited for building reliable infrastructure services and orchestrating communication between backend components.

### Why Python for the RAG Engine?

Python was used for the RAG engine because most retrieval, embedding, reranking, and LLM-related tooling is more mature and easier to integrate in the Python ecosystem.

This makes it easier to experiment with different retrieval strategies while keeping the gateway and retrieval logic separated.

### Why Qdrant?

Qdrant was chosen because it is open source, easy to run locally, and provides efficient vector search with metadata filtering.

### Why Ollama?

Ollama was selected to provide a fully local inference layer without relying on external APIs.

The goal of this project is to validate the architecture of a modular AI platform rather than optimize for a specific model provider. Using Ollama keeps the system local and inexpensive while allowing the inference layer to be replaced by other models, agents, or providers in the future.

### Why SQLite and Qdrant Together?

Qdrant is used for vector indexing and similarity search, while SQLite is used for persistence, backup, and traceability.

Using both allows the system to preserve source records and metadata while supporting efficient semantic retrieval.

### Why Service Separation?

The system separates the UI, API gateway, RAG engine, vector database, model inference, and ingestion pipeline into different components.

This makes the architecture easier to debug, maintain, and extend as the project evolves. Each component can evolve independently while communicating through well-defined interfaces.

### Why Node.js Bridge?

The Node.js bridge serves as a lightweight development proxy between the React UI and the Rust API gateway.

It also streams backend logs to the browser through SSE, which allows the UI to present request execution details without exposing Docker directly to the frontend.

This layer keeps the frontend simple while isolating infrastructure-specific functionality.

---

## 🚀 Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js and npm
- Ollama installed locally or available as a service

### Installation

```bash
git clone <your-repo>
cd llm_infra_project

docker compose up
```

### Trigger data ingestion

```bash
docker exec -it rag-engine bash
python -m apps.ingestion.personal_intelligent_engine_ingestion
exit
```

### Running the Web UI

```bash
cd apps/ui
npm install
npm run dev
```
Then open the local UI in your browser.

### View logs

```bash
docker compose logs -f
```

### Ask via terminal

The React UI is optional. You can also send requests directly to the Rust API gateway:

```bash
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "your question"}'
```

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

* Reduce end-to-end latency
* Add a routing strategy for general questions that do not require retrieval from indexed documents
* Generalize the ingestion pipeline to support multiple data sources (e.g., APIs, web content, documents)
* Add a safety and authorization layer for controlled access
* Improve retrieval quality with better chunking, filtering, and multi-stage retrieval strategies
* Improve system robustness with retry mechanisms, timeout handling, and fallback strategies
* Enhance the React UI with conversation history, source visualization, and session management
* Optimize Qdrant performance (e.g., batching) and improve SQLite concurrency handling

---

## 📄 License

MIT License
