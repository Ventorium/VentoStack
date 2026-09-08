/**
 * OCR 服务连通性测试
 *
 * 用与生产解析完全相同的链路（Rust file-parser → 远程 PaddleOCR 任务服务）
 * 识别一张程序生成的含 "TEST" 字样的 PNG 图片，验证地址、Token、模型配置是否可用。
 */
import { deflateSync } from "node:zlib";
import { createRemoteOCRService, type RemoteOCRConfig } from "./remote";
import { buildOptionsJson } from "../parsers/native";

export interface OcrTestResult {
  ok: boolean;
  /** OCR 识别出的文本（成功时） */
  text?: string;
  elapsedMs: number;
  error?: string;
}

/** 最小 PNG 编码：8 位灰度、无滤波 */
function encodeGrayPng(width: number, height: number, pixels: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale

  const stride = width + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * stride + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

/** 5x7 点阵字体（列位图，每字节一列，低位在上） */
const FONT_5X7: Record<string, number[]> = {
  T: [0x7f, 0x7f, 0x09, 0x09, 0x09],
  E: [0x7f, 0x7f, 0x49, 0x59, 0x41],
  S: [0x27, 0x7f, 0x7f, 0x41, 0x63],
};

/** 生成含指定 ASCII 文本的白底黑字 PNG（4x 放大） */
export function renderTextPng(text: string): Buffer {
  const scale = 4;
  const charW = 5;
  const gap = 2;
  const rows = 7;
  const width = (text.length * (charW + gap) - gap) * scale;
  const height = rows * scale;
  const pixels = Buffer.alloc(width * height, 0xff);

  for (let i = 0; i < text.length; i++) {
    const glyph = FONT_5X7[text[i]!] ?? FONT_5X7["E"]!;
    const ox = i * (charW + gap) * scale;
    for (let col = 0; col < charW; col++) {
      for (let row = 0; row < rows; row++) {
        if ((glyph[col]! >> row) & 1) {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              const x = ox + col * scale + dx;
              const y = row * scale + dy;
              pixels[y * width + x] = 0x00;
            }
          }
        }
      }
    }
  }
  return encodeGrayPng(width, height, pixels);
}

/**
 * 测试远程 OCR 服务：提交一张含 "TEST" 的图片走完整解析链路。
 * 任一环节（网络、鉴权、模型、识别）失败都会在结果中体现。
 */
export async function testOcrService(
  config: RemoteOCRConfig,
  timeoutMs = 30_000,
): Promise<OcrTestResult> {
  const start = Date.now();
  try {
    if (!config.serverUrl) {
      return { ok: false, elapsedMs: 0, error: "缺少服务地址" };
    }
    const ocr = createRemoteOCRService(config);
    const optionsJson = buildOptionsJson(ocr);
    const image = renderTextPng("TEST");

    const { convertBytes } = await import("@ventostack/file-parser");
    const task = convertBytes(image, "ocr-test.png", optionsJson);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`测试超时（${timeoutMs / 1000}s）`)), timeoutMs),
    );
    const markdown = await Promise.race([task, timeout]);

    const text = markdown.trim();
    return { ok: true, text: text || undefined, elapsedMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      elapsedMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
