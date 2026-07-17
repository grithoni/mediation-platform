"""Mediation Application Service — FastAPI server for material upload.

Port: 3006
Endpoints:
  POST   /api/mediation/apply   — submit application with files
  GET    /api/mediation/applications — list recent (admin/debug)
  GET    /api/mediation/applications/{id} — get one
  GET    /health               — health check
"""
from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, StreamingResponse

from . import db
from .db import UPLOADS_DIR


# ── .env loader (no python-dotenv dependency) ───────────────
def _load_env():
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v

_load_env()

# ── Config ──────────────────────────────────────────────────
PORT = 3006
ALLOWED_ORIGINS = [
    "http://localhost:4321",
    "http://127.0.0.1:4321",
]

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB per file
ALLOWED_EXTENSIONS = {
    # documents
    ".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt",
    # images
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff",
    # archives
    ".zip", ".rar", ".7z",
    # spreadsheets
    ".xls", ".xlsx", ".csv",
    # other
    ".md",
}

app = FastAPI(title="Mediation Application Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ─────────────────────────────────────────────────
def _validate_file(upload: UploadFile) -> None:
    """Validate file size and extension."""
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"不支持的文件类型: {suffix or '(无扩展名)'}。"
                   f"支持: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    # size check via seek
    upload.file.seek(0, 2)
    size = upload.file.tell()
    upload.file.seek(0)
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"文件 {upload.filename} 超过 50MB 限制",
        )


async def _save_files(
    files: list[UploadFile],
    app_id: str,
    subdir: str,
) -> list[str]:
    """Save uploaded files to uploads/{app_id}/{subdir}/ and return relative paths."""
    if not files:
        return []

    dest_dir = UPLOADS_DIR / app_id / subdir
    dest_dir.mkdir(parents=True, exist_ok=True)

    saved: list[str] = []
    for f in files:
        if not f.filename:
            continue
        _validate_file(f)
        # unique filename to avoid collisions
        safe_name = f.filename.replace("/", "_").replace("\\", "_")
        unique = f"{uuid.uuid4().hex[:8]}_{safe_name}"
        rel_path = f"{app_id}/{subdir}/{unique}"
        abs_path = UPLOADS_DIR / rel_path
        with open(abs_path, "wb") as out:
            shutil.copyfileobj(f.file, out)
        saved.append(rel_path)
    return saved


# ── Routes ──────────────────────────────────────────────────
@app.on_event("startup")
def _startup():
    db.init_db()
    print(f"[Mediation] DB ready at {db.DB_PATH}")
    print(f"[Mediation] Uploads dir: {UPLOADS_DIR}")


@app.get("/health")
def health():
    return {"status": "ok", "service": "mediation-apply", "port": PORT}


@app.post("/api/mediation/apply")
async def submit_application(
    # ── 申请人 ──
    applicant_name: str = Form(...),
    applicant_address: str = Form(""),
    applicant_postal_code: str = Form(""),
    applicant_phone: str = Form(""),
    applicant_mobile: str = Form(""),
    applicant_fax: str = Form(""),
    applicant_email: str = Form(""),
    applicant_other_contact: str = Form(""),
    # ── 被申请人 ──
    respondent_name: str = Form(...),
    respondent_address: str = Form(""),
    respondent_postal_code: str = Form(""),
    respondent_phone: str = Form(""),
    respondent_mobile: str = Form(""),
    respondent_fax: str = Form(""),
    respondent_email: str = Form(""),
    respondent_other_contact: str = Form(""),
    # ── 调解意愿 ──
    mediation_willingness: str = Form(...),  # 'mutual' | 'single_party'
    # ── 案件信息 ──
    case_facts: str = Form(""),
    dispute_matters: str = Form(""),
    mediation_demands: str = Form(""),
    demands_basis: str = Form(""),
    # ── 证据材料 ──
    evidence_confidential: str = Form("false"),
    evidence_files: list[UploadFile] = File(default=[]),
    # ── 身份证明 ──
    identity_files: list[UploadFile] = File(default=[]),
    # ── 代理人 (optional) ──
    has_agent: str = Form("false"),
    agent_name: str = Form(""),
    agent_duties: str = Form(""),
    authorization_files: list[UploadFile] = File(default=[]),
):
    """Submit a mediation application with materials."""
    if mediation_willingness not in ("mutual", "single_party"):
        raise HTTPException(400, "调解意愿值无效，应为 mutual 或 single_party")

    app_id = uuid.uuid4().hex[:12]

    # Save files
    evidence_paths = await _save_files(evidence_files, app_id, "evidence")
    identity_paths = await _save_files(identity_files, app_id, "identity")
    auth_paths = await _save_files(authorization_files, app_id, "authorization")

    record = {
        "applicant_name": applicant_name,
        "applicant_address": applicant_address,
        "applicant_postal_code": applicant_postal_code,
        "applicant_phone": applicant_phone,
        "applicant_mobile": applicant_mobile,
        "applicant_fax": applicant_fax,
        "applicant_email": applicant_email,
        "applicant_other_contact": applicant_other_contact,
        "respondent_name": respondent_name,
        "respondent_address": respondent_address,
        "respondent_postal_code": respondent_postal_code,
        "respondent_phone": respondent_phone,
        "respondent_mobile": respondent_mobile,
        "respondent_fax": respondent_fax,
        "respondent_email": respondent_email,
        "respondent_other_contact": respondent_other_contact,
        "mediation_willingness": mediation_willingness,
        "case_facts": case_facts,
        "dispute_matters": dispute_matters,
        "mediation_demands": mediation_demands,
        "demands_basis": demands_basis,
        "evidence_files": evidence_paths,
        "evidence_confidential": evidence_confidential.lower() in ("true", "1", "yes"),
        "identity_files": identity_paths,
        "has_agent": has_agent.lower() in ("true", "1", "yes"),
        "agent_name": agent_name,
        "agent_duties": agent_duties,
        "authorization_files": auth_paths,
    }

    saved_result = db.save_application(record)

    return JSONResponse(
        status_code=201,
        content={
            "success": True,
            "id": saved_result["id"],
            "case_number": saved_result.get("case_number", ""),
            "password": saved_result.get("password", ""),
            "message": "调解申请已提交，我院将在3个工作日内与您联系。",
            "files": {
                "evidence": len(evidence_paths),
                "identity": len(identity_paths),
                "authorization": len(auth_paths),
            },
        },
    )


