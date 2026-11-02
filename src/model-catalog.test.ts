import { describe, it, expect } from 'vitest';
import { modelDisplayName, isAllowedModel } from './model-catalog';

describe('model identity and display', () => {
  it('hides transport labels without changing meaningful model variants', () => {
    expect(modelDisplayName('pggo-抗截断-gemini-3.5-flash-lite')).toBe('gemini-3.5-flash-lite');
    expect(modelDisplayName('pggo-抗截断-gemini-4-argon')).toBe('gemini-4-argon');
    expect(modelDisplayName('bdgo-gemini-3-flash-preview-抗截断')).toBe('gemini-3-flash-preview');
  });
  it('allows only the approved anti-truncation route, never a display name', () => {
    expect(isAllowedModel('pggo-抗截断-gemini-3.8-flash')).toBe(true);
    for (const id of ['gemini-3.8-flash', 'pggo-gemini-3.8-flash', 'bdgo-抗截断-gemini-3.8-flash', 'pggo-抗截断-bdgo-gemini', 'pggo-抗截断-', null]) {
      expect(isAllowedModel(id)).toBe(false);
    }
  });
});
