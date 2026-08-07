/**
 * 远程 OCR 服务实现
 * 通过 HTTP 调用外部 OCR API（PaddleOCR、自定义服务等）
 */
import type { OCRService, OCROptions, OCRResult } from "../types";

export interface RemoteOCRConfig {
  /** 服务 URL（如 http://localhost:8866/predict/ocr_system） */
  serverUrl: string;
  /** 默认语言 */
  defaultLanguage?: string;
  /** 请求超时(ms) */
  timeout?: number;
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /**
   * 请求格式，默认 "paddleocr"
   * - "paddleocr": PaddleOCR HTTP API 格式
   * - "custom": 自定义格式（需提供 formatRequest/formatResponse）
   */
  format?: "paddleocr" | "custom";
  /** 自定义请求格式化（format=custom 时使用） */
  formatRequest?: (imageBase64: string, options?: OCROptions) => unknown;
  /** 自定义响应解析（format=custom 时使用） */
  formatResponse?: (response: unknown) => OCRResult;
}

export function createRemoteOCRService(config: RemoteOCRConfig): OCRService {
  const {
    serverUrl,
    defaultLanguage = "ch",
    timeout = 60000,
    headers = {},
    format = "paddleocr",
    formatRequest,
    formatResponse,
  } = config;

  return {
    name: `remote-ocr (${format})`,

    async recognize(imageBuffer: Buffer, options?: OCROptions): Promise<OCRResult> {
      const language = options?.language ?? defaultLanguage;
      const imageBase64 = imageBuffer.toString("base64");

      let requestBody: unknown;

      if (format === "custom" && formatRequest) {
        requestBody = formatRequest(imageBase64, options);
      } else {
        // PaddleOCR HTTP API 格式
        requestBody = {
          images: [imageBase64],
          lang: language,
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(serverUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(`OCR 服务返回 ${response.status}: ${text.slice(0, 200)}`);
        }

        const data = await response.json();

        if (format === "custom" && formatResponse) {
          return formatResponse(data);
        }

        // PaddleOCR 响应解析
        return parsePaddleOCRResponse(data);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error(`OCR 服务请求超时 (${timeout}ms)`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * 解析 PaddleOCR HTTP API 响应
 *
 * PaddleOCR 返回格式:
 * [
 *   [
 *     [[[x1,y1],[x2,y2],[x3,y3],[x4,y4]], ["text", confidence]],
 *     ...
 *   ]
 * ]
 */
function parsePaddleOCRResponse(data: unknown): OCRResult {
  const result: OCRResult = { text: "", confidence: 1, blocks: [] };

  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    // 尝试兼容 { results: [...] } 格式
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.results)) {
      return parsePaddleOCRResponse(obj.results);
    }
    throw new Error("无法解析 OCR 响应格式");
  }

  const lines: string[] = [];
  const blocks = data[0] as unknown[];
  let totalConfidence = 0;
  let blockCount = 0;

  for (const block of blocks) {
    if (!Array.isArray(block) || block.length < 2) continue;

    const bbox = block[0] as number[][];
    const textInfo = block[1] as [string, number];

    if (!Array.isArray(textInfo) || textInfo.length < 2) continue;

    const text = String(textInfo[0] ?? "");
    const confidence = Number(textInfo[1] ?? 0);

    if (text.trim()) {
      lines.push(text);
      totalConfidence += confidence;
      blockCount++;

      if (Array.isArray(bbox) && bbox.length >= 4) {
        result.blocks!.push({
          text,
          bbox: [
            Math.min(...bbox.map((p) => p[0] ?? 0)),
            Math.min(...bbox.map((p) => p[1] ?? 0)),
            Math.max(...bbox.map((p) => p[0] ?? 0)),
            Math.max(...bbox.map((p) => p[1] ?? 0)),
          ],
          confidence,
        });
      }
    }
  }

  result.text = lines.join("\n");
  result.confidence = blockCount > 0 ? totalConfidence / blockCount : 0;
  return result;
}
