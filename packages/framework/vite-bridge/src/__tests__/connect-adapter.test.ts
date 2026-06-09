/**
 * connect-adapter 单元测试
 *
 * 用简单的 Connect handler 验证 Web Request ↔ Connect 的双向转换。
 * 不依赖 Vite，纯适配层逻辑测试。
 */

import { describe, expect, test } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { connectBridge } from "../connect-adapter";

describe("connectBridge", () => {
  test("文本响应：Connect handler 返回文本 → Web Response", async () => {
    const handler = (_req: IncomingMessage, res: ServerResponse, next: () => void) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("hello from connect");
    };

    const request = new Request("http://localhost:9320/test");
    const response = await connectBridge(request, handler);

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    expect(response!.headers.get("content-type")).toBe("text/plain");
    expect(await response!.text()).toBe("hello from connect");
  });

  test("JSON 响应：正确转发 headers", async () => {
    const handler = (_req: IncomingMessage, res: ServerResponse) => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Custom", "value");
      res.writeHead(200);
      res.end('{"ok":true}');
    };

    const request = new Request("http://localhost:9320/api");
    const response = await connectBridge(request, handler);

    expect(response!.status).toBe(200);
    expect(response!.headers.get("content-type")).toBe("application/json");
    expect(response!.headers.get("x-custom")).toBe("value");
    expect(await response!.json()).toEqual({ ok: true });
  });

  test("next() 调用：返回 null（未处理）", async () => {
    const handler = (_req: IncomingMessage, _res: ServerResponse, next: () => void) => {
      next();
    };

    const request = new Request("http://localhost:9320/unhandled");
    const response = await connectBridge(request, handler);

    expect(response).toBeNull();
  });

  test("错误状态码：404 / 500 正确传递", async () => {
    const handler = (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    };

    const request = new Request("http://localhost:9320/missing");
    const response = await connectBridge(request, handler);

    expect(response!.status).toBe(404);
    expect(await response!.text()).toBe("Not Found");
  });

  test("二进制响应：Buffer 正确传递", async () => {
    const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
    const handler = (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(Buffer.from(binaryData));
    };

    const request = new Request("http://localhost:9320/image.png");
    const response = await connectBridge(request, handler);

    expect(response!.status).toBe(200);
    expect(response!.headers.get("content-type")).toBe("image/png");
    const body = await response!.arrayBuffer();
    const bytes = new Uint8Array(body);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
  });

  test("write 分片：多次 write + end 正确拼接", async () => {
    const handler = (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.write("<html>");
      res.write("<body>");
      res.end("hello</body></html>");
    };

    const request = new Request("http://localhost:9320/page");
    const response = await connectBridge(request, handler);

    expect(response!.status).toBe(200);
    expect(await response!.text()).toBe("<html><body>hello</body></html>");
  });

  test("异常捕获：handler 抛出时返回 500", async () => {
    const handler = () => {
      throw new Error("something broke");
    };

    const request = new Request("http://localhost:9320/crash");
    const response = await connectBridge(request, handler);

    expect(response).not.toBeNull();
    expect(response!.status).toBe(500);
    const text = await response!.text();
    expect(text).toContain("something broke");
  });

  test("请求信息传递：method / url / headers 正确映射", async () => {
    let capturedReq: IncomingMessage | null = null;
    const handler = (req: IncomingMessage, res: ServerResponse) => {
      capturedReq = req;
      res.writeHead(200);
      res.end("ok");
    };

    const request = new Request("http://localhost:9320/path?query=1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test": "value",
      },
    });
    await connectBridge(request, handler);

    expect(capturedReq).not.toBeNull();
    expect(capturedReq!.method).toBe("POST");
    expect(capturedReq!.url).toBe("/path?query=1");
    expect(capturedReq!.headers["content-type"]).toBe("application/json");
    expect(capturedReq!.headers["x-test"]).toBe("value");
  });

  test("并发安全：多个请求互不干扰", async () => {
    let counter = 0;
    const handler = (_req: IncomingMessage, res: ServerResponse) => {
      counter++;
      const current = counter;
      res.writeHead(200);
      res.end(`response-${current}`);
    };

    const requests = Array.from({ length: 10 }, (_, i) =>
      connectBridge(new Request(`http://localhost:9320/concurrent/${i}`), handler),
    );

    const responses = await Promise.all(requests);
    for (const response of responses) {
      expect(response).not.toBeNull();
      expect(response!.status).toBe(200);
    }
    // 每个 response 的 body 应该是递增的 counter 值
    const bodies = await Promise.all(responses.map((r) => r!.text()));
    const uniqueBodies = new Set(bodies);
    expect(uniqueBodies.size).toBe(10);
  });
});
