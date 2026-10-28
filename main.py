# -*- coding: utf-8 -*-
"""
Punto de Entrada Principal - Aplicación de Escritorio CNC Basic v1.0
Proyecto: Trabajo Terminal 2026-B072 (ESCOM - IPN)
Interfaz de Control para Máquinas CNC con Fines Educativos

Tecnología: Python 3.14 + PyQt6 + PyQt6-WebEngine + PySerial
"""

import os
import sys
import time
def configurar_variables_graficas():
    """Evita el camino D3D/ANGLE forzado al recrear superficies en Windows."""
    os.environ.setdefault('QT_AUTO_SCREEN_SCALE_FACTOR', '1')
    os.environ.setdefault('QT_OPENGL', 'software')
    os.environ.setdefault('QT_QUICK_BACKEND', 'software')
    flags = [f for f in os.environ.get('QTWEBENGINE_CHROMIUM_FLAGS', '').split()
             if not f.startswith(('--use-gl=', '--use-angle='))]
    if '--disable-gpu' not in flags:
        flags.append('--disable-gpu')
    if '--log-level=3' not in flags and not any(f.startswith('--log-level=') for f in flags):
        flags.append('--log-level=3')
    os.environ['QTWEBENGINE_CHROMIUM_FLAGS'] = ' '.join(flags)

configurar_variables_graficas()

from PyQt6.QtCore import QUrl, Qt, QTimer, QEvent
from PyQt6.QtGui import QIcon, QColor, QShortcut, QKeySequence
from PyQt6.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QWidget
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings, QWebEngineProfile, QWebEnginePage
from PyQt6.QtWebChannel import QWebChannel
from PyQt6.QtQuick import QQuickWindow, QSGRendererInterface

from core import ControladorGRBL, ProcesadorGCode, PuenteCNC


def configurar_entorno_grafico():
    configurar_variables_graficas()
    QApplication.setAttribute(Qt.ApplicationAttribute.AA_UseSoftwareOpenGL)
    QQuickWindow.setGraphicsApi(QSGRendererInterface.GraphicsApi.Software)


