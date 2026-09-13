import { describe, expect, mock, test } from 'bun:test';
import type { Middleware } from '@ventostack/core';
import { createDictDataAccessMiddleware } from '../routes/dict-access';

function context(code = 'sys_status'): Parameters<Middleware>[0] {
  return {
    params: { code },
    request: new Request(`http://localhost/api/system/dict/types/${code}/data`),
  } as Parameters<Middleware>[0];
}

describe('createDictDataAccessMiddleware', () => {
  test('公开且启用的字典允许匿名访问', async () => {
    const auth = mock(async () => new Response(null, { status: 401 }));
    const next = mock(async () => new Response(null, { status: 200 }));
    const middleware = createDictDataAccessMiddleware(
      { isTypePublic: mock(async () => true) },
      auth,
    );

    const response = await middleware(context(), next);
    expect(response.status).toBe(200);
    expect(auth).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('私有、停用或不存在的字典要求有效登录', async () => {
    const auth = mock(async (_ctx, next) => next());
    const next = mock(async () => new Response(null, { status: 200 }));
    const middleware = createDictDataAccessMiddleware(
      { isTypePublic: mock(async () => false) },
      auth,
    );

    const response = await middleware(context(), next);
    expect(response.status).toBe(200);
    expect(auth).toHaveBeenCalledTimes(1);
  });

  test('私有字典的匿名请求返回 401', async () => {
    const auth = mock(async () => failUnauthorized());
    const middleware = createDictDataAccessMiddleware(
      { isTypePublic: mock(async () => false) },
      auth,
    );

    const response = await middleware(context('private_dict'), async () => new Response(null));
    expect(response.status).toBe(401);
  });

  test('访问策略查询异常时 fail closed', async () => {
    const auth = mock(async () => new Response(null, { status: 200 }));
    const middleware = createDictDataAccessMiddleware(
      {
        isTypePublic: mock(async () => {
          throw new Error('db unavailable');
        }),
      },
      auth,
    );

    const response = await middleware(context(), async () => new Response(null));
    expect(response.status).toBe(503);
    expect(auth).not.toHaveBeenCalled();
  });
});

function failUnauthorized(): Response {
  return new Response(JSON.stringify({ code: 401, message: '未登录' }), { status: 401 });
}
