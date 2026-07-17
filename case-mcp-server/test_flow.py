"""流程测试：验证脱敏→反脱敏 roundtrip 与编排正确性。

运行：python test_flow.py
"""

import asyncio
import json
import os
import re
import tempfile

from case_source import fetch_case, format_case
from redactor import desensitize, restore
from gateway import scan_for_residual_pii
from analyzer import get_desensitized_case, restore_result, adjust_desensitization
from mapping_store import MappingStore


def _make_store():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    return MappingStore(db_path=path)


def test_roundtrip():
    """脱敏 → 映射 → 反脱敏应完全还原原文。"""
    case = asyncio.run(fetch_case("C2026-001"))
    raw = format_case(case)
    masked, mapping, _ = desensitize(
        raw, known_names=case["parties"], known_addresses=case["addresses"]
    )
    restored = restore(masked, mapping)
    assert restored == raw, "roundtrip 失败：脱敏→反脱敏未还原原文"


def test_no_residual_pii():
    """脱敏后不应残留真实 PII。"""
    case = asyncio.run(fetch_case("C2026-001"))
    raw = format_case(case)
    masked, _, _ = desensitize(
        raw, known_names=case["parties"], known_addresses=case["addresses"]
    )
    assert scan_for_residual_pii(masked) == [], f"PII 兜底扫描未通过: {scan_for_residual_pii(masked)}"


def test_scan_for_residual_pii_flags_known_name_and_address():
    """兜底扫描应识别已知姓名和地址残留。"""
    text = "原告 张三，住址 北京市朝阳区XX路1号。"
    residual = scan_for_residual_pii(
        text,
        known_names=["张三"],
        known_addresses=["北京市朝阳区XX路1号"],
    )
    assert "张三" in residual, "未识别残留姓名"
    assert "北京市朝阳区XX路1号" in residual, "未识别残留地址"


def test_consistent_tokenization():
    """同一文本中同一值应映射为同一令牌。"""
    case = asyncio.run(fetch_case("C2026-002"))
    raw = format_case(case)
    double_text = raw + " 补充：申请人 王五 再次提交材料。"
    masked, _, _ = desensitize(double_text, known_names=case["parties"], known_addresses=case["addresses"])
    tokens = re.findall(r"\[姓名_\d+\]", masked)
    assert len(set(tokens)) == 1, f"同一个人出现了不同令牌: {tokens}"


def test_hierarchical_categories():
    """角色前缀姓名应生成三级语义标签。"""
    text = "原告 张三，被告 李四。"
    _, mapping, categories = desensitize(text)
    # 张三应被标记为 姓名/当事人/原告
    name_tokens = [t for t, v in mapping.items() if v == "张三"]
    assert len(name_tokens) == 1, f"张三应有唯一令牌: {name_tokens}"
    token = name_tokens[0]
    assert categories[token] == "姓名/当事人/原告", f"张三类别应为 姓名/当事人/原告，实际: {categories[token]}"
    assert "原告" in token, f"令牌应包含叶级类别: {token}"

    # 李四应被标记为 姓名/当事人/被告
    name_tokens = [t for t, v in mapping.items() if v == "李四"]
    assert len(name_tokens) == 1
    token = name_tokens[0]
    assert categories[token] == "姓名/当事人/被告"


def test_cross_document_token_consistency():
    """同一实体在不同文档中应使用同一令牌（通过全局注册表）。"""
    store = _make_store()

    # 第一次脱敏
    text1 = "原告 张三，身份证号 110105199001011234。"
    _, mapping1, _ = desensitize(text1, store=store)
    token1 = [t for t, v in mapping1.items() if v == "张三"][0]

    # 第二次脱敏（不同文档）
    text2 = "被告 张三，住址 北京市朝阳区XX路1号。"
    _, mapping2, _ = desensitize(text2, store=store)
    token2 = [t for t, v in mapping2.items() if v == "张三"][0]

    assert token1 == token2, f"同一实体跨文档应使用同一令牌: {token1} vs {token2}"


def test_get_desensitized_case_returns_trace_id_and_entities():
    """get_desensitized_case 应返回 TRACE_ID 和实体列表。"""
    store = _make_store()
    result = asyncio.run(get_desensitized_case("C2026-001", store=store))
    assert "TRACE_ID:" in result, "未返回 TRACE_ID"
    assert "C2026-001" in result, "trace_id 应包含 case_id"
    assert "脱敏文本" in result, "应包含脱敏文本"
    assert "识别实体列表" in result, "应包含实体列表"


