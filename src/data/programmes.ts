import type { Programme, ScoreFormula } from '../types.ts';
// Facts transcribed from the rendered BigExam programme pages on 2026-10-27.
// Score Index is NOT a raw admission score. The source's academic years are retained.
const institutionNames:Record<string,string>={HKU:'香港大學',CUHK:'香港中文大學',HKUST:'香港科技大學',PolyU:'香港理工大學',CityU:'香港城市大學',HKBU:'香港浸會大學',LU:'嶺南大學',EdUHK:'香港教育大學',HKMU:'香港都會大學','SPACE CC':'香港大學附屬學院','PolyU HKCC':'香港理工大學香港專上學院'};
function p(id:string,institution:string,name:string,en:string,area:string,index:number|null,lq:number,ratio:number,weights:Record<string,number>={},required:string[]=[],extra:Partial<Programme>={}):Programme {
 const formula:ScoreFormula={count:5,required,weights,scale:['HKBU','LU','HKMU'].includes(institution)?'standard':'enhanced',verified:false};
 return {id,institution,institutionName:institutionNames[institution],name,en,qualification:'學士',area,route:'JUPAS',url:`https://dse.bigexam.hk/en/pathway/progs/jupasProg/${id}`,statisticsYear:'2025/26',formulaYear:2026,median:null,mean:null,lowerQuartile:null,lowerQuartileIndex:lq,scoreIndex:index,indexKind:index===null?'unavailable':'median',competitionRatio:ratio,selection:'Best 5',weightingText:Object.entries(weights).map(([s,w])=>`${({chi:'中文',eng:'英文',maths:'數學',chem:'化學',bio:'生物',phy:'物理',econ:'經濟',bafs:'企會財',ict:'ICT',music:'音樂',va:'視藝',pe:'體育'} as Record<string,string>)[s]??s} ×${w}`).join('；')||'來源未列額外科目倍率',formula,minimum:{chi:'3',eng:'3',maths:'2',csd:'A'},note:'BigExam 詳情的計分學年為 2026/27；指數統計為 2025/26。精確換算表及額外加分仍需核對，計算器為示範。',checkedAt:'2026-10-27',...extra};
}
export const programmes:Programme[]=[
 p('JS6315','HKU','數據與系統工程工學學士','BEng in Data and Systems Engineering','工程與科技',4.8,4.7,29.9,{},['eng','maths'],{requiredGroups:[['bio','chem','phy']],minimum:{chi:'3',eng:'3',maths:'3',csd:'A'},note:'須具備一科生物、化學或物理；M1/M2 可作選修。精確計分換算待核實。'}),
 p('JS6274','HKU','文學士（全球創意產業）','BA in Global Creative Industries','商業與創意',5.0,4.9,10.7,{eng:2,chi:1.5},['eng'],{minimum:{chi:'3',eng:'4',maths:'3',csd:'A'}}),
 p('JS4372','CUHK','教育學士（幼兒教育）','BEd in Early Childhood Education','教育',4.3,4.2,24.4),
 p('JS4329','CUHK','健康與體育運動科學','Physical Education, Exercise Science and Health','體育與健康',5.0,4.8,18.1),
 p('JS4109','CUHK','宗教研究','Religious Studies','人文與社會科學',4.2,4.1,16.3,{eng:1.25}),
 p('JS5260','HKUST','工業工程及決策分析學系','Industrial Engineering and Decision Analytics','工程與科技',4.0,3.9,12.2,{eng:2,maths:2,M1:2,M2:2,phy:2,ict:1.5},['eng','maths'],{formula:{count:5,required:['eng','maths'],weights:{eng:2,maths:2,M1:2,M2:2,phy:2,ict:1.5},scale:'enhanced',maxWeightedSubjects:4,requiredGroups:[['bio','chem','phy','ict']],verified:false},minimum:{chi:'3',eng:'3',maths:'3',csd:'A'},note:'來源列最多四科獲較高加權；第六科加分及完整換算需核對。'}),
 p('JS5317','HKUST','工商管理學士（營運管理學）','BBA in Operations Management','商業與管理',4.3,4.2,10.7,{eng:2,maths:2},['eng','maths'],{minimum:{chi:'3',eng:'4',maths:'3',csd:'A'}}),
 p('JS5316','HKUST','工商管理學士（市場學）','BBA in Marketing','商業與管理',4.3,4.3,9.4,{eng:2,maths:2},['eng','maths'],{minimum:{chi:'3',eng:'4',maths:'3',csd:'A'}}),
 p('JS3003','PolyU','工商管理組合學士課程','Bachelor’s Degree Scheme in Business Administration','商業與管理',4.2,4.2,52.2,{},[],{weightingText:'英文、數學：最高加權；中文：較高加權。來源未列數值。',formula:null,note:'BigExam 提供相對加權層級，未提供此課程的精確倍率，因此不虛構計分結果。'}),
 p('JS3160','PolyU','體育科技（榮譽）理學士','BSc (Hons) in Sports Science and Technology','體育與健康',null,0,29.8,{},[],{weightingText:'數學、M1/M2、生物、化學、物理、設計科技、ICT：最高加權；中英文：較高加權。',formula:null,note:'來源未提供錄取分數；科目權重只有層級，精確倍率待核實。'}),
 p('JS3004','PolyU','建設及環境組合學士課程','Bachelor’s Degree Scheme in Construction and Environment','工程與環境',3.9,3.9,28.9,{},[],{weightingText:'英文、數學、M1/M2、物理、地理：最高加權；中文：較高加權。',formula:null,note:'來源未列出精確權重數值。'}),
 p('JS1219','CityU','工學士（創新與企業工程）','BEng in Innovation and Enterprise Engineering','工程與科技',3.9,3.7,95.6,{},['eng','maths']),
 p('JS1216','CityU','工學士（智能製造工程學）','BEng in Intelligent Manufacturing Engineering','工程與科技',4.0,3.6,92.4,{},['eng','maths']),
 p('JS1053','CityU','理學士（環境及可持續發展商業）','BSc in Environment and Sustainable Business','環境與商業',3.8,3.8,37.4,{eng:2,maths:2.5,bio:2.5,chem:2.5,phy:2.5,bafs:2.5,econ:2.5,M1:1.5,M2:1.5,geo:1.5},['eng','maths'],{formula:null,weightingText:'數學 ×2.5；英文 ×2；指定理科／商科 ×2.5，另有選修組別 ×1.5。',minimum:{chi:'3',eng:'3',maths:'3',csd:'A'},note:'不同選修位置套用不同倍率，保留來源規則；此版不以簡單乘法冒充完整計分。'}),
 p('JS2340','HKBU','環球螢幕演技藝術學士（榮譽）','BFA (Hons) in Acting for Global Screen','藝術與傳理',3.6,3.4,39.6,{eng:1.5,music:1.2,va:1.2}),
 p('JS2930','HKBU','工商管理文學士（全球娛樂）','BA (Hons) in Business Administration (Global Entertainment)','商業與創意',4.0,3.8,32.4),
 p('JS2370','HKBU','傳理學學士 — 遊戲設計與動畫','BComm (Hons) in Game Design and Animation','設計與創意',4.0,3.8,32.3,{eng:1.25,va:1.15,maths:1.1}),
 p('JS7303','LU','社會科學學士 — 心理學','BSocSc (Hons) in Psychology','社會科學',3.8,3.8,70.9,{eng:2,maths:1.5}),
 p('JS7212','LU','工商管理學士 — 商業分析與創新','BBA (Hons) in Business Analytics and Innovation','商業與科技',3.6,3.3,67.1,{eng:2,maths:2,bafs:1.5,econ:1.5,ict:1.5,M1:1.5,M2:1.5}),
 p('JS7214','LU','工商管理學士 — 管理與分析','BBA (Hons) in Management and Analytics','商業與管理',3.6,3.3,51.8,{eng:2,maths:2,bafs:1.5,econ:1.5,ict:1.5,M1:1.5,M2:1.5}),
 p('JS8010','EdUHK','運動科學及教練／體育教育雙學士','Sports Science and Coaching & Education (PE)','教育與體育',4.0,3.8,50.5,{pe:1.5}),
 p('JS8651','EdUHK','心理學榮譽社會科學學士','BSocSc (Hons) in Psychology','社會科學',4.0,4.0,36.8),
 p('JS8688','EdUHK','個人理財榮譽文學士','BA (Hons) in Personal Finance','商業與金融',3.8,3.8,34.8),
 p('JS9580','HKMU','幼兒教育：領導及特殊教育需要','BEd (Hons) in Early Childhood Education','教育',3.2,2.8,15.5,{},[],{formula:{count:5,required:[],weights:{},scale:'standard',csdCounts:true,verified:false},weightingText:'幼兒成長與發展／幼兒教育 ×2；公社達標可作 2 分。'}),
 p('JSSU93','HKMU','航空服務管理榮譽工商管理學士','BBA (Hons) in Aviation Services Management','商業與航空',3.2,3.2,11.9,{},[],{formula:{count:5,required:[],weights:{},scale:'standard',csdCounts:true,verified:false}}),
 p('JSSU67','HKMU','醫療化驗科學榮譽理學士','BSc (Hons) in Medical Laboratory Science','醫療與健康',3.8,3.6,10.7,{},[],{formula:{count:5,required:[],weights:{},scale:'standard',csdCounts:true,verified:false},note:'生物及化學為偏好科目；公社達標可按來源作 2 分。'}),
 // A fully specified official example makes the real what-if calculator reviewable.
 p('JS6755','HKU','工商管理學士','Bachelor of Business Administration','商業與管理',null,0,0,{eng:1.5,maths:1.5},['eng','maths'],{formulaYear:2027,statisticsYear:'未收錄',formula:{count:5,required:['eng','maths'],weights:{eng:1.5,maths:1.5},scale:'enhanced',verified:true},url:'https://ug.hkubs.hku.hk/admission/faq/jupas-applicants',minimum:{chi:'3',eng:'4',maths:'3',csd:'A'},note:'完整計分示例採港大商學院已公布的 2027 規則；2028 規則及原始收分中位數尚未核實。'}),
 ...[
  ['SPACE-ENG','SPACE CC','工程學副學士','Associate of Engineering','副學士',null],
  ['SPACE-IT','SPACE CC','資訊科技高級文憑','Higher Diploma in Information Technology','高級文憑',null],
  ['8C112-ENG','PolyU HKCC','工程學副學士','Associate in Engineering','副學士',16.28],
  ['8C123','PolyU HKCC','社會工作高級文憑','Higher Diploma in Social Work','高級文憑',16.31],
 ].map(([id,ins,name,en,qualification,mean])=>({id:String(id),institution:String(ins),institutionName:institutionNames[String(ins)],name:String(name),en:String(en),qualification:qualification as '副學士'|'高級文憑',area:qualification==='副學士'?'副學位升學':'專業與職業',route:'直接申請 / E-APP' as const,url:ins==='SPACE CC'?'https://www2.hkuspace.hku.hk/cc/admission/general-entrance-requirements/':'https://www.hkcc-polyu.edu.hk/en/admission/key-information-for-application/admission-score-for-2026-27-cohort/index.html',statisticsYear:mean?'2026/27':'未公布',formulaYear:2026,median:null,mean:mean as number|null,lowerQuartile:mean?15:null,scoreIndex:null,indexKind:'unavailable' as const,selection:'中英文＋最佳其他三科',weightingText:'中英文必計，五科共同計分制；另須符合課程特定要求。',formula:{count:5,required:['chi','eng'],weights:{},scale:'standard' as const,verified:ins==='PolyU HKCC'},minimum:(ins==='SPACE CC'?{chi:'2',eng:'2',maths:'2'}:{chi:'2',eng:'2'}) as Programme['minimum'],note:mean?'院校公布的是平均分（mean），不是 median；以 7 分制計算。':'未取得此課程的官方錄取中位數；保留空值。資訊科技／工程課程另有數學要求。',checkedAt:'2026-10-27'})),
];
