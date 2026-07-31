"""CLI entry: python -m local_kb"""
from __future__ import annotations
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from local_kb.engine import get_kb, LocalKBError, MissingDependencyError


def format_result(r: dict, idx: int) -> str:
    lines = [
        f"#{idx}  [{r['score']:.4f}] {r.get('rel_path', r['source_path'])}",
        f"    {r['preview'][:200]}",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        prog="local_kb",
        description="Local knowledge base — ChromaDB + FastEmbed semantic search",
    )
    sub = parser.add_subparsers(dest="action", help="Operation")

    p_index = sub.add_parser("index", help="Index files/directories")
    p_index.add_argument("path", help="File or directory to index")
    p_index.add_argument("--recursive", action="store_true", default=True,
                         help="Recurse into subdirectories (default)")
    p_index.add_argument("--no-recursive", action="store_true",
                         help="Do not recurse")
    p_index.add_argument("--glob", dest="glob_pattern",
                         help="File pattern filter, e.g. '*.md'")

    p_search = sub.add_parser("search", help="Semantic search")
    p_search.add_argument("query", help="Search query (Chinese supported)")
    p_search.add_argument("--top-k", "-k", type=int, default=5,
                          help="Number of results (default 5)")
    p_search.add_argument("--json", action="store_true",
                          help="JSON output")

    sub.add_parser("stats", help="Show collection statistics")
    sub.add_parser("list", help="List indexed source files")

    p_remove = sub.add_parser("remove", help="Remove indexed files")
    p_remove.add_argument("path", help="File path to remove from index")

    args = parser.parse_args()
    if not args.action:
        parser.print_help()
        return

    try:
        kb = get_kb()
    except MissingDependencyError as e:
        print(f"Dependencies missing: {e}", file=sys.stderr)
        print("Install with: pip install chromadb fastembed", file=sys.stderr)
        sys.exit(1)

    try:
        if args.action == "index":
            recursive = not getattr(args, 'no_recursive', False)
            result = kb.index(args.path, recursive=recursive,
                              glob_pattern=getattr(args, 'glob_pattern', None))
            print(f"Indexed {result['indexed_count']} chunks, "
                  f"skipped {result['skipped_count']} files, "
                  f"{result['error_count']} errors "
                  f"({result['elapsed_sec']}s)")
            if result['errors']:
                for e in result['errors'][:10]:
                    print(f"  ! {e['path']}: {e['error']}")

        elif args.action == "search":
            results = kb.search(args.query, top_k=args.top_k)
            if args.json:
                out = [{
                    "rank": i + 1,
                    "source_path": r.source_path,
                    "rel_path": r.metadata.get("rel_path", r.source_path),
                    "score": r.score,
                    "preview": r.content[:300],
                } for i, r in enumerate(results)]
                print(json.dumps(out, indent=2, ensure_ascii=False))
            else:
                if not results:
                    print("No results found.")
                else:
                    for i, r in enumerate(results):
                        print(format_result({
                            "score": r.score,
                            "source_path": r.source_path,
                            "rel_path": r.metadata.get("rel_path", r.source_path),
                            "preview": r.content,
                        }, i + 1))

        elif args.action == "stats":
            s = kb.stats()
            print(f"Collection: {s.get('collection')}")
            print(f"Total chunks: {s.get('total_documents')}")
            print(f"Source files: {s.get('total_source_files')}")

        elif args.action == "list":
            docs = kb.list_documents()
            if not docs['documents']:
                print("No documents indexed.")
            else:
                for d in docs['documents']:
                    print(f"  [{d['chunks']} chunks] {d['rel_path']}")

        elif args.action == "remove":
            result = kb.remove(args.path)
            print(f"Removed {result['removed']} chunks for {result['path']}")

    except LocalKBError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
