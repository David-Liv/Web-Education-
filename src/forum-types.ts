import type { Subject } from './types.ts';

export type ForumFlair = 'vent' | 'help' | 'tips' | 'chat' | 'resource' | 'official';
export type ForumVisibility = 'public' | 'members';
export type ForumSort = 'hot' | 'new' | 'top';
export type ForumReactionKind = 'upvote' | 'same' | 'cheer' | 'useful';
export type ForumReportReason = 'harassment' | 'cheating' | 'spam' | 'privacy' | 'other';

export const MAX_FORUM_IMAGES = 3;
export const MAX_FORUM_IMAGE_BYTES = 200 * 1024;
export const FORUM_TOTAL_IMAGE_QUOTA_BYTES = 40 * 1024 * 1024;
export const REPORT_AUTO_HIDE_THRESHOLD = 3;

export const FORUM_FLAIR_META: Record<ForumFlair, { label: string; tone: string }> = {
  vent: { label: '吐槽／樹洞', tone: 'amber' },
  help: { label: '解題求助', tone: 'blue' },
  tips: { label: '溫習心得', tone: 'green' },
  chat: { label: '日常吹水', tone: 'neutral' },
  resource: { label: '資源分享', tone: 'lavender' },
  official: { label: '官方引導', tone: 'green' },
};

export const FORUM_REACTION_META: Record<Exclude<ForumReactionKind, 'upvote'>, { emoji: string; label: string }> = {
  same: { emoji: '😭', label: '我都係' },
  cheer: { emoji: '💪', label: '加油' },
  useful: { emoji: '💡', label: '有用' },
};

export const FORUM_REPORT_REASON_LABELS: Record<ForumReportReason, string> = {
  harassment: '人身攻擊／欺凌嘲諷',
  cheating: '試場違規／洩題作弊',
  spam: '洗版／廣告宣傳',
  privacy: '公開他人私隱資料',
  other: '其他不當內容',
};

export interface ForumBoard {
  id: string;
  name: string;
  short: string;
  description: string;
  color: string;
  icon: string;
  group: 'general' | 'pinned-subject' | 'other-subject';
  subjectId?: string;
  defaultMembersOnly?: boolean;
}

export interface ForumQuestionRef {
  sourceKind: 'wrong' | 'quiz-result' | 'practice' | 'maths-index';
  subjectId: string;
  topicName?: string;
  title: string;
  promptExcerpt: string;
  externalUrl?: string;
}

export interface ForumPollInput {
  question: string;
  options: string[];
}

export interface ForumPollOptionView {
  id: string;
  label: string;
  votes: number;
  percent: number;
}

export interface ForumPollView {
  question: string;
  options: ForumPollOptionView[];
  totalVotes: number;
  myOptionId: string | null;
}

export interface ForumReactionsSummary {
  upvote: number;
  same: number;
  cheer: number;
  useful: number;
  myReactions: ForumReactionKind[];
}

