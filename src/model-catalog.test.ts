import { describe, it, expect } from 'vitest';
import { modelDisplayName, isAllowedModel, mergeDiscoveredModels, setGlobalDefaultModel } from './model-catalog';

describe('model identity and display', () => {
  it('hides transport labels without changing meaningful model variants', () => {
    expect(modelDisplayName('pggo-抗截断-gemini-3.5-flash-lite')).toBe('gemini-3.5-flash-lite');
    expect(modelDisplayName('pggo-抗截断-gemini-4-argon')).toBe('gemini-4-argon');
    expect(modelDisplayName('pg-抗截断-gemini-4-hydrogen')).toBe('gemini-4-hydrogen');
    expect(modelDisplayName('pgo-gemini-4-hydrogen')).toBe('gemini-4-hydrogen');
    expect(modelDisplayName('gemini-4-hydrogen')).toBe('gemini-4-hydrogen');
    expect(modelDisplayName('bdgo-gemini-3-flash-preview-抗截断')).toBe('gemini-3-flash-preview');
  });
  it('allows any valid model ID prefix while rejecting empty or malformed IDs', () => {
    for (const id of ['pggo-抗截断-gemini-3.8-flash', 'gemini-4-hydrogen', 'pg-gemini-4-hydrogen', 'pgo-抗截断-gemini-4-hydrogen', 'bdgo-抗截断-gemini-3.8-flash', 'openai/gpt-4.1-mini']) {
      expect(isAllowedModel(id)).toBe(true);
    }
    for (const id of ['', 'pggo-抗截断-', '-gemini-4-hydrogen', 'gemini 4 hydrogen', null, undefined]) {
      expect(isAllowedModel(id)).toBe(false);
    }
  });
  it('batch-adds discovered models with default credits, enables them across plans, and updates stale defaults', () => {
    const base: {
      models: Record<string, { credits: number; enabled: boolean }>;
      plans: Record<'Free' | 'Plus' | 'Pro', { models: string[]; defaultModel?: string; defaultModels?: Record<'quiz' | 'chat' | 'evaluation', string> }>;
      reviewModel?: string;
    } = {
      models: { 'pggo-抗截断-gemini-3.5-flash-lite': { credits: 2, enabled: true } },
      plans: {
        Free: { models: ['pggo-抗截断-gemini-3.5-flash-lite'], defaultModel: 'pggo-抗截断-gemini-3.5-flash-lite' },
        Plus: { models: ['pggo-抗截断-gemini-3.5-flash-lite'], defaultModel: 'pggo-抗截断-gemini-3.5-flash-lite' },
        Pro: { models: ['pggo-抗截断-gemini-3.5-flash-lite'], defaultModel: 'pggo-抗截断-gemini-3.5-flash-lite' },
      },
      reviewModel: 'pggo-抗截断-gemini-3.8-flash',
    };
    const { policy, added, updatedDefaults } = mergeDiscoveredModels(base, ['gemini-4-hydrogen', 'pg-抗截断-gemini-3.8-flash'], true, 'gemini-4-hydrogen');
    expect(added).toBe(2);
    expect(updatedDefaults).toBe(true);
    expect(policy.models['gemini-4-hydrogen']).toEqual({ credits: 20, enabled: true });
    expect(policy.models['pg-抗截断-gemini-3.8-flash']).toEqual({ credits: 5, enabled: true });
    expect(policy.plans.Free.models).toContain('gemini-4-hydrogen');
    expect(policy.plans.Pro.models).toContain('pg-抗截断-gemini-3.8-flash');
    expect(policy.reviewModel).toBe('gemini-4-hydrogen');
    expect(policy.plans.Free.defaultModel).toBe('gemini-4-hydrogen');
    const explicit = setGlobalDefaultModel(policy, 'pg-抗截断-gemini-3.8-flash');
    expect(explicit.reviewModel).toBe('pg-抗截断-gemini-3.8-flash');
    expect(explicit.plans.Pro.defaultModels).toEqual({ quiz: 'pg-抗截断-gemini-3.8-flash', chat: 'pg-抗截断-gemini-3.8-flash', evaluation: 'pg-抗截断-gemini-3.8-flash' });
  });
});
