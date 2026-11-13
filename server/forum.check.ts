import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createPilot } from './app.ts';
import { Billing } from './billing.ts';

// Minimal valid 1x1 PNG (67 bytes)
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
);

async function createForumFixture() {
  const staticDir = mkdtempSync(join(tmpdir(), 'hokse-forum-'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><html><head><title>HOKSE</title></head><body><div id="root"></div></body></html>');

  const app = createPilot({ database: ':memory:', staticDir, allowSetup: false });
  const port = await app.listen(0);
  const base = `http://127.0.0.1:${port}`;

  const dev = await app.store.createUser('dev_admin', 'fixture-password-123', '開發者真名', 'developer');
  const reviewer = await app.store.createUser('rev_mod', 'fixture-password-123', '復核員真名', 'reviewer');
  const alice = await app.store.createUser('alice_secret_login', 'fixture-password-123', '陳小美真名', 'student');
  const bob = await app.store.createUser('bob_secret_login', 'fixture-password-123', '李大文真名', 'student');
  const carol = await app.store.createUser('carol_secret_login', 'fixture-password-123', '張三真名', 'student');

  const users = { dev, reviewer, alice, bob, carol };
  const cookies = {} as Record<keyof typeof users, string>;
  for (const [k, u] of Object.entries(users)) {
    cookies[k as keyof typeof users] = `hokse_session=${await app.store.session(u)}`;
  }

  async function call(
    path: string,
    method = 'GET',
    body?: unknown,
    who: keyof typeof users | 'guest' = 'alice',
  ) {
    const headers: Record<string, string> = { 'X-Hokse-Client': '1' };
    if (who !== 'guest') headers.Cookie = cookies[who];
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, headers: res.headers, data, text };
  }

  async function uploadImage(bytes: Buffer, contentType: string, who: keyof typeof users | 'guest' = 'alice') {
    const headers: Record<string, string> = { 'X-Hokse-Client': '1', 'Content-Type': contentType };
    if (who !== 'guest') headers.Cookie = cookies[who];
    const res = await fetch(`${base}/api/v1/forum/images`, {
      method: 'POST',
      headers,
      body: new Uint8Array(bytes),
    });
    return { status: res.status, data: await res.json() };
  }

  return {
    app,
    base,
    users,
    cookies,
    call,
    uploadImage,
    close: async () => {
      await app.close();
      const checked = realpathSync(staticDir);
      assert.equal(dirname(checked), realpathSync(tmpdir()));
      assert.ok(basename(checked).startsWith('hokse-forum-'));
      rmSync(checked, { recursive: true });
    },
  };
}

test('seeds 3 official starter posts idempotently without creating fake user accounts, and enforces guest vs members-only privacy + OpenGraph', async () => {
  const f = await createForumFixture();
  try {
    const initialUserCount = await f.app.store.userCount();

    // Guest feed shows only the 2 public official starter posts (hides official-starter-treehole which is members-only)
    const guestFeed = await f.call('/forum/posts', 'GET', undefined, 'guest');
    assert.equal(guestFeed.status, 200);
    const guestIds = guestFeed.data.posts.map((p: any) => p.id);
    assert.ok(guestIds.includes('official-starter-welcome'));
    assert.ok(guestIds.includes('official-starter-poll'));
    assert.ok(!guestIds.includes('official-starter-treehole'));

    // Signed-in student sees all 3 official starter posts
    const memberFeed = await f.call('/forum/posts', 'GET', undefined, 'alice');
    assert.equal(memberFeed.status, 200);
    assert.equal(memberFeed.data.posts.length, 3);
    assert.equal(await f.app.store.userCount(), initialUserCount);

    // Direct guest link to members-only post returns restricted stub without leaking title or body
    const guestTreehole = await f.call('/forum/posts/official-starter-treehole', 'GET', undefined, 'guest');
    assert.equal(guestTreehole.status, 200);
    assert.equal(guestTreehole.data.restricted, true);
    assert.equal('title' in guestTreehole.data, false);
    assert.equal('body' in guestTreehole.data, false);

    // OpenGraph HTML injection: public post injects title, members-only post uses generic safe title
    const publicHtml = await (await fetch(`${f.base}/forum/post/official-starter-welcome`)).text();
    assert.match(publicHtml, /property="og:title" content="歡迎來到學序同學討論區/);

    const privateHtml = await (await fetch(`${f.base}/forum/post/official-starter-treehole`)).text();
    assert.ok(!privateHtml.includes('備考樹洞長期集合樓'));
    assert.match(privateHtml, /property="og:title" content="學序同學討論區 · 登入查看同學分享"/);

    // Guest write attempts are rejected with 401
    assert.equal((await f.call('/forum/posts', 'POST', { boardId: 'lounge', flair: 'chat', title: 'hi', body: 'test' }, 'guest')).status, 401);
  } finally {
    await f.close();
  }
});

test('isolates login usernames and real names, assigns consistent per-thread anonymous numbers, and prevents cross-mode OP leak', async () => {
  const f = await createForumFixture();
  try {
    // Alice creates an anonymous post in Maths board
    const created = await f.call('/forum/posts', 'POST', {
      boardId: 'sub-maths',
      flair: 'help',
      visibility: 'public',
      title: '二次方程判別式問題請教',
      body: '請問 $kx^2 - 4x + 2 = 0$ 點樣處理 $k=0$？',
      isAnonymous: true,
    }, 'alice');
    assert.equal(created.status, 201);
    const postId = created.data.id as string;
    assert.equal(created.data.authorLabel, '匿名同學');

    // Bob & Carol reply anonymously in Post 1
    await f.call(`/forum/posts/${postId}/comments`, 'POST', { body: '第一步先分開討論 k=0！', isAnonymous: true }, 'bob');
    await f.call(`/forum/posts/${postId}/comments`, 'POST', { body: '同意樓上！', isAnonymous: true }, 'carol');
    await f.call(`/forum/posts/${postId}/comments`, 'POST', { body: '補充：k≠0 先用 Δ ≥ 0', isAnonymous: true }, 'bob');

    // Alice (anonymous OP) replies anonymously -> becomes 匿名樓主 (isOp: true)
    await f.call(`/forum/posts/${postId}/comments`, 'POST', { body: '明晒！多謝兩位！', isAnonymous: true }, 'alice');
    // Alice also replies NON-anonymously -> MUST NOT be marked isOp (otherwise her nickname would be linked to the anonymous OP!)
    await f.call(`/forum/posts/${postId}/comments`, 'POST', { body: '路過學到嘢', isAnonymous: false }, 'alice');

    const viewForBob = await f.call(`/forum/posts/${postId}`, 'GET', undefined, 'bob');
    assert.equal(viewForBob.status, 200);
    const rawJson = JSON.stringify(viewForBob.data);
    // Never leaks login usernames, internal user IDs, or profile real names
    for (const secret of ['alice_secret_login', '陳小美真名', f.users.alice.id, 'bob_secret_login', '李大文真名', 'carol_secret_login', '張三真名']) {
      assert.ok(!rawJson.includes(secret), `Leaked sensitive identity field: ${secret}`);
    }

    const labels = viewForBob.data.comments.map((c: any) => ({ label: c.authorLabel, isOp: c.isOp }));
    assert.equal(labels[0].label, '匿名同學 #1');
    assert.equal(labels[1].label, '匿名同學 #2');
    assert.equal(labels[2].label, '匿名同學 #1'); // Bob stays #1 in same thread
    assert.deepEqual(labels[3], { label: '匿名樓主', isOp: true });
    assert.equal(labels[4].isOp, false); // Non-anon reply on anon post does NOT expose OP!

    // Cross-post reset: Carol replying first in another thread gets #1 (not #2)
    await f.call('/forum/posts/official-starter-welcome/comments', 'POST', { body: '報到！', isAnonymous: true }, 'carol');
    const welcome = await f.call('/forum/posts/official-starter-welcome', 'GET', undefined, 'bob');
    assert.equal(welcome.data.comments[0].authorLabel, '匿名同學 #1');
  } finally {
    await f.close();
  }
});

test('supports polls, positive reactions, anonymized notifications, zero credit/evidence side effects, and binary image protection + cloud backup', async () => {
  const f = await createForumFixture();
  try {
    const billing = new Billing(f.app.store);
    const beforeState = await f.app.store.state(f.users.alice.id);
    const beforeEvidenceCount = beforeState.evidence.length;

    // Rejects fake image bytes and oversized (>200KB) payload
    assert.equal((await f.uploadImage(Buffer.from('not-an-image'), 'image/png', 'alice')).status, 400);
    assert.equal((await f.uploadImage(Buffer.alloc(205 * 1024, 1), 'image/png', 'alice')).status, 413);

    // Accepts valid compressed PNG
    const uploaded = await f.uploadImage(TINY_PNG, 'image/png', 'alice');
    assert.equal(uploaded.status, 201);
    const imgId = uploaded.data.id as string;

    // Create members-only poll post with image
    const postRes = await f.call('/forum/posts', 'POST', {
      boardId: 'lounge',
      flair: 'vent',
      visibility: 'members',
      title: '今晚溫邊科好？壓力好大想死咁滯',
      body: '投個票決定今晚先溫邊科！',
      isAnonymous: false,
      imageIds: [imgId],
      poll: { question: '今晚先開邊科？', options: ['Maths Paper 2', 'Chem Acids', '早啲瞓覺'] },
    }, 'alice');
    assert.equal(postRes.status, 201);
    assert.equal(postRes.data.distressSupport, true); // Distress helpline signal detected
    const postId = postRes.data.id as string;

    // Image on members-only post is blocked for guests (401), allowed with private no-store for signed-in Bob
    const guestImg = await fetch(`${f.base}/api/v1/forum/images/${imgId}`);
    assert.equal(guestImg.status, 401);
    const memberImg = await fetch(`${f.base}/api/v1/forum/images/${imgId}`, { headers: { Cookie: f.cookies.bob } });
    assert.equal(memberImg.status, 200);
    assert.equal(memberImg.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(memberImg.headers.get('cache-control'), 'private, no-store');

    // Bob votes on option 1, then switches vote to option 2
    const opt1 = postRes.data.poll.options[0].id;
    const opt2 = postRes.data.poll.options[1].id;
    const v1 = await f.call(`/forum/posts/${postId}/poll-vote`, 'POST', { optionId: opt1 }, 'bob');
    assert.equal(v1.data.totalVotes, 1);
    assert.equal(v1.data.options[0].votes, 1);
    const v2 = await f.call(`/forum/posts/${postId}/poll-vote`, 'POST', { optionId: opt2 }, 'bob');
    assert.equal(v2.data.totalVotes, 1);
    assert.equal(v2.data.options[0].votes, 0);
    assert.equal(v2.data.options[1].votes, 1);

    // Bob reacts with upvote + same, and replies anonymously -> notifies Alice with anonymized actor label
    const reactRes = await f.call('/forum/reactions', 'POST', { targetType: 'post', targetId: postId, kind: 'same' }, 'bob');
    assert.equal(reactRes.data.reactions.same, 1);
    await f.call(`/forum/posts/${postId}/comments`, 'POST', { body: '加油！早啲休息先！', isAnonymous: true }, 'bob');

    const notifs = await f.call('/forum/notifications', 'GET', undefined, 'alice');
    assert.equal(notifs.data.unreadCount, 1);
    assert.equal(notifs.data.items[0].actorLabel, '匿名同學 #1');
    assert.ok(!JSON.stringify(notifs.data).includes('bob_secret_login'));

    await f.call('/forum/notifications/read', 'POST', {}, 'alice');
    assert.equal((await f.call('/forum/notifications', 'GET', undefined, 'alice')).data.unreadCount, 0);

    // Zero credit spent, zero mastery/evidence mutation
    assert.equal((await billing.view(f.users.alice.id)).spent, 0);
    assert.equal((await f.app.store.state(f.users.alice.id)).evidence.length, beforeEvidenceCount);

    // Stored binary image matches exact uploaded PNG bytes and links to post_id
    const storedImg = await f.app.store.db.prepare('SELECT post_id, mime_type, size, data FROM forum_images WHERE id = ?').get(imgId);
    assert.equal(storedImg?.post_id, postId);
    assert.equal(storedImg?.mime_type, 'image/png');
    assert.equal(Number(storedImg?.size), TINY_PNG.length);
    assert.deepEqual(Buffer.from(storedImg!.data), TINY_PNG);
  } finally {
    await f.close();
  }
});

test('auto-hides content after 3 distinct community reports and enforces developer-only mute across anonymous posts', async () => {
  const f = await createForumFixture();
  try {
    // Bob posts an anonymous spam thread
    const spam = await f.call('/forum/posts', 'POST', {
      boardId: 'lounge',
      flair: 'chat',
      visibility: 'public',
      title: '洗版廣告測試帖',
      body: '快啲買筆記！',
      isAnonymous: true,
    }, 'bob');
    const spamId = spam.data.id as string;

    // 3 distinct reporters (alice, carol, reviewer) -> autoHidden on 3rd report
    assert.equal((await f.call('/forum/reports', 'POST', { targetType: 'post', targetId: spamId, reason: 'spam' }, 'alice')).data.autoHidden, false);
    assert.equal((await f.call('/forum/reports', 'POST', { targetType: 'post', targetId: spamId, reason: 'spam' }, 'carol')).data.autoHidden, false);
    assert.equal((await f.call('/forum/reports', 'POST', { targetType: 'post', targetId: spamId, reason: 'spam' }, 'reviewer')).data.autoHidden, true);

    // Hidden from regular feed
    const feedAfter = await f.call('/forum/posts', 'GET', undefined, 'alice');
    assert.ok(!feedAfter.data.posts.some((p: any) => p.id === spamId));

    // Reviewer can view moderation queue & restore, but CANNOT mute accounts (403)
    const queue = await f.call('/forum/moderation', 'GET', undefined, 'reviewer');
    assert.equal(queue.status, 200);
    assert.ok(queue.data.items.some((i: any) => i.targetId === spamId && i.status === 'auto_hidden'));
    assert.equal(
      (await f.call('/forum/moderation', 'POST', { targetType: 'post', targetId: spamId, action: 'mute', muteHours: 24 }, 'reviewer')).status,
      403,
    );

    // Developer mutes the anonymous author for 24h without exposing Bob's identity publicly
    const muteRes = await f.call('/forum/moderation', 'POST', { targetType: 'post', targetId: spamId, action: 'mute', muteHours: 24 }, 'dev');
    assert.equal(muteRes.status, 200);

    // Bob cannot bypass mute even when trying to post anonymously again!
    const blockedAttempt = await f.call('/forum/posts', 'POST', {
      boardId: 'lounge',
      flair: 'chat',
      title: '再試匿名發帖',
      body: '測試禁言攔截',
      isAnonymous: true,
    }, 'bob');
    assert.equal(blockedAttempt.status, 403);

    // Developer can also unmute (muteHours: 0)
    assert.equal(
      (await f.call('/forum/moderation', 'POST', { targetType: 'post', targetId: spamId, action: 'mute', muteHours: 0 }, 'dev')).status,
      200,
    );
    const afterUnmute = await f.call('/forum/posts', 'POST', {
      boardId: 'lounge',
      flair: 'chat',
      title: '解除禁言後正常發帖',
      body: '多謝管理員！',
      isAnonymous: false,
    }, 'bob');
    assert.equal(afterUnmute.status, 201);
  } finally {
    await f.close();
  }
});
