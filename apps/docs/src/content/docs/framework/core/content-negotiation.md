---
title: Content Negotiation
description: 内容协商，根据 Accept 请求头选择最合适的响应格式
---

`negotiate` 函数解析 `Accept` 请求头，按质量因子（q 值）排序后匹配服务端支持的响应类型。

## 基本用法

```typescript
import { negotiate } from "@ventostack/core";

const result = negotiate(ctx.headers.get("accept"));
// { type: "json", contentType: "application/json" }

switch (result.type) {
  case "json":
    return ctx.json(data);
  case "html":
    return ctx.html(renderHTML(data));
  case "text":
    return ctx.text(formatText(data));
  case "xml":
    return ctx.text(renderXML(data), 200, { "Content-Type": result.contentType });
}
```

## 指定支持的类型

```typescript
// 仅支持 JSON 和 HTML
const result = negotiate(acceptHeader, ["json", "html"]);
```

## 支持的媒体类型

| 类型标识 | Content-Type |
|---------|-------------|
| `json` | `application/json` |
| `html` | `text/html; charset=utf-8` |
| `text` | `text/plain; charset=utf-8` |
| `xml` | `application/xml` |

## 匹配规则

1. 解析 `Accept` 头，按 `q` 值降序排列
2. 精确匹配 MIME 类型
3. 通配符匹配（如 `text/*`）
4. 无匹配或 `*/*` 时默认返回 JSON

## 函数签名

```typescript
function negotiate(
  acceptHeader: string | null,
  supported?: Array<"json" | "html" | "text" | "xml">,
): NegotiationResult;
```

## NegotiationResult

| 属性 | 类型 | 说明 |
|------|------|------|
| `type` | `"json" \| "html" \| "text" \| "xml"` | 匹配的响应类型 |
| `contentType` | `string` | 对应的 Content-Type 值 |
