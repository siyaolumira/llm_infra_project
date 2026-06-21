import { useEffect, useRef, useState } from "react";
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

function now() {
  return new Date().toLocaleTimeString();
}

export default function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const eventSource = new EventSource("/api/logs");

    eventSource.onmessage = (event) => {
      const item = JSON.parse(event.data);

      setLogs((prev) => [
        ...prev,
        {
          time: now(),
          level: item.level || "info",
          message: item.message,
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
        <div className="title">Local AI Gateway</div>
        <div className="status">local-first · chat + docker logs</div>
      </header>

      <main className="main">
        <section className="chatPanel">
          <div className="panelTitle">Chat</div>

          <div className="messages">
            {messages.length === 0 && (
              <div className="empty">Ask your local model something.</div>
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
              placeholder="Ask something..."
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
          <div className="panelTitle">Docker Logs</div>

          <div className="logs">
            {logs.map((log, index) => (
              <div key={index} className={`log ${log.level}`}>
                <span className="time">[{log.time}]</span>{" "}
                <span className="level">{log.level}</span>{" "}
                <span>{log.message}</span>
              </div>
            ))}

            <div ref={logEndRef} />
          </div>
        </section>
      </main>
    </div>
  );
}