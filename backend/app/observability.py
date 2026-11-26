"""Explicit Langfuse tracing with production-safe metadata previews.

Observations are never made current in an OpenTelemetry context. Explicit
parent handles survive the worker-thread hops of a synchronous NDJSON stream.
Content capture is opt-in for development/evaluation only; vectors and raw exceptions are never sent.
"""
from __future__ import annotations

import hashlib
import logging
import math
import os
import time
from datetime import datetime, timezone
from uuid import UUID, uuid4
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
logger = logging.getLogger("uvicorn.error")
SCHEMA_VERSION = 2


def environment() -> str:
    return os.getenv("LANGFUSE_TRACING_ENVIRONMENT", "").strip().lower() or "unknown"


def content_enabled() -> bool:
    # Fail closed for missing/unknown environment and any Render deployment.
    return (environment() in {"development", "evaluation"}
            and os.getenv("LANGFUSE_CAPTURE_CONTENT", "false").lower() == "true"
            and not os.getenv("RENDER") and not os.getenv("RENDER_SERVICE_ID"))


def new_response_id() -> str:
    # RFC 9562 UUIDv7, compatible with Python 3.13 and existing UUID fields.
    # Timestamp lets feedback upserts retain a stable score date across days.
    millis = time.time_ns() // 1_000_000
    bits = (millis << 80) | (uuid4().int & ((1 << 80) - 1))
    bits = (bits & ~(0xf << 76)) | (7 << 76)
    bits = (bits & ~(3 << 62)) | (2 << 62)
    return str(UUID(int=bits))


def trace_id_for(response_id: str) -> str:
    return UUID(response_id).hex


def record_feedback(response_id: str, rating: int) -> None:
    """Best-effort mirror of an already-persisted Supabase rating."""
    try:
        identifier = UUID(response_id)
        if identifier.version != 7 or rating not in (-1, 1):
            return  # Older random-ID traces cannot be correlated this way.
        client = _client()
        if client is None:
            return
        created = datetime.fromtimestamp((identifier.int >> 80) / 1000, timezone.utc)
        client.create_score(name="user_feedback", value=float(rating == 1),
            data_type="BOOLEAN", trace_id=trace_id_for(response_id),
            score_id=f"{identifier.hex}-user-feedback", timestamp=created,
            environment=environment())
    except Exception:
        _warn("feedback score")


def _tags(metadata: dict[str, Any]) -> list[str]:
    return [environment(), str(metadata.get("request_type", "chat")),
            "full_content" if content_enabled() else "metadata_only",
            "production_traffic" if environment() == "production" else environment() + "_traffic"] + (
                [str(metadata["figure_slug"])] if metadata.get("figure_slug") else [])



def _warn(operation: str) -> None:
    # Do not include SDK exception strings; they may contain request data.
    logger.warning("OBSERVABILITY Langfuse %s failed; chat continues", operation)


