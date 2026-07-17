"""案件系统数据库适配器。

从真实案件系统拉取案件数据。表结构映射通过环境变量配置，
未配置 CASE_DB_URL 时回退到 mock 数据（case_source.py）。

支持多字段合并：CASE_DB_PARTIES_FIELDS / CASE_DB_ADDRESSES_FIELDS
可配置逗号分隔的多个字段，合并为 parties/addresses 列表。
例如：CASE_DB_PARTIES_FIELDS="applicant_name,respondent_name"

配置项见 config.py 的 CASE_DB_* 系列。
"""

import json
from typing import Optional

from config import settings


def _split_fields(setting_value: str) -> list[str]:
    """将逗号分隔的字段配置拆分为字段列表。"""
    return [f.strip() for f in setting_value.split(",") if f.strip()]


def fetch_case_from_db(case_id: str) -> Optional[dict]:
    """从数据库查案件，返回 {case_id, text, parties, addresses}。

    按 ID 字段查询，若未找到则按 case_number 字段尝试。
    未配置 CASE_DB_URL 或查询失败时返回 None（调用方回退到 mock）。
    支持多字段合并：parties_fields 和 addresses_fields 可配置多个字段。
    """
    if not settings.CASE_DB_URL:
        return None

    try:
        import sqlalchemy as sa
    except ImportError:
        return None

    try:
        engine = sa.create_engine(settings.CASE_DB_URL)
        text_fields = _split_fields(settings.CASE_DB_TEXT_FIELDS)
        parties_fields = _split_fields(settings.CASE_DB_PARTIES_FIELDS)
        addresses_fields = _split_fields(settings.CASE_DB_ADDRESSES_FIELDS)

        all_fields = text_fields + parties_fields + addresses_fields
        cols = ", ".join(all_fields)

        # 先按 ID 字段查询
        sql = sa.text(
            f"SELECT {cols} FROM {settings.CASE_DB_TABLE} "
            f"WHERE {settings.CASE_DB_ID_FIELD} = :cid LIMIT 1"
        )
        with engine.connect() as conn:
            row = conn.execute(sql, {"cid": case_id}).fetchone()

        # 没找到则按 case_number 查询（用户可能输入的是案号）
        if not row:
            sql_cn = sa.text(
                f"SELECT {cols} FROM {settings.CASE_DB_TABLE} "
                f"WHERE case_number = :cn LIMIT 1"
            )
            with engine.connect() as conn:
                try:
                    row = conn.execute(sql_cn, {"cn": case_id}).fetchone()
                except Exception:
                    pass  # case_number 列可能不存在，忽略
    except Exception as e:
        print(f"[case_db] 查询失败: {e}")
        return None

    if not row:
        return None

    # SQLAlchemy 2.0: 用 row._mapping 支持字符串键访问
    row_map = row._mapping

    # 合并文本字段
    text = "\n".join(str(row_map[f] or "") for f in text_fields)

    # 合并多字段为 parties 列表
    parties = []
    for f in parties_fields:
        parties.extend(_parse_list(row_map[f]))

    # 合并多字段为 addresses 列表
    addresses = []
    for f in addresses_fields:
        addresses.extend(_parse_list(row_map[f]))

    return {
        "case_id": case_id,
        "text": text,
        "parties": parties,
        "addresses": addresses,
    }


def list_case_ids_from_db() -> list:
    """列出数据库中的案件 ID（限制 100 条）。

    未配置或查询失败时返回空列表。
    """
    if not settings.CASE_DB_URL:
        return []

    try:
        import sqlalchemy as sa
    except ImportError:
        return []

    try:
        engine = sa.create_engine(settings.CASE_DB_URL)
        sql = sa.text(
            f"SELECT {settings.CASE_DB_ID_FIELD} FROM {settings.CASE_DB_TABLE} LIMIT 100"
        )
        with engine.connect() as conn:
            rows = conn.execute(sql).fetchall()
    except Exception as e:
        print(f"[case_db] 列出案件ID失败: {e}")
        return []

    return [str(r[0]) for r in rows]


def _parse_list(val) -> list:
    """解析字段为列表，支持 JSON 数组、逗号分隔字符串、或已是 list。"""
    if not val:
        return []
    if isinstance(val, (list, tuple)):
        return [str(v).strip() for v in val if v]
    val = str(val).strip()
    if not val:
        return []
    if val.startswith("["):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return [str(v).strip() for v in parsed if v]
        except json.JSONDecodeError:
            pass
    # 单个值（非逗号分隔）直接返回单元素列表
    if "," not in val:
        return [val]
    return [v.strip() for v in val.split(",") if v.strip()]