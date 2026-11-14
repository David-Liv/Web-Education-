import type { FactorisationVariant, GuidedItemState } from '../factorisation-check.ts';

export const FACTORISATION_TOPIC_ID = 'maths-factorisation';

export interface WorkedStep {
  labelZh: string;
  labelEn: string;
  mathTex: string;
  noteZh: string;
  noteEn: string;
}

export interface FactorisationSlot {
  id: string;
  partId: string;
  mode: 'warmup' | 'check';
  titleZh: string;
  titleEn: string;
  variants: FactorisationVariant[];
}

export interface FactorisationPart {
  id: string;
  number: number;
  titleZh: string;
  titleEn: string;
  shortZh: string;
  shortEn: string;
  goalZh: string;
  goalEn: string;
  stepsZh: string[];
  stepsEn: string[];
  workedExample: {
    promptTex: string;
    answerTex: string;
    steps: WorkedStep[];
  };
  trapZh: string;
  trapEn: string;
  warmup: FactorisationSlot;
  checks: FactorisationSlot[];
  aiStarterZh: string;
  aiStarterEn: string;
  aiChunkTitle: string;
  aiChunkText: string;
}

export const FACTORISATION_MASTER_CHECKLIST = {
  titleZh: '動筆前 2 秒黃金檢查次序',
  titleEn: '2-Second Priority Checklist Before Every Question',
  rules: [
    {
      badgeZh: '第一步 · 必先做',
      badgeEn: 'Step 1 · Always First',
      titleZh: '先抽公因式（數字 GCD ＋ 最低次方共同字母）',
      titleEn: 'Extract Common Factors First (Numerical GCD + Lowest Variable Powers)',
      detailZh: '不論題目看似平方差還是二次式，不先抽公因式就會卡住或漏掉最前面的倍數。',
      detailEn: 'Even if a question looks like a quadratic or difference of squares, skipping the common factor loses the leading multiplier.',
    },
    {
      badgeZh: '第二步 · 數項數認題型',
      badgeEn: 'Step 2 · Count Terms to Pick Pattern',
      titleZh: '2 項看平方差／立方和差 · 3 項看二次三項式 · 4 項看兩兩併項',
      titleEn: '2 Terms: Squares/Cubes · 3 Terms: Quadratic · 4 Terms: Grouping',
      detailZh: '做完後瞄一眼每個括號內是否還能再抽常數或繼續分解；卷二 MC 可代非平凡質數（如 7、11）快速驗算。',
      detailEn: 'Afterwards, check every bracket for hidden factors; on Paper 2 MC, substitute distinct primes (e.g. 7, 11) to verify.',
    },
  ],
};

