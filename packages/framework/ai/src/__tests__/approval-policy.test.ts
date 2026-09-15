import { describe, expect, test } from "bun:test";
import { parseApprovalVerdict, resolveApprovalAction } from "../approval-policy";

describe("parseApprovalVerdict", () => {
  test("parses a plain JSON verdict", () => {
    expect(parseApprovalVerdict('{"decision":"approve","reason":"只读查询"}')).toEqual({
      decision: "approve",
      reason: "只读查询",
    });
  });

  test("parses a verdict wrapped in prose or a fenced block", () => {
    expect(
      parseApprovalVerdict('好的\n```json\n{"decision":"reject","reason":"删库"}\n```'),
    ).toEqual({ decision: "reject", reason: "删库" });
  });

  test("falls back to a placeholder when reason is missing or not a string", () => {
    expect(parseApprovalVerdict('{"decision":"approve"}')?.reason).toBe("（未给出理由）");
    expect(parseApprovalVerdict('{"decision":"approve","reason":42}')?.reason).toBe("（未给出理由）");
  });

  test("takes the last valid verdict when the model drafts several", () => {
    // 推理模型常在思考里先起草一个结论再改口，取最后一段才贴合最终答复
    const raw = '先看 {"decision":"reject","reason":"似乎危险"} 再想… 最终 {"decision":"approve","reason":"只读查询"}';
    expect(parseApprovalVerdict(raw)).toEqual({ decision: "approve", reason: "只读查询" });
  });

  test("returns null for any output that is not a valid verdict", () => {
    // 非法输出必须返回 null，调用方据此 fail-closed 转人工审批
    expect(parseApprovalVerdict("我认为可以放行")).toBeNull();
    expect(parseApprovalVerdict("{ not json }")).toBeNull();
    expect(parseApprovalVerdict('{"decision":"allow","reason":"x"}')).toBeNull();
    expect(parseApprovalVerdict('["approve"]')).toBeNull();
    expect(parseApprovalVerdict("")).toBeNull();
  });

  test("caps an over-long reason", () => {
    const reason = "x".repeat(500);
    expect(parseApprovalVerdict(JSON.stringify({ decision: "reject", reason }))?.reason).toHaveLength(200);
  });
});

describe("resolveApprovalAction", () => {
  const approve = { decision: "approve" as const, reason: "只读查询" };
  const reject = { decision: "reject" as const, reason: "删库" };

  test("ask 模式一律人工审批", () => {
    expect(resolveApprovalAction({ riskLevel: "high", runMode: "ask", verdict: null })).toEqual({
      action: "human",
    });
    // 即使子智能体给了结论，ask 模式也不采用
    expect(resolveApprovalAction({ riskLevel: "high", runMode: "ask", verdict: approve })).toEqual({
      action: "human",
    });
  });

  test("trust 模式跳过审批", () => {
    expect(resolveApprovalAction({ riskLevel: "high", runMode: "trust", verdict: null })).toEqual({
      action: "trust",
    });
  });

  test("auto 模式按子智能体结论放行或拒绝", () => {
    expect(resolveApprovalAction({ riskLevel: "high", runMode: "auto", verdict: approve })).toEqual({
      action: "auto-approve",
      reason: "只读查询",
    });
    expect(resolveApprovalAction({ riskLevel: "high", runMode: "auto", verdict: reject })).toEqual({
      action: "auto-reject",
      reason: "删库",
    });
  });

  test("auto 模式判定不可用时 fail-closed 转人工审批", () => {
    // 未配置审批模型 / 调用超时 / 输出非法 → verdict 为 null，绝不能放行
    expect(resolveApprovalAction({ riskLevel: "high", runMode: "auto", verdict: null })).toEqual({
      action: "human",
    });
  });

  test("critical 工具无视运行模式，始终人工审批", () => {
    expect(resolveApprovalAction({ riskLevel: "critical", runMode: "trust", verdict: null })).toEqual(
      { action: "human" },
    );
    expect(
      resolveApprovalAction({ riskLevel: "critical", runMode: "auto", verdict: approve }),
    ).toEqual({ action: "human" });
    expect(resolveApprovalAction({ riskLevel: "critical", runMode: "ask", verdict: null })).toEqual({
      action: "human",
    });
  });
});
