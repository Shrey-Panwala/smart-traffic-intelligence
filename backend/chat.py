import os
from typing import List, Optional

import google.generativeai as genai
import threading
import time
# Defer importing the new SDK to avoid unresolved import errors in environments
# where google-genai is not installed. We'll import it lazily inside init_model.
GenaiClient = None

SYSTEM_PROMPT = (
    "You are the Gemini assistant for the 'Smart Parking & Traffic Intelligence System'. "
    "Be concise, friendly, and helpful. Use plain language. "
    "Prioritize guidance about: uploading videos, running analysis, interpreting charts (vehicle counts, smoothing), "
    "congestion levels (Low/Medium/High), parking recommendations, and the traffic density heatmap. "
    "If asked for steps, provide short commands for Windows PowerShell where relevant. "
    "Avoid harmful, hateful, or explicit content. If asked for anything unsafe, refuse politely. "
    "Formatting: use short paragraphs and bullet points with dashes, add line breaks for readability, and do not use asterisks."
)

def _pick_model_id_genai(client) -> str:
    requested = os.environ.get("GEMINI_MODEL_ID")
    if requested:
        return requested
    try:
        models = list(client.models.list())
    except Exception:
        models = []
    preferred = [
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
        "gemini-pro",
    ]
    names = [getattr(m, 'name', '') for m in models]
    for p in preferred:
        if any(str(n).endswith(p) for n in names):
            return p
    if names:
        last = str(names[0]).split('/')[-1]
        return last or "gemini-1.5-pro"
    return "gemini-1.5-pro"

def _pick_model_id() -> str:
    requested = os.environ.get("GEMINI_MODEL_ID")
    try:
        models = list(genai.list_models())
    except Exception:
        models = []

    def supports_generate(m) -> bool:
        try:
            return "generateContent" in getattr(m, "supported_generation_methods", [])
        except Exception:
            return False

    # If user requested a specific model, honor it
    if requested:
        return requested

    # Prefer common, widely available models if present
    preferred = [
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
        "gemini-pro",
        "gemini-pro-vision",
    ]
    for p in preferred:
        if any(supports_generate(m) and str(getattr(m, "name", "")).endswith(p) for m in models):
            return p

    # Fallback to first model that supports generateContent
    for m in models:
        if supports_generate(m):
            name = str(getattr(m, "name", "")).split("/")[-1]
            if name:
                return name
    # Final fallback
    return "gemini-1.5-pro"

def init_model(system_extra: Optional[str] = None):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    use_genai = str(os.environ.get("USE_GOOGLE_GENAI", "")).lower() in ("1","true","yes")
    if use_genai:
        try:
            from google.genai import Client as GenaiClient  # type: ignore
            client = GenaiClient(api_key=api_key)
            model_id = _pick_model_id_genai(client)
            return {
                "sdk": "genai",
                "client": client,
                "model_id": model_id,
                "system_extra": system_extra,
            }
        except Exception:
            # Fall back to legacy SDK if import or init fails
            pass
    genai.configure(api_key=api_key)
    model_id = _pick_model_id()
    system_text = SYSTEM_PROMPT
    if system_extra:
        system_text = SYSTEM_PROMPT + "\n\nContext for current session:\n" + system_extra
    return genai.GenerativeModel(
        model_name=model_id,
        system_instruction=system_text,
        generation_config={
            "temperature": 0.4,
            "top_p": 0.95,
            "top_k": 40,
        },
        safety_settings={
            # Keep defaults; you can customize per hackathon rules
        },
    )

def build_gemini_input(message: str, history: Optional[List[dict]] = None):
    def normalize_role(r: Optional[str]) -> str:
        if r == "assistant":
            return "model"
        if r in ("user", "model"):
            return r
        # Default unknown roles to user to satisfy API
        return "user"

    parts = []
    # Convert prior history into model input format
    if history:
        for h in history:
            role = normalize_role(h.get("role"))
            content = h.get("content")
            if content:
                parts.append({"role": role, "parts": [content]})
    # Append current user message
    parts.append({"role": "user", "parts": [message]})
    return parts

