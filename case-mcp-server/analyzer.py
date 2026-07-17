"""分析编排层——取数→脱敏→存映射→返回脱敏文本；接收分析结果→反脱敏→返回。

MCP server 与 demo / test 均直接调用此模块，解耦 MCP 传输层。

新架构：
  1. get_desensitized_case: 取案件→本地脱敏→存映射→PII 扫描→返回脱敏文本+trace_id+实体列表
  2. adjust_desensitization: 人工校正脱敏结果（增/删/合并实体）
  3. 外部智能体（WorkBuddy）用脱敏文本自行分析
  4. restore_result: 接收分析结果→反脱敏→审计→返回还原文本
"""

import json
import time

from case_source import fetch_case, list_cases, format_case
from redactor import desensitize, restore
from mapping_store import MappingStore
from gateway import scan_for_residual_pii

# 全局单例
_store = MappingStore()


async def query_case(case_id: str) -> str:
    """按案件 ID 查询原始案件信息（含敏感信息，仅本地返回）。"""
    case = await fetch_case(case_id)
    return format_case(case)


async def list_case_ids() -> str:
    """列出可用案件 ID。"""
    ids = await list_cases()
    return "可用案件ID：" + ", ".join(ids)


async def get_desensitized_case(
    case_id: str,
    *,
    store: MappingStore | None = None,
) -> str:
    """对案件进行本地脱敏，返回脱敏文本、trace_id 和实体列表。

    流程：
      1. 取案件原始文本（含 PII）
      2. 本地脱敏：正则 + 精确匹配 + 角色标签 + 本地模型 NER → 令牌
      3. 写入加密映射表（含三级语义标签）
      4. PII 兜底扫描
      5. 返回 trace_id + 脱敏文本 + 实体列表（供人工校正）

    外部智能体（WorkBuddy）使用脱敏文本进行分析，
    分析完成后调用 restore_result 还原结果。
    """
    store = store or _store

    # 1. 取数
    case = await fetch_case(case_id)
    raw = format_case(case)

    # 2. 本地脱敏（正则 + 精确匹配 + 角色标签 + 本地模型 NER）
    masked_text, mapping, categories = desensitize(
        raw,
        known_names=case.get("parties"),
        known_addresses=case.get("addresses"),
        store=store,
    )

    # 3. 保存映射表（加密），获取 trace_id
    trace_id = store.save(case_id, mapping, categories)

    # 4. PII 兜底扫描
    residual = scan_for_residual_pii(
        masked_text,
        known_names=case.get("parties"),
        known_addresses=case.get("addresses"),
    )
    if residual:
        raise RuntimeError(
            f"[脱敏漏检] 发现疑似未脱敏数据: {residual}"
        )

    # 5. 构建实体列表（供人工校正）
    entities = []
    for token, original in mapping.items():
        entities.append({
            "token": token,
            "original": original,
            "category": categories.get(token, ""),
        })

    # 6. 返回脱敏文本 + trace_id + 实体列表
    return (
        f"TRACE_ID: {trace_id}\n\n"
        f"脱敏文本（可发送至外部智能体分析，仅含令牌不含真实 PII）：\n"
        f"{masked_text}\n\n"
        f"识别实体列表（如需校正请调用 adjust_desensitization）：\n"
        f"{json.dumps(entities, ensure_ascii=False, indent=2)}"
    )


