import {
  createRouter,
  fail,
  handleError,
  parseBody,
  success,
} from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import type { RuntimeCapacityService } from '../services/runtime-capacity';
import type { RuntimeClientRegistry } from '../services/runtime-client-registry';
import type { RuntimeHostService } from '../services/runtime-host';
import type { RuntimeInstanceService } from '../services/runtime-instance';
import { routeDoc } from './schema';

interface CurrentUser {
  id: string;
  tenantId: string;
  isAdmin: boolean;
}

function currentUser(ctx: { user?: unknown }): CurrentUser {
  const user = ctx.user as { id?: string; tenantId?: string; roles?: string[] } | undefined;
  return {
    id: user?.id ?? '',
    tenantId: user?.tenantId ?? '',
    isAdmin: (user?.roles ?? []).includes('admin'),
  };
}

function publicInstance<T extends { sandboxId?: unknown }>(instance: T): Omit<T, 'sandboxId'> {
  const { sandboxId: _sandboxId, ...rest } = instance;
  return rest;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asInt(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) ? n : undefined;
}

function capacityBody(body: Record<string, unknown>): {
  cpuTotal?: number;
  memoryMbTotal?: number;
  diskMbTotal?: number;
  maxSandboxes?: number;
  reservedCpu?: number;
  reservedMemoryMb?: number;
  reservedDiskMb?: number;
} {
  const result: {
    cpuTotal?: number;
    memoryMbTotal?: number;
    diskMbTotal?: number;
    maxSandboxes?: number;
    reservedCpu?: number;
    reservedMemoryMb?: number;
    reservedDiskMb?: number;
  } = {};
  for (const key of [
    'cpuTotal',
    'memoryMbTotal',
    'diskMbTotal',
    'maxSandboxes',
    'reservedCpu',
    'reservedMemoryMb',
    'reservedDiskMb',
  ] as const) {
    const value = asInt(body[key]);
    if (value !== undefined) result[key] = value;
  }
  return result;
}


const RUNTIME_HOST_REQUIREMENTS = [
  'Linux x86_64（amd64）宿主，支持 KVM 硬件虚拟化（Intel VT-x / AMD-V，且已开启嵌套虚拟化）',
  '/dev/kvm 对运行用户可读写；建议 4 核 CPU、8GB 内存、20GB 以上可用磁盘',
  '宿主内核 5.4+（Firecracker 1.7）；使用 Firecracker/jailer 1.14 时宿主内核需 5.9+（close_range）',
  'guest vmlinux 必须为 5.10+ 且包含 virtio-rng，否则 TLS/getrandom 会阻塞；推荐 Firecracker CI 5.10 内核',
  'Firecracker 1.7+ 与对应 jailer；vmlinux 需包含 virtio-blk / virtio-net / virtio-vsock / virtio-rng',
  'ext4/xfs/btrfs 数据目录；ext4 可用 sparse copy 回退，XFS/Btrfs 有 reflink 加速',
  '启用联网时：Linux bridge、IP forwarding、NAT、DNS 与出站防火墙已配置',
  '宿主机已安装 ip、iptables、tar、gzip；安装命令需 root/sudo 执行',
];

