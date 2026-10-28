import { uid } from './domain';
import { realMode } from './api/client';
function storage():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open('hokse-media',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('瀏覽器暫時未能保存附件'))})}
export async function storeFile(file:Blob,name:string){if(file.size>20*1024*1024)throw new Error('附件上限為 20 MB');if(realMode){const response=await fetch((import.meta.env.VITE_API_BASE_URL??'/api/v1')+'/attachments/upload',{method:'POST',headers:{'Content-Type':file.type,'X-File-Name':encodeURIComponent(name),'X-Hokse-Client':'1'},body:file});const data=await response.json();if(!response.ok)throw new Error(data.error?.message??'附件上傳失敗');return data}const id=uid('file');const db=await storage();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(file,id);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(new Error('未能儲存附件，請檢查瀏覽器儲存空間'))}});return {id,name,type:file.type,size:file.size};}
export async function loadFile(id:string){if(realMode){const r=await fetch((import.meta.env.VITE_API_BASE_URL??'/api/v1')+`/attachments/${id}`);if(!r.ok)throw new Error('未能讀取此帳戶附件');return r.blob()}const db=await storage();return new Promise<Blob|undefined>((resolve,reject)=>{const tx=db.transaction('files');const request=tx.objectStore('files').get(id);request.onsuccess=()=>{const result=request.result;db.close();resolve(result)};request.onerror=()=>{db.close();reject(request.error)}})}

export async function clearMedia(){
 const db=await storage();
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').clear();tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(new Error('未能清除本機附件，請再試一次'))}});
}