async def desensitize_text(
    text: str,
    known_names: str = "",
    known_addresses: str = "",
    *,
    store: MappingStore | None = None,
) -> str:
    """对任意文本进行本地脱敏（无需预置案件），返回脱敏文本、trace_id 和实体列表。

    适用于外部智能体读取外部文件（如 .docx/.pdf 提取的文本）后直接脱敏的场景。

    text: 待脱敏的原始文本
    known_names: 已知人名 JSON 数组字符串，如 '["张三","李四"]'，可选（提高精确匹配）
    known_addresses: 已知地址 JSON 数组字符串，可选

    返回格式与 get_desensitized_case 相同，
    分析完成后调用 restore_result 还原结果。
    """
    store = store or _store

    # 解析可选的已知实体
    try:
        names = json.loads(known_names) if known_names else []
        addresses = json.loads(known_addresses) if known_addresses else []
        if not isinstance(names, list) or not isinstance(addresses, list):
            raise ValueError("known_names/known_addresses 必须是 JSON 数组")
    except json.JSONDecodeError as e:
        raise ValueError(f"known_names/known_addresses JSON 解析失败: {e}")

    # 本地脱敏（正则 + 精确匹配 + 角色标签 + 本地模型 NER）
    masked_text, mapping, categories = desensitize(
        text,
        known_names=names,
        known_addresses=addresses,
        store=store,
    )

    # 保存映射表（加密），获取 trace_id
    trace_id = store.save("TEXT", mapping, categories)

    # PII 兜底扫描
    residual = scan_for_residual_pii(
        masked_text,
        known_names=names,
        known_addresses=addresses,
    )
    if residual:
        raise RuntimeError(
            f"[脱敏漏检] 发现疑似未脱敏数据: {residual}"
        )

    # 构建实体列表（供人工校正）
    entities = []
    for token, original in mapping.items():
        entities.append({
            "token": token,
            "original": original,
            "category": categories.get(token, ""),
        })

    return (
        f"TRACE_ID: {trace_id}\n\n"
        f"脱敏文本（可发送至外部智能体分析，仅含令牌不含真实 PII）：\n"
        f"{masked_text}\n\n"
        f"识别实体列表（如需校正请调用 adjust_desensitization）：\n"
        f"{json.dumps(entities, ensure_ascii=False, indent=2)}"
    )


async def adjust_desensitization(
    trace_id: str,
    corrections: str,
    *,
    store: MappingStore | None = None,
) -> str:
    """人工校正脱敏结果。

    corrections: JSON 字符串，支持以下操作：
      - add: [{"value": "张三", "category": "姓名/当事人/原告"}]  添加漏识别的实体
      - remove: ["[姓名_1]"]  删除误识别的实体
      - merge: [{"from": "[姓名_1]", "to": "[姓名_2]"}]  合并同一主体的不同令牌
      - update_category: [{"token": "[姓名_1]", "category": "姓名/当事人/被告"}]  修改类别

    返回校正后的脱敏文本和实体列表。
    """
    store = store or _store

    try:
        ops = json.loads(corrections)
    except json.JSONDecodeError:
        return "校正失败：corrections 必须是有效的 JSON 字符串"

    # 加载现有映射
    mapping = store.load(trace_id)
    if not mapping:
        return f"校正失败：trace_id 无效或已过期: {trace_id}"

    # 从 mappings 表读取类别信息
    with store._conn() as conn:
        rows = conn.execute(
            "SELECT token, category FROM mappings WHERE trace_id = ?", (trace_id,)
        ).fetchall()
    categories = {row["token"]: row["category"] for row in rows}

    # 应用校正
    changes = []

    # 删除误识别
    for token in ops.get("remove", []):
        if token in mapping:
            del mapping[token]
            categories.pop(token, None)
            changes.append(f"删除 {token}")

    # 合并实体
    for merge_op in ops.get("merge", []):
        from_token = merge_op.get("from", "")
        to_token = merge_op.get("to", "")
        if from_token in mapping and to_token in mapping:
            # 合并语义相同实体：保留两个令牌的还原映射，避免在分析结果中出现未映射令牌。
            mapping[from_token] = mapping[to_token]
            categories[from_token] = categories.get(to_token, categories.get(from_token, ""))
            changes.append(f"合并 {from_token} → {to_token}")

    # 修改类别
    for update_op in ops.get("update_category", []):
        token = update_op.get("token", "")
        new_category = update_op.get("category", "")
        if token in mapping:
            categories[token] = new_category
            changes.append(f"修改 {token} 类别为 {new_category}")

    # 添加新实体（需要重新脱敏原文本——但这里我们没有原文本，所以只更新映射）
    # 注意：add 操作需要原始文本才能正确替换，这里仅更新映射表
    for add_op in ops.get("add", []):
        value = add_op.get("value", "")
        category = add_op.get("category", "")
        if value and category:
            # 生成新令牌
            seq = store.registry_next_seq(category)
            leaf = category.rsplit("/", 1)[-1] if "/" in category else category
            token = f"[{leaf}_{seq}]"
            mapping[token] = value
            categories[token] = category
            store.registry_register(value, category, token)
            changes.append(f"添加 {token} = {value}")

    # 更新映射表（删除旧的，写入新的）
    with store._conn() as conn:
        conn.execute("DELETE FROM mappings WHERE trace_id = ?", (trace_id,))
        now = time.time()
        for token, original in mapping.items():
            category = categories.get(token, "unknown")
            encrypted = store._fernet.encrypt(original.encode())
            conn.execute(
                "INSERT INTO mappings VALUES (?, ?, ?, ?, ?, ?)",
                (trace_id, token, category, encrypted, now, now + store.ttl),
            )

    # 审计
    store.audit(trace_id, action="adjust_desensitization", case_id=trace_id.rsplit("-", 1)[0],
                detail=json.dumps(changes, ensure_ascii=False))

    # 返回校正后的实体列表
    entities = []
    for token, original in mapping.items():
        entities.append({
            "token": token,
            "original": original,
            "category": categories.get(token, ""),
        })

    return (
        f"校正完成，变更：{', '.join(changes)}\n\n"
        f"更新后的实体列表：\n"
        f"{json.dumps(entities, ensure_ascii=False, indent=2)}"
    )


