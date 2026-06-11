/**
 * 工作流事件定义测试 — 验证事件可被 EventBus 正确订阅和触发
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createEventBus } from "@ventostack/events";
import {
  workflowTaskCreated,
  workflowTaskUrge,
  workflowInstanceCompleted,
  workflowInstanceRejected,
  workflowInstanceWithdrawn,
} from "../events";

describe("workflow events", () => {
  let eventBus: ReturnType<typeof createEventBus>;

  beforeEach(() => {
    eventBus = createEventBus();
  });

  it("workflowTaskCreated should deliver payload to subscriber", async () => {
    let received: unknown = null;
    eventBus.on(workflowTaskCreated, (payload) => {
      received = payload;
    });
    await eventBus.emit(workflowTaskCreated, {
      instanceId: "inst-1",
      assigneeId: "user-1",
      nodeId: "node-1",
    });
    expect(received).toEqual({
      instanceId: "inst-1",
      assigneeId: "user-1",
      nodeId: "node-1",
    });
  });

  it("workflowInstanceCompleted should deliver payload", async () => {
    let received: unknown = null;
    eventBus.on(workflowInstanceCompleted, (payload) => {
      received = payload;
    });
    await eventBus.emit(workflowInstanceCompleted, { instanceId: "inst-1" });
    expect(received).toEqual({ instanceId: "inst-1" });
  });

  it("workflowInstanceRejected should deliver payload", async () => {
    let received: unknown = null;
    eventBus.on(workflowInstanceRejected, (payload) => {
      received = payload;
    });
    await eventBus.emit(workflowInstanceRejected, { instanceId: "inst-1" });
    expect(received).toEqual({ instanceId: "inst-1" });
  });

  it("workflowInstanceWithdrawn should deliver payload", async () => {
    let received: unknown = null;
    eventBus.on(workflowInstanceWithdrawn, (payload) => {
      received = payload;
    });
    await eventBus.emit(workflowInstanceWithdrawn, {
      instanceId: "inst-1",
      withdrawnBy: "user-1",
    });
    expect(received).toEqual({ instanceId: "inst-1", withdrawnBy: "user-1" });
  });

  it("workflowTaskUrge should deliver payload", async () => {
    let received: unknown = null;
    eventBus.on(workflowTaskUrge, (payload) => {
      received = payload;
    });
    await eventBus.emit(workflowTaskUrge, {
      taskId: "task-1",
      instanceId: "inst-1",
      assigneeId: "user-1",
      urgedBy: "user-2",
    });
    expect(received).toEqual({
      taskId: "task-1",
      instanceId: "inst-1",
      assigneeId: "user-1",
      urgedBy: "user-2",
    });
  });

  it("multiple handlers on same event should all fire", async () => {
    const calls: string[] = [];
    eventBus.on(workflowTaskCreated, () => calls.push("handler-1"));
    eventBus.on(workflowTaskCreated, () => calls.push("handler-2"));
    await eventBus.emit(workflowTaskCreated, {
      instanceId: "inst-1",
      assigneeId: "user-1",
      nodeId: "node-1",
    });
    expect(calls).toEqual(["handler-1", "handler-2"]);
  });

  it("different events should not interfere", async () => {
    let taskReceived = false;
    let instanceReceived = false;
    eventBus.on(workflowTaskCreated, () => { taskReceived = true; });
    eventBus.on(workflowInstanceCompleted, () => { instanceReceived = true; });
    await eventBus.emit(workflowTaskCreated, {
      instanceId: "inst-1",
      assigneeId: "user-1",
      nodeId: "node-1",
    });
    expect(taskReceived).toBe(true);
    expect(instanceReceived).toBe(false);
  });
});
