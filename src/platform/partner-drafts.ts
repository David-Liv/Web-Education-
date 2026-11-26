// Local, text-only drafts for the Partner Tutor studio (chapter transcripts and the merged
// manuscript) so a page reload does not lose a tutor's corrections. Audio is never stored.
import type { ChapterTranscripts } from '../partner-studio';
import type { TutorDelivery } from '../tutors';

export interface PartnerLocalDraft {
  transcripts: ChapterTranscripts;
  manuscript: string;
  delivery: TutorDelivery;
}

const key = (partnerId: string, topicId: string) => `hokse.partner-draft.${partnerId}.${topicId}`;
const empty = (): PartnerLocalDraft => ({ transcripts: {}, manuscript: '', delivery: 'chat' });

export function loadPartnerDraft(partnerId: string, topicId: string): PartnerLocalDraft {
  try {
    const raw = localStorage.getItem(key(partnerId, topicId));
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<PartnerLocalDraft>;
    return {
      transcripts: parsed.transcripts && typeof parsed.transcripts === 'object' ? parsed.transcripts : {},
      manuscript: typeof parsed.manuscript === 'string' ? parsed.manuscript : '',
      delivery: parsed.delivery === 'pdf-first' ? 'pdf-first' : 'chat',
    };
  } catch {
    return empty();
  }
}

export function savePartnerDraft(partnerId: string, topicId: string, draft: PartnerLocalDraft): void {
  try {
    localStorage.setItem(key(partnerId, topicId), JSON.stringify(draft));
  } catch {
    /* storage full or blocked: the draft simply stays in memory */
  }
}

export function clearPartnerDraft(partnerId: string, topicId: string): void {
  try {
    localStorage.removeItem(key(partnerId, topicId));
  } catch {
    /* ignore */
  }
}

export function partnerTopicsWithLocalWork(partnerId: string): Set<string> {
  const out = new Set<string>();
  try {
    const prefix = `hokse.partner-draft.${partnerId}.`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) out.add(k.slice(prefix.length));
    }
  } catch {
    /* ignore */
  }
  return out;
}
