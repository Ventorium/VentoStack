import { fail } from '@ventostack/core';
import type { Middleware } from '@ventostack/core';
import type { DictService } from '../services/dict';

/**
 * 公开字典允许匿名读取；私有、停用或不存在的字典必须通过实时认证。
 * 访问策略解析失败时 fail closed，避免数据库异常导致私有字典泄露。
 */
export function createDictDataAccessMiddleware(
  dictService: Pick<DictService, 'isTypePublic'>,
  authMiddleware: Middleware,
): Middleware {
  return async (ctx, next) => {
    const code = (ctx.params as Record<string, string>).code;
    if (!code) return fail('字典类型不存在', 404, 404);

    try {
      if (await dictService.isTypePublic(code)) return next();
    } catch {
      return fail('字典访问策略暂时不可用', 503, 503);
    }

    return authMiddleware(ctx, next);
  };
}
