import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, Modal } from './components';
import { extractCircledMarker } from './guide-parser';
import type { GuideSlide } from './guide-parser';

export function renderGuideInline(text: string): ReactNode {
  return text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      if (link[2].startsWith('/') && !link[2].startsWith('//')) return <Link key={i} to={link[2]}>{link[1]}</Link>;
      if (/^https:\/\//.test(link[2])) return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
      return <Fragment key={i}>{link[1]}</Fragment>;
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function renderGuideBlocks(text: string, onZoomImage?: (alt: string, src: string) => void): ReactNode {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.split(/\r?\n\s*\r?\n/).map((block, i) => {
    const lines = block.split(/\r?\n/).map(line => line.trimEnd());
    if (lines.length === 1 && lines[0].startsWith('### ')) {
      return <h3 key={i} className="guide-subheading">{renderGuideInline(lines[0].slice(4))}</h3>;
    }
    const imageMatch = lines.length === 1 ? lines[0].trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/) : null;
    if (imageMatch && imageMatch[2].startsWith('/') && !imageMatch[2].startsWith('//')) {
      const [, alt, src] = imageMatch;
      return (
        <figure key={i} className="guide-figure">
          <button
            type="button"
            className="guide-figure-btn"
            onClick={() => onZoomImage?.(alt, src)}
            aria-label={alt || 'Zoom image'}
          >
            <img src={src} alt={alt} loading="lazy" />
          </button>
          {alt && <figcaption>{alt}</figcaption>}
        </figure>
      );
    }
    if (lines.every(line => /^\d+\. /.test(line))) {
      return (
        <ol key={i}>
          {lines.map((line, j) => <li key={j}>{renderGuideInline(line.replace(/^\d+\. /, ''))}</li>)}
        </ol>
      );
    }
    if (lines.every(line => line.startsWith('- '))) {
      const items = lines.map(line => line.slice(2).trim());
      const hasMarkers = items.some(item => extractCircledMarker(item) !== null);
      if (hasMarkers) {
        return (
          <ul key={i} className="guide-step-legend">
            {items.map((item, j) => {
              const marker = extractCircledMarker(item);
              if (marker) {
                return (
                  <li key={j} className="guide-step-item">
                    <span className="guide-step-badge" aria-hidden="true">{marker.num}</span>
                    <span>{renderGuideInline(marker.rest)}</span>
                  </li>
                );
              }
              return <li key={j} className="guide-step-item is-plain"><span>{renderGuideInline(item)}</span></li>;
            })}
          </ul>
        );
      }
      return (
        <ul key={i}>
          {items.map((item, j) => <li key={j}>{renderGuideInline(item)}</li>)}
        </ul>
      );
    }
    return <p key={i}>{renderGuideInline(block)}</p>;
  });
}

export function GuideStepCarousel({
  slides,
  english,
  sectionTitle,
}: {
  slides: GuideSlide[];
  english: boolean;
  sectionTitle: string;
}) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const safeIndex = Math.min(index, slides.length - 1);
  const current = slides[safeIndex];
  const multi = slides.length > 1;

  if (!current) return null;

  const prev = () => setIndex(i => (i > 0 ? i - 1 : slides.length - 1));
  const next = () => setIndex(i => (i + 1 < slides.length ? i + 1 : 0));

  return (
    <div className="guide-carousel" role="region" aria-label={sectionTitle}>
      {multi && (
        <div className="guide-carousel-bar">
          <div className="guide-carousel-tabs" role="tablist" aria-label={english ? 'Steps' : '操作步驟'}>
            {slides.map((slide, i) => (
              <button
                key={`${slide.title}-${i}`}
                type="button"
                role="tab"
                aria-selected={i === safeIndex}
                className={`guide-step-tab ${i === safeIndex ? 'active' : ''}`}
                onClick={() => setIndex(i)}
              >
                <span className="guide-step-tab-num">{i + 1}</span>
                <span className="guide-step-tab-label">{slide.title.replace(/^(?:步驟|Step)\s*\d+\s*[：:]\s*/i, '')}</span>
              </button>
            ))}
          </div>
          <div className="guide-carousel-nav">
            <span className="guide-carousel-count" aria-live="polite">
              {safeIndex + 1} / {slides.length}
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label={english ? 'Previous screen' : '上一步畫面'}
              onClick={prev}
            >
              <Icon name="left" size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={english ? 'Next screen' : '下一步畫面'}
              onClick={next}
            >
              <Icon name="right" size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="guide-slide-card">
        <div className="guide-slide-head">
          <h3>{current.title}</h3>
          <button
            type="button"
            className="guide-zoom-pill"
            onClick={() => setZoomed(true)}
          >
            <Icon name="maximize" size={13} />
            {english ? 'Zoom' : '點擊放大'}
          </button>
        </div>

        <button
          type="button"
          className="guide-shot-frame"
          onClick={() => setZoomed(true)}
          aria-label={english ? `Enlarge screenshot: ${current.title}` : `放大檢視截圖：${current.title}`}
        >
          <img src={current.src} alt={current.alt || current.title} loading="lazy" />
        </button>

        {current.body && (
          <div className="guide-slide-caption">
            {renderGuideBlocks(current.body)}
          </div>
        )}

        {multi && (
          <div className="guide-slide-footer">
            <button type="button" className="btn ghost" onClick={prev}>
              <Icon name="left" size={15} />
              {english ? 'Previous' : '上一步'}
            </button>
            <div className="guide-dots" aria-hidden="true">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  tabIndex={-1}
                  className={`guide-dot ${i === safeIndex ? 'active' : ''}`}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
            <button type="button" className="btn secondary" onClick={next}>
              {english ? 'Next step' : '下一步'}
              <Icon name="right" size={15} />
            </button>
          </div>
        )}
      </div>

      {zoomed && (
        <Modal
          title={current.title}
          subtitle={multi ? `${sectionTitle} · ${safeIndex + 1} / ${slides.length}` : sectionTitle}
          onClose={() => setZoomed(false)}
          wide
        >
          <div className="guide-lightbox">
            <img src={current.src} alt={current.alt || current.title} />
            {current.body && <div className="guide-slide-caption">{renderGuideBlocks(current.body)}</div>}
            {multi && (
              <div className="guide-slide-footer">
                <button type="button" className="btn secondary" onClick={prev}>
                  <Icon name="left" size={15} />
                  {english ? 'Previous' : '上一步'}
                </button>
                <span className="guide-carousel-count">{safeIndex + 1} / {slides.length}</span>
                <button type="button" className="btn primary" onClick={next}>
                  {english ? 'Next step' : '下一步'}
                  <Icon name="right" size={15} />
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
