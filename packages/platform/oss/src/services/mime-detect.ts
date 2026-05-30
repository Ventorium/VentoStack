/**
 * MIME 类型检测
 *
 * 基于 magic bytes 检测常见文件类型。
 * 不依赖第三方库，覆盖常见格式。
 */

/** Magic byte 签名表 */
const MAGIC_BYTES: Array<{ mime: string; signature: number[]; offset?: number }> = [
  // Images
  { mime: "image/png", signature: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", signature: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", signature: [0x52, 0x49, 0x46, 0x46], offset: 0 },
  // PDF
  { mime: "application/pdf", signature: [0x25, 0x50, 0x44, 0x46] },
  // ZIP-based
  { mime: "application/zip", signature: [0x50, 0x4b, 0x03, 0x04] },
  // Office (OOXML)
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    signature: [0x50, 0x4b, 0x03, 0x04],
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    signature: [0x50, 0x4b, 0x03, 0x04],
  },
  // GZIP
  { mime: "application/gzip", signature: [0x1f, 0x8b] },
  // RAR
  { mime: "application/x-rar-compressed", signature: [0x52, 0x61, 0x72, 0x21] },
  // MP4
  { mime: "video/mp4", signature: [0x66, 0x74, 0x79, 0x70], offset: 4 },
];

/**
 * 从 buffer 检测 MIME 类型
 * @param data 文件内容的前 N 个字节（至少 12 字节）
 * @returns MIME 类型或 null
 */
export function detectMIME(data: Buffer | Uint8Array): string | null {
  for (const { mime, signature, offset = 0 } of MAGIC_BYTES) {
    if (data.length < offset + signature.length) continue;
    let match = true;
    for (let i = 0; i < signature.length; i++) {
      if (data[offset + i] !== signature[i]) {
        match = false;
        break;
      }
    }
    if (match) return mime;
  }
  return null;
}

/**
 * 从文件扩展名推断 MIME 类型（fallback）
 */
export function mimeFromExtension(ext: string): string | null {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".json": "application/json",
    ".xml": "application/xml",
    ".zip": "application/zip",
    ".gz": "application/gzip",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".ts": "application/typescript",
  };
  return map[ext.toLowerCase()] ?? null;
}
