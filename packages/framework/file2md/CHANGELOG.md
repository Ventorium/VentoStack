# @ventostack/file2md

## 0.2.0

### Minor Changes

- [`bf00f3f`](https://github.com/Ventorium/VentoStack/commit/bf00f3fab47373f8c7d95025bcc8552bc8e35744) Thanks [@erguotou520](https://github.com/erguotou520)! - file2md 的主解析改为委托 @ventostack/file-parser（Rust napi）：doc/docx/ppt/pptx/xls/xlsx/odt/ods/odp/rtf/epub/csv/pdf/html/图片(OCR) 全部由 Rust 完成，移除手写解析器与 @llamaindex/liteparse 依赖；本地仅保留 ZIP 解包与文本（markdown/代码/结构化/纯文本）兜底。OCR 服务重定义为 PaddleOCR 连接配置（`createRemoteOCRService` 支持 `token` 展开为 `Authorization: bearer` 头），ai 侧知识库上传新增 `ocr_token` 配置键贯通到解析。

## 0.1.1

### Patch Changes

- [#1](https://github.com/Ventorium/VentoStack/pull/1) [`0b99c01`](https://github.com/Ventorium/VentoStack/commit/0b99c017d9b2c5c8a8090f677c26e89e66430d35) Thanks [@erguotou520](https://github.com/erguotou520)! - Prepare every framework and platform package for compiled npm distribution, document each
  package, and add secure database-backed AI provider and model resolution.
