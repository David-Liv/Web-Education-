"""
Capture bilingual (zh-HK & en) DOM-anchored annotated screenshots for HOKSE /help.

Usage:
  1. Build real-mode frontend:  $env:VITE_API_MODE='real'; npx vite build --outDir dist-pilot
  2. Run capture script:        python scripts/capture-guide-screenshots.py
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from PIL import Image
from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT_ROOT = ROOT / "public" / "guide"
PORT = int(os.environ.get("GUIDE_CAPTURE_PORT", "4188"))


OVERLAY_JS = r"""
(items) => {
  for (const el of document.querySelectorAll('#__guide_overlay')) el.remove();

  const root = document.createElement('div');
  root.id = '__guide_overlay';
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '2147483647',
    fontFamily: '"Noto Sans TC", "PingFang HK", "Microsoft JhengHei", system-ui, -apple-system, sans-serif',
  });
  // Mount inside open <dialog> top-layer when a native modal is open so callouts render ABOVE it!
  const openDialog = document.querySelector('dialog[open]');
  (openDialog || document.body).appendChild(root);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const placedTags = [];

  for (const item of items) {
    const pad = item.pad ?? 6;
    const x1 = Math.max(8, item.x - pad);
    const y1 = Math.max(8, item.y - pad);
    const x2 = Math.min(vw - 8, item.x + item.w + pad);
    const y2 = Math.min(vh - 8, item.y + item.h + pad);
    const x = x1;
    const y = y1;
    const w = Math.max(24, x2 - x1);
    const h = Math.max(24, y2 - y1);

    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
      border: '3px solid #e05a2b',
      borderRadius: '12px',
      background: 'rgba(224, 90, 43, 0.055)',
      boxShadow: '0 0 0 2.5px rgba(255,255,255,0.92), 0 8px 22px rgba(224,90,43,0.18)',
      boxSizing: 'border-box',
    });
    root.appendChild(box);

    const tag = document.createElement('div');
    Object.assign(tag.style, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      background: '#e05a2b',
      color: '#ffffff',
      borderRadius: '999px',
      padding: item.label ? '4px 12px 4px 5px' : '0',
      border: '2.5px solid #ffffff',
      boxShadow: '0 4px 14px rgba(180, 56, 16, 0.34)',
      fontSize: '12.5px',
      fontWeight: '700',
      lineHeight: '1.2',
      whiteSpace: 'nowrap',
      zIndex: '2',
    });

    const badge = document.createElement('span');
    badge.textContent = String(item.num);
    Object.assign(badge.style, {
      display: 'inline-grid',
      placeItems: 'center',
      width: item.label ? '22px' : '28px',
      height: item.label ? '22px' : '28px',
      borderRadius: '50%',
      background: item.label ? 'rgba(255,255,255,0.22)' : '#e05a2b',
      color: '#ffffff',
      fontSize: item.label ? '13px' : '14px',
      fontWeight: '800',
    });
    tag.appendChild(badge);

    if (item.label) {
      const span = document.createElement('span');
      span.textContent = item.label;
      tag.appendChild(span);
    }

    root.appendChild(tag);

    const tr = tag.getBoundingClientRect();
    const pos = item.pos || 'top-left';
    let tx = x - 4;
    let ty = y - tr.height - 6;
    if (pos === 'top-right') {
      tx = x + w - tr.width + 4;
      ty = y - tr.height - 6;
    } else if (pos === 'bottom-left') {
      tx = x - 4;
      ty = y + h + 6;
    } else if (pos === 'bottom-right') {
      tx = x + w - tr.width + 4;
      ty = y + h + 6;
    } else if (pos === 'inside-top-left') {
      tx = x + 10;
      ty = y + 10;
    } else if (pos === 'inside-top-right') {
      tx = x + w - tr.width - 10;
      ty = y + 10;
    } else if (pos === 'inside-bottom-left') {
      tx = x + 10;
      ty = y + h - tr.height - 10;
    } else if (pos === 'inside-bottom-right') {
      tx = x + w - tr.width - 10;
      ty = y + h - tr.height - 10;
    } else if (pos === 'left') {
      tx = x - tr.width - 10;
      ty = y + 4;
    } else if (pos === 'right') {
      tx = x + w + 10;
      ty = y + 4;
    }

    if (ty < 8) ty = Math.min(vh - tr.height - 8, y + h + 6);
    if (ty + tr.height > vh - 8) ty = Math.max(8, y + 10);
    tx = Math.max(8, Math.min(vw - tr.width - 8, tx));

    for (const prev of placedTags) {
      const overlapX = tx < prev.x + prev.w + 4 && tx + tr.width + 4 > prev.x;
      const overlapY = ty < prev.y + prev.h + 4 && ty + tr.height + 4 > prev.y;
      if (overlapX && overlapY) {
        const down = prev.y + prev.h + 8;
        if (down + tr.height < vh - 8) ty = down;
      }
    }

    tag.style.left = `${tx}px`;
    tag.style.top = `${ty}px`;
    placedTags.push({ x: tx, y: ty, w: tr.width, h: tr.height });
  }
}
"""

CLEAR_OVERLAY_JS = """
() => {
  for (const el of document.querySelectorAll('#__guide_overlay')) el.remove();
}
"""

VISIBLE_BOX_JS = """
({ selector, index }) => {
  const els = Array.from(document.querySelectorAll(selector)).filter(el => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && r.bottom > 8 && r.top < window.innerHeight - 8;
  });
  if (!els.length) return null;
  const el = els[Math.min(index, els.length - 1)];
  let r = el.getBoundingClientRect();
  let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const st = window.getComputedStyle(parent);
    if (/(auto|scroll|hidden|clip)/.test(st.overflowY) || /(auto|scroll|hidden|clip)/.test(st.overflowX)) {
      const pr = parent.getBoundingClientRect();
      if (pr.width > 0 && pr.height > 0) {
        x1 = Math.max(x1, pr.left);
        y1 = Math.max(y1, pr.top);
        x2 = Math.min(x2, pr.right);
        y2 = Math.min(y2, pr.bottom);
      }
    }
    parent = parent.parentElement;
  }
  x1 = Math.max(6, x1);
  y1 = Math.max(6, y1);
  x2 = Math.min(window.innerWidth - 6, x2);
  y2 = Math.min(window.innerHeight - 6, y2);
  if (x2 - x1 < 8 || y2 - y1 < 8) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
