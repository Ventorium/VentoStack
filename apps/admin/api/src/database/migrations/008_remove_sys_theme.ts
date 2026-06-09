import type { Migration } from "@ventostack/database";

export const removeSysTheme: Migration = {
  name: "008_remove_sys_theme",

  async up(executor) {
    // 移除系统主题参数（主题改为每个用户自行设置，不再由系统参数控制）
    await executor(`DELETE FROM sys_config WHERE key = 'sys_theme'`);
  },

  async down(executor) {
    // 回滚：重新插入系统主题参数（ON CONFLICT 防止重复）
    await executor(`
      INSERT INTO sys_config (id, name, key, value, type, "group", remark, created_at, updated_at)
      VALUES (gen_random_uuid(), '系统主题', 'sys_theme', 'light', 0, 'ui', 'light 或 dark', NOW(), NOW())
      ON CONFLICT (key) DO NOTHING
    `);
  },
};
