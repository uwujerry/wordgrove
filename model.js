/* Wordgrove data model. Static dictionary content stays outside browser progress storage. */
(function(root){
  'use strict';
  const DAY=86400000, intervals=[10/1440,1,3,7,21,60];
  const norm=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ');
  const dateKey=t=>{const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const empty=()=>({version:2,progress:{},logs:[],customWords:[],overrides:{},hidden:[],settings:{dailyGoal:10},migrationDone:false});
  const fresh=()=>({stage:-1,due:0,reviews:0,last:0});
  const unitKey=(wid,sid)=>`${wid}::${sid}`;
  const getProgress=(state,wid,sid)=>state.progress[unitKey(wid,sid)]||fresh();
  function schedule(p,rating){
    let stage,days;
    if(rating==='again'){stage=0;days=intervals[0];}
    else if(rating==='hard'){stage=Math.max(0,Math.min(p.stage,1));days=stage===0?30/1440:1;}
    else {stage=Math.min(5,Math.max(0,p.stage)+(rating==='easy'?2:1));days=intervals[stage];}
    return {stage,days};
  }
  function rate(state,w,s,rating,mode='recall',now=Date.now()){
    if(!['again','hard','good','easy'].includes(rating))throw Error('Invalid rating');
    const key=unitKey(w.id,s.id),prev=getProgress(state,w.id,s.id),next=schedule(prev,rating);
    state.progress[key]={stage:next.stage,due:now+next.days*DAY,reviews:prev.reviews+1,last:now};
    const log={id:w.id,senseId:s.id,time:now,rating,mode,first:prev.stage<0};
    state.logs.push(log);return log;
  }
  function wordState(state,w,now=Date.now()){
    const ps=w.senses.map(s=>getProgress(state,w.id,s.id)),learned=ps.some(p=>p.stage>=0);
    return {learned,mastered:ps.length>0&&ps.every(p=>p.stage>=4),due:ps.some(p=>p.stage>=0&&p.due<=now),
      sensesLearned:ps.filter(p=>p.stage>=0).length,sensesMastered:ps.filter(p=>p.stage>=4).length,
      reviews:ps.reduce((a,p)=>a+p.reviews,0),last:Math.max(0,...ps.map(p=>p.last)),
      next:Math.min(Infinity,...ps.filter(p=>p.stage>=0).map(p=>p.due))};
  }
  function allWords(catalog,state){
    const hidden=new Set(state.hidden),byId=new Map();
    for(const w of [...catalog,...state.customWords]){
      if(hidden.has(w.id))continue;
      let merged=state.overrides[w.id]?{...w,...state.overrides[w.id]}:w;
      // Old edits may contain unchanged English examples without translations.
      // Reuse only the same source sense and sentence; never overwrite user text.
      if(state.overrides[w.id]?.senses){
        merged={...merged,senses:merged.senses.map(s=>{
          const original=w.senses.find(x=>x.id===s.id);
          return {...s,examples:s.examples.map(e=>{
            if(e.zh)return e;
            const match=original?.examples.find(x=>norm(x.en)===norm(e.en)&&x.zh);
            return match?{...e,zh:match.zh,zhSource:match.zhSource||'built-in Chinese translation'}:e;
          })};
        })};
      }
      byId.set(w.id,merged);
    }
    return [...byId.values()];
  }
  function lookup(catalog){
    const byId=new Map(),byTerm=new Map();
    for(const w of catalog){byId.set(w.id,w);for(const t of [w.word,...(w.forms||[])])if(!byTerm.has(norm(t)))byTerm.set(norm(t),w);}
    return {byId,byTerm};
  }
  function mergeProgress(dest,key,p){
    const prev=dest.progress[key];
    if(!prev||p.last>prev.last||(p.last===prev.last&&p.reviews>prev.reviews))dest.progress[key]={...p};
  }
  const safeKey=k=>typeof k==='string'&&k.length>0&&k.length<500&&!['__proto__','constructor','prototype'].includes(k);
  const safeLink=x=>!x||(typeof x==='string'&&/^https?:\/\//i.test(x));
  function validSense(s){return s&&safeKey(s.id)&&typeof s.zh==='string'&&s.zh.trim().length>0&&s.zh.length<=2000&&(!s.term||typeof s.term==='string')&&(!s.pos||typeof s.pos==='string')&&(!s.forms||Array.isArray(s.forms)&&s.forms.every(f=>typeof f==='string'))&&safeLink(s.sourceUrl)&&Array.isArray(s.examples)&&s.examples.length<=30&&s.examples.every(e=>e&&typeof e.en==='string'&&e.en.length<=4000&&(!e.zh||typeof e.zh==='string'));}
  function validWord(w){return w&&safeKey(w.id)&&typeof w.word==='string'&&w.word.trim().length>0&&w.word.length<=180&&Array.isArray(w.categories)&&w.categories.every(c=>['ceec','gsat','highfreq','custom'].includes(c))&&(!w.forms||Array.isArray(w.forms)&&w.forms.every(f=>typeof f==='string'))&&Array.isArray(w.senses)&&w.senses.length>0&&w.senses.length<=100&&w.senses.every(validSense)&&new Set(w.senses.map(s=>s.id)).size===w.senses.length;}
  function validProgress(p){return p&&Number.isInteger(p.stage)&&p.stage>=-1&&p.stage<=5&&Number.isFinite(p.due)&&p.due>=0&&Number.isInteger(p.reviews)&&p.reviews>=0&&Number.isFinite(p.last)&&p.last>=0;}
  function validLog(l){return l&&typeof l.id==='string'&&Number.isFinite(l.time)&&l.time>=0&&['again','hard','good','easy'].includes(l.rating);}
  const plain=o=>o&&typeof o==='object'&&!Array.isArray(o);
  function validState(s){return plain(s)&&s.version===2&&plain(s.progress)&&Object.keys(s.progress).length<=200000&&Object.keys(s.progress).every(safeKey)&&Object.values(s.progress).every(validProgress)&&Array.isArray(s.logs)&&s.logs.every(validLog)&&Array.isArray(s.customWords)&&s.customWords.length<=10000&&s.customWords.every(validWord)&&new Set(s.customWords.map(w=>w.id)).size===s.customWords.length&&plain(s.overrides)&&Object.keys(s.overrides).every(safeKey)&&Object.values(s.overrides).every(o=>plain(o)&&(!o.word||typeof o.word==='string')&&(!o.senses||Array.isArray(o.senses)&&o.senses.length>0&&o.senses.every(validSense)))&&Array.isArray(s.hidden)&&s.hidden.every(safeKey)&&(!s.settings||plain(s.settings)&&(!s.settings.dailyGoal||Number.isInteger(s.settings.dailyGoal)&&s.settings.dailyGoal>=1&&s.settings.dailyGoal<=50));}
  function validLegacy(d){return d&&Array.isArray(d.words)&&d.words.length<=10000&&Array.isArray(d.logs)&&d.logs.every(validLog)&&d.words.every(w=>w&&typeof w.id==='string'&&typeof w.word==='string'&&typeof w.meaning==='string'&&w.meaning.trim()&&typeof w.example==='string'&&validProgress(w));}
  function importLegacy(state,legacy,catalog){
    if(!validLegacy(legacy))throw Error('備份資料格式不正確');
    const index=lookup([...catalog,...state.customWords]),mapping=new Map();
    for(const old of legacy.words){
      let w=index.byTerm.get(norm(old.word));
      if(!w){w={id:old.id,word:old.word,forms:[old.word],categories:['custom'],senses:[{id:'personal',term:old.word,pos:'',zh:old.meaning,examples:old.example?[{en:old.example,zh:'',source:'個人舊版資料'}]:[],source:'個人舊版資料'}]};state.customWords.push(w);index.byTerm.set(norm(w.word),w);}
      const sid=w.senses[0].id;mapping.set(old.id,{id:w.id,senseId:sid});
      if(old.stage>=0)mergeProgress(state,unitKey(w.id,sid),{stage:old.stage,due:old.due,reviews:old.reviews,last:old.last});
      // Keep personal meanings/examples as notes without replacing the new dictionary's senses.
      if(w.categories.includes('ceec')&&old.example){
        const prior=state.overrides[w.id]||{},notes=[...(prior.personalNotes||[])];
        const note={meaning:old.meaning,example:old.example};if(!notes.some(n=>n.meaning===note.meaning&&n.example===note.example))notes.push(note);
        state.overrides[w.id]={...prior,personalNotes:notes};
      }
    }
    const firstTimes=new Map();
    for(const l of [...legacy.logs].sort((a,b)=>a.time-b.time)){
      const m=mapping.get(l.id);if(!m)continue;const key=unitKey(m.id,m.senseId),first=!firstTimes.has(key);firstTimes.set(key,l.time);
      state.logs.push({...l,...m,mode:l.mode||'recall',first});
    }
    dedupLogs(state);state.migrationDone=true;return state;
  }
  function dedupLogs(state){const seen=new Set();state.logs=state.logs.filter(l=>{const key=[l.id,l.senseId||'',l.time,l.mode||'recall',l.rating].join('|');if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>a.time-b.time);}
  function mergeBackup(state,incoming,catalog){
    if(incoming.version!==2)return importLegacy(state,incoming,catalog);
    if(!validState(incoming))throw Error('備份資料格式不正確');
    for(const [k,p]of Object.entries(incoming.progress))mergeProgress(state,k,p);
    const all=lookup([...catalog,...state.customWords]),idMap=new Map();
    for(const w of incoming.customWords){
      const existing=all.byId.get(w.id)||all.byTerm.get(norm(w.word));
      if(!existing){state.customWords.push(w);all.byId.set(w.id,w);all.byTerm.set(norm(w.word),w);}
      else if(existing.id!==w.id){idMap.set(w.id,existing.id);for(const sense of w.senses){const p=incoming.progress[unitKey(w.id,sense.id)];if(p)mergeProgress(state,unitKey(existing.id,existing.senses.find(s=>s.zh===sense.zh)?.id||existing.senses[0].id),p);}}
    }
    for(const [id,ov] of Object.entries(incoming.overrides))if(!state.overrides[id])state.overrides[id]=ov;
    state.logs.push(...incoming.logs.map(l=>idMap.has(l.id)?{...l,id:idMap.get(l.id),senseId:all.byId.get(idMap.get(l.id))?.senses[0]?.id||l.senseId}:l));
    state.hidden=[...new Set([...state.hidden,...incoming.hidden])];
    state.settings={...state.settings,...incoming.settings};
    dedupLogs(state);return state;
  }
  function notebooks(state,catalog){
    const byId=lookup(catalog).byId,books=new Map(),introduced=new Set();
    for(const l of [...state.logs].sort((a,b)=>a.time-b.time)){
      if(!byId.has(l.id))continue;const date=dateKey(l.time);
      if(!books.has(date))books.set(date,{date,newIds:new Set(),reviewIds:new Set(),practices:0,cloze:0});
      const b=books.get(date);b.practices++;if(l.mode==='cloze')b.cloze++;
      if(!introduced.has(l.id)){b.newIds.add(l.id);introduced.add(l.id);}else if(!b.newIds.has(l.id))b.reviewIds.add(l.id);
    }
    return [...books.values()].sort((a,b)=>b.date.localeCompare(a.date)).map(b=>({...b,newIds:[...b.newIds],reviewIds:[...b.reviewIds]}));
  }
  const escapeRE=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function makeCloze(word,sense,example){
    const text=typeof example==='string'?example:example.en;
    if(!text)return null;
    const terms=[sense.term||word.word,...(sense.forms||[])].map(t=>String(t).trim()).filter(t=>t&&t.length<100&&!/[()\/]/.test(t));
    const candidates=[...new Set(terms)].sort((a,b)=>b.length-a.length);
    if(!candidates.length)return null;
    const regex=new RegExp(`(?<![A-Za-z])(?:${candidates.map(escapeRE).join('|')})(?![A-Za-z])`,'gi');
    const matches=[...text.matchAll(regex)];if(!matches.length)return null;
    const answers=[...new Set(matches.map(m=>norm(m[0])))];
    if(answers.length!==1)return null;
    return {text:text.replace(regex,'________'),answer:matches[0][0],normalizedAnswer:answers[0],original:text,translation:example.zh||'',translationSource:example.zhSource||'',wordId:word.id,senseId:sense.id};
  }
  function normalizePOS(pos){return ({n:'noun','n.':'noun',v:'verb','v.':'verb','adj.':'adj',adjective:'adj','adv.':'adv',adverb:'adv',s:'adj',a:'adj',r:'adv'})[pos]||pos;}
  function synonymData(word,sense){
    const raw=root.WG_RELATIONS?.byWord?.[word.id];
    if(!raw)return {status:'not_indexed',groups:[],derived:[]};
    const pos=normalizePOS(sense.pos||'');
    return {...raw,groups:raw.groups.filter(g=>g.pos===pos)};
  }
  function relatedAnswerKind(question,input){
    const term=norm(question.sense?.term||question.word?.word||question.answer),submitted=norm(input);
    const data=synonymData(question.word||{},question.sense||{});
    if((root.WG_RELATIONS?.families||[]).some(f=>f.includes(term)&&f.includes(submitted))||data.derived.includes(submitted))return 'word-family';
    const forms=(question.sense?.forms||[]).map(norm);
    if(forms.includes(submitted))return 'word-form';
    const zh=String(question.sense?.zh||'');
    const pairs=(zh.match(/[\u3400-\u9fff]{2,}/g)||[]).flatMap(x=>Array.from({length:x.length-1},(_,i)=>x.slice(i,i+2))).filter(x=>!['一種','某種','用於','表示','相關','狀態','事物','某人','的人','的事'].includes(x));
    const ignore=new Set(['that','this','with','from','have','been','were','they','their','your','some','other','there','about','which','would','could','should','will','into','when','used','make','made','such','very',term,submitted]);
    const context=new Set((norm(question.original).match(/[a-z]{4,}/g)||[]).filter(x=>!ignore.has(x)));
    const sameSense=g=>g.terms.some(t=>pairs.some(p=>t.zh?.includes(p)))||[...new Set((g.gloss.toLowerCase().match(/[a-z]{4,}/g)||[]).filter(x=>context.has(x)))].filter(x=>x.length>=6).length>=1;
    if(data.groups.some(g=>sameSense(g)&&g.terms.some(t=>norm(t.word)===submitted)))return 'synonym';
    // The small, curated Chinese-sense list also works offline without OEWN.
    for(const [terms,pattern] of synonymGroups){const group=terms.split(' ');if(group.includes(term)&&group.includes(submitted)&&new RegExp(pattern).test(question.sense?.zh||''))return 'synonym';}
    return '';
  }
  function evaluateCloze(question,input){
    const answer=norm(question.answer),submitted=norm(input);
    if(submitted===answer)return {correct:true,kind:'correct'};
    const sense=question.sense||{};
    // Use this sense's recorded inflections; shared spelling or suffixes alone
    // cannot establish that two words are forms of the same verb.
    const forms=new Set([sense.term||question.word?.word,...(sense.forms||[])].map(norm).filter(f=>f&&f!=='-'));
    const verb=/^(verb|auxiliary|auxiliary verb)$/i.test(normalizePOS(sense.pos||''));
    if(verb&&submitted&&forms.has(submitted)&&forms.has(answer))return {correct:false,kind:'verb-form'};
    const related=relatedAnswerKind(question,submitted);if(related)return {correct:false,kind:related};
    // A near match is a spelling hint, never an accepted answer.
    let near=false;
    if(/^[a-z]+$/.test(answer)&&/^[a-z]+$/.test(submitted)&&Math.min(answer.length,submitted.length)>=4){
      if(answer.length===submitted.length){
        const diff=[...answer].map((c,i)=>c!==submitted[i]?i:-1).filter(i=>i>=0);
        near=diff.length===1||diff.length===2&&diff[1]===diff[0]+1&&answer[diff[0]]===submitted[diff[1]]&&answer[diff[1]]===submitted[diff[0]];
      }else if(Math.abs(answer.length-submitted.length)===1){
        const [long,short]=answer.length>submitted.length?[answer,submitted]:[submitted,answer];
        let i=0;while(i<short.length&&long[i]===short[i])i++;
        near=long.slice(i+1)===short.slice(i);
      }
    }
    return {correct:false,kind:near?'spelling':'incorrect'};
  }
  // Curated near-synonyms are gated by the meaning being studied.
  // They are learning comparisons, not unconditional sentence substitutions.
  const synonymGroups=[
    ['big large huge','大|巨大|龐大','大的'],['small little tiny','小|微小','小的'],
    ['fast quick rapid swift','快|迅速','快速的'],['slow sluggish','慢|緩慢','緩慢的'],
    ['happy glad joyful delighted','快樂|高興|喜悅','高興的'],['sad unhappy sorrowful','悲傷|難過|不快樂','悲傷的'],
    ['angry mad furious','生氣|憤怒','生氣的'],['afraid scared frightened','害怕|恐懼','害怕的'],
    ['smart clever intelligent','聰明|機智','聰明的'],['beautiful pretty attractive','美麗|漂亮|好看','漂亮的'],
    ['difficult hard tough','困難|艱難','困難的'],['easy simple','容易|簡單','簡單的'],
    ['important significant crucial essential','重要|關鍵','重要的'],['famous well-known renowned','著名|知名|有名','著名的'],
    ['quiet silent','安靜|無聲|沉默','安靜的'],['calm peaceful tranquil','平靜|寧靜','平靜的'],
    ['rich wealthy affluent','富有|富裕','富有的'],['poor needy impoverished','貧窮|貧困','貧窮的'],
    ['tired exhausted weary','疲倦|疲憊|疲勞','疲倦的'],['brave courageous bold','勇敢|無畏','勇敢的'],
    ['honest truthful sincere','誠實|真誠','誠實、真誠的'],['kind nice friendly','友善|親切|善良','友善的'],
    ['begin start commence','開始|著手','開始'],['finish complete end','完成|結束','完成、結束'],
    ['buy purchase','購買|買','購買'],['help assist aid','幫助|協助|援助','幫助'],
    ['choose select pick','選擇|挑選','選擇'],['need require','需要|需求','需要'],
    ['get obtain acquire','獲得|取得','獲得'],['keep retain preserve','保留|保存|保持','保留、保存'],
    ['make create produce','製造|創造|製作|生產','製作、創造'],['build construct','建造|建設|興建','建造'],
    ['destroy ruin demolish','破壞|摧毀|毀壞','摧毀'],['show display exhibit','展示|顯示|展出','展示'],
    ['say state express','說|表達|陳述','表達、陳述'],['answer reply respond','回答|回覆|回應','回答、回應'],
    ['ask inquire question','詢問|問|提問','詢問'],['look watch observe','看|觀看|觀察','觀看、觀察'],
    ['leave depart','離開|出發','離開、出發'],['arrive reach','抵達|到達','到達'],
    ['allow permit','允許|許可','允許'],['stop cease halt','停止|中止','停止'],
    ['change alter modify','改變|更改|修改','改變、修改'],['increase rise grow','增加|增長|上升','增加、上升'],
    ['decrease decline reduce','減少|降低|下降','減少、下降'],['improve enhance','改善|改進|提升','改善、提升'],
    ['problem issue difficulty','問題|困難','問題、困難'],['idea thought notion','想法|觀念|念頭','想法、觀念'],
    ['chance opportunity','機會|時機','機會'],['mistake error fault','錯誤|過失','錯誤'],
    ['job occupation profession','工作|職業','職業、工作'],['goal aim objective','目標|目的','目標'],
    ['reason cause','原因|理由','原因'],['result outcome consequence','結果|後果','結果'],
    ['method way approach','方法|方式|途徑','方法'],['danger risk peril','危險|風險','危險、風險']
  ];
  const confusionGroups=[
    'accept except','affect effect','advice advise','adapt adopt','access assess excess',
    'desert dessert','principal principle','personal personnel','quiet quite quit',
    'lose loose','than then','weather whether','stationary stationery','complement compliment',
    'economic economical','historic historical','sensible sensitive','respectful respective respectable',
    'beside besides','rise raise arise','lay lie','borrow lend','bring take','learn teach',
    'cost spend pay','say tell speak talk','look see watch','remember remind','alone lonely',
    'latter later latest','conscious conscience','cloth clothes clothing','breath breathe',
    'through though thought thorough','ensure insure assure','emigrate immigrate','precede proceed',
    'form from','angel angle','price prize','aboard abroad','board broad','dairy diary'
  ].map(g=>g.split(' '));
  function spellingDistance(a,b){
    let row=Array.from({length:b.length+1},(_,i)=>i),older=null;
    for(let i=1;i<=a.length;i++){
      const next=[i];
      for(let j=1;j<=b.length;j++){
        next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));
        if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])next[j]=Math.min(next[j],older[j-2]+1);
      }
      older=row;row=next;
    }
    return row[b.length];
  }
  function relatedWords(word,sense,words,limit=3){
    const term=norm(sense.term||word.word),base=norm(word.word),byTerm=new Map(words.map(w=>[norm(w.word),w]));
    const excluded=new Set([base,term,...(word.senses||[]).flatMap(s=>s.forms||[]),...(sense.forms||[])].map(norm));
    const synonyms=[],confusables=[],seen=new Set(excluded);
    for(const [terms,pattern,meaning] of synonymGroups){
      const group=terms.split(' ');
      if(!group.includes(term)||!new RegExp(pattern).test(sense.zh||''))continue;
      for(const t of group){const w=byTerm.get(t);if(w&&!seen.has(t)){synonyms.push({word:w,meaning,relation:'近義'});seen.add(t);}}
    }
    for(const group of confusionGroups){
      if(!group.includes(term)&&!group.includes(base))continue;
      for(const t of group){const w=byTerm.get(t);if(w&&!seen.has(t)){confusables.push({word:w,meaning:w.senses[0]?.zh||'',relation:'易混淆'});seen.add(t);}}
    }
    if(term.length>=4){
      const candidates=[];
      for(const w of words){
        const t=norm(w.word);if(seen.has(t)||!/^[a-z]+$/.test(t)||Math.abs(t.length-term.length)>1)continue;
        const d=spellingDistance(term,t);
        if(d===1)candidates.push({word:w,meaning:w.senses[0]?.zh||'',relation:'拼字相近'});
      }
      candidates.sort((a,b)=>a.word.word.localeCompare(b.word.word));
      confusables.push(...candidates);
    }
    return {synonyms:synonyms.slice(0,limit),confusables:confusables.slice(0,limit)};
  }
  function questions(words){const pool=[];for(const w of words)for(const s of w.senses)for(const e of s.examples){const q=makeCloze(w,s,e);if(q)pool.push({...q,sense:s,word:w});}return pool;}
  function dueUnits(state,words,now=Date.now()){const units=[];for(const w of words)for(const s of w.senses){const p=getProgress(state,w.id,s.id);if(p.stage>=0&&p.due<=now)units.push({word:w,sense:s,due:p.due});}return units.sort((a,b)=>a.due-b.due);}
  function newUnits(state,words,limit=10){
    // Include unlearned senses of already introduced words as well as new words.
    const unfinished=words.filter(w=>w.senses.some(s=>getProgress(state,w.id,s.id).stage<0));
    const picked=unfinished.slice(0,Math.max(1,Math.min(50,limit)));
    return picked.flatMap(w=>w.senses.filter(s=>getProgress(state,w.id,s.id).stage<0).map(s=>({word:w,sense:s})));
  }
  function recentShortcuts(history,now=Date.now()){
    const defaults=['review','cloze','library','notebooks','progress'];
    const counts=new Map();
    for(const e of Array.isArray(history)?history:[]){
      if(!e||!defaults.includes(e.page)||!Number.isFinite(e.time)||e.time>now||now-e.time>14*DAY)continue;
      const old=counts.get(e.page)||{count:0,last:0};counts.set(e.page,{count:old.count+1,last:Math.max(old.last,e.time)});
    }
    return [...defaults].sort((a,b)=>(counts.get(b)?.count||0)-(counts.get(a)?.count||0)||(counts.get(b)?.last||0)-(counts.get(a)?.last||0)||defaults.indexOf(a)-defaults.indexOf(b)).slice(0,4);
  }
  const api={DAY,intervals,norm,dateKey,empty,fresh,unitKey,getProgress,schedule,rate,wordState,allWords,lookup,validSense,validWord,validState,validLegacy,importLegacy,mergeBackup,notebooks,makeCloze,evaluateCloze,normalizePOS,synonymData,relatedWords,questions,dueUnits,newUnits,dedupLogs,recentShortcuts};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.WGCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
