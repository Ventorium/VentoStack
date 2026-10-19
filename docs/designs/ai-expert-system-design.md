# AI 专家体系（Expert System）设计

> 状态：设计稿 v3（评审意见 + CloudSmith 实测结论，待确认后实施）
> 关联模块：`packages/framework/ai`
> 参考：`vbarter/workbuddy-experts`、`msitarzewski/agency-agents`

---

## 1. 背景与目标

在 AI 模块中加入"专家"能力：预置领域角色的 system prompt 资产，用户绑定专家后以该角色开展对话。

核心决策（已确认）：

1. 专家资产由远程仓库（ExpertHub）托管，第一版落在 **CloudSmith**（私有仓库 `vento/ventostack`），本地按需下载、支持批量、可同步升级，不打包进项目。
2. 专家内容从 `agency-agents`（MIT）与 `workbuddy-experts` **精选**而来——少而专精；腾讯专区专家不直接照搬，仅参考重写。
3. **专家数据全部文件化存储在专用数据目录，不入数据库**；数据库只做管理（记录有哪些、下载了哪些、扫描/启用状态）。
4. 安全检查前置：每个专家下载后必须通过提示词注入等风险扫描才能启用。
5. `EXPERT_HUB_BASE_URL` 环境变量默认导出；认证直接使用 `CLOUD_SMITH_TOKEN` 环境变量（**代码只引用，严禁读取内容写入日志/响应**）。

## 2. 参考项目分析

### 2.1 workbuddy-experts

- manifest.json：顶层 `version` / `lastUpdated` / `categories` / `experts`，专家对象含分类、名称、描述、promptFile、头像、快捷 prompt、`expertType: agent|team`。
- 分发：静态文件托管 + `lastUpdated` 增量感知，客户端按需下载缓存。
- 注入核心：**Role Override**——专家定义注入 system prompt 主体并声明优先级高于默认人设。
- 版权：大部分专家派生自 MIT 的 agency-agents；"腾讯专区"部分版权归腾讯 → **不直接使用，仅参考分类与组织方式重写**。

### 2.2 agency-agents（MIT，内容主要来源）

- 每个专家一个 Markdown：frontmatter（`name`/`description`/`color`/`emoji`/`vibe`）+ 正文（Identity / Core Mission / Critical Rules / Process 等结构）。
- 纯 prompt 资产，无可执行组件 → 适合"manifest + 单文件分发"。

### 2.3 内容引入策略

- 以 agency-agents 为主要来源，按场景精选（目标初版 20–30 个，宁缺毋滥），翻译/改写为中文为主的提示词。
- 转换脚本 `scripts/convert-experts.ts`：读取精选清单 → 从上游拉取 md → 按编写规范清洗改写 → 校验/打包（计算 sha256、更新 manifest）→ 人工复核后上传 CloudSmith。
- 腾讯专区专家：只参考分类体系与呈现方式，提示词自行重写，规避版权风险。

## 3. 现状：复用 Skill 管线

`packages/framework/ai` 已有完整 Skill 远程分发管线（`services/skill-store.ts`、`services/skill.ts`、`routes/skill.ts`、agent-loop `resolveSkills` 注入点、admin skills-tab）。专家体系在架构上与之同构：

| 层 | Skill 现状 | 专家对应设计 |
|---|---|---|
| 远程客户端 | `skill-store.ts`（对接 skillhub.cn） | `expert-hub.ts`（CloudSmith raw files 客户端） |
| 领域服务 | `skill.ts`（安装/同步/升级） | `expert.ts`（同构 + 批量 + 安全扫描） |
| 存储位置 | DB 存内容 + 磁盘文件 | **磁盘为唯一权威存储，DB 只做管理注册表** |
| 注入点 | `resolveSkills` → 追加式 available_skills | `resolveExpert` → Role Override 主体式（运行时读盘） |
| 事件 | `ai.skill.*` | `ai.expert.*` |
| Admin UI | skills-tab | experts-tab（P2） |

**独立实体而非扩展 ai_skill**：skill 是任务型指令包（按需 invoke），专家是角色型人设（会话级绑定 + 市场元数据），注入路径与生命周期不同，混表会持续膨胀。

## 4. 总体架构