def test_restore_result_restores_pii():
    """get_desensitized_case → restore_result 应还原真实 PII。"""
    store = _make_store()

    result = asyncio.run(get_desensitized_case("C2026-001", store=store))
    lines = result.split("\n")
    trace_id = lines[0].replace("TRACE_ID: ", "").strip()

    # 从实体列表中找到令牌
    entities_start = result.index("识别实体列表（")
    entities_json = result[entities_start:].split("\n", 1)[1]
    entities = json.loads(entities_json)

    name_token = next(e["token"] for e in entities if e["original"] == "张三")
    name2_token = next(e["token"] for e in entities if e["original"] == "李四")

    simulated = f"经分析：{name_token} 的诉求成立，{name2_token} 应承担违约责任。"
    restored = asyncio.run(restore_result(trace_id, simulated, store=store))
    assert "张三" in restored, "未还原姓名 张三"
    assert "李四" in restored, "未还原姓名 李四"
    assert "[姓名" not in restored and "[原告" not in restored and "[被告" not in restored, "残留令牌"


def test_get_desensitized_case_uses_injected_store():
    """get_desensitized_case 应始终使用传入的 store，而不是全局 store。"""
    store = _make_store()
    default_store = MappingStore()
    default_mapping_count_before = 0
    if os.path.exists(default_store.db_path):
        with default_store._conn() as conn:
            default_mapping_count_before = conn.execute("SELECT COUNT(*) FROM mappings").fetchone()[0]

    asyncio.run(get_desensitized_case("C2026-001", store=store))

    with store._conn() as conn:
        mapping_count = conn.execute("SELECT COUNT(*) FROM mappings").fetchone()[0]

    assert mapping_count > 0, "传入 store 未写入映射数据"

    if os.path.exists(default_store.db_path):
        with default_store._conn() as conn:
            default_mapping_count = conn.execute("SELECT COUNT(*) FROM mappings").fetchone()[0]
        assert default_mapping_count == default_mapping_count_before, "错误地写入了全局 store"


def test_restore_result_invalid_trace_id():
    """restore_result 对无效 trace_id 应抛出异常。"""
    store = _make_store()
    try:
        asyncio.run(restore_result("invalid-trace-id", "some text", store=store))
        assert False, "应抛出异常"
    except ValueError:
        pass


def test_adjust_desensitization_remove():
    """adjust_desensitization 应支持删除误识别实体。"""
    store = _make_store()

    result = asyncio.run(get_desensitized_case("C2026-001", store=store))
    lines = result.split("\n")
    trace_id = lines[0].replace("TRACE_ID: ", "").strip()

    # 删除一个实体
    entities_start = result.index("识别实体列表（")
    entities_json = result[entities_start:].split("\n", 1)[1]
    entities = json.loads(entities_json)
    token_to_remove = entities[0]["token"]

    corrections = json.dumps({"remove": [token_to_remove]})
    adjust_result = asyncio.run(adjust_desensitization(trace_id, corrections, store=store))
    assert "删除" in adjust_result, "应报告删除操作"

    # 检查更新后的实体列表中不再包含该令牌
    updated_entities_start = adjust_result.index("更新后的实体列表：")
    updated_entities_json = adjust_result[updated_entities_start:].split("\n", 1)[1]
    updated_entities = json.loads(updated_entities_json)
    updated_tokens = [e["token"] for e in updated_entities]
    assert token_to_remove not in updated_tokens, "删除后实体列表不应包含该令牌"


def test_adjust_desensitization_merge():
    """adjust_desensitization 应支持合并实体。"""
    store = _make_store()

    # 手动构造包含两个相同实体的文本
    text = "原告 张三，被告 张三。"
    masked, mapping, categories = desensitize(text, store=store)

    # 张三应有两个不同令牌（因为角色不同导致类别不同）
    name_tokens = [t for t, v in mapping.items() if v == "张三"]
    # 由于类别不同（姓名/当事人/原告 vs 姓名/当事人/被告），它们是不同的实体
    # 这里我们测试 merge 功能
    if len(name_tokens) >= 2:
        corrections = json.dumps({"merge": [{"from": name_tokens[0], "to": name_tokens[1]}]})
        trace_id = store.save("TEST-001", mapping, categories)
        adjust_result = asyncio.run(adjust_desensitization(trace_id, corrections, store=store))
        assert "合并" in adjust_result, "应报告合并操作"

        updated_mapping = store.load(trace_id)
        assert name_tokens[0] in updated_mapping, "合并后应保留源令牌的还原映射"
        assert updated_mapping[name_tokens[0]] == updated_mapping[name_tokens[1]], "合并后两个令牌应还原到相同原文"


