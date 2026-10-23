"""Build the independent TOEIC category without changing CEEC word/sense IDs."""
from pathlib import Path
import csv,io,json,hashlib,re,sys
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'dist/data'
sys.path.insert(0,str(ROOT.parent.parent/'work/vendor'))
from opencc import OpenCC
cc=OpenCC('s2twp')
rows=list(csv.DictReader(io.StringIO((DATA/'TOEIC-TSL-1.2.csv').read_bytes().decode('cp1252'))))
base=json.loads((DATA/'wordgrove-catalog.json').read_text(encoding='utf-8'))['words']
source=json.loads((DATA/'TOEIC-DICTIONARY-SOURCE.json').read_text(encoding='utf-8'))
normalize=lambda s:s.casefold().strip()
word_by={normalize(w['word']):w for w in base}
alias={}
for w in base:
 for term in [w['word'],*w.get('forms',[])]:alias.setdefault(normalize(term),w)
alias['résumé']=word_by['resume']
alias['congratulation']=word_by['congratulation(s)']
alias['headquarter']=word_by['headquarters']
manual={}
for line in (DATA/'TOEIC-SUPPLEMENT.txt').read_text(encoding='utf-8').splitlines():
 term,pos,zh,en1,zh1,en2,zh2=line.split('|')
 manual[term]=(pos,zh,en1,zh1,en2,zh2)
new_words=[];mapping=[];ranked={}
posmap={'adjective':'adj','adverb':'adv','preposition':'prep','conjunction':'conj','pronoun':'pron','determiner':'det','interjection':'intj','numeral':'num'}
irregular={'overpay':['overpaid','overpaying','overpays'],'proofread':['proofreads','proofreading'],'recur':['recurs','recurred','recurring'],'sightsee':['sightsees','sightseeing','sightsaw','sightseen'],'housekeep':['housekeeps','housekept','housekeeping']}
def manual_forms(term,pos):
 forms=[term]
 if pos=='verb':
  forms+=irregular.get(term,[])
  if term not in irregular:
   forms+=[term[:-1]+'ies' if re.search('[^aeiou]y$',term) else term+'s']
   forms+=[term[:-1]+'ied' if re.search('[^aeiou]y$',term) else term+'d' if term.endswith('e') else term+'ed']
   forms+=[term[:-1]+'ing' if term.endswith('e') else term+'ing']
 if pos=='noun':forms+=[term[:-1]+'ies' if re.search('[^aeiou]y$',term) else term+'s']
 return list(dict.fromkeys(forms))
def senses_for(term):
 if term in manual:
  pos,zh,en1,zh1,en2,zh2=manual[term]
  return [{'id':'toeic-core-1','term':term,'forms':manual_forms(term,pos),'pos':pos,'zh':zh,'examples':[{'en':en1,'zh':zh1,'source':'Lilivm 補寫'},{'en':en2,'zh':zh2,'source':'Lilivm 補寫'}],'priority':'core','source':'Lilivm 補寫；詞目依 TSL 1.2','license':'CC BY-SA 4.0'}]
 entry=source[term];senses=[]
 for g in entry['pos_groups']:
  if g['pos']=='name':continue
  forms=list(dict.fromkeys([term,*[f['text'] for f in g.get('forms',[]) if isinstance(f.get('text'),str) and len(f['text'])<100]]))
  for m in g['meanings']:
   if m.get('priority') not in ['core','common']:continue
   if set(m.get('labels',[]))&{'archaic','obsolete','nonstandard','dialectal'}:continue
   examples=[]
   for e in m.get('examples',[]):
    en=(e.get('text') or '').strip();zh=(e.get('translation') or '').strip()
    if re.search('[\u3400-\u9fff]',en) and not re.search('[\u3400-\u9fff]',zh):en,zh=zh,en
    if en and zh and not any(x['en']==en for x in examples):examples.append({'en':en,'zh':cc.convert(zh),'source':'Open Dictionary v2.0'})
   if not examples:continue
   sid='toeic-od-'+hashlib.sha256((term+'|'+g['pos']+'|'+m['sense_id']+'|'+m['short_gloss']).encode()).hexdigest()[:16]
   if sid in {'toeic-od-4fb06d3f8f46c173','toeic-od-4765a7bcf2997832','toeic-od-23bdbfc0e5190325','toeic-od-0bb48c371fec300c','toeic-od-4592115c017d7297'}:continue
   if term=='unlimited':examples.append({'en':'The plan includes unlimited access to the training videos.','zh':'這項方案包含不限次數觀看培訓影片的權限。','source':'Lilivm 補寫'})
   if term=='internationally':examples.append({'en':'Our products are sold internationally.','zh':'我們的產品銷往世界各國。','source':'Lilivm 補寫'})
   senses.append({'id':sid,'term':term,'forms':forms,'pos':posmap.get(g['pos'],g['pos']),'zh':cc.convert(m['short_gloss']),'explanation':cc.convert(m.get('learner_explanation') or ''),'examples':examples,'priority':m['priority'],'source':'Open Dictionary v2.0 / Wiktionary','sourceUrl':'https://github.com/ahpxex/open-dictionary/releases/tag/v2.0','license':'CC BY-SA 4.0'})
 unique={}
 for sense in senses:
  if sense['id'] not in unique:unique[sense['id']]=sense
  else:
   known={e['en'] for e in unique[sense['id']]['examples']}
   unique[sense['id']]['examples'] += [e for e in sense['examples'] if e['en'] not in known]
 return list(unique.values())
