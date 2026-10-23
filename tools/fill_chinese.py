"""Fill missing Chinese text offline; retain human translations and provenance."""
from pathlib import Path
from collections import Counter
import concurrent.futures,json,re,sys,time
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT.parent.parent/'work'
sys.path[:0]=[str(WORK/'translation-vendor'),str(WORK/'vendor')]
sys.stdout.reconfigure(encoding='utf-8')
import ctranslate2,sentencepiece as spm
from opencc import OpenCC
cc=OpenCC('s2twp');cp=ROOT/'dist/data/wordgrove-catalog.json';catalog=json.loads(cp.read_text(encoding='utf-8'))
rp=ROOT/'relations.js';raw=rp.read_text(encoding='utf-8');relations=json.loads(raw.split('=',1)[1].strip().removesuffix(';'))
# Replace only the earlier unreviewed machine translations in memory.
for w in catalog['words']:
 for sense in w['senses']:
  for e in sense['examples']:
   if 'automatic' in e.get('zhSource',''):e['zh']=''
for record in relations['byWord'].values():
 for g in record['groups']:
  if any(t.get('example') for t in g['terms']) and 'automatic' in g.get('zhSource',''):g['zh']=''
  for term in g['terms']:
   if 'automatic' in term.get('zhSource',''):term['zh']=''
   e=term.get('example')
   if e and 'automatic' in e.get('zhSource',''):e['zh']=''
def key(en):return re.sub(r'\s+',' ',en.replace('’',"'").replace('‘',"'")).strip().casefold()
cache_path=WORK/'synonyms/chinese-nllb-cache.json'
cache=json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {}
human={}
for w in catalog['words']:
 for s in w['senses']:
  for e in s['examples']:
   if e.get('zh'):human.setdefault(key(e['en']),e['zh'])
for r in relations['byWord'].values():
 for g in r['groups']:
  if g.get('zh') and 'automatic' not in g.get('zhSource',''):human.setdefault(key(g['gloss']),g['zh'])
  for t in g['terms']:
   e=t.get('example')
   if e and e.get('zh'):human.setdefault(key(e['en']),e['zh'])
# Recover exact existing translations before generating any new text.
source_cache=WORK/'synonyms/entry-examples.json'
if source_cache.exists():
 for groups in json.loads(source_cache.read_text(encoding='utf-8')).values():
  for group in groups:
   for s in group['senses']:
    for e in s['examples']:
     if e.get('text') and e.get('translation'):human.setdefault(key(e['text']),cc.convert(e['translation']))
manual={
 'be a mystery or bewildering to':'使人困惑；讓人摸不著頭緒',
 'reach a destination, either real or abstract':'到達某處；達到某種程度或狀態',
 'a person of a specified kind (usually with many eccentricities)':'某種類型的人（通常有不少怪癖）',
 'call forth':'引起；產生；滋生',
 'have young (animals) or reproduce (organisms)':'繁殖；生育',
 'copulate with a female, used especially of horses':'與雌性動物交配；為母馬配種',
 'it was the capable type.':'那是能幹的那一類人。',
 'it was a land of make-believe.':'那是個虛構的世界。',
 'we barely made it to the finish line':'我們勉強抵達了終點線。',
 'my phone has barely any battery left.':'我的手機電量幾乎耗盡了。',
 'we have been exchanging letters for a year':'我們通信已經一年了。',
 'we have been exchanging letters for a year.':'我們通信已經一年了。',
 'the actor is famous for his tragic roles.':'這位演員以飾演悲劇角色而聞名。',
 'wind around something in coils or loops':'以螺旋或環狀纏繞在某物上',
 'it was a risque story.':'那是個略帶色情意味的故事。',
 'animal hunted or caught for food':'被獵捕作為食物的動物；獵物',
 'it was a few wispy memories of childhood.':'那是些模糊而零碎的童年回憶。',
 'he maintained his innocence':'他堅稱自己是清白的。'
}
human.update({key(en):zh for en,zh in manual.items()})
needed={}
def add(en):
 k=key(en)
 if k not in human and k not in cache:needed.setdefault(k,en)
for w in catalog['words']:
 for s in w['senses']:
  for e in s['examples']:
   if not e.get('zh'):add(e['en'])
for r in relations['byWord'].values():
 for g in r['groups']:
  if not g.get('zh'):add(g['gloss'])
  for t in g['terms']:
   e=t.get('example')
   if e and not e.get('zh'):add(e['en'])
