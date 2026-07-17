"""本地脱敏 / 反脱敏引擎。

管线：
  1. 正则层：身份证 / 手机号 / 邮箱 / 银行卡 / 统一社会信用代码
  2. 精确匹配层：从案件 metadata 传入的 known_names / known_addresses
  3. 本地模型 NER 层（可选）：通过 Ollama 调用本地模型识别未知 PII
  4. 扩展点：ner_hook(text) -> [(start, end, value, category)]

每次脱敏返回：
  - 脱敏后的令牌文本
  - {令牌: 原始值} 映射表

所有令牌经由 MappingStore 加密存储；反脱敏时按令牌精确替换回原文。
"""

import json
import re
from typing import Callable, Iterable, Optional

import httpx
from config import settings

# 强格式 PII 正则（按匹配优先级排列）
_PATTERNS = [
    ("证件", re.compile(r"\b\d{17}[\dXx]\b")),                # 身份证号
    ("电话", re.compile(r"\b1[3-9]\d{9}\b")),                 # 手机号
    ("邮箱", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),  # 邮箱
    ("银行卡", re.compile(r"\b62\d{14,17}\b")),                 # 银联卡（62 开头）
    ("信用代码", re.compile(r"\b[0-9A-HJ-NPQRTUWXY]{18}\b")), # 统一社会信用代码
]

# 角色前缀 + 中文姓名
_NAME_AFTER_ROLE = re.compile(
    r"(原告|被告|申请人|被申请人|上诉人|被上诉人|"
    r"委托代理人|法定代表人|第三人|当事人)\s*([\u4e00-\u9fa5]{2,4})"
)

# 角色 → 三级语义标签
_ROLE_CATEGORY_MAP = {
    "原告": "姓名/当事人/原告",
    "被告": "姓名/当事人/被告",
    "申请人": "姓名/当事人/申请人",
    "被申请人": "姓名/当事人/被申请人",
    "上诉人": "姓名/当事人/上诉人",
    "被上诉人": "姓名/当事人/被上诉人",
    "委托代理人": "姓名/代理人/委托代理人",
    "法定代表人": "姓名/代理人/法定代表人",
    "第三人": "姓名/当事人/第三人",
    "当事人": "姓名/当事人",
}

# 令牌格式：使用类别叶级名称
_TOKEN_FMT = "[{leaf}_{seq}]"

# NER 回调签名：Callable[[str], list[tuple[int, int, str, str]]]
NerHook = Callable[[str], list[tuple[int, int, str, str]]]

# 本地模型可识别的 PII 类别映射
_NER_CATEGORY_MAP = {
    "姓名": "姓名",
    "人名": "姓名",
    "PERSON": "姓名",
    "地址": "地址",
    "LOCATION": "地址",
    "LOC": "地址",
    "组织": "组织",
    "机构": "组织",
    "ORG": "组织",
    "公司": "组织",
}


def create_ollama_ner_hook(
    base_url: str | None = None,
    model: str | None = None,
) -> NerHook:
    """创建一个使用本地模型进行 NER 的钩子。

    调用 OpenAI 兼容 /v1/chat/completions API（支持 Ollama / oMLX / vLLM / llama.cpp 等），
    让模型提取文本中的 PII 实体，返回 JSON 格式的实体列表，
    然后在原文中定位每个实体的位置，生成脱敏引擎所需的 (start, end, value, category) 列表。
    """
    base_url = (base_url or settings.NER_BASE_URL).rstrip("/")
    model = model or settings.NER_MODEL

    _NER_PROMPT = (
        "你是一个命名实体识别专家。请严格从以下文本中提取所有个人敏感信息实体。\n"
        "需要提取的类别及层级：\n"
        "- 姓名：进一步细分为 姓名/当事人/原告、姓名/当事人/被告、姓名/当事人/申请人 等\n"
        "- 地址：进一步细分为 地址/住所地、地址/经营地 等\n"
        "- 组织：进一步细分为 组织/公司、组织/机构 等\n"
        "请只返回 JSON 数组，每个元素包含 category 和 value 字段，"
        "不要返回任何其他内容。\n\n"
        "示例输出格式：\n"
        '[{"category": "姓名/当事人/原告", "value": "张三"}, '
        '{"category": "地址/住所地", "value": "北京市朝阳区XX路1号"}, '
        '{"category": "组织/公司", "value": "XX科技有限公司"}]\n\n'
        "如果文本中没有实体，返回空数组 []。\n\n"
        "文本：\n"
    )

    def ner_hook(text: str) -> list[tuple[int, int, str, str]]:
        if not model:
            return []

        headers = {"Content-Type": "application/json"}
        if settings.NER_API_KEY:
            headers["Authorization"] = f"Bearer {settings.NER_API_KEY}"

        try:
            resp = httpx.post(
                f"{base_url}/v1/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": _NER_PROMPT + text}],
                },
                timeout=60,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]

            # 提取 JSON 数组
            entities = _extract_json_array(content)
        except Exception:
            return []

        spans: list[tuple[int, int, str, str]] = []
        seen: set[tuple[int, int, str]] = set()

        for entity in entities:
            category = entity.get("category", "")
            value = entity.get("value", "")
            if not category or not value:
                continue

            # 映射到统一类别名
            unified = _NER_CATEGORY_MAP.get(category, category)

            # 在文本中定位实体
            for match in re.finditer(re.escape(value), text):
                key = (match.start(), match.end(), value)
                if key not in seen:
                    spans.append((match.start(), match.end(), value, unified))
                    seen.add(key)

        return spans

    return ner_hook


