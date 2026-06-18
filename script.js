// ═══════════════════════════════════════════════════════
//  범우연합 통합 대시보드  —  script.js
// ═══════════════════════════════════════════════════════

// ── 전역 상태 ──
let salesData = null;
let bondData  = null;

// 통합 뷰 선택 상태
let u_selSalesName = null;   // 매출 선택 법인명
let u_selBondName  = null;   // 채권 선택 법인명
// 통합 뷰는 '공통 법인' 개념으로 하나의 선택이 양쪽을 제어
// 공통 법인명 매핑 (매출명 → 채권명)
const SALES_TO_BOND = {
  '연합 총계': '범우연합 합계',
  '국내법인':  '국내사 합계',
  '해외법인':  '해외사 합계',
  '판매사':    '판매사 합계',
  'BEX':       'BEX',
  'BWC':       'BWC',
  'BW':        'BW',
  'KCC':       'KCC',
  'BIT':       null,
  '통합구매':  '통합구매',
  'BWK':       'BWK',
  'SYTK':      'SYTK',
  'VBC':       'VBC',
  'YBI':       'YBI',
  'BWI':       'BWI',
  'BWA':       'BWA',
  'BWA(USA)':  'BWA USA',
  '범우케미칼': '범우케미칼',
  '㈜범우켐':   '㈜범우켐',
  '범우화인켐': '범우화인켐',
};

// 차트 인스턴스
let u_salesTrendChart=null, u_bondTrendChart=null, u_salesBarChart=null, u_bondBarChart=null;
let s_trendChart=null, s_barChart=null, s_shareChart=null;
let b_trendChart=null, b_barChart=null, b_shareChart=null, b_momChart=null;

// 채권 기간
const B_PERIODS = ['2025-12','2026-01','2026-02','2026-03','2026-04','2026-05'];
const B_LABELS  = ['25-12','26-01','26-02','26-03','26-04','26-05'];

// ── 포맷터 ──
const _nFmt = new Intl.NumberFormat('ko-KR', {minimumFractionDigits:1, maximumFractionDigits:1});
function fmtEok(v)        { if (v==null||isNaN(v)) return '-'; return _nFmt.format(v)+'억'; }
function fmtChg(v)        { if (v==null||isNaN(v)) return '-'; return (v>=0?'+':'')+_nFmt.format(v)+'억'; }
function fmtPctRatio(v)   { if (v==null||isNaN(v)) return '-'; return (v>=0?'+':'')+_nFmt.format(v*100)+'%'; }
function fmtPctOf(v, tot) { if (!tot) return '0.0%'; return _nFmt.format(v/tot*100)+'%'; }
function setTxt(id, val)  { const el=document.getElementById(id); if(el) el.textContent=val; }
function safeDivide(a,b)  { if(!b||isNaN(b)) return null; return a/b; }

// ── 인증 ──
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function unlock() {
  const val  = document.getElementById('passwordInput').value;
  const hash = await sha256(val);
  if (hash === window.DASHBOARD_CONFIG.passwordHash) {
    document.getElementById('gate').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('gateMsg').textContent = '';
  } else {
    document.getElementById('gateMsg').textContent = '비밀번호가 올바르지 않습니다.';
  }
}
async function checkAutoLogin() {
  const p = new URLSearchParams(window.location.search);
  const token=p.get('v'), user=p.get('u');
  if (!token||!user) return false;
  const t  = new Date();
  const ds = `${t.getFullYear()}${String(t.getMonth()+1).padStart(2,'0')}${String(t.getDate()).padStart(2,'0')}`;
  if (token === await sha256(`buhmwoo2026!@#${user}${ds}`)) {
    document.getElementById('gate').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    return true;
  }
  return false;
}
function setupAppControls() {
  const p = new URLSearchParams(window.location.search);
  const ru = p.get('return_url');
  document.getElementById('btnBackToMain').addEventListener('click', () => {
    const t=ru||document.referrer; if(t) window.top.location.href=t; else window.history.back();
  });
  document.getElementById('btnAppLogout').addEventListener('click', () => {
    let t=ru||document.referrer;
    if(!t){ window.history.back(); return; }
    window.top.location.href = t+(t.includes('?')?'&':'?')+'logout=true';
  });
}

// ── 탭 전환 ──
const TAB_META = {
  unified: { badge:'Unified Dashboard',      title:'범우연합 통합 대시보드',  desc:'매출 및 채권 현황을 통합 조회합니다.' },
  sales:   { badge:'Sales Dashboard',        title:'매출분석 대시보드',        desc:'2026년 4월 기준 월별 매출 추이와 12M_MA를 확인합니다.' },
  bond:    { badge:'Receivables Dashboard',  title:'채권현황 대시보드',        desc:'2026년 5월 기준 법인별 채권 구성 및 증감을 확인합니다.' },
};
function switchTab(tab) {
  ['unified','sales','bond'].forEach(t => {
    const viewId = 'view'+t.charAt(0).toUpperCase()+t.slice(1);
    document.getElementById(viewId).classList.toggle('hidden', t!==tab);
    const btn = document.getElementById('tab'+t.charAt(0).toUpperCase()+t.slice(1));
    btn.classList.toggle('active', t===tab);
  });
  const m = TAB_META[tab];
  setTxt('heroBadge', m.badge);
  setTxt('heroTitle', m.title);
  setTxt('heroDesc',  m.desc);
  setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
}

// ═══════════════════════════════════════════════════════
//  매출 헬퍼
// ═══════════════════════════════════════════════════════
function s_find(name)         { return salesData.entities.find(e=>e.name===name); }
function s_byMonth(e, month)  { return e.months.find(m=>m.month===month)||null; }
function s_ytd(e, year, mNo)  {
  return e.months.filter(m=>m.month.startsWith(String(year))&&Number(m.month.slice(5,7))<=mNo)
    .reduce((s,m)=>s+(m.sales_eok||0), 0);
}
function s_yearTotal(e, year) {
  return e.months.filter(m=>m.month.startsWith(String(year))).reduce((s,m)=>s+(m.sales_eok||0), 0);
}
function s_reals()  { return salesData.entities.filter(e=>e.category==='법인'); }
function s_cmpEntities(e) {
  if (!e||e.category==='total') return s_reals();
  if (e.category==='group')     return s_reals().filter(x=>x.group===e.name);
  return s_reals().filter(x=>x.group===e.group);
}

// ═══════════════════════════════════════════════════════
//  채권 헬퍼
// ═══════════════════════════════════════════════════════
function b_find(name)     { return bondData.entities.find(e=>e.name===name); }
function b_leaves()       { return bondData.entities.filter(e=>e.is_leaf); }
function b_cmpEntities(e) {
  if (!e||e.group==='합계') return b_leaves();
  return b_leaves().filter(x=>x.group===e.group);
}

// ═══════════════════════════════════════════════════════
//  통합 뷰 — 법인 버튼 빌드
// ═══════════════════════════════════════════════════════
function u_buildButtons() {
  const c = document.getElementById('u_entityButtons');
  c.innerHTML = '';

  // 1행: 연합 총계 + 그룹
  const topRow = document.createElement('div');
  topRow.className = 'entity-row';
  [
    { name:'연합 총계', extra:'total-btn' },
    { name:'국내법인',  extra:'' },
    { name:'해외법인',  extra:'' },
    { name:'판매사',    extra:'' },
  ].forEach(({name, extra}) => {
    const btn = document.createElement('button');
    btn.className = 'entity-btn' + (extra ? ' '+extra : '');
    btn.textContent = name;
    btn.dataset.entity = name;
    btn.addEventListener('click', () => u_selectEntity(name));
    topRow.appendChild(btn);
  });
  c.appendChild(topRow);

  // 하위 법인 그룹별
  ['국내법인','해외법인','판매사'].forEach(gName => {
    const items = s_reals().filter(e=>e.group===gName);
    if (!items.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'entity-subgroup';
    const lbl = document.createElement('div');
    lbl.className = 'entity-group-label';
    lbl.textContent = gName;
    wrap.appendChild(lbl);
    const row = document.createElement('div');
    row.className = 'entity-row';
    items.forEach(e => {
      const btn = document.createElement('button');
      btn.className = 'entity-btn';
      btn.textContent = e.name;
      btn.dataset.entity = e.name;
      btn.addEventListener('click', () => u_selectEntity(e.name));
      row.appendChild(btn);
    });
    wrap.appendChild(row);
    c.appendChild(wrap);
  });
}

function u_updateBtnState(selName) {
  // 버튼 텍스트 기준으로 active 처리
  document.querySelectorAll('#u_entityButtons .entity-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.entity === selName);
  });
}

// 매출 법인명 → 표시용 레이블 (총계/그룹 버튼용)
const SALES_DISPLAY = { '연합 총계':'연합 총계', '국내법인':'국내법인', '해외법인':'해외법인', '판매사':'판매사' };

function u_selectEntity(salesName) {
  u_selSalesName = salesName;
  u_selBondName  = SALES_TO_BOND[salesName] ?? null;
  u_updateBtnState(salesName);
  u_renderAll();
}

// ── 통합 뷰 KPI & 차트 렌더 ──
function u_renderAll() {
  const sName = u_selSalesName;
  const bName = u_selBondName;

  // 매출 엔티티 결정 (그룹명이면 group 엔티티, 총계면 total)
  let sEntity = s_find(sName);
  if (!sEntity) {
    // '연합 총계' 등 직접 매핑
    sEntity = salesData.entities.find(e=>e.category==='total');
  }

  // 채권 엔티티 결정
  let bEntity = bName ? b_find(bName) : null;
  if (!bEntity) bEntity = b_find('범우연합 합계');

  // 사이드바 정보
  const lm  = salesData.latestMonth;
  const mNo = Number(lm.slice(5,7));
  const yr  = Number(lm.slice(0,4));
  const latest = sEntity.months[sEntity.months.length-1];

  setTxt('u_selName',  sEntity.name);
  setTxt('u_selGroup', sEntity.category==='법인' ? sEntity.group : sEntity.name);
  setTxt('u_selSales', fmtEok(latest.sales_eok));
  setTxt('u_selBond',  fmtEok(bEntity.periods[bondData.latestMonth].total));

  // 매출 KPI
  const priorM = s_byMonth(sEntity, `${yr-1}-${String(mNo).padStart(2,'0')}`);
  const yoy = priorM ? safeDivide(latest.sales_eok, priorM.sales_eok)-1 : null;
  setTxt('u_s_cur',   fmtEok(latest.sales_eok));
  const yoyEl = document.getElementById('u_s_yoy');
  setTxt('u_s_yoy', fmtPctRatio(yoy));
  if (yoyEl) yoyEl.className = 'ukpi-val'+(yoy>0?' up':yoy<0?' down':'');
  setTxt('u_s_ytd',   fmtEok(s_ytd(sEntity,yr,mNo)));
  setTxt('u_s_pytd',  fmtEok(s_ytd(sEntity,yr-1,mNo)));
  setTxt('u_s_pytot', fmtEok(s_yearTotal(sEntity,yr-1)));
  setTxt('u_s_ma12',  fmtEok(latest.ma12_eok));

  // 채권 KPI
  const bp = bEntity.periods[bondData.latestMonth];
  const bt = bp.total;
  setTxt('u_b_tot',  fmtEok(bt));
  setTxt('u_b_3m',   fmtEok(bp['3m']));   setTxt('u_b_3m_p',   fmtPctOf(bp['3m'],bt));
  setTxt('u_b_46m',  fmtEok(bp['4_6m'])); setTxt('u_b_46m_p',  fmtPctOf(bp['4_6m'],bt));
  setTxt('u_b_712m', fmtEok(bp['7_12m']));setTxt('u_b_712m_p', fmtPctOf(bp['7_12m'],bt));
  setTxt('u_b_ov1',  fmtEok(bp.over1y));  setTxt('u_b_ov1_p',  fmtPctOf(bp.over1y,bt));
  const momEl = document.getElementById('u_b_mom');
  setTxt('u_b_mom', fmtChg(bEntity.mom_total));
  if (momEl) momEl.className = 'ukpi-val'+(bEntity.mom_total>0?' up':bEntity.mom_total<0?' down':'');
  setTxt('u_b_yoy', `전년대비 ${fmtChg(bEntity.yoy_total)}`);

  // 차트 소제목
  setTxt('u_salesTrendTitle', `${sEntity.name} 월별 매출 & 12M MA`);
  setTxt('u_bondTrendTitle',  `${bEntity.name} 월별 채권 구성`);
  const grpLabel = sEntity.category==='법인' ? sEntity.group : (sEntity.category==='group' ? sEntity.name : '전체');
  setTxt('u_salesBarTitle', `${grpLabel} 그룹 법인별 당월매출`);
  setTxt('u_bondBarTitle',  `${bEntity.group==='합계'?'전체':bEntity.group} 그룹 법인별 채권`);

  u_renderSalesTrend(sEntity);
  u_renderBondTrend(bEntity);
  u_renderSalesBar(sEntity);
  u_renderBondBar(bEntity);
}

function u_renderSalesTrend(entity) {
  const ctx = document.getElementById('u_salesTrendChart');
  if (u_salesTrendChart) u_salesTrendChart.destroy();
  const slice = entity.months.slice(-18);
  u_salesTrendChart = new Chart(ctx, {
    type: 'line',
    data: { labels: slice.map(m=>m.label), datasets: [
      { label:'매출', data:slice.map(m=>m.sales_eok), borderColor:'#2f6bff', backgroundColor:'rgba(47,107,255,0.08)', tension:0.28, fill:'origin', pointRadius:0, borderWidth:2.5 },
      { label:'12M_MA', data:slice.map(m=>m.ma12_eok), borderColor:'#11b7a4', backgroundColor:'transparent', tension:0.28, pointRadius:0, borderWidth:2, borderDash:[6,4] }
    ]},
    options: { responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{labels:{color:'#334155',usePointStyle:true,boxWidth:8,padding:14,font:{size:11}}},
        tooltip:{backgroundColor:'rgba(15,23,42,0.92)',callbacks:{label:c=>`${c.dataset.label}: ${fmtEok(c.parsed.y)}`}}},
      scales:{
        x:{ticks:{color:'#64748b',maxRotation:0,autoSkip:true,maxTicksLimit:10,font:{size:10}},grid:{color:'rgba(148,163,184,0.1)'}},
        y:{ticks:{color:'#64748b',font:{size:10}},grid:{color:'rgba(148,163,184,0.12)'}}
      }
    }
  });
}

function u_renderBondTrend(entity) {
  const ctx = document.getElementById('u_bondTrendChart');
  if (u_bondTrendChart) u_bondTrendChart.destroy();
  u_bondTrendChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: B_LABELS, datasets: [
      { label:'A', data:B_PERIODS.map(p=>entity.periods[p]['3m']),    backgroundColor:'rgba(47,107,255,0.78)', stack:'s' },
      { label:'B', data:B_PERIODS.map(p=>entity.periods[p]['4_6m']),  backgroundColor:'rgba(15,184,165,0.75)', stack:'s' },
      { label:'C', data:B_PERIODS.map(p=>entity.periods[p]['7_12m']), backgroundColor:'rgba(245,158,11,0.80)', stack:'s' },
      { label:'D', data:B_PERIODS.map(p=>entity.periods[p].over1y),   backgroundColor:'rgba(229,57,53,0.85)',  stack:'s', borderRadius:3 },
      { label:'합계', data:B_PERIODS.map(p=>entity.periods[p].total), type:'line', borderColor:'#334155', backgroundColor:'transparent', tension:0.25, pointRadius:3, borderWidth:2, borderDash:[5,4] }
    ]},
    options: { responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{labels:{color:'#334155',usePointStyle:true,boxWidth:8,padding:12,font:{size:11}}},
        tooltip:{backgroundColor:'rgba(15,23,42,0.92)',callbacks:{label:c=>` ${c.dataset.label}: ${fmtEok(c.parsed.y)}`}}},
      scales:{
        x:{stacked:true,ticks:{color:'#64748b',font:{size:10}},grid:{color:'rgba(148,163,184,0.1)'}},
        y:{stacked:true,ticks:{color:'#64748b',font:{size:10}},grid:{color:'rgba(148,163,184,0.12)'}}
      }
    }
  });
}

