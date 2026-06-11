/**
 * 记忆系统服务（Markdown 文件存储模式）
 * 对话历史和长期记忆都以 .md 文件保存
 */
import { resolve, join, basename } from "node:path";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type {
  ConversationMemory,
  LongTermMemory,
  MemoryService,
} from "./types";

export interface MemoryServiceDeps {
  storagePath: string; // /data/memories
  db: unknown;
}

export function createMemoryService(deps: MemoryServiceDeps): MemoryService {
  const { storagePath } = deps;

  function getUserPath(userId: string): string {
    return resolve(storagePath, userId);
  }

  function getConversationsPath(userId: string): string {
    return resolve(getUserPath(userId), "conversations");
  }

  function getLongTermPath(userId: string): string {
    return resolve(getUserPath(userId), "long-term");
  }

  async function ensureDir(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  return {
    async createSession(params) {
      const sessionId = crypto.randomUUID();
      const convPath = getConversationsPath(params.userId);
      await ensureDir(convPath);

      const filePath = join(convPath, `${sessionId}.md`);
      const content = `---
session_id: ${sessionId}
agent_id: ${params.agentId}
created_at: ${new Date().toISOString()}
updated_at: ${new Date().toISOString()}
status: active
---

# 对话

`;

      await writeFile(filePath, content, "utf-8");

      return { sessionId };
    },

    async appendMessage(sessionId, message) {
      // 查找会话文件
      const dirs = existsSync(storagePath)
        ? await readdir(storagePath, { withFileTypes: true })
        : [];

      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const convPath = join(storagePath, dir.name, "conversations");
        const filePath = join(convPath, `${sessionId}.md`);
        if (!existsSync(filePath)) continue;

        const content = await readFile(filePath, "utf-8");
        const role =
          message.role === "user"
            ? "用户"
            : message.role === "assistant"
              ? "助手"
              : "系统";

        const newContent = content + `\n## ${role}\n\n${message.content}\n`;

        // 更新 updated_at
        const updated = newContent.replace(
          /updated_at: .*/,
          `updated_at: ${new Date().toISOString()}`,
        );

        await writeFile(filePath, updated, "utf-8");
        return;
      }
    },

    async getSession(sessionId) {
      const dirs = existsSync(storagePath)
        ? await readdir(storagePath, { withFileTypes: true })
        : [];

      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const convPath = join(storagePath, dir.name, "conversations");
        const filePath = join(convPath, `${sessionId}.md`);
        if (!existsSync(filePath)) continue;

        const content = await readFile(filePath, "utf-8");
        const lines = content.split("\n");
        const messageCount = lines.filter((l) => l.startsWith("## ")).length;

        return {
          sessionId,
          agentId: "",
          userId: dir.name,
          filePath,
          title: `对话 ${sessionId.slice(0, 8)}`,
          status: "active",
          messageCount,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      return null;
    },

    async listSessions(userId, agentId) {
      const convPath = getConversationsPath(userId);
      if (!existsSync(convPath)) return [];

      const files = await readdir(convPath);
      const sessions: ConversationMemory[] = [];

      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const sessionId = file.replace(".md", "");
        const filePath = join(convPath, file);
        const content = await readFile(filePath, "utf-8");
        const lines = content.split("\n");
        const messageCount = lines.filter((l) => l.startsWith("## ")).length;

        sessions.push({
          sessionId,
          agentId: agentId ?? "",
          userId,
          filePath,
          title: `对话 ${sessionId.slice(0, 8)}`,
          status: "active",
          messageCount,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return sessions;
    },

    async deleteSession(sessionId) {
      const dirs = existsSync(storagePath)
        ? await readdir(storagePath, { withFileTypes: true })
        : [];

      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const filePath = join(
          storagePath,
          dir.name,
          "conversations",
          `${sessionId}.md`,
        );
        if (existsSync(filePath)) {
          const { unlink } = await import("node:fs/promises");
          await unlink(filePath);
          return;
        }
      }
    },

    async getHistory(sessionId, limit) {
      const session = await this.getSession(sessionId);
      if (!session) return [];

      const content = await readFile(session.filePath, "utf-8");
      const messages: Array<{ role: string; content: string }> = [];

      // 解析 Markdown 中的消息
      const sections = content.split(/^## /m);
      for (const section of sections) {
        const lines = section.split("\n");
        const roleLine = lines[0]?.trim();
        if (!roleLine) continue;

        let role: string;
        if (roleLine.startsWith("用户")) role = "user";
        else if (roleLine.startsWith("助手")) role = "assistant";
        else continue;

        const msgContent = lines.slice(1).join("\n").trim();
        if (msgContent) {
          messages.push({ role, content: msgContent });
        }
      }

      if (limit && messages.length > limit) {
        return messages.slice(-limit);
      }

      return messages;
    },

    async createLongTermMemory(userId, title, content, tenantId) {
      const ltPath = getLongTermPath(userId);
      await ensureDir(ltPath);

      const filePath = join(ltPath, `${title}.md`);
      const mdContent = `---
user_id: ${userId}
created_at: ${new Date().toISOString()}
updated_at: ${new Date().toISOString()}
---

# ${title}

${content}
`;

      await writeFile(filePath, mdContent, "utf-8");
    },

    async updateLongTermMemory(userId, title, content, tenantId) {
      await this.createLongTermMemory(userId, title, content, tenantId);
    },

    async readLongTermMemory(userId, title) {
      const ltPath = getLongTermPath(userId);
      const filePath = join(ltPath, `${title}.md`);
      if (!existsSync(filePath)) return null;

      const content = await readFile(filePath, "utf-8");
      // 去除 frontmatter
      const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
      return bodyMatch ? bodyMatch[1].trim() : content;
    },

    async listLongTermMemories(userId) {
      const ltPath = getLongTermPath(userId);
      if (!existsSync(ltPath)) return [];

      const files = await readdir(ltPath);
      const memories: LongTermMemory[] = [];

      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const title = file.replace(".md", "");
        const filePath = join(ltPath, file);
        const content = await readFile(filePath, "utf-8");

        memories.push({
          userId,
          filePath,
          title,
          content: content.slice(0, 200), // 预览
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return memories;
    },

    async deleteLongTermMemory(userId, title) {
      const ltPath = getLongTermPath(userId);
      const filePath = join(ltPath, `${title}.md`);
      if (existsSync(filePath)) {
        const { unlink } = await import("node:fs/promises");
        await unlink(filePath);
      }
    },
  };
}
