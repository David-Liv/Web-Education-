import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, uploadForumImage } from '../api/client';
import { Badge, Confirm, Empty, Icon, Modal, NetworkError, RichText, Skeleton, Tabs } from '../components';
import { catalog } from '../data/catalog';
import {
  FORUM_FLAIR_META,
  FORUM_REACTION_META,
  FORUM_REPORT_REASON_LABELS,
  MAX_FORUM_IMAGES,
  MAX_FORUM_IMAGE_BYTES,
  buildCommentTree,
  buildForumBoards,
  buildForumTutorPrompt,
  defaultTopicForSubject,
} from '../forum-types';
import type {
  ForumBoard,
  ForumCommentNode,
  ForumFlair,
  ForumModerationItem,
  ForumPollView,
  ForumPostDetail,
  ForumPostSummary,
  ForumProfileView,
  ForumQuestionRef,
  ForumReactionKind,
  ForumReportReason,
  ForumRestrictedPost,
  ForumSort,
  ForumVisibility,
} from '../forum-types';
import { interfaceLocale, ui, useInterfaceLanguage } from '../i18n';
import { localizeCatalog } from '../i18n-catalog';

export interface ForumComposeDraft {
  boardId?: string;
  flair?: ForumFlair;
  title?: string;
  body?: string;
  questionRef?: ForumQuestionRef;
}

interface PendingImage {
  id: string;
  previewUrl: string;
  byteSize: number;
}

async function compressForumImage(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    throw new Error('只支援上傳 JPG、PNG 或 WebP 圖片');
  }
  if (file.size <= MAX_FORUM_IMAGE_BYTES && /^image\/(jpeg|png|webp)$/i.test(file.type)) {
    return file;
  }
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('無法讀取此圖片檔案'));
      el.src = bitmapUrl;
    });
    const maxDimensions = [1280, 960, 720];
    const qualities = [0.82, 0.68, 0.52, 0.38];
    for (const maxDim of maxDimensions) {
      const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const width = Math.max(1, Math.round((img.naturalWidth || 1) * ratio));
      const height = Math.max(1, Math.round((img.naturalHeight || 1) * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('瀏覽器不支援圖片壓縮');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      for (const mime of ['image/webp', 'image/jpeg'] as const) {
        for (const quality of qualities) {
          const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, mime, quality));
          if (blob && blob.size > 0 && blob.size <= MAX_FORUM_IMAGE_BYTES) {
            return blob;
          }
        }
      }
    }
    throw new Error('圖片壓縮後仍超過 200 KB，請裁剪或換一張較簡單的截圖');
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

function formatForumTime(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  return new Intl.DateTimeFormat(interfaceLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Hong_Kong',
  }).format(new Date(time));
}

