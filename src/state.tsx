import {LanguageSwitch} from './i18n';
import {localizeCatalog} from './i18n-catalog';
import { ui, useInterfaceLanguage } from "./i18n";
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Catalog, Database, Chat, ChatMessage, Task } from './types';
import { api, getBootstrap, getCatalog, realMode } from './api/client';
import { Login } from './Login';
import type { BillingView } from './billing-types';
interface AppState {
    billing?: BillingView;
    db: Database;
    catalog: Catalog;
    refresh: () => Promise<void>;
    applyChatMessage:(chatId:string,message:ChatMessage,user?:ChatMessage)=>void;
    applyChatSnapshot:(chat:Chat)=>void;
    applyTask:(task:Task)=>void;
    mutate: <T = any>(path: string, method?: string, body?: unknown) => Promise<T>;
    toast: (message: string, type?: 'success' | 'error', options?:{duration?:number;action?:{label:string;run:()=>void}}) => ()=>void;
    network: string;
    setNetwork: (mode: string) => void;
}
const Context = createContext<AppState | null>(null);
export function AppProvider({ children }: {
    children: ReactNode;
}) {
    const interfaceLanguage=useInterfaceLanguage();
    const [db, setDb] = useState<Database>();
    const [catalog, setCatalog] = useState<Catalog>();
    const [billing, setBilling] = useState<BillingView>();
    const [error, setError] = useState('');
    const [auth, setAuth] = useState<{
        setup: boolean;
        registrationMode?: 'closed' | 'passcode' | 'open';
        passwordResetEnabled?: boolean;
    } | null>(null);
    const [network, setNetworkState] = useState(localStorage.getItem('hokse.network') ?? 'normal');
    const [toasts, setToasts] = useState<{
        id: number;
        message: string;
        type: string;
        action?:{label:string;run:()=>void};
    }[]>([]);
    const toast = useCallback((message: string, type = 'success', options?:{duration?:number;action?:{label:string;run:()=>void}}) => { const id = Date.now() + Math.random();const dismiss=()=>setToasts(t=>t.filter(x=>x.id!==id));setToasts(t => [...t.slice(-2), { id, message, type,action:options?.action }]);const timer=setTimeout(dismiss,options?.duration??4200);return ()=>{clearTimeout(timer);dismiss()}; }, []);
    const refresh = useCallback(async () => { const [d, c, b] = await Promise.all([getBootstrap(), getCatalog(), realMode ? api<BillingView>('/billing') : undefined]); setDb(d); setCatalog(c); setBilling(b); }, []);
    const applyChatMessage=useCallback((chatId:string,message:ChatMessage,user?:ChatMessage)=>setDb(old=>{if(!old)return old;return {...old,chats:old.chats.map(c=>{if(c.id!==chatId)return c;const messages=[...c.messages];if(user&&!messages.some(m=>m.id===user.id))messages.push(user);const i=messages.findIndex(m=>m.id===message.id);if(i<0)messages.push(message);else if((message.revision??0)>=(messages[i].revision??0))messages[i]=message;return {...c,messages}})}}),[]);
    const applyChatSnapshot=useCallback((chat:Chat)=>setDb(old=>old?{...old,chats:old.chats.map(c=>c.id===chat.id?{...chat,messages:chat.messages.map(m=>{const current=c.messages.find(x=>x.id===m.id);return current&&(current.revision??0)>(m.revision??0)?current:m})}:c)}:old),[]);
    const applyTask=useCallback((task:Task)=>setDb(old=>old?{...old,tasks:old.tasks.map(t=>t.id===task.id?task:t)}:old),[]);
    const load = useCallback(async () => { setError(''); try {
        if (realMode) {
            const status = await api('/auth/status');
            if (!status.identity) {
                setDb(undefined);
                setCatalog(undefined);
                setAuth({ setup: status.setupRequired, registrationMode: status.registrationMode ?? 'closed', passwordResetEnabled: Boolean(status.passwordResetEnabled) });
                return;
            }
            setAuth(null);
        }
        const [d, c, b] = await Promise.all([getBootstrap(), getCatalog(), realMode ? api<BillingView>('/billing') : undefined]);
        setDb(d);
        setCatalog(c);
        setBilling(b);
    }
    catch (e) {
        setError((e as Error).message);
    } }, []);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => { const loggedOut = () => { setDb(undefined); setCatalog(undefined); setAuth({ setup: false }); }; window.addEventListener('hokse:unauthorized', loggedOut); return () => window.removeEventListener('hokse:unauthorized', loggedOut); }, []);
    const setNetwork = (mode: string) => { localStorage.setItem('hokse.network', mode); setNetworkState(mode); toast(mode === 'normal' ? '已恢復正常連線' : mode === 'slow' ? '已開啟慢速網絡示範' : '已開啟連線失敗示範'); };
    const mutate = useCallback(async <T,>(path: string, method = 'POST', body?: unknown) => { try {
        const result = await api<T>(path, method, body);
        await refresh();
        return result;
    }
    catch (e) {
        toast((e as Error).message, 'error');
        throw e;
    } }, [refresh, toast]);
    if (auth)
        return <Login setup={auth.setup} registrationMode={auth.registrationMode} passwordResetEnabled={auth.passwordResetEnabled} onDone={() => void load()}/>;
    if (error)
        return <main className="boot-state"><LanguageSwitch/><img src="/favicon.svg" width="52"/><h1>{ui("暫時未能載入學習工作室")}</h1><p>{ui(error)}</p><button className="btn primary" onClick={() => { localStorage.setItem('hokse.network', 'normal'); setNetworkState('normal'); void load(); }}>{ui("恢復正常連線並重試")}</button></main>;
    if (!db || !catalog)
        return <main className="boot-state"><LanguageSwitch/><img src="/favicon.svg" width="56"/><h1>{ui("把今天的學習，慢慢排好。")}</h1><span className="loading-dots"><i /><i /><i /></span></main>;
    return <Context.Provider value={{ db, billing, catalog:localizeCatalog(catalog,interfaceLanguage), refresh, applyChatMessage,applyChatSnapshot,applyTask,mutate, toast, network, setNetwork }}>{children}<div className="toast-stack" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.type === 'error' ? '!' : '✓'} <span>{ui(t.message)}</span>{t.action&&<><span aria-hidden="true">·</span><button type="button" onClick={()=>{setToasts(old=>old.filter(x=>x.id!==t.id));t.action!.run()}}>{ui(t.action.label)}</button></>}</div>)}</div></Context.Provider>;
}
export function useApp() { const value = useContext(Context); if (!value)
    throw new Error('AppProvider missing'); return value; }
