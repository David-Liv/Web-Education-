import type { ModelPurpose } from './model-catalog.ts';
export type PlanId = 'Free' | 'Plus' | 'Pro';
export interface PlanRule { price: number; credits: number; models: string[]; defaultModel: string; defaultModels?: Record<ModelPurpose, string> }
export interface ModelRule { credits: number; enabled: boolean }
export interface BillingPolicy { version: number; plans: Record<PlanId, PlanRule>; models: Record<string, ModelRule>; reviewModel?: string }
export interface BillingAccount { plan: PlanId; period: string; renewal: boolean; pendingPlan: PlanId | null; model: string; models: Record<ModelPurpose, string>; updatedAt: string }
export interface CreditUsage { id: string; period: string; status: 'held' | 'charged' | 'released'; cost: number; createdAt: string; updatedAt: string; purpose: string; model: string; plan: string; tokens: TokenUsage; reason?: string }
export interface TokenUsage { input: number | null; output: number | null; total: number | null }
export interface BillingOrder { id: string; requestId: string; target: PlanId; from: PlanId; amount: number; currency: 'HKD'; status: 'pending' | 'mock-paid' | 'scheduled'; channel: string | null; createdAt: string; paidAt?: string; period: string; effectiveAt: string; credits: number; policyVersion: number; simulation: true }
export interface BillingView { account: BillingAccount; policy: BillingPolicy; spent: number; held: number; available: number; cap: number; resetsAt: string; usage: CreditUsage[]; orders: BillingOrder[] }
export interface UsageLog { stage?: 'generation'|'review'; id: string; userId: string; username: string; name: string; operationId: string; plan: string; purpose: string; model: string; channel: string; endpoint: string; at: string; status: 'success' | 'error'; httpStatus: number | null; durationMs: number; request: { model: string; stream: boolean; msg_count: number; chars: number; has_tools: boolean; tools_count: number; first_role: string | null; temperature: number | null; max_tokens: number | null }; tokens: TokenUsage; error: { type: string; code: string; message: string } | null; truncated: boolean; settlement?: string; credit?: number }