function u_renderSalesBar(entity) {
  const ctx = document.getElementById('u_salesBarChart');
  const lm  = salesData.latestMonth;
  const cmp = s_cmpEntities(entity);
  const data = cmp.map(e=>({ name:e.name, value:(s_byMonth(e,lm)||{}).sales_eok||0 }))
    .filter(d=>d.value>0).sort((a,b)=>b.value-a.value);
  if (u_salesBarChart) u_salesBarChart.destroy();
  u_salesBarChart = new Chart(ctx, {
    type: 'bar',
    data: { labels:data.map(d=>d.name), datasets:[{ label:'당월매출', data:data.map(d=>d.value),
      backgroundColor:data.map(d=>d.name===entity.name?'rgba(47,107,255,0.88)':'rgba(47,107,255,0.45)'),
      borderColor:data.map(d=>d.name===entity.name?'rgba(47,107,255,1)':'rgba(47,107,255,0.6)'),
      borderWidth:1, borderRadius:8, maxBarThickness:30 }]},
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{backgroundColor:'rgba(15,23,42,0.92)',callbacks:{label:c=>` ${fmtEok(c.parsed.y)}`}}},
      scales:{
        x:{ticks:{color:'#64748b',autoSkip:false,minRotation:40,maxRotation:40,font:{size:10}},grid:{display:false}},
        y:{title:{display:true,text:'억원',color:'#64748b',font:{size:10}},ticks:{color:'#64748b',font:{size:10}},grid:{color:'rgba(148,163,184,0.12)'}}
      }
    }
  });
}

function u_renderBondBar(entity) {
  const ctx  = document.getElementById('u_bondBarChart');
  const cmp  = b_cmpEntities(entity);
  const data = cmp.map(e=>({ name:e.name, value:e.periods[bondData.latestMonth]?.total||0 }))
    .filter(d=>d.value>0).sort((a,b)=>b.value-a.value);
  if (u_bondBarChart) u_bondBarChart.destroy();
  u_bondBarChart = new Chart(ctx, {
    type: 'bar',
    data: { labels:data.map(d=>d.name), datasets:[{ label:'채권합계', data:data.map(d=>d.value),
      backgroundColor:data.map(d=>d.name===entity.name?'rgba(15,184,165,0.88)':'rgba(15,184,165,0.45)'),
      borderColor:data.map(d=>d.name===entity.name?'rgba(15,184,165,1)':'rgba(15,184,165,0.6)'),
      borderWidth:1, borderRadius:8, maxBarThickness:30 }]},
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{backgroundColor:'rgba(15,23,42,0.92)',callbacks:{label:c=>` ${fmtEok(c.parsed.y)}`}}},
      scales:{
        x:{ticks:{color:'#64748b',autoSkip:false,minRotation:40,maxRotation:40,font:{size:10}},grid:{display:false}},
        y:{title:{display:true,text:'억원',color:'#64748b',font:{size:10}},ticks:{color:'#64748b',font:{size:10}},grid:{color:'rgba(148,163,184,0.12)'}}
      }
    }
  });
}

// ═══════════════════════════════════════════════════════
//  매출 뷰
// ═══════════════════════════════════════════════════════
let s_selName = null;

function s_buildButtons() {
  const c = document.getElementById('s_entityButtons');
  c.innerHTML = '';
  const total = salesData.entities.find(e=>e.category==='total');
  const groups = ['국내법인','해외법인','판매사'].map(n=>s_find(n)).filter(Boolean);
  const topRow = document.createElement('div');
  topRow.className = 'entity-row';
  [total,...groups].filter(Boolean).forEach(e=>{
    const btn = document.createElement('button');
    btn.className = 'entity-btn'+(e.category==='total'?' total-btn':'');
    btn.textContent = e.name; btn.dataset.entity = e.name;
    btn.addEventListener('click',()=>s_select(e.name));
    topRow.appendChild(btn);
  });
  c.appendChild(topRow);
  ['국내법인','해외법인','판매사'].forEach(gName=>{
    const items = s_reals().filter(e=>e.group===gName);
    if (!items.length) return;
    const wrap = document.createElement('div'); wrap.className='entity-subgroup';
    const lbl  = document.createElement('div'); lbl.className='entity-group-label'; lbl.textContent=gName;
    wrap.appendChild(lbl);
    const row = document.createElement('div'); row.className='entity-row';
    items.forEach(e=>{
      const btn=document.createElement('button'); btn.className='entity-btn';
      btn.textContent=e.name; btn.dataset.entity=e.name;
      btn.addEventListener('click',()=>s_select(e.name));
      row.appendChild(btn);
    });
    wrap.appendChild(row); c.appendChild(wrap);
  });
}
function s_updateBtnState() {
  document.querySelectorAll('#s_entityButtons .entity-btn').forEach(b=>
    b.classList.toggle('active', b.dataset.entity===s_selName));
}
function s_select(name) {
  s_selName = name;
  const e = s_find(name); if (!e) return;
  s_updateBtnState();
  // KPI
  const latest = e.months[e.months.length-1];
  const lm=latest.month, yr=Number(lm.slice(0,4)), mNo=Number(lm.slice(5,7));
  const prior = s_byMonth(e, `${yr-1}-${String(mNo).padStart(2,'0')}`);
  const yoy   = prior ? safeDivide(latest.sales_eok,prior.sales_eok)-1 : null;
  setTxt('s_kpiCur',   fmtEok(latest.sales_eok));
  setTxt('s_kpiYoY',   fmtPctRatio(yoy));
  setTxt('s_kpiYTD',   fmtEok(s_ytd(e,yr,mNo)));
  setTxt('s_kpiPYTD',  fmtEok(s_ytd(e,yr-1,mNo)));
  setTxt('s_kpiPTot',  fmtEok(s_yearTotal(e,yr-1)));
  setTxt('s_kpiMA12',  fmtEok(latest.ma12_eok));
  setTxt('s_selName',  e.name);
  setTxt('s_selGroup', e.category==='법인'?e.group:e.name);
  setTxt('s_selMonth', lm);
  setTxt('s_trendTitle', `${e.name} 기준 월별 매출 및 12M_MA`);
  // 추이 차트
  const ctx1 = document.getElementById('s_trendChart');
  if (s_trendChart) s_trendChart.destroy();
  s_trendChart = new Chart(ctx1,{
    type:'line',
    data:{labels:e.months.map(m=>m.label),datasets:[
      {label:'매출',data:e.months.map(m=>m.sales_eok),borderColor:'#2f6bff',backgroundColor:'rgba(47,107,255,0.10)',tension:0.28,fill:'origin',pointRadius:0,pointHoverRadius:4,borderWidth:3},
      {label:'12M_MA',data:e.months.map(m=>m.ma12_eok),borderColor:'#11b7a4',backgroundColor:'transparent',tension:0.28,pointRadius:0,borderWidth:2.5,borderDash:[7,5]}
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:'#334155',usePointStyle:true,boxWidth:10,padding:18}},
        tooltip:{backgroundColor:'rgba(15,23,42,0.92)',padding:12,callbacks:{label:c=>`${c.dataset.label}: ${fmtEok(c.parsed.y)}`}}},
      scales:{
        x:{ticks:{color:'#64748b',maxRotation:0,autoSkip:true,maxTicksLimit:14},grid:{color:'rgba(148,163,184,0.12)'}},
        y:{title:{display:true,text:'억원',color:'#64748b',font:{weight:'700'}},ticks:{color:'#64748b'},grid:{color:'rgba(148,163,184,0.14)'}}
      }
    }
  });
  // 바 차트
  const lmS = salesData.latestMonth;
  const cmp = s_cmpEntities(e);
  const bData = cmp.map(x=>({name:x.name,value:(s_byMonth(x,lmS)||{}).sales_eok||0}))
    .filter(d=>d.value>0).sort((a,b)=>b.value-a.value);
  if(e.category==='total') setTxt('s_barTitle',`${lmS} 전체 법인 비교`);
  else if(e.category==='group') setTxt('s_barTitle',`${lmS} ${e.name} 소속`);
  else setTxt('s_barTitle',`${lmS} ${e.group} 소속`);
  const ctx2 = document.getElementById('s_barChart');
  if (s_barChart) s_barChart.destroy();
  s_barChart = new Chart(ctx2,{
    type:'bar',
    data:{labels:bData.map(d=>d.name),datasets:[{label:'당월매출',data:bData.map(d=>d.value),
      backgroundColor:bData.map(d=>d.name===e.name?'rgba(47,107,255,0.88)':'rgba(15,184,165,0.62)'),
      borderColor:bData.map(d=>d.name===e.name?'rgba(47,107,255,1)':'rgba(15,184,165,0.75)'),
      borderWidth:1,borderRadius:10,maxBarThickness:34}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(15,23,42,0.92)',callbacks:{label:c=>` ${fmtEok(c.parsed.y)}`}}},
      scales:{
        x:{ticks:{color:'#64748b',autoSkip:false,minRotation:35,maxRotation:35},grid:{display:false}},
        y:{title:{display:true,text:'억원',color:'#64748b',font:{weight:'700'}},ticks:{color:'#64748b'},grid:{color:'rgba(148,163,184,0.14)'}}
      }
    }
  });
  // 점유율 도넛
  const cmp2 = s_cmpEntities(e);
  const sData = cmp2.map(x=>({name:x.name,value:(s_byMonth(x,lmS)||{}).sales_eok||0}))
    .filter(d=>d.value>0).sort((a,b)=>b.value-a.value);
  const tot = sData.reduce((s,d)=>s+d.value,0);
  if(e.category==='total') setTxt('s_shareTitle',`${lmS} 전체 매출 비중`);
  else if(e.category==='group') setTxt('s_shareTitle',`${lmS} ${e.name} 내 점유율`);
  else setTxt('s_shareTitle',`${lmS} ${e.group} 내 점유율`);
  const ctx3 = document.getElementById('s_shareChart');
  if (s_shareChart) s_shareChart.destroy();
  s_shareChart = new Chart(ctx3,{
    type:'doughnut',
    data:{labels:sData.map(d=>d.name),datasets:[{data:sData.map(d=>d.value),
      backgroundColor:['#2f6bff','#11b7a4','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#84cc16','#f97316','#14b8a6','#6366f1','#a855f7','#22c55e'],
      borderColor:'#fff',borderWidth:2,hoverOffset:8}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
      plugins:{
        legend:{position:'bottom',labels:{color:'#334155',usePointStyle:true,boxWidth:10,padding:12,font:{size:11}}},
        tooltip:{backgroundColor:'rgba(15,23,42,0.92)',callbacks:{label:c=>`${c.label}: ${fmtEok(c.parsed)} (${tot?(c.parsed/tot*100).toFixed(1):'0.0'}%)`}}
      }
    }
  });
  // 상세 테이블
  const tbody = document.getElementById('s_tableBody'); tbody.innerHTML='';
  e.months.slice(-12).forEach(m=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${m.label}</td><td>${fmtEok(m.sales_eok)}</td><td>${fmtEok(m.ma12_eok)}</td>`;
    tbody.appendChild(tr);
  });
}

// ═══════════════════════════════════════════════════════
//  채권 뷰
// ═══════════════════════════════════════════════════════
let b_selName = null;

const B_GROUP_MAP = [
  {entity:'범우연합 합계',label:'연합 총계',extra:'total-btn'},
  {entity:'국내사 합계',  label:'국내법인', extra:''},
  {entity:'해외사 합계',  label:'해외법인', extra:''},
  {entity:'판매사 합계',  label:'판매사',   extra:''},
];
function b_buildButtons() {
  const c = document.getElementById('b_entityButtons'); c.innerHTML='';
  const topRow = document.createElement('div'); topRow.className='entity-row';
  B_GROUP_MAP.forEach(({entity,label,extra})=>{
    if(!b_find(entity)) return;
    const btn=document.createElement('button');
    btn.className='entity-btn'+(extra?' '+extra:'');
    btn.textContent=label; btn.dataset.entity=entity;
    btn.addEventListener('click',()=>b_select(entity));
    topRow.appendChild(btn);
  });
  c.appendChild(topRow);
  ['국내법인','해외법인','판매사'].forEach(gName=>{
    const items=b_leaves().filter(e=>e.group===gName);
    if(!items.length) return;
    const wrap=document.createElement('div'); wrap.className='entity-subgroup';
    const lbl=document.createElement('div'); lbl.className='entity-group-label'; lbl.textContent=gName;
    wrap.appendChild(lbl);
    const row=document.createElement('div'); row.className='entity-row';
    items.forEach(e=>{
      const btn=document.createElement('button'); btn.className='entity-btn';
      btn.textContent=e.name; btn.dataset.entity=e.name;
      btn.addEventListener('click',()=>b_select(e.name));
      row.appendChild(btn);
    });
    wrap.appendChild(row); c.appendChild(wrap);
  });
}
function b_updateBtnState() {
  document.querySelectorAll('#b_entityButtons .entity-btn').forEach(b=>
    b.classList.toggle('active', b.dataset.entity===b_selName));
}
function b_select(name) {
  b_selName = name;
  const e = b_find(name); if (!e) return;
  b_updateBtnState();
  // KPI
  const p=e.periods[bondData.latestMonth], tot=p.total;
  setTxt('b_kpiTot',  fmtEok(tot));
  setTxt('b_kpi3m',   fmtEok(p['3m']));   setTxt('b_kpi3mP',   `비중 ${fmtPctOf(p['3m'],tot)}`);
  setTxt('b_kpi46m',  fmtEok(p['4_6m'])); setTxt('b_kpi46mP',  `비중 ${fmtPctOf(p['4_6m'],tot)}`);
  setTxt('b_kpi712m', fmtEok(p['7_12m']));setTxt('b_kpi712mP', `비중 ${fmtPctOf(p['7_12m'],tot)}`);
  setTxt('b_kpiOv1',  fmtEok(p.over1y));  setTxt('b_kpiOv1P',  `비중 ${fmtPctOf(p.over1y,tot)}`);
  const momEl=document.getElementById('b_kpiMoM');
  setTxt('b_kpiMoM', fmtChg(e.mom_total));
  if(momEl) momEl.className='kpi-value'+(e.mom_total>0?' up':e.mom_total<0?' down':'');
  setTxt('b_kpiMoMD', `전월 / 전년 ${fmtChg(e.yoy_total)}`);
  const _dnMap = {'범우연합 합계':'연합 총계','국내사 합계':'국내법인 합계','해외사 합계':'해외법인 합계','판매사 합계':'판매사 합계'};
  const dn = _dnMap[e.name] || e.name;
  setTxt('b_selName',  dn);
  setTxt('b_selGroup', e.group==='합계'?'전체':e.group);
  setTxt('b_selMonth', bondData.latestMonth);
  setTxt('b_selTotal', fmtEok(tot));
  setTxt('b_trendTitle', `${e.name} 기준 월별 채권잔액 추이`);
  const noteBox=document.getElementById('b_noteBox');
  if(e.note){ noteBox.textContent=e.note; noteBox.classList.remove('hidden'); }
  else noteBox.classList.add('hidden');
  // 추이 스택 바
  const ctx1=document.getElementById('b_trendChart');
  if(b_trendChart) b_trendChart.destroy();
  b_trendChart=new Chart(ctx1,{
    type:'bar',
    data:{labels:B_LABELS,datasets:[
      {label:'A 3개월이내',data:B_PERIODS.map(pd=>e.periods[pd]['3m']),   backgroundColor:'rgba(47,107,255,0.78)',stack:'s'},
      {label:'B 4~6개월', data:B_PERIODS.map(pd=>e.periods[pd]['4_6m']), backgroundColor:'rgba(15,184,165,0.75)',stack:'s'},
      {label:'C 7~12개월',data:B_PERIODS.map(pd=>e.periods[pd]['7_12m']),backgroundColor:'rgba(245,158,11,0.80)',stack:'s'},
      {label:'D 1년초과', data:B_PERIODS.map(pd=>e.periods[pd].over1y),  backgroundColor:'rgba(229,57,53,0.85)', stack:'s',borderRadius:4},
      {label:'합계',data:B_PERIODS.map(pd=>e.periods[pd].total),type:'line',borderColor:'#334155',backgroundColor:'transparent',tension:0.25,pointRadius:4,pointHoverRadius:6,borderWidth:2.5,borderDash:[5,4]}
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:'#334155',usePointStyle:true,boxWidth:10,padding:16}},
        tooltip:{backgroundColor:'rgba(15,23,42,0.92)',padding:12,callbacks:{label:c=>` ${c.dataset.label}: ${fmtEok(c.parsed.y)}`}}},
      scales:{
        x:{stacked:true,ticks:{color:'#64748b'},grid:{color:'rgba(148,163,184,0.12)'}},
        y:{stacked:true,title:{display:true,text:'억원',color:'#64748b',font:{weight:'700'}},ticks:{color:'#64748b'},grid:{color:'rgba(148,163,184,0.14)'}}
      }
    }
  });
  // 도넛
  const vals=[p['3m'],p['4_6m'],p['7_12m'],p.over1y];
  const dTot=vals.reduce((a,b)=>a+b,0);
  setTxt('b_shareTitle',`${e.name} — ${bondData.latestMonth} 구성비`);
  const ctx2=document.getElementById('b_shareChart');
  if(b_shareChart) b_shareChart.destroy();
  b_shareChart=new Chart(ctx2,{
    type:'doughnut',
    data:{labels:['A 3개월이내','B 4~6개월','C 7~12개월','D 1년초과'],
      datasets:[{data:vals,backgroundColor:['rgba(47,107,255,0.85)','rgba(15,184,165,0.82)','rgba(245,158,11,0.85)','rgba(229,57,53,0.85)'],borderColor:'#fff',borderWidth:2,hoverOffset:8}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
      plugins:{
        legend:{position:'bottom',labels:{color:'#334155',usePointStyle:true,boxWidth:10,padding:10,font:{size:11}}},
        tooltip:{backgroundColor:'rgba(15,23,42,0.92)',callbacks:{label:c=>`${c.label}: ${fmtEok(c.parsed)} (${dTot?(c.parsed/dTot*100).toFixed(1):'0.0'}%)`}}
      }
    }
  });
  // 바 비교
  const cmp=b_cmpEntities(e);
  const bArr=cmp.map(x=>({name:x.name,value:x.periods[bondData.latestMonth]?.total||0}))
    .filter(d=>d.value>0).sort((a,b)=>b.value-a.value);
  setTxt('b_barTitle',`${bondData.latestMonth} ${e.group==='합계'?'전체':e.group} 법인별 채권`);
  const ctx3=document.getElementById('b_barChart');
  if(b_barChart) b_barChart.destroy();
  b_barChart=new Chart(ctx3,{
    type:'bar',
    data:{labels:bArr.map(d=>d.name),datasets:[{label:'채권합계',data:bArr.map(d=>d.value),
      backgroundColor:bArr.map(d=>d.name===e.name?'rgba(47,107,255,0.88)':'rgba(15,184,165,0.60)'),
      borderColor:bArr.map(d=>d.name===e.name?'rgba(47,107,255,1)':'rgba(15,184,165,0.75)'),
      borderWidth:1,borderRadius:10,maxBarThickness:34}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(15,23,42,0.92)',callbacks:{label:c=>` ${fmtEok(c.parsed.y)}`}}},
      scales:{
        x:{ticks:{color:'#64748b',autoSkip:false,minRotation:35,maxRotation:35},grid:{display:false}},
        y:{title:{display:true,text:'억원',color:'#64748b',font:{weight:'700'}},ticks:{color:'#64748b'},grid:{color:'rgba(148,163,184,0.14)'}}
      }
    }
  });
  // 전월대비 바
  const mArr=b_cmpEntities(e).map(x=>({name:x.name,value:x.mom_total||0}))
    .sort((a,b)=>b.value-a.value);
  setTxt('b_momTitle',`${bondData.latestMonth} ${e.group==='합계'?'전체':e.group} 법인별 전월대비`);
  const ctx4=document.getElementById('b_momChart');
  if(b_momChart) b_momChart.destroy();
  b_momChart=new Chart(ctx4,{
    type:'bar',
    data:{labels:mArr.map(d=>d.name),datasets:[{label:'전월대비',data:mArr.map(d=>d.value),
      backgroundColor:mArr.map(d=>d.value>0?'rgba(229,57,53,0.75)':'rgba(21,101,192,0.72)'),
      borderColor:mArr.map(d=>d.value>0?'rgba(229,57,53,0.95)':'rgba(21,101,192,0.90)'),
      borderWidth:1,borderRadius:6,maxBarThickness:30}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(15,23,42,0.92)',callbacks:{label:c=>` ${fmtChg(c.parsed.y)}`}}},
      scales:{
        x:{ticks:{color:'#64748b',autoSkip:false,minRotation:35,maxRotation:35},grid:{display:false}},
        y:{title:{display:true,text:'억원',color:'#64748b',font:{weight:'700'}},ticks:{color:'#64748b'},grid:{color:'rgba(148,163,184,0.14)'}}
      }
    }
  });
  // 상세 테이블
  const tbody=document.getElementById('b_tableBody'); tbody.innerHTML='';
  B_PERIODS.forEach(pd=>{
    const pr=e.periods[pd], lbl=pd.replace('20','');
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${lbl}</td><td>${fmtEok(pr.total)}</td><td>${fmtEok(pr['3m'])}</td><td>${fmtEok(pr['4_6m'])}</td><td>${fmtEok(pr['7_12m'])}</td><td>${fmtEok(pr.over1y)}</td>`;
    tbody.appendChild(tr);
  });
}

