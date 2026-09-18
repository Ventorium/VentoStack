import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function prohibitedIp(address: string): boolean {
  if (address.startsWith('::ffff:')) return prohibitedIp(address.slice(7));
  if (address === '::1' || address === '::' || address.startsWith('fe80:')) return true;
  if (address.startsWith('fc') || address.startsWith('fd')) return true;
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    a! >= 224
  );
}

export async function assertSafeBackchannelUrl(value: string): Promise<void> {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash)
    throw new Error('Back-channel endpoint must be a credential-free HTTPS URL on port 443');
  if (url.hostname === 'localhost') throw new Error('Back-channel endpoint is prohibited');
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => prohibitedIp(address)))
    throw new Error('Back-channel endpoint resolves to a prohibited network');
}
