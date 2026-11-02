import {createContext, useContext, useEffect, useState} from 'react';
import type {ReactNode} from 'react';
import {useSearchParams} from 'react-router-dom';
import {resolveInterfaceLanguage, translate} from './i18n/messages';
import type {InterfaceLanguage} from './i18n/messages';
export {translate} from './i18n/messages';
export type {InterfaceLanguage} from './i18n/messages';

const storageKey = 'hokse.interface-language';
function initialLanguage(): InterfaceLanguage {
  try {return resolveInterfaceLanguage(window.location.search, localStorage.getItem(storageKey))}
  catch {return typeof window === 'undefined' ? 'zh-HK' : resolveInterfaceLanguage(window.location.search, null)}
}
let activeLanguage = initialLanguage();
export function ui(key: string | null | undefined, args: unknown[] = []) {return key == null ? '' : translate(activeLanguage, key, args)}
export function systemLabel(text: string) {return text.split('；').map(part=>ui(part)).join(activeLanguage==='en'?'; ':'；')}
export function interfaceLocale() {return activeLanguage === 'en' ? 'en-GB' : 'zh-HK'}
// Presentation helpers stay separate from domain.ts, which also runs on the server.
export function readableDate(date: string, options: Intl.DateTimeFormatOptions = {month: 'long', day: 'numeric'}) {
  return new Intl.DateTimeFormat(interfaceLocale(), {...options, timeZone: 'Asia/Hong_Kong'}).format(new Date(date + 'T04:00:00Z'));
}
export function weekday(index: number) {return activeLanguage === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index] : ['一', '二', '三', '四', '五', '六', '日'][index]}

interface LanguageContextValue {language: InterfaceLanguage; setLanguage: (language: InterfaceLanguage) => void}
const LanguageContext = createContext<LanguageContextValue>({language: activeLanguage, setLanguage: () => {}});
export function InterfaceLanguageProvider({children}: {children: ReactNode}) {
  const [language, setValue] = useState<InterfaceLanguage>(initialLanguage);
  activeLanguage = language;
  const setLanguage = (value: InterfaceLanguage) => {
    activeLanguage = value;
    setValue(value);
    try {localStorage.setItem(storageKey, value)} catch {}
  };
  useEffect(() => {
    try {localStorage.setItem(storageKey, language)} catch {}
    document.documentElement.lang = language;
    document.title = language === 'en' ? 'HOKSE · DSE Study Studio' : '學序 · DSE 學習工作室';
  }, [language]);
  return <LanguageContext.Provider value={{language, setLanguage}}>{children}</LanguageContext.Provider>;
}
export function useInterfaceLanguage() {return useContext(LanguageContext).language}
export function useLanguageSettings() {return useContext(LanguageContext)}
export function LanguageSwitch() {
  const {language, setLanguage} = useLanguageSettings();
  const [params, setParams] = useSearchParams();
  const label = language === 'en' ? 'Interface language' : '界面語言';
  return <label className="interface-language-switch"><span className="sr-only">{label}</span>
    <select aria-label={label} value={language} onChange={e => {
      const value = e.target.value as InterfaceLanguage;
      setLanguage(value);
      if (params.has('lang')) {const next = new URLSearchParams(params); next.set('lang', value); setParams(next, {replace: true})}
    }}><option value="zh-HK" lang="zh-HK">繁體中文</option><option value="en" lang="en">English</option></select></label>;
}