// ═══════════════════════════════════════════════════════
//  초기화
// ═══════════════════════════════════════════════════════
async function initDashboard() {
  const isAuto = await checkAutoLogin();
  if (!isAuto) {
    document.getElementById('unlockBtn').addEventListener('click', unlock);
    document.getElementById('passwordInput').addEventListener('keydown', e=>{ if(e.key==='Enter') unlock(); });
  }

  // 데이터 인라인 로드 (로컬/GitHub Pages 모두 동작)
  salesData = {"title": "매출 분석 대시보드", "latestMonth": "2026-04", "months": ["2023-01", "2023-02", "2023-03", "2023-04", "2023-05", "2023-06", "2023-07", "2023-08", "2023-09", "2023-10", "2023-11", "2023-12", "2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06", "2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"], "entities": [{"name": "BEX", "group": "국내법인", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 15.71, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 18.36, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 31.7, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 13.26, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 15.95, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 17.42, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 19.87, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 18.66, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 21.42, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 20.81, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 22.34, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 17.64, "ma12_eok": 19.4283}, {"month": "2024-01", "label": "2024.01", "sales_eok": 17.7803, "ma12_eok": 19.6009}, {"month": "2024-02", "label": "2024.02", "sales_eok": 15.5825, "ma12_eok": 19.3694}, {"month": "2024-03", "label": "2024.03", "sales_eok": 18.4772, "ma12_eok": 18.2675}, {"month": "2024-04", "label": "2024.04", "sales_eok": 17.8777, "ma12_eok": 18.6523}, {"month": "2024-05", "label": "2024.05", "sales_eok": 16.9308, "ma12_eok": 18.734}, {"month": "2024-06", "label": "2024.06", "sales_eok": 18.6152, "ma12_eok": 18.8336}, {"month": "2024-07", "label": "2024.07", "sales_eok": 18.617, "ma12_eok": 18.7292}, {"month": "2024-08", "label": "2024.08", "sales_eok": 18.4891, "ma12_eok": 18.715}, {"month": "2024-09", "label": "2024.09", "sales_eok": 19.2307, "ma12_eok": 18.5325}, {"month": "2024-10", "label": "2024.10", "sales_eok": 19.5617, "ma12_eok": 18.4285}, {"month": "2024-11", "label": "2024.11", "sales_eok": 17.1363, "ma12_eok": 17.9949}, {"month": "2024-12", "label": "2024.12", "sales_eok": 16.9825, "ma12_eok": 17.9401}, {"month": "2025-01", "label": "2025.01", "sales_eok": 20.2414, "ma12_eok": 18.1452}, {"month": "2025-02", "label": "2025.02", "sales_eok": 20.1488, "ma12_eok": 18.5257}, {"month": "2025-03", "label": "2025.03", "sales_eok": 20.1356, "ma12_eok": 18.6639}, {"month": "2025-04", "label": "2025.04", "sales_eok": 27.2769, "ma12_eok": 19.4472}, {"month": "2025-05", "label": "2025.05", "sales_eok": 16.3251, "ma12_eok": 19.3967}, {"month": "2025-06", "label": "2025.06", "sales_eok": 14.5478, "ma12_eok": 19.0577}, {"month": "2025-07", "label": "2025.07", "sales_eok": 19.6141, "ma12_eok": 19.1408}, {"month": "2025-08", "label": "2025.08", "sales_eok": 18.6483, "ma12_eok": 19.1541}, {"month": "2025-09", "label": "2025.09", "sales_eok": 22.7074, "ma12_eok": 19.4438}, {"month": "2025-10", "label": "2025.10", "sales_eok": 16.0, "ma12_eok": 19.147}, {"month": "2025-11", "label": "2025.11", "sales_eok": 22.5686, "ma12_eok": 19.5997}, {"month": "2025-12", "label": "2025.12", "sales_eok": 16.9186, "ma12_eok": 19.5944}, {"month": "2026-01", "label": "2026.01", "sales_eok": 18.091, "ma12_eok": 19.4152}, {"month": "2026-02", "label": "2026.02", "sales_eok": 18.0, "ma12_eok": 19.2361}, {"month": "2026-03", "label": "2026.03", "sales_eok": 20.0, "ma12_eok": 19.2248}, {"month": "2026-04", "label": "2026.04", "sales_eok": 15.0, "ma12_eok": 18.2}]}, {"name": "BWC", "group": "국내법인", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 83.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 92.0, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 95.0, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 89.0, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 93.0, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 94.0, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 96.0, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 90.0, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 94.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 88.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 95.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 88.0, "ma12_eok": 91.4167}, {"month": "2024-01", "label": "2024.01", "sales_eok": 84.3463, "ma12_eok": 91.5289}, {"month": "2024-02", "label": "2024.02", "sales_eok": 77.3002, "ma12_eok": 90.3039}, {"month": "2024-03", "label": "2024.03", "sales_eok": 88.0025, "ma12_eok": 89.7207}, {"month": "2024-04", "label": "2024.04", "sales_eok": 90.3828, "ma12_eok": 89.836}, {"month": "2024-05", "label": "2024.05", "sales_eok": 92.0024, "ma12_eok": 89.7528}, {"month": "2024-06", "label": "2024.06", "sales_eok": 92.556, "ma12_eok": 89.6325}, {"month": "2024-07", "label": "2024.07", "sales_eok": 103.2784, "ma12_eok": 90.239}, {"month": "2024-08", "label": "2024.08", "sales_eok": 93.683, "ma12_eok": 90.546}, {"month": "2024-09", "label": "2024.09", "sales_eok": 90.82, "ma12_eok": 90.281}, {"month": "2024-10", "label": "2024.10", "sales_eok": 92.9815, "ma12_eok": 90.6961}, {"month": "2024-11", "label": "2024.11", "sales_eok": 91.6445, "ma12_eok": 90.4165}, {"month": "2024-12", "label": "2024.12", "sales_eok": 91.7324, "ma12_eok": 90.7275}, {"month": "2025-01", "label": "2025.01", "sales_eok": 84.7992, "ma12_eok": 90.7652}, {"month": "2025-02", "label": "2025.02", "sales_eok": 94.2728, "ma12_eok": 92.1796}, {"month": "2025-03", "label": "2025.03", "sales_eok": 92.6017, "ma12_eok": 92.5629}, {"month": "2025-04", "label": "2025.04", "sales_eok": 103.4281, "ma12_eok": 93.65}, {"month": "2025-05", "label": "2025.05", "sales_eok": 92.3139, "ma12_eok": 93.676}, {"month": "2025-06", "label": "2025.06", "sales_eok": 92.6287, "ma12_eok": 93.682}, {"month": "2025-07", "label": "2025.07", "sales_eok": 105.7854, "ma12_eok": 93.8909}, {"month": "2025-08", "label": "2025.08", "sales_eok": 94.5017, "ma12_eok": 93.9592}, {"month": "2025-09", "label": "2025.09", "sales_eok": 103.1363, "ma12_eok": 94.9855}, {"month": "2025-10", "label": "2025.10", "sales_eok": 92.0, "ma12_eok": 94.9037}, {"month": "2025-11", "label": "2025.11", "sales_eok": 93.7014, "ma12_eok": 95.0751}, {"month": "2025-12", "label": "2025.12", "sales_eok": 100.9484, "ma12_eok": 95.8431}, {"month": "2026-01", "label": "2026.01", "sales_eok": 88.7369, "ma12_eok": 96.1713}, {"month": "2026-02", "label": "2026.02", "sales_eok": 84.9743, "ma12_eok": 95.3964}, {"month": "2026-03", "label": "2026.03", "sales_eok": 103.0, "ma12_eok": 96.2629}, {"month": "2026-04", "label": "2026.04", "sales_eok": 125.8, "ma12_eok": 98.1}]}, {"name": "BW", "group": "국내법인", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 31.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 33.0, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 29.0, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 24.0, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 27.0, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 28.0, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 26.0, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 30.0, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 23.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 30.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 22.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 22.0, "ma12_eok": 27.0833}, {"month": "2024-01", "label": "2024.01", "sales_eok": 24.789, "ma12_eok": 26.5657}, {"month": "2024-02", "label": "2024.02", "sales_eok": 25.7035, "ma12_eok": 25.9577}, {"month": "2024-03", "label": "2024.03", "sales_eok": 26.9147, "ma12_eok": 25.7839}, {"month": "2024-04", "label": "2024.04", "sales_eok": 26.6222, "ma12_eok": 26.0024}, {"month": "2024-05", "label": "2024.05", "sales_eok": 25.9428, "ma12_eok": 25.9144}, {"month": "2024-06", "label": "2024.06", "sales_eok": 25.9049, "ma12_eok": 25.7398}, {"month": "2024-07", "label": "2024.07", "sales_eok": 29.4079, "ma12_eok": 26.0238}, {"month": "2024-08", "label": "2024.08", "sales_eok": 25.4401, "ma12_eok": 25.6438}, {"month": "2024-09", "label": "2024.09", "sales_eok": 26.118, "ma12_eok": 25.9036}, {"month": "2024-10", "label": "2024.10", "sales_eok": 21.1668, "ma12_eok": 25.1675}, {"month": "2024-11", "label": "2024.11", "sales_eok": 23.5277, "ma12_eok": 25.2948}, {"month": "2024-12", "label": "2024.12", "sales_eok": 22.7319, "ma12_eok": 25.3558}, {"month": "2025-01", "label": "2025.01", "sales_eok": 23.7612, "ma12_eok": 25.2702}, {"month": "2025-02", "label": "2025.02", "sales_eok": 25.6762, "ma12_eok": 25.2679}, {"month": "2025-03", "label": "2025.03", "sales_eok": 21.3964, "ma12_eok": 24.808}, {"month": "2025-04", "label": "2025.04", "sales_eok": 24.5217, "ma12_eok": 24.633}, {"month": "2025-05", "label": "2025.05", "sales_eok": 23.7526, "ma12_eok": 24.4505}, {"month": "2025-06", "label": "2025.06", "sales_eok": 25.5714, "ma12_eok": 24.4227}, {"month": "2025-07", "label": "2025.07", "sales_eok": 38.1243, "ma12_eok": 25.149}, {"month": "2025-08", "label": "2025.08", "sales_eok": 29.0052, "ma12_eok": 25.4461}, {"month": "2025-09", "label": "2025.09", "sales_eok": 36.7529, "ma12_eok": 26.3324}, {"month": "2025-10", "label": "2025.10", "sales_eok": 28.0, "ma12_eok": 26.9018}, {"month": "2025-11", "label": "2025.11", "sales_eok": 26.7432, "ma12_eok": 27.1698}, {"month": "2025-12", "label": "2025.12", "sales_eok": 30.25, "ma12_eok": 27.7963}, {"month": "2026-01", "label": "2026.01", "sales_eok": 29.6972, "ma12_eok": 28.2909}, {"month": "2026-02", "label": "2026.02", "sales_eok": 30.795, "ma12_eok": 28.7175}, {"month": "2026-03", "label": "2026.03", "sales_eok": 30.0, "ma12_eok": 29.4345}, {"month": "2026-04", "label": "2026.04", "sales_eok": 35.0, "ma12_eok": 30.3}]}, {"name": "KCC", "group": "국내법인", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 43.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 38.0, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 41.0, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 39.0, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 43.0, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 45.0, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 45.0, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 40.0, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 44.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 43.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 47.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 43.0, "ma12_eok": 42.5833}, {"month": "2024-01", "label": "2024.01", "sales_eok": 46.7554, "ma12_eok": 42.8963}, {"month": "2024-02", "label": "2024.02", "sales_eok": 40.5634, "ma12_eok": 43.1099}, {"month": "2024-03", "label": "2024.03", "sales_eok": 45.501, "ma12_eok": 43.485}, {"month": "2024-04", "label": "2024.04", "sales_eok": 44.4597, "ma12_eok": 43.94}, {"month": "2024-05", "label": "2024.05", "sales_eok": 41.1148, "ma12_eok": 43.7829}, {"month": "2024-06", "label": "2024.06", "sales_eok": 44.2478, "ma12_eok": 43.7202}, {"month": "2024-07", "label": "2024.07", "sales_eok": 46.1301, "ma12_eok": 43.8144}, {"month": "2024-08", "label": "2024.08", "sales_eok": 48.1353, "ma12_eok": 44.4923}, {"month": "2024-09", "label": "2024.09", "sales_eok": 41.865, "ma12_eok": 44.3144}, {"month": "2024-10", "label": "2024.10", "sales_eok": 51.9999, "ma12_eok": 45.0644}, {"month": "2024-11", "label": "2024.11", "sales_eok": 47.7989, "ma12_eok": 45.1309}, {"month": "2024-12", "label": "2024.12", "sales_eok": 51.7334, "ma12_eok": 45.8587}, {"month": "2025-01", "label": "2025.01", "sales_eok": 53.4175, "ma12_eok": 46.4139}, {"month": "2025-02", "label": "2025.02", "sales_eok": 55.5435, "ma12_eok": 47.6622}, {"month": "2025-03", "label": "2025.03", "sales_eok": 59.3282, "ma12_eok": 48.8145}, {"month": "2025-04", "label": "2025.04", "sales_eok": 64.1016, "ma12_eok": 50.4513}, {"month": "2025-05", "label": "2025.05", "sales_eok": 56.0786, "ma12_eok": 51.6983}, {"month": "2025-06", "label": "2025.06", "sales_eok": 61.4035, "ma12_eok": 53.128}, {"month": "2025-07", "label": "2025.07", "sales_eok": 66.3232, "ma12_eok": 54.8107}, {"month": "2025-08", "label": "2025.08", "sales_eok": 55.3544, "ma12_eok": 55.4123}, {"month": "2025-09", "label": "2025.09", "sales_eok": 55.6402, "ma12_eok": 56.5602}, {"month": "2025-10", "label": "2025.10", "sales_eok": 52.0, "ma12_eok": 56.5602}, {"month": "2025-11", "label": "2025.11", "sales_eok": 65.4211, "ma12_eok": 58.0288}, {"month": "2025-12", "label": "2025.12", "sales_eok": 58.001, "ma12_eok": 58.5511}, {"month": "2026-01", "label": "2026.01", "sales_eok": 70.6799, "ma12_eok": 59.9896}, {"month": "2026-02", "label": "2026.02", "sales_eok": 54.1553, "ma12_eok": 59.8739}, {"month": "2026-03", "label": "2026.03", "sales_eok": 75.0, "ma12_eok": 61.1799}, {"month": "2026-04", "label": "2026.04", "sales_eok": 89.9, "ma12_eok": 63.3}]}, {"name": "BIT", "group": "국내법인", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 8.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 8.5, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 8.6, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 8.0, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 8.0, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 8.0, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 8.0, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 8.0, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 8.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 8.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 9.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 8.0, "ma12_eok": 8.175}, {"month": "2024-01", "label": "2024.01", "sales_eok": 7.7016, "ma12_eok": 8.1501}, {"month": "2024-02", "label": "2024.02", "sales_eok": 7.437, "ma12_eok": 8.0615}, {"month": "2024-03", "label": "2024.03", "sales_eok": 7.9063, "ma12_eok": 8.0037}, {"month": "2024-04", "label": "2024.04", "sales_eok": 8.0205, "ma12_eok": 8.0054}, {"month": "2024-05", "label": "2024.05", "sales_eok": 7.8578, "ma12_eok": 7.9936}, {"month": "2024-06", "label": "2024.06", "sales_eok": 7.8996, "ma12_eok": 7.9852}, {"month": "2024-07", "label": "2024.07", "sales_eok": 7.8996, "ma12_eok": 7.9769}, {"month": "2024-08", "label": "2024.08", "sales_eok": 8.1553, "ma12_eok": 7.9898}, {"month": "2024-09", "label": "2024.09", "sales_eok": 8.2296, "ma12_eok": 8.0089}, {"month": "2024-10", "label": "2024.10", "sales_eok": 8.194, "ma12_eok": 8.0251}, {"month": "2024-11", "label": "2024.11", "sales_eok": 7.806, "ma12_eok": 7.9256}, {"month": "2024-12", "label": "2024.12", "sales_eok": 7.9436, "ma12_eok": 7.9209}, {"month": "2025-01", "label": "2025.01", "sales_eok": 7.808, "ma12_eok": 7.9298}, {"month": "2025-02", "label": "2025.02", "sales_eok": 7.792, "ma12_eok": 7.9594}, {"month": "2025-03", "label": "2025.03", "sales_eok": 8.3011, "ma12_eok": 7.9923}, {"month": "2025-04", "label": "2025.04", "sales_eok": 9.069, "ma12_eok": 8.0796}, {"month": "2025-05", "label": "2025.05", "sales_eok": 7.6079, "ma12_eok": 8.0588}, {"month": "2025-06", "label": "2025.06", "sales_eok": 7.8608, "ma12_eok": 8.0556}, {"month": "2025-07", "label": "2025.07", "sales_eok": 9.7708, "ma12_eok": 8.2115}, {"month": "2025-08", "label": "2025.08", "sales_eok": 8.2357, "ma12_eok": 8.2182}, {"month": "2025-09", "label": "2025.09", "sales_eok": 9.1148, "ma12_eok": 8.292}, {"month": "2025-10", "label": "2025.10", "sales_eok": 8.0, "ma12_eok": 8.2758}, {"month": "2025-11", "label": "2025.11", "sales_eok": 7.9072, "ma12_eok": 8.2842}, {"month": "2025-12", "label": "2025.12", "sales_eok": 8.385, "ma12_eok": 8.321}, {"month": "2026-01", "label": "2026.01", "sales_eok": 8.1713, "ma12_eok": 8.3513}, {"month": "2026-02", "label": "2026.02", "sales_eok": 6.9246, "ma12_eok": 8.279}, {"month": "2026-03", "label": "2026.03", "sales_eok": 8.0, "ma12_eok": 8.2539}, {"month": "2026-04", "label": "2026.04", "sales_eok": 10.5, "ma12_eok": 8.4}]}, {"name": "통합구매", "group": "국내법인", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 20.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 22.0, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 23.0, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 28.0, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 27.0, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 29.0, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 27.0, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 21.0, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 23.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 22.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 34.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 28.0, "ma12_eok": 25.3333}, {"month": "2024-01", "label": "2024.01", "sales_eok": 49.8557, "ma12_eok": 27.8213}, {"month": "2024-02", "label": "2024.02", "sales_eok": 48.9207, "ma12_eok": 30.0647}, {"month": "2024-03", "label": "2024.03", "sales_eok": 58.9309, "ma12_eok": 33.0589}, {"month": "2024-04", "label": "2024.04", "sales_eok": 55.1787, "ma12_eok": 35.3238}, {"month": "2024-05", "label": "2024.05", "sales_eok": 45.3147, "ma12_eok": 36.8501}, {"month": "2024-06", "label": "2024.06", "sales_eok": 48.3499, "ma12_eok": 38.4625}, {"month": "2024-07", "label": "2024.07", "sales_eok": 61.395, "ma12_eok": 41.3288}, {"month": "2024-08", "label": "2024.08", "sales_eok": 58.0471, "ma12_eok": 44.4161}, {"month": "2024-09", "label": "2024.09", "sales_eok": 52.3635, "ma12_eok": 46.863}, {"month": "2024-10", "label": "2024.10", "sales_eok": 70.9, "ma12_eok": 50.938}, {"month": "2024-11", "label": "2024.11", "sales_eok": 67.6605, "ma12_eok": 53.743}, {"month": "2024-12", "label": "2024.12", "sales_eok": 68.7189, "ma12_eok": 57.1363}, {"month": "2025-01", "label": "2025.01", "sales_eok": 66.0697, "ma12_eok": 58.4875}, {"month": "2025-02", "label": "2025.02", "sales_eok": 48.8628, "ma12_eok": 58.4826}, {"month": "2025-03", "label": "2025.03", "sales_eok": 73.0217, "ma12_eok": 59.6569}, {"month": "2025-04", "label": "2025.04", "sales_eok": 66.0958, "ma12_eok": 60.5666}, {"month": "2025-05", "label": "2025.05", "sales_eok": 46.8321, "ma12_eok": 60.6931}, {"month": "2025-06", "label": "2025.06", "sales_eok": 54.0058, "ma12_eok": 61.1644}, {"month": "2025-07", "label": "2025.07", "sales_eok": 57.692, "ma12_eok": 60.8558}, {"month": "2025-08", "label": "2025.08", "sales_eok": 41.2389, "ma12_eok": 59.4551}, {"month": "2025-09", "label": "2025.09", "sales_eok": 42.8013, "ma12_eok": 58.6583}, {"month": "2025-10", "label": "2025.10", "sales_eok": 40.0, "ma12_eok": 56.0833}, {"month": "2025-11", "label": "2025.11", "sales_eok": 56.7918, "ma12_eok": 55.1776}, {"month": "2025-12", "label": "2025.12", "sales_eok": 49.1217, "ma12_eok": 53.5445}, {"month": "2026-01", "label": "2026.01", "sales_eok": 48.8152, "ma12_eok": 52.1066}, {"month": "2026-02", "label": "2026.02", "sales_eok": 39.2908, "ma12_eok": 51.3089}, {"month": "2026-03", "label": "2026.03", "sales_eok": 36.0, "ma12_eok": 48.2238}, {"month": "2026-04", "label": "2026.04", "sales_eok": 56.0, "ma12_eok": 47.4}]}, {"name": "국내법인", "group": "국내법인", "category": "group", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 230.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 245.0, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 261.0, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 235.0, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 256.0, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 257.0, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 259.0, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 254.0, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 249.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 244.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 278.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 236.0, "ma12_eok": 250.3333}, {"month": "2024-01", "label": "2024.01", "sales_eok": 244.1954, "ma12_eok": 251.5163}, {"month": "2024-02", "label": "2024.02", "sales_eok": 204.839, "ma12_eok": 248.1695}, {"month": "2024-03", "label": "2024.03", "sales_eok": 224.7114, "ma12_eok": 245.1455}, {"month": "2024-04", "label": "2024.04", "sales_eok": 218.0671, "ma12_eok": 243.7344}, {"month": "2024-05", "label": "2024.05", "sales_eok": 237.9125, "ma12_eok": 242.2271}, {"month": "2024-06", "label": "2024.06", "sales_eok": 247.8246, "ma12_eok": 241.4625}, {"month": "2024-07", "label": "2024.07", "sales_eok": 270.3891, "ma12_eok": 242.4116}, {"month": "2024-08", "label": "2024.08", "sales_eok": 261.6596, "ma12_eok": 243.0499}, {"month": "2024-09", "label": "2024.09", "sales_eok": 238.9878, "ma12_eok": 242.2155}, {"month": "2024-10", "label": "2024.10", "sales_eok": 271.4499, "ma12_eok": 244.503}, {"month": "2024-11", "label": "2024.11", "sales_eok": 258.7375, "ma12_eok": 242.8978}, {"month": "2024-12", "label": "2024.12", "sales_eok": 261.1279, "ma12_eok": 244.9918}, {"month": "2025-01", "label": "2025.01", "sales_eok": 263.0919, "ma12_eok": 246.5665}, {"month": "2025-02", "label": "2025.02", "sales_eok": 259.1684, "ma12_eok": 251.094}, {"month": "2025-03", "label": "2025.03", "sales_eok": 281.4036, "ma12_eok": 255.8183}, {"month": "2025-04", "label": "2025.04", "sales_eok": 301.0463, "ma12_eok": 262.7333}, {"month": "2025-05", "label": "2025.05", "sales_eok": 250.3104, "ma12_eok": 263.7664}, {"month": "2025-06", "label": "2025.06", "sales_eok": 263.7506, "ma12_eok": 265.0936}, {"month": "2025-07", "label": "2025.07", "sales_eok": 307.7611, "ma12_eok": 268.2079}, {"month": "2025-08", "label": "2025.08", "sales_eok": 256.61, "ma12_eok": 267.7871}, {"month": "2025-09", "label": "2025.09", "sales_eok": 280.3081, "ma12_eok": 271.2305}, {"month": "2025-10", "label": "2025.10", "sales_eok": 245.0, "ma12_eok": 269.0263}, {"month": "2025-11", "label": "2025.11", "sales_eok": 282.8616, "ma12_eok": 271.0367}, {"month": "2025-12", "label": "2025.12", "sales_eok": 273.7484, "ma12_eok": 272.0884}, {"month": "2026-01", "label": "2026.01", "sales_eok": 273.539, "ma12_eok": 272.959}, {"month": "2026-02", "label": "2026.02", "sales_eok": 242.2801, "ma12_eok": 271.5516}, {"month": "2026-03", "label": "2026.03", "sales_eok": 280.0, "ma12_eok": 271.4346}, {"month": "2026-04", "label": "2026.04", "sales_eok": 342.1, "ma12_eok": 274.9}]}, {"name": "BWK", "group": "해외법인", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 13.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 10.0, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 12.0, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 13.0, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 11.0, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 13.0, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 18.0, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 25.0, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 22.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 16.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 21.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 18.0, "ma12_eok": 16.0}, {"month": "2024-01", "label": "2024.01", "sales_eok": 24.9249, "ma12_eok": 16.9937}, {"month": "2024-02", "label": "2024.02", "sales_eok": 11.7651, "ma12_eok": 17.1408}, {"month": "2024-03", "label": "2024.03", "sales_eok": 16.3836, "ma12_eok": 17.5061}, {"month": "2024-04", "label": "2024.04", "sales_eok": 19.9475, "ma12_eok": 18.0851}, {"month": "2024-05", "label": "2024.05", "sales_eok": 19.9985, "ma12_eok": 18.835}, {"month": "2024-06", "label": "2024.06", "sales_eok": 18.9384, "ma12_eok": 19.3298}, {"month": "2024-07", "label": "2024.07", "sales_eok": 16.3555, "ma12_eok": 19.1928}, {"month": "2024-08", "label": "2024.08", "sales_eok": 16.9863, "ma12_eok": 18.525}, {"month": "2024-09", "label": "2024.09", "sales_eok": 17.9194, "ma12_eok": 18.1849}, {"month": "2024-10", "label": "2024.10", "sales_eok": 17.9642, "ma12_eok": 18.3486}, {"month": "2024-11", "label": "2024.11", "sales_eok": 19.4163, "ma12_eok": 18.2166}, {"month": "2024-12", "label": "2024.12", "sales_eok": 22.074, "ma12_eok": 18.5561}, {"month": "2025-01", "label": "2025.01", "sales_eok": 19.3209, "ma12_eok": 18.0892}, {"month": "2025-02", "label": "2025.02", "sales_eok": 13.7247, "ma12_eok": 18.2525}, {"month": "2025-03", "label": "2025.03", "sales_eok": 17.3216, "ma12_eok": 18.3306}, {"month": "2025-04", "label": "2025.04", "sales_eok": 18.3491, "ma12_eok": 18.1974}, {"month": "2025-05", "label": "2025.05", "sales_eok": 18.4331, "ma12_eok": 18.067}, {"month": "2025-06", "label": "2025.06", "sales_eok": 21.2886, "ma12_eok": 18.2628}, {"month": "2025-07", "label": "2025.07", "sales_eok": 18.1001, "ma12_eok": 18.4082}, {"month": "2025-08", "label": "2025.08", "sales_eok": 31.2269, "ma12_eok": 19.5949}, {"month": "2025-09", "label": "2025.09", "sales_eok": 13.0765, "ma12_eok": 19.1913}, {"month": "2025-10", "label": "2025.10", "sales_eok": 14.0, "ma12_eok": 18.861}, {"month": "2025-11", "label": "2025.11", "sales_eok": 15.2792, "ma12_eok": 18.5162}, {"month": "2025-12", "label": "2025.12", "sales_eok": 19.3782, "ma12_eok": 18.2916}, {"month": "2026-01", "label": "2026.01", "sales_eok": 16.0716, "ma12_eok": 18.0208}, {"month": "2026-02", "label": "2026.02", "sales_eok": 10.9497, "ma12_eok": 17.7896}, {"month": "2026-03", "label": "2026.03", "sales_eok": 19.0, "ma12_eok": 17.9294}, {"month": "2026-04", "label": "2026.04", "sales_eok": 21.5, "ma12_eok": 18.2}]}, {"name": "SYTK", "group": "해외법인", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 7.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 2.0, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 7.0, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 4.0, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 5.0, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 5.0, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 3.0, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 4.0, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 5.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 3.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 3.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 2.0, "ma12_eok": 4.1667}, {"month": "2024-01", "label": "2024.01", "sales_eok": 1.9243, "ma12_eok": 3.7437}, {"month": "2024-02", "label": "2024.02", "sales_eok": 2.7846, "ma12_eok": 3.8091}, {"month": "2024-03", "label": "2024.03", "sales_eok": 1.8027, "ma12_eok": 3.376}, {"month": "2024-04", "label": "2024.04", "sales_eok": 2.7571, "ma12_eok": 3.2724}, {"month": "2024-05", "label": "2024.05", "sales_eok": 2.0074, "ma12_eok": 3.023}, {"month": "2024-06", "label": "2024.06", "sales_eok": 3.2712, "ma12_eok": 2.8789}, {"month": "2024-07", "label": "2024.07", "sales_eok": 2.3142, "ma12_eok": 2.8218}, {"month": "2024-08", "label": "2024.08", "sales_eok": 2.6705, "ma12_eok": 2.711}, {"month": "2024-09", "label": "2024.09", "sales_eok": 2.507, "ma12_eok": 2.5032}, {"month": "2024-10", "label": "2024.10", "sales_eok": 2.1487, "ma12_eok": 2.4323}, {"month": "2024-11", "label": "2024.11", "sales_eok": 1.9835, "ma12_eok": 2.3476}, {"month": "2024-12", "label": "2024.12", "sales_eok": 2.9593, "ma12_eok": 2.4275}, {"month": "2025-01", "label": "2025.01", "sales_eok": 2.0072, "ma12_eok": 2.4344}, {"month": "2025-02", "label": "2025.02", "sales_eok": 2.1288, "ma12_eok": 2.3798}, {"month": "2025-03", "label": "2025.03", "sales_eok": 2.2415, "ma12_eok": 2.4164}, {"month": "2025-04", "label": "2025.04", "sales_eok": 2.6983, "ma12_eok": 2.4115}, {"month": "2025-05", "label": "2025.05", "sales_eok": 2.2134, "ma12_eok": 2.4286}, {"month": "2025-06", "label": "2025.06", "sales_eok": 3.712, "ma12_eok": 2.4654}, {"month": "2025-07", "label": "2025.07", "sales_eok": 1.8503, "ma12_eok": 2.4267}, {"month": "2025-08", "label": "2025.08", "sales_eok": 1.5679, "ma12_eok": 2.3348}, {"month": "2025-09", "label": "2025.09", "sales_eok": 1.698, "ma12_eok": 2.2674}, {"month": "2025-10", "label": "2025.10", "sales_eok": 2.0, "ma12_eok": 2.255}, {"month": "2025-11", "label": "2025.11", "sales_eok": 1.7445, "ma12_eok": 2.2351}, {"month": "2025-12", "label": "2025.12", "sales_eok": 1.798, "ma12_eok": 2.1383}, {"month": "2026-01", "label": "2026.01", "sales_eok": 2.0645, "ma12_eok": 2.1431}, {"month": "2026-02", "label": "2026.02", "sales_eok": 1.5574, "ma12_eok": 2.0955}, {"month": "2026-03", "label": "2026.03", "sales_eok": 3.0, "ma12_eok": 2.1587}, {"month": "2026-04", "label": "2026.04", "sales_eok": 2.7, "ma12_eok": 2.2}]}, {"name": "VBC", "group": "해외법인", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 12.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 14.0, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 16.0, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 16.0, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 13.0, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 14.0, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 16.0, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 15.0, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 14.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 15.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 14.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 15.0, "ma12_eok": 14.5}, {"month": "2024-01", "label": "2024.01", "sales_eok": 15.4912, "ma12_eok": 14.7909}, {"month": "2024-02", "label": "2024.02", "sales_eok": 11.3942, "ma12_eok": 14.5738}, {"month": "2024-03", "label": "2024.03", "sales_eok": 12.7952, "ma12_eok": 14.3067}, {"month": "2024-04", "label": "2024.04", "sales_eok": 12.9683, "ma12_eok": 14.0541}, {"month": "2024-05", "label": "2024.05", "sales_eok": 13.3413, "ma12_eok": 14.0825}, {"month": "2024-06", "label": "2024.06", "sales_eok": 19.6011, "ma12_eok": 14.5493}, {"month": "2024-07", "label": "2024.07", "sales_eok": 22.2403, "ma12_eok": 15.0693}, {"month": "2024-08", "label": "2024.08", "sales_eok": 17.1388, "ma12_eok": 15.2475}, {"month": "2024-09", "label": "2024.09", "sales_eok": 16.2379, "ma12_eok": 15.434}, {"month": "2024-10", "label": "2024.10", "sales_eok": 19.4638, "ma12_eok": 15.806}, {"month": "2024-11", "label": "2024.11", "sales_eok": 21.7558, "ma12_eok": 16.4523}, {"month": "2024-12", "label": "2024.12", "sales_eok": 18.2155, "ma12_eok": 16.7203}, {"month": "2025-01", "label": "2025.01", "sales_eok": 18.0087, "ma12_eok": 16.9301}, {"month": "2025-02", "label": "2025.02", "sales_eok": 17.9026, "ma12_eok": 17.4725}, {"month": "2025-03", "label": "2025.03", "sales_eok": 24.1167, "ma12_eok": 18.4159}, {"month": "2025-04", "label": "2025.04", "sales_eok": 25.2556, "ma12_eok": 19.4399}, {"month": "2025-05", "label": "2025.05", "sales_eok": 22.3656, "ma12_eok": 20.1919}, {"month": "2025-06", "label": "2025.06", "sales_eok": 20.2726, "ma12_eok": 20.2478}, {"month": "2025-07", "label": "2025.07", "sales_eok": 20.6925, "ma12_eok": 20.1188}, {"month": "2025-08", "label": "2025.08", "sales_eok": 25.9753, "ma12_eok": 20.8552}, {"month": "2025-09", "label": "2025.09", "sales_eok": 31.0264, "ma12_eok": 22.0876}, {"month": "2025-10", "label": "2025.10", "sales_eok": 34.0, "ma12_eok": 23.299}, {"month": "2025-11", "label": "2025.11", "sales_eok": 30.9439, "ma12_eok": 24.0646}, {"month": "2025-12", "label": "2025.12", "sales_eok": 50.106, "ma12_eok": 26.7222}, {"month": "2026-01", "label": "2026.01", "sales_eok": 45.6868, "ma12_eok": 29.0287}, {"month": "2026-02", "label": "2026.02", "sales_eok": 29.37, "ma12_eok": 29.9843}, {"month": "2026-03", "label": "2026.03", "sales_eok": 44.0, "ma12_eok": 31.6412}, {"month": "2026-04", "label": "2026.04", "sales_eok": 49.5, "ma12_eok": 33.7}]}, {"name": "YBI", "group": "해외법인", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 21.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 22.0, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 25.0, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 21.0, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 27.0, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 21.0, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 23.0, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 23.0, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 26.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 22.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 20.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 19.0, "ma12_eok": 22.5}, {"month": "2024-01", "label": "2024.01", "sales_eok": 22.8891, "ma12_eok": 22.6574}, {"month": "2024-02", "label": "2024.02", "sales_eok": 24.7493, "ma12_eok": 22.8865}, {"month": "2024-03", "label": "2024.03", "sales_eok": 22.2307, "ma12_eok": 22.6558}, {"month": "2024-04", "label": "2024.04", "sales_eok": 25.1154, "ma12_eok": 22.9987}, {"month": "2024-05", "label": "2024.05", "sales_eok": 25.1154, "ma12_eok": 22.8417}, {"month": "2024-06", "label": "2024.06", "sales_eok": 23.716, "ma12_eok": 23.068}, {"month": "2024-07", "label": "2024.07", "sales_eok": 24.1214, "ma12_eok": 23.1615}, {"month": "2024-08", "label": "2024.08", "sales_eok": 17.9811, "ma12_eok": 22.7432}, {"month": "2024-09", "label": "2024.09", "sales_eok": 27.3219, "ma12_eok": 22.8534}, {"month": "2024-10", "label": "2024.10", "sales_eok": 22.7056, "ma12_eok": 22.9122}, {"month": "2024-11", "label": "2024.11", "sales_eok": 22.0113, "ma12_eok": 23.0798}, {"month": "2024-12", "label": "2024.12", "sales_eok": 25.4853, "ma12_eok": 23.6202}, {"month": "2025-01", "label": "2025.01", "sales_eok": 25.6989, "ma12_eok": 23.8544}, {"month": "2025-02", "label": "2025.02", "sales_eok": 25.6017, "ma12_eok": 23.9254}, {"month": "2025-03", "label": "2025.03", "sales_eok": 23.3094, "ma12_eok": 24.0153}, {"month": "2025-04", "label": "2025.04", "sales_eok": 31.8749, "ma12_eok": 24.5786}, {"month": "2025-05", "label": "2025.05", "sales_eok": 33.2533, "ma12_eok": 25.2567}, {"month": "2025-06", "label": "2025.06", "sales_eok": 22.4993, "ma12_eok": 25.1553}, {"month": "2025-07", "label": "2025.07", "sales_eok": 24.0138, "ma12_eok": 25.1464}, {"month": "2025-08", "label": "2025.08", "sales_eok": 20.4775, "ma12_eok": 25.3544}, {"month": "2025-09", "label": "2025.09", "sales_eok": 26.9098, "ma12_eok": 25.3201}, {"month": "2025-10", "label": "2025.10", "sales_eok": 23.0, "ma12_eok": 25.3446}, {"month": "2025-11", "label": "2025.11", "sales_eok": 28.2959, "ma12_eok": 25.8683}, {"month": "2025-12", "label": "2025.12", "sales_eok": 26.015, "ma12_eok": 25.9125}, {"month": "2026-01", "label": "2026.01", "sales_eok": 22.5569, "ma12_eok": 25.6506}, {"month": "2026-02", "label": "2026.02", "sales_eok": 22.9423, "ma12_eok": 25.429}, {"month": "2026-03", "label": "2026.03", "sales_eok": 30.0, "ma12_eok": 25.9866}, {"month": "2026-04", "label": "2026.04", "sales_eok": 38.9, "ma12_eok": 26.6}]}, {"name": "BWI", "group": "해외법인", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 2.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 1.5, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 2.1, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 1.9, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 2.2, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 1.7, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 2.1, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 2.3, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 2.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 2.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 2.4, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 1.3, "ma12_eok": 1.9583}, {"month": "2024-01", "label": "2024.01", "sales_eok": 1.778, "ma12_eok": 1.9398}, {"month": "2024-02", "label": "2024.02", "sales_eok": 1.9275, "ma12_eok": 1.9755}, {"month": "2024-03", "label": "2024.03", "sales_eok": 1.592, "ma12_eok": 1.9331}, {"month": "2024-04", "label": "2024.04", "sales_eok": 1.1721, "ma12_eok": 1.8725}, {"month": "2024-05", "label": "2024.05", "sales_eok": 3.1366, "ma12_eok": 1.9505}, {"month": "2024-06", "label": "2024.06", "sales_eok": 2.3903, "ma12_eok": 2.008}, {"month": "2024-07", "label": "2024.07", "sales_eok": 4.0261, "ma12_eok": 2.1686}, {"month": "2024-08", "label": "2024.08", "sales_eok": 3.2742, "ma12_eok": 2.2497}, {"month": "2024-09", "label": "2024.09", "sales_eok": 2.6459, "ma12_eok": 2.3036}, {"month": "2024-10", "label": "2024.10", "sales_eok": 2.0684, "ma12_eok": 2.3093}, {"month": "2024-11", "label": "2024.11", "sales_eok": 2.2882, "ma12_eok": 2.2999}, {"month": "2024-12", "label": "2024.12", "sales_eok": 2.8425, "ma12_eok": 2.4285}, {"month": "2025-01", "label": "2025.01", "sales_eok": 1.3951, "ma12_eok": 2.3966}, {"month": "2025-02", "label": "2025.02", "sales_eok": 2.0992, "ma12_eok": 2.4109}, {"month": "2025-03", "label": "2025.03", "sales_eok": 1.8097, "ma12_eok": 2.429}, {"month": "2025-04", "label": "2025.04", "sales_eok": 1.7606, "ma12_eok": 2.4781}, {"month": "2025-05", "label": "2025.05", "sales_eok": 2.2816, "ma12_eok": 2.4068}, {"month": "2025-06", "label": "2025.06", "sales_eok": 3.1185, "ma12_eok": 2.4675}, {"month": "2025-07", "label": "2025.07", "sales_eok": 2.2893, "ma12_eok": 2.3227}, {"month": "2025-08", "label": "2025.08", "sales_eok": 2.129, "ma12_eok": 2.2273}, {"month": "2025-09", "label": "2025.09", "sales_eok": 3.1101, "ma12_eok": 2.266}, {"month": "2025-10", "label": "2025.10", "sales_eok": 4.0, "ma12_eok": 2.427}, {"month": "2025-11", "label": "2025.11", "sales_eok": 2.247, "ma12_eok": 2.4235}, {"month": "2025-12", "label": "2025.12", "sales_eok": 1.9198, "ma12_eok": 2.3466}, {"month": "2026-01", "label": "2026.01", "sales_eok": 2.7653, "ma12_eok": 2.4608}, {"month": "2026-02", "label": "2026.02", "sales_eok": 2.1868, "ma12_eok": 2.4681}, {"month": "2026-03", "label": "2026.03", "sales_eok": 3.0, "ma12_eok": 2.5673}, {"month": "2026-04", "label": "2026.04", "sales_eok": 3.4, "ma12_eok": 2.7}]}, {"name": "BWA", "group": "해외법인", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 7.6, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 5.4, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 6.7, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 6.5, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 7.5, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 8.2, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 8.6, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 8.4, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 6.9, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 8.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 7.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 6.0, "ma12_eok": 7.2333}, {"month": "2024-01", "label": "2024.01", "sales_eok": 7.2137, "ma12_eok": 7.2011}, {"month": "2024-02", "label": "2024.02", "sales_eok": 7.579, "ma12_eok": 7.3827}, {"month": "2024-03", "label": "2024.03", "sales_eok": 7.5003, "ma12_eok": 7.4494}, {"month": "2024-04", "label": "2024.04", "sales_eok": 8.8693, "ma12_eok": 7.6469}, {"month": "2024-05", "label": "2024.05", "sales_eok": 3.1366, "ma12_eok": 7.2832}, {"month": "2024-06", "label": "2024.06", "sales_eok": 2.3903, "ma12_eok": 6.7991}, {"month": "2024-07", "label": "2024.07", "sales_eok": 4.0261, "ma12_eok": 6.4179}, {"month": "2024-08", "label": "2024.08", "sales_eok": 3.2742, "ma12_eok": 5.9908}, {"month": "2024-09", "label": "2024.09", "sales_eok": 2.6459, "ma12_eok": 5.6363}, {"month": "2024-10", "label": "2024.10", "sales_eok": 2.0684, "ma12_eok": 5.142}, {"month": "2024-11", "label": "2024.11", "sales_eok": 2.2882, "ma12_eok": 4.7493}, {"month": "2024-12", "label": "2024.12", "sales_eok": 2.8425, "ma12_eok": 4.4862}, {"month": "2025-01", "label": "2025.01", "sales_eok": 7.1608, "ma12_eok": 4.4818}, {"month": "2025-02", "label": "2025.02", "sales_eok": 7.4292, "ma12_eok": 4.4693}, {"month": "2025-03", "label": "2025.03", "sales_eok": 8.1477, "ma12_eok": 4.5233}, {"month": "2025-04", "label": "2025.04", "sales_eok": 7.5808, "ma12_eok": 4.4159}, {"month": "2025-05", "label": "2025.05", "sales_eok": 7.4022, "ma12_eok": 4.7714}, {"month": "2025-06", "label": "2025.06", "sales_eok": 5.949, "ma12_eok": 5.0679}, {"month": "2025-07", "label": "2025.07", "sales_eok": 9.1065, "ma12_eok": 5.4913}, {"month": "2025-08", "label": "2025.08", "sales_eok": 8.5216, "ma12_eok": 5.9286}, {"month": "2025-09", "label": "2025.09", "sales_eok": 8.5216, "ma12_eok": 6.4182}, {"month": "2025-10", "label": "2025.10", "sales_eok": 8.0, "ma12_eok": 6.9125}, {"month": "2025-11", "label": "2025.11", "sales_eok": 8.2616, "ma12_eok": 7.4103}, {"month": "2025-12", "label": "2025.12", "sales_eok": 10.2068, "ma12_eok": 8.024}, {"month": "2026-01", "label": "2026.01", "sales_eok": 5.6611, "ma12_eok": 7.899}, {"month": "2026-02", "label": "2026.02", "sales_eok": 7.3025, "ma12_eok": 7.8885}, {"month": "2026-03", "label": "2026.03", "sales_eok": 9.0, "ma12_eok": 7.9595}, {"month": "2026-04", "label": "2026.04", "sales_eok": 6.5, "ma12_eok": 7.9}]}, {"name": "BWA(USA)", "group": "해외법인", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 3.7, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 3.7, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 3.1, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 2.9, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 2.5, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 2.3, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 0.3, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 0.6, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 1.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 1.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 1.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 1.0, "ma12_eok": 1.925}, {"month": "2024-01", "label": "2024.01", "sales_eok": 0.7217, "ma12_eok": 1.6768}, {"month": "2024-02", "label": "2024.02", "sales_eok": 2.3862, "ma12_eok": 1.5673}, {"month": "2024-03", "label": "2024.03", "sales_eok": 2.241, "ma12_eok": 1.4957}, {"month": "2024-04", "label": "2024.04", "sales_eok": 2.241, "ma12_eok": 1.4408}, {"month": "2024-05", "label": "2024.05", "sales_eok": 1.8293, "ma12_eok": 1.3849}, {"month": "2024-06", "label": "2024.06", "sales_eok": 1.8293, "ma12_eok": 1.3457}, {"month": "2024-07", "label": "2024.07", "sales_eok": 1.8854, "ma12_eok": 1.4778}, {"month": "2024-08", "label": "2024.08", "sales_eok": 2.4749, "ma12_eok": 1.6341}, {"month": "2024-09", "label": "2024.09", "sales_eok": 2.5436, "ma12_eok": 1.7627}, {"month": "2024-10", "label": "2024.10", "sales_eok": 2.5436, "ma12_eok": 1.8913}, {"month": "2024-11", "label": "2024.11", "sales_eok": 2.5436, "ma12_eok": 2.02}, {"month": "2024-12", "label": "2024.12", "sales_eok": 2.5436, "ma12_eok": 2.1486}, {"month": "2025-01", "label": "2025.01", "sales_eok": 2.4975, "ma12_eok": 2.2966}, {"month": "2025-02", "label": "2025.02", "sales_eok": 2.3017, "ma12_eok": 2.2895}, {"month": "2025-03", "label": "2025.03", "sales_eok": 4.0152, "ma12_eok": 2.4374}, {"month": "2025-04", "label": "2025.04", "sales_eok": 3.2931, "ma12_eok": 2.5251}, {"month": "2025-05", "label": "2025.05", "sales_eok": 4.1246, "ma12_eok": 2.7163}, {"month": "2025-06", "label": "2025.06", "sales_eok": 4.6625, "ma12_eok": 2.9524}, {"month": "2025-07", "label": "2025.07", "sales_eok": 9.5904, "ma12_eok": 3.5945}, {"month": "2025-08", "label": "2025.08", "sales_eok": 2.3858, "ma12_eok": 3.5871}, {"month": "2025-09", "label": "2025.09", "sales_eok": 2.0755, "ma12_eok": 3.5481}, {"month": "2025-10", "label": "2025.10", "sales_eok": 4.0, "ma12_eok": 3.6695}, {"month": "2025-11", "label": "2025.11", "sales_eok": 2.2791, "ma12_eok": 3.6474}, {"month": "2025-12", "label": "2025.12", "sales_eok": 2.15, "ma12_eok": 3.6146}, {"month": "2026-01", "label": "2026.01", "sales_eok": 4.8628, "ma12_eok": 3.8117}, {"month": "2026-02", "label": "2026.02", "sales_eok": 2.8499, "ma12_eok": 3.8574}, {"month": "2026-03", "label": "2026.03", "sales_eok": 5.0, "ma12_eok": 3.9395}, {"month": "2026-04", "label": "2026.04", "sales_eok": 3.6, "ma12_eok": 4.0}]}, {"name": "해외법인", "group": "해외법인", "category": "group", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 66.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 59.0, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 71.0, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 65.0, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 68.0, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 66.0, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 71.0, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 78.0, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 78.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 67.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 69.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 62.0, "ma12_eok": 68.3333}, {"month": "2024-01", "label": "2024.01", "sales_eok": 74.9428, "ma12_eok": 69.0786}, {"month": "2024-02", "label": "2024.02", "sales_eok": 62.586, "ma12_eok": 69.3774}, {"month": "2024-03", "label": "2024.03", "sales_eok": 64.5455, "ma12_eok": 68.8395}, {"month": "2024-04", "label": "2024.04", "sales_eok": 73.0707, "ma12_eok": 69.5121}, {"month": "2024-05", "label": "2024.05", "sales_eok": 68.5652, "ma12_eok": 69.5592}, {"month": "2024-06", "label": "2024.06", "sales_eok": 72.1365, "ma12_eok": 70.0706}, {"month": "2024-07", "label": "2024.07", "sales_eok": 74.9692, "ma12_eok": 70.4013}, {"month": "2024-08", "label": "2024.08", "sales_eok": 63.8002, "ma12_eok": 69.218}, {"month": "2024-09", "label": "2024.09", "sales_eok": 71.8215, "ma12_eok": 68.7031}, {"month": "2024-10", "label": "2024.10", "sales_eok": 68.9627, "ma12_eok": 68.8667}, {"month": "2024-11", "label": "2024.11", "sales_eok": 72.2869, "ma12_eok": 69.1406}, {"month": "2024-12", "label": "2024.12", "sales_eok": 76.9626, "ma12_eok": 70.3875}, {"month": "2025-01", "label": "2025.01", "sales_eok": 76.089, "ma12_eok": 70.483}, {"month": "2025-02", "label": "2025.02", "sales_eok": 71.1879, "ma12_eok": 71.1998}, {"month": "2025-03", "label": "2025.03", "sales_eok": 80.9618, "ma12_eok": 72.5679}, {"month": "2025-04", "label": "2025.04", "sales_eok": 90.8124, "ma12_eok": 74.0463}, {"month": "2025-05", "label": "2025.05", "sales_eok": 90.0738, "ma12_eok": 75.8387}, {"month": "2025-06", "label": "2025.06", "sales_eok": 81.5025, "ma12_eok": 76.6192}, {"month": "2025-07", "label": "2025.07", "sales_eok": 85.6429, "ma12_eok": 77.5087}, {"month": "2025-08", "label": "2025.08", "sales_eok": 92.284, "ma12_eok": 79.8823}, {"month": "2025-09", "label": "2025.09", "sales_eok": 86.4179, "ma12_eok": 81.0987}, {"month": "2025-10", "label": "2025.10", "sales_eok": 88.0, "ma12_eok": 82.6851}, {"month": "2025-11", "label": "2025.11", "sales_eok": 89.0511, "ma12_eok": 84.0822}, {"month": "2025-12", "label": "2025.12", "sales_eok": 111.5738, "ma12_eok": 86.9664}, {"month": "2026-01", "label": "2026.01", "sales_eok": 99.6691, "ma12_eok": 88.9314}, {"month": "2026-02", "label": "2026.02", "sales_eok": 77.1586, "ma12_eok": 89.429}, {"month": "2026-03", "label": "2026.03", "sales_eok": 113.0, "ma12_eok": 92.0988}, {"month": "2026-04", "label": "2026.04", "sales_eok": 126.2, "ma12_eok": 95.0}]}, {"name": "범우케미칼", "group": "판매사", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 10.78, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 12.2, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 13.95, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 11.75, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 12.63, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 13.05, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 13.64, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 12.2, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 14.42, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 12.31, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 13.64, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 11.49, "ma12_eok": 12.6717}, {"month": "2024-01", "label": "2024.01", "sales_eok": 11.1685, "ma12_eok": 12.704}, {"month": "2024-02", "label": "2024.02", "sales_eok": 10.5615, "ma12_eok": 12.5675}, {"month": "2024-03", "label": "2024.03", "sales_eok": 13.5633, "ma12_eok": 12.5353}, {"month": "2024-04", "label": "2024.04", "sales_eok": 12.3299, "ma12_eok": 12.5836}, {"month": "2024-05", "label": "2024.05", "sales_eok": 13.0761, "ma12_eok": 12.6208}, {"month": "2024-06", "label": "2024.06", "sales_eok": 12.262, "ma12_eok": 12.5551}, {"month": "2024-07", "label": "2024.07", "sales_eok": 14.877, "ma12_eok": 12.6582}, {"month": "2024-08", "label": "2024.08", "sales_eok": 11.31, "ma12_eok": 12.584}, {"month": "2024-09", "label": "2024.09", "sales_eok": 11.17, "ma12_eok": 12.3132}, {"month": "2024-10", "label": "2024.10", "sales_eok": 12.6091, "ma12_eok": 12.3381}, {"month": "2024-11", "label": "2024.11", "sales_eok": 16.8037, "ma12_eok": 12.6017}, {"month": "2024-12", "label": "2024.12", "sales_eok": 9.1869, "ma12_eok": 12.4098}, {"month": "2025-01", "label": "2025.01", "sales_eok": 9.5279, "ma12_eok": 12.2731}, {"month": "2025-02", "label": "2025.02", "sales_eok": 12.8074, "ma12_eok": 12.4603}, {"month": "2025-03", "label": "2025.03", "sales_eok": 12.2458, "ma12_eok": 12.3505}, {"month": "2025-04", "label": "2025.04", "sales_eok": 12.5434, "ma12_eok": 12.3683}, {"month": "2025-05", "label": "2025.05", "sales_eok": 11.5307, "ma12_eok": 12.2395}, {"month": "2025-06", "label": "2025.06", "sales_eok": 11.6837, "ma12_eok": 12.1913}, {"month": "2025-07", "label": "2025.07", "sales_eok": 12.4134, "ma12_eok": 11.986}, {"month": "2025-08", "label": "2025.08", "sales_eok": 13.0807, "ma12_eok": 12.1336}, {"month": "2025-09", "label": "2025.09", "sales_eok": 11.2437, "ma12_eok": 12.1397}, {"month": "2025-10", "label": "2025.10", "sales_eok": 10.0, "ma12_eok": 11.9223}, {"month": "2025-11", "label": "2025.11", "sales_eok": 10.8639, "ma12_eok": 11.4273}, {"month": "2025-12", "label": "2025.12", "sales_eok": 10.2604, "ma12_eok": 11.5168}, {"month": "2026-01", "label": "2026.01", "sales_eok": 10.8006, "ma12_eok": 11.6228}, {"month": "2026-02", "label": "2026.02", "sales_eok": 9.0987, "ma12_eok": 11.3138}, {"month": "2026-03", "label": "2026.03", "sales_eok": 11.0, "ma12_eok": 11.2099}, {"month": "2026-04", "label": "2026.04", "sales_eok": 13.7, "ma12_eok": 11.3}]}, {"name": "㈜범우켐", "group": "판매사", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 5.56, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 6.73, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 6.51, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 6.44, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 6.73, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 7.37, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 7.68, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 6.86, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 6.94, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 7.14, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 7.57, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 6.76, "ma12_eok": 6.8575}, {"month": "2024-01", "label": "2024.01", "sales_eok": 6.1075, "ma12_eok": 6.9031}, {"month": "2024-02", "label": "2024.02", "sales_eok": 6.1859, "ma12_eok": 6.8578}, {"month": "2024-03", "label": "2024.03", "sales_eok": 6.1448, "ma12_eok": 6.8273}, {"month": "2024-04", "label": "2024.04", "sales_eok": 6.4144, "ma12_eok": 6.8252}, {"month": "2024-05", "label": "2024.05", "sales_eok": 7.0966, "ma12_eok": 6.8558}, {"month": "2024-06", "label": "2024.06", "sales_eok": 6.9365, "ma12_eok": 6.8196}, {"month": "2024-07", "label": "2024.07", "sales_eok": 7.3915, "ma12_eok": 6.7956}, {"month": "2024-08", "label": "2024.08", "sales_eok": 6.858, "ma12_eok": 6.7954}, {"month": "2024-09", "label": "2024.09", "sales_eok": 6.3441, "ma12_eok": 6.7458}, {"month": "2024-10", "label": "2024.10", "sales_eok": 6.7619, "ma12_eok": 6.7143}, {"month": "2024-11", "label": "2024.11", "sales_eok": 6.3831, "ma12_eok": 6.6153}, {"month": "2024-12", "label": "2024.12", "sales_eok": 6.5906, "ma12_eok": 6.6012}, {"month": "2025-01", "label": "2025.01", "sales_eok": 4.8137, "ma12_eok": 6.4934}, {"month": "2025-02", "label": "2025.02", "sales_eok": 5.0955, "ma12_eok": 6.4025}, {"month": "2025-03", "label": "2025.03", "sales_eok": 5.0961, "ma12_eok": 6.3152}, {"month": "2025-04", "label": "2025.04", "sales_eok": 6.1673, "ma12_eok": 6.2946}, {"month": "2025-05", "label": "2025.05", "sales_eok": 6.0654, "ma12_eok": 6.2086}, {"month": "2025-06", "label": "2025.06", "sales_eok": 5.8766, "ma12_eok": 6.1203}, {"month": "2025-07", "label": "2025.07", "sales_eok": 6.599, "ma12_eok": 6.0543}, {"month": "2025-08", "label": "2025.08", "sales_eok": 6.156, "ma12_eok": 5.9958}, {"month": "2025-09", "label": "2025.09", "sales_eok": 7.2752, "ma12_eok": 6.0734}, {"month": "2025-10", "label": "2025.10", "sales_eok": 5.0, "ma12_eok": 5.9265}, {"month": "2025-11", "label": "2025.11", "sales_eok": 6.3866, "ma12_eok": 5.9268}, {"month": "2025-12", "label": "2025.12", "sales_eok": 6.2173, "ma12_eok": 5.8957}, {"month": "2026-01", "label": "2026.01", "sales_eok": 5.1528, "ma12_eok": 5.924}, {"month": "2026-02", "label": "2026.02", "sales_eok": 4.5826, "ma12_eok": 5.8812}, {"month": "2026-03", "label": "2026.03", "sales_eok": 6.0, "ma12_eok": 5.9566}, {"month": "2026-04", "label": "2026.04", "sales_eok": 7.1, "ma12_eok": 6.0}]}, {"name": "범우화인켐", "group": "판매사", "category": "법인", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 2.1, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 2.42, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 2.69, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 1.86, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 2.35, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 2.5, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 2.06, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 2.28, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 2.27, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 2.51, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 2.75, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 2.24, "ma12_eok": 2.3358}, {"month": "2024-01", "label": "2024.01", "sales_eok": 1.9509, "ma12_eok": 2.3234}, {"month": "2024-02", "label": "2024.02", "sales_eok": 3.3477, "ma12_eok": 2.4007}, {"month": "2024-03", "label": "2024.03", "sales_eok": 2.1592, "ma12_eok": 2.3565}, {"month": "2024-04", "label": "2024.04", "sales_eok": 2.1622, "ma12_eok": 2.3817}, {"month": "2024-05", "label": "2024.05", "sales_eok": 2.336, "ma12_eok": 2.3805}, {"month": "2024-06", "label": "2024.06", "sales_eok": 2.336, "ma12_eok": 2.3668}, {"month": "2024-07", "label": "2024.07", "sales_eok": 1.9344, "ma12_eok": 2.3564}, {"month": "2024-08", "label": "2024.08", "sales_eok": 3.8227, "ma12_eok": 2.4849}, {"month": "2024-09", "label": "2024.09", "sales_eok": 2.407, "ma12_eok": 2.4963}, {"month": "2024-10", "label": "2024.10", "sales_eok": 2.943, "ma12_eok": 2.5324}, {"month": "2024-11", "label": "2024.11", "sales_eok": 3.095, "ma12_eok": 2.5612}, {"month": "2024-12", "label": "2024.12", "sales_eok": 2.389, "ma12_eok": 2.5736}, {"month": "2025-01", "label": "2025.01", "sales_eok": 1.5755, "ma12_eok": 2.5423}, {"month": "2025-02", "label": "2025.02", "sales_eok": 1.7811, "ma12_eok": 2.4118}, {"month": "2025-03", "label": "2025.03", "sales_eok": 1.8609, "ma12_eok": 2.3869}, {"month": "2025-04", "label": "2025.04", "sales_eok": 2.9557, "ma12_eok": 2.453}, {"month": "2025-05", "label": "2025.05", "sales_eok": 2.2381, "ma12_eok": 2.4449}, {"month": "2025-06", "label": "2025.06", "sales_eok": 1.9055, "ma12_eok": 2.409}, {"month": "2025-07", "label": "2025.07", "sales_eok": 1.6613, "ma12_eok": 2.3862}, {"month": "2025-08", "label": "2025.08", "sales_eok": 2.2285, "ma12_eok": 2.2534}, {"month": "2025-09", "label": "2025.09", "sales_eok": 2.1167, "ma12_eok": 2.2292}, {"month": "2025-10", "label": "2025.10", "sales_eok": 2.0, "ma12_eok": 2.1506}, {"month": "2025-11", "label": "2025.11", "sales_eok": 2.3687, "ma12_eok": 2.0901}, {"month": "2025-12", "label": "2025.12", "sales_eok": 2.0117, "ma12_eok": 2.0586}, {"month": "2026-01", "label": "2026.01", "sales_eok": 2.5435, "ma12_eok": 2.1393}, {"month": "2026-02", "label": "2026.02", "sales_eok": 2.7952, "ma12_eok": 2.2238}, {"month": "2026-03", "label": "2026.03", "sales_eok": 4.0, "ma12_eok": 2.4021}, {"month": "2026-04", "label": "2026.04", "sales_eok": 3.2, "ma12_eok": 2.4}]}, {"name": "판매사", "group": "판매사", "category": "group", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 26.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 21.0, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 24.0, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 23.0, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 25.0, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 27.0, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 27.0, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 25.0, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 26.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 24.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 28.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 24.0, "ma12_eok": 25.0}, {"month": "2024-01", "label": "2024.01", "sales_eok": 19.2269, "ma12_eok": 24.4356}, {"month": "2024-02", "label": "2024.02", "sales_eok": 20.0951, "ma12_eok": 24.3602}, {"month": "2024-03", "label": "2024.03", "sales_eok": 21.8674, "ma12_eok": 24.1824}, {"month": "2024-04", "label": "2024.04", "sales_eok": 20.9064, "ma12_eok": 24.008}, {"month": "2024-05", "label": "2024.05", "sales_eok": 22.5087, "ma12_eok": 23.8004}, {"month": "2024-06", "label": "2024.06", "sales_eok": 21.5344, "ma12_eok": 23.3449}, {"month": "2024-07", "label": "2024.07", "sales_eok": 24.2029, "ma12_eok": 23.1118}, {"month": "2024-08", "label": "2024.08", "sales_eok": 21.9907, "ma12_eok": 22.861}, {"month": "2024-09", "label": "2024.09", "sales_eok": 19.921, "ma12_eok": 22.3545}, {"month": "2024-10", "label": "2024.10", "sales_eok": 22.314, "ma12_eok": 22.214}, {"month": "2024-11", "label": "2024.11", "sales_eok": 26.2818, "ma12_eok": 22.0708}, {"month": "2024-12", "label": "2024.12", "sales_eok": 18.1665, "ma12_eok": 21.5846}, {"month": "2025-01", "label": "2025.01", "sales_eok": 15.9171, "ma12_eok": 21.3088}, {"month": "2025-02", "label": "2025.02", "sales_eok": 19.6839, "ma12_eok": 21.2746}, {"month": "2025-03", "label": "2025.03", "sales_eok": 19.2029, "ma12_eok": 21.0525}, {"month": "2025-04", "label": "2025.04", "sales_eok": 21.6664, "ma12_eok": 21.1159}, {"month": "2025-05", "label": "2025.05", "sales_eok": 19.8342, "ma12_eok": 20.893}, {"month": "2025-06", "label": "2025.06", "sales_eok": 19.4659, "ma12_eok": 20.7206}, {"month": "2025-07", "label": "2025.07", "sales_eok": 20.6736, "ma12_eok": 20.4265}, {"month": "2025-08", "label": "2025.08", "sales_eok": 21.4653, "ma12_eok": 20.3827}, {"month": "2025-09", "label": "2025.09", "sales_eok": 20.6356, "ma12_eok": 20.4423}, {"month": "2025-10", "label": "2025.10", "sales_eok": 18.0, "ma12_eok": 20.0828}, {"month": "2025-11", "label": "2025.11", "sales_eok": 19.6191, "ma12_eok": 19.5275}, {"month": "2025-12", "label": "2025.12", "sales_eok": 18.4893, "ma12_eok": 19.5545}, {"month": "2026-01", "label": "2026.01", "sales_eok": 18.4969, "ma12_eok": 19.7694}, {"month": "2026-02", "label": "2026.02", "sales_eok": 16.4764, "ma12_eok": 19.5021}, {"month": "2026-03", "label": "2026.03", "sales_eok": 21.0, "ma12_eok": 19.6519}, {"month": "2026-04", "label": "2026.04", "sales_eok": 23.9, "ma12_eok": 19.8}]}, {"name": "연합 총계", "group": "전체", "category": "total", "months": [{"month": "2023-01", "label": "2023.01", "sales_eok": 321.0, "ma12_eok": null}, {"month": "2023-02", "label": "2023.02", "sales_eok": 326.0, "ma12_eok": null}, {"month": "2023-03", "label": "2023.03", "sales_eok": 355.0, "ma12_eok": null}, {"month": "2023-04", "label": "2023.04", "sales_eok": 324.0, "ma12_eok": null}, {"month": "2023-05", "label": "2023.05", "sales_eok": 350.0, "ma12_eok": null}, {"month": "2023-06", "label": "2023.06", "sales_eok": 349.0, "ma12_eok": null}, {"month": "2023-07", "label": "2023.07", "sales_eok": 357.0, "ma12_eok": null}, {"month": "2023-08", "label": "2023.08", "sales_eok": 357.0, "ma12_eok": null}, {"month": "2023-09", "label": "2023.09", "sales_eok": 352.0, "ma12_eok": null}, {"month": "2023-10", "label": "2023.10", "sales_eok": 336.0, "ma12_eok": null}, {"month": "2023-11", "label": "2023.11", "sales_eok": 375.0, "ma12_eok": null}, {"month": "2023-12", "label": "2023.12", "sales_eok": 322.0, "ma12_eok": 343.6667}, {"month": "2024-01", "label": "2024.01", "sales_eok": 338.3651, "ma12_eok": 345.1138}, {"month": "2024-02", "label": "2024.02", "sales_eok": 287.52, "ma12_eok": 341.9071}, {"month": "2024-03", "label": "2024.03", "sales_eok": 311.1244, "ma12_eok": 338.2508}, {"month": "2024-04", "label": "2024.04", "sales_eok": 312.0443, "ma12_eok": 337.2545}, {"month": "2024-05", "label": "2024.05", "sales_eok": 328.9863, "ma12_eok": 335.5033}, {"month": "2024-06", "label": "2024.06", "sales_eok": 341.4955, "ma12_eok": 334.878}, {"month": "2024-07", "label": "2024.07", "sales_eok": 369.5611, "ma12_eok": 335.9247}, {"month": "2024-08", "label": "2024.08", "sales_eok": 347.4505, "ma12_eok": 335.1289}, {"month": "2024-09", "label": "2024.09", "sales_eok": 330.7304, "ma12_eok": 333.3565}, {"month": "2024-10", "label": "2024.10", "sales_eok": 362.7265, "ma12_eok": 335.5837}, {"month": "2024-11", "label": "2024.11", "sales_eok": 357.3062, "ma12_eok": 334.1092}, {"month": "2024-12", "label": "2024.12", "sales_eok": 356.257, "ma12_eok": 336.9639}, {"month": "2025-01", "label": "2025.01", "sales_eok": 355.098, "ma12_eok": 338.3583}, {"month": "2025-02", "label": "2025.02", "sales_eok": 350.0402, "ma12_eok": 343.5684}, {"month": "2025-03", "label": "2025.03", "sales_eok": 381.5683, "ma12_eok": 349.4387}, {"month": "2025-04", "label": "2025.04", "sales_eok": 413.5252, "ma12_eok": 357.8954}, {"month": "2025-05", "label": "2025.05", "sales_eok": 360.2184, "ma12_eok": 360.4981}, {"month": "2025-06", "label": "2025.06", "sales_eok": 364.719, "ma12_eok": 362.4334}, {"month": "2025-07", "label": "2025.07", "sales_eok": 414.0776, "ma12_eok": 366.1431}, {"month": "2025-08", "label": "2025.08", "sales_eok": 370.3592, "ma12_eok": 368.0522}, {"month": "2025-09", "label": "2025.09", "sales_eok": 387.3617, "ma12_eok": 372.7714}, {"month": "2025-10", "label": "2025.10", "sales_eok": 351.0, "ma12_eok": 371.7942}, {"month": "2025-11", "label": "2025.11", "sales_eok": 391.5319, "ma12_eok": 374.6464}, {"month": "2025-12", "label": "2025.12", "sales_eok": 403.8115, "ma12_eok": 378.6093}, {"month": "2026-01", "label": "2026.01", "sales_eok": 391.705, "ma12_eok": 381.6598}, {"month": "2026-02", "label": "2026.02", "sales_eok": 335.9151, "ma12_eok": 380.4827}, {"month": "2026-03", "label": "2026.03", "sales_eok": 414.0, "ma12_eok": 383.1854}, {"month": "2026-04", "label": "2026.04", "sales_eok": 492.2, "ma12_eok": 389.7}]}]};
  bondData  = {"latestMonth":"2026-05","unit":"억원","entities":[{"name":"범우연합 합계","group":"합계","is_leaf":false,"periods":{"2025-12":{"total":935.71,"3m":651.97,"4_6m":92.2,"7_12m":147.59,"over1y":43.95},"2026-01":{"total":969.14,"3m":693.27,"4_6m":86.83,"7_12m":141.62,"over1y":47.42},"2026-02":{"total":926.21,"3m":635.54,"4_6m":97.99,"7_12m":129.85,"over1y":62.84},"2026-03":{"total":953.57,"3m":653.26,"4_6m":115.12,"7_12m":114.48,"over1y":70.7},"2026-04":{"total":1010.73,"3m":724.28,"4_6m":107.62,"7_12m":102.87,"over1y":75.96},"2026-05":{"total":1111.26,"3m":812.91,"4_6m":106.81,"7_12m":112.31,"over1y":79.21}},"yoy_total":75.02,"yoy_3m":72.31,"yoy_4_6m":15.42,"yoy_7_12m":-44.72,"yoy_over1y":32.01,"mom_total":100.53,"mom_3m":88.63,"mom_4_6m":-0.81,"mom_7_12m":9.44,"mom_over1y":3.25,"note":""},{"name":"국내사 합계","group":"국내법인","is_leaf":false,"periods":{"2025-12":{"total":642.25,"3m":428.03,"4_6m":57.31,"7_12m":131.43,"over1y":25.48},"2026-01":{"total":666.51,"3m":457.6,"4_6m":53.73,"7_12m":124.25,"over1y":30.94},"2026-02":{"total":634.55,"3m":412.91,"4_6m":64.59,"7_12m":111.24,"over1y":45.8},"2026-03":{"total":659.54,"3m":428.03,"4_6m":78.2,"7_12m":98.14,"over1y":55.17},"2026-04":{"total":701.06,"3m":475.38,"4_6m":75.7,"7_12m":88.71,"over1y":61.27},"2026-05":{"total":812.2,"3m":568.86,"4_6m":77.02,"7_12m":98.02,"over1y":68.3}},"yoy_total":58.81,"yoy_3m":47.35,"yoy_4_6m":18.38,"yoy_7_12m":-42.72,"yoy_over1y":35.8,"mom_total":111.14,"mom_3m":93.48,"mom_4_6m":1.32,"mom_7_12m":9.31,"mom_over1y":7.03,"note":""},{"name":"해외사 합계","group":"해외법인","is_leaf":false,"periods":{"2025-12":{"total":260.42,"3m":193.57,"4_6m":33.61,"7_12m":15.1,"over1y":18.13},"2026-01":{"total":267.8,"3m":203.4,"4_6m":31.96,"7_12m":16.55,"over1y":15.89},"2026-02":{"total":258.4,"3m":192.72,"4_6m":31.45,"7_12m":17.93,"over1y":16.3},"2026-03":{"total":255.69,"3m":189.7,"4_6m":35.54,"7_12m":15.9,"over1y":14.55},"2026-04":{"total":269.41,"3m":211.31,"4_6m":30.67,"7_12m":14.09,"over1y":13.34},"2026-05":{"total":256.68,"3m":204.58,"4_6m":28.3,"7_12m":14.28,"over1y":9.51}},"yoy_total":9.0,"yoy_3m":17.73,"yoy_4_6m":-2.94,"yoy_7_12m":-1.01,"yoy_over1y":-4.79,"mom_total":-12.73,"mom_3m":-6.73,"mom_4_6m":-2.37,"mom_7_12m":0.19,"mom_over1y":-3.83,"note":""},{"name":"판매사 합계","group":"판매사","is_leaf":false,"periods":{"2025-12":{"total":33.04,"3m":30.36,"4_6m":1.27,"7_12m":1.06,"over1y":0.35},"2026-01":{"total":34.83,"3m":32.28,"4_6m":1.15,"7_12m":0.82,"over1y":0.59},"2026-02":{"total":33.26,"3m":29.91,"4_6m":1.95,"7_12m":0.68,"over1y":0.73},"2026-03":{"total":38.34,"3m":35.54,"4_6m":1.38,"7_12m":0.44,"over1y":0.97},"2026-04":{"total":40.25,"3m":37.59,"4_6m":1.25,"7_12m":0.06,"over1y":1.35},"2026-05":{"total":42.38,"3m":39.47,"4_6m":1.49,"7_12m":0.01,"over1y":1.4}},"yoy_total":7.21,"yoy_3m":7.23,"yoy_4_6m":-0.02,"yoy_7_12m":-1.0,"yoy_over1y":1.0,"mom_total":2.13,"mom_3m":1.88,"mom_4_6m":0.24,"mom_7_12m":-0.05,"mom_over1y":0.05,"note":""},{"name":"BWC","group":"국내법인","is_leaf":true,"periods":{"2025-12":{"total":365.69,"3m":217.25,"4_6m":38.22,"7_12m":88.48,"over1y":21.73},"2026-01":{"total":361.98,"3m":222.23,"4_6m":37.42,"7_12m":76.27,"over1y":26.05},"2026-02":{"total":345.17,"3m":201.32,"4_6m":38.76,"7_12m":69.61,"over1y":35.49},"2026-03":{"total":357.88,"3m":196.74,"4_6m":45.1,"7_12m":66.18,"over1y":49.86},"2026-04":{"total":381.65,"3m":220.78,"4_6m":39.42,"7_12m":62.23,"over1y":59.21},"2026-05":{"total":236.81,"3m":223.38,"4_6m":9.77,"7_12m":0.1,"over1y":3.56}},"yoy_total":15.95,"yoy_3m":3.52,"yoy_4_6m":1.2,"yoy_7_12m":-26.25,"yoy_over1y":37.48,"mom_total":-144.84,"mom_3m":2.6,"mom_4_6m":-29.65,"mom_7_12m":-62.13,"mom_over1y":-55.65,"note":""},{"name":"BW","group":"국내법인","is_leaf":true,"periods":{"2025-12":{"total":62.88,"3m":49.48,"4_6m":4.97,"7_12m":8.43,"over1y":0.01},"2026-01":{"total":72.05,"3m":56.79,"4_6m":4.15,"7_12m":11.1,"over1y":0.01},"2026-02":{"total":69.49,"3m":52.84,"4_6m":6.77,"7_12m":8.62,"over1y":1.26},"2026-03":{"total":68.44,"3m":50.43,"4_6m":9.32,"7_12m":8.06,"over1y":0.63},"2026-04":{"total":71.8,"3m":51.56,"4_6m":11.06,"7_12m":9.16,"over1y":0.01},"2026-05":{"total":52.99,"3m":51.64,"4_6m":1.33,"7_12m":0.0,"over1y":0.01}},"yoy_total":8.91,"yoy_3m":2.09,"yoy_4_6m":6.09,"yoy_7_12m":0.73,"yoy_over1y":0.0,"mom_total":-18.81,"mom_3m":0.08,"mom_4_6m":-9.73,"mom_7_12m":-9.16,"mom_over1y":0.0,"note":""},{"name":"BEX","group":"국내법인","is_leaf":true,"periods":{"2025-12":{"total":125.3,"3m":74.39,"4_6m":12.9,"7_12m":34.52,"over1y":3.49},"2026-01":{"total":135.83,"3m":82.67,"4_6m":11.65,"7_12m":36.88,"over1y":4.63},"2026-02":{"total":135.48,"3m":76.31,"4_6m":17.35,"7_12m":33.01,"over1y":8.81},"2026-03":{"total":124.21,"3m":73.88,"4_6m":21.97,"7_12m":23.9,"over1y":4.45},"2026-04":{"total":128.12,"3m":85.13,"4_6m":23.68,"7_12m":17.32,"over1y":2.0},"2026-05":{"total":97.5,"3m":91.23,"4_6m":5.55,"7_12m":0.57,"over1y":0.15}},"yoy_total":2.82,"yoy_3m":10.74,"yoy_4_6m":10.78,"yoy_7_12m":-17.2,"yoy_over1y":-1.49,"mom_total":-30.62,"mom_3m":6.1,"mom_4_6m":-18.13,"mom_7_12m":-16.75,"mom_over1y":-1.85,"note":""},{"name":"KCC","group":"국내법인","is_leaf":true,"periods":{"2025-12":{"total":88.38,"3m":86.92,"4_6m":1.22,"7_12m":0.0,"over1y":0.24},"2026-01":{"total":96.65,"3m":95.91,"4_6m":0.5,"7_12m":0.0,"over1y":0.24},"2026-02":{"total":84.4,"3m":82.45,"4_6m":1.72,"7_12m":0.0,"over1y":0.24},"2026-03":{"total":109.02,"3m":106.98,"4_6m":1.81,"7_12m":0.0,"over1y":0.24},"2026-04":{"total":119.5,"3m":117.92,"4_6m":1.53,"7_12m":0.0,"over1y":0.05},"2026-05":{"total":121.38,"3m":120.93,"4_6m":0.4,"7_12m":0.0,"over1y":0.05}},"yoy_total":31.12,"yoy_3m":31.0,"yoy_4_6m":0.31,"yoy_7_12m":0.0,"yoy_over1y":-0.19,"mom_total":1.88,"mom_3m":3.01,"mom_4_6m":-1.13,"mom_7_12m":0.0,"mom_over1y":0.0,"note":""},{"name":"통합구매","group":"국내법인","is_leaf":true,"periods":{"2025-12":{"total":287.28,"3m":85.1,"4_6m":50.81,"7_12m":131.29,"over1y":20.09},"2026-01":{"total":284.21,"3m":86.94,"4_6m":47.75,"7_12m":123.87,"over1y":25.64},"2026-02":{"total":280.7,"3m":74.84,"4_6m":54.0,"7_12m":110.71,"over1y":41.15},"2026-03":{"total":280.52,"3m":62.77,"4_6m":69.91,"7_12m":97.19,"over1y":50.66},"2026-04":{"total":270.05,"3m":58.48,"4_6m":67.57,"7_12m":87.72,"over1y":56.28},"2026-05":{"total":303.53,"3m":81.68,"4_6m":59.97,"7_12m":97.35,"over1y":64.53}},"yoy_total":-17.23,"yoy_3m":-26.62,"yoy_4_6m":16.77,"yoy_7_12m":-43.57,"yoy_over1y":36.19,"mom_total":33.48,"mom_3m":23.2,"mom_4_6m":-7.6,"mom_7_12m":9.63,"mom_over1y":8.25,"note":"- 4월 : VBC $84만, BWA $80만, YBI $45만, BWI $34만, BWA USA $37만"},{"name":"BWK","group":"해외법인","is_leaf":true,"periods":{"2025-12":{"total":68.31,"3m":43.24,"4_6m":19.04,"7_12m":3.03,"over1y":3.0},"2026-01":{"total":67.34,"3m":44.22,"4_6m":15.88,"7_12m":4.45,"over1y":2.78},"2026-02":{"total":63.55,"3m":38.67,"4_6m":16.87,"7_12m":5.79,"over1y":2.23},"2026-03":{"total":67.94,"3m":40.75,"4_6m":19.36,"7_12m":5.82,"over1y":2.02},"2026-04":{"total":64.45,"3m":43.27,"4_6m":13.51,"7_12m":5.37,"over1y":2.31},"2026-05":{"total":61.41,"3m":41.14,"4_6m":12.35,"7_12m":5.71,"over1y":2.21}},"yoy_total":-3.85,"yoy_3m":0.03,"yoy_4_6m":-5.53,"yoy_7_12m":2.35,"yoy_over1y":-0.7,"mom_total":-3.04,"mom_3m":-2.13,"mom_4_6m":-1.16,"mom_7_12m":0.34,"mom_over1y":-0.1,"note":"- 악화 : 위해범우 +66,  소주보가몽 +25, 위해범우 +17, 강소진합 +9  등 / - 위험 : 일조코넥, 항력발동 등"},{"name":"SYTK","group":"해외법인","is_leaf":true,"periods":{"2025-12":{"total":4.51,"3m":3.67,"4_6m":0.84,"7_12m":0.0,"over1y":0.0},"2026-01":{"total":4.39,"3m":3.72,"4_6m":0.67,"7_12m":0.0,"over1y":0.0},"2026-02":{"total":4.23,"3m":3.37,"4_6m":0.85,"7_12m":0.0,"over1y":0.0},"2026-03":{"total":3.89,"3m":3.01,"4_6m":0.89,"7_12m":0.0,"over1y":0.0},"2026-04":{"total":3.92,"3m":3.15,"4_6m":0.77,"7_12m":0.0,"over1y":0.0},"2026-05":{"total":4.81,"3m":4.16,"4_6m":0.66,"7_12m":0.0,"over1y":0.0}},"yoy_total":-0.59,"yoy_3m":-0.52,"yoy_4_6m":-0.07,"yoy_7_12m":0.0,"yoy_over1y":0.0,"mom_total":0.89,"mom_3m":1.01,"mom_4_6m":-0.11,"mom_7_12m":0.0,"mom_over1y":0.0,"note":"- 악화 : 위해범우 +7, 진황도아이스디 +5, 강음한일 +2 등"},{"name":"VBC","group":"해외법인","is_leaf":true,"periods":{"2025-12":{"total":104.11,"3m":70.01,"4_6m":8.78,"7_12m":11.57,"over1y":13.75},"2026-01":{"total":118.06,"3m":85.4,"4_6m":9.28,"7_12m":11.67,"over1y":11.7},"2026-02":{"total":105.75,"3m":73.8,"4_6m":7.41,"7_12m":11.83,"over1y":12.71},"2026-03":{"total":97.54,"3m":67.14,"4_6m":9.38,"7_12m":9.75,"over1y":11.28},"2026-04":{"total":105.47,"3m":75.76,"4_6m":11.56,"7_12m":8.4,"over1y":9.76},"2026-05":{"total":99.21,"3m":74.2,"4_6m":11.25,"7_12m":7.67,"over1y":6.09}},"yoy_total":1.36,"yoy_3m":5.75,"yoy_4_6m":2.78,"yoy_7_12m":-3.17,"yoy_over1y":-3.99,"mom_total":-6.26,"mom_3m":-1.56,"mom_4_6m":-0.31,"mom_7_12m":-0.73,"mom_over1y":-3.67,"note":"- 악화 : KND +57, Tech Oil +42, KHANG DUY PHÁT + 41, M&C +39 등 / - 위험 : 서진그룹, Texon, M&C, DSP 등"},{"name":"YBI","group":"해외법인","is_leaf":true,"periods":{"2025-12":{"total":50.48,"3m":46.7,"4_6m":2.29,"7_12m":0.24,"over1y":1.26},"2026-01":{"total":48.78,"3m":45.19,"4_6m":2.18,"7_12m":0.13,"over1y":1.28},"2026-02":{"total":51.7,"3m":46.81,"4_6m":3.49,"7_12m":0.13,"over1y":1.27},"2026-03":{"total":52.85,"3m":49.5,"4_6m":2.13,"7_12m":0.05,"over1y":1.18},"2026-04":{"total":64.96,"3m":61.67,"4_6m":1.99,"7_12m":0.1,"over1y":1.19},"2026-05":{"total":65.38,"3m":62.2,"4_6m":1.7,"7_12m":0.3,"over1y":1.18}},"yoy_total":14.48,"yoy_3m":14.97,"yoy_4_6m":-0.3,"yoy_7_12m":-0.14,"yoy_over1y":-0.06,"mom_total":0.42,"mom_3m":0.53,"mom_4_6m":-0.29,"mom_7_12m":0.2,"mom_over1y":-0.01,"note":"- 악화 : Sultan +42, Amber +24, Intelii +14, Aprocool +20, ASM +9 / Focus +4 등 / - 위험 : C J POLYTECH, Intelii, CNH 등"},{"name":"BWI","group":"해외법인","is_leaf":true,"periods":{"2025-12":{"total":7.87,"3m":5.19,"4_6m":2.41,"7_12m":0.15,"over1y":0.12},"2026-01":{"total":8.16,"3m":5.06,"4_6m":2.79,"7_12m":0.19,"over1y":0.12},"2026-02":{"total":8.08,"3m":5.68,"4_6m":2.13,"7_12m":0.18,"over1y":0.08},"2026-03":{"total":8.48,"3m":5.74,"4_6m":2.37,"7_12m":0.28,"over1y":0.08},"2026-04":{"total":8.22,"3m":5.52,"4_6m":2.41,"7_12m":0.21,"over1y":0.08},"2026-05":{"total":9.15,"3m":6.63,"4_6m":1.91,"7_12m":0.58,"over1y":0.03}},"yoy_total":0.35,"yoy_3m":0.33,"yoy_4_6m":-0.0,"yoy_7_12m":0.06,"yoy_over1y":-0.04,"mom_total":0.93,"mom_3m":1.11,"mom_4_6m":-0.5,"mom_7_12m":0.37,"mom_over1y":-0.05,"note":"- 악화 : Win + 95, JY + 24,  SSK +18, YOOWON +6, KTI +6 등 / - 위험 : Skyline, Tongil, Mugunghwa, TUNGGAL 등"},{"name":"BWA","group":"해외법인","is_leaf":true,"periods":{"2025-12":{"total":21.25,"3m":20.98,"4_6m":0.25,"7_12m":0.02,"over1y":0.0},"2026-01":{"total":14.14,"3m":13.29,"4_6m":0.83,"7_12m":0.02,"over1y":0.0},"2026-02":{"total":18.99,"3m":18.53,"4_6m":0.45,"7_12m":0.0,"over1y":0.01},"2026-03":{"total":17.77,"3m":16.38,"4_6m":1.38,"7_12m":0.0,"over1y":0.0},"2026-04":{"total":13.96,"3m":13.67,"4_6m":0.28,"7_12m":0.01,"over1y":0.0},"2026-05":{"total":11.91,"3m":11.6,"4_6m":0.3,"7_12m":0.01,"over1y":0.0}},"yoy_total":-7.29,"yoy_3m":-7.31,"yoy_4_6m":0.03,"yoy_7_12m":-0.01,"yoy_over1y":0.0,"mom_total":-2.05,"mom_3m":-2.07,"mom_4_6m":0.02,"mom_7_12m":0.0,"mom_over1y":0.0,"note":"- 악화 : DYP +14, YSM +3, KIXX + 2 등 / - 위험 : INTERMEX"},{"name":"BWA USA","group":"해외법인","is_leaf":true,"periods":{"2025-12":{"total":3.89,"3m":3.79,"4_6m":0.0,"7_12m":0.1,"over1y":0.0},"2026-01":{"total":6.93,"3m":6.5,"4_6m":0.33,"7_12m":0.1,"over1y":0.0},"2026-02":{"total":6.11,"3m":5.86,"4_6m":0.25,"7_12m":0.0,"over1y":0.0},"2026-03":{"total":7.22,"3m":7.19,"4_6m":0.04,"7_12m":0.0,"over1y":0.0},"2026-04":{"total":8.43,"3m":8.28,"4_6m":0.15,"7_12m":0.0,"over1y":0.0},"2026-05":{"total":4.8,"3m":4.65,"4_6m":0.15,"7_12m":0.0,"over1y":0.0}},"yoy_total":4.54,"yoy_3m":4.49,"yoy_4_6m":0.15,"yoy_7_12m":-0.1,"yoy_over1y":0.0,"mom_total":-3.63,"mom_3m":-3.63,"mom_4_6m":0.0,"mom_7_12m":0.0,"mom_over1y":0.0,"note":"- 악화 : 현대트랜시스 +6, MS AUTOSYS +6, YBM TECH +3 등"},{"name":"범우케미칼","group":"판매사","is_leaf":true,"periods":{"2025-12":{"total":16.75,"3m":15.14,"4_6m":0.22,"7_12m":1.06,"over1y":0.33},"2026-01":{"total":18.53,"3m":16.83,"4_6m":0.32,"7_12m":0.82,"over1y":0.57},"2026-02":{"total":15.8,"3m":14.13,"4_6m":0.28,"7_12m":0.67,"over1y":0.71},"2026-03":{"total":19.71,"3m":18.01,"4_6m":0.32,"7_12m":0.43,"over1y":0.95},"2026-04":{"total":22.11,"3m":20.2,"4_6m":0.53,"7_12m":0.06,"over1y":1.33},"2026-05":{"total":22.71,"3m":20.91,"4_6m":0.42,"7_12m":0.0,"over1y":1.38}},"yoy_total":5.36,"yoy_3m":5.06,"yoy_4_6m":0.3,"yoy_7_12m":-1.0,"yoy_over1y":1.0,"mom_total":0.6,"mom_3m":0.71,"mom_4_6m":-0.11,"mom_7_12m":-0.06,"mom_over1y":0.05,"note":"- 악화 : 범우루브 +28, 범우루브 +27, 세종엠테크 +2, 셰플러 +2 등"},{"name":"㈜범우켐","group":"판매사","is_leaf":true,"periods":{"2025-12":{"total":11.44,"3m":10.97,"4_6m":0.45,"7_12m":0.0,"over1y":0.02},"2026-01":{"total":10.64,"3m":10.29,"4_6m":0.33,"7_12m":0.0,"over1y":0.02},"2026-02":{"total":10.03,"3m":9.44,"4_6m":0.57,"7_12m":0.01,"over1y":0.02},"2026-03":{"total":10.13,"3m":9.78,"4_6m":0.31,"7_12m":0.01,"over1y":0.02},"2026-04":{"total":11.95,"3m":11.78,"4_6m":0.14,"7_12m":0.01,"over1y":0.02},"2026-05":{"total":12.53,"3m":12.34,"4_6m":0.16,"7_12m":0.01,"over1y":0.02}},"yoy_total":0.51,"yoy_3m":0.81,"yoy_4_6m":-0.3,"yoy_7_12m":0.01,"yoy_over1y":-0.0,"mom_total":0.58,"mom_3m":0.56,"mom_4_6m":0.02,"mom_7_12m":0.0,"mom_over1y":0.0,"note":"- 악화 : 오케이쿨텍 + 4, 오일테크 +  2 , 동원시스템 +2 등 / - 위험 : 동원시스템"},{"name":"범우화인켐","group":"판매사","is_leaf":true,"periods":{"2025-12":{"total":4.85,"3m":4.25,"4_6m":0.6,"7_12m":0.0,"over1y":0.0},"2026-01":{"total":5.65,"3m":5.16,"4_6m":0.5,"7_12m":0.0,"over1y":0.0},"2026-02":{"total":7.44,"3m":6.34,"4_6m":1.1,"7_12m":0.0,"over1y":0.0},"2026-03":{"total":8.5,"3m":7.75,"4_6m":0.75,"7_12m":0.0,"over1y":0.0},"2026-04":{"total":6.19,"3m":5.61,"4_6m":0.58,"7_12m":0.0,"over1y":0.0},"2026-05":{"total":7.13,"3m":6.22,"4_6m":0.91,"7_12m":0.0,"over1y":0.0}},"yoy_total":1.34,"yoy_3m":1.36,"yoy_4_6m":-0.03,"yoy_7_12m":0.0,"yoy_over1y":0.0,"mom_total":0.94,"mom_3m":0.61,"mom_4_6m":0.33,"mom_7_12m":0.0,"mom_over1y":0.0,"note":"- 악화 : 범우화학공업㈜호남 +23, 세풍코리아 +16, 엘케이네스트 +4 / 셰플러 + 3 등"}]};

  // 버튼 빌드
  u_buildButtons();
  s_buildButtons();
  b_buildButtons();
  setupAppControls();

  // 초기 선택
  u_selectEntity('연합 총계');
  s_select(salesData.entities.find(e=>e.category==='total')?.name || salesData.entities[0].name);
  b_select('범우연합 합계');
}

initDashboard();
