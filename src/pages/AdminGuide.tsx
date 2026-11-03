import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguageSettings } from '../i18n';
import { useApp } from '../state';
import { api, realMode } from '../api/client';
import { GuideContent } from './UserGuide';

export function AdminGuidePage() {
  const { db }=useApp(),{language,setLanguage}=useLanguageSettings();
  const english=language==='en',allowed=realMode&&db.pilot?.identity.role==='developer';
  const [guide,setGuide]=useState(''),[error,setError]=useState('');
  useEffect(()=>{if(!allowed)return;const controller=new AbortController();setGuide('');setError('');
    void api<{markdown:string}>(`/admin/guide?lang=${english?'en':'zh-HK'}`,'GET',undefined,controller.signal).then(value=>setGuide(value.markdown)).catch(e=>{if(!controller.signal.aborted)setError(e.message)});
    return()=>controller.abort();
  },[allowed,english]);
  if(!allowed)return <section className="card pilot-card"><h1>{english?'Administrator access required':'此指南僅供管理員使用'}</h1><Link className="btn secondary" to="/help">{english?'Open user guide':'前往使用指南'}</Link></section>;
  if(error)return <p className="form-error" role="alert">{error}</p>;
  if(!guide)return <p role="status">{english?'Loading administrator guide…':'正在讀取管理員指南…'}</p>;
  return <GuideContent guide={guide} english={english} admin onLanguageChange={value=>setLanguage(value?'en':'zh-HK')}/>;
}
