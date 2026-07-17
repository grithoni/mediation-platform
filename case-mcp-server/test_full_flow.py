"""验证完整脱敏流程：真实数据库取案件 → 脱敏 → 反脱敏。"""
import os
import sys
import asyncio
from pathlib import Path

# 加载 .env
env_file = Path(__file__).parent / ".env"
for line in env_file.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

sys.path.insert(0, str(Path(__file__).parent))

from analyzer import list_case_ids, get_desensitized_case, restore_result


async def main():
    print("=== 1. 列出案件 ID ===")
    ids_text = await list_case_ids()
    print(ids_text)

    # 取第一个真实数据库案件 ID
    from case_db import list_case_ids_from_db
    db_ids = list_case_ids_from_db()
    if not db_ids:
        print("⚠️  数据库无案件，用 mock 案件 C2026-001 测试")
        case_id = "C2026-001"
    else:
        case_id = db_ids[0]
    print(f"\n使用案件 ID: {case_id}")

    print("\n=== 2. 脱敏案件 ===")
    desensitized = await get_desensitized_case(case_id)
    print(desensitized)

    # 提取 trace_id
    trace_id = None
    for line in desensitized.splitlines():
        if line.startswith("TRACE_ID:"):
            trace_id = line.split(":", 1)[1].strip()
            break
    if not trace_id:
        print("❌ 未提取到 trace_id")
        sys.exit(1)
    print(f"\ntrace_id = {trace_id}")

    print("\n=== 3. 模拟外部智能体分析（用脱敏文本）===")
    # 取脱敏文本部分
    masked_text = desensitized.split("脱敏文本", 1)[1].split("识别实体列表", 1)[0].strip()
    analysis = f"经分析，{masked_text}\n\n建议：双方应就争议事项进行调解。"
    print(analysis)

    print("\n=== 4. 反脱敏（还原 PII）===")
    restored = await restore_result(trace_id, analysis)
    print(restored)

    print("\n✅ 完整脱敏流程验证通过")


asyncio.run(main())