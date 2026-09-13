/**
 * 在未配置 GeoIP 数据源时，为审计日志提供保守、稳定的位置描述。
 * 不根据公网 IP 猜测具体城市，避免记录错误的安全审计信息。
 */
export function describeIPLocation(ip: string): string {
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (normalized === '127.0.0.1' || normalized === '::1') return '本机';

  const parts = normalized.split('.').map(Number);
  if (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    (parts[0] === 10 ||
      (parts[0] === 172 && parts[1] !== undefined && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254))
  ) {
    return '内网';
  }

  if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(normalized)) return '内网';
  return '未知';
}
