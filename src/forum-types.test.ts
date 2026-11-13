import { describe, expect, it } from 'vitest';
import { catalog } from './data/catalog';
import {
  boardForSubject,
  buildCommentTree,
  buildForumBoards,
  buildForumTutorPrompt,
  hasDistressSignal,
  isValidBoardId,
} from './forum-types';
import type { ForumCommentView } from './forum-types';

describe('forum domain helpers', () => {
  it('pins selected Category A subjects first and keeps official general boards', () => {
    const boards = buildForumBoards(catalog.subjects, ['chem', 'maths']);
    expect(boards[0].id).toBe('lounge');
    expect(boards[0].defaultMembersOnly).toBe(true);
    expect(boards[1].id).toBe('jupas');

    const pinned = boards.filter(b => b.group === 'pinned-subject').map(b => b.id);
    expect(pinned).toEqual(['sub-maths', 'sub-chem']);
    expect(boards.at(-1)?.id).toBe('applied-other');
    expect(isValidBoardId('sub-chem', catalog.subjects)).toBe(true);
    expect(isValidBoardId('sub-unknown', catalog.subjects)).toBe(false);
    expect(boardForSubject('maths', catalog.subjects)).toBe('sub-maths');
  });

  it('builds nested Reddit comment trees with visualDepth capped at 2 and @replyToLabel on deeper levels', () => {
    const base: Omit<ForumCommentView, 'id' | 'parentId' | 'authorLabel' | 'upvotes' | 'createdAt'> = {
      postId: 'p1',
      isAnonymous: false,
      isOfficial: false,
      isOp: false,
      anonIndex: null,
      isMine: false,
      body: 'hello',
      status: 'active',
      myUpvoted: false,
      distressSupport: false,
      updatedAt: '2026-11-12T10:00:00.000Z',
    };
    const comments: ForumCommentView[] = [
      { ...base, id: 'c1', parentId: null, authorLabel: '同學 A', upvotes: 2, createdAt: '2026-11-12T10:00:00.000Z' },
      { ...base, id: 'c2', parentId: 'c1', authorLabel: '同學 B', upvotes: 5, createdAt: '2026-11-12T10:01:00.000Z' },
      { ...base, id: 'c3', parentId: 'c2', authorLabel: '同學 C', upvotes: 1, createdAt: '2026-11-12T10:02:00.000Z' },
      { ...base, id: 'c4', parentId: 'c3', authorLabel: '同學 D', upvotes: 1, createdAt: '2026-11-12T10:03:00.000Z' },
    ];
    const tree = buildCommentTree(comments, 'hot');
    expect(tree).toHaveLength(1);
    const n1 = tree[0];
    const n2 = n1.children[0];
    const n3 = n2.children[0];
    const n4 = n3.children[0];

    expect([n1.visualDepth, n2.visualDepth, n3.visualDepth, n4.visualDepth]).toEqual([0, 1, 2, 2]);
    expect(n3.replyToLabel).toBeUndefined();
    expect(n4.replyToLabel).toBe('同學 C');
  });

  it('detects crisis distress phrases without flagging normal exam vents', () => {
    expect(hasDistressSignal('溫書溫到好眼瞓，聽日仲要測 Chem')).toBe(false);
    expect(hasDistressSignal('真係頂唔順，覺得唔想做人')).toBe(true);
    expect(hasDistressSignal('sometimes I want to end my life')).toBe(true);
  });

  it('formats a clean tutor prompt from a forum post and question reference', () => {
    const prompt = buildForumTutorPrompt({
      title: '判別式幾時包等號？',
      body: '題目講有實根但無講相異。',
      questionRef: {
        sourceKind: 'wrong',
        subjectId: 'maths',
        title: '二次方程',
        promptExcerpt: '若 kx^2 - 4x + 2 = 0 有實根，求 k 的範圍。',
      },
    });
    expect(prompt).toContain('判別式幾時包等號？');
    expect(prompt).toContain('kx^2 - 4x + 2 = 0');
    expect(prompt).toContain('拆解第一步');
  });
});
