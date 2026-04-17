use axum::{
    routing::{get, post},
    extract::State,
    Json,
    Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::time::{Duration, Instant};
use reqwest::Client;
use tracing::{info, debug, instrument};
use tracing_subscriber::EnvFilter;
use uuid::Uuid;
use anyhow::anyhow;


#[derive(Deserialize, Clone)]
struct Config {
    llm: LLMConfig,
}

#[derive(Deserialize, Clone, Debug)]
struct LLMConfig {
    provider: String,
    model: String,
    base_url: String,
}

#[derive(Deserialize, Debug)]
struct ChatRequest {
    message: String,
}

#[derive(Serialize)]
struct ChatResponse {
    reply: String,
}

#[derive(Clone)]
struct AppState {
    client: Client,
    llm_config: LLMConfig,
}

#[derive(Serialize, Deserialize)]
struct EmbeddingRequest {
    input: Vec<String>,
}

#[derive(Deserialize)]
struct EmbeddingResponse {
    embeddings: Vec<Vec<f32>>,
}

#[derive(Serialize)]
struct RagRequest {
    vector: Vec<f32>,
    question: String,
    request_id: String,
}

#[derive(Debug)]
struct RagResult {
    request_id: Uuid,
    context: String,
    docs: Vec<String>,
    top_k: usize,
    rerank_scores: Vec<f64>,
    vector_scores: Vec<f64>,
    vector_search_ms: u64,
    rerank_ms: u64,
    total_ms: u64,
}

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
    prompt_eval_count: Option<u32>,
    eval_count: Option<u32>,
}

struct LLMResponse {
    text: String,
    prompt_tokens: Option<u32>, 
    completion_tokens: Option<u32>,
}

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info"))
        )
        .with_target(false)
        .compact()
        .init();
}

async fn is_ready(client: &Client, url: &str) -> bool {
    match client.get(url).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

async fn dependency_check(client: &Client) {

    let max_retries = 30;
    let delay = Duration::from_secs(2);

    for attempt in 1..=max_retries {
        let embedding_ok = is_ready(client, "http://embedding:9001/health").await;
        let rag_ok = is_ready(client, "http://rag-engine:9000/health").await;
        let ollama_ok = is_ready(client, "http://ollama:11434/api/tags").await;
        let qdrant_ok = is_ready(client, "http://qdrant:6333/readyz").await;

        info!(
            attempt,
            embedding = if embedding_ok { "ready" } else { "unreachable" },
            rag = if rag_ok { "ready" } else { "unreachable" },
            ollama = if ollama_ok { "ready" } else { "unreachable" },
            qdrant = if qdrant_ok { "ready" } else { "unreachable" },
            "dependency_check"
        );

        if embedding_ok && rag_ok && ollama_ok && qdrant_ok {
            info!("all_dependencies_ready");
            return;
        }

        tokio::time::sleep(delay).await;
    }
    panic!("Dependencies unreachable after retries");
}

#[tokio::main]
async fn main() {
    init_tracing();

    let model = std::env::var("OLLAMA_MODEL_QA").expect("OLLAMA_MODEL not set");
    let base_url = std::env::var("OLLAMA_BASE_URL").expect("OLLAMA_BASE_URL not set");

    let port: u16 = std::env::var("PORT")
    .ok()
    .and_then(|p| p.parse().ok())
    .unwrap_or(8080);
        
    let llm_config = LLMConfig {
        provider: "ollama".to_string(),
        model,
        base_url,};
    
    // create global HTTP client（with timeout）
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .expect("Failed to build reqwest client");

    dependency_check(&client).await;

    let state = AppState {
        client,
        llm_config,
    };

    let app = Router::new()
        .route("/chat", post(chat_handler))
        .route("/health", get(health_handler))
        .route("/ready", get(ready_handler))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    let listener = tokio::net::TcpListener::bind(addr)
    .await
    .expect("Failed to bind to 0.0.0.0 - check if port is in use");
    info!(%addr, "Service live at http://localhost:{}", port);
    axum::serve(listener, app).await.expect("Server runtime error");
}


#[instrument(skip(state), fields(request_id))]
async fn chat_handler(
    State(state): State<AppState>,
    Json(payload): Json<ChatRequest>,
) -> Json<ChatResponse> {

    let req_start = Instant::now();
    let request_id = Uuid::new_v4();
    tracing::Span::current().record(
        "request_id",
        &tracing::field::display(request_id)
    );

    info!(
        %request_id,
        message_chars = payload.message.len(),
        "request_received"
    );

    let question = payload.message.clone();

// embedding

    let embed_start = Instant::now();

    let embed_url = std::env::var("EMBEDDING_URL")
    .unwrap_or("http://embedding:9001".to_string());

    let embed_res = match state.client
        .post(format!("{}/embed", embed_url))
        .json(&EmbeddingRequest { input: vec![question.clone()] })
        .send().await {
            Ok(r) => r,
            Err(e) => return Json(ChatResponse { reply: format!("Embed server error: {}", e) }),
        };

    let embed_json: EmbeddingResponse = match embed_res.json().await {
        Ok(j) => j,
        Err(e) => return Json(ChatResponse { reply: format!("Embed JSON error: {}", e) }),
    };

    let vector = embed_json.embeddings[0].clone();

    info!(
        vector_size = vector.len(),
        elapsed_ms = embed_start.elapsed().as_millis(),
        "embedding_done"
    );

    let embed_dim: usize = std::env::var("EMBED_DIM")
    .ok()
    .and_then(|v| v.parse().ok())
    .unwrap_or(384);

    if vector.len() != embed_dim {
        return Json(ChatResponse {
            reply: format!("Embedding dimension mismatch: {}", vector.len())
        });
    }    

// python Rag
    let rag_context = match call_python_rag(&state, vector, question.clone(), request_id).await {
        Ok(ctx) => ctx,
        Err(e) => {
            return Json(ChatResponse {
                reply: format!("RAG error: {}", e)
            })
        }
    };

    info!(
        top_k = rag_context.top_k,
        vector_search_ms = rag_context.vector_search_ms,
        "vector_search_done"
    );

    for (i, doc) in rag_context.docs.iter().take(5).enumerate() {
        let rerank_score = rag_context.rerank_scores.get(i);
        let vector_score = rag_context.vector_scores.get(i);
    
        info!(
            doc_index = i,
            doc = ?doc,
            rerank_score = ?rerank_score,
            vector_score = ?vector_score,
            "rerank_item"
        );
    }

    info!(
        rerank_ms = rag_context.rerank_ms,
        "rerank_done"
    );


    let context_tokens = rag_context.context.len() / 4;

    info!(
        context_tokens = context_tokens,
        total_ms = rag_context.total_ms,
        "context_ready"
    );

// combine prompt
    let combine_prompt = Instant::now();

    let final_prompt = format!(
        "Context:\n{}\n\nQuestion:\n{}\n\nAnswer:",
        rag_context.context,
        question
    );

    let prompt_tokens = final_prompt.len()/4;

    info!(
        prompt_chars = final_prompt.len(),
        prompt_tokens = prompt_tokens,
        context_tokens = context_tokens,
        elapsed_ms = combine_prompt.elapsed().as_millis(),
        "prompt_construct"
    );

// llm
    let llm_start = Instant::now();
    info!(
        model = %state.llm_config.model,
        provider = %state.llm_config.provider,
        "llm_request_start"
    );

    let llm_res = match call_llm(&state.client, &state.llm_config, &final_prompt).await {
        Ok(res) => res,
        Err(e) => return Json(ChatResponse { reply: format!("LLM Error: {}", e) }),
    };

    let elapsed_ms = llm_start.elapsed().as_millis() as f64;
    let tps = match llm_res.completion_tokens {
        Some(tokens) if elapsed_ms > 0.0 => tokens as f64 / (elapsed_ms / 1000.0),
        Some(_) => 0.0,
        None => {
            info!("Token stats unavailable, skipping TPS calculation");
            0.0
        }
    };

    info!(
        prompt_tokens = ?llm_res.prompt_tokens,
        completion_tokens = ?llm_res.completion_tokens,
        total_tokens = ?llm_res.prompt_tokens.zip(llm_res.completion_tokens).map(|(p, c)| p + c),
        tokens_per_sec = tps,
        elapsed_ms = elapsed_ms as u64,
        "llm_finished"
    );

    info!(
        %request_id,
        total_ms = req_start.elapsed().as_millis(),
        "request_finished"
    );
    
    Json(ChatResponse { reply: llm_res.text })
}
    
async fn health_handler() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "rust-ai-gateway"
    }))
}


