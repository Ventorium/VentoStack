---
order: 8
title: 状态管理
---

## Zustand Stores

Admin 前端使用 Zustand 管理全局状态，所有 Store 位于 `apps/admin/web/src/store/`。

## useAuth — 认证状态

```typescript
// store/useAuth.ts
import { create } from "zustand";

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
  computed: { logged: boolean };
  init: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  patchUser: (patch: Partial<UserProfile>) => void;
  login: (args: LoginForm) => Promise<LoginResult>;
  completeMFALogin: (mfaToken: string, code: string) => Promise<LoginResult>;
  passkeyLogin: (username: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
}
```

### 职责

- 登录/登出（密码登录、MFA 验证、Passkey 登录）
- Token 管理（Access Token / Refresh Token）
- 用户信息获取与更新
- 登录状态初始化（页面刷新后自动恢复）

### 使用示例

```typescript
import { useAuth } from "@/store/useAuth";

function UserInfo() {
  const { user, logout } = useAuth();
  return (
    <div>
      {user?.nickname}
      <button onClick={logout}>退出</button>
    </div>
  );
}
```

## useMenu — 菜单与权限

```typescript
// store/useMenu.ts
import { create } from "zustand";

export interface FrontendRoute {
  name: string;
  path: string;
  component?: string;
  icon?: string;
  children?: FrontendRoute[];
  permission?: string;
  hidden?: boolean;
}

interface MenuState {
  routes: FrontendRoute[];
  permissions: string[];
  ready: boolean;
  collapsed: boolean;
  fetchRoutes: () => Promise<void>;
  toggleCollapsed: () => void;
  hasPermission: (perm: string) => boolean;
}
```

### 职责

- 从后端加载用户菜单树（`/api/system/user/routes`）
- 从后端加载权限列表（`/api/system/user/permissions`）
- 控制侧边栏折叠状态
- 权限检查（`hasPermission`）

### 使用示例

```typescript
import { useMenu } from "@/store/useMenu";

function SideMenu() {
  const { routes, collapsed, toggleCollapsed } = useMenu();
  return (
    <Menu
      items={routes}
      inlineCollapsed={collapsed}
      onCollapse={toggleCollapsed}
    />
  );
}
```

## token — Token 存储

```typescript
// store/token.ts
export function getAccessToken(): string | null;
export function setAccessToken(token: string): void;
export function clearToken(): void;
export function getRefreshToken(): string | null;
export function setRefreshToken(token: string): void;
```

### 职责

- Access Token / Refresh Token 的 localStorage 存取
- Token 清除（登出时）

## config — 全局配置

```typescript
// store/config.ts
interface ConfigState {
  siteName: string;
  theme: string;
  // ... 其他公开配置
}
```

### 职责

- 公开配置缓存（从 `/api/system/configs/public` 加载）
- 站点名称、主题、MFA 开关等配置

## 状态管理规范

- 使用 Zustand `create` 创建 Store
- 状态更新通过 Store 方法，禁止直接修改
- 异步操作在 Store 中处理，组件只调用方法
- 敏感数据（Token）不存入 Store，使用 localStorage
