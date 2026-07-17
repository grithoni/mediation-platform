"""本地 MCP 服务器——案件分析入口。

启动方式：
  python server.py

工具列表：
  - query_case(case_id)              按 ID 查看原始案件（本地，含 PII）
  - list_case_ids()                  列出可用案件 ID
  - get_desensitized_case(case_id)   预置案件脱敏 → 返回脱敏文本 + trace_id + 实体列表
  - desensitize_text(text, ...)      任意文本脱敏（无需预置案件，适合外部文档）
  - query_case_by_id(case_id)       从案件系统拉案件（DB 或 mock）→ 返回结构化 JSON
  - save_report(case_id, content, fmt)  生成 .docx/.md 报告
  - adjust_desensitization(trace_id, corrections)  人工校正脱敏结果
  - restore_result(trace_id, text)   反脱敏 → 还原真实 PII

连接方式（在 WorkBuddy 中）：
  见 ~/.workbuddy/mcp.json，添加如下条目：
  {
    "case-analyzer": {
      "command": "python",
      "args": ["path/to/case-mcp-server/server.py"],
      "cwd": "path/to/case-mcp-server/"
    }
  }
"""

import os
import sys

from mcp.server.fastmcp import FastMCP
from analyzer import (
    query_case,
    list_case_ids,
    get_desensitized_case,
    desensitize_text,
    query_case_by_id,
    save_report,
    adjust_desensitization,
    restore_result,
)

mcp = FastMCP("case-analyzer")


@mcp.tool()
async def tool_query_case(case_id: str) -> str:
    """按案件ID查询原始案件信息（包含个人敏感信息，仅在本地返回）。"""
    try:
        return await query_case(case_id)
    except Exception as e:
        return f"查询失败: {e}"


@mcp.tool()
async def tool_list_case_ids() -> str:
    """列出可用的案件ID（演示用 mock 数据）。"""
    try:
        return await list_case_ids()
    except Exception as e:
        return f"列出案件ID失败: {e}"


@mcp.tool()
async def tool_get_desensitized_case(case_id: str) -> str:
    """对案件进行本地脱敏，返回脱敏文本、trace_id 和实体列表。

    脱敏文本中所有 PII 已替换为令牌（如 [原告_1]、[证件_1]），
    可安全发送至外部智能体进行分析。返回结果包含 trace_id，
    分析完成后需调用 restore_result 还原真实 PII。
    如需校正脱敏结果，可调用 adjust_desensitization。
    """
    try:
        return await get_desensitized_case(case_id)
    except Exception as e:
        return f"脱敏失败: {e}"


@mcp.tool()
async def tool_desensitize_text(text: str, known_names: str = "", known_addresses: str = "") -> str:
    """对任意文本进行本地脱敏（无需预置案件），返回脱敏文本、trace_id 和实体列表。

    适用于读取外部文件（如 .docx/.pdf 提取的文本）后直接脱敏的场景。
    分析完成后需调用 restore_result 还原真实 PII。

    text: 待脱敏的原始文本
    known_names: 已知人名 JSON 数组字符串，如 '["张三","李四"]'，可选（提高匹配精度）
    known_addresses: 已知地址 JSON 数组字符串，可选
    """
    try:
        return await desensitize_text(text, known_names, known_addresses)
    except Exception as e:
        return f"脱敏失败: {e}"


@mcp.tool()
async def tool_query_case_by_id(case_id: str) -> str:
    """从案件系统查案件，返回结构化 JSON（text + parties + addresses）。

    优先从数据库拉取（需配置 CASE_DB_URL 环境变量），未配置时回退到 mock 数据。
    拿到结果后，调 desensitize_text(text, known_names=parties, known_addresses=addresses) 脱敏。
    """
    try:
        return await query_case_by_id(case_id)
    except Exception as e:
        return f"查询失败: {e}"


@mcp.tool()
async def tool_save_report(case_id: str, content: str, fmt: str = "docx") -> str:
    """生成分析报告文件。

    case_id: 案件 ID（用于文件名）
    content: 报告内容（反脱敏后的最终文本）
    fmt: 'docx' 或 'md'，默认 docx
    返回文件绝对路径。
    """
    try:
        return await save_report(case_id, content, fmt)
    except Exception as e:
        return f"报告生成失败: {e}"


@mcp.tool()
async def tool_adjust_desensitization(trace_id: str, corrections: str) -> str:
    """人工校正脱敏结果。

    trace_id: 由 get_desensitized_case 返回的追踪 ID
    corrections: JSON 字符串，支持操作：
      - add: [{"value": "张三", "category": "姓名/当事人/原告"}]
      - remove: ["[姓名_1]"]
      - merge: [{"from": "[姓名_1]", "to": "[姓名_2]"}]
      - update_category: [{"token": "[姓名_1]", "category": "姓名/当事人/被告"}]
    """
    try:
        return await adjust_desensitization(trace_id, corrections)
    except Exception as e:
        return f"校正失败: {e}"


@mcp.tool()
async def tool_restore_result(trace_id: str, text: str) -> str:
    """反脱敏：将外部智能体分析结果中的令牌还原为真实 PII。

    trace_id: 由 get_desensitized_case 返回的追踪 ID
    text: 外部智能体分析结果（含令牌）
    """
    try:
        return await restore_result(trace_id, text)
    except Exception as e:
        return f"反脱敏失败: {e}"


def _select_transport() -> str:
    transport = os.getenv("CASE_MCP_TRANSPORT")
    if transport:
        return transport

    # Default to stdio when interactive, but use streamable-http in non-interactive
    # environments where standard input may be closed and stdio transport will exit.
    return "stdio" if sys.stdin.isatty() else "streamable-http"


def _apply_runtime_settings() -> None:
    host = os.getenv("CASE_MCP_HOST")
    port = os.getenv("CASE_MCP_PORT")
    if host:
        mcp.settings.host = host
    if port:
        try:
            mcp.settings.port = int(port)
        except ValueError:
            raise ValueError(f"CASE_MCP_PORT must be an integer, got: {port}")


if __name__ == "__main__":
    _apply_runtime_settings()
    transport = _select_transport()
    print(
        f"Starting Case MCP Server with transport={transport!r} host={mcp.settings.host} port={mcp.settings.port}"
    )
    if transport == "stdio" and not sys.stdin.isatty():
        print(
            "WARNING: stdio transport is not interactive; "
            "this may exit immediately if stdin is closed. "
            "Set CASE_MCP_TRANSPORT=streamable-http for a standalone HTTP service."
        )
    mcp.run(transport=transport)
