"""配置：所有敏感参数通过环境变量注入。"""
import os


class _Settings:
    # 映射表
    MAPPING_DB_PATH = os.getenv("MAPPING_DB_PATH", "data/mapping.db")
    MAPPING_KEY_FILE = os.getenv("MAPPING_KEY_FILE", "data/.master_key")
    MAPPING_TTL_SECONDS = int(os.getenv("MAPPING_TTL_SECONDS", "7200"))  # 默认 2 小时

    # 本地 NER 模型（用于脱敏阶段识别未知 PII；不配置时仅用正则+精确匹配）
    NER_BASE_URL = os.getenv("NER_BASE_URL", "http://localhost:11434")
    NER_MODEL = os.getenv("NER_MODEL", "")
    NER_API_KEY = os.getenv("NER_API_KEY", "")

    # 案件系统数据库（未配置时回退到 mock 数据）
    CASE_DB_URL = os.getenv("CASE_DB_URL", "")  # 如 sqlite:///path/to/mediation.db
    CASE_DB_TABLE = os.getenv("CASE_DB_TABLE", "cases")
    CASE_DB_ID_FIELD = os.getenv("CASE_DB_ID_FIELD", "case_id")
    CASE_DB_TEXT_FIELDS = os.getenv("CASE_DB_TEXT_FIELDS", "title,content")
    # 支持多字段（逗号分隔），合并为 parties/addresses 列表
    CASE_DB_PARTIES_FIELDS = os.getenv("CASE_DB_PARTIES_FIELDS", os.getenv("CASE_DB_PARTIES_FIELD", "parties"))
    CASE_DB_ADDRESSES_FIELDS = os.getenv("CASE_DB_ADDRESSES_FIELDS", os.getenv("CASE_DB_ADDRESSES_FIELD", "addresses"))
    # 兼容旧单字段配置
    CASE_DB_PARTIES_FIELD = os.getenv("CASE_DB_PARTIES_FIELD", "")
    CASE_DB_ADDRESSES_FIELD = os.getenv("CASE_DB_ADDRESSES_FIELD", "")

    # 报告输出目录
    REPORT_DIR = os.getenv("REPORT_DIR", "reports")


settings = _Settings()
