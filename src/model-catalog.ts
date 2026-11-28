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

// Two-tier model access: Free is restricted to lightweight models (lite / mini / haiku / nano / small);
// Plus and Pro have full access to all enabled AI models.
export function isLiteModel(id: string): boolean {
  const name = modelDisplayName(id).toLowerCase();
  return /(?:^|[-._/])(lite|mini|nano|haiku|small|tiny)(?:$|[-._/])/.test(name) || name.includes('lite');
}

export function defaultModelCredits(id: string) {
  const lower = id.toLowerCase();
  return isLiteModel(id) ? 2 : (lower.includes('argon') || lower.includes('hydrogen') || lower.includes('pro')) ? 20 : 5;
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
      // Free receives lightweight models automatically; Plus & Pro receive all enabled models.
      const targets: readonly ('Free' | 'Plus' | 'Pro')[] = isLiteModel(id)
        ? ['Free', 'Plus', 'Pro']
        : ['Plus', 'Pro'];
      for (const plan of targets) {
        if (!policy.plans[plan].models.includes(id)) policy.plans[plan].models.push(id);
      }
    }
  }
  // Ensure Free still has at least one enabled model (preferring lite, otherwise cheapest enabled).
  if (enableAll && !policy.plans.Free.models.some(m => policy.models[m]?.enabled) && validIds.length > 0) {
    const cheapest = [...validIds].sort((a, b) => (policy.models[a]?.credits ?? 5) - (policy.models[b]?.credits ?? 5))[0];
    if (cheapest) policy.plans.Free.models.push(cheapest);
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
        const planChosen = rule.models.includes(chosen)
          ? chosen
          : rule.models.find(m => idSet.has(m) && policy.models[m]?.enabled) ?? rule.models.find(m => policy.models[m]?.enabled) ?? chosen;
        if (!rule.defaultModel || !idSet.has(rule.defaultModel) || !policy.models[rule.defaultModel]?.enabled || !rule.models.includes(rule.defaultModel)) {
          rule.defaultModel = planChosen;
          updatedDefaults = true;
        }
        if (rule.defaultModels) {
          for (const purpose of modelPurposes) {
            const cur = rule.defaultModels[purpose];
            if (!cur || !idSet.has(cur) || !policy.models[cur]?.enabled || !rule.models.includes(cur)) {
              rule.defaultModels[purpose] = planChosen;
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
    const target = rule.models.includes(id) ? id : (rule.models.find(m => policy.models[m]?.enabled) ?? id);
    if (!rule.models.includes(target)) rule.models.push(target);
    rule.defaultModel = target;
    rule.defaultModels = { quiz: target, chat: target, evaluation: target };
  }
  return policy;
}
