'use strict';
const C=WGCore,STORAGE='wordgrove.v2',LEGACY='wordgrove.v1';
const catalog=globalThis.WG_CATALOG?.words||[];
const $=s=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const zhTitle=source=>String(source||'').includes('automatic')?'自動翻譯，尚未逐句人工校對':'中文翻譯';
const catNames={all:'全部分類',ceec:'官方 6000 字',gsat:'學測常考單字',highfreq:'學測高頻字',custom:'個人單字'};
let state=C.empty(),storageWarning='',page='overview',category='highfreq',level='all',status='all',query='',listPage=0,review=null,quiz=null,reveal=false,bookDate=C.dateKey(Date.now()),editorId=null,toastTimer,exerciseScope='all';
const PAGE_SIZE=40;
const reminderAssetBase=document.currentScript?.src?new URL('.',document.currentScript.src):null;
const COVER_COUNT=9;
let coverIndex=8;
try{if(localStorage.getItem('wordlilium.coverVersion')==='9'){const savedCover=Number(localStorage.getItem('wordlilium.cover'));if(Number.isInteger(savedCover)&&savedCover>=0&&savedCover<COVER_COUNT)coverIndex=savedCover;}else{localStorage.setItem('wordlilium.cover','8');localStorage.setItem('wordlilium.coverVersion','9');}}catch(e){}
function changeCover(step){coverIndex=(coverIndex+step+COVER_COUNT)%COVER_COUNT;try{localStorage.setItem('wordlilium.cover',String(coverIndex));}catch(e){}$('.landing-hero').setAttribute('data-cover',String(coverIndex));$('#coverStatus').textContent=`封面 ${coverIndex+1} / ${COVER_COUNT}`;}

