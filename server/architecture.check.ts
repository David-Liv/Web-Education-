import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EDITABLE_PROFILE_FIELDS } from '../src/profile-update.ts';
import { parseAiFeedback } from './quiz-contract.ts';

const serverDir = path.resolve('server');
const srcDir = path.resolve('src');
const serverImplFiles = () => fs.readdirSync(serverDir).filter(f => f.endsWith('.ts') && !f.endsWith('.check.ts'));

function walkSrcImplFiles(dir = srcDir, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSrcImplFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      const rel = path.relative(srcDir, full).replace(/\\/g, '/');
      if (!rel.startsWith('api/mock')) acc.push(rel);
    }
  }
  return acc.sort();
}

interface RatchetOptions {
  name: string;
  files: string[];
  countInFile: (content: string, rel: string) => number;
  baseline: Record<string, number>;
  exempt?: (rel: string) => boolean;
  defaultMax?: number;
  strictTighten?: boolean;
  remediation: string;
}

function assertRatchet({
  name,
  files,
  countInFile,
  baseline,
  exempt,
  defaultMax = 0,
  strictTighten = true,
  remediation,
}: RatchetOptions) {
  const issues: string[] = [];
  const seen = new Set<string>();

  for (const rel of files) {
    seen.add(rel);
    if (exempt?.(rel)) continue;
    const content = fs.readFileSync(path.join(srcDir, rel), 'utf8');
    const actual = countInFile(content, rel);
    const hasLegacyCap = Object.prototype.hasOwnProperty.call(baseline, rel);
    const allowed = hasLegacyCap ? baseline[rel] : defaultMax;

    if (actual > allowed) {
      if (hasLegacyCap) {
        issues.push(
          `[老债膨胀] src/${rel}: 当前 ${actual} > 基线 ${allowed}。\n  修复指引: ${remediation}\n  严禁调高 ${name} 中的基线数字，请将新增逻辑移入合规适配层。`
        );
      } else {
        issues.push(
          `[新增越界] src/${rel}: 当前 ${actual} > 新文件上限 ${defaultMax}。\n  修复指引: ${remediation}\n  严禁将新文件塞进 ${name} 豁免表。`
        );
      }
    } else if (strictTighten && hasLegacyCap && actual < allowed) {
      const nextHint = actual <= defaultMax ? `删除 '${rel}' 条目` : `将 '${rel}' 调低为 ${actual}`;
      issues.push(
        `[棘轮可收紧] src/${rel} 已从基线 ${allowed} 降到 ${actual}！请在 server/architecture.check.ts 的 ${name} 中${nextHint}，永久锁住还债成果。`
      );
    }
  }

  for (const rel of Object.keys(baseline)) {
    if (!seen.has(rel)) {
      issues.push(`[棘轮可清理] ${name} 中的 src/${rel} 已不存在，请移除该旧基线条目。`);
    }
  }

  assert.deepEqual(issues, [], `${name} 架构护栏未通过：\n\n${issues.join('\n\n')}`);
}

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
    { prefix: 'stt-service:', owner: 'stt-service.ts' },
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

  const pureDomainFiles = ['domain.ts', 'pilot-rules.ts', 'admissions.ts', 'chat-content.ts', 'chat-math.ts', 'forum-types.ts', 'calculator-types.ts', 'calculator-engine.ts', 'calculator-programs.ts', 'calculator-machine.ts'];
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

