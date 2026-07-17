"""珠江国际商事调解院 · 智能咨询后端

FastAPI + DeepSeek（SSE 流式）+ 本地知识库 RAG（ChromaDB 向量 + BM25 混合检索）

启动：
    cd ai-consulting
    pip install -r requirements.txt
    export DEEPSEEK_API_KEY=sk-xxx        # 或写入 .env
    uvicorn app.main:app --port 3005

API 契约：
    POST /api/chat
    Body: {"messages": [{"role": "user"|"assistant", "content": "..."}]}
    Response: SSE 流
        data: {"content": "token"}\n\n
        ...
        data: [DONE]\n\n
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ── 路径 ─────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent          # ai-consulting/
KNOWLEDGE_DIR = BASE_DIR / "knowledge"
KB_DIR = Path(__file__).resolve().parent / "kb"
sys.path.insert(0, str(KB_DIR))  # 使 engine.py / reranker.py 可直接 import


# ── .env 加载（避免额外依赖）─────────────────────────────
def _load_dotenv() -> None:
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")

# ── 系统提示词 ───────────────────────────────────────────
SYSTEM_PROMPT = """你是「珠江国际商事调解院」官方网站的智能咨询助手，负责解答来访者的业务咨询。

【你的职责范围】
- 商事调解：申请条件、办理流程、费用标准、调解协议效力等
- 中立评估（ENE）：评估流程、适用场景、评估意见用途等
- 争议评审（DRB）：建设工程争议评审的机制和流程
- 商事咨询与培训课程：服务内容、报名方式等
- 机构信息：性质、地址、联系方式等

