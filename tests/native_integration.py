"""Prueba la ventana real, WebChannel, streaming, M6 y errores sin usar hardware.

El perfil de Chromium está en memoria y el historial usa una carpeta temporal aislada.
Ejecutar desde la raíz: python tests/native_integration.py
"""
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault('QTWEBENGINE_CHROMIUM_FLAGS', '--use-gl=angle --use-angle=d3d11')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import QApplication
from PyQt6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile
from core import ControladorGRBL, PuenteCNC
from test_regresiones import PuertoGRBL


class ControladorPrueba(ControladorGRBL):
    @staticmethod
    def escanear_puertos():
        return []


class PuertoConError(PuertoGRBL):
    def write(self, datos):
        if datos == b'G0X99\n':
            self.enviados.append(datos)
            self.rx.put(b'error:20\n')
            return len(datos)
        return super().write(datos)


temporal = tempfile.TemporaryDirectory(prefix='cnc-native-test-')
ruta_historial = Path(temporal.name) / 'historial.json'
semilla = [dict(id=1, fecha='prueba', archivo='<img src=x onerror="window.__historialInyectado=true">',
               herramienta='lapiz', duracion='00:01', lineas=1, resultado='Completado', duracionSeg=1)]
ruta_historial.write_text(json.dumps(semilla), encoding='utf-8')


def crear_puente(*args):
    puente = PuenteCNC(*args, ruta_historial=ruta_historial)
    puente.temporizador_hotplug.stop()
    return puente


def historial():
    return json.loads(ruta_historial.read_text(encoding='utf-8'))


class PaginaPrueba(QWebEnginePage):
    errores = []

    def javaScriptConsoleMessage(self, nivel, mensaje, linea, fuente):
        if nivel == QWebEnginePage.JavaScriptConsoleMessageLevel.ErrorMessageLevel:
            self.errores.append(f'{fuente}:{linea}: {mensaje}')


main.configurar_entorno_grafico()
app = QApplication(sys.argv)
app.setApplicationName('CNC integration test')
with patch.object(main, 'ControladorGRBL', ControladorPrueba), \
     patch.object(main, 'PuenteCNC', crear_puente), \
     patch.object(main, 'QWebEnginePage', PaginaPrueba), \
     patch.object(main, 'QWebEngineProfile', lambda *args: QWebEngineProfile(app)):
    ventana = main.VentanaPrincipalCNC()
ventana.setAttribute(Qt.WidgetAttribute.WA_DontShowOnScreen)
ventana.show()
pagina = ventana.pagina_web
c = ventana.controlador
puente = ventana.puente
puerto = PuertoConError()
resultado = {'codigo': 1, 'fase': 'carga', 'terminado': False}


def terminar(ok, mensaje):
    if resultado['terminado']:
        return
    resultado['terminado'] = True
    resultado['codigo'] = 0 if ok else 1
    print(mensaje, flush=True)
    ventana.close()
    if c.esta_conectado or any(h and h.is_alive() for h in (c._hilo_lectura, c._hilo_sondeo)):
        resultado['codigo'] = 1
        print('FAIL: el cierre dejó trabajadores activos.', flush=True)
    app.quit()


def ejecutar(accion):
    if resultado['terminado']:
        return
    try:
        accion()
    except Exception as error:
        terminar(False, f'NATIVE FAIL ({resultado["fase"]}): {error}')


def esperar(condicion, siguiente):
    def intento():
        if condicion():
            siguiente()
        else:
            QTimer.singleShot(50, lambda: ejecutar(intento))
    ejecutar(intento)


def cargar(codigo, nombre, siguiente):
    fuente = f'''(() => {{
      const input = document.getElementById('file-input-gcode');
      const dt = new DataTransfer();
      dt.items.add(new File([{json.dumps(codigo)}], {json.dumps(nombre)}));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', {{bubbles:true}}));
    }})()'''
    pagina.runJavaScript(fuente)
    QTimer.singleShot(300, lambda: ejecutar(siguiente))


def iniciar_archivo():
    pagina.runJavaScript("document.getElementById('btn-execution-action').click()")


def comprobar_carga(valor):
    assert valor['textoSeguro'] and not valor['inyeccion'], valor
    c.puerto_serial = puerto
    c.esta_conectado = True
    c.estado_maquina['estado'] = 'IDLE'
    c._iniciar_hilos_hardware()
    resultado['fase'] = 'override 200% y 50%'
    pagina.runJavaScript("""(() => {
      const s = document.getElementById('slider-jog-speed');
      s.value = 200;
      s.dispatchEvent(new Event('input'));
    })()""")
    esperar(lambda: c.estado_maquina['override_feed'] == 200, override_50)


def override_50():
    pagina.runJavaScript("""(() => {
      const s = document.getElementById('slider-jog-speed');
      s.value = 50;
      s.dispatchEvent(new Event('input'));
    })()""")
    esperar(lambda: c.estado_maquina['override_feed'] == 50, comprobar_override)


