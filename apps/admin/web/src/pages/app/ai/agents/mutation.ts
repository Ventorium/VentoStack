export function agentMutationValues(
  values: Record<string, unknown>,
  mode: 'create' | 'edit',
): Record<string, unknown> {
  if (mode === 'create') return values;
  const { requiresVirtualEnvironment: _immutableRuntime, ...mutableValues } = values;
  return mutableValues;
}
