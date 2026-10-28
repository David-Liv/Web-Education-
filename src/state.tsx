import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Catalog, Database } from './types';
import { api, getBootstrap, getCatalog, realMode } from './api/client';
import { Login } from './Login';
interface AppState {db:Database;catalog:Catalog;refresh:()=>Promise<void>;mutate:<T=any>(path:string,method?:string,body?:unknown)=>Promise<T>;toast:(message:string,type?:'success'|'error')=>void;network:string;setNetwork:(mode:string)=>void}
const Context=createContext<AppState|null>(null);
export function AppProvider({children}:{children:ReactNode}){const [db,setDb]=useState<Database>();const [catalog,setCatalog]=useState<Catalog>();const [error,setError]=useState('');const [auth,setAuth]=useState<{setup:boolean}|null>(null);const [network,setNetworkState]=useState(localStorage.getItem('hokse.network')??'normal');const [toasts,setToasts]=useState<{id:number;message:string;type:string}[]>([]);
 const toast=useCallback((message:string,type='success')=>{const id=Date.now()+Math.random();setToasts(t=>[...t.slice(-2),{id,message,type}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),4200)},[]);
 const refresh=useCallback(async()=>{const [d,c]=await Promise.all([getBootstrap(),getCatalog()]);setDb(d);setCatalog(c)},[]);
 const load=useCallback(async()=>{setError('');try{if(realMode){const status=await api('/auth/status');if(!status.identity){setDb(undefined);setCatalog(undefined);setAuth({setup:status.setupRequired});return}setAuth(null)}const [d,c]=await Promise.all([getBootstrap(),getCatalog()]);setDb(d);setCatalog(c)}catch(e){setError((e as Error).message)}},[]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{const loggedOut=()=>{setDb(undefined);setCatalog(undefined);setAuth({setup:false})};window.addEventListener('hokse:unauthorized',loggedOut);return()=>window.removeEventListener('hokse:unauthorized',loggedOut)},[]);
 const setNetwork=(mode:string)=>{localStorage.setItem('hokse.network',mode);setNetworkState(mode);toast(mode==='normal'?'已恢復正常連線':mode==='slow'?'已開啟慢速網絡示範':'已開啟連線失敗示範')};
 const mutate=useCallback(async<T,>(path:string,method='POST',body?:unknown)=>{try{const result=await api<T>(path,method,body);await refresh();return result}catch(e){toast((e as Error).message,'error');throw e}},[refresh,toast]);
 if(auth)return <Login setup={auth.setup} onDone={()=>void load()}/>;
 if(error)return <main className="boot-state"><img src="/favicon.svg" width="52"/><h1>暫時未能載入學習工作室</h1><p>{error}</p><button className="btn primary" onClick={()=>{localStorage.setItem('hokse.network','normal');setNetworkState('normal');void load()}}>恢復正常連線並重試</button></main>;
 if(!db||!catalog)return <main className="boot-state"><img src="/favicon.svg" width="56"/><h1>把今天的學習，慢慢排好。</h1><span className="loading-dots"><i/><i/><i/></span></main>;
 return <Context.Provider value={{db,catalog,refresh,mutate,toast,network,setNetwork}}>{children}<div className="toast-stack" aria-live="polite">{toasts.map(t=><div key={t.id} className={`toast ${t.type}`}>{t.type==='error'?'!':'✓'} <span>{t.message}</span></div>)}</div></Context.Provider>;
}
export function useApp(){const value=useContext(Context);if(!value)throw new Error('AppProvider missing');return value}
