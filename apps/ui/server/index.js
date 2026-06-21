import express from "express";
import { spawn } from "child_process";

const app = express();

app.use(express.json());

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080/chat";
const DOCKER_CONTAINER = process.env.DOCKER_CONTAINER || "ai-gateway";

app.post("/api/chat", async (req, res) => {
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(
    `Chat request failed (${response.status}): ${rawText || "empty response"}`);
      }

    const data = rawText ? JSON.parse(rawText) : {};

    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: "Failed to call local backend",
      detail: String(err),
    });
  }
});

app.get("/api/logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (!DOCKER_CONTAINER) {
    res.write(
      `data: ${JSON.stringify({
        level: "error",
        message: "DOCKER_CONTAINER is not set",
      })}\n\n`
    );
    return;
  }

  const logs = spawn("docker", [
    "logs",
    "-f",
    "--tail",
    "50",
    DOCKER_CONTAINER,
  ]);

  logs.stdout.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);

    for (const line of lines) {
      res.write(
        `data: ${JSON.stringify({
          level: "info",
          message: line,
        })}\n\n`
      );
    }
  });

  logs.stderr.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);

    for (const line of lines) {
      res.write(
        `data: ${JSON.stringify({
          level: "error",
          message: line,
        })}\n\n`
      );
    }
  });

  logs.on("close", (code) => {
    res.write(
      `data: ${JSON.stringify({
        level: "error",
        message: `docker logs process exited with code ${code}`,
      })}\n\n`
    );
  });

  req.on("close", () => {
    logs.kill();
  });
});

app.listen(3001, () => {
  console.log("Local UI server running at http://localhost:3001");
  console.log(`Proxying chat to: ${BACKEND_URL}`);
  console.log(
    DOCKER_CONTAINER
      ? `Streaming docker logs from: ${DOCKER_CONTAINER}`
      : "DOCKER_CONTAINER is not set"
  );
});