def test_adjust_desensitization_update_category():
    """adjust_desensitization 应支持修改实体类别。"""
    store = _make_store()

    result = asyncio.run(get_desensitized_case("C2026-001", store=store))
    lines = result.split("\n")
    trace_id = lines[0].replace("TRACE_ID: ", "").strip()

    entities_start = result.index("识别实体列表（")
    entities_json = result[entities_start:].split("\n", 1)[1]
    entities = json.loads(entities_json)
    token_to_update = entities[0]["token"]

    corrections = json.dumps({
        "update_category": [{"token": token_to_update, "category": "姓名/当事人/被告"}]
    })
    adjust_result = asyncio.run(adjust_desensitization(trace_id, corrections, store=store))
    assert "修改" in adjust_result, "应报告修改操作"
    assert "姓名/当事人/被告" in adjust_result, "应包含新类别"


def test_desensitize_without_store_uses_local_counter():
    """不传 store 时，脱敏使用局部计数器（向后兼容）。"""
    case = asyncio.run(fetch_case("C2026-001"))
    raw = format_case(case)
    masked, mapping, _ = desensitize(
        raw,
        known_names=case["parties"],
        known_addresses=case["addresses"],
        use_local_ner=False,
    )
    assert "[姓名" in masked or "[原告" in masked or "[被告" in masked, "脱敏未生效"
    assert "[证件" in masked, "正则脱敏未生效"
    assert "[电话" in masked, "正则脱敏未生效"


def test_query_case_by_id_mock_fallback():
    """未配置 DB 时 query_case_by_id 回退到 mock。"""
    from analyzer import query_case_by_id
    result = asyncio.run(query_case_by_id("C2026-001"))
    data = json.loads(result)
    assert data["case_id"] == "C2026-001"
    assert "text" in data and len(data["text"]) > 0
    assert "parties" in data and "addresses" in data


def test_save_report_md():
    """生成 md 报告。"""
    from analyzer import save_report
    result = asyncio.run(save_report("TEST-CASE", "# 分析报告\n\n测试内容", "md"))
    assert "报告已生成" in result
    path = result.split(": ", 1)[1].strip()
    assert os.path.exists(path) and path.endswith(".md")
    with open(path, encoding="utf-8") as f:
        assert "测试内容" in f.read()
    os.remove(path)


def test_save_report_docx():
    """生成 docx 报告。"""
    from analyzer import save_report
    result = asyncio.run(save_report("TEST-CASE", "第一段\n\n第二段", "docx"))
    assert "报告已生成" in result
    path = result.split(": ", 1)[1].strip()
    assert os.path.exists(path) and path.endswith(".docx")
    os.remove(path)


if __name__ == "__main__":
    tests = [
        (test_roundtrip, "roundtrip 脱敏→反脱敏还原"),
        (test_no_residual_pii, "无 PII 残留"),
        (test_scan_for_residual_pii_flags_known_name_and_address, "兜底扫描识别姓名和地址"),
        (test_consistent_tokenization, "同一实体同一令牌"),
        (test_hierarchical_categories, "三级语义标签"),
        (test_cross_document_token_consistency, "跨文档令牌一致性"),
        (test_get_desensitized_case_returns_trace_id_and_entities, "返回 TRACE_ID 和实体列表"),
        (test_restore_result_restores_pii, "restore_result 还原 PII"),
        (test_get_desensitized_case_uses_injected_store, "使用传入 store"),
        (test_restore_result_invalid_trace_id, "无效 trace_id 抛异常"),
        (test_adjust_desensitization_remove, "校正-删除实体"),
        (test_adjust_desensitization_merge, "校正-合并实体"),
        (test_adjust_desensitization_update_category, "校正-修改类别"),
        (test_desensitize_without_store_uses_local_counter, "无 store 时局部计数器"),
        (test_query_case_by_id_mock_fallback, "未配置 DB 时回退 mock"),
        (test_save_report_md, "生成 md 报告"),
        (test_save_report_docx, "生成 docx 报告"),
    ]
    passed = 0
    for test_fn, name in tests:
        try:
            test_fn()
            print(f"  ✓  {name}")
            passed += 1
        except Exception as e:
            print(f"  ✗  {name}: {e}")
    print(f"\n{passed}/{len(tests)} 通过")