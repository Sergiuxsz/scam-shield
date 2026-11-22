"""Regenerate the two generated files the app loads:

  design-system/tokens.css   from design-system/tokens.json
  src/catalog.js             from ../../data/official_catalog.json

The app is opened straight from disk (file://), where browsers block fetch(),
so both are compiled to plain CSS / a classic script.

Run from anywhere:  python app/tools/build.py
"""
import json
import os

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT = os.path.join(os.path.dirname(os.path.dirname(APP)), 'data')  # repo/data: official_catalog.json


def build_tokens():
    with open(os.path.join(APP, 'design-system', 'tokens.json'), encoding='utf-8') as f:
        t = json.load(f)
    themes = [th['id'] for th in t['color']['themes']]
    first, others = themes[0], themes[1:]

    def color_value(tok, theme):
        v = tok['value']
        if isinstance(v, str):
            raw = v
        else:
            raw = v.get(theme, v.get(first))
        if raw.startswith('{') and raw.endswith('}'):
            return 'var(--%s)' % raw[1:-1]
        return raw

    def per_theme(family, theme):
        lines = []
        for tok in t.get(family, {}).get('tokens', []):
            lines.append('  --%s: %s;' % (tok['name'], color_value(tok, theme)))
        return lines

    out = ['/* Scam Shield — generated from tokens.json by tools/build.py. Do not edit. */']
    base = per_theme('color', first) + per_theme('shadow', first)
    out.append(':root {\n' + '\n'.join(base) + '\n  color-scheme: light;\n}')
    for th in others:
        block = '\n'.join(per_theme('color', th) + per_theme('shadow', th))
        out.append('@media (prefers-color-scheme: %s) {\n  :root:not([data-theme="%s"]) {\n%s\n    color-scheme: %s;\n  }\n}'
                   % (th, first, block.replace('\n', '\n  ').replace('  --', '    --', 1), th))
        out.append(':root[data-theme="%s"] {\n%s\n  color-scheme: %s;\n}' % (th, block, th))
    statics = []
    for fam in ('spacing', 'radius', 'size'):
        for tok in t.get(fam, {}).get('tokens', []):
            statics.append('  --%s: %s;' % (tok['name'], tok['value']))
    for key, stack in t['type']['families'].items():
        statics.append('  --font-%s: %s;' % (key, stack))
    out.append(':root {\n' + '\n'.join(statics) + '\n}')
    with open(os.path.join(APP, 'design-system', 'tokens.css'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(out) + '\n')


def build_catalog():
    with open(os.path.join(KIT, 'official_catalog.json'), encoding='utf-8') as f:
        cat = json.load(f)
    js = ('/* Generated from official_catalog.json by tools/build.py. Do not edit. */\n'
          '(typeof window !== "undefined" ? window : globalThis).SS_CATALOG = ' +json.dumps(cat, ensure_ascii=False, indent=2) + ';\n')
    with open(os.path.join(APP, 'src', 'catalog.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)


if __name__ == '__main__':
    build_tokens()
    build_catalog()
    print('tokens.css and catalog.js written')
