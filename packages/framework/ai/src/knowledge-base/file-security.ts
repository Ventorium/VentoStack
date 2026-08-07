/**
 * 文件安全校验
 * 更新：支持 file2md 的全部格式
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
    // 文本/Markdown
    ".md", ".mdx", ".txt", ".log",
    // 文档
    ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls",
    // 数据格式
    ".csv", ".json", ".yaml", ".yml", ".toml", ".xml",
    // 图片（OCR）
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff",
    // 网页
    ".html", ".htm",
    // 电子书
    ".epub",
    // 压缩包
    ".zip",
    // 源代码
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java",
    ".c", ".cpp", ".cs", ".sql", ".sh", ".vue", ".svelte",
    // 配置
    ".ini", ".cfg", ".env", ".conf", ".properties",
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
      if (file.size > maxFileSize) {
        return {
          valid: false,
          error: `文件大小 ${Math.round(file.size / 1024 / 1024)}MB 超过限制 ${Math.round(maxFileSize / 1024 / 1024)}MB`,
        };
      }

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
      return path
        .replace(/\.\./g, "")
        .replace(/[/\\]/g, "_")
        .replace(/[^\w._-]/g, "");
    },

    sanitizeFileName(name) {
      return name
        .replace(/[^\w._-]/g, "_")
        .replace(/_{2,}/g, "_")
        .replace(/^_|_$/g, "");
    },
  };
}
