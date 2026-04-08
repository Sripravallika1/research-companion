# Research Companion — AI Document Intelligence

A production-ready RAG (Retrieval-Augmented Generation) chatbot that answers questions grounded strictly in uploaded PDF documents, with real page-level citations.

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | Flask 3 |
| PDF extraction | PyMuPDF (per-page) |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` (local, free) |
| Vector store | ChromaDB (local persistent) |
| Agent orchestration | Agno 2.5.14 |
| LLM | OpenRouter → Claude 3.5 Sonnet |
| Frontend | Vanilla JS + your custom dark UI |

## Features
- Upload multiple PDFs per session
- Three response modes: Simple, Technical, Actionable
- Real page-level citations for every answer
- One-click document summarization
- Strict grounding — refuses to hallucinate outside uploaded docs
- No API keys exposed in browser (all server-side)
- Local embeddings — no embedding API costs

## Setup

### 1. Clone & activate venv
```bash
git clone https://github.com/Sripravallika1/research-companion.git
cd research-companion
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies
```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 3. Configure environment
```bash
cp .env.example .env
# Open .env and paste your OpenRouter API key
```

### 4. Run
```bash
python app.py
```
Open http://127.0.0.1:5000

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Serve UI |
| POST | `/api/docs` | Upload PDF/TXT/MD files |
| GET | `/api/docs` | List indexed documents |
| POST | `/api/chat` | Ask a question (returns answer + citations) |
| POST | `/api/summarize` | Summarize a document by doc_id |
| POST | `/api/reset` | Clear all documents |
| GET | `/health` | Health check |

## RAG Pipeline
1. PDF parsed per page using PyMuPDF
2. Text split into overlapping 1200-char chunks (200-char overlap)
3. Chunks embedded locally using `all-MiniLM-L6-v2`
4. Embeddings stored in ChromaDB (persists to `./chroma_db/`)
5. At query time: top-5 chunks retrieved by cosine similarity
6. Agno agent formats sources + calls OpenRouter LLM
7. Answer returned with filename + page citations

## Project Structure
```
research-companion/
  app.py                  # Flask app + all API routes
  requirements.txt
  .env.example
  templates/
    index.html            # UI (served by Flask)
  static/
    app.js                # All frontend JS (calls backend only)
  src/
    __init__.py
    pdf_extract.py        # PyMuPDF page extraction
    chunking.py           # Overlapping text chunker
    rag_store.py          # ChromaDB vector store wrapper
    openrouter_client.py  # OpenRouter API client
    agent.py              # Agno RAG agent
```