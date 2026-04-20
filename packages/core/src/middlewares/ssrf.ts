// @aeron/core - SSRF 防护

export interface SSRFOptions {
  allowedHosts?: string[];
  blockedCIDRs?: string[];
  allowPrivate?: boolean;
}

const DEFAULT_BLOCKED_V4 = [
  "127.0.0.0/8",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "0.0.0.0/8",
];

const DEFAULT_BLOCKED_V6 = [
  "::1/128",
  "fc00::/7",
  "fe80::/10",
];

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function ipv4ToNumber(ip: string): number {
  return (
    ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  );
}

function isIPv4(host: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

function isInCIDRv4(ip: string, cidr: string): boolean {
  const [network, bits] = cidr.split("/");
  if (!network || !bits) return false;
  const mask = (~0 << (32 - parseInt(bits, 10))) >>> 0;
  return (ipv4ToNumber(ip) & mask) === (ipv4ToNumber(network) & mask);
}

function ipv6Expand(ip: string): string {
  // 去除 zone id
  const noZone = ip.split("%")[0]!;
  let parts = noZone.split(":");
  const dblIdx = parts.indexOf("");

  if (dblIdx !== -1) {
    // 处理 :: 展开
    const before = parts.slice(0, dblIdx);
    const after = parts.slice(dblIdx + 1).filter((p) => p !== "");
    const missing = 8 - before.length - after.length;
    parts = [...before, ...Array(missing).fill("0"), ...after];
  }

  return parts.map((p) => p.padStart(4, "0")).join(":");
}

function ipv6ToBigInt(ip: string): bigint {
  const expanded = ipv6Expand(ip);
  const hex = expanded.replace(/:/g, "");
  return BigInt("0x" + hex);
}

function isIPv6(host: string): boolean {
  return host.includes(":");
}

function isInCIDRv6(ip: string, cidr: string): boolean {
  const [network, bits] = cidr.split("/");
  if (!network || !bits) return false;
  const prefixLen = parseInt(bits, 10);
  const mask = ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefixLen)) - 1n);
  return (ipv6ToBigInt(ip) & mask) === (ipv6ToBigInt(network) & mask);
}

function isBlockedIP(
  ip: string,
  blockedV4: string[],
  blockedV6: string[],
): boolean {
  if (isIPv4(ip)) {
    return blockedV4.some((cidr) => isInCIDRv4(ip, cidr));
  }
  if (isIPv6(ip)) {
    return blockedV6.some((cidr) => isInCIDRv6(ip, cidr));
  }
  return false;
}

export function createSSRFGuard(options: SSRFOptions = {}): {
  validateURL(url: string): { safe: boolean; reason?: string };
  safeFetch(url: string, init?: RequestInit): Promise<Response>;
} {
  const allowedHosts = new Set(options.allowedHosts ?? []);
  const allowPrivate = options.allowPrivate ?? false;

  const customBlockedCIDRs = options.blockedCIDRs ?? [];
  const blockedV4 = allowPrivate
    ? customBlockedCIDRs.filter((c) => !c.includes(":"))
    : [...DEFAULT_BLOCKED_V4, ...customBlockedCIDRs.filter((c) => !c.includes(":"))];
  const blockedV6 = allowPrivate
    ? customBlockedCIDRs.filter((c) => c.includes(":"))
    : [...DEFAULT_BLOCKED_V6, ...customBlockedCIDRs.filter((c) => c.includes(":"))];

  function validateURL(url: string): { safe: boolean; reason?: string } {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { safe: false, reason: "Invalid URL" };
    }

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return { safe: false, reason: `Protocol not allowed: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");

    // 白名单域名直接放行
    if (allowedHosts.has(hostname)) {
      return { safe: true };
    }

    // 检查 IP 地址
    if (isIPv4(hostname) || isIPv6(hostname)) {
      if (isBlockedIP(hostname, blockedV4, blockedV6)) {
        return { safe: false, reason: `Blocked IP: ${hostname}` };
      }
    }

    return { safe: true };
  }

  async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
    const result = validateURL(url);
    if (!result.safe) {
      throw new Error(`SSRF blocked: ${result.reason}`);
    }
    return fetch(url, init);
  }

  return { validateURL, safeFetch };
}
