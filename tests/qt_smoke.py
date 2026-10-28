"""Prueba de integración con Chromium/QWebChannel real, sin hardware ni disco de usuario.

Ejecutar desde la raíz: python tests/qt_smoke.py
"""
import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault('QTWEBENGINE_CHROMIUM_FLAGS', '--use-gl=angle --use-angle=d3d11')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main
from PyQt6.QtCore import QTimer, QUrl
from PyQt6.QtWidgets import QApplication
from PyQt6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebChannel import QWebChannel
from core import ControladorGRBL, ProcesadorGCode, PuenteCNC


class Pagina(QWebEnginePage):
    errores = []

    def javaScriptConsoleMessage(self, nivel, mensaje, linea, fuente):
        if nivel == QWebEnginePage.JavaScriptConsoleMessageLevel.ErrorMessageLevel:
            self.errores.append(f'{fuente}:{linea}: {mensaje}')


# WebEngine necesita argv[0] para inicializar Chromium en esta instalación de Windows.
main.configurar_entorno_grafico()
app = QApplication(sys.argv)
controlador = ControladorGRBL()
controlador.escanear_puertos = lambda: []
temporal = tempfile.TemporaryDirectory(prefix='cnc-qt-test-')
puente = PuenteCNC(controlador, ProcesadorGCode(), ruta_historial=Path(temporal.name)/'historial.json')
puente.temporizador_hotplug.stop()
perfil = QWebEngineProfile()  # Perfil en memoria: no toca localStorage del usuario.
pagina = Pagina(perfil)
canal = QWebChannel(pagina)
canal.registerObject('puenteCNC', puente)
pagina.setWebChannel(canal)
vista = QWebEngineView()
vista.setPage(pagina)
vista.resize(1480, 880)
resultado = {'codigo': 1}


def terminar(ok, mensaje):
    print(mensaje)
    resultado['codigo'] = 0 if ok else 1
    app.quit()


def comprobar(valor):
    if not isinstance(valor, dict):
        terminar(False, f'FAIL: respuesta JS inesperada: {valor!r}')
        return
    ok = valor.get('puente') and valor.get('escapado') and not valor.get('inyectado') and not pagina.errores
    terminar(ok, f'QT SMOKE {"OK" if ok else "FAIL"}: {valor}; errores JS={pagina.errores}')


def verificar():
    pagina.runJavaScript('''({
      puente: !!window.puenteCNC,
      escapado: document.getElementById('gcode-lines-container').textContent.includes('<img'),
      inyectado: !!window.__inyeccionPrueba
    })''', comprobar)


def preparar(listo):
    if not listo:
        QTimer.singleShot(100, iniciar)
        return
    pagina.runJavaScript('''(() => {
      const input = document.getElementById('file-input-gcode');
      const dt = new DataTransfer();
      dt.items.add(new File(['; <img src=x onerror="window.__inyeccionPrueba=true">\\nG0X1'], 'prueba.nc'));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));
    })()''')
    QTimer.singleShot(800, verificar)


def iniciar():
    pagina.runJavaScript("!!window.puenteCNC && !!document.getElementById('file-input-gcode')", preparar)


pagina.load(QUrl.fromLocalFile(str(Path('gui/index.html').resolve())))
QTimer.singleShot(500, iniciar)
QTimer.singleShot(20000, lambda: terminar(False, 'FAIL: timeout cargando la interfaz Qt'))
app.exec()
puente.destruir()
vista.close()
pagina.deleteLater()
app.processEvents()
temporal.cleanup()
sys.exit(resultado['codigo'])
