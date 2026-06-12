# 全时在线的纠纷解决专家 · Always Online Dispute Resolution Expert

> 一个基于 AI 的商事调解平台，包含当事人端（案件申请、AI 咨询）和调解员工作台（案件管理、知识库检索、AI 调解技能、技能包/工具管理）。

## 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [前置条件](#前置条件)
- [快速开始](#快速开始)
- [环境变量配置](#环境变量配置)
- [初始化数据库](#初始化数据库)
- [启动服务](#启动服务)
- [测试流程](#测试流程)
- [调解员工作台功能](#调解员工作台功能)
- [项目结构](#项目结构)
- [FAQ](#faq)

---

## 项目简介

本系统服务于向**广州仲裁委员会**提起仲裁申请的商事纠纷案件，定位为**仲裁立案前的调解阶段**。

依据《广州仲裁委员会仲裁规则》第19条第4款，本会在收到仲裁申请后，可以根据纠纷的实际情况引导当事人通过其他争议解决方式解决争议。本平台在此阶段引入调解，引导当事人选择最优解决路径：

| 解决路径 | 说明 | 费用优势 |
|---------|------|---------|
| 立案前调解成功撤回 | 调解达成和解 → 撤回仲裁申请 | 受理前全额退回 |
| 调解 + 仲裁 | 调解达成协议 → 仲裁庭出具调解书/裁决书 | 仲裁费用按 **50%** 收取 |
| 继续仲裁 | 调解未果 → 正式立案进入仲裁程序 | 正常收费 |

系统提供统一 Web 界面 + 小程序 API：

- **当事人端**（`/party`） — 进入案件、创建案件、AI 分阶段咨询、调解员匹配介入、与调解员实时对话
- **调解员工作站**（`/mediator`） — 案件管理、AI 调解技能（实时建议话术、智能/人工应答）、知识库 RAG 检索、技能包/工具管理
- **小程序 API**（端口 6081） — 微信登录、JWT 认证、案件/消息/AI 对话接口

AI 对话使用分阶段提示词：当事人端采用 4 阶段心理咨询模式（倾听→共情→重塑→协商），调解员端采用专业辅助模式。

**隐私保护**：当事人与 AI 的私聊消息对调解员不可见，仅共享消息（当事人主动发送或调解员发送的）对调解员可见。

**注意**：系统实际运行的 AI 模型由 `.env` 中的 `NUXT_OPENAI_BASE_URL` 指定，支持任何兼容 OpenAI SDK 的 API 端点（如 DeepSeek、通义千问、Xiaomi MiMo 等）。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Nuxt 3 (Vue 3) + TypeScript |
| UI | Nuxt UI v3 + Tailwind CSS v4 |
| 数据库 | SQLite + Drizzle ORM |
| AI SDK | Vercel AI SDK (`@ai-sdk/openai`) |
| 知识库 | ChromaDB + fastembed (Python, 端口 8700) |
| 小程序 API | H3 standalone + JWT (端口 6081) |
| 实时通信 | HTTP 轮询（消息同步） |

---

## 前置条件

- **Node.js** >= 18（推荐 20+）
- **npm**（系统 `pnpm` 不可用，使用 `npm`）
- **Python** >= 3.10（知识库服务需要）
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
# Node.js 依赖
npm install

# Python 知识库依赖（可选，不影响核心功能）
pip install -r requirements.txt

# 国内下载慢？用阿里云镜像加速：
pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/
```

> **注意**：知识库（KB）是可选组件。即使不安装 Python 依赖，平台的核心调解功能（案件管理、AI对话、调解技能等）仍然完全可用。知识库仅提供文档向量搜索功能。

### 3. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env
```

编辑 `.env`，填入你的 AI 模型配置：

```
NUXT_OPENAI_API_KEY=your-api-key-here
NUXT_OPENAI_BASE_URL=https://api.openai.com/v1
NUXT_OPENAI_MODEL=gpt-4o-mini
```

> **默认配置**（本地开发）：系统使用 Xiaomi MiMo 模型，API 地址指向 `https://token-plan-cn.xiaomimimo.com/v1`。
> 如果你想使用 OpenAI、DeepSeek、通义千问等，只需修改 `.env` 中的这三项即可。

### 4. 初始化数据库

```bash
# 推送 schema 到数据库
npm run db:push

# 填充种子数据（调解员 + 案件）
npm run db:seed
```

**种子数据（测试用）**：

| 用户名 | 密码 | 角色 |
|--------|------|------|
| `admin` | `123` | 管理员 |
| `linwanqing` | `123` | 调解员 |
| `zhaomingyuan` | `123` | 调解员 |
| `chenjianguo` | `123` | 调解员 |

**测试案件**：编号为 `2026-1` 至 `2026-8`，访问码均为 `123`。

---

## 启动服务

系统需要同时运行三个服务：

### 终端 1：知识库服务（端口 8700）

```bash
npm run kb
```

首次启动约需 15 秒（加载 embedding 模型），看到输出 `Starting KB server on port 8700...` 即就绪。

### 终端 2：Web 服务（端口 6080）

```bash
npm run dev
```

### 终端 3：小程序 API（端口 6081，可选）

```bash
npm run dev:mp
```

---

## 测试流程

### ▶️ 当事人端 [http://localhost:6080/party](http://localhost:6080/party)

**1. AI 咨询 → 创建案件**

1. 打开浏览器访问 `http://localhost:6080/party`
2. 在首页底部输入框与 AI 对话（机器人会引导您陈述纠纷）
3. AI 会先倾听您的诉求（前 3-4 轮不提供解决方案）
4. 当您确认需要正式申请调解时，点击 **申请调解** 按钮
5. 上传相关证据材料（支持任意文件格式）
6. 点击 **创建案件**，系统返回案件编号

**2. 查看案件 → 选择调解员**

1. 在首页点击 **进入我的案件**
2. 输入案件编号（如 `2026-1`）和访问码 `123`
3. 进入案件详情页
4. 点击 **👤 与调解员对话** — 直接展开调解员列表
5. 浏览调解员信息（专长、学历、单位），选择一个点击 **选择该调解员**
6. 状态变为 `active`，您可与调解员实时交流

**3. AI 咨询模式**

在案件页面，点击 **🤖 与智能体对话** 可继续与 AI 对话。AI 会基于案件动态文件（争议焦点、时间线、立场等）提供专业的调解建议。

**4. 结束对话**

- 在对话框中输入 "我要找调解员"、"结束"、"不用了" 等关键词，系统自动转入调解员选择
- 连续对话 5 轮以上也会自动提示选择调解员

### ▶️ 调解员工作站 [http://localhost:6080/mediator](http://localhost:6080/mediator)

**1. 登录**

使用上述任意调解员账号登录（如 `chenjianguo` / `123`）。

**2. 浏览案件**

左侧 **📋 案件列表** 中会显示当前调解员负责的案件。点击案件进入详情。

**3. 与当事人对话**

案件详情页上半部分为聊天区域，可查看当事人与 AI 的对话历史（私聊消息已自动过滤）。在输入框回复消息即可与当事人沟通。

**4. AI 调解技能**

案件详情页底部的技能按钮中：

| 技能 | 说明 |
|------|------|
| 💬 沟通话术推荐 | 5 步循序渐进的沟通向导（破冰→倾听→共情→聚焦利益→推进共识） |
| 💡 利益重构方案推荐 | 生成 10 节结构化调解方案（关键信息/方案 A-C/比较表/BATNA-WATNA/推荐/条款清单/时间表/风险提示） |

**5. 保存对话**

点击案件信息栏的 **💾 保存对话** 按钮，可将当前对话保存为记录。左侧 **💬 近期对话** 可查看已保存的对话。

**6. 查看原始文件**

点击案件资料面板的 **📎 原始文件** 按钮，可查看该案件上传的所有原始文件（支持在线预览 .txt/.md/.图片/.PDF）。

**7. 知识库检索**

左侧点击 **📚 知识库** 展开三个子功能：

| 功能 | 说明 |
|------|------|
| 📤 上传 | 上传 .md 格式法律文档到知识库，自动索引 |
| 👁️ 查看 | 列出所有已索引文档（路径、分块数） |
| 🔍 搜索 | 输入关键词检索法律知识，结果带相关度评分 |

### ▶️ 完整调解流程

```
当事人咨询AI → 申请调解 → 创建案件 → 选择调解员 → 双方对话 → 达成调解协议
                                                             ↓
                                                   调解员使用技能 + 知识库辅助
```

---

## 调解员工作台功能

调解员工作台采用左侧边栏 + 右侧内容面板的布局，支持暗色/亮色主题切换。

### 左侧边栏

| 区域 | 功能 |
|------|------|
| 📋 案件列表 | 搜索、浏览、选择案件 |
| 📚 知识库 | 上传/查看/检索法律文档 |
| 💬 近期对话 | 查看已保存的对话记录 |
| ⚙️ 设置 | 技能包管理、MCP 工具配置、用户信息 |

### 设置区域

设置区域的布局（从上到下）：

1. **⚡ 技能** — 上传/管理技能包（.zip 格式，含 `manifest.json`）
2. **🔧 工具 (MCP)** — 配置 MCP 工具（stdio/http 传输）
3. **用户信息** — 当前用户名 + 角色

### MCP 工具配置

支持两种传输方式：

| 传输方式 | 适用场景 | 配置项 |
|----------|----------|--------|
| `stdio` | 本地命令行工具 | 命令（如 `npx -y @modelcontextprotocol/server-filesystem /tmp`） |
| `http` | 远程 HTTP 服务 | URL（如 `https://example.com/mcp`） |

环境变量以 JSON 格式配置（如 `{"API_KEY": "xxx"}`）。

---

## 环境变量说明

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `NUXT_OPENAI_API_KEY` | 是 | AI 模型 API Key | `sk-xxx` |
| `NUXT_OPENAI_BASE_URL` | 是 | API 兼容端点 | `https://api.openai.com/v1` |
| `NUXT_OPENAI_MODEL` | 是 | 模型名称 | `gpt-4o-mini` |
| `WX_APPID` | 否 | 微信小程序 AppID（小程序登录需要） | `wx123456` |
| `WX_APP_SECRET` | 否 | 微信小程序 AppSecret（小程序登录需要） | `secret` |
| `MP_JWT_SECRET` | 否 | 小程序 API JWT 密钥 | `your-secret` |

---

## 项目结构

```
mediation-platform/
├── app.vue                    # 根组件（动态布局 + 暗色模式同步）
├── nuxt.config.ts             # 双端口配置
├── assets/css/main.css        # Tailwind 4 入口 + 暗色模式 @custom-variant
├── layouts/
│   ├── party.vue              # 当事人端布局（左侧案件表单 + 右侧信息/AI 对话）
│   └── mediator.vue           # 调解员布局（顶部导航栏 + 暗色模式切换）
├── pages/
│   ├── index.vue              # 根路由（重定向到 /party）
│   ├── party/
│   │   ├── index.vue          # 当事人首页（AI 咨询 + 导航菜单）
│   │   └── case/[caseNumber].vue  # 当事人案件详情
│   └── mediator/
│       ├── index.vue          # 调解员工作站（侧边栏 + 多面板状态机）
│       ├── login.vue          # 调解员登录
│       └── cases/[id].vue     # 调解员案件详情
├── composables/
│   ├── useAuth.ts             # 认证（credentials:include）
│   └── useChat.ts             # HTTP 轮询消息
├── server/
│   ├── api/
│   │   ├── chat/
│   │   │   ├── ai.post.ts           # AI 对话（分阶段提示词 + 私聊隔离）
│   │   │   ├── agent.post.ts        # Agent SSE 通信
│   │   │   ├── messages.post.ts     # 发送消息
│   │   │   └── messages/[caseId].get.ts  # 消息列表（调解员过滤私聊）
│   │   ├── cases/
│   │   │   ├── index.get.ts         # 案件列表
│   │   │   ├── create.post.ts       # 创建案件（multipart）
│   │   │   ├── bind-mediator.post.ts  # 绑定调解员
│   │   │   ├── end-dialog.post.ts   # 结束对话
│   │   │   └── [caseNumber]/
│   │   │       ├── index.get.ts     # 案件详情（调解员过滤私聊）
│   │   │       ├── files.get.ts     # 列出原始文件
│   │   │       ├── file.get.ts      # 提供文件下载/预览
│   │   │       ├── recommend-solution.post.ts  # 10 节方案生成
│   │   │       ├── conversations.post.ts  # 保存对话
│   │   │       └── conversations.get.ts   # 列出已保存对话
│   │   ├── conversations.get.ts     # 当前调解员的已保存对话
│   │   ├── conversations/[id].get.ts  # 对话详情
│   │   ├── mediators/
│   │   │   └── match.get.ts         # 调解员匹配
│   │   ├── skills/
│   │   │   ├── index.ts             # 技能包列表 + 上传（.zip）
│   │   │   ├── [id]/index.delete.ts # 卸载技能包
│   │   │   └── [id]/toggle.post.ts  # 启用/禁用
│   │   ├── mcp/tools/
│   │   │   ├── index.ts             # MCP 工具列表 + 创建
│   │   │   ├── [id]/index.ts        # 更新/删除
│   │   │   └── [id]/toggle.post.ts  # 启用/禁用
│   │   └── auth/
│   │       ├── login.post.ts        # 登录
│   │       ├── logout.post.ts       # 登出
│   │       └── me.get.ts            # 当前用户
│   ├── database/
│   │   ├── schema.ts          # 8 张表（cases/mediators/sessions/messages/documents/case_dynamic_files/saved_conversations/mcp_tools）
│   │   ├── seed.ts            # 种子数据（4 调解员 + 9 案件）
│   │   └── index.ts           # Drizzle 实例
│   ├── middleware/auth.ts     # 认证中间件
│   ├── utils/agent/           # Agent 循环、工具 (12个)、记忆 L1/L2
│   ├── kb/
│   │   ├── server.py          # FastAPI 知识库服务（端口 8700）
│   │   └── engine.py          # ChromaDB + fastembed RAG 引擎
│   └── mp/                    # 小程序 API 服务（端口 6081）
│       ├── index.ts           # H3 standalone 入口
│       ├── middleware/auth.ts # JWT 认证
│       └── routes/
│           ├── auth.ts        # 微信登录 + demo 登录
│           ├── cases.ts       # 案件列表/详情/文件
│           ├── messages.ts    # 消息列表/发送
│           └── chat.ts        # AI 对话（RAG 增强）
├── uploads/
│   ├── cases/                 # 案件上传文件（不提交 Git）
│   └── skills/                # 技能包存储（不提交 Git）
├── .data/                     # SQLite + KB 数据（不提交 Git）
│   ├── mediation.db
│   └── kb/
└── .env.example               # 环境变量模板
```

---

## FAQ

**Q: 如何切换到别的 AI 模型？**

修改 `.env` 的三项：`NUXT_OPENAI_API_KEY`、`NUXT_OPENAI_BASE_URL`、`NUXT_OPENAI_MODEL`。兼容任何 OpenAI SDK 兼容的端点。

**Q: 知识库搜不到结果？**

确保先执行 `npm run kb` 启动知识库服务（端口 8700），等待约 15 秒加载完成。然后通过 `curl http://localhost:8700/health` 检查。

**Q: 知识库 /stats 或 /search 返回 503 错误？**

说明 Python 依赖未安装或安装不完整。运行：

```bash
pip install -r requirements.txt

# 国内下载慢用镜像：
pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/
```

如果 `chromadb` 的 wheel 下载卡住，可以尝试：1) 使用镜像源；2) 先单独安装 `pip install chromadb`；3) 检查网络代理设置。

> 知识库是可选组件，缺少依赖不会影响平台核心功能。

**Q: 数据库出错怎么办？**

```bash
rm .data/mediation.db
npm run db:push
npm run db:seed
```

**Q: 修改了 layout/config 页面不更新？**

清除缓存后重启：

```bash
node -e "require('fs').rmSync('.nuxt',{recursive:true,force:true})"
```

**Q: 当事人端怎么测试 AI 对话？**

无需登录，访问 `http://localhost:6080/party`，首页底部就是 AI 对话入口。系统已预置 8 个测试案件，输入案件编号和访问码 `123` 即可查看。

**Q: 小程序 API 怎么测试？**

```bash
npm run dev:mp  # 启动小程序 API（端口 6081）

# 登录获取 token
curl -X POST http://localhost:6081/api/mp/auth/login \
  -H "Content-Type: application/json" \
  -d '{"caseNumber":"2026-1","accessCode":"123"}'

# 用 token 访问接口
curl http://localhost:6081/api/mp/cases -H "Authorization: Bearer <token>"
```

**Q: 调解员怎么看不到当事人的 AI 私聊？**

这是设计行为。当事人与 AI 的私聊消息标记为 `visibility: 'private'`，调解员视图会自动过滤这些消息，保护当事人的隐私咨询过程。只有当事人主动发送的消息和调解员自己的消息对调解员可见。

**Q: 如何上传技能包？**

在调解员工作台的 ⚙️ 设置 → ⚡ 技能，点击上传区域选择 `.zip` 文件。zip 内需包含 `manifest.json`（含 `name`、`description`、`version` 字段）。

**Q: MCP 工具有什么用？**

MCP（Model Context Protocol）工具允许调解员配置外部工具服务，扩展 AI 的能力。支持 `stdio`（本地命令）和 `http`（远程服务）两种传输方式。
