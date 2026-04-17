from base_config import *
from qdrant_client.models import VectorParams, Distance, PointStruct, Filter, FieldCondition, MatchValue
from qdrant_client import QdrantClient

import sqlite3
import hashlib
import requests
import re
import time
from bs4 import BeautifulSoup
from urllib.parse import urljoin

def embed_batch(texts):
    try:
        r = requests.post(
            f"{EMBEDDING_URL}/embed",
            json={"input": texts},
            timeout=REQUEST_TIMEOUT
        )
        r.raise_for_status()
        return r.json()["embeddings"]
    except Exception as e:
        print("❌ embedding error:", e)
        return []
qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

# 
# 
# 1) SQL
# initial database function
def init_sqlite():
    conn = sqlite3.connect(SQLITE_PATH)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT,
        url TEXT UNIQUE,
        title TEXT,
        pub_date TEXT,
        content TEXT,
        summary TEXT,
        content_hash TEXT,
        short_cn TEXT,
        short_en TEXT,
        raw_response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    conn.commit()
    conn.close()

def get_content_hash(text: str) -> str:
    text = text.strip().encode("utf-8")
    return hashlib.sha1(text).hexdigest()

def get_existing_hash(url: str):
    conn = sqlite3.connect(SQLITE_PATH)
    cur = conn.cursor()
    cur.execute("SELECT content_hash FROM docs WHERE url=?", (url,))
    row = cur.fetchone()
    conn.close()
    return row[0] if row else None

def is_new_or_updated(url: str, content_hash: str) -> bool:
    old_hash = get_existing_hash(url)
    if old_hash is None:
        return True # new passage
    return old_hash != content_hash # updated content

