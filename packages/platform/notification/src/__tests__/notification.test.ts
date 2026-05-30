/**
 * @ventostack/notify - 通知服务测试
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { MessageStatus, createNotificationService } from "../services/notification";
import {
  createFailingChannel,
  createMockChannel,
  createMockDatabase,
  createMockExecutor,
} from "./helpers";

describe("NotificationService", () => {
  let executor: ReturnType<typeof createMockExecutor>["executor"];
  let calls: ReturnType<typeof createMockExecutor>["calls"];
  let results: ReturnType<typeof createMockExecutor>["results"];
  let emailChannel: ReturnType<typeof createMockChannel>;
  let smsChannel: ReturnType<typeof createMockChannel>;
  let channels: Map<string, any>;
  let db: ReturnType<typeof createMockDatabase>["db"];
  let service: ReturnType<typeof createNotificationService>;

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ executor, calls, results } = mockExec);
    ({ db } = createMockDatabase(mockExec));
    emailChannel = createMockChannel("email");
    smsChannel = createMockChannel("sms");
    channels = new Map([
      ["email", emailChannel],
      ["sms", smsChannel],
    ]);
    service = createNotificationService({ db, channels });
  });

  describe("send", () => {
    it("should send message via channel", async () => {
      const result = await service.send({
        receiverId: "user-1",
        channel: "email",
        title: "Test",
        content: "Hello",
      });

      expect(result.messageId).toBeTruthy();
      expect(emailChannel.send).toHaveBeenCalledWith({
        to: "user-1",
        title: "Test",
        content: "Hello",
      });
      // Should insert message record
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_notify_message"))).toBe(true);
    });

    it("should send with template", async () => {
      results.set("SELECT * FROM sys_notify_template WHERE id", [
        {
          id: "tpl-1",
          name: "Welcome",
          code: "welcome",
          channel: "email",
          title: "Welcome {{name}}",
          content: "Hello {{name}}, welcome!",
          status: 1,
        },
      ]);

      await service.send({
        templateId: "tpl-1",
        receiverId: "user-1",
        channel: "email",
        variables: { name: "Alice" },
      });

      expect(emailChannel.send).toHaveBeenCalledWith({
        to: "user-1",
        title: "Welcome Alice",
        content: "Hello Alice, welcome!",
      });
    });

    it("should record failure when channel fails", async () => {
      const failChannels = new Map([["sms", createFailingChannel("sms")]]);
      const failService = createNotificationService({ db, channels: failChannels });

      await failService.send({
        receiverId: "user-1",
        channel: "sms",
        content: "Test",
      });

      // Should insert with FAILED status
      const insertCall = calls.find((c) => c.text.includes("INSERT INTO sys_notify_message"));
      expect(insertCall).toBeTruthy();
      expect(insertCall!.params).toContain(MessageStatus.FAILED);
    });
  });

  describe("listMessages", () => {
    it("should list messages with pagination", async () => {
      results.set("SELECT COUNT(*)", [{ total: 1 }]);
      results.set("SELECT * FROM sys_notify_message", [
        {
          id: "m1",
          template_id: null,
          channel: "email",
          receiver_id: "user-1",
          title: "Test",
          content: "Hello",
          variables: null,
          status: 1,
          retry_count: 0,
          send_at: new Date("2024-01-01"),
          error: null,
          created_at: new Date("2024-01-01"),
        },
      ]);

      const result = await service.listMessages({ receiverId: "user-1", page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
      expect(result.items.length).toBe(1);
      expect(result.items[0]!.receiverId).toBe("user-1");
    });

    it("should filter by channel", async () => {
      results.set("SELECT COUNT(*)", [{ total: 0 }]);

      await service.listMessages({ channel: "sms" });
      expect(calls.some((c) => c.text.includes("channel = "))).toBe(true);
    });

    it("should filter by status", async () => {
      results.set("SELECT COUNT(*)", [{ total: 0 }]);

      await service.listMessages({ status: MessageStatus.FAILED });
      expect(calls.some((c) => c.text.includes("status = "))).toBe(true);
    });
  });

  describe("getUnreadCount", () => {
    it("should return unread count", async () => {
      results.set("SELECT COUNT(*)", [{ total: 5 }]);

      const count = await service.getUnreadCount("user-1");
      expect(count).toBe(5);
    });
  });

  describe("markRead / markBatchRead", () => {
    it("should mark single message as read", async () => {
      await service.markRead("user-1", "msg-1");

      expect(calls.some((c) => c.text.includes("INSERT INTO sys_notify_user_read"))).toBe(true);
      expect(calls.some((c) => c.text.includes("ON CONFLICT"))).toBe(true);
    });

    it("should batch mark messages as read", async () => {
      await service.markBatchRead("user-1", ["msg-1", "msg-2", "msg-3"]);

      const readCalls = calls.filter((c) => c.text.includes("INSERT INTO sys_notify_user_read"));
      expect(readCalls.length).toBe(3);
    });
  });

  describe("retry", () => {
    it("should retry failed message", async () => {
      results.set("SELECT * FROM sys_notify_message WHERE id", [
        {
          id: "m1",
          channel: "email",
          receiver_id: "user-1",
          title: "Test",
          content: "Hello",
        },
      ]);

      await service.retry("m1");

      expect(emailChannel.send).toHaveBeenCalled();
      expect(calls.some((c) => c.text.includes("UPDATE sys_notify_message SET"))).toBe(true);
    });

    it("should throw when message not found", async () => {
      results.set("SELECT * FROM sys_notify_message WHERE id", []);

      await expect(service.retry("nonexistent")).rejects.toThrow("消息不存在");
    });

    it("should mark failed when channel not found", async () => {
      results.set("SELECT * FROM sys_notify_message WHERE id", [
        {
          id: "m1",
          channel: "unknown",
          receiver_id: "user-1",
          title: "Test",
          content: "Hello",
        },
      ]);

      await service.retry("m1");

      expect(calls.some((c) => c.text.includes("UPDATE sys_notify_message SET"))).toBe(true);
    });
  });

  describe("template CRUD", () => {
    it("should create template", async () => {
      const result = await service.createTemplate({
        name: "Welcome",
        code: "welcome",
        channel: "email",
        title: "Welcome",
        content: "Hello!",
      });

      expect(result.id).toBeTruthy();
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_notify_template"))).toBe(true);
    });

    it("should update template", async () => {
      await service.updateTemplate("tpl-1", { name: "Updated", status: 0 });

      expect(calls.some((c) => c.text.includes("UPDATE sys_notify_template SET"))).toBe(true);
    });

    it("should skip update when no fields", async () => {
      await service.updateTemplate("tpl-1", {});
      expect(calls.length).toBe(0);
    });

    it("should delete template", async () => {
      await service.deleteTemplate("tpl-1");

      expect(calls.some((c) => c.text.includes("DELETE FROM sys_notify_template"))).toBe(true);
    });

    it("should list templates", async () => {
      results.set("SELECT COUNT(*)", [{ total: 1 }]);
      results.set("SELECT * FROM sys_notify_template", [
        {
          id: "t1",
          name: "Welcome",
          code: "welcome",
          channel: "email",
          title: "Hi",
          content: "Hello",
          status: 1,
        },
      ]);

      const result = await service.listTemplates({ page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
      expect(result.items[0]!.code).toBe("welcome");
    });
  });
});