print('existing bilingual references',len(human),'unique texts to translate',len(needed),'cached',len(cache),flush=True)
source=spm.SentencePieceProcessor(model_file=str(WORK/'nllb-model/sentencepiece.bpe.model'))
target=source
model=ctranslate2.Translator(str(WORK/'nllb-model'),device='cpu',compute_type='int8',inter_threads=2,intra_threads=6)
items=sorted(needed.items(),key=lambda x:len(x[1]));batches=[items[i:i+96] for i in range(0,len(items),96)]
def translate(batch):
 inputs=[['eng_Latn']+source.encode(en,out_type=str)+['</s>'] for k,en in batch]
 results=model.translate_batch(inputs,target_prefix=[['zho_Hant']]*len(inputs),beam_size=2,max_decoding_length=160,repetition_penalty=1.12,max_batch_size=96)
 return [(k,cc.convert(target.decode(r.hypotheses[0][1:])).strip()) for (k,en),r in zip(batch,results)]
started=time.time()
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 pending=iter(batches);active=[]
 for _ in range(4):
  b=next(pending,None)
  if b:active.append(pool.submit(translate,b))
 done_count=0
 while active:
  done,not_done=concurrent.futures.wait(active,return_when=concurrent.futures.FIRST_COMPLETED)
  active=list(not_done)
  for future in done:
   values=future.result();cache.update(values);done_count+=len(values)
   b=next(pending,None)
   if b:active.append(pool.submit(translate,b))
  if done_count%480==0 or not active:
   cache_path.write_text(json.dumps(cache,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
   print('translated',done_count,'/',len(items),'seconds',round(time.time()-started),flush=True)
cache_path.write_text(json.dumps(cache,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
# Re-run questionable empty/Latin-only results with an explicit context sentence.
issues=[]
for k,en in needed.items():
 zh=cache.get(k,'')
 if not re.search('[\u3400-\u9fff]',zh) or re.search(r'(.{2,8})\1{3}',zh):issues.append((k,en,zh))
if issues:
 (WORK/'synonyms/translation-issues.json').write_text(json.dumps(issues,ensure_ascii=False,indent=2),encoding='utf-8')
 print('translation issues',len(issues),flush=True)
 for k,en,old in issues:
  out=model.translate_batch([['eng_Latn']+source.encode('In this context, it means: '+en,out_type=str)+['</s>']],target_prefix=[['zho_Hant']],beam_size=5,max_decoding_length=160,repetition_penalty=1.25)[0]
  zh=cc.convert(target.decode(out.hypotheses[0][1:])).strip()
  zh=re.sub(r'^在[這此].{0,12}?[：:]','',zh).strip()
  if not re.search('[\u3400-\u9fff]',zh):raise ValueError('Needs manual translation: '+en+' => '+zh)
  cache[k]=zh
 cache_path.write_text(json.dumps(cache,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
def get(en):
 k=key(en)
 return (human[k],'existing bilingual source') if k in human else (cache[k],'NLLB automatic translation; normalized to Traditional Chinese')
stats=Counter()
for w in catalog['words']:
 for s in w['senses']:
  for e in s['examples']:
   if not e.get('zh'):
    e['zh'],e['zhSource']=get(e['en']);stats['baseExamplesFilled']+=1
for r in relations['byWord'].values():
 for g in r['groups']:
  if not g.get('zh'):g['zh'],g['zhSource']=get(g['gloss']);stats['synonymMeaningsFilled']+=1
  for t in g['terms']:
   t['zh']=g['zh'];t['zhSource']=g.get('zhSource','same synset meaning')
   e=t.get('example')
   if e and not e.get('zh'):e['zh'],e['zhSource']=get(e['en']);stats['synonymExamplesFilled']+=1
notice='Missing Chinese meanings and examples translated offline with NLLB-200 distilled 600M (CTranslate2 conversion JustFrederik/nllb-200-distilled-600M-ct2-int8 at 302d78f00e6fdb50a1064059df7c392b735e9d05), normalized with OpenCC. Existing bilingual sources retained; some frequent errors manually corrected. Unpublished rows retain earlier OPUS-MT translations. Automatic output is not fully human reviewed. Model: https://huggingface.co/facebook/nllb-200-distilled-600M (CC BY-NC 4.0); weights are local build assets and are not shipped with the website.'
relations['meta']['chineseTranslation']={'method':'offline NLLB for visible entries; existing OPUS-MT for unpublished entries; OpenCC','notice':notice,'stats':dict(stats)}
catalog['meta']['sourceNotice']=re.sub(r'\n\nMissing Chinese meanings[^\n]*','',catalog['meta']['sourceNotice'])
if notice not in catalog['meta']['sourceNotice']:catalog['meta']['sourceNotice']+='\n\n'+notice
cp.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(ROOT/'catalog.js').write_text('globalThis.WG_CATALOG='+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
rp.write_text('globalThis.WG_RELATIONS='+json.dumps(relations,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
(ROOT/'dist/data/CHINESE-TRANSLATION.md').write_text('# Chinese translations\n\n'+notice+'\n\n'+json.dumps(dict(stats),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(stats),ensure_ascii=False,indent=2),flush=True)