```
┌──────────────────────────────────────────────────────────────────┐
│ CloudSmith（vento/ventostack，私有 raw files 仓库）                  │
│   manifest.json + experts/<slug>.md + avatars/<slug>.png          │
│   下载前缀 dl.cloudsmith.io/basic/vento/ventostack/raw/files/      │
│   认证 X-Api-Key: $CLOUD_SMITH_TOKEN                               │
├──────────────────────────────────────────────────────────────────┤
│ Admin Web（experts-tab：市场浏览 / 批量安装 / 同步升级 / 扫描结果）      │
├──────────────────────────────────────────────────────────────────┤
│ routes/expert.ts（perm("ai:expert", …)）                          │
├──────────────────────────────────────────────────────────────────┤
│ services/expert.ts（安装/批量/同步/升级/CRUD，读写数据目录）             │
│ services/expert-hub.ts（CloudSmith 客户端，sha256 校验）              │
│ services/expert-scan.ts（提示词注入/风险扫描，fail-closed）             │
├──────────────────────────────────────────────────────────────────┤
│ agent-loop：params.expertId → resolveExpert()（从数据目录读文件）      │
│            → Role Override 注入 system prompt                       │
├──────────────────────────────────────────────────────────────────┤
│ 磁盘：/app/data/experts/<slug>/<version>/expert.md + meta.json     │
│       （唯一权威数据源）                                             │
│ DB：ai_expert 管理注册表（有哪些/下载了哪些/版本/扫描/启用，无正文）      │
└──────────────────────────────────────────────────────────────────┘
```

## 5. ExpertHub 远程协议（v1）与 CloudSmith 落地

### 5.1 存储形态：单文件，不用 zip

**专家包 = 单个 Markdown 文件**。理由：

- 专家是纯文本单文件资产，zip 只会引入解压攻击面（zip bomb、zip-slip），v1 无附件需求；
- CloudSmith raw files 直传单个 md，manifest 中以 `sha256` 做完整性校验；
- 未来若需要附件，再引入 zip 并复用 skill 的 `readZipEntries` 防护逻辑。

CloudSmith 仓库布局（raw files 相对路径）：

```
manifest.json
experts/<slug>.md
avatars/<slug>.png        # 可选
```

### 5.2 下载地址与认证（实测确认，2026-10-18）

**下载为匿名公开访问，无需鉴权**（仓库已公开；若 CloudSmith 侧尚未公开需先在控制台设为 public）。token 不参与下载链路。

对已上传文件 `a.iso` 的实测结论：

| 形态 | 结果 |
|---|---|
| `dl.cloudsmith.io/public/vento/ventostack/raw/files/<path>`（匿名） | **200 ✅（采用，仓库公开后生效）** |
| `dl.cloudsmith.io/basic/...` + `X-Api-Key` 头 | 200（仅上传脚本使用，服务端不出现） |
| `.../raw/<path>`（无 `files` 段） | 404 ❌（路径必须含 `raw/files/`） |
| `?token=` query 传参 | 401 ❌（不采用，避免 token 进 URL/日志） |

**下载通用前缀（匿名）**：

> 实测补充（2026-10-18）：CloudSmith raw 上传为三步 API（`POST /v1/files/{owner}/{repo}/` 预签名 → S3 multipart 直传 → `POST /v1/packages/.../upload/raw/` 以 `package_file=<identifier>` 创建包）；**上传时不带 name/version** 才会落 `raw/files/` 路径（带 version 会落 `raw/versions/<v>/`）；**子目录会被拍平**，因此 promptFile/头像均为扁平文件名；同名重传需 `republish: true`。仓库可见性（Public/Private）API 不可改，需在控制台 Main Settings → Visibility 操作。

```
https://dl.cloudsmith.io/public/vento/ventostack/raw/files/
```

**token 边界**：`CLOUD_SMITH_TOKEN` 仅用于**上传/发布脚本**（`scripts/convert-experts.ts` 的 publish 命令走 CloudSmith 上传 API）；服务端运行时代码中**不得出现**该变量，严禁写入日志、URL、响应体。

- API 侧（仅上传脚本使用）：`https://api.cloudsmith.io/v1/packages/vento/ventostack/`，`X-Api-Key` 头。
- 上传（v1 无管理功能）：脚本或控制台直传 raw 文件，**注意保留相对路径**（`experts/<slug>.md`），否则下载 URL 对不上。

### 5.3 manifest

`GET {base}/manifest.json`

