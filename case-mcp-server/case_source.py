"""案件数据源。

优先从案件数据库（case_db.fetch_case_from_db）拉取真实案件，
未配置 CASE_DB_URL 或查询失败时回退到 mock 数据。

接入真实系统时，替换 fetch_case / list_cases 的实现即可。
每个案件需提供 parties（人名列）、addresses（地址列）用于脱敏引擎的精确匹配。
"""

from case_db import fetch_case_from_db, list_case_ids_from_db

# Mock 数据（数据库未配置或案件不存在时回退使用）
SAMPLE_CASES = {
    "C2026-001": {
        "case_id": "C2026-001",
        "title": "张三诉李四买卖合同纠纷",
        "parties": ["张三", "李四"],
        "addresses": ["北京市朝阳区XX路1号"],
        "raw_text": (
            "原告 张三，身份证号 110105199001011234，"
            "联系电话 13800138000，住址 北京市朝阳区XX路1号。"
            "被告 李四，身份证号 11010719950303123X，"
            "联系电话 13912345678。"
            "原告诉称被告拖欠货款 50 万元，请求法院判令被告支付货款及违约金。"
        ),
    },
    "C2026-002": {
        "case_id": "C2026-002",
        "title": "王五劳动争议纠纷",
        "parties": ["王五"],
        "addresses": ["深圳市南山区XX科技园"],
        "raw_text": (
            "申请人 王五，身份证号 440301198807154321，"
            "联系电话 13700137000，邮箱 wangwu@example.com。"
            "住址 深圳市南山区XX科技园。"
            "申请人要求被申请人支付经济补偿金 30 万元。"
        ),
    },
}


async def fetch_case(case_id: str) -> dict:
    """按案件 ID 获取案件数据。

    优先从数据库拉取（需配置 CASE_DB_URL），失败时回退到 mock 数据。

    返回 dict:
      - case_id / raw_text / parties / addresses / title 等字段
    """
    # 1. 尝试从真实数据库拉取
    db_case = fetch_case_from_db(case_id)
    if db_case is not None:
        return {
            "case_id": db_case["case_id"],
            "title": db_case["parties"][0] if db_case["parties"] else case_id,
            "parties": db_case["parties"],
            "addresses": db_case["addresses"],
            "raw_text": db_case["text"],
        }

    # 2. 回退到 mock 数据
    if case_id not in SAMPLE_CASES:
        raise ValueError(f"案件不存在: {case_id}")
    return SAMPLE_CASES[case_id]


async def list_cases() -> list:
    """列出所有可用案件 ID（数据库 + mock 去重）。"""
    db_ids = list_case_ids_from_db()
    mock_ids = list(SAMPLE_CASES.keys())
    # 数据库优先，mock 补充
    seen = set()
    result = []
    for cid in db_ids + mock_ids:
        if cid not in seen:
            seen.add(cid)
            result.append(cid)
    return result


def format_case(case: dict) -> str:
    """将案件 dict 转为纯文本，供脱敏引擎和云端分析使用。"""
    return case.get("raw_text", "")