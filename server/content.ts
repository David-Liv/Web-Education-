import type { ContentPack, ReviewedQuestion, Skill } from '../src/pilot-types.ts';

const source='本項目原創；課綱參照：https://www.edb.gov.hk/en/curriculum-development/kla/ma/curr/index2.html';
function question(id:string,subjectId:string,topicId:string,skillId:string,familyId:string,prompt:string,answer:string,explanation:string,hint:string,options?:string[]):ReviewedQuestion {
  const requiresSteps=id.startsWith('q-model-')||['c-titration-3','c-titration-4'].includes(id);
  return {id,subjectId,topicId,skillIds:[skillId],familyId,paper:subjectId==='maths'?'卷一／卷二技能練習':'卷一技能練習',difficulty:familyId.endsWith('application')?'進階':'基礎',kind:options?'choice':'numeric',prompt,answer,explanation,hint,options,requiresSteps,marks:requiresSteps?2:1,scoring:requiresSteps?[{id:`${id}-method`,marks:1,critical:true},{id:`${id}-answer`,marks:1,critical:false}]:[{id:`${id}-answer`,marks:1,critical:true}],expectedMinutes:2,original:true,source:subjectId==='maths'?source:'本項目原創；課綱參照：https://www.hkeaa.edu.hk/en/hkdse/assessment/subject_information/category_a_subjects/chemistry/'};
}
export function initialPacks():ContentPack[]{
  const mathSkills:Skill[]=[
    {id:'quadratic-factor',name:'因式分解與零乘積原理',prerequisites:[],minutes:[10,20]},
    {id:'quadratic-formula',name:'求根公式與根的計算',prerequisites:[],minutes:[15,25]},
    {id:'quadratic-discriminant',name:'判別式與實根條件',prerequisites:['quadratic-formula'],minutes:[10,20]},
    {id:'quadratic-model',name:'建立方程與檢查情境限制',prerequisites:['quadratic-factor'],minutes:[15,30]},
  ];
  const maths:ReviewedQuestion[]=[];
  // Fixed authored cases, not unreviewed runtime question generation. All start as drafts.
  const factors:[string,string,string][]=[['x² − 5x + 6 = 0，求較大的根。','3','(x−2)(x−3)=0，兩根為 2、3。'],['x² − 7x + 12 = 0，求較小的根。','3','(x−3)(x−4)=0。'],['x² + x − 6 = 0，求正根。','2','(x+3)(x−2)=0。'],['x² − 9 = 0，求正根。','3','(x−3)(x+3)=0。'],['2x² − 7x + 3 = 0，求較小的根。','0.5','(2x−1)(x−3)=0，根為 0.5、3。'],['3x² + 2x − 1 = 0，求負根。','-1','(3x−1)(x+1)=0。']];
  factors.forEach((r,i)=>maths.push(question(`q-factor-${i+1}`,'maths','maths-quadratic','quadratic-factor',i<4?'factor-monic':'factor-nonmonic',...r,'先把左方分解為兩個因式，再分別令每個因式為零。')));
  const formulas:[string,string,string][]=[['x² − 2x − 1 = 0 的兩根為 1 ± √k。求 k。','2','求根公式得 x=(2±√8)/2=1±√2。'],['x² − 4x + 1 = 0 的兩根為 2 ± √k。求 k。','3','x=(4±√12)/2=2±√3。'],['2x² − 4x − 1 = 0，求 b² − 4ac 的值。','24','a=2、b=−4、c=−1，因此 16+8=24。'],['3x² − 6x − 2 = 0，求 b² − 4ac 的值。','60','a=3、b=−6、c=−2，因此 36+24=60。'],['x² + 6x + 7 = 0 的兩根為 h ± √2。求 h。','-3','x=(−6±√8)/2=−3±√2。'],['2x² + 8x + 5 = 0 的兩根為 −2 ± √k/2。求 k。','6','x=(−8±√24)/4=−2±√6/2。']];
  formulas.forEach((r,i)=>maths.push(question(`q-formula-${i+1}`,'maths','maths-quadratic','quadratic-formula',i<4?'formula-direct':'formula-rearrange',...r,'先找 a、b、c，保留係數正負號，再代入求根公式。')));
  const disc:[string,string,string,string[]?][]=[['x² − 4x + 4 = 0 有多少個相異實根？','1','判別式為 16−16=0，只有一個相異實根。'],['x² + 2x + 5 = 0 有多少個實根？','0','判別式為 4−20<0。'],['x² − 6x + 5 = 0 有多少個相異實根？','2','判別式為 36−20>0。'],['2x² + x + 3 = 0 有多少個實根？','0','判別式為 1−24<0。'],['x² − 8x + k = 0 有重根，求 k。','16','64−4k=0，k=16。'],['3x² + 6x + k = 0 有重根，求 k。','3','36−12k=0，k=3。']];
  disc.forEach((r,i)=>maths.push(question(`q-disc-${i+1}`,'maths','maths-quadratic','quadratic-discriminant',i<4?'discriminant-count':'discriminant-parameter',r[0],r[1],r[2],'比較 b²−4ac 與零；重根代表判別式等於零。',r[3])));
  const models:[string,string,string][]=[['長方形寬 x cm、長 (x+1) cm，面積 12 cm²。求寬。','3','x(x+1)=12；(x+4)(x−3)=0。寬須正，故 x=3。'],['長方形寬 x cm、長 (x+2) cm，面積 24 cm²。求寬。','4','x(x+2)=24；(x+6)(x−4)=0，取正根 4。'],['兩個相鄰正整數的乘積為 30，求較小的數。','5','x(x+1)=30，根為 5、−6；正整數取 5。'],['兩個相差 3 的正整數乘積為 40，求較小的數。','5','x(x+3)=40，根為 5、−8；取 5。'],['球的高度 h=−t²+6t（米），t≥0。除了 t=0，球在幾秒時落回地面？','6','h=0：t(6−t)=0，除去起點 t=0，t=6。'],['球的高度 h=−2t²+8t（米），t≥0。除了 t=0，球在幾秒時落回地面？','4','−2t(t−4)=0，取非零時間 t=4。']];
  models.forEach((r,i)=>maths.push(question(`q-model-${i+1}`,'maths','maths-quadratic','quadratic-model',i<4?'model-area':'model-application',...r,'先建立方程，求出根後再檢查正值、單位和題目條件。')));
  const chemSkills:Skill[]=[{id:'acid-strength',name:'酸的強弱與濃度',prerequisites:[],minutes:[10,20]},{id:'acid-volume',name:'cm³ 與 dm³ 換算',prerequisites:[],minutes:[5,10]},{id:'acid-moles',name:'n = cV 與濃度',prerequisites:['acid-volume'],minutes:[10,20]},{id:'acid-titration',name:'中和摩爾比與滴定',prerequisites:['acid-moles'],minutes:[15,30]}];
  const chem:ReviewedQuestion[]=[];
  const strengths:[string,string,string,string[]][]=[
    ['酸的「強弱」主要描述甚麼？','B','酸的強弱描述在水中的電離程度。',['每瓶的體積','在水中的電離程度','溶液顏色','溶液總質量']],
    ['把鹽酸加水稀釋後，下列哪項正確？','A','濃度降低，但 HCl 仍屬強酸。',['濃度下降，仍屬強酸','變成弱酸','酸的物質的量必定增加','濃度不變']],
    ['兩份同濃度的酸，一份幾乎完全電離，另一份部分電離。前者稱為甚麼？','C','幾乎完全電離者是強酸；強弱不能只由濃度判斷。',['濃酸','弱酸','強酸','鹽']],
    ['「稀酸一定是弱酸」這句話是否正確？','B','稀描述濃度，弱描述電離程度。',['正確','不正確','只在 25°C 正確','只對鹽酸正確']],
    ['某酸在水中只有少部分分子電離。最直接支持哪個結論？','A','電離程度低支持它是弱酸，但不能據此知道濃度。',['它是弱酸','它必定很稀','它不含氫離子','它不能中和鹼']],
    ['濃度相同時，比較強酸與弱酸，下列哪項說法合理？','D','比較需考慮電離程度；濃度相同不代表電離程度相同。',['兩者必定同樣電離','弱酸不能與鹼反應','強酸必定較濃','兩者電離程度可以不同']],
  ];
  strengths.forEach((r,i)=>chem.push(question(`c-strength-${i+1}`,'chem','chem-acids','acid-strength',i<4?'strength-definition':'strength-application',r[0],r[1],r[2],'分開考慮「每單位體積有多少酸」及「多少比例電離」。',r[3])));
  const volume:[string,string,string][]=[['25.0 cm³ 等於多少 dm³？','0.025','1 dm³=1000 cm³，25.0÷1000=0.025。'],['20.0 cm³ 等於多少 dm³？','0.02','20.0÷1000=0.020。'],['50.0 cm³ 等於多少 dm³？','0.05','50.0÷1000=0.050。'],['12.5 cm³ 等於多少 dm³？','0.0125','12.5÷1000=0.0125。'],['0.075 dm³ 等於多少 cm³？','75','0.075×1000=75。'],['0.125 dm³ 等於多少 cm³？','125','0.125×1000=125。']];
  volume.forEach((r,i)=>chem.push(question(`c-volume-${i+1}`,'chem','chem-acids','acid-volume',i<4?'volume-forward':'volume-reverse',...r,'cm³ 轉 dm³ 除以 1000；反方向乘以 1000。')));
  const moles:[string,string,string][]=[['25.0 cm³、0.200 mol dm⁻³ 的 NaOH 含多少 mol NaOH？','0.005','n=cV=0.200×0.0250=0.00500 mol。'],['20.0 cm³、0.100 mol dm⁻³ 的 HCl 含多少 mol HCl？','0.002','n=0.100×0.0200=0.00200 mol。'],['50.0 cm³、0.200 mol dm⁻³ 的溶液含多少 mol 溶質？','0.01','n=0.200×0.0500=0.0100 mol。'],['10.0 cm³、0.500 mol dm⁻³ 的溶液含多少 mol 溶質？','0.005','n=0.500×0.0100=0.00500 mol。'],['0.00400 mol 溶質溶於 0.0200 dm³ 溶液，濃度是多少 mol dm⁻³？','0.2','c=n/V=0.00400÷0.0200=0.200。'],['0.0150 mol 溶質溶於 0.0500 dm³ 溶液，濃度是多少 mol dm⁻³？','0.3','c=0.0150÷0.0500=0.300。']];
  moles.forEach((r,i)=>chem.push(question(`c-moles-${i+1}`,'chem','chem-acids','acid-moles',i<4?'moles-product':'moles-concentration',...r,'使用 n=cV，V 的單位必須與濃度中的 dm³ 配合。')));
  const titration:[string,string,string][]=[['HCl + NaOH → NaCl + H₂O。中和 0.00300 mol HCl 需多少 mol NaOH？','0.003','方程式係數比 1:1，所需 NaOH 為 0.00300 mol。'],['HCl + NaOH → NaCl + H₂O。中和 0.00800 mol NaOH 需多少 mol HCl？','0.008','HCl:NaOH=1:1。'],['25.0 cm³ HCl 恰好中和 20.0 cm³、0.100 mol dm⁻³ NaOH。求 HCl 濃度（mol dm⁻³）。','0.08','n(NaOH)=0.100×0.0200=0.00200；HCl 為同量，c=0.00200/0.0250=0.0800。'],['20.0 cm³ HCl 恰好中和 30.0 cm³、0.100 mol dm⁻³ NaOH。求 HCl 濃度（mol dm⁻³）。','0.15','HCl 的 n=0.100×0.0300=0.00300；c=0.00300/0.0200=0.150。'],['H₂SO₄ + 2NaOH → Na₂SO₄ + 2H₂O。中和 0.00400 mol H₂SO₄ 需多少 mol NaOH？','0.008','H₂SO₄:NaOH=1:2，所需 NaOH=0.00800 mol。'],['H₂SO₄ + 2NaOH → Na₂SO₄ + 2H₂O。中和 0.00600 mol NaOH 需多少 mol H₂SO₄？','0.003','硫酸用量為 NaOH 的一半，0.00300 mol。']];
  titration.forEach((r,i)=>chem.push(question(`c-titration-${i+1}`,'chem','chem-acids','acid-titration',i<4?'titration-monoprotic':'titration-diprotic',...r,'先寫平衡方程式，再用係數摩爾比轉換，不直接假設所有酸都是 1:1。')));
  return [{id:'quadratic',version:1,topicId:'maths-quadratic',subjectId:'maths',title:'二次方程',source,status:'draft',skills:mathSkills,questions:maths,reviews:[],professionalVerified:false,lessons:[
    {title:'因式分解：把一個條件拆成兩個可能',text:'先把方程整理成 ax²+bx+c=0。例：x²−8x+15=0，可分解為 (x−3)(x−5)=0。兩個數的乘積為零，至少一個因式為零，所以 x=3 或 x=5。不可直接把 x²−8x=−15 的兩邊當成兩個因式。先自己檢查：把兩個根代回原式，是否都成立？',skillIds:['quadratic-factor']},
    {title:'求根公式：係數的正負號也是條件',text:'對 ax²+bx+c=0（a≠0），x=(−b±√(b²−4ac))/(2a)。例：x²+4x+1=0，a=1、b=4、c=1，所以 x=(−4±√12)/2=−2±√3。± 代表兩個可能；分母 2a 要除整個分子。先寫係數再代入，通常比心算符號更容易檢查。',skillIds:['quadratic-formula']},
    {title:'判別式：不必先求出每一個根',text:'設 Δ=b²−4ac。Δ>0 有兩個相異實根；Δ=0 有重根；Δ<0 沒有實根。例如 3x²−2x+4=0，Δ=4−48<0。遇到參數題，先把「有重根」轉成 Δ=0；若要求兩個相異實根，則是 Δ>0。判別式只回答根的性質，不代替情境中正負或範圍的限制。',skillIds:['quadratic-discriminant']},
    {title:'情境建模：求到根之後還有一步',text:'例：花圃寬 x 米、長 x+4 米、面積 21 平方米。由面積得 x(x+4)=21，即 (x+7)(x−3)=0。數學上有 x=−7、3，但長度須為正，因此寬為 3 米。把 3 與 7 相乘可核對面積。作答時寫出建立的方程和捨根理由，這些關鍵步驟會由復核者核對。',skillIds:['quadratic-model']},
  ]},
  {id:'acids',version:1,topicId:'chem-acids',subjectId:'chem',title:'酸鹼與滴定',source:chem[0].source,status:'draft',skills:chemSkills,questions:chem,reviews:[],professionalVerified:false,lessons:[
    {title:'強弱與濃度：先辨認比較的是甚麼',text:'酸的強弱描述在水中的電離程度；濃度描述單位體積有多少酸。把鹽酸加水稀釋會降低濃度，但不會因此把 HCl 改成弱酸。弱酸也可以與鹼中和。看見「較強」「較濃」時，先用自己的話說出它們各自指哪一件事。',skillIds:['acid-strength']},
    {title:'單位換算：讓 c 與 V 的單位配合',text:'1 dm³=1000 cm³。例如 35.0 cm³=0.0350 dm³；反方向從 dm³ 轉 cm³ 要乘 1000。先在數值旁寫單位，再換算。若濃度單位是 mol dm⁻³，直接把 cm³ 數值代入 n=cV 會多算 1000 倍。',skillIds:['acid-volume']},
    {title:'n=cV：先算已知一方的物質的量',text:'c 是摩爾濃度，V 是溶液體積，n 是物質的量。40.0 cm³、0.150 mol dm⁻³ 的溶液，n=0.150×0.0400=0.00600 mol。若改求濃度，使用 c=n/V；相同的 n 分散到更大的體積，濃度會下降。最後核對所得單位是 mol 還是 mol dm⁻³。',skillIds:['acid-moles']},
    {title:'滴定：方程式決定比例',text:'先配平反應，再由已知溶液算 n，按係數比轉換，最後求未知濃度。例如 15.0 cm³ HCl 恰好中和 18.0 cm³、0.100 mol dm⁻³ NaOH：n(NaOH)=0.00180 mol；HCl:NaOH=1:1，所以 c(HCl)=0.00180/0.0150=0.120 mol dm⁻³。對 H₂SO₄+2NaOH→Na₂SO₄+2H₂O，完全中和的比是 1:2，不能直接套用 1:1。關鍵步驟題請寫出單位、摩爾比及最後除以哪個體積。',skillIds:['acid-titration']},
  ]}];
}
