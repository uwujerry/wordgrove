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
      byId.set(w.id,state.overrides[w.id]?{...w,...state.overrides[w.id]}:w);
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
  function validWord(w){return w&&safeKey(w.id)&&typeof w.word==='string'&&w.word.trim().length>0&&w.word.length<=180&&Array.isArray(w.categories)&&w.categories.every(c=>['ceec','gsat','custom'].includes(c))&&(!w.forms||Array.isArray(w.forms)&&w.forms.every(f=>typeof f==='string'))&&Array.isArray(w.senses)&&w.senses.length>0&&w.senses.length<=100&&w.senses.every(validSense)&&new Set(w.senses.map(s=>s.id)).size===w.senses.length;}
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
    return {text:text.replace(regex,'________'),answer:matches[0][0],normalizedAnswer:answers[0],original:text,translation:example.zh||'',wordId:word.id,senseId:sense.id};
  }
  function evaluateCloze(question,input){
    const answer=norm(question.answer),submitted=norm(input);
    if(submitted===answer)return {correct:true,kind:'correct'};
    const sense=question.sense||{};
    // Use this sense's recorded inflections; shared spelling or suffixes alone
    // cannot establish that two words are forms of the same verb.
    const forms=new Set([sense.term||question.word?.word,...(sense.forms||[])].map(norm).filter(f=>f&&f!=='-'));
    const verb=/^(verb|auxiliary|auxiliary verb)$/i.test(sense.pos||'');
    return {correct:false,kind:verb&&submitted&&forms.has(submitted)&&forms.has(answer)?'verb-form':'incorrect'};
  }
  function questions(words){const pool=[];for(const w of words)for(const s of w.senses)for(const e of s.examples){const q=makeCloze(w,s,e);if(q)pool.push({...q,sense:s,word:w});}return pool;}
  function dueUnits(state,words,now=Date.now()){const units=[];for(const w of words)for(const s of w.senses){const p=getProgress(state,w.id,s.id);if(p.stage>=0&&p.due<=now)units.push({word:w,sense:s,due:p.due});}return units.sort((a,b)=>a.due-b.due);}
  function newUnits(state,words,limit=10){
    // Include unlearned senses of already introduced words as well as new words.
    const unfinished=words.filter(w=>w.senses.some(s=>getProgress(state,w.id,s.id).stage<0));
    const picked=unfinished.slice(0,Math.max(1,Math.min(50,limit)));
    return picked.flatMap(w=>w.senses.filter(s=>getProgress(state,w.id,s.id).stage<0).map(s=>({word:w,sense:s})));
  }
  const api={DAY,intervals,norm,dateKey,empty,fresh,unitKey,getProgress,schedule,rate,wordState,allWords,lookup,validSense,validWord,validState,validLegacy,importLegacy,mergeBackup,notebooks,makeCloze,evaluateCloze,questions,dueUnits,newUnits,dedupLogs};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.WGCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