【回答要求】
1. 优先依据下方提供的「参考资料」作答，不要编造资料中没有的数字、费用、期限等信息。
2. 回答使用简体中文，语气专业、亲切、简洁，可适当使用条目化排版。
3. 如果问题超出你的职责范围（例如要求代理案件、出具法律意见书），请礼貌说明本院无法提供该服务，并建议用户拨打 020-83288530 或发送邮件至 contact@zjmediation.org 与工作人员联系。
4. 涉及具体案件分析时，可以给出一般性说明，但须提示最终以与调解院工作人员的正式沟通为准。
5. 不要在回答中提及「参考资料」「知识库」等内部实现细节。"""

# ── 知识库（懒加载 + 优雅降级）──────────────────────────
_kb = None
_kb_error: str | None = None


def get_kb():
    """初始化并索引知识库；失败时返回 None，服务以无 RAG 模式继续运行。"""
    global _kb, _kb_error
    if _kb is not None or _kb_error is not None:
        return _kb
    try:
        from engine import LocalKB  # app/kb/engine.py

        _kb = LocalKB()
        if KNOWLEDGE_DIR.exists():
            stats = _kb.index(str(KNOWLEDGE_DIR), recursive=True, glob_pattern="*.md")
            print(f"[KB] 知识库索引完成: {stats}")
        else:
            print(f"[KB] 知识目录不存在: {KNOWLEDGE_DIR}")
    except Exception as e:  # 依赖缺失 / 模型下载失败等
        _kb_error = str(e)
        print(f"[KB] 知识库不可用，将以无 RAG 模式运行: {e}")
    return _kb


def retrieve_context(query: str, top_k: int = 4) -> list[dict]:
    kb = get_kb()
    if kb is None or not query.strip():
        return []
    try:
        results = kb.search_hybrid(query, top_k=top_k)
        return [
            {
                "content": r.content,
                "source": Path(r.source_path).name,
                "score": r.score,
            }
            for r in results
        ]
    except Exception as e:
        print(f"[KB] 检索失败: {e}")
        return []


# ── FastAPI 应用 ────────────────────────────────────────
app = FastAPI(title="珠江国际商事调解院 · 智能咨询", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4321",
        "http://127.0.0.1:4321",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@app.get("/health")
def health():
    return {
        "status": "ok",
        "kb": "ready" if _kb is not None else ("error: " + (_kb_error or "not initialized")),
        "deepseek_key": "configured" if DEEPSEEK_API_KEY else "missing",
    }


@app.get("/api/stats")
def stats():
    kb = get_kb()
    if kb is None:
        return {"kb": "unavailable", "error": _kb_error}
    return kb.stats()


@app.get("/api/search")
def search(q: str, top_k: int = 4):
    """调试用：直接查看知识库检索结果。"""
    return {"query": q, "results": retrieve_context(q, top_k=top_k)}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY 未配置")
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages 不能为空")

    # RAG：以最后一条用户消息检索参考资料
    last_user = next(
        (m.content for m in reversed(req.messages) if m.role == "user"), ""
    )
    contexts = retrieve_context(last_user, top_k=4)

    system = SYSTEM_PROMPT
    if contexts:
        ctx_text = "\n\n".join(
            f"〖资料 {i + 1}〗\n{c['content']}" for i, c in enumerate(contexts)
        )
        system += f"\n\n【参考资料】\n{ctx_text}"

    # 只保留最近 12 条对话，控制 token 消耗
    history = [
        {"role": m.role, "content": m.content}
        for m in req.messages[-12:]
        if m.role in ("user", "assistant") and m.content.strip()
    ]
    messages = [{"role": "system", "content": system}] + history

    async def sse_stream() -> AsyncGenerator[str, None]:
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(
                api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL
            )
            stream = await client.chat.completions.create(
                model=DEEPSEEK_MODEL,
                messages=messages,
                stream=True,
                temperature=0.3,
            )
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta.content
                if delta:
                    payload = json.dumps({"content": delta}, ensure_ascii=False)
                    yield f"data: {payload}\n\n"
        except Exception as e:
            print(f"[Chat] DeepSeek 调用失败: {e}")
            err = (
                "抱歉，智能咨询服务暂时不可用。"
                "请稍后重试，或拨打 020-83288530 与我们联系。"
            )
            yield f"data: {json.dumps({'content': err}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        sse_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── 案件分析（对接 case-mcp-server 脱敏 + DeepSeek 6部分分析）─────────
CASE_MCP_DIR = BASE_DIR.parent / "case-mcp-server"
CASE_MCP_ENV = CASE_MCP_DIR / ".env"

# 案件分析系统提示词（参照 案情分析评估 skill 的 6 部分方法论）
CASE_ANALYSIS_PROMPT = """你是「珠江国际商事调解院」的案情分析助手。请基于以下案件材料，进行结构化案情分析。

【硬性约束】
- 只以提供的案件材料为事实来源；材料未载明的事实一律写"材料未载明/无法判断"
- 金额、日期、主体信息等不自行推算、不补全、不猜测
- 需要用户补充时在第6部分点明缺口

【输出格式】严格按以下6部分输出（顺序固定，标题固定，使用 markdown 加粗标题）：

**一、案件基本信息**
（案由、争议金额、签约时间与履行地等，1-2条归纳句）

**二、当事人基本情况**
（申请人/被申请人、联系方式、代理人等，1-2条归纳句）

**三、本案仲裁请求分析**
（请求金额/计算方式、事实与证据效力、法律依据，展开要点）

**四、全案综合风险评估**
（重点风险、证据缺口、抗辩焦点，详细清单）

**五、解纷策略建议**
（优先调解路径、时间/经济成本考量，详细清单）

**六、补充说明**
（需补充的材料、注意事项，不超过300字）

