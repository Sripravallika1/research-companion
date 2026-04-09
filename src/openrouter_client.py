# src/openrouter_client.py
import os
import requests
from dotenv import load_dotenv

load_dotenv(override=True)


class OpenRouterClient:
    def __init__(self):
        self.api_key = os.environ.get("OPENROUTER_API_KEY", "")
        self.model = os.getenv("OPENROUTER_MODEL", "google/gemma-4-26b-a4b-it:free")
        self.base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

    def chat(self, system: str, user: str, max_tokens: int = 800) -> str:
        if not self.api_key:
            raise RuntimeError("OPENROUTER_API_KEY is not set in environment.")
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        r = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:5000",
                "X-Title": "Research Companion",
            },
            json=payload,
            timeout=60,
        )
        try:
            data = r.json()
        except Exception:
            raise RuntimeError(f"OpenRouter returned non-JSON response (status {r.status_code}): {r.text[:200]}")
        if not r.ok:
            err = data.get("error", {})
            if isinstance(err, dict):
                msg = err.get("message", f"OpenRouter error {r.status_code}")
            else:
                msg = str(err) if err else f"OpenRouter error {r.status_code}"
            raise RuntimeError(msg)
        return data["choices"][0]["message"]["content"]
