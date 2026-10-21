# -*- coding: utf-8 -*-
"""
Punto de Entrada Principal - Aplicación de Escritorio CNC Basic v1.0
Proyecto: Trabajo Terminal 2026-B072 (ESCOM - IPN)
Interfaz de Control para Máquinas CNC con Fines Educativos

Tecnología: Python 3.14 + PyQt6 + PyQt6-WebEngine + PySerial
"""

import os
import sys
from PyQt6.QtCore import QUrl, Qt
from PyQt6.QtGui import QIcon, QColor
from PyQt6.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QWidget
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings
from PyQt6.QtWebChannel import QWebChannel

from core import ControladorGRBL, ProcesadorGCode, PuenteCNC


class VentanaPrincipalCNC(QMainWindow):
    """Ventana nativa principal de Windows que aloja la interfaz de control CNC."""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("CNC Basic v1.0 - Interfaz de Control CNC Educativa (ESCOM - IPN)")
        self.resize(1480, 880)
        self.setMinimumSize(1024, 680)
        self.setStyleSheet("QMainWindow { background-color: #0a0c0e; }")

        # 1. Instanciar módulos del núcleo de control en Python
        self.controlador = ControladorGRBL()
        self.procesador = ProcesadorGCode()
        self.puente = PuenteCNC(self.controlador, self.procesador)
        self.puente.cb_alternar_pantalla_completa = self.alternar_pantalla_completa

        # 2. Configurar vista web integrada Chromium con fondo oscuro nativo
        self.vista_web = QWebEngineView(self)
        self.vista_web.page().setBackgroundColor(QColor("#0a0c0e"))
        self.vista_web.setStyleSheet("background-color: #0a0c0e;")
        self.configurar_motor_web()

        # 3. Configurar el canal IPC QWebChannel
        self.canal = QWebChannel(self.vista_web.page())
        self.canal.registerObject("puenteCNC", self.puente)
        self.vista_web.page().setWebChannel(self.canal)

        # 4. Diseñar contenedor central
        contenedor = QWidget()
        contenedor.setStyleSheet("background-color: #0a0c0e;")
        layout = QVBoxLayout(contenedor)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.vista_web)
        self.setCentralWidget(contenedor)

        # 5. Cargar archivo index.html local desde el módulo gui/
        ruta_directorio = os.path.dirname(os.path.abspath(__file__))
        ruta_html = os.path.join(ruta_directorio, "gui", "index.html")
        self.vista_web.load(QUrl.fromLocalFile(ruta_html))

    def configurar_motor_web(self):
        """Habilita permisos y aceleración para renderizado fluido sin parpadeos."""
        ajustes = self.vista_web.settings()
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.ScrollAnimatorEnabled, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.Accelerated2dCanvasEnabled, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.WebGLEnabled, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)
        self.vista_web.page().fullScreenRequested.connect(self._al_solicitar_pantalla_completa)

    def _al_solicitar_pantalla_completa(self, peticion):
        peticion.accept()
        if peticion.toggleOn():
            self.showFullScreen()
        else:
            self.showNormal()

    def alternar_pantalla_completa(self):
        """Alterna entre modo ventana y pantalla completa sin bordes."""
        if self.isFullScreen():
            self.showNormal()
        else:
            self.showFullScreen()

    def keyPressEvent(self, evento):
        """Atajo F11 nativo para pantalla completa."""
        if evento.key() == Qt.Key.Key_F11:
            self.alternar_pantalla_completa()
            evento.accept()
        else:
            super().keyPressEvent(evento)

    def closeEvent(self, evento):
        """Asegura el cierre limpio de la comunicación serial al cerrar la ventana."""
        try:
            if hasattr(self, 'puente') and self.puente:
                self.puente.destruir()
            if hasattr(self, 'controlador') and self.controlador:
                self.controlador.desconectar()
        except Exception:
            pass
        evento.accept()


def principal():
    # Habilitar soporte de alta resolución en pantallas de Windows
    os.environ["QT_AUTO_SCREEN_SCALE_FACTOR"] = "1"

    # Estabilizar el motor Chromium GPU en Windows (previene errores de command_buffer_proxy_impl y WaitForGetOffsetInRange)
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--use-gl=angle --use-angle=d3d11 --disable-gpu-watchdog"

    app = QApplication(sys.argv)
    app.setApplicationName("CNC Basic v1.0")
    app.setOrganizationName("ESCOM - IPN")

    ventana = VentanaPrincipalCNC()
    ventana.showMaximized()

    sys.exit(app.exec())


if __name__ == "__main__":
    principal()