@app.get("/api/mediation/applications")
def list_apps(limit: int = 50):
    """List recent applications (admin/debug)."""
    return {"applications": db.list_applications(limit)}


@app.get("/api/mediation/case-by-number/{case_number}")
def get_case_by_number(case_number: str):
    """Get an application by case number (e.g. '2026-1')."""
    result = db.get_application_by_case_number(case_number.strip())
    if not result:
        raise HTTPException(404, f"案号 {case_number} 未找到")
    return result


@app.get("/api/mediation/applications/{app_id}")
def get_app(app_id: str):
    """Get a single application."""
    result = db.get_application(app_id)
    if not result:
        raise HTTPException(404, "申请不存在")
    return result


# ── OCR & autofill ─────────────────────────────────────────
@app.post("/api/mediation/ocr")
async def ocr_application_form(file: UploadFile = File(...)):
    """Upload a mediation application form (PDF/Word/Image), extract text via OCR,
    then use DeepSeek to extract structured fields for form autofill.

    Returns: { success, method, used_ocr, text_length, fields: {...} }
    """
    from . import ocr as ocr_mod

    # Validate file
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, f"不支持的文件类型: {suffix}")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(400, "文件为空")

    # Step 1: extract text
    text, method, used_ocr = ocr_mod.extract_text(file.filename or "", file_bytes)

    if not text.strip():
        return JSONResponse(status_code=422, content={
            "success": False,
            "error": "未能从文件中提取文本。若是扫描件请确保图片清晰，或检查 OCR 依赖是否已安装。",
            "method": method,
            "used_ocr": used_ocr,
        })

    # Step 2: LLM structured extraction
    fields = ocr_mod.extract_fields_with_llm(text)

    if "error" in fields:
        return JSONResponse(status_code=502, content={
            "success": False,
            "error": fields["error"],
            "method": method,
            "used_ocr": used_ocr,
            "text_length": len(text),
            "extracted_text": text[:2000],  # preview for debugging
        })

    return {
        "success": True,
        "method": method,
        "used_ocr": used_ocr,
        "text_length": len(text),
        "fields": fields,
    }


# ── Admin UI ────────────────────────────────────────────────
_ADMIN_HTML = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>案件管理 - 珠江国际商事调解院</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 text-gray-900 font-sans antialiased">
<div class="max-w-7xl mx-auto px-4 py-6">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">案件管理</h1>
      <p class="text-sm text-gray-500 mt-1">珠江国际商事调解院 · mediation-apply</p>
    </div>
    <div class="flex gap-2">
      <button onclick="loadData()" class="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">⟳ 刷新</button>
      <a href="/docs" class="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">API 文档</a>
    </div>
  </div>

  <div id="stats" class="grid grid-cols-3 gap-4 mb-6"></div>

  <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-gray-50 border-b border-gray-200">
          <th class="text-left px-4 py-3 font-semibold text-gray-600">案号</th>
          <th class="text-left px-4 py-3 font-semibold text-gray-600">申请人</th>
          <th class="text-left px-4 py-3 font-semibold text-gray-600">被申请人</th>
          <th class="text-left px-4 py-3 font-semibold text-gray-600">调解意愿</th>
          <th class="text-left px-4 py-3 font-semibold text-gray-600">状态</th>
          <th class="text-left px-4 py-3 font-semibold text-gray-600">提交时间</th>
          <th class="text-left px-4 py-3 font-semibold text-gray-600">操作</th>
        </tr>
      </thead>
      <tbody id="tbody" class="divide-y divide-gray-100"></tbody>
    </table>
    <div id="empty" class="hidden text-center py-16 text-gray-400">
      <div class="text-4xl mb-2">📋</div>
      <p>暂无案件</p>
      <p class="text-xs mt-1">下一个案号将自动生成为 2026-1</p>
    </div>
  </div>

  <!-- Detail modal -->
  <div id="modal" class="fixed inset-0 bg-black/40 flex items-center justify-center hidden z-50" onclick="if(event.target===this)closeModal()">
    <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto mx-4 shadow-2xl">
      <div class="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <h2 class="text-lg font-bold" id="modalTitle">案件详情</h2>
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>
      <div id="modalBody" class="p-6 space-y-4 text-sm"></div>
    </div>
  </div>
