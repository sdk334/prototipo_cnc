# -*- coding: utf-8 -*-
"""
Módulo de Puente Bidireccional IPC (JavaScript <-> Python QWebChannel)
Proyecto: Trabajo Terminal 2026-B072 (ESCOM - IPN)
Interfaz de Control para Máquinas CNC con Fines Educativos

Responsabilidad:
- Exponer métodos (@pyqtSlot) invocables desde la interfaz web JavaScript.
- Emitir señales (@pyqtSignal) con telemetría en tiempo real hacia el navegador.
- Coordinar el ControladorGRBL de bajo nivel con el ProcesadorGCode.
"""

import json
from PyQt6.QtCore import QObject, pyqtSlot, pyqtSignal, QTimer
from controlador_grbl import ControladorGRBL
from procesador_gcode import ProcesadorGCode


class PuenteCNC(QObject):
    """Puente de comunicación bidireccional entre la GUI Web y el núcleo Python."""

    # Señales emitidas hacia JavaScript
    senial_estado = pyqtSignal(str)              # JSON con estado de máquina y coordenadas DRO
    senial_consola = pyqtSignal(str, str)        # (tipo_estilo, mensaje_texto)
    senial_progreso = pyqtSignal(int, int, float, str)  # (linea_act, total, pct, tiempo)
    senial_puertos = pyqtSignal(str)             # JSON con lista de puertos COM disponibles
    senial_error_didactico = pyqtSignal(str)     # JSON con error traducido didácticamente
    senial_analisis_gcode = pyqtSignal(str)      # JSON con dimensiones y tiempo estimado

    def __init__(self, controlador: ControladorGRBL, procesador: ProcesadorGCode):
        super().__init__()
        self.controlador = controlador
        self.procesador = procesador

        # Vincular callbacks del controlador con señales Qt
        self.controlador.cb_estado_actualizado = self._al_actualizar_estado
        self.controlador.cb_linea_consola = self._al_recibir_linea_consola
        self.controlador.cb_progreso = self._al_actualizar_progreso
        self.controlador.cb_evento_error = self._al_ocurrir_error

        # Monitoreo continuo de conexión/desconexión USB (Hot-Plug cada 1000 ms)
        self._nombres_puertos_previos = []
        self.temporizador_hotplug = QTimer(self)
        self.temporizador_hotplug.timeout.connect(self._verificar_cambios_hotplug)
        self.temporizador_hotplug.start(1000)

    # =========================================================================
    # DISPATCHERS DE CALLBACKS DE PYTHON A SEÑALES QT
    # =========================================================================

    def _al_actualizar_estado(self, dict_estado: dict):
        """Convierte el estado de máquina a JSON y lo emite a la GUI web."""
        self.senial_estado.emit(json.dumps(dict_estado))

    def _al_recibir_linea_consola(self, tipo: str, mensaje: str):
        """Emite una línea a la consola serial del frontend."""
        self.senial_consola.emit(tipo, mensaje)

    def _al_actualizar_progreso(self, actual: int, total: int, pct: float, tiempo: str):
        """Emite el avance del streaming de G-code."""
        self.senial_progreso.emit(actual, total, pct, tiempo)

    def _al_ocurrir_error(self, codigo: int, linea_cruda: str):
        """Traduce el error con el procesador semántico y lo emite al frontend."""
        info = self.procesador.traducir_error_grbl(codigo)
        info["codigo"] = codigo
        info["linea_cruda"] = linea_cruda
        self.senial_error_didactico.emit(json.dumps(info))

    def _verificar_cambios_hotplug(self):
        """Detecta automáticamente si se conecta o desconecta un cable USB CNC."""
        puertos = self.controlador.escanear_puertos()
        nombres = [p["puerto"] for p in puertos if p["puerto"] != "SIMULADOR_VIRTUAL"]

        if nombres != self._nombres_puertos_previos:
            nuevos = set(nombres) - set(self._nombres_puertos_previos)
            removidos = set(self._nombres_puertos_previos) - set(nombres)
            self._nombres_puertos_previos = list(nombres)

            # Notificar al frontend con la lista actualizada
            self.senial_puertos.emit(json.dumps(puertos))

            for n in nuevos:
                info = next((p for p in puertos if p["puerto"] == n), None)
                if info:
                    self.senial_consola.emit("c-system", f"[HOT-PLUG] Dispositivo detectado: {info['etiqueta']}.")
                    # Conectar automáticamente si es un dispositivo USB CNC y no estamos en hardware real
                    if info.get("tipo") == "USB_CNC" and (not self.controlador.esta_conectado or self.controlador.modo_virtual):
                        self.conectar(info["puerto"], 115200)

            for r in removidos:
                self.senial_consola.emit("c-alarm", f"[HOT-PLUG] Dispositivo en {r} desconectado físicamente del equipo.")
                if self.controlador.nombre_puerto == r:
                    self.controlador.desconectar()

    # =========================================================================
    # SLOTS INVOCABLES DIRECTAMENTE DESDE JAVASCRIPT
    # =========================================================================

    @pyqtSlot()
    def escanearPuertos(self):
        """Escanea los puertos seriales y notifica a la interfaz."""
        puertos = self.controlador.escanear_puertos()
        self.senial_puertos.emit(json.dumps(puertos))

    @pyqtSlot(str, int)
    def conectar(self, puerto: str, baudrate: int):
        """Conecta al puerto COM especificado a la velocidad indicada."""
        self.controlador.conectar(puerto, baudrate)

    @pyqtSlot()
    def desconectar(self):
        """Desconecta el puerto serial activo."""
        self.controlador.desconectar()

    @pyqtSlot(str)
    def enviarMDI(self, comando: str):
        """Ejecuta un comando G-Code o comando de sistema desde la barra MDI."""
        self.controlador.enviar_comando(comando)

    @pyqtSlot(str, float, float)
    def moverJog(self, eje: str, paso: float, velocidad: float):
        """Ejecuta un movimiento manual (Jog) en el eje solicitado."""
        self.controlador.mover_jog(eje, paso, velocidad)

    @pyqtSlot()
    def paradaEmergencia(self):
        """Activa de inmediato la parada de emergencia E-STOP."""
        self.controlador.parada_emergencia()

    @pyqtSlot()
    def pausar(self):
        """Pausa el mecanizado en ejecución."""
        self.controlador.pausar()

    @pyqtSlot()
    def reanudar(self):
        """Reanuda el mecanizado pausado."""
        self.controlador.reanudar()

    @pyqtSlot()
    def detener(self):
        """Detiene y cancela la ejecución del programa."""
        self.controlador.parada_emergencia()

    @pyqtSlot(str)
    def ponerCeroEje(self, eje: str):
        """Pone a cero de trabajo (G10) el eje indicado."""
        self.controlador.poner_cero_eje(eje)

    @pyqtSlot()
    def ponerCeroTodos(self):
        """Pone a cero los tres ejes X, Y, Z."""
        self.controlador.poner_cero_todos()

    @pyqtSlot(bool, int)
    def controlarSpindle(self, encendido: bool, rpm: int):
        """Enciende o apaga el husillo a las RPM solicitadas."""
        self.controlador.controlar_spindle(encendido, rpm)

    @pyqtSlot()
    def ejecutarHoming(self):
        """Ejecuta el ciclo de homing ($H)."""
        self.controlador.ejecutar_homing()

    @pyqtSlot()
    def desbloquearAlarma(self):
        """Desbloquea el estado de alarma ($X)."""
        self.controlador.desbloquear_alarma()

    @pyqtSlot(str)
    def iniciarPrograma(self, contenido_gcode: str):
        """Inicia la ejecución en hardware real del programa G-code cargado."""
        self.controlador.iniciar_programa(contenido_gcode)

    @pyqtSlot(str)
    def analizarGcode(self, contenido_gcode: str):
        """Analiza sintácticamente y estima tiempos de un programa G-code."""
        resultado = self.procesador.analizar_programa(contenido_gcode)
        self.senial_analisis_gcode.emit(json.dumps(resultado))
