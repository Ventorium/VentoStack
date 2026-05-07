import { createTagLogger, generateUUID } from '@ventostack/core';
import type { Seed } from '@ventostack/database';

const log = createTagLogger('seeds');

export const initDictSeed: Seed = {
  name: '003_init_dict',

  async run(executor) {
    const types = [
      { code: 'sys_status', name: '系统状态', remark: '通用启禁用状态' },
      { code: 'sys_notice_type', name: '通知类型', remark: '通知公告的类型' },
      { code: 'sys_notice_status', name: '通知状态', remark: '通知公告的发布状态' },
      { code: 'sys_menu_type', name: '菜单类型', remark: '系统菜单类型' },
      { code: 'sys_config_type', name: '参数类型', remark: '系统参数的值类型' },
      { code: 'sys_gender', name: '性别', remark: '用户性别' },
    ];

    const dataMap: Record<string, Array<{ label: string; value: string; sort: number; cssClass?: string }>> = {
      sys_status: [
        { label: '正常', value: '1', sort: 1, cssClass: 'green' },
        { label: '禁用', value: '0', sort: 2, cssClass: 'red' },
      ],
      sys_notice_type: [
        { label: '通知', value: '1', sort: 1, cssClass: 'blue' },
        { label: '公告', value: '2', sort: 2, cssClass: 'purple' },
      ],
      sys_notice_status: [
        { label: '草稿', value: '0', sort: 1, cssClass: 'default' },
        { label: '已发布', value: '1', sort: 2, cssClass: 'green' },
        { label: '已撤回', value: '2', sort: 3, cssClass: 'orange' },
      ],
      sys_menu_type: [
        { label: '目录', value: '1', sort: 1, cssClass: 'blue' },
        { label: '菜单', value: '2', sort: 2, cssClass: 'green' },
        { label: '按钮', value: '3', sort: 3, cssClass: 'orange' },
      ],
      sys_config_type: [
        { label: '字符串', value: '0', sort: 1 },
        { label: '数字', value: '1', sort: 2 },
        { label: '布尔', value: '2', sort: 3 },
        { label: 'JSON', value: '3', sort: 4 },
      ],
      sys_gender: [
        { label: '未知', value: '0', sort: 1 },
        { label: '男', value: '1', sort: 2 },
        { label: '女', value: '2', sort: 3 },
      ],
    };

    for (const type of types) {
      const typeId = generateUUID();
      await executor(
        `INSERT INTO sys_dict_type (id, name, code, status, remark, created_at, updated_at)
         VALUES ($1, $2, $3, 1, $4, NOW(), NOW())
         ON CONFLICT (code) DO NOTHING`,
        [typeId, type.name, type.code, type.remark],
      );

      const items = dataMap[type.code] ?? [];
      for (const item of items) {
        const dataId = generateUUID();
        await executor(
          `INSERT INTO sys_dict_data (id, type_code, label, value, sort, css_class, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW())
           ON CONFLICT (type_code, value) DO NOTHING`,
          [dataId, type.code, item.label, item.value, item.sort, item.cssClass ?? ''],
        );
      }
    }

    log.info(`Dict seed created — ${types.length} dict types`);
  },
};
