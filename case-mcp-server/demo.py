"""演示脚本：不依赖 MCP 传输层，直接跑一遍完整流程。

新架构：
  1. 本地脱敏 → 返回脱敏文本 + trace_id + 实体列表
  2. 模拟外部智能体分析（脱敏文本，仅见令牌）
  3. 反脱敏还原 → 返回真实 PII

运行：python demo.py
"""

import asyncio

from analyzer import get_desensitized_case, restore_result


async def main():
    print("=" * 60)
    print("[1] 本地脱敏（正则 + 精确匹配 + 角色标签 + 本地模型 NER）")
    print("=" * 60)
    result = await get_desensitized_case("C2026-001")
    print(result)

    # 提取 trace_id
    lines = result.split("\n")
    trace_id = lines[0].replace("TRACE_ID: ", "").strip()

    # 提取脱敏文本（TRACE_ID 行 + 空行 + 脱敏文本行）
    masked_start = result.index("脱敏文本（") + len("脱敏文本（可发送至外部智能体分析，仅含令牌不含真实 PII）：\n")
    masked_end = result.index("\n\n识别实体列表")
    masked_text = result[masked_start:masked_end].strip()

    print()
    print("=" * 60)
    print("[2] 模拟外部智能体分析（仅见令牌，不含真实 PII）")
    print("=" * 60)
    # 模拟 WorkBuddy 等外部智能体对脱敏文本的分析结果
    import re
    tokens = re.findall(r"\[[^\]]+\]", masked_text)
    name_token = next((t for t in tokens if "原告" in t or "姓名" in t), tokens[0] if tokens else "该当事人")
    addr_token = next((t for t in tokens if "地址" in t or "住所" in t), "")
    simulated_analysis = (
        f"经分析：{name_token} 的诉求事实清楚，证据链较为完整。"
    )
    if addr_token:
        simulated_analysis += f" {addr_token} 属本院管辖范围。"
    simulated_analysis += " 建议尽快起诉并申请财产保全，注意诉讼时效风险。"
    print(simulated_analysis)

    print()
    print("=" * 60)
    print("[3] 反脱敏还原（本地替换令牌 → 真实 PII）")
    print("=" * 60)
    restored = await restore_result(trace_id, simulated_analysis)
    print(restored)

    print()
    print(f"✓ trace_id: {trace_id}")
    print("✓ demo 完成——PII 全程不出本地，外部智能体仅见令牌")


if __name__ == "__main__":
    asyncio.run(main())