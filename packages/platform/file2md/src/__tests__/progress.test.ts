import { describe, test, expect } from "bun:test";
import { createProgressEmitter } from "../progress/emitter";
import type { ConvertProgressEvent } from "../types";

describe("progress emitter", () => {
  test("calls handler with correct event shape", () => {
    const events: ConvertProgressEvent[] = [];
    const emit = createProgressEmitter((e) => events.push(e));

    emit.emit("start", { fileName: "test.pdf", message: "beginning" });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("start");
    expect(events[0]!.fileName).toBe("test.pdf");
    expect(events[0]!.message).toBe("beginning");
  });

  test("defaults to empty fileName when not provided", () => {
    const events: ConvertProgressEvent[] = [];
    const emit = createProgressEmitter((e) => events.push(e));

    emit.emit("complete", { message: "done" });
    expect(events[0]!.fileName).toBe("");
  });

  test("forwards progress info", () => {
    const events: ConvertProgressEvent[] = [];
    const emit = createProgressEmitter((e) => events.push(e));

    emit.emit("file_done", {
      fileName: "a.ts",
      progress: { current: 3, total: 10 },
    });

    expect(events[0]!.progress).toEqual({ current: 3, total: 10 });
  });

  test("forwards error info", () => {
    const events: ConvertProgressEvent[] = [];
    const emit = createProgressEmitter((e) => events.push(e));
    const err = new Error("something broke");

    emit.emit("error", { fileName: "bad.txt", error: err });
    expect(events[0]!.error).toBe(err);
  });

  test("does nothing when no handler provided", () => {
    const emit = createProgressEmitter();
    // Should not throw
    emit.emit("start", { fileName: "test.txt" });
    emit.emit("complete", {});
  });

  test("emits multiple events in order", () => {
    const types: string[] = [];
    const emit = createProgressEmitter((e) => types.push(e.type));

    emit.emit("start", { fileName: "f" });
    emit.emit("parse_start", { fileName: "f" });
    emit.emit("parse_done", { fileName: "f" });
    emit.emit("clean_start", { fileName: "f" });
    emit.emit("clean_done", { fileName: "f" });
    emit.emit("complete", { fileName: "f" });

    expect(types).toEqual(["start", "parse_start", "parse_done", "clean_start", "clean_done", "complete"]);
  });
});