```jsonc
{
  "version": "1.0.0",
  "lastUpdated": "2026-10-18T00:00:00Z",   // 增量同步锚点
  "categories": [
    { "id": "01-engineering", "name": "技术工程", "nameEn": "Engineering" }
  ],
  "experts": [
    {
      "slug": "backend-architect",           // [a-z0-9-]，全局唯一
      "categoryId": "01-engineering",
      "name": "后端架构师",
      "nameEn": "Backend Architect",         // 可选
      "description": "…（中文为主）",
      "descriptionEn": "…",                  // 可选
      "avatarUrl": "avatars/backend-architect.png",  // 可选，相对 base
      "promptFile": "backend-architect.md",
      "version": "1.2.0",
      "sha256": "<promptFile 内容摘要>",
      "expertType": "agent",                 // v1 仅 agent；team 预留
      "suggestedTools": ["web-search", "kb-search"],  // 可选，仅建议，见 §9
      "tags": ["架构", "后端"],
      "quickPrompts": ["帮我设计一个秒杀系统的架构"],
      "defaultInitPrompt": "你好，我是后端架构师…",     // 可选，前端开场白
      "updatedAt": "2026-10-01T00:00:00Z"
    }
  ]
}
```

**双语说明**：WorkBuddy 全字段 `{en,zh}` 是因其市场服务中英文用户。VentoStack 后台以中文为主，简化为**中文必填 + `nameEn`/`descriptionEn` 可选**，tags/quickPrompts 用字符串数组。未来真有多语言需求再升级为 locale map。

### 5.4 专家 md 文件格式

frontmatter 与 manifest 冲突时以 **manifest 为准**：

```markdown
---
name: 后端架构师
description: 专注高并发系统设计、数据库架构与云基础设施
emoji: 🏗️
version: 1.2.0
---
（专家 system prompt 正文，遵循 docs/specs/ai-expert-authoring.md）
```

### 5.5 配置

- `EXPERT_HUB_BASE_URL`：默认 `https://dl.cloudsmith.io/public/vento/ventostack/raw/files/`（匿名公开），用户可用环境变量接入自建服务；自建服务如需鉴权，由实现层预留 `EXPERT_HUB_TOKEN`（可选，默认不配置）。
- `CLOUD_SMITH_TOKEN`：**仅上传/发布脚本使用**，服务端运行时不读取。
- 请求带 `User-Agent: VentoStack/<version>`；manifest 内存缓存 TTL 默认 5min + `lastUpdated` 短路。

## 6. 数据目录与部署（修正后的存储设计）

### 6.1 磁盘是唯一权威存储（评审修正 #2）

**专家数据不入数据库。** 数据目录布局：

```
<EXPERT_DATA_DIR>/                       # 生产：/app/data/experts
├── experts/
│   └── <slug>/
│       └── <version>/
│           ├── expert.md                # 专家 prompt 正文（含 frontmatter）
│           └── meta.json                # 安装时从 manifest 固化的元数据
│                                        #   （name/description/tags/quickPrompts/
│                                        #    defaultInitPrompt/suggestedTools/sha256/
│                                        #    avatarUrl/categoryId/…）
└── manifests/
    └── manifest.json                    # 最近一次同步的 manifest 快照（离线浏览用）
```

- 安装 = 下载 md → sha256 校验 → 安全扫描 → 写入 `experts/<slug>/<version>/` → DB 插入一条管理记录。
- 升级 = 下载新版本目录 → 扫描通过后原子切换（先写临时目录再 rename）→ 更新 DB 记录；旧版本目录保留一个回滚点，可配置清理策略。
- 卸载 = 删除目录 + 删 DB 记录。
- 运行时注入（resolveExpert）：按 DB 记录定位文件路径 → 读 md → sha256 复核 → Role Override 组装。文件缺失/校验失败 → fail-closed 忽略并告警。
- **DB 与磁盘不一致时以磁盘为准**（DB 仅管理缓存）。

### 6.2 DB 管理注册表（迁移 `018_create_ai_expert_tables.ts`）

```sql
CREATE TABLE ai_expert (
  id                VARCHAR(36) PRIMARY KEY,
  slug              VARCHAR(128) NOT NULL,
  category_id       VARCHAR(64),
  name              VARCHAR(256) NOT NULL,        -- 冗余展示字段（来源 meta.json）
  description       TEXT,                          -- 冗余展示字段
  latest_version    VARCHAR(64),                   -- manifest 同步
  installed_version VARCHAR(64),
  content_sha256    VARCHAR(64),
  file_path         VARCHAR(512) NOT NULL,         -- 数据目录内相对路径
  scan_status       VARCHAR(16) DEFAULT 'pending', -- pending|passed|failed
  scan_report       JSONB,                         -- 扫描明细（不落 prompt 正文）
  remote_updated_at TIMESTAMP,
  enabled           BOOLEAN DEFAULT TRUE,
  installed_at      TIMESTAMP,
  last_synced_at    TIMESTAMP,
  tenant_id         VARCHAR(36) NOT NULL DEFAULT 'default',
  created_at        TIMESTAMP,
  updated_at        TIMESTAMP,
  UNIQUE (tenant_id, slug)
);
CREATE INDEX idx_ai_expert_tenant_cat ON ai_expert (tenant_id, category_id);
```

