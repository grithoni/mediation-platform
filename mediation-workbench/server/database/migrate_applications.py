"""Incremental migration for 方案C: add documents.category + case_applications table.

Safe to re-run (IF NOT EXISTS / column check). Does NOT drop data.
Usage: python3 server/database/migrate_applications.py
"""
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', '.data', 'mediation.db')

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# 1) documents.category
cols = [r[1] for r in cur.execute("PRAGMA table_info(documents)")]
if 'category' not in cols:
    cur.execute("ALTER TABLE documents ADD COLUMN category TEXT DEFAULT 'application'")
    print('[migrate] documents.category added')
else:
    print('[migrate] documents.category already exists')

# 2) case_applications table
cur.execute("""
CREATE TABLE IF NOT EXISTS case_applications (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  applicant_name TEXT,
  applicant_address TEXT,
  applicant_postal_code TEXT,
  applicant_phone TEXT,
  applicant_mobile TEXT,
  applicant_fax TEXT,
  applicant_email TEXT,
  applicant_other_contact TEXT,
  respondent_name TEXT,
  respondent_address TEXT,
  respondent_postal_code TEXT,
  respondent_phone TEXT,
  respondent_mobile TEXT,
  respondent_fax TEXT,
  respondent_email TEXT,
  respondent_other_contact TEXT,
  mediation_willingness TEXT,
  case_facts TEXT,
  dispute_matters TEXT,
  mediation_demands TEXT,
  demands_basis TEXT,
  evidence_confidential INTEGER DEFAULT 0,
  has_agent INTEGER DEFAULT 0,
  agent_name TEXT,
  agent_duties TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
""")
print('[migrate] case_applications ensured')

# verify
tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")]
print(f'[migrate] tables: {len(tables)}')
conn.commit()
conn.close()
print('[migrate] done')
