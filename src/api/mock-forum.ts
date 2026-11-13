import { http, HttpResponse } from 'msw';
import { catalog } from '../data/catalog';
import {
  FORUM_FLAIR_META,
  FORUM_REPORT_REASON_LABELS,
  MAX_FORUM_IMAGES,
  MAX_FORUM_IMAGE_BYTES,
  REPORT_AUTO_HIDE_THRESHOLD,
  buildForumBoards,
  computeHotScore,
  hasDistressSignal,
  isValidBoardId,
} from '../forum-types';
import type {
  ForumCommentView,
  ForumFlair,
  ForumNotificationView,
  ForumPollView,
  ForumPostDetail,
  ForumPostSummary,
  ForumProfileView,
  ForumQuestionRef,
  ForumReactionKind,
  ForumReactionsSummary,
  ForumReportReason,
  ForumSort,
  ForumVisibility,
} from '../forum-types';

const FORUM_MOCK_KEY = 'hokse.forum.v1';

interface MockStoredPost {
  id: string;
  boardId: string;
  flair: ForumFlair;
  visibility: ForumVisibility;
  title: string;
  body: string;
  authorId: string;
  authorLabel: string;
  isAnonymous: boolean;
  isOfficial: boolean;
  pinned: boolean;
  locked: boolean;
  status: 'active' | 'auto_hidden' | 'deleted';
  imageIds: string[];
  questionRef?: ForumQuestionRef;
  poll?: { question: string; options: { id: string; label: string; votes: number }[]; myOptionId: string | null };
  reactions: ForumReactionsSummary;
  createdAt: string;
  updatedAt: string;
}

