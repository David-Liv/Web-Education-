import type { Programme, ScoreFormula } from './types.ts';

export const SCORING_VERSION = 'admissions-reference-v1.1';
export function programmeFormula(p: Programme): ScoreFormula {
  if (p.formula) return p.formula;
  const count = Number(p.selection?.match(/best\s*([456])/i)?.[1] ?? 5);
  return { count, required: [], weights: {}, scale: 'standard', verified: false };
}
export function programmeAssumptions(p: Programme) {
  return p.scoringAssumptions ?? (p.formula?.verified ? [] : ['採用已收錄規則及平台參考假設，並非官方錄取預測。']);
}
