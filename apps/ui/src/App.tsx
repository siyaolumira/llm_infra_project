import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type LogItem = {
  time: string;
  level: string;
  message: string;
};

type InspectorStats = {
  model?: string;
  provider?: string;
  promptTokens?: string;
  contextTokens?: string;
  completionTokens?: string;
  totalTokens?: string;
  tokensPerSec?: string;
  elapsedMs?: string;
  totalMs?: string;
  requestId?: string;
};

function now() {
  return new Date().toLocaleTimeString();
}

function cleanAnsi(text: string) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function extractValue(text: string, key: string) {
  const cleaned = cleanAnsi(text);

  const patterns = [
    new RegExp(`${key}\\s*=\\s*Some\\(([^)]+)\\)`),
    new RegExp(`${key}\\s*=\\s*"?([^"\\s,}]+)"?`),
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

function formatMs(value?: string) {
  if (!value) return "—";

  const ms = Number(value);
  if (Number.isNaN(ms)) return value;

  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

function getInspectorStats(logs: LogItem[]): InspectorStats {
  const stats: InspectorStats = {};

  for (const log of logs) {
    const text = cleanAnsi(log.message);

    stats.model = extractValue(text, "model") || stats.model;
    stats.provider = extractValue(text, "provider") || stats.provider;
    stats.promptTokens =
      extractValue(text, "prompt_tokens") || stats.promptTokens;
    stats.contextTokens =
      extractValue(text, "context_tokens") || stats.contextTokens;
    stats.completionTokens =
      extractValue(text, "completion_tokens") || stats.completionTokens;
    stats.totalTokens = extractValue(text, "total_tokens") || stats.totalTokens;
    stats.tokensPerSec =
      extractValue(text, "tokens_per_sec") || stats.tokensPerSec;
    stats.elapsedMs = extractValue(text, "elapsed_ms") || stats.elapsedMs;
    stats.totalMs = extractValue(text, "total_ms") || stats.totalMs;
    stats.requestId = extractValue(text, "request_id") || stats.requestId;
  }

  return stats;
}

function hasLog(logs: LogItem[], keyword: string) {
  return logs.some((log) => cleanAnsi(log.message).includes(keyword));
}

export default function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastQuestion, setLastQuestion] = useState("");
  const [requestStarted, setRequestStarted] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const activeLogs = requestStarted ? logs : [];

  const stats = useMemo(() => getInspectorStats(activeLogs), [activeLogs]);

  const pipeline = useMemo(
    () => [
      {
        label: "Request Received",
        done: requestStarted,
      },
      {
        label: "Prompt Constructed",
        done: hasLog(activeLogs, "prompt_construct"),
      },
      {
        label: "LLM Request Started",
        done: hasLog(activeLogs, "llm_request_start"),
      },
      {
        label: "LLM Finished",
        done: hasLog(activeLogs, "llm_finished"),
      },
      {
        label: "Request Finished",
        done: hasLog(activeLogs, "request_finished"),
      },
      {
        label: "Answer Returned to UI",
        done: hasLog(activeLogs, "Answer received"),
      },
    ],
    [activeLogs, requestStarted]
  );

  useEffect(() => {
    const eventSource = new EventSource("/api/logs");

    eventSource.onmessage = (event) => {
      const item = JSON.parse(event.data);

      setLogs((prev) => [
        ...prev,
        {
          time: now(),
          level: item.level || "info",
          message: item.message || "",
        },
      ]);
    };

    eventSource.onerror = () => {
      setLogs((prev) => [
        ...prev,
        {
          time: now(),
          level: "error",
          message: "Docker log stream disconnected",
        },
      ]);
    };

    return () => eventSource.close();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function sendMessage() {
    const question = input.trim();
    if (!question || loading) return;

    setLastQuestion(question);
    setRequestStarted(true);
    setLogs([]);

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: question,
      },
    ]);

    setInput("");
    setLoading(true);

    setLogs((prev) => [
      ...prev,
      {
        time: now(),
        level: "ui",
        message: `Sending question: ${question}`,
      },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: question,
        }),
      });

      const data = await response.json();

      const answer =
        data.reply ||
        data.answer ||
        data.message ||
        JSON.stringify(data, null, 2);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: answer,
        },
      ]);

      setLogs((prev) => [
        ...prev,
        {
          time: now(),
          level: "ui",
          message: "Answer received",
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${String(err)}`,
        },
      ]);

      setLogs((prev) => [
        ...prev,
        {
          time: now(),
          level: "error",
          message: String(err),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="title">Local AI Platform</div>
        <div className="status">local-first · RAG · request inspector</div>
      </header>

      <main className="main">
        <section className="chatPanel">
          <div className="panelTitle">Chat</div>

          <div className="messages">
            {messages.length === 0 && (
              <div className="empty">
                Ask a question grounded in your local knowledge base.
              </div>
            )}

            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.role}`}>
                <div className="role">{msg.role}</div>
                <div className="bubble">{msg.content}</div>
              </div>
            ))}

            {loading && (
              <div className="message assistant">
                <div className="role">assistant</div>
                <div className="bubble muted">Thinking...</div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <div className="inputBar">
            <textarea
              value={input}
              placeholder="Ask something from your local knowledge base..."
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />

            <button onClick={sendMessage} disabled={loading}>
              Send
            </button>
          </div>
        </section>

        <section className="logPanel">
          <div className="panelTitle">Request Inspector</div>

          <div className="inspector">
            <div className="inspectorCard">
              <div className="cardTitle">Current Question</div>
              <div className="questionText">
                {lastQuestion || "No request sent yet."}
              </div>
            </div>

            <div className="inspectorCard">
              <div className="cardTitle">Pipeline</div>

              <div className="pipelineList">
                {pipeline.map((step) => (
                  <div
                    key={step.label}
                    className={`pipelineItem ${step.done ? "done" : ""}`}
                  >
                    <span className="dot">{step.done ? "✓" : "○"}</span>
                    <span>{step.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="inspectorCard">
              <div className="cardTitle">Statistics</div>

              <div className="metricRow">
                <span>Model</span>
                <strong>{stats.model || "—"}</strong>
              </div>

              <div className="metricRow">
                <span>Provider</span>
                <strong>{stats.provider || "—"}</strong>
              </div>

              <div className="metricRow">
                <span>Prompt Tokens</span>
                <strong>{stats.promptTokens || "—"}</strong>
              </div>

              <div className="metricRow">
                <span>Context Tokens</span>
                <strong>{stats.contextTokens || "—"}</strong>
              </div>

              <div className="metricRow">
                <span>Completion Tokens</span>
                <strong>{stats.completionTokens || "—"}</strong>
              </div>

              <div className="metricRow">
                <span>Total Tokens</span>
                <strong>{stats.totalTokens || "—"}</strong>
              </div>

              <div className="metricRow">
                <span>Tokens / Sec</span>
                <strong>{stats.tokensPerSec || "—"}</strong>
              </div>

              <div className="metricRow">
                <span>Total Latency</span>
                <strong>{formatMs(stats.totalMs || stats.elapsedMs)}</strong>
              </div>
            </div>

            <div className="inspectorCard">
              <div className="cardTitle">Trace</div>
              <div className="traceId">{stats.requestId || "—"}</div>
            </div>

            <details className="rawLogs">
              <summary>Raw Docker Logs</summary>

              <div className="logs">
                {activeLogs.map((log, index) => (
                  <div key={index} className={`log ${log.level}`}>
                    <span className="time">[{log.time}]</span>{" "}
                    <span className="level">{log.level}</span>{" "}
                    <span>{cleanAnsi(log.message)}</span>
                  </div>
                ))}

                <div ref={logEndRef} />
              </div>
            </details>
          </div>
        </section>
      </main>
    </div>
  );
}