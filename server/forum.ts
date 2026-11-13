import { createHash } from 'node:crypto';
import type { Store } from './store.ts';
import type { Identity } from '../src/pilot-types.ts';
import { catalog } from '../src/data/catalog.ts';
import {
  FORUM_FLAIR_META,
  FORUM_REPORT_REASON_LABELS,
  FORUM_TOTAL_IMAGE_QUOTA_BYTES,
  MAX_FORUM_IMAGES,
  MAX_FORUM_IMAGE_BYTES,
  REPORT_AUTO_HIDE_THRESHOLD,
  computeHotScore,
  hasDistressSignal,
  isValidBoardId,
} from '../src/forum-types.ts';
import type {
  ForumCommentView,
  ForumFlair,
  ForumModerationItem,
  ForumNotificationView,
  ForumPollView,
  ForumPostDetail,
  ForumPostSummary,
  ForumProfileView,
  ForumQuestionRef,
  ForumReactionKind,
  ForumReactionsSummary,
  ForumReportReason,
  ForumRestrictedPost,
  ForumSort,
  ForumVisibility,
} from '../src/forum-types.ts';

const FORUM_SEED_KEY = 'forum:starter-v1';
const RESERVED_NICKNAMES = /官方|管理員|管理员|版主|學序團隊|学序团队|hokse\s*official|admin|moderator|匿名同學|匿名同学|匿名樓主|匿名楼主/iu;

interface StoredPoll {
  question: string;
  options: { id: string; label: string }[];
}

function fail(message: string, status = 400, code = 'INVALID_REQUEST'): never {
  throw Object.assign(new Error(message), { status, code });
}

