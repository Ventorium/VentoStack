import { describe, test, expect } from "bun:test";
import { lookupMimeType } from "../mime";

describe("lookupMimeType", () => {
  test("returns correct MIME for known extensions", () => {
    expect(lookupMimeType("report.pdf")).toBe("application/pdf");
    expect(lookupMimeType("doc.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(lookupMimeType("data.xlsx")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(lookupMimeType("slide.pptx")).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(lookupMimeType("page.html")).toBe("text/html");
    expect(lookupMimeType("readme.md")).toBe("text/markdown");
    expect(lookupMimeType("data.json")).toBe("application/json");
    expect(lookupMimeType("config.yaml")).toBe("text/yaml");
    expect(lookupMimeType("photo.png")).toBe("image/png");
    expect(lookupMimeType("photo.jpg")).toBe("image/jpeg");
    expect(lookupMimeType("photo.jpeg")).toBe("image/jpeg");
    expect(lookupMimeType("photo.webp")).toBe("image/webp");
    expect(lookupMimeType("archive.zip")).toBe("application/zip");
    expect(lookupMimeType("data.csv")).toBe("text/csv");
    expect(lookupMimeType("data.xml")).toBe("application/xml");
    expect(lookupMimeType("style.css")).toBe("application/octet-stream"); // not in map
  });

  test("returns octet-stream for unknown extensions", () => {
    expect(lookupMimeType("file.xyz")).toBe("application/octet-stream");
    expect(lookupMimeType("file.unknown")).toBe("application/octet-stream");
  });

  test("handles files with no extension", () => {
    expect(lookupMimeType("Makefile")).toBe("application/octet-stream");
    expect(lookupMimeType("LICENSE")).toBe("application/octet-stream");
  });

  test("handles paths with directories", () => {
    expect(lookupMimeType("/path/to/file.pdf")).toBe("application/pdf");
    expect(lookupMimeType("deep/nested/dir/image.png")).toBe("image/png");
  });

  test("is case-insensitive", () => {
    expect(lookupMimeType("FILE.PDF")).toBe("application/pdf");
    expect(lookupMimeType("Image.PNG")).toBe("image/png");
  });

  test("handles multiple dots in filename", () => {
    expect(lookupMimeType("my.special.report.pdf")).toBe("application/pdf");
    expect(lookupMimeType("backup.2024.01.01.sql")).toBe("application/octet-stream");
  });

  test("handles legacy office formats", () => {
    expect(lookupMimeType("old.doc")).toBe("application/msword");
    expect(lookupMimeType("old.ppt")).toBe("application/vnd.ms-powerpoint");
    expect(lookupMimeType("old.xls")).toBe("application/vnd.ms-excel");
  });

  test("handles audio/video formats", () => {
    expect(lookupMimeType("song.mp3")).toBe("audio/mpeg");
    expect(lookupMimeType("clip.mp4")).toBe("video/mp4");
    expect(lookupMimeType("clip.webm")).toBe("video/webm");
  });

  test("handles epub", () => {
    expect(lookupMimeType("book.epub")).toBe("application/epub+zip");
  });
});