def save_sqlite(doc: dict):
    conn = sqlite3.connect(SQLITE_PATH)
    cur = conn.cursor()

    cur.execute("""
    INSERT OR REPLACE INTO docs
    (source, url, title, pub_date, content, summary, content_hash, short_cn, short_en, raw_response)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        doc["source"],
        doc["url"],
        doc["title"],
        doc.get("pub_date"),
        doc["content"],
        doc.get("summary"),
        doc.get("content_hash"),
        doc.get("short_cn"),
        doc.get("short_en"),
        doc.get("raw_response"),
    ))

    conn.commit()
    conn.close()

# 
# 
# 2) Qdrant
def init_qdrant():
    collections = [c.name for c in qdrant.get_collections().collections]
    if COLLECTION_NAME not in collections:
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE)
        )
        print("✅ Qdrant collection created")

def delete_qdrant_by_url(url: str):
    flt = Filter(
        must=[FieldCondition(key="url", match=MatchValue(value=url))]
    )
    qdrant.delete(collection_name=COLLECTION_NAME, points_selector=flt)

def chunk_text(text):
    chunks = []
    i = 0
    n = len(text)

    while i < n:
        j = min(i + CHUNK_SIZE, n)
        chunks.append(text[i:j])
        i = j - CHUNK_OVERLAP
        if i < 0:
            i = 0
        if j == n:
            break
    return chunks

def upsert_qdrant(doc: dict):
    chunks = chunk_text(doc["content"])
    vectors = embed_batch(chunks)

    points = []
    for idx, (chunk, vec) in enumerate(zip(chunks, vectors)):
        uid = hashlib.md5((doc["url"] + str(idx)).encode()).hexdigest()

        points.append(
            PointStruct(
                id=int(uid[:16], 16),
                vector=vec,
                payload={
                    "source": doc["source"],
                    "url": doc["url"],
                    "title": doc["title"],
                    "text": chunk,
                    "pub_date": doc.get("pub_date"),
                    "hash": doc.get("content_hash")
                }
            )
        )

    qdrant.upsert(collection_name=COLLECTION_NAME, points=points)

# 
# 
# 3) Ingestion
# fetch html function
def fetch_html(url):
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    return resp.text

def clean_html_content(html):
    soup = BeautifulSoup(html,"html.parser")
    for element in soup(["script","style","nav","footer","header","aside"]):
        element.decompose()
    text = soup.get_text(separator=' ')
    return re.sub(r'\s+',' ',text).strip()

# 
# 
# 4) Process Ingestion
def summarize_with_llama(content: str):
    cleaned = clean_html_content(content)
    if not cleaned:
        return {"long_summary":"", "short_cn":"", "short_en":"", "raw_response":""}

    prompt = INGESTION_PROMPT.format(text=cleaned[:4000])

    try:
        r = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json={
                "model": OLLAMA_MODEL_SUMMARY,
                "prompt": prompt,
                "stream": False,
                "options":{"temperature":0.2}
            },
            timeout=REQUEST_TIMEOUT
        )

        output = r.json().get("response","")

        def extract(tag,next_tag,text):
            pattern = rf"[\*\s【\[]*{tag}[\*\s】\]]*(.*?)(?=[\*\s【\[]*{next_tag}|$)"
            m = re.search(pattern,text,re.S|re.I)
            return m.group(1).strip() if m else ""

        return {
            "long_summary": extract("long_summary","short_cn",output),
            "short_cn": extract("short_cn","short_en",output),
            "short_en": extract("short_en","END",output),
            "raw_response": output
        }

    except Exception as e:
        print("❌ LLM error:",e)
        return {"long_summary":"","short_cn":"","short_en":"","raw_response":str(e)}

# extract publishment date function
def extract_pub_date(soup):
# 1) time
    time_tag = soup.find("time")
    if time_tag:
        return time_tag.get_text(strip=True)
# 2) row after title
    h1 = soup.find("h1")
    if h1:
        parent = h1.parent
        if parent:
            parts = parent.get_text("\n", strip=True).split("\n")
            if len(parts) >= 3:
                possible_date = parts[2].strip()
                if re.match(r"[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}", possible_date):
                    return possible_date
# 3) re rule
    html_text = soup.get_text(" ", strip=True)
    match = re.search(r"[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}", html_text)
    if match:
        return match.group(0)
    return None

# 
# 
# 5) Final
def run_ingest():
    init_sqlite()
    init_qdrant()

    for src in CRAWL_SOURCES:
        print(f"\n🌐 Crawling {src['name']}")

        html = requests.get(src["url"]).text
        soup = BeautifulSoup(html,"html.parser")
        links = soup.find_all("a",href=re.compile(r"^/news/"))

        base_url = src["url"]
        urls = sorted({urljoin(base_url, a["href"]) for a in links})
        print("found",len(urls),"articles")

        for url in urls:
            try:
                
                page = fetch_html(url)
                s = BeautifulSoup(page,"html.parser")

                h1 = s.find("h1")
                if not h1:
                     continue
                title = h1.get_text(strip=True)
                article_tag = s.find("article")
                if not article_tag:
                    continue

                content = article_tag.get_text("\n",strip=True)
                pub_date = extract_pub_date(s)
                content_hash = get_content_hash(content)

                if not is_new_or_updated(url,content_hash):
                    print("⏭️ skip unchanged:",title)
                    continue

                print("🆕 processing:",title)

                delete_qdrant_by_url(url)

                summary_data = summarize_with_llama(content)

                doc = {
                    "source": src["name"],
                    "url": url,
                    "title": title,
                    "pub_date": pub_date,
                    "content": content,
                    "content_hash": content_hash,
                    "summary": summary_data["long_summary"],
                    "short_cn": summary_data["short_cn"],
                    "short_en": summary_data["short_en"],
                    "raw_response": summary_data["raw_response"]
                }

                save_sqlite(doc)
                upsert_qdrant(doc)

                print("✔ ingested")

                time.sleep(INGEST_SLEEP)

            except Exception as e:
                print("❌ fail:",url,e)


if __name__ == "__main__":
    run_ingest()