"""local_kb — Local vector knowledge base with ChromaDB + fastembed"""
from .engine import (
    ChunkDocument, SearchResult,
    LocalKB, LocalKBError, MissingDependencyError,
    get_kb,
)

__all__ = ["ChunkDocument", "SearchResult", "LocalKB", "LocalKBError",
           "MissingDependencyError", "get_kb"]
