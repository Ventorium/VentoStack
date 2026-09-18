import { fail } from '@ventostack/core';
import type { Middleware } from '@ventostack/core';

export function createOAuthAdminCsrfMiddleware(issuer: string): Middleware {
  const trustedOrigin = new URL(issuer).origin;
  return async (ctx, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(ctx.request.method)) return next();
    const origin = ctx.request.headers.get('Origin');
    const fetchSite = ctx.request.headers.get('Sec-Fetch-Site');
    if (origin !== trustedOrigin || (fetchSite && fetchSite !== 'same-origin'))
      return fail('请求来源校验失败', 403, 403);
    return next();
  };
}
