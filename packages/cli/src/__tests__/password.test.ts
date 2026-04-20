// @aeron/cli - Password Command Tests
import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { createPasswordCommand } from "../commands/password";

describe("createPasswordCommand", () => {
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

  test("command has correct name and description", () => {
    const cmd = createPasswordCommand();
    expect(cmd.name).toBe("password");
    expect(cmd.description).toContain("password");
  });

  test("shows usage when no plaintext provided", async () => {
    const cmd = createPasswordCommand();
    await cmd.action({});

    expect(errorSpy).toHaveBeenCalledWith("Usage: aeron password <plaintext>");
  });

  test("hashes password and outputs result", async () => {
    const cmd = createPasswordCommand();
    await cmd.action({ _: ["my-secret-password"] });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const hash = logSpy.mock.calls[0]![0] as string;
    // Bun.password.hash outputs argon2id or bcrypt hash
    expect(hash.length).toBeGreaterThan(20);
  });

  test("hash can be verified with Bun.password.verify", async () => {
    const cmd = createPasswordCommand();
    await cmd.action({ _: ["test-password-123"] });

    const hash = logSpy.mock.calls[0]![0] as string;
    const isValid = await Bun.password.verify("test-password-123", hash);
    expect(isValid).toBe(true);
  });

  test("different passwords produce different hashes", async () => {
    const cmd = createPasswordCommand();

    await cmd.action({ _: ["password1"] });
    const hash1 = logSpy.mock.calls[0]![0] as string;

    await cmd.action({ _: ["password2"] });
    const hash2 = logSpy.mock.calls[1]![0] as string;

    expect(hash1).not.toBe(hash2);
  });
});