export function detectImageMime(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export class ForumService {
  private store: Store;
  private postRate = new Map<string, number[]>();
  private commentRate = new Map<string, number[]>();

  constructor(store: Store) {
    this.store = store;
  }

  async ensureStarterPosts(): Promise<void> {
    const existing = await this.store.db.prepare('SELECT body FROM settings WHERE id=?').get(FORUM_SEED_KEY);
    if (existing) return;
    await this.store.transaction(async () => {
      const again = await this.store.db.prepare('SELECT body FROM settings WHERE id=?').get(FORUM_SEED_KEY);
      if (again) return;
      const t0 = '2026-11-01T09:00:00.000Z';
      const t1 = '2026-11-01T09:05:00.000Z';
      const t2 = '2026-11-01T09:10:00.000Z';
      const starters = [
        {
          id: 'official-starter-welcome',
          boardId: 'lounge',
          flair: 'official' as ForumFlair,
          visibility: 'public' as ForumVisibility,
          pinned: 1,
          title: '歡迎來到學序同學討論區 · 匿名規則與吹水指南',
          body: [
            '呢度係專為準備 DSE 同學而設嘅放鬆與交流空間——無論你想問各科題目、傾 JUPAS 排位，定係溫書溫到好攰想搵地方呻下，都歡迎你！',
            '',
            '- **獨立暱稱與單帖匿名**：討論區唔會公開你嘅登入帳號或任何練習成績；每次出 Post 或留言都可以隨時勾選「匿名發布」。',
            '- **樹洞私隱保護**：公開帖子方便你將連結 Share 去 WhatsApp 俾同學睇；如果想講私密心事，勾選「僅登入同學可見」就只有登入咗學序嘅同學睇到。',
            '- **互相尊重**：呢度唔設負評／踩掣。遇到人身攻擊、洩題作弊或騷擾內容，請按「舉報」交由版務處理。',
          ].join('\n'),
          poll: null,
          at: t2,
        },
        {
          id: 'official-starter-treehole',
          boardId: 'lounge',
          flair: 'vent' as ForumFlair,
          visibility: 'members' as ForumVisibility,
          pinned: 0,
          title: '🌲 備考樹洞長期集合樓：今日溫書破防／小確幸都可以放低喺度',
          body: [
            '今日做 Past Paper 卡關？測驗派卷覺得灰？定係終於搞明咗一個煩咗好耐嘅 Concept？',
            '',
            '隨時喺下面留言吐苦水或者打氣（可以揀匿名留言），唔使同人比較，慢慢行都係進步。',
          ].join('\n'),
          poll: null,
          at: t1,
        },
        {
          id: 'official-starter-poll',
          boardId: 'lounge',
          flair: 'chat' as ForumFlair,
          visibility: 'public' as ForumVisibility,
          pinned: 0,
          title: '📊 破冰投票：大家目前溫 DSE 最頭痕係邊一科／邊一環？',
          body: '投完票都歡迎喺下面留言講下最卡住邊個 Topic，睇下有無同路人一齊交流貼士！',
          poll: JSON.stringify({
            question: '目前備試最令你頭痕嘅係邊一項？',
            options: [
              { id: 'opt-chi', label: '中文（閱讀推斷／文言十二篇／寫作）' },
              { id: 'opt-eng', label: '英文（Reading／Writing／Listening）' },
              { id: 'opt-maths', label: '數學（MC 速度／長題目步驟）' },
              { id: 'opt-elective', label: '選修科（清 Concept＋背 Marking Scheme）' },
              { id: 'opt-time', label: '時間唔夠用／好難集中精神開始溫' },
            ],
          } satisfies StoredPoll),
          at: t0,
        },
      ];
      for (const s of starters) {
        await this.store.db.prepare(
          `INSERT INTO forum_posts
            (id,board_id,author_id,is_official,is_anonymous,visibility,flair,title,body,question_ref,poll_body,image_ids,pinned,locked,status,upvote_count,comment_count,created_at,updated_at)
           VALUES (?,?,NULL,1,0,?,?,?,?,NULL,?,'[]',?,0,'active',0,0,?,?)
           ON CONFLICT(id) DO NOTHING`,
        ).run(s.id, s.boardId, s.visibility, s.flair, s.title, s.body, s.poll, s.pinned, s.at, s.at);
      }
      await this.store.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(FORUM_SEED_KEY, JSON.stringify({ seededAt: t2 }));
    });
  }

  private defaultNickname(userId: string): string {
    const tag = createHash('sha256').update(this.store.key).update('forum-nick:' + userId).digest('hex').slice(0, 4).toUpperCase();
    return `同學 ${tag}`;
  }

  private checkRate(bucket: Map<string, number[]>, userId: string, limit: number, windowMs: number, label: string) {
    const now = Date.now();
    const recent = (bucket.get(userId) ?? []).filter(t => now - t < windowMs);
    if (recent.length >= limit) fail(`${label}太頻密，請稍等片刻再試`, 429, 'RATE_LIMITED');
    recent.push(now);
    bucket.set(userId, recent);
  }

  async getProfile(user: Identity): Promise<ForumProfileView> {
    let row = await this.store.db.prepare('SELECT * FROM forum_profiles WHERE user_id=?').get(user.id);
    if (!row) {
      const nickname = this.defaultNickname(user.id);
      const now = new Date().toISOString();
      await this.store.db.prepare(
        'INSERT INTO forum_profiles (user_id,nickname,muted_until,mute_reason,updated_at) VALUES (?,?,NULL,NULL,?) ON CONFLICT(user_id) DO NOTHING',
      ).run(user.id, nickname, now);
      row = await this.store.db.prepare('SELECT * FROM forum_profiles WHERE user_id=?').get(user.id);
    }
    const mutedUntil = row?.muted_until ? Number(row.muted_until) : null;
    const activeMute = mutedUntil && mutedUntil > Date.now() ? mutedUntil : null;
    return {
      nickname: String(row?.nickname ?? this.defaultNickname(user.id)),
      mutedUntil: activeMute,
      muteReason: activeMute ? String(row?.mute_reason ?? '') || null : null,
      canModerate: user.role === 'developer' || user.role === 'reviewer',
      isDeveloper: user.role === 'developer',
    };
  }

  private async assertNotMuted(user: Identity): Promise<ForumProfileView> {
    const profile = await this.getProfile(user);
    if (profile.mutedUntil && profile.mutedUntil > Date.now()) {
      const hours = Math.max(1, Math.ceil((profile.mutedUntil - Date.now()) / 3600000));
      fail(`此帳戶目前暫停討論區發言（約餘 ${hours} 小時）${profile.muteReason ? `：${profile.muteReason}` : ''}`, 403, 'FORUM_MUTED');
    }
    return profile;
  }

  async updateNickname(user: Identity, rawNickname: string): Promise<ForumProfileView> {
    await this.assertNotMuted(user);
    const nickname = String(rawNickname ?? '').replace(/[\r\n\t]+/g, ' ').trim();
    if (nickname.length < 2 || nickname.length > 20) fail('論壇暱稱須為 2 至 20 個字元');
    if (user.role === 'student' && RESERVED_NICKNAMES.test(nickname)) fail('此暱稱包含保留字詞，請換一個輕鬆的稱呼');
    const conflict = await this.store.db.prepare(
      'SELECT user_id FROM forum_profiles WHERE LOWER(nickname)=LOWER(?) AND user_id<>?',
    ).get(nickname, user.id);
    if (conflict) fail('這個論壇暱稱已被其他同學使用，請換一個', 409, 'NICKNAME_TAKEN');
    const now = new Date().toISOString();
    await this.store.db.prepare(
      `INSERT INTO forum_profiles (user_id,nickname,muted_until,mute_reason,updated_at)
       VALUES (?,?,NULL,NULL,?)
       ON CONFLICT(user_id) DO UPDATE SET nickname=excluded.nickname,updated_at=excluded.updated_at`,
    ).run(user.id, nickname, now);
    return this.getProfile(user);
  }

  private async nicknamesMap(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    const map = new Map<string, string>();
    if (!unique.length) return map;
    const placeholders = unique.map(() => '?').join(',');
    const rows = await this.store.db.prepare(`SELECT user_id,nickname FROM forum_profiles WHERE user_id IN (${placeholders})`).all(...unique);
    for (const r of rows) map.set(String(r.user_id), String(r.nickname));
    for (const id of unique) {
      if (!map.has(id)) map.set(id, this.defaultNickname(id));
    }
    return map;
  }

  private async postReactionsMap(postIds: string[], viewerId?: string): Promise<Map<string, ForumReactionsSummary>> {
    const map = new Map<string, ForumReactionsSummary>();
    for (const id of postIds) map.set(id, { upvote: 0, same: 0, cheer: 0, useful: 0, myReactions: [] });
    if (!postIds.length) return map;
    const placeholders = postIds.map(() => '?').join(',');
    const rows = await this.store.db.prepare(
      `SELECT target_id,kind,COUNT(*) AS n FROM forum_reactions WHERE target_type='post' AND target_id IN (${placeholders}) GROUP BY target_id,kind`,
    ).all(...postIds);
    for (const r of rows) {
      const item = map.get(String(r.target_id));
      const kind = String(r.kind) as ForumReactionKind;
      if (item && (kind === 'upvote' || kind === 'same' || kind === 'cheer' || kind === 'useful')) {
        item[kind] = Number(r.n);
      }
    }
    if (viewerId) {
      const mine = await this.store.db.prepare(
        `SELECT target_id,kind FROM forum_reactions WHERE target_type='post' AND user_id=? AND target_id IN (${placeholders})`,
      ).all(viewerId, ...postIds);
      for (const r of mine) {
        const item = map.get(String(r.target_id));
        if (item) item.myReactions.push(String(r.kind) as ForumReactionKind);
      }
    }
    return map;
  }

  private formatPostSummary(
    row: Record<string, any>,
    nicknames: Map<string, string>,
    reactions: ForumReactionsSummary,
    viewer: Identity | null,
  ): ForumPostSummary {
    const isOfficial = Number(row.is_official) === 1;
    const isAnonymous = !isOfficial && Number(row.is_anonymous) === 1;
    const authorId = row.author_id ? String(row.author_id) : null;
    const authorLabel = isOfficial
      ? '學序官方'
      : isAnonymous
        ? '匿名同學'
        : authorId
          ? (nicknames.get(authorId) ?? this.defaultNickname(authorId))
          : '同學';
    let imageIds: string[] = [];
    try { imageIds = JSON.parse(String(row.image_ids ?? '[]')); } catch { imageIds = []; }
    let questionRef: ForumQuestionRef | undefined;
    if (row.question_ref) {
      try { questionRef = JSON.parse(String(row.question_ref)); } catch { questionRef = undefined; }
    }
    const bodyText = String(row.body ?? '');
    const titleText = String(row.title ?? '');
    const commentCount = Number(row.comment_count ?? 0);
    return {
      id: String(row.id),
      boardId: String(row.board_id),
      flair: String(row.flair) as ForumFlair,
      visibility: String(row.visibility) as ForumVisibility,
      title: titleText,
      bodyPreview: bodyText.length > 220 ? bodyText.slice(0, 220) + '…' : bodyText,
      authorLabel,
      isAnonymous,
      isOfficial,
      isMine: Boolean(viewer && authorId && viewer.id === authorId),
      pinned: Number(row.pinned) === 1,
      locked: Number(row.locked) === 1,
      status: String(row.status) as ForumPostSummary['status'],
      imageIds,
      hasPoll: Boolean(row.poll_body),
      questionRef,
      reactions,
      commentCount,
      hotScore: computeHotScore(reactions.upvote, commentCount, String(row.created_at)),
      distressSupport: hasDistressSignal(titleText + '\n' + bodyText),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async listPosts(
    viewer: Identity | null,
    options: { boardId?: string; flair?: string; sort?: ForumSort; q?: string } = {},
  ): Promise<ForumPostSummary[]> {
    const clauses = ["status='active'"];
    const params: any[] = [];
    if (!viewer) clauses.push("visibility='public'");
    if (options.boardId && options.boardId !== 'all') {
      clauses.push('board_id=?');
      params.push(options.boardId);
    }
    if (options.flair && options.flair !== 'all' && Object.hasOwn(FORUM_FLAIR_META, options.flair)) {
      clauses.push('flair=?');
      params.push(options.flair);
    }
    const search = String(options.q ?? '').trim().toLowerCase();
    if (search) {
      clauses.push('(LOWER(title) LIKE ? OR LOWER(body) LIKE ?)');
      const pat = `%${search.slice(0, 80)}%`;
      params.push(pat, pat);
    }
    const rows = await this.store.db.prepare(
      `SELECT * FROM forum_posts WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT 120`,
    ).all(...params);
    const authorIds = rows.filter(r => !Number(r.is_official) && !Number(r.is_anonymous) && r.author_id).map(r => String(r.author_id));
    const [nicknames, reactionsMap] = await Promise.all([
      this.nicknamesMap(authorIds),
      this.postReactionsMap(rows.map(r => String(r.id)), viewer?.id),
    ]);
    const summaries = rows.map(r =>
      this.formatPostSummary(
        r,
        nicknames,
        reactionsMap.get(String(r.id)) ?? { upvote: 0, same: 0, cheer: 0, useful: 0, myReactions: [] },
        viewer,
      ),
    );
    const sort: ForumSort = options.sort === 'new' || options.sort === 'top' ? options.sort : 'hot';
    summaries.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort === 'new') return b.createdAt.localeCompare(a.createdAt);
      if (sort === 'top') return b.reactions.upvote - a.reactions.upvote || b.createdAt.localeCompare(a.createdAt);
      return b.hotScore - a.hotScore || b.createdAt.localeCompare(a.createdAt);
    });
    return summaries;
  }

  private async buildPollView(postId: string, pollBody: string | null, viewerId?: string): Promise<ForumPollView | undefined> {
    if (!pollBody) return undefined;
    let parsed: StoredPoll;
    try { parsed = JSON.parse(pollBody); } catch { return undefined; }
    const voteRows = await this.store.db.prepare(
      'SELECT option_id,COUNT(*) AS n FROM forum_poll_votes WHERE post_id=? GROUP BY option_id',
    ).all(postId);
    const counts = new Map<string, number>();
    let total = 0;
    for (const r of voteRows) {
      const c = Number(r.n);
      counts.set(String(r.option_id), c);
      total += c;
    }
    let myOptionId: string | null = null;
    if (viewerId) {
      const mine = await this.store.db.prepare('SELECT option_id FROM forum_poll_votes WHERE post_id=? AND user_id=?').get(postId, viewerId);
      if (mine) myOptionId = String(mine.option_id);
    }
    return {
      question: parsed.question,
      totalVotes: total,
      myOptionId,
      options: parsed.options.map(opt => {
        const votes = counts.get(opt.id) ?? 0;
        return {
          id: opt.id,
          label: opt.label,
          votes,
          percent: total > 0 ? Math.round((votes / total) * 100) : 0,
        };
      }),
    };
  }

  async getPost(viewer: Identity | null, postId: string): Promise<ForumPostDetail | ForumRestrictedPost> {
    const row = await this.store.db.prepare('SELECT * FROM forum_posts WHERE id=?').get(postId);
    if (!row || row.status === 'deleted') fail('找不到這則討論帖', 404, 'NOT_FOUND');
    const isMod = Boolean(viewer && (viewer.role === 'developer' || viewer.role === 'reviewer'));
    const isAuthor = Boolean(viewer && row.author_id && viewer.id === String(row.author_id));
    if (row.status === 'auto_hidden' && !isMod && !isAuthor) {
      fail('此帖子因收到多宗舉報，正待版務復核', 404, 'HIDDEN_PENDING_REVIEW');
    }
    if (!viewer && row.visibility === 'members') {
      return {
        id: String(row.id),
        boardId: String(row.board_id),
        flair: String(row.flair) as ForumFlair,
        visibility: 'members',
        restricted: true,
        createdAt: String(row.created_at),
      };
    }

    const commentRows = await this.store.db.prepare(
      'SELECT * FROM forum_comments WHERE post_id=? ORDER BY created_at ASC',
    ).all(postId);
    const visibleComments = commentRows.filter(c => {
      if (c.status === 'deleted') return false;
      if (c.status === 'auto_hidden' && !isMod && !(viewer && c.author_id === viewer.id)) return false;
      return true;
    });

    const nonAnonIds: string[] = [];
    if (!Number(row.is_official) && !Number(row.is_anonymous) && row.author_id) nonAnonIds.push(String(row.author_id));
    for (const c of visibleComments) {
      if (!Number(c.is_official) && !Number(c.is_anonymous) && c.author_id) nonAnonIds.push(String(c.author_id));
    }

    const commentIds = visibleComments.map(c => String(c.id));
    const myCommentUpvotes = new Set<string>();
    if (viewer && commentIds.length) {
      const ph = commentIds.map(() => '?').join(',');
      const upRows = await this.store.db.prepare(
        `SELECT target_id FROM forum_reactions WHERE target_type='comment' AND kind='upvote' AND user_id=? AND target_id IN (${ph})`,
      ).all(viewer.id, ...commentIds);
      for (const r of upRows) myCommentUpvotes.add(String(r.target_id));
    }

    const [nicknames, reactionsMap, poll] = await Promise.all([
      this.nicknamesMap(nonAnonIds),
      this.postReactionsMap([postId], viewer?.id),
      this.buildPollView(postId, row.poll_body ? String(row.poll_body) : null, viewer?.id),
    ]);

    const summary = this.formatPostSummary(
      row,
      nicknames,
      reactionsMap.get(postId) ?? { upvote: 0, same: 0, cheer: 0, useful: 0, myReactions: [] },
      viewer,
    );

    const postAuthorId = row.author_id ? String(row.author_id) : null;
    const postIsAnonymous = Number(row.is_anonymous) === 1;

    const comments: ForumCommentView[] = visibleComments.map(c => {
      const cOfficial = Number(c.is_official) === 1;
      const cAnon = !cOfficial && Number(c.is_anonymous) === 1;
      const cAuthorId = c.author_id ? String(c.author_id) : null;
      // Never leak OP relationship if OP posted non-anonymously and comments anonymously (or vice versa)
      const sameAnonMode = cAnon === postIsAnonymous;
      const isOp = Boolean(!cOfficial && postAuthorId && cAuthorId === postAuthorId && sameAnonMode);
      const anonIndex = cAnon && !isOp ? Number(c.anon_index ?? 1) : null;
      const authorLabel = cOfficial
        ? '學序官方'
        : cAnon
          ? (isOp ? '匿名樓主' : `匿名同學 #${anonIndex}`)
          : cAuthorId
            ? (nicknames.get(cAuthorId) ?? this.defaultNickname(cAuthorId))
            : '同學';
      const bodyText = String(c.body ?? '');
      return {
        id: String(c.id),
        postId,
        parentId: c.parent_id ? String(c.parent_id) : null,
        authorLabel,
        isAnonymous: cAnon,
        isOfficial: cOfficial,
        isOp,
        anonIndex,
        isMine: Boolean(viewer && cAuthorId && viewer.id === cAuthorId),
        body: bodyText,
        status: String(c.status) as ForumCommentView['status'],
        upvotes: Number(c.upvote_count ?? 0),
        myUpvoted: myCommentUpvotes.has(String(c.id)),
        distressSupport: hasDistressSignal(bodyText),
        createdAt: String(c.created_at),
        updatedAt: String(c.updated_at),
      };
    });

    const { bodyPreview: _preview, ...rest } = summary;
    return {
      ...rest,
      body: String(row.body ?? ''),
      poll,
      comments,
    };
  }

  async getPublicPostMeta(postId: string): Promise<{ title: string; description: string } | null> {
    const row = await this.store.db.prepare('SELECT title,body,visibility,status FROM forum_posts WHERE id=?').get(postId);
    if (!row || row.status !== 'active') return null;
    if (row.visibility !== 'public') {
      return {
        title: '學序同學討論區 · 登入查看同學分享',
        description: '這是一則僅限已登入學序同學查看的討論或樹洞帖。登入後即可參與交流。',
      };
    }
    const cleanBody = String(row.body ?? '').replace(/\s+/g, ' ').trim();
    return {
      title: `${String(row.title)} — 學序 HOKSE 同學討論區`,
      description: cleanBody.slice(0, 140) || 'DSE 各科討論、溫習心得與備考樹洞交流。',
    };
  }

  private sanitizeQuestionRef(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const sourceKind = String(r.sourceKind ?? '');
    if (!['wrong', 'quiz-result', 'practice', 'maths-index'].includes(sourceKind)) return null;
    const subjectId = String(r.subjectId ?? 'maths');
    if (!catalog.subjects.some(s => s.id === subjectId)) return null;
    const title = String(r.title ?? '').trim().slice(0, 120);
    const promptExcerpt = String(r.promptExcerpt ?? '').trim().slice(0, 320);
    if (!title || !promptExcerpt) return null;
    const topicName = r.topicName ? String(r.topicName).trim().slice(0, 80) : undefined;
    let externalUrl: string | undefined;
    if (typeof r.externalUrl === 'string' && r.externalUrl.trim()) {
      const u = r.externalUrl.trim().slice(0, 400);
      if (/^https?:\/\//i.test(u) || u.startsWith('/')) externalUrl = u;
    }
    const clean: ForumQuestionRef = {
      sourceKind: sourceKind as ForumQuestionRef['sourceKind'],
      subjectId,
      title,
      promptExcerpt,
      ...(topicName ? { topicName } : {}),
      ...(externalUrl ? { externalUrl } : {}),
    };
    return JSON.stringify(clean);
  }

  private sanitizePoll(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const p = raw as Record<string, unknown>;
    const question = String(p.question ?? '').trim().slice(0, 140);
    const rawOptions = Array.isArray(p.options) ? p.options : [];
    const options = rawOptions
      .map(o => String(o ?? '').trim().slice(0, 80))
      .filter(Boolean);
    if (!question && !options.length) return null;
    if (question.length < 2) fail('投票問題請填寫至少 2 個字');
    if (options.length < 2 || options.length > 6) fail('投票選項須為 2 至 6 項');
    const stored: StoredPoll = {
      question,
      options: options.map((label, idx) => ({ id: `opt-${idx + 1}`, label })),
    };
    return JSON.stringify(stored);
  }

  async uploadImage(user: Identity, bytes: Buffer): Promise<{ id: string; mimeType: string; size: number }> {
    await this.assertNotMuted(user);
    if (!bytes.length) fail('圖片內容為空');
    if (bytes.length > MAX_FORUM_IMAGE_BYTES) {
      fail('單張論壇配圖上限為 200 KB（系統會在瀏覽器自動壓縮，請重試或換一張圖片）', 413, 'IMAGE_TOO_LARGE');
    }
    const mimeType = detectImageMime(bytes);
    if (!mimeType) fail('只支援 JPEG、PNG 或 WebP 格式圖片');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const staleCutoff = new Date(Date.now() - 86400000).toISOString();
    await this.store.transaction(async () => {
      if (this.store.db.kind === 'postgres') {
        await this.store.db.exec('SELECT pg_advisory_xact_lock(1784236904)');
      }
      await this.store.db.prepare('DELETE FROM forum_images WHERE post_id IS NULL AND created_at < ?').run(staleCutoff);
      const draftCount = Number(
        (await this.store.db.prepare('SELECT COUNT(*) AS n FROM forum_images WHERE author_id=? AND post_id IS NULL').get(user.id))?.n ?? 0,
      );
      if (draftCount >= 9) fail('未發布的草稿圖片較多，請先完成發帖或稍後再試', 429);
      const totalUsed = Number(
        (await this.store.db.prepare('SELECT COALESCE(SUM(size),0) AS n FROM forum_images').get())?.n ?? 0,
      );
      if (totalUsed + bytes.length > FORUM_TOTAL_IMAGE_QUOTA_BYTES) {
        fail('討論區圖片免費儲存空間已滿，暫時請先以純文字或公式發帖', 413, 'FORUM_IMAGE_QUOTA');
      }
      await this.store.db.prepare(
        'INSERT INTO forum_images (id,author_id,post_id,mime_type,size,data,created_at) VALUES (?,?,NULL,?,?,?,?)',
      ).run(id, user.id, mimeType, bytes.length, bytes, now);
    });
    return { id, mimeType, size: bytes.length };
  }

  async readImage(viewer: Identity | null, imageId: string): Promise<{ mimeType: string; data: Buffer; isPublic: boolean }> {
    const img = await this.store.db.prepare('SELECT * FROM forum_images WHERE id=?').get(imageId);
    if (!img) fail('找不到圖片', 404, 'NOT_FOUND');
    if (!img.post_id) {
      if (!viewer || viewer.id !== String(img.author_id)) fail('無權讀取未發布草稿圖片', 403, 'FORBIDDEN');
      return { mimeType: String(img.mime_type), data: Buffer.from(img.data), isPublic: false };
    }
    const post = await this.store.db.prepare('SELECT visibility,status,author_id FROM forum_posts WHERE id=?').get(String(img.post_id));
    if (!post || post.status === 'deleted') fail('找不到圖片所屬帖子', 404, 'NOT_FOUND');
    const isMod = Boolean(viewer && (viewer.role === 'developer' || viewer.role === 'reviewer'));
    const isAuthor = Boolean(viewer && post.author_id && viewer.id === String(post.author_id));
    if (post.status === 'auto_hidden' && !isMod && !isAuthor) fail('圖片暫不可見', 404, 'HIDDEN');
    if (post.visibility === 'members' && !viewer) fail('請先登入學序帳戶以查看此圖片', 401, 'UNAUTHENTICATED');
    return {
      mimeType: String(img.mime_type),
      data: Buffer.from(img.data),
      isPublic: post.visibility === 'public' && post.status === 'active',
    };
  }

  async createPost(user: Identity, input: Record<string, unknown>): Promise<ForumPostDetail> {
    await this.assertNotMuted(user);
    this.checkRate(this.postRate, user.id, 6, 10 * 60 * 1000, '發帖');

    const boardId = String(input.boardId ?? 'lounge');
    if (!isValidBoardId(boardId, catalog.subjects)) fail('請選擇有效的討論板塊');

    const flair = String(input.flair ?? 'chat') as ForumFlair;
    if (!Object.hasOwn(FORUM_FLAIR_META, flair)) fail('帖子分類標籤無效');
    if (flair === 'official' && user.role === 'student') fail('只有版務管理員可發布官方引導標籤', 403, 'FORBIDDEN');

    const visibility: ForumVisibility = input.visibility === 'members' ? 'members' : 'public';
    const isAnonymous = input.isAnonymous === true ? 1 : 0;
    const isOfficial = input.isOfficial === true && user.role !== 'student' && !isAnonymous ? 1 : 0;

    const title = String(input.title ?? '').replace(/[\r\n]+/g, ' ').trim();
    if (title.length < 2 || title.length > 120) fail('標題請填寫 2 至 120 個字');

    const body = String(input.body ?? '').trim();
    if (body.length < 1 || body.length > 8000) fail('正文請填寫 1 至 8,000 個字');

    const rawImages = Array.isArray(input.imageIds) ? input.imageIds.map(x => String(x)) : [];
    const uniqueImages = [...new Set(rawImages)];
    if (uniqueImages.length > MAX_FORUM_IMAGES) fail(`每則帖子最多附上 ${MAX_FORUM_IMAGES} 張圖片`);

    const questionRef = this.sanitizeQuestionRef(input.questionRef);
    const pollBody = this.sanitizePoll(input.poll);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.store.transaction(async () => {
      for (const imgId of uniqueImages) {
        const img = await this.store.db.prepare('SELECT id,author_id,post_id FROM forum_images WHERE id=?').get(imgId);
        if (!img || String(img.author_id) !== user.id || img.post_id !== null) {
          fail('所附圖片無效或已使用，請重新選擇圖片');
        }
      }
      await this.store.db.prepare(
        `INSERT INTO forum_posts
          (id,board_id,author_id,is_official,is_anonymous,visibility,flair,title,body,question_ref,poll_body,image_ids,pinned,locked,status,upvote_count,comment_count,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,0,'active',0,0,?,?)`,
      ).run(
        id,
        boardId,
        user.id,
        isOfficial,
        isAnonymous,
        visibility,
        flair,
        title,
        body,
        questionRef,
        pollBody,
        JSON.stringify(uniqueImages),
        now,
        now,
      );
      for (const imgId of uniqueImages) {
        await this.store.db.prepare('UPDATE forum_images SET post_id=? WHERE id=?').run(id, imgId);
      }
    });

    return (await this.getPost(user, id)) as ForumPostDetail;
  }

  async updatePost(user: Identity, postId: string, input: Record<string, unknown>): Promise<ForumPostDetail> {
    await this.assertNotMuted(user);
    const row = await this.store.db.prepare('SELECT * FROM forum_posts WHERE id=?').get(postId);
    if (!row || row.status === 'deleted') fail('找不到這則帖子', 404, 'NOT_FOUND');
    if (String(row.author_id ?? '') !== user.id) fail('只能編輯自己發布的帖子', 403, 'FORBIDDEN');

    const title = input.title !== undefined ? String(input.title).replace(/[\r\n]+/g, ' ').trim() : String(row.title);
    if (title.length < 2 || title.length > 120) fail('標題請填寫 2 至 120 個字');

    const body = input.body !== undefined ? String(input.body).trim() : String(row.body);
    if (body.length < 1 || body.length > 8000) fail('正文請填寫 1 至 8,000 個字');

    let flair = String(row.flair) as ForumFlair;
    if (input.flair !== undefined) {
      const candidate = String(input.flair) as ForumFlair;
      if (!Object.hasOwn(FORUM_FLAIR_META, candidate)) fail('帖子分類標籤無效');
      if (candidate === 'official' && user.role === 'student') fail('不可設為官方標籤', 403, 'FORBIDDEN');
      flair = candidate;
    }
    const visibility: ForumVisibility = input.visibility === 'members' ? 'members' : input.visibility === 'public' ? 'public' : (String(row.visibility) as ForumVisibility);
    const now = new Date().toISOString();

    await this.store.db.prepare(
      'UPDATE forum_posts SET title=?,body=?,flair=?,visibility=?,updated_at=? WHERE id=?',
    ).run(title, body, flair, visibility, now, postId);

    return (await this.getPost(user, postId)) as ForumPostDetail;
  }

  async deletePost(user: Identity, postId: string): Promise<{ ok: true }> {
    const row = await this.store.db.prepare('SELECT * FROM forum_posts WHERE id=?').get(postId);
    if (!row || row.status === 'deleted') fail('找不到這則帖子', 404, 'NOT_FOUND');
    const isMod = user.role === 'developer' || user.role === 'reviewer';
    if (!isMod && String(row.author_id ?? '') !== user.id) fail('無權刪除此帖子', 403, 'FORBIDDEN');
    const now = new Date().toISOString();
    await this.store.transaction(async () => {
      await this.store.db.prepare("UPDATE forum_posts SET status='deleted',image_ids='[]',updated_at=? WHERE id=?").run(now, postId);
      await this.store.db.prepare('DELETE FROM forum_images WHERE post_id=?').run(postId);
      await this.store.db.prepare(
        "UPDATE forum_reports SET status='resolved',resolved_at=?,resolved_by=? WHERE target_type='post' AND target_id=? AND status='open'",
      ).run(now, user.id, postId);
    });
    return { ok: true };
  }

  async createComment(user: Identity, postId: string, input: Record<string, unknown>): Promise<ForumPostDetail> {
    const profile = await this.assertNotMuted(user);
    this.checkRate(this.commentRate, user.id, 20, 5 * 60 * 1000, '回覆');

    const body = String(input.body ?? '').trim();
    if (body.length < 1 || body.length > 3000) fail('回覆內容請填寫 1 至 3,000 個字');
    const parentId = input.parentId ? String(input.parentId) : null;
    const isAnonymous = input.isAnonymous === true ? 1 : 0;
    const isOfficial = input.isOfficial === true && user.role !== 'student' && !isAnonymous ? 1 : 0;
    const commentId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.store.transaction(async () => {
      const post = await this.store.db.prepare('SELECT * FROM forum_posts WHERE id=?').get(postId);
      if (!post || post.status !== 'active') fail('此帖子不存在或暫不開放回覆', 404, 'NOT_FOUND');
      if (Number(post.locked) === 1 && user.role === 'student') fail('此帖子已鎖定回覆', 409, 'POST_LOCKED');

      let parentRow: Record<string, any> | undefined;
      if (parentId) {
        parentRow = await this.store.db.prepare('SELECT * FROM forum_comments WHERE id=? AND post_id=?').get(parentId, postId);
        if (!parentRow || parentRow.status !== 'active') fail('所回覆的樓層不存在', 404, 'NOT_FOUND');
      }

      const postIsAnon = Number(post.is_anonymous) === 1;
      const postAuthorId = post.author_id ? String(post.author_id) : null;
      let anonIndex: number | null = null;
      let actorLabel = isOfficial ? '學序官方' : profile.nickname;

      if (isAnonymous && !isOfficial) {
        if (postIsAnon && postAuthorId === user.id) {
          anonIndex = 0;
          actorLabel = '匿名樓主';
        } else {
          const prev = await this.store.db.prepare(
            'SELECT anon_index FROM forum_comments WHERE post_id=? AND author_id=? AND is_anonymous=1 AND anon_index>0 LIMIT 1',
          ).get(postId, user.id);
          if (prev?.anon_index) {
            anonIndex = Number(prev.anon_index);
          } else {
            const maxRow = await this.store.db.prepare(
              'SELECT COALESCE(MAX(anon_index),0) AS m FROM forum_comments WHERE post_id=? AND anon_index>0',
            ).get(postId);
            anonIndex = Number(maxRow?.m ?? 0) + 1;
          }
          actorLabel = `匿名同學 #${anonIndex}`;
        }
      }

      await this.store.db.prepare(
        `INSERT INTO forum_comments
          (id,post_id,parent_id,author_id,is_official,is_anonymous,anon_index,body,status,upvote_count,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,'active',0,?,?)`,
      ).run(commentId, postId, parentId, user.id, isOfficial, isAnonymous, anonIndex, body, now, now);

      const countRow = await this.store.db.prepare(
        "SELECT COUNT(*) AS n FROM forum_comments WHERE post_id=? AND status='active'",
      ).get(postId);
      await this.store.db.prepare('UPDATE forum_posts SET comment_count=?,updated_at=? WHERE id=?').run(
        Number(countRow?.n ?? 0),
        now,
        postId,
      );

      const recipients = new Set<string>();
      if (postAuthorId && postAuthorId !== user.id) recipients.add(postAuthorId);
      if (parentRow?.author_id && String(parentRow.author_id) !== user.id) recipients.add(String(parentRow.author_id));

      for (const recipientId of recipients) {
        await this.store.db.prepare(
          `INSERT INTO forum_notifications
            (id,recipient_id,post_id,comment_id,actor_label,post_title,excerpt,is_read,created_at)
           VALUES (?,?,?,?,?,?,?,0,?)`,
        ).run(
          crypto.randomUUID(),
          recipientId,
          postId,
          commentId,
          actorLabel,
          String(post.title).slice(0, 80),
          body.replace(/\s+/g, ' ').slice(0, 100),
          now,
        );
      }
    });

    return (await this.getPost(user, postId)) as ForumPostDetail;
  }

  async deleteComment(user: Identity, commentId: string): Promise<{ ok: true }> {
    const row = await this.store.db.prepare('SELECT * FROM forum_comments WHERE id=?').get(commentId);
    if (!row || row.status === 'deleted') fail('找不到這則回覆', 404, 'NOT_FOUND');
    const isMod = user.role === 'developer' || user.role === 'reviewer';
    if (!isMod && String(row.author_id ?? '') !== user.id) fail('無權刪除此回覆', 403, 'FORBIDDEN');
    const now = new Date().toISOString();
    await this.store.transaction(async () => {
      await this.store.db.prepare("UPDATE forum_comments SET status='deleted',updated_at=? WHERE id=?").run(now, commentId);
      const countRow = await this.store.db.prepare(
        "SELECT COUNT(*) AS n FROM forum_comments WHERE post_id=? AND status='active'",
      ).get(String(row.post_id));
      await this.store.db.prepare('UPDATE forum_posts SET comment_count=? WHERE id=?').run(
        Number(countRow?.n ?? 0),
        String(row.post_id),
      );
      await this.store.db.prepare(
        "UPDATE forum_reports SET status='resolved',resolved_at=?,resolved_by=? WHERE target_type='comment' AND target_id=? AND status='open'",
      ).run(now, user.id, commentId);
    });
    return { ok: true };
  }

  async toggleReaction(
    user: Identity,
    targetType: 'post' | 'comment',
    targetId: string,
    kind: ForumReactionKind,
  ): Promise<{ active: boolean; reactions?: ForumReactionsSummary; upvotes?: number }> {
    if (targetType === 'comment' && kind !== 'upvote') fail('評論僅支援讚同投票');
    if (!['upvote', 'same', 'cheer', 'useful'].includes(kind)) fail('互動類型無效');

    return this.store.transaction(async () => {
      if (targetType === 'post') {
        const p = await this.store.db.prepare('SELECT id,status FROM forum_posts WHERE id=?').get(targetId);
        if (!p || p.status !== 'active') fail('找不到該帖子', 404, 'NOT_FOUND');
      } else {
        const c = await this.store.db.prepare('SELECT id,status FROM forum_comments WHERE id=?').get(targetId);
        if (!c || c.status !== 'active') fail('找不到該回覆', 404, 'NOT_FOUND');
      }

      const existing = await this.store.db.prepare(
        'SELECT 1 FROM forum_reactions WHERE target_type=? AND target_id=? AND user_id=? AND kind=?',
      ).get(targetType, targetId, user.id, kind);

      if (existing) {
        await this.store.db.prepare(
          'DELETE FROM forum_reactions WHERE target_type=? AND target_id=? AND user_id=? AND kind=?',
        ).run(targetType, targetId, user.id, kind);
      } else {
        await this.store.db.prepare(
          'INSERT INTO forum_reactions (target_type,target_id,user_id,kind,created_at) VALUES (?,?,?,?,?)',
        ).run(targetType, targetId, user.id, kind, new Date().toISOString());
      }

      const upRow = await this.store.db.prepare(
        "SELECT COUNT(*) AS n FROM forum_reactions WHERE target_type=? AND target_id=? AND kind='upvote'",
      ).get(targetType, targetId);
      const upvotes = Number(upRow?.n ?? 0);

      if (targetType === 'post') {
        await this.store.db.prepare('UPDATE forum_posts SET upvote_count=? WHERE id=?').run(upvotes, targetId);
        const map = await this.postReactionsMap([targetId], user.id);
        return { active: !existing, reactions: map.get(targetId)! };
      } else {
        await this.store.db.prepare('UPDATE forum_comments SET upvote_count=? WHERE id=?').run(upvotes, targetId);
        return { active: !existing, upvotes };
      }
    });
  }

  async votePoll(user: Identity, postId: string, optionId: string): Promise<ForumPollView> {
    const post = await this.store.db.prepare('SELECT id,poll_body,status,locked FROM forum_posts WHERE id=?').get(postId);
    if (!post || post.status !== 'active' || !post.poll_body) fail('此帖子沒有可參與的投票', 404, 'NOT_FOUND');
    if (Number(post.locked) === 1) fail('此帖子已鎖定', 409, 'POST_LOCKED');
    let parsed: StoredPoll;
    try { parsed = JSON.parse(String(post.poll_body)); } catch { fail('投票資料無效'); }
    if (!parsed.options.some(o => o.id === optionId)) fail('投票選項不存在');

    await this.store.db.prepare(
      `INSERT INTO forum_poll_votes (post_id,user_id,option_id,created_at)
       VALUES (?,?,?,?)
       ON CONFLICT(post_id,user_id) DO UPDATE SET option_id=excluded.option_id,created_at=excluded.created_at`,
    ).run(postId, user.id, optionId, new Date().toISOString());

    return (await this.buildPollView(postId, String(post.poll_body), user.id))!;
  }

  async reportTarget(user: Identity, input: Record<string, unknown>): Promise<{ ok: true; autoHidden: boolean }> {
    const targetType = input.targetType === 'comment' ? 'comment' : input.targetType === 'post' ? 'post' : null;
    if (!targetType) fail('舉報目標類型無效');
    const targetId = String(input.targetId ?? '');
    const reason = String(input.reason ?? 'other') as ForumReportReason;
    if (!Object.hasOwn(FORUM_REPORT_REASON_LABELS, reason)) fail('請選擇有效的舉報原因');
    const details = String(input.details ?? '').trim().slice(0, 500);
    const now = new Date().toISOString();

    return this.store.transaction(async () => {
      let isOfficial = false;
      if (targetType === 'post') {
        const post = await this.store.db.prepare('SELECT id,is_official,status FROM forum_posts WHERE id=?').get(targetId);
        if (!post || post.status === 'deleted') fail('找不到舉報目標', 404, 'NOT_FOUND');
        isOfficial = Number(post.is_official) === 1;
      } else {
        const comment = await this.store.db.prepare('SELECT id,is_official,status FROM forum_comments WHERE id=?').get(targetId);
        if (!comment || comment.status === 'deleted') fail('找不到舉報目標', 404, 'NOT_FOUND');
        isOfficial = Number(comment.is_official) === 1;
      }

      await this.store.db.prepare(
        `INSERT INTO forum_reports (id,target_type,target_id,reporter_id,reason,details,status,created_at,resolved_at,resolved_by)
         VALUES (?,?,?,?,?,?,'open',?,NULL,NULL)
         ON CONFLICT(target_type,target_id,reporter_id) DO UPDATE SET reason=excluded.reason,details=excluded.details,status='open',created_at=excluded.created_at,resolved_at=NULL,resolved_by=NULL`,
      ).run(crypto.randomUUID(), targetType, targetId, user.id, reason, details, now);

      const countRow = await this.store.db.prepare(
        "SELECT COUNT(*) AS n FROM forum_reports WHERE target_type=? AND target_id=? AND status='open'",
      ).get(targetType, targetId);
      const count = Number(countRow?.n ?? 0);
      let autoHidden = false;
      if (!isOfficial && count >= REPORT_AUTO_HIDE_THRESHOLD) {
        autoHidden = true;
        if (targetType === 'post') {
          await this.store.db.prepare("UPDATE forum_posts SET status='auto_hidden' WHERE id=? AND status='active'").run(targetId);
        } else {
          await this.store.db.prepare("UPDATE forum_comments SET status='auto_hidden' WHERE id=? AND status='active'").run(targetId);
          const c = await this.store.db.prepare('SELECT post_id FROM forum_comments WHERE id=?').get(targetId);
          if (c?.post_id) {
            const activeCount = await this.store.db.prepare(
              "SELECT COUNT(*) AS n FROM forum_comments WHERE post_id=? AND status='active'",
            ).get(String(c.post_id));
            await this.store.db.prepare('UPDATE forum_posts SET comment_count=? WHERE id=?').run(
              Number(activeCount?.n ?? 0),
              String(c.post_id),
            );
          }
        }
      }
      return { ok: true, autoHidden };
    });
  }

  async listNotifications(user: Identity): Promise<{ unreadCount: number; items: ForumNotificationView[] }> {
    const rows = await this.store.db.prepare(
      'SELECT * FROM forum_notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT 30',
    ).all(user.id);
    const unreadRow = await this.store.db.prepare(
      'SELECT COUNT(*) AS n FROM forum_notifications WHERE recipient_id=? AND is_read=0',
    ).get(user.id);
    return {
      unreadCount: Number(unreadRow?.n ?? 0),
      items: rows.map(r => ({
        id: String(r.id),
        postId: String(r.post_id),
        commentId: String(r.comment_id),
        actorLabel: String(r.actor_label),
        postTitle: String(r.post_title),
        excerpt: String(r.excerpt),
        read: Number(r.is_read) === 1,
        createdAt: String(r.created_at),
      })),
    };
  }

  async markNotificationsRead(user: Identity): Promise<{ ok: true }> {
    await this.store.db.prepare('UPDATE forum_notifications SET is_read=1 WHERE recipient_id=? AND is_read=0').run(user.id);
    return { ok: true };
  }

  async listModerationQueue(actor: Identity): Promise<ForumModerationItem[]> {
    if (actor.role !== 'developer' && actor.role !== 'reviewer') fail('僅供版務復核者與開發者使用', 403, 'FORBIDDEN');
    const reports = await this.store.db.prepare(
      "SELECT * FROM forum_reports WHERE status='open' ORDER BY created_at DESC LIMIT 100",
    ).all();
    const hiddenPosts = await this.store.db.prepare(
      "SELECT * FROM forum_posts WHERE status='auto_hidden' ORDER BY updated_at DESC LIMIT 50",
    ).all();
    const hiddenComments = await this.store.db.prepare(
      "SELECT * FROM forum_comments WHERE status='auto_hidden' ORDER BY updated_at DESC LIMIT 50",
    ).all();

    const grouped = new Map<string, typeof reports>();
    for (const r of reports) {
      const key = `${r.target_type}:${r.target_id}`;
      const list = grouped.get(key) ?? [];
      list.push(r);
      grouped.set(key, list);
    }
    for (const p of hiddenPosts) {
      const key = `post:${p.id}`;
      if (!grouped.has(key)) grouped.set(key, []);
    }
    for (const c of hiddenComments) {
      const key = `comment:${c.id}`;
      if (!grouped.has(key)) grouped.set(key, []);
    }

    const items: ForumModerationItem[] = [];
    for (const [key, list] of grouped.entries()) {
      const [targetType, targetId] = key.split(':') as ['post' | 'comment', string];
      if (targetType === 'post') {
        const p = await this.store.db.prepare('SELECT * FROM forum_posts WHERE id=?').get(targetId);
        if (!p || p.status === 'deleted') continue;
        const authorProfile = p.author_id
          ? await this.store.db.prepare('SELECT muted_until FROM forum_profiles WHERE user_id=?').get(String(p.author_id))
          : undefined;
        const muted = authorProfile?.muted_until && Number(authorProfile.muted_until) > Date.now() ? Number(authorProfile.muted_until) : null;
        items.push({
          targetType: 'post',
          targetId,
          postId: String(p.id),
          boardId: String(p.board_id),
          title: String(p.title),
          excerpt: String(p.body).slice(0, 260),
          status: String(p.status) as ForumModerationItem['status'],
          isAnonymous: Number(p.is_anonymous) === 1,
          reportCount: list.length,
          reasons: list.map(r => ({
            reason: String(r.reason) as ForumReportReason,
            details: String(r.details ?? ''),
            createdAt: String(r.created_at),
          })),
          authorMutedUntil: muted,
          canMuteAuthor: actor.role === 'developer' && Boolean(p.author_id),
          createdAt: String(p.created_at),
        });
      } else {
        const c = await this.store.db.prepare('SELECT * FROM forum_comments WHERE id=?').get(targetId);
        if (!c || c.status === 'deleted') continue;
        const p = await this.store.db.prepare('SELECT id,board_id,title FROM forum_posts WHERE id=?').get(String(c.post_id));
        if (!p) continue;
        const authorProfile = c.author_id
          ? await this.store.db.prepare('SELECT muted_until FROM forum_profiles WHERE user_id=?').get(String(c.author_id))
          : undefined;
        const muted = authorProfile?.muted_until && Number(authorProfile.muted_until) > Date.now() ? Number(authorProfile.muted_until) : null;
        items.push({
          targetType: 'comment',
          targetId,
          postId: String(p.id),
          boardId: String(p.board_id),
          title: String(p.title),
          excerpt: String(c.body).slice(0, 260),
          status: String(c.status) as ForumModerationItem['status'],
          isAnonymous: Number(c.is_anonymous) === 1,
          reportCount: list.length,
          reasons: list.map(r => ({
            reason: String(r.reason) as ForumReportReason,
            details: String(r.details ?? ''),
            createdAt: String(r.created_at),
          })),
          authorMutedUntil: muted,
          canMuteAuthor: actor.role === 'developer' && Boolean(c.author_id),
          createdAt: String(c.created_at),
        });
      }
    }
    return items.sort((a, b) => b.reportCount - a.reportCount || b.createdAt.localeCompare(a.createdAt));
  }

  async moderate(actor: Identity, input: Record<string, unknown>): Promise<{ ok: true }> {
    if (actor.role !== 'developer' && actor.role !== 'reviewer') fail('僅供版務復核者與開發者使用', 403, 'FORBIDDEN');
    const action = String(input.action ?? '');
    const targetType = input.targetType === 'comment' ? 'comment' : 'post';
    const targetId = String(input.targetId ?? '');
    const now = new Date().toISOString();

    if (action === 'pin' || action === 'unpin') {
      const p = await this.store.db.prepare('SELECT id FROM forum_posts WHERE id=?').get(targetId);
      if (!p) fail('找不到該帖子', 404);
      await this.store.db.prepare('UPDATE forum_posts SET pinned=? WHERE id=?').run(action === 'pin' ? 1 : 0, targetId);
      return { ok: true };
    }
    if (action === 'lock' || action === 'unlock') {
      const p = await this.store.db.prepare('SELECT id FROM forum_posts WHERE id=?').get(targetId);
      if (!p) fail('找不到該帖子', 404);
      await this.store.db.prepare('UPDATE forum_posts SET locked=? WHERE id=?').run(action === 'lock' ? 1 : 0, targetId);
      return { ok: true };
    }
    if (action === 'restore') {
      await this.store.transaction(async () => {
        if (targetType === 'post') {
          await this.store.db.prepare("UPDATE forum_posts SET status='active',updated_at=? WHERE id=?").run(now, targetId);
        } else {
          await this.store.db.prepare("UPDATE forum_comments SET status='active',updated_at=? WHERE id=?").run(now, targetId);
          const c = await this.store.db.prepare('SELECT post_id FROM forum_comments WHERE id=?').get(targetId);
          if (c?.post_id) {
            const cnt = await this.store.db.prepare("SELECT COUNT(*) AS n FROM forum_comments WHERE post_id=? AND status='active'").get(String(c.post_id));
            await this.store.db.prepare('UPDATE forum_posts SET comment_count=? WHERE id=?').run(Number(cnt?.n ?? 0), String(c.post_id));
          }
        }
        await this.store.db.prepare(
          "UPDATE forum_reports SET status='resolved',resolved_at=?,resolved_by=? WHERE target_type=? AND target_id=? AND status='open'",
        ).run(now, actor.id, targetType, targetId);
      });
      return { ok: true };
    }
    if (action === 'delete') {
      if (targetType === 'post') return this.deletePost(actor, targetId);
      return this.deleteComment(actor, targetId);
    }
    if (action === 'mute') {
      if (actor.role !== 'developer') fail('只有開發者管理員可執行帳號禁言處置', 403, 'FORBIDDEN');
      const hours = Number(input.muteHours ?? input.durationHours ?? 24);
      if (!Number.isFinite(hours) || hours < 0 || hours > 24 * 365) fail('禁言時長無效');
      const row = targetType === 'post'
        ? await this.store.db.prepare('SELECT author_id FROM forum_posts WHERE id=?').get(targetId)
        : await this.store.db.prepare('SELECT author_id FROM forum_comments WHERE id=?').get(targetId);
      if (!row?.author_id) fail('找不到對應發帖帳號', 404);
      const authorId = String(row.author_id);
      if (authorId === actor.id) fail('不可禁言自己的帳號');
      const mutedUntil = hours === 0 ? null : Date.now() + Math.round(hours * 3600000);
      const muteReason = hours === 0 ? null : String(input.reason ?? '違反討論區守則').trim().slice(0, 160);
      const nick = this.defaultNickname(authorId);
      await this.store.db.prepare(
        `INSERT INTO forum_profiles (user_id,nickname,muted_until,mute_reason,updated_at)
         VALUES (?,?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET muted_until=excluded.muted_until,mute_reason=excluded.mute_reason,updated_at=excluded.updated_at`,
      ).run(authorId, nick, mutedUntil, muteReason, now);
      return { ok: true };
    }
    fail('不支援的版務操作');
  }
}
