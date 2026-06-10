/**
 * engine/strategy.ts 纯函数测试
 */

import { describe, expect, it } from "bun:test";
import { getActiveTasks, isNodeCompleted } from "../../engine/strategy";
import type { TaskInfo } from "../../engine/strategy";

const S = { PENDING: 0, APPROVED: 1, REJECTED: 2, TRANSFERRED: 3, WITHDRAWN: 4, VOIDED: 5 };

function task(id: string, assignee: string, status: number): TaskInfo {
  return { id, assignee_id: assignee, status };
}

describe("getActiveTasks", () => {
  it("should filter out VOIDED tasks", () => {
    const tasks = [task("t1", "u1", S.PENDING), task("t2", "u2", S.VOIDED)];
    expect(getActiveTasks(tasks).length).toBe(1);
    expect(getActiveTasks(tasks)[0]!.id).toBe("t1");
  });

  it("should filter out TRANSFERRED and WITHDRAWN", () => {
    const tasks = [
      task("t1", "u1", S.PENDING),
      task("t2", "u2", S.TRANSFERRED),
      task("t3", "u3", S.WITHDRAWN),
    ];
    expect(getActiveTasks(tasks).length).toBe(1);
  });
});

describe("isNodeCompleted — sequential", () => {
  it("pending tasks → not completed", () => {
    const tasks = [task("t1", "u1", S.PENDING), task("t2", "u2", S.APPROVED)];
    expect(isNodeCompleted(tasks, "sequential").completed).toBe(false);
  });

  it("all approved → completed", () => {
    const tasks = [task("t1", "u1", S.APPROVED), task("t2", "u2", S.APPROVED)];
    expect(isNodeCompleted(tasks, "sequential").completed).toBe(true);
  });

  it("any rejected → completed", () => {
    const tasks = [task("t1", "u1", S.APPROVED), task("t2", "u2", S.REJECTED)];
    expect(isNodeCompleted(tasks, "sequential").completed).toBe(true);
  });

  it("should ignore VOIDED tasks", () => {
    const tasks = [
      task("t1", "u1", S.APPROVED),
      task("t2", "u2", S.VOIDED),
    ];
    // t2 被过滤，只剩 t1 approved → 全部通过 → completed
    expect(isNodeCompleted(tasks, "sequential").completed).toBe(true);
  });
});

describe("isNodeCompleted — parallel_and", () => {
  it("all approved → completed", () => {
    const tasks = [task("t1", "u1", S.APPROVED), task("t2", "u2", S.APPROVED)];
    expect(isNodeCompleted(tasks, "parallel_and").completed).toBe(true);
  });

  it("any rejected → completed", () => {
    const tasks = [task("t1", "u1", S.APPROVED), task("t2", "u2", S.REJECTED)];
    expect(isNodeCompleted(tasks, "parallel_and").completed).toBe(true);
  });

  it("still pending → not completed", () => {
    const tasks = [task("t1", "u1", S.APPROVED), task("t2", "u2", S.PENDING)];
    expect(isNodeCompleted(tasks, "parallel_and").completed).toBe(false);
  });
});

describe("isNodeCompleted — parallel_or", () => {
  it("any approved → completed", () => {
    const tasks = [task("t1", "u1", S.APPROVED), task("t2", "u2", S.PENDING)];
    expect(isNodeCompleted(tasks, "parallel_or").completed).toBe(true);
  });

  it("all rejected → completed", () => {
    const tasks = [task("t1", "u1", S.REJECTED), task("t2", "u2", S.REJECTED)];
    expect(isNodeCompleted(tasks, "parallel_or").completed).toBe(true);
  });

  it("pending + no approved → not completed", () => {
    const tasks = [task("t1", "u1", S.PENDING), task("t2", "u2", S.PENDING)];
    expect(isNodeCompleted(tasks, "parallel_or").completed).toBe(false);
  });
});

describe("isNodeCompleted — percentage", () => {
  it("above threshold → completed", () => {
    const tasks = [
      task("t1", "u1", S.APPROVED),
      task("t2", "u2", S.APPROVED),
      task("t3", "u3", S.PENDING),
    ];
    // 2/3 = 66.7% >= 50%
    expect(isNodeCompleted(tasks, "percentage", 50).completed).toBe(true);
  });

  it("below threshold → not completed", () => {
    const tasks = [
      task("t1", "u1", S.APPROVED),
      task("t2", "u2", S.PENDING),
      task("t3", "u3", S.PENDING),
    ];
    // 1/3 = 33% < 50%
    expect(isNodeCompleted(tasks, "percentage", 50).completed).toBe(false);
  });
});

// === 补充测试 ===

describe("isNodeCompleted — sequential edge cases", () => {
  it("empty active tasks → not completed", () => {
    const tasks = [task("t1", "u1", S.VOIDED), task("t2", "u2", S.TRANSFERRED)];
    expect(isNodeCompleted(tasks, "sequential").completed).toBe(false);
    expect(isNodeCompleted(tasks, "sequential").reason).toContain("无活跃任务");
  });
});

describe("isNodeCompleted — percentage edge cases", () => {
  it("rejection rate exceeding threshold → completed", () => {
    const tasks = [
      task("t1", "u1", S.REJECTED),
      task("t2", "u2", S.REJECTED),
      task("t3", "u3", S.PENDING),
    ];
    // rejectionRate = 2/3 = 66.7% > (100-50)=50% → completed
    expect(isNodeCompleted(tasks, "percentage", 50).completed).toBe(true);
    expect(isNodeCompleted(tasks, "percentage", 50).reason).toContain("驳回率");
  });

  it("default threshold 50% when not specified", () => {
    const tasks = [
      task("t1", "u1", S.APPROVED),
      task("t2", "u2", S.APPROVED),
      task("t3", "u3", S.PENDING),
    ];
    // 2/3 = 66.7% >= 50% (default) → completed
    expect(isNodeCompleted(tasks, "percentage").completed).toBe(true);
  });

  it("empty active → not completed", () => {
    expect(isNodeCompleted([], "percentage", 50).completed).toBe(false);
  });
});

describe("isNodeCompleted — parallel_or edge cases", () => {
  it("mixed approved and rejected → completed (approved first)", () => {
    const tasks = [task("t1", "u1", S.APPROVED), task("t2", "u2", S.REJECTED)];
    expect(isNodeCompleted(tasks, "parallel_or").completed).toBe(true);
    expect(isNodeCompleted(tasks, "parallel_or").reason).toContain("已有通过");
  });
});

describe("isNodeCompleted — parallel_and edge cases", () => {
  it("all approved except voided → completed", () => {
    const tasks = [
      task("t1", "u1", S.APPROVED),
      task("t2", "u2", S.APPROVED),
      task("t3", "u3", S.VOIDED),
    ];
    expect(isNodeCompleted(tasks, "parallel_and").completed).toBe(true);
  });
});

describe("isNodeCompleted — default strategy", () => {
  it("unknown strategy → not completed", () => {
    const tasks = [task("t1", "u1", S.APPROVED)];
    expect(isNodeCompleted(tasks, "unknown" as any).completed).toBe(false);
    expect(isNodeCompleted(tasks, "unknown" as any).reason).toContain("未知策略");
  });
});
