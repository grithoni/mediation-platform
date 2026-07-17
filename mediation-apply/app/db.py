"""Database module — SQLite storage for mediation applications."""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── Paths ──────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "mediation.db"
UPLOADS_DIR = DATA_DIR / "uploads"

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _get_conn() -> sqlite3.Connection:
    """Get a SQLite connection with row factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    """Initialize the database schema."""
    conn = _get_conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS applications (
            id                  TEXT PRIMARY KEY,
            created_at          TEXT NOT NULL,
            status              TEXT DEFAULT 'submitted',
            case_number         TEXT,
            password            TEXT DEFAULT '123',

            -- 申请人 (Applicant)
            applicant_name          TEXT NOT NULL,
            applicant_address       TEXT,
            applicant_postal_code   TEXT,
            applicant_phone         TEXT,
            applicant_mobile        TEXT,
            applicant_fax           TEXT,
            applicant_email         TEXT,
            applicant_other_contact TEXT,

            -- 被申请人 (Respondent)
            respondent_name          TEXT NOT NULL,
            respondent_address       TEXT,
            respondent_postal_code   TEXT,
            respondent_phone         TEXT,
            respondent_mobile        TEXT,
            respondent_fax           TEXT,
            respondent_email         TEXT,
            respondent_other_contact TEXT,

            -- 调解意愿
            mediation_willingness TEXT NOT NULL,

            -- 案件信息
            case_facts         TEXT,
            dispute_matters    TEXT,
            mediation_demands  TEXT,
            demands_basis      TEXT,

            -- 证据材料
            evidence_files       TEXT,
            evidence_confidential INTEGER DEFAULT 0,

            -- 身份证明
            identity_files       TEXT,

            -- 代理人 (optional)
            has_agent            INTEGER DEFAULT 0,
            agent_name           TEXT,
            agent_duties         TEXT,
            authorization_files  TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_applications_created_at
            ON applications(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_applications_status
            ON applications(status);
        """
    )
    # Add new columns if table already exists (migration)
    existing_cols = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(applications)").fetchall()
    }
    if "case_number" not in existing_cols:
        conn.execute("ALTER TABLE applications ADD COLUMN case_number TEXT")
    # Ensure index exists (new table or migration)
    try:
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_case_number "
            "ON applications(case_number) WHERE case_number IS NOT NULL"
        )
    except sqlite3.OperationalError:
        pass  # column may not exist yet on very old schema — migration below handles it
    if "password" not in existing_cols:
        conn.execute("ALTER TABLE applications ADD COLUMN password TEXT DEFAULT '123'")
    conn.commit()
    conn.close()


def _next_case_number(conn: sqlite3.Connection) -> str:
    """Generate the next case number in format YYYY-N (e.g. 2026-1, 2026-2)."""
    year = datetime.now().year
    prefix = f"{year}-"
    row = conn.execute(
        "SELECT case_number FROM applications "
        "WHERE case_number LIKE ? "
        "ORDER BY CAST(SUBSTR(case_number, ?) AS INTEGER) DESC LIMIT 1",
        (f"{prefix}%", len(prefix) + 1),
    ).fetchone()
    if row and row["case_number"]:
        last_seq = int(row["case_number"].split("-", 1)[1])
        return f"{prefix}{last_seq + 1}"
    return f"{prefix}1"


def save_application(record: dict[str, Any]) -> dict[str, str]:
    """Insert a new application record and return {id, case_number, password}."""
    app_id = record.get("id") or uuid.uuid4().hex[:12]
    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    password = "123"

    conn = _get_conn()
    case_number = _next_case_number(conn)

    conn.execute(
        """
        INSERT INTO applications (
            id, created_at, status, case_number, password,
            applicant_name, applicant_address, applicant_postal_code,
            applicant_phone, applicant_mobile, applicant_fax,
            applicant_email, applicant_other_contact,
            respondent_name, respondent_address, respondent_postal_code,
            respondent_phone, respondent_mobile, respondent_fax,
            respondent_email, respondent_other_contact,
            mediation_willingness,
            case_facts, dispute_matters, mediation_demands, demands_basis,
            evidence_files, evidence_confidential,
            identity_files,
            has_agent, agent_name, agent_duties, authorization_files
        ) VALUES (
            :id, :created_at, :status, :case_number, :password,
            :applicant_name, :applicant_address, :applicant_postal_code,
            :applicant_phone, :applicant_mobile, :applicant_fax,
            :applicant_email, :applicant_other_contact,
            :respondent_name, :respondent_address, :respondent_postal_code,
            :respondent_phone, :respondent_mobile, :respondent_fax,
            :respondent_email, :respondent_other_contact,
            :mediation_willingness,
            :case_facts, :dispute_matters, :mediation_demands, :demands_basis,
            :evidence_files, :evidence_confidential,
            :identity_files,
            :has_agent, :agent_name, :agent_duties, :authorization_files
        )
        """,
        {
            **record,
            "id": app_id,
            "created_at": created_at,
            "status": record.get("status", "submitted"),
            "case_number": case_number,
            "password": password,
            "evidence_files": json.dumps(record.get("evidence_files", []), ensure_ascii=False),
            "identity_files": json.dumps(record.get("identity_files", []), ensure_ascii=False),
            "authorization_files": json.dumps(record.get("authorization_files", []), ensure_ascii=False),
            "evidence_confidential": 1 if record.get("evidence_confidential") else 0,
            "has_agent": 1 if record.get("has_agent") else 0,
        },
    )
    conn.commit()
    conn.close()
    return {"id": app_id, "case_number": case_number, "password": password}


def list_applications(limit: int = 50) -> list[dict]:
    """List recent applications (newest first)."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM applications ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_application(app_id: str) -> dict | None:
    """Get a single application by ID."""
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM applications WHERE id = ?", (app_id,)
    ).fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


def get_application_by_case_number(case_number: str) -> dict | None:
    """Get a single application by case number (e.g. '2026-1')."""
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM applications WHERE case_number = ?", (case_number,)
    ).fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


def _row_to_dict(row: sqlite3.Row) -> dict:
    """Convert a database row to a dict, parsing JSON fields."""
    d = dict(row)
    for key in ("evidence_files", "identity_files", "authorization_files"):
        if d.get(key):
            try:
                d[key] = json.loads(d[key])
            except (json.JSONDecodeError, TypeError):
                d[key] = []
        else:
            d[key] = []
    for key in ("evidence_confidential", "has_agent"):
        d[key] = bool(d.get(key, 0))
    return d