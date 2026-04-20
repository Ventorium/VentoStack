// @aeron/auth - 基于角色的访问控制
// 默认 deny，必须显式授权

export interface Permission {
  resource: string;
  action: string;
}

export interface Role {
  name: string;
  permissions: Permission[];
}

export interface RBAC {
  addRole(role: Role): void;
  removeRole(name: string): void;
  getRole(name: string): Role | undefined;
  hasPermission(roleName: string, resource: string, action: string): boolean;
  can(roles: string[], resource: string, action: string): boolean;
  listRoles(): Role[];
}

export function createRBAC(): RBAC {
  const roles = new Map<string, Role>();

  return {
    addRole(role: Role): void {
      roles.set(role.name, {
        name: role.name,
        permissions: [...role.permissions],
      });
    },

    removeRole(name: string): void {
      roles.delete(name);
    },

    getRole(name: string): Role | undefined {
      const role = roles.get(name);
      if (!role) return undefined;
      return { name: role.name, permissions: [...role.permissions] };
    },

    hasPermission(
      roleName: string,
      resource: string,
      action: string,
    ): boolean {
      const role = roles.get(roleName);
      if (!role) return false;
      return role.permissions.some(
        (p) => p.resource === resource && p.action === action,
      );
    },

    can(roleNames: string[], resource: string, action: string): boolean {
      return roleNames.some((roleName) => {
        const role = roles.get(roleName);
        if (!role) return false;
        return role.permissions.some(
          (p) => p.resource === resource && p.action === action,
        );
      });
    },

    listRoles(): Role[] {
      return Array.from(roles.values()).map((r) => ({
        name: r.name,
        permissions: [...r.permissions],
      }));
    },
  };
}
