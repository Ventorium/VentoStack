---
order: 6
title: 页面清单
---

## 页面路由清单

Admin 前端使用 `vite-plugin-pages` 文件系统路由，页面文件位于 `apps/admin/web/src/pages/`。

### 认证页面

| 页面 | 路由 | 文件 |
|------|------|------|
| 登录页 | `/auth/login` | `pages/auth/login.tsx` |

### 主应用页面

| 页面 | 路由 | 文件 |
|------|------|------|
| Dashboard | `/app` | `pages/app/index.tsx` |
| 个人中心 | `/app/profile` | `pages/app/profile/index.tsx` |

### 系统管理页面

| 页面 | 路由 | 文件 | 权限标识 |
|------|------|------|----------|
| 用户管理 | `/app/system/users` | `pages/app/system/users/index.tsx` | `system:user:list` |
| 角色管理 | `/app/system/roles` | `pages/app/system/roles/index.tsx` | `system:role:list` |
| 菜单管理 | `/app/system/menus` | `pages/app/system/menus/index.tsx` | `system:menu:list` |
| 部门管理 | `/app/system/depts` | `pages/app/system/depts/index.tsx` | `system:dept:list` |
| 岗位管理 | `/app/system/posts` | `pages/app/system/posts/index.tsx` | `system:post:list` |
| 字典管理 | `/app/system/dict` | `pages/app/system/dict/index.tsx` | `system:dict:list` |
| 参数配置 | `/app/system/configs` | `pages/app/system/configs/index.tsx` | `system:config:list` |
| 通知公告 | `/app/system/notices` | `pages/app/system/notices/index.tsx` | `system:notice:list` |
| 操作日志 | `/app/system/logs` | `pages/app/system/logs/index.tsx` | `system:log:list` |
| 在线用户 | `/app/system/online` | `pages/app/system/online/index.tsx` | `system:online:list` |
| 代码生成 | `/app/system/gen` | `pages/app/system/gen/index.tsx` | `system:gen:list` |
| 文件管理 | `/app/system/oss` | `pages/app/system/oss/index.tsx` | `system:oss:list` |
| 定时任务 | `/app/system/scheduler` | `pages/app/system/scheduler/index.tsx` | `system:scheduler:list` |
| 系统监控 | `/app/system/monitor` | `pages/app/system/monitor/index.tsx` | `system:monitor:list` |
| 消息中心 | `/app/system/notification` | `pages/app/system/notification/index.tsx` | `system:notification:list` |

## 页面结构规范

每个 CRUD 页面遵循统一结构：

```
页面目录/
├── index.tsx           # 页面主组件
└── __tests__/
    └── index.test.tsx  # 页面测试
```

### 标准 CRUD 页面组成

1. **搜索栏** — `Form` + `Row` + `Col` 布局，关键词/状态/日期筛选
2. **操作按钮** — 新增、批量删除、导出
3. **数据表格** — `Table` + `useTable` Hook，分页、排序、选择
4. **操作列** — `ActionColumn` 组件，编辑/删除/更多操作
5. **新增/编辑弹窗** — `Modal` + `Form`，表单校验
6. **详情抽屉** — `Drawer`，展示完整信息

## 状态管理

### useAuth Store

```typescript
// store/useAuth.ts
interface UserProfile {
  id: string;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  avatar: string;
  gender: number;
  status: number;
  deptId: string;
  deptName: string;
  roles: string[];
  permissions: string[];
}

interface AuthState {
  user: UserProfile | null;
  ready: boolean;
  loading: boolean;
  login: (args: LoginForm) => Promise<LoginResult>;
  logout: () => Promise<void>;
  init: () => Promise<void>;
}
```

职责：登录/登出、用户信息、MFA 验证、Passkey 登录、Token 刷新。

### useMenu Store

```typescript
// store/useMenu.ts
interface MenuState {
  routes: FrontendRoute[];      // 动态路由树
  permissions: string[];        // 权限标识列表
  ready: boolean;
  collapsed: boolean;           // 侧边栏折叠状态
  fetchRoutes: () => Promise<void>;
  toggleCollapsed: () => void;
  hasPermission: (perm: string) => boolean;
}
```

职责：从后端加载用户菜单树和权限列表，控制页面访问和按钮显示。

## Hooks 清单

| Hook | 文件 | 用途 |
|------|------|------|
| `useTable` | `hooks/useTable.ts` | 分页表格状态管理（loading/data/total/page/pageSize/refresh/onSearch/onReset/onPageChange/rowSelection） |
| `useDict` | `hooks/useDict.ts` | 字典数据获取与缓存 |
| `useTheme` | `hooks/useTheme.ts` | 主题切换（light/dark/system） |
| `usePublicConfig` | `hooks/usePublicConfig.ts` | 公开配置获取（站点名称、MFA 开关等） |
| `useUrlQuery` | `hooks/useUrlQuery.ts` | URL 查询参数同步 |

## 组件清单

| 组件 | 文件 | 用途 |
|------|------|------|
| `ActionColumn` | `components/ActionColumn/index.tsx` | 表格操作列（编辑/删除/自定义操作/确认弹窗） |
| `DictSelect` | `components/DictSelect/index.tsx` | 字典下拉选择器 |
| `DictRadio` | `components/DictRadio/index.tsx` | 字典单选组 |
| `GlobalMessage` | `components/GlobalMessage/index.tsx` | 全局消息提示（成功/错误/警告） |
| `GlobalHistory` | `components/GlobalHistory/index.tsx` | 全局导航历史（用于在组件外跳转） |
| `AvatarCropper` | `components/AvatarCropper/index.tsx` | 头像裁剪上传 |

## 新增页面流程

1. 在 `pages/app/system/xxx/` 创建 `index.tsx`
2. 在 `pages/app/system/xxx/__tests__/` 创建 `index.test.tsx`
3. 在菜单配置（后端 `sys_menu` 表）中添加菜单项和权限标识
4. 刷新页面，菜单自动从后端加载

参考 `.claude/skills/admin-crud-page/SKILL.md` 获取完整 CRUD 页面模板。