export const FACTORISATION_PARTS: FactorisationPart[] = [
  {
    id: 'part-1',
    number: 1,
    titleZh: '提取單項公因式（基礎起步）',
    titleEn: 'Taking Out Common Monomial Factors',
    shortZh: '數字 GCD ＋ 最低次方字母',
    shortEn: 'Numerical GCD + lowest power',
    goalZh: '穩陣抽出係數最大公因數與共同變數，並保留整除時的 +1 / −1 佔位項。',
    goalEn: 'Extract the numerical GCD and shared variable powers without dropping +1 or −1 placeholders.',
    stepsZh: [
      '找出所有係數的**最大公因數（GCD）**。',
      '找出**每一項都出現**的字母，取其**最低次方**合組成公因式寫在括號外。',
      '將原式每一項逐一除以公因式，把商寫入括號內（原式有幾項，括號內就有幾項）。',
    ],
    stepsEn: [
      'Find the **greatest common divisor (GCD)** of all numerical coefficients.',
      'Take only variables appearing in **every term**, each raised to its **lowest power**, and place the combined GCF in front.',
      'Divide each original term by the GCF to fill the bracket (the bracket must keep the exact same number of terms).',
    ],
    workedExample: {
      promptTex: '12ab^2 - 18a^2b + 6ab',
      answerTex: '6ab(2b - 3a + 1)',
      steps: [
        {
          labelZh: '找公因式',
          labelEn: 'Find GCF',
          mathTex: '\\gcd(12, 18, 6) = 6,\\quad a^1b^1 = ab \\implies \\text{GCF} = 6ab',
          noteZh: '三項都有 a 和 b，最低次方均為 1 次。',
          noteEn: 'Both a and b appear in all 3 terms with minimum power 1.',
        },
        {
          labelZh: '逐項相除',
          labelEn: 'Divide each term',
          mathTex: '\\frac{12ab^2}{6ab} = 2b,\\quad \\frac{-18a^2b}{6ab} = -3a,\\quad \\frac{6ab}{6ab} = +1',
          noteZh: '最後一項整除得 +1，絕不是 0！',
          noteEn: 'A term divided by itself leaves +1, never 0!',
        },
        {
          labelZh: '合寫結果',
          labelEn: 'Write product',
          mathTex: '6ab(2b - 3a + 1)',
          noteZh: '可心算乘開核對是否還原三項。',
          noteEn: 'Expand mentally to verify all three original terms return.',
        },
      ],
    },
    trapZh: '當某一項與公因式完全相同（如 6ab ÷ 6ab），括號內必須寫 +1（或 −1）佔位，切勿直接漏掉變成兩項！',
    trapEn: 'When a term equals the GCF itself (e.g. 6ab ÷ 6ab), you MUST keep +1 (or −1) inside the bracket — never drop the term!',
    warmup: {
      id: 'fac-p1-warm',
      partId: 'part-1',
      mode: 'warmup',
      titleZh: '引導熱身：兩項單項公因式',
      titleEn: 'Guided Warm-up: Monomial Common Factor',
      variants: [
        {
          id: 'fac-p1-warm-v0',
          kind: 'factor',
          promptZh: '因式分解 $15xy + 5y$',
          promptEn: 'Factorise $15xy + 5y$',
          answer: '5y(3x + 1)',
          answerTex: '5y(3x + 1)',
          allowedVars: ['x', 'y'],
          hintsZh: [
            '15 與 5 的最大公因數是 5；兩項共有的字母是 y。',
            '把兩項分別除以 5y：第一項得 3x，第二項 5y ÷ 5y 得 +1。',
          ],
          hintsEn: [
            'The GCD of 15 and 5 is 5, and both terms share y.',
            'Divide each term by 5y: 15xy ÷ 5y = 3x and 5y ÷ 5y = +1.',
          ],
          stepsZh: [
            '公因式為 $5y$。',
            '$\\frac{15xy}{5y} = 3x$，$\\frac{5y}{5y} = 1$。',
            '結果為 $5y(3x + 1)$。',
          ],
          stepsEn: [
            'Common factor is $5y$.',
            '$\\frac{15xy}{5y} = 3x$ and $\\frac{5y}{5y} = 1$.',
            'Result: $5y(3x + 1)$.',
          ],
        },
      ],
    },
    checks: [
      {
        id: 'fac-p1-c1',
        partId: 'part-1',
        mode: 'check',
        titleZh: '獨立檢核 1：雙變數公因式提取',
        titleEn: 'Check 1: Two-Variable Common Factor',
        variants: [
          {
            id: 'fac-p1-c1-v0',
            kind: 'factor',
            promptZh: '因式分解 $14p^2q - 21pq^2$',
            promptEn: 'Factorise $14p^2q - 21pq^2$',
            answer: '7pq(2p - 3q)',
            answerTex: '7pq(2p - 3q)',
            allowedVars: ['p', 'q'],
            hintsZh: ['14 和 21 的最大公因數是 7；p 和 q 的最低次方均為 1 次。'],
            hintsEn: ['GCD(14, 21) = 7; the lowest powers of p and q are both 1.'],
            stepsZh: ['抽出公因式 $7pq$。', '$14p^2q \\div 7pq = 2p$，$-21pq^2 \\div 7pq = -3q$。', '答案為 $7pq(2p - 3q)$。'],
            stepsEn: ['Extract $7pq$.', '$14p^2q \\div 7pq = 2p$ and $-21pq^2 \\div 7pq = -3q$.', 'Answer: $7pq(2p - 3q)$.'],
          },
          {
            id: 'fac-p1-c1-v1',
            kind: 'factor',
            promptZh: '因式分解 $18m^3n + 12m^2n^2$',
            promptEn: 'Factorise $18m^3n + 12m^2n^2$',
            answer: '6m^2n(3m + 2n)',
            answerTex: '6m^2n(3m + 2n)',
            allowedVars: ['m', 'n'],
            hintsZh: ['18 和 12 的最大公因數是 6；m 最低是 2 次，n 最低是 1 次。'],
            hintsEn: ['GCD(18, 12) = 6; lowest powers are m² and n¹.'],
            stepsZh: ['抽出公因式 $6m^2n$。', '逐項相除得 $3m$ 與 $+2n$。', '答案為 $6m^2n(3m + 2n)$。'],
            stepsEn: ['Extract $6m^2n$.', 'Dividing each term gives $3m$ and $+2n$.', 'Answer: $6m^2n(3m + 2n)$.'],
          },
          {
            id: 'fac-p1-c1-v2',
            kind: 'factor',
            promptZh: '因式分解 $20u^2v - 15uv^2$',
            promptEn: 'Factorise $20u^2v - 15uv^2$',
            answer: '5uv(4u - 3v)',
            answerTex: '5uv(4u - 3v)',
            allowedVars: ['u', 'v'],
            hintsZh: ['抽出數字公因數 5 及共同變數 uv。'],
            hintsEn: ['Extract numerical factor 5 and shared variables uv.'],
            stepsZh: ['公因式為 $5uv$。', '逐項相除得 $4u - 3v$，答案為 $5uv(4u - 3v)$。'],
            stepsEn: ['GCF is $5uv$.', 'Dividing gives $5uv(4u - 3v)$.'],
          },
        ],
      },
      {
        id: 'fac-p1-c2',
        partId: 'part-1',
        mode: 'check',
        titleZh: '獨立檢核 2：三項提取與 +1 / −1 佔位',
        titleEn: 'Check 2: Three Terms with ±1 Placeholder',
        variants: [
          {
            id: 'fac-p1-c2-v0',
            kind: 'factor',
            promptZh: '因式分解 $8x^3y - 12x^2y^2 + 4x^2y$',
            promptEn: 'Factorise $8x^3y - 12x^2y^2 + 4x^2y$',
            answer: '4x^2y(2x - 3y + 1)',
            answerTex: '4x^2y(2x - 3y + 1)',
            allowedVars: ['x', 'y'],
            hintsZh: ['三項的最大公因式是 4x²y，注意第三項除以 4x²y 後要保留 +1！'],
            hintsEn: ['The GCF of all three terms is 4x²y; remember the third term leaves +1!'],
            stepsZh: ['公因式為 $4x^2y$。', '逐項相除：$2x$、$-3y$、$+1$。', '答案為 $4x^2y(2x - 3y + 1)$。'],
            stepsEn: ['GCF is $4x^2y$.', 'Quotients: $2x$, $-3y$, and $+1$.', 'Answer: $4x^2y(2x - 3y + 1)$.'],
          },
          {
            id: 'fac-p1-c2-v1',
            kind: 'factor',
            promptZh: '因式分解 $9a^3b + 15a^2b^2 - 3a^2b$',
            promptEn: 'Factorise $9a^3b + 15a^2b^2 - 3a^2b$',
            answer: '3a^2b(3a + 5b - 1)',
            answerTex: '3a^2b(3a + 5b - 1)',
            allowedVars: ['a', 'b'],
            hintsZh: ['公因式是 3a²b；最尾項 −3a²b 除以 3a²b 剩下 −1。'],
            hintsEn: ['GCF is 3a²b; the last term −3a²b divided by 3a²b leaves −1.'],
            stepsZh: ['抽出 $3a^2b$。', '括號內為 $3a + 5b - 1$，合寫 $3a^2b(3a + 5b - 1)$。'],
            stepsEn: ['Extract $3a^2b$.', 'Inside the bracket: $3a + 5b - 1$, giving $3a^2b(3a + 5b - 1)$.'],
          },
          {
            id: 'fac-p1-c2-v2',
            kind: 'factor',
            promptZh: '因式分解 $10r^3s - 25r^2s^2 - 5r^2s$',
            promptEn: 'Factorise $10r^3s - 25r^2s^2 - 5r^2s$',
            answer: '5r^2s(2r - 5s - 1)',
            answerTex: '5r^2s(2r - 5s - 1)',
            allowedVars: ['r', 's'],
            hintsZh: ['抽出 5r²s，最尾項 −5r²s ÷ 5r²s = −1。'],
            hintsEn: ['Extract 5r²s; the final term −5r²s ÷ 5r²s leaves −1.'],
            stepsZh: ['公因式為 $5r^2s$。', '答案為 $5r^2s(2r - 5s - 1)$。'],
            stepsEn: ['GCF is $5r^2s$.', 'Answer: $5r^2s(2r - 5s - 1)$.'],
          },
        ],
      },
    ],
    aiStarterZh: '請用簡短分步方式教我因式分解「Part 1：提取單項公因式」，並考我一題看看我有沒有漏掉 +1 佔位項。',
    aiStarterEn: 'Walk me step by step through Factorisation Part 1 (taking out common monomial factors) and test me on the +1 placeholder trap.',
    aiChunkTitle: 'Factorisation Part 1 — Taking Out Common Monomial Factors',
    aiChunkText:
      'Methodology: (1) Find numerical GCD of all coefficients. (2) Take variables present in EVERY term at their lowest exponent. (3) Divide each term by the GCF and write the quotients inside brackets. Key trap: when a term equals the GCF (e.g. +6r divided by 6r, or -3a²b divided by 3a²b), students often drop it or write 0 instead of +1 or -1. Coach by asking the student how many terms the original expression has and checking that the bracket has the exact same number of terms.',
  },
  {
    id: 'part-2',
    number: 2,
    titleZh: '提取公因括號（多項整體提取）',
    titleEn: 'Extracting Common Binomial Brackets',
    shortZh: '視括號為整體 ＋ 檢查尾括號常數',
    shortEn: 'Shared bracket + final scalar check',
    goalZh: '把整個相同括號當成單一公因式抽出，處理反號括號 (b − a) = −(a − b)，並抽盡新括號內的常數。',
    goalEn: 'Extract a shared bracket as one unit, handle sign-flipped brackets (b − a) = −(a − b), and pull out any remaining scalar factor.',
    stepsZh: [
      '先看加號 $+$ 或減號 $-$ 把算式分成哪幾大組（相乘的括號屬於同一大組）。',
      '抽出各組共有的**整個括號因式**（若遇 $(2b - a)$ 與 $(a - 2b)$，先改寫 $(2b - a) = -(a - 2b)$ 對齊）。',
      '將剩餘部分合併進第二個括號化簡，**最後務必檢查新括號能否再抽數字公因數到最前**！',
    ],
    stepsEn: [
      'Split the expression at top-level $+$ and $-$ signs (multiplied brackets form a single term).',
      'Pull out the **shared bracket** in front (if you see $(2b - a)$ vs $(a - 2b)$, rewrite $(2b - a) = -(a - 2b)$ first).',
      'Combine the leftover parts in a second bracket, simplify, and **check whether a scalar factor still pulls out to the very front**!',
    ],
    workedExample: {
      promptTex: '(m + 3)(4m + 9) - (m + 3)',
      answerTex: '4(m + 3)(m + 2)',
      steps: [
        {
          labelZh: '抽公因括號',
          labelEn: 'Extract bracket',
          mathTex: '(m + 3)[(4m + 9) - 1]',
          noteZh: '第二大組 -(m+3) 除以 (m+3) 剩下 -1！',
          noteEn: 'Dividing -(m + 3) by (m + 3) leaves -1!',
        },
        {
          labelZh: '合併同類項',
          labelEn: 'Simplify bracket',
          mathTex: '(m + 3)(4m + 8)',
          noteZh: '9 - 1 = 8，但還沒完！',
          noteEn: '9 - 1 = 8, but check if 4m + 8 simplifies further!',
        },
        {
          labelZh: '再抽常數 4',
          labelEn: 'Pull out scalar 4',
          mathTex: '4(m + 3)(m + 2)',
          noteZh: '從 (4m + 8) 抽出 4 放到最前面，才算徹底分解。',
          noteEn: 'Factor 4 out of (4m + 8) to the front for full marks.',
        },
      ],
    },
    trapZh: '兩大失分位：① 單獨一組 −(2x − 3) 被抽出後漏寫 −1；② 合併出 (3x + 6) 後停筆，忘記再抽出常數 3 寫成 3(2x − 3)(x + 2)！',
    trapEn: 'Two classic traps: (1) forgetting that −(2x − 3) leaves −1 when (2x − 3) is extracted; (2) stopping at (3x + 6) without pulling 3 to the front!',
    warmup: {
      id: 'fac-p2-warm',
      partId: 'part-2',
      mode: 'warmup',
      titleZh: '引導熱身：抽整個公因括號',
      titleEn: 'Guided Warm-up: Extracting a Shared Bracket',
      variants: [
        {
          id: 'fac-p2-warm-v0',
          kind: 'factor',
          promptZh: '因式分解 $(a + 5)(a + 8) + (a + 5)$',
          promptEn: 'Factorise $(a + 5)(a + 8) + (a + 5)$',
          answer: '(a + 5)(a + 9)',
          answerTex: '(a + 5)(a + 9)',
          allowedVars: ['a'],
          hintsZh: [
            '兩大項都有括號 (a + 5)，把它抽到最前面。',
            '第一項剩下 (a + 8)，第二項 +(a + 5) 除以 (a + 5) 剩下 +1，合併為 (a + 9)。',
          ],
          hintsEn: [
            'Both terms contain the bracket (a + 5) — pull it out first.',
            'The first term leaves (a + 8) and the second leaves +1, combining to (a + 9).',
          ],
          stepsZh: ['抽出 $(a + 5)$ 得 $(a + 5)[(a + 8) + 1]$。', '化簡第二個括號得 $(a + 5)(a + 9)$。'],
          stepsEn: ['Extract $(a + 5)$ to get $(a + 5)[(a + 8) + 1]$.', 'Simplify to $(a + 5)(a + 9)$.'],
        },
      ],
    },
    checks: [
      {
        id: 'fac-p2-c1',
        partId: 'part-2',
        mode: 'check',
        titleZh: '獨立檢核 1：減去公因括號 ＋ 再抽常數',
        titleEn: 'Check 1: Subtracted Bracket + Hidden Scalar Factor',
        variants: [
          {
            id: 'fac-p2-c1-v0',
            kind: 'factor',
            promptZh: '因式分解 $(2x - 3)(3x + 7) - (2x - 3)$',
            promptEn: 'Factorise $(2x - 3)(3x + 7) - (2x - 3)$',
            answer: '3(2x - 3)(x + 2)',
            answerTex: '3(2x - 3)(x + 2)',
            allowedVars: ['x'],
            hintsZh: ['抽出 (2x − 3) 後第二個括號是 (3x + 7 − 1) = (3x + 6)，別忘了從 3x + 6 再抽出 3！'],
            hintsEn: ['Extracting (2x − 3) leaves (3x + 7 − 1) = (3x + 6); remember to factor 3 out of (3x + 6)!'],
            stepsZh: ['抽出 $(2x - 3)$ 得 $(2x - 3)(3x + 7 - 1) = (2x - 3)(3x + 6)$。', '從 $(3x + 6)$ 抽出 $3$：答案為 $3(2x - 3)(x + 2)$。'],
            stepsEn: ['Extract $(2x - 3)$: $(2x - 3)(3x + 6)$.', 'Pull out scalar $3$: $3(2x - 3)(x + 2)$.'],
          },
          {
            id: 'fac-p2-c1-v1',
            kind: 'factor',
            promptZh: '因式分解 $(3y + 1)(2y + 5) - (3y + 1)$',
            promptEn: 'Factorise $(3y + 1)(2y + 5) - (3y + 1)$',
            answer: '2(3y + 1)(y + 2)',
            answerTex: '2(3y + 1)(y + 2)',
            allowedVars: ['y'],
            hintsZh: ['抽出 (3y + 1) 得 (2y + 4)，再抽出公因數 2 到最前面。'],
            hintsEn: ['Extracting (3y + 1) gives (2y + 4); pull the scalar factor 2 to the front.'],
            stepsZh: ['$(3y + 1)(2y + 5 - 1) = (3y + 1)(2y + 4)$。', '再抽 $2$ 得 $2(3y + 1)(y + 2)$。'],
            stepsEn: ['$(3y + 1)(2y + 5 - 1) = (3y + 1)(2y + 4) = 2(3y + 1)(y + 2)$.'],
          },
          {
            id: 'fac-p2-c1-v2',
            kind: 'factor',
            promptZh: '因式分解 $(4k - 1)(5k - 4) - (4k - 1)$',
            promptEn: 'Factorise $(4k - 1)(5k - 4) - (4k - 1)$',
            answer: '5(4k - 1)(k - 1)',
            answerTex: '5(4k - 1)(k - 1)',
            allowedVars: ['k'],
            hintsZh: ['抽出 (4k − 1) 得 (5k − 5)，再從 5k − 5 抽出 5！'],
            hintsEn: ['Extracting (4k − 1) leaves (5k − 5); factor out 5!'],
            stepsZh: ['$(4k - 1)(5k - 4 - 1) = (4k - 1)(5k - 5) = 5(4k - 1)(k - 1)$。'],
            stepsEn: ['$(4k - 1)(5k - 5) = 5(4k - 1)(k - 1)$.'],
          },
        ],
      },
      {
        id: 'fac-p2-c2',
        partId: 'part-2',
        mode: 'check',
        titleZh: '獨立檢核 2：反號括號對齊 (b − a) = −(a − b)',
        titleEn: 'Check 2: Opposite-Sign Bracket Flip',
        variants: [
          {
            id: 'fac-p2-c2-v0',
            kind: 'factor',
            promptZh: '因式分解 $3x(a - 2b) + 5y(2b - a)$',
            promptEn: 'Factorise $3x(a - 2b) + 5y(2b - a)$',
            answer: '(a - 2b)(3x - 5y)',
            answerTex: '(a - 2b)(3x - 5y)',
            allowedVars: ['a', 'b', 'x', 'y'],
            hintsZh: ['留意 (2b − a) = −(a − 2b)，所以第二項可改寫為 −5y(a − 2b)。'],
            hintsEn: ['Notice (2b − a) = −(a − 2b), so rewrite +5y(2b − a) as −5y(a − 2b).'],
            stepsZh: ['將 $+5y(2b - a)$ 改寫為 $-5y(a - 2b)$。', '抽出公因括號 $(a - 2b)$，得 $(a - 2b)(3x - 5y)$。'],
            stepsEn: ['Rewrite $+5y(2b - a) = -5y(a - 2b)$.', 'Extract $(a - 2b)$ to obtain $(a - 2b)(3x - 5y)$.'],
          },
          {
            id: 'fac-p2-c2-v1',
            kind: 'factor',
            promptZh: '因式分解 $4m(3p - q) + 7n(q - 3p)$',
            promptEn: 'Factorise $4m(3p - q) + 7n(q - 3p)$',
            answer: '(3p - q)(4m - 7n)',
            answerTex: '(3p - q)(4m - 7n)',
            allowedVars: ['m', 'n', 'p', 'q'],
            hintsZh: ['把 (q − 3p) 改寫成 −(3p − q)，令兩個括號一致。'],
            hintsEn: ['Rewrite (q − 3p) as −(3p − q) so both brackets match.'],
            stepsZh: ['原式 $= 4m(3p - q) - 7n(3p - q) = (3p - q)(4m - 7n)$。'],
            stepsEn: ['$4m(3p - q) - 7n(3p - q) = (3p - q)(4m - 7n)$.'],
          },
          {
            id: 'fac-p2-c2-v2',
            kind: 'factor',
            promptZh: '因式分解 $2u(5v - 2) - 3w(2 - 5v)$',
            promptEn: 'Factorise $2u(5v - 2) - 3w(2 - 5v)$',
            answer: '(5v - 2)(2u + 3w)',
            answerTex: '(5v - 2)(2u + 3w)',
            allowedVars: ['u', 'v', 'w'],
            hintsZh: ['留意 −3w(2 − 5v) = +3w(5v − 2)（負負得正！）。'],
            hintsEn: ['Notice −3w(2 − 5v) = +3w(5v − 2) (minus times minus gives plus!).'],
            stepsZh: ['原式 $= 2u(5v - 2) + 3w(5v - 2) = (5v - 2)(2u + 3w)$。'],
            stepsEn: ['$2u(5v - 2) + 3w(5v - 2) = (5v - 2)(2u + 3w)$.'],
          },
        ],
      },
    ],
    aiStarterZh: '請教我「Part 2：提取公因括號」，特別是遇到 -(x+3) 或反號括號 (2b-a) 時怎樣避免正負號出錯。',
    aiStarterEn: 'Explain Factorisation Part 2 (extracting common brackets), especially handling -(x+3) and opposite-sign brackets like (2b-a).',
    aiChunkTitle: 'Factorisation Part 2 — Multi-Part Common Binomial Brackets',
    aiChunkText:
      'Methodology: Treat multiplied brackets as one term separated only by top-level + or - signs. Extract the identical bracket factor in front, then collect remaining pieces in a second bracket and simplify. Crucial checks: (1) -(A) divided by (A) is -1; (2) (b - a) = -(a - b), flipping the connecting sign; (3) after combining terms inside the new bracket (e.g. (m+3)(4m+8)), ALWAYS check if a numerical GCF pulls out to the front -> 4(m+3)(m+2).',
  },
  {
    id: 'part-3',
    number: 3,
    titleZh: '兩步併項題（(a) 代入 (b) 分組分解）',
    titleEn: 'Two-Part Grouping: Plugging (a) into (b)',
    shortZh: '卷一常客 · 抽負號對齊括號',
    shortEn: 'Paper 1 staple · sign-flip grouping',
    goalZh: '掌握 DSE 卷一甲(1) 最經典的「(a) 結果直代 (b) 前半段 ＋ 後半段抽負公因式對齊括號」流程。',
    goalEn: 'Master the classic Paper 1 Section A(1) structure: substitute Part (a) into Part (b), factor the remaining pair (watching negative GCFs), and extract the matching bracket.',
    stepsZh: [
      '看到 (b) 開頭與 (a) 完全相同時，**直接把 (a) 已分解的結果抄入 (b) 前半段**。',
      '將 (b) 餘下兩項獨立抽公因式；若首項帶減號，通常要**抽出負公因式**，使括號內正負號反轉並與 (a) 的括號完全一致。',
      '兩大組出現**同一個公因括號**後，按 Part 2 把該括號抽出即可。',
    ],
    stepsEn: [
      'When Part (b) starts with the exact expression from Part (a), **substitute your Part (a) factorised form directly**.',
      'Factorise the remaining two terms separately; if they lead with a minus sign, **extract a negative GCF** so the signs flip to match Part (a)’s bracket.',
      'Extract the **matching binomial bracket** shared by both halves.',
    ],
    workedExample: {
      promptTex: '\\text{(a) } 6x^2 - 15xy = 3x(2x - 5y) \\quad\\Longrightarrow\\quad \\text{(b) } 6x^2 - 15xy - 4xz + 10yz',
      answerTex: '(2x - 5y)(3x - 2z)',
      steps: [
        {
          labelZh: '代入 (a) 結果',
          labelEn: 'Plug in (a)',
          mathTex: '\\underbrace{3x(2x - 5y)}_{\\text{由 (a)}} - 4xz + 10yz',
          noteZh: '前半段不用重做，直接沿用 3x(2x - 5y)。',
          noteEn: 'Reuse Part (a) directly for the first two terms.',
        },
        {
          labelZh: '後兩項抽負號',
          labelEn: 'Factor -2z from tail',
          mathTex: '3x(2x - 5y) - 2z(2x - 5y)',
          noteZh: '注意 +10yz ÷ (-2z) = -5y，正號變負號，括號成功對齊 (2x - 5y)！',
          noteEn: '+10yz ÷ (-2z) = -5y: the sign flips to match (2x - 5y)!',
        },
        {
          labelZh: '抽共同括號',
          labelEn: 'Extract common bracket',
          mathTex: '(2x - 5y)(3x - 2z)',
          noteZh: '兩組共有的 (2x - 5y) 抽出即完成。',
          noteEn: 'Pull out (2x - 5y) to finish.',
        },
      ],
    },
    trapZh: '從 −4xz + 10yz 抽出 −2z 時，最易忘記把 +10yz 變號寫成 +5y（那樣得到 (2x + 5y) 就與前半段對不上！兩個括號對不上時，九成是正負號沒轉）。',
    trapEn: 'When pulling −2z out of −4xz + 10yz, forgetting to flip +10yz to −5y produces (2x + 5y), which fails to match (2x − 5y)! If brackets almost match except for a sign, pull out a negative factor.',
    warmup: {
      id: 'fac-p3-warm',
      partId: 'part-3',
      mode: 'warmup',
      titleZh: '引導熱身：四項兩兩分組（併項法）',
      titleEn: 'Guided Warm-up: Four-Term Grouping',
      variants: [
        {
          id: 'fac-p3-warm-v0',
          kind: 'factor',
          promptZh: '因式分解 $4ab + 12b + 5a + 15$',
          promptEn: 'Factorise $4ab + 12b + 5a + 15$',
          answer: '(a + 3)(4b + 5)',
          answerTex: '(a + 3)(4b + 5)',
          allowedVars: ['a', 'b'],
          hintsZh: [
            '前兩項 4ab + 12b 抽出 4b 得 4b(a + 3)。',
            '後兩項 5a + 15 抽出 +5 得 +5(a + 3)，再抽出共同括號 (a + 3)。',
          ],
          hintsEn: [
            'From the first pair 4ab + 12b, extract 4b to get 4b(a + 3).',
            'From 5a + 15, extract +5 to get +5(a + 3), then extract (a + 3).',
          ],
          stepsZh: ['$4b(a + 3) + 5(a + 3) = (a + 3)(4b + 5)$。'],
          stepsEn: ['$4b(a + 3) + 5(a + 3) = (a + 3)(4b + 5)$.'],
        },
      ],
    },
    checks: [
      {
        id: 'fac-p3-c1',
        partId: 'part-3',
        mode: 'check',
        titleZh: '獨立檢核 1：卷一「由此」(a) 代入 (b) 抽負號',
        titleEn: 'Check 1: "Hence" Part (a) into Part (b) with Negative Factor',
        variants: [
          {
            id: 'fac-p3-c1-v0',
            kind: 'factor',
            contextZh: '已知 (a) $8p^2 - 12pq = 4p(2p - 3q)$。由此：',
            contextEn: 'Given Part (a): $8p^2 - 12pq = 4p(2p - 3q)$. Hence:',
            promptZh: '因式分解 $8p^2 - 12pq - 6pr + 9qr$',
            promptEn: 'Factorise $8p^2 - 12pq - 6pr + 9qr$',
            answer: '(2p - 3q)(4p - 3r)',
            answerTex: '(2p - 3q)(4p - 3r)',
            allowedVars: ['p', 'q', 'r'],
            hintsZh: ['前半代入 4p(2p − 3q)；後兩項 −6pr + 9qr 抽出 −3r（留意 +9qr ÷ (−3r) = −3q）！'],
            hintsEn: ['Substitute 4p(2p − 3q) first; from −6pr + 9qr extract −3r (so +9qr ÷ (−3r) = −3q)!'],
            stepsZh: ['代入 (a) 得 $4p(2p - 3q) - 6pr + 9qr$。', '後兩項抽 $-3r$：$4p(2p - 3q) - 3r(2p - 3q) = (2p - 3q)(4p - 3r)$。'],
            stepsEn: ['Substitute (a): $4p(2p - 3q) - 3r(2p - 3q) = (2p - 3q)(4p - 3r)$.'],
          },
          {
            id: 'fac-p3-c1-v1',
            kind: 'factor',
            contextZh: '已知 (a) $10m^2 + 15mn = 5m(2m + 3n)$。由此：',
            contextEn: 'Given Part (a): $10m^2 + 15mn = 5m(2m + 3n)$. Hence:',
            promptZh: '因式分解 $10m^2 + 15mn - 4mk - 6nk$',
            promptEn: 'Factorise $10m^2 + 15mn - 4mk - 6nk$',
            answer: '(2m + 3n)(5m - 2k)',
            answerTex: '(2m + 3n)(5m - 2k)',
            allowedVars: ['m', 'n', 'k'],
            hintsZh: ['前半用 5m(2m + 3n)；後兩項 −4mk − 6nk 抽出 −2k 得 −2k(2m + 3n)。'],
            hintsEn: ['Use 5m(2m + 3n) for the first pair, and extract −2k from −4mk − 6nk.'],
            stepsZh: ['$5m(2m + 3n) - 2k(2m + 3n) = (2m + 3n)(5m - 2k)$。'],
            stepsEn: ['$5m(2m + 3n) - 2k(2m + 3n) = (2m + 3n)(5m - 2k)$.'],
          },
          {
            id: 'fac-p3-c1-v2',
            kind: 'factor',
            contextZh: '已知 (a) $12u^2 - 8uv = 4u(3u - 2v)$。由此：',
            contextEn: 'Given Part (a): $12u^2 - 8uv = 4u(3u - 2v)$. Hence:',
            promptZh: '因式分解 $12u^2 - 8uv - 9uw + 6vw$',
            promptEn: 'Factorise $12u^2 - 8uv - 9uw + 6vw$',
            answer: '(3u - 2v)(4u - 3w)',
            answerTex: '(3u - 2v)(4u - 3w)',
            allowedVars: ['u', 'v', 'w'],
            hintsZh: ['後兩項 −9uw + 6vw 抽出 −3w，括號內變成 (3u − 2v)。'],
            hintsEn: ['Extract −3w from −9uw + 6vw so the bracket becomes (3u − 2v).'],
            stepsZh: ['$4u(3u - 2v) - 3w(3u - 2v) = (3u - 2v)(4u - 3w)$。'],
            stepsEn: ['$4u(3u - 2v) - 3w(3u - 2v) = (3u - 2v)(4u - 3w)$.'],
          },
        ],
      },
      {
        id: 'fac-p3-c2',
        partId: 'part-3',
        mode: 'check',
        titleZh: '獨立檢核 2：四項自行配對併項',
        titleEn: 'Check 2: Independent Four-Term Grouping',
        variants: [
          {
            id: 'fac-p3-c2-v0',
            kind: 'factor',
            promptZh: '因式分解 $5x^2y - 10xy - 3x + 6$',
            promptEn: 'Factorise $5x^2y - 10xy - 3x + 6$',
            answer: '(x - 2)(5xy - 3)',
            answerTex: '(x - 2)(5xy - 3)',
            allowedVars: ['x', 'y'],
            hintsZh: ['前兩項抽 5xy 得 5xy(x − 2)；後兩項 −3x + 6 抽 −3 得 −3(x − 2)。'],
            hintsEn: ['Extract 5xy from the first two terms and −3 from −3x + 6.'],
            stepsZh: ['$5xy(x - 2) - 3(x - 2) = (x - 2)(5xy - 3)$。'],
            stepsEn: ['$5xy(x - 2) - 3(x - 2) = (x - 2)(5xy - 3)$.'],
          },
          {
            id: 'fac-p3-c2-v1',
            kind: 'factor',
            promptZh: '因式分解 $7a^2b + 21ab - 2a - 6$',
            promptEn: 'Factorise $7a^2b + 21ab - 2a - 6$',
            answer: '(a + 3)(7ab - 2)',
            answerTex: '(a + 3)(7ab - 2)',
            allowedVars: ['a', 'b'],
            hintsZh: ['前兩項抽 7ab，後兩項 −2a − 6 抽 −2。'],
            hintsEn: ['Extract 7ab from the first pair and −2 from −2a − 6.'],
            stepsZh: ['$7ab(a + 3) - 2(a + 3) = (a + 3)(7ab - 2)$。'],
            stepsEn: ['$7ab(a + 3) - 2(a + 3) = (a + 3)(7ab - 2)$.'],
          },
          {
            id: 'fac-p3-c2-v2',
            kind: 'factor',
            promptZh: '因式分解 $6r^2s - 18rs - 5r + 15$',
            promptEn: 'Factorise $6r^2s - 18rs - 5r + 15$',
            answer: '(r - 3)(6rs - 5)',
            answerTex: '(r - 3)(6rs - 5)',
            allowedVars: ['r', 's'],
            hintsZh: ['前兩項抽 6rs 得 6rs(r − 3)；後兩項抽 −5 得 −5(r − 3)。'],
            hintsEn: ['Extract 6rs from the first pair and −5 from −5r + 15.'],
            stepsZh: ['$6rs(r - 3) - 5(r - 3) = (r - 3)(6rs - 5)$。'],
            stepsEn: ['$6rs(r - 3) - 5(r - 3) = (r - 3)(6rs - 5)$.'],
          },
        ],
      },
    ],
    aiStarterZh: '請拆解 DSE 卷一常見的「Part 3：(a) 代入 (b) 兩步因式分解題」，教我怎樣判斷後半段要不要抽負號。',
    aiStarterEn: 'Show me how to tackle 2-part HKDSE Paper 1 grouping questions (plugging Part (a) into Part (b)) and how to get the negative sign right.',
    aiChunkTitle: 'Factorisation Part 3 — Two-Part Grouping Questions ((a) into (b))',
    aiChunkText:
      'Methodology for 2-part Paper 1 questions: Part (a) asks to factorise an expression (via GCF, quadratic, or squares). Part (b) repeats that exact expression plus two extra terms. Step 1: Replace the first part of (b) with the answer from (a). Step 2: Factorise the remaining two terms so that the bracket matches Part (a) — if signs are opposite, extract a negative common factor (e.g. -4xz + 10yz = -2z(2x - 5y)). Step 3: Pull out the shared binomial bracket, and check whether the second bracket hides a difference of two squares.',
  },
  {
    id: 'part-4',
    number: 4,
    titleZh: '單變數二次三項式（先抽公因式 ＋ 求根反推括號）',
    titleEn: 'Single-Variable Quadratics (GCF First + Root-to-Bracket)',
    shortZh: '鐵律先抽公因式 · 分數根反推整係數',
    shortEn: 'GCF first · integer bracket reconstruction',
    goalZh: '熟練把 ax² + bx + c 分解成整係數括號，並避開「直接求根漏掉最前常數公因數」的大陷阱。',
    goalEn: 'Factorise ax² + bx + c cleanly into integer brackets without losing leading scalar or variable common factors.',
    stepsZh: [
      '**鐵律第一步**：先檢查三項有沒有數字公因數或共同字母（如 $3a^4 - 12a^3 - 36a^2 = 3a^2(a^2 - 4a - 12)$），先抽到最前並全程保留！',
      '用十字相乘法，或由對應方程 $ax^2 + bx + c = 0$ 的根反推括號（整數根 $x = 6 \\Rightarrow (x - 6)$；分數根 $x = -\\frac{4}{3} \\Rightarrow 3x = -4 \\Rightarrow (3x + 4)$）。',
      '**乘開首項驗算**：確認各括號 $x$ 項相乘（連同最前公因式）等於原題的 $ax^2$，且括號內絕不留分數或小數。',
    ],
    stepsEn: [
      '**Golden Rule Step 1**: Check and extract any numerical or variable GCF FIRST (e.g. $3a^4 - 12a^3 - 36a^2 = 3a^2(a^2 - 4a - 12)$) and keep it in front!',
      'Use cross-multiplication or reconstruct integer brackets backward from the roots of $ax^2 + bx + c = 0$ (integer root $x = 6 \\Rightarrow (x - 6)$; fractional root $x = -\\frac{4}{3} \\Rightarrow 3x = -4 \\Rightarrow (3x + 4)$).',
      '**Check leading product**: Multiply the leading terms of your brackets (times any extracted GCF) to confirm they match $ax^2$, with zero fractions or decimals.',
    ],
    workedExample: {
      promptTex: '6x^2 - 7x - 20',
      answerTex: '(2x - 5)(3x + 4)',
      steps: [
        {
          labelZh: '檢查公因式',
          labelEn: 'Check GCF',
          mathTex: '\\gcd(6, 7, 20) = 1',
          noteZh: '沒有數字或字母公因式，可直接分解二次三項式。',
          noteEn: 'No scalar or variable GCF; proceed to quadratic factoring.',
        },
        {
          labelZh: '十字相乘／求根反推',
          labelEn: 'Roots to brackets',
          mathTex: 'x = \\frac{5}{2} \\Rightarrow 2x - 5 = 0; \\quad x = -\\frac{4}{3} \\Rightarrow 3x + 4 = 0',
          noteZh: '把分母乘過去移項，正負號反轉化為整係數括號！',
          noteEn: 'Clear denominators first so brackets have integer coefficients!',
        },
        {
          labelZh: '首尾中項核對',
          labelEn: 'Verify expansion',
          mathTex: '(2x - 5)(3x + 4) = 6x^2 + 8x - 15x - 20 = 6x^2 - 7x - 20',
          noteZh: '首項 6x²、尾項 -20、中項 -7x 全部吻合。',
          noteEn: 'Leading 6x², constant -20, and middle -7x all match.',
        },
      ],
    },
    trapZh: '若原題是 2m² − 6m − 20，直接求根只會見到 m = 5 和 m = −2，若寫成 (m − 5)(m + 2) 乘開只有 m² − 3m − 10，漏了最前面的 2 就整題失分！永遠先抽公因式！',
    trapEn: 'For 2m² − 6m − 20, solving = 0 gives roots 5 and −2, which only reconstructs (m − 5)(m + 2) = m² − 3m − 10 — losing the factor 2! Always pull out the GCF BEFORE solving!',
    warmup: {
      id: 'fac-p4-warm',
      partId: 'part-4',
      mode: 'warmup',
      titleZh: '引導熱身：先抽常數公因式再分解二次式',
      titleEn: 'Guided Warm-up: Extract Scalar GCF Before Quadratic Factoring',
      variants: [
        {
          id: 'fac-p4-warm-v0',
          kind: 'factor',
          promptZh: '因式分解 $2m^2 - 6m - 20$',
          promptEn: 'Factorise $2m^2 - 6m - 20$',
          answer: '2(m - 5)(m + 2)',
          answerTex: '2(m - 5)(m + 2)',
          allowedVars: ['m'],
          hintsZh: [
            '鐵律第一步：三項係數 2、−6、−20 都是偶數，先抽出公因數 2 得 2(m² − 3m − 10)！',
            '再把 m² − 3m − 10 分解為 (m − 5)(m + 2)，記得保留最前面的 2。',
          ],
          hintsEn: [
            'Golden Rule Step 1: 2, −6, −20 are all even — pull out 2 first to get 2(m² − 3m − 10)!',
            'Factorise m² − 3m − 10 into (m − 5)(m + 2) and keep the 2 in front.',
          ],
          stepsZh: ['先抽公因數 $2$：$2(m^2 - 3m - 10)$。', '分解二次式得 $2(m - 5)(m + 2)$。'],
          stepsEn: ['Extract $2$ first: $2(m^2 - 3m - 10) = 2(m - 5)(m + 2)$.'],
        },
      ],
    },
    checks: [
      {
        id: 'fac-p4-c1',
        partId: 'part-4',
        mode: 'check',
        titleZh: '獨立檢核 1：首項係數不為 1 的二次三項式',
        titleEn: 'Check 1: Non-Monic Quadratic Trinomial',
        variants: [
          {
            id: 'fac-p4-c1-v0',
            kind: 'factor',
            promptZh: '因式分解 $6x^2 + 11x - 10$',
            promptEn: 'Factorise $6x^2 + 11x - 10$',
            answer: '(2x + 5)(3x - 2)',
            answerTex: '(2x + 5)(3x - 2)',
            allowedVars: ['x'],
            hintsZh: ['對應方程 6x² + 11x − 10 = 0 的根為 −5/2 與 2/3，反推整係數括號 (2x + 5) 與 (3x − 2)。'],
            hintsEn: ['Roots of 6x² + 11x − 10 = 0 are −5/2 and 2/3, giving integer brackets (2x + 5) and (3x − 2).'],
            stepsZh: ['無公因數；十字相乘 $2x \\cdot (-2) + 3x \\cdot 5 = +11x$。', '答案為 $(2x + 5)(3x - 2)$。'],
            stepsEn: ['Cross-multiply: $(2x + 5)(3x - 2) = 6x^2 - 4x + 15x - 10 = 6x^2 + 11x - 10$.'],
          },
          {
            id: 'fac-p4-c1-v1',
            kind: 'factor',
            promptZh: '因式分解 $8y^2 - 10y - 3$',
            promptEn: 'Factorise $8y^2 - 10y - 3$',
            answer: '(2y - 3)(4y + 1)',
            answerTex: '(2y - 3)(4y + 1)',
            allowedVars: ['y'],
            hintsZh: ['對應根為 3/2 與 −1/4，反推整係數括號 (2y − 3) 與 (4y + 1)。'],
            hintsEn: ['Roots are 3/2 and −1/4, giving integer brackets (2y − 3)(4y + 1).'],
            stepsZh: ['十字相乘得 $(2y - 3)(4y + 1)$（展開中項 $2y - 12y = -10y$）。'],
            stepsEn: ['$(2y - 3)(4y + 1) = 8y^2 + 2y - 12y - 3 = 8y^2 - 10y - 3$.'],
          },
          {
            id: 'fac-p4-c1-v2',
            kind: 'factor',
            promptZh: '因式分解 $12k^2 - 17k + 6$',
            promptEn: 'Factorise $12k^2 - 17k + 6$',
            answer: '(3k - 2)(4k - 3)',
            answerTex: '(3k - 2)(4k - 3)',
            allowedVars: ['k'],
            hintsZh: ['尾項 +6 為正、中項 −17k 為負，兩個常數皆為負：試 (3k − 2)(4k − 3)。'],
            hintsEn: ['Constant +6 > 0 and middle −17k < 0 mean two negative constants: check (3k − 2)(4k − 3).'],
            stepsZh: ['展開核對：$(3k - 2)(4k - 3) = 12k^2 - 9k - 8k + 6 = 12k^2 - 17k + 6$。'],
            stepsEn: ['$(3k - 2)(4k - 3) = 12k^2 - 17k + 6$.'],
          },
        ],
      },
      {
        id: 'fac-p4-c2',
        partId: 'part-4',
        mode: 'check',
        titleZh: '獨立檢核 2：高次項先抽公因式再分解二次式',
        titleEn: 'Check 2: Higher Power GCF + Quadratic Factorisation',
        variants: [
          {
            id: 'fac-p4-c2-v0',
            kind: 'factor',
            promptZh: '因式分解 $3a^4 - 12a^3 - 36a^2$',
            promptEn: 'Factorise $3a^4 - 12a^3 - 36a^2$',
            answer: '3a^2(a - 6)(a + 2)',
            answerTex: '3a^2(a - 6)(a + 2)',
            allowedVars: ['a'],
            hintsZh: ['先抽出最大公因式 3a²，括號內變成二次三項式 a² − 4a − 12！'],
            hintsEn: ['First extract the GCF 3a², turning the bracket into the quadratic a² − 4a − 12!'],
            stepsZh: ['第一步抽 $3a^2$：$3a^2(a^2 - 4a - 12)$。', '第二步分解二次式：$3a^2(a - 6)(a + 2)$。'],
            stepsEn: ['Step 1: $3a^2(a^2 - 4a - 12)$.', 'Step 2: $3a^2(a - 6)(a + 2)$.'],
          },
          {
            id: 'fac-p4-c2-v1',
            kind: 'factor',
            promptZh: '因式分解 $2p^4 + 10p^3 - 28p^2$',
            promptEn: 'Factorise $2p^4 + 10p^3 - 28p^2$',
            answer: '2p^2(p + 7)(p - 2)',
            answerTex: '2p^2(p + 7)(p - 2)',
            allowedVars: ['p'],
            hintsZh: ['先抽 2p² 得 2p²(p² + 5p − 14)，再分解括號內的二次三項式。'],
            hintsEn: ['Extract 2p² first to get 2p²(p² + 5p − 14), then factorise the quadratic.'],
            stepsZh: ['$2p^2(p^2 + 5p - 14) = 2p^2(p + 7)(p - 2)$。'],
            stepsEn: ['$2p^2(p^2 + 5p - 14) = 2p^2(p + 7)(p - 2)$.'],
          },
          {
            id: 'fac-p4-c2-v2',
            kind: 'factor',
            promptZh: '因式分解 $5t^3 - 30t^2 + 45t$',
            promptEn: 'Factorise $5t^3 - 30t^2 + 45t$',
            answer: '5t(t - 3)^2',
            answerTex: '5t(t - 3)^2',
            allowedVars: ['t'],
            hintsZh: ['先抽 5t 得 5t(t² − 6t + 9)，括號內是完全平方式 (t − 3)²！'],
            hintsEn: ['Extract 5t to get 5t(t² − 6t + 9), which is a repeated-root perfect square (t − 3)²!'],
            stepsZh: ['$5t(t^2 - 6t + 9) = 5t(t - 3)^2$。'],
            stepsEn: ['$5t(t^2 - 6t + 9) = 5t(t - 3)^2$.'],
          },
        ],
      },
    ],
    aiStarterZh: '請教我「Part 4：單變數二次三項式因式分解」，特別是分數根怎樣反推整係數括號、以及為何必須先抽公因式。',
    aiStarterEn: 'Teach me Factorisation Part 4 (single-variable quadratics): how to turn fractional roots into integer brackets and why extracting the GCF first is mandatory.',
    aiChunkTitle: 'Factorisation Part 4 — Single-Variable Quadratics (ax² + bx + c)',
    aiChunkText:
      'Golden Rule: ALWAYS extract numerical and variable common factors BEFORE using quadratic root-finding or cross-multiplication (e.g. 2m² - 6m - 20 -> pull out 2 first; 3a⁴ - 12a³ - 36a² -> pull out 3a² first), because solving ax²+bx+c=0 divides away constant multipliers! Backward root-to-bracket reconstruction: integer root x = r gives (x - r); fractional root x = p/q -> qx = p -> (qx - p) (never leave fractions or decimals in brackets); repeated root gives (qx - p)². Note: do not invent unverified calculator model button sequences — explain the mathematical root-to-factor reconstruction clearly.',
  },
  {
    id: 'part-5',
    number: 5,
    titleZh: '雙變數齊次二次式（ar² + brs + cs²）',
    titleEn: 'Two-Variable Homogeneous Quadratics (ar² + brs + cs²)',
    shortZh: '係數解法同單變數 · 尾項補第二變數',
    shortEn: 'Same coefficient method · attach 2nd variable',
    goalZh: '把雙變數二次式 ar² + brs + cs² 轉化為熟悉的單變數分解，並在每個括號尾項準確補回第二變數。',
    goalEn: 'Factorise ar² + brs + cs² with the exact same quadratic method while attaching the second variable to each constant term.',
    stepsZh: [
      '照樣先做**第一步：檢查並抽出數字／字母公因式**！',
      '暫時只看係數 $(a, b, c)$，按 Part 4 完全相同的方法找出兩個整係數括號（如 $(2r - 3)(3r - 2)$）。',
      '在每個括號的**第二項（常數位置）補上第二個變數 $s$**，寫成 $(2r - 3s)(3r - 2s)$，並核對尾項相乘是否還原 $cs^2$。',
    ],
    stepsEn: [
      'Still start with **Step 1: check and extract any numerical/variable GCF**!',
      'Using coefficients $(a, b, c)$ exactly as in Part 4, find the two integer brackets (e.g. $(2r - 3)(3r - 2)$).',
      '**Attach the second variable $s$** to the constant term in BOTH brackets: $(2r - 3s)(3r - 2s)$, checking the tail product equals $cs^2$.',
    ],
    workedExample: {
      promptTex: '18x^2 - 39xy + 18y^2',
      answerTex: '3(2x - 3y)(3x - 2y)',
      steps: [
        {
          labelZh: '先抽公因數 3',
          labelEn: 'Extract GCF 3',
          mathTex: '3(6x^2 - 13xy + 6y^2)',
          noteZh: '18、-39、18 都能被 3 整除，務必先抽 3！',
          noteEn: '18, -39, 18 are all divisible by 3 — extract 3 first!',
        },
        {
          labelZh: '按 (6, -13, 6) 分解',
          labelEn: 'Factor (6, -13, 6)',
          mathTex: '6x^2 - 13x + 6 = (2x - 3)(3x - 2)',
          noteZh: '對應根 3/2 與 2/3，反推 (2x - 3)(3x - 2)。',
          noteEn: 'Roots 3/2 and 2/3 give (2x - 3)(3x - 2).',
        },
        {
          labelZh: '補回第二變數 y',
          labelEn: 'Attach variable y',
          mathTex: '3(2x - 3y)(3x - 2y)',
          noteZh: '核對尾項：3 × (-3y)(-2y) = +18y²，中項 3(-4xy - 9xy) = -39xy。',
          noteEn: 'Check tail: 3(-3y)(-2y) = +18y² and middle: 3(-13xy) = -39xy.',
        },
      ],
    },
    trapZh: '最常見粗心錯是算出 (2x − 3)(3x − 2) 後直接交卷，忘記在 −3 和 −2 後面補回 y！寫完一定要看尾項相乘有沒有 y²。',
    trapEn: 'The #1 careless error is writing (2x − 3)(3x − 2) and forgetting to attach y to −3 and −2! Always check that the tail product has y².',
    warmup: {
      id: 'fac-p5-warm',
      partId: 'part-5',
      mode: 'warmup',
      titleZh: '引導熱身：基礎雙變數二次式',
      titleEn: 'Guided Warm-up: Basic Two-Variable Quadratic',
      variants: [
        {
          id: 'fac-p5-warm-v0',
          kind: 'factor',
          promptZh: '因式分解 $x^2 - 5xy + 6y^2$',
          promptEn: 'Factorise $x^2 - 5xy + 6y^2$',
          answer: '(x - 2y)(x - 3y)',
          answerTex: '(x - 2y)(x - 3y)',
          allowedVars: ['x', 'y'],
          hintsZh: [
            '把它看成 x² − 5x + 6 = (x − 2)(x − 3)，然後在常數 −2 與 −3 後面補上 y！',
          ],
          hintsEn: [
            'Treat the coefficients like x² − 5x + 6 = (x − 2)(x − 3), then attach y to −2 and −3!',
          ],
          stepsZh: ['由 $x^2 - 5x + 6 = (x - 2)(x - 3)$，補上第二變數 $y$ 得 $(x - 2y)(x - 3y)$。'],
          stepsEn: ['From $(x - 2)(x - 3)$, attach $y$ to get $(x - 2y)(x - 3y)$.'],
        },
      ],
    },
    checks: [
      {
        id: 'fac-p5-c1',
        partId: 'part-5',
        mode: 'check',
        titleZh: '獨立檢核 1：非單一首項雙變數二次式',
        titleEn: 'Check 1: Non-Monic Two-Variable Quadratic',
        variants: [
          {
            id: 'fac-p5-c1-v0',
            kind: 'factor',
            promptZh: '因式分解 $6r^2 + 5rs - 6s^2$',
            promptEn: 'Factorise $6r^2 + 5rs - 6s^2$',
            answer: '(2r + 3s)(3r - 2s)',
            answerTex: '(2r + 3s)(3r - 2s)',
            allowedVars: ['r', 's'],
            hintsZh: ['按係數 (6, 5, −6) 分解得 (2r + 3)(3r − 2)，記得在兩個常數後附上 s！'],
            hintsEn: ['Factor coefficients (6, 5, −6) into (2r + 3)(3r − 2) and attach s to both constants!'],
            stepsZh: ['十字相乘：$2r \\cdot (-2s) + 3r \\cdot 3s = +5rs$。', '答案為 $(2r + 3s)(3r - 2s)$。'],
            stepsEn: ['$(2r + 3s)(3r - 2s) = 6r^2 - 4rs + 9rs - 6s^2 = 6r^2 + 5rs - 6s^2$.'],
          },
          {
            id: 'fac-p5-c1-v1',
            kind: 'factor',
            promptZh: '因式分解 $10a^2 - 11ab - 6b^2$',
            promptEn: 'Factorise $10a^2 - 11ab - 6b^2$',
            answer: '(2a - 3b)(5a + 2b)',
            answerTex: '(2a - 3b)(5a + 2b)',
            allowedVars: ['a', 'b'],
            hintsZh: ['係數 (10, −11, −6) 對應 (2a − 3)(5a + 2)，在常數後補上 b。'],
            hintsEn: ['Coefficients (10, −11, −6) give (2a − 3)(5a + 2); attach b to the constants.'],
            stepsZh: ['$(2a - 3b)(5a + 2b) = 10a^2 + 4ab - 15ab - 6b^2 = 10a^2 - 11ab - 6b^2$。'],
            stepsEn: ['$(2a - 3b)(5a + 2b) = 10a^2 - 11ab - 6b^2$.'],
          },
          {
            id: 'fac-p5-c1-v2',
            kind: 'factor',
            promptZh: '因式分解 $8m^2 - 14mn + 3n^2$',
            promptEn: 'Factorise $8m^2 - 14mn + 3n^2$',
            answer: '(2m - 3n)(4m - n)',
            answerTex: '(2m - 3n)(4m - n)',
            allowedVars: ['m', 'n'],
            hintsZh: ['係數 (8, −14, 3) 對應 (2m − 3)(4m − 1)，補上 n 得 (2m − 3n)(4m − n)。'],
            hintsEn: ['Coefficients (8, −14, 3) give (2m − 3n)(4m − n).'],
            stepsZh: ['$(2m - 3n)(4m - n) = 8m^2 - 2mn - 12mn + 3n^2 = 8m^2 - 14mn + 3n^2$。'],
            stepsEn: ['$(2m - 3n)(4m - n) = 8m^2 - 14mn + 3n^2$.'],
          },
        ],
      },
      {
        id: 'fac-p5-c2',
        partId: 'part-5',
        mode: 'check',
        titleZh: '獨立檢核 2：先抽公因數 ＋ 雙變數二次式',
        titleEn: 'Check 2: Scalar GCF + Two-Variable Quadratic',
        variants: [
          {
            id: 'fac-p5-c2-v0',
            kind: 'factor',
            promptZh: '因式分解 $12p^2 - 26pq + 12q^2$',
            promptEn: 'Factorise $12p^2 - 26pq + 12q^2$',
            answer: '2(2p - 3q)(3p - 2q)',
            answerTex: '2(2p - 3q)(3p - 2q)',
            allowedVars: ['p', 'q'],
            hintsZh: ['先抽出公因數 2 得 2(6p² − 13pq + 6q²)，再分解雙變數二次式！'],
            hintsEn: ['Extract scalar GCF 2 first: 2(6p² − 13pq + 6q²), then factorise!'],
            stepsZh: ['先抽 $2$：$2(6p^2 - 13pq + 6q^2)$。', '分解得 $2(2p - 3q)(3p - 2q)$。'],
            stepsEn: ['$2(6p^2 - 13pq + 6q^2) = 2(2p - 3q)(3p - 2q)$.'],
          },
          {
            id: 'fac-p5-c2-v1',
            kind: 'factor',
            promptZh: '因式分解 $15u^2 + 5uv - 10v^2$',
            promptEn: 'Factorise $15u^2 + 5uv - 10v^2$',
            answer: '5(u + v)(3u - 2v)',
            answerTex: '5(u + v)(3u - 2v)',
            allowedVars: ['u', 'v'],
            hintsZh: ['先抽公因數 5 得 5(3u² + uv − 2v²)，再分解括號！'],
            hintsEn: ['Pull out 5 first to get 5(3u² + uv − 2v²), then factorise!'],
            stepsZh: ['$5(3u^2 + uv - 2v^2) = 5(u + v)(3u - 2v)$。'],
            stepsEn: ['$5(3u^2 + uv - 2v^2) = 5(u + v)(3u - 2v)$.'],
          },
          {
            id: 'fac-p5-c2-v2',
            kind: 'factor',
            promptZh: '因式分解 $18x^2 - 48xy + 32y^2$',
            promptEn: 'Factorise $18x^2 - 48xy + 32y^2$',
            answer: '2(3x - 4y)^2',
            answerTex: '2(3x - 4y)^2',
            allowedVars: ['x', 'y'],
            hintsZh: ['先抽公因數 2 得 2(9x² − 24xy + 16y²)，括號內是完全平方式 (3x − 4y)²！'],
            hintsEn: ['Extract 2 first: 2(9x² − 24xy + 16y²) = 2(3x − 4y)²!'],
            stepsZh: ['$2(9x^2 - 24xy + 16y^2) = 2(3x - 4y)^2$。'],
            stepsEn: ['$2(9x^2 - 24xy + 16y^2) = 2(3x - 4y)^2$.'],
          },
        ],
      },
    ],
    aiStarterZh: '請教我「Part 5：雙變數齊次二次式（如 6r² + 5rs - 6s²）」，怎樣把它當成單變數二次式處理又不漏掉第二個字母？',
    aiStarterEn: 'Explain Factorisation Part 5 (two-variable quadratics like 6r² + 5rs - 6s²) and how to avoid dropping the second variable.',
    aiChunkTitle: 'Factorisation Part 5 — Two-Variable Quadratics (ar² + brs + cs²)',
    aiChunkText:
      'Methodology: Homogeneous two-variable quadratics ar² + brs + cs² work identically to single-variable quadratics! Step 1: Extract any GCF first (e.g. 12p² - 26pq + 12q² -> pull out 2). Step 2: Use coefficients (a, b, c) to find the single-variable factors (e.g. (2p - 3)(3p - 2)). Step 3: Attach the second variable (q or s) onto the constant term inside each bracket -> (2p - 3q)(3p - 2q). Remind students to verify the tail product (-3q)(-2q) = +6q².',
  },
  {
    id: 'part-6',
    number: 6,
    titleZh: '平方差恆等式與負號拆括號陷阱（A² − B²）',
    titleEn: 'Difference of Two Squares & Sign Traps (A² − B²)',
    shortZh: '先寫中括號 [A+B][A−B] 再拆負號',
    shortEn: 'Use [A + B][A − B] before distributing −',
    goalZh: '徹底掌握 A² − B² = (A + B)(A − B)，特別是 B 為整個括號時用中括號防止負號漏變號。',
    goalEn: 'Apply A² − B² = (A + B)(A − B) across coefficients and brackets without falling into the negative-sign distribution trap.',
    stepsZh: [
      '**先抽公因式**（如 $3x^3 - 27xy^2 = 3x(x^2 - 9y^2)$），再確認剩餘兩項是否「平方減平方」$A^2 - B^2$。',
      '對係數開平方根認清底數 $A$ 與 $B$（例如 $25 = 5^2$，$9y^2 = (3y)^2$）。',
      '若 $B$ 是括號（如 $25 - (3x - 2y)^2$），**必先寫中括號 $[A + (\\dots)][A - (\\dots)]$**，第二步才把減號乘入括號內**令每一項變號**！',
    ],
    stepsEn: [
      '**Extract any GCF first** (e.g. $3x^3 - 27xy^2 = 3x(x^2 - 9y^2)$), then confirm you have a difference of two squares $A^2 - B^2$.',
      'Take square roots of coefficients to identify bases $A$ and $B$ (e.g. $25 = 5^2$, $9y^2 = (3y)^2$).',
      'When $B$ is a bracket (e.g. $25 - (3x - 2y)^2$), **write outer square brackets $[A + (\\dots)][A - (\\dots)]$ first**, then distribute the minus sign to **every term** inside!',
    ],
    workedExample: {
      promptTex: '25 - (3x - 2y)^2',
      answerTex: '(5 + 3x - 2y)(5 - 3x + 2y)',
      steps: [
        {
          labelZh: '認清底數 A, B',
          labelEn: 'Identify A and B',
          mathTex: '5^2 - (3x - 2y)^2 \\quad (A = 5,\\; B = 3x - 2y)',
          noteZh: '把常數 25 改寫為 5²。',
          noteEn: 'Rewrite 25 as 5².',
        },
        {
          labelZh: '先套中括號',
          labelEn: 'Outer brackets first',
          mathTex: '[5 + (3x - 2y)][5 - (3x - 2y)]',
          noteZh: '這一步保留小括號，可 100% 避免心算漏變號！',
          noteEn: 'Keeping inner brackets here prevents 90% of sign errors!',
        },
        {
          labelZh: '拆小括號變號',
          labelEn: 'Distribute minus sign',
          mathTex: '(5 + 3x - 2y)(5 - 3x + 2y)',
          noteZh: '注意 -(3x - 2y) = -3x + 2y，-2y 必須變成 +2y！',
          noteEn: '-(3x - 2y) becomes -3x + 2y — the -2y flips to +2y!',
        },
      ],
    },
    trapZh: '全卷頭號陷阱：把 25 − (3x − 2y)² 跳步寫成 (5 + 3x − 2y)(5 − 3x − 2y)！第二個括號減去 (3x − 2y) 時，−(−2y) 必須變成 +2y！',
    trapEn: 'Public Enemy #1 in HKDSE Algebra: skipping brackets on 25 − (3x − 2y)² and writing (5 − 3x − 2y) instead of (5 − 3x + 2y)! Subtracting −2y gives +2y!',
    warmup: {
      id: 'fac-p6-warm',
      partId: 'part-6',
      mode: 'warmup',
      titleZh: '引導熱身：帶平方數係數的平方差',
      titleEn: 'Guided Warm-up: Difference of Squares with Coefficients',
      variants: [
        {
          id: 'fac-p6-warm-v0',
          kind: 'factor',
          promptZh: '因式分解 $9m^2 - 16n^2$',
          promptEn: 'Factorise $9m^2 - 16n^2$',
          answer: '(3m + 4n)(3m - 4n)',
          answerTex: '(3m + 4n)(3m - 4n)',
          allowedVars: ['m', 'n'],
          hintsZh: [
            '9m² = (3m)²，16n² = (4n)²，套用 A² − B² = (A + B)(A − B)。',
          ],
          hintsEn: [
            'Rewrite 9m² = (3m)² and 16n² = (4n)², then apply (A + B)(A − B).',
          ],
          stepsZh: ['$(3m)^2 - (4n)^2 = (3m + 4n)(3m - 4n)$。'],
          stepsEn: ['$(3m)^2 - (4n)^2 = (3m + 4n)(3m - 4n)$.'],
        },
      ],
    },
    checks: [
      {
        id: 'fac-p6-c1',
        partId: 'part-6',
        mode: 'check',
        titleZh: '獨立檢核 1：常數減括號平方（負號拆括號陷阱）',
        titleEn: 'Check 1: Square Minus Bracket Squared (Sign-Flip Trap)',
        variants: [
          {
            id: 'fac-p6-c1-v0',
            kind: 'factor',
            promptZh: '因式分解 $36 - (4x - 5y)^2$',
            promptEn: 'Factorise $36 - (4x - 5y)^2$',
            answer: '(6 + 4x - 5y)(6 - 4x + 5y)',
            answerTex: '(6 + 4x - 5y)(6 - 4x + 5y)',
            allowedVars: ['x', 'y'],
            hintsZh: ['36 = 6²，先寫 [6 + (4x − 5y)][6 − (4x − 5y)]，拆第二個括號時 −(−5y) 變 +5y！'],
            hintsEn: ['Write [6 + (4x − 5y)][6 − (4x − 5y)] first; distributing the minus turns −5y into +5y!'],
            stepsZh: ['$6^2 - (4x - 5y)^2 = [6 + (4x - 5y)][6 - (4x - 5y)] = (6 + 4x - 5y)(6 - 4x + 5y)$。'],
            stepsEn: ['$[6 + (4x - 5y)][6 - (4x - 5y)] = (6 + 4x - 5y)(6 - 4x + 5y)$.'],
          },
          {
            id: 'fac-p6-c1-v1',
            kind: 'factor',
            promptZh: '因式分解 $49 - (3a - 2b)^2$',
            promptEn: 'Factorise $49 - (3a - 2b)^2$',
            answer: '(7 + 3a - 2b)(7 - 3a + 2b)',
            answerTex: '(7 + 3a - 2b)(7 - 3a + 2b)',
            allowedVars: ['a', 'b'],
            hintsZh: ['49 = 7²；注意 7 − (3a − 2b) = 7 − 3a + 2b！'],
            hintsEn: ['49 = 7²; watch the sign flip in 7 − (3a − 2b) = 7 − 3a + 2b!'],
            stepsZh: ['$[7 + (3a - 2b)][7 - (3a - 2b)] = (7 + 3a - 2b)(7 - 3a + 2b)$。'],
            stepsEn: ['$[7 + (3a - 2b)][7 - (3a - 2b)] = (7 + 3a - 2b)(7 - 3a + 2b)$.'],
          },
          {
            id: 'fac-p6-c1-v2',
            kind: 'factor',
            promptZh: '因式分解 $81 - (5p + 4q)^2$',
            promptEn: 'Factorise $81 - (5p + 4q)^2$',
            answer: '(9 + 5p + 4q)(9 - 5p - 4q)',
            answerTex: '(9 + 5p + 4q)(9 - 5p - 4q)',
            allowedVars: ['p', 'q'],
            hintsZh: ['81 = 9²；第二個括號 9 − (5p + 4q) 兩項都要變減號！'],
            hintsEn: ['81 = 9²; in 9 − (5p + 4q), both 5p and 4q become negative!'],
            stepsZh: ['$[9 + (5p + 4q)][9 - (5p + 4q)] = (9 + 5p + 4q)(9 - 5p - 4q)$。'],
            stepsEn: ['$[9 + (5p + 4q)][9 - (5p + 4q)] = (9 + 5p + 4q)(9 - 5p - 4q)$.'],
          },
        ],
      },
      {
        id: 'fac-p6-c2',
        partId: 'part-6',
        mode: 'check',
        titleZh: '獨立檢核 2：先抽公因式再套平方差',
        titleEn: 'Check 2: Extract GCF First, Then Difference of Squares',
        variants: [
          {
            id: 'fac-p6-c2-v0',
            kind: 'factor',
            promptZh: '因式分解 $3x^3 - 27xy^2$',
            promptEn: 'Factorise $3x^3 - 27xy^2$',
            answer: '3x(x + 3y)(x - 3y)',
            answerTex: '3x(x + 3y)(x - 3y)',
            allowedVars: ['x', 'y'],
            hintsZh: ['3 和 27 不是平方數——因為要先抽公因式 3x 得 3x(x² − 9y²)！'],
            hintsEn: ['3 and 27 are not squares because you must extract the GCF 3x first: 3x(x² − 9y²)!'],
            stepsZh: ['第一步抽 $3x$：$3x(x^2 - 9y^2)$。', '第二步套平方差：$3x(x + 3y)(x - 3y)$。'],
            stepsEn: ['Extract $3x$: $3x(x^2 - 9y^2) = 3x(x + 3y)(x - 3y)$.'],
          },
          {
            id: 'fac-p6-c2-v1',
            kind: 'factor',
            promptZh: '因式分解 $5a^3b - 20ab^3$',
            promptEn: 'Factorise $5a^3b - 20ab^3$',
            answer: '5ab(a + 2b)(a - 2b)',
            answerTex: '5ab(a + 2b)(a - 2b)',
            allowedVars: ['a', 'b'],
            hintsZh: ['先抽公因式 5ab 得 5ab(a² − 4b²)，再用平方差分解！'],
            hintsEn: ['Extract GCF 5ab first to get 5ab(a² − 4b²), then apply difference of squares!'],
            stepsZh: ['$5ab(a^2 - 4b^2) = 5ab(a + 2b)(a - 2b)$。'],
            stepsEn: ['$5ab(a^2 - 4b^2) = 5ab(a + 2b)(a - 2b)$.'],
          },
          {
            id: 'fac-p6-c2-v2',
            kind: 'factor',
            promptZh: '因式分解 $2m^4 - 32m^2n^2$',
            promptEn: 'Factorise $2m^4 - 32m^2n^2$',
            answer: '2m^2(m + 4n)(m - 4n)',
            answerTex: '2m^2(m + 4n)(m - 4n)',
            allowedVars: ['m', 'n'],
            hintsZh: ['先抽公因式 2m² 得 2m²(m² − 16n²)，再套平方差！'],
            hintsEn: ['Extract 2m² first: 2m²(m² − 16n²) = 2m²(m + 4n)(m − 4n)!'],
            stepsZh: ['$2m^2(m^2 - 16n^2) = 2m^2(m + 4n)(m - 4n)$。'],
            stepsEn: ['$2m^2(m^2 - 16n^2) = 2m^2(m + 4n)(m - 4n)$.'],
          },
        ],
      },
    ],
    aiStarterZh: '請教我「Part 6：平方差 A² - B² 與負號拆括號陷阱」，為甚麼像 36 - (4x - 5y)² 這麼容易錯正負號？',
    aiStarterEn: 'Explain Factorisation Part 6 (difference of two squares A² - B²) and show me how to avoid sign mistakes on bracket questions like 36 - (4x - 5y)².',
    aiChunkTitle: 'Factorisation Part 6 — Difference of Two Squares (A² - B²) & Sign Traps',
    aiChunkText:
      'Identity: A² - B² = (A + B)(A - B) (note: A² + B² does not factorise over real/integer polynomials in this way). Four levels: (1) simple variables x² - y²; (2) square coefficients 9m² - 16n² = (3m+4n)(3m-4n); (3) GCF hiding difference of squares like 3x³ - 27xy² = 3x(x² - 9y²); (4) bracket squared like 36 - (4x - 5y)² or (x+3y)² - (x-3y)². CRITICAL TRAP: Always write outer brackets [A + (B)][A - (B)] before expanding so the minus sign distributes to EVERY term inside B: -(4x - 5y) = -4x + 5y.',
  },
  {
    id: 'part-7',
    number: 7,
    titleZh: '立方和差公式、隱藏配對與卷二 MC 代值驗算法',
    titleEn: 'Cubic Identities, Hidden Grouping & Paper 2 Substitution Check',
    shortZh: 'A³ ± B³ SOAP 口訣 · 卷二質數代值驗算',
    shortEn: 'A³ ± B³ SOAP signs · Paper 2 prime check',
    goalZh: '熟記立方和差公式的正負號規律，並學會處理卷二壓軸複合分組題與非平凡數值代入驗算法。',
    goalEn: 'Master sum/difference of cubes sign rules (SOAP) and tackle advanced Paper 2 composite factorisation + prime-substitution checking.',
    stepsZh: [
      '**立方和／立方差公式（SOAP 記號：同號、反號、恆正）**：\n$A^3 + B^3 = (A + B)(A^2 - AB + B^2)$ 及 $A^3 - B^3 = (A - B)(A^2 + AB + B^2)$（注意中間項是 **$AB$ 而非 $2AB$**！）。',
      '**四項複合題新視野**：除了 2+2 併項，若見到三項構成完全平方（如 $-4a^2 + 12a - 9 = -(2a - 3)^2$），可配成 **1 項減 3 項**造出大平方差 $A^2 - B^2$！',
      '**卷二 MC 代值驗算／急救法**：代入**互異非平凡質數**（如設 $a = 7,\\; b = 11$，避開 $0, 1, 2$）算出原式數值，再逐一核對 A–D 四個選項！（卷一長題目仍須寫完整代數步驟，只可用此法暗中驗算。）',
    ],
    stepsEn: [
      '**Sum & Difference of Cubes (SOAP: Same, Opposite, Always Positive)**:\n$A^3 + B^3 = (A + B)(A^2 - AB + B^2)$ and $A^3 - B^3 = (A - B)(A^2 + AB + B^2)$ (middle term is **$AB$, NOT $2AB$**!).',
      '**3-and-1 Grouping for 4 Terms**: When 2+2 grouping stalls, check if 3 terms form a perfect square (e.g. $-4a^2 + 12a - 9 = -(2a - 3)^2$) to create a big $A^2 - B^2$!',
      '**Paper 2 MC Prime Substitution Check**: Substitute **distinct primes** (e.g. $a = 7,\\; b = 11$ — avoid $0, 1, 2$!) into the prompt and options A–D to verify or break ties on MC! (Never use as working on Paper 1.)',
    ],
    workedExample: {
      promptTex: '2x^3 + 54y^3',
      answerTex: '2(x + 3y)(x^2 - 3xy + 9y^2)',
      steps: [
        {
          labelZh: '先抽公因數 2',
          labelEn: 'Extract GCF 2',
          mathTex: '2(x^3 + 27y^3) = 2[x^3 + (3y)^3]',
          noteZh: '27 = 3³，所以 B = 3y。',
          noteEn: '27 = 3³, so base B = 3y.',
        },
        {
          labelZh: '套 A³ + B³（SOAP）',
          labelEn: 'Apply A³ + B³',
          mathTex: '2(x + 3y)[x^2 - x(3y) + (3y)^2]',
          noteZh: '一次括號同號 (+)，二次括號首個符號反號 (-)，尾項恆正 (+)。',
          noteEn: 'Linear bracket Same (+), middle term Opposite (-), last term Always Positive (+).',
        },
        {
          labelZh: '化簡平方項',
          labelEn: 'Simplify (3y)²',
          mathTex: '2(x + 3y)(x^2 - 3xy + 9y^2)',
          noteZh: '(3y)² = 9y²（切勿漏平方寫成 3y²），且此二次括號不可再分解。',
          noteEn: '(3y)² = 9y² (do not write 3y²!), and this quadratic factor is irreducible.',
        },
      ],
    },
    trapZh: '立方公式三大誤區：① 把 −AB 錯背成 −2AB；② 把 (3y)² 漏平方係數寫成 3y²；③ 卷二代值驗算時誤代 x = 0 或 x = 1 導致兩個選項撞同一個數字！',
    trapEn: 'Three traps: (1) writing −2AB instead of −AB; (2) writing 3y² instead of (3y)² = 9y²; (3) substituting 0 or 1 in MC checks so multiple options give the same value!',
    warmup: {
      id: 'fac-p7-warm',
      partId: 'part-7',
      mode: 'warmup',
      titleZh: '引導熱身：立方差公式 A³ − B³',
      titleEn: 'Guided Warm-up: Difference of Cubes A³ − B³',
      variants: [
        {
          id: 'fac-p7-warm-v0',
          kind: 'factor',
          promptZh: '因式分解 $a^3 - 8b^3$',
          promptEn: 'Factorise $a^3 - 8b^3$',
          answer: '(a - 2b)(a^2 + 2ab + 4b^2)',
          answerTex: '(a - 2b)(a^2 + 2ab + 4b^2)',
          allowedVars: ['a', 'b'],
          hintsZh: [
            '8b³ = (2b)³，所以 A = a，B = 2b。',
            '套用 A³ − B³ = (A − B)(A² + AB + B²)，記得 (2b)² = 4b²，中間項是 +2ab！',
          ],
          hintsEn: [
            '8b³ = (2b)³, so A = a and B = 2b.',
            'Apply (A − B)(A² + AB + B²): middle term is +2ab and last term is (2b)² = 4b²!',
          ],
          stepsZh: ['$a^3 - (2b)^3 = (a - 2b)(a^2 + 2ab + 4b^2)$。'],
          stepsEn: ['$a^3 - (2b)^3 = (a - 2b)(a^2 + 2ab + 4b^2)$.'],
        },
      ],
    },
    checks: [
      {
        id: 'fac-p7-c1',
        partId: 'part-7',
        mode: 'check',
        titleZh: '獨立檢核 1：先抽公因式 ＋ 立方和／立方差',
        titleEn: 'Check 1: Extract GCF + Sum/Difference of Cubes',
        variants: [
          {
            id: 'fac-p7-c1-v0',
            kind: 'factor',
            promptZh: '因式分解 $3m^3 + 24n^3$',
            promptEn: 'Factorise $3m^3 + 24n^3$',
            answer: '3(m + 2n)(m^2 - 2mn + 4n^2)',
            answerTex: '3(m + 2n)(m^2 - 2mn + 4n^2)',
            allowedVars: ['m', 'n'],
            hintsZh: ['先抽出公因數 3 得 3(m³ + 8n³) = 3[m³ + (2n)³]，再套立方和公式！'],
            hintsEn: ['Extract 3 first: 3(m³ + 8n³) = 3[m³ + (2n)³], then apply A³ + B³!'],
            stepsZh: ['先抽 $3$：$3(m^3 + 8n^3)$。', '套用立方和：$3(m + 2n)(m^2 - 2mn + 4n^2)$。'],
            stepsEn: ['$3(m^3 + 8n^3) = 3(m + 2n)(m^2 - 2mn + 4n^2)$.'],
          },
          {
            id: 'fac-p7-c1-v1',
            kind: 'factor',
            promptZh: '因式分解 $2p^3 - 128q^3$',
            promptEn: 'Factorise $2p^3 - 128q^3$',
            answer: '2(p - 4q)(p^2 + 4pq + 16q^2)',
            answerTex: '2(p - 4q)(p^2 + 4pq + 16q^2)',
            allowedVars: ['p', 'q'],
            hintsZh: ['先抽 2 得 2(p³ − 64q³)，而 64q³ = (4q)³！'],
            hintsEn: ['Extract 2 first: 2(p³ − 64q³), where 64q³ = (4q)³!'],
            stepsZh: ['$2(p^3 - 64q^3) = 2[p^3 - (4q)^3] = 2(p - 4q)(p^2 + 4pq + 16q^2)$。'],
            stepsEn: ['$2(p^3 - 64q^3) = 2(p - 4q)(p^2 + 4pq + 16q^2)$.'],
          },
          {
            id: 'fac-p7-c1-v2',
            kind: 'factor',
            promptZh: '因式分解 $5x^4 - 135xy^3$',
            promptEn: 'Factorise $5x^4 - 135xy^3$',
            answer: '5x(x - 3y)(x^2 + 3xy + 9y^2)',
            answerTex: '5x(x - 3y)(x^2 + 3xy + 9y^2)',
            allowedVars: ['x', 'y'],
            hintsZh: ['先抽公因式 5x 得 5x(x³ − 27y³)，再套立方差公式！'],
            hintsEn: ['Extract GCF 5x first: 5x(x³ − 27y³), then apply difference of cubes!'],
            stepsZh: ['$5x(x^3 - 27y^3) = 5x(x - 3y)(x^2 + 3xy + 9y^2)$。'],
            stepsEn: ['$5x(x^3 - 27y^3) = 5x(x - 3y)(x^2 + 3xy + 9y^2)$.'],
          },
        ],
      },
      {
        id: 'fac-p7-c2',
        partId: 'part-7',
        mode: 'check',
        titleZh: '獨立檢核 2：卷二進階選擇題（隱藏完全平方 ＋ 平方差）',
        titleEn: 'Check 2: Paper 2 Advanced MC (Hidden Perfect Square + A² − B²)',
        variants: [
          {
            id: 'fac-p7-c2-v0',
            kind: 'choice',
            promptZh: '因式分解 $(5a + b)^2 - 4a^2 + 12a - 9$。',
            promptEn: 'Factorise $(5a + b)^2 - 4a^2 + 12a - 9$.',
            options: [
              '$(7a + b - 3)(3a + b - 3)$',
              '$(7a + b - 3)(3a + b + 3)$',
              '$(7a + b + 3)(3a + b - 3)$',
              '$(3a + b - 3)^2$',
            ],
            answer: 'B',
            answerTex: '(7a + b - 3)(3a + b + 3)',
            allowedVars: ['a', 'b'],
            hintsZh: [
              '把後三項抽負號括起：−(4a² − 12a + 9) = −(2a − 3)²，整題變成 (5a + b)² − (2a − 3)²！（亦可用 a = 7, b = 11 代入驗算）',
            ],
            hintsEn: [
              'Group the last three terms with a minus sign: −(4a² − 12a + 9) = −(2a − 3)², creating (5a + b)² − (2a − 3)²! (Or check with a = 7, b = 11.)',
            ],
            stepsZh: [
              '後三項抽負號：$-4a^2 + 12a - 9 = -(4a^2 - 12a + 9) = -(2a - 3)^2$。',
              '套平方差：$[(5a + b) + (2a - 3)][(5a + b) - (2a - 3)] = (7a + b - 3)(3a + b + 3)$，選 **B**。',
            ],
            stepsEn: [
              'Group tail: $-(4a^2 - 12a + 9) = -(2a - 3)^2$.',
              'Difference of squares: $[(5a + b) + (2a - 3)][(5a + b) - (2a - 3)] = (7a + b - 3)(3a + b + 3)$ → **B**.',
            ],
          },
          {
            id: 'fac-p7-c2-v1',
            kind: 'choice',
            promptZh: '因式分解 $(3x - y)^2 - 9y^2 + 6y - 1$。',
            promptEn: 'Factorise $(3x - y)^2 - 9y^2 + 6y - 1$.',
            options: [
              '$(3x + 2y - 1)(3x - 4y - 1)$',
              '$(3x + 2y + 1)(3x - 4y - 1)$',
              '$(3x + 2y - 1)(3x - 4y + 1)$',
              '$(3x - 2y - 1)(3x + 4y + 1)$',
            ],
            answer: 'C',
            answerTex: '(3x + 2y - 1)(3x - 4y + 1)',
            allowedVars: ['x', 'y'],
            hintsZh: ['後三項 −9y² + 6y − 1 = −(9y² − 6y + 1) = −(3y − 1)²，再用平方差！'],
            hintsEn: ['Group the last three terms: −(9y² − 6y + 1) = −(3y − 1)², then apply A² − B²!'],
            stepsZh: [
              '原式 $= (3x - y)^2 - (3y - 1)^2 = [(3x - y) + (3y - 1)][(3x - y) - (3y - 1)] = (3x + 2y - 1)(3x - 4y + 1)$，選 **C**。',
            ],
            stepsEn: [
              '$(3x - y)^2 - (3y - 1)^2 = (3x + 2y - 1)(3x - 4y + 1)$ → **C**.',
            ],
          },
          {
            id: 'fac-p7-c2-v2',
            kind: 'choice',
            promptZh: '因式分解 $16m^2 - n^2 - 8n - 16$。',
            promptEn: 'Factorise $16m^2 - n^2 - 8n - 16$.',
            options: [
              '$(4m + n + 4)(4m - n + 4)$',
              '$(4m + n - 4)(4m - n - 4)$',
              '$(4m + n + 4)(4m - n - 4)$',
              '$(4m - n + 4)(4m - n - 4)$',
            ],
            answer: 'C',
            answerTex: '(4m + n + 4)(4m - n - 4)',
            allowedVars: ['m', 'n'],
            hintsZh: ['後三項抽負號：−(n² + 8n + 16) = −(n + 4)²，整題變成 (4m)² − (n + 4)²！'],
            hintsEn: ['Factor minus from the last three terms: −(n² + 8n + 16) = −(n + 4)², giving (4m)² − (n + 4)²!'],
            stepsZh: [
              '原式 $= (4m)^2 - (n + 4)^2 = [4m + (n + 4)][4m - (n + 4)] = (4m + n + 4)(4m - n - 4)$，選 **C**。',
            ],
            stepsEn: [
              '$(4m)^2 - (n + 4)^2 = (4m + n + 4)(4m - n - 4)$ → **C**.',
            ],
          },
        ],
      },
    ],
    aiStarterZh: '請教我「Part 7：立方和差公式 A³ ± B³ 與卷二進階因式分解（隱藏平方差＋代數值驗算法）」。',
    aiStarterEn: 'Explain Factorisation Part 7: cubic identities A³ ± B³, disguised 3-and-1 difference of squares, and Paper 2 prime-value checking.',
    aiChunkTitle: 'Factorisation Part 7 — Cubic Identities, Master Checklist & Paper 2 Strategy',
    aiChunkText:
      'Cubic identities (SOAP): A³ + B³ = (A + B)(A² - AB + B²) and A³ - B³ = (A - B)(A² + AB + B²). Warn against writing 2AB instead of AB or forgetting to square coefficients like (3y)² = 9y². Advanced 4-term pattern: 1-minus-3 grouping where three terms form a perfect square trinomial, e.g. (5a+b)² - (4a² - 12a + 9) = (5a+b)² - (2a-3)². Paper 2 MC Substitution Check: pick distinct non-trivial primes (e.g. a = 7, b = 11; avoid 0, 1, 2) to evaluate the prompt and compare with A-D. Explicitly remind students that substitution earns 0 method marks on Paper 1 and is strictly for MC or self-checking.',
  },
];

