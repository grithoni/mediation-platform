"""加密映射表存储（SQLite + AES-Fernet）。

- 脱敏时写入令牌↔原文（原文 AES 加密）
- 反脱敏时读取令牌↔原文（解密）
- 支持 TTL 自动过期
- 审计日志记录每次读写操作
- 全局实体注册表：跨文档令牌一致性
"""

import os
import sqlite3
import time

from cryptography.fernet import Fernet

from config import settings


def _load_or_create_key() -> bytes:
    key_file = settings.MAPPING_KEY_FILE
    if os.path.exists(key_file):
        with open(key_file, "rb") as f:
            return f.read()
    key = Fernet.generate_key()
    os.makedirs(os.path.dirname(key_file), exist_ok=True)
    with open(key_file, "wb") as f:
        f.write(key)
    os.chmod(key_file, 0o600)
    return key


class MappingStore:
    """加密映射表：存 token → 原文，附 TTL + 审计。"""

    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or settings.MAPPING_DB_PATH
        self.ttl = settings.MAPPING_TTL_SECONDS
        self._fernet = Fernet(_load_or_create_key())
        self._init_db()

    def _conn(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._conn() as c:
            c.execute(
                """CREATE TABLE IF NOT EXISTS mappings (
                    trace_id TEXT,
                    token    TEXT,
                    category TEXT,
                    original BLOB,
                    created_at REAL,
                    expires_at REAL
                )"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS audit (
                    ts       REAL,
                    trace_id TEXT,
                    action   TEXT,
                    case_id  TEXT,
                    detail   TEXT
                )"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS entity_registry (
                    value    TEXT,
                    category TEXT,
                    token    TEXT,
                    created_at REAL,
                    UNIQUE(value, category)
                )"""
            )
            c.execute("CREATE INDEX IF NOT EXISTS idx_trace ON mappings(trace_id)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_registry_value ON entity_registry(value)")

    def save(self, case_id: str, mapping: dict[str, str], categories: dict[str, str] | None = None) -> str:
        """保存映射表，返回 trace_id。

        categories: 可选的 {token: 完整层级类别} 映射，用于存储三级语义标签。
        """
        trace_id = f"{case_id}-{int(time.time() * 1000)}"
        now = time.time()
        with self._conn() as conn:
            conn.execute("DELETE FROM mappings WHERE expires_at < ?", (now,))
            for token, original in mapping.items():
                # 优先使用传入的完整类别，否则从令牌提取叶级类别
                if categories and token in categories:
                    category = categories[token]
                else:
                    inner = token.strip("[]")
                    category = inner.rsplit("_", 1)[0] if "_" in inner else "unknown"
                encrypted = self._fernet.encrypt(original.encode())
                conn.execute(
                    "INSERT INTO mappings VALUES (?, ?, ?, ?, ?, ?)",
                    (trace_id, token, category, encrypted, now, now + self.ttl),
                )
        return trace_id

    def load(self, trace_id: str) -> dict[str, str]:
        """读取映射表（忽略已过期条目）。"""
        mapping = {}
        now = time.time()
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT token, original, expires_at FROM mappings WHERE trace_id = ?",
                (trace_id,),
            ).fetchall()
        for row in rows:
            if row["expires_at"] and now > row["expires_at"]:
                continue
            mapping[row["token"]] = self._fernet.decrypt(row["original"]).decode()
        return mapping

    def audit(self, trace_id: str, *, action: str = "", case_id: str = "", detail: str = ""):
        """写入审计日志。"""
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO audit VALUES (?, ?, ?, ?, ?)",
                (time.time(), trace_id, action, case_id, detail),
            )

    def cleanup_expired(self):
        """清理已过期的映射条目。"""
        with self._conn() as conn:
            conn.execute("DELETE FROM mappings WHERE expires_at < ?", (time.time(),))

    # ---- 全局实体注册表（跨文档令牌一致性） ----

    def registry_lookup(self, value: str) -> str | None:
        """查找全局实体注册表，按实体值返回已有令牌或 None（跨文档一致性基于实体值）。"""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT token FROM entity_registry WHERE value = ? LIMIT 1",
                (value,),
            ).fetchone()
        return row["token"] if row else None

    def registry_register(self, value: str, category: str, token: str) -> None:
        """注册新实体到全局注册表。"""
        with self._conn() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO entity_registry VALUES (?, ?, ?, ?)",
                (value, category, token, time.time()),
            )

    def registry_next_seq(self, category: str) -> int:
        """获取某类别的下一个全局序号（用于生成新令牌）。"""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM entity_registry WHERE category = ?",
                (category,),
            ).fetchone()
        return (row["cnt"] or 0) + 1
