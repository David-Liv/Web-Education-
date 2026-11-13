import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Store } from './store.ts';
import type { ForumService } from './forum.ts';
import type { Identity } from '../src/pilot-types.ts';
import { catalog } from '../src/data/catalog.ts';
import { buildForumBoards } from '../src/forum-types.ts';
import type { ForumReactionKind, ForumSort } from '../src/forum-types.ts';

function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function injectForumOpenGraph(html: string, meta: { title: string; description: string }): string {
  const tags = [
    `<meta property="og:site_name" content="學序 HOKSE">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${escapeHtmlAttr(meta.title)}">`,
    `<meta property="og:description" content="${escapeHtmlAttr(meta.description)}">`,
  ].join('');
  if (html.includes('</head>')) return html.replace('</head>', `${tags}</head>`);
  return html;
}

function requireAuth(identity: Identity | null): Identity {
  if (!identity) {
    throw Object.assign(new Error('請先登入學序帳戶以參與討論'), { status: 401, code: 'UNAUTHENTICATED' });
  }
  return identity;
}

export async function handleForumRoutes(
  store: Store,
  forumService: ForumService,
  identity: Identity | null,
  path: string,
  method: string,
  input: Record<string, any>,
  searchParams: URLSearchParams,
  req: IncomingMessage,
  res: ServerResponse,
  bodyLimit: (req: IncomingMessage, max?: number) => Promise<Buffer>,
  send: (data: unknown, status?: number) => void,
): Promise<boolean> {
  if (path !== '/forum' && !path.startsWith('/forum/')) return false;

  if (path === '/forum/boards' && method === 'GET') {
    let selectedSubjects: string[] = [];
    if (identity) {
      try {
        const state = await store.state(identity.id);
        selectedSubjects = state.profile.subjects ?? [];
      } catch {
        selectedSubjects = [];
      }
    }
    const profile = identity ? await forumService.getProfile(identity) : null;
    send({ boards: buildForumBoards(catalog.subjects, selectedSubjects), profile });
    return true;
  }

  if (path === '/forum/profile' && method === 'PUT') {
    const user = requireAuth(identity);
    send(await forumService.updateNickname(user, String(input.nickname ?? '')));
    return true;
  }

  if (path === '/forum/posts' && method === 'GET') {
    const posts = await forumService.listPosts(identity, {
      boardId: searchParams.get('boardId') ?? undefined,
      flair: searchParams.get('flair') ?? undefined,
      sort: (searchParams.get('sort') as ForumSort | null) ?? 'hot',
      q: searchParams.get('q') ?? undefined,
    });
    send({ posts });
    return true;
  }

  if (path === '/forum/posts' && method === 'POST') {
    const user = requireAuth(identity);
    send(await forumService.createPost(user, input), 201);
    return true;
  }

  const imageMatch = path.match(/^\/forum\/images\/([^/]+)$/);
  if (imageMatch && method === 'GET') {
    const img = await forumService.readImage(identity, imageMatch[1]);
    res.writeHead(200, {
      'Content-Type': img.mimeType,
      'Content-Length': String(img.data.length),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'Cache-Control': img.isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store',
    });
    res.end(img.data);
    return true;
  }

  if (path === '/forum/images' && method === 'POST') {
    const user = requireAuth(identity);
    const bytes = await bodyLimit(req, 240 * 1024);
    send(await forumService.uploadImage(user, bytes), 201);
    return true;
  }

  const postCommentsMatch = path.match(/^\/forum\/posts\/([^/]+)\/comments$/);
  if (postCommentsMatch && method === 'POST') {
    const user = requireAuth(identity);
    send(await forumService.createComment(user, postCommentsMatch[1], input), 201);
    return true;
  }

  const pollVoteMatch = path.match(/^\/forum\/posts\/([^/]+)\/poll-vote$/);
  if (pollVoteMatch && method === 'POST') {
    const user = requireAuth(identity);
    send(await forumService.votePoll(user, pollVoteMatch[1], String(input.optionId ?? '')));
    return true;
  }

  const postMatch = path.match(/^\/forum\/posts\/([^/]+)$/);
  if (postMatch) {
    const postId = postMatch[1];
    if (method === 'GET') {
      send(await forumService.getPost(identity, postId));
      return true;
    }
    if (method === 'PATCH') {
      const user = requireAuth(identity);
      send(await forumService.updatePost(user, postId, input));
      return true;
    }
    if (method === 'DELETE') {
      const user = requireAuth(identity);
      send(await forumService.deletePost(user, postId));
      return true;
    }
  }

  const commentMatch = path.match(/^\/forum\/comments\/([^/]+)$/);
  if (commentMatch && method === 'DELETE') {
    const user = requireAuth(identity);
    send(await forumService.deleteComment(user, commentMatch[1]));
    return true;
  }

  if (path === '/forum/reactions' && method === 'POST') {
    const user = requireAuth(identity);
    const targetType = input.targetType === 'comment' ? 'comment' : 'post';
    send(await forumService.toggleReaction(user, targetType, String(input.targetId ?? ''), String(input.kind ?? 'upvote') as ForumReactionKind));
    return true;
  }

  if (path === '/forum/reports' && method === 'POST') {
    const user = requireAuth(identity);
    send(await forumService.reportTarget(user, input));
    return true;
  }

  if (path === '/forum/notifications' && method === 'GET') {
    if (!identity) {
      send({ unreadCount: 0, items: [] });
      return true;
    }
    send(await forumService.listNotifications(identity));
    return true;
  }

  if (path === '/forum/notifications/read' && method === 'POST') {
    const user = requireAuth(identity);
    send(await forumService.markNotificationsRead(user));
    return true;
  }

  if (path === '/forum/moderation' && method === 'GET') {
    const user = requireAuth(identity);
    send({ items: await forumService.listModerationQueue(user) });
    return true;
  }

  if (path === '/forum/moderation' && method === 'POST') {
    const user = requireAuth(identity);
    send(await forumService.moderate(user, input));
    return true;
  }

  throw Object.assign(new Error('找不到此討論區接口'), { status: 404, code: 'NOT_FOUND' });
}
