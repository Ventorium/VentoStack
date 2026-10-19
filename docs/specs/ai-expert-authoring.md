# VentoStack 专家编写规范（Expert Authoring Spec）

> 版本：v1（配套设计：`docs/designs/ai-expert-system-design.md`）
> 适用：向 ExpertHub（CloudSmith）发布专家包的所有作者与维护者

---

## 1. 专家包是什么

一个专家 = **一个 Markdown 文件**（专家 system prompt 正文 + frontmatter 元数据）+ 在 `manifest.json` 中的一条索引记录。没有代码、没有脚本、没有可执行组件。

```
<hub 根目录>/
├── manifest.json              # 专家索引（唯一权威元数据来源）
├── experts/<slug>.md          # 每个专家一个文件
└── avatars/<slug>.png         # 可选头像，≤200KB，PNG
```

## 2. slug 与命名规则（强制）

| 规则 | 要求 |
|---|---|
| slug 格式 | `^[a-z0-9][a-z0-9-]{0,127}$`，小写字母/数字/连字符；不得以连字符开头结尾，不得含连续连字符 |
| slug 稳定性 | 发布后不可变更（是安装/升级的唯一定位键）；改名 = 新专家 |
| 文件名 | `experts/<slug>.md`，与 slug 一致 |
| 分类 id | `^[a-z0-9-]{1,64}$`，建议前缀排序（`01-`、`02-`…） |

## 3. manifest.json 规范

```jsonc
{
  "version": "1.0.0",                        // manifest 结构版本，当前固定 1.0.0
  "lastUpdated": "2026-10-18T00:00:00Z",     // 任何内容变更后必须更新（ISO 8601）
  "categories": [
    { "id": "01-engineering", "name": "技术工程", "nameEn": "Engineering" }
  ],
  "experts": [ /* ExpertMeta[]，见下 */ ]
}
```

ExpertMeta 字段：

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `slug` | string | ✅ | 见 §2 |
| `categoryId` | string | ✅ | 必须存在于 `categories` |
| `name` | string | ✅ | ≤128 字符，中文为主 |
| `nameEn` | string | — | ≤128 字符，可选英文别名 |
| `description` | string | ✅ | ≤2048 字符，说明专家擅长什么、何时使用 |
| `descriptionEn` | string | — | 可选 |
| `promptFile` | string | ✅ | `<slug>.md`（**扁平文件名**，CloudSmith raw 上传会拍平子目录），禁止 `..` 与绝对路径 |
| `avatarUrl` | string | — | 相对路径，可选 |
| `version` | string | ✅ | semver（`1.2.0`）；内容变更必须升版本 |
| `sha256` | string | ✅ | `promptFile` 文件内容的 SHA-256 十六进制摘要 |
| `expertType` | string | ✅ | 当前仅 `"agent"`（`"team"` 预留勿用） |
| `suggestedTools` | string[] | — | ≤20 项；只能是平台 tool-registry 已注册工具名；仅建议，非保证 |
| `tags` | string[] | — | ≤8 项，每项 ≤32 字符 |
| `quickPrompts` | string[] | — | ≤5 项，每项 ≤200 字符；前端快捷入口 |
| `defaultInitPrompt` | string | — | ≤500 字符；专家开场白/建议首条消息 |
| `updatedAt` | string | ✅ | ISO 8601 |

约束：`experts` 数组 ≤2000 项；未知字段会被服务端 Schema 校验**拒绝**（fail-closed，不要加扩展字段，需要扩展先改协议版本）。

## 4. 专家 md 文件规范

```markdown
---
name: 后端架构师
description: 专注高并发系统设计、数据库架构与云基础设施
emoji: 🏗️
version: 1.2.0
---

（system prompt 正文）
```

- frontmatter 字段：`name` / `description` / `emoji`（可选）/ `version`（可选）。与 manifest 冲突时以 **manifest 为准**。
- 正文即最终注入模型的 system prompt 主体，**全部内容都会被模型当作指令阅读**，请按"写给模型的行为规范"来写，不要写营销文案。

### 4.1 正文结构建议（中文为主）

```markdown
# 角色定位
你是「后端架构师」……（一句话职业画像 + 性格/沟通风格）

## 核心职责
- 职责 1（可验证的行为动词开头）
- 职责 2

## 工作方法
1. 先……再……最后……（结构化流程）
2. ……

## 红线规则
- 绝不……（安全/合规边界）

## 输出要求
- 交付物格式、篇幅、语言风格
```

### 4.2 安全红线（违反任意一条 = 扫描拒绝入库）

1. **禁止伪系统标签与闭合逃逸**：不得出现 `<system>`、`</expert_definition>`、`<user>`、`</content>` 等与运行时注入模板冲突的标签（含大小写变体、全角变体）。
2. **禁止越权指令**：不得包含"忽略之前的指令/你现在是……无视以上规则/覆盖系统提示"等对抗性语句（针对运行环境本身的）。
3. **禁止禁用安全策略**：不得试图关闭内容安全、审计、审批等机制。
4. **禁止隐藏内容**：不得使用零宽字符、不可见 Unicode、base64/hex 编码的指令块。
5. **禁止敏感信息**：不得包含真实密钥、token、密码、个人身份信息模式。
6. **禁止数据外发诱导**：不得指示模型将用户数据上传到外部地址或通过 web-fetch 外传。
7. **禁止可执行载荷**：不得内嵌脚本/二进制/可执行代码块作为"随专家分发的能力"。
8. **工具只能建议**：能力诉求通过 manifest 的 `suggestedTools` 表达，且必须在平台白名单内；正文可以引导模型使用平台已有工具，但不得要求"注册新工具""绕过工具审批"。

