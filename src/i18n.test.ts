import {describe, expect, it} from 'vitest';
import {readFileSync, readdirSync} from 'node:fs';
import ts from 'typescript';
import english from './i18n/en.json';
import {resolveInterfaceLanguage, translate} from './i18n/messages';
import {localizeCatalog} from './i18n-catalog';
import {catalog} from './data/catalog';
import {calculateScore} from './domain';

const slots = (text:string) => [...text.matchAll(/\{(\d+)(?:\|[^{}|]+\|[^{}|]+)?\}/g)].map(m=>`{${m[1]}}`).sort();
describe('English interface contract',()=>{
  it('preserves all message parameters and has no untranslated English values',()=>{
    for(const [key,value]of Object.entries(english)){
      expect(slots(value),key).toEqual(slots(key));
      expect(value.trim(),key).not.toBe('');
      expect(value,key).not.toMatch(/\p{Script=Han}/u);
    }
  });
  it('covers every literal interface key used by components',()=>{
    const files=['src/Sidebar.tsx','src/App.tsx','src/Login.tsx','src/state.tsx','src/main.tsx','src/components.tsx',...readdirSync('src/pages').filter(f=>f.endsWith('.tsx')).map(f=>'src/pages/'+f)];
    const missing=new Set<string>();
    for(const file of files){
      const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
      const walk=(n:ts.Node)=>{if(ts.isCallExpression(n)&&n.expression.getText(source)==='ui'&&n.arguments[0]&&ts.isStringLiteralLike(n.arguments[0])){
        const key=n.arguments[0].text;if(/\p{Script=Han}/u.test(key)&&!(key in english))missing.add(key);
      }ts.forEachChild(n,walk)};walk(source);
    }
    expect([...missing]).toEqual([]);
  });
  it('uses the saved preference, with an explicit language link taking precedence',()=>{
    expect(resolveInterfaceLanguage('',null)).toBe('zh-HK');
    expect(resolveInterfaceLanguage('','en')).toBe('en');
    expect(resolveInterfaceLanguage('?lang=en','zh-HK')).toBe('en');
    expect(resolveInterfaceLanguage('?lang=zh-HK','en')).toBe('zh-HK');
    expect(resolveInterfaceLanguage('?tab=model','en')).toBe('en');
    expect(resolveInterfaceLanguage('?lang=unknown','en')).toBe('en');
  });
  it('keeps explicit student content verbatim while translating surrounding interface text',()=>{
    const answer='我的答案：3；do not translate {0}';
    expect(translate('en','你的答案：{0}',[answer])).toBe('Your answer: '+answer);
    expect(translate('zh-HK','你的答案：{0}',[answer])).toBe('你的答案：'+answer);
    expect(translate('en',answer)).toBe(answer);
    expect(translate('en','Unknown provider model ID')).toBe('Unknown provider model ID');
  });
  it('translates composed system labels without changing the original question text',()=>{
    expect(translate('en','單元摸底 · 二次方程')).toBe('Unit Diagnostic · Quadratic Equations');
    expect(translate('en','二次方程：方法與情境 · 獨立小測')).toBe('Quadratic Equations: Methods & Context · Independent Quiz');
    expect(translate('en','已在今天內調整 3 項未鎖定活動；總時長維持不變')).toContain('3 unlocked activities');
    const original='x² − 5x + 6 = 0，求較大的根。';
    expect(translate('en',original)).toBe(original);
  });
  it('uses careful DSE and evidence terminology',()=>{
    expect(translate('en','初步掌握（暫定）')).toBe('Initial understanding (provisional)');
    expect(translate('en','尚無正式分數')).toBe('No formal score yet');
    expect(translate('en','難度待標註')).toBe('Difficulty not labelled');
    expect(translate('en','中位收分指數')).toBe('Median admission score index');
  });
  it('uses singular and plural count labels without rewriting input parameters',()=>{
    expect(translate('en','{0} 題',[1])).toBe('1 question');
    expect(translate('en','{0} 題',[3])).toBe('3 questions');
    expect(translate('en','{0} 分鐘',[1])).toBe('1 minute');
    expect(translate('en','{0} 分鐘',[0])).toBe('0 minutes');
    expect(translate('en','你的答案：{0}',['1 questions {0|word|words}'])).toBe('Your answer: 1 questions {0|word|words}');
  });
});

describe('catalogue display localisation',()=>{
  it('does not mutate source data, content, canonical filters or scoring rules',()=>{
    const before=structuredClone(catalog),en=localizeCatalog(catalog,'en');
    expect(catalog).toEqual(before);
    expect(localizeCatalog(catalog,'zh-HK')).toBe(catalog);
    expect(en.subjects.map(s=>s.id)).toEqual(catalog.subjects.map(s=>s.id));
    expect(en.programmes.map(p=>p.qualification)).toEqual(catalog.programmes.map(p=>p.qualification));
    expect(en.resources.map(r=>[r.type,r.price,r.language,r.url])).toEqual(catalog.resources.map(r=>[r.type,r.price,r.language,r.url]));
    expect(en.topics.map(t=>[t.summary,t.example,t.formula,t.misconception])).toEqual(catalog.topics.map(t=>[t.summary,t.example,t.formula,t.misconception]));
    expect(en.programmes.map(p=>p.formula)).toEqual(catalog.programmes.map(p=>p.formula));
    const p=catalog.programmes.find(p=>p.formula)!;
    const grades={chi:'4',eng:'4',maths:'4',chem:'3',bio:'3'} as const;
    expect(calculateScore(grades,en.programmes.find(e=>e.id===p.id)!.formula!)).toEqual(calculateScore(grades,p.formula!));
  });
  it('provides distinct English subject, Applied Learning, topic and resource labels',()=>{
    const en=localizeCatalog(catalog,'en');
    for(const s of en.subjects)for(const value of [s.name,s.short,s.group??''])expect(value).not.toMatch(/\p{Script=Han}/u);
    expect(new Set(en.subjects.filter(s=>s.category==='B').map(s=>s.name)).size).toBe(catalog.subjects.filter(s=>s.category==='B').length);
    for(const t of en.topics)for(const value of [t.name,t.module,t.unit,...t.papers])expect(value).not.toMatch(/\p{Script=Han}/u);
    for(const r of en.resources)for(const value of [r.title,r.description,r.provider])expect(value).not.toMatch(/\p{Script=Han}/u);
  });
});
