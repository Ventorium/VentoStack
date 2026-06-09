/**
 * connect-adapter.ts — Web Request ↔ Connect 中间件适配层
 *
 * 将 Web 标准的 Request/Response 与 Node.js Connect 风格的
 * IncomingMessage/ServerResponse 进行双向转换。
 *
 * 核心流程：
 *   Web Request → IncomingMessage + ServerResponse → Connect handler → Web Response
 *
 * 使用真实的 node:http / node:net 类以确保最大兼容性。
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { IncomingMessage as NodeIncomingMessage, ServerResponse as NodeServerResponse } from "node:http";
import { Socket } from "node:net";

// ─── 内部辅助 ─────────────────────────────────────────

/**
 * 创建最小化的 Socket 实例。
 * IncomingMessage 构造函数需要一个 socket 参数。
 */
function createMinimalSocket(): Socket {
  const socket = new Socket({ allowHalfOpen: false });
  return socket;
}

/**
 * 将 Web Request 转换为 Node.js IncomingMessage。
 *
 * 映射：method, url, headers, httpVersion。
 * Body 以 ArrayBuffer 形式挂载到内部属性，供需要时读取。
 */
function webRequestToIncomingMessage(webRequest: Request): IncomingMessage {
  const url = new URL(webRequest.url);
  const socket = createMinimalSocket();
  const req = new NodeIncomingMessage(socket);

  req.method = webRequest.method.toUpperCase();
  req.url = url.pathname + url.search;
  req.httpVersion = "1.1";
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;

  // 复制 headers（Web Headers → Node headers 对象）
  const headers: Record<string, string | string[] | undefined> = {};
  webRequest.headers.forEach((value, key) => {
    // set-cookie 可能出现多次，合并为数组
    const existing = headers[key];
    if (key.toLowerCase() === "set-cookie" && existing) {
      headers[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      headers[key] = value;
    }
  });

  // Bun 的 IncomingMessage.headers 初始可能为 null，需要赋值一个空对象
  if (!req.headers) {
    (req as unknown as Record<string, unknown>).headers = {};
  }
  Object.assign(req.headers, headers);

  // rawHeaders（扁平化的 [key, value, key, value, ...] 数组）
  req.rawHeaders = Object.entries(headers).flatMap(([k, v]) => {
    if (Array.isArray(v)) return v.flatMap((item) => [k, item]);
    return [k, v ?? ""];
  });

  // Body：懒加载，仅在需要时读取
  let bodyBuffer: ArrayBuffer | null = null;
  let bodyConsumed = false;

  (req as unknown as Record<string, unknown>)._readBody = async (): Promise<ArrayBuffer | null> => {
    if (bodyConsumed) return bodyBuffer;
    bodyConsumed = true;
    try {
      bodyBuffer = await webRequest.arrayBuffer();
    } catch {
      bodyBuffer = null;
    }
    return bodyBuffer;
  };

  return req;
}

/**
 * 创建收集型 ServerResponse。
 *
 * 拦截 writeHead / setHeader / write / end 操作，
 * 收集 status、headers 和 body 数据。
 * 回调 onFinish 当 res.end() 被调用时触发，
 * 回调 onNext 当 handler 调用 next() 且 res.end() 未被调用时触发。
 */
function createCollectingServerResponse(
  req: IncomingMessage,
  onFinish: (res: ServerResponse) => void,
  onNext: () => void,
): ServerResponse {
  const res = new NodeServerResponse(req);

  let bodyChunks: Uint8Array[] = [];
  let finished = false;

  // 拦截 end — Vite 中间件完成响应时调用
  const originalEnd = res.end.bind(res) as typeof res.end;
  res.end = function (this: ServerResponse, chunk?: unknown, ...args: unknown[]): ServerResponse {
    if (chunk !== undefined) {
      if (typeof chunk === "string") {
        bodyChunks.push(Buffer.from(chunk));
      } else if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
        bodyChunks.push(Buffer.from(chunk as Uint8Array));
      }
    }
    finished = true;
    onFinish(res);
    // 调用原始 end 以避免内部状态异常
    return (originalEnd as (...a: unknown[]) => ServerResponse).apply(this, [chunk, ...args] as unknown[]);
  } as unknown as typeof res.end;

  // 拦截 write — 收集 body 分片
  const originalWrite = res.write.bind(res) as typeof res.write;
  res.write = function (this: ServerResponse, chunk: unknown, ...args: unknown[]): boolean {
    if (chunk !== undefined && chunk !== null) {
      if (typeof chunk === "string") {
        bodyChunks.push(Buffer.from(chunk));
      } else if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
        bodyChunks.push(Buffer.from(chunk as Uint8Array));
      }
    }
    return (originalWrite as (...a: unknown[]) => boolean).apply(this, [chunk, ...args] as unknown[]);
  } as unknown as typeof res.write;

  // 内部访问器：收集到的 body 数据
  (res as unknown as Record<string, unknown>)._getBody = (): Uint8Array | null => {
    if (bodyChunks.length === 0) return null;
    if (bodyChunks.length === 1) return bodyChunks[0]!;
    return Buffer.concat(bodyChunks as Buffer[]);
  };

  (res as unknown as Record<string, unknown>)._isFinished = (): boolean => finished;

  return res;
}

/**
 * 将收集到的 ServerResponse 数据转为 Web Response。
 */
function serverResponseToWebResponse(res: ServerResponse): Response {
  const status = res.statusCode;
  const bodyData = (res as unknown as Record<string, () => Uint8Array | null>)._getBody?.() ?? null;

  // 构建 Web Headers
  const webHeaders = new Headers();
  const rawHeaders = res.getHeaders();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        webHeaders.append(key, String(v));
      }
    } else {
      webHeaders.set(key, String(value));
    }
  }

  if (bodyData) {
    return new Response(bodyData, { status, headers: webHeaders });
  }
  return new Response(null, { status, headers: webHeaders });
}

// ─── 公共 API ─────────────────────────────────────────

/**
 * 将 Web Request 通过 Connect handler 处理，返回 Web Response。
 *
 * @param webRequest - Web 标准请求
 * @param handler    - Connect 风格的中间件处理函数 (req, res, next) => void
 * @returns Response（Vite 处理了请求）或 null（Vite 调用了 next()，未处理）
 */
export async function connectBridge(
  webRequest: Request,
  handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void,
): Promise<Response | null> {
  const req = webRequestToIncomingMessage(webRequest);

  return new Promise<Response | null>((resolve) => {
    let settled = false;

    const res = createCollectingServerResponse(req, () => {
      // res.end() 被调用 — Vite 处理了请求
      if (settled) return;
      settled = true;
      resolve(serverResponseToWebResponse(res));
    }, () => {
      // next() 被调用且 res.end() 未被调用 — Vite 不处理
      if (settled) return;
      settled = true;
      resolve(null);
    });

    try {
      // 调用 Connect handler
      handler(req as IncomingMessage, res as ServerResponse, () => {
        // next() 回调 — Vite 不处理此请求
        if (!settled) {
          settled = true;
          resolve(null);
        }
      });
    } catch (err) {
      if (!settled) {
        settled = true;
        // Connect handler 抛出异常，返回 500
        resolve(new Response(`Vite bridge error: ${err instanceof Error ? err.message : String(err)}`, {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        }));
      }
    }
  });
}
