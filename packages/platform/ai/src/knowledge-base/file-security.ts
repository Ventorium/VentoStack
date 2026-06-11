/**
 * 文件安全校验
 */

export interface FileSecurityConfig {
  maxFileSize: number;
  maxFilesPerKB: number;
  allowedExtensions: string[];
}

const DEFAULT_SECURITY_CONFIG: FileSecurityConfig = {
  maxFileSize: 500 * 1024 * 1024, // 500MB
  maxFilesPerKB: 5000,
  allowedExtensions: [
    ".md",
    ".txt",
    ".pdf",
    ".docx",
    ".xlsx",
    ".csv",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".html",
    ".json",
  ],
};

export interface FileValidator {
  validateFile(file: { name: string; size: number }): {
    valid: boolean;
    error?: string;
  };
  sanitizePath(path: string): string;
  sanitizeFileName(name: string): string;
}

export function createFileValidator(
  config: Partial<FileSecurityConfig> = {},
): FileValidator {
  const { maxFileSize, allowedExtensions } = {
    ...DEFAULT_SECURITY_CONFIG,
    ...config,
  };

  return {
    validateFile(file) {
      // 文件大小检查
      if (file.size > maxFileSize) {
        return {
          valid: false,
          error: `文件大小 ${Math.round(file.size / 1024 / 1024)}MB 超过限制 ${Math.round(maxFileSize / 1024 / 1024)}MB`,
        };
      }

      // 扩展名检查
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      if (!allowedExtensions.includes(ext)) {
        return {
          valid: false,
          error: `不支持的文件格式 ${ext}，支持的格式：${allowedExtensions.join(", ")}`,
        };
      }

      return { valid: true };
    },

    sanitizePath(path) {
      // 移除路径分隔符，防止路径穿越
      return path
        .replace(/\.\./g, "")
        .replace(/[/\\]/g, "_")
        .replace(/[^\w._-]/g, "");
    },

    sanitizeFileName(name) {
      // 只保留安全字符
      return name
        .replace(/[^\w._-]/g, "_")
        .replace(/_{2,}/g, "_")
        .replace(/^_|_$/g, "");
    },
  };
}
