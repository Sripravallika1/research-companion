# app.py
import os
import tempfile
from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv

load_dotenv()

from src.rag_store import RAGStore
from src.pdf_extract import extract_pdf_pages
from src.chunking import chunk_text
from src.agent import RAGAgent

app = Flask(__name__)
store = RAGStore(persist_dir="./chroma_db", collection_name="research_companion")
agent = RAGAgent()

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/health")
def health():
    return jsonify({"status": "ok", "docs_indexed": len(store.list_docs())})

@app.post("/api/docs")
def upload_docs():
    """Upload one or more PDF/TXT/MD files and index them into Chroma."""
    if "files" not in request.files:
        return jsonify({"error": "No files[] field in request"}), 400

    files = request.files.getlist("files")
    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No files selected"}), 400

    results = []
    for f in files:
        filename = f.filename or "document.pdf"
        suffix = os.path.splitext(filename)[1].lower() or ".pdf"

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            f.save(tmp.name)
            tmp_path = tmp.name

        try:
            if suffix == ".pdf":
                pages = extract_pdf_pages(tmp_path)
                chunk_records = []
                for p in pages:
                    for ch in chunk_text(p["text"], chunk_size=1200, overlap=200):
                        chunk_records.append({"text": ch, "page": p["page"]})
            else:
                raw = open(tmp_path, "r", encoding="utf-8", errors="ignore").read()
                chunk_records = [{"text": ch, "page": 1} for ch in chunk_text(raw)]

            if not chunk_records:
                results.append({"filename": filename, "error": "No text extracted"})
                continue

            doc_id = store.add_document_chunks(filename=filename, chunks=chunk_records)
            results.append({
                "doc_id": doc_id,
                "filename": filename,
                "chunks": len(chunk_records),
                "pages": len(pages) if suffix == ".pdf" else 1,
            })
        except Exception as e:
            results.append({"filename": filename, "error": str(e)})
        finally:
            os.unlink(tmp_path)

    return jsonify({"uploaded": results})


@app.get("/api/docs")
def list_docs():
    """List all indexed documents for the current session."""
    return jsonify({"docs": store.list_docs()})


@app.post("/api/chat")
def chat():
    """Answer a question grounded in uploaded documents."""
    data = request.get_json(force=True)
    question = (data.get("question") or "").strip()
    mode = (data.get("mode") or "simple").strip()
    doc_ids = data.get("doc_ids") or None

    if not question:
        return jsonify({"error": "question is required"}), 400

    try:
        sources = store.similarity_search(question, k=5, doc_ids=doc_ids)
    except Exception as e:
        return jsonify({"error": f"Retrieval error: {str(e)}"}), 500

    if not sources:
        return jsonify({
            "answer": "I could not find that information in the uploaded documents.",
            "citations": []
        })

    try:
        answer = agent.answer(question=question, mode=mode, sources=sources)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500
    except Exception:
        return jsonify({"error": "An unexpected error occurred while generating the answer."}), 500

    citations = []
    for s in sources[:3]:
        md = s.get("metadata", {})
        snippet = s["text"][:200].replace("\n", " ")
        citations.append({
            "doc_id": md.get("doc_id"),
            "filename": md.get("filename"),
            "page": md.get("page"),
            "snippet": snippet + ("..." if len(s["text"]) > 200 else ""),
            "score": round(1 - s["distance"], 3),
        })

    return jsonify({"answer": answer, "citations": citations})


@app.post("/api/summarize")
def summarize():
    """Summarize a specific document by doc_id."""
    data = request.get_json(force=True)
    doc_id = (data.get("doc_id") or "").strip()
    filename = (data.get("filename") or "document").strip()
    if not doc_id:
        return jsonify({"error": "doc_id is required"}), 400

    try:
        sources = store.similarity_search("summary overview introduction", k=6, doc_ids=[doc_id])
        summary = agent.summarize(sources=sources, filename=filename)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500
    except Exception:
        return jsonify({"error": "An unexpected error occurred while summarizing the document."}), 500
    return jsonify({"summary": summary, "doc_id": doc_id})


@app.post("/api/reset")
def reset():
    """Clear all indexed documents."""
    store.reset()
    return jsonify({"ok": True, "message": "All documents cleared."})


if __name__ == "__main__":
    app.run(debug=True, port=5000)