class VentanaPrincipalCNC(QMainWindow):
    """Ventana nativa principal de Windows que aloja la interfaz de control CNC."""

    def __init__(self):
        super().__init__()
        self._cerrando = False
        self._cambiando_pantalla_completa = False
        self._restaurar_maximizada = False
        self.setWindowTitle("CNC Basic v1.0 - Interfaz de Control CNC Educativa (ESCOM - IPN)")
        self.resize(1480, 880)
        self.setMinimumSize(1024, 680)
        self.setStyleSheet("QMainWindow { background-color: #0a0c0e; }")

        # 1. Instanciar módulos del núcleo de control en Python
        self.controlador = ControladorGRBL()
        self.procesador = ProcesadorGCode()
        self.puente = PuenteCNC(self.controlador, self.procesador)
        self.puente.cb_alternar_pantalla_completa = self.alternar_pantalla_completa
        self.puente.cb_minimizar_ventana = self.showMinimized
        self.puente.cb_cerrar_ventana = self.close

        # 2. Configurar perfil persistente y vista web integrada Chromium con fondo oscuro nativo
        self.perfil_web = QWebEngineProfile("cnc_storage", QApplication.instance())
        self.pagina_web = QWebEnginePage(self.perfil_web, self)
        self.vista_web = QWebEngineView(self)
        self.vista_web.setPage(self.pagina_web)
        self.pagina_web.setBackgroundColor(QColor("#0a0c0e"))
        self.vista_web.setStyleSheet("background-color: #0a0c0e;")
        self.configurar_motor_web()

        # 3. Configurar el canal IPC QWebChannel
        self.canal = QWebChannel(self.pagina_web)
        self.canal.registerObject("puenteCNC", self.puente)
        self.pagina_web.setWebChannel(self.canal)

        # 4. Diseñar contenedor central
        contenedor = QWidget()
        contenedor.setStyleSheet("background-color: #0a0c0e;")
        layout = QVBoxLayout(contenedor)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.vista_web)
        self.setCentralWidget(contenedor)

        self._atajo_f11 = QShortcut(QKeySequence('F11'), self)
        self._atajo_f11.setContext(Qt.ShortcutContext.ApplicationShortcut)
        self._atajo_f11.setAutoRepeat(False)
        self._atajo_f11.activated.connect(self.alternar_pantalla_completa)
        self._atajo_escape = QShortcut(QKeySequence('Escape'), self)
        self._atajo_escape.setContext(Qt.ShortcutContext.ApplicationShortcut)
        self._atajo_escape.setAutoRepeat(False)
        self._atajo_escape.setEnabled(False)
        self._atajo_escape.activated.connect(lambda: self.establecer_pantalla_completa(False))

        # 5. Cargar archivo index.html local desde el módulo gui/
        ruta_directorio = os.path.dirname(os.path.abspath(__file__))
        ruta_html = os.path.join(ruta_directorio, "gui", "index.html")
        self.vista_web.load(QUrl.fromLocalFile(ruta_html))

    def configurar_motor_web(self):
        """Habilita permisos, almacenamiento persistente y aceleración para renderizado fluido sin parpadeos."""
        ajustes = self.perfil_web.settings()
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.ScrollAnimatorEnabled, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.Accelerated2dCanvasEnabled, False)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.WebGLEnabled, False)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)
        self.pagina_web.fullScreenRequested.connect(self._al_solicitar_pantalla_completa)

    def _al_solicitar_pantalla_completa(self, peticion):
        peticion.accept()
        self.establecer_pantalla_completa(peticion.toggleOn())

    def liberar_interacciones(self):
        """Suelta capturas de Qt y arrastres web al perder foco o cambiar de ventana."""
        for capturador, liberar in ((QWidget.mouseGrabber(), 'releaseMouse'),
                                    (QWidget.keyboardGrabber(), 'releaseKeyboard')):
            if capturador is not None:
                getattr(capturador, liberar)()
        pagina = getattr(self, 'pagina_web', None)
        if pagina is not None and not getattr(self, '_cerrando', False):
            pagina.runJavaScript("window.dispatchEvent(new Event('blur'));")

    def event(self, evento):
        if evento.type() in (QEvent.Type.WindowDeactivate, QEvent.Type.Hide):
            self.liberar_interacciones()
        return super().event(evento)

    def establecer_pantalla_completa(self, activa):
        if self._cerrando or self._cambiando_pantalla_completa or self.isFullScreen() == activa:
            return
        self._cambiando_pantalla_completa = True
        try:
            self.liberar_interacciones()
            if activa:
                self._restaurar_maximizada = self.isMaximized()
                self.showFullScreen()
            elif self._restaurar_maximizada:
                self.showMaximized()
            else:
                self.showNormal()
            self._atajo_escape.setEnabled(activa)
            self.puente.senial_pantalla_completa.emit(activa)
        finally:
            self._cambiando_pantalla_completa = False

    def alternar_pantalla_completa(self):
        ahora = time.monotonic()
        if ahora - getattr(self, '_ultimo_toggle_fs', -1.) < .35:
            return
        self._ultimo_toggle_fs = ahora
        self.establecer_pantalla_completa(not self.isFullScreen())

    def keyPressEvent(self, evento):
        """Atajo F11 y Escape nativo para pantalla completa."""
        if evento.key() == Qt.Key.Key_F11:
            if evento.isAutoRepeat():
                evento.accept()
                return
            self.alternar_pantalla_completa()
            evento.accept()
        elif evento.key() == Qt.Key.Key_Escape and self.isFullScreen():
            self.establecer_pantalla_completa(False)
            evento.accept()
        else:
            super().keyPressEvent(evento)

    def closeEvent(self, evento):
        """Asegura el cierre limpio de la comunicación serial y de los recursos de WebEngine."""
        self.liberar_interacciones()
        self._cerrando = True
        try:
            if hasattr(self, 'puente') and self.puente:
                self.puente.destruir()
            if hasattr(self, 'controlador') and self.controlador:
                self.controlador.desconectar()
            if hasattr(self, 'vista_web') and self.vista_web:
                self.vista_web.setPage(None)
            if hasattr(self, 'pagina_web') and self.pagina_web:
                self.pagina_web.deleteLater()
                self.pagina_web = None
        except Exception:
            pass
        evento.accept()


def principal():
    configurar_entorno_grafico()

    app = QApplication(sys.argv)
    app.setApplicationName("CNC Basic v1.0")
    app.setOrganizationName("ESCOM - IPN")

    ventana = VentanaPrincipalCNC()
    ventana.showMaximized()

    sys.exit(app.exec())


if __name__ == "__main__":
    principal()
