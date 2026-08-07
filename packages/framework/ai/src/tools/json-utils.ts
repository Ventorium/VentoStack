/**
 * JSON 工具
 * 格式化、校验、提取 JSON 数据
 */

export function createJsonFormatTool() {
  return {
    name: "json_format",
    description: "格式化或校验 JSON 字符串。可美化、压缩、或校验 JSON 是否合法。",
    parameters: [
      { name: "input", type: "string" as const, description: "JSON 字符串", required: true },
      { name: "action", type: "string" as const, description: "操作：format（美化）| minify（压缩）| validate（校验）", required: false },
    ],
    riskLevel: "low" as const,
    async handler(params: Record<string, unknown>): Promise<Record<string, unknown>> {
      const input = params.input as string;
      const action = (params.action as string) ?? "format";
      try {
        const parsed = JSON.parse(input);
        if (action === "validate") return { valid: true };
        if (action === "minify") return { result: JSON.stringify(parsed) };
        return { result: JSON.stringify(parsed, null, 2) };
      } catch (e) {
        if (action === "validate") return { valid: false, error: (e as Error).message };
        return { error: `JSON 解析失败: ${(e as Error).message}` };
      }
    },
  };
}

export function createUuidTool() {
  return {
    name: "uuid",
    description: "生成 UUID（通用唯一标识符）",
    parameters: [
      { name: "count", type: "number" as const, description: "生成数量，默认 1", required: false },
    ],
    riskLevel: "low" as const,
    async handler(params: Record<string, unknown>): Promise<Record<string, unknown>> {
      const count = Math.min(20, Math.max(1, Number(params.count) || 1));
      const uuids = Array.from({ length: count }, () => crypto.randomUUID());
      return count === 1 ? { uuid: uuids[0] } : { uuids };
    },
  };
}

export function createBase64Tool() {
  return {
    name: "base64",
    description: "Base64 编码/解码",
    parameters: [
      { name: "input", type: "string" as const, description: "输入文本", required: true },
      { name: "action", type: "string" as const, description: "encode（编码）或 decode（解码）", required: false },
    ],
    riskLevel: "low" as const,
    async handler(params: Record<string, unknown>): Promise<Record<string, unknown>> {
      const input = params.input as string;
      const action = (params.action as string) ?? "encode";
      try {
        if (action === "decode") {
          return { result: Buffer.from(input, "base64").toString("utf-8") };
        }
        return { result: Buffer.from(input, "utf-8").toString("base64") };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  };
}

export function createHashTool() {
  return {
    name: "hash",
    description: "计算文本的哈希值（SHA-256 / SHA-1 / MD5）",
    parameters: [
      { name: "input", type: "string" as const, description: "输入文本", required: true },
      { name: "algorithm", type: "string" as const, description: "算法：sha256（默认）| sha1 | md5", required: false },
    ],
    riskLevel: "low" as const,
    async handler(params: Record<string, unknown>): Promise<Record<string, unknown>> {
      const input = params.input as string;
      const algo = ((params.algorithm as string) ?? "sha256").toLowerCase();
      const supported = new Set(["sha256", "sha1", "md5"]);
      if (!supported.has(algo)) return { error: `不支持的算法: ${algo}` };
      const hasher = new Bun.CryptoHasher(algo as "sha256" | "sha1" | "md5");
      hasher.update(input);
      return { algorithm: algo, hash: hasher.digest("hex") };
    },
  };
}
