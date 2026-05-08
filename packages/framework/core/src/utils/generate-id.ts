/**
 * 生成 UUID v4
 *
 * Bun 运行时下 crypto.randomUUID() 始终可用。
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

export const generateId = generateUUID;
