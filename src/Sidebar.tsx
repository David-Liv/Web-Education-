import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Link,NavLink} from 'react-router-dom';
import {Icon,Progress} from './components';
import {primaryNav,studyNav,askNav,exploreNav,toolNav} from './navigation';
import type {NavigationItem} from './navigation';
import {ui,useInterfaceLanguage} from './i18n';
import {useApp} from './state';
import {realMode} from './api/client';

export function Sidebar({mobile,collapsed,onToggle,onClose}:{mobile:boolean;collapsed:boolean;onToggle:()=>void;onClose:()=>void}){
 useInterfaceLanguage();const {db}=useApp(),[tip,setTip]=useState<{label:string;x:number;y:number}|null>(null);
 const closeRef=useRef<HTMLButtonElement>(null),openerRef=useRef<HTMLElement|null>(null),wasMobile=useRef(false);
 useEffect(()=>{
  if(mobile&&!wasMobile.current){
   openerRef.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
   requestAnimationFrame(()=>closeRef.current?.focus());
  }else if(!mobile&&wasMobile.current){
   const prev=openerRef.current;openerRef.current=null;
   if(prev&&prev.isConnected)requestAnimationFrame(()=>prev.focus());
  }
  wasMobile.current=mobile;
 },[mobile]);
 const today=db.tasks.filter(t=>t.date===db.profile.date&&t.kind!=='exam'),done=today.filter(t=>t.status==='done').length;
 const due=db.reviews.filter(r=>r.dueDate<=db.profile.date&&r.lastReviewed!==db.profile.date).length;
 const toggleLabel=ui(collapsed?'展開側邊欄':'收起側邊欄');
 const showTip=(target:EventTarget|null)=>{
  if(!collapsed||window.matchMedia('(max-width:900px)').matches)return;
  const anchor=target instanceof Element?target.closest<HTMLElement>('[data-sidebar-label]'):null;
  if(!anchor){setTip(null);return}const rect=anchor.getBoundingClientRect();setTip({label:anchor.dataset.sidebarLabel!,x:rect.right+14,y:Math.max(12,Math.min(window.innerHeight-48,rect.top+rect.height/2-18))});
 };
 // The visible label stays in the accessible name (it is only visually hidden when
 // collapsed), so screen readers also hear the due-review count.
 const item=([to,label,icon]:NavigationItem)=><NavLink key={to} to={to} data-sidebar-label={ui(label)} onClick={onClose} className={({isActive})=>`nav-item ${isActive?'active':''}`}><Icon name={icon}/><span className="nav-label">{ui(label)}</span>{to==='/review'&&due>0&&<span className="nav-count">{due}</span>}{to==='/learn'&&<span className="ai-small" aria-hidden="true">AI</span>}</NavLink>;
 const tools:NavigationItem[]=[...toolNav,...(realMode?[['/billing','套餐與帳單','creditCard'] as NavigationItem]:[]),...(realMode&&db.pilot?.identity.role!=='student'?[['/developer','內容與開發設定','settings'] as NavigationItem]:[])];
 return <><aside id="main-sidebar" aria-label={ui('主要導覽')} className={`sidebar ${mobile?'open':''}`} onMouseOver={e=>showTip(e.target)} onMouseLeave={()=>setTip(null)} onFocusCapture={e=>showTip(e.target)} onBlurCapture={()=>setTip(null)} onScroll={()=>setTip(null)}>
  <div className="sidebar-brand-row"><Link className="brand sidebar-brand-full" to="/overview" onClick={onClose}><img src="/favicon.svg" width="38" height="38" alt=""/><div><strong>{ui('學序')}<span>HOKSE</span></strong><small>{ui('你的 DSE 學習工作室')}</small></div></Link>
   <button type="button" className="sidebar-logo-toggle" aria-label={toggleLabel} aria-expanded={!collapsed} aria-controls="main-navigation" data-sidebar-label={toggleLabel} onClick={()=>{setTip(null);onToggle()}}><img src="/favicon.svg" width="34" height="34" alt=""/><Icon name="sidebarOpen" size={22}/></button>
   <button type="button" className="icon-btn sidebar-collapse" title={toggleLabel} aria-label={toggleLabel} aria-expanded={!collapsed} aria-controls="main-navigation" onClick={onToggle}><Icon name="sidebarClose" size={18}/></button>
   <button ref={closeRef} type="button" className="icon-btn sidebar-mobile-close" aria-label={ui('關閉導覽')} onClick={onClose}><Icon name="x" size={20}/></button>
  </div>
  <nav id="main-navigation" aria-label={ui('主要導覽')}>
   {item(primaryNav[0])}{realMode&&item(['/studio','我的學習流程','leaf'])}{primaryNav.slice(1).map(item)}
   <div className="nav-section-label">{ui('我的學習')}</div>{studyNav.map(item)}
   <div className="nav-section-label">{ui('提問與討論')}</div>{askNav.map(item)}
   <div className="nav-section-label">{ui('探索更多')}</div>{exploreNav.map(item)}
  </nav>
  <div className="sidebar-bottom">
   <div className="sidebar-tools">{tools.map(item)}</div>
   <div className="sidebar-progress"><div><Icon name="list" size={16}/><span>{ui('今日計劃完成')}</span></div><Progress value={today.length?done/today.length*100:0}/><small>{ui('{0} / {1} 項今日任務已完成',[done,today.length])}</small></div>
   <Link to="/settings" className="profile-link" aria-label={ui('個人設定')} data-sidebar-label={ui('個人設定')} onClick={onClose}><span className="avatar" aria-hidden="true">{db.profile.name.slice(-2)}</span><span className="profile-info"><strong>{db.profile.name}</strong><small>{ui('{0} DSE 學生',[db.profile.year])}</small></span><Icon name="settings" size={18}/></Link>
  </div>
 </aside>{tip&&collapsed&&createPortal(<div id="sidebar-tooltip" className="sidebar-tooltip" role="tooltip" style={{left:tip.x,top:tip.y}}>{tip.label}</div>,document.body)}</>;
}
