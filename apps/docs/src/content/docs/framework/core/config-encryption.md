---
order: 23
title: 配置加密存储
description: 使用 createConfigEncryptor 对敏感配置值进行 AES-256-GCM 加密
---

## 概述

`createConfigEncryptor` 创建配置加密器，使用 AES-256-GCM 算法加密和解密敏感配置值。加密后的值以 `ENC:` 前缀标识，可安全存储在配置文件或环境变量中。

## 基本用法

```typescript
import { createConfigEncryptor } from "@ventostack/core";

const encryptor = createConfigEncryptor({
  key: "a]v3ry-s3cur3-k3y-th4t-is-32byt!",  // 必须恰好 32 字节
});

// 加密
const encrypted = await encryptor.encrypt("my-database-password");
// => "ENC:dGVzdC1lbmNyeXB0ZWQtZGF0YQ=="

// 解密
const decrypted = await encryptor.decrypt(encrypted);
// => "my-database-password"

// 判断是否已加密
encryptor.isEncrypted("ENC:xxx");  // true
encryptor.isEncrypted("plain");    // false
```

## 接口定义

```typescript
interface ConfigEncryptionOptions {
  /** 加密密钥（UTF-8 编码后必须恰好为 32 字节） */
  key: string;
  /** 加密算法 */
  algorithm?: string;
}

interface ConfigEncryptor {
  encrypt(value: string): Promise<string>;
  decrypt(encrypted: string): Promise<string>;
  isEncrypted(value: string): boolean;
}

function createConfigEncryptor(options: ConfigEncryptionOptions): ConfigEncryptor;
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `key` | `string` | **必填** | 加密密钥，UTF-8 编码后必须恰好 32 字节 |
| `algorithm` | `string` | — | 加密算法（预留扩展） |

## 注意事项

- 密钥长度必须恰好为 32 字节（UTF-8 编码后），否则抛出错误
- 使用 AES-256-GCM 算法，每次加密生成随机 12 字节 IV，相同明文每次加密结果不同
- 加密后的值以 `ENC:` 前缀标识，`isEncrypted` 通过此前缀判断
- 密钥应通过安全渠道管理，切勿硬编码在源码中
- 与 `loadConfig` 配合使用时，可在加载阶段自动解密 `ENC:` 前缀的值
