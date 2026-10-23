"""Add sense-matched, real usage examples; suppress unsupported synonym rows."""
from pathlib import Path
from collections import Counter,defaultdict
import gzip,json,re,sys,math,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT.parent.parent/'work'
sys.stdout.reconfigure(encoding='utf-8')
f=ROOT/'relations.js';raw=f.read_text(encoding='utf-8');data=json.loads(raw.split('=',1)[1].strip().removesuffix(';'))
terms={t['word'] for w in data['byWord'].values() for g in w['groups'] for t in g['terms']}
cache=WORK/'synonyms/entry-examples.json'
if cache.exists():dictionary=json.loads(cache.read_text(encoding='utf-8'))
else:
 dictionary={}
 with gzip.open(WORK/'enrichment/distribution.jsonl.gz','rt',encoding='utf-8') as stream:
  for line in stream:
   e=json.loads(line);term=e.get('normalized_headword',e.get('headword','')).lower()
   if term not in terms:continue
   groups=[]
   for g in e.get('pos_groups',[]):
    senses=[{'zh':m.get('short_gloss',''),'examples':m.get('examples',[])} for m in g.get('meanings',[])]
    groups.append({'pos':g.get('pos'),'forms':[x['text'].lower() for x in g.get('forms',[]) if x.get('text')],'senses':senses})
   dictionary[term]=groups
 cache.write_text(json.dumps(dictionary,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 print('cached dictionary words',len(dictionary),flush=True)
sys.path.insert(0,str(WORK/'vendor'))
from opencc import OpenCC
cc=OpenCC('s2twp')
lex=ET.fromstring(gzip.decompress((WORK/'synonyms/english-wordnet-2025.xml.gz').read_bytes())).find('Lexicon')
synsets={s.get('id'):s for s in lex.findall('Synset')}
member_senses=defaultdict(set)
for w in data['byWord'].values():
 for g in w['groups']:
  for t in g['terms']:member_senses[(t['word'],g['pos'])].add(g['id'])
stop=set('the a an this that these those and or but for with from into onto have has had be is are was were been being to of on in at by as it its they their them he she his her we our you your not no can could would should will may might must do does did also some any all much more most other one two very such than then there here when where what which who how up out about used use make made get got'.split())
def tokens(s):
 ts=re.findall('[a-z]+',s.lower());out=set()
 for t in ts:
  if t in stop or len(t)<3:continue
  if len(t)>5 and t.endswith('ing'):t=t[:-3]
  elif len(t)>4 and t.endswith('ed'):t=t[:-2]
  elif len(t)>4 and t.endswith('s'):t=t[:-1]
  out.add(t)
 return out
docs={}
for w in data['byWord'].values():
 for g in w['groups']:
  if g['id'] not in docs:docs[g['id']]={'id':g['id'],'pos':g['pos'],'gloss':g['gloss'],'terms':[]}
  existing={t['word'] for t in docs[g['id']]['terms']}
  docs[g['id']]['terms'].extend(t for t in g['terms'] if t['word'] not in existing)

df=Counter(t for g in docs.values() for t in tokens(g['gloss']))
def context(sid):
 el=synsets[sid];return el.findtext('Definition','')+' '+' '.join(e.text or '' for e in el.findall('Example'))
# Explicitly checked translations of short English definitions.
gloss_zh={
 'call forth':'引起；產生；滋生','bring about':'引起；導致','give rise to':'引起；促成','call to mind':'使想起',
 'go together':'相配；一起出現','be relevant to':'與……有關','make reference to':'提及；參照','seek information from':'向……詢問',
 'provide evidence for':'為……提供證據','express in words':'用言語表達','be of use':'有用；幫得上忙',
 'have need of':'需要','make an investment':'投資','give or supply':'給予；提供','give food to':'餵食',
 'search or seek':'尋找','financially safe':'財務上穩健的','not forged':'非偽造的；真實的','possessing life':'活著的',
 'a productive insight':'有啟發性的見解','in good time':'及時；及早','come to terms':'達成協議；接受現實',
 'come forth':'出現；顯露','be received':'被接收；獲得回應','a promise':'承諾','a demand':'要求；需求',
 'ten 10s':'一百','noticeable heterogeneity':'明顯的多樣性','concurrence of opinion':'意見一致',
 'lowercase':'小寫字母','uppercase':'大寫字母','excellent':'極好的','crowded':'擁擠的',
 'lacking fresh air':'不通風的；悶的','become closed':'關閉；合起來',
 'have young (animals) or reproduce (organisms)':'繁殖；生育',
 'copulate with a female, used especially of horses':'與雌性動物交配；為母馬配種'
}
# These are authored for the actual sense, never obtained by substituting synonyms.
overrides={
 ('spawn','call forth'):('引起；產生','Neglect can spawn serious problems.','疏忽可能引發嚴重的問題。'),
 ('engender','call forth'):('引起；造成','Unfair rules can engender resentment.','不公平的規則可能引發怨恨。'),
 ('cover','copulate with a female, used especially of horses'):('與雌性動物交配；為母馬配種','The stallion covered the mare in spring.','這匹公馬在春天與母馬配種。'),
 ('multiply','have young (animals) or reproduce (organisms)'):('繁殖','Rabbits multiply rapidly when food is plentiful.','食物充足時，兔子會迅速繁殖。')
}
choices={};stats=Counter()
for sid,g in docs.items():
 exs=[e.text for e in synsets[sid].findall('Example') if e.text]
 for t in g['terms']:
  term=t['word'];key=(sid,term)
  if key in choices:continue
  options=[p for p in dictionary.get(term,[]) if p['pos']==g['pos']]
  forms=set([term,*[v for p in options for v in p['forms'] if re.fullmatch(r"[a-z][a-z '\-]*",v)]])
  pattern=re.compile(r'(?<![A-Za-z])(?:'+'|'.join(re.escape(x) for x in sorted(forms,key=len,reverse=True))+r')(?![A-Za-z])',re.I)
  def sentence_like(en):
   words=re.findall('[A-Za-z]+',en)
   if len(words)<4:return False
   if re.match(r'^(a|an) ',en,re.I) and not en.endswith(('.', '!', '?')):return False
   return bool(re.search(r'\b(is|are|was|were|be|has|have|had|can|could|will|would|should|must|may|might|did|does)\b',en,re.I) or re.match(r'^(I|we|they|he|she|it|you)\b',en,re.I) or en.endswith(('.', '!', '?')))
  exact=[e for e in exs if pattern.search(e) and sentence_like(e)]
  # OEWN often supplies a noun phrase rather than a full sentence. A copula
  # makes the attested phrase a sentence without swapping any synonyms.
  phrases=[e for e in exs if pattern.search(e) and re.match(r'^(a|an|the) [a-z]',e) and not sentence_like(e) and len(re.findall('[A-Za-z]+',e))>=3 and not re.search(r'\b(of|with|for|to|and|or|in|on|at)$',e) and not any(c in e for c in ';:') and g['pos'] in {'noun','adj'} and len(re.findall('[A-Za-z]+',e))<=6 and not re.search(r'\b(who|that|which|while|when|ran|sat|ate|went|came|saw|said|wrote|took|gave|left|grew|became)\b|\b[a-z]{3,}ed\b',e,re.I) and not re.search(r'(ly|ing|ed)$',e)]

  corpus=context(sid);target=tokens(term)
  ct=tokens(corpus)-target
  best=None
  for p in options:
   for sense in p['senses']:
    for ex in sense['examples']:
     en=ex.get('text','')
     if not en or not pattern.search(en) or not sentence_like(en):continue
     et=tokens(en)-target;overlap=ct&et
     score=sum(math.log((len(docs)+1)/(df[x]+1)) for x in overlap)
     same=any(re.sub(r'\W+','',en.lower())==re.sub(r'\W+','',e.lower()) for e in exs)
     single=len(member_senses[(term,g['pos'])])==1 and sum(len(p['senses']) for p in options)==1
     valid=same or (len(overlap)>=4 and score>=30) or single
     if valid and (best is None or (same,score)>(best[0],best[1])):best=(same,score,sense['zh'],en,ex.get('translation',''))
  override=overrides.get((term,g['gloss']))
  if override:
   zh,en,translation=override;choice={'zh':zh,'example':{'en':en,'zh':translation,'source':'wordlilium authored for this sense'},'exampleMatch':'authored'}
  elif best:
   _,_,zh,en,translation=best;choice={'zh':cc.convert(zh),'example':{'en':en,'zh':cc.convert(translation),'source':'Open Dictionary v2.0 / Wiktionary'},'exampleMatch':'sense-context'}
  elif exact:
   choice={'zh':gloss_zh.get(g['gloss'],''),'example':{'en':exact[0][0].upper()+exact[0][1:],'zh':'','source':'Open English WordNet 2025'},'exampleMatch':'same-synset'}
  elif phrases:
   choice={'zh':gloss_zh.get(g['gloss'],''),'example':{'en':'It was '+phrases[0].rstrip('.!?')+'.','zh':'','source':'Adapted from an Open English WordNet 2025 usage phrase'},'exampleMatch':'source-phrase-adapted'}
  else:choice={'zh':'','example':None,'exampleMatch':'unavailable'}
  choices[key]=choice
for w in data['byWord'].values():
 shown=0
 for g in w['groups']:
  g['zh']=gloss_zh.get(g['gloss'],'')
  for t in g['terms']:
   t.update(choices[(g['id'],t['word'])]);stats[t['exampleMatch']]+=1
   if t['example']:shown+=1
 if shown:stats['wordsWithDisplayableExamples']+=1
stats['queriedWords']=len(data['byWord']);stats['candidateRows']=sum(len(g['terms']) for w in data['byWord'].values() for g in w['groups'])
data['meta']['exampleCoverage']=dict(stats)
data['meta']['examplePolicy']='Only rows with an attested or explicitly authored sense example are displayed. Generic dictionary glosses are removed; English synset meaning is authoritative. Context matching is heuristic, not a claim of human review of all entries.'
old_notice=data['meta']['notice']
new_notice=old_notice.replace('English definitions retained; Chinese glosses from the existing dictionary may describe another sense.', 'English synset meanings are authoritative. Chinese glosses are included only with a sense match. Examples also use Open Dictionary v2.0 / Wiktionary (CC BY-SA 4.0), OEWN source phrase adaptations, and wordlilium-authored sentences. Unsupported rows are not displayed.')
data['meta']['notice']=new_notice
cp=ROOT/'dist/data/wordgrove-catalog.json'
catalog=json.loads(cp.read_text(encoding='utf-8'))
catalog['meta']['sourceNotice']=catalog['meta']['sourceNotice'].replace(old_notice,new_notice)
cp.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(ROOT/'catalog.js').write_text('globalThis.WG_CATALOG='+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
(ROOT/'dist/data/SYNONYM-SOURCES.md').write_text('# Synonym data and examples\n\n'+new_notice+'\n\n'+data['meta']['examplePolicy']+'\n\n'+json.dumps(dict(stats),ensure_ascii=False,indent=2),encoding='utf-8')
f.write_text('globalThis.WG_RELATIONS='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
(ROOT/'dist/data/synonym-example-coverage.json').write_text(json.dumps(dict(stats),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(stats),ensure_ascii=False,indent=2))
