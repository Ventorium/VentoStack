// @ventostack/core - 上传安全检查

/** 上传校验配置选项 */
export interface UploadOptions {
  /** 最大文件大小（字节），默认 5MB */
  maxFileSize?: number;
  /** 最大文件数量，默认 10 */
  maxFiles?: number;
  /** 允许的 MIME 类型列表 */
  allowedMimeTypes?: string[];
  /** 允许的扩展名列表 */
  allowedExtensions?: string[];
  /** 是否拒绝双扩展名，默认 true */
  rejectDoubleExtensions?: boolean;
  /** 是否拒绝空字节，默认 true */
  rejectNullBytes?: boolean;
}

/** 上传文件信息 */
export interface UploadFileInfo {
  /** 清理后的文件名 */
  name: string;
  /** 原始文件名 */
  originalName: string;
  /** 文件大小（字节） */
  size: number;
  /** MIME 类型 */
  mimeType: string;
}

/** 上传校验结果 */
export interface UploadResult {
  /** 是否通过校验 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
  /** 通过校验的文件信息列表 */
  files: UploadFileInfo[];
}

const DANGEROUS_EXTENSIONS = new Set([
  "php",
  "phtml",
  "php3",
  "php4",
  "php5",
  "exe",
  "bat",
  "cmd",
  "sh",
  "bash",
  "jsp",
  "asp",
  "aspx",
  "cgi",
  "pl",
]);

/**
 * 清理文件名，移除危险字符
 * @param name - 原始文件名
 * @returns 清理后的文件名
 */
export function sanitizeFilename(name: string): string {
  // 移除空字节
  let cleaned = name.replace(/\0/g, "");
  // 移除路径分隔符
  cleaned = cleaned.replace(/[/\\]/g, "");
  // 移除控制字符（0x00-0x1F, 0x7F）
  cleaned = Array.from(cleaned)
    .filter((c) => {
      const code = c.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })
    .join("");
  // 只保留字母数字和 .-_
  cleaned = cleaned.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  // 防止以 . 开头（隐藏文件）
  if (cleaned.startsWith(".")) {
    cleaned = `_${cleaned.slice(1)}`;
  }
  return cleaned || "unnamed";
}

/**
 * 判断文件名是否包含危险的双扩展名
 * @param name - 文件名
 * @returns 是否包含双扩展名
 */
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

/**
 * 获取文件扩展名
 * @param name - 文件名
 * @returns 扩展名（小写）
 */
function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx + 1).toLowerCase();
}

/**
 * 创建上传校验器
 * @param options - 上传校验选项
 * @returns 包含 validate 与 sanitizeFilename 的对象
 */
export function createUploadValidator(options: UploadOptions = {}): {
  /**
   * 校验上传请求
   * @param request - Request 对象
   * @returns 校验结果
   */
  validate(request: Request): Promise<UploadResult>;
  /**
   * 清理文件名
   * @param name - 原始文件名
   * @returns 清理后的文件名
   */
  sanitizeFilename(name: string): string;
} {
  const maxFileSize = options.maxFileSize ?? 5 * 1024 * 1024; // 5MB
  const maxFiles = options.maxFiles ?? 10;
  const allowedMimeTypes = options.allowedMimeTypes ? new Set(options.allowedMimeTypes) : null;
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
      formData = (await request.formData()) as FormData;
    } catch {
      return { valid: false, errors: ["解析表单数据失败"], files: [] };
    }

    const fileEntries: File[] = [];
    for (const value of Array.from(formData.values() as Iterable<unknown>)) {
      if (value instanceof File) {
        fileEntries.push(value);
      }
    }

    if (fileEntries.length > maxFiles) {
      errors.push(`文件数量过多：${fileEntries.length}（最大：${maxFiles}）`);
      return { valid: false, errors, files: [] };
    }

    for (const file of fileEntries) {
      const originalName = file.name;

      // 空字节检查
      if (rejectNullBytes && originalName.includes("\0")) {
        errors.push(`文件名包含非法字符：${originalName}`);
        continue;
      }

      // 双扩展名检查
      if (rejectDoubleExtensions && hasDoubleExtension(originalName)) {
        errors.push(`不允许双扩展名文件：${originalName}`);
        continue;
      }

      // 大小检查
      if (file.size > maxFileSize) {
        errors.push(`文件过大：${originalName}（最大 ${maxFileSize / 1024 / 1024}MB）`);
        continue;
      }

      // MIME 类型检查
      if (allowedMimeTypes && !allowedMimeTypes.has(file.type)) {
        errors.push(`不允许的文件类型：${file.type}（${originalName}）`);
        continue;
      }

      // 扩展名检查
      const ext = getExtension(originalName);
      if (allowedExtensions && ext && !allowedExtensions.has(ext)) {
        errors.push(`不允许的文件扩展名：.${ext}（${originalName}）`);
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