def _extract_json_array(text: str) -> list[dict]:
    """从模型输出中提取 JSON 数组。容错处理：提取第一个 [...] 块。"""
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        return []
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return []


def _leaf_category(category: str) -> str:
    """提取类别叶级名称，如 '姓名/当事人/原告' → '原告'。"""
    return category.rsplit("/", 1)[-1] if "/" in category else category


def desensitize(
    text: str,
    known_names: Optional[Iterable[str]] = None,
    known_addresses: Optional[Iterable[str]] = None,
    ner_hook: Optional[NerHook] = None,
    use_local_ner: bool = True,
    store=None,
) -> tuple[str, dict[str, str], dict[str, str]]:
    """对文本脱敏。

    返回 (masked_text, mapping, categories)，其中：
      - mapping = {token: original_value}
      - categories = {token: full_hierarchical_category}

    同一原始值在同一文本内始终映射为同一令牌。
    传入 store 时启用跨文档令牌一致性（同一实体跨文档复用同一令牌）。

    use_local_ner: 是否启用本地模型 NER（需要配置 NER_MODEL 环境变量）。
    """
    # 自动启用本地模型 NER
    if use_local_ner and ner_hook is None and settings.NER_MODEL:
        ner_hook = create_ollama_ner_hook()

    if ner_hook is None:
        ner_hook = _NOOP_NER

    # 收集所有 (start, end, value, category) 替换点
    spans: list[tuple[int, int, str, str]] = []

    # 1. 正则层
    for category, pattern in _PATTERNS:
        for match in pattern.finditer(text):
            spans.append((match.start(), match.end(), match.group(), category))

    # 2. 已知姓名（精确匹配）
    for name in (known_names or []):
        for match in re.finditer(re.escape(name), text):
            spans.append((match.start(), match.end(), name, "姓名"))

    # 3. 已知地址（精确匹配）
    for address in (known_addresses or []):
        for match in re.finditer(re.escape(address), text):
            spans.append((match.start(), match.end(), address, "地址"))

    # 4. 角色前缀姓名（生成三级语义标签）
    for match in _NAME_AFTER_ROLE.finditer(text):
        role = match.group(1)
        name = match.group(2)
        category = _ROLE_CATEGORY_MAP.get(role, "姓名")
        spans.append((match.start(2), match.end(2), name, category))

    # 5. 外部 NER 扩展点
    for start, end, value, category in ner_hook(text):
        spans.append((start, end, value, category))

    # 去重：按起始位置升序、跨度降序→保留第一个，跳过重叠
    spans.sort(key=lambda s: (s[0], -(s[1] - s[0])))
    chosen: list[tuple[int, int, str, str]] = []
    last_end = -1
    for start, end, value, category in spans:
        if start >= last_end:
            chosen.append((start, end, value, category))
            last_end = end

    # 从后往前替换（避免位置偏移）
    value_to_token: dict[str, str] = {}
    mapping: dict[str, str] = {}
    categories: dict[str, str] = {}
    local_counter: dict[str, int] = {}

    for start, end, value, category in sorted(chosen, key=lambda s: -s[0]):
        if value in value_to_token:
            token = value_to_token[value]
        else:
            # 跨文档一致性：先查全局注册表（按实体值查找）
            if store is not None:
                existing = store.registry_lookup(value)
                if existing:
                    token = existing
                else:
                    seq = store.registry_next_seq(category)
                    token = _TOKEN_FMT.format(leaf=_leaf_category(category), seq=seq)
                    store.registry_register(value, category, token)
            else:
                # 无全局注册表，用局部计数器
                local_counter[category] = local_counter.get(category, 0) + 1
                token = _TOKEN_FMT.format(leaf=_leaf_category(category), seq=local_counter[category])

            value_to_token[value] = token
            mapping[token] = value
            categories[token] = category

        text = text[:start] + token + text[end:]

    return text, mapping, categories


def restore(text: str, mapping: dict[str, str]) -> str:
    """反脱敏：将文本中的令牌替换回原文。

    按令牌长度降序替换，避免短令牌误匹配长令牌。
    """
    for token, original in sorted(mapping.items(), key=lambda x: len(x[0]), reverse=True):
        text = re.sub(re.escape(token), original, text)
    return text


def _NOOP_NER(_text: str) -> list[tuple[int, int, str, str]]:
    return []
