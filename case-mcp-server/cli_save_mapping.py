#!/usr/bin/env python3
"""CLI helper: persist mapping into MappingStore.

Reads JSON from stdin: { "case_id": "...", "mapping": {...}, "categories": {...} }
Prints JSON to stdout: {"trace_id": "..."}
"""
import sys
import json
from mapping_store import MappingStore


def main():
    try:
        data = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"error": f"invalid input: {e}"}))
        sys.exit(1)

    case_id = data.get("case_id", "TEXT")
    mapping = data.get("mapping", {}) or {}
    categories = data.get("categories") or None

    try:
        store = MappingStore()
        trace_id = store.save(case_id, mapping, categories)
        store.audit(trace_id, action="persist_mapping", case_id=case_id, detail=f"persisted {len(mapping)} tokens")
        print(json.dumps({"trace_id": trace_id}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(2)


if __name__ == '__main__':
    main()
