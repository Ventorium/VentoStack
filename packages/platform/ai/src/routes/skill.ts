/**
 * Skill 管理路由
 * 包含商店搜索/详情 + 已安装 CRUD + 安装/同步/升级
 */
import { createRouter, success, paginated, fail, handleError, parseBody, pageOf } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { SkillStoreService } from "../services/skill-store";
import type { createSkillService } from "../services/skill";
import type { LLMGateway } from "../llm-gateway/types";
import { join } from "node:path";
import { mkdir, writeFile, readdir, stat, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

type SkillSvc = ReturnType<typeof createSkillService>;

// ── 在线创建 skill 的会话存储 ──
interface OnlineSession {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  workspacePath: string;
  skillName: string;
  createdAt: number;
}
const onlineSessions = new Map<string, OnlineSession>();

export function createSkillRoutes(
  skillService: SkillSvc,
  storeService: SkillStoreService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
  deps?: { llmGateway?: LLMGateway; storagePath?: string },
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // ── 商店搜索 ──
  router.get(
    "/api/ai/skills/store/search",
    perm("ai:skill", "list"),
    async (ctx) => {
      try {
        const q = ctx.query as Record<string, unknown>;
        const keyword = (q.keyword as string) ?? "";
        const page = Number(q.page) || 1;
        const pageSize = Math.min(50, Number(q.pageSize) || 24);
        const result = await storeService.search(keyword, page, pageSize);
        return success(result);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 商店详情 ──
  router.get(
    "/api/ai/skills/store/:slug",
    perm("ai:skill", "list"),
    async (ctx) => {
      try {
        const slug = (ctx.params as Record<string, string>).slug!;
        const detail = await storeService.getDetail(slug);
        const evaluation = await storeService.getEvaluation(slug);
        const recommendations = await storeService.getRecommendations(slug, 3);
        return success({ ...detail, evaluation, recommendations });
      } catch (e) { return handleError(e); }
    },
  );

  // ── 商店文件列表 ──
  router.get(
    "/api/ai/skills/store/:slug/files",
    perm("ai:skill", "list"),
    async (ctx) => {
      try {
        const slug = (ctx.params as Record<string, string>).slug!;
        const q = ctx.query as Record<string, unknown>;
        const version = (q.version as string) ?? "";
        if (!version) return fail("version 参数必填", 400, 400);
        const files = await storeService.getFiles(slug, version);
        return success(files);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 商店文件内容 ──
  router.get(
    "/api/ai/skills/store/:slug/file",
    perm("ai:skill", "list"),
    async (ctx) => {
      try {
        const slug = (ctx.params as Record<string, string>).slug!;
        const q = ctx.query as Record<string, unknown>;
        const path = (q.path as string) ?? "";
        const version = (q.version as string) ?? "";
        if (!path || !version) return fail("path 和 version 参数必填", 400, 400);
        const content = await storeService.getFileContent(slug, path, version);
        return success({ path, content });
      } catch (e) { return handleError(e); }
    },
  );

  // ── 从商店安装 ──
  router.post(
    "/api/ai/skills/store/:slug/install",
    perm("ai:skill", "create"),
    async (ctx) => {
      try {
        const slug = (ctx.params as Record<string, string>).slug!;
        const body = await parseBody(ctx.request);
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const result = await skillService.installFromStore({
          slug,
          version: body.version as string | undefined,
          tenantId,
        });
        return success(result);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 已安装列表 ──
  router.get(
    "/api/ai/skills",
    perm("ai:skill", "list"),
    async (ctx) => {
      try {
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const q = ctx.query as Record<string, unknown>;
        const { page, pageSize } = pageOf(q);
        const source = q.source as string | undefined;
        const enabled = q.enabled !== undefined ? q.enabled === "true" || q.enabled === true : undefined;
        const result = await skillService.list(tenantId, { source, enabled, page, pageSize });
        return paginated(result.list, result.total, page, pageSize);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 已安装详情 ──
  router.get(
    "/api/ai/skills/:id",
    perm("ai:skill", "query"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
      const skill = await skillService.getById(id, tenantId);
      if (!skill) return fail("Skill 不存在", 404, 404);
      return success(skill);
    },
  );

  // ── 文件列表 ──
  router.get(
    "/api/ai/skills/:id/files",
    perm("ai:skill", "query"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
      const skill = await skillService.getById(id, tenantId);
      if (!skill) return fail("Skill 不存在", 404, 404);
      // 上传的技能从磁盘重新扫描，确保路径正确
      if (skill.source === "upload") {
        const files = await skillService.rescanFileTree(id, tenantId);
        return success(files);
      }
      const tree = typeof skill.fileTree === "string" ? JSON.parse(skill.fileTree) : (skill.fileTree ?? []);
      return success(tree);
    },
  );

  // ── 文件内容 ──
  router.get(
    "/api/ai/skills/:id/file",
    perm("ai:skill", "query"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const q = ctx.query as Record<string, unknown>;
        const path = q.path as string;
        if (!path) return fail("path 参数必填", 400, 400);
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const content = await skillService.getFileContent(id, path, tenantId);
        if (content === null) return fail("文件不存在", 404, 404);
        return success({ path, content });
      } catch (e) { return handleError(e); }
    },
  );

  // ── 写入文件内容（仅上传安装的技能） ──
  router.put(
    "/api/ai/skills/:id/file",
    perm("ai:skill", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const q = ctx.query as Record<string, unknown>;
        const path = q.path as string;
        if (!path) return fail("path 参数必填", 400, 400);
        const body = await parseBody(ctx.request);
        if (typeof body.content !== "string") return fail("content 字段必填", 400, 400);
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        await skillService.writeFileContent(id, path, body.content as string, tenantId);
        return success(null);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 更新启用/禁用 ──
  router.put(
    "/api/ai/skills/:id",
    perm("ai:skill", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const body = await parseBody(ctx.request);
        if (body.enabled !== undefined) {
          await skillService.setEnabled(id, tenantId, body.enabled as boolean);
        }
        return success(null);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 卸载 ──
  router.delete(
    "/api/ai/skills/:id",
    perm("ai:skill", "delete"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        await skillService.uninstall(id, tenantId);
        return success(null);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 同步（检查最新版本 + 更新元数据） ──
  router.post(
    "/api/ai/skills/:id/sync",
    perm("ai:skill", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const result = await skillService.syncSkill(id, tenantId);
        return success(result);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 升级到最新版本 ──
  router.post(
    "/api/ai/skills/:id/upgrade",
    perm("ai:skill", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const result = await skillService.upgrade(id, tenantId);
        return success(result);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 批量检查更新 ──
  router.post(
    "/api/ai/skills/check-updates",
    perm("ai:skill", "list"),
    async (ctx) => {
      try {
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const updates = await skillService.checkUpdates(tenantId);
        return success({ updates, count: updates.length });
      } catch (e) { return handleError(e); }
    },
  );

  // ── 上传 zip 安装 ──
  router.post(
    "/api/ai/skills/upload",
    perm("ai:skill", "create"),
    async (ctx) => {
      try {
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const formData = await ctx.request.formData();
        const file = formData.get("file") as File | null;
        const slug = formData.get("slug") as string;
        const name = formData.get("name") as string;
        const description = formData.get("description") as string | null;

        if (!file) return fail("请上传 zip 文件", 400, 400);
        if (!slug) return fail("slug 必填", 400, 400);
        if (!name) return fail("name 必填", 400, 400);

        const zipBuffer = Buffer.from(await file.arrayBuffer());
        const result = await skillService.installFromUpload({
          slug, name, description: description ?? undefined, zipBuffer, tenantId,
        });
        return success(result);
      } catch (e) { return handleError(e); }
    },
  );

  
  // ── 在线创建 Skill ──
  const SKILL_CREATOR_SYSTEM_PROMPT = `You are a skill creator assistant. You help users create Skills (modular knowledge packages) for an AI agent system.

A Skill consists of:
- SKILL.md (required): YAML frontmatter with name + description, then markdown instructions
- Optional: scripts/, references/, assets/ directories

When the user describes what they want, you should:
1. Ask clarifying questions if needed
2. Generate the SKILL.md content
3. Generate any supporting files

IMPORTANT: When generating files, wrap each file in a fenced code block with the filename as a tag:
\`\`\`file:SKILL.md
---
name: my-skill
description: What this skill does and when to use it
---
# My Skill
...content...
\`\`\`

\`\`\`file:scripts/helper.py
#!/usr/bin/env python3
...content...
\`\`\`

Be concise. Ask one question at a time. When the user says "done" or "install", finalize the skill.`;

  // 启动在线创建会话
  router.post(
    "/api/ai/skills/create-online/start",
    perm("ai:skill", "create"),
    async (ctx) => {
      try {
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const sessionId = crypto.randomUUID();
        const storagePath = deps?.storagePath ?? "./data/skills";
        const workspacePath = join(storagePath, ".online", sessionId);
        await mkdir(workspacePath, { recursive: true });

        const session: OnlineSession = {
          messages: [{ role: "system", content: SKILL_CREATOR_SYSTEM_PROMPT }],
          workspacePath,
          skillName: "",
          createdAt: Date.now(),
        };
        onlineSessions.set(sessionId, session);

        return success({ sessionId, message: "你好！请描述你想要创建的技能，我来帮你生成。" });
      } catch (e) { return handleError(e); }
    },
  );

  // 发送消息
  router.post(
    "/api/ai/skills/create-online/message",
    perm("ai:skill", "create"),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const sessionId = body.sessionId as string;
        const message = body.message as string;
        if (!sessionId || !message) return fail("sessionId 和 message 必填", 400, 400);

        const session = onlineSessions.get(sessionId);
        if (!session) return fail("会话不存在", 404, 404);
        if (!deps?.llmGateway) return fail("LLM 服务未配置", 500, 500);

        session.messages.push({ role: "user", content: message });

        // 调用 LLM
        const result = await deps.llmGateway.chat({
          model: "default",
          messages: session.messages,
          maxTokens: 4096,
        });

        const assistantContent = result.content;
        session.messages.push({ role: "assistant", content: assistantContent });

        // 解析 AI 生成的文件
        const fileRegex = /\`\`\`file:(.+?)\n([\s\S]*?)\`\`\`/g;
        let match: RegExpExecArray | null;
        const filesWritten: string[] = [];
        while ((match = fileRegex.exec(assistantContent)) !== null) {
          const filePath = match[1]!.trim();
          const fileContent = match[2]!;
          const fullPath = join(session.workspacePath, filePath);
          await mkdir(join(fullPath, ".."), { recursive: true });
          await writeFile(fullPath, fileContent, "utf-8");
          filesWritten.push(filePath);
          if (filePath === "SKILL.md") {
            // 尝试从 frontmatter 提取 name
            const nameMatch = fileContent.match(/^---[\s\S]*?name:\s*(.+?)\n/m);
            if (nameMatch) session.skillName = nameMatch[1]!.trim();
          }
        }

        // 获取文件树
        const fileTree = await scanWorkspace(session.workspacePath);

        return success({ content: assistantContent, filesWritten, fileTree });
      } catch (e) { return handleError(e); }
    },
  );

  // 获取文件树
  router.get(
    "/api/ai/skills/create-online/:sessionId/files",
    perm("ai:skill", "query"),
    async (ctx) => {
      const sessionId = (ctx.params as Record<string, string>).sessionId!;
      const session = onlineSessions.get(sessionId);
      if (!session) return fail("会话不存在", 404, 404);
      const fileTree = await scanWorkspace(session.workspacePath);
      return success(fileTree);
    },
  );

  // 获取文件内容
  router.get(
    "/api/ai/skills/create-online/:sessionId/file",
    perm("ai:skill", "query"),
    async (ctx) => {
      const sessionId = (ctx.params as Record<string, string>).sessionId!;
      const path = ((ctx.query as Record<string, string>)?.path ?? "") as string;
      if (!path) return fail("path 参数必填", 400, 400);
      const session = onlineSessions.get(sessionId);
      if (!session) return fail("会话不存在", 404, 404);
      const filePath = join(session.workspacePath, path);
      if (!existsSync(filePath)) return fail("文件不存在", 404, 404);
      const content = await readFile(filePath, "utf-8");
      return success({ path, content });
    },
  );

  // 安装在线创建的 skill
  router.post(
    "/api/ai/skills/create-online/:sessionId/install",
    perm("ai:skill", "create"),
    async (ctx) => {
      try {
        const sessionId = (ctx.params as Record<string, string>).sessionId!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const session = onlineSessions.get(sessionId);
        if (!session) return fail("会话不存在", 404, 404);

        // 读取生成的文件
        const fileTree = await scanWorkspace(session.workspacePath);
        if (!fileTree.some(f => f.path === "SKILL.md")) return fail("缺少 SKILL.md 文件", 400, 400);

        const skillMdContent = await readFile(join(session.workspacePath, "SKILL.md"), "utf-8");
        const readmeEntry = fileTree.find(f => f.path === "README.md");
        const readmeContent = readmeEntry ? await readFile(join(session.workspacePath, "README.md"), "utf-8") : null;

        // 读取所有文件内容
        const files: Array<{ path: string; content: Buffer }> = [];
        for (const f of fileTree) {
          const content = await readFile(join(session.workspacePath, f.path));
          files.push({ path: f.path, content });
        }

        const slug = session.skillName || "online-skill-" + sessionId.slice(0, 8);
        const name = session.skillName || slug;
        const result = await skillService.installFromUpload({
          slug, name, description: "在线创建的技能",
          zipBuffer: Buffer.alloc(0), // not used for online skills
          tenantId,
          filesOverride: files,
          skillMdContentOverride: skillMdContent,
          readmeContentOverride: readmeContent,
          fileTreeOverride: fileTree,
        });

        // 清理会话
        onlineSessions.delete(sessionId);

        return success(result);
      } catch (e) { return handleError(e); }
    },
  );

  // 辅助函数：扫描工作区文件树
  async function scanWorkspace(dirPath: string, rel: string = ""): Promise<Array<{ path: string; size: number }>> {
    const results: Array<{ path: string; size: number }> = [];
    if (!existsSync(dirPath)) return results;
    const items = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
    for (const item of items) {
      const itemRel = rel ? `${rel}/${item.name}` : item.name;
      if (item.isDirectory()) {
        const childFiles = await scanWorkspace(join(dirPath, item.name), itemRel);
        results.push(...childFiles);
      } else {
        const s = await stat(join(dirPath, item.name)).catch(() => null);
        results.push({ path: itemRel, size: s?.size ?? 0 });
      }
    }
    return results;
  }

return router;
}
