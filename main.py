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
from PyQt6.QtGui import QIcon
from PyQt6.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QWidget
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings
from PyQt6.QtWebChannel import QWebChannel

from controlador_grbl import ControladorGRBL
from procesador_gcode import ProcesadorGCode
from puente_interfaz import PuenteCNC


class VentanaPrincipalCNC(QMainWindow):
    """Ventana nativa principal de Windows que aloja la interfaz de control CNC."""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("CNC Basic v1.0 - Interfaz de Control CNC Educativa (ESCOM - IPN)")
        self.resize(1480, 880)
        self.setMinimumSize(1024, 680)

        # 1. Instanciar módulos del núcleo de control en Python
        self.controlador = ControladorGRBL()
        self.procesador = ProcesadorGCode()
        self.puente = PuenteCNC(self.controlador, self.procesador)

        # 2. Configurar vista web integrada Chromium
        self.vista_web = QWebEngineView(self)
        self.configurar_motor_web()

        # 3. Configurar el canal IPC QWebChannel
        self.canal = QWebChannel(self.vista_web.page())
        self.canal.registerObject("puenteCNC", self.puente)
        self.vista_web.page().setWebChannel(self.canal)

        # 4. Diseñar contenedor central
        contenedor = QWidget()
        layout = QVBoxLayout(contenedor)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.vista_web)
        self.setCentralWidget(contenedor)

        # 5. Cargar archivo index.html local
        ruta_directorio = os.path.dirname(os.path.abspath(__file__))
        ruta_html = os.path.join(ruta_directorio, "index.html")
        self.vista_web.load(QUrl.fromLocalFile(ruta_html))

    def configurar_motor_web(self):
        """Habilita permisos para cargar hojas de estilo locales y fuentes de Font Awesome / Google Fonts."""
        ajustes = self.vista_web.settings()
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.ScrollAnimatorEnabled, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.Accelerated2dCanvasEnabled, True)
        ajustes.setAttribute(QWebEngineSettings.WebAttribute.WebGLEnabled, True)

    def closeEvent(self, evento):
        """Asegura el cierre limpio de la comunicación serial al cerrar la ventana."""
        try:
            self.controlador.desconectar()
        except Exception:
            pass
        evento.accept()


def principal():
    # Habilitar soporte de alta resolución en pantallas de Windows
    os.environ["QT_AUTO_SCREEN_SCALE_FACTOR"] = "1"

    app = QApplication(sys.argv)
    app.setApplicationName("CNC Basic v1.0")
    app.setOrganizationName("ESCOM - IPN")

    ventana = VentanaPrincipalCNC()
    ventana.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    principal()
