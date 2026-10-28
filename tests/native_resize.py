"""Estrés de resize, fullscreen y pérdida de foco en la ventana real, sin hardware."""
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main
from PyQt6.QtCore import Qt, QTimer, QEvent
from PyQt6.QtWidgets import QApplication, QWidget
from PyQt6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile
from core import ControladorGRBL, PuenteCNC


class ControladorPrueba(ControladorGRBL):
    @staticmethod
    def escanear_puertos(): return []


class PaginaPrueba(QWebEnginePage):
    errores = []
    def javaScriptConsoleMessage(self, nivel, mensaje, linea, fuente):
        if nivel == self.JavaScriptConsoleMessageLevel.ErrorMessageLevel:
            self.errores.append(f'{linea}: {mensaje}')


temporal = tempfile.TemporaryDirectory(prefix='cnc-resize-test-')
def crear_puente(*args):
    p = PuenteCNC(*args, ruta_historial=Path(temporal.name)/'historial.json')
    p.temporizador_hotplug.stop()
    return p


# El widget está fuera de pantalla: quitar solo en esta prueba el ahorro de timers
# de ventanas ocluidas para ejercer la misma carga de una ventana visible.
os.environ['QTWEBENGINE_CHROMIUM_FLAGS'] = os.environ.get('QTWEBENGINE_CHROMIUM_FLAGS', '') + ' --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'
main.configurar_entorno_grafico()
app = QApplication(sys.argv)
with patch.object(main, 'ControladorGRBL', ControladorPrueba), \
     patch.object(main, 'PuenteCNC', crear_puente), \
     patch.object(main, 'QWebEnginePage', PaginaPrueba), \
     patch.object(main, 'QWebEngineProfile', lambda *a: QWebEngineProfile(app)):
    ventana = main.VentanaPrincipalCNC()
ventana.setAttribute(Qt.WidgetAttribute.WA_DontShowOnScreen)
ventana.show()
pagina = ventana.pagina_web
pagina.setVisible(True)
resultado = {'codigo': 1, 'terminado': False, 'ciclos': 0, 'latidos': 0, 'max_pausa': 0., 'ultimo': time.monotonic()}


def terminar(ok, detalle):
    if resultado['terminado']: return
    resultado['terminado'] = True
    resultado['codigo'] = 0 if ok else 1
    latido.stop()
    print(f'RESIZE {"OK" if ok else "FAIL"}: {detalle}', flush=True)
    ventana.close()
    app.quit()


def seguro(accion):
    if resultado['terminado']: return
    try: accion()
    except Exception as error: terminar(False, str(error))


def pulso():
    ahora = time.monotonic()
    resultado['max_pausa'] = max(resultado['max_pausa'], ahora-resultado['ultimo'])
    resultado['ultimo'] = ahora
    resultado['latidos'] += 1


latido = QTimer()
latido.timeout.connect(pulso)
latido.start(20)


def comenzar(listo):
    if not listo:
        QTimer.singleShot(100, iniciar)
        return
    codigo = Path('gcode_samples/pistaspai.nc').read_text(encoding='utf-8-sig')
    pagina.runJavaScript(f'''(() => {{
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
      const v = window.visualizadorCNC;
      v.__fotogramasResize = 0;
      v.__duracionMaxResize = 0;
      v.__perfilResize = {{}};
      for (const nombre of ['dibujarCuadricula', 'dibujarMesaMaquina', 'dibujarMaterial', 'dibujarTrayectorias', 'dibujarOrigenWCS', 'dibujarRetículaHerramienta']) {{
        const original = v[nombre].bind(v);
        v[nombre] = (...args) => {{ const t=performance.now(); original(...args); args[0].getImageData(0,0,1,1); v.__perfilResize[nombre]=Math.max(v.__perfilResize[nombre]||0,performance.now()-t); }};
      }}
      const renderizar = v.renderizar.bind(v);
      v.renderizar = () => {{ const t = performance.now(); v.__fotogramasResize++; renderizar(); v.__duracionMaxResize = Math.max(v.__duracionMaxResize, performance.now()-t); }};
      v.cargarTrayectoriaDesdeGCode({json.dumps(codigo)});
      v.establecerModoVista('3D');
      v.zoom = 250;
      v.marcarEstaticoSucio();
      v.establecerGiroHerramienta(true);
      // Forzar dibujo completo también con WA_DontShowOnScreen, que limita RAF.
      window.__dibujoResize = setInterval(() => {{ v.necesitaRedibujarEstatico = true; v.renderizar(); }}, 40);
      window.__latidosResize = 0;
      window.__intervaloResize = setInterval(() => window.__latidosResize++, 25);
      const r = document.getElementById('sidebar-resizer');
      r.dispatchEvent(new MouseEvent('mousedown', {{button:0, buttons:1, clientX:800, bubbles:true}}));
      for (let i=0; i<1000; i++) window.dispatchEvent(new MouseEvent('mousemove', {{buttons:1, clientX:800+i%80}}));
      window.dispatchEvent(new Event('blur'));
      const stage = document.getElementById('viewcube-stage');
      stage.dispatchEvent(new MouseEvent('mousedown', {{button:0, buttons:1, clientX:10, bubbles:true}}));
      window.dispatchEvent(new Event('blur'));
    }})()''')
    QTimer.singleShot(300, lambda: seguro(ciclo))


