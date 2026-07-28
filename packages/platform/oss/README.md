# @ventostack/oss

对象存储服务：文件上传、下载、删除、签名 URL。

## 模块定位

文件存储业务模块，依赖 core、database。支持本地存储和 S3 适配器。

## 核心能力

- 本地文件系统和 S3 存储适配器
- 文件上传、下载、删除和元数据维护
- 签名 URL 生成
- MIME 类型和扩展名检测
- 文件记录 Model、管理路由和数据库迁移
- `createOSSModule()` 平台装配入口

## 安全特性

### 路径遍历防护

本地存储适配器 `createLocalStorageAdapter` 使用 `resolve()` + 前缀校验：

```typescript
const resolved = resolve(resolvedBase, cleaned);
if (!resolved.startsWith(resolvedBase + sep) && resolved !== resolvedBase) {
  throw new Error("Path traversal detected");
}
```

- 所有路径经过 `resolve()` 规范化后再检查前缀
- `..`、符号链接等逃逸路径被拦截
- 写入和读取操作都做路径校验

### MIME 类型检测

上传文件使用多级 MIME 检测：

1. 请求显式声明的 `contentType`
2. 文件头字节检测（`detectMIME`，至少 12 字节）
3. 扩展名推断（`mimeFromExtension`）

### 文件大小限制

- 文件 Schema 支持 `maxSize` 约束（字节）
- 上传大小受 HTTP 请求体大小限制保护

### 存储路径隔离

文件存储路径按 `bucket/yyyyMMDD/uuid.ext` 格式生成，不使用用户输入的文件名作为存储路径，防止文件名注入。

## 编码约束

- 禁止使用用户输入直接拼接文件路径
- 新增存储适配器必须实现路径遍历防护
- 文件下载必须校验文件归属（uploader_id 或 bucket 约束）
