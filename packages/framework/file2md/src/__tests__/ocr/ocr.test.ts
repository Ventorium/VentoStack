import { describe, test, expect } from "bun:test";
import { createRemoteOCRService } from "../../ocr/remote";

describe("remote OCR config factory", () => {
  test("maps serverUrl/defaultLanguage/model onto the service config", () => {
    const service = createRemoteOCRService({
      serverUrl: "http://localhost:8866/api/v2/ocr/jobs",
      defaultLanguage: "chi_sim",
      model: "PaddleOCR-VL-1.6",
    });
    expect(service.endpoint).toBe("http://localhost:8866/api/v2/ocr/jobs");
    expect(service.language).toBe("chi_sim");
    expect(service.model).toBe("PaddleOCR-VL-1.6");
    expect(service.headers).toBeUndefined();
  });

  test("expands token into a bearer Authorization header", () => {
    const service = createRemoteOCRService({
      serverUrl: "https://ocr.example.com/api/v2/ocr/jobs",
      token: "secret-token",
    });
    expect(service.headers).toEqual({ Authorization: "bearer secret-token" });
  });

  test("keeps an explicitly provided Authorization over the token", () => {
    const service = createRemoteOCRService({
      serverUrl: "https://ocr.example.com/api/v2/ocr/jobs",
      token: "secret-token",
      headers: { authorization: "bearer explicit" },
    });
    expect(service.headers).toEqual({ authorization: "bearer explicit" });
  });

  test("merges custom headers with the token header", () => {
    const service = createRemoteOCRService({
      serverUrl: "https://ocr.example.com/api/v2/ocr/jobs",
      token: "secret-token",
      headers: { "X-Custom": "value" },
    });
    expect(service.headers).toEqual({
      "X-Custom": "value",
      Authorization: "bearer secret-token",
    });
  });

  test("no token and no headers yield undefined headers", () => {
    const service = createRemoteOCRService({
      serverUrl: "https://ocr.example.com/api/v2/ocr/jobs",
    });
    expect(service.headers).toBeUndefined();
  });
});