def comprobar_override():
    puente.senial_progreso.emit(1, 13, 7.528735632183908, '00:01')
    QTimer.singleShot(200, lambda: pagina.runJavaScript('''({
      progreso: document.getElementById('lbl-progress-percent').textContent,
      override: document.getElementById('metric-feed-pct').textContent,
      seleccionado: document.getElementById('slider-jog-speed').value
    })''', lambda valor: ejecutar(lambda: validar_override(valor))))


def validar_override(valor):
    assert valor == {'progreso': '7.5%', 'override': '50%', 'seleccionado': '50'}, valor
    pagina.runJavaScript("""(() => {
      const s = document.getElementById('slider-jog-speed');
      s.value = 100;
      s.dispatchEvent(new Event('input'));
    })()""")
    esperar(lambda: c.estado_maquina['override_feed'] == 100, comenzar_incremental)


def comenzar_incremental():
    resultado['fase'] = 'programa incremental'
    iniciar_archivo()
    esperar(lambda: len(historial()) == 2, primer_fin)


def primer_fin():
    assert historial()[0]['resultado'] == 'Completado', historial()
    assert historial()[0]['archivo'] == 'nativa.nc', historial()[0]
    assert abs(c.estado_maquina['wpos'][0]-50.8) < 1e-6, c.estado_maquina
    assert b'\x18' not in puerto.enviados, puerto.enviados
    pagina.runJavaScript('''(() => {
      window.dispatchEvent(new Event('resize'));
      return [...document.querySelectorAll('.gcode-line')].filter(f => f.querySelector('.gcode-ack')).map(f => ({
        indice: Number(f.dataset.index), texto: f.querySelector('.gcode-ack').textContent,
        color: getComputedStyle(f.querySelector('.gcode-ack')).color,
        titulo: f.querySelector('.gcode-ack').title
      }));
    })()''', lambda valor: ejecutar(lambda: verificar_marcas(valor)))


def verificar_marcas(marcas):
    assert [m['indice'] for m in marcas] == [1, 2], marcas
    assert all(m['texto'] == 'ok' and m['color'] == 'rgb(74, 222, 128)' and 'Máquina:' in m['titulo'] for m in marcas), marcas
    resultado['fase'] = 'M6'
    cargar('M3S12000\nG0X1\nT2M6\nM3S12000\nG1X2F100\nM5', 'cambio.nc', iniciar_m6)


def iniciar_m6():
    iniciar_archivo()
    esperar(lambda: c._cambio_listo, verificar_m6)


def verificar_m6():
    assert not c.estado_maquina['spindle_encendido'], c.estado_maquina
    assert b'G1X2F100\n' not in puerto.enviados
    assert c._en_pausa_gcode
    pagina.runJavaScript("document.getElementById('btn-execution-pause').click()")
    esperar(lambda: len(historial()) == 3, segundo_fin)


def segundo_fin():
    assert historial()[0]['resultado'] == 'Completado', historial()[0]
    assert b'\x18' not in puerto.enviados
    resultado['fase'] = 'error del firmware'
    cargar('G0X99\nG0X100', 'error.nc', iniciar_error)


def iniciar_error():
    iniciar_archivo()
    esperar(lambda: len(historial()) == 4, verificar_error)


def verificar_error():
    assert historial()[0]['resultado'] == 'Error', historial()[0]
    assert b'G0X100\n' not in puerto.enviados
    assert b'\x18' in puerto.enviados
    assert not pagina.errores, pagina.errores
    pagina.runJavaScript("document.querySelectorAll('.gcode-ack').length", lambda cantidad: ejecutar(lambda: terminar_error(cantidad)))


def terminar_error(cantidad):
    assert cantidad == 0, 'Los comandos rechazados o sin enviar no deben marcarse ok.'
    terminar(True, 'NATIVE INTEGRATION OK: ventana real, historial, HTML seguro, confirmaciones ok, finalización, M6, errores y cierre.')


def interfaz_lista(listo):
    if not listo:
        QTimer.singleShot(100, iniciar)
        return
    cargar('; <img src=x onerror="window.__inyeccionPrueba=true">\nG20G91G0X1\nX1', 'nativa.nc',
           lambda: pagina.runJavaScript('''({
             textoSeguro: document.getElementById('gcode-lines-container').textContent.includes('<img') &&
                          document.getElementById('tbody-historial').textContent.includes('<img'),
             codigo: document.getElementById('gcode-lines-container').textContent,
             historial: document.getElementById('tbody-historial').textContent,
             inyeccion: !!window.__inyeccionPrueba || !!window.__historialInyectado
           })''', lambda valor: ejecutar(lambda: comprobar_carga(valor))))


def iniciar():
    pagina.runJavaScript('!!window.puenteCNC && !!window.visualizadorCNC', interfaz_lista)


QTimer.singleShot(300, iniciar)
QTimer.singleShot(25000, lambda: terminar(False, f'NATIVE FAIL: timeout en {resultado["fase"]}; errores={pagina.errores}'))
app.exec()
temporal.cleanup()
sys.exit(resultado['codigo'])
