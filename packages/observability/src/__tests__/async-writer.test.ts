import { describe, test, expect } from "bun:test";
import { createAsyncWriter } from "../async-writer";

describe("createAsyncWriter", () => {
  test("push adds entries", () => {
    const written: string[][] = [];
    const writer = createAsyncWriter({ write: async (entries) => { written.push(entries); } });
    writer.push("log1");
    writer.push("log2");
    expect(writer.pending()).toBe(2);
  });

  test("flush writes all pending entries", async () => {
    const written: string[][] = [];
    const writer = createAsyncWriter({ write: async (entries) => { written.push(entries); } });
    writer.push("log1");
    writer.push("log2");
    await writer.flush();
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual(["log1", "log2"]);
    expect(writer.pending()).toBe(0);
  });

  test("flush does nothing when empty", async () => {
    const written: string[][] = [];
    const writer = createAsyncWriter({ write: async (entries) => { written.push(entries); } });
    await writer.flush();
    expect(written).toHaveLength(0);
  });

  test("auto-flush on buffer full", async () => {
    const written: string[][] = [];
    const writer = createAsyncWriter({
      bufferSize: 2,
      write: async (entries) => { written.push(entries); },
    });
    writer.push("log1");
    writer.push("log2"); // triggers auto-flush
    await Bun.sleep(10); // allow async flush
    expect(writer.pending()).toBe(0);
  });

  test("start and stop timer", async () => {
    const written: string[][] = [];
    const writer = createAsyncWriter({
      flushInterval: 50,
      write: async (entries) => { written.push(entries); },
    });
    writer.start();
    writer.push("log1");
    await Bun.sleep(100);
    expect(written.length).toBeGreaterThanOrEqual(1);
    await writer.stop();
  });

  test("stop flushes remaining", async () => {
    const written: string[][] = [];
    const writer = createAsyncWriter({
      flushInterval: 100000,
      write: async (entries) => { written.push(entries); },
    });
    writer.start();
    writer.push("log1");
    await writer.stop();
    expect(written.length).toBeGreaterThanOrEqual(1);
  });

  test("write failure puts entries back", async () => {
    let fail = true;
    const writer = createAsyncWriter({
      write: async () => { if (fail) throw new Error("write error"); },
    });
    writer.push("log1");
    await writer.flush();
    expect(writer.pending()).toBe(1); // put back
    fail = false;
    await writer.flush();
    expect(writer.pending()).toBe(0);
  });
});
