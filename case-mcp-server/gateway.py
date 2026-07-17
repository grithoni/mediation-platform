"""脱敏网关。

职责：
  1. 出域前 PII 兜底扫描（最后一道闸）
  2. 请求/响应可追加审计日志
"""

import re
from typing import Iterable

from redactor import _PATTERNS

_PII_RESIDUAL_PATTERNS = [p for _, p in _PATTERNS]


def scan_for_residual_pii(
    text: str,
    *,
    known_names: Iterable[str] | None = None,
    known_addresses: Iterable[str] | None = None,
) -> list[str]:
    """扫描文本中是否残留真实 PII（脱敏漏检检测）。"""
    found = []
    seen = set()

    for pattern in _PII_RESIDUAL_PATTERNS:
        for match in pattern.finditer(text):
            value = match.group()
            if value not in seen:
                found.append(value)
                seen.add(value)

    for name in known_names or []:
        if name and name in text and name not in seen:
            found.append(name)
            seen.add(name)

    for address in known_addresses or []:
        if address and address in text and address not in seen:
            found.append(address)
            seen.add(address)

    return found