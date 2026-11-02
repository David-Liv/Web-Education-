export const modelPurposes = ['quiz', 'chat', 'evaluation'] as const;
export type ModelPurpose = typeof modelPurposes[number];
export const modelPurposeLabels: Record<ModelPurpose, string> = {
  quiz: '測驗預設模型', chat: '普通對話預設模型', evaluation: '評估預設模型',
};

// Labels never become provider IDs. Keep meaningful variants such as Lite/Preview/Argon.
export function modelDisplayName(id: string) {
  return id.replace(/^(?:(?:pggo|bdgo|抗截断|抗截斷)-)+/i, '')
    .replace(/(?:-(?:pggo|bdgo|抗截断|抗截斷))+$/i, '');
}

// Enforced again immediately before any provider generation, including admin tests.
export function isAllowedModel(id: unknown): id is string {
  return typeof id === 'string' && /^pggo-抗截断-[a-z0-9][a-z0-9._:/-]*$/i.test(id)
    && !/bdgo/i.test(id);
}