interface MockStoredComment {
  id: string;
  postId: string;
  parentId: string | null;
  authorId: string;
  authorLabel: string;
  isAnonymous: boolean;
  isOfficial: boolean;
  isOp: boolean;
  anonIndex: number | null;
  body: string;
  status: 'active' | 'auto_hidden' | 'deleted';
  upvotes: number;
  myUpvoted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MockForumState {
  nickname: string;
  posts: MockStoredPost[];
  comments: MockStoredComment[];
  images: Record<string, { mimeType: string; dataUrl: string; size: number }>;
  notifications: ForumNotificationView[];
  reports: Record<string, number>;
}

function createForumSeed(): MockForumState {
  return {
    nickname: '同學 DSE28',
    images: {},
    reports: {},
    notifications: [
      {
        id: 'fnotif-1',
        postId: 'demo-post-maths',
        commentId: 'demo-comment-m2',
        actorLabel: '匿名同學 #1',
        postTitle: '二次方程判別式 Δ 幾時用 ≥ 0 幾時用 > 0？成日扣無謂分',
        excerpt: '題目講「有實根 (real roots)」無講相異就包埋重根，所以一定係 Δ ≥ 0！',
        read: false,
        createdAt: '2028-02-14T11:25:00.000Z',
      },
    ],
    posts: [
      {
        id: 'demo-post-welcome',
        boardId: 'lounge',
        flair: 'official',
        visibility: 'public',
        title: '歡迎來到學序同學討論區 · 匿名規則與吹水指南',
        body: [
          '呢度係專為準備 DSE 同學而設嘅放鬆與交流空間（目前為瀏覽器本地演示模式，發帖與蓋樓會保存在此瀏覽器）。',
          '',
          '- **獨立暱稱與單帖匿名**：討論區唔會公開登入帳號或任何練習分數；每次發帖或留言都可以勾選「匿名發布」。',
          '- **樹洞私隱開關**：勾選「僅登入同學可見」後，外部訪客點開 WhatsApp 連結時唔會見到樹洞內容。',
          '- **正向共鳴**：唔設負評／踩掣，歡迎用「頂」「😭 我都係」「💪 加油」互相打氣。',
        ].join('\n'),
        authorId: 'official',
        authorLabel: '學序官方',
        isAnonymous: false,
        isOfficial: true,
        pinned: true,
        locked: false,
        status: 'active',
        imageIds: [],
        reactions: { upvote: 18, same: 4, cheer: 9, useful: 12, myReactions: [] },
        createdAt: '2028-02-12T09:00:00.000Z',
        updatedAt: '2028-02-12T09:00:00.000Z',
      },
      {
        id: 'demo-post-vent',
        boardId: 'lounge',
        flair: 'vent',
        visibility: 'members',
        title: 'Mock 派卷 Maths Paper 2 錯咗 12 題，明明識做都睇錯正負號，好灰…',
        body: '今日學校派返份 Maths Mock，Paper 2 有成 5 題係因為趕時間抄錯負號同埋漏睇 $a \\neq 0$。溫咗咁耐覺得自己好蠢，有無人都係一計時就手震？點樣可以穩定返個心態？',
        authorId: 'peer-1',
        authorLabel: '匿名同學',
        isAnonymous: true,
        isOfficial: false,
        pinned: false,
        locked: false,
        status: 'active',
        imageIds: [],
        reactions: { upvote: 26, same: 19, cheer: 15, useful: 6, myReactions: [] },
        createdAt: '2028-02-14T10:15:00.000Z',
        updatedAt: '2028-02-14T10:15:00.000Z',
      },
      {
        id: 'demo-post-poll',
        boardId: 'lounge',
        flair: 'chat',
        visibility: 'public',
        title: '📊 破冰投票：大家目前溫 DSE 最頭痕係邊一科／邊一環？',
        body: '投完票都歡迎喺下面留言講下最卡住邊個 Topic，睇下有無同路人一齊呻下或者分享貼士！',
        authorId: 'official',
        authorLabel: '學序官方',
        isAnonymous: false,
        isOfficial: true,
        pinned: false,
        locked: false,
        status: 'active',
        imageIds: [],
        poll: {
          question: '目前備試最令你頭痕嘅係邊一項？',
          myOptionId: null,
          options: [
            { id: 'opt-1', label: '中文（閱讀推斷／文言十二篇／寫作）', votes: 14 },
            { id: 'opt-2', label: '英文（Reading B2／Writing／Listening）', votes: 19 },
            { id: 'opt-3', label: '數學（MC 速度／長題目步驟）', votes: 22 },
            { id: 'opt-4', label: '選修科（清 Concept＋背 Marking Scheme）', votes: 11 },
            { id: 'opt-5', label: '時間唔夠用／好難集中精神開始溫', votes: 17 },
          ],
        },
        reactions: { upvote: 15, same: 8, cheer: 5, useful: 7, myReactions: [] },
        createdAt: '2028-02-13T16:30:00.000Z',
        updatedAt: '2028-02-13T16:30:00.000Z',
      },
      {
        id: 'demo-post-maths',
        boardId: 'sub-maths',
        flair: 'help',
        visibility: 'public',
        title: '二次方程判別式 Δ 幾時用 ≥ 0 幾時用 > 0？成日扣無謂分',
        body: '做練習遇到「若方程 $kx^2 - 4x + 2 = 0$ 有實根，求 $k$ 的取值範圍」，我寫咗 $\\Delta > 0$ 同埋漏咗考慮 $k = 0$ 嘅一次方程情況。想問大家點樣記最穩陣？',
        authorId: 'me',
        authorLabel: '同學 DSE28',
        isAnonymous: false,
        isOfficial: false,
        pinned: false,
        locked: false,
        status: 'active',
        imageIds: [],
        questionRef: {
          sourceKind: 'wrong',
          subjectId: 'maths',
          topicName: '一元二次方程',
          title: '一元二次方程 · 判別式與實根條件',
          promptExcerpt: '若方程 kx² − 4x + 2 = 0 有實根，求常數 k 的取值範圍及需特別檢查的係數條件。',
        },
        reactions: { upvote: 14, same: 9, cheer: 3, useful: 11, myReactions: [] },
        createdAt: '2028-02-14T09:40:00.000Z',
        updatedAt: '2028-02-14T11:25:00.000Z',
      },
      {
        id: 'demo-post-jupas',
        boardId: 'jupas',
        flair: 'tips',
        visibility: 'public',
        title: '排 Band A 小貼士：記得睇清楚 Best 5 定 4C+2X 同科目加權！',
        body: '啱啱喺「升學目標」對比咗幾個 Programme，發現有啲科將 English 同 Maths 乘 1.5 倍甚至 2 倍，差一級已經差好遠。建議大家未改選前先睇清楚計分公式同最低門檻（例如 332A）。',
        authorId: 'peer-2',
        authorLabel: '阿晴 StudyLog',
        isAnonymous: false,
        isOfficial: false,
        pinned: false,
        locked: false,
        status: 'active',
        imageIds: [],
        reactions: { upvote: 21, same: 3, cheer: 7, useful: 18, myReactions: [] },
        createdAt: '2028-02-13T20:10:00.000Z',
        updatedAt: '2028-02-13T20:10:00.000Z',
      },
    ],
    comments: [
      {
        id: 'demo-comment-v1',
        postId: 'demo-post-vent',
        parentId: null,
        authorId: 'peer-3',
        authorLabel: '匿名同學 #1',
        isAnonymous: true,
        isOfficial: false,
        isOp: false,
        anonIndex: 1,
        body: '抱抱樓主！識做但錯 Careless 其實好過完全唔識 Concept，代表你底子係有嘅！我依家每做完一題都會強迫自己圈住「負號」同問自己所求係 $x$ 定 $2x$，慢 5 秒但少錯好多。',
        status: 'active',
        upvotes: 11,
        myUpvoted: false,
        createdAt: '2028-02-14T10:28:00.000Z',
        updatedAt: '2028-02-14T10:28:00.000Z',
      },
      {
        id: 'demo-comment-v2',
        postId: 'demo-post-vent',
        parentId: 'demo-comment-v1',
        authorId: 'peer-1',
        authorLabel: '匿名樓主',
        isAnonymous: true,
        isOfficial: false,
        isOp: true,
        anonIndex: null,
        body: '多謝你 😭 聽完無咁慌，今晚試下將錯因分類寫低先，唔再死鋤到半夜。',
        status: 'active',
        upvotes: 6,
        myUpvoted: false,
        createdAt: '2028-02-14T10:42:00.000Z',
        updatedAt: '2028-02-14T10:42:00.000Z',
      },
      {
        id: 'demo-comment-m1',
        postId: 'demo-post-maths',
        parentId: null,
        authorId: 'peer-4',
        authorLabel: 'M2苦主阿軒',
        isAnonymous: false,
        isOfficial: false,
        isOp: false,
        anonIndex: null,
        body: '超多人中呢個伏！只要見到題目無寫明「二次方程 (quadratic equation)」而只寫「方程 (equation)」，當 $x^2$ 係數有未知數 $k$，第一步要分開 Check $k = 0$ 嗰陣仲有無實數解！',
        status: 'active',
        upvotes: 9,
        myUpvoted: false,
        createdAt: '2028-02-14T10:05:00.000Z',
        updatedAt: '2028-02-14T10:05:00.000Z',
      },
      {
        id: 'demo-comment-m2',
        postId: 'demo-post-maths',
        parentId: 'demo-comment-m1',
        authorId: 'peer-5',
        authorLabel: '匿名同學 #1',
        isAnonymous: true,
        isOfficial: false,
        isOp: false,
        anonIndex: 1,
        body: '補充多句：題目講「有實根 (real roots)」無講「兩個相異實根 (two distinct real roots)」就包埋重根 $\\Delta = 0$，所以係 $\\Delta = (-4)^2 - 4(k)(2) \\ge 0 \\Rightarrow k \\le 2$！',
        status: 'active',
        upvotes: 7,
        myUpvoted: false,
        createdAt: '2028-02-14T11:25:00.000Z',
        updatedAt: '2028-02-14T11:25:00.000Z',
      },
    ],
  };
}

let stateCache: MockForumState | undefined;
function forumDb(): MockForumState {
  if (!stateCache) {
    try {
      const raw = localStorage.getItem(FORUM_MOCK_KEY);
      stateCache = raw ? JSON.parse(raw) : createForumSeed();
    } catch {
      stateCache = createForumSeed();
    }
  }
  return stateCache!;
}
function saveForum() {
  localStorage.setItem(FORUM_MOCK_KEY, JSON.stringify(forumDb()));
}
export function resetMockForum() {
  localStorage.removeItem(FORUM_MOCK_KEY);
  stateCache = createForumSeed();
}

function toPollView(poll: MockStoredPost['poll']): ForumPollView | undefined {
  if (!poll) return undefined;
  const total = poll.options.reduce((s, o) => s + o.votes, 0);
  return {
    question: poll.question,
    totalVotes: total,
    myOptionId: poll.myOptionId,
    options: poll.options.map(o => ({
      id: o.id,
      label: o.label,
      votes: o.votes,
      percent: total > 0 ? Math.round((o.votes / total) * 100) : 0,
    })),
  };
}

function toSummary(p: MockStoredPost): ForumPostSummary {
  const commentCount = forumDb().comments.filter(c => c.postId === p.id && c.status === 'active').length;
  return {
    id: p.id,
    boardId: p.boardId,
    flair: p.flair,
    visibility: p.visibility,
    title: p.title,
    bodyPreview: p.body.length > 220 ? p.body.slice(0, 220) + '…' : p.body,
    authorLabel: p.isOfficial ? '學序官方' : p.isAnonymous ? '匿名同學' : p.authorId === 'me' ? forumDb().nickname : p.authorLabel,
    isAnonymous: p.isAnonymous,
    isOfficial: p.isOfficial,
    isMine: p.authorId === 'me',
    pinned: p.pinned,
    locked: p.locked,
    status: p.status,
    imageIds: p.imageIds,
    hasPoll: Boolean(p.poll),
    questionRef: p.questionRef,
    reactions: p.reactions,
    commentCount,
    hotScore: computeHotScore(p.reactions.upvote, commentCount, p.createdAt),
    distressSupport: hasDistressSignal(p.title + '\n' + p.body),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toDetail(p: MockStoredPost): ForumPostDetail {
  const summary = toSummary(p);
  const { bodyPreview: _p, ...rest } = summary;
  const comments: ForumCommentView[] = forumDb()
    .comments.filter(c => c.postId === p.id && c.status === 'active')
    .map(c => ({
      id: c.id,
      postId: c.postId,
      parentId: c.parentId,
      authorLabel: c.isOfficial ? '學序官方' : c.isAnonymous ? c.authorLabel : c.authorId === 'me' ? forumDb().nickname : c.authorLabel,
      isAnonymous: c.isAnonymous,
      isOfficial: c.isOfficial,
      isOp: c.isOp,
      anonIndex: c.anonIndex,
      isMine: c.authorId === 'me',
      body: c.body,
      status: c.status,
      upvotes: c.upvotes,
      myUpvoted: c.myUpvoted,
      distressSupport: hasDistressSignal(c.body),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  return {
    ...rest,
    body: p.body,
    poll: toPollView(p.poll),
    comments,
  };
}

export function createForumMockHandlers(getSelectedSubjects: () => string[]) {
  const json = (data: unknown, status = 200) => HttpResponse.json(data as any, { status });
  const err = (message: string, status = 400) => HttpResponse.json({ error: { code: 'FORUM_ERROR', message } }, { status });

  return [
    http.get('/api/v1/forum/boards', () => {
      const profile: ForumProfileView = {
        nickname: forumDb().nickname,
        mutedUntil: null,
        muteReason: null,
        canModerate: false,
        isDeveloper: false,
      };
      return json({ boards: buildForumBoards(catalog.subjects, getSelectedSubjects()), profile });
    }),
    http.put('/api/v1/forum/profile', async ({ request }) => {
      const input = (await request.json()) as Record<string, any>;
      const nickname = String(input.nickname ?? '').trim();
      if (nickname.length < 2 || nickname.length > 20) return err('論壇暱稱須為 2 至 20 個字元');
      forumDb().nickname = nickname;
      saveForum();
      return json({ nickname, mutedUntil: null, muteReason: null, canModerate: false, isDeveloper: false });
    }),
    http.get('/api/v1/forum/posts', ({ request }) => {
      const url = new URL(request.url);
      const boardId = url.searchParams.get('boardId') ?? 'all';
      const flair = url.searchParams.get('flair') ?? 'all';
      const sort = (url.searchParams.get('sort') as ForumSort | null) ?? 'hot';
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      const items = forumDb()
        .posts.filter(
          p =>
            p.status === 'active' &&
            (boardId === 'all' || p.boardId === boardId) &&
            (flair === 'all' || p.flair === flair) &&
            (!q || `${p.title} ${p.body}`.toLowerCase().includes(q)),
        )
        .map(toSummary);
      items.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (sort === 'new') return b.createdAt.localeCompare(a.createdAt);
        if (sort === 'top') return b.reactions.upvote - a.reactions.upvote || b.createdAt.localeCompare(a.createdAt);
        return b.hotScore - a.hotScore || b.createdAt.localeCompare(a.createdAt);
      });
      return json({ posts: items });
    }),
    http.post('/api/v1/forum/posts', async ({ request }) => {
      const input = (await request.json()) as Record<string, any>;
      const boardId = String(input.boardId ?? 'lounge');
      if (!isValidBoardId(boardId, catalog.subjects)) return err('請選擇有效的討論板塊');
      const flair = String(input.flair ?? 'chat') as ForumFlair;
      if (!Object.hasOwn(FORUM_FLAIR_META, flair) || flair === 'official') return err('帖子分類標籤無效');
      const title = String(input.title ?? '').trim();
      const body = String(input.body ?? '').trim();
      if (title.length < 2 || title.length > 120) return err('標題請填寫 2 至 120 個字');
      if (!body || body.length > 8000) return err('正文請填寫 1 至 8,000 個字');
      const imageIds = Array.isArray(input.imageIds) ? input.imageIds.slice(0, MAX_FORUM_IMAGES).map(String) : [];
      let poll: MockStoredPost['poll'];
      if (input.poll?.question) {
        const opts = (Array.isArray(input.poll.options) ? input.poll.options : []).map((o: unknown) => String(o ?? '').trim()).filter(Boolean);
        if (opts.length < 2 || opts.length > 6) return err('投票選項須為 2 至 6 項');
        poll = {
          question: String(input.poll.question).trim().slice(0, 140),
          myOptionId: null,
          options: opts.map((label: string, i: number) => ({ id: `opt-${i + 1}`, label: label.slice(0, 80), votes: 0 })),
        };
      }
      const now = new Date().toISOString();
      const isAnonymous = input.isAnonymous === true;
      const post: MockStoredPost = {
        id: `demo-post-${Date.now()}`,
        boardId,
        flair,
        visibility: input.visibility === 'members' ? 'members' : 'public',
        title,
        body,
        authorId: 'me',
        authorLabel: isAnonymous ? '匿名同學' : forumDb().nickname,
        isAnonymous,
        isOfficial: false,
        pinned: false,
        locked: false,
        status: 'active',
        imageIds,
        questionRef: input.questionRef,
        poll,
        reactions: { upvote: 0, same: 0, cheer: 0, useful: 0, myReactions: [] },
        createdAt: now,
        updatedAt: now,
      };
      forumDb().posts.unshift(post);
      saveForum();
      return json(toDetail(post), 201);
    }),
    http.get('/api/v1/forum/posts/:id', ({ params }) => {
      const p = forumDb().posts.find(x => x.id === params.id && x.status === 'active');
      if (!p) return err('找不到這則討論帖', 404);
      return json(toDetail(p));
    }),
    http.patch('/api/v1/forum/posts/:id', async ({ request, params }) => {
      const p = forumDb().posts.find(x => x.id === params.id && x.status === 'active');
      if (!p || p.authorId !== 'me') return err('無權編輯此帖子', 403);
      const input = (await request.json()) as Record<string, any>;
      if (input.title !== undefined) p.title = String(input.title).trim().slice(0, 120);
      if (input.body !== undefined) p.body = String(input.body).trim().slice(0, 8000);
      if (input.visibility === 'public' || input.visibility === 'members') p.visibility = input.visibility;
      p.updatedAt = new Date().toISOString();
      saveForum();
      return json(toDetail(p));
    }),
    http.delete('/api/v1/forum/posts/:id', ({ params }) => {
      const p = forumDb().posts.find(x => x.id === params.id);
      if (!p || p.authorId !== 'me') return err('無權刪除此帖子', 403);
      p.status = 'deleted';
      saveForum();
      return json({ ok: true });
    }),
    http.post('/api/v1/forum/posts/:id/comments', async ({ request, params }) => {
      const p = forumDb().posts.find(x => x.id === params.id && x.status === 'active');
      if (!p) return err('找不到該帖子', 404);
      const input = (await request.json()) as Record<string, any>;
      const body = String(input.body ?? '').trim();
      if (!body || body.length > 3000) return err('回覆內容請填寫 1 至 3,000 個字');
      const isAnonymous = input.isAnonymous === true;
      const isOp = p.authorId === 'me' && p.isAnonymous === isAnonymous;
      let anonIndex: number | null = null;
      let authorLabel = forumDb().nickname;
      if (isAnonymous) {
        if (isOp) {
          authorLabel = '匿名樓主';
        } else {
          const existing = forumDb().comments.find(c => c.postId === p.id && c.authorId === 'me' && c.isAnonymous && c.anonIndex);
          anonIndex = existing?.anonIndex ?? Math.max(0, ...forumDb().comments.filter(c => c.postId === p.id).map(c => c.anonIndex ?? 0)) + 1;
          authorLabel = `匿名同學 #${anonIndex}`;
        }
      }
      const now = new Date().toISOString();
      forumDb().comments.push({
        id: `demo-comment-${Date.now()}`,
        postId: p.id,
        parentId: input.parentId ? String(input.parentId) : null,
        authorId: 'me',
        authorLabel,
        isAnonymous,
        isOfficial: false,
        isOp,
        anonIndex,
        body,
        status: 'active',
        upvotes: 0,
        myUpvoted: false,
        createdAt: now,
        updatedAt: now,
      });
      p.updatedAt = now;
      saveForum();
      return json(toDetail(p), 201);
    }),
    http.delete('/api/v1/forum/comments/:id', ({ params }) => {
      const c = forumDb().comments.find(x => x.id === params.id);
      if (!c || c.authorId !== 'me') return err('無權刪除此回覆', 403);
      c.status = 'deleted';
      saveForum();
      return json({ ok: true });
    }),
    http.post('/api/v1/forum/reactions', async ({ request }) => {
      const input = (await request.json()) as Record<string, any>;
      const kind = String(input.kind ?? 'upvote') as ForumReactionKind;
      if (input.targetType === 'comment') {
        const c = forumDb().comments.find(x => x.id === input.targetId && x.status === 'active');
        if (!c) return err('找不到該回覆', 404);
        c.myUpvoted = !c.myUpvoted;
        c.upvotes = Math.max(0, c.upvotes + (c.myUpvoted ? 1 : -1));
        saveForum();
        return json({ active: c.myUpvoted, upvotes: c.upvotes });
      }
      const p = forumDb().posts.find(x => x.id === input.targetId && x.status === 'active');
      if (!p) return err('找不到該帖子', 404);
      const has = p.reactions.myReactions.includes(kind);
      if (has) {
        p.reactions.myReactions = p.reactions.myReactions.filter(x => x !== kind);
        p.reactions[kind] = Math.max(0, p.reactions[kind] - 1);
      } else {
        p.reactions.myReactions.push(kind);
        p.reactions[kind] += 1;
      }
      saveForum();
      return json({ active: !has, reactions: p.reactions });
    }),
    http.post('/api/v1/forum/posts/:id/poll-vote', async ({ request, params }) => {
      const p = forumDb().posts.find(x => x.id === params.id && x.status === 'active');
      if (!p?.poll) return err('此帖子沒有投票', 404);
      const input = (await request.json()) as Record<string, any>;
      const optionId = String(input.optionId ?? '');
      const target = p.poll.options.find(o => o.id === optionId);
      if (!target) return err('選項不存在');
      if (p.poll.myOptionId) {
        const prev = p.poll.options.find(o => o.id === p.poll!.myOptionId);
        if (prev) prev.votes = Math.max(0, prev.votes - 1);
      }
      target.votes += 1;
      p.poll.myOptionId = optionId;
      saveForum();
      return json(toPollView(p.poll));
    }),
    http.post('/api/v1/forum/reports', async ({ request }) => {
      const input = (await request.json()) as Record<string, any>;
      const reason = String(input.reason ?? 'other') as ForumReportReason;
      if (!Object.hasOwn(FORUM_REPORT_REASON_LABELS, reason)) return err('請選擇舉報原因');
      const key = `${input.targetType}:${input.targetId}`;
      forumDb().reports[key] = (forumDb().reports[key] ?? 0) + 1;
      const autoHidden = forumDb().reports[key] >= REPORT_AUTO_HIDE_THRESHOLD;
      saveForum();
      return json({ ok: true, autoHidden });
    }),
    http.post('/api/v1/forum/images', async ({ request }) => {
      const buf = await request.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > MAX_FORUM_IMAGE_BYTES) return err('單張圖片上限為 200 KB', 413);
      const mimeType = request.headers.get('content-type') || 'image/webp';
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const id = `demo-fimg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      forumDb().images[id] = { mimeType, dataUrl: `data:${mimeType};base64,${btoa(binary)}`, size: buf.byteLength };
      saveForum();
      return json({ id, mimeType, size: buf.byteLength }, 201);
    }),
    http.get('/api/v1/forum/images/:id', async ({ params }) => {
      const img = forumDb().images[String(params.id)];
      if (!img) return err('找不到圖片', 404);
      const res = await fetch(img.dataUrl);
      return new HttpResponse(await res.arrayBuffer(), { headers: { 'Content-Type': img.mimeType } });
    }),
    http.get('/api/v1/forum/notifications', () => {
      const items = forumDb().notifications;
      return json({ unreadCount: items.filter(n => !n.read).length, items });
    }),
    http.post('/api/v1/forum/notifications/read', () => {
      forumDb().notifications.forEach(n => { n.read = true; });
      saveForum();
      return json({ ok: true });
    }),
    http.get('/api/v1/forum/moderation', () => json({ items: [] })),
    http.post('/api/v1/forum/moderation', () => json({ ok: true })),
  ];
}
