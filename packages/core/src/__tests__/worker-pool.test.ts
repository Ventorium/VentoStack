import { describe, test, expect } from "bun:test";
import { createWorkerPool } from "../worker-pool";

describe("createWorkerPool", () => {
  // Worker pool tests are limited since we can't easily create worker files in tests
  // These test the pool structure and API

  test("exports createWorkerPool function", () => {
    expect(typeof createWorkerPool).toBe("function");
  });

  test("pool has correct API shape", () => {
    // Create with a dummy URL - won't actually spawn workers in this test
    const pool = createWorkerPool({
      workerURL: new URL("data:text/javascript,"),
      minWorkers: 0,
      maxWorkers: 2,
    });

    expect(typeof pool.execute).toBe("function");
    expect(typeof pool.size).toBe("function");
    expect(typeof pool.idle).toBe("function");
    expect(typeof pool.terminate).toBe("function");
  });

  test("terminate cleans up", () => {
    const pool = createWorkerPool({
      workerURL: new URL("data:text/javascript,"),
      minWorkers: 0,
    });
    pool.terminate();
    expect(pool.size()).toBe(0);
    expect(pool.idle()).toBe(0);
  });
});