try{
  const stored=localStorage.getItem(STORAGE);
  if(stored){const parsed=JSON.parse(stored);if(!C.validState(parsed))throw Error('新版進度格式無法辨識');state={...parsed,settings:{dailyGoal:10,...parsed.settings}};}
  else{const old=localStorage.getItem(LEGACY);if(old){C.importLegacy(state,JSON.parse(old),catalog);}}
}catch(e){storageWarning='無法讀取已存進度；原資料未被更動。請先匯出原備份或還原有效備份。';}
function applyTheme(theme){
 const dark=theme==='dark';
 document.documentElement.setAttribute('data-theme',dark?'dark':'light');
 const button=$('#themeToggle');
 button.setAttribute('aria-pressed',String(dark));
 button.setAttribute('aria-label',dark?'切換日間模式':'切換深夜模式');
 button.title=dark?'切換日間模式':'切換深夜模式';
 button.querySelector('.theme-symbol').textContent=dark?'☀':'☾';
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',dark?'#141d23':'#244e41');
}
let initialTheme=state.settings.theme;
if(!initialTheme){try{initialTheme=localStorage.getItem('wordlilium.theme');}catch(err){}}
applyTheme(initialTheme);
$('#themeToggle').onclick=()=>{
 const theme=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
 state.settings.theme=theme;applyTheme(theme);
 try{localStorage.setItem('wordlilium.theme',theme);}catch(err){}
 save();
};
const words=()=>C.allWords(catalog,state);
const currentWords=()=>{const list=words().filter(w=>category==='all'||w.categories.includes(category));return category==='highfreq'?list.sort((a,b)=>(b.frequency?.yearCount||0)-(a.frequency?.yearCount||0)||Number((b.level||0)>=3)-Number((a.level||0)>=3)||(b.frequency?.total||0)-(a.frequency?.total||0)):list;};
const findWord=id=>words().find(w=>w.id===id);
const pOf=(w,s)=>C.getProgress(state,w.id,s.id);
const when=due=>{const t=due-Date.now();if(!Number.isFinite(due))return '尚未學習';if(t<=0)return '現在可複習';if(t<3600000)return `${Math.ceil(t/60000)} 分鐘後`;if(t<C.DAY)return `${Math.ceil(t/3600000)} 小時後`;return `${Math.ceil(t/C.DAY)} 天後`;};
const daysLabel=d=>d<1?`${Math.round(d*1440)} 分鐘`:`${d} 天`;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function save(){
  // A failed/corrupt read must never silently overwrite recoverable old progress.
  if(storageWarning){toast('目前處於資料保護模式，請先匯出目前資料，再匯入有效備份。');return false;}
  try{localStorage.setItem(STORAGE,JSON.stringify(state));$('.local-label').innerHTML='<span class="status-dot"></span> 進度保存在這個瀏覽器';return true;}
  catch(e){$('.local-label').textContent='儲存空間不足，請匯出備份';toast('無法儲存進度，請立即匯出備份。');return false;}
}
function stats(){const all=words(),ws=all.map(w=>C.wordState(state,w)),today=state.logs.filter(l=>C.dateKey(l.time)===C.dateKey(Date.now()));const activeDays=new Set(state.logs.map(l=>C.dateKey(l.time)));let d=new Date(),streak=0;if(!activeDays.has(C.dateKey(d)))d.setDate(d.getDate()-1);while(activeDays.has(C.dateKey(d))){streak++;d.setDate(d.getDate()-1);}return {all,learned:ws.filter(w=>w.learned).length,mastered:ws.filter(w=>w.mastered).length,due:ws.filter(w=>w.due).length,today,streak};}
function badges(w){return w.categories.map(c=>`<span class="badge ${c==='gsat'?'mastered':''}">${esc(catNames[c]||c)}</span>`).join(' ');}
function head(eyebrow,title,sub,extra=''){const titles={overview:'學習總覽',review:review?'單字複習':'今日複習',library:'單字庫',cloze:'例句填空',notebooks:'每日單字本',progress:'學習進度'};return `<div class="heading"><h1>${titles[page]||title}</h1>${extra}</div>`;}
function statCards(){const s=stats();return `<div class="stats">${[['單字庫總數',s.all.length,'跨分類重複字只計一次'],['已學習單字',s.learned,'至少完成一個義項的回想'],['已熟記單字',s.mastered,'所有收錄義項皆達 21 天間隔'],['連續學習',s.streak,'依每日完成的回想與填空計算']].map(([t,n,note])=>`<div class="stat"><div class="stat-head">${t}<span>♧</span></div><div class="stat-value">${n}<small>${t==='連續學習'?'天':'個'}</small></div><span class="stat-note" title="${note}" aria-label="${note}">ⓘ</span></div>`).join('')}</div>`;}
function categorySelect(id='category'){return `<select id="${id}" aria-label="字庫分類">${Object.entries(catNames).map(([v,t])=>`<option value="${v}" ${category===v?'selected':''}>${t}</option>`).join('')}</select>`;}
const shortcutInfo={review:['▱','今日複習','回想與新字'],cloze:['Aa','例句填空','用句子練習'],library:['▤','單字庫','査字與字義'],notebooks:['▧','每日單字本','找回學過的字'],progress:['↗','學習進度','看看你的累積']};
let shortcutHistory=[];
try{const h=JSON.parse(localStorage.getItem('wordlilium.shortcuts')||'[]');if(Array.isArray(h))shortcutHistory=h.filter(e=>e&&Object.hasOwn(shortcutInfo,e.page)&&Number.isFinite(e.time)).slice(-200);}catch(err){}
function recordShortcut(next){
 if(next===page||!Object.hasOwn(shortcutInfo,next))return;
 const now=Date.now();shortcutHistory=shortcutHistory.filter(e=>now-e.time<=14*C.DAY&&e.time<=now);
 shortcutHistory.push({page:next,time:now});shortcutHistory=shortcutHistory.slice(-200);
 try{localStorage.setItem('wordlilium.shortcuts',JSON.stringify(shortcutHistory));}catch(err){}
}
function shortcutHTML(compact=false){return C.recentShortcuts(shortcutHistory).map(key=>{const [icon,label,description]=shortcutInfo[key];return `<button class="${compact?'dock-link':'shortcut-card'}" data-action="go" data-go="${key}"><span class="shortcut-icon" aria-hidden="true">${icon}</span><span><strong>${label}</strong>${compact?'':`<small>${description}</small>`}</span>${compact?'':'<span class="shortcut-arrow" aria-hidden="true">↗</span>'}</button>`;}).join('');}
function updateBackToTop(){
 const visible=(window.scrollY||document.documentElement.scrollTop||0)>200;
 const button=$('#backToTop');
 button.setAttribute('data-visible',String(visible));button.setAttribute('aria-hidden',String(!visible));button.tabIndex=visible?0:-1;button.disabled=!visible;
}
function backToTop(){window.scrollTo({top:0,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
document.addEventListener('scroll',updateBackToTop,{passive:true});
updateBackToTop();
let reminderPermissionPending=false,reminderRegistration=null,reminderSending=false;
function reminderDueUnits(now=Date.now()){return C.dueUnits(state,words(),now);}
function refreshReviewReminder(now=Date.now()){
 const due=reminderDueUnits(now),count=new Set(due.map(u=>u.word.id)).size;
 $('#navDue').textContent=count;
 const active=quiz&&(page==='cloze'||page==='review')&&(quiz.checkpoint||quiz.index<quiz.items.length);
 $('#reviewReminder').hidden=!due.length||!!active;
 $('#reviewReminderText').textContent=count?`有 ${count} 個單字到複習時間了。`:'';
 return due;
}
function openDueReview(){category='all';closeDialogs();route('review');}
async function prepareReminderWorker(){
 if(reminderRegistration||!reminderAssetBase||!window.navigator?.serviceWorker||!window.isSecureContext)return;
 try{reminderRegistration=await window.navigator.serviceWorker.register(new URL('reminder-worker.js',reminderAssetBase).href);}catch(e){}
}
async function toggleReviewNotifications(){
 if(reminderPermissionPending)return;
 if(state.settings.reviewNotifications){state.settings.reviewNotifications=false;save();render();toast('已關閉瀏覽器到期通知，站內提醒仍會顯示。');return;}
 if(!window.Notification){toast('此瀏覽器不支援系統通知；仍會顯示站內到期提醒。');return;}
 if(!window.isSecureContext){toast('瀏覽器通知需使用 HTTPS 網站；本機檔案仍提供站內提醒。');return;}
 reminderPermissionPending=true;
 try{
  const permission=window.Notification.permission==='granted'?'granted':await window.Notification.requestPermission();
  if(permission!=='granted'){toast('通知未獲允許；你仍會看到站內到期提醒。');return;}
  state.settings.reviewNotifications=true;save();
  await prepareReminderWorker();render();toast('已開啓到期通知。請保持網站開啓，才能檢査複習時間。');
  await checkReviewReminders();
 }catch(e){toast('目前無法啓用通知；站內提醒仍可使用。');}
 finally{reminderPermissionPending=false;}
}
async function checkReviewReminders(now=Date.now()){
 const due=refreshReviewReminder(now);
 if(!due.length||reminderSending||!state.settings.reviewNotifications||!window.Notification||window.Notification.permission!=='granted')return;
 if(quiz&&(page==='cloze'||page==='review')&&(quiz.checkpoint||quiz.index<quiz.items.length))return;
 let notified={};try{const parsed=JSON.parse(localStorage.getItem('wordlilium.notifiedReviews')||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))notified=parsed;}catch(e){}
 const fresh=due.filter(u=>notified[C.unitKey(u.word.id,u.sense.id)]!==u.due);
 if(!fresh.length)return;
 reminderSending=true;
 try{
  const count=new Set(due.map(u=>u.word.id)).size;
  const options={body:`有 ${count} 個單字到複習時間了，回來做例句填空吧。`,tag:'lilivm-review-due',data:{url:window.location?.href||''}};
  if(reminderRegistration?.active&&reminderRegistration.showNotification)await reminderRegistration.showNotification('Lilivm · 該複習了',options);
  else{const notice=new window.Notification('Lilivm · 該複習了',options);notice.onclick=()=>{window.focus?.();openDueReview();notice.close();};}
  for(const u of due)notified[C.unitKey(u.word.id,u.sense.id)]=u.due;
  // Retain only current, visible overdue cycles, keeping storage bounded.
  const retained={};for(const u of due){const k=C.unitKey(u.word.id,u.sense.id);retained[k]=notified[k];}
  try{localStorage.setItem('wordlilium.notifiedReviews',JSON.stringify(retained));}catch(e){}
 }catch(e){/* Unsupported system notifications fall back to the visible in-page reminder. */}
 finally{reminderSending=false;}
}
function reminderTick(){checkReviewReminders();setTimeout(reminderTick,30000);}
function route(next){recordShortcut(next);page=next;if(typeof window.scrollTo==='function')window.scrollTo({top:0,behavior:'instant'});document.querySelectorAll('.page').forEach(e=>e.classList.toggle('active',e.id===page));document.querySelectorAll('nav [data-page]').forEach(e=>e.classList.toggle('active',e.dataset.page===page));$('#breadcrumb').textContent='你的學習空間 / '+({overview:'學習總覽',review:'今日複習',library:'我的單字庫',cloze:'例句填空',notebooks:'每日單字本',progress:'學習足跡',about:'關於本站'}[page]||'學習總覽');render();}
function render(){document.body.setAttribute('data-view',page);document.body.setAttribute('data-studying',String(page==='review'&&quiz?.source==='review'));const s=stats();$('#navDue').textContent=s.due;$('#todayDate').textContent=new Date().toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'short'});({overview:renderOverview,library:renderLibrary,review:renderReview,cloze:renderCloze,notebooks:renderNotebooks,progress:renderProgress,about:renderAbout}[page]||renderOverview)();refreshReviewReminder();}
function renderAbout(){
 $('#about').innerHTML=`<div class="landing-hero about-hero" data-cover="${coverIndex}"><h1>關於本站</h1></div><article id="aboutArticle" class="about-article" aria-labelledby="aboutTitle"><header class="about-intro"><h1 id="aboutTitle" lang="en">About this website</h1><p>專門背單字的網站，隨時都會消失...</p></header><div class="about-divider" aria-hidden="true">· &nbsp; · &nbsp; ·</div><section aria-labelledby="aboutName"><h2 id="aboutName"><span aria-hidden="true">#</span> Lilivm 的名字由來</h2><p><strong lang="en">Lilivm</strong> 取自拉丁文 <em lang="la">lilium</em>（百合）。將字母 <strong lang="en">U</strong> 改為古典羅馬碑刻常見的 <strong lang="en">V</strong>，讓名稱帶有更簡潔、神祕與時間感的氣質。</p></section><div class="about-divider" aria-hidden="true">· &nbsp; · &nbsp; ·</div><section aria-labelledby="aboutLily"><h2 id="aboutLily"><span aria-hidden="true">#</span> 讓記憶扎根、開花</h2><p>百合象徵純淨、成長與重生；放在背單字網站裡，代表記憶不是強迫堆疊，而是透過每天的複習慢慢扎根、開花。</p><p>簡短的名稱也讓焦點回到學習本身。</p></section></article>`;
}
function renderOverview(){
 const s=stats(),official=catalog.filter(w=>w.categories.includes('ceec')).length,frequent=catalog.filter(w=>w.categories.includes('gsat')).length;
 $('#overview').innerHTML=`<div class="landing-hero" data-cover="${coverIndex}"><div class="landing-center"><h1 lang="en">Lilivm</h1><div class="landing-dock" aria-label="常用功能與封面切換"><button type="button" class="cover-arrow" data-action="cover-prev" aria-label="上一張封面"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>${shortcutHTML(true)}<button type="button" class="cover-arrow" data-action="cover-next" aria-label="下一張封面"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button><span id="coverStatus" class="cover-status" role="status" aria-live="polite">封面 ${coverIndex+1} / ${COVER_COUNT}</span></div></div><button class="scroll-cue" data-action="scroll-home" aria-label="往下査看常用功能"><span>往下探索</span><span aria-hidden="true">↓</span></button></div><div class="home-content" id="homeShortcuts"><div class="home-section-head"><div><p class="section-kicker">YOUR EVERYDAY SPACE</p><h2>從這裡，繼續學習。</h2></div><span>近期常用</span></div><div class="shortcut-grid">${shortcutHTML()}</div><div class="home-section-head learning-head"><h2>你的學習日常</h2><button class="text-btn" data-action="go" data-go="review">${s.due?`${s.due} 字待複習`:'開始今日學習'} →</button></div>${statCards()}<div class="dashboard-grid"><div class="panel"><div class="panel-head"><h2>字庫</h2></div><button class="collection-card" data-action="collection" data-cat="ceec"><span class="collection-icon">▤</span><div><strong>官方 6000 字</strong><p>${official.toLocaleString()} 詞條</p></div><span>→</span></button><button class="collection-card" data-action="collection" data-cat="gsat"><span class="collection-icon">✦</span><div><strong>學測常考</strong><p>${frequent} 詞條</p></div><span>→</span></button><button class="collection-card" data-action="collection" data-cat="highfreq"><span class="collection-icon">↗</span><div><strong>學測高頻字</strong><p>${globalThis.WG_CATALOG?.meta?.highFrequencyCount||0} 詞條 · 優先學習</p></div><span>→</span></button></div><div class="panel"><div class="panel-head"><h2>今日單字本</h2><button class="text-btn" data-action="go" data-go="notebooks">査看 →</button></div>${todayBookHTML()}</div></div><div class="panel backup-panel"><div><h2>學習備份</h2><p>保存進度、單字本與個人單字；匯入時合併現有紀錄。</p></div><div class="button-row"><button class="secondary" data-action="export">匯出紀錄</button><button class="secondary" data-action="import">匯入紀錄</button></div></div><div class="quiet-links"><button class="text-btn" data-action="sources">字庫來源與授權</button><span>常考：近五年試卷至少出現兩年</span></div></div>`;
}
function todayBookHTML(){const b=C.notebooks(state,words()).find(b=>b.date===C.dateKey(Date.now()));return b?`<div class="book-today"><strong>${b.newIds.length}</strong><span>個新字</span><p>複習 ${b.reviewIds.length} 字 · ${b.practices} 次練習</p></div>`:'<div class="empty">尚無紀錄，完成練習後自動建立。</div>';}
function filteredWords(){return currentWords().filter(w=>(level==='all'||String(w.level)===level)&&(!query||C.norm([w.word,...w.senses.map(s=>s.zh)].join(' ')).includes(C.norm(query)))&&(()=>{const p=C.wordState(state,w);return status==='all'||status==='new'&&!p.learned||status==='learning'&&p.learned&&!p.mastered||status==='mastered'&&p.mastered||status==='due'&&p.due;})());}
function rowsHTML(list){return list.map(w=>{const p=C.wordState(state,w);return `<tr><td><button class="word-link" data-action="detail" data-id="${esc(w.id)}">${esc(w.word)}</button><div class="word-brief">${esc(w.senses.slice(0,2).map(s=>s.zh).join('；'))}</div></td><td>${badges(w)}<small class="level-label">${w.level?'L'+w.level:'自訂'} · ${w.senses.length} 個義項</small></td><td><span class="badge ${p.mastered?'mastered':''}">${p.mastered?'已熟記':p.learned?'學習中':'尚未學習'}</span><small class="level-label">已學 ${p.sensesLearned}/${w.senses.length} 義 · ${when(p.next)}</small></td><td><button class="text-btn" data-action="detail" data-id="${esc(w.id)}">査看 →</button></td></tr>`;}).join('');}
function renderLibrary(){const list=filteredWords(),pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));listPage=Math.min(listPage,pages-1);$('#library').innerHTML=head('YOUR GROWING COLLECTION','我的單字庫','依分類、級別及學習狀態整理；點選單字査看不同意思與例句。','<button class="primary" data-action="add">＋ 新增單字</button>')+`<div class="toolbar">${categorySelect()}<input type="search" id="search" aria-label="搜尋英文或中文" placeholder="搜尋單字或中文" value="${esc(query)}"><select id="levelFilter" aria-label="級別">${[['all','所有級別'],...Array.from({length:6},(_,i)=>[String(i+1),`第 ${i+1} 級`])].map(([v,t])=>`<option value="${v}" ${level===v?'selected':''}>${t}</option>`).join('')}</select><select id="statusFilter" aria-label="學習狀態">${[['all','所有狀態'],['new','尚未學習'],['learning','學習中'],['mastered','已熟記'],['due','待複習']].map(([v,t])=>`<option value="${v}" ${status===v?'selected':''}>${t}</option>`).join('')}</select></div><div class="button-row library-actions"><button class="secondary" data-action="export">匯出備份</button><button class="secondary" data-action="import">匯入備份</button>${state.hidden.length?'<button class="text-btn" data-action="restore-hidden">還原隱藏單字</button>':''}</div><div class="panel"><div class="panel-head"><h2>${esc(catNames[category])}</h2><span class="today-number">${list.length.toLocaleString()} 個詞條</span></div><div class="table-wrap"><table><thead><tr><th>單字 / 常用義</th><th>分類與義項</th><th>學習情況</th><th>査看</th></tr></thead><tbody>${rowsHTML(list.slice(listPage*PAGE_SIZE,(listPage+1)*PAGE_SIZE))}</tbody></table>${list.length?'':'<div class="empty">沒有符合的單字，換個條件試試。</div>'}</div><div class="pagination"><button class="secondary" data-action="prev-page" ${listPage===0?'disabled':''}>← 上一頁</button><span>第 ${listPage+1} / ${pages} 頁</span><button class="secondary" data-action="next-page" ${listPage>=pages-1?'disabled':''}>下一頁 →</button></div></div>`;
}
function openDetail(id){const w=findWord(id);if(!w)return;const p=C.wordState(state,w);$('#detailContent').innerHTML=`<div class="dialog-head"><div><span class="eyebrow">ONE WORD, MANY MEANINGS</span><h2 class="detail-word">${esc(w.word)}</h2><div>${badges(w)} <span class="muted">${w.senses.length} 個學習義項</span></div></div><button class="icon-btn" data-action="close-detail" aria-label="關閉字義">×</button></div><div class="button-row detail-actions"><button class="secondary" data-action="review-word" data-id="${esc(w.id)}">練習所有義項</button><button class="secondary" data-action="cloze-word" data-id="${esc(w.id)}">例句填空</button><button class="text-btn" data-action="edit" data-id="${esc(w.id)}">編輯字義與例句</button><button class="text-btn" data-action="hide" data-id="${esc(w.id)}">隱藏單字</button></div>${w.exam?`<p class="import-info">學測出現年度：${w.exam.years.join('、')}；全卷原字形共 ${w.exam.total} 次，包含選項。</p>`:''}<div class="sense-list">${w.senses.map((s,i)=>{const p=pOf(w,s);return `<section class="sense-block"><div class="sense-top"><span class="sense-number">${i+1}</span><div><span class="sense-pos">${esc(s.pos)}${s.term!==w.word?' · '+esc(s.term):''}</span><h3>${esc(s.zh)}</h3></div><span class="badge">${p.stage<0?'尚未學習':when(p.due)}</span></div>${s.explanation?`<details class="extra-info"><summary>字義說明</summary><p class="sense-explanation">${esc(s.explanation)}</p></details>`:''}<ol class="example-list">${s.examples.map(e=>`<li><p lang="en">${esc(e.en)}</p>${e.zh?`<small lang="zh-Hant" title="${zhTitle(e.zhSource)}">${esc(e.zh)}</small>`:''}</li>`).join('')}</ol>${s.examples.length<2?'<p class="content-warning">此個人義項尚未滿兩個例句，可從編輯補齊。</p>':''}<small class="source-note">${esc(s.source||'個人新增')} ${s.sourceUrl?`· <a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">來源 ↗</a>`:''}</small></section>`;}).join('')}</div>${w.personalNotes?.length?`<details><summary>保留的舊版個人筆記</summary>${w.personalNotes.map(n=>`<p>${esc(n.meaning)}<br><span lang="en">${esc(n.example)}</span></p>`).join('')}</details>`:''}`;$('#detailDialog').showModal();}
function renderReview(){
 if(quiz?.source==='review'){renderQuiz();return;}
 const scoped=currentWords(),due=C.dueUnits(state,scoped),newUnits=C.newUnits(state,scoped,state.settings.dailyGoal||10),newWords=new Set(newUnits.map(u=>u.word.id)).size;
 $('#review').innerHTML=head('TIME TO RECALL','每個意思，都值得回想。','不同義項分開複習，記得其中一個意思不會替其他意思自動升級。')+`<div class="toolbar">${categorySelect()}<label class="inline-label">新字數 <input type="number" id="dailyGoal" min="1" max="50" value="${state.settings.dailyGoal||10}"></label></div><div class="review-layout"><div class="panel review-plan"><div class="plan-icon">♧</div><h2>${esc(catNames[category])}</h2><p class="progress-info">待複習 <strong>${due.length}</strong> 義 · 新字 <strong>${newWords}</strong> 個</p><div class="button-row center"><button class="primary" data-action="start-due" ${due.length?'':'disabled'}>開始複習</button><button class="secondary" data-action="start-new" ${newUnits.length?'':'disabled'}>學習新字</button></div></div><p class="hint">依例句填入英文，系統會依答題結果安排下次複習。</p><div class="panel notification-settings"><button type="button" class="secondary" data-action="toggle-review-notifications">${state.settings.reviewNotifications?'關閉到期通知':'開啓到期通知'}</button><p class="hint">網站開啓時提醒；瀏覽器通知需先允許。關閉網站後不會排程推播。</p></div></div>`;
}
function startReview(units){
 const pool=[];
 for(const {word,sense} of units){
  const candidates=sense.examples.map(e=>C.makeCloze(word,sense,e)).filter(Boolean);
  if(candidates.length)pool.push({...candidates[Math.floor(Math.random()*candidates.length)],word,sense});
 }
 if(!pool.length){toast('目前沒有可用於填空複習的例句。');return;}
 startQuiz(pool,{source:'review'});
 if(pool.length<units.length)toast('部分義項尚無可填空例句，已保留原有到期狀態。');
}
function relatedHTML(word,sense){return `<button type="button" class="secondary related-open" data-action="open-related" data-id="${esc(word.id)}" data-sense="${esc(sense.id)}">同義字／易混淆字清單 ↗</button>`;}
function openRelated(id,senseId){
 const word=findWord(id),sense=word?.senses.find(s=>s.id===senseId);if(!word||!sense)return;
 const isQuestion=(page==='cloze'||page==='review')&&quiz&&!quiz.checkpoint&&quiz.index<quiz.items.length&&quiz.items[quiz.index].word.id===id&&!quiz.answered;
 if((page==='cloze'||page==='review')&&quiz&&(quiz.checkpoint?!quiz.checkpoint.answered:quiz.index<quiz.items.length&&!quiz.answered))return;
 const data=C.synonymData(word,sense),related=C.relatedWords(word,sense,words(),8);
 const forbidden=[sense.term||word.word,...(sense.forms||[])].map(C.norm).filter(Boolean);
 const hide=text=>isQuestion?forbidden.sort((a,b)=>b.length-a.length).reduce((out,term)=>out.replace(new RegExp('(?<![A-Za-z])'+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![A-Za-z])','gi'),'________'),String(text)):String(text);
 const groups=data.groups;
 let rows=groups.flatMap(g=>g.terms.filter(t=>t.example?.en).map(t=>({term:t.word,zh:g.zh||t.zh,meaning:g.gloss,pos:g.pos,id:t.id,zhSource:g.zhSource||t.zhSource,example:t.example,source:'OEWN'})));
 for(const x of related.synonyms){
  if(rows.some(r=>C.norm(r.term)===C.norm(x.word.word)))continue;
  const meaning=x.meaning.replace(/[的；，、]/g,'');
  const matched=x.word.senses.find(s=>C.normalizePOS(s.pos)===C.normalizePOS(sense.pos)&&((s.zh||'').includes(meaning)||meaning.length>=2&&(s.zh||'').includes(meaning.slice(0,2)))&&s.examples?.[0]?.en);
  if(matched)rows.unshift({term:x.word.word,zh:x.meaning,meaning:'常見近義用法，請配合語境比較。',pos:sense.pos,id:x.word.id,example:matched.examples[0],source:'整理'});
 }
 // Hide the target word even when it is part of a multiword synonym.
 if(isQuestion)rows=rows.filter(r=>hide(r.term)===r.term);
 const table=rows.length?`<div class="table-wrap synonym-table"><table><thead><tr><th>同義／近義字</th><th>詞性</th><th>本義與用法</th><th>例句</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span lang="en">${esc(r.term)}</span>${!isQuestion&&r.id?`<button class="text-btn" data-action="detail" data-id="${esc(r.id)}">査看 ↗</button>`:''}</td><td>${esc(r.pos)}</td><td>${r.zh?`<span lang="zh-Hant" title="${zhTitle(r.zhSource)}">${esc(hide(r.zh))}</span>`:''}<small lang="en">${esc(hide(r.meaning))}</small></td><td class="synonym-example"><p lang="en">${esc(hide(r.example.en))}</p>${r.example.zh?`<small lang="zh-Hant" title="${zhTitle(r.example.zhSource)}">${esc(hide(r.example.zh))}</small>`:''}</td></tr>`).join('')}</tbody></table></div>`:`<p class="empty">${data.status==='no_entry'?'此詞未收錄於同義字來源。':data.groups.length?'此義項的同義字尚無合適例句，暫不列出。':'此詞性目前査無可列出的同義字，不勉強配對。'}</p>`;
 $('#relatedContent').innerHTML=`<div class="dialog-head"><div><h2>${isQuestion?'本題同義字清單':esc(word.word)+' · 同義字清單'}</h2></div><button class="icon-btn" data-action="close-related" aria-label="關閉同義字清單">×</button></div><p class="import-info">附中文釋義與例句翻譯；自動翻譯請搭配英文核對。近義字不一定能直接換進本句。${isQuestion?'本次査看計入提示。':''}</p>${table}<h3 class="related-subhead">易混淆／拼字相近</h3><div class="confusable-list">${related.confusables.map(x=>`<div><strong lang="en">${esc(x.word.word)}</strong><span>${esc(x.meaning)}</span><p class="confusable-example" lang="en">${esc(hide(x.word.senses[0].examples[0].en))}</p>${x.word.senses[0].examples[0].zh?`<small lang="zh-Hant" title="${zhTitle(x.word.senses[0].examples[0].zhSource)}">${esc(hide(x.word.senses[0].examples[0].zh))}</small>`:''}<small>${esc(x.relation)}</small></div>`).join('')||'<p class="import-info">暫無比較字。</p>'}</div><p class="source-note">同義群組：Open English WordNet 2025（CC BY 4.0）；例句另含 Open Dictionary／Wiktionary（CC BY-SA 4.0）與補寫。<a href="https://en-word.net/downloads" target="_blank" rel="noopener">來源</a></p>`;
 $('#relatedDialog').showModal();
}
let clozeCache={key:'',pool:[]};
function exerciseWords(){return currentWords().filter(w=>exerciseScope==='all'||exerciseScope==='learned'&&C.wordState(state,w).learned||exerciseScope==='due'&&C.wordState(state,w).due);}
function getPool(){const list=exerciseWords(),key=[category,exerciseScope,list.map(w=>w.id+':'+w.senses.map(s=>s.examples.map(e=>e.en).join('|')).join(';')).join(',')].join('/');if(clozeCache.key!==key)clozeCache={key,pool:C.questions(list)};return clozeCache.pool;}
function startQuiz(pool,options={}){if(!pool.length){toast('這個範圍目前沒有可填空的例句，請換個範圍。');return;}const copy=[...pool];for(let i=options.source==='review'?0:copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}quiz={source:options.source||'cloze',items:options.source==='review'?copy:copy.slice(0,10),index:0,correct:0,answered:false,hinted:false,hintLevel:0,lastAnswer:'',wasCorrect:false,answerKind:'',mistakes:[],attempts:0,retrying:false,firstKind:'',firstAnswer:'',checkpoint:null};review=options.source==='review'?quiz:null;closeDialogs();route(quiz.source==='review'?'review':'cloze');}
function renderCloze(){if(quiz&&quiz.source!=='review'){renderQuiz();return;}const pool=getPool();$('#cloze').innerHTML=head('FROM MEANING TO SENTENCE','例句填空，寫出英文。','根據中文義項與句子，填入符合文法的英文單字或字形。')+`<div class="toolbar">${categorySelect()}<select id="exerciseScope" aria-label="填空範圍">${[['all','全部單字'],['learned','已學習單字'],['due','到期單字']].map(([v,t])=>`<option value="${v}" ${exerciseScope===v?'selected':''}>${t}</option>`).join('')}</select></div><div class="review-layout"><div class="panel review-plan"><div class="plan-icon">Aa</div><h2>${esc(catNames[category])}</h2><p class="progress-info">每回合 10 題 · ${pool.length.toLocaleString()} 個例句</p><button class="primary" data-action="start-quiz" ${pool.length?'':'disabled'}>開始填空 →</button></div><p class="hint">每 5 題複習一次，結束後再複習整回合。</p></div>`;}
function renderQuiz(){const q=quiz.checkpoint||quiz,target=quiz.source==='review'?'#review':'#cloze';if(q.index>=q.items.length){$(target).innerHTML=head('PRACTICE MAKES MEMORY','填空練習完成了。','完成的單字已記錄到今日單字本。')+`<div class="review-layout"><div class="flashcard"><div class="summary-check">✓</div><h2 class="summary-title">答對 ${q.correct} / ${q.items.length} 題</h2><p class="prompt">${q.mistakes.length?`${q.mistakes.length} 題待加強 · 已排入複習`:'本回合全部答對！'}</p><div class="button-row center">${q.mistakes.length?'<button class="primary" data-action="quiz-mistakes">再練錯題 →</button>':''}<button class="secondary" data-action="quiz-finish">${quiz.source==='review'?'回到今日複習':'選擇練習範圍'}</button><button class="secondary" data-action="go" data-go="notebooks">査看今日單字本</button></div></div></div>`;return;}
const item=q.items[q.index];$(target).innerHTML=head('RECALL THE WORD','讓句子，喚醒你的記憶。','依原句填入英文；同一單字可能使用不同字形。','<button class="text-btn" data-action="end-quiz">結束填空 ×</button>')+`<div class="review-layout"><div class="session-top"><span>${quiz.checkpoint?(q.final?'整回合填空複習':'前 5 題填空複習'):quiz.source==='review'?'今日複習 · 例句填空':'英文例句填空'}</span><span>${q.index+1} / ${q.items.length}</span></div><div class="progress-track"><div class="progress-fill" style="width:${q.index/q.items.length*100}%"></div></div><div class="panel quiz-card"><span class="sense-pos">${esc(item.sense.pos)}</span><h2>${esc(item.sense.zh)}</h2><p class="cloze-sentence" lang="en">${esc(item.text)}</p><form id="answerForm"><label for="answerInput">英文答案</label><input type="text" id="answerInput" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="你的答案…" value="${esc(q.lastAnswer)}" ${q.answered?'disabled':''}><div class="button-row"><button class="primary" type="submit" ${q.answered?'disabled':''}>${q.retrying?'再次檢査':'檢査答案'}</button><button type="button" class="text-btn" data-action="quiz-hint" ${q.answered||q.hintLevel>=2?'disabled':''}>${q.hintLevel>=2?'提示已顯示':q.hintLevel===1?'提示結尾':'提示開頭'}</button><button type="button" class="text-btn" data-action="quiz-reveal" ${q.answered?'disabled':''}>我忘記了</button></div></form>${q.hintLevel>0&&!q.answered?`<p class="hint" role="status" aria-live="polite">開頭：<span lang="en">${esc(item.answer.trim()[0])}…</span>${q.hintLevel>=2?`　結尾：<span lang="en">…${esc(item.answer.trim().slice(-1))}</span>`:''}</p>`:''}${q.retrying&&!q.answered?`<div class="retry-feedback" role="alert"><strong>應該有更好的解答，再試一次。</strong><p>${retryHint(q.answerKind,item.sense.pos)}</p><small>還有一次機會 · 答案尚未揭曉</small></div>`:''}${q.answered?`<div class="answer-feedback ${q.wasCorrect?'correct':'incorrect'}" role="status" aria-live="polite"><strong>${q.wasCorrect?'答對了！':q.answerKind==='verb-form'?'單字選對了，請注意時態或動詞變化！':q.answerKind==='spelling'?'拼字很接近，再看一下字母順序。':'記住這個答案，再練一次。'}</strong>${q.answerKind==='verb-form'?`<p>你填的是 <span lang="en">${esc(q.lastAnswer)}</span>；本題依原句需用 <span lang="en">${esc(item.answer)}</span>。</p>`:!q.wasCorrect&&q.lastAnswer?`<p>你的答案：<span lang="en">${esc(q.lastAnswer)}</span></p>`:''}<p>原句答案：<span lang="en">${esc(item.answer)}</span></p><p lang="en">${esc(item.original)}</p><button class="text-btn" data-action="speak" data-word="${esc(item.original)}" aria-label="播放完整例句">♪ 聽例句</button>${item.translation?`<small lang="zh-Hant" title="${zhTitle(item.translationSource)}">${esc(item.translation)}</small>`:''}${q.firstKind==='synonym'||q.answerKind==='synonym'?'<p class="import-info">本題練習原句用字；近義字是否適用，仍需看詞義與搭配。</p>':''}</div><div class="button-row quiz-learning-actions">${relatedHTML(item.word,item.sense)}<button type="button" class="secondary" data-action="detail" data-id="${esc(item.word.id)}">査看單字庫例句 ↗</button></div><button class="primary" data-action="quiz-next">${quiz.checkpoint?(q.index===q.items.length-1?(q.final?'査看結果':'繼續第 6 題'):'下一題'):q.index===q.items.length-1?(quiz.source==='review'?'査看結果':'整回合複習'):q.index===4&&quiz.source!=='review'?'複習前 5 題':'下一題'} →</button>`:''}</div></div>`;
if(!q.answered)$('#answerInput').focus();}
function resetQuizAnswer(){Object.assign(quiz,{answered:false,hinted:false,hintLevel:0,lastAnswer:'',answerKind:'',attempts:0,retrying:false,firstKind:'',firstAnswer:''});}
function nextQuizQuestion(){
 if(quiz?.checkpoint){nextQuizRecap();return;}
 if(!quiz||!quiz.answered)return;
 quiz.index++;resetQuizAnswer();
 if(quiz.index>=quiz.items.length&&quiz.source!=='review')beginQuizRecap(true,quiz.items.length);
 else if(quiz.index===5&&quiz.source!=='review')beginQuizRecap(false,5);
 render();
}
function beginQuizRecap(final,count){
 if(!quiz||!count)return;
 closeDialogs();quiz.checkpoint={items:quiz.items.slice(0,count),index:0,final,correct:0,answered:false,hinted:false,hintLevel:0,lastAnswer:'',wasCorrect:false,answerKind:'',mistakes:[],attempts:0,retrying:false,firstKind:'',firstAnswer:''};
}
function nextQuizRecap(){
 const r=quiz?.checkpoint;if(!r||!r.answered)return;
 r.index++;Object.assign(r,{answered:false,hinted:false,hintLevel:0,lastAnswer:'',wasCorrect:false,answerKind:'',attempts:0,retrying:false,firstKind:'',firstAnswer:''});
 if(r.index>=r.items.length){if(r.final)quiz.index=quiz.items.length;quiz.checkpoint=null;}
 render();
}
function endQuizWithRecap(){
 if(!quiz)return;
 if(quiz.source==='review'){quiz=null;review=null;closeDialogs();route('review');return;}
 if(quiz.checkpoint){quiz=null;closeDialogs();route('cloze');return;}
 const count=Math.min(quiz.items.length,quiz.index+(quiz.answered?1:0));
 if(!count){quiz=null;route('cloze');return;}
 quiz.items=quiz.items.slice(0,count);resetQuizAnswer();beginQuizRecap(true,count);render();
}
function giveClozeHint(){
 if(!quiz)return;
 const q=quiz.checkpoint||quiz;
 if(q.answered||q.hintLevel>=2||q.index>=q.items.length)return;
 q.hintLevel=(q.hintLevel||0)+1;q.hinted=true;q.lastAnswer=$('#answerInput').value;
 renderQuiz();
}
function retryHint(kind,pos){
 if(kind==='word-family'||kind==='word-form'||kind==='verb-form'){const label=({noun:'名詞',verb:'動詞',adj:'形容詞',adv:'副詞'})[C.normalizePOS(pos)]||'符合句意的字形';return `方向接近，請檢査詞性與字形；本題需要${label}。`;}
 if(kind==='synonym')return '這個字有近義用法，試試更貼近原句搭配的用字。';
 if(kind==='spelling')return '拼字接近了，請再檢査字母與順序。';
 return '再看一次句意、詞性和前後搭配。';
}
function checkAnswer(forceWrong=false){
 if(!quiz)return;
 const q=quiz.checkpoint||quiz;
 if(q.answered||q.index>=q.items.length)return;
 const item=q.items[q.index],input=$('#answerInput').value;
 if(!forceWrong&&!input.trim()){toast('請先填入英文，或選擇「我忘記了」。');return;}
 if(!forceWrong&&q.retrying&&C.norm(input)===C.norm(q.firstAnswer)){toast('修改答案後，再試一次。');return;}
 const result=forceWrong?{correct:false,kind:'revealed'}:C.evaluateCloze(item,input);
 q.lastAnswer=input;q.attempts++;q.wasCorrect=result.correct;q.answerKind=result.kind;
 if(!forceWrong&&!result.correct&&q.attempts===1){q.retrying=true;q.firstKind=result.kind;q.firstAnswer=input;renderQuiz();return;}
 q.answered=true;q.retrying=false;
 if(result.correct)q.correct++;
 if(!result.correct||q.attempts>1){q.mistakes.push(item);if(quiz.checkpoint&&!quiz.mistakes.includes(item))quiz.mistakes.push(item);}
 C.rate(state,item.word,item.sense,result.correct?(q.hinted||q.attempts>1?'hard':'good'):'again','cloze');
 save();render();
}
function renderNotebooks(){const all=words(),books=C.notebooks(state,all),b=books.find(b=>b.date===bookDate),today=C.dateKey(Date.now());$('#notebooks').innerHTML=head('YOUR DAILY WORD JOURNAL','每天的單字，都有自己的頁面。','首次完成練習的單字歸入當日新字；之後再次練習記在當日複習字，不會重複算成新字。')+`<div class="notebook-layout"><div class="panel notebook-dates"><label>選擇學習日期<input type="date" id="bookDate" value="${bookDate}" max="${today}"></label>${books.slice(0,90).map(x=>`<button class="book-date ${x.date===bookDate?'selected':''}" data-action="book-date" data-date="${x.date}"><strong>${x.date}</strong><span>新字 ${x.newIds.length} · 複習 ${x.reviewIds.length}</span></button>`).join('')||'<p class="import-info">完成練習後自動建立。</p>'}</div><div class="panel"><div class="panel-head"><h2>${bookDate} 單字本</h2><span class="today-number">${b?.practices||0} 次練習</span></div>${b?`<div class="book-summary"><span>新字 <strong>${b.newIds.length}</strong></span><span>複習 <strong>${b.reviewIds.length}</strong></span><span>填空 <strong>${b.cloze}</strong></span></div><div class="button-row"><button class="secondary" data-action="review-book" data-kind="new" ${b.newIds.length?'':'disabled'}>複習本日新字</button><button class="secondary" data-action="cloze-book" ${b.newIds.length+b.reviewIds.length?'':'disabled'}>單字本例句填空</button><button class="text-btn" data-action="export-book">匯出本日單字表</button></div><h3 class="book-section-title">新字</h3>${bookRows(b.newIds,all)}<h3 class="book-section-title">複習</h3>${bookRows(b.reviewIds,all)}`:'<div class="empty">這一天尚無學習紀錄。</div>'}</div></div>`;}
function bookRows(ids,all){const by=C.lookup(all).byId;return ids.map(id=>by.get(id)).filter(Boolean).map(w=>`<button class="book-word" data-action="detail" data-id="${esc(w.id)}"><span lang="en">${esc(w.word)}</span><small>${esc(w.senses[0].zh)}</small><span>↗</span></button>`).join('')||'<p class="import-info">沒有此類單字。</p>';}
function renderProgress(){const s=stats(),books=C.notebooks(state,words()),recent=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const date=C.dateKey(d),b=books.find(b=>b.date===date);return{date,label:i===6?'今天':date.slice(5),n:b?.practices||0};}),max=Math.max(1,...recent.map(d=>d.n));$('#progress').innerHTML=head('WATCH YOUR MEMORY GROW','每個意思的進步，都看得見。','字庫分類共用進度；熟記一個單字需要完成它的所有收錄義項。')+statCards()+`<div class="dashboard-grid"><div class="panel"><div class="panel-head"><h2>最近 7 天練習次數</h2><span class="today-number">累計 ${state.logs.length} 次</span></div><div class="schedule">${recent.map(d=>`<div class="day-column"><small>${d.n}</small><div class="bar" style="height:${d.n/max*135}px"></div><span>${d.label}</span></div>`).join('')}</div></div><div class="panel"><div class="panel-head"><h2>義項的記憶養成</h2></div><div class="book-today"><strong>${Object.values(state.progress).filter(p=>p.stage>=0).length}</strong><span>個已學習義項</span><p>${Object.values(state.progress).filter(p=>p.stage>=4).length} 個義項已達熟記間隔。</p></div><details class="extra-info"><summary>複習間隔</summary><p class="progress-info">忘記：10 分鐘；模糊：30 分鐘或 1 天。記得：1、3、7、21、60 天。每個意思分開記錄。</p></details></div></div><div class="panel small-panel"><details class="extra-info"><summary>進度說明</summary><p class="progress-info">單字量以本字庫的學習紀錄計算。熟記需完成所有意思；舊版進度移至第一個意思，筆記保留在單字詳情。</p></details><div class="button-row"><button class="secondary" data-action="export">匯出備份</button><button class="secondary" data-action="import">匯入備份</button></div></div>`;}
function senseFields(s={},i=0){return `<fieldset class="sense-editor" data-sid="${esc(s.id||'')}"><legend>意思 ${i+1}</legend><label>這個意思的英文單字／字形<input class="edit-term" maxlength="180" value="${esc(s.term||'')}" placeholder="留空時使用上方的單字"></label><div class="editor-row"><label>詞性<input class="edit-pos" maxlength="60" value="${esc(s.pos||'')}" placeholder="例如 n. / v."></label><label>中文意思<input class="edit-zh" required maxlength="2000" value="${esc(s.zh||'')}" placeholder="每個不同意思分開填寫"></label></div><label>英文例句 1<textarea class="edit-example1" required maxlength="4000">${esc(s.examples?.[0]?.en||'')}</textarea></label><label>中文翻譯 1<textarea class="edit-translation1" required maxlength="4000">${esc(s.examples?.[0]?.zh||'')}</textarea></label><label>英文例句 2<textarea class="edit-example2" required maxlength="4000">${esc(s.examples?.[1]?.en||'')}</textarea></label><label>中文翻譯 2<textarea class="edit-translation2" required maxlength="4000">${esc(s.examples?.[1]?.zh||'')}</textarea></label><button type="button" class="text-btn" data-action="remove-sense">移除此意思</button></fieldset>`;}
function openEditor(id=null){editorId=id;const w=id?findWord(id):null;$('#wordForm').reset();$('#formError').textContent='';$('#wordInput').value=w?.word||'';$('#senseFields').innerHTML=(w?.senses||[{}]).map(senseFields).join('');$('#wordDialog').showModal();}
function saveEditor(e){e.preventDefault();const word=$('#wordInput').value.trim();if(!word)return;const old=editorId?findWord(editorId):null;const duplicate=words().find(w=>C.norm(w.word)===C.norm(word)&&w.id!==editorId);if(duplicate){$('#formError').textContent='這個單字已存在，請從它的詳情編輯其他義項。';return;}const fields=[...document.querySelectorAll('.sense-editor')];if(!fields.length){$('#formError').textContent='至少需要一個意思及兩個例句。';return;}const senses=[];for(const f of fields){const term=f.querySelector('.edit-term').value.trim()||word,zh=f.querySelector('.edit-zh').value.trim(),a=f.querySelector('.edit-example1').value.trim(),b=f.querySelector('.edit-example2').value.trim(),az=f.querySelector('.edit-translation1').value.trim(),bz=f.querySelector('.edit-translation2').value.trim(),id=f.dataset.sid||crypto.randomUUID();if(!zh||!a||!b||!az||!bz||C.norm(a)===C.norm(b)){$('#formError').textContent='每個意思都需要中文釋義、兩個不同的英文例句及各自的中文翻譯。';return;}const prev=old?.senses.find(s=>s.id===id);senses.push({...prev,id,term,pos:f.querySelector('.edit-pos').value.trim(),zh,examples:[{en:a,zh:az,zhSource:'個人編輯',source:'個人編輯'},{en:b,zh:bz,zhSource:'個人編輯',source:'個人編輯'},...(prev?.examples.slice(2)||[])],source:'個人編輯'});}
if(old){state.overrides[old.id]={...(state.overrides[old.id]||{}),word,senses};}else{state.customWords.unshift({id:crypto.randomUUID(),word,forms:[word],categories:['custom'],senses});}save();$('#wordDialog').close();render();toast('已儲存單字的字義與例句');}
function download(name,text,type='application/json'){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function exportBackup(){download(`wordlilium-${C.dateKey(Date.now())}.json`,JSON.stringify({...state,exportedAt:new Date().toISOString(),catalogVersion:globalThis.WG_CATALOG?.meta?.version},null,2));toast('已匯出所有義項進度與每日學習紀錄');}
function exportBook(){const b=C.notebooks(state,words()).find(b=>b.date===bookDate);if(!b)return;const ids=[...b.newIds,...b.reviewIds],list=ids.map(findWord).filter(Boolean);download(`wordlilium-${bookDate}-單字本.txt`,`${bookDate} 單字本\n新字 ${b.newIds.length} / 複習 ${b.reviewIds.length}\n義項與例句來源：Open Dictionary v2.0、Wiktionary 貢獻者、Wordgrove 補寫；CC BY-SA 4.0。\nhttps://github.com/ahpxex/open-dictionary/releases/tag/v2.0\nhttps://creativecommons.org/licenses/by-sa/4.0/\n\n`+list.map(w=>`${w.word}\n`+w.senses.map((s,i)=>` ${i+1}. ${s.pos} ${s.zh}\n`+s.examples.map(e=>`    ${e.en}${e.zh?'\n    '+e.zh:''}`).join('\n')).join('\n')).join('\n\n'),'text/plain;charset=utf-8');}
function closeDialogs(){for(const d of document.querySelectorAll('dialog'))if(d.open)d.close();}
function showSources(){const meta=globalThis.WG_CATALOG?.meta||{};$('#detailContent').innerHTML=`<div class="dialog-head"><h2>字庫來源與授權</h2><button class="icon-btn" data-action="close-detail" aria-label="關閉來源">×</button></div><pre class="source-document">${esc(meta.sourceNotice||'完整來源說明位於專案 data/CONTENT-SOURCES.md。')}</pre>`;$('#detailDialog').showModal();}
function speak(word){if(!('speechSynthesis'in window)){toast('瀏覽器不支援語音播放。');return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(word);u.lang='en-US';u.rate=.85;u.onerror=()=>toast('目前無法播放語音。');speechSynthesis.speak(u);}
let readDialogBackdropStart=null;
function handleReadDialogBackdrop(e){
 const dialog=e.target;
 const readable=dialog&&(dialog.id==='detailDialog'||dialog.id==='relatedDialog')&&dialog.open;
 const rect=readable?dialog.getBoundingClientRect():null;
 const outside=!!rect&&(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom);
 if(e.type==='pointerdown'){readDialogBackdropStart=outside?dialog:null;return;}
 const started=readDialogBackdropStart;readDialogBackdropStart=null;
 if(outside&&started===dialog)dialog.close();
}
document.addEventListener('pointerdown',handleReadDialogBackdrop,true);
document.addEventListener('click',handleReadDialogBackdrop,true);
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const a=b.dataset.action,id=b.dataset.id;
 if(a==='toggle-review-notifications')toggleReviewNotifications();
 if(a==='open-due-review')openDueReview();
 if(a==='back-to-top')backToTop();
 if(a==='cover-prev')changeCover(-1);
 if(a==='cover-next')changeCover(1);
 if(a==='scroll-home')$('#homeShortcuts').scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 if(a==='open-related')openRelated(id,b.dataset.sense);
 if(a==='close-related')$('#relatedDialog').close();
 if(a==='go'){closeDialogs();route(b.dataset.go);}
 if(a==='collection'){category=b.dataset.cat;query='';level='all';status='all';listPage=0;route('library');}
 if(a==='detail')openDetail(id);
 if(a==='sources')showSources();
 if(a==='close-detail')$('#detailDialog').close();
 if(a==='add')openEditor();
 if(a==='edit'){$('#detailDialog').close();openEditor(id);}
 if(a==='add-sense')$('#senseFields').insertAdjacentHTML('beforeend',senseFields({},document.querySelectorAll('.sense-editor').length));
 if(a==='remove-sense')b.closest('.sense-editor').remove();
 if(a==='hide'){state.hidden=[...new Set([...state.hidden,id])];save();closeDialogs();render();toast('已隱藏；可從單字庫還原。');}
 if(a==='restore-hidden'){state.hidden=[];save();render();}
 if(a==='prev-page'){listPage--;renderLibrary();}
 if(a==='next-page'){listPage++;renderLibrary();}
 if(a==='start-due')startReview(C.dueUnits(state,currentWords()));
 if(a==='start-new')startReview(C.newUnits(state,currentWords(),state.settings.dailyGoal||10));
 if(a==='review-word'){const w=findWord(id);if(w)startReview(w.senses.map(s=>({word:w,sense:s})));}
 if(a==='cloze-word'){const w=findWord(id);if(w)startQuiz(C.questions([w]));}
 if(a==='start-quiz')startQuiz(getPool());
 if(a==='quiz-hint')giveClozeHint();
 if(a==='quiz-reveal')checkAnswer(true);
 if(a==='quiz-mistakes'&&quiz?.index>=quiz?.items.length)startQuiz(quiz.mistakes,{source:quiz.source});
 if(a==='quiz-next')nextQuizQuestion();
 if(a==='end-quiz')endQuizWithRecap();
 if(a==='quiz-finish'){const next=quiz?.source==='review'?'review':'cloze';quiz=null;review=null;route(next);}
 if(a==='book-date'){bookDate=b.dataset.date;renderNotebooks();}
 if(a==='review-book'||a==='cloze-book'){const book=C.notebooks(state,words()).find(x=>x.date===bookDate);if(book){const ids=a==='review-book'?book.newIds:[...book.newIds,...book.reviewIds],ws=ids.map(findWord).filter(Boolean);a==='review-book'?startReview(ws.flatMap(w=>w.senses.map(s=>({word:w,sense:s})))):startQuiz(C.questions(ws));}}
 if(a==='export')exportBackup();if(a==='import')$('#importFile').click();if(a==='export-book')exportBook();if(a==='speak')speak(b.dataset.word);
});
document.addEventListener('change',e=>{if(e.target.id==='category'){category=e.target.value;listPage=0;render();}if(e.target.id==='levelFilter'){level=e.target.value;listPage=0;renderLibrary();}if(e.target.id==='statusFilter'){status=e.target.value;listPage=0;renderLibrary();}if(e.target.id==='dailyGoal'){state.settings.dailyGoal=Math.max(1,Math.min(50,Math.floor(Number(e.target.value)||10)));save();renderReview();}if(e.target.id==='exerciseScope'){exerciseScope=e.target.value;renderCloze();}if(e.target.id==='bookDate'){bookDate=e.target.value||C.dateKey(Date.now());renderNotebooks();}});
function updateSearch(e){if(e.target.id!=='search'||e.isComposing)return;query=e.target.value;listPage=0;const pos=e.target.selectionStart;renderLibrary();$('#search').focus();try{$('#search').setSelectionRange(pos,pos);}catch(err){}}
document.addEventListener('input',updateSearch);document.addEventListener('compositionend',updateSearch);
document.addEventListener('submit',e=>{if(e.target.id==='answerForm'){e.preventDefault();checkAnswer();}if(e.target.id==='wordForm')saveEditor(e);});
$('#closeDialog').onclick=()=>$('#wordDialog').close();$('#exportSide').onclick=exportBackup;
function restoreBackup(incoming){
 const proposed=JSON.parse(JSON.stringify(state));
 C.mergeBackup(proposed,incoming,catalog);
 if(!C.validState(proposed))throw Error('備份格式不正確');
 // Commit storage first: a failed write must leave the current session intact.
 try{localStorage.setItem(STORAGE,JSON.stringify(proposed));}
 catch(err){throw Error('無法保存匯入紀錄，請確認瀏覽器儲存空間；現有進度未更動。');}
 state=proposed;storageWarning='';review=null;quiz=null;if(state.settings.theme)applyTheme(state.settings.theme);
 $('.local-label').innerHTML='<span class="status-dot"></span> 進度保存在這個瀏覽器';
 render();toast('紀錄已匯入並保存，原有進度已保留。');
}
$('#importFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(file.size>100*1024*1024)throw Error('備份檔案超過 100MB');
  let incoming;
  try{incoming=JSON.parse(await file.text());}catch(err){throw Error('無法讀取檔案，請選擇匯出的 JSON 備份。');}
  if(!incoming||typeof incoming!=='object')throw Error('請選擇有效的學習備份。');
  restoreBackup(incoming);
 }catch(err){toast(err.message||'無法讀取備份');}
 finally{e.target.value='';}
};
document.querySelectorAll('nav [data-page]').forEach(b=>b.onclick=()=>route(b.dataset.page));$('.brand').onclick=e=>{e.preventDefault();route('overview');};

document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(!document.querySelector('dialog[open]'))render();checkReviewReminders();}});
document.addEventListener('focus',()=>checkReviewReminders(),true);
if(!catalog.length){$('#overview').innerHTML='<div class="empty">字庫未載入，請確認 catalog.js 與網頁在同一個資料夾，再重新開啓。</div>';}else{render();if(storageWarning)toast(storageWarning);else save();}

prepareReminderWorker();reminderTick();
