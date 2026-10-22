import { VentoStackError } from '@ventostack/core';
import type { RuntimeHostInfo, RuntimeSandbox } from './types';

export interface RuntimeProbeResult {
  latencyMs: number;
  info: RuntimeHostInfo | null;
  sandboxes: RuntimeSandbox[];
}

function probeError(code: string, message: string, status = 502): Error {
  return new VentoStackError(message, status, code);
}

/**
 * 宿主地址校验（SSRF 纵深防御）。
 *
 * 宿主通常位于内网，因此允许 RFC1918/私网地址；禁止云元数据、链路本地、
 * 未指定地址、userinfo 和重定向。平台管理员操作也走同一校验。
 */
export function validateRuntimeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 512) {
    throw probeError('RUNTIME_HOST_URL_INVALID', '宿主地址不能为空且不能超过 512 字符', 400);
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw probeError('RUNTIME_HOST_URL_INVALID', '宿主地址必须是合法的 http/https URL', 400);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw probeError('RUNTIME_HOST_URL_INVALID', '宿主地址仅支持 http/https', 400);
  }
  if (url.username || url.password) {
    throw probeError('RUNTIME_HOST_URL_INVALID', '宿主地址不能包含用户名或密码', 400);
  }
  if (url.search || url.hash) {
    throw probeError('RUNTIME_HOST_URL_INVALID', '宿主地址不能包含查询参数或片段', 400);
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const blocked = [
    '169.254.169.254',
    'metadata.google.internal',
    'metadata',
    'fd00:ec2::254',
    '0.0.0.0',
    '::',
  ];
  if (
    blocked.includes(hostname) ||
    hostname.startsWith('169.254.') ||
    hostname.startsWith('fe80:')
  ) {
    throw probeError('RUNTIME_HOST_URL_INVALID', '宿主地址指向被禁止的链路本地/元数据地址', 400);
  }
  return url.toString().replace(/\/+$/, '');
}

async function fetchJson<T>(
  url: string,
  token: string | undefined,
  timeoutMs: number,
): Promise<{ status: number; body: T | null }> {
  const response = await fetch(url, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body: T | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as T;
    } catch {
      body = null;
    }
  }
  return { status: response.status, body };
}

/** 探活并读取宿主信息；/info 缺失时兼容旧服务。 */
export async function probeRuntimeHost(
  baseUrl: string,
  token: string,
  timeoutMs: number,
): Promise<RuntimeProbeResult> {
  const startedAt = Date.now();
  const root = validateRuntimeBaseUrl(baseUrl);

  let health: Response;
  try {
    health = await fetch(`${root}/health`, {
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw probeError(
      'RUNTIME_HOST_OFFLINE',
      `无法连接宿主：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!health.ok) {
    throw probeError(
      'RUNTIME_HOST_OFFLINE',
      `宿主健康检查失败（HTTP ${health.status}）`,
    );
  }

  const infoResult = await fetchJson<RuntimeHostInfo>(`${root}/info`, token, timeoutMs).catch(
    (error: unknown) => {
      throw probeError(
        'RUNTIME_HOST_OFFLINE',
        `读取宿主信息失败：${error instanceof Error ? error.message : String(error)}`,
      );
    },
  );
  if (infoResult.status === 401 || infoResult.status === 403) {
    throw probeError('RUNTIME_HOST_UNAUTHORIZED', '宿主 Token 无效或已失效', 401);
  }
  if (infoResult.status >= 500) {
    throw probeError('RUNTIME_HOST_ERROR', `宿主信息接口异常（HTTP ${infoResult.status}）`);
  }
  const info = infoResult.status === 200 ? infoResult.body : null;

  const sandboxesResult = await fetchJson<RuntimeSandbox[] | { sandboxes?: RuntimeSandbox[] }>(
    `${root}/sandboxes`,
    token,
    timeoutMs,
  ).catch((error: unknown) => {
    throw probeError(
      'RUNTIME_HOST_OFFLINE',
      `读取实例列表失败：${error instanceof Error ? error.message : String(error)}`,
    );
  });
  if (sandboxesResult.status === 401 || sandboxesResult.status === 403) {
    throw probeError('RUNTIME_HOST_UNAUTHORIZED', '宿主 Token 无效或已失效', 401);
  }
  if (sandboxesResult.status < 200 || sandboxesResult.status >= 300) {
    throw probeError(
      'RUNTIME_HOST_ERROR',
      `宿主实例列表异常（HTTP ${sandboxesResult.status}）`,
    );
  }
  const raw = sandboxesResult.body;
  const sandboxes = Array.isArray(raw) ? raw : (raw?.sandboxes ?? []);
  return { latencyMs: Date.now() - startedAt, info, sandboxes };
}