</div>
<script>
const BASE = '/api/mediation';
async function loadData() {
  const res = await fetch(BASE+'/applications');
  const data = await res.json();
  const apps = data.applications || [];
  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty');
  tbody.innerHTML = '';
  if (apps.length===0) { empty.classList.remove('hidden'); document.getElementById('stats').innerHTML=''; return; }
  empty.classList.add('hidden');
  document.getElementById('stats').innerHTML=`
    <div class="bg-white rounded-xl border border-gray-200 p-4 text-center"><div class="text-2xl font-bold">${apps.length}</div><div class="text-xs text-gray-500 mt-1">总案件</div></div>
    <div class="bg-white rounded-xl border border-gray-200 p-4 text-center"><div class="text-2xl font-bold">${apps.filter(a=>a.status==='pending'||!a.status).length}</div><div class="text-xs text-gray-500 mt-1">待处理</div></div>
    <div class="bg-white rounded-xl border border-gray-200 p-4 text-center"><div class="text-2xl font-bold text-amber-600">${apps.filter(a=>a.case_number).length}</div><div class="text-xs text-gray-500 mt-1">已编号</div></div>
  `;
  for (const a of apps) {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50 transition';
    const w = ({'mutual':'双方自愿','single_party':'单方请求'})[a.mediation_willingness]||a.mediation_willingness||'-';
    const t = a.created_at ? new Date(a.created_at).toLocaleString('zh-CN') : '-';
    tr.innerHTML = `
      <td class="px-4 py-3 font-mono text-xs ${a.case_number?'text-amber-700 font-bold':'text-gray-400'}">${a.case_number||'(未编号)'}</td>
      <td class="px-4 py-3">${esc(a.applicant_name)||'-'}</td>
      <td class="px-4 py-3">${esc(a.respondent_name)||'-'}</td>
      <td class="px-4 py-3">${w}</td>
      <td class="px-4 py-3"><span class="inline-block px-2 py-0.5 rounded-full text-xs ${a.status==='pending'||!a.status?'bg-amber-50 text-amber-700':'bg-green-50 text-green-700'}">${a.status||'待处理'}</span></td>
      <td class="px-4 py-3 text-gray-500 text-xs">${t}</td>
      <td class="px-4 py-3"><button onclick="viewDetail('${a.id}')" class="text-blue-600 hover:text-blue-800 text-xs font-medium">详情</button></td>
    `;
    tbody.appendChild(tr);
  }
}
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
async function viewDetail(id){
  const res = await fetch(BASE+'/applications/'+id);
  const a = await res.json();
  document.getElementById('modalTitle').textContent = '案件 '+(a.case_number||id.slice(0,8));
  const fields = [
    ['案件编号', a.case_number||'(未编号)'],
    ['申请人', a.applicant_name],['申请人地址', a.applicant_address],['申请人邮编', a.applicant_postal_code],
    ['申请人电话', a.applicant_phone],['申请人手机', a.applicant_mobile],
    ['申请人邮箱', a.applicant_email],
    ['被申请人', a.respondent_name],['被申请人地址', a.respondent_address],['被申请人邮编', a.respondent_postal_code],
    ['被申请人电话', a.respondent_phone],['被申请人手机', a.respondent_mobile],
    ['被申请人邮箱', a.respondent_email],
    ['调解意愿', ({'mutual':'双方自愿','single_party':'单方请求'})[a.mediation_willingness]||a.mediation_willingness],
    ['案件事实', a.case_facts],['争议事项', a.dispute_matters],['调解诉求', a.mediation_demands],['理据', a.demands_basis],
    ['代理人', a.agent_name],['代理人职责', a.agent_duties],
    ['证据保密', a.evidence_confidential?'是':'否'],
    ['创建时间', a.created_at?new Date(a.created_at).toLocaleString('zh-CN'):'-'],
    ['状态', a.status||'待处理'],
  ];
  document.getElementById('modalBody').innerHTML = fields.map(([k,v])=>`
    <div class="flex gap-4 ${!v?'text-gray-300':''}"><div class="w-24 shrink-0 text-gray-500 font-medium">${k}</div><div class="flex-1 whitespace-pre-wrap">${esc(v)||'-'}</div></div>
  `).join('');
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal(){document.getElementById('modal').classList.add('hidden');}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
loadData();
</script>
</body>
</html>"""


@app.get("/admin", response_class=HTMLResponse)
def admin_page():
    return _ADMIN_HTML


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=PORT,
        reload=True,
    )