# 全时在线的争议解决专家 · Always Online Dispute Resolution Expert

> 一个基于 AI 的商事调解平台，包含当事人端（案件申请、AI 咨询）和调解员工作台（案件管理、知识库检索、Agent 工作流）。

## 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [前置条件](#前置条件)
- [快速开始](#快速开始)
- [环境变量配置](#环境变量配置)
- [初始化数据库](#初始化数据库)
- [启动服务](#启动服务)
- [测试流程](#测试流程)
- [项目结构](#项目结构)
- [FAQ](#faq)

---

## 项目简介

本系统面向商事调解场景，提供双端独立界面：

- **当事人端**（端口 3000） — 案件申请、AI 分阶段咨询、调解员匹配、与调解员实时对话
- **调解员工作站**（端口 3001） — 案件管理、Agent 智能体工作流、知识库 RAG 检索、即时消息

AI 对话使用分阶段提示词：当事人端采用 4 阶段心理咨询模式（倾听→共情→重塑→协商），调解员端采用专业辅助模式。

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
| 实时通信 | HTTP 轮询（跨端口消息同步） |

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

# Python 知识库依赖（首次启动 kb 时会自动安装，也可以手动安装）
pip install fastapi uvicorn python-multipart fastembed chromadb
```

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
# 生成迁移
npm run db:generate

# 推送到数据库
npm run db:push

# 创建数据库文件
npm run db:migrate

# 填充种子数据（调解员 + 案件）
npm run db:seed
```

**种子数据（测试用）**：

| 用户名 | 密码 | 角色 |
|--------|------|------|
| `admin` | `123` | 管理员 |
| `zhangtiaojieyuan` | `123` | 调解员 |
| `linwanqing` | `123` | 调解员 |
| `zhaomingyuan` | `123` | 调解员 |
| `chenjianguo` | `123` | 调解员 |

**测试案件**：id 为 `2026-1` 至 `2026-8`，访问码均为 `123`。

---

## 启动服务

系统需要同时运行三个服务：

### 终端 1：知识库服务（端口 8700）

```bash
npm run kb
```

首次启动约需 15 秒（加载 embedding 模型），看到输出 `Starting KB server on port 8700...` 即就绪。

### 终端 2：当事人端（端口 3000）

```bash
npm run dev:party
```

### 终端 3：调解员工作站（端口 3001）

```bash
npm run dev:mediator
```

---

## 测试流程

### ▶️ 当事人端 [http://localhost:3000](http://localhost:3000)

**1. AI 咨询 → 创建案件**

1. 打开浏览器访问 `http://localhost:3000`
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

### ▶️ 调解员工作站 [http://localhost:3001](http://localhost:3001)

**1. 登录**

使用上述任意调解员账号登录（如 `chenjianguo` / `123`）。

**2. 浏览案件**

左侧 **案件列表** 中会显示当前调解员负责的案件。点击案件进入详情。

**3. 与当事人对话**

案件详情页上半部分为聊天区域，可查看当事人与 AI 的对话历史。在输入框回复消息即可与当事人沟通。

**4. 使用 Agent 智能体**

案件详情页底部的技能列表中：

- 点击 **💬 首轮沟通话术** 启动循序渐进的沟通向导
- Agent 会自动分析案件 CSVF 表和当事人主张，生成最适合当前阶段的沟通话术
- 使用「上一页/下一页」导航，通过「完成」将话术发送到对话框

**5. 知识库检索**

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
                                                   调解员使用Agent + 知识库辅助
```

---

## 环境变量说明

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `NUXT_OPENAI_API_KEY` | 是 | AI 模型 API Key | `sk-xxx` |
| `NUXT_OPENAI_BASE_URL` | 是 | API 兼容端点 | `https://api.openai.com/v1` |
| `NUXT_OPENAI_MODEL` | 是 | 模型名称 | `gpt-4o-mini` |
| `NUXT_PUBLIC_APP_MODE` | 自动 | 运行模式 (`party`/`mediator`) | 由 `package.json` 脚本设置 |

可以通过 `.env.party` 和 `.env.mediator` 为不同端口单独配置：

```bash
# .env.party
NUXT_PUBLIC_APP_MODE=party

# .env.mediator
NUXT_PUBLIC_APP_MODE=mediator
```

---

## 项目结构

```
mediation-platform/
├── app.vue                    # 根组件（动态布局）
├── nuxt.config.ts             # 双端口配置
├── layouts/
│   ├── party.vue              # 当事人端布局
│   └── mediator.vue           # 调解员布局
├── pages/
│   ├── index.vue              # 当事人首页（AI 咨询 + 导航）
│   ├── case/[caseNumber].vue  # 当事人案件详情
│   └── admin/
│       ├── index.vue          # 调解员工作站
│       └── login.vue          # 调解员登录
├── components/
│   └── AgentChatPanel.vue     # Agent 聊天面板组件
├── composables/
│   ├── useAuth.ts             # 认证（credentials:include）
│   ├── useChat.ts             # HTTP 轮询消息
│   └── useAgentChat.ts        # Agent SSE 通信
├── server/
│   ├── api/                   # Nitro API 路由
│   │   ├── chat/              # AI / Agent / Message API
│   │   ├── cases/             # 案件 CRUD
│   │   ├── mediators/         # 调解员匹配
│   │   └── auth/              # 登录
│   ├── database/              # Schema + SEED + 迁移
│   ├── utils/agent/           # Agent 循环、工具 (12个)、记忆 L1/L2
│   └── kb/                    # Python 知识库服务
│       ├── server.py          # FastAPI 端点 (端口 8700)
│       └── engine.py          # ChromaDB + fastembed 引擎
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

**Q: 数据库出错怎么办？**

```bash
rm -rf .data .nuxt
npm run db:migrate
npm run db:seed
npm run dev:party
```

**Q: 修改了 layout/config 页面不更新？**

清除缓存后重启：

```bash
rm -rf .nuxt
```

**Q: 当事人端怎么测试 AI 对话？**

无需登录，访问 `http://localhost:3000`，首页底部就是 AI 对话入口。系统已预置 8 个测试案件，输入案件编号和访问码 `123` 即可查看。
