import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EDITABLE_PROFILE_FIELDS } from '../src/profile-update.ts';
import { parseAiFeedback } from './quiz-contract.ts';

const serverDir = path.resolve('server');
const srcDir = path.resolve('src');
const serverImplFiles = () => fs.readdirSync(serverDir).filter(f => f.endsWith('.ts') && !f.endsWith('.check.ts'));

test('Harness 护栏 1：studio.attempts 状态读写必须收敛在唯一 State Owner (practice-state.ts / studio-state.ts)', () => {
  const allowedOwners = new Set(['practice-state.ts', 'studio-state.ts']);
  const violations: string[] = [];
  for (const file of serverImplFiles()) {
    if (allowedOwners.has(file)) continue;
    const content = fs.readFileSync(path.join(serverDir, file), 'utf8');
    if (/\b(?:studio\??|s)\.attempts\b/.test(content)) violations.push(file);
  }
  assert.deepEqual(
    violations,
    [],
    `以下模块越界直接操作了 .attempts，请通过 practice-state.ts 或 studio-state.ts 的深模块接口访问: ${violations.join(', ')}`
  );
});

test('Harness 护栏 2：加密 settings 表私有前缀必须由专属 Owner 封装，禁止跨模块硬编码查询', () => {
  const rules = [
    { prefix: 'chat-review:', owner: 'chat-service.ts' },
    { prefix: 'chat-review-operation:', owner: 'chat-service.ts' },
    { prefix: 'tutor-document:', owner: 'tutor-documents.ts' },
    { prefix: 'auth-mail:', owner: 'auth-mail.ts' },
    { prefix: 'forum:', owner: 'forum.ts' },
  ];
  const violations: string[] = [];
  for (const file of serverImplFiles()) {
    const content = fs.readFileSync(path.join(serverDir, file), 'utf8');
    for (const rule of rules) {
      if (file !== rule.owner && content.includes(rule.prefix)) {
        violations.push(`${file} 越界硬编码了 ${rule.prefix}（应由 ${rule.owner} 封装）`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('Harness 护栏 3：AI 评分反馈契约 (StudyFeedback) 必须统一通过 quiz-contract.ts 的 parseAiFeedback 校验', () => {
  for (const file of ['studio.ts', 'practice-routes.ts']) {
    const content = fs.readFileSync(path.join(serverDir, file), 'utf8');
    assert.match(content, /\bparseAiFeedback\b/, `${file} 必须调用统一的 parseAiFeedback 契约解析函数`);
  }
  assert.equal(parseAiFeedback({ verdict: 'correct', score: 90, text: 'Good work', reason: 'Matched' })?.source, 'ai');
  assert.equal(parseAiFeedback({ verdict: 'uncertain', score: 90, text: 'Mismatch', reason: 'Bad invariant' }), null);
  assert.equal(parseAiFeedback({ verdict: 'correct', score: null, text: 'Mismatch', reason: 'Bad invariant' }), null);
});

test('Harness 护栏 4：前后端共享 EDITABLE_PROFILE_FIELDS 契约，且纯领域模块不反向依赖服务端或 UI 组件', () => {
  const appContent = fs.readFileSync(path.join(serverDir, 'app.ts'), 'utf8');
  assert.match(appContent, /\bEDITABLE_PROFILE_FIELDS\b/, 'server/app.ts 必须使用共享的 EDITABLE_PROFILE_FIELDS 契约');
  assert.equal(EDITABLE_PROFILE_FIELDS.includes('name'), true);
  assert.equal((EDITABLE_PROFILE_FIELDS as readonly string[]).includes('date'), false);

  const pureDomainFiles = ['domain.ts', 'pilot-rules.ts', 'admissions.ts', 'chat-content.ts', 'chat-math.ts', 'forum-types.ts'];
  for (const file of pureDomainFiles) {
    const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
    assert.doesNotMatch(content, /from\s+['"]\.\.?\/server\//, `${file} 严禁反向 import server 模块`);
    assert.doesNotMatch(content, /from\s+['"]\.\/pages\//, `${file} 严禁反向 import UI 页面组件`);
  }

  const pageFiles = fs.readdirSync(path.join(srcDir, 'pages')).filter(f => f.endsWith('.tsx'));
  for (const file of pageFiles) {
    const lines = fs.readFileSync(path.join(srcDir, 'pages', file), 'utf8').trim().split(/\r?\n/);
    const onlyReExports = lines.every(l => /^export\s+\{.*\}\s+from\s+/.test(l.trim()));
    assert.equal(onlyReExports, false, `src/pages/${file} 是纯透传浅模块 (Pass-through)，请直接从真实模块导出`);
  }
});
