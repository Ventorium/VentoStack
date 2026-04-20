// @aeron/cli - CLI Tests
import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { createCLI, run } from "../cli";

describe("createCLI", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("register returns CLI for chaining", () => {
    const cli = createCLI("test", "1.0.0");
    const result = cli.register({
      name: "foo",
      description: "foo command",
      action: () => {},
    });
    expect(result).toBe(cli);
  });

  test("run with no args shows help", async () => {
    const cli = createCLI("test", "1.0.0");
    cli.register({ name: "foo", description: "Do foo", action: () => {} });
    await cli.run([]);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("Usage: test <command>");
    expect(output).toContain("foo");
    expect(output).toContain("Do foo");
  });

  test("run help shows all commands", async () => {
    const cli = createCLI("test", "1.0.0");
    cli.register({ name: "build", description: "Build project", action: () => {} });
    cli.register({ name: "serve", description: "Start server", action: () => {} });
    await cli.run(["help"]);

    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("build");
    expect(output).toContain("serve");
    expect(output).toContain("help");
    expect(output).toContain("version");
  });

  test("run version shows version", async () => {
    const cli = createCLI("myapp", "2.3.4");
    await cli.run(["version"]);

    expect(logSpy).toHaveBeenCalledWith("myapp v2.3.4");
  });

  test("unknown command shows error and help", async () => {
    const cli = createCLI("test", "1.0.0");
    await cli.run(["nonexistent"]);

    expect(errorSpy).toHaveBeenCalledWith("Unknown command: nonexistent");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  test("executes registered command", async () => {
    let receivedArgs: Record<string, unknown> = {};
    const cli = createCLI("test", "1.0.0");
    cli.register({
      name: "greet",
      description: "Greet someone",
      action: (args) => {
        receivedArgs = args;
      },
    });
    await cli.run(["greet"]);
    expect(receivedArgs).toEqual({});
  });

  test("parses --option=value format", async () => {
    let receivedArgs: Record<string, unknown> = {};
    const cli = createCLI("test", "1.0.0");
    cli.register({
      name: "cmd",
      description: "test",
      action: (args) => {
        receivedArgs = args;
      },
    });
    await cli.run(["cmd", "--name=Alice"]);
    expect(receivedArgs.name).toBe("Alice");
  });

  test("parses --option value format", async () => {
    let receivedArgs: Record<string, unknown> = {};
    const cli = createCLI("test", "1.0.0");
    cli.register({
      name: "cmd",
      description: "test",
      action: (args) => {
        receivedArgs = args;
      },
    });
    await cli.run(["cmd", "--name", "Bob"]);
    expect(receivedArgs.name).toBe("Bob");
  });

  test("parses --flag as boolean true", async () => {
    let receivedArgs: Record<string, unknown> = {};
    const cli = createCLI("test", "1.0.0");
    cli.register({
      name: "cmd",
      description: "test",
      action: (args) => {
        receivedArgs = args;
      },
    });
    await cli.run(["cmd", "--verbose"]);
    expect(receivedArgs.verbose).toBe(true);
  });

  test("parses -o alias with value", async () => {
    let receivedArgs: Record<string, unknown> = {};
    const cli = createCLI("test", "1.0.0");
    cli.register({
      name: "cmd",
      description: "test",
      options: [{ name: "output", alias: "o", description: "Output path" }],
      action: (args) => {
        receivedArgs = args;
      },
    });
    await cli.run(["cmd", "-o", "/tmp/out"]);
    expect(receivedArgs.output).toBe("/tmp/out");
  });

  test("parses -f alias as boolean flag", async () => {
    let receivedArgs: Record<string, unknown> = {};
    const cli = createCLI("test", "1.0.0");
    cli.register({
      name: "cmd",
      description: "test",
      options: [{ name: "force", alias: "f", description: "Force" }],
      action: (args) => {
        receivedArgs = args;
      },
    });
    await cli.run(["cmd", "-f"]);
    expect(receivedArgs.force).toBe(true);
  });

  test("collects positional args", async () => {
    let receivedArgs: Record<string, unknown> = {};
    const cli = createCLI("test", "1.0.0");
    cli.register({
      name: "cmd",
      description: "test",
      action: (args) => {
        receivedArgs = args;
      },
    });
    await cli.run(["cmd", "foo", "bar"]);
    expect(receivedArgs._).toEqual(["foo", "bar"]);
  });

  test("applies default option values", async () => {
    let receivedArgs: Record<string, unknown> = {};
    const cli = createCLI("test", "1.0.0");
    cli.register({
      name: "cmd",
      description: "test",
      options: [{ name: "count", description: "Count", default: "5" }],
      action: (args) => {
        receivedArgs = args;
      },
    });
    await cli.run(["cmd"]);
    expect(receivedArgs.count).toBe("5");
  });

  test("overrides default with provided value", async () => {
    let receivedArgs: Record<string, unknown> = {};
    const cli = createCLI("test", "1.0.0");
    cli.register({
      name: "cmd",
      description: "test",
      options: [{ name: "count", description: "Count", default: "5" }],
      action: (args) => {
        receivedArgs = args;
      },
    });
    await cli.run(["cmd", "--count=10"]);
    expect(receivedArgs.count).toBe("10");
  });

  test("handles async action", async () => {
    let called = false;
    const cli = createCLI("test", "1.0.0");
    cli.register({
      name: "async-cmd",
      description: "async",
      action: async () => {
        await Promise.resolve();
        called = true;
      },
    });
    await cli.run(["async-cmd"]);
    expect(called).toBe(true);
  });

  test("mixed options and positional args", async () => {
    let receivedArgs: Record<string, unknown> = {};
    const cli = createCLI("test", "1.0.0");
    cli.register({
      name: "cmd",
      description: "test",
      action: (args) => {
        receivedArgs = args;
      },
    });
    await cli.run(["cmd", "pos1", "--flag", "--key=val", "pos2"]);
    expect(receivedArgs._).toEqual(["pos1", "pos2"]);
    expect(receivedArgs.flag).toBe(true);
    expect(receivedArgs.key).toBe("val");
  });
});

describe("run", () => {
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test("run() creates default CLI and shows help", async () => {
    // run() uses Bun.argv which won't have a valid command in test
    await run();
    // Should show help since no matching command
    expect(logSpy).toHaveBeenCalled();
  });
});
