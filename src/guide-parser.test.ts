import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildFilteredGuideMarkdown,
  extractCircledMarker,
  isGuideSectionUnlocked,
  parseGuideMarkdown,
  resolveEffectiveGuidePlan,
} from './guide-parser';

const SAMPLE_GUIDE = `# 學序使用指南

v1.10.6 · 2026年11月28日

## 1. 第一次使用
<!-- guide: {"id":"getting-started","group":"free","plan":"Free"} -->

三步完成帳號準備。

### 步驟 1：登入與選科
![登入畫面](/guide/zh/01-login.webp)
- **①** 輸入帳號或驗證電郵。
- **②** 選好科目後進入總覽。

### 步驟 2：側邊欄導覽
![側邊欄](/guide/zh/01-nav.webp)
- **③** 點頂部圖標可收起側邊欄。

## 8. 數學 By Topic 索引
<!-- guide: {"id":"maths-index","group":"plus","plan":"Plus","feature":"maths-index","teaser":"快速按知識點與年份篩選 580+ 題。"} -->

按課題與年份快速找題。

### 步驟 1：篩選題目
![數學索引](/guide/zh/08-maths.webp)
- **①** 選擇知識點與年份。

## 11. 弱項診斷與即時進度
<!-- guide: {"id":"weak-spot-progress","group":"pro","plan":"Pro","feature":"weak-spot-report","teaser":"自動偵測反覆失分技能。"} -->

即時掌握學習進度與弱項。
`;

describe('guide-parser', () => {
  it('parses metadata, groups, and carousel slides from canonical markdown', () => {
    const parsed = parseGuideMarkdown(SAMPLE_GUIDE);
    expect(parsed.title).toBe('學序使用指南');
    expect(parsed.hasGroups).toBe(true);
    expect(parsed.sections).toHaveLength(3);

    const first = parsed.sections[0];
    expect(first.id).toBe('getting-started');
    expect(first.meta.plan).toBe('Free');
    expect(first.lead).toBe('三步完成帳號準備。');
    expect(first.slides).toHaveLength(2);
    expect(first.slides[0].src).toBe('/guide/zh/01-login.webp');
    expect(first.slides[1].title).toBe('步驟 2：側邊欄導覽');

    const plus = parsed.sections[1];
    expect(plus.id).toBe('maths-index');
    expect(plus.meta.group).toBe('plus');
    expect(plus.meta.plan).toBe('Plus');
    expect(plus.meta.feature).toBe('maths-index');
    expect(plus.meta.teaser).toContain('580+');
  });

  it('unlocks sections accurately for Free, Plus, Pro, developer preview, and demo mode', () => {
    const parsed = parseGuideMarkdown(SAMPLE_GUIDE);
    const unlockedFor = (opts: Parameters<typeof resolveEffectiveGuidePlan>[0]) => {
      const access = resolveEffectiveGuidePlan(opts);
      return parsed.sections.filter(s => isGuideSectionUnlocked(s, access)).map(s => s.id);
    };

    expect(unlockedFor({ realMode: true, plan: 'Free', role: 'student' })).toEqual(['getting-started']);
    expect(unlockedFor({ realMode: true, plan: 'Plus', role: 'student' })).toEqual(['getting-started', 'maths-index']);
    expect(unlockedFor({ realMode: true, plan: 'Pro', role: 'student' })).toEqual(['getting-started', 'maths-index', 'weak-spot-progress']);

    // Developer sees everything by default, and can preview Free/Plus accurately.
    expect(unlockedFor({ realMode: true, plan: 'Free', role: 'developer' })).toEqual(['getting-started', 'maths-index', 'weak-spot-progress']);
    expect(unlockedFor({ realMode: true, plan: 'Free', role: 'developer', previewPlan: 'Free' })).toEqual(['getting-started']);
    expect(unlockedFor({ realMode: true, plan: 'Free', role: 'developer', previewPlan: 'Plus' })).toEqual(['getting-started', 'maths-index']);

    // Demo mode unlocks everything.
    expect(unlockedFor({ realMode: false })).toEqual(['getting-started', 'maths-index', 'weak-spot-progress']);
  });

  it('builds filtered markdown exports without hidden metadata comments or locked sections', () => {
    const parsed = parseGuideMarkdown(SAMPLE_GUIDE);
    const md = buildFilteredGuideMarkdown(parsed, new Set(['getting-started']));
    expect(md).toContain('# 學序使用指南');
    expect(md).toContain('## 1. 第一次使用');
    expect(md).not.toContain('<!-- guide:');
    expect(md).not.toContain('## 8. 數學 By Topic 索引');
    expect(md).not.toContain('## 11. 弱項診斷與即時進度');
  });

  it('keeps plain guides without metadata (such as AdminGuide) backwards compatible', () => {
    const parsed = parseGuideMarkdown('# Admin Guide\n\nIntro line\n\n## 1. Accounts\n\nManage invites.');
    expect(parsed.hasGroups).toBe(false);
    expect(parsed.sections[0].id).toBe('guide-1');
    expect(parsed.sections[0].slides).toHaveLength(0);
    expect(parsed.sections[0].lead).toBe('Manage invites.');
  });

  it('extracts circled step numbers cleanly', () => {
    expect(extractCircledMarker('**①** 點選課題')).toEqual({ num: 1, rest: '點選課題' });
    expect(extractCircledMarker('③ 檢視解答')).toEqual({ num: 3, rest: '檢視解答' });
    expect(extractCircledMarker('普通說明')).toBeNull();
  });

  it('keeps canonical ZH and EN user guides aligned with existing visual assets', () => {
    const zh = parseGuideMarkdown(fs.readFileSync(path.resolve('docs/user-guide.md'), 'utf8'));
    const en = parseGuideMarkdown(fs.readFileSync(path.resolve('docs/user-guide.en.md'), 'utf8'));

    expect(zh.sections).toHaveLength(15);
    expect(en.sections).toHaveLength(15);
    expect(zh.sections.map(s => s.id)).toEqual(en.sections.map(s => s.id));
    expect(zh.sections.map(s => s.meta.plan)).toEqual(en.sections.map(s => s.meta.plan));
    expect(zh.sections.map(s => s.meta.group)).toEqual(en.sections.map(s => s.meta.group));
    expect(zh.sections.map(s => s.meta.feature)).toEqual(en.sections.map(s => s.meta.feature));
    expect(zh.sections.map(s => s.slides.length)).toEqual(en.sections.map(s => s.slides.length));

    for (const guide of [zh, en]) {
      for (const section of guide.sections) {
        if (section.meta.plan !== 'Free') {
          expect(section.meta.teaser, `Missing locked teaser for ${section.id}`).toBeTruthy();
        }
        for (const slide of section.slides) {
          const assetPath = path.resolve('public', slide.src.replace(/^\//, ''));
          expect(fs.existsSync(assetPath), `Missing guide image asset: ${slide.src}`).toBe(true);
        }
      }
    }
  });
});
