# src/pdf_extract.py
import fitz  # PyMuPDF

def extract_pdf_pages(pdf_path: str) -> list[dict]:
    """Extract text per page from a PDF. Returns list of {page, text}."""
    doc = fitz.open(pdf_path)
    pages = []
    for i in range(len(doc)):
        page = doc[i]
        text = page.get_text("text")
        if text.strip():
            pages.append({"page": i + 1, "text": text})
    return pages
