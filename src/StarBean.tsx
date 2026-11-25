import { useId } from 'react';
import { STARBEAN_PALETTES, isWideStarBeanMood } from './mascot-events';
import type { StarBeanAccessory, StarBeanColor, StarBeanMood } from './mascot-events';

export interface StarBeanProps {
  mood?: StarBeanMood;
  color?: StarBeanColor;
  accessory?: StarBeanAccessory;
  size?: number;
  className?: string;
  facing?: 'right' | 'left';
  animated?: boolean;
  showShadow?: boolean;
  /** Compact upright mode for tiny badges, chat avatars, or edge-docked peek */
  compact?: boolean;
  /** Normalized gaze offset (-1..1) for live cursor tracking in 'sitting' mode */
  lookX?: number;
  lookY?: number;
  /** Rolling spin direction when mood === 'rolling' */
  rollDirection?: 'left' | 'right';
  label?: string;
}

const INK = '#18201C';

export function StarBean({
  mood = 'idle',
  color = 'amber',
  accessory = 'none',
  size = 76,
  className = '',
  facing = 'right',
  animated = true,
  showShadow = true,
  compact = false,
  lookX = 0,
  lookY = 0,
  rollDirection = 'left',
  label,
}: StarBeanProps) {
  const clipId = useId();
  const palette = STARBEAN_PALETTES[color] ?? STARBEAN_PALETTES.amber;
  const isWorking =
    mood === 'thinking' ||
    mood === 'streaming' ||
    mood === 'quizGenerating' ||
    mood === 'grading';
  const isExhausted = mood === 'exhausted';
  const isNap = mood === 'nap';
  const isSitting = mood === 'sitting';
  const isRolling = mood === 'rolling';
  const useWideScene = !compact && isWideStarBeanMood(mood);

  const clampedLookX = Math.max(-1, Math.min(1, lookX));
  const clampedLookY = Math.max(-1, Math.min(1, lookY));

  const classes = [
    'starbean-svg',
    `sb-mood-${mood}`,
    useWideScene ? 'sb-wide-scene' : '',
    animated ? 'sb-animated' : '',
    facing === 'left' && !useWideScene && !isRolling ? 'sb-facing-left' : '',
    isRolling ? `sb-roll-${rollDirection}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // =========================================================================
  // WIDE SCENE POSES (viewBox 0 0 218 148):
  //   1. working (thinking / streaming / quizGenerating / grading):
  //      Mini laptop + Starbean lying on tummy typing + subtle kicking back legs!
  //   2. exhausted (finish work · 累成狗了):
  //      Mini laptop aside + Starbean spread-eagle flat pancake beside it!
  //   3. nap (閒置 mode · 戴眼罩橫趴午睡):
  //      Starbean curled/lying flat horizontally wearing a dark sleep mask + zZz!
  // =========================================================================
  if (useWideScene) {
    const svgWidth = Math.round(size * 1.62);
    const svgHeight = Math.round(size * 1.1);
    const showGlasses =
      accessory === 'glasses' || mood === 'quizGenerating' || mood === 'grading';

    return (
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox="0 0 218 148"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={classes}
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        {/* ---- POSE A: WORKING MODE (Lying on tummy typing on mini laptop + gentle kicking back legs) ---- */}
        {isWorking && (
          <>
            <defs>
              <clipPath id={`${clipId}-work-body`}>
                <path d="M90 88 C90 61 107 49 130 49 C153 49 171 61 174 86 C176 104 166 117 142 118 L108 118 C95 118 90 107 90 88 Z" />
              </clipPath>
            </defs>

            {showShadow && (
              <ellipse cx="110" cy="126" rx="88" ry="10" fill="#162820" opacity="0.2" />
            )}

            {/* Mini laptop on the left */}
            <g className="sb-laptop">
              {/* Soft screen glow cone */}
              <polygon
                points="66,68 97,58 97,104 66,112"
                fill="#A9E5C8"
                opacity="0.22"
              />
              {/* Laptop screen back & bezel */}
              <path
                d="M22 65 L64 62 L73 111 L32 114 Z"
                fill="#2E443B"
                stroke={INK}
                strokeWidth="3.8"
                strokeLinejoin="round"
              />
              {/* Laptop screen inner highlight */}
              <path
                d="M28 70 L59 68 L66 105 L36 107 Z"
                fill="#E8F6EE"
                stroke={INK}
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              {/* Tiny glowing star/code bars on back of lid */}
              <path
                d="M42 84 L54 83 M43 91 L52 90"
                stroke="#245F4B"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              {/* Laptop keyboard base */}
              <path
                d="M32 114 L96 114 C99 114 100 119 96 121 L34 121 C30 121 29 116 32 114 Z"
                fill="#D4DED8"
                stroke={INK}
                strokeWidth="3.6"
                strokeLinejoin="round"
              />
              {/* Tiny keyboard keys strip */}
              <path d="M46 116.5 L88 116.5" stroke="#53685E" strokeWidth="2.2" strokeLinecap="round" />
            </g>

            {/* Starbean lying on tummy typing */}
            <g className="sb-work-rig">
              {/* Subtle gentle alternating kicking back legs (後腳微小幅度亂晃) */}
              <g className="sb-kick-leg sb-kick-leg-1">
                <path
                  d="M167 96 C179 90 192 89 197 96 C201 102 194 111 182 111 L167 110 Z"
                  fill={palette.shadow}
                  stroke={INK}
                  strokeWidth="4.1"
                  strokeLinejoin="round"
                />
              </g>
              <g className="sb-kick-leg sb-kick-leg-2">
                <path
                  d="M166 104 C179 102 193 104 196 111 C199 118 189 124 176 121 L164 117 Z"
                  fill={palette.body}
                  stroke={INK}
                  strokeWidth="4.1"
                  strokeLinejoin="round"
                />
              </g>

              {/* Cute twin ears perked attentively toward laptop */}
              <g className="sb-ear sb-ear-left">
                <path
                  d="M103 57 C99 42 103 31 110 30 C117 29 123 40 123 53 Z"
                  fill={palette.body}
                  stroke={INK}
                  strokeWidth="4"
                  strokeLinejoin="round"
                />
                <path d="M107 51 C106 43 108 37 111 36 C115 36 117 42 118 50 Z" fill={palette.earInner} />
              </g>
              <g className="sb-ear sb-ear-right">
                <path
                  d="M128 53 C131 39 139 30 146 32 C152 34 153 46 149 59 Z"
                  fill={palette.body}
                  stroke={INK}
                  strokeWidth="4"
                  strokeLinejoin="round"
                />
                <path d="M133 52 C135 44 139 38 143 39 C146 40 147 46 144 54 Z" fill={palette.earInner} />
                {accessory === 'starclip' && (
                  <path
                    d="M148 36 L151 42 L157 43 L152.5 47.2 L153.6 53.5 L148 50.5 L142.4 53.5 L143.5 47.2 L139 43 L145 42 Z"
                    fill="#F7CC45"
                    stroke={INK}
                    strokeWidth="2.4"
                    strokeLinejoin="round"
                  />
                )}
              </g>

              {/* Optional top accessories while lying */}
              {accessory === 'sprout' && (
                <g className="sb-accessory-sprout">
                  <path d="M125 50 L125 32" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
                  <path d="M125 35 C118 27 109 28 109 34 C109 39 118 40 125 36 Z" fill="#46B978" stroke={INK} strokeWidth="2.9" />
                  <path d="M125 34 C132 26 141 27 141 33 C141 38 132 39 125 35 Z" fill="#5FD08E" stroke={INK} strokeWidth="2.9" />
                </g>
              )}
              {accessory === 'book' && (
                <g className="sb-accessory-book">
                  <path d="M109 39 L141 35 L144 44 L112 48 Z" fill="#1E6048" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
                  <path d="M111 47 L143 43 L143 48 L112 52 Z" fill="#F7EEDB" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
                </g>
              )}

              {/* Lying horizontal bean body with 2-tone cel shading */}
              <g clipPath={`url(#${clipId}-work-body)`}>
                <rect x="86" y="45" width="94" height="78" fill={palette.body} />
                <path d="M86 98 C112 106 148 105 178 93 L178 124 L86 124 Z" fill={palette.shadow} />
                <ellipse cx="132" cy="59" rx="18" ry="5" fill={palette.highlight} opacity="0.55" />
              </g>
              <path
                d="M90 88 C90 61 107 49 130 49 C153 49 171 61 174 86 C176 104 166 117 142 118 L108 118 C95 118 90 107 90 88 Z"
                stroke={INK}
                strokeWidth="4.4"
                strokeLinejoin="round"
              />

              {/* Forest-green twin-star school backpack resting on its back */}
              <g>
                <rect x="142" y="54" width="32" height="24" rx="9" fill="#1F5E46" stroke={INK} strokeWidth="3.8" />
                <path d="M144 69 C153 72 165 72 172 69 L172 76 C172 77 144 77 144 76 Z" fill="#143F2E" />
                <path
                  d="M153 60 L154.2 62.6 L157 63 L155 64.8 L155.5 67.6 L153 66.2 L150.5 67.6 L151 64.8 L149 63 L151.8 62.6 Z"
                  fill="#F6CA44"
                  stroke={INK}
                  strokeWidth="1"
                />
                <path
                  d="M163 61 L164 63.2 L166.4 63.5 L164.7 65 L165.1 67.4 L163 66.3 L160.9 67.4 L161.3 65 L159.6 63.5 L162 63.2 Z"
                  fill="#F6CA44"
                  stroke={INK}
                  strokeWidth="1"
                />
              </g>

              {/* Glossy cream face visor leaning forward toward the screen */}
              <rect x="91" y="65" width="42" height="32" rx="15" fill="#FDF5E2" stroke={INK} strokeWidth="3.8" />
              <path d="M94 88 C100 94 124 94 130 88 C129 94 124 96 112 96 C100 96 95 94 94 88 Z" fill="#EBD8B4" />
              <ellipse cx="108" cy="72" rx="9.5" ry="3.2" fill="#FFFFFF" opacity="0.95" />

              {/* Intently focused eyes watching the laptop screen */}
              <g className="sb-eyes">
                <ellipse cx="103" cy="81" rx="3.4" ry="4.4" fill={INK} />
                <ellipse cx="119" cy="81" rx="3.4" ry="4.4" fill={INK} />
                <circle cx="101.8" cy="79.5" r="1.2" fill="#FFFFFF" />
                <circle cx="117.8" cy="79.5" r="1.2" fill="#FFFFFF" />
              </g>

              {showGlasses && (
                <g className="sb-accessory-glasses">
                  <circle cx="103" cy="81" r="7.4" stroke={INK} strokeWidth="2.5" fill="rgba(255,255,255,0.22)" />
                  <circle cx="119" cy="81" r="7.4" stroke={INK} strokeWidth="2.5" fill="rgba(255,255,255,0.22)" />
                  <path d="M110.4 81 L111.6 81 M92 80 L95.6 80.6 M126.4 80.6 L132 80" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
                </g>
              )}

              {/* Two tiny front paws rapidly tapping the laptop keyboard */}
              <circle className="sb-type-paw sb-type-paw-1" cx="81" cy="112" r="7.2" fill={palette.body} stroke={INK} strokeWidth="3.4" />
              <circle className="sb-type-paw sb-type-paw-2" cx="95" cy="113" r="7.2" fill={palette.body} stroke={INK} strokeWidth="3.4" />

              {/* Subtle motion ticks behind the gently wiggling feet */}
              <path className="sb-kick-lines" d="M202 86 C206 90 207 95 205 100 M207 92 C210 95 210 100 208 104" stroke="#536B5E" strokeWidth="2.3" strokeLinecap="round" />
            </g>

            {/* Lightbulb / sparkle status icon above */}
            {(mood === 'thinking' || mood === 'quizGenerating') && (
              <g className="sb-fx sb-fx-bulb">
                <circle cx="116" cy="18" r="8.5" fill="#F8D458" stroke={INK} strokeWidth="2.6" />
                <path d="M113 27.5 L119 27.5 M116 5 L116 8 M128 11 L125.5 13 M104 11 L106.5 13" stroke="#E89B2D" strokeWidth="2.3" strokeLinecap="round" />
              </g>
            )}
          </>
        )}

        {/* ---- POSE B: EXHAUSTED / FINISH WORK (累成狗了 · spread-eagle pancake beside mini laptop!) ---- */}
        {isExhausted && (
          <>
            <defs>
              <clipPath id={`${clipId}-exh-body`}>
                <ellipse cx="144" cy="96" rx="44" ry="22" />
              </clipPath>
            </defs>

            {showShadow && (
              <ellipse cx="114" cy="123" rx="92" ry="11" fill="#162820" opacity="0.2" />
            )}

            {/* Finished mini laptop resting quietly on the left with tiny green done check */}
            <g className="sb-laptop">
              <path d="M18 70 L58 67 L66 112 L27 115 Z" fill="#2E443B" stroke={INK} strokeWidth="3.6" strokeLinejoin="round" />
              <path d="M24 75 L53 73 L60 106 L31 108 Z" fill="#E8F6EE" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
              {/* Tiny green checkmark inside screen */}
              <path d="M36 91 L41 96 L50 84" stroke="#248F63" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M27 115 L84 115 C87 115 88 120 84 122 L29 122 C25 122 24 117 27 115 Z" fill="#D4DED8" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
            </g>

            {/* Spread-eagle melted pancake Starbean beside the laptop (累成狗了!) */}
            <g className="sb-exhausted-rig">
              {/* Splayed stubby arms & legs (四腳朝天 / 大字型攤平) */}
              <ellipse cx="95" cy="98" rx="14" ry="7" transform="rotate(-14 95 98)" fill={palette.body} stroke={INK} strokeWidth="3.8" />
              <ellipse cx="192" cy="99" rx="14" ry="7" transform="rotate(14 192 99)" fill={palette.body} stroke={INK} strokeWidth="3.8" />
              <ellipse cx="118" cy="117" rx="11" ry="7.5" transform="rotate(24 118 117)" fill={palette.shadow} stroke={INK} strokeWidth="3.8" />
              <ellipse cx="169" cy="117" rx="11" ry="7.5" transform="rotate(-24 169 117)" fill={palette.shadow} stroke={INK} strokeWidth="3.8" />

              {/* Limp droopy ears flattened out sideways */}
              <path d="M111 82 C96 76 91 66 96 62 C102 58 115 66 123 77 Z" fill={palette.body} stroke={INK} strokeWidth="3.8" strokeLinejoin="round" />
              <path d="M177 82 C192 76 197 66 192 62 C186 58 173 66 165 77 Z" fill={palette.body} stroke={INK} strokeWidth="3.8" strokeLinejoin="round" />

              {/* Squished flat pancake bean body */}
              <g clipPath={`url(#${clipId}-exh-body)`}>
                <rect x="96" y="70" width="96" height="52" fill={palette.body} />
                <path d="M96 102 C122 110 166 110 192 102 L192 124 L96 124 Z" fill={palette.shadow} />
                <ellipse cx="144" cy="80" rx="22" ry="5" fill={palette.highlight} opacity="0.5" />
              </g>
              <ellipse cx="144" cy="96" rx="44" ry="22" stroke={INK} strokeWidth="4.3" />

              {/* Forest-green backpack slipped slightly to the top-right back */}
              <rect x="160" y="68" width="24" height="17" rx="6.5" transform="rotate(14 172 76)" fill="#1F5E46" stroke={INK} strokeWidth="3.4" />
              <circle cx="171" cy="76" r="2.2" fill="#F6CA44" />
              <circle cx="177" cy="77.5" r="2" fill="#F6CA44" />

              {/* Wide blank cream visor with hollowed-out '累成狗了' exhausted eyes */}
              <rect x="116" y="81" width="54" height="27" rx="13.5" fill="#FDF5E2" stroke={INK} strokeWidth="3.8" />
              <ellipse cx="144" cy="87" rx="11" ry="2.8" fill="#FFFFFF" opacity="0.9" />
              {/* Exhausted hollow eyes + flat little 'o' sigh mouth */}
              <ellipse cx="131" cy="95" rx="5.2" ry="3.2" fill="#FFFFFF" stroke={INK} strokeWidth="2.6" />
              <circle cx="131" cy="95.4" r="1.4" fill={INK} />
              <ellipse cx="155" cy="95" rx="5.2" ry="3.2" fill="#FFFFFF" stroke={INK} strokeWidth="2.6" />
              <circle cx="155" cy="95.4" r="1.4" fill={INK} />
              <path d="M140 102 C142 100.5 144 100.5 146 102" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />

              {/* Tiny soul-sigh puff floating up */}
              <g className="sb-fx sb-fx-steam">
                <path
                  d="M142 54 C140 48 145 43 151 45 C154 41 161 42 162 48 C166 50 166 56 160 58 C156 60 146 60 142 54 Z"
                  fill="#FFFFFF"
                  stroke={INK}
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                />
              </g>
            </g>
          </>
        )}

        {/* ---- POSE C: NAP MODE (閒置 mode · 戴深色睡眠眼罩橫趴午睡 + zZz!) ---- */}
        {isNap && (
          <>
            <defs>
              <clipPath id={`${clipId}-nap-body`}>
                <path d="M40 94 C40 66 58 55 86 55 L146 57 C171 58 184 72 184 94 C184 114 169 121 144 121 L78 121 C53 121 40 112 40 94 Z" />
              </clipPath>
            </defs>

            {showShadow && (
              <ellipse cx="114" cy="126" rx="82" ry="10" fill="#162820" opacity="0.2" />
            )}

            <g className="sb-nap-rig">
              {/* Stretched-out cozy stubby back legs behind */}
              <ellipse cx="182" cy="100" rx="14" ry="8.5" transform="rotate(-8 182 100)" fill={palette.shadow} stroke={INK} strokeWidth="4" />
              <ellipse cx="184" cy="112" rx="15" ry="8.5" transform="rotate(6 184 112)" fill={palette.body} stroke={INK} strokeWidth="4" />

              {/* Relaxed folded-back twin ears */}
              <path d="M62 60 C55 46 60 36 67 36 C74 36 80 46 80 57 Z" fill={palette.body} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
              <path d="M90 57 C94 43 102 36 109 38 C115 40 115 51 110 60 Z" fill={palette.body} stroke={INK} strokeWidth="4" strokeLinejoin="round" />

              {/* Horizontal curled sleeping bean body */}
              <g clipPath={`url(#${clipId}-nap-body)`}>
                <rect x="36" y="50" width="154" height="76" fill={palette.body} />
                <path d="M36 102 C74 110 144 110 190 98 L190 126 L36 126 Z" fill={palette.shadow} />
                <ellipse cx="112" cy="67" rx="28" ry="6" fill={palette.highlight} opacity="0.5" />
              </g>
              <path
                d="M40 94 C40 66 58 55 86 55 L146 57 C171 58 184 72 184 94 C184 114 169 121 144 121 L78 121 C53 121 40 112 40 94 Z"
                stroke={INK}
                strokeWidth="4.4"
                strokeLinejoin="round"
              />

              {/* Forest-green backpack resting gently on its sleeping back */}
              <rect x="122" y="45" width="38" height="24" rx="9" fill="#1F5E46" stroke={INK} strokeWidth="3.8" />
              <path d="M124 61 C135 64 148 64 158 61 L158 67 L124 67 Z" fill="#143F2E" />
              <path d="M135 51.5 L136.3 54.2 L139.2 54.6 L137.1 56.6 L137.6 59.5 L135 58.1 L132.4 59.5 L132.9 56.6 L130.8 54.6 L133.7 54.2 Z" fill="#F6CA44" stroke={INK} strokeWidth="1" />
              <path d="M146 52.5 L147.1 54.8 L149.6 55.1 L147.8 56.8 L148.2 59.3 L146 58.1 L143.8 59.3 L144.2 56.8 L142.4 55.1 L144.9 54.8 Z" fill="#F6CA44" stroke={INK} strokeWidth="1" />

              {/* Elastic sleep mask strap */}
              <path d="M90 83 L114 82" stroke="#243142" strokeWidth="4.2" strokeLinecap="round" />

              {/* Cream visor resting near ground */}
              <rect x="44" y="72" width="48" height="36" rx="17" fill="#FDF5E2" stroke={INK} strokeWidth="3.8" />
              <path d="M48 98 C56 105 80 105 88 98 C86 105 80 107 68 107 C56 107 50 105 48 98 Z" fill="#EBD8B4" />

              {/* Signature Sleep Mask (深色眼罩 with cute contoured nose dip!) */}
              <path
                d="M44 82 C44 73 56 71 67 74 C78 71 91 73 91 83 C91 93 83 98 75 96 C70 95 69 91 67 91 C65 91 64 95 59 96 C51 98 44 92 44 82 Z"
                fill="#27364B"
                stroke={INK}
                strokeWidth="3.4"
                strokeLinejoin="round"
              />
              {/* Soft stitched closed-eye arcs on the sleep mask */}
              <path d="M52 84 C55 87 59 87 62 84 M73 84 C76 87 80 87 83 84" stroke="#F7E9BF" strokeWidth="2.3" strokeLinecap="round" opacity="0.88" />
              {/* Tiny cozy tucked paw under chin */}
              <circle cx="51" cy="113" r="7.5" fill={palette.body} stroke={INK} strokeWidth="3.4" />
            </g>

            {/* Floating z Z z above head */}
            <g className="sb-fx sb-fx-zzz">
              <path d="M62 40 L71 40 L62 48 L71 48" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M76 26 L88 26 L76 37 L88 37" stroke={INK} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M94 14 L103 14 L94 22 L103 22" stroke="#536B5E" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>
          </>
        )}
      </svg>
    );
  }

  // =========================================================================
  // STANDARD & SITTING & ROLLING POSES (viewBox 0 0 148 156)
  // =========================================================================
  const isDroopy = mood === 'sleepy' || mood === 'error' || mood === 'comfort';
  const isCheering = mood === 'celebrate' || mood === 'happy';
  const isSus = mood === 'sus';
  const isDragged = mood === 'dragged';
  const isWalking = mood === 'patrol';
  const isFocus = mood === 'focus';
  const showGlasses = accessory === 'glasses' || isFocus;

  // Sitting pose pupil tracking offsets
  const pupilDx = isSitting ? clampedLookX * 3.8 : 0;
  const pupilDy = isSitting ? clampedLookY * 2.4 : 0;

  return (
    <svg
      width={size}
      height={Math.round(size * 1.06)}
      viewBox="0 0 148 156"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={classes}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <clipPath id={`${clipId}-body`}>
          {isSitting ? (
            <path d="M38 82 C38 50 54 39 74 39 C95 39 111 50 111 82 C111 112 103 130 74 130 C46 130 38 112 38 82 Z" />
          ) : isRolling ? (
            <rect x="40" y="42" width="68" height="82" rx="33" />
          ) : (
            <path d="M40 72 C40 44 55 34 74 34 C94 34 109 45 109 73 L109 116 C109 128 103 135 95 135 C87 135 84 128 84 120 L84 114 C84 111 81 109 74 109 C67 109 64 111 64 114 L64 120 C64 128 60 135 52 135 C44 135 40 128 40 116 Z" />
          )}
        </clipPath>
        <clipPath id={`${clipId}-pack`}>
          <rect x="20" y="64" width="26" height="47" rx="11" />
        </clipPath>
      </defs>

      {/* Ground oval shadow */}
      {showShadow && (
        <ellipse
          className="sb-ground-shadow"
          cx="73"
          cy="141"
          rx={isDragged ? 22 : isSitting ? 42 : isCheering ? 27 : 36}
          ry={isDragged ? 5 : 8}
          fill="#162820"
          opacity={isDragged ? 0.14 : 0.24}
        />
      )}

      {/* Main articulated character rig (rotates smoothly during 'rolling'!) */}
      <g className={isRolling ? 'sb-rig sb-roll-wheel' : 'sb-rig'}>
        {/* Forest-green school backpack (tucked cleanly during standing/sitting/rolling) */}
        {!isRolling && (
          <g className="sb-backpack" transform={isSitting ? 'translate(0, 6)' : undefined}>
            <g clipPath={`url(#${clipId}-pack)`}>
              <rect x="20" y="64" width="26" height="47" rx="11" fill="#1F5E46" />
              <path d="M20 92 C28 96 38 96 46 92 L46 112 L20 112 Z" fill="#143F2E" />
            </g>
            <rect x="20" y="64" width="26" height="47" rx="11" stroke={INK} strokeWidth="4.2" strokeLinejoin="round" />
            <path d="M21.5 85 C27 88 36 88 41 86" stroke={INK} strokeWidth="2.4" strokeLinecap="round" opacity="0.65" />
            <path
              d="M27.5 92.5 L28.9 95.3 L31.9 95.7 L29.7 97.8 L30.2 100.8 L27.5 99.4 L24.8 100.8 L25.3 97.8 L23.1 95.7 L26.1 95.3 Z"
              fill="#F6CA44"
              stroke={INK}
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <path
              d="M35.8 94.2 L36.9 96.4 L39.3 96.8 L37.5 98.4 L38 100.8 L35.8 99.7 L33.6 100.8 L34.1 98.4 L32.3 96.8 L34.7 96.4 Z"
              fill="#F6CA44"
              stroke={INK}
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <path d="M40 71 C49 74 51 94 42 102" stroke="#1F5E46" strokeWidth="7.5" strokeLinecap="round" fill="none" />
            <path d="M40 71 C49 74 51 94 42 102" stroke={INK} strokeWidth="3.6" strokeLinecap="round" fill="none" />
          </g>
        )}

        {/* Left articulated ear */}
        <g
          className={`sb-ear sb-ear-left ${isDroopy ? 'is-droopy' : ''} ${
            isDragged || isRolling ? 'is-flared' : ''
          }`}
        >
          <path
            d={
              isRolling
                ? 'M49 52 C38 35 39 20 47 17 C54 15 63 29 66 44 Z'
                : 'M48 45 C44 30 47 17 54 15 C61 13 68 25 69 39 Z'
            }
            fill={palette.body}
            stroke={INK}
            strokeWidth="4.3"
            strokeLinejoin="round"
          />
          <path d="M53 38 C51 29 53 23 56 22 C60 21 63 28 64 37 Z" fill={palette.earInner} />
        </g>

        {/* Right articulated ear */}
        <g
          className={`sb-ear sb-ear-right ${isDroopy ? 'is-droopy' : ''} ${
            isDragged || isRolling ? 'is-flared' : ''
          }`}
        >
          <path
            d={
              isRolling
                ? 'M82 44 C85 29 94 15 101 17 C109 20 110 35 99 52 Z'
                : 'M79 38 C81 24 89 13 96 15 C103 17 105 31 101 46 Z'
            }
            fill={palette.body}
            stroke={INK}
            strokeWidth="4.3"
            strokeLinejoin="round"
          />
          <path d="M84 37 C86 28 90 22 94 23 C97 24 98 30 96 39 Z" fill={palette.earInner} />
          {accessory === 'starclip' && (
            <path
              className="sb-accessory-starclip"
              d="M99 22 L102 28.4 L109 29.4 L104 34.2 L105.2 41 L99 37.8 L92.8 41 L94 34.2 L89 29.4 L96 28.4 Z"
              fill="#F7CC45"
              stroke={INK}
              strokeWidth="2.8"
              strokeLinejoin="round"
            />
          )}
        </g>

        {/* Top head accessories */}
        {accessory === 'sprout' && (
          <g className="sb-accessory-sprout">
            <path d="M74 35 C74 26 74 21 74 16" stroke={INK} strokeWidth="3.8" strokeLinecap="round" />
            <path d="M74 19 C66 10 56 12 56 18 C56 23 66 25 74 20 Z" fill="#46B978" stroke={INK} strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M74 18 C82 9 92 10 92 16 C92 22 82 24 74 19 Z" fill="#5FD08E" stroke={INK} strokeWidth="3.2" strokeLinejoin="round" />
          </g>
        )}

        {accessory === 'book' && (
          <g className="sb-accessory-book">
            <path d="M57 25 L91 21 L95 31 L61 35 Z" fill="#1E6048" stroke={INK} strokeWidth="3.4" strokeLinejoin="round" />
            <path d="M59 34 L94 30 L94 35 L60 39 Z" fill="#F7EEDB" stroke={INK} strokeWidth="2.8" strokeLinejoin="round" />
            <path d="M84 31 L85 39 L81 36.5 L78 39.5 L78 31.5 Z" fill="#F5B72F" stroke={INK} strokeWidth="1.6" />
          </g>
        )}

        {/* Main body (Seated / Rolling Ball / Standing Bean) */}
        <g className={`sb-body-group ${isWalking ? 'is-walking' : ''}`}>
          <g clipPath={`url(#${clipId}-body)`}>
            <rect x="34" y="30" width="84" height="110" fill={palette.body} />
            <path
              d="M34 30 L52 30 C49 54 49 85 57 98 C66 111 90 112 116 102 L116 140 L34 140 Z"
              fill={palette.shadow}
            />
            <ellipse cx="79" cy="46" rx="16" ry="5" fill={palette.highlight} opacity="0.55" />
          </g>

          {isSitting ? (
            <>
              <path
                d="M38 82 C38 50 54 39 74 39 C95 39 111 50 111 82 C111 112 103 130 74 130 C46 130 38 112 38 82 Z"
                stroke={INK}
                strokeWidth="4.6"
                strokeLinejoin="round"
              />
              {/* Cute arms resting loosely at sides while sitting */}
              <ellipse cx="36" cy="103" rx="9" ry="12" transform="rotate(18 36 103)" fill={palette.body} stroke={INK} strokeWidth="4" />
              <ellipse cx="112" cy="103" rx="9" ry="12" transform="rotate(-18 112 103)" fill={palette.body} stroke={INK} strokeWidth="4" />
              {/* Two cute stubby legs kicked forward sitting on the floor! */}
              <ellipse cx="58" cy="130" rx="14" ry="9" transform="rotate(-14 58 130)" fill={palette.body} stroke={INK} strokeWidth="4.2" />
              <ellipse cx="92" cy="130" rx="14" ry="9" transform="rotate(14 92 130)" fill={palette.body} stroke={INK} strokeWidth="4.2" />
            </>
          ) : isRolling ? (
            <rect
              x="40"
              y="42"
              width="68"
              height="82"
              rx="33"
              stroke={INK}
              strokeWidth="4.6"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="M40 72 C40 44 55 34 74 34 C94 34 109 45 109 73 L109 116 C109 128 103 135 95 135 C87 135 84 128 84 120 L84 114 C84 111 81 109 74 109 C67 109 64 111 64 114 L64 120 C64 128 60 135 52 135 C44 135 40 128 40 116 Z"
              stroke={INK}
              strokeWidth="4.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {mood === 'sleepy' && (
            <path d="M68 96 C75 99 84 99 90 96" stroke={INK} strokeWidth="2.8" strokeLinecap="round" opacity="0.45" />
          )}
        </g>

        {/* Glossy warm-cream face visor */}
        <g className="sb-visor" transform={isSitting ? 'translate(-6, 5)' : isRolling ? 'translate(-7, 10)' : undefined}>
          <rect
            x="58"
            y="50"
            width="46"
            height="34"
            rx="16"
            fill="#FDF5E2"
            stroke={INK}
            strokeWidth="4"
          />
          <path
            d="M61 74 C67 80 95 80 101 74 C100 80 95 82 81 82 C67 82 62 80 61 74 Z"
            fill="#EBD8B4"
          />
          <ellipse cx="83" cy="57.5" rx="11" ry="3.6" fill="#FFFFFF" opacity="0.95" />

          {/* Expressive minimalist eyes */}
          <g className="sb-eyes">
            {(mood === 'idle' || mood === 'happy' || mood === 'patrol') && (
              <>
                <path d="M68 69 C70 63.5 75.5 63.5 77.5 69" stroke={INK} strokeWidth="3.6" strokeLinecap="round" />
                <path d="M85.5 69 C87.5 63.5 93 63.5 95 69" stroke={INK} strokeWidth="3.6" strokeLinecap="round" />
              </>
            )}

            {/* Sitting & Watching You Work — live mouse-tracking curious round eyes! */}
            {isSitting && (
              <>
                <ellipse cx="72.5" cy="67.5" rx="5.2" ry="6.2" fill="#FFFFFF" stroke={INK} strokeWidth="2.4" />
                <circle
                  className="sb-pupil-left"
                  cx={72.5 + pupilDx}
                  cy={67.5 + pupilDy}
                  r="2.9"
                  fill={INK}
                />
                <circle cx={71.4 + pupilDx} cy={66.1 + pupilDy} r="1" fill="#FFFFFF" />

                <ellipse cx="90.5" cy="67.5" rx="5.2" ry="6.2" fill="#FFFFFF" stroke={INK} strokeWidth="2.4" />
                <circle
                  className="sb-pupil-right"
                  cx={90.5 + pupilDx}
                  cy={67.5 + pupilDy}
                  r="2.9"
                  fill={INK}
                />
                <circle cx={89.4 + pupilDx} cy={66.1 + pupilDy} r="1" fill="#FFFFFF" />
              </>
            )}

            {/* Rolling (左右碌) — wide playful tumbling eyes! */}
            {isRolling && (
              <>
                <ellipse cx="73" cy="67.5" rx="3.4" ry="5" fill={INK} />
                <ellipse cx="90" cy="67.5" rx="3.4" ry="5" fill={INK} />
                <circle cx="71.8" cy="65.6" r="1.2" fill="#FFFFFF" />
                <circle cx="88.8" cy="65.6" r="1.2" fill="#FFFFFF" />
              </>
            )}

            {mood === 'celebrate' && (
              <>
                <path
                  d="M73 60.5 L75.2 65 L80 65.8 L76.4 69 L77.3 73.8 L73 71.4 L68.7 73.8 L69.6 69 L66 65.8 L70.8 65 Z"
                  fill="#F6C942"
                  stroke={INK}
                  strokeWidth="2.1"
                  strokeLinejoin="round"
                />
                <path
                  d="M90 60.5 L92.2 65 L97 65.8 L93.4 69 L94.3 73.8 L90 71.4 L85.7 73.8 L86.6 69 L83 65.8 L87.8 65 Z"
                  fill="#F6C942"
                  stroke={INK}
                  strokeWidth="2.1"
                  strokeLinejoin="round"
                />
              </>
            )}

            {isSus && (
              <>
                <path d="M65.5 65.5 L78.5 67" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
                <path d="M66.5 66 C67 71.5 77.5 71.5 77.5 66.8" stroke={INK} strokeWidth="2.4" fill="#FFFFFF" />
                <circle cx="74" cy="68.2" r="2.2" fill={INK} />

                <path d="M84.5 67 L97.5 65.5" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
                <path d="M85.5 66.8 C85.5 71.5 96 71.5 96.5 66" stroke={INK} strokeWidth="2.4" fill="#FFFFFF" />
                <circle cx="92.8" cy="68.2" r="2.2" fill={INK} />
              </>
            )}

            {(mood === 'sleepy' || mood === 'error' || mood === 'nap' || mood === 'exhausted') && (
              <>
                <path d="M67.5 68.5 L77.5 68.5" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
                <path d="M69 72.5 C71.5 73.8 74.5 73.8 76.5 72.5" stroke="#9B8568" strokeWidth="1.9" strokeLinecap="round" />
                <path d="M85.5 68.5 L95.5 68.5" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
                <path d="M87 72.5 C89.5 73.8 92.5 73.8 94.5 72.5" stroke="#9B8568" strokeWidth="1.9" strokeLinecap="round" />
              </>
            )}

            {mood === 'comfort' && (
              <>
                <circle cx="72.5" cy="67.5" r="3" fill={INK} />
                <circle cx="90.5" cy="67.5" r="3" fill={INK} />
                <path d="M77.5 73.5 C80 75.8 83 75.8 85.5 73.5" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
              </>
            )}

            {isDragged && (
              <>
                <path d="M67 63.5 L76 67.5 L67 71.5" stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M96 63.5 L87 67.5 L96 71.5" stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </>
            )}

            {(mood === 'thinking' || mood === 'quizGenerating') && (
              <>
                <ellipse cx="74" cy="65.5" rx="3.2" ry="4.2" fill={INK} />
                <ellipse cx="92" cy="65.5" rx="3.2" ry="4.2" fill={INK} />
                <circle cx="75.2" cy="63.8" r="1.1" fill="#FFFFFF" />
                <circle cx="93.2" cy="63.8" r="1.1" fill="#FFFFFF" />
              </>
            )}

            {(mood === 'streaming' || mood === 'grading') && (
              <>
                <rect x="70.5" y="62.5" width="4.8" height="9.2" rx="2.4" fill={INK} />
                <rect x="88.5" y="62.5" width="4.8" height="9.2" rx="2.4" fill={INK} />
              </>
            )}

            {isFocus && (
              <>
                <rect x="70.5" y="63.5" width="4.5" height="7.5" rx="2.2" fill={INK} />
                <rect x="88.5" y="63.5" width="4.5" height="7.5" rx="2.2" fill={INK} />
              </>
            )}
          </g>

          {/* Optional round study glasses */}
          {showGlasses && (
            <g className="sb-accessory-glasses">
              <circle cx="72.5" cy="67.5" r="8.2" stroke={INK} strokeWidth="2.8" fill="rgba(255,255,255,0.22)" />
              <circle cx="91" cy="67.5" r="8.2" stroke={INK} strokeWidth="2.8" fill="rgba(255,255,255,0.22)" />
              <path d="M80.7 67.5 L82.8 67.5" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
              <path d="M59 66 L64.3 67" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
              <path d="M99.2 67 L104 66" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
            </g>
          )}
        </g>

        {/* Detached floating round hands */}
        {isCheering && (
          <g className="sb-hands sb-hands-cheer">
            <circle cx="29" cy="54" r="9.5" fill={palette.body} stroke={INK} strokeWidth="3.8" />
            <circle cx="122" cy="54" r="9.5" fill={palette.body} stroke={INK} strokeWidth="3.8" />
          </g>
        )}

        {isSus && (
          <g className="sb-hands sb-hand-point">
            <path
              d="M113 84 C113 78 120 77 125 78 L135 78 C139 78 140 84 135 85 L127 86 C128 90 124 94 118 93 C114 92 113 88 113 84 Z"
              fill={palette.body}
              stroke={INK}
              strokeWidth="3.6"
              strokeLinejoin="round"
            />
          </g>
        )}

        {isWorking && (
          <g className="sb-hands sb-hand-work">
            <circle cx="122" cy="84" r="8.2" fill={palette.body} stroke={INK} strokeWidth="3.6" />
            <path d="M126 78 L136 68" stroke="#1F5E46" strokeWidth="4.2" strokeLinecap="round" />
            <path d="M134.5 69.5 L138 66" stroke="#F6CA44" strokeWidth="3.5" strokeLinecap="round" />
          </g>
        )}

        {isDragged && (
          <g className="sb-hands sb-hands-flail">
            <circle cx="26" cy="70" r="8.5" fill={palette.body} stroke={INK} strokeWidth="3.8" />
            <circle cx="124" cy="70" r="8.5" fill={palette.body} stroke={INK} strokeWidth="3.8" />
          </g>
        )}
      </g>

      {/* Non-text comic symbols */}
      {mood === 'celebrate' && (
        <g className="sb-fx sb-fx-stars">
          <path d="M26 24 L29 31 L36 34 L29 37 L26 44 L23 37 L16 34 L23 31 Z" fill="#F6CA44" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M122 16 L125.5 24 L133.5 27.5 L125.5 31 L122 39 L118.5 31 L110.5 27.5 L118.5 24 Z" fill="#F6CA44" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M132 45 L134 49.5 L138.5 51.5 L134 53.5 L132 58 L130 53.5 L125.5 51.5 L130 49.5 Z" fill="#F6CA44" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
        </g>
      )}

      {mood === 'error' && (
        <g className="sb-fx sb-fx-steam">
          <path
            d="M114 34 C112 29 116 24 121 25 C124 21 131 22 132 27 C136 28 137 34 132 37 C129 40 120 40 116 37 Z"
            fill="#FFFFFF"
            stroke={INK}
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
        </g>
      )}

      {mood === 'sleepy' && (
        <g className="sb-fx sb-fx-zzz">
          <path d="M113 36 L122 36 L113 44 L122 44" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M125 21 L136 21 L125 31 L136 31" stroke={INK} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      )}

      {(mood === 'thinking' || mood === 'quizGenerating') && (
        <g className="sb-fx sb-fx-bulb">
          <circle cx="124" cy="24" r="9.5" fill="#F8D458" stroke={INK} strokeWidth="2.8" />
          <path d="M120.5 34.5 L127.5 34.5 M121.5 38 L126.5 38" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M124 9 L124 12 M137 15 L134.5 17 M111 15 L113.5 17" stroke="#E89B2D" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {isSus && (
        <g className="sb-fx sb-fx-alert">
          <path d="M118 20 L124 28 M129 16 L128 26 M136 25 L129 30" stroke="#E05A3F" strokeWidth="3.2" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