async def restore_result(
    trace_id: str,
    text: str,
    *,
    store: MappingStore | None = None,
) -> str:
    """反脱敏：将外部智能体分析结果中的令牌还原为真实 PII。

    流程：
      1. 从映射表加载令牌↔原文
      2. 反脱敏替换
      3. 写入审计日志
      4. 返回还原后的文本
    """
    store = store or _store

    # 1. 加载映射表
    restored_mapping = store.load(trace_id)
    if not restored_mapping:
        raise ValueError(f"trace_id 无效或已过期: {trace_id}")

    # 2. 反脱敏
    final_result = restore(text, restored_mapping)

    # 3. 审计
    store.audit(trace_id, action="restore_result", case_id=trace_id.rsplit("-", 1)[0], detail="反脱敏还原")

    return final_result


async def query_case_by_id(case_id: str) -> str:
    """从案件系统查案件，返回结构化 JSON（text + parties + addresses）。

    优先从数据库拉取（需配置 CASE_DB_URL 环境变量），
    未配置或查询失败时回退到 mock 数据。

    WorkBuddy 拿到结果后，调 desensitize_text(text, known_names=parties, known_addresses=addresses) 脱敏。
    """
    from case_db import fetch_case_from_db
    case = fetch_case_from_db(case_id)
    if case is None:
        # 回退到 mock
        mock = await fetch_case(case_id)
        case = {
            "case_id": case_id,
            "text": format_case(mock),
            "parties": mock.get("parties", []),
            "addresses": mock.get("addresses", []),
        }
    return json.dumps(case, ensure_ascii=False, indent=2)


async def save_report(case_id: str, content: str, fmt: str = "docx") -> str:
    """生成分析报告文件，返回文件路径。

    case_id: 案件 ID（用于文件名）
    content: 报告内容（反脱敏后的最终文本）
    fmt: 'docx' 或 'md'，默认 docx
    """
    from report_writer import save_report as _save
    path = _save(case_id, content, fmt)
    return f"报告已生成: {path}"