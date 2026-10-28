import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppProvider } from './state';
import 'katex/dist/katex.min.css';
import './styles.css';
async function start(){if(import.meta.env.VITE_API_MODE!=='real'){const {worker}=await import('./api/mock');await worker.start({onUnhandledRequest:'bypass',serviceWorker:{url:`${import.meta.env.BASE_URL}mockServiceWorker.js`},quiet:true});}ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AppProvider><App/></AppProvider></BrowserRouter></React.StrictMode>)}
start().catch(error=>{document.getElementById('root')!.textContent=`未能啟動學習工作室：${error.message}。請重新整理頁面。`;console.error(error)});