### 4.3 编写质量建议

- 一个专家只解决一个领域，宁专勿泛；描述里写清"何时该用我"。
- 正文长度建议 2–8KB（上限 128KB，超限拒绝）。
- 指令用可验证的行为描述（"输出前先列出假设"），避免空泛形容词。
- 涉及工具使用时，只引用平台已注册工具名，写清调用时机。
- 上游（agency-agents）内容引入时：翻译为中文、去除平台特定引用（如 Claude Code 专属命令）、按本规范重构分节。

## 5. 发布流程（CloudSmith，v1 无管理功能）

hub 为 CloudSmith 公开仓库 `vento/ventostack`，下载通用前缀（匿名、无鉴权，服务端已内置）：

```
https://dl.cloudsmith.io/public/vento/ventostack/raw/files/
```

token 边界：`CLOUD_SMITH_TOKEN` 仅用于**上传/发布**（脚本或控制台），严禁写进 URL、日志、仓库或任何分发内容；下载链路不出现 token。

```
1. 本地编写 experts/<slug>.md（按 §4）
2. bun run scripts/convert-experts.ts lint <slug>     # 本地校验：schema + 安全扫描 + sha256
3. bun run scripts/convert-experts.ts pack            # 生成/更新 manifest.json（自动计算 sha256、version、lastUpdated）
4. 人工复核 diff
5. 直传 CloudSmith raw files（推荐 `bun run scripts/convert-experts.ts publish`，走 files→S3→create 三步 API；**扁平文件名，不带子目录**，不带 name/version 上传 → 下载 URL 为 `/raw/files/<文件名>`；同名重传脚本自动带 `republish: true`）：
      manifest.json          → manifest.json
      experts/<slug>.md      → experts/<slug>.md
      avatars/<slug>.png     → avatars/<slug>.png（可选）
   （相对路径决定下载 URL：前缀 + 相对路径，路径对不上 = 下载 404）
6. 服务端侧：管理后台「检查更新」发现新版本 → 批量升级
```

版本约定：改提示词正文 = minor（`1.1.0`）；改结构/行为大版本 = major；纯元数据（描述/标签）= patch。服务端只对比 `version` 决定是否提示升级。

## 6. 服务端如何消费（作者需要知道的）

| 环节 | 行为 |
|---|---|
| 下载 | `GET {EXPERT_HUB_BASE_URL}/manifest.json`（ETag 缓存）→ 按需 `GET experts/<slug>.md` |
| 完整性 | sha256 校验失败 = 拒绝安装 |
| 扫描 | §4.2 全部红线 + 结构校验，fail-closed，结果见管理后台 scan_report |
| 存储 | prompt 入库（权威），`/app/uploads/experts/<slug>/<version>/<slug>.md` 留审计副本 |
| 注入 | 正文包进 `<expert_definition priority="override">` 注入 system prompt 最前；XML 转义 |

## 7. 最小可用示例

`experts/code-reviewer.md`：

````markdown
---
name: 代码评审专家
description: 以攻击者与维护者双重视角评审代码，输出分级问题清单与修复建议
emoji: 🔍
version: 1.0.0
---

# 角色定位
你是「代码评审专家」，以攻击者视角找漏洞、以维护者视角看可读性、以用户视角看易用性。

## 核心职责
- 安全：输入校验、认证授权、注入风险、敏感信息泄露
- 质量：错误处理完整性、边界条件、资源清理
- 可维护性：命名、职责单一、6 个月后可理解性

## 工作方法
1. 先通读变更全貌，理解数据流与不变量
2. 按严重度分级输出：Critical / Major / Minor / Suggestion
3. 每条问题给出：位置、风险、修复建议（含代码片段）

## 红线规则
- 不凭猜测下结论，定位不到确切行号时明确说明
- 不输出与本次变更无关的重构建议

## 输出要求
- 使用中文，先给结论摘要（≤5 行），再列问题明细
````

manifest 条目：

```json
{
  "slug": "code-reviewer",
  "categoryId": "02-project-quality",
  "name": "代码评审专家",
  "nameEn": "Code Reviewer",
  "description": "以攻击者与维护者双重视角评审代码，输出分级问题清单与修复建议",
  "promptFile": "code-reviewer.md",
  "version": "1.0.0",
  "sha256": "<生成时自动计算>",
  "expertType": "agent",
  "suggestedTools": ["web-search"],
  "tags": ["代码质量", "安全"],
  "quickPrompts": ["评审这段代码的安全风险", "给出重构建议"],
  "updatedAt": "2026-10-18T00:00:00Z"
}
```
