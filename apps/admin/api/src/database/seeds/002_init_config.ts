import { createTagLogger, generateUUID } from '@ventostack/core';
import type { Seed } from '@ventostack/database';

const log = createTagLogger('seeds');

export const initConfigSeed: Seed = {
  name: '002_init_config',

  async run(executor) {
    const configs = [
      { name: '启用部门管理', key: 'sys_dept_enabled', value: 'true', type: 2, group: 'system', remark: '是否在用户管理页面显示部门树' },
      { name: '用户初始密码', key: 'sys_user_init_password', value: '123456', type: 0, group: 'user', remark: '新建用户和重置密码时的默认密码' },
      { name: '密码最小长度', key: 'sys_password_min_length', value: '6', type: 1, group: 'password', remark: '用户密码最小长度要求' },
      { name: '密码复杂度要求', key: 'sys_password_complexity', value: 'low', type: 0, group: 'password', remark: 'low=无要求, medium=字母+数字, high=字母+数字+特殊字符' },
      { name: '密码过期天数', key: 'sys_password_expire_days', value: '30', type: 1, group: 'password', remark: '-1 表示永不过期' },
      { name: '登录最大失败次数', key: 'sys_login_max_attempts', value: '5', type: 1, group: 'login', remark: '超过此次数后锁定账户' },
      { name: '账户锁定时长(分钟)', key: 'sys_login_lock_minutes', value: '15', type: 1, group: 'login', remark: '账户被锁定后的持续时间' },
      { name: '系统主题', key: 'sys_theme', value: 'light', type: 0, group: 'ui', remark: 'light 或 dark' },
      { name: '系统名称', key: 'sys_site_name', value: 'VentoStack', type: 0, group: 'ui', remark: '浏览器标签页和登录页显示的系统名称' },
      { name: '启用MFA多因素认证', key: 'sys_mfa_enabled', value: 'false', type: 2, group: 'mfa', remark: '全局MFA开关，关闭后所有用户仅用密码登录' },
      { name: '强制要求MFA', key: 'sys_mfa_force', value: 'false', type: 2, group: 'mfa', remark: '开启后未配置MFA的用户首次登录后必须设置MFA' },
      { name: '启用Passkey通行密钥', key: 'sys_passkey_enabled', value: 'true', type: 2, group: 'passkey', remark: '全局Passkey开关，开启后用户可使用通行密钥登录' },
    ];

    for (const cfg of configs) {
      const id = generateUUID();
      await executor(
        `INSERT INTO sys_config (id, name, key, value, type, "group", remark, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (key) DO NOTHING`,
        [id, cfg.name, cfg.key, cfg.value, cfg.type, cfg.group, cfg.remark],
      );
    }

    log.info('Config seed created — 13 system configs');
  },
};
