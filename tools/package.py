"""Package this buildless site as a standalone HTML file and source ZIP."""
from pathlib import Path
import base64,re,zipfile

ROOT=Path(__file__).resolve().parents[1]
dist=ROOT/'dist'
html=(dist/'index.html').read_text(encoding='utf-8')
for css_name in ['style.css','features.css']:
    css=(dist/css_name).read_text(encoding='utf-8')
    def embed_font(match):
        name=match.group(1)
        asset=dist/name.removeprefix('./')
        mime='font/ttf' if asset.suffix.lower()=='.ttf' else 'font/woff2'
        return 'url("data:'+mime+';base64,'+base64.b64encode(asset.read_bytes()).decode('ascii')+'")'
    css=re.sub(r'url\("(\.?/?[^":]+\.(?:TTF|ttf|woff2))"\)',embed_font,css)
    html=html.replace(f'<link rel="stylesheet" href="{css_name}">','<style>'+css+'</style>')
for script in ['catalog.js','model.js','app.js']:
    code=(dist/script).read_text(encoding='utf-8')
    # Keep source code inside one script element even if content contains HTML.
    code=re.sub(r'</script',r'<\/script',code,flags=re.IGNORECASE)
    html=html.replace(f'<script src="{script}"></script>','<script>'+code+'</script>')
assert '<script src=' not in html
assert 'data:font/ttf;base64,' in html
out=ROOT.parent
(out/'Wordgrove.html').write_text(html,encoding='utf-8')
(out/'index.html').write_text(html,encoding='utf-8')
with zipfile.ZipFile(out/'Wordgrove-source.zip','w',zipfile.ZIP_DEFLATED) as z:
    z.write(out/'index.html','index.html')
    for base in [dist,ROOT/'tools']:
        for f in sorted(base.rglob('*')):
            if f.is_file() and f.name not in ['app-v2.js','index-v2.html']:
                z.write(f,'wordgrove/'+f.relative_to(ROOT).as_posix())
    z.write(ROOT/'README.md','wordgrove/README.md')
print('Built root index.html, Wordgrove.html and Wordgrove-source.zip.')