@lru_cache(maxsize=1)
def _client() -> Any:
    if not (os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY")):
        return None
    if os.getenv("LANGFUSE_TRACING_ENABLED", "true").lower() in {"false", "0", "no"}:
        return None
    try:
        from langfuse import get_client
        return get_client()
    except Exception:
        _warn("initialization")
        return None


class Observation:
    """Safe manual observation handle; a missing SDK/span is a no-op."""

    def __init__(self, span: Any = None, metadata: dict[str, Any] | None = None, *, name: str = "", tags: list[str] | None = None):
        self._span = span
        self._metadata = dict(metadata or {})
        self._ended = False
        self._name = name
        self._tags = tags or []
        self._output: dict[str, Any] = {}
        self._input: dict[str, Any] = {}
        self.capture_content = span is not None and content_enabled()

    def child(self, name: str, as_type: str = "span", *,
              metadata: dict[str, Any] | None = None, **native: Any) -> Observation:
        fields = {k: v for k, v in (metadata or {}).items() if v is not None}
        if self._span is None or self._ended:
            return Observation(metadata=fields, name=name, tags=self._tags)
        try:
            from langfuse import propagate_attributes
            with propagate_attributes(tags=self._tags):
                span = self._span.start_observation(
                    name=name, as_type=as_type, metadata=fields,
                    input=fields.copy() or {"operation": name}, **native
                )
            return Observation(span, fields, name=name, tags=self._tags)
        except Exception:
            _warn("child creation")
            return Observation(metadata=fields, name=name, tags=self._tags)

    def annotate(self, **metadata: Any) -> None:
        if self._ended:
            return
        self._metadata.update({k: v for k, v in metadata.items() if v is not None})
        self.update_native(metadata=self._metadata.copy())

    def update_native(self, **fields: Any) -> None:
        if self._span is None or self._ended:
            return
        try:
            self._span.update(**fields)
        except Exception:
            _warn("observation update")

    def preview_input(self, fields: dict[str, Any], *, content: dict[str, Any] | None = None) -> None:
        self._input.update(fields)
        if self.capture_content and content is not None:
            self._input.update(content)
        self.update_native(input=self._input.copy())

    def preview_output(self, fields: dict[str, Any] | None = None, *, content: dict[str, Any] | None = None) -> None:
        self._output.update(fields or {})
        if self.capture_content and content is not None:
            self._output.update(content)

    def score(self, name: str, value: float | str, data_type: str = "NUMERIC", *, trace_level: bool = False) -> None:
        if self._span is None:
            return
        try:
            client = _client()
            if client is not None:
                fields = {} if trace_level else {"observation_id": self._span.id}
                client.create_score(name=name, value=value, data_type=data_type,
                                    trace_id=self._span.trace_id, environment=environment(), **fields)
        except Exception:
            _warn("diagnostic score")

    def finish(self, outcome: str | None = None) -> None:
        if self._ended:
            return
        status = outcome or self._metadata.get("outcome", "completed")
        self.annotate(outcome=status)
        if status == "failed":
            self.update_native(level="ERROR", status_message="failed")
        elif status == "interrupted":
            self.update_native(level="WARNING", status_message="interrupted")
        # Input/output fields are intentionally separate from metadata. Only
        # allowlisted call sites add content, and only in approved environments.
        self.update_native(output={**self._metadata, **self._output, "outcome": status})
        if self._name == "answer_generation":
            self.score("execution_outcome", status, "CATEGORICAL", trace_level=True)
            answer_type = self._metadata.get("answer_type")
            if status == "completed" and answer_type in {"substantive", "insufficient_evidence"}:
                self.score("answer_type", answer_type, "CATEGORICAL", trace_level=True)
        elif self._name == "input_moderation":
            moderation = self._metadata.get("moderation_outcome")
            if moderation in {"allowed", "blocked", "service_error"}:
                self.score("moderation_check_failed", float(moderation == "service_error"), "BOOLEAN")
                if moderation != "service_error":
                    self.score("moderation_blocked", float(moderation == "blocked"), "BOOLEAN")
        self._ended = True
        if self._span is not None:
            try:
                self._span.end()
            except Exception:
                _warn("observation end")

    def __enter__(self) -> Observation:
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
        # Do not forward exception objects to the SDK or auto-record exceptions.
        if exc_type is GeneratorExit:
            self.finish("interrupted")
        elif exc_type is not None:
            self.finish("failed")
        else:
            self.finish()
        return False


def start_answer_trace(*, request_id: str | None, response_id: str,
                       figure_slug: str | None, request_type: str,
                       question_length_chars: int, question: str | None = None) -> Observation:
    metadata = {
        "request_id": request_id,
        "response_id": response_id,
        "figure_slug": figure_slug,
        "request_type": request_type,
        "question_length_chars": question_length_chars,
        "schema_version": SCHEMA_VERSION,
        "environment": environment(),
        "content_capture": "enabled" if content_enabled() else "disabled",
        "app_version": os.getenv("APP_VERSION") or os.getenv("RENDER_GIT_COMMIT"),
    }
    metadata = {k: v for k, v in metadata.items() if v is not None}
    client = _client()
    if client is not None:
        try:
            from langfuse import propagate_attributes
            tags = _tags(metadata)
            with propagate_attributes(tags=tags):
                span = client.start_observation(
                    name="answer_generation", as_type="span", metadata=metadata,
                    trace_context={"trace_id": trace_id_for(response_id)},
                    input=metadata.copy()
                )
            observation = Observation(span, metadata, name="answer_generation", tags=tags)
            observation.preview_input(metadata, content={"question": question} if observation.capture_content else None)
            return observation
        except Exception:
            _warn("root creation")
    return Observation(metadata=metadata, name="answer_generation")


def record_usage(observation: Observation, response: Any) -> None:
    """Convert OpenAI inclusive token counts into Langfuse exclusive buckets."""
    try:
        usage = getattr(response, "usage", None)
        if usage is None:
            return
        def integer(obj: Any, key: str) -> int | None:
            val = getattr(obj, key, None)
            return val if isinstance(val, int) and not isinstance(val, bool) and val >= 0 else None

        inp = integer(usage, "input_tokens")
        if inp is None:
            inp = integer(usage, "prompt_tokens")  # embeddings
        out = integer(usage, "output_tokens")
        cached = integer(getattr(usage, "input_tokens_details", None), "cached_tokens")
        reasoning = integer(getattr(usage, "output_tokens_details", None), "reasoning_tokens")
        total = integer(usage, "total_tokens")
        details = {}
        if inp is not None:
            if cached is not None and cached <= inp:
                details["input"] = inp - cached
                details["input_cached_tokens"] = cached
            else:
                details["input"] = inp
        if out is not None:
            if reasoning is not None and reasoning <= out:
                details["output"] = out - reasoning
                details["output_reasoning_tokens"] = reasoning
            else:
                details["output"] = out
        if total is not None:
            details["total"] = total
        if details:
            observation.update_native(usage_details=details)
            observation.preview_output({"token_usage": details})
    except Exception:
        _warn("usage capture")


def record_matches(observation: Observation, matches: list[dict[str, Any]], *, scores: bool = False) -> None:
    """Record index metadata, and optionally test passages and diagnostic scores."""
    try:
        fields: dict[str, Any] = {"returned_chunk_count": len(matches)}
        for rank, match in enumerate(matches, 1):
            key = match.get("chunk_key")
            if isinstance(key, str):
                # Avoid oversized metadata values without truncating an ID ambiguously.
                if len(key.encode("utf-8")) > 160:
                    fields[f"chunk_{rank}_key_sha256"] = hashlib.sha256(key.encode()).hexdigest()
                else:
                    fields[f"chunk_{rank}_key"] = key
            score = match.get("similarity")
            if isinstance(score, (float, int)) and math.isfinite(score):
                fields[f"chunk_{rank}_similarity"] = float(score)
        observation.annotate(**fields)
        if observation.capture_content:
            observation.preview_output(content={"passages": [m.get("content", "") for m in matches]})
        if scores:
            similarities = [fields[f"chunk_{rank}_similarity"] for rank in range(1, len(matches)+1)
                            if f"chunk_{rank}_similarity" in fields]
            observation.score("retrieval_chunk_count", float(len(matches)))
            observation.score("retrieval_zero_results", float(not matches), "BOOLEAN")
            if "chunk_1_similarity" in fields:
                observation.score("retrieval_top1_similarity", fields["chunk_1_similarity"])
            if similarities:
                observation.score("retrieval_mean_similarity", sum(similarities)/len(similarities))
                observation.score("retrieval_min_similarity", min(similarities))
    except Exception:
        _warn("retrieval metadata capture")