const RUNTIME_HOST_PRECHECK_COMMAND = String.raw`bash -euo pipefail <<'SH'
fail=0
ok(){ echo "PASS  $*"; }
bad(){ echo "FAIL  $*"; fail=1; }
[ "$(uname -s)" = "Linux" ] && ok "Linux" || bad "must be Linux"
[ "$(uname -m)" = "x86_64" ] && ok "x86_64" || bad "must be x86_64"
[ -r /dev/kvm ] && [ -w /dev/kvm ] && ok "/dev/kvm R/W" || bad "/dev/kvm not readable/writable"
grep -qE '(^| )(vmx|svm)( |$)' /proc/cpuinfo && ok "CPU virtualization" || bad "CPU vmx/svm missing (nested virtualization?)"
k=$(uname -r); if printf '%s\n' "$k" | awk -F. '{exit !($1>5 || ($1==5 && $2>=4))}'; then ok "host kernel >= 5.4 ($k)"; else bad "host kernel >= 5.4 required ($k)"; fi
if ! printf '%s\n' "$k" | awk -F. '{exit !($1>5 || ($1==5 && $2>=9))}'; then echo "WARN  host kernel < 5.9: pin Firecracker/jailer 1.7, or upgrade before 1.14"; fi
[ "$(nproc)" -ge 4 ] && ok "CPU $(nproc) cores" || bad "at least 4 CPU cores recommended"
mem=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
[ "$mem" -ge 8192 ] && ok "RAM $mem MiB" || bad "at least 8192MiB RAM recommended"
[ -e /dev/net/tun ] && ok "/dev/net/tun" || bad "/dev/net/tun missing"
command -v ip >/dev/null && command -v iptables >/dev/null && command -v tar >/dev/null && ok "base tools" || bad "ip/iptables/tar missing"
[ -d /sys/fs/cgroup ] && ok "cgroup present" || bad "cgroup missing"
echo
if [ "$fail" -eq 0 ]; then echo "PRECHECK PASSED"; else echo "PRECHECK FAILED"; exit 1; fi
SH`;

