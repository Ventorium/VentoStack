/**
 * 远程 OCR 配置工厂
 *
 * 生成传给 Rust file-parser 的 PaddleOCR 任务服务配置；
 * 识别本身在 Rust 侧执行，JS 层不再做 HTTP 调用。
 */
import type { OCRService } from "../types";

export interface RemoteOCRConfig {
  /** PaddleOCR 任务服务 URL（…/api/v2/ocr/jobs） */
  serverUrl: string;
  /** 默认语言（如 "chi_sim", "eng"） */
  defaultLanguage?: string;
  /** Bearer token → `Authorization: bearer …` 请求头 */
  token?: string;
  /** 自定义请求头（token 展开的 Authorization 不会被同名小写头覆盖） */
  headers?: Record<string, string>;
  /** 模型名（默认 PaddleOCR-VL-1.6） */
  model?: string;
}

export function createRemoteOCRService(config: RemoteOCRConfig): OCRService {
  const headers: Record<string, string> = { ...config.headers };
  if (
    config.token &&
    !Object.keys(headers).some((name) => name.toLowerCase() === "authorization")
  ) {
    headers.Authorization = `bearer ${config.token}`;
  }

  return {
    endpoint: config.serverUrl,
    language: config.defaultLanguage,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    model: config.model,
  };
}
