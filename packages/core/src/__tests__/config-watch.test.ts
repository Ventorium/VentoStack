import { describe, test, expect } from "bun:test";
import { createConfigWatcher } from "../config-watch";

describe("createConfigWatcher", () => {
  test("start with initial config", () => {
    const watcher = createConfigWatcher({ interval: 100000 });
    watcher.start({ port: 3000 });
    expect(watcher.getConfig()).toEqual({ port: 3000 });
    expect(watcher.isWatching()).toBe(true);
    watcher.stop();
  });

  test("stop watcher", () => {
    const watcher = createConfigWatcher({ interval: 100000 });
    watcher.start({});
    watcher.stop();
    expect(watcher.isWatching()).toBe(false);
  });

  test("update triggers onChange", () => {
    let changed: Record<string, unknown> | undefined;
    const watcher = createConfigWatcher({
      interval: 100000,
      onChange: (config) => { changed = config; },
    });
    watcher.start({ port: 3000 });
    watcher.update({ port: 4000 });
    expect(changed).toEqual({ port: 4000 });
    expect(watcher.getConfig()).toEqual({ port: 4000 });
    watcher.stop();
  });

  test("update with same config does not trigger onChange", () => {
    let callCount = 0;
    const watcher = createConfigWatcher({
      interval: 100000,
      onChange: () => { callCount++; },
    });
    watcher.start({ port: 3000 });
    watcher.update({ port: 3000 });
    expect(callCount).toBe(0);
    watcher.stop();
  });

  test("getConfig returns clone", () => {
    const watcher = createConfigWatcher({ interval: 100000 });
    watcher.start({ a: 1 });
    const config = watcher.getConfig();
    (config as Record<string, unknown>).a = 999;
    expect(watcher.getConfig()).toEqual({ a: 1 });
    watcher.stop();
  });
});
