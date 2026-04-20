import { describe, test, expect } from "bun:test";
import { createConnectionPool } from "../connection-pool";

function mockFactory() {
  let nextId = 0;
  return {
    create: async () => ({ id: nextId++ }),
    destroy: async (_conn: { id: number }) => {},
    validate: async (_conn: { id: number }) => true,
  };
}

describe("createConnectionPool", () => {
  test("acquire creates new connection", async () => {
    const pool = createConnectionPool(mockFactory(), { max: 5, min: 0 });
    const conn = await pool.acquire();
    expect(conn.id).toBe(0);
    expect(pool.size()).toBe(1);
    expect(pool.stats().active).toBe(1);
    pool.release(conn);
    await pool.drain();
  });

  test("release makes connection available", async () => {
    const pool = createConnectionPool(mockFactory(), { max: 5, min: 0 });
    const conn = await pool.acquire();
    pool.release(conn);
    const conn2 = await pool.acquire();
    expect(conn2.id).toBe(0); // reused
    pool.release(conn2);
    await pool.drain();
  });

  test("stats returns correct counts", async () => {
    const pool = createConnectionPool(mockFactory(), { max: 5, min: 0 });
    const c1 = await pool.acquire();
    const c2 = await pool.acquire();
    pool.release(c1);
    const stats = pool.stats();
    expect(stats.total).toBe(2);
    expect(stats.active).toBe(1);
    expect(stats.idle).toBe(1);
    expect(stats.maxSize).toBe(5);
    pool.release(c2);
    await pool.drain();
  });

  test("destroy removes connection", async () => {
    const pool = createConnectionPool(mockFactory(), { max: 5, min: 0 });
    const conn = await pool.acquire();
    pool.destroy(conn);
    expect(pool.size()).toBe(0);
    await pool.drain();
  });

  test("drain closes all connections", async () => {
    const pool = createConnectionPool(mockFactory(), { max: 5, min: 0 });
    const c1 = await pool.acquire();
    const c2 = await pool.acquire();
    pool.release(c1);
    pool.release(c2);
    await pool.drain();
    expect(pool.size()).toBe(0);
  });

  test("acquire after drain throws", async () => {
    const pool = createConnectionPool(mockFactory(), { max: 5, min: 0 });
    await pool.drain();
    await expect(pool.acquire()).rejects.toThrow("Pool is closed");
  });

  test("waiter gets connection when released", async () => {
    const pool = createConnectionPool(mockFactory(), { max: 1, min: 0, acquireTimeout: 1000 });
    const c1 = await pool.acquire();
    const p = pool.acquire(); // will wait
    setTimeout(() => pool.release(c1), 50);
    const c2 = await p;
    expect(c2.id).toBe(0);
    pool.release(c2);
    await pool.drain();
  });

  test("acquire timeout", async () => {
    const pool = createConnectionPool(mockFactory(), { max: 1, min: 0, acquireTimeout: 50 });
    const c1 = await pool.acquire();
    await expect(pool.acquire()).rejects.toThrow("timeout");
    pool.release(c1);
    await pool.drain();
  });
});
