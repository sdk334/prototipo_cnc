"""Ejecuta la interfaz real en Chrome headless con un perfil temporal aislado."""
import os
import subprocess
import tempfile
from pathlib import Path

chrome = Path(os.environ.get('PROGRAMFILES', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe'
if not chrome.exists():
    raise SystemExit('No se encontró Chrome para la prueba de integración.')
with tempfile.TemporaryDirectory(prefix='cnc-browser-test-') as perfil:
    resultado = subprocess.run([
        str(chrome), '--headless=new', '--no-first-run', '--disable-gpu',
        '--disable-background-networking', '--allow-file-access-from-files',
        '--host-resolver-rules=MAP * ~NOTFOUND', '--virtual-time-budget=5000',
        '--user-data-dir='+perfil, '--dump-dom', Path('tests/browser_smoke.html').resolve().as_uri(),
    ], capture_output=True, encoding='utf-8', errors='replace', timeout=30)
    if '<pre id="resultado">BROWSER_SMOKE_OK:' not in resultado.stdout:
        print(resultado.stdout[-6000:])
        print(resultado.stderr[-3000:])
        raise SystemExit(1)
    print('BROWSER SMOKE OK: interfaz real, carga de archivo, HTML escapado, G20/G91 compacto.')
