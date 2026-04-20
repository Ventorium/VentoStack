// @aeron/core - 上传安全检查

export interface UploadOptions {
  maxFileSize?: number;
  maxFiles?: number;
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
  rejectDoubleExtensions?: boolean;
  rejectNullBytes?: boolean;
}

export interface UploadFileInfo {
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
}

export interface UploadResult {
  valid: boolean;
  errors: string[];
  files: UploadFileInfo[];
}

const DANGEROUS_EXTENSIONS = new Set([
  "php", "phtml", "php3", "php4", "php5",
  "exe", "bat", "cmd", "sh", "bash",
  "jsp", "asp", "aspx", "cgi", "pl",
]);

export function sanitizeFilename(name: string): string {
  // 移除空字节
  let cleaned = name.replace(/\0/g, "");
  // 移除路径分隔符
  cleaned = cleaned.replace(/[/\\]/g, "");
  // 移除控制字符（0x00-0x1F, 0x7F）
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, "");
  // 只保留字母数字和 .-_
  cleaned = cleaned.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  // 防止以 . 开头（隐藏文件）
  if (cleaned.startsWith(".")) {
    cleaned = "_" + cleaned.slice(1);
  }
  return cleaned || "unnamed";
}

function hasDoubleExtension(name: string): boolean {
  const parts = name.split(".");
  if (parts.length <= 2) return false;
  // 检查中间扩展名是否为危险扩展名
  for (let i = 1; i < parts.length - 1; i++) {
    if (DANGEROUS_EXTENSIONS.has(parts[i]!.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx + 1).toLowerCase();
}

export function createUploadValidator(options: UploadOptions = {}): {
  validate(request: Request): Promise<UploadResult>;
  sanitizeFilename(name: string): string;
} {
  const maxFileSize = options.maxFileSize ?? 5 * 1024 * 1024; // 5MB
  const maxFiles = options.maxFiles ?? 10;
  const allowedMimeTypes = options.allowedMimeTypes
    ? new Set(options.allowedMimeTypes)
    : null;
  const allowedExtensions = options.allowedExtensions
    ? new Set(options.allowedExtensions.map((e) => e.toLowerCase()))
    : null;
  const rejectDoubleExtensions = options.rejectDoubleExtensions ?? true;
  const rejectNullBytes = options.rejectNullBytes ?? true;

  async function validate(request: Request): Promise<UploadResult> {
    const errors: string[] = [];
    const files: UploadFileInfo[] = [];

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return { valid: false, errors: ["Failed to parse form data"], files: [] };
    }

    const fileEntries: File[] = [];
    for (const [, value] of formData) {
      if (value instanceof File) {
        fileEntries.push(value);
      }
    }

    if (fileEntries.length > maxFiles) {
      errors.push(`Too many files: ${fileEntries.length} (max: ${maxFiles})`);
      return { valid: false, errors, files: [] };
    }

    for (const file of fileEntries) {
      const originalName = file.name;

      // 空字节检查
      if (rejectNullBytes && originalName.includes("\0")) {
        errors.push(`Null byte in filename: ${originalName}`);
        continue;
      }

      // 双扩展名检查
      if (rejectDoubleExtensions && hasDoubleExtension(originalName)) {
        errors.push(`Double extension rejected: ${originalName}`);
        continue;
      }

      // 大小检查
      if (file.size > maxFileSize) {
        errors.push(
          `File too large: ${originalName} (${file.size} bytes, max: ${maxFileSize})`,
        );
        continue;
      }

      // MIME 类型检查
      if (allowedMimeTypes && !allowedMimeTypes.has(file.type)) {
        errors.push(`MIME type not allowed: ${file.type} for ${originalName}`);
        continue;
      }

      // 扩展名检查
      const ext = getExtension(originalName);
      if (allowedExtensions && ext && !allowedExtensions.has(ext)) {
        errors.push(`Extension not allowed: .${ext} for ${originalName}`);
        continue;
      }

      files.push({
        name: sanitizeFilename(originalName),
        originalName,
        size: file.size,
        mimeType: file.type,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      files,
    };
  }

  return { validate, sanitizeFilename };
}