"""


def wait_settled(page: Page, ms: int = 450) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=4000)
    except Exception:
        pass
    page.wait_for_timeout(ms)


def box_of(page: Page, selector: str, index: int = 0) -> dict[str, float] | None:
    if ":has-text(" in selector or ">>" in selector:
        loc = page.locator(selector)
        count = loc.count()
        if count == 0:
            return None
        target = loc.nth(min(index, count - 1))
        try:
            target.wait_for(state="visible", timeout=2000)
            b = target.bounding_box()
            if b and b["width"] > 4 and b["height"] > 4:
                return b
        except Exception:
            return None
        return None
    try:
        return page.evaluate(VISIBLE_BOX_JS, {"selector": selector, "index": index})
    except Exception:
        return None


def capture(
    page: Page,
    lang: str,
    filename: str,
    specs: list[dict[str, Any]],
    *,
    max_width: int = 1440,
) -> int:
    resolved: list[dict[str, Any]] = []
    missing = 0
    for sp in specs:
        b = sp.get("box")
        if b is None and "selector" in sp:
            b = box_of(page, sp["selector"], sp.get("index", 0))
        if b is None:
            missing += 1
            print(f"  [WARN] {lang}/{filename}: missing target #{sp['num']} ({sp.get('selector')})", file=sys.stderr)
            continue
        resolved.append({
            "num": sp["num"],
            "x": b["x"],
            "y": b["y"],
            "w": b["width"],
            "h": b["height"],
            "label": sp.get("label", ""),
            "pad": sp.get("pad", 5),
            "pos": sp.get("pos", "top-left"),
        })

    if resolved:
        page.evaluate(OVERLAY_JS, resolved)
        page.wait_for_timeout(120)

    png_bytes = page.screenshot(type="png")
    page.evaluate(CLEAR_OVERLAY_JS)

    out_dir = OUT_ROOT / lang
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / filename

    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    if im.width > max_width:
        ratio = max_width / im.width
        im = im.resize((max_width, int(round(im.height * ratio))), Image.Resampling.LANCZOS)
    im.save(out_path, format="WEBP", quality=86, method=5)
    print(f"  [OK] {lang}/{filename} ({out_path.stat().st_size // 1024} KB, {len(resolved)}/{len(specs)} callouts)")
    return missing


def set_language(page: Page, lang_code: str) -> None:
    page.evaluate(
        "(lang) => { localStorage.setItem('hokse.interface-language', lang); }",
        lang_code,
    )


def clear_focus_storage(page: Page) -> None:
    page.evaluate(
        """() => {
          localStorage.removeItem('hokse.focus-session');
          localStorage.removeItem('hokse.focus-completed');
          localStorage.removeItem('hokse.focus-daily');
          localStorage.removeItem('hokse.focus-scratch');
        }"""
    )


def sign_in(page: Page, base: str, username: str, password: str, lang_code: str) -> None:
    page.goto(base, wait_until="domcontentloaded")
    set_language(page, lang_code)
    clear_focus_storage(page)
    page.reload(wait_until="domcontentloaded")
    wait_settled(page, 500)
    page.locator("form input").nth(0).fill(username)
    page.locator("form input").nth(1).fill(password)
    cb = page.locator("form input[type='checkbox']")
    if cb.count() > 0 and not cb.first.is_checked():
        cb.first.check()
    page.locator("form .btn.primary").click()
    page.wait_for_selector("#main-sidebar", timeout=10000)
    wait_settled(page, 600)


def run_capture_for_lang(browser: Any, manifest: dict[str, Any], lang: str) -> int:
    is_en = lang == "en"
    lang_code = "en" if is_en else "zh-HK"
    L = lambda zh, en: en if is_en else zh
    base = manifest["base"]
    misses = 0

    ctx = browser.new_context(viewport={"width": 1280, "height": 760}, device_scale_factor=2)
    page = ctx.new_page()

    # ── 01-01: Login page (unauthenticated) ────────────────────────────
    page.goto(base, wait_until="domcontentloaded")
    set_language(page, lang_code)
    page.reload(wait_until="domcontentloaded")
    wait_settled(page, 500)
    misses += capture(page, lang, "01-01-login.webp", [
        {"num": 1, "selector": ".interface-language-switch", "label": L("切換中／英", "Language"), "pos": "left"},
        {"num": 2, "selector": ".login-card form", "label": L("帳號／電郵登入並同意條款", "Sign in & accept terms"), "pos": "top-left"},
        {"num": 3, "selector": ".login-card button:has-text('討論區'), .login-card button:has-text('Forum')", "label": L("免登入先逛討論區", "Browse Forum first"), "pos": "bottom-right"},
    ])

    sign_in(page, base, manifest["accounts"]["pro"]["username"], manifest["accounts"]["pro"]["password"], lang_code)
    page.evaluate("() => { localStorage.removeItem('hokse.mascot.hidden'); }")

    # ── 01-02: First-time Onboarding (/start) ──────────────────────────
    page.goto(f"{base}/start", wait_until="domcontentloaded")
    wait_settled(page, 550)
    misses += capture(page, lang, "01-02-setup.webp", [
        {"num": 4, "selector": ".card", "index": 0, "label": L("選科、目前／目標等級與每日時間", "Subjects, grades & daily time"), "pos": "inside-top-left"},
        {"num": 5, "selector": "button.btn.primary", "index": 0, "label": L("完成並進入工作室", "Save & continue"), "pos": "top-right"},
    ])

    # ── 01-03: Sidebar & Global Search (/overview) ─────────────────────
    page.goto(f"{base}/overview", wait_until="domcontentloaded")
    wait_settled(page, 550)
    misses += capture(page, lang, "01-03-navigation.webp", [
        {"num": 6, "selector": "#main-navigation", "label": L("分組功能側邊欄", "Grouped sidebar"), "pos": "inside-top-left"},
        {"num": 7, "selector": ".sidebar-collapse", "label": L("收起成圖標", "Collapse"), "pos": "right"},
        {"num": 8, "selector": ".global-search", "label": L("中英雙語搜尋", "Quick search"), "pos": "bottom-right"},
    ])

    # ── 02-01: Study Overview (/overview) ──────────────────────────────
    misses += capture(page, lang, "02-01-overview.webp", [
        {"num": 1, "selector": ".desk-next", "label": L("開始任務專注", "Start focus task"), "pos": "top-left"},
        {"num": 2, "selector": ".desk-sheet-tools button", "label": L("全屏自由專注", "Open focus"), "pos": "top-right"},
        {"num": 3, "selector": ".desk-head .heading-actions", "label": L("弱項與學習報告", "Reports"), "pos": "bottom-right"},
    ])

    # ── 02-02: Starbean Interactive Pet Menu ───────────────────────────
    pet = page.locator(".starbean-pet, .starbean-widget, [aria-label*='星豆'], [aria-label*='Starbean']").last
    if pet.count() > 0:
        try:
            pet.click()
            wait_settled(page, 400)
        except Exception:
            pass
    misses += capture(page, lang, "02-02-starbean.webp", [
        {"num": 4, "selector": ".starbean-pill, button[aria-label*='星豆'], button[aria-label*='Starbean']", "label": L("頂欄開關星豆", "Starbean toggle"), "pos": "bottom-left"},
        {"num": 5, "selector": ".starbean-menu, .mascot-menu, .starbean-popover", "label": L("快捷選單、互動與換裝", "Quick menu & outfits"), "pos": "left"},
    ])
    page.keyboard.press("Escape")
    wait_settled(page, 250)

    # ── 03-01: Subject Knowledge Map (/subjects/maths) ─────────────────
    page.goto(f"{base}/subjects/maths", wait_until="domcontentloaded")
    wait_settled(page, 550)
    misses += capture(page, lang, "03-01-subjects.webp", [
        {"num": 1, "selector": ".topic-filters", "label": L("按課程／試卷與狀態篩選", "Filter by unit or paper"), "pos": "top-left"},
        {"num": 2, "selector": ".knowledge-row", "index": 0, "label": L("點選課題免表單直入", "Click topic directly"), "pos": "bottom-right"},
    ])

    # ── 03-02: Direct Topic View — 7-part Factorisation ────────────────
    page.goto(f"{base}/subjects/maths?topic=maths-factorisation", wait_until="domcontentloaded")
    wait_settled(page, 650)
    misses += capture(page, lang, "03-02-factorisation.webp", [
        {"num": 3, "selector": ".topic-hero-surface", "label": L("整體獨立掌握 % 與快捷操作", "Independent % & actions"), "pos": "inside-top-right"},
        {"num": 4, "selector": ".topic-overview-section", "label": L("Part 1–7 進度卡（點擊跳轉即練）", "Part 1–7 jump cards"), "pos": "top-left"},
    ])

    # ── 03-03: DSE Scientific Calculator Simulator ─────────────────────
    page.evaluate("() => window.scrollTo(0, 620)")
    wait_settled(page, 300)
    calc_btn = page.locator("button:has-text('fx-50FH'), button:has-text('fx-3650P'), button[aria-label*='計數機'], button[aria-label*='Calculator']").first
    if calc_btn.count() > 0:
        calc_btn.click()
        wait_settled(page, 450)
    presets_btn = page.locator("button:has-text('預設程式'), button:has-text('Presets')").first
    if presets_btn.count() > 0:
        try:
            presets_btn.click()
            wait_settled(page, 350)
        except Exception:
            pass
    misses += capture(page, lang, "03-03-calculator.webp", [
        {"num": 5, "selector": ".dse-calc-toolbar", "label": L("切換 fx-50FH II / 3650P II 與自動彈出", "Model switch & auto-show"), "pos": "top-left"},
        {"num": 6, "selector": ".dse-calc-actions-row", "label": L("填入算式與結果／複製答案", "Insert or copy result"), "pos": "left"},
        {"num": 7, "selector": ".dse-calc-body-wrap", "label": L("1:1 雙行 LCD 與 DSE 6 合 1 預設程式", "1:1 LCD & DSE Presets"), "pos": "inside-bottom-right"},
    ])
    if calc_btn.count() > 0:
        try:
            calc_btn.click()
            wait_settled(page, 250)
        except Exception:
            pass

    # ── 04-01: AI Study Room — Tutor Selector Modal ────────────────────
    chat_id = manifest["davidEnId"] if is_en else manifest["davidZhId"]
    page.goto(f"{base}/learn/{chat_id}", wait_until="domcontentloaded")
    wait_settled(page, 650)
    new_chat_btn = page.locator(".chat-history .btn.primary").first
    if new_chat_btn.count() > 0:
        new_chat_btn.click()
        wait_settled(page, 450)
    # Scroll modal body slightly if needed so primary CTA is visible in EN too
    page.evaluate("() => { const d = document.querySelector('dialog[open]'); if (d) d.scrollTop = d.scrollHeight; }")
    wait_settled(page, 200)
    misses += capture(page, lang, "04-01-tutor-select.webp", [
        {"num": 1, "selector": ".tutor-picker, .tutor-grid, .modal .tutor-cards", "label": L("揀選導師教學法", "Pick tutor method"), "pos": "inside-top-right"},
        {"num": 2, "selector": ".modal .form-grid", "label": L("學科、任務與知識點", "Subject & topic"), "pos": "inside-top-left"},
        {"num": 3, "selector": "dialog[open] .modal-actions .btn.primary", "label": L("開啟學習對話", "Start chat"), "pos": "left"},
    ])
    page.keyboard.press("Escape")
    wait_settled(page, 300)

    # ── 04-02: AI Study Room — Formulas & Interactive Plot ─────────────
    page.evaluate("() => { const el = document.querySelector('.chat-messages'); if (el) el.scrollTop = 160; }")
    wait_settled(page, 450)
    misses += capture(page, lang, "04-02-chat-practice.webp", [
        {"num": 4, "selector": ".chat-visual, .visual-card", "label": L("圖表放大與下載 SVG／PNG", "Enlarge or download chart"), "pos": "inside-top-right"},
        {"num": 5, "selector": ".chat-composer", "label": L("輸入提問、附圖與傳送", "Composer & send"), "pos": "top-right"},
    ])

    # ── 04-03: AI Study Room — In-chat Practice & Follow-ups ───────────
    page.evaluate("() => { const el = document.querySelector('.chat-messages'); if (el) el.scrollTop = el.scrollHeight; }")
    wait_settled(page, 450)
    misses += capture(page, lang, "04-03-chat-exercise.webp", [
        {"num": 6, "selector": ".chat-message.assistant details, .chat-exercise, .exercise-box, .rich-text > div", "index": 0, "label": L("隨堂陪練：作答、提示與解析", "Quick practice, hints & answer"), "pos": "top-right"},
        {"num": 7, "selector": ".chat-followups", "label": L("一鍵填入追問建議（可還原草稿）", "One-click follow-up suggestions"), "pos": "top-left"},
    ])

    # ── 04-04: AI Study Room — Matt PDF Lesson ─────────────────────────
    matt_id = manifest["mattEnId"] if is_en else manifest["mattZhId"]
    page.goto(f"{base}/learn/{matt_id}", wait_until="domcontentloaded")
    wait_settled(page, 650)
    misses += capture(page, lang, "04-04-matt-pdf.webp", [
        {"num": 8, "selector": ".tutor-doc-card, .tutor-document, .chat-message.assistant", "label": L("下載 PDF 課件與按題號討論", "PDF lesson & discuss by Q#"), "pos": "inside-top-right"},
        {"num": 9, "selector": ".chat-top-actions", "label": L("下一份課件／學習設定／換導師", "Next PDF / Settings / Tutor"), "pos": "bottom-right"},
    ])

    # ── 05-01: Daily Review (/review) ──────────────────────────────────
    page.goto(f"{base}/review", wait_until="domcontentloaded")
    wait_settled(page, 500)
    misses += capture(page, lang, "05-01-daily-review.webp", [
        {"num": 1, "selector": ".page-heading .heading-actions", "label": L("雙周回顧與溫習日曆", "Two-week review & calendar"), "pos": "bottom-right"},
        {"num": 2, "selector": ".card", "index": 0, "label": L("針對單一知識點練習與復測", "Targeted skill review & retest"), "pos": "inside-top-right"},
    ])

    # ── 05-02: Open Focus Guard Bar & Scratchpad ───────────────────────
    page.goto(f"{base}/overview", wait_until="domcontentloaded")
    wait_settled(page, 450)
    open_focus_btn = page.locator(".desk-sheet-tools button").first
    if open_focus_btn.count() > 0:
        open_focus_btn.click()
        wait_settled(page, 350)
        start_btn = page.locator(".modal .btn.primary").first
        if start_btn.count() > 0:
            start_btn.click()
            wait_settled(page, 500)
    misses += capture(page, lang, "05-02-open-focus.webp", [
        {"num": 3, "selector": ".focus-guard-bar, .focus-bar", "label": L("頁頂防分心計時列（站內自由探索）", "Focus guard bar (explore freely)"), "pos": "bottom-left"},
        {"num": 4, "selector": ".focus-guard-bar button", "index": 0, "label": L("卡點便條與安全結束", "Scratchpad & safe exit"), "pos": "bottom-right"},
    ])
    clear_focus_storage(page)
    page.goto(f"{base}/overview", wait_until="domcontentloaded")
    wait_settled(page, 450)

    # ── 05-03: Mistake Notebook (/mistakes) ────────────────────────────
    page.goto(f"{base}/mistakes", wait_until="domcontentloaded")
    wait_settled(page, 550)
    first_detail = page.locator(".card details summary").first
    if first_detail.count() > 0:
        first_detail.click()
        wait_settled(page, 300)
    misses += capture(page, lang, "05-03-mistakes.webp", [
        {"num": 5, "selector": ".card details[open], .mistake-card, .card", "index": 0, "label": L("展開原作答、回饋與錯因", "Original answer, feedback & cause"), "pos": "top-left"},
        {"num": 6, "selector": ".card details[open] .btn, .mistake-card .btn, .card a.btn", "index": 0, "label": L("換新題復測或帶去討論區提問", "Retest or ask in Forum"), "pos": "bottom-right"},
    ])

    # ── 06-01: Basic Calendar (/calendar) ──────────────────────────────
    page.goto(f"{base}/calendar", wait_until="domcontentloaded")
    wait_settled(page, 550)
    misses += capture(page, lang, "06-01-calendar-basic.webp", [
        {"num": 1, "selector": ".calendar-toolbar", "label": L("切換日／週／月視圖與新增手動任務", "Views & add manual task"), "pos": "bottom-left"},
        {"num": 2, "selector": ".calendar-sidebar .card", "index": 0, "label": L("當日排程與時間預算", "Today's schedule & budget"), "pos": "top-right"},
    ])

    # ── 06-02: University Goals Explore (/goals) ───────────────────────
    page.goto(f"{base}/goals", wait_until="domcontentloaded")
    wait_settled(page, 600)
    misses += capture(page, lang, "06-02-goals-explore.webp", [
        {"num": 3, "selector": ".admission-filters", "label": L("按院校、領域與收分指數篩選", "Filter & sort programmes"), "pos": "top-left"},
        {"num": 4, "selector": ".programme-grid article", "index": 0, "label": L("設定 1 主目標＋最多 2 備選", "Main goal & up to 2 backups"), "pos": "bottom-right"},
    ])

    # ── 06-03: University Goals Comparison & Strategy ──────────────────
    strategy_tab = page.locator(".goals-tabs button[role='tab']").nth(1)
    if strategy_tab.count() > 0:
        strategy_tab.click()
        wait_settled(page, 500)
    misses += capture(page, lang, "06-03-goals-compare.webp", [
        {"num": 5, "selector": ".goals-tabs", "label": L("切換「選科策略與收分對照」", "Switch to strategy & gaps"), "pos": "bottom-left"},
        {"num": 6, "selector": ".university-goals section.card", "index": 0, "label": L("歷年四分位曲線與科目加權差距", "Score gap & quartile chart"), "pos": "inside-top-right"},
    ])

    # ── 07-01: Learning Resources (/resources) ─────────────────────────
    page.goto(f"{base}/resources", wait_until="domcontentloaded")
    wait_settled(page, 500)
    misses += capture(page, lang, "07-01-resources.webp", [
        {"num": 1, "selector": ".resource-heading", "label": L("搜尋、學科／收費篩選與我的收藏", "Search, filter & bookmarks"), "pos": "bottom-left"},
        {"num": 2, "selector": ".resource-card", "index": 0, "label": L("收藏或前往外部學習網站", "Bookmark or open website"), "pos": "inside-bottom-right"},
    ])

    # ── 07-02: Student Forum Feed (/forum) ─────────────────────────────
    page.goto(f"{base}/forum", wait_until="domcontentloaded")
    wait_settled(page, 550)
    misses += capture(page, lang, "07-02-forum-feed.webp", [
        {"num": 3, "selector": ".forum-board-nav", "label": L("科目版塊、升學與吹水區", "Subject & lounge boards"), "pos": "inside-top-left"},
        {"num": 4, "selector": "button:has-text('發起新帖'), button:has-text('New post')", "label": L("發起新貼文", "New post"), "pos": "bottom-right"},
        {"num": 5, "selector": ".forum-post-card", "index": 0, "label": L("純真人正向共鳴與單選投票", "Human-only reactions & polls"), "pos": "inside-bottom-right"},
    ])

    # ── 07-03: Student Forum Compose Modal ─────────────────────────────
    compose_btn = page.locator("button:has-text('發起新帖'), button:has-text('New post')").first
    if compose_btn.count() > 0:
        compose_btn.click()
        wait_settled(page, 450)
    misses += capture(page, lang, "07-03-forum-compose.webp", [
        {"num": 6, "selector": "dialog[open] .grid-2", "label": L("選擇版塊、可見範圍與單篇匿名", "Board, visibility & anonymous"), "pos": "inside-top-right"},
        {"num": 7, "selector": "dialog[open] textarea", "label": L("Markdown、數學公式、附圖與投票", "Markdown, LaTeX, images & poll"), "pos": "inside-bottom-right"},
    ])
    page.keyboard.press("Escape")
    wait_settled(page, 250)

    # ── 08-01 & 08-02: Maths By Topic Index (Plus) ─────────────────────
    page.goto(f"{base}/resources/maths", wait_until="domcontentloaded")
    wait_settled(page, 650)
    misses += capture(page, lang, "08-01-maths-filters.webp", [
        {"num": 1, "selector": ".index-tabs", "label": L("逐題索引／課題文件與 CSV", "Tabs & CSV exports"), "pos": "top-left"},
        {"num": 2, "selector": ".index-filters", "label": L("來源、知識點、難度與年份篩選", "Multi-facet filters"), "pos": "inside-top-right"},
    ])
    page.evaluate("() => window.scrollTo(0, 620)")
    wait_settled(page, 350)
    misses += capture(page, lang, "08-02-maths-results.webp", [
        {"num": 3, "selector": ".index-result", "index": 0, "label": L("題號與來源難度標註", "Metadata & source difficulty"), "pos": "top-left"},
        {"num": 4, "selector": ".index-result a.btn", "index": 0, "label": L("前往原網站或帶去討論區", "Open source / Discuss"), "pos": "bottom-left"},
    ])

    # ── 09-01: My Learning Flow — AI Topic Quiz (Plus) ─────────────────
    page.goto(f"{base}/studio", wait_until="domcontentloaded")
    wait_settled(page, 550)
    extra = page.locator(".studio-extra summary").first
    if extra.count() > 0:
        extra.click()
        wait_settled(page, 350)
    page.evaluate("() => window.scrollTo(0, 340)")
    wait_settled(page, 250)
    misses += capture(page, lang, "09-01-studio-quiz.webp", [
        {"num": 1, "selector": ".studio-grid .form-grid, .studio-direct-topic-link", "label": L("選科目與起步題數", "Subject & question count"), "pos": "inside-top-right"},
        {"num": 2, "selector": ".studio-extra .studio-actions", "label": L("啟動 AI 專題測驗（後台自適應配題）", "Adaptive AI Topic Quiz"), "pos": "bottom-left"},
    ])

    # ── 09-02: AI Quiz Feedback & Free Re-check ────────────────────────
    hist_btn = page.locator(".studio-history").first
    if hist_btn.count() > 0:
        hist_btn.click()
        wait_settled(page, 450)
    q_card = page.locator(".studio-question").first
    if q_card.count() > 0:
        q_card.scroll_into_view_if_needed()
        wait_settled(page, 350)
    misses += capture(page, lang, "09-02-quiz-review.webp", [
        {"num": 3, "selector": "a[href*='/pdf']", "label": L("下載同題號練習 PDF（零扣點）", "Download practice PDF"), "pos": "top-right"},
        {"num": 4, "selector": ".studio-question", "index": 0, "label": L("逐題回饋與免費自動復核一次", "Per-item feedback & free re-check"), "pos": "inside-top-left"},
    ])

    # ── 09-03: AI Study Room — Full Model Switcher (Plus) ──────────────
    page.goto(f"{base}/learn/{chat_id}", wait_until="domcontentloaded")
    wait_settled(page, 550)
    page.evaluate("() => { const el = document.querySelector('.chat-messages'); if (el) el.scrollTop = el.scrollHeight; }")
    wait_settled(page, 350)
    misses += capture(page, lang, "09-03-model-switcher.webp", [
        {"num": 5, "selector": ".chat-model-select", "label": L("即時切換全部開放 AI 模型", "Switch all enabled AI models"), "pos": "top-left"},
        {"num": 6, "selector": ".message-source", "index": 0, "label": L("清楚標示回覆模型與單價", "Model badge per reply"), "pos": "top-right"},
    ])

    # ── 10-01 & 10-02: AI Learning Plan & Advanced Calendar (Plus) ─────
    page.goto(f"{base}/calendar", wait_until="domcontentloaded")
    wait_settled(page, 550)
    misses += capture(page, lang, "10-01-ai-plan.webp", [
        {"num": 1, "selector": ".page-heading .btn.primary", "label": L("產生並預覽 AI 學習計劃", "Generate & preview AI plan"), "pos": "bottom-right"},
        {"num": 2, "selector": "button:has-text('休息'), button:has-text('Rest')", "label": L("一鍵設定休息日保護", "Rest-day protection"), "pos": "bottom-left"},
    ])
    page.evaluate("() => window.scrollTo(0, 320)")
    wait_settled(page, 300)
    misses += capture(page, lang, "10-02-calendar-drag.webp", [
        {"num": 3, "selector": ".calendar-scroll", "label": L("拖曳／長按改期（5 分鐘對齊 · 3 秒撤銷）", "Drag to reschedule (3s Undo)"), "pos": "inside-top-left"},
        {"num": 4, "selector": ".calendar-sidebar .card", "index": 0, "label": L("點擊任務鎖定或移回待辦", "Lock or move back to backlog"), "pos": "inside-bottom-right"},
    ])

    # ── 11-01: Pro Real-time Progress Sync (/overview) ─────────────────
    page.goto(f"{base}/overview", wait_until="domcontentloaded")
    wait_settled(page, 600)
    rt = page.locator(".realtime-panel, .realtime-card, [class*='realtime']").first
    if rt.count() > 0:
        rt.scroll_into_view_if_needed()
        wait_settled(page, 350)
    misses += capture(page, lang, "11-01-realtime-progress.webp", [
        {"num": 1, "selector": ".realtime-kpis, [class*='realtime']", "label": L("即時同步今日分鐘、任務與作答", "Live synced KPIs"), "pos": "top-left"},
        {"num": 2, "selector": ".realtime-skills, .realtime-events", "label": L("活躍技能變化與動態時間線", "Skill deltas & live feed"), "pos": "inside-bottom-right"},
    ])

    # ── 11-02 & 11-03: Pro Weak-Spot Alert & Report Modal ──────────────
    page.evaluate("() => window.scrollTo(0, 0)")
    wait_settled(page, 350)
    misses += capture(page, lang, "11-02-weak-alert.webp", [
        {"num": 3, "selector": ".weak-nudge-card, .starbean-bubble, .desk-head button:has-text('弱項'), .desk-head button:has-text('Weak')", "label": L("Pro 弱項主動提醒與一鍵開啟報告", "Proactive weak-spot entry"), "pos": "bottom-right"},
    ])
    weak_btn = page.locator("button:has-text('弱項診斷報告'), button:has-text('Weak-spot')").first
    if weak_btn.count() > 0:
        weak_btn.click()
        wait_settled(page, 650)
    misses += capture(page, lang, "11-03-weak-report.webp", [
        {"num": 4, "selector": "dialog[open] .report-numbers", "label": L("獨立作答率與未訂正錯題", "Independent rate & mistakes"), "pos": "top-left"},
        {"num": 5, "selector": "dialog[open] .weak-list", "label": L("優先補強清單與一鍵針對練習", "Priority weak spots & CTA"), "pos": "inside-top-right"},
    ])
    page.keyboard.press("Escape")
    wait_settled(page, 250)

    # ── 12-01: Pro Hybrid Quiz (/studio) ───────────────────────────────
    page.goto(f"{base}/studio", wait_until="domcontentloaded")
    wait_settled(page, 550)
    extra = page.locator(".studio-extra summary").first
    if extra.count() > 0:
        extra.click()
        wait_settled(page, 350)
    misses += capture(page, lang, "12-01-hybrid-quiz.webp", [
        {"num": 1, "selector": "button:has-text('混合'), button:has-text('Hybrid')", "label": L("啟動 AI＋導師設計混合測驗", "AI + Teacher hybrid quiz"), "pos": "bottom-left"},
        {"num": 2, "selector": ".studio-grid aside .pilot-card", "index": 0, "label": L("追蹤獨立掌握度與技能證據", "Track independent mastery"), "pos": "inside-top-left"},
    ])

    # ── 12-02: Pro 48h Boosted Forum Post (/forum) ─────────────────────
    page.goto(f"{base}/forum", wait_until="domcontentloaded")
    wait_settled(page, 550)
    page.evaluate("() => window.scrollTo(0, 220)")
    wait_settled(page, 300)
    misses += capture(page, lang, "12-02-forum-boost.webp", [
        {"num": 3, "selector": ".forum-post-card", "index": 1, "label": L("48 小時優先曝光（匿名發文亦有效）", "48h priority boost (works anonymously)"), "pos": "top-left"},
    ])

    # ── 13-01: Personal Settings (/settings) ───────────────────────────
    page.goto(f"{base}/settings", wait_until="domcontentloaded")
    wait_settled(page, 500)
    misses += capture(page, lang, "13-01-settings.webp", [
        {"num": 1, "selector": ".card", "index": 0, "label": L("帳戶資料、成績與電郵綁定", "Account, grades & verified email"), "pos": "inside-top-right"},
        {"num": 2, "selector": ".card", "index": 1, "label": L("私隱授權與合作導師分享開關", "Privacy & Partner Tutor toggle"), "pos": "inside-top-right"},
    ])

    # ── 13-02: Plan & Billing (/billing) ───────────────────────────────
    page.goto(f"{base}/billing", wait_until="domcontentloaded")
    wait_settled(page, 550)
    misses += capture(page, lang, "13-02-billing.webp", [
        {"num": 3, "selector": ".pricing-tiers", "label": L("三檔 30 天滾動套餐比較", "Free / Plus / Pro tiers"), "pos": "inside-top-left"},
        {"num": 4, "selector": ".pricing-tier.tier-popular", "label": L("主推 Plus 方案 · 升級餘額疊加", "Most popular Plus + carryover"), "pos": "inside-bottom-right"},
    ])

    ctx.close()
    return misses


def main() -> None:
    print("Starting isolated local guide capture server...")
    env = {**os.environ, "GUIDE_CAPTURE_PORT": str(PORT)}
    proc = subprocess.Popen(
        ["node", "scripts/guide-capture-server.ts"],
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        env=env,
    )

    manifest: dict[str, Any] | None = None
    assert proc.stdout is not None
    deadline = time.time() + 25
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            if proc.poll() is not None:
                err = proc.stderr.read() if proc.stderr else ""
                raise RuntimeError(f"Capture server exited early ({proc.returncode}):\n{err}")
            time.sleep(0.1)
            continue
        if line.startswith("GUIDE_CAPTURE_READY "):
            manifest = json.loads(line[len("GUIDE_CAPTURE_READY "):].strip())
            break
    if not manifest:
        proc.terminate()
        raise RuntimeError("Timed out waiting for GUIDE_CAPTURE_READY")

    print(f"Capture server ready at {manifest['base']}")
    total_misses = 0
    try:
        with sync_playwright() as p:
            browser = None
            for channel in ("chrome", "msedge", None):
                try:
                    kwargs: dict[str, Any] = {"headless": True}
                    if channel:
                        kwargs["channel"] = channel
                    browser = p.chromium.launch(**kwargs)
                    break
                except Exception:
                    continue
            if browser is None:
                raise RuntimeError("No Chromium/Chrome/Edge executable available for Playwright")
            for lang in ("zh", "en"):
                print(f"\n=== Capturing {lang.upper()} screenshots ===")
                total_misses += run_capture_for_lang(browser, manifest, lang)
            browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    print(f"\nAll guide screenshots captured successfully. Total missing callouts: {total_misses}")


if __name__ == "__main__":
    main()
