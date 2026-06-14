/**
 * 最小化 ZIP 文件读取器
 * 仅支持 DOCX 场景所需的 Stored 和 Deflate 压缩方式
 */

import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * 从 Buffer 中读取 ZIP 文件的所有条目
 * 仅支持 Stored (0) 和 Deflate (8) 压缩方式
 */
export function readZipEntries(buffer: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];

  // 查找 End of Central Directory
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Invalid ZIP: no EOCD");

  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const numEntries = buffer.readUInt16LE(eocdOffset + 10);

  // 遍历 Central Directory
  let offset = centralDirOffset;
  for (let i = 0; i < numEntries; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid ZIP: bad central dir entry at ${offset}`);
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);

    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf-8");

    // 从 Local File Header 读取数据
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize);

    let data: Buffer;
    if (compressionMethod === 0) {
      // Stored
      data = Buffer.from(compressedData);
    } else if (compressionMethod === 8) {
      // Deflate
      data = Buffer.from(inflateRawSync(compressedData));
    } else {
      throw new Error(`Unsupported compression method: ${compressionMethod}`);
    }

    if (data.length !== uncompressedSize) {
      throw new Error(`Size mismatch for ${name}: expected ${uncompressedSize}, got ${data.length}`);
    }

    entries.push({ name, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}
