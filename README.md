# Mediation Platform

商事调解平台项目，当前由两个前端应用和一组配套服务组成：

- `official/`
  官网与品牌展示站点，基于 Astro。
- `mediation-workbench/`
  调解业务工作台，基于 Nuxt 3，包含当事人入口、调解员工作台、公开接口、案件分析与聊天能力。

项目当前的核心理念：

> 调解创造价值 共识解决争议  
> Create value through mediation, resolve disputes through consensus.

## 1. 项目定位

这个仓库不是单一网站，而是一套围绕在线商事调解构建的业务系统，覆盖：

- 官网内容展示与服务引流
- 当事人在线建案、查案、查看材料与 AI 评估
- 调解员案件管理、知识库管理、VALUE 技能分析
- 小程序接口接入
- 知识库检索、OCR、AI 对话与案件分析

## 2. 当前架构

### 应用分层

1. `official`
   面向公众的官网，提供机构介绍、业务介绍、联系入口，并通过链接和悬浮咨询组件接入工作台能力。

2. `mediation-workbench`
   业务主系统，承担：
   - 当事人端页面
   - 调解员端页面
   - 认证与案件 API
   - 公开查询与公开 AI 接口
   - WebSocket 消息通道
   - 案件分析、VALUE 技能、脱敏与缓存逻辑

3. `mediation-workbench/server/mp`
   独立的小程序 API 进程，复用同一数据库和部分业务能力。

4. `mediation-workbench/server/kb`
   Python 知识库服务，供工作台进行知识检索与预览。

### 运行关系

```text
official (Astro, 4321)
  ├─ 跳转到 mediation-workbench 页面
  └─ 调用 mediation-workbench 的 public API

mediation-workbench (Nuxt, 6080)
  ├─ 页面：/party /guide /mediator
  ├─ API：/api/auth /api/cases /api/public /api/kb /api/value /api/v1
  ├─ WebSocket：/_ws
  ├─ SQLite：.data/mediation.db
  └─ 依赖 OCR / KB / LLM

mp API (H3, 6081)
  └─ 面向小程序的 auth / cases / messages / chat

KB service (Python, 8700)
  └─ 知识库检索与内容支持
```

## 3. 主要目录说明

### `official/`

- `src/pages/`
  官网页面，如首页、关于我们、咨询服务、培训服务等。
- `src/layouts/OfficialLayout.astro`
  官网统一布局，包含导航、页脚和 AI 咨询组件挂载。
- `src/components/ChatWidget.astro`
  官网悬浮 AI 咨询组件，通过 `PUBLIC_WORKBENCH_URL` 调用工作台公开接口。
- `src/config.ts`
  官网与工作台之间的地址配置。

### `mediation-workbench/`

- `pages/party`
  当事人入口与案件详情页。
- `pages/mediator`
  调解员工作台页面，包括案件、智能体、知识库、设置。
- `layouts/party.vue`
  当事人端左侧布局。
- `layouts/mediator.vue`
  调解员端左侧布局。
- `server/api`
  主要 HTTP API。
- `server/routes/_ws.ts`
  WebSocket 实时消息通道。
- `server/utils`
  AI、分析、聊天工作流、权限、脱敏、技能等核心业务逻辑。
- `server/database`
  SQLite 连接、schema、迁移与 seed。
- `server/mp`
  小程序独立 API 入口。
- `server/kb`
  Python 知识库服务。
- `tests/`
  Node 原生测试，覆盖迁移、建案、工作流、VALUE 相关逻辑。

## 4. 核心业务能力

### 当事人端

- 输入案件编号和验证码进入案件
- 上传材料并创建案件
- 查看案件材料
- 运行 AI 智能评估
- 进入后续人工调解流程

### 调解员端

- 登录工作台
- 查看案件列表与案件详情
- 运行案件分析与 VALUE 技能
- 管理知识库
- 查看智能体与相关配置页面

### 公开能力

- 官网 AI 咨询
- 公开案件列表与按案号查询
- 公开案件上下文获取
- 公开案件分析

### 小程序能力

- 通过 `wx code` 或演示案号登录
- 查询授权范围内案件
- 查询消息与发送消息
- 调用 AI 对话

## 5. VALUE 能力定位

当前系统已经围绕 `VALUE` 方向演进，项目理念与方法论统一为：

- `V`：识别案件与争议价值
- `A`：分析事实、利益与风险
- `L`：梳理法律与证据支撑
- `U`：理解各方可接受区间与方案
- `E`：促成可执行的共识结果

代码中相关能力主要位于：

- `server/utils/value-skills.ts`
- `server/api/value/index.get.ts`
- `server/api/cases/[caseNumber]/value/index.get.ts`
- `server/api/cases/[caseNumber]/value/[skillId].post.ts`

## 6. 本地开发

### 环境要求

- Node.js
- npm
- Python 3
- SQLite（通过 `better-sqlite3` 内置使用）

### 安装依赖

```bash
cd official
npm install

cd ../mediation-workbench
npm install
```

### 启动官网

```bash
cd official
npm run dev
```

默认端口：

- `http://localhost:4321`

如果本地环境对 `localhost`/IPv6 监听有限制，可显式使用：

```bash
npx astro dev --host 127.0.0.1 --port 4321
```

### 启动工作台

```bash
cd mediation-workbench
npm run dev
```

默认端口：

- `http://localhost:6080`

### 启动小程序 API

```bash
cd mediation-workbench
npm run dev:mp
```

默认端口：

- `http://localhost:6081`

### 启动知识库服务

```bash
cd mediation-workbench
npm run kb
```

默认端口：

- `http://localhost:8700`

## 7. 数据与配置

### 数据库

工作台默认使用本地 SQLite：

- `mediation-workbench/.data/mediation.db`

### 常用脚本

```bash
cd mediation-workbench

npm test
npm run build
npm run generate
npm run db:migrate
npm run db:seed
npm run db:seed-cases
```

```bash
cd official

npm run build
npm run preview
```

### 运行时配置

工作台主要配置在：

- `mediation-workbench/nuxt.config.ts`

官网主要配置在：

- `official/src/config.ts`

常见可配置能力包括：

- 工作台根地址
- 公开聊天接口地址
- 公开分析接口地址
- OCR 地址
- KB 地址
- OpenAI / DeepSeek 兼容配置

## 8. API 分组概览

### 工作台内部 API

- `/api/auth/*`
- `/api/cases/*`
- `/api/chat/*`
- `/api/kb/*`
- `/api/value/*`

### 官网/公开 API

- `/api/public/chat`
- `/api/public/analyze-case`
- `/api/public/cases`
- `/api/public/cases/:caseNumber`
- `/api/public/case-context`

### 外部接入 API

- `/api/v1/cases`
- `/api/v1/cases/:id`

### 小程序 API

- `/api/mp/auth/login`
- `/api/mp/auth/me`
- `/api/mp/cases`
- `/api/mp/cases/:id`
- `/api/mp/messages/:caseId`
- `/api/mp/chat`

## 9. 当前注意事项

- 根仓库当前同时承载官网和业务系统，部署时需要按两个应用分别处理。
- 官网依赖工作台公开接口，单独启动官网时，部分交互能力仍需要工作台同时在线。
- 工作台当前为 `ssr: false` 配置，页面以客户端模式运行。
- 小程序 API 已加入案件授权边界控制，默认只允许访问归属案件或演示案件。
- 测试环境下部分案号验证码流程仍保留固定约定，属于当前业务阶段的临时策略。

## 10. 推荐阅读顺序

如果你是第一次接手这个仓库，建议按下面顺序阅读：

1. 本 README
2. `official/src/pages/index.astro`
3. `official/src/layouts/OfficialLayout.astro`
4. `mediation-workbench/pages/party/index.vue`
5. `mediation-workbench/pages/mediator/index.vue`
6. `mediation-workbench/server/api`
7. `mediation-workbench/server/utils`
8. `mediation-workbench/server/database/schema.ts`

## 11. 当前状态总结

这是一个“官网引流 + 业务工作台承载流程 + AI/知识库增强”的在线调解系统原型/业务系统雏形，已经具备：

- 统一品牌入口
- 当事人在线建案与查案
- 调解员案件工作台
- AI 咨询与案件分析
- VALUE 方法论技能扩展
- 小程序侧接入能力

后续如果继续演进，建议优先加强：

- 配置文档与环境变量样例
- 部署说明
- 多环境联调说明
- 鉴权边界与接口权限矩阵
- 官网与工作台共享文案/品牌配置抽取
