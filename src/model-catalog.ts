export const modelPurposes = ['quiz', 'chat', 'evaluation'] as const;
export type ModelPurpose = typeof modelPurposes[number];
export const modelPurposeLabels: Record<ModelPurpose, string> = {
  quiz: '測驗預設模型', chat: '普通對話預設模型', evaluation: '評估預設模型',
};

// Whitelist recognized model families so any upstream/proxy prefix (pg, pggo, 假流式, 抗截断, etc.)
// or trailing routing marker is automatically hidden, showing only the real model family & variant.
const MODEL_FAMILY_RE = /(?:^|[-/_:])((?:gemini|gpt|claude|deepseek|qwen|llama|mistral|grok|glm|kimi|moonshot|yi|doubao|hunyuan|minimax|ernie|spark|baichuan|step|cohere|command|nova|titan|o[134])(?:[-._][a-z0-9]+)*)/i;

// Labels never become provider IDs. Keep meaningful variants such as Lite/Preview/Argon/Hydrogen.
export function modelDisplayName(id: string) {
  const match = id.match(MODEL_FAMILY_RE);
  if (match) {
    const clean = match[1].replace(/(?:-(?:pggo|pgo|pg|bdgo|bdo|bd))+$/i, '');
    if (clean) return clean;
  }
  const stripped = id.replace(/^(?:(?:pggo|pgo|pg|bdgo|bdo|bd|假流式|流式|抗截断|抗截斷)-)+/i, '')
    .replace(/(?:-(?:pggo|pgo|pg|bdgo|bdo|bd|假流式|流式|抗截断|抗截斷))+$/i, '');
  return stripped || id;
}

export function defaultModelCredits(id: string) {
  const lower = id.toLowerCase();
  return lower.includes('lite') ? 2 : (lower.includes('argon') || lower.includes('hydrogen') || lower.includes('pro')) ? 20 : 5;
}

// Enforced again immediately before any provider generation, including admin tests.
export function isAllowedModel(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 200
    && /^[\p{L}\p{N}](?:[\p{L}\p{N}._:/-]*[\p{L}\p{N}])?$/u.test(id);
}

export function mergeDiscoveredModels<T extends {
  models: Record<string, { credits: number; enabled: boolean }>;
  plans: Record<'Free' | 'Plus' | 'Pro', { models: string[]; defaultModel?: string; defaultModels?: Record<ModelPurpose, string> }>;
  reviewModel?: string;
}>(input: T, ids: string[], enableAll = true, preferredModel?: string): { policy: T; added: number; updatedDefaults: boolean } {
  const policy = structuredClone(input);
  const validIds = [...new Set(ids.map(raw => raw.trim()).filter(isAllowedModel))];
  let added = 0;
  for (const id of validIds) {
    if (!policy.models[id]) {
      policy.models[id] = { credits: defaultModelCredits(id), enabled: enableAll };
      added++;
    } else if (enableAll && !policy.models[id].enabled) {
      policy.models[id].enabled = true;
      added++;
    }
    if (enableAll) {
      for (const plan of ['Free', 'Plus', 'Pro'] as const) {
        if (!policy.plans[plan].models.includes(id)) policy.plans[plan].models.push(id);
      }
    }
  }
  let updatedDefaults = false;
  if (enableAll && validIds.length > 0) {
    const idSet = new Set(validIds);
    const chosen = preferredModel && isAllowedModel(preferredModel.trim()) && policy.models[preferredModel.trim()]?.enabled
      ? preferredModel.trim()
      : validIds[0];
    if (chosen) {
      if (!policy.reviewModel || !idSet.has(policy.reviewModel) || !policy.models[policy.reviewModel]?.enabled) {
        policy.reviewModel = chosen;
        updatedDefaults = true;
      }
      for (const plan of ['Free', 'Plus', 'Pro'] as const) {
        const rule = policy.plans[plan];
        if (!rule.defaultModel || !idSet.has(rule.defaultModel) || !policy.models[rule.defaultModel]?.enabled) {
          rule.defaultModel = chosen;
          updatedDefaults = true;
        }
        if (rule.defaultModels) {
          for (const purpose of modelPurposes) {
            const cur = rule.defaultModels[purpose];
            if (!cur || !idSet.has(cur) || !policy.models[cur]?.enabled) {
              rule.defaultModels[purpose] = chosen;
              updatedDefaults = true;
            }
          }
          rule.defaultModel = rule.defaultModels.chat;
        }
      }
    }
  }
  return { policy, added, updatedDefaults };
}

export function setGlobalDefaultModel<T extends {
  models: Record<string, { credits: number; enabled: boolean }>;
  plans: Record<'Free' | 'Plus' | 'Pro', { models: string[]; defaultModel?: string; defaultModels?: Record<ModelPurpose, string> }>;
  reviewModel?: string;
}>(input: T, rawModel: string): T {
  const id = rawModel.trim();
  const { policy } = mergeDiscoveredModels(input, [id], true, id);
  if (!isAllowedModel(id)) return policy;
  policy.reviewModel = id;
  for (const plan of ['Free', 'Plus', 'Pro'] as const) {
    const rule = policy.plans[plan];
    rule.defaultModel = id;
    rule.defaultModels = { quiz: id, chat: id, evaluation: id };
  }
  return policy;
}