export function findFactorisationSlot(itemId: string): { part: FactorisationPart; slot: FactorisationSlot } | null {
  for (const part of FACTORISATION_PARTS) {
    if (part.warmup.id === itemId) return { part, slot: part.warmup };
    for (const check of part.checks) {
      if (check.id === itemId) return { part, slot: check };
    }
  }
  return null;
}

export interface GuidedTopicProgressSummary {
  overallPercent: number;
  independentSolved: number;
  totalChecks: number;
  startedAny: boolean;
  parts: {
    partId: string;
    number: number;
    percent: number;
    independentSolved: number;
    totalChecks: number;
    warmupDone: boolean;
    assistedSolved: number;
  }[];
}

export function computeFactorisationProgress(guided: Record<string, GuidedItemState> = {}): GuidedTopicProgressSummary {
  let totalChecks = 0;
  let independentSolved = 0;
  let startedAny = false;

  const parts = FACTORISATION_PARTS.map(part => {
    const warmState = guided[part.warmup.id];
    const warmupDone = !!warmState?.solved;
    if (warmState && (warmState.attempts > 0 || warmState.assistedCurrent || warmState.solved)) {
      startedAny = true;
    }
    let partIndependent = 0;
    let partAssistedSolved = 0;
    for (const check of part.checks) {
      totalChecks += 1;
      const st = guided[check.id];
      if (st && (st.attempts > 0 || st.assistedCurrent || st.solved)) {
        startedAny = true;
      }
      if (st?.independent) {
        partIndependent += 1;
        independentSolved += 1;
      } else if (st?.solved) {
        partAssistedSolved += 1;
      }
    }
    const percent = part.checks.length ? Math.round((partIndependent / part.checks.length) * 100) : 0;
    return {
      partId: part.id,
      number: part.number,
      percent,
      independentSolved: partIndependent,
      totalChecks: part.checks.length,
      warmupDone,
      assistedSolved: partAssistedSolved,
    };
  });

  const overallPercent = totalChecks ? Math.round((independentSolved / totalChecks) * 100) : 0;
  return { overallPercent, independentSolved, totalChecks, startedAny, parts };
}

