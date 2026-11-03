// Pure snapshot projection: fetching and writing are owned by the caller.
const codes = {
  SJ_CHIN:'chi',SJ_ENGL:'eng',SJ1_MECP:'maths',SJ2_MEP1:'M1',SJ2_MEP2:'M2',
  SJ_BIOL:'bio',SJ_CHEM:'chem',SJ_PHYS:'phy',SJ_ECON:'econ',SJ1_ACCT:'bafs',SJ1_BUMA:'bafs',
  SJ_IACT:'ict',SJ_GEOG:'geo',SJ_MUSI:'music',SJ_VIAR:'va',SJ_PHED:'pe',SJ_DNAT:'dat',
  SJ_CASD:'csd',SJ_HIST:'hist',SJ_CHIS:'chist',SJ_CHLI:'clit',SJ_LIEN:'elit',SJ_ETRS:'ers',
  SJ_HMSC:'hmsc',SJ_TOLI:'tl',SJ_TELI:'tl',SJ1_FSNT:'tl',SJ_TOUR:'ths',SJ_TNHS:'ths',SJ_ENLI:'elit',SJ_ENRS:'ers',SJ_BAFS:'bafs',
};
export const categoryASubjects = ['chi','eng','maths','chem','bio','phy','econ','bafs','ict','geo','chist','hist','clit','elit','ers','dat','hmsc','tl','music','pe','ths','va'];
const number = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const ids = value => [...new Set((Array.isArray(value) ? value.flatMap(ids) : value?.code === 'SJ1_MEEP' ? ['M1','M2'] : codes[value?.code] ? [codes[value.code]] : []))];
const group = value => {const subjects=ids(value);return subjects.length?subjects:null};
const nonnegative = v => number(v) !== null && v >= 0 ? v : undefined;

function entryAlternatives(raw, issues) {
  if (!raw) return undefined;
  const rows=Array.isArray(raw)?raw:[raw], branches=[[]];
  let uncertain=false;
  for(const row of rows){
    if(row.stmt){if(/^or$/i.test(row.stmt.trim()))branches.push([]);else uncertain=true;continue}
    const code=row.subj?.code, minimum=String(row.pt??'');
    if(!['1','2','3','4','5','5*','5**'].includes(minimum)){uncertain=true;continue}
    const any=code?.match(/^STR_ANY_(\d+)_SUBJ$/), subjects=any?[...categoryASubjects.filter(id=>!['chi','eng','maths'].includes(id)),'M1','M2']:ids(row.subj);
    if(!subjects.length){uncertain=true;continue}
    branches.at(-1).push({subjects,count:any?Number(any[1]):1,minimum});
  }
  if(uncertain)issues.push('部分選修條件保留來源文字，請核對課程要求。');
  return !uncertain && branches.length && branches.every(b=>b.length) ? branches : undefined;
}

export function normalizeProgrammeRecord(p, importedAt) {
  if(p.route!=='JUPAS')return {...p,scoringBasis:p.formula?.verified?'source':'assumption',scoringAssumptions:p.formula?.verified?[]:['採用已收錄的參考計分規則。']};
  const raw=p.detail?.rawWeights, assumptions=[],issues=[];
  const weights={},required=[],requiredGroups=[],requiredCounts=[];
  const selection=p.selection??'', best=selection.match(/best\s*([456])/i);
  const count=best?Number(best[1]):/3 core.*2 elective/i.test(selection)?5:/Chinese,?\s*English.*best 3/i.test(selection)?5:5;
  if(!best&&!/3 core.*2 elective|Chinese,?\s*English.*best 3/i.test(selection))assumptions.push('計科原則未完整列出，暫以最佳五科參考。');
  for(const item of raw?.must??[]){const g=group(item);if(!g)issues.push('有必計科目尚未完整對應。');else if(g.length===1)required.push(g[0]);else requiredGroups.push(g)}
  for(const item of raw?.must2??[]){const g=group(item);if(g)requiredCounts.push({subjects:g,count:2});else issues.push('有必計科組尚未完整對應。')}
  if(/3 core.*2 elective/i.test(selection))required.push('chi','eng','maths');
  if(/Chinese,?\s*English.*best 3/i.test(selection))required.push('chi','eng');
  let bonus;
  for(const v of raw?.vals??[]){
    const w=Number(v.w),g=ids(v.s);
    if(!Number.isFinite(w)||w<=0){issues.push('來源倍率無效，未作為數值採用。');continue}
    if(v.s?.code==='SJ_7THS'||v.s?.code==='SJ_6THS'){bonus={sixthBonus:w,bonusRank:v.s.code==='SJ_7THS'?7:6};continue}
    if(!g.length){issues.push('部分科目倍率未完整對應，該部分暫用等權。');continue}
    for(const id of g)weights[id]=w;
  }
  const relative=[...ids(raw?.h),...ids(raw?.hh)];
  if(relative.length){
    const ref=p.institution==='HKU'?{h:1.5,hh:2.3}:p.institution==='CUHK'?{h:1.6,hh:1.6}:p.institution==='EdUHK'?{h:1.5,hh:1.5}:null;
    for(const [level,value] of Object.entries(ref??{}))for(const id of ids(raw?.[level]))if(weights[id]===undefined)weights[id]=value;
    assumptions.push(ref?'相對權重採用 BigExam 公開參考倍率，並非院校公布的精確倍率。':'來源只列相對權重，未知倍率暫採等權參考。');
  }
  if(!raw)assumptions.push('來源計分欄位未齊，暫採最佳科目與已收錄換算規則參考。');
  if(issues.length)assumptions.push('未完整解析的條件不作已核實規則，請展開來源核對。');
  if(!raw?.vals?.length&&!relative.length)assumptions.push('未列精確額外倍率的科目暫採等權。');
  const scale=p.formula?.scale??'standard';
  assumptions.push('分數換算沿用已收錄的院校參考分制。');
  const csa=Number(raw?.csa),mws=Number(raw?.mws);
  const formula={count,required:[...new Set(required)],weights,scale,verified:false,
    ...(requiredGroups.length?{requiredGroups}:{}),...(requiredCounts.length?{requiredCounts}:{}),
    ...(ids(raw?.excl).length?{excluded:ids(raw.excl)}:{}),
    ...(Number.isInteger(mws)&&mws>0?{maxWeightedSubjects:mws}:{}),
    ...(Number.isFinite(csa)&&csa>=0&&raw?.csa!==undefined?{csdCounts:true,csdPoints:csa}:{}),...bonus};
  const scores=(p.detail?.rawScores??[]).filter(s=>Number.isInteger(s.year)).map(s=>({year:s.year,
    ...(number(s.upper)!==null?{upper:s.upper}:{}),...(number(s.median)!==null?{median:s.median}:{}),...(number(s.lower)!==null?{lower:s.lower}:{})
  })).filter(s=>s.upper!==undefined||s.median!==undefined||s.lower!==undefined).sort((a,b)=>a.year-b.year);
  const latest=scores.at(-1);
  if(scores.some(s=>s.median!==undefined&&(s.upper!==undefined&&s.upper<s.median||s.lower!==undefined&&s.lower>s.median)||s.upper!==undefined&&s.lower!==undefined&&s.upper<s.lower))issues.push('部分歷年四分位順序異常，該區間不填色。');
  const lower=latest?latest.lower:nonnegative(p.lowerQuartileIndex)||undefined,upper=latest?.upper,median=latest?latest.median:number(p.scoreIndex)??number(p.median)??undefined;
  const minimum={...p.minimum};if(minimum.csd!=='A')delete minimum.csd;
  const preferredSubjects=(p.detail?.prefer??[]).flatMap(s=>ids(s).map(id=>({code:id,name:s.name??id})));
  const finiteRatio=number(p.competitionRatio),ratio=finiteRatio!==null&&finiteRatio>0?finiteRatio:undefined;
  const place=Number(p.places),fee=Number(String(p.tuitionFee??'').replaceAll(',',''));
  const alternatives=entryAlternatives(p.detail?.elects,issues);
  return {...Object.fromEntries(Object.entries(p).filter(([k])=>!['detail','fetchedAt','fetchStatus'].includes(k))),
    median:median??null,mean:null,lowerQuartile:lower??null,lowerQuartileIndex:lower,upperQuartileIndex:upper,
    scoreIndex:median??null,indexKind:median!==undefined?'median':'unavailable',
    statisticsYear:latest?`${latest.year-1}/${String(latest.year).slice(-2)}`:p.statisticsYear,
    competitionRatio:ratio,places:Number.isFinite(place)&&place>0?place:undefined,tuitionFee:Number.isFinite(fee)&&fee>0?fee:undefined,
    interview:p.interview||undefined,formula,minimum,requiredGroups:undefined,
    historicalScores:scores.length?scores:undefined,preferredSubjects:preferredSubjects.length?preferredSubjects:undefined,
    scoringBasis:relative.length?'reference':'assumption',scoringAssumptions:[...new Set(assumptions)],
    sourceMeta:{fetchedAt:p.fetchedAt??null,importedAt,detailStatus:p.detail?.rawWeights||p.detail?.rawScores?.length?'available':'missing',competitionYear:p.competitionYear,placesYear:p.placesYear},
    ...(alternatives?{entryAlternatives:alternatives}:{}),dataIssues:[...new Set(issues)],
    note:'來源年份及計分條件見詳細資料；個人分數對照為參考情景。',
  };
}