【要求】
- 每部分用"归纳句/要点句"，不截断原文
- 第4、5部分要详细，列出重点风险和优先处置路径
- 使用简体中文，条目化排版
- 不要在回答中提及"脱敏""令牌""材料原文"等技术细节"""


def _load_case_mcp_env() -> None:
    """加载 case-mcp-server/.env（CASE_DB_URL 等配置）。"""
    if not CASE_MCP_ENV.exists():
        return
    for line in CASE_MCP_ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def _ensure_case_mcp_path() -> None:
    """把 case-mcp-server 加入 sys.path，使 analyzer 等模块可被 import。"""
    p = str(CASE_MCP_DIR)
    if p not in sys.path:
        sys.path.insert(0, p)


_case_mcp_ready: bool | None = None


def _init_case_mcp():
    """懒加载 case-mcp-server（加载 env + sys.path）。成功返回 True。"""
    global _case_mcp_ready
    if _case_mcp_ready is not None:
        return _case_mcp_ready
    try:
        _load_case_mcp_env()
        _ensure_case_mcp_path()
        _case_mcp_ready = True
    except Exception as e:
        print(f"[CaseMCP] 初始化失败: {e}")
        _case_mcp_ready = False
    return _case_mcp_ready


class AnalyzeCaseRequest(BaseModel):
    case_id: str


@app.post("/api/analyze-case")
async def analyze_case(req: AnalyzeCaseRequest):
    """案件分析：脱敏 → DeepSeek 6部分分析 → 反脱敏 → 流式返回。

    流程：
      1. 调用 case-mcp-server 的 get_desensitized_case(case_id) 本地脱敏
      2. 用脱敏文本 + 6部分分析提示词调用 DeepSeek（完整响应）
      3. 调用 restore_result(trace_id, analysis) 反脱敏还原 PII
      4. 将还原后的分析结果以 SSE 流式返回（模拟打字效果）
    """
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY 未配置")
    case_id = req.case_id.strip()
    if not case_id:
        raise HTTPException(status_code=400, detail="案件编号不能为空")

    if not _init_case_mcp():
        raise HTTPException(status_code=503, detail="案件分析服务不可用（case-mcp-server 初始化失败）")

    async def sse_stream() -> AsyncGenerator[str, None]:
        try:
            from analyzer import get_desensitized_case, restore_result

            # 1. 脱敏
            yield f"data: {json.dumps({'status': 'desensitizing'}, ensure_ascii=False)}\n\n"
            desensitized = await get_desensitized_case(case_id)

            # 提取 trace_id 和脱敏文本
            trace_id = None
            for line in desensitized.splitlines():
                if line.startswith("TRACE_ID:"):
                    trace_id = line.split(":", 1)[1].strip()
                    break
            if not trace_id:
                yield f"data: {json.dumps({'content': '未能完成案件脱敏，请确认案件编号是否正确。'}, ensure_ascii=False)}\n\n"
                yield "data: [DONE]\n\n"
                return

            masked_text = desensitized.split("脱敏文本", 1)[1].split("识别实体列表", 1)[0].strip()

            # 2. DeepSeek 分析（完整响应，非流式）
            yield f"data: {json.dumps({'status': 'analyzing'}, ensure_ascii=False)}\n\n"
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)
            completion = await client.chat.completions.create(
                model=DEEPSEEK_MODEL,
                messages=[
                    {"role": "system", "content": CASE_ANALYSIS_PROMPT},
                    {"role": "user", "content": f"案件编号：{case_id}\n\n案件材料：\n{masked_text}"},
                ],
                temperature=0.3,
                stream=False,
            )
            analysis = completion.choices[0].message.content or ""

            # 3. 反脱敏
            yield f"data: {json.dumps({'status': 'restoring'}, ensure_ascii=False)}\n\n"
            try:
                restored = await restore_result(trace_id, analysis)
            except Exception as e:
                print(f"[CaseAnalyze] 反脱敏失败，使用脱敏结果: {e}")
                restored = analysis

            # 4. 流式返回还原后的分析（模拟打字效果）
            # 按字符分块，保留 markdown 结构
            chunk_size = 8
            for i in range(0, len(restored), chunk_size):
                chunk = restored[i : i + chunk_size]
                payload = json.dumps({"content": chunk}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
        except Exception as e:
            print(f"[CaseAnalyze] 失败: {e}")
            err = f"案件分析失败：{e}。请确认案件编号正确，或拨打 020-83288530 联系工作人员。"
            yield f"data: {json.dumps({'content': err}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        sse_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=3005, reload=True)
