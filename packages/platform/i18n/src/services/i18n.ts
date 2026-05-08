/**
 * @ventostack/i18n - 国际化服务
 */

import type { Database } from "@ventostack/database";
import { I18nLocaleModel, I18nMessageModel } from "../models";

/** 语言 */
export interface I18nLocale {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  status: number;
}

/** 消息 */
export interface I18nMessage {
  id: string;
  locale: string;
  code: string;
  value: string;
  module: string | null;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 国际化服务接口 */
export interface I18nService {
  // Locale CRUD
  createLocale(params: { code: string; name: string; isDefault?: boolean }): Promise<{ id: string }>;
  updateLocale(id: string, params: Partial<{ name: string; isDefault: boolean; status: number }>): Promise<void>;
  deleteLocale(id: string): Promise<void>;
  listLocales(): Promise<I18nLocale[]>;

  // Message CRUD
  setMessage(locale: string, code: string, value: string, module?: string): Promise<void>;
  getMessage(locale: string, code: string): Promise<string | null>;
  deleteMessage(id: string): Promise<void>;
  listMessages(params: { locale?: string; module?: string; page?: number; pageSize?: number }): Promise<PaginatedResult<I18nMessage>>;

  // Bulk operations
  getLocaleMessages(locale: string, module?: string): Promise<Record<string, string>>;
  importMessages(locale: string, messages: Record<string, string>, module?: string): Promise<number>;
}

export interface I18nServiceDeps {
  db: Database;
}

export function createI18nService(deps: I18nServiceDeps): I18nService {
  const { db } = deps;

  return {
    async createLocale(params) {
      const id = crypto.randomUUID();
      await db.query(I18nLocaleModel).insert({
        id,
        code: params.code,
        name: params.name,
        is_default: params.isDefault ?? false,
        status: 1,
      });
      return { id };
    },

    async updateLocale(id, params) {
      const updates: Record<string, unknown> = {};
      if (params.name !== undefined) updates.name = params.name;
      if (params.isDefault !== undefined) updates.is_default = params.isDefault;
      if (params.status !== undefined) updates.status = params.status;

      if (Object.keys(updates).length === 0) return;
      await db.query(I18nLocaleModel).where("id", "=", id).update(updates);
    },

    async deleteLocale(id) {
      // Also delete all messages for this locale
      const locale = await db.query(I18nLocaleModel)
        .where("id", "=", id)
        .select("code")
        .get();
      if (locale) {
        await db.query(I18nMessageModel).where("locale", "=", locale.code).hardDelete();
      }
      await db.query(I18nLocaleModel).where("id", "=", id).hardDelete();
    },

    async listLocales() {
      const rows = await db.query(I18nLocaleModel)
        .select("id", "code", "name", "is_default", "status")
        .orderBy("is_default", "desc")
        .orderBy("code", "asc")
        .list();

      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        isDefault: row.is_default,
        status: row.status,
      }));
    },

    async setMessage(locale, code, value, module) {
      const id = crypto.randomUUID();
      // ON CONFLICT pattern — use db.raw
      await db.raw(
        `INSERT INTO sys_i18n_message (id, locale, code, value, module, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (locale, code) DO UPDATE SET value = $4, module = $5, updated_at = NOW()`,
        [id, locale, code, value, module ?? null],
      );
    },

    async getMessage(locale, code) {
      const row = await db.query(I18nMessageModel)
        .where("locale", "=", locale)
        .where("code", "=", code)
        .select("value")
        .get();
      return row?.value ?? null;
    },

    async deleteMessage(id) {
      await db.query(I18nMessageModel).where("id", "=", id).hardDelete();
    },

    async listMessages(params) {
      const { locale, module, page = 1, pageSize = 10 } = params;

      let query = db.query(I18nMessageModel);
      if (locale) query = query.where("locale", "=", locale);
      if (module) query = query.where("module", "=", module);

      const total = await query.count();

      const rows = await query
        .select("id", "locale", "code", "value", "module")
        .orderBy("code", "asc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const items = rows.map((row) => ({
        id: row.id,
        locale: row.locale,
        code: row.code,
        value: row.value,
        module: row.module ?? null,
      }));

      return { items, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
    },

    async getLocaleMessages(locale, module) {
      let query = db.query(I18nMessageModel)
        .where("locale", "=", locale)
        .select("code", "value");
      if (module) query = query.where("module", "=", module);

      const rows = await query.list();

      const result: Record<string, string> = {};
      for (const row of rows) {
        result[row.code] = row.value;
      }
      return result;
    },

    async importMessages(locale, messages, module) {
      let count = 0;
      for (const [code, value] of Object.entries(messages)) {
        const id = crypto.randomUUID();
        // ON CONFLICT pattern — use db.raw
        await db.raw(
          `INSERT INTO sys_i18n_message (id, locale, code, value, module, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT (locale, code) DO UPDATE SET value = $4, module = $5, updated_at = NOW()`,
          [id, locale, code, value, module ?? null],
        );
        count++;
      }
      return count;
    },
  };
}
