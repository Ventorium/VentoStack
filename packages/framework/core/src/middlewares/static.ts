/**
 * @ventostack/core - 静态文件服务中间件
 * 提供安全的本地文件服务，内置路径遍历防护
 *
 * 不依赖 node:path，纯字符串操作实现路径安全校验
 */

import type { Middleware } from "../middleware";

/**
 * 静态文件服务选项
 */
export interface StaticOptions {
  /** 文件系统根目录 */
  root: string;
  /** URL 路径前缀（如 "/uploads"） */
  prefix?: string;
  /** 默认 index 文件名（如 "index.html"），不设置则不提供目录索引 */
  index?: string;
  /** 允许的文件扩展名白名单（如 [".jpg", ".png", ".pdf"]），不设置则允许所有 */
  allowedExtensions?: string[];
}

/**
 * 规范化路径：去除尾部斜杠、合并连续斜杠
 */
function normalizePath(p: string): string {
  return p.replace(/\/+$/, "").replace(/\/+/g, "/") || "/";
}

/**
 * 创建静态文件服务中间件
 *
 * 内置安全措施：
 * - 路径遍历防护（过滤 `..`、`.` 和多余斜杠）
 * - 文件存在性检查
 * - 自动设置 Content-Type（由 Bun.file 推断）
 *
 * @param options - 静态文件选项
 * @returns 中间件函数
 *
 * @example
 * ```typescript
 * import { createApp, createStaticMiddleware } from "@ventostack/core";
 *
 * const app = createApp();
 * app.use(createStaticMiddleware({
 *   root: "/data/uploads",
 *   prefix: "/uploads",
 * }));
 * ```
 */
export function createStaticMiddleware(options: StaticOptions): Middleware {
  const { root, prefix = "/", index, allowedExtensions } = options;

  // 预计算规范化根路径（去除尾部斜杠）
  const normalizedRoot = normalizePath(root);
  const normalizedPrefix = normalizePath(prefix);

  return async (ctx, next) => {
    const url = new URL(ctx.request.url);
    const pathname = decodeURIComponent(url.pathname);

    // 仅处理匹配前缀的请求
    if (!pathname.startsWith(normalizedPrefix + "/") && pathname !== normalizedPrefix) {
      return next();
    }

    // 提取前缀之后的相对路径
    const relativePath = pathname.slice(normalizedPrefix.length).replace(/^\/+/, "");

    // 安全过滤：逐段去除 `..` 和 `.`
    const sanitized = relativePath
      .split("/")
      .filter((seg) => seg !== ".." && seg !== "." && seg !== "")
      .join("/");

    if (!sanitized && !index) {
      return next();
    }

    const filePath = sanitized || index || "";

    // 安全：扩展名白名单
    if (allowedExtensions && allowedExtensions.length > 0) {
      const dotIdx = filePath.lastIndexOf(".");
      const ext = dotIdx >= 0 ? filePath.slice(dotIdx).toLowerCase() : "";
      if (!allowedExtensions.includes(ext)) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    // 拼接完整路径并校验不逃逸根目录
    const fullPath = normalizedRoot + "/" + filePath;
    if (!fullPath.startsWith(normalizedRoot + "/") && fullPath !== normalizedRoot) {
      return new Response("Forbidden", { status: 403 });
    }

    // Bun.file 自动推断 Content-Type
    const file = Bun.file(fullPath);
    if (await file.exists()) {
      return new Response(file);
    }

    return next();
  };
}
