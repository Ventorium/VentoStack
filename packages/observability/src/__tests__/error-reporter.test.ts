import { describe, test, expect } from "bun:test";
import { createErrorReporter, createSentryChannel, createDingTalkChannel, createWebhookChannel } from "../error-reporter";
import type { ErrorChannel, ErrorReport } from "../error-reporter";

function mockChannel(name: string): ErrorChannel & { reports: ErrorReport[] } {
  const reports: ErrorReport[] = [];
  return {
    name,
    reports,
    async report(error: ErrorReport) { reports.push(error); },
  };
}

describe("createErrorReporter", () => {
  test("capture sends to all channels", async () => {
    const ch1 = mockChannel("ch1");
    const ch2 = mockChannel("ch2");
    const reporter = createErrorReporter({ channels: [ch1, ch2] });
    await reporter.capture(new Error("test error"));
    expect(ch1.reports).toHaveLength(1);
    expect(ch2.reports).toHaveLength(1);
    expect(ch1.reports[0].message).toBe("test error");
    expect(ch1.reports[0].level).toBe("error");
  });

  test("capture with string error", async () => {
    const ch = mockChannel("ch");
    const reporter = createErrorReporter({ channels: [ch] });
    await reporter.capture("string error");
    expect(ch.reports[0].message).toBe("string error");
    expect(ch.reports[0].stack).toBeUndefined();
  });

  test("captureWarning sets level", async () => {
    const ch = mockChannel("ch");
    const reporter = createErrorReporter({ channels: [ch] });
    await reporter.captureWarning("warning msg");
    expect(ch.reports[0].level).toBe("warning");
  });

  test("captureFatal sets level", async () => {
    const ch = mockChannel("ch");
    const reporter = createErrorReporter({ channels: [ch] });
    await reporter.captureFatal(new Error("fatal"));
    expect(ch.reports[0].level).toBe("fatal");
  });

  test("context is passed through", async () => {
    const ch = mockChannel("ch");
    const reporter = createErrorReporter({ channels: [ch] });
    await reporter.capture("err", { userId: "u1" });
    expect(ch.reports[0].context).toEqual({ userId: "u1" });
  });

  test("environment and serviceName are set", async () => {
    const ch = mockChannel("ch");
    const reporter = createErrorReporter({ channels: [ch], environment: "prod", serviceName: "api" });
    await reporter.capture("err");
    expect(ch.reports[0].environment).toBe("prod");
    expect(ch.reports[0].serviceName).toBe("api");
  });

  test("sampleRate 0 drops all", async () => {
    const ch = mockChannel("ch");
    const reporter = createErrorReporter({ channels: [ch], sampleRate: 0 });
    await reporter.capture("err");
    expect(ch.reports).toHaveLength(0);
  });

  test("ignorePatterns filters matching errors", async () => {
    const ch = mockChannel("ch");
    const reporter = createErrorReporter({
      channels: [ch],
      ignorePatterns: [/timeout/i],
    });
    await reporter.capture("Connection timeout");
    expect(ch.reports).toHaveLength(0);
    await reporter.capture("Real error");
    expect(ch.reports).toHaveLength(1);
  });

  test("channel failure is silenced", async () => {
    const failChannel: ErrorChannel = {
      name: "fail",
      async report() { throw new Error("channel error"); },
    };
    const ch = mockChannel("ch");
    const reporter = createErrorReporter({ channels: [failChannel, ch] });
    await reporter.capture("err"); // should not throw
    expect(ch.reports).toHaveLength(1);
  });
});

describe("channel factories", () => {
  test("createSentryChannel has name sentry", () => {
    const ch = createSentryChannel("https://sentry.io/api/123/store/");
    expect(ch.name).toBe("sentry");
  });

  test("createDingTalkChannel has name dingtalk", () => {
    const ch = createDingTalkChannel("https://oapi.dingtalk.com/robot/send");
    expect(ch.name).toBe("dingtalk");
  });

  test("createWebhookChannel has name webhook", () => {
    const ch = createWebhookChannel("https://example.com/webhook");
    expect(ch.name).toBe("webhook");
  });
});
