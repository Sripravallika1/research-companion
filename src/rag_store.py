# src/rag_store.py
import os
import uuid
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings


class RAGStore:
    def __init__(self, persist_dir: str = "./chroma_db", collection_name: str = "research_companion"):
        os.makedirs(persist_dir, exist_ok=True)
        self.embedder = SentenceTransformer("all-MiniLM-L6-v2")
        self.client = chromadb.PersistentClient(
            path=persist_dir,
            settings=Settings(allow_reset=True)
        )
        self.collection_name = collection_name
        self.col = self.client.get_or_create_collection(name=collection_name)

    def add_document_chunks(self, filename: str, chunks: list[dict]) -> str:
        doc_id = str(uuid.uuid4())
        texts = [c["text"] for c in chunks]
        metadatas = [
            {"doc_id": doc_id, "filename": filename, "page": c["page"]}
            for c in chunks
        ]
        ids = [f"{doc_id}:{i}" for i in range(len(chunks))]
        embeddings = self.embedder.encode(texts, normalize_embeddings=True).tolist()
        self.col.add(ids=ids, documents=texts, metadatas=metadatas, embeddings=embeddings)
        return doc_id

    def similarity_search(self, query: str, k: int = 5, doc_ids: list[str] | None = None) -> list[dict]:
        q_emb = self.embedder.encode([query], normalize_embeddings=True).tolist()
        where = None
        if doc_ids:
            where = {"doc_id": {"$in": doc_ids}}
        count = self.col.count()
        if count == 0:
            return []
        res = self.col.query(
            query_embeddings=q_emb,
            n_results=min(k, count),
            where=where,
            include=["documents", "metadatas", "distances"],
        )
        out = []
        for i in range(len(res["documents"][0])):
            out.append({
                "text": res["documents"][0][i],
                "metadata": res["metadatas"][0][i],
                "distance": res["distances"][0][i],
            })
        return out

    def list_docs(self) -> list[dict]:
        res = self.col.get(include=["metadatas"], limit=5000)
        seen = {}
        for md in res.get("metadatas", []):
            if not md:
                continue
            did = md.get("doc_id")
            if did and did not in seen:
                seen[did] = {"doc_id": did, "filename": md.get("filename", "unknown")}
        return list(seen.values())

    def reset(self):
        self.client.reset()
        self.col = self.client.get_or_create_collection(name=self.collection_name)
