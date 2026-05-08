/**
 * 本地文件存储适配器
 */

import { mkdir, writeFile, unlink, stat, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { StorageAdapter } from "./storage";

export interface LocalStorageOptions {
  basePath: string;
  baseUrl?: string;
}

export function createLocalStorage(options: LocalStorageOptions): StorageAdapter {
  const { basePath, baseUrl = "/files" } = options;

  function fullPath(key: string): string {
    // Prevent path traversal
    const safe = key.replace(/\.\./g, "").replace(/^\/+/, "");
    return join(basePath, safe);
  }

  return {
    async write(key, data, _contentType) {
      const filePath = fullPath(key);
      await mkdir(dirname(filePath), { recursive: true });

      if (Buffer.isBuffer(data)) {
        await writeFile(filePath, data);
      } else {
        // ReadableStream → Buffer
        const chunks: Uint8Array[] = [];
        const reader = data.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        await writeFile(filePath, Buffer.concat(chunks));
      }
    },

    async read(key) {
      const filePath = fullPath(key);
      try {
        const file = Bun.file(filePath);
        if (!(await file.exists())) return null;
        return file.stream();
      } catch {
        return null;
      }
    },

    async delete(key) {
      const filePath = fullPath(key);
      try {
        await unlink(filePath);
      } catch {
        // ignore if not exists
      }
    },

    async exists(key) {
      const filePath = fullPath(key);
      try {
        const s = await stat(filePath);
        return s.isFile();
      } catch {
        return false;
      }
    },

    async getSignedUrl(key, _expiresIn) {
      // Local storage returns a static URL; signing is a no-op
      const safe = key.replace(/\.\./g, "").replace(/^\/+/, "");
      return `${baseUrl}/${safe}`;
    },
  };
}