export interface ForumPostSummary {
  id: string;
  boardId: string;
  flair: ForumFlair;
  visibility: ForumVisibility;
  title: string;
  bodyPreview: string;
  authorLabel: string;
  isAnonymous: boolean;
  isOfficial: boolean;
  isMine: boolean;
  pinned: boolean;
  locked: boolean;
  status: 'active' | 'auto_hidden' | 'deleted';
  imageIds: string[];
  hasPoll: boolean;
  questionRef?: ForumQuestionRef;
  reactions: ForumReactionsSummary;
  commentCount: number;
  hotScore: number;
  distressSupport: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ForumCommentView {
  id: string;
  postId: string;
  parentId: string | null;
  authorLabel: string;
  isAnonymous: boolean;
  isOfficial: boolean;
  isOp: boolean;
  anonIndex: number | null;
  isMine: boolean;
  body: string;
  status: 'active' | 'auto_hidden' | 'deleted';
  upvotes: number;
  myUpvoted: boolean;
  distressSupport: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ForumCommentNode extends ForumCommentView {
  depth: number;
  visualDepth: number;
  replyToLabel?: string;
  children: ForumCommentNode[];
}

export interface ForumPostDetail extends Omit<ForumPostSummary, 'bodyPreview'> {
  body: string;
  poll?: ForumPollView;
  comments: ForumCommentView[];
  restricted?: false;
}

export interface ForumRestrictedPost {
  id: string;
  boardId: string;
  flair: ForumFlair;
  visibility: 'members';
  restricted: true;
  createdAt: string;
}

export interface ForumProfileView {
  nickname: string;
  mutedUntil: number | null;
  muteReason: string | null;
  canModerate: boolean;
  isDeveloper: boolean;
}

export interface ForumNotificationView {
  id: string;
  postId: string;
  commentId: string;
  actorLabel: string;
  postTitle: string;
  excerpt: string;
  read: boolean;
  createdAt: string;
}

export interface ForumModerationItem {
  targetType: 'post' | 'comment';
  targetId: string;
  postId: string;
  boardId: string;
  title: string;
  excerpt: string;
  status: 'active' | 'auto_hidden' | 'deleted';
  isAnonymous: boolean;
  reportCount: number;
  reasons: { reason: ForumReportReason; details: string; createdAt: string }[];
  authorMutedUntil: number | null;
  canMuteAuthor: boolean;
  createdAt: string;
}

export function buildForumBoards(subjects: Subject[], selectedSubjectIds: string[] = []): ForumBoard[] {
  const selected = new Set(selectedSubjectIds);
  const general: ForumBoard[] = [
    {
      id: 'lounge',
      name: '吹水／樹洞',
      short: '吹水樹洞',
      description: '溫書累了來抖抖氣、吐苦水、講廢話，互相撐住。',
      color: '#3d7d66',
      icon: '🍃',
      group: 'general',
      defaultMembersOnly: true,
    },
    {
      id: 'jupas',
      name: '升學／JUPAS',
      short: 'JUPAS',
      description: '排 Banding、計分策略、面試同大學生活討論。',
      color: '#6b7755',
      icon: '🎓',
      group: 'general',
    },
  ];
  const catA = subjects.filter(s => s.category === 'A');
  const pinnedSubjects: ForumBoard[] = [];
  const otherSubjects: ForumBoard[] = [];
  for (const s of catA) {
    const board: ForumBoard = {
      id: `sub-${s.id}`,
      name: s.name,
      short: s.short,
      description: `${s.name}解題交流、溫習方法與試卷吐槽。`,
      color: s.color,
      icon: s.icon,
      group: selected.has(s.id) ? 'pinned-subject' : 'other-subject',
      subjectId: s.id,
    };
    if (selected.has(s.id)) pinnedSubjects.push(board);
    else otherSubjects.push(board);
  }
  otherSubjects.push({
    id: 'applied-other',
    name: '應用學習／其他語言',
    short: '應學／外語',
    description: '乙類應用學習（ApL）及丙類其他語言科目交流。',
    color: '#7a8f9a',
    icon: '語',
    group: 'other-subject',
  });
  return [...general, ...pinnedSubjects, ...otherSubjects];
}

export function isValidBoardId(boardId: string, subjects: Subject[]): boolean {
  if (boardId === 'lounge' || boardId === 'jupas' || boardId === 'applied-other') return true;
  if (boardId.startsWith('sub-')) {
    const subId = boardId.slice(4);
    return subjects.some(s => s.category === 'A' && s.id === subId);
  }
  return false;
}

export function boardForSubject(subjectId: string, subjects: Subject[]): string {
  const match = subjects.find(s => s.id === subjectId);
  if (!match) return 'lounge';
  if (match.category === 'A') return `sub-${match.id}`;
  return 'applied-other';
}

export function computeHotScore(upvotes: number, commentCount: number, createdAt: string): number {
  const points = Math.max(0, upvotes) * 2 + Math.max(0, commentCount) * 1.5;
  const order = Math.log10(Math.max(points, 1));
  const epochSeconds = Math.max(0, (Date.parse(createdAt) || Date.now()) / 1000 - 1767225600);
  return Number((order + epochSeconds / 45000).toFixed(5));
}

export function buildCommentTree(comments: ForumCommentView[], sort: 'hot' | 'new' = 'hot'): ForumCommentNode[] {
  const byId = new Map<string, ForumCommentView>();
  for (const c of comments) byId.set(c.id, c);

  const childrenMap = new Map<string | null, ForumCommentView[]>();
  for (const c of comments) {
    const parentKey = c.parentId && byId.has(c.parentId) ? c.parentId : null;
    const list = childrenMap.get(parentKey) ?? [];
    list.push(c);
    childrenMap.set(parentKey, list);
  }

  const compare = (a: ForumCommentView, b: ForumCommentView) => {
    if (sort === 'new') return b.createdAt.localeCompare(a.createdAt);
    if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
    return a.createdAt.localeCompare(b.createdAt);
  };

  function visit(parentId: string | null, depth: number, parentLabel?: string): ForumCommentNode[] {
    const items = [...(childrenMap.get(parentId) ?? [])].sort(compare);
    return items.map(item => {
      const visualDepth = Math.min(depth, 2);
      return {
        ...item,
        depth,
        visualDepth,
        replyToLabel: depth > 2 ? parentLabel : undefined,
        children: visit(item.id, depth + 1, item.authorLabel),
      };
    });
  }

  return visit(null, 0);
}

const DISTRESS_PATTERNS = [
  /想死/u,
  /唔想活|不想活|活不下去/u,
  /唔想做人|不想做人/u,
  /自殺|自杀|輕生|轻生/u,
  /跳樓|跳楼|割脈|割脉|自殘|自残/u,
  /\b(?:kill\s+myself|end\s+my\s+life|want\s+to\s+die|commit\s+suicide)\b/i,
];

export function hasDistressSignal(text: string): boolean {
  if (!text) return false;
  return DISTRESS_PATTERNS.some(re => re.test(text));
}

export function defaultTopicForSubject(subjectId?: string): string {
  switch (subjectId) {
    case 'chi':
      return 'chi-reading';
    case 'eng':
      return 'eng-inference';
    case 'chem':
      return 'chem-acids';
    case 'maths':
    default:
      return 'maths-quadratic';
  }
}

export function buildForumTutorPrompt(post: {
  title: string;
  body: string;
  questionRef?: ForumQuestionRef;
}): string {
  const parts: string[] = ['我在同學討論區看到這個問題，想請你一步步帶我理解：', '', `標題：${post.title}`];
  if (post.questionRef) {
    parts.push(
      `相關題目（${post.questionRef.title}）：`,
      post.questionRef.promptExcerpt,
    );
  }
  if (post.body.trim()) {
    parts.push('', '討論內容：', post.body.trim().slice(0, 2500));
  }
  parts.push('', '請先不要直接只給最終答案，先幫我拆解第一步應該怎樣想。');
  return parts.join('\n');
}
