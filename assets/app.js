/* 運務資料中樞 共用：登入、API、外觀、導覽、KPI 載入、基準、圖表、匯出 */
const API="https://hmqnlovyzlvvnkqmfwtt.supabase.co/functions/v1/nxhub";
const DOWS='一二三四五六日';
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const fmt=(v,d=0)=>v==null||v===''||isNaN(v)?'—':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:d,minimumFractionDigits:d});
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const iso=d=>d&&d.length===8?d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6):(d||'');
const ymd=s=>(s||'').replace(/-/g,'');
const lISO=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const dowOf=y=>{const d=new Date(+y.slice(0,4),+y.slice(4,6)-1,+y.slice(6));return DOWS[(d.getDay()+6)%7]};
const qs=k=>new URLSearchParams(location.search).get(k);
const avgOf=(list,k)=>{const v=list.map(r=>r[k]).filter(x=>x!=null&&!isNaN(x));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null};
/* ---- 指標字典（鍵、名稱、小數、方向：低比較好=-1） ---- */
const KPIS=[['est_cost','估算幹線運輸件成本 元/件',2,-1],['km_per_kpiece','每千件里程 km',1,-1],['pieces','件數',0,0],['km_act','實際里程 km',0,-1],['empty_rate','空駛率 %',1,-1],['ot_total','加班台數(83)',0,-1],['ot_net_south','南向淨額',0,0],['seal_ot','加班封櫃數(205)',0,-1],['low55_n','低載櫃數 ≤55%',0,-1],['avg_load','平均積載率 %',1,1],['idle_trips','空櫃班次',0,-1],['idle_km','無效里程 km',0,-1],['trucks41','行駛日報車頭數',0,-1],['trips206','運行表班次數',0,-1],['wait60','空檔≥60分 班次',0,-1],['arrive_ontime_rate','到著準點率 %',1,1],['unload_med_min','卸時中位 分',0,-1],['hours_drive','行駛時數合計',0,-1],['boxes_attached','附掛櫃數合計',0,1],['km_plan','運行表里程 km',0,-1],['km_semi','半拖表定 km',0,-1],['km_full','全拖表定 km',0,-1],['seal_n','封櫃數',0,0],['late15_n','離站晚>15分 櫃',0,-1],['km_empty_box','空櫃里程 km',0,-1],['km_empty_head','空車頭里程 km',0,-1],['km_loaded','重櫃里程 km',0,0],['arr_pieces','到著件數(117)',0,0],['workers','到工人數(117)',0,0],['pcs_per_hour','件/工時(117)',1,1],['unload_box_min','拆櫃 分/櫃(117)',1,-1],['ontime117','班次準點率(117) %',1,1],['late117','遲到班次(117)',0,-1],['short117','缺工站數(117)',0,-1],['ot117','加班+追加班次(117)',0,-1]];
const KPI=Object.fromEntries(KPIS.map(k=>[k[0],{name:k[1],dec:k[2],dir:k[3]}]));
const PRICE=()=>{try{return +(localStorage.getItem('nx_price')||23)}catch(e){return 23}};
let CALIB=null;/* price_calib meta：excel.months / c626.months / codes / km_month */
const PRICE_MODE=()=>{try{return localStorage.getItem('nx_price_mode')||'auto'}catch(e){return 'auto'}};
const CODES626=()=>{try{return JSON.parse(localStorage.getItem('nx_626_codes')||'["S176"]')}catch(e){return ['S176']}};
function price626(ym){if(!CALIB?.c626?.months?.[ym]||!CALIB.km_month?.[ym])return null;const m=CALIB.c626.months[ym];const cost=CODES626().reduce((a,c)=>a+((m[c]||[0,0])[0]),0);return cost&&CALIB.km_month[ym]?cost/CALIB.km_month[ym]:null}
/* 某天用的單價：手動 → 固定；自動 → 該月 Excel 單價 → 該月 626 單價 → 最近一個有 Excel 的月 → 手動值 */
function priceFor(ymd){const manual=PRICE();if(PRICE_MODE()==='manual'||!CALIB)return {price:manual,src:'手動'};const ym=ymd.slice(0,6);const ex=CALIB.excel?.months?.[ym];if(ex?.price&&ex.days>=10)return {price:ex.price,src:'Excel '+ym.slice(0,4)+'-'+ym.slice(4)};const p6=price626(ym);if(p6)return {price:p6,src:'626 '+ym.slice(0,4)+'-'+ym.slice(4)};const exm=Object.entries(CALIB.excel?.months||{}).filter(([k,v])=>v.price&&v.days>=10&&k<=ym).sort().pop();if(exm)return {price:exm[1].price,src:'Excel '+exm[0].slice(0,4)+'-'+exm[0].slice(4)+'（沿用）'};return {price:manual,src:'手動'}}
/* ---- 外觀 ---- */
try{const t=localStorage.getItem('nx_theme');if(t)document.documentElement.dataset.theme=t}catch(e){}
function toggleTheme(){const cur=document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');const nxt=cur==='dark'?'light':'dark';document.documentElement.dataset.theme=nxt;try{localStorage.setItem('nx_theme',nxt)}catch(e){}}
/* ---- 登入 ---- */
let AUTH=null;try{AUTH=JSON.parse(localStorage.getItem('nx_auth')||'null')}catch(e){}
function setAuth(a){AUTH=a;try{a?localStorage.setItem('nx_auth',JSON.stringify(a)):localStorage.removeItem('nx_auth')}catch(e){}}
async function api(body){const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,token:AUTH?.token})});const j=await r.json().catch(()=>({error:'回應解析失敗'}));if(!r.ok){if(r.status===401&&body.action!=='login'){setAuth(null);location.reload()}throw new Error(j.error||('HTTP '+r.status))}return j}
function showLogin(){document.body.innerHTML=`<div id="login"><form class="login-card" id="loginForm"><h1>運務資料中樞</h1><p>新竹物流 運務處 · 每日運行狀況剖析 / 班次工具 / 資料倉</p><label>帳號</label><input id="liEmp" type="text" autocomplete="username" inputmode="numeric" required><label>密碼</label><input id="liPw" type="password" autocomplete="current-password" required><div class="err" id="liErr"></div><button class="pri" id="liBtn" style="width:100%;margin-top:6px">登入</button></form></div>`;
 $('#loginForm').addEventListener('submit',async ev=>{ev.preventDefault();$('#liErr').textContent='';$('#liBtn').disabled=true;try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',emp:$('#liEmp').value.trim(),pass:$('#liPw').value})});const j=await r.json();if(!r.ok)throw new Error(j.error||'登入失敗');setAuth({token:j.token,name:j.name,emp:$('#liEmp').value.trim()});location.reload()}catch(e){$('#liErr').textContent=e.message}finally{$('#liBtn').disabled=false}})}
/* ---- 導覽外框 ---- */
const NAV=[['index.html','總覽'],['day.html','當日快照'],['trend.html','趨勢'],['cut.html','減開清單'],['merge.html','併櫃模擬'],['ot.html','加班檢核'],['review.html','決策回看'],['station.html','站所'],['trip.html','班次'],['data.html','資料倉'],['price.html','單價校正'],['status.html','更新狀態'],['docs.html','文件']];
function shell(active){if(!AUTH?.token){showLogin();return false}
 const page=location.pathname.split('/').pop()||'index.html';const hdr=document.createElement('header');hdr.className='top';
 hdr.innerHTML=`<a class="brand" href="index.html">運務資料中樞</a><nav>${NAV.map(([h,n])=>`<a href="${h}" class="${(active||page)===h?'on':''}">${n}</a>`).join('')}</nav><span class="sp"></span><span class="badge" id="syncBadge">—</span><button id="themeBtn" title="深淺色">◐</button><button id="logoutBtn">登出</button>`;
 document.body.prepend(hdr);$('#themeBtn').onclick=toggleTheme;$('#logoutBtn').onclick=()=>{setAuth(null);sessionStorage.clear();location.href='index.html'};
 api({action:'meta',k:'sync'}).then(j=>{if(j.v)$('#syncBadge').textContent='資料同步 '+j.v.at.slice(5,16).replace('T',' ')}).catch(()=>{});return true}
/* ---- KPI 資料（sessionStorage 快取 10 分鐘） ---- */
let ROWS=[],BY={};
async function loadRows(){let rows=null;try{const c=JSON.parse(sessionStorage.getItem('nx_kpi')||'null');if(c&&Date.now()-c.t<600000)rows=c.rows}catch(e){}
 if(!rows){const j=await api({action:'kpi'});rows=j.rows;try{sessionStorage.setItem('nx_kpi',JSON.stringify({t:Date.now(),rows}))}catch(e){}}
 if(!CALIB){try{const c=JSON.parse(sessionStorage.getItem('nx_calib')||'null');if(c&&Date.now()-c.t<600000)CALIB=c.v}catch(e){}if(!CALIB){try{const j=await api({action:'meta',k:'price_calib'});CALIB=j.v||{};try{sessionStorage.setItem('nx_calib',JSON.stringify({t:Date.now(),v:CALIB}))}catch(e){}}catch(e){CALIB={}}}}
 ROWS=rows.map(r=>({day:r.day.replace(/-/g,''),dow:r.dow,...r.data})).filter(r=>r.km_act);
 ROWS.forEach(r=>{if(r.arrive_judged)r.arrive_ontime_rate=r.arrive_ontime/r.arrive_judged*100;const pr=priceFor(r.day);r.price=pr.price;r.price_src=pr.src;if(r.pieces&&r.km_act)r.est_cost=r.km_act*pr.price/r.pieces});
 /* 假日偵測：平日件數低於同星期中位數一半 → 視為假日/低量日，不納入基準 */
 const med={};'一二三四五'.split('').forEach(w=>{const v=ROWS.filter(r=>r.dow===w&&r.pieces).map(r=>r.pieces).sort((a,b)=>a-b);med[w]=v.length?v[Math.floor(v.length/2)]:null});ROWS.forEach(r=>{r.holiday='一二三四五'.includes(r.dow)&&med[r.dow]&&r.pieces!=null&&r.pieces<med[r.dow]*0.5});BY=Object.fromEntries(ROWS.map(r=>[r.day,r]));return ROWS}
function baseline(day,weeks=4){const r=BY[day];if(!r)return [];const i=ROWS.indexOf(r);return ROWS.slice(Math.max(0,i-7*weeks),i).filter(x=>x.dow===r.dow&&!x.holiday)}
function delta(v,b){if(v==null||b==null||!b)return null;return (v-b)/b*100}
function arrow(k,v,b,dec){const p=delta(v,b);if(p==null)return '';const dir=KPI[k]?.dir??-1;const good=dir===0?'':(p*dir>0?'down':'up');return `<span class="${good}">${p>0?'▲':'▼'}${Math.abs(p).toFixed(1)}%</span> <span class="muted">vs ${fmt(b,dec)}</span>`}
function tile(k,v,b,big,sub){const m=KPI[k]||{name:k,dec:0};return `<div class="tile ${big?'big':''}"><div class="k">${m.name}</div><div class="v">${fmt(v,m.dec)}</div><div class="d">${arrow(k,v,b,m.dec)}${sub?' <span class="muted">'+sub+'</span>':''}</div></div>`}
/* ---- 差異歸因：每千件里程 = 里程/件數 ---- */
function attribution(day){const d=BY[day];const base=baseline(day);if(!d||!base.length||!d.pieces)return null;const b={};['km_act','km_empty_box','km_empty_head','km_loaded','pieces','km_per_kpiece','ot_total','seal_ot','low55_n','idle_trips','idle_km','empty_rate','est_cost'].forEach(k=>b[k]=avgOf(base,k));
 if(!b.pieces||!b.km_act)return null;const p=d.pieces,pb=b.pieces;const e=(d.km_empty_box||0)+(d.km_empty_head||0),eb=(b.km_empty_box||0)+(b.km_empty_head||0);const l=d.km_loaded||0,lb=b.km_loaded||0;
 const total=d.km_per_kpiece-b.km_per_kpiece;const vol=b.km_act*(1/p-1/pb)*1000;const empty=(e-eb)/p*1000;const loaded=(l-lb)/p*1000;const resid=total-vol-empty-loaded;
 return {total,vol,empty,loaded,resid,base:b,price:d.price||PRICE(),pieces:p}}
/* ---- 自動結論句 ---- */
function briefing(day){const d=BY[day];if(!d)return [];const base=baseline(day);const out=[];const b=k=>avgOf(base,k);const pct=(k)=>delta(d[k],b(k));const s=(x,dec=0)=>fmt(x,dec);
 if(d.holiday)out.push(`<b>${iso(day)}（${d.dow}）件數只有同星期中位數的一半以下，判定為假日／低量日</b>；以下比較僅供參考，基準已排除這類日子。`);const dk=pct('km_per_kpiece');if(d.km_per_kpiece!=null&&dk!=null)out.push(`${iso(day)}（${d.dow}）每千件里程 <b>${s(d.km_per_kpiece,1)} km</b>，${dk>=0?'高於':'低於'}前 4 週同星期 <b>${Math.abs(dk).toFixed(1)}%</b>${d.est_cost?`；估算幹線運輸件成本 <b>${s(d.est_cost,2)} 元/件</b>（單價 ${fmt(d.price,2)} 元/km，${d.price_src}）`:''}。`);
 const a=attribution(day);if(a){const parts=[['件數',a.vol],['空駛里程',a.empty],['重櫃里程',a.loaded]].sort((x,y)=>Math.abs(y[1])-Math.abs(x[1]));out.push(`差異主要來自<b>${parts[0][0]}</b>（${parts[0][1]>0?'+':''}${parts[0][1].toFixed(1)} km/千件）${Math.abs(parts[1][1])>0.5?`，其次<b>${parts[1][0]}</b>（${parts[1][1]>0?'+':''}${parts[1][1].toFixed(1)}）`:''}。`)}
 const drv=[];const po=pct('ot_total'),pl=pct('low55_n'),pi=pct('idle_trips'),pe=d.empty_rate!=null&&b('empty_rate')!=null?d.empty_rate-b('empty_rate'):null;
 if(po!=null&&Math.abs(po)>=15)drv.push(`加班台數 ${s(d.ot_total)}（${po>0?'多':'少'} ${Math.abs(po).toFixed(0)}%）`);if(pl!=null&&Math.abs(pl)>=15)drv.push(`低載櫃 ${s(d.low55_n)}（${pl>0?'多':'少'} ${Math.abs(pl).toFixed(0)}%）`);if(pi!=null&&Math.abs(pi)>=15)drv.push(`空櫃班次 ${s(d.idle_trips)}（${pi>0?'多':'少'} ${Math.abs(pi).toFixed(0)}%）`);if(pe!=null&&Math.abs(pe)>=1)drv.push(`空駛率 ${s(d.empty_rate,1)}%（${pe>0?'高':'低'} ${Math.abs(pe).toFixed(1)} 點）`);
 if(drv.length)out.push(`驅動指標明顯偏離：${drv.join('、')}。`);else if(d.ot_total!=null)out.push(`加班、低載、空櫃、空駛四個驅動指標都在同星期常態範圍內。`);
 if(d.arrive_ontime_rate!=null){const pa=d.arrive_ontime_rate-(b('arrive_ontime_rate')||0);out.push(`到著準點率 ${s(d.arrive_ontime_rate,1)}%（${pa>=0?'+':''}${pa.toFixed(1)} 點）${d.unload_med_min?`，卸時中位 ${s(d.unload_med_min)} 分`:''}。`)}
 return out}
/* ---- 趨勢結論句 ---- */
function insight(k,list){const m=KPI[k];const v=list.filter(r=>r[k]!=null);if(v.length<6)return '資料不足。';const last=v[v.length-1];const recent=v.slice(-7),prev=v.slice(-14,-7);const ar=avgOf(recent,k),ap=avgOf(prev,k);const mn=v.reduce((a,b)=>b[k]<a[k]?b:a),mx=v.reduce((a,b)=>b[k]>a[k]?b:a);
 let s=`${m.name}：最近 7 天平均 <b>${fmt(ar,m.dec)}</b>`;if(ap!=null){const p=(ar-ap)/ap*100;s+=`，比前 7 天${p>=0?'高':'低'} <b>${Math.abs(p).toFixed(1)}%</b>${m.dir?((p*m.dir>0)?'（往好的方向）':'（往壞的方向）'):''}`}
 s+=`；期間最高 ${fmt(mx[k],m.dec)}（${iso(mx.day).slice(5)} ${mx.dow}）、最低 ${fmt(mn[k],m.dec)}（${iso(mn.day).slice(5)} ${mn.dow}）；最新 ${iso(last.day)} 為 ${fmt(last[k],m.dec)}。`;return s}
/* ---- SVG 圖 ---- */
function chart(el,list,series,opt={}){if(typeof el==='string')el=$(el);const W=opt.w||680,H=opt.h||240,L=52,R=series.some(s=>s.axis==='r')?52:12,T=14,B=30;const n=list.length;if(!n){el.innerHTML='<p class="note">無資料</p>';return}
 const x=i=>L+(W-L-R)*(n===1?0.5:i/(n-1));const ax={l:{min:Infinity,max:-Infinity},r:{min:Infinity,max:-Infinity}};
 series.forEach(s=>{list.forEach(r=>{const v=r[s.k];if(v!=null&&!isNaN(v)){const a=ax[s.axis||'l'];a.min=Math.min(a.min,v);a.max=Math.max(a.max,v)}if(s.band){const lo=r[s.band[0]],hi=r[s.band[1]];const a=ax[s.axis||'l'];if(lo!=null)a.min=Math.min(a.min,lo);if(hi!=null)a.max=Math.max(a.max,hi)}})});
 for(const a of Object.values(ax)){if(a.min===Infinity){a.min=0;a.max=1}if(opt.zero!==false)a.min=Math.min(a.min,0);if(a.max===a.min)a.max=a.min+1;const pad=(a.max-a.min)*.08;a.max+=pad;if(a.min<0||opt.zero===false)a.min-=pad}
 const y=(v,s)=>{const a=ax[s];return T+(H-T-B)*(1-(v-a.min)/(a.max-a.min))};let g=`<svg class="ch" viewBox="0 0 ${W} ${H}">`;
 for(let k=0;k<=4;k++){const v=ax.l.min+(ax.l.max-ax.l.min)*k/4;const yy=y(v,'l');g+=`<line class="axis" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text class="lbl" x="${L-4}" y="${yy+3}" text-anchor="end">${fmt(v,Math.abs(v)<10?1:0)}</text>`;if(R>12){const vr=ax.r.min+(ax.r.max-ax.r.min)*k/4;g+=`<text class="lbl" x="${W-R+4}" y="${yy+3}">${fmt(vr,Math.abs(vr)<10?1:0)}</text>`}}
 list.forEach((r,i)=>{if(r.dow==='六'||r.dow==='日')g+=`<rect x="${x(i)-(W-L-R)/n/2}" y="${T}" width="${(W-L-R)/n}" height="${H-T-B}" fill="var(--grey)" opacity=".10"/>`;if(i%Math.ceil(n/8)===0||i===n-1)g+=`<text class="lbl" x="${x(i)}" y="${H-B+12}" text-anchor="middle">${r.day.slice(4,6)}/${r.day.slice(6)}</text>`});
 series.filter(s=>s.band).forEach(s=>{const a=s.axis||'l';let top='',bot=[];list.forEach((r,i)=>{const lo=r[s.band[0]],hi=r[s.band[1]];if(lo==null||hi==null)return;top+=(top?'L':'M')+x(i)+','+y(hi,a);bot.push(x(i)+','+y(lo,a))});if(top)g+=`<path d="${top} L${bot.reverse().join(' L')} Z" fill="var(--band)" stroke="none"/>`});
 const bars=series.filter(t=>t.type==='bar');series.forEach(s=>{const a=s.axis||'l';if(s.type==='bar'){const bw=Math.max(2,(W-L-R)/n*.6/bars.length);const bi=bars.indexOf(s);list.forEach((r,i)=>{const v=r[s.k];if(v==null||isNaN(v))return;const y0=y(0,a),y1=y(v,a);g+=`<rect x="${x(i)-bw*bars.length/2+bi*bw}" y="${Math.min(y0,y1)}" width="${bw}" height="${Math.abs(y0-y1)}" fill="${s.c}" opacity=".85"><title>${iso(r.day)}(${r.dow}) ${s.n}: ${fmt(v,1)}</title></rect>`})}
 else if(s.type!=='band'){let p='',pen=false;list.forEach((r,i)=>{const v=r[s.k];if(v==null||isNaN(v)){pen=false;return}p+=(pen?'L':'M')+x(i)+','+y(v,a);pen=true});g+=`<path d="${p}" fill="none" stroke="${s.c}" stroke-width="${s.w||1.8}" ${s.dash?'stroke-dasharray="4 3"':''}/>`;if(!s.nodots)list.forEach((r,i)=>{const v=r[s.k];if(v==null||isNaN(v))return;g+=`<circle cx="${x(i)}" cy="${y(v,a)}" r="${n>60?1.6:2.6}" fill="${s.c}"><title>${iso(r.day)}(${r.dow}) ${s.n}: ${fmt(v,1)}</title></circle>`})}});
 g+='</svg>';el.innerHTML=g+'<div class="legend">'+series.map(s=>`<span><i style="background:${s.band?'var(--band)':s.c}"></i>${s.n}${s.axis==='r'?'（右軸）':''}</span>`).join('')+'</div>'}
/* 同星期基準帶：對每天算前 4 週同星期的 min/max/avg */
function withBaseline(list,k){return list.map(r=>{const b=baseline(r.day).map(x=>x[k]).filter(x=>x!=null);return {...r,[k+'_bmin']:b.length?Math.min(...b):null,[k+'_bmax']:b.length?Math.max(...b):null,[k+'_bavg']:b.length?b.reduce((a,c)=>a+c,0)/b.length:null}})}
/* ---- 匯出 ---- */
function dlText(txt,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type}));a.download=name;a.click()}
let XLSX_P=null;function loadXlsx(){if(window.XLSX)return Promise.resolve();if(XLSX_P)return XLSX_P;XLSX_P=new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=res;s.onerror=()=>rej(new Error('無法載入 Excel 套件'));document.head.appendChild(s)});return XLSX_P}
async function exportXlsx(cols,rows,name){try{await loadXlsx();const data=[cols.map(c=>c[1]),...rows.map(r=>cols.map(c=>r[c[0]]??''))];const ws=XLSX.utils.aoa_to_sheet(data);ws['!cols']=cols.map((c,i)=>({wch:Math.min(60,Math.max(8,...data.slice(0,200).map(r=>String(r[i]??'').replace(/[一-鿿]/g,'xx').length+2)))}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'data');XLSX.writeFile(wb,name+'.xlsx')}catch(e){alert(e.message)}}
function parseCsv(txt){const rows=[];let row=[],cell='',q=false;for(let i=0;i<txt.length;i++){const c=txt[i];if(q){if(c==='"'){if(txt[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}else{if(c==='"')q=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else if(c!=='\r')cell+=c}}if(cell!==''||row.length){row.push(cell);rows.push(row)}return rows.filter(r=>r.length>1||(r[0]||'').trim())}
/* ---- 連結輔助 ---- */
const tripLink=(code,text)=>`<a href="trip.html?code=${encodeURIComponent(code)}">${esc(text??code)}</a>`;
const stLink=(st,text)=>{const m=/^(\d{4})/.exec(st||'');return m?`<a href="station.html?code=${m[1]}">${esc(text??st)}</a>`:esc(text??st)};
const dayLink=(d,text)=>`<a href="day.html?d=${d}">${esc(text??iso(d))}</a>`;