export const factorisationTutorResources = [
  {
    id: 'hokse-factorisation-checklist',
    title: 'HOKSE Factorisation Priority Checklist',
    url: '/subjects/maths?topic=maths-factorisation',
    use: 'Original HOKSE structured study guide; explain conversationally in short steps rather than dumping all 7 parts at once.',
    text: 'Master Priority Order: Step 1 ALWAYS check and extract common monomial or bracket factors FIRST (numerical GCD + lowest variable power). Step 2 count remaining terms: 2 terms -> Difference of Two Squares A²-B²=(A+B)(A-B) or Sum/Difference of Cubes A³±B³; 3 terms -> Single-variable ax²+bx+c or Two-variable ar²+brs+cs² quadratic; 4+ terms or (a)/(b) "Hence" -> 2+2 grouping (extracting negative GCF to align signs) or 1-minus-3 disguised perfect square. Keep explanations concise, interactive, and focused on the specific Part or question the student asks about.',
  },
  ...FACTORISATION_PARTS.map(part => ({
    id: `hokse-factorisation-${part.id}`,
    title: `HOKSE ${part.aiChunkTitle}`,
    url: `/subjects/maths?topic=maths-factorisation#${part.id}`,
    use: `Focused teaching chunk for Part ${part.number} (${part.titleZh} / ${part.titleEn}).`,
    text: part.aiChunkText,
  })),
];

export const factorisationCoachingPack = {
  subjectId: 'maths' as const,
  topicId: FACTORISATION_TOPIC_ID,
  title: '因式分解',
  skills: FACTORISATION_PARTS.map(p => ({ id: `factorisation-${p.id}`, name: `因式分解 · ${p.titleZh}` })),
  lessons: FACTORISATION_PARTS.map(p => ({
    title: `Part ${p.number} · ${p.titleZh}`,
    text: `${p.goalZh} 方法：${p.stepsZh.map(s => s.replace(/\*\*/g, '')).join(' ')} 易錯提示：${p.trapZh}`,
    skillIds: [`factorisation-${p.id}`],
  })),
};
