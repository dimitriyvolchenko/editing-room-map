"""Add the tested sync module to the existing single-file map; preserve embedded content."""
from pathlib import Path
import hashlib
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'index.html'
EXPECTED_BASE = '74c607714abeea7e084557ca9dfc48926b767c85'

def build():
    raw = TARGET.read_bytes()
    html = raw.decode('utf-8')
    sha = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    if '<!-- er-sync-core:start -->' not in html and sha != EXPECTED_BASE:
        raise SystemExit('Base index changed. Review the new source before rebuilding; nothing was overwritten.')
    before_data = re.search(r'<script id="app-data"[^>]*>(.*?)</script>', html, re.S).group(1)
    html = re.sub(r'<!-- er-sync-core:start -->.*?<!-- er-sync-core:end -->\n?', '', html, flags=re.S)
    html = re.sub(r'/\* er-sync-integration:start \*/.*?/\* er-sync-integration:end \*/\n?', '', html, flags=re.S)
    core = (ROOT / 'sync/core.js').read_text()
    extension = (ROOT / 'sync/integration.js').read_text()
    assert '</script' not in core.lower() and '</script' not in extension.lower()
    marker = '<script>(() => {'
    assert html.count(marker) == 1
    html = html.replace(marker, '<!-- er-sync-core:start -->\n<script id="er-sync-core">\n' + core + '\n</script>\n<!-- er-sync-core:end -->\n' + marker, 1)
    boot = "fillIcons();applyAppIcon();render();if('ResizeObserver' in window)"
    assert html.count(boot) == 1
    html = html.replace(boot, '/* er-sync-integration:start */\n' + extension + '\n/* er-sync-integration:end */\n' + boot, 1)
    assert re.search(r'<script id="app-data"[^>]*>(.*?)</script>', html, re.S).group(1) == before_data
    with tempfile.TemporaryDirectory() as temp:
        for i, (attrs, script) in enumerate(re.findall(r'<script([^>]*)>(.*?)</script>', html, re.S)):
            if 'application/json' in attrs:
                continue
            path = Path(temp) / f'check{i}.js'
            path.write_text(script)
            subprocess.run(['node', '--check', str(path)], check=True)
    TARGET.write_text(html, encoding='utf-8')
    print('Built Editing Room 32.0.0-sync; original app-data unchanged.')

if __name__ == '__main__':
    build()
