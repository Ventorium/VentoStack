/**
 * JSONL Session Storage
 *
 * Append-only JSONL 文件存储，对齐参考实现的 JsonlSessionStorage。
 * 每行一个 JSON 对象，第一行是 session header。
 */
import { readFile, appendFile, writeFile, stat, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { SessionMetadata, SessionStorage, SessionTreeEntry, LeafEntry } from "./types";

interface SessionHeader {
  type: "session";
  version: 3;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}

function uuidv7(): string {
  // 简化版 UUID v7（时间排序）
  const now = Date.now();
  const hex = now.toString(16).padStart(12, "0");
  const rand = Array.from({ length: 20 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${rand.slice(0, 3)}-${rand.slice(3, 7)}-${rand.slice(7, 19)}`;
}

function generateEntryId(byId: Map<string, unknown>): string {
  for (let i = 0; i < 100; i++) {
    const id = uuidv7().slice(0, 8);
    if (!byId.has(id)) return id;
  }
  return uuidv7();
}

function leafIdAfterEntry(entry: SessionTreeEntry): string | null {
  return entry.type === "leaf" ? entry.targetId : entry.id;
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await stat(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

export async function createJsonlSessionStorage(
  filePath: string,
  options: { cwd: string; sessionId: string; parentSessionPath?: string },
): Promise<SessionStorage> {
  const header: SessionHeader = {
    type: "session",
    version: 3,
    id: options.sessionId,
    timestamp: new Date().toISOString(),
    cwd: options.cwd,
    ...(options.parentSessionPath === undefined ? {} : { parentSession: options.parentSessionPath }),
  };

  await ensureDir(dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(header)}\n`, "utf-8");

  return createJsonlSessionStorageFromExisting(filePath);
}

export async function loadJsonlSessionStorage(
  filePath: string,
): Promise<SessionStorage> {
  return createJsonlSessionStorageFromExisting(filePath);
}

/**
 * Create a storage immediately while deferring filesystem initialization until
 * the first operation. This keeps harness construction synchronous without
 * falling back to a non-persistent placeholder implementation.
 */
export function createLazyJsonlSessionStorage(
  filePath: string,
  options: { cwd: string; sessionId: string; parentSessionPath?: string },
): SessionStorage {
  const storage = createJsonlSessionStorage(filePath, options);
  return {
    getMetadata: async () => (await storage).getMetadata(),
    getLeafId: async () => (await storage).getLeafId(),
    setLeafId: async (leafId) => (await storage).setLeafId(leafId),
    createEntryId: async () => (await storage).createEntryId(),
    appendEntry: async (entry) => (await storage).appendEntry(entry),
    getEntry: async (id) => (await storage).getEntry(id),
    getEntries: async () => (await storage).getEntries(),
    getPathToRoot: async (leafId) => (await storage).getPathToRoot(leafId),
    async findEntries<TType extends SessionTreeEntry["type"]>(
      type: TType,
    ): Promise<Array<Extract<SessionTreeEntry, { type: TType }>>> {
      return (await storage).findEntries(type);
    },
    getLabel: async (id) => (await storage).getLabel(id),
    fork: async (filePath, options) => (await storage).fork(filePath, options),
  };
}

async function createJsonlSessionStorageFromExisting(
  filePath: string,
): Promise<SessionStorage> {
  const entries: SessionTreeEntry[] = [];
  const byId = new Map<string, SessionTreeEntry>();
  const labelsById = new Map<string, string>();
  let currentLeafId: string | null = null;
  let metadata: SessionMetadata = { id: "", createdAt: "" };

  // 加载现有数据
  async function load(): Promise<void> {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return;

    // 解析 header
    try {
      const header = JSON.parse(lines[0]!) as SessionHeader;
      if (header.type !== "session" || header.version !== 3) {
        throw new Error("Invalid session header");
      }
      metadata = {
        id: header.id,
        createdAt: header.timestamp,
        cwd: header.cwd,
        path: filePath,
      };
    } catch (err) {
      throw new Error(
        `Invalid JSONL session file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 解析 entries
    for (let i = 1; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]!) as SessionTreeEntry;
        entries.push(entry);
        byId.set(entry.id, entry);
        currentLeafId = leafIdAfterEntry(entry);
        if (entry.type === "label") {
          const label = entry.label?.trim();
          if (label) labelsById.set(entry.targetId, label);
          else labelsById.delete(entry.targetId);
        }
      } catch {
        // 跳过无法解析的行
      }
    }
  }

  await load();

  function getMetadata(): Promise<SessionMetadata> {
    return Promise.resolve(metadata);
  }

  function getLeafId(): Promise<string | null> {
    return Promise.resolve(currentLeafId);
  }

  async function setLeafId(leafId: string | null): Promise<void> {
    if (leafId !== null && !byId.has(leafId)) {
      throw new Error(`Entry ${leafId} not found`);
    }
    const entry: LeafEntry = {
      type: "leaf",
      id: generateEntryId(byId),
      parentId: currentLeafId,
      timestamp: new Date().toISOString(),
      targetId: leafId,
    };
    await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf-8");
    entries.push(entry);
    byId.set(entry.id, entry);
    currentLeafId = leafId;
  }

  function createEntryId(): Promise<string> {
    return Promise.resolve(generateEntryId(byId));
  }

  async function appendEntry(entry: SessionTreeEntry): Promise<void> {
    await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf-8");
    entries.push(entry);
    byId.set(entry.id, entry);
    if (entry.type === "label") {
      const label = entry.label?.trim();
      if (label) labelsById.set(entry.targetId, label);
      else labelsById.delete(entry.targetId);
    }
    currentLeafId = leafIdAfterEntry(entry);
  }

  function getEntry(id: string): Promise<SessionTreeEntry | undefined> {
    return Promise.resolve(byId.get(id));
  }

  function getEntries(): Promise<SessionTreeEntry[]> {
    return Promise.resolve([...entries]);
  }

  function getPathToRoot(leafId: string | null): Promise<SessionTreeEntry[]> {
    if (leafId === null) return Promise.resolve([]);
    const path: SessionTreeEntry[] = [];
    let current = byId.get(leafId);
    if (!current)
      throw new Error(`Entry ${leafId} not found`);
    while (current) {
      path.unshift(current);
      if (!current.parentId) break;
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    return Promise.resolve(path);
  }

  function findEntries<TType extends SessionTreeEntry["type"]>(
    type: TType,
  ): Promise<Array<Extract<SessionTreeEntry, { type: TType }>>> {
    return Promise.resolve(
      entries.filter(
        (e): e is Extract<SessionTreeEntry, { type: TType }> =>
          e.type === type,
      ),
    );
  }

  function getLabel(id: string): Promise<string | undefined> {
    return Promise.resolve(labelsById.get(id));
  }

  async function fork(
    filePath: string,
    options: { sessionId: string; parentSessionPath?: string; entries: SessionTreeEntry[] },
  ): Promise<SessionStorage> {
    const header: SessionHeader = {
      type: "session",
      version: 3,
      id: options.sessionId,
      timestamp: new Date().toISOString(),
      cwd: metadata.cwd ?? "",
      ...(options.parentSessionPath === undefined ? {} : { parentSession: options.parentSessionPath }),
    };
    await ensureDir(dirname(filePath));
    const lines = [JSON.stringify(header), ...options.entries.map((entry) => JSON.stringify(entry))];
    await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");
    return createJsonlSessionStorageFromExisting(filePath);
  }

  return {
    getMetadata,
    getLeafId,
    setLeafId,
    createEntryId,
    appendEntry,
    getEntry,
    getEntries,
    getPathToRoot,
    findEntries,
    getLabel,
    fork,
  };
}
