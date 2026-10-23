"""Build offline synonym tables from OEWN and count official GSAT papers."""
from pathlib import Path
import gzip,hashlib,json,re,sys,xml.etree.ElementTree as ET
from collections import Counter,defaultdict
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT.parent.parent/'work'
cp=ROOT/'dist/data/wordgrove-catalog.json';catalog=json.loads(cp.read_text(encoding='utf-8'));words=catalog['words']
source=WORK/'synonyms/english-wordnet-2025.xml.gz'
lex=ET.fromstring(gzip.decompress(source.read_bytes())).find('Lexicon')
entries={};sense_entry={};by_term=defaultdict(list);posmap={'n':'noun','v':'verb','a':'adj','s':'adj','r':'adv'}
for e in lex.findall('LexicalEntry'):
 lemma=e.find('Lemma');item={'word':lemma.get('writtenForm').lower(),'pos':posmap.get(lemma.get('partOfSpeech'),lemma.get('partOfSpeech')),'senses':e.findall('Sense')}
 entries[e.get('id')]=item;by_term[item['word']].append(item)
 for sense in item['senses']:sense_entry[sense.get('id')]=item
synsets={s.get('id'):s for s in lex.findall('Synset')};local={w['word'].lower():w for w in words}
def zh(term,pos):
 w=local.get(term)
 return next((s for s in w['senses'] if s.get('pos')==pos),w['senses'][0])['zh'] if w else ''
alias=defaultdict(set)
for w in words:
 for term in [w['word'],*w.get('forms',[]),*(t for s in w['senses'] for t in [s.get('term',''),*s.get('forms',[])])]:
  term=term.lower()
  if re.fullmatch('[a-z]{3,}',term):alias[term].add(w['id'])
annual=defaultdict(dict)
for year in range(111,116):
 counts=Counter(re.findall(r"[a-z]+(?:'[a-z]+)?",(WORK/f'gsat/{year}.txt').read_text(encoding='utf-8').lower()))
 for term,n in counts.items():
  ids=alias.get(term,set())
  if len(ids)==1:
   wid=next(iter(ids));annual[wid][str(year)]=annual[wid].get(str(year),0)+n
stop=set('the and for but not you your our their they them this that these those with from into than then have has had can could would should will may might must been being are was were does did also very more most some any all each other such what which when where there here who why how its his her she him it one two first second third use used using see said say like make made take taken get got'.split())
stop.update('be do about out over under off up down on upon since between through during'.split())
highfreq=[]
for w in words:
 w['categories']=[c for c in w['categories'] if c!='highfreq'];w.pop('frequency',None)
 counts=annual[w['id']]
 if len(counts)>=2 and sum(counts.values())>=3 and w['word'].lower() not in stop and any(s.get('pos') in {'noun','verb','adj','adv'} for s in w['senses']):
  w['frequency']={'years':sorted(map(int,counts)),'yearCount':len(counts),'total':sum(counts.values()),'counts':counts}
  if 'highfreq' not in w['categories']:w['categories'].append('highfreq')
  highfreq.append(w)
highfreq.sort(key=lambda w:(-w['frequency']['yearCount'],not bool(w.get('level',0)>=3),-w['frequency']['total'],w['word']));rank={w['id']:i for i,w in enumerate(highfreq)}
data={};stats=Counter()
for w in sorted(words,key=lambda w:(rank.get(w['id'],99999),w['word'])):
 terms=list(dict.fromkeys([w['word'].lower(),*(s.get('term',w['word']).lower() for s in w['senses'])]));groups=[];seen=set();derived=set();matched=False
 for term in terms:
  for entry in by_term.get(term,[]):
   matched=True
   for sense in entry['senses']:
    for rel in sense.findall('SenseRelation'):
     if rel.get('relType')=='derivation':
      target=sense_entry.get(rel.get('target'))
      if target and target['word'] not in terms:derived.add(target['word'])
    sid=sense.get('synset')
    if sid in seen:continue
    seen.add(sid);synset=synsets[sid];members=[]
    for member in synset.get('members','').split():
     item=entries.get(member)
     if not item or item['word'] in terms or not re.fullmatch(r"[a-z][a-z '\-]*",item['word']):continue
     target=local.get(item['word']);members.append({'word':item['word'],'zh':zh(item['word'],item['pos']),'id':target['id'] if target else None})
    members.sort(key=lambda m:(rank.get(m['id'],99999),not bool(m['id']),len(m['word']),m['word']))
    if members:groups.append({'id':sid,'pos':entry['pos'],'gloss':synset.findtext('Definition',''),'terms':members})
 status='found' if groups else 'no_synonyms' if matched else 'no_entry'
 data[w['id']]={'status':status,'groups':groups,'derived':sorted(derived)};stats[status]+=1;stats['groups']+=len(groups);stats['links']+=sum(len(g['terms']) for g in groups)
families=[g.split() for g in ['safe safety safely','danger dangerous dangerously','success successful successfully succeed','care careful carefully careless','beauty beautiful beautifully','health healthy healthily','confidence confident confidently','difference different differently differ','importance important importantly','decision decide decisive','choice choose chosen','advice advise advisable','belief believe believable','creation create creative creativity','protection protect protective','ability able enable','strength strong strengthen','length long lengthen','width wide widen','depth deep deepen','thought think thoughtful','growth grow grown','knowledge know knowledgeable','description describe descriptive','education educate educational','responsibility responsible responsibly','science scientific scientist','comfort comfortable comfortably','satisfaction satisfy satisfied satisfactory']]
notice='Open English WordNet 2025, Open English WordNet Community; CC BY 4.0. Synsets and derivational relations extracted from the official WN-LMF release. English definitions retained; Chinese glosses from the existing dictionary may describe another sense. Synonyms are not guaranteed interchangeable in sentences. https://en-word.net/downloads ; https://creativecommons.org/licenses/by/4.0/'
meta={'source':'Open English WordNet 2025','url':'https://en-word.net/downloads','license':'CC BY 4.0','queriedWords':len(words),'stats':dict(stats),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'notice':notice,'highFrequencyWords':len(highfreq),'frequencyScope':'111–115 official GSAT papers, >=2 years and >=3 recorded-form occurrences; excludes common function words; includes questions, options and passages.'}
(ROOT/'relations.js').write_text('globalThis.WG_RELATIONS='+json.dumps({'meta':meta,'byWord':data,'families':families},ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
(ROOT/'dist/data/synonym-coverage.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'dist/data/GSAT-HIGH-FREQUENCY.json').write_text(json.dumps([{'id':w['id'],'word':w['word'],**w['frequency']} for w in highfreq],ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'dist/data/SYNONYM-SOURCES.md').write_text('# Synonym data\n\n'+notice+'\n\n'+json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
catalog['meta']['highFrequencyCount']=len(highfreq)
if notice not in catalog['meta']['sourceNotice']:catalog['meta']['sourceNotice']+='\n\n'+notice+'\n高頻分類：111–115 學測正式試卷中至少兩年出現、原字形與字庫收錄變化共至少三次；排除部分常見功能字，包含題幹、選項與文章，非必考保證。'
cp.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(ROOT/'catalog.js').write_text('globalThis.WG_CATALOG='+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print(json.dumps(meta,ensure_ascii=False,indent=2))
