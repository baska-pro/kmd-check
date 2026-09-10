from pathlib import Path

p = Path('scripts/apply_kmd_hotfix.py')
s = p.read_text(encoding='utf-8')
old = "result, count = pattern.subn(replacement.rstrip() + '\\n\\n', text, count=1)"
new = "result, count = pattern.subn(lambda _m: replacement.rstrip() + '\\n\\n', text, count=1)"
if old not in s:
    raise SystemExit('patcher target not found')
p.write_text(s.replace(old, new, 1), encoding='utf-8')
print('patcher escape fixed')
