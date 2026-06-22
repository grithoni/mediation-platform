# 全时在线的纠纷解决专家 · Always Online Dispute Resolution Expert

> 一个基于 AI 的商事调解平台，服务于向广州仲裁委员会提起仲裁申请的商事纠纷案件。包含当事人端、调解员工作台、管理后台三端界面，以及小程序 API。

## 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [前置条件](#前置条件)
- [快速开始](#快速开始)
- [环境变量配置](#环境变量配置)
- [启动服务](#启动服务)
- [三端功能概览](#三端功能概览)
- [调解员工作台](#调解员工作台)
- [管理后台](#管理后台)
- [API 概览](#api-概览)
- [项目结构](#项目结构)
- [FAQ](#faq)

---

## 项目简介

本系统定位为**仲裁立案前的调解阶段**。依据《广州仲裁委员会仲裁规则》第19条第4款，本会在收到仲裁申请后，可以根据纠纷的实际情况引导当事人通过其他争议解决方式解决争议。

| 解决路径 | 说明 | 费用优势 |
|---------|------|---------|
| 立案前调解成功撤回 | 调解达成和解 → 撤回仲裁申请 | 受理前全额退回 |
| 调解 + 仲裁 | 调解达成协议 → 仲裁庭出具调解书/裁决书 | 仲裁费用按 **50%** 收取 |
| 继续仲裁 | 调解未果 → 正式立案进入仲裁程序 | 正常收费 |

### 核心特性

- **AI 智能体对话** — 基于 Agent Loop 的多轮对话，支持工具调用（RAG 搜索、动态文件生成、调解员匹配等）
- **13 阶段案件状态机** — 从 INTAKE 到 CLOSED_SUCCESS/CLOSED_FAILED 完整生命周期管理
- **知识库 RAG** — ChromaDB + fastembed 向量检索，支持法律文档上传与语义搜索
- **调解员智能匹配** — 根据案件特征自动匹配合适的调解员
- **协议签署** — 支持调解协议生成、审批、电子签名
- **实时通信** — WebSocket 实时聊天 + HTTP 轮询降级
- **多租户架构** — 支持 SaaS 多租户隔离
- **隐私保护** — 当事人与 AI 的私聊消息对调解员不可见

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Nuxt 3 (Vue 3) + TypeScript |
| UI | @nuxt/ui v3 + Tailwind CSS v4 |
| 数据库 | SQLite (better-sqlite3) + Drizzle ORM |
| AI | Vercel AI SDK + 任何 OpenAI 兼容端点 |
| 知识库 | ChromaDB + fastembed (Python, 端口 8700) |
| 实时通信 | Nitro WebSocket + HTTP 轮询降级 |
| 小程序 API | H3 standalone + JWT (端口 6081) |
| 文档生成 | docx 库 |

---

## 前置条件

- **Node.js** >= 18（推荐 20+）
- **npm**
- **Python** >= 3.10（知识库服务，可选）
- **Git**

---

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/grithoni/mediation-platform.git
cd mediation-platform
```

### 2. 安装依赖

```bash
npm install

# 知识库依赖（可选，不影响核心功能）
pip install -r requirements.txt
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入 AI 模型配置：

```
NUXT_OPENAI_API_KEY=your-api-key-here
NUXT_OPENAI_BASE_URL=https://api.openai.com/v1
NUXT_OPENAI_MODEL=gpt-4o-mini
```

> 支持任何兼容 OpenAI SDK 的 API 端点（OpenAI、DeepSeek、通义千问、Xiaomi MiMo 等）。

### 4. 初始化数据库

```bash
npm run db:push    # 推送 schema
npm run db:seed    # 填充种子数据
```

### 5. 启动服务

```bash
npm run dev        # Web 服务 → http://localhost:6080
```

---

## 环境变量配置

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `NUXT_OPENAI_API_KEY` | 是 | AI 模型 API Key | `sk-xxx` |
| `NUXT_OPENAI_BASE_URL` | 是 | API 兼容端点 | `https://api.openai.com/v1` |
| `NUXT_OPENAI_MODEL` | 是 | 模型名称 | `gpt-4o-mini` |
| `WX_APPID` | 否 | 微信小程序 AppID | `wx123456` |
| `WX_APP_SECRET` | 否 | 微信小程序 AppSecret | `secret` |
| `MP_JWT_SECRET` | 否 | 小程序 API JWT 密钥 | `your-secret` |

> `.env` 文件已加入 `.gitignore`，不会被提交到版本库。

---

## 启动服务

```bash
# 终端 1：Web 服务（端口 6080）
npm run dev

# 终端 2：知识库服务（端口 8700，可选）
npm run kb

# 终端 3：小程序 API（端口 6081，可选）
npm run dev:mp
```

---

## 三端功能概览

### 当事人端 (`/party`)

| 功能 | 说明 |
|------|------|
| 进入我的案件 | 输入案件编号 + 访问码进入案件详情 |
| 创建新的案件 | 填写纠纷信息、上传证据材料 |
| AI 智能体对话 | 多轮对话 + 工具调用（RAG 搜索、法律分析） |
| 调解员匹配 | AI 根据案件特征推荐调解员，当事人自主选择 |
| 实时聊天 | 与调解员 WebSocket 实时通信 |
| 流程指引 | 调解流程说明 |

### 调解员工作台 (`/mediator`)

| 功能 | 说明 |
|------|------|
| 案件管理 | 查看分配的案件、搜索、筛选 |
| 与当事人对话 | 实时聊天，AI 辅助建议 |
| AI 调解技能 | 沟通话术推荐、利益重构方案生成 |
| 知识库 | 上传/查看/检索法律文档（RAG 向量搜索） |
| 案件笔记 | 私有/共享笔记（观察、策略、风险） |
| 调解协议 | 创建/审批/签署调解协议 |
| 技能包管理 | 上传/启用/禁用自定义技能包 (.zip) |
| MCP 工具 | 配置外部工具服务（stdio/http） |
| 近期对话 | 查看已保存的对话记录 |

### 管理后台 (`/admin`)

| 功能 | 说明 |
|------|------|
| 数据概览 | 案件总量、调解成功率、活跃调解员等统计 |
| 案件审核 | 审批待审案件、分配调解员 |
| 统计报表 | 纠纷类型分布、调解员绩效、金额分布 |
| 租户管理 | 多租户配置 |
| Webhook | 事件推送配置 |

---

## 调解员工作台

### 登录

使用种子数据中的调解员账号登录：

| 用户名 | 密码 | 姓名 |
|--------|------|------|
| `linwanqing` | `123` | 林婉清 |
| `zhaomingyuan` | `123` | 赵明远 |
| `chenjianguo` | `123` | 陈建国 |

### AI 调解技能

| 技能 | 说明 |
|------|------|
| 沟通话术推荐 | 5 步循序渐进的沟通向导（破冰→倾听→共情→聚焦利益→推进共识） |
| 利益重构方案推荐 | 生成 10 节结构化调解方案（关键信息/方案 A-C/比较表/BATNA-WATNA/推荐/条款清单/时间表/风险提示） |
| AI 回复建议 | 基于对话上下文生成调解员回复建议 |

### MCP 工具配置

| 传输方式 | 适用场景 | 配置项 |
|----------|----------|--------|
| `stdio` | 本地命令行工具 | 命令（如 `npx -y @modelcontextprotocol/server-filesystem /tmp`） |
| `http` | 远程 HTTP 服务 | URL（如 `https://example.com/mcp`） |

---

## 管理后台

访问 `/admin` 进入管理后台。种子数据中的管理员账号：

| 用户名 | 密码 | 角色 |
|--------|------|------|
| `admin` | `123` | 管理员 |

管理后台支持案件审核、统计报表、调解员绩效分析等功能。

---

## API 概览

系统提供 68+ 个 REST API 端点，主要包括：

| 模块 | 端点数 | 说明 |
|------|--------|------|
| 认证 | 4 | 登录/注册/登出/当前用户 |
| 案件 | 18 | CRUD、状态流转、文件、时间线、笔记、协议 |
| 聊天 | 5 | 消息发送/接收、AI 对话、Agent SSE 流式 |
| 调解员 | 3 | 列表、创建、智能匹配 |
| AI | 4 | 分析、文档处理、建议、一次性查询 |
| 知识库 | 4 | 上传、列表、搜索、文件获取 |
| 技能 | 3 | 上传、卸载、启用/禁用 |
| MCP 工具 | 3 | CRUD、启用/禁用 |
| 统计 | 3 | 概览、案件统计、调解员统计 |
| 管理 | 4 | 租户、Webhook |
| 协议 | 2 | 签署、审批 |
| 外部 API | 2 | v1 案件创建/查询 |
| WebSocket | 1 | 实时聊天 (`/_ws`) |

---

## 种子数据

| 类型 | 数量 | 说明 |
|------|------|------|
| 租户 | 1 | 广州仲裁委员会 |
| 用户 | 12 | 1 管理员 + 1 案件管理员 + 3 调解员 + 3 申请人 + 3 被申请人 |
| 案件 | 13 | 编号 2026-1 至 2026-13，访问码均为 `123` |

所有测试账号密码均为 `123`。

---

## 项目结构

```
mediation-platform/
├── app.vue                         # 根组件
├── nuxt.config.ts                  # Nuxt 配置
├── assets/css/main.css             # Tailwind 4 入口
├── layouts/
│   ├── party.vue                   # 当事人端布局（左侧导航 + 右侧内容）
│   └── mediator.vue                # 调解员布局（顶部导航栏）
├── pages/
│   ├── index.vue                   # 重定向到 /party
│   ├── party/
│   │   ├── index.vue               # 当事人首页（案件登录 + 创建 + 流程指引）
│   │   └── case/[caseNumber].vue   # 当事人案件详情（统一聊天 UI）
│   ├── mediator/
│   │   ├── index.vue               # 调解员工作台（侧边栏 + 多面板）
│   │   ├── login.vue               # 调解员登录
│   │   └── cases/[id].vue          # 调解员案件详情（三栏布局）
│   └── admin/
│       ├── index.vue               # 管理后台首页（数据概览 + 功能入口）
│       ├── stats.vue               # 统计报表
│       └── review.vue              # 案件审核
├── components/
│   ├── ChatMessage.vue             # 聊天气泡
│   ├── ChatInput.vue               # 聊天输入框
│   ├── AIChatPanel.vue             # AI 聊天面板
│   ├── AgentChatPanel.vue          # Agent SSE 流式面板
│   ├── CaseStatusBadge.vue         # 案件状态徽章
│   ├── CaseCard.vue                # 案件摘要卡片
│   └── admin/
│       ├── KnowledgePanel.vue      # 知识库面板
│       ├── CaseDetailView.vue      # 案件详情视图
│       ├── CaseSidebar.vue         # 案件侧边栏
│       ├── SettingsPanel.vue       # 设置面板（技能 + MCP）
│       └── KbTreeNode.vue          # 知识库树节点
├── composables/
│   ├── useAuth.ts                  # JWT 认证
│   ├── useChat.ts                  # 聊天消息 + WebSocket
│   ├── useAgentChat.ts             # Agent SSE 流式对话
│   └── useActiveMenu.ts            # 菜单状态
├── server/
│   ├── api/                        # 68+ REST API 端点
│   │   ├── auth/                   # 认证（登录/注册/登出）
│   │   ├── cases/                  # 案件管理（CRUD、状态、文件、协议等）
│   │   ├── chat/                   # 聊天（消息、AI、Agent SSE）
│   │   ├── mediators/              # 调解员（列表、匹配）
│   │   ├── ai/                     # AI 功能（分析、建议）
│   │   ├── kb/                     # 知识库（上传、搜索）
│   │   ├── skills/                 # 技能包管理
│   │   ├── mcp/tools/              # MCP 工具管理
│   │   ├── documents/              # 文档管理
│   │   ├── conversations/          # 对话记录
│   │   ├── agreements/             # 协议管理
│   │   ├── admin/                  # 管理后台 API
│   │   ├── stats/                  # 统计 API
│   │   └── v1/                     # 外部 API v1
│   ├── database/
│   │   ├── schema.ts               # 17 张表定义
│   │   ├── migrate.ts              # 数据库迁移脚本
│   │   ├── seed.ts                 # 种子数据（租户 + 用户 + 调解员 + 案件）
│   │   └── index.ts                # Drizzle 实例
│   ├── middleware/
│   │   ├── auth.ts                 # JWT + 角色鉴权中间件
│   │   └── tenant.ts               # 多租户解析中间件
│   ├── utils/
│   │   ├── agent/                  # Agent 循环、工具、记忆
│   │   ├── dialog-manager.ts       # 对话阶段管理
│   │   ├── dialog-intent.ts        # 意图识别（调解员转接）
│   │   ├── generate-dynamic-file.ts # AI 案件分析生成
│   │   ├── kb-search.ts            # 知识库搜索
│   │   ├── auth.ts                 # 认证工具
│   │   ├── case-status.ts          # 13 阶段状态机
│   │   ├── e-signature.ts          # 电子签名
│   │   └── webhook.ts              # Webhook 推送
│   ├── kb/
│   │   ├── server.py               # FastAPI 知识库服务（端口 8700）
│   │   └── engine.py               # ChromaDB + fastembed RAG 引擎
│   └── mp/                         # 小程序 API（端口 6081）
│       ├── index.ts                # H3 standalone 入口
│       ├── middleware/auth.ts      # JWT 认证
│       └── routes/                 # 路由（auth/cases/messages/chat）
├── uploads/                        # 上传文件（不提交 Git）
├── .data/                          # SQLite 数据库（不提交 Git）
├── .env.example                    # 环境变量模板
└── package.json
```

---

## FAQ

**Q: 如何切换 AI 模型？**

修改 `.env` 中的 `NUXT_OPENAI_API_KEY`、`NUXT_OPENAI_BASE_URL`、`NUXT_OPENAI_MODEL`。兼容任何 OpenAI SDK 兼容的端点。

**Q: 知识库搜不到结果？**

确保先执行 `npm run kb` 启动知识库服务（端口 8700），等待约 15 秒加载完成。通过 `curl http://localhost:8700/health` 检查。

**Q: 数据库出错怎么办？**

```bash
rm .data/mediation.db
npm run db:push
npm run db:seed
```

**Q: 调解员怎么看不到当事人的 AI 私聊？**

这是设计行为。当事人与 AI 的私聊消息标记为 `visibility: 'private'`，调解员视图会自动过滤。

**Q: 当事人与 AI 对话多少轮后会提示选择调解员？**

默认 5 轮。也可以在对话中输入"我要找调解员"、"结束"等关键词主动触发。

**Q: 如何上传技能包？**

在调解员工作台的 ⚙️ 设置 → ⚡ 技能，上传 `.zip` 文件。zip 内需包含 `manifest.json`（含 `name`、`description`、`version` 字段）。

**Q: 小程序 API 怎么测试？**

```bash
npm run dev:mp

# 登录获取 token
curl -X POST http://localhost:6081/api/mp/auth/login \
  -H "Content-Type: application/json" \
  -d '{"caseNumber":"2026-1","accessCode":"123"}'

# 用 token 访问接口
curl http://localhost:6081/api/mp/cases -H "Authorization: Bearer <token>"
```
