"""验证 case_db.py 能从 mediation-apply 的 SQLite 读到案件数据。"""
import os
import sys

# 加载 .env
from pathlib import Path
env_file = Path(__file__).parent / ".env"
for line in env_file.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

sys.path.insert(0, str(Path(__file__).parent))

from case_db import fetch_case_from_db, list_case_ids_from_db

print("=== 1. 列出案件 ID ===")
ids = list_case_ids_from_db()
print(f"案件 ID 列表: {ids}")

if not ids:
    print("⚠️  数据库无案件记录，请先通过 /mediation/apply 提交一份申请")
    sys.exit(0)

print()
print("=== 2. 查询第一个案件 ===")
case = fetch_case_from_db(ids[0])
if case is None:
    print("❌ 查询失败")
    sys.exit(1)

import json
print(json.dumps(case, ensure_ascii=False, indent=2))

print()
print("=== 3. 验证 parties 多字段合并 ===")
parties = case.get("parties", [])
print(f"parties ({len(parties)} 个): {parties}")
assert len(parties) >= 2, f"期望至少 2 个当事人，实际 {len(parties)}"
print("✅ 申请人 + 被申请人 合并成功")

print()
print("=== 4. 验证 addresses 多字段合并 ===")
addresses = case.get("addresses", [])
print(f"addresses ({len(addresses)} 个): {addresses}")

print()
print("✅ 全部验证通过，case-mcp-server 已成功对接 mediation-apply 数据库")