对比 v2 的变化：删除 `prompt_content` / `prompt_meta` / `tags` / `quick_prompts` / `default_init_prompt` / `suggested_tools` 等内容列——全部在磁盘 `expert.md` + `meta.json` 中；DB 只保留"有哪些、下载了哪些、什么版本、扫描/启用状态"。不再需要 `ai_expert_category` 表（分类来自 manifest 快照，内存缓存）。市场浏览直接读 manifest（内存缓存 + `lastUpdated` 短路），不入库。

### 6.3 Docker 部署（专用目录，可写）

- 数据目录：`/app/data/experts`，新增 named volume：`expert_data:/app/data/experts`。
- `docker-compose.yaml`：`admin.volumes` 增加 `- expert_data:/app/data/experts`；`volumes:` 增加 `expert_data: { driver: local }`。
- `Dockerfile`：release 阶段增加 `RUN mkdir -p /app/data/experts && chown -R bun:bun /app/data/experts`（保证 named volume 首次挂载可写）。
- 容器根文件系统维持 `read_only: true` 不变（安全基线）：named volume 本身可写，下载/安装正常工作；可写面仅 `/tmp` + `/app/uploads` + `/app/data/experts`，仍满足最小化原则。
- 服务端路径一律从 `EXPERT_DATA_DIR` 环境变量派生（默认 `./data/experts`，生产 `/app/data/experts`），禁止散落的相对路径（skill 的 `./data/skills` 是反面教材，建议后续一并修正）。

## 7. 服务端设计

### 7.1 `services/expert-hub.ts` — CloudSmith 客户端

```
fetchManifest(): Promise<HubManifest>            // 内存缓存 + lastUpdated 短路
fetchPromptFile(expert): Promise<string>         // GET base + promptFile，校验 sha256 + 大小上限
resolveAvatarUrl(expert): string                 // 拼 base + avatarUrl，前端直连（不带 token）
```

- URL 构造：`EXPERT_HUB_BASE_URL + manifest 内相对路径`；路径白名单校验（禁 `..`/绝对路径/协议前缀），防穿越与 SSRF。
- 认证：**下载匿名**，不带任何凭据头；`CLOUD_SMITH_TOKEN` 只存在于上传脚本，服务端代码零引用。
- Schema 校验：拒绝未知字段；slug≤128、description≤2048、prompt≤128KB、experts≤2000、suggestedTools≤20（手写校验器，零第三方依赖，与 skill-store 风格一致）。
- 网络错误转 `AIGatewayError`（带 code，不外泄内部拓扑）。

### 7.2 `services/expert-scan.ts` — 安全扫描管线（强制，fail-closed）

每个专家在 `install` / `upgrade` 时必须通过扫描，结果落 DB `scan_status` / `scan_report`（同时写进版本目录的 `meta.json`）：

| 检查 | 内容 |
|---|---|
| 结构校验 | frontmatter/manifest schema、长度上限、slug 白名单 |
| 注入特征 | 伪 system 标签（`<system>`/`</expert_definition>` 等闭合逃逸）、"忽略之前指令/覆盖系统提示"类越权语句、试图禁用安全策略、隐藏指令（零宽字符、不可见 Unicode、base64 指令块） |
| 数据外泄 | 诱导上传/外发数据、要求调用文件写/web-fetch 外传的指令模式 |
| 敏感信息 | 疑似密钥/凭据/个人信息模式 |
| 工具声明 | suggestedTools 逐个比对 tool-registry 白名单，未注册项剔除并告警 |

- 规则扫描复用/扩展现有 `agent-engine/prompt-guard`，零第三方依赖。
- 纵深防御：运行时注入仍走 XML 隔离 + 转义 + prompt-guard 复查。
- 预留 `scan_mode: 'rules' | 'llm-audit'`（P3：LLM 审计员复核）。
- **文件化配套**：由于内容在磁盘，扫描报告与状态以 DB 为查询入口；若文件被绕过系统手工替换，运行时 sha256 复核会失败并 fail-closed，防篡改。

### 7.3 `services/expert.ts` — 领域服务

函数式工厂 `createExpertService(deps: { db, eventBus?, hub?, scanner?, dataDir })`：

| 方法 | 语义 |
|---|---|
| `fetchManifestCached()` | 拉取/缓存 manifest（`lastUpdated` 短路），同步快照到 `manifests/` |
| `listRemote(query)` | 市场浏览/搜索（基于 manifest 内存缓存） |
| `install(slug, tenantId)` | 下载 → sha256 → **扫描** → 写版本目录（临时目录 + rename）→ DB 管理记录（事务）+ 事件 |
| `installBatch(slugs[], tenantId)` | 批量安装：并发上限 4、逐个容错，返回 `{ installed, failed: [{slug, reason}] }` |
| `checkUpdates(tenantId)` | manifest 一次请求对比全部已装专家版本，更新 DB `latest_version` |
| `upgrade(id, tenantId)` | 校验 → 扫描 → 原子切换版本目录 → 更新 DB → 事件 |
| `uninstall(id, tenantId)` | 删版本目录 + DB 记录 → 事件 |
| `setEnabled / list / getById / getBySlug` | CRUD，全部强制 `tenant_id`（fail-closed） |

事件：`ai.expert.installed / upgraded / uninstalled / scan_failed`，载荷仅含 id/slug/version/tenantId（不含 prompt 正文与 token）。

### 7.4 `routes/expert.ts` — REST API

统一 `authMiddleware` + `perm("ai:expert", action)`；租户标识只从认证主体取：

```
GET    /api/ai/experts/hub/manifest            # 市场浏览（分类+专家，走缓存）
GET    /api/ai/experts/hub/:slug               # 市场详情
POST   /api/ai/experts/hub/install             # { slugs: string[] }（1..50，Zod 校验）
GET    /api/ai/experts                         # 已安装列表（分页/分类/启用过滤）
GET    /api/ai/experts/:id                     # 详情（含 scan_report 与 meta.json 元数据）
PUT    /api/ai/experts/:id                     # { enabled }
DELETE /api/ai/experts/:id                     # 卸载
POST   /api/ai/experts/check-updates
POST   /api/ai/experts/:id/upgrade
```

## 8. 专家与工具的关系

**参考项目中的专家包不含任何可执行 tool/skill**：agency-agents 的 agent 全部是纯提示词；WorkBuddy 专家同样只有 prompt。专家的"能力"来自平台已有工具集。

1. v1 专家包 = 纯 prompt，**禁止**内置可执行代码（扫描强制）。
2. `suggestedTools` 仅建议：安装/实例化时映射 tool-registry 白名单，未注册的剔除 + 告警，绝不动态注册。
3. 需要新工具能力时走平台正常的工具注册流程（tool-registry + 审批/审计），与专家分发解耦。

## 9. 注入机制

### 9.1 agent-loop 扩展

`RunParams` / `AgentConfig` 新增 `expertId?: string`；deps 新增 `resolveExpert(expertId, tenantId)`：查 DB 记录（限本租户、enabled、scan_status=passed）→ 读数据目录 md + meta.json → sha256 复核 → 返回资产。

组装顺序：`formatExpertRoleOverride(expert)` 置于 systemPrompt **最前**，其后为 agent 默认 systemPrompt 与既有片段（虚拟环境/research/skills/KB/记忆）。

Role Override 模板（新增 `expert-prompt.ts`）：

```
<expert_definition priority="override">
以下专家角色定义优先于其他已建立的系统人设/身份设定，冲突时以本定义为准。
  <expert>
    <name>…</name><profession>…</profession>
    <content>XML 转义后的专家正文</content>
  </expert>
</expert_definition>
```

- 记录不存在 / disabled / scan 未通过 / 文件缺失 / sha256 不符 → fail-closed：忽略 expertId + 审计日志。
- `quickPrompts`/`defaultInitPrompt` 不进 system prompt，由 chat 元数据返回前端。

### 9.2 优先级规则

- **会话级**：chat 请求临时携带 `expertId`，任意 Agent 当次对话套用专家角色。
- **Agent 级**：把专家实例化为独立 `ai_agent`（system_prompt = 专家 prompt，P3）。
- 冲突规则：**显式请求的 expertId（会话级）优先于 Agent 自身设定**，写死在 agent-loop。

### 9.3 chat 路由透传

`routes/chat.ts` 请求体新增可选 `expertId`（Zod 校验、限本租户已启用且扫描通过的专家），透传至 agent-loop；会话元数据记录 expertId。

