import english from './en.json';

export type InterfaceLanguage = 'zh-HK' | 'en';
const messages: Record<string, string> = english;
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Optional count forms keep English singular/plural grammar in the message,
// rather than applying replacements to student-supplied parameter values.
const fill = (text: string, args: unknown[]) => text.replace(/\{(\d+)(?:\|([^{}|]+)\|([^{}|]+))?\}/g, (token, n, one, other) => {
  const value=args[Number(n)];
  if(value===undefined||value===null)return token;
  return one===undefined?String(value):`${value} ${Number(value)===1?one:other}`;
});

// Prefer specific messages to short suffixes when a server-generated system
// label already contains its values. Explicit parameters are never translated:
// student names, answers and other original content remain exactly as supplied.
const patterns = Object.entries(messages).filter(([key]) => /\{\d+\}/.test(key))
  .sort(([a], [b]) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length)
  .map(([key, value]) => {
    const slots: number[] = [];
    const regex = new RegExp('^' + key.split(/(\{\d+\})/g).map(part => /^\{\d+\}$/.test(part)
      ? (slots.push(Number(part.slice(1, -1))), '([\\s\\S]*?)') : escapeRegex(part)).join('') + '$');
    return {regex, value, slots};
  });

export function resolveInterfaceLanguage(search: string, saved: string | null): InterfaceLanguage {
  const requested = new URLSearchParams(search).get('lang');
  if (requested === 'en') return 'en';
  if (requested === 'zh' || requested === 'zh-HK') return 'zh-HK';
  return saved === 'en' ? 'en' : 'zh-HK';
}

export function translate(language: InterfaceLanguage, key: string, args: unknown[] = [], depth = 0): string {
  if (language !== 'en') return fill(key, args);
  if (messages[key] !== undefined) return fill(messages[key], args);
  if (depth < 3) for (const pattern of patterns) {
    const match = key.match(pattern.regex);
    if (match) {
      const values: string[] = [];
      pattern.slots.forEach((slot, i) => {values[slot] = translate(language, match[i + 1], [], depth + 1)});
      return fill(pattern.value, values);
    }
  }
  return key;
}