for row in rows:
 term=normalize(row['Word']);rank=int(row['TSL Rank'])
 w=alias.get('salesperson' if term=='salespeople' else term)
 if w is None:
  senses=senses_for(term)
  if not senses:raise ValueError('Missing bilingual senses: '+term)
  forms=list(dict.fromkeys([term,*[f for s in senses for f in s['forms']]]))
  w={'id':'toeic-'+hashlib.sha256(term.encode()).hexdigest()[:20],'word':term,'forms':forms,'categories':['toeic'],'senses':senses,'toeic':{'rank':rank,'sourceWords':[term]}}
  new_words.append(w);alias[term]=w
  for f in forms:alias.setdefault(normalize(f),w)
 mapping.append({'word':term,'rank':rank,'id':w['id'],'sfi':float(row['SFI']) if row['SFI']!='#N/A' else None})
 ranked.setdefault(w['id'],{'id':w['id'],'rank':rank,'sourceWords':[]})['sourceWords'].append(term)
for w in new_words:w['toeic']=dict(ranked[w['id']])
meta={'version':'tsl-1.2-2026-10-23','sourceEntryCount':len(rows),'wordCount':len(ranked),'newWordCount':len(new_words),'existingWordCount':len(ranked)-len(new_words),'senseCount':sum(len(w['senses']) for w in new_words),'exampleCount':sum(len(s['examples']) for w in new_words for s in w['senses']),'sourceUrl':'https://www.newgeneralservicelist.com/toeic-service-list','license':'CC BY-SA 4.0','sourceNotice':'TOEIC Service List (TSL) 1.2，Browne, C. & Culligan, B.；CC BY-SA 4.0。依原始頻率排名排序，部分拼寫／詞形對應現有詞條。字表不是 ETS 官方必考清單，所稱覆蓋率並非單獨學完此表即可達成。中文釋義與例句沿用既有字庫、Open Dictionary v2.0 / Wiktionary，部分由 Lilivm 補寫；CC BY-SA 4.0。完整來源見 data/TOEIC-SOURCES.md。'}
addon={'meta':meta,'existing':[v for key,v in ranked.items() if not key.startswith('toeic-')],'words':new_words,'mapping':mapping}
(DATA/'TOEIC-TSL.json').write_text(json.dumps(addon,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'toeic.js').write_text('/* TSL 1.2 (Browne & Culligan), CC BY-SA 4.0. See dist/data/TOEIC-SOURCES.md. */\nglobalThis.WG_TOEIC='+json.dumps(addon,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print(json.dumps(meta,ensure_ascii=True))