def chat_reply(message: str, history: Optional[List[dict]] = None, context: Optional[str] = None):
    # Helper to run blocking SDK calls with a timeout to prevent indefinite buffering
    def _call_with_timeout(fn, timeout_s: float):
        result = {"value": None, "error": None}
        def _runner():
            try:
                result["value"] = fn()
            except Exception as e:
                result["error"] = e
        t = threading.Thread(target=_runner, daemon=True)
        t.start()
        t.join(timeout=timeout_s)
        if t.is_alive():
            return (None, TimeoutError("Gemini response timed out"))
        return (result["value"], result["error"])

    timeout_s = float(os.environ.get("GEMINI_TIMEOUT_SECONDS", "15"))
    def format_reply(text: Optional[str]) -> str:
        if not text:
            return ""
        # Remove asterisks and normalize whitespace
        cleaned = text.replace("*", "")
        # Ensure bullets use dashes
        cleaned = cleaned.replace("\n- ", "\n- ").replace("\n• ", "\n- ")
        # Add line breaks after sentences if missing (best-effort)
        # Do not over-process URLs
        lines = []
        for line in cleaned.splitlines():
            line = line.strip()
            lines.append(line)
        return "\n".join(lines).strip()
    model = init_model(context)
    if model is None:
        return {
            "reply": (
                "Gemini API key not configured. Set GEMINI_API_KEY in your environment to enable the chatbot. "
                "In PowerShell: $env:GEMINI_API_KEY=\"YOUR_KEY\" then restart the backend."
            ),
            "safety_blocks": [],
        }
    # New SDK path
    if isinstance(model, dict) and model.get("sdk") == "genai":
        client = model["client"]
        model_id = model["model_id"]
        # Build a simple text input combining context + conversation
        convo_lines = []
        if context:
            convo_lines.append("Context:\n" + context)
        if history:
            for h in history:
                role = h.get("role","user").capitalize()
                convo_lines.append(f"{role}: {h.get('content','')}")
        convo_lines.append(f"User: {message}")
        text_input = "\n\n".join(convo_lines)
        def _genai_call():
            return client.responses.generate(model=model_id, input=text_input)
        resp, err = _call_with_timeout(_genai_call, timeout_s)
        if err:
            # Fall back to legacy SDK
            pass
        else:
            try:
                text = getattr(resp, "output_text", None)
                if not text:
                    text = str(getattr(resp, "response", "")) or ""
                return {"reply": format_reply(text or ""), "safety_blocks": []}
            except Exception:
                pass
    # Legacy SDK path
    def _legacy_call():
        contents = build_gemini_input(message, history)
        return model.generate_content(contents)
    resp, err = _call_with_timeout(_legacy_call, timeout_s)
    if err:
        if isinstance(err, TimeoutError):
            return {"reply": "Chat request timed out. Please try again.", "safety_blocks": []}
        hint = (
            "\nTip: Set GEMINI_MODEL_ID to a supported model from Google AI Studio (e.g., gemini-1.5-pro, gemini-1.5-flash). "
            "You can also enable USE_GOOGLE_GENAI=true to use the new SDK."
        )
        return {"reply": f"Chat error: {err}{hint}", "safety_blocks": []}
    try:
        text = getattr(resp, "text", None) or (resp.candidates[0].content.parts[0].text if getattr(resp, 'candidates', None) else "")
        blocked = []
        try:
            if hasattr(resp, "prompt_feedback") and getattr(resp.prompt_feedback, "block_reason", None):
                blocked.append(str(resp.prompt_feedback.block_reason))
        except Exception:
            pass
        return {"reply": format_reply(text), "safety_blocks": blocked}
    except Exception as e:
        hint = (
            "\nTip: Set GEMINI_MODEL_ID to a supported model from Google AI Studio (e.g., gemini-1.5-pro, gemini-1.5-flash). "
            "You can also enable USE_GOOGLE_GENAI=true to use the new SDK."
        )
        return {"reply": f"Chat error: {e}{hint}", "safety_blocks": []}
