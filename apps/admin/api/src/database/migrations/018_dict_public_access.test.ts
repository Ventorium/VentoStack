import { describe, expect, test } from 'bun:test';
import { addDictPublicAccess } from './018_dict_public_access';

describe('018_dict_public_access', () => {
  test('存量字典默认保持不可公开访问并建立非空默认值', async () => {
    const statements: string[] = [];
    await addDictPublicAccess.up(async (sql) => {
      statements.push(String(sql));
      return [];
    });

    const sql = statements.join('\n');
    expect(sql).toContain('is_public BOOLEAN NOT NULL DEFAULT FALSE');
    expect(sql).toContain('SET is_public = FALSE WHERE is_public IS NULL');
    expect(sql).toContain('ALTER COLUMN is_public SET NOT NULL');
  });
});
