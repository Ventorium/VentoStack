// @ventostack/core - SSRF 防护

import { lookup } from "node:dns/promises";

/** SSRF 防护配置选项 */
export interface SSRFOptions {
  /** 允许的域名白名单 */
  allowedHosts?: string[];
  /** 额外阻塞的 CIDR */
  blockedCIDRs?: string[];
  /** 是否允许访问私有地址 */
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

const DEFAULT_BLOCKED_V6 = ["::1/128", "fc00::/7", "fe80::/10"];

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const LOCALHOST_HOSTS = new Set(["localhost"]);

/**
 * 将 IPv4 字符串转为数值
 * @param ip - IP 地址
 * @returns 数值
 */
function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number.parseInt(octet, 10), 0) >>> 0;
}

/**
 * 判断是否为 IPv4
 * @param host - 主机字符串
 * @returns 是否为 IPv4
 */
function isIPv4(host: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * 判断 IPv4 是否在 CIDR 内
 * @param ip - IP 地址
 * @param cidr - CIDR
 * @returns 是否在范围内
 */
function isInCIDRv4(ip: string, cidr: string): boolean {
  const [network, bits] = cidr.split("/");
  if (!network || !bits) return false;
  const mask = (~0 << (32 - Number.parseInt(bits, 10))) >>> 0;
  return (ipv4ToNumber(ip) & mask) === (ipv4ToNumber(network) & mask);
}

/**
 * 展开 IPv6 地址
 * @param ip - IPv6 地址
 * @returns 展开后的完整地址
 */
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

/**
 * 将 IPv6 字符串转为 BigInt
 * @param ip - IPv6 地址
 * @returns BigInt 数值
 */
function ipv6ToBigInt(ip: string): bigint {
  const expanded = ipv6Expand(ip);
  const hex = expanded.replace(/:/g, "");
  return BigInt(`0x${hex}`);
}

/**
 * 判断是否为 IPv6
 * @param host - 主机字符串
 * @returns 是否为 IPv6
 */
function isIPv6(host: string): boolean {
  return host.includes(":");
}

/**
 * 判断 IPv6 是否在 CIDR 内
 * @param ip - IP 地址
 * @param cidr - CIDR
 * @returns 是否在范围内
 */
function isInCIDRv6(ip: string, cidr: string): boolean {
  const [network, bits] = cidr.split("/");
  if (!network || !bits) return false;
  const prefixLen = Number.parseInt(bits, 10);
  const mask = ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefixLen)) - 1n);
  return (ipv6ToBigInt(ip) & mask) === (ipv6ToBigInt(network) & mask);
}

/**
 * 判断 IP 是否被阻塞
 * @param ip - IP 地址
 * @param blockedV4 - 阻塞的 IPv4 CIDR 列表
 * @param blockedV6 - 阻塞的 IPv6 CIDR 列表
 * @returns 是否被阻塞
 */
function isBlockedIP(ip: string, blockedV4: string[], blockedV6: string[]): boolean {
  if (isIPv4(ip)) {
    return blockedV4.some((cidr) => isInCIDRv4(ip, cidr));
  }
  if (isIPv6(ip)) {
    return blockedV6.some((cidr) => isInCIDRv6(ip, cidr));
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  return (
    LOCALHOST_HOSTS.has(hostname.toLowerCase()) || hostname.toLowerCase().endsWith(".localhost")
  );
}

/**
 * 创建 SSRF 防护守卫
 * @param options - 配置选项
 * @returns 包含 validateURL 与 safeFetch 的对象
 */
export function createSSRFGuard(options: SSRFOptions = {}): {
  /**
   * 校验 URL 是否安全
   * @param url - 待校验 URL
   * @returns 校验结果
   */
  validateURL(url: string): { safe: boolean; reason?: string };
  /**
   * 安全地发起 fetch，自动校验 URL
   * @param url - 请求地址
   * @param init - fetch 选项
   * @returns Response
   */
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

    if (!allowPrivate && isBlockedHostname(hostname)) {
      return { safe: false, reason: `Blocked hostname: ${hostname}` };
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

    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
    if (!allowedHosts.has(hostname) && !allowPrivate && !isIPv4(hostname) && !isIPv6(hostname)) {
      const resolved = await lookup(hostname, { all: true, verbatim: true });
      if (resolved.length === 0) {
        throw new Error(`SSRF blocked: Unable to resolve hostname: ${hostname}`);
      }

      const blockedAddress = resolved.find((record) =>
        isBlockedIP(record.address, blockedV4, blockedV6),
      );
      if (blockedAddress) {
        throw new Error(
          `SSRF blocked: Hostname ${hostname} resolved to blocked IP ${blockedAddress.address}`,
        );
      }
    }

    return fetch(url, init);
  }

  return { validateURL, safeFetch };
}
