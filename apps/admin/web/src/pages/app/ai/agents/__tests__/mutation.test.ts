import { describe, expect, test } from 'bun:test';
import { agentMutationValues } from '../mutation';

describe('Agent virtual environment form contract', () => {
  test('submits the switch value when creating an Agent', () => {
    expect(agentMutationValues({ name: 'builder', requiresVirtualEnvironment: true }, 'create')).toEqual({
      name: 'builder',
      requiresVirtualEnvironment: true,
    });
  });

  test('never submits the immutable switch when editing an Agent', () => {
    expect(agentMutationValues({ name: 'builder', requiresVirtualEnvironment: false }, 'edit')).toEqual({
      name: 'builder',
    });
  });
});
