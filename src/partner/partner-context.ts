import { createContext, useContext } from 'react';
import type { PartnerWorkspace, PartnerTopic, PartnerSubject } from '../partner-studio';

export interface PartnerContextValue {
  workspace: PartnerWorkspace;
  reload: () => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error') => void;
  demo: boolean;
}

export const PartnerContext = createContext<PartnerContextValue | null>(null);

export function usePartner(): PartnerContextValue {
  const value = useContext(PartnerContext);
  if (!value) throw new Error('PartnerContext missing');
  return value;
}

export function topicOf(workspace: PartnerWorkspace, topicId: string): PartnerTopic | undefined {
  return workspace.catalog.topics.find(t => t.id === topicId);
}

export function subjectOf(workspace: PartnerWorkspace, subjectId: string): PartnerSubject | undefined {
  return workspace.catalog.subjects.find(s => s.id === subjectId);
}
