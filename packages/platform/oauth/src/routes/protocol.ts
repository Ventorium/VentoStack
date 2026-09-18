import type { AuthUser } from '@ventostack/auth';
import { createRouter } from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import type { OAuthAuthLogService } from '../services/auth-log';
import type { OAuthAuthorizationService, OAuthProtocolError } from '../services/authorization';
import type { OAuthLogoutService } from '../services/logout';
import { parseBasicAuthorization } from '../services/protocol-utils';
import type { OAuthTokenService } from '../services/token';
import type { OAuthTokenLifecycleService } from '../services/token-lifecycle';

function oauthError(error: unknown): Response {
  const known = error as Partial<OAuthProtocolError>;
  const status = typeof known.status === 'number' ? known.status : 400;
  const code = typeof known.error === 'string' ? known.error : 'server_error';
  const description = typeof known.description === 'string' ? known.description : '请求处理失败';
  return Response.json(
    { error: code, error_description: description },
    { status, headers: status === 401 ? { 'WWW-Authenticate': 'Basic realm="oauth-token"' } : {} },
  );
}

function cookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function hasDuplicateParameters(params: URLSearchParams): boolean {
  const seen = new Set<string>();
  for (const [key] of params) {
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

async function form(request: Request): Promise<URLSearchParams> {
  const contentType = request.headers.get('Content-Type')?.split(';')[0]?.trim();
  if (contentType !== 'application/x-www-form-urlencoded') throw new Error('invalid_content_type');
  const params = new URLSearchParams(await request.text());
  const seen = new Set<string>();
  for (const [key] of params) {
    if (seen.has(key)) throw new Error('duplicate_parameter');
    seen.add(key);
  }
  return params;
}

export function createOAuthProtocolRoutes(deps: {
  authorization: OAuthAuthorizationService;
  token: OAuthTokenService;
  tokenLifecycle: OAuthTokenLifecycleService;
  authMiddleware: Middleware;
  authLog: OAuthAuthLogService;
  logout: OAuthLogoutService;
}): Router {
  const router = createRouter();
  router.get('/api/oauth/authorize', { strict: false }, async (ctx) => {
    const q = ctx.query as Record<string, string>;
    const input = {
      responseType: q.response_type ?? '',
      clientId: q.client_id ?? '',
      redirectUri: q.redirect_uri ?? '',
      scope: q.scope ?? '',
      state: q.state ?? '',
      nonce: q.nonce ?? '',
      codeChallenge: q.code_challenge ?? '',
      codeChallengeMethod: q.code_challenge_method ?? '',
    };
    try {
      if (hasDuplicateParameters(ctx.url.searchParams))
        return oauthError({ error: 'invalid_request', description: '请求参数不能重复' });
      const result = await deps.authorization.authorize(
        input,
        cookie(ctx.request, '__Host-vs_sso') ?? cookie(ctx.request, 'vs_sso'),
      );
      await deps.authLog.append({
        eventType: result.kind === 'login' ? 'LOGIN_REQUIRED' : 'SSO_LOGIN',
        success: true,
        clientId: q.client_id,
        ...(result.applicationId ? { applicationId: result.applicationId } : {}),
        userAgent: ctx.request.headers.get('User-Agent') ?? undefined,
      });
      return ctx.redirect(result.location);
    } catch (error) {
      await deps.authLog.append({
        eventType: 'AUTHORIZE_FAILED',
        success: false,
        failureCode: (error as { error?: string }).error ?? 'server_error',
        clientId: q.client_id,
        userAgent: ctx.request.headers.get('User-Agent') ?? undefined,
      });
      const location = await deps.authorization.errorRedirect(input, error);
      return location ? ctx.redirect(location) : oauthError(error);
    }
  });

  const bootstrap = createRouter();
  bootstrap.use(deps.authMiddleware);
  bootstrap.post('/api/oauth/session/bootstrap', { strict: false }, async (ctx) => {
    try {
      const body = await form(ctx.request);
      const requestToken = body.get('request') ?? '';
      if (requestToken.length < 32 || requestToken.length > 128)
        return oauthError({ error: 'invalid_request', description: '授权事务格式无效' });
      const result = await deps.authorization.bootstrap(ctx.user as AuthUser, requestToken);
      await deps.authLog.append({
        eventType: 'LOGIN_SUCCESS',
        success: true,
        userId: (ctx.user as AuthUser).id,
        ...(result.applicationId ? { applicationId: result.applicationId } : {}),
        userAgent: ctx.request.headers.get('User-Agent') ?? undefined,
      });
      const response = ctx.redirect(result.location);
      if (result.setCookie) response.headers.set('Set-Cookie', result.setCookie);
      return response;
    } catch (error) {
      return oauthError(error);
    }
  });
  router.merge(bootstrap);

  router.post('/api/oauth/token', { strict: false }, async (ctx) => {
    try {
      const body = await form(ctx.request);
      if (body.has('client_id') || body.has('client_secret'))
        return oauthError({
          error: 'invalid_client',
          description: '仅支持 client_secret_basic',
          status: 401,
        });
      const credentials = parseBasicAuthorization(ctx.request.headers.get('Authorization'));
      if (!credentials)
        return oauthError({ error: 'invalid_client', description: '客户端认证失败', status: 401 });
      const grantType = body.get('grant_type');
      if (grantType === 'refresh_token') {
        const refreshToken = body.get('refresh_token');
        if (!refreshToken)
          return oauthError({ error: 'invalid_request', description: '缺少 refresh_token' });
        const result = await deps.token.refresh({
          clientId: credentials.clientId,
          secret: credentials.secret,
          refreshToken,
          ...(body.get('scope') ? { scope: body.get('scope')! } : {}),
        });
        await deps.authLog.append({
          eventType: 'TOKEN_REFRESHED',
          success: true,
          clientId: credentials.clientId,
        });
        return Response.json(result, {
          headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
        });
      }
      if (grantType !== 'authorization_code')
        return oauthError({
          error: 'unsupported_grant_type',
          description: '暂不支持该 grant_type',
        });
      const required = ['code', 'redirect_uri', 'code_verifier'] as const;
      if (required.some((name) => !body.get(name)))
        return oauthError({ error: 'invalid_request', description: '缺少必要参数' });
      const result = await deps.token.exchangeCode({
        clientId: credentials.clientId,
        secret: credentials.secret,
        code: body.get('code')!,
        redirectUri: body.get('redirect_uri')!,
        codeVerifier: body.get('code_verifier')!,
      });
      await deps.authLog.append({
        eventType: 'CODE_EXCHANGED',
        success: true,
        clientId: credentials.clientId,
      });
      return Response.json(result, {
        headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
      });
    } catch (error) {
      await deps.authLog.append({
        eventType: 'TOKEN_FAILED',
        success: false,
        failureCode: (error as { error?: string }).error ?? 'server_error',
      });
      return oauthError(error);
    }
  });
  router.post('/api/oauth/revoke', { strict: false }, async (ctx) => {
    try {
      const body = await form(ctx.request);
      const credentials = parseBasicAuthorization(ctx.request.headers.get('Authorization'));
      if (!credentials)
        return oauthError({ error: 'invalid_client', description: '客户端认证失败', status: 401 });
      const token = body.get('token');
      if (!token) return oauthError({ error: 'invalid_request', description: '缺少 token' });
      await deps.tokenLifecycle.revoke({ ...credentials, token });
      await deps.authLog.append({
        eventType: 'TOKEN_REVOKED',
        success: true,
        clientId: credentials.clientId,
      });
      return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      await deps.authLog.append({
        eventType: 'TOKEN_REVOCATION_FAILED',
        success: false,
        failureCode: (error as { error?: string }).error ?? 'server_error',
      });
      return oauthError(error);
    }
  });
  router.post('/api/oauth/introspect', { strict: false }, async (ctx) => {
    try {
      const body = await form(ctx.request);
      const credentials = parseBasicAuthorization(ctx.request.headers.get('Authorization'));
      if (!credentials)
        return oauthError({ error: 'invalid_client', description: '客户端认证失败', status: 401 });
      const token = body.get('token');
      if (!token) return oauthError({ error: 'invalid_request', description: '缺少 token' });
      const result = await deps.tokenLifecycle.introspect({ ...credentials, token });
      await deps.authLog.append({
        eventType: result.active ? 'TOKEN_VALIDATED' : 'TOKEN_VALIDATION_FAILED',
        success: result.active === true,
        clientId: credentials.clientId,
        ...(!result.active ? { failureCode: 'inactive_token' } : {}),
      });
      return Response.json(result, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      await deps.authLog.append({
        eventType: 'TOKEN_VALIDATION_FAILED',
        success: false,
        failureCode: (error as { error?: string }).error ?? 'server_error',
      });
      return oauthError(error);
    }
  });
  router.get('/api/oauth/logout', { strict: false }, async (ctx) => {
    const q = ctx.query as Record<string, string>;
    if (hasDuplicateParameters(ctx.url.searchParams))
      return oauthError({ error: 'invalid_request', description: '请求参数不能重复' });
    if (q.id_token_hint && q.logout_hint)
      return oauthError({ error: 'invalid_request', description: '退出提示参数不能重复表达' });
    const idTokenHint = q.id_token_hint ?? q.logout_hint;
    const ssoToken = cookie(ctx.request, '__Host-vs_sso') ?? cookie(ctx.request, 'vs_sso');
    if (!ssoToken && !idTokenHint)
      return oauthError({
        error: 'invalid_request',
        description: '没有可退出的 SSO Session',
        status: 401,
      });
    try {
      const transaction = await deps.logout.prepare({
        ...(ssoToken ? { ssoToken } : {}),
        ...(idTokenHint ? { idTokenHint } : {}),
        ...(q.client_id ? { clientId: q.client_id } : {}),
        ...(q.post_logout_redirect_uri
          ? { postLogoutRedirectUri: q.post_logout_redirect_uri }
          : {}),
        ...(q.state ? { state: q.state } : {}),
      });
      return new Response(
        `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>退出登录</title></head><body><main><h1>退出统一登录</h1><p>确认退出统一认证中心及所有已登录应用？</p><form method="post" action="/api/oauth/logout"><input type="hidden" name="transaction" value="${transaction}"><button type="submit">确认退出</button></form></main></body></html>`,
        {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Security-Policy':
              "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
            'Referrer-Policy': 'no-referrer',
            'X-Frame-Options': 'DENY',
          },
        },
      );
    } catch (error) {
      return oauthError(error);
    }
  });
  router.post('/api/oauth/logout', { strict: false }, async (ctx) => {
    try {
      const body = await form(ctx.request);
      const transaction = body.get('transaction');
      if (!transaction)
        return oauthError({ error: 'invalid_request', description: '缺少退出事务' });
      const location = await deps.logout.execute(transaction);
      const response = location ? ctx.redirect(location) : new Response(null, { status: 204 });
      response.headers.append(
        'Set-Cookie',
        '__Host-vs_sso=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
      );
      response.headers.append('Set-Cookie', 'vs_sso=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
      await deps.authLog.append({ eventType: 'GLOBAL_LOGOUT', success: true });
      return response;
    } catch (error) {
      return oauthError(error);
    }
  });
  return router;
}
