# @ventostack/file2md

将常见办公文档和压缩包内容转换为 Markdown 的平台能力，主要服务于知识库导入、RAG 文档预处理和内容归档。

## 核心能力

- 文件类型和 MIME 识别
- 可扩展的解析器注册表
- 文档到 Markdown 的统一转换流程
- ZIP 条目安全读取
- 远程 OCR 接口
- 转换结果、错误和元数据的统一类型

## 使用边界

外部文件均视为不可信输入。调用方应限制文件大小、扩展名、解压规模和 OCR 出站地址。

```ts
import { createConverter } from "@ventostack/file2md";

const converter = createConverter({ maxFileSize: 20 * 1024 * 1024 });
```
