# src/agent.py
import os

from agno.agent import Agent
from agno.models.openai import OpenAIChat


def build_system_prompt(mode: str) -> str:
    base = (
        "You are Research Companion, an AI document intelligence assistant. "
        "Answer questions using ONLY the SOURCE chunks provided below. "
        "Do NOT use any outside knowledge. "
        "If the answer is not found in the sources, say clearly: "
        "'I could not find that information in the uploaded documents.' "
        "Always cite sources using the format [filename, p.X] inline."
    )
    if mode == "simple":
        return base + (
            "\n\nRESPONSE STYLE: Simple. Use plain English. "
            "Avoid jargon. Keep answers short and clear (2-4 sentences max unless detail is needed)."
        )
    if mode == "technical":
        return base + (
            "\n\nRESPONSE STYLE: Technical. Use precise, domain-accurate language. "
            "Include nuanced details, relevant terminology, and structured reasoning."
        )
    if mode == "actionable":
        return base + (
            "\n\nRESPONSE STYLE: Actionable. Focus on what to DO. "
            "Use numbered steps or bullet points. Start each point with an action verb."
        )
    return base


class RAGAgent:
    """
    Agent that orchestrates retrieval + answer generation via Agno and OpenRouter.
    """

    def __init__(self) -> None:
        self._agent = Agent(
            model=OpenAIChat(
                id=os.getenv("OPENROUTER_MODEL", "google/gemma-3-27b-it:free"),
                base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
                api_key=os.getenv("OPENROUTER_API_KEY"),
            ),
            markdown=False,
        )

    def answer(self, question: str, mode: str, sources: list[dict]) -> str:
        """Generate a grounded answer from retrieved source chunks."""
        if not sources:
            return "I could not find that information in the uploaded documents."

        formatted = []
        for i, s in enumerate(sources, start=1):
            md = s.get("metadata", {})
            formatted.append(
                f"SOURCE {i}:\n"
                f"  file: {md.get('filename', 'unknown')}\n"
                f"  page: {md.get('page', '?')}\n"
                f"  text: {s['text']}"
            )
        context = "\n\n---\n\n".join(formatted)
        system = build_system_prompt(mode)
        user_msg = (
            f"{system}\n\n"
            f"QUESTION:\n{question}\n\n"
            f"SOURCES:\n{context}\n\n"
            "Provide your answer with inline citations."
        )
        try:
            response = self._agent.run(user_msg)
            return str(response.content)
        except Exception as exc:
            raise RuntimeError(str(exc)) from exc

    def summarize(self, sources: list[dict], filename: str) -> str:
        """Summarize a document based on its top chunks."""
        if not sources:
            return "No content found to summarize."
        context = "\n\n".join([s["text"] for s in sources[:6]])
        user_msg = (
            "You are a document summarizer. Summarize the document content below "
            "into 3-5 clear bullet points. Be concise and factual.\n\n"
            f"Document: {filename}\n\nContent:\n{context}\n\nProvide a concise summary."
        )
        try:
            response = self._agent.run(user_msg)
            return str(response.content)
        except Exception as exc:
            raise RuntimeError(str(exc)) from exc