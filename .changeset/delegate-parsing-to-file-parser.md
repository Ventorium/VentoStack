---
"@ventostack/file2md": minor
"@ventostack/ai": patch
---

file2md 的主解析改为委托 @ventostack/file-parser（Rust napi）：doc/docx/ppt/pptx/xls/xlsx/odt/ods/odp/rtf/epub/csv/pdf/html/图片(OCR) 全部由 Rust 完成，移除手写解析器与 @llamaindex/liteparse 依赖；本地仅保留 ZIP 解包与文本（markdown/代码/结构化/纯文本）兜底。OCR 服务重定义为 PaddleOCR 连接配置（`createRemoteOCRService` 支持 `token` 展开为 `Authorization: bearer` 头），ai 侧知识库上传新增 `ocr_token` 配置键贯通到解析。