## 10. Admin 前端（P2）

`pages/app/ai/capabilities/components/experts-tab.tsx`（与 skills-tab 并列）：

- 市场视图：分类侧栏 + 专家卡片（名称/描述/tags/版本/更新时间），搜索、多选批量安装。
- 已安装视图：列表（版本、hasUpdate、scan_status 徽标、启用开关）、升级、卸载、批量检查更新、扫描报告查看。

## 11. 专家编写规范

独立文档 `docs/specs/ai-expert-authoring.md`：包格式、manifest/md 规范、slug 规则、8 条安全红线、发布流程（lint→pack→直传 CloudSmith→更新 manifest）、示例。发布目标即 §5.2 的下载前缀，上传时保留 `experts/<slug>.md` 相对路径。

## 12. 安全与合规清单

| 风险 | 措施 |
|---|---|
| 提示词注入 | 安装/升级强制扫描（fail-closed）+ 运行时 XML 隔离 + prompt-guard 复查 |
| 包被篡改 | sha256 校验（下载时 + 运行时双校验）；公开仓库只读分发，写权限仅上传脚本持有 token；预留 manifest 签名（P3） |
| token 泄露 | 服务端运行时零引用；仅上传脚本经环境变量使用，禁入日志/URL/响应/落盘 |
| SSRF / 路径穿越 | baseUrl 仅服务端配置；相对路径白名单校验 |
| 可执行代码混入 | 禁止 + 扫描强制；工具只能白名单映射 |
| 批量接口滥用 | ≤50 个/次、并发 4、perm + 审计 |
| 跨租户泄露 | 全查询带 tenant_id，UNIQUE(tenant_id, slug)，fail-closed |
| 磁盘与 DB 漂移 | 磁盘为权威，运行时 sha256 复核，缺失/不符 fail-closed |
| 版权 | 内容以 MIT 的 agency-agents 精选改写为主；腾讯专区仅参考重写 |

## 13. 实施计划

| 阶段 | 内容 | 交付物 |
|---|---|---|
| P1 核心 | 迁移 018（管理注册表）；`expert-hub.ts`（CloudSmith）/`expert-scan.ts`/`expert.ts`/`routes/expert.ts`；module 装配（EXPERT_HUB_BASE_URL 默认前缀 + CLOUD_SMITH_TOKEN）；数据目录读写与原子切换；`scripts/convert-experts.ts`；Dockerfile/compose 加 `expert_data` 卷；精选专家集初版（20–30 个）上传 CloudSmith；单测（hub 校验/扫描/安装/批量/同步/升级/租户隔离/文件篡改） | 可用分发管线 + 首批专家上线 |
| P2 注入+UI | agent-loop expertId + Role Override + prompt-guard 集成；chat 透传；experts-tab；OpenAPI 契约测试 | 端到端：装专家 → 会话以专家角色对话 |
| P3 增强 | expertType=team；一键实例化为 Agent；manifest 签名；LLM 审计扫描；source=upload | 对齐 WorkBuddy 专家中心完整能力 |

测试要求（AGENTS.md §8）：公共函数单测；安装/同步/升级/批量集成测试；租户隔离失败用例；恶意 manifest/prompt 拒绝用例；磁盘文件被篡改/删除后的 fail-closed 用例；`bun:test` 同目录存放。

## 14. 决策记录

1. 双语简化：中文必填 + 可选英文别名。
2. 内容来源：两项目精选（20–30 个），腾讯专区仅参考重写。
3. **hub = CloudSmith 公开仓库**：下载前缀 `https://dl.cloudsmith.io/public/vento/ventostack/raw/files/`（实测确认，路径含 `raw/files/`；仓库公开后匿名可下），**下载零鉴权**；`CLOUD_SMITH_TOKEN` 仅上传/发布脚本使用，服务端运行时零引用；`EXPERT_HUB_BASE_URL` 可覆盖接入自建服务。
4. **专家数据全部文件化**：`/app/data/experts`（新 named volume `expert_data`）为唯一权威存储；DB 只做管理注册表（有哪些/下载了哪些/版本/扫描/启用），不存正文与内容元数据；容器根维持 read-only，volume 本身可写。
5. 专家不含 tool/skill，仅 suggestedTools 白名单映射。
6. 安装/升级强制安全扫描，fail-closed；运行时 sha256 复核防文件篡改。
7. 优先级：会话级显式 expertId > Agent 自身设定。
