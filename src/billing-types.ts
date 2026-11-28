import type { ModelPurpose } from './model-catalog.ts';
export type PlanId = 'Free' | 'Plus' | 'Pro';
export type PlanFeature =
  | 'maths-index'
  | 'ai-quizzes'
  | 'ai-plan'
  | 'calendar-advanced'
  | 'weak-spot-report'
  | 'boosted-forum'
  | 'hybrid-quizzes'
  | 'realtime-progress';

export const BILLING_CYCLE_DAYS = 30;
export const FREE_WEEKLY_DEFAULT = 30;
export const PLAN_RANK: Record<PlanId, number> = { Free: 0, Plus: 1, Pro: 2 };
export const FEATURE_MIN_PLAN: Record<PlanFeature, PlanId> = {
  'maths-index': 'Plus',
  'ai-quizzes': 'Plus',
  'ai-plan': 'Plus',
  'calendar-advanced': 'Plus',
  'weak-spot-report': 'Pro',
  'boosted-forum': 'Pro',
  'hybrid-quizzes': 'Pro',
  'realtime-progress': 'Pro',
};

export function hasPlanFeature(plan: PlanId | undefined, feature: PlanFeature, role?: string): boolean {
  if (role === 'developer' || role === 'reviewer') return true;
  const current = plan ?? 'Free';
  return PLAN_RANK[current] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
}

export interface PlanRule {
  price: number;
  credits: number;
  weeklyCredits?: number | null;
  models: string[];
  defaultModel: string;
  defaultModels?: Record<ModelPurpose, string>;
}
export interface ModelRule { credits: number; enabled: boolean }
export interface BillingPolicy {
  version: number;
  schemaVersion?: number;
  plans: Record<PlanId, PlanRule>;
  models: Record<string, ModelRule>;
  reviewModel?: string;
}
export interface BillingAccount {
  plan: PlanId;
  period: string;
  cycleStart?: string;
  cycleEnd?: string;
  carryover?: number;
  renewal: boolean;
  pendingPlan: PlanId | null;
  model: string;
  models: Record<ModelPurpose, string>;
  updatedAt: string;
}
export interface CreditUsage { id: string; period: string; status: 'held' | 'charged' | 'released'; cost: number; createdAt: string; updatedAt: string; purpose: string; model: string; plan: string; tokens: TokenUsage; reason?: string }
export interface TokenUsage { input: number | null; output: number | null; total: number | null }
export interface BillingOrder { id: string; requestId: string; target: PlanId; from: PlanId; amount: number; currency: 'HKD'; status: 'pending' | 'mock-paid' | 'scheduled'; channel: string | null; createdAt: string; paidAt?: string; period: string; effectiveAt: string; credits: number; carryover?: number; policyVersion: number; simulation: true }
export interface BillingView {
  account: BillingAccount;
  policy: BillingPolicy;
  spent: number;
  held: number;
  available: number;
  cap: number;
  baseCap: number;
  carryover: number;
  weeklyCap: number | null;
  weeklySpent: number;
  weeklyHeld: number;
  weeklyAvailable: number | null;
  resetsAt: string;
  usage: CreditUsage[];
  orders: BillingOrder[];
}
export interface UsageLog { stage?: 'generation'|'review'; id: string; userId: string; username: string; name: string; operationId: string; plan: string; purpose: string; model: string; channel: string; endpoint: string; at: string; status: 'success' | 'error'; httpStatus: number | null; durationMs: number; request: { model: string; stream: boolean; msg_count: number; chars: number; has_tools: boolean; tools_count: number; first_role: string | null; temperature: number | null; max_tokens: number | null }; tokens: TokenUsage; error: { type: string; code: string; message: string } | null; truncated: boolean; settlement?: string; credit?: number }

export interface WeakSpotItem {
  skillId: string;
  skillName: string;
  subjectId: string;
  topicId: string;
  score: number | null;
  attempts: number;
  independentAttempts: number;
  hintedAttempts: number;
  wrongCount: number;
  paused: boolean;
  topCause: string | null;
  recommendation: string;
  actionUrl: string;
}

export interface WeakSpotAlert {
  signalId: string;
  skillId: string;
  skillName: string;
  subjectId: string;
  topicId: string;
  triggerKind: 'paused' | 'low-score' | 'hint-dependent' | 'mistakes';
  attempts: number;
  score: number | null;
  topCause: string | null;
  detectedAt: string;
}

export interface WeakSpotReport {
  generatedAt: string;
  summary: string;
  totalAttempts: number;
  independentRate: number | null;
  unresolvedMistakes: number;
  hintDependencyCount: number;
  errorCauses: { cause: string; count: number }[];
  weakSpots: WeakSpotItem[];
  caveat: string;
}

export interface RealtimeProgressItem {
  skillId: string;
  skillName: string;
  subjectId: string;
  topicId: string;
  score: number | null;
  delta: number | null;
  independentCount: number;
  lastAttemptAt: string | null;
  status: string;
}

export interface RealtimeProgressView {
  syncedAt: string;
  todayMinutes: number;
  todayTasksDone: number;
  todayTasksTotal: number;
  recentAttempts24h: number;
  activeSkills: RealtimeProgressItem[];
  recentEvents: { at: string; kind: string; title: string; topicId: string; detail: string }[];
}
