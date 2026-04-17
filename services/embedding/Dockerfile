FROM python:3.11-slim

WORKDIR /app

RUN pip install fastapi uvicorn sentence-transformers

COPY embed_server.py .

CMD ["uvicorn", "embed_server:app", "--host", "0.0.0.0", "--port", "9001"]
