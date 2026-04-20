import { describe, test, expect } from "bun:test";
import { createUploadValidator, sanitizeFilename } from "../middlewares/upload";

function makeFileRequest(
  files: Array<{ name: string; content: string; type: string }>,
): Request {
  const formData = new FormData();
  for (const f of files) {
    const blob = new Blob([f.content], { type: f.type });
    formData.append("file", new File([blob], f.name, { type: f.type }));
  }
  return new Request("http://localhost/upload", {
    method: "POST",
    body: formData,
  });
}

describe("sanitizeFilename", () => {
  test("removes path separators", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("_...etcpasswd");
  });

  test("removes null bytes", () => {
    expect(sanitizeFilename("file\0.txt")).toBe("file.txt");
  });

  test("removes control characters", () => {
    expect(sanitizeFilename("file\x01\x02.txt")).toBe("file.txt");
  });

  test("replaces non-alphanumeric characters", () => {
    expect(sanitizeFilename("my file (1).txt")).toBe("my_file__1_.txt");
  });

  test("prevents hidden files (leading dot)", () => {
    expect(sanitizeFilename(".htaccess")).toBe("_htaccess");
  });

  test("returns unnamed for empty result", () => {
    expect(sanitizeFilename("")).toBe("unnamed");
  });
});

describe("createUploadValidator", () => {
  test("valid file passes all checks", async () => {
    const validator = createUploadValidator({
      allowedMimeTypes: ["image/png"],
      allowedExtensions: ["png"],
    });
    const req = makeFileRequest([
      { name: "photo.png", content: "PNG data", type: "image/png" },
    ]);
    const result = await validator.validate(req);
    expect(result.valid).toBe(true);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.name).toBe("photo.png");
  });

  test("rejects double extension (e.g., file.php.jpg)", async () => {
    const validator = createUploadValidator();
    const req = makeFileRequest([
      { name: "shell.php.jpg", content: "data", type: "image/jpeg" },
    ]);
    const result = await validator.validate(req);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Double extension");
  });

  test("rejects null bytes in filename", async () => {
    const validator = createUploadValidator();
    const req = makeFileRequest([
      { name: "file\0.txt", content: "data", type: "text/plain" },
    ]);
    const result = await validator.validate(req);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Null byte");
  });

  test("rejects files exceeding max size", async () => {
    const validator = createUploadValidator({ maxFileSize: 10 });
    const req = makeFileRequest([
      { name: "big.txt", content: "a".repeat(100), type: "text/plain" },
    ]);
    const result = await validator.validate(req);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("too large");
  });

  test("rejects disallowed MIME types", async () => {
    const validator = createUploadValidator({
      allowedMimeTypes: ["image/png"],
    });
    const req = makeFileRequest([
      { name: "script.js", content: "alert(1)", type: "application/javascript" },
    ]);
    const result = await validator.validate(req);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("MIME type not allowed");
  });

  test("rejects disallowed extensions", async () => {
    const validator = createUploadValidator({
      allowedExtensions: ["png", "jpg"],
    });
    const req = makeFileRequest([
      { name: "script.exe", content: "binary", type: "application/octet-stream" },
    ]);
    const result = await validator.validate(req);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Extension not allowed");
  });

  test("rejects too many files", async () => {
    const validator = createUploadValidator({ maxFiles: 2 });
    const req = makeFileRequest([
      { name: "a.txt", content: "a", type: "text/plain" },
      { name: "b.txt", content: "b", type: "text/plain" },
      { name: "c.txt", content: "c", type: "text/plain" },
    ]);
    const result = await validator.validate(req);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Too many files");
  });

  test("handles request with no files", async () => {
    const validator = createUploadValidator();
    const formData = new FormData();
    formData.append("field", "value");
    const req = new Request("http://localhost/upload", {
      method: "POST",
      body: formData,
    });
    const result = await validator.validate(req);
    expect(result.valid).toBe(true);
    expect(result.files).toHaveLength(0);
  });

  test("sanitizeFilename is accessible from validator instance", () => {
    const validator = createUploadValidator();
    expect(validator.sanitizeFilename("../../evil.txt")).toBe("_...evil.txt");
  });
});
