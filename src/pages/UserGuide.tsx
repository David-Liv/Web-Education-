import { Fragment, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import guide from '../../docs/user-guide.md?raw';
import { Badge, Icon, PageHeading } from '../components';

// A deliberately small, text-only renderer for the project's trusted guide.
// No HTML execution; the Markdown source also remains directly downloadable.
function inline(text: string): ReactNode {
  return text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      if (link[2].startsWith('/') && !link[2].startsWith('//')) return <Link key={i} to={link[2]}>{link[1]}</Link>;
      if (/^https:\/\//.test(link[2])) return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
      return <Fragment key={i}>{link[1]}</Fragment>;
    }
    return part.startsWith('**') ? <strong key={i}>{part.slice(2,-2)}</strong> : <Fragment key={i}>{part}</Fragment>;
  });
}
function blocks(text: string) {
  return text.trim().split(/\r?\n\s*\r?\n/).map((block, i) => {
    const lines = block.split(/\r?\n/);
    if (lines.every(line => /^\d+\. /.test(line))) return <ol key={i}>{lines.map((line,j)=><li key={j}>{inline(line.replace(/^\d+\. /,''))}</li>)}</ol>;
    if (lines.every(line => line.startsWith('- '))) return <ul key={i}>{lines.map((line,j)=><li key={j}>{inline(line.slice(2))}</li>)}</ul>;
    return <p key={i}>{inline(block)}</p>;
  });
}
const [intro, ...parts] = guide.split(/^## /m);
const sections = parts.map((text,i) => { const end = text.indexOf('\n'); return { id:`guide-${i+1}`, title:text.slice(0,end).trim(), text:text.slice(end+1) }; });

export function UserGuidePage() {
  const [download, setDownload] = useState('');
  useEffect(() => { const url=URL.createObjectURL(new Blob([guide],{type:'text/markdown;charset=utf-8'}));setDownload(url);return()=>URL.revokeObjectURL(url); },[]);
  return <div className="page-enter user-guide"><PageHeading eyebrow="A LITTLE GUIDANCE, YOUR OWN PACE" title="學序使用指南" description="從設定目標到每天溫習，按自己的需要找下一步。" action={<a className="btn secondary" href={download||undefined} download="HOKSE-使用指南.md"><Icon name="arrowDown" size={16}/>下載指南</a>}/><div className="guide-intro card">{blocks(intro.replace(/^# .*\r?\n/,''))}<Badge tone="green">與目前版本同步維護</Badge></div><div className="guide-layout"><nav className="card guide-contents" aria-label="使用指南目錄"><strong>快速找到需要的說明</strong>{sections.map(s=><a key={s.id} href={`#${s.id}`}>{s.title}</a>)}</nav><article className="guide-article">{sections.map(s=><section className="card guide-section" id={s.id} key={s.id}><h2>{s.title}</h2>{blocks(s.text)}</section>)}</article></div></div>;
}
