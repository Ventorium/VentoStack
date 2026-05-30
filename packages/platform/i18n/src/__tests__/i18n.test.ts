/**
 * @ventostack/i18n - 国际化服务测试
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { createI18nService } from "../services/i18n";
import { createMockDatabase, createMockExecutor } from "./helpers";

describe("I18nService", () => {
  let executor: ReturnType<typeof createMockExecutor>["executor"];
  let calls: ReturnType<typeof createMockExecutor>["calls"];
  let results: ReturnType<typeof createMockExecutor>["results"];
  let service: ReturnType<typeof createI18nService>;

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ executor: executor, calls, results } = mockExec);
    const { db } = createMockDatabase(mockExec);
    service = createI18nService({ db });
  });

  describe("createLocale", () => {
    it("should create locale", async () => {
      const result = await service.createLocale({ code: "zh-CN", name: "简体中文" });

      expect(result.id).toBeTruthy();
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_i18n_locale"))).toBe(true);
    });

    it("should support default locale", async () => {
      await service.createLocale({ code: "en-US", name: "English", isDefault: true });

      expect(calls[0]!.params).toContain(true);
    });
  });

  describe("updateLocale", () => {
    it("should update locale fields", async () => {
      await service.updateLocale("loc-1", { name: "Updated", isDefault: true });

      expect(calls.some((c) => c.text.includes("UPDATE sys_i18n_locale SET"))).toBe(true);
    });

    it("should skip when no fields", async () => {
      await service.updateLocale("loc-1", {});
      expect(calls.length).toBe(0);
    });
  });

  describe("deleteLocale", () => {
    it("should delete locale and its messages", async () => {
      results.set("SELECT * FROM sys_i18n_locale WHERE id", [{ code: "zh-CN" }]);

      await service.deleteLocale("loc-1");

      expect(calls.some((c) => c.text.includes("DELETE FROM sys_i18n_message WHERE locale"))).toBe(
        true,
      );
      expect(calls.some((c) => c.text.includes("DELETE FROM sys_i18n_locale WHERE id"))).toBe(true);
    });
  });

  describe("listLocales", () => {
    it("should list all locales", async () => {
      results.set("SELECT * FROM sys_i18n_locale", [
        { id: "l1", code: "zh-CN", name: "简体中文", is_default: true, status: 1 },
        { id: "l2", code: "en-US", name: "English", is_default: false, status: 1 },
      ]);

      const locales = await service.listLocales();
      expect(locales.length).toBe(2);
      expect(locales[0]!.code).toBe("zh-CN");
      expect(locales[0]!.isDefault).toBe(true);
    });
  });

  describe("setMessage", () => {
    it("should set a message", async () => {
      await service.setMessage("zh-CN", "user.login.title", "登录");

      expect(calls.some((c) => c.text.includes("INSERT INTO sys_i18n_message"))).toBe(true);
      expect(calls.some((c) => c.text.includes("ON CONFLICT"))).toBe(true);
    });

    it("should support module parameter", async () => {
      await service.setMessage("zh-CN", "user.login.title", "登录", "user");

      expect(calls[0]!.params).toContain("user");
    });
  });

  describe("getMessage", () => {
    it("should return message value", async () => {
      results.set("SELECT * FROM sys_i18n_message", [{ value: "登录" }]);

      const value = await service.getMessage("zh-CN", "user.login.title");
      expect(value).toBe("登录");
    });

    it("should return null when not found", async () => {
      results.set("SELECT * FROM sys_i18n_message", []);

      const value = await service.getMessage("zh-CN", "nonexistent");
      expect(value).toBeNull();
    });
  });

  describe("deleteMessage", () => {
    it("should delete message", async () => {
      await service.deleteMessage("msg-1");

      expect(calls.some((c) => c.text.includes("DELETE FROM sys_i18n_message WHERE id"))).toBe(
        true,
      );
    });
  });

  describe("listMessages", () => {
    it("should list messages with pagination", async () => {
      results.set("SELECT COUNT(*)", [{ total: 1 }]);
      results.set("SELECT * FROM sys_i18n_message", [
        { id: "m1", locale: "zh-CN", code: "user.login.title", value: "登录", module: "user" },
      ]);

      const result = await service.listMessages({ locale: "zh-CN", page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
      expect(result.items[0]!.value).toBe("登录");
    });

    it("should filter by module", async () => {
      results.set("SELECT COUNT(*)", [{ total: 0 }]);

      await service.listMessages({ module: "user" });
      expect(calls.some((c) => c.text.includes("module = "))).toBe(true);
    });
  });

  describe("getLocaleMessages", () => {
    it("should return code-value map", async () => {
      results.set("SELECT * FROM sys_i18n_message", [
        { code: "user.login.title", value: "登录" },
        { code: "user.login.submit", value: "提交" },
      ]);

      const messages = await service.getLocaleMessages("zh-CN");
      expect(messages["user.login.title"]).toBe("登录");
      expect(messages["user.login.submit"]).toBe("提交");
    });

    it("should filter by module", async () => {
      results.set("SELECT * FROM sys_i18n_message", []);

      await service.getLocaleMessages("zh-CN", "user");
      expect(calls.some((c) => c.text.includes("module = "))).toBe(true);
    });
  });

  describe("importMessages", () => {
    it("should import multiple messages", async () => {
      const count = await service.importMessages("zh-CN", {
        "user.login.title": "登录",
        "user.login.submit": "提交",
        "user.logout": "退出",
      });

      expect(count).toBe(3);
      const insertCalls = calls.filter((c) => c.text.includes("INSERT INTO sys_i18n_message"));
      expect(insertCalls.length).toBe(3);
    });

    it("should support module parameter", async () => {
      await service.importMessages("en-US", { hello: "Hello" }, "common");

      expect(calls[0]!.params).toContain("common");
    });
  });
});
