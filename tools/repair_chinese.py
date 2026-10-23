"""Repair unknown-token output and a small set of checked translation errors."""
from pathlib import Path
import json,re,sys
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT.parent.parent/'work'
sys.stdout.reconfigure(encoding='utf-8')
key=lambda en:re.sub(r'\s+',' ',en.replace('’',"'").replace('‘',"'")).strip().casefold()
manual={
 'sew':'縫紉；縫合','catch fire':'著火；起火','of textiles':'紡織品的；與紡織品有關的',
 'make lively':'使活躍；使生動','wink briefly':'短暫地眨眼','bend a joint':'彎曲關節','eat greedily':'狼吞虎嚥；貪婪地吃',
 'heel over':'向一側傾斜（尤指船隻）','wind around something in coils or loops':'以螺旋或環狀纏繞在某物上',
 'a person of a specified kind (usually with many eccentricities)':'某種類型的人（通常有不少怪癖）',
 'be a mystery or bewildering to':'使人困惑；讓人摸不著頭緒','reach a destination, either real or abstract':'到達某處；達到某種程度或狀態',
 'call forth':'引起；產生；滋生','have young (animals) or reproduce (organisms)':'繁殖；生育',
 'copulate with a female, used especially of horses':'與雌性動物交配；為母馬配種',
 'my phone has barely any battery left.':'我的手機電量幾乎耗盡了。',
 'we have been exchanging letters for a year':'我們通信已經一年了。','we have been exchanging letters for a year.':'我們通信已經一年了。',
 'the actor is famous for his tragic roles.':'這位演員以飾演悲劇角色而聞名。',
 'it was a risque story.':'那是個略帶色情意味的故事。','animal hunted or caught for food':'被獵捕作為食物的動物；獵物',
 'it was a few wispy memories of childhood.':'那是些模糊而零碎的童年回憶。','he maintained his innocence':'他堅稱自己是清白的。',
 'it was the capable type.':'那是能幹的那一類人。','it was a land of make-believe.':'那是個虛構的世界。',
 'we barely made it to the finish line':'我們勉強抵達了終點線。','we barely made it to the finish line.':'我們勉強抵達了終點線。'
}
manual.update(json.loads((ROOT/'dist/data/CHINESE-CORRECTIONS.json').read_text(encoding='utf-8')))
manual={key(k):v for k,v in manual.items()}
opus=json.loads((WORK/'synonyms/chinese-translation-cache.json').read_text(encoding='utf-8'))
cp=ROOT/'dist/data/wordgrove-catalog.json';catalog=json.loads(cp.read_text(encoding='utf-8'))
rp=ROOT/'relations.js';s=rp.read_text(encoding='utf-8');relations=json.loads(s.split('=',1)[1].strip().removesuffix(';'))
def bad(zh):return not isinstance(zh,str) or not re.search('[\u3400-\u9fff]',zh) or any(x in zh for x in ['⁇','�','<unk>'])
count=0;issues=[]
def fix(obj,en):
 global count
 k=key(en)
 if k in manual:obj['zh']=manual[k];obj['zhSource']='wordlilium checked correction';count+=1;return
 if bad(obj.get('zh','')):
  zh=opus.get(k,'')
  if not bad(zh):obj['zh']=zh;obj['zhSource']='OPUS-MT automatic fallback; Traditional Chinese';count+=1
  else:issues.append({'en':en,'zh':obj.get('zh'),'fallback':zh})
for w in catalog['words']:
 for sense in w['senses']:
  for e in sense['examples']:fix(e,e['en'])
for record in relations['byWord'].values():
 for g in record['groups']:
  fix(g,g['gloss'])
  for t in g['terms']:
   t['zh']=g['zh'];t['zhSource']=g.get('zhSource','same synset meaning')
   if t.get('example'):fix(t['example'],t['example']['en'])
(WORK/'synonyms/chinese-final-issues.json').write_text(json.dumps(issues,ensure_ascii=False,indent=2),encoding='utf-8')
if issues:print(json.dumps(issues[:30],ensure_ascii=False,indent=2));raise ValueError(str(len(issues))+' translations need individual correction')
relations['meta']['chineseTranslation']['checkedCorrectionsAndFallbacks']=count
cp.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(ROOT/'catalog.js').write_text('globalThis.WG_CATALOG='+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
rp.write_text('globalThis.WG_RELATIONS='+json.dumps(relations,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print('repaired rows',count,'remaining invalid translations',len(issues))