function formatAuthorLabel(label: string): string {
  if (label === '學序官方' || label === '匿名同學' || label === '匿名樓主') return ui(label);
  const anonMatch = label.match(/^匿名同學 #(\d+)$/);
  if (anonMatch) return ui('匿名同學 #{0}', [anonMatch[1]]);
  const defaultPeerMatch = label.match(/^同學 ([A-Z0-9]{4})$/i);
  if (defaultPeerMatch) return ui('同學 {0}', [defaultPeerMatch[1]]);
  return label;
}

function localizeBoard(board: ForumBoard, localizedSubjects: Map<string, { name: string; short: string; icon: string }>, isEn: boolean): ForumBoard {
  if (!isEn) return board;
  if (board.id === 'lounge') {
    return {
      ...board,
      name: ui('吹水／樹洞'),
      short: ui('吹水樹洞'),
      description: ui('溫書累了來抖抖氣、吐苦水、講廢話，互相撐住。'),
    };
  }
  if (board.id === 'jupas') {
    return {
      ...board,
      name: ui('升學／JUPAS'),
      short: 'JUPAS',
      description: ui('排 Banding、計分策略、面試同大學生活討論。'),
    };
  }
  if (board.id === 'applied-other') {
    return {
      ...board,
      name: ui('應用學習／其他語言'),
      short: ui('應學／外語'),
      description: ui('乙類應用學習（ApL）及丙類其他語言科目交流。'),
      icon: 'Lg',
    };
  }
  if (board.subjectId) {
    const sub = localizedSubjects.get(board.subjectId);
    if (sub) {
      return {
        ...board,
        name: sub.name,
        short: sub.short,
        icon: sub.icon,
        description: ui('{0}解題交流、溫習方法與試卷吐槽。', [sub.name]),
      };
    }
  }
  return board;
}

function DistressCallout() {
  useInterfaceLanguage();
  return (
    <aside className="forum-distress-card" role="note">
      <div className="forum-distress-title">
        <Icon name="leaf" size={18} />
        <strong>{ui('讀書同備試壓力好大，你唔需要一個人硬撐')}</strong>
      </div>
      <p className="small">
        {ui('如果你覺得好攰、喘唔過氣，隨時可以搵專業社工或輔導員傾訴（免費、保密、24 小時）：')}
      </p>
      <div className="forum-distress-links">
        <a href="https://www.openup.hk" target="_blank" rel="noopener noreferrer" className="chip">
          {ui('Open噏 24小時網上支援 · WhatsApp 9101 2012')}
        </a>
        <span className="chip">{ui('撒瑪利亞防止自殺會 · 2389 2222')}</span>
        <span className="chip">{ui('生命熱線 · 2382 0000')}</span>
        <span className="chip">{ui('社署熱線 · 2343 2255')}</span>
      </div>
    </aside>
  );
}

function QuestionRefCard({ reference, onRemove }: { reference: ForumQuestionRef; onRemove?: () => void }) {
  useInterfaceLanguage();
  const sourceLabel =
    reference.sourceKind === 'wrong'
      ? ui('錯題簿摘錄')
      : reference.sourceKind === 'quiz-result'
        ? ui('已交卷題目摘錄')
        : reference.sourceKind === 'maths-index'
          ? ui('公開題目索引')
          : ui('練習題摘錄');
  return (
    <div className="forum-question-ref">
      <div className="forum-question-ref-head">
        <div className="row wrap">
          <Badge tone="blue">{sourceLabel}</Badge>
          <strong>{reference.title}</strong>
          {reference.topicName && <span className="small muted">· {reference.topicName}</span>}
        </div>
        {onRemove && (
          <button type="button" className="icon-btn" aria-label={ui('移除引用題目')} onClick={onRemove}>
            <Icon name="x" size={15} />
          </button>
        )}
      </div>
      <p className="small">{reference.promptExcerpt}</p>
      {reference.externalUrl && (
        <a href={reference.externalUrl} target="_blank" rel="noopener noreferrer" className="text-link small">
          {ui('查看原題來源連結')} <Icon name="external" size={13} />
        </a>
      )}
    </div>
  );
}

function CommentBranch({
  node,
  locked,
  guest,
  canModerate,
  postIsAnonOp,
  replyingToId,
  onToggleReply,
  onSubmitReply,
  onUpvote,
  onDelete,
  onReport,
  onRequireLogin,
}: {
  node: ForumCommentNode;
  locked: boolean;
  guest: boolean;
  canModerate: boolean;
  postIsAnonOp: boolean;
  replyingToId: string | null;
  onToggleReply: (id: string | null) => void;
  onSubmitReply: (parentId: string, body: string, isAnonymous: boolean) => Promise<void>;
  onUpvote: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onReport: (commentId: string) => void;
  onRequireLogin?: () => void;
}) {
  useInterfaceLanguage();
  const [collapsed, setCollapsed] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyAnon, setReplyAnon] = useState(postIsAnonOp);
  const [submitting, setSubmitting] = useState(false);

  const isReplying = replyingToId === node.id;

  const handleReplySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmitReply(node.id, replyBody.trim(), replyAnon);
      setReplyBody('');
      onToggleReply(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`forum-comment-node depth-${node.visualDepth}`}>
      <div className="forum-comment-rail">
        <button
          type="button"
          className="forum-collapse-line"
          aria-label={collapsed ? ui('展開留言分支') : ui('收起留言分支')}
          title={collapsed ? ui('展開留言分支') : ui('收起留言分支')}
          onClick={() => setCollapsed(v => !v)}
        />
      </div>
      <div className="forum-comment-main">
        <div className="forum-comment-meta">
          <button type="button" className="forum-collapse-btn" onClick={() => setCollapsed(v => !v)}>
            {collapsed ? `[+]` : `[-]`}
          </button>
          <strong className="forum-author-name">{formatAuthorLabel(node.authorLabel)}</strong>
          {node.isOfficial && <Badge tone="green">{ui('官方')}</Badge>}
          {node.isOp && !node.isOfficial && <Badge tone="blue">{node.isAnonymous ? ui('匿名樓主') : ui('樓主')}</Badge>}
          {node.isMine && <span className="small muted">{ui('（我）')}</span>}
          {node.replyToLabel && (
            <span className="forum-reply-target">
              <Icon name="reply" size={12} /> @{formatAuthorLabel(node.replyToLabel)}
            </span>
          )}
          <span className="small muted">· {formatForumTime(node.createdAt)}</span>
        </div>

        {collapsed ? (
          <button type="button" className="forum-collapsed-note" onClick={() => setCollapsed(false)}>
            {ui('已收起此樓層（點擊展開，含 {0} 則子回覆）', [node.children.length])}
          </button>
        ) : (
          <>
            <div className="forum-comment-body">
              <RichText text={node.body} />
            </div>
            <div className="forum-comment-actions">
              <button
                type="button"
                className={`forum-pill-btn ${node.myUpvoted ? 'active' : ''}`}
                onClick={() => (guest ? onRequireLogin?.() : onUpvote(node.id))}
              >
                <Icon name="thumbsUp" size={13} /> {ui('頂')} {node.upvotes > 0 ? node.upvotes : ''}
              </button>
              {!locked && (
                <button
                  type="button"
                  className="forum-pill-btn"
                  onClick={() => {
                    if (guest) {
                      onRequireLogin?.();
                      return;
                    }
                    onToggleReply(isReplying ? null : node.id);
                  }}
                >
                  <Icon name="reply" size={13} /> {ui('回覆')}
                </button>
              )}
              {(node.isMine || canModerate) && !guest && (
                <button type="button" className="forum-pill-btn danger-text" onClick={() => onDelete(node.id)}>
                  <Icon name="trash" size={13} /> {ui('刪除')}
                </button>
              )}
              {!node.isMine && !node.isOfficial && (
                <button
                  type="button"
                  className="forum-pill-btn"
                  onClick={() => (guest ? onRequireLogin?.() : onReport(node.id))}
                >
                  <Icon name="flag" size={13} /> {ui('舉報')}
                </button>
              )}
            </div>

            {isReplying && !locked && (
              <form className="forum-inline-reply" onSubmit={handleReplySubmit}>
                <textarea
                  rows={3}
                  maxLength={3000}
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  placeholder={ui('回覆 {0}（支援 Markdown 及 $數學公式$）…', [formatAuthorLabel(node.authorLabel)])}
                  required
                />
                <div className="forum-inline-reply-foot">
                  <label className="forum-check">
                    <input type="checkbox" checked={replyAnon} onChange={e => setReplyAnon(e.target.checked)} />
                    <span>{ui('匿名回覆')}</span>
                  </label>
                  <div className="row">
                    <button type="button" className="btn ghost" onClick={() => onToggleReply(null)}>
                      {ui('取消')}
                    </button>
                    <button type="submit" className="btn primary" disabled={submitting || !replyBody.trim()}>
                      {submitting ? ui('發送中…') : ui('送出回覆')}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {node.children.length > 0 && (
              <div className="forum-comment-children">
                {node.children.map(child => (
                  <CommentBranch
                    key={child.id}
                    node={child}
                    locked={locked}
                    guest={guest}
                    canModerate={canModerate}
                    postIsAnonOp={postIsAnonOp}
                    replyingToId={replyingToId}
                    onToggleReply={onToggleReply}
                    onSubmitReply={onSubmitReply}
                    onUpvote={onUpvote}
                    onDelete={onDelete}
                    onReport={onReport}
                    onRequireLogin={onRequireLogin}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ForumPage({
  guest = false,
  onRequireLogin,
}: {
  guest?: boolean;
  onRequireLogin?: () => void;
}) {
  const language = useInterfaceLanguage();
  const isEn = language === 'en';
  const navigate = useNavigate();
  const location = useLocation();
  const { postId } = useParams<{ postId?: string }>();

  const localizedSubjects = useMemo(() => {
    const loc = localizeCatalog(catalog, language);
    return new Map(loc.subjects.map(s => [s.id, { name: s.name, short: s.short, icon: s.icon }]));
  }, [language]);

  const [rawBoards, setRawBoards] = useState<ForumBoard[]>(() => buildForumBoards(catalog.subjects, []));
  const [profile, setProfile] = useState<ForumProfileView | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string>('all');
  const [flairFilter, setFlairFilter] = useState<string>('all');
  const [sort, setSort] = useState<ForumSort>('hot');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showOtherSubjects, setShowOtherSubjects] = useState(false);

  const [posts, setPosts] = useState<ForumPostSummary[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState('');

  const [detail, setDetail] = useState<ForumPostDetail | ForumRestrictedPost | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [commentSort, setCommentSort] = useState<'hot' | 'new'>('hot');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [rootCommentBody, setRootCommentBody] = useState('');
  const [rootCommentAnon, setRootCommentAnon] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ text, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  // Nickname modal
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);

  // Composer modal
  const [composerOpen, setComposerOpen] = useState(false);
  const [composeBoardId, setComposeBoardId] = useState('lounge');
  const [composeFlair, setComposeFlair] = useState<ForumFlair>('vent');
  const [composeTitle, setComposeTitle] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeAnon, setComposeAnon] = useState(true);
  const [composeMembersOnly, setComposeMembersOnly] = useState(true);
  const [composeQuestionRef, setComposeQuestionRef] = useState<ForumQuestionRef | undefined>(undefined);
  const [composeImages, setComposeImages] = useState<PendingImage[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [composeHasPoll, setComposeHasPoll] = useState(false);
  const [composePollQuestion, setComposePollQuestion] = useState('');
  const [composePollOptions, setComposePollOptions] = useState<string[]>(['', '']);
  const [submittingPost, setSubmittingPost] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Edit post modal
  const [editingPost, setEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editVisibility, setEditVisibility] = useState<ForumVisibility>('public');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'post' | 'comment'; id: string } | null>(null);

  // Lightbox image
  const [lightboxImageId, setLightboxImageId] = useState<string | null>(null);

  // Report modal
  const [reportTarget, setReportTarget] = useState<{ targetType: 'post' | 'comment'; targetId: string } | null>(null);
  const [reportReason, setReportReason] = useState<ForumReportReason>('harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  // Moderation tab
  const [moderationOpen, setModerationOpen] = useState(false);
  const [moderationItems, setModerationItems] = useState<ForumModerationItem[]>([]);
  const [loadingModeration, setLoadingModeration] = useState(false);

  const boards = useMemo(
    () => rawBoards.map(b => localizeBoard(b, localizedSubjects, isEn)),
    [rawBoards, localizedSubjects, isEn],
  );

  const generalBoards = useMemo(() => boards.filter(b => b.group === 'general'), [boards]);
  const pinnedBoards = useMemo(() => boards.filter(b => b.group === 'pinned-subject'), [boards]);
  const otherBoards = useMemo(() => boards.filter(b => b.group === 'other-subject'), [boards]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 240);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadBoards = useCallback(async () => {
    try {
      const data = await api<{ boards: ForumBoard[]; profile: ForumProfileView | null }>('/forum/boards');
      setRawBoards(data.boards);
      setProfile(data.profile);
    } catch {
      // Fall back to static boards if offline
    }
  }, []);

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    setFeedError('');
    try {
      const qs = new URLSearchParams();
      if (activeBoardId !== 'all') qs.set('boardId', activeBoardId);
      if (flairFilter !== 'all') qs.set('flair', flairFilter);
      qs.set('sort', sort);
      if (debouncedQuery) qs.set('q', debouncedQuery);
      const data = await api<{ posts: ForumPostSummary[] }>(`/forum/posts?${qs.toString()}`);
      setPosts(data.posts);
    } catch (e) {
      setFeedError((e as Error).message);
    } finally {
      setLoadingFeed(false);
    }
  }, [activeBoardId, flairFilter, sort, debouncedQuery]);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setDetailError('');
    try {
      const data = await api<ForumPostDetail | ForumRestrictedPost>(`/forum/posts/${id}`);
      setDetail(data);
      if (!data.restricted) {
        setRootCommentAnon(Boolean(data.isMine && data.isAnonymous));
      }
      if (!guest) {
        void api('/forum/notifications/read', 'POST').then(() => {
          window.dispatchEvent(new Event('hokse:forum-notifications-changed'));
        }).catch(() => {});
      }
    } catch (e) {
      setDetailError((e as Error).message);
    } finally {
      setLoadingDetail(false);
    }
  }, [guest]);

  const loadModeration = useCallback(async () => {
    if (guest || !profile?.canModerate) return;
    setLoadingModeration(true);
    try {
      const data = await api<{ items: ForumModerationItem[] }>('/forum/moderation');
      setModerationItems(data.items);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setLoadingModeration(false);
    }
  }, [guest, profile?.canModerate, notify]);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    if (postId) {
      void loadDetail(postId);
    } else {
      setDetail(null);
      void loadFeed();
    }
  }, [postId, loadDetail, loadFeed]);

  useEffect(() => {
    if (profile?.canModerate && !guest) {
      void loadModeration();
    }
  }, [profile?.canModerate, guest, loadModeration]);

  // Open Composer automatically if arriving from a study page with composeDraft
  useEffect(() => {
    const state = location.state as { composeDraft?: ForumComposeDraft } | null;
    if (!state?.composeDraft) return;
    const draft = state.composeDraft;
    navigate(location.pathname, { replace: true, state: null });
    if (guest) {
      onRequireLogin?.();
      return;
    }
    const targetBoard = draft.boardId ?? 'lounge';
    setActiveBoardId(targetBoard);
    setComposeBoardId(targetBoard);
    setComposeFlair(draft.flair ?? 'help');
    setComposeTitle(draft.title ?? '');
    setComposeBody(draft.body ?? '');
    setComposeQuestionRef(draft.questionRef);
    setComposeAnon(false);
    setComposeMembersOnly(targetBoard === 'lounge');
    setComposeHasPoll(false);
    setComposerOpen(true);
  }, [location.state, location.pathname, navigate, guest, onRequireLogin]);

  function openNewPostModal() {
    if (guest) {
      onRequireLogin?.();
      return;
    }
    const defaultBoard = activeBoardId !== 'all' ? activeBoardId : 'lounge';
    setComposeBoardId(defaultBoard);
    setComposeFlair(defaultBoard === 'lounge' ? 'vent' : 'chat');
    setComposeTitle('');
    setComposeBody('');
    setComposeQuestionRef(undefined);
    setComposeAnon(defaultBoard === 'lounge');
    setComposeMembersOnly(defaultBoard === 'lounge');
    setComposeImages([]);
    setComposeHasPoll(false);
    setComposePollQuestion('');
    setComposePollOptions(['', '']);
    setComposerOpen(true);
  }

  function handleBoardChangeInComposer(nextBoardId: string) {
    setComposeBoardId(nextBoardId);
    if (nextBoardId === 'lounge') {
      setComposeMembersOnly(true);
    } else if (composeBoardId === 'lounge') {
      setComposeMembersOnly(false);
    }
  }

  async function handleSelectImage(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    const remaining = MAX_FORUM_IMAGES - composeImages.length;
    if (remaining <= 0) {
      notify(ui('每則帖子最多可附 {0} 張圖片', [MAX_FORUM_IMAGES]), 'error');
      return;
    }
    setUploadingImage(true);
    try {
      for (const file of files.slice(0, remaining)) {
        const compressed = await compressForumImage(file);
        const uploaded = await uploadForumImage(compressed);
        const previewUrl = URL.createObjectURL(compressed);
        setComposeImages(prev => [
          ...prev,
          { id: uploaded.id, previewUrl, byteSize: uploaded.byteSize ?? uploaded.size ?? compressed.size },
        ]);
      }
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setUploadingImage(false);
    }
  }

  function removePendingImage(id: string) {
    setComposeImages(prev => {
      const target = prev.find(x => x.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(x => x.id !== id);
    });
  }

  async function handleCreatePost(e: FormEvent) {
    e.preventDefault();
    if (submittingPost) return;
    setSubmittingPost(true);
    try {
      const cleanOptions = composePollOptions.map(o => o.trim()).filter(Boolean);
      const payload: Record<string, unknown> = {
        boardId: composeBoardId,
        flair: composeFlair,
        visibility: composeMembersOnly ? 'members' : 'public',
        title: composeTitle.trim(),
        body: composeBody.trim(),
        isAnonymous: composeAnon,
        imageIds: composeImages.map(x => x.id),
        ...(composeQuestionRef ? { questionRef: composeQuestionRef } : {}),
        ...(composeHasPoll
          ? {
              poll: {
                question: (composePollQuestion.trim() || composeTitle.trim()).slice(0, 140),
                options: cleanOptions,
              },
            }
          : {}),
      };
      const created = await api<ForumPostDetail>('/forum/posts', 'POST', payload);
      composeImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
      setComposeImages([]);
      setComposerOpen(false);
      notify(ui('帖子已發布'));
      navigate(`/forum/post/${created.id}`);
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSubmittingPost(false);
    }
  }

  async function handleTogglePostReaction(targetPostId: string, kind: ForumReactionKind) {
    if (guest) {
      onRequireLogin?.();
      return;
    }
    try {
      const res = await api<{ active: boolean; reactions: ForumPostSummary['reactions'] }>('/forum/reactions', 'POST', {
        targetType: 'post',
        targetId: targetPostId,
        kind,
      });
      setPosts(prev => prev.map(p => (p.id === targetPostId ? { ...p, reactions: res.reactions } : p)));
      setDetail(prev => (prev && !prev.restricted && prev.id === targetPostId ? { ...prev, reactions: res.reactions } : prev));
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }

  async function handleVotePoll(targetPostId: string, optionId: string) {
    if (guest) {
      onRequireLogin?.();
      return;
    }
    try {
      const updatedPoll = await api<ForumPollView>(`/forum/posts/${targetPostId}/poll-vote`, 'POST', { optionId });
      setDetail(prev => (prev && !prev.restricted && prev.id === targetPostId ? { ...prev, poll: updatedPoll } : prev));
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }

  async function handleAddComment(parentId: string | null, body: string, isAnonymous: boolean) {
    if (!postId) return;
    if (guest) {
      onRequireLogin?.();
      return;
    }
    const updated = await api<ForumPostDetail>(`/forum/posts/${postId}/comments`, 'POST', {
      parentId,
      body,
      isAnonymous,
    });
    setDetail(updated);
    notify(ui('回覆已送出'));
  }

  async function handleRootCommentSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rootCommentBody.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      await handleAddComment(null, rootCommentBody.trim(), rootCommentAnon);
      setRootCommentBody('');
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleCommentUpvote(commentId: string) {
    try {
      const res = await api<{ active: boolean; upvotes: number }>('/forum/reactions', 'POST', {
        targetType: 'comment',
        targetId: commentId,
        kind: 'upvote',
      });
      setDetail(prev => {
        if (!prev || prev.restricted) return prev;
        return {
          ...prev,
          comments: prev.comments.map(c =>
            c.id === commentId ? { ...c, myUpvoted: res.active, upvotes: res.upvotes } : c,
          ),
        };
      });
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    try {
      if (target.kind === 'post') {
        await api(`/forum/posts/${target.id}`, 'DELETE');
        notify(ui('帖子已刪除'));
        navigate('/forum');
      } else {
        await api(`/forum/comments/${target.id}`, 'DELETE');
        notify(ui('回覆已刪除'));
        if (postId) void loadDetail(postId);
      }
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!detail || detail.restricted || savingEdit) return;
    setSavingEdit(true);
    try {
      const updated = await api<ForumPostDetail>(`/forum/posts/${detail.id}`, 'PATCH', {
        title: editTitle.trim(),
        body: editBody.trim(),
        visibility: editVisibility,
      });
      setDetail(updated);
      setEditingPost(false);
      notify(ui('已更新帖子內容'));
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleSaveNickname(e: FormEvent) {
    e.preventDefault();
    if (savingNickname) return;
    setSavingNickname(true);
    try {
      const updated = await api<ForumProfileView>('/forum/profile', 'PUT', { nickname: nicknameDraft.trim() });
      setProfile(updated);
      setEditingNickname(false);
      notify(ui('論壇暱稱已更新'));
      if (postId) void loadDetail(postId);
      else void loadFeed();
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSavingNickname(false);
    }
  }

  async function handleSubmitReport(e: FormEvent) {
    e.preventDefault();
    if (!reportTarget || submittingReport) return;
    setSubmittingReport(true);
    try {
      const res = await api<{ ok: boolean; autoHidden: boolean }>('/forum/reports', 'POST', {
        targetType: reportTarget.targetType,
        targetId: reportTarget.targetId,
        reason: reportReason,
        details: reportDetails.trim(),
      });
      setReportTarget(null);
      setReportDetails('');
      notify(
        res.autoHidden
          ? ui('感謝舉報，該內容已達多人舉報門檻並暫時自動摺疊待核')
          : ui('已收到你的舉報，版務團隊會盡快處理'),
      );
      if (res.autoHidden) {
        if (postId) void loadDetail(postId);
        else void loadFeed();
      }
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSubmittingReport(false);
    }
  }

  async function handleModerateAction(
    targetType: 'post' | 'comment',
    targetId: string,
    action: string,
    muteHours?: number,
  ) {
    try {
      await api('/forum/moderation', 'POST', { targetType, targetId, action, muteHours });
      notify(ui('版務操作已完成'));
      if (postId) void loadDetail(postId);
      else void loadFeed();
      if (profile?.canModerate) void loadModeration();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }

  function handleSharePost(id: string, title: string, visibility: ForumVisibility) {
    const url = `${window.location.origin}/forum/post/${id}`;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(url);
    }
    notify(
      visibility === 'members'
        ? ui('已複製連結（此帖為僅登入同學可見，外部訪客需先登入）')
        : ui('已複製討論帖連結，可直接貼到 WhatsApp 分享：{0}', [title.slice(0, 22)]),
    );
  }

  function handleBringToAiTutor(post: ForumPostDetail) {
    if (guest) {
      onRequireLogin?.();
      return;
    }
    const board = rawBoards.find(b => b.id === post.boardId);
    const subjectId = post.questionRef?.subjectId ?? board?.subjectId;
    const topicId = defaultTopicForSubject(subjectId);
    const initialPrompt = buildForumTutorPrompt(post);
    navigate(`/learn?topicId=${encodeURIComponent(topicId)}`, { state: { initialPrompt } });
  }

  const boardById = useMemo(() => new Map(boards.map(b => [b.id, b])), [boards]);
  const activeBoard = activeBoardId === 'all' ? null : boardById.get(activeBoardId) ?? null;

  const commentTree = useMemo(() => {
    if (!detail || detail.restricted) return [];
    return buildCommentTree(detail.comments, commentSort);
  }, [detail, commentSort]);

  const anyDistressInDetail = useMemo(() => {
    if (!detail || detail.restricted) return false;
    return detail.distressSupport || detail.comments.some(c => c.distressSupport);
  }, [detail]);

  const mutedBanner =
    profile?.mutedUntil && profile.mutedUntil > Date.now()
      ? ui('你的討論區發言權限暫時受限至 {0}', [formatForumTime(new Date(profile.mutedUntil).toISOString())])
      : null;

  return (
    <div className="forum-page">
      {notice && (
        <div className={`forum-banner ${notice.tone}`} role="status">
          <span>{ui(notice.text)}</span>
          <button type="button" className="icon-btn" aria-label={ui('關閉提示')} onClick={() => setNotice(null)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {mutedBanner && (
        <div className="forum-banner error" role="alert">
          <span>{mutedBanner}</span>
        </div>
      )}

      <div className="forum-layout">
        {/* Left Sidebar: Boards + Forum Identity */}
        <aside className="forum-sidebar">
          <section className="card forum-identity-card">
            <div className="row between">
              <div>
                <div className="eyebrow">{ui('討論區身分')}</div>
                <strong className="forum-nickname">
                  {guest ? ui('訪客瀏覽模式') : formatAuthorLabel(profile?.nickname ?? '同學')}
                </strong>
              </div>
              {guest ? (
                <button type="button" className="btn primary" onClick={() => onRequireLogin?.()}>
                  {ui('登入參與')}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setNicknameDraft(profile?.nickname ?? '');
                    setEditingNickname(true);
                  }}
                >
                  <Icon name="pencil" size={14} /> {ui('改暱稱')}
                </button>
              )}
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>
              {ui('討論區獨立於學習紀錄，絕不公開登入帳號、分數或掌握度；每次發帖及留言均可勾選單次匿名。')}
            </p>
            {!guest && profile?.canModerate && (
              <button
                type="button"
                className={`btn ${moderationOpen ? 'primary' : 'secondary'} full`}
                style={{ marginTop: 10 }}
                onClick={() => {
                  const next = !moderationOpen;
                  setModerationOpen(next);
                  if (next && postId) navigate('/forum');
                  if (next) void loadModeration();
                }}
              >
                <Icon name="shield" size={15} /> {ui('版務待核')}
                {moderationItems.length > 0 && <Badge tone="amber">{moderationItems.length}</Badge>}
              </button>
            )}
          </section>

          <nav className="card forum-board-nav" aria-label={ui('討論區板塊')}>
            <button
              type="button"
              className={`forum-board-item ${activeBoardId === 'all' && !moderationOpen ? 'active' : ''}`}
              onClick={() => {
                setModerationOpen(false);
                setActiveBoardId('all');
                if (postId) navigate('/forum');
              }}
            >
              <span className="forum-board-dot" style={{ background: '#2d6a57' }}>✦</span>
              <span>{ui('全部動態')}</span>
            </button>

            <div className="forum-board-section">{ui('公共交流')}</div>
            {generalBoards.map(b => (
              <button
                key={b.id}
                type="button"
                className={`forum-board-item ${activeBoardId === b.id && !moderationOpen ? 'active' : ''}`}
                onClick={() => {
                  setModerationOpen(false);
                  setActiveBoardId(b.id);
                  if (postId) navigate('/forum');
                }}
              >
                <span className="forum-board-dot" style={{ background: b.color }}>{b.icon}</span>
                <span>{b.name}</span>
              </button>
            ))}

            {pinnedBoards.length > 0 && (
              <>
                <div className="forum-board-section">{ui('我的選科')}</div>
                {pinnedBoards.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    className={`forum-board-item ${activeBoardId === b.id && !moderationOpen ? 'active' : ''}`}
                    onClick={() => {
                      setModerationOpen(false);
                      setActiveBoardId(b.id);
                      if (postId) navigate('/forum');
                    }}
                  >
                    <span className="forum-board-dot" style={{ background: b.color }}>{b.icon}</span>
                    <span>{b.name}</span>
                  </button>
                ))}
              </>
            )}

            <div className="forum-board-section-row">
              <span className="forum-board-section">{ui('全部 DSE 科目板')}</span>
              <button
                type="button"
                className="text-link small"
                onClick={() => setShowOtherSubjects(v => !v)}
              >
                {showOtherSubjects ? ui('收起') : ui('展開 ({0})', [otherBoards.length])}
              </button>
            </div>
            {(showOtherSubjects || otherBoards.some(b => b.id === activeBoardId)) &&
              otherBoards.map(b => (
                <button
                  key={b.id}
                  type="button"
                  className={`forum-board-item ${activeBoardId === b.id && !moderationOpen ? 'active' : ''}`}
                  onClick={() => {
                    setModerationOpen(false);
                    setActiveBoardId(b.id);
                    if (postId) navigate('/forum');
                  }}
                >
                  <span className="forum-board-dot" style={{ background: b.color }}>{b.icon}</span>
                  <span>{b.name}</span>
                </button>
              ))}
          </nav>
        </aside>

        {/* Main Column */}
        <div className="forum-main">
          {moderationOpen && profile?.canModerate && !postId ? (
            <section className="card">
              <div className="row between wrap" style={{ marginBottom: 14 }}>
                <div>
                  <div className="eyebrow">{ui('安全與社群守護')}</div>
                  <h2>{ui('版務待核佇列')}</h2>
                  <p className="small muted">
                    {ui('累計滿 3 人舉報的內容會自動暫時摺疊。版務處置不會公開匿名同學的帳號身分。')}
                  </p>
                </div>
                <button type="button" className="btn secondary" onClick={() => setModerationOpen(false)}>
                  {ui('返回討論列表')}
                </button>
              </div>
              {loadingModeration ? (
                <Skeleton rows={3} />
              ) : moderationItems.length === 0 ? (
                <Empty icon="checkCircle" title={ui('目前沒有待處理舉報')} description={ui('所有被舉報或自動摺疊的內容均已處理完畢。')} />
              ) : (
                <div className="stack">
                  {moderationItems.map(item => (
                    <article key={`${item.targetType}:${item.targetId}`} className="forum-mod-card">
                      <div className="row between wrap">
                        <div className="row wrap">
                          <Badge tone={item.status === 'auto_hidden' ? 'amber' : 'neutral'}>
                            {item.status === 'auto_hidden' ? ui('已自動摺疊') : ui('顯示中')}
                          </Badge>
                          <Badge tone="blue">{item.targetType === 'post' ? ui('主帖') : ui('留言')}</Badge>
                          <strong>{item.title}</strong>
                          {item.isAnonymous && <Badge>{ui('匿名發布')}</Badge>}
                          <span className="small muted">· {ui('{0} 人舉報', [item.reportCount])}</span>
                        </div>
                        <button
                          type="button"
                          className="text-link small"
                          onClick={() => {
                            setModerationOpen(false);
                            navigate(`/forum/post/${item.postId}`);
                          }}
                        >
                          {ui('查看原帖')} <Icon name="arrow" size={13} />
                        </button>
                      </div>
                      <p className="small" style={{ margin: '8px 0' }}>{item.excerpt}</p>
                      <div className="row wrap" style={{ marginBottom: 10 }}>
                        {item.reasons.map((r, idx) => (
                          <span key={idx} className="chip small">
                            {ui(FORUM_REPORT_REASON_LABELS[r.reason])}
                            {r.details ? `：${r.details}` : ''}
                          </span>
                        ))}
                      </div>
                      <div className="row wrap">
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => void handleModerateAction(item.targetType, item.targetId, 'restore')}
                        >
                          {ui('恢復顯示並清除舉報')}
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          onClick={() => void handleModerateAction(item.targetType, item.targetId, 'delete')}
                        >
                          {ui('刪除內容')}
                        </button>
                        {profile.isDeveloper && item.canMuteAuthor && (
                          <>
                            <button
                              type="button"
                              className="btn secondary"
                              onClick={() => void handleModerateAction(item.targetType, item.targetId, 'mute', 24)}
                            >
                              {ui('禁言帳號 24 小時')}
                            </button>
                            <button
                              type="button"
                              className="btn secondary"
                              onClick={() => void handleModerateAction(item.targetType, item.targetId, 'mute', 168)}
                            >
                              {ui('禁言帳號 7 天')}
                            </button>
                            {item.authorMutedUntil && item.authorMutedUntil > Date.now() && (
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() => void handleModerateAction(item.targetType, item.targetId, 'mute', 0)}
                              >
                                {ui('解除禁言')}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : postId ? (
            /* Post Detail View */
            <div className="stack">
              <div className="row between wrap">
                <button type="button" className="btn secondary" onClick={() => navigate('/forum')}>
                  <Icon name="left" size={16} /> {ui('返回討論區')}
                </button>
                <button type="button" className="btn primary" onClick={openNewPostModal}>
                  <Icon name="plus" size={16} /> {ui('發起新帖')}
                </button>
              </div>

              {loadingDetail ? (
                <Skeleton rows={4} />
              ) : detailError ? (
                <NetworkError error={detailError} retry={() => void loadDetail(postId)} />
              ) : !detail ? null : detail.restricted ? (
                <section className="card forum-restricted-card">
                  <span className="empty-icon"><Icon name="lock" size={28} /></span>
                  <h2>{ui('此討論帖設為「僅登入同學可見」')}</h2>
                  <p className="muted">
                    {ui('發帖同學開啟了樹洞保護開關，避免內容被外部訪客或搜尋引擎直接讀取。請先登入你的學序帳戶後繼續查看與參與討論。')}
                  </p>
                  <div className="row wrap" style={{ justifyContent: 'center', marginTop: 12 }}>
                    <button type="button" className="btn primary" onClick={() => onRequireLogin?.()}>
                      {ui('登入／註冊後查看此帖')}
                    </button>
                    <button type="button" className="btn secondary" onClick={() => navigate('/forum')}>
                      {ui('先逛逛公開討論帖')}
                    </button>
                  </div>
                </section>
              ) : (
                <>
                  {anyDistressInDetail && <DistressCallout />}

                  <article className="card forum-detail-card">
                    <div className="forum-post-badges">
                      {detail.pinned && (
                        <Badge tone="green">
                          <Icon name="pin" size={12} /> {ui('置頂')}
                        </Badge>
                      )}
                      <span
                        className="forum-board-pill"
                        style={{ '--board-color': boardById.get(detail.boardId)?.color ?? '#3d7d66' } as React.CSSProperties}
                      >
                        {boardById.get(detail.boardId)?.name ?? detail.boardId}
                      </span>
                      <Badge tone={FORUM_FLAIR_META[detail.flair]?.tone ?? 'neutral'}>
                        {ui(FORUM_FLAIR_META[detail.flair]?.label ?? detail.flair)}
                      </Badge>
                      {detail.visibility === 'members' && (
                        <Badge tone="neutral">
                          <Icon name="lock" size={11} /> {ui('僅登入同學可見')}
                        </Badge>
                      )}
                      {detail.locked && <Badge tone="amber">{ui('已鎖帖')}</Badge>}
                    </div>

                    <h1 className="forum-detail-title">{detail.title}</h1>

                    <div className="forum-author-row">
                      <strong>{formatAuthorLabel(detail.authorLabel)}</strong>
                      {detail.isOfficial ? (
                        <Badge tone="green">{ui('官方')}</Badge>
                      ) : (
                        <Badge tone="blue">{detail.isAnonymous ? ui('匿名樓主') : ui('樓主')}</Badge>
                      )}
                      {detail.isMine && <span className="small muted">{ui('（我）')}</span>}
                      <span className="small muted">· {formatForumTime(detail.createdAt)}</span>
                      {detail.updatedAt !== detail.createdAt && <span className="small muted">({ui('已編輯')})</span>}
                    </div>

                    {detail.questionRef && <QuestionRefCard reference={detail.questionRef} />}

                    <div className="forum-detail-body">
                      <RichText text={detail.body} />
                    </div>

                    {detail.imageIds.length > 0 && (
                      <div className="forum-image-grid">
                        {detail.imageIds.map(imgId => (
                          <button
                            key={imgId}
                            type="button"
                            className="forum-image-thumb"
                            onClick={() => setLightboxImageId(imgId)}
                          >
                            <img src={`/api/v1/forum/images/${imgId}`} alt={ui('討論帖附圖')} loading="lazy" />
                          </button>
                        ))}
                      </div>
                    )}

                    {detail.poll && (
                      <section className="forum-poll-box" aria-label={ui('投票')}>
                        <div className="row between wrap" style={{ marginBottom: 8 }}>
                          <strong>
                            <Icon name="chart" size={16} /> {detail.poll.question}
                          </strong>
                          <span className="small muted">{ui('共 {0} 票（可隨時改選）', [detail.poll.totalVotes])}</span>
                        </div>
                        <div className="forum-poll-options">
                          {detail.poll.options.map(opt => {
                            const selected = detail.poll?.myOptionId === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                className={`forum-poll-option ${selected ? 'selected' : ''}`}
                                onClick={() => void handleVotePoll(detail.id, opt.id)}
                              >
                                <span className="forum-poll-bar" style={{ width: `${opt.percent}%` }} />
                                <span className="forum-poll-label">
                                  {selected && <Icon name="check" size={14} />}
                                  <span>{opt.label}</span>
                                </span>
                                <span className="forum-poll-stat">
                                  {opt.percent}% ({opt.votes})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* Positive Reaction & Empathy Bar */}
                    <div className="forum-reaction-bar">
                      <button
                        type="button"
                        className={`forum-reaction-btn primary-up ${detail.reactions.myReactions.includes('upvote') ? 'active' : ''}`}
                        onClick={() => void handleTogglePostReaction(detail.id, 'upvote')}
                      >
                        <Icon name="thumbsUp" size={15} />
                        <span>{ui('頂')}</span>
                        <strong>{detail.reactions.upvote}</strong>
                      </button>

                      {(Object.keys(FORUM_REACTION_META) as Exclude<ForumReactionKind, 'upvote'>[]).map(kind => {
                        const meta = FORUM_REACTION_META[kind];
                        const active = detail.reactions.myReactions.includes(kind);
                        return (
                          <button
                            key={kind}
                            type="button"
                            className={`forum-reaction-btn ${active ? 'active' : ''}`}
                            onClick={() => void handleTogglePostReaction(detail.id, kind)}
                          >
                            <span>{meta.emoji}</span>
                            <span>{ui(meta.label)}</span>
                            {detail.reactions[kind] > 0 && <strong>{detail.reactions[kind]}</strong>}
                          </button>
                        );
                      })}
                    </div>

                    {/* Action Toolbar */}
                    <div className="forum-detail-toolbar">
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => handleBringToAiTutor(detail)}
                      >
                        <Icon name="sparkles" size={15} /> {ui('帶去 AI 學習室私下問導師')}
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => handleSharePost(detail.id, detail.title, detail.visibility)}
                      >
                        <Icon name="share" size={15} /> {ui('複製分享連結')}
                      </button>
                      {detail.visibility === 'public' && (
                        <a
                          className="btn ghost"
                          href={`https://wa.me/?text=${encodeURIComponent(`${detail.title} — ${window.location.origin}/forum/post/${detail.id}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          WhatsApp
                        </a>
                      )}
                      {detail.isMine && !guest && (
                        <>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => {
                              setEditTitle(detail.title);
                              setEditBody(detail.body);
                              setEditVisibility(detail.visibility);
                              setEditingPost(true);
                            }}
                          >
                            <Icon name="pencil" size={14} /> {ui('編輯')}
                          </button>
                          <button
                            type="button"
                            className="btn ghost danger-text"
                            onClick={() => setConfirmDelete({ kind: 'post', id: detail.id })}
                          >
                            <Icon name="trash" size={14} /> {ui('刪除')}
                          </button>
                        </>
                      )}
                      {!detail.isMine && !detail.isOfficial && (
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() =>
                            guest ? onRequireLogin?.() : setReportTarget({ targetType: 'post', targetId: detail.id })
                          }
                        >
                          <Icon name="flag" size={14} /> {ui('舉報')}
                        </button>
                      )}
                      {profile?.canModerate && !guest && (
                        <>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() =>
                              void handleModerateAction('post', detail.id, detail.pinned ? 'unpin' : 'pin')
                            }
                          >
                            <Icon name="pin" size={14} /> {detail.pinned ? ui('取消置頂') : ui('置頂')}
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() =>
                              void handleModerateAction('post', detail.id, detail.locked ? 'unlock' : 'lock')
                            }
                          >
                            <Icon name="lock" size={14} /> {detail.locked ? ui('解鎖留言') : ui('鎖定留言')}
                          </button>
                          {!detail.isMine && (
                            <button
                              type="button"
                              className="btn ghost danger-text"
                              onClick={() => setConfirmDelete({ kind: 'post', id: detail.id })}
                            >
                              <Icon name="trash" size={14} /> {ui('版務刪除')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </article>

                  {/* Root Comment Composer & Nested Comment Tree */}
                  <section className="card forum-comments-card">
                    <div className="row between wrap" style={{ marginBottom: 14 }}>
                      <h2>{ui('同學蓋樓討論 ({0})', [detail.comments.length])}</h2>
                      <Tabs
                        items={[
                          { id: 'hot', label: '熱門樓層' },
                          { id: 'new', label: '最新回覆' },
                        ]}
                        value={commentSort}
                        onChange={id => setCommentSort(id as 'hot' | 'new')}
                      />
                    </div>

                    {detail.locked ? (
                      <p className="muted small" style={{ marginBottom: 16 }}>
                        {ui('此討論帖目前已鎖定，暫不接受新回覆。')}
                      </p>
                    ) : guest ? (
                      <div className="forum-guest-reply-prompt">
                        <span>{ui('想一齊蓋樓討論、投票或匿名吐苦水？')}</span>
                        <button type="button" className="btn primary" onClick={() => onRequireLogin?.()}>
                          {ui('登入／註冊參與討論')}
                        </button>
                      </div>
                    ) : (
                      <form className="forum-root-reply" onSubmit={handleRootCommentSubmit}>
                        <textarea
                          rows={3}
                          maxLength={3000}
                          value={rootCommentBody}
                          onChange={e => setRootCommentBody(e.target.value)}
                          placeholder={ui('寫下你的想法、解題思路或打氣說話（支援 Markdown 與 $LaTeX$ 數學公式）…')}
                          required
                        />
                        <div className="forum-inline-reply-foot">
                          <label className="forum-check">
                            <input
                              type="checkbox"
                              checked={rootCommentAnon}
                              onChange={e => setRootCommentAnon(e.target.checked)}
                            />
                            <span>
                              {detail.isMine && detail.isAnonymous && rootCommentAnon
                                ? ui('匿名回覆（將標示為「匿名樓主」）')
                                : ui('匿名回覆（本帖內自動配發固定編號，跨帖重置）')}
                            </span>
                          </label>
                          <button
                            type="submit"
                            className="btn primary"
                            disabled={submittingComment || !rootCommentBody.trim()}
                          >
                            {submittingComment ? ui('發送中…') : ui('發表回覆')}
                          </button>
                        </div>
                      </form>
                    )}

                    {commentTree.length === 0 ? (
                      <Empty
                        icon="forum"
                        title={ui('暫時未有同學留言')}
                        description={ui('做第一個留言撐場或者分享睇法嘅同學啦！')}
                      />
                    ) : (
                      <div className="forum-tree-root">
                        {commentTree.map(node => (
                          <CommentBranch
                            key={node.id}
                            node={node}
                            locked={detail.locked}
                            guest={guest}
                            canModerate={Boolean(profile?.canModerate)}
                            postIsAnonOp={Boolean(detail.isMine && detail.isAnonymous)}
                            replyingToId={replyingToId}
                            onToggleReply={setReplyingToId}
                            onSubmitReply={handleAddComment}
                            onUpvote={id => void handleCommentUpvote(id)}
                            onDelete={id => setConfirmDelete({ kind: 'comment', id })}
                            onReport={id => setReportTarget({ targetType: 'comment', targetId: id })}
                            onRequireLogin={onRequireLogin}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          ) : (
            /* Feed View */
            <div className="stack">
              <header className="card forum-feed-header">
                <div className="row between wrap">
                  <div>
                    <div className="eyebrow">{ui('純同學真人社群 · 零 AI 自動灌水')}</div>
                    <h1>{activeBoard ? activeBoard.name : ui('同學討論區')}</h1>
                    <p className="muted">
                      {activeBoard
                        ? activeBoard.description
                        : ui('DSE 各科解題交流、溫書樹洞、JUPAS 排位與日常放鬆吹水。')}
                    </p>
                  </div>
                  <button type="button" className="btn primary" onClick={openNewPostModal}>
                    <Icon name="plus" size={17} /> {ui('發起新帖')}
                  </button>
                </div>

                <div className="forum-controls">
                  <Tabs
                    items={[
                      { id: 'hot', label: '熱門' },
                      { id: 'new', label: '最新' },
                      { id: 'top', label: '高讚' },
                    ]}
                    value={sort}
                    onChange={id => setSort(id as ForumSort)}
                  />
                  <label className="forum-search">
                    <Icon name="search" size={16} />
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder={ui('搜尋討論帖標題或內容…')}
                    />
                  </label>
                </div>

                <div className="forum-flair-strip" role="group" aria-label={ui('帖子分類篩選')}>
                  <button
                    type="button"
                    className={`chip ${flairFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setFlairFilter('all')}
                  >
                    {ui('全部類型')}
                  </button>
                  {(Object.keys(FORUM_FLAIR_META) as ForumFlair[]).map(f => (
                    <button
                      key={f}
                      type="button"
                      className={`chip ${flairFilter === f ? 'active' : ''}`}
                      onClick={() => setFlairFilter(f)}
                    >
                      {ui(FORUM_FLAIR_META[f].label)}
                    </button>
                  ))}
                </div>
              </header>

              {loadingFeed ? (
                <Skeleton rows={4} />
              ) : feedError ? (
                <NetworkError error={feedError} retry={() => void loadFeed()} />
              ) : posts.length === 0 ? (
                <Empty
                  icon="forum"
                  title={ui('這個板塊暫時未有符合條件的帖子')}
                  description={ui('不如由你開個頭，問一題卡住嘅 DSE 概念或者吐下苦水？')}
                  action={
                    <button type="button" className="btn primary" onClick={openNewPostModal}>
                      <Icon name="plus" size={16} /> {ui('發起第一則討論')}
                    </button>
                  }
                />
              ) : (
                <div className="forum-post-list">
                  {posts.map(post => {
                    const board = boardById.get(post.boardId);
                    const upvoted = post.reactions.myReactions.includes('upvote');
                    return (
                      <article key={post.id} className="card forum-post-card">
                        <div className="forum-vote-col">
                          <button
                            type="button"
                            className={`forum-vote-btn ${upvoted ? 'active' : ''}`}
                            aria-label={ui('頂這則帖子')}
                            onClick={() => void handleTogglePostReaction(post.id, 'upvote')}
                          >
                            <Icon name="thumbsUp" size={16} />
                            <span>{post.reactions.upvote}</span>
                          </button>
                        </div>

                        <div className="forum-post-content">
                          <div className="forum-post-badges">
                            {post.pinned && (
                              <Badge tone="green">
                                <Icon name="pin" size={11} /> {ui('置頂')}
                              </Badge>
                            )}
                            {board && (
                              <button
                                type="button"
                                className="forum-board-pill"
                                style={{ '--board-color': board.color } as React.CSSProperties}
                                onClick={() => setActiveBoardId(board.id)}
                              >
                                {board.short || board.name}
                              </button>
                            )}
                            <Badge tone={FORUM_FLAIR_META[post.flair]?.tone ?? 'neutral'}>
                              {ui(FORUM_FLAIR_META[post.flair]?.label ?? post.flair)}
                            </Badge>
                            {post.visibility === 'members' && (
                              <Badge tone="neutral">
                                <Icon name="lock" size={11} /> {ui('僅登入同學可見')}
                              </Badge>
                            )}
                            {post.hasPoll && (
                              <Badge tone="blue">
                                <Icon name="chart" size={11} /> {ui('投票')}
                              </Badge>
                            )}
                            {post.imageIds.length > 0 && (
                              <Badge tone="neutral">
                                <Icon name="image" size={11} /> {post.imageIds.length}
                              </Badge>
                            )}
                          </div>

                          <h2 className="forum-post-title">
                            <button type="button" onClick={() => navigate(`/forum/post/${post.id}`)}>
                              {post.title}
                            </button>
                          </h2>

                          {post.questionRef && (
                            <div className="forum-ref-inline">
                              <Icon name="book" size={13} />
                              <span>{post.questionRef.title}</span>
                            </div>
                          )}

                          <p className="forum-post-preview" onClick={() => navigate(`/forum/post/${post.id}`)}>
                            {post.bodyPreview}
                          </p>

                          <div className="forum-post-foot">
                            <span className="small muted">
                              {formatAuthorLabel(post.authorLabel)}
                              {post.isMine ? ` ${ui('（我）')}` : ''} · {formatForumTime(post.createdAt)}
                            </span>
                            <div className="forum-post-stats">
                              <button
                                type="button"
                                className="forum-pill-btn"
                                onClick={() => navigate(`/forum/post/${post.id}`)}
                              >
                                <Icon name="forum" size={13} /> {ui('{0} 則留言', [post.commentCount])}
                              </button>
                              {(post.reactions.same > 0 || post.reactions.cheer > 0 || post.reactions.useful > 0) && (
                                <span className="forum-empathy-summary">
                                  {post.reactions.same > 0 && <span>😭 {post.reactions.same}</span>}
                                  {post.reactions.cheer > 0 && <span>💪 {post.reactions.cheer}</span>}
                                  {post.reactions.useful > 0 && <span>💡 {post.reactions.useful}</span>}
                                </span>
                              )}
                              <button
                                type="button"
                                className="forum-pill-btn"
                                onClick={() => handleSharePost(post.id, post.title, post.visibility)}
                              >
                                <Icon name="share" size={13} /> {ui('分享')}
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Independent Nickname Modal */}
      {editingNickname && (
        <Modal
          title="設定討論區獨立暱稱"
          subtitle="此暱稱只用於同學討論區，不會修改你的學習工作室名字或登入帳號。"
          onClose={() => setEditingNickname(false)}
        >
          <form onSubmit={handleSaveNickname} className="stack">
            <label className="field">
              <span>{ui('論壇暱稱（2 至 20 個字元）')}</span>
              <input
                required
                minLength={2}
                maxLength={20}
                value={nicknameDraft}
                onChange={e => setNicknameDraft(e.target.value)}
                placeholder={ui('例如：DSE苦主阿明 / Chem衝星人')}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setEditingNickname(false)}>
                {ui('取消')}
              </button>
              <button type="submit" className="btn primary" disabled={savingNickname || nicknameDraft.trim().length < 2}>
                {savingNickname ? ui('儲存中…') : ui('儲存暱稱')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* New Post Composer Modal */}
      {composerOpen && (
        <Modal
          title="發起討論新帖"
          subtitle="支援 Markdown 排版、$LaTeX$ 數學公式、壓縮截圖與同行投票。"
          wide
          onClose={() => setComposerOpen(false)}
        >
          <form onSubmit={handleCreatePost} className="stack">
            <div className="grid-2">
              <label className="field">
                <span>{ui('選擇討論板塊')}</span>
                <select value={composeBoardId} onChange={e => handleBoardChangeInComposer(e.target.value)}>
                  {boards.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{ui('帖子類型標籤')}</span>
                <select value={composeFlair} onChange={e => setComposeFlair(e.target.value as ForumFlair)}>
                  {(Object.keys(FORUM_FLAIR_META) as ForumFlair[])
                    .filter(f => f !== 'official')
                    .map(f => (
                      <option key={f} value={f}>
                        {ui(FORUM_FLAIR_META[f].label)}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            {composeQuestionRef && (
              <QuestionRefCard reference={composeQuestionRef} onRemove={() => setComposeQuestionRef(undefined)} />
            )}

            <label className="field">
              <span>{ui('標題')}</span>
              <input
                required
                minLength={2}
                maxLength={120}
                value={composeTitle}
                onChange={e => setComposeTitle(e.target.value)}
                placeholder={ui('一句話講清楚你想討論、求助或吐槽嘅主題…')}
              />
            </label>

            <label className="field">
              <span>{ui('內容正文（支援 Markdown 及 $x^2$ 公式）')}</span>
              <textarea
                required
                rows={6}
                maxLength={8000}
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
                placeholder={ui('寫下你的卡關位置、溫書心得或者今日想呻嘅事…')}
              />
            </label>

            {/* Compressed Image Uploader */}
            <div className="forum-composer-tools">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={e => void handleSelectImage(e)}
              />
              <button
                type="button"
                className="btn secondary"
                disabled={uploadingImage || composeImages.length >= MAX_FORUM_IMAGES}
                onClick={() => imageInputRef.current?.click()}
              >
                <Icon name="image" size={16} />
                {uploadingImage
                  ? ui('正在壓縮並上傳…')
                  : ui('附上截圖／手寫算式 ({0}/{1})', [composeImages.length, MAX_FORUM_IMAGES])}
              </button>
              <button
                type="button"
                className={`btn ${composeHasPoll ? 'primary' : 'secondary'}`}
                onClick={() => setComposeHasPoll(v => !v)}
              >
                <Icon name="chart" size={16} /> {composeHasPoll ? ui('已啟用投票') : ui('加入同行投票')}
              </button>
              <span className="small muted">{ui('瀏覽器自動壓縮至 ≤ 200 KB，保障載入速度')}</span>
            </div>

            {composeImages.length > 0 && (
              <div className="forum-pending-images">
                {composeImages.map(img => (
                  <div key={img.id} className="forum-pending-img">
                    <img src={img.previewUrl} alt={ui('預覽圖片')} />
                    <span className="small muted">{Math.max(1, Math.round(img.byteSize / 1024))} KB</span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={ui('移除圖片')}
                      onClick={() => removePendingImage(img.id)}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Optional Poll Builder */}
            {composeHasPoll && (
              <div className="forum-poll-builder">
                <label className="field">
                  <span>{ui('投票問題（留空則沿用帖子標題）')}</span>
                  <input
                    maxLength={140}
                    value={composePollQuestion}
                    onChange={e => setComposePollQuestion(e.target.value)}
                    placeholder={ui('例如：大家覺得今年 Paper 2 邊課最伏？')}
                  />
                </label>
                <div className="stack">
                  {composePollOptions.map((opt, idx) => (
                    <div key={idx} className="row">
                      <input
                        required
                        maxLength={80}
                        value={opt}
                        onChange={e =>
                          setComposePollOptions(prev => prev.map((x, i) => (i === idx ? e.target.value : x)))
                        }
                        placeholder={ui('選項 {0}', [idx + 1])}
                      />
                      {composePollOptions.length > 2 && (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={ui('移除選項')}
                          onClick={() => setComposePollOptions(prev => prev.filter((_, i) => i !== idx))}
                        >
                          <Icon name="x" size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                  {composePollOptions.length < 6 && (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setComposePollOptions(prev => [...prev, ''])}
                    >
                      <Icon name="plus" size={14} /> {ui('新增投票選項（最多 6 項）')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Privacy & Anonymity Toggles */}
            <div className="forum-privacy-box">
              <label className="forum-check">
                <input type="checkbox" checked={composeAnon} onChange={e => setComposeAnon(e.target.checked)} />
                <span>{ui('匿名發布（公開顯示為「匿名同學」，你在帖內匿名回覆會標示為「匿名樓主」）')}</span>
              </label>
              <label className="forum-check">
                <input
                  type="checkbox"
                  checked={composeMembersOnly}
                  onChange={e => setComposeMembersOnly(e.target.checked)}
                />
                <span>{ui('僅登入同學可見（外部訪客或 WhatsApp 預覽不會顯示正文與附圖，適合樹洞傾訴）')}</span>
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setComposerOpen(false)}>
                {ui('取消')}
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={submittingPost || uploadingImage || composeTitle.trim().length < 2 || !composeBody.trim()}
              >
                {submittingPost ? ui('發布中…') : ui('發布討論帖')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Post Modal */}
      {editingPost && detail && !detail.restricted && (
        <Modal title="編輯討論帖" onClose={() => setEditingPost(false)} wide>
          <form onSubmit={handleSaveEdit} className="stack">
            <label className="field">
              <span>{ui('標題')}</span>
              <input
                required
                minLength={2}
                maxLength={120}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
              />
            </label>
            <label className="field">
              <span>{ui('內容正文')}</span>
              <textarea
                required
                rows={6}
                maxLength={8000}
                value={editBody}
                onChange={e => setEditBody(e.target.value)}
              />
            </label>
            <label className="forum-check">
              <input
                type="checkbox"
                checked={editVisibility === 'members'}
                onChange={e => setEditVisibility(e.target.checked ? 'members' : 'public')}
              />
              <span>{ui('僅登入同學可見')}</span>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setEditingPost(false)}>
                {ui('取消')}
              </button>
              <button type="submit" className="btn primary" disabled={savingEdit}>
                {savingEdit ? ui('儲存中…') : ui('儲存修改')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Report Modal */}
      {reportTarget && (
        <Modal
          title="舉報不當內容"
          subtitle="為保護同學討論氣氛，累計滿 3 位同學舉報的內容會先自動摺疊，再由版務復核。"
          onClose={() => setReportTarget(null)}
        >
          <form onSubmit={handleSubmitReport} className="stack">
            <label className="field">
              <span>{ui('舉報原因')}</span>
              <select value={reportReason} onChange={e => setReportReason(e.target.value as ForumReportReason)}>
                {(Object.keys(FORUM_REPORT_REASON_LABELS) as ForumReportReason[]).map(r => (
                  <option key={r} value={r}>
                    {ui(FORUM_REPORT_REASON_LABELS[r])}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{ui('補充說明（選填）')}</span>
              <textarea
                rows={3}
                maxLength={400}
                value={reportDetails}
                onChange={e => setReportDetails(e.target.value)}
                placeholder={ui('簡述具體情況，協助版務判斷…')}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setReportTarget(null)}>
                {ui('取消')}
              </button>
              <button type="submit" className="btn danger" disabled={submittingReport}>
                {submittingReport ? ui('提交中…') : ui('提交舉報')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <Confirm
          title={confirmDelete.kind === 'post' ? '確定刪除此討論帖？' : '確定刪除此則回覆？'}
          description={ui('刪除後將無法復原。')}
          onConfirm={() => void handleConfirmDelete()}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {/* Image Lightbox */}
      {lightboxImageId && (
        <Modal title="查看附圖" wide onClose={() => setLightboxImageId(null)}>
          <div className="forum-lightbox">
            <img src={`/api/v1/forum/images/${lightboxImageId}`} alt={ui('討論帖附圖')} />
          </div>
        </Modal>
      )}
    </div>
  );
}