export function createRuntimeHostRoutes(deps: {
  hostService: RuntimeHostService;
  instanceService: RuntimeInstanceService;
  capacity: RuntimeCapacityService;
  clients: RuntimeClientRegistry;
  authMiddleware: Middleware;
  perm: (resource: string, action: string) => Middleware;
  platformAdminMiddleware?: Middleware;
}): Router {
  const router = createRouter();
  router.use(deps.authMiddleware);

  const platformAdmin: Middleware = async (ctx, next) => {
    if (!deps.platformAdminMiddleware) {
      return fail('平台管理员校验未配置，无法管理虚拟机宿主', 503, 503);
    }
    return deps.platformAdminMiddleware(ctx, next);
  };

  router.get(
    '/api/ai/runtime-hosts',
    routeDoc('获取虚拟机宿主列表'),
    async (ctx) => {
      try {
        const list = await deps.hostService.list();
        return success(list);
      } catch (error) {
        return handleError(error);
      }
    },
    platformAdmin,
    deps.perm('ai:runtime-host', 'list'),
  );

  router.get(
    '/api/ai/runtime-hosts/preflight',
    routeDoc('获取虚拟机宿主预检要求与命令'),
    async () =>
      success({
        requirements: RUNTIME_HOST_REQUIREMENTS,
        command: RUNTIME_HOST_PRECHECK_COMMAND,
      }),
    platformAdmin,
    deps.perm('ai:runtime-host', 'list'),
  );

  router.post(
    '/api/ai/runtime-hosts',
    routeDoc('新增虚拟机宿主', {
      body: {
        name: { type: 'string', max: 128, required: true, description: '宿主名称' },
        note: { type: 'string', max: 500, description: '备注' },
        listenAddress: {
          type: 'string',
          max: 255,
          required: true,
          description: '宿主机监听地址（IP:PORT）',
        },
        cpuTotal: { type: 'int', description: 'CPU 核数（可留空，接入后自动探测）' },
        memoryMbTotal: { type: 'int', description: '内存 MB（可留空）' },
        diskMbTotal: { type: 'int', description: '磁盘 MB（可留空）' },
        maxSandboxes: { type: 'int', description: '最大沙箱数' },
      },
    }),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const name = asString(body.name)?.trim();
        const listenAddress = asString(body.listenAddress)?.trim();
        if (!name || name.length > 128) return fail('宿主名称必须为 1-128 字符', 400, 400);
        if (!listenAddress || listenAddress.length > 255) {
          return fail('监听地址必须为 1-255 字符', 400, 400);
        }
        const note = asString(body.note);
        if (note && note.length > 500) return fail('备注最多 500 字符', 400, 400);
        const result = await deps.hostService.create({
          name,
          listenAddress,
          ...(note === undefined ? {} : { note }),
          capacity: capacityBody(body),
          ...(currentUser(ctx).id ? { createdBy: currentUser(ctx).id } : {}),
        });
        return success(result);
      } catch (error) {
        return handleError(error);
      }
    },
    platformAdmin,
    deps.perm('ai:runtime-host', 'create'),
  );

  router.get(
    '/api/ai/runtime-hosts/:id',
    routeDoc('获取虚拟机宿主详情'),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const item = await deps.hostService.getById(id);
        return item ? success(item) : fail('宿主不存在', 404, 404);
      } catch (error) {
        return handleError(error);
      }
    },
    platformAdmin,
    deps.perm('ai:runtime-host', 'list'),
  );

  router.put(
    '/api/ai/runtime-hosts/:id',
    routeDoc('更新虚拟机宿主', {
      body: {
        name: { type: 'string', max: 128, description: '宿主名称' },
        note: { type: 'string', max: 500, description: '备注' },
        enabled: { type: 'bool', description: '是否启用' },
        cpuTotal: { type: 'int', description: 'CPU 核数' },
        memoryMbTotal: { type: 'int', description: '内存 MB' },
        diskMbTotal: { type: 'int', description: '磁盘 MB' },
        maxSandboxes: { type: 'int', description: '最大沙箱数' },
      },
    }),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const body = await parseBody(ctx.request);
        const name = asString(body.name);
        if (name !== undefined && (!name.trim() || name.length > 128)) {
          return fail('宿主名称必须为 1-128 字符', 400, 400);
        }
        const note = body.note === null ? null : asString(body.note);
        if (typeof note === 'string' && note.length > 500) {
          return fail('备注最多 500 字符', 400, 400);
        }
        const updated = await deps.hostService.update(id, {
          ...(name === undefined ? {} : { name: name.trim() }),
          ...(note === undefined ? {} : { note }),
          ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
          capacity: capacityBody(body),
        });
        if (!updated) return fail('宿主不存在', 404, 404);
        deps.clients.invalidate(id);
        return success(updated);
      } catch (error) {
        return handleError(error);
      }
    },
    platformAdmin,
    deps.perm('ai:runtime-host', 'update'),
  );

  router.delete(
    '/api/ai/runtime-hosts/:id',
    routeDoc('删除虚拟机宿主', {
      query: { force: { type: 'string', description: '存在实例时是否强制销毁' } },
    }),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const force = String((ctx.query as Record<string, unknown>).force ?? '') === 'true';
        const count = await deps.hostService.countInstances(id);
        if (count > 0 && !force) {
          return fail(`该宿主仍有 ${count} 台虚拟机实例，确认后可强制删除`, 409, 409);
        }
        if (count > 0) await deps.instanceService.destroyByHost(id);
        await deps.hostService.delete(id);
        deps.clients.invalidate(id);
        return success(null);
      } catch (error) {
        return handleError(error);
      }
    },
    platformAdmin,
    deps.perm('ai:runtime-host', 'delete'),
  );

  router.post(
    '/api/ai/runtime-hosts/:id/verify',
    routeDoc('验证虚拟机宿主连接', {
      body: { baseUrl: { type: 'string', max: 512, required: true, description: '宿主地址' } },
    }),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const body = await parseBody(ctx.request);
        const baseUrl = asString(body.baseUrl)?.trim();
        if (!baseUrl) return fail('宿主地址不能为空', 400, 400);
        const item = await deps.hostService.verify(id, baseUrl);
        deps.clients.invalidate(id);
        return success(item);
      } catch (error) {
        return handleError(error);
      }
    },
    platformAdmin,
    deps.perm('ai:runtime-host', 'verify'),
  );

  router.post(
    '/api/ai/runtime-hosts/:id/refresh',
    routeDoc('刷新虚拟机宿主状态'),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const item = await deps.hostService.check(id);
        deps.clients.invalidate(id);
        return success(item);
      } catch (error) {
        return handleError(error);
      }
    },
    platformAdmin,
    deps.perm('ai:runtime-host', 'verify'),
  );

  router.post(
    '/api/ai/runtime-hosts/:id/rotate-token',
    routeDoc('轮换虚拟机宿主 Token'),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const result = await deps.hostService.rotateToken(id);
        deps.clients.invalidate(id);
        return success(result);
      } catch (error) {
        return handleError(error);
      }
    },
    platformAdmin,
    deps.perm('ai:runtime-host', 'update'),
  );

  router.get(
    '/api/ai/runtime-hosts/:id/instances',
    routeDoc('获取宿主上的虚拟机实例'),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const list = await deps.instanceService.listByHost(id);
        return success(list.map(publicInstance));
      } catch (error) {
        return handleError(error);
      }
    },
    platformAdmin,
    deps.perm('ai:runtime-host', 'list'),
  );

  router.get(
    '/api/ai/runtime/availability',
    routeDoc('获取当前用户的虚拟机资源可用性'),
    async (ctx) => {
      try {
        const user = currentUser(ctx);
        if (!user.id) return fail('未登录', 401, 401);
        const availability = await deps.capacity.getAvailability(user.tenantId, user.id);
        return success({
          ...availability,
          canManageHosts: user.isAdmin,
        });
      } catch (error) {
        return handleError(error);
      }
    },
    deps.perm('ai:agent', 'list'),
  );

  router.get(
    '/api/ai/runtime/instances',
    routeDoc('获取当前用户的虚拟机实例'),
    async (ctx) => {
      try {
        const user = currentUser(ctx);
        if (!user.id) return fail('未登录', 401, 401);
        const list = await deps.instanceService.listByUser(user.tenantId, user.id);
        return success(list.map(publicInstance));
      } catch (error) {
        return handleError(error);
      }
    },
    deps.perm('ai:chat', 'use'),
  );

  router.post(
    '/api/ai/runtime/instances/:id/pause',
    routeDoc('暂停虚拟机实例'),
    async (ctx) => {
      try {
        const user = currentUser(ctx);
        const id = (ctx.params as Record<string, string>).id!;
        const instance = await deps.instanceService.getById(id);
        if (!instance || instance.tenantId !== user.tenantId || (instance.userId !== user.id && !user.isAdmin)) {
          return fail('实例不存在', 404, 404);
        }
        if (!instance.sandboxId) return fail('实例尚未创建', 409, 409);
        await deps.instanceService.pause(instance.id);
        return success(null);
      } catch (error) {
        return handleError(error);
      }
    },
    deps.perm('ai:chat', 'use'),
  );

  router.post(
    '/api/ai/runtime/instances/:id/resume',
    routeDoc('恢复虚拟机实例'),
    async (ctx) => {
      try {
        const user = currentUser(ctx);
        const id = (ctx.params as Record<string, string>).id!;
        const instance = await deps.instanceService.getById(id);
        if (!instance || instance.tenantId !== user.tenantId || (instance.userId !== user.id && !user.isAdmin)) {
          return fail('实例不存在', 404, 404);
        }
        if (!instance.sandboxId) return fail('实例尚未创建', 409, 409);
        await deps.instanceService.resume(instance.id);
        return success(null);
      } catch (error) {
        return handleError(error);
      }
    },
    deps.perm('ai:chat', 'use'),
  );

  router.post(
    '/api/ai/runtime/instances/:id/destroy',
    routeDoc('销毁虚拟机实例'),
    async (ctx) => {
      try {
        const user = currentUser(ctx);
        const id = (ctx.params as Record<string, string>).id!;
        const instance = await deps.instanceService.getById(id);
        if (!instance || instance.tenantId !== user.tenantId || (instance.userId !== user.id && !user.isAdmin)) {
          return fail('实例不存在', 404, 404);
        }
        await deps.instanceService.destroy({
          tenantId: instance.tenantId,
          userId: instance.userId,
          agentId: instance.agentId,
        });
        return success(null);
      } catch (error) {
        return handleError(error);
      }
    },
    deps.perm('ai:chat', 'use'),
  );

  return router;
}
