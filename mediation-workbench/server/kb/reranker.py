"""Reranker module — BGE-reranker-base cross-encoder for search result refinement.

Uses sentence-transformers CrossEncoder. Model is loaded lazily on first use.
Cache location: ~/projects/reranker-serve/hf_cache (shared with standalone reranker service).
"""
from __future__ import annotations
import os
import time
from typing import Optional

# ── Cache config ──────────────────────────────────────────
# Project-local HF cache (embedding & reranker models copied into the repo)
_RERANKER_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'hf_cache')
os.environ.setdefault("HF_HOME", _RERANKER_CACHE)
os.environ.setdefault("HF_HUB_OFFLINE", "1")  # Use cached model only

_MODEL_NAME = "BAAI/bge-reranker-base"
_MAX_LENGTH = 512

_reranker = None
_load_error: Optional[str] = None


def _ensure_reranker():
    """Lazy-load the cross-encoder model."""
    global _reranker, _load_error
    if _reranker is not None or _load_error is not None:
        return

    try:
        from sentence_transformers import CrossEncoder
        t0 = time.time()
        _reranker = CrossEncoder(_MODEL_NAME, max_length=_MAX_LENGTH)
        elapsed = time.time() - t0
        print(f"[Reranker] ✅ Loaded {_MODEL_NAME} in {elapsed:.1f}s")
    except Exception as e:
        _load_error = str(e)
        print(f"[Reranker] ⚠️  Failed to load model: {e}")
        print(f"[Reranker]    Reranking will be disabled. Install with:")
        print(f"[Reranker]    pip install sentence-transformers")
        print(f"[Reranker]    (or: pip install sentence-transformers -i https://mirrors.aliyun.com/pypi/simple/)")


def is_available() -> bool:
    """Check if reranker model is loaded and ready."""
    _ensure_reranker()
    return _reranker is not None


def rerank(
    query: str,
    documents: list[str],
    top_n: Optional[int] = None,
) -> list[dict]:
    """Rerank documents by relevance to query.

    Args:
        query: The search query
        documents: List of document texts to rerank
        top_n: Return only top N results (None = all)

    Returns:
        List of {"index": int, "score": float, "document": str} sorted by score desc.
        Returns empty list if reranker is unavailable.
    """
    _ensure_reranker()
    if _reranker is None:
        return []

    if not documents:
        return []

    pairs = [[query, doc] for doc in documents]
    scores = _reranker.predict(pairs)

    results = []
    for i, (doc, score) in enumerate(zip(documents, scores)):
        results.append({
            "index": i,
            "score": float(score),
            "document": doc,
        })

    results.sort(key=lambda x: x["score"], reverse=True)

    if top_n:
        results = results[:top_n]

    return results
