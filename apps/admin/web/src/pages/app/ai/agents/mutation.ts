export function agentMutationValues(
  values: Record<string, unknown>,
  _mode: 'create' | 'edit',
): Record<string, unknown> {
  // 虚拟环境开关允许创建/编辑；是否可用由后端在保存时再次校验。
  return values;
}