def ciclo():
    i = resultado['ciclos']
    if i == 80:
        ventana.establecer_pantalla_completa(True)
        QTimer.singleShot(80, lambda: seguro(escape))
        return
    pagina.runJavaScript('window.visualizadorCNC.establecerGiroHerramienta(true);')
    if i % 10 == 0:
        ventana.establecer_pantalla_completa(True)
    elif i % 10 == 1:
        ventana.establecer_pantalla_completa(False)
    else:
        tamanos = [(1024, 680), (1480, 880), (1920, 1080), (1280, 720)]
        ventana.resize(*tamanos[i % len(tamanos)])
    QApplication.sendEvent(ventana, QEvent(QEvent.Type.WindowDeactivate))
    resultado['ciclos'] += 1
    QTimer.singleShot(25, lambda: seguro(ciclo))


def escape():
    # El atajo nativo permite salir incluso con el foco dentro del motor web.
    ventana._atajo_escape.activated.emit()
    assert not ventana.isFullScreen(), 'Escape no salió de pantalla completa.'
    pagina.runJavaScript("clearInterval(window.__dibujoResize); window.visualizadorCNC.establecerGiroHerramienta(false);")
    QTimer.singleShot(500, comprobar)


def comprobar():
    pagina.runJavaScript('''(() => {
      const v = window.visualizadorCNC;
      const r = document.getElementById('sidebar-resizer');
      window.dispatchEvent(new Event('resize'));
      return {ancho:v.lienzo.width, alto:v.lienzo.height, segmentos:v.trayectoria.length,
              arrastrando:v.estaArrastrando, sidebar:document.body.classList.contains('resizing-col'),
              cubo:document.getElementById('viewcube-stage').style.cursor,
              latidos:window.__latidosResize, fotogramas:v.__fotogramasResize,
              duracionMax:v.__duracionMaxResize, perfil:v.__perfilResize, oculto:document.hidden};
    })()''', lambda valor: seguro(lambda: validar(valor)))


def validar(valor):
    assert not pagina.errores, pagina.errores
    assert valor['segmentos'] > 6000, valor
    assert valor['ancho']*valor['alto'] <= 4194304, valor
    assert not valor['arrastrando'] and not valor['sidebar'] and valor['cubo'] == 'grab', valor
    assert QWidget.mouseGrabber() is None and QWidget.keyboardGrabber() is None
    # WebEngine aún puede limitar el reloj del widget no expuesto. Medir el coste
    # real del dibujo en lugar de exigir una tasa de fotogramas de ventana visible.
    assert valor['latidos'] > 0 and resultado['latidos'] > 40, (valor, resultado)
    assert valor['fotogramas'] > 1 and valor['duracionMax'] < 250, valor
    assert resultado['max_pausa'] < 1.5, resultado
    terminar(True, f"80 ciclos, 1000 movimientos, {valor['segmentos']} segmentos, {valor['fotogramas']} fotogramas, "
                  f"dibujo máximo={valor['duracionMax']:.1f}ms, pausa máxima Qt={resultado['max_pausa']:.3f}s; ratón liberado, JS activo y Escape correcto")


def iniciar():
    pagina.runJavaScript('!!window.visualizadorCNC && !!window.puenteCNC', comenzar)


QTimer.singleShot(300, iniciar)
QTimer.singleShot(30000, lambda: terminar(False, f'timeout: {resultado}; JS={pagina.errores}'))
app.exec()
temporal.cleanup()
sys.exit(resultado['codigo'])
