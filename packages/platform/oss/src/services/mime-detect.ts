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
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".json": "application/json",
    ".zip": "application/zip",
    ".gz": "application/gzip",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
  };
  return map[ext.toLowerCase()] ?? null;
}

/**
 * 上传白名单：允许的扩展名及其期望 MIME。
 *
 * 设计原则：
 * - 明确拒绝可执行/可嵌入脚本的类型（html/htm/svg/xml/js/css 等），
 *   防止同源存储型 XSS（上传恶意 HTML/SVG 后经 /uploads 以 text/html 返回执行）。
 * - 只允许业务常见的非可执行格式（图片、PDF、Office、文本、压缩包、音视频）。
 */
export const UPLOAD_ALLOWED_EXTENSIONS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".json": "application/json",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

/** 静态文件服务扩展名白名单（与上传白名单一致，供 createStaticMiddleware 使用） */
export const STATIC_ALLOWED_EXTENSIONS: string[] = Object.keys(UPLOAD_ALLOWED_EXTENSIONS);

/**
 * 扩展名 → 可校验的 magic bytes 签名类型。
 * 仅对能通过 magic bytes 区分的内容做强校验；ZIP 系（zip/docx/xlsx/pptx）共享同一签名，
 * 由扩展名决定最终 MIME。
 */
function expectedMagicMatches(ext: string, data: Buffer | Uint8Array): boolean | null {
  const sig = ((): number[] | null => {
    switch (ext) {
      case ".png": return [0x89, 0x50, 0x4e, 0x47];
      case ".jpg":
      case ".jpeg": return [0xff, 0xd8, 0xff];
      case ".gif": return [0x47, 0x49, 0x46, 0x38];
      case ".webp": return [0x52, 0x49, 0x46, 0x46];
      case ".pdf": return [0x25, 0x50, 0x44, 0x46];
      case ".zip":
      case ".docx":
      case ".xlsx":
      case ".pptx": return [0x50, 0x4b, 0x03, 0x04];
      case ".gz": return [0x1f, 0x8b];
      case ".mp4": return [0x66, 0x74, 0x79, 0x70];
      default: return null;
    }
  })();
  if (!sig) return null; // 无强签名约束的类型（txt/csv/json/doc/xls/ppt/mp3/wav）跳过

  if (data.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (data[i] !== sig[i]) return false;
  }
  return true;
}

/**
 * 校验上传内容是否安全（扩展名白名单 + magic bytes）。
 *
 * @throws Error 描述拒绝原因（携带 HTTP 语义，调用方转为 400）
 * @returns 权威 MIME（基于扩展名 + 内容检测，绝不采用客户端提供的 contentType）
 */
export function assertSafeUpload(filename: string, data: Buffer | Uint8Array): string {
  const dotIdx = filename.lastIndexOf(".");
  const ext = dotIdx >= 0 ? filename.slice(dotIdx).toLowerCase() : "";
  const expectedMime = UPLOAD_ALLOWED_EXTENSIONS[ext];
  if (!expectedMime) {
    throw new Error(`不允许的文件类型：${ext || "(无扩展名)"}`);
  }

  const magicOk = expectedMagicMatches(ext, data);
  if (magicOk === false) {
    throw new Error(`文件内容与扩展名不匹配：${ext}`);
  }

  // 内容可检测时优先用检测结果，否则用扩展名映射（拒绝客户端伪造 contentType）
  const detected = data.length >= 12 ? detectMIME(data) : null;
  return detected ?? expectedMime;
}