test('Harness 护栏 5（跨端核心纯净）：src/*.ts 非 UI 模块默认严禁依赖 DOM / React / fetch，确保未来可直接复用到桌面端与手机端', () => {
  const LEGACY_BROWSER_TS_MODULES = new Set([
    'mascot-events.ts',
    'media.ts',
    'useCalendarDrag.ts',
  ]);
  const topLevelTs = fs
    .readdirSync(srcDir)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .sort();
  const browserPattern = /\b(?:window|document|navigator|localStorage|sessionStorage|indexedDB)\b|\bfetch\s*\(|from\s+['"](?:react|react-dom|react-router-dom)\b/;
  const violations: string[] = [];

  for (const file of topLevelTs) {
    const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
    const usesBrowser = browserPattern.test(content);
    if (LEGACY_BROWSER_TS_MODULES.has(file)) {
      if (!usesBrowser) {
        violations.push(
          `[棘轮可收紧] src/${file} 已不再依赖浏览器 API，请将它从 LEGACY_BROWSER_TS_MODULES 中移除！`
        );
      }
      continue;
    }
    if (usesBrowser) {
      violations.push(
        `[跨端纯净破坏] src/${file} 引入了浏览器/React 依赖。纯领域逻辑/状态机/引擎模块必须保持零 DOM、零 React 以便未来复用至桌面端与手机端；浏览器适配代码请放到 src/platform/ 或 .tsx 适配层。`
      );
    }
    if (/from\s+['"]\.\.?\/server\//.test(content) || /from\s+['"]\.\/pages\//.test(content)) {
      violations.push(
        `[依赖方向越界] src/${file} 反向依赖了 server/ 或 src/pages/，请提取纯共享契约模块。`
      );
    }
  }

  for (const file of LEGACY_BROWSER_TS_MODULES) {
    if (!topLevelTs.includes(file)) {
      violations.push(`[棘轮可清理] LEGACY_BROWSER_TS_MODULES 中的 src/${file} 已不存在，请移除。`);
    }
  }

  assert.deepEqual(violations, [], `跨端核心纯净护栏未通过：\n\n${violations.join('\n\n')}`);
});

test('Harness 护栏 6（跨端网络统一入口）：禁止在 src/api/client.ts 之外新增裸 fetch() 或硬编码 /api/v1 路径', () => {
  const files = walkSrcImplFiles();
  const isNetworkGateway = (rel: string) => rel === 'api/client.ts' || rel.startsWith('platform/');

  assertRatchet({
    name: 'LEGACY_RAW_FETCH_RATCHET',
    files,
    exempt: isNetworkGateway,
    countInFile: content => (content.match(/\bfetch\s*\(/g) ?? []).length,
    baseline: {
      'media.ts': 2,
      'pages/MathsIndex.tsx': 1,
    },
    remediation:
      '桌面/手机打包后前端与后端不同源，且需要统一鉴权头（未来 Bearer Token）与错误拦截。请通过 src/api/client.ts 的 api() 或未来 src/platform/ 网络适配器发起请求，禁止在页面/业务模块直接写 fetch()。',
  });

  assertRatchet({
    name: 'LEGACY_RAW_API_PATH_RATCHET',
    files,
    exempt: isNetworkGateway,
    countInFile: content => (content.match(/['"`]\/api\/v1\b/g) ?? []).length,
    baseline: {
      'TutorControls.tsx': 1,
      'media.ts': 2,
      'pages/Billing.tsx': 4,
      'pages/Developer.tsx': 1,
      'pages/Forum.tsx': 2,
      'pages/Studio.tsx': 1,
      'pages/UserGuide.tsx': 1,
    },
    remediation:
      '硬编码相对路径 "/api/v1/..." 在 Tauri/Electron/Capacitor 本地静态壳内会直接 404 且丢失凭证。请统一经由 src/api/client.ts 拼接 VITE_API_BASE_URL 或使用统一文件下载适配器。',
  });
});

test('Harness 护栏 7（跨端存储棘轮）：锁定浏览器 localStorage / sessionStorage / indexedDB 存量债务，禁止蔓延到新文件', () => {
  const files = walkSrcImplFiles();

  assertRatchet({
    name: 'LEGACY_STORAGE_RATCHET',
    files,
    exempt: rel => rel.startsWith('platform/'),
    countInFile: content => (content.match(/\b(?:localStorage|sessionStorage|indexedDB)\b/g) ?? []).length,
    baseline: {
      'Login.tsx': 2,
      'api/client.ts': 6,
      'calculator.tsx': 3,
      'focus.tsx': 12,
      'i18n.tsx': 3,
      'mascot-events.ts': 4,
      'media.ts': 1,
      'pages/GoalSettings.tsx': 3,
      'pages/Pilot.tsx': 2,
      'pages/PilotQuiz.tsx': 3,
      'pages/Quiz.tsx': 3,
      'pages/Studio.tsx': 3,
      'state.tsx': 3,
    },
    remediation:
      '原生桌面端/手机端需接入 Keychain / SecureStore / SQLite 等平台存储，不能直接散落调用浏览器 localStorage/sessionStorage/indexedDB。请改用 src/platform/storage.ts 的 persistentStorage / sessionStore。',
  });
});

test('Harness 护栏 8（防 AI 屎山棘轮）：限制 useEffect 蔓延与 500 行以上巨无霸单文件', () => {
  const files = walkSrcImplFiles();

  assertRatchet({
    name: 'LEGACY_USE_EFFECT_RATCHET',
    files,
    exempt: rel => rel.startsWith('platform/'),
    defaultMax: 2,
    countInFile: content => (content.match(/\buseEffect\s*\(/g) ?? []).length,
    baseline: {
      'App.tsx': 3,
      'MascotPet.tsx': 10,
      'calculator.tsx': 5,
      'components.tsx': 3,
      'focus.tsx': 14,
      'pages/Forum.tsx': 5,
      'pages/Learn.tsx': 5,
      'pages/Pilot.tsx': 3,
      'pages/PilotQuiz.tsx': 3,
      'pages/Quiz.tsx': 6,
      'pages/Studio.tsx': 4,
    },
    remediation:
      '过多 useEffect 是 AI 生成竞态 Bug 与死循环的高发区（Lauren Tan 原则：把副作用封装进底层 hook/适配器，业务页面只做声明式渲染）。新组件最多允许 2 个 useEffect，复杂副作用请封装成专用 hook 或纯状态机。',
  });

  assertRatchet({
    name: 'LEGACY_FILE_LINE_CEILING',
    files,
    exempt: rel => rel.startsWith('data/'),
    defaultMax: 500,
    strictTighten: false,
    countInFile: content => content.split(/\r?\n/).length,
    baseline: {
      'MascotPet.tsx': 800,
      'StarBean.tsx': 900,
      'TopicGuidedCourse.tsx': 950,
      'calculator-engine.ts': 1400,
      'calculator-machine.ts': 1850,
      'calculator-programs.ts': 800,
      'calculator.tsx': 1400,
      'factorisation-check.ts': 700,
      'focus.tsx': 1350,
      'mascot-events.ts': 550,
      'pages/Forum.tsx': 2100,
    },
    remediation:
      '单个前端文件超过 500 行会导致 AI 上下文稀释与职责混杂。请按“纯核心状态机 (.ts) + 平台适配层 (src/platform/) + 视图组件 (.tsx)”拆分为深模块。',
  });
});