async fn ready_handler() -> Json<serde_json::Value> {
    let model = std::env::var("OLLAMA_MODEL_QA")
    .unwrap_or("unknown".to_string());

    Json(serde_json::json!({
        "status": "ready",
        "model": model,
        "gateway": "ok"
    }))
}

async fn call_llm(
    client: &Client,
    config: &LLMConfig,
    prompt: &str,
) -> Result<LLMResponse, anyhow::Error> {
    match config.provider.as_str() {
        "ollama" => call_ollama(client, config, prompt).await,
        _ => Err(anyhow!("Unsupported provider")),
    }
}

async fn call_ollama(
    client: &reqwest::Client,
    config: &LLMConfig,
    prompt: &str,
) -> Result<LLMResponse, anyhow::Error> {

    let res = client
        .post(format!("{}/api/generate", config.base_url))
        .json(&OllamaRequest {
            model: config.model.clone(),
            prompt: prompt.to_string(),
            stream: false,
        })
        .send()
        .await?;

    let json: OllamaResponse = res.json().await?;

    Ok(LLMResponse {
        text: json.response,
        prompt_tokens: json.prompt_eval_count,
        completion_tokens: json.eval_count,
    })
}

#[instrument(skip(state, vector), fields(request_id = %request_id))]
async fn call_python_rag(
    state: &AppState,
    vector: Vec<f32>,
    question: String,
    request_id: Uuid,
) -> Result<RagResult, String> {

    let rag_url = std::env::var("RAG_ENGINE_URL")
    .unwrap_or("http://rag-engine:9000".to_string());

    let res = state.client
        .post(format!("{}/search", rag_url))
        .json(&RagRequest { vector, question, request_id: request_id.to_string(),})
        .send()
        .await
        .map_err(|e| format!("RAG request failed: {}", e))?;

    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid RAG JSON: {}", e))?;

    let docs = json["docs"]
        .as_array()
        .ok_or("Missing field: docs")?
        .iter()
        .map(|v| {
            v.as_str()
                .ok_or("Invalid doc: not a string")
                .map(|s| s.to_string())
        })
        .collect::<Result<Vec<String>, _>>()?;

    let context = json["context"]
        .as_str()
        .ok_or("Missing or invalid field: context")?
        .to_string();

    let rerank_scores = json["rerank_scores"]
        .as_array()
        .ok_or("Missing field: rerank_scores")?
        .iter()
        .map(|v| v.as_f64().ok_or("Invalid rerank_score"))
        .collect::<Result<Vec<f64>, _>>()?;

    let vector_scores = json["vector_scores"]
        .as_array()
        .ok_or("Missing field: vector_scores")?
        .iter()
        .map(|v| v.as_f64().ok_or("Invalid vector_score"))
        .collect::<Result<Vec<f64>, _>>()?;

        let top_k = json["top_k"]
        .as_u64()
        .ok_or("Missing or invalid field: top_k")? as usize;

    let vector_search_ms = json["vector_search_ms"]
        .as_u64()
        .ok_or("Missing or invalid field: vector_search_ms")?;

    let rerank_ms = json["rerank_ms"]
        .as_u64()
        .ok_or("Missing or invalid field: rerank_ms")?;

    let total_ms = json["total_ms"]
        .as_u64()
        .ok_or("Missing or invalid field: total_ms")?;

    Ok(RagResult {
        request_id,
        context,
        docs,
        top_k,
        rerank_scores,
        vector_scores,
        vector_search_ms,
        rerank_ms,
        total_ms,
    })
}

