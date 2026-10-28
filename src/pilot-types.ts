import type { Database, Evidence, PlanPreview, Question } from './types.ts';

export type Role = 'student' | 'reviewer' | 'developer';
export interface Identity { id: string; username: string; name: string; role: Role }
export interface Skill { id: string; name: string; prerequisites: string[]; minutes: [number, number]; policy?:Partial<Pick<typeof MASTERY_POLICY,'provisionalQuestions'|'stableQuestions'|'stableFamilies'|'stablePercent'|'delayedHours'>> }
export interface ReviewedQuestion extends Question {
  skillIds: string[]; familyId: string; scoring: { id: string; marks: number; critical: boolean }[];
  tolerance?: number; requiresSteps?: boolean; expectedMinutes: number; source: string; errorCandidates?: { answer?: string; reason: string; evidence: string }[];
}
export interface ContentPack {
  id: string; version: number; topicId: string; subjectId: string; title: string; source: string;
  status: 'draft' | 'published'; skills: Skill[]; lessons: { title: string; text: string; skillIds: string[] }[];
  questions: ReviewedQuestion[]; reviews: { questionId: string; userId: string; reviewer: string; at: string; method: string }[];
  publishedAt?: string; professionalVerified: boolean;
}
export interface PilotEvidence extends Evidence {
  at: string; familyId: string; skillIds: string[]; contentVersion: string; ruleVersion: string;
  criticalPassed: boolean; reviewed: boolean;
}
export interface SkillState { id: string; name: string; label: string; score: number | null; count: number; families: number; delayed: boolean; nextCheckAt?: string }
export interface ErrorCase {
  questionId: string; quizId: string; topicId: string; skillIds: string[]; observed: string;
  candidates: { reason: string; evidence: string; source: 'rule' | 'ai' }[];
  selected?: string; status: 'uncertain' | 'student-confirmed' | 'reviewed';
  history: { at: string; value: string; by: string }[];
}
export interface Cycle { skillId: string; failures: number; paused: boolean; questionIds: string[]; updatedAt: string }
export interface PilotInfo {
  revision: number; identity: Identity; skills: SkillState[]; errors: ErrorCase[]; cycles: Cycle[];
  content: { id: string; version: number; title: string; topicId: string; status: string }[];
}
export interface VersionedPreview extends PlanPreview { previewId: string; revision: number; ruleVersion: string; generatedAt: string; planDate:string; contentSignature:string; explanation?: string }
export interface PilotDatabase extends Database { pilot?: PilotInfo }

export const RULE_VERSION = 'pilot-1.0';
export const MASTERY_POLICY = { provisionalQuestions: 2, stableQuestions: 3, stableFamilies: 2, stablePercent: 80, delayedHours: 24, reviewDays: [1, 3, 7] };
