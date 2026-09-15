import { describe, expect, test } from 'bun:test';
import { createToolRegistry } from '../tool-registry';
import type { ToolDefinition } from '../tool-registry';

function approvalTool(): ToolDefinition {
  return {
    name: 'file-write',
    description: '写文件',
    parameters: [{ name: 'path', type: 'string', description: '路径', required: true }],
    requiresApproval: true,
    riskLevel: 'high',
    handler: async (params) => ({ written: params.path }),
  };
}

describe('ToolRegistry 审批检查', () => {
  test('未配置 ApprovalManager 时拒绝执行需审批工具', async () => {
    const registry = createToolRegistry();
    registry.register(approvalTool());
    const result = await registry.execute('file-write', { path: 'a.txt' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('no ApprovalManager is configured');
  });

  test('skipApproval 跳过注册表这层检查（agent-loop 已在上游完成审批）', async () => {
    const registry = createToolRegistry();
    registry.register(approvalTool());
    const result = await registry.execute('file-write', { path: 'a.txt' }, { skipApproval: true });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ written: 'a.txt' });
  });

  test('skipApproval 不影响参数校验', async () => {
    const registry = createToolRegistry();
    registry.register(approvalTool());
    const result = await registry.execute('file-write', {}, { skipApproval: true });
    expect(result.success).toBe(false);
  });
});
