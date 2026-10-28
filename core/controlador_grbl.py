# -*- coding: utf-8 -*-
"""
Módulo Controlador y Driver Serial GRBL v1.1
Proyecto: Trabajo Terminal 2026-B072 (ESCOM - IPN)
Interfaz de Control para Máquinas CNC con Fines Educativos

Responsabilidad:
- Gestión de conexión física por puerto serial USB con PySerial a 115200 baudios.
- Hilo daemon de sondeo en tiempo real mediante consulta '?' cada 200 ms.
- Analizador de sintaxis de telemetría de GRBL v1.1 (WPos, MPos, FS, Ov, Bf, Pn).
- Transmisión serializada de G-code con confirmación y barreras de finalización física.
- Inyección inmediata de comandos en tiempo real (0x18 Soft Reset, ! Feed Hold, ~ Cycle Start).
- Movimiento manual seguro de ejes mediante directivas $J= de GRBL v1.1.
- Modo emulador virtual didáctico para pruebas académicas en laboratorios sin máquina física.
"""

import re
import sys
import time
import math
import threading
from collections import deque
from .interprete_gcode import Interprete, palabras, limpiar, quitar_motor, TOKEN
from .procesador_gcode import ProcesadorGCode
from typing import Callable, Optional, List, Dict, Any

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    serial = None


class ControladorGRBL:
    """Controlador serial de comunicación y protocolo de bajo nivel para GRBL v1.1."""

    TAMANO_BUFFER_RX = 127  # Tamaño máximo del búfer serial de recepción en Arduino/ATmega328P

    def __init__(self):
        self.puerto_serial: Optional[serial.Serial] = None
        self.nombre_puerto: str = ""
        self.baudrate: int = 115200
        self.esta_conectado: bool = False
        self.modo_virtual: bool = False
        self.modo_lapiz: bool = False
        self.modo_laser: bool = False
        self.tipo_herramienta: str = "fresa"
        self.pausa_m6: bool = True
        self.herramienta_activa: str = "T1"

        # Estado en tiempo real parseado del controlador
        self.estado_maquina: Dict[str, Any] = {
            "estado": "DESCONECTADO",
            "subestado": "",
            "modo_lapiz": False,
            "modo_laser": False,
            "tipo_herramienta": "fresa",
            "herramienta": "T1",
            "wpos": [0.0, 0.0, 0.0],
            "mpos": [0.0, 0.0, 0.0],
            "wco": [0.0, 0.0, 0.0],
            "feed_real": 0.0,
            "spindle_real": 0.0,
            "spindle_encendido": False,
            "override_feed": 100,
            "override_rapid": 100,
            "override_spindle": 100,
            "pines_limite": "",
            "buffer_planificador": 15,
            "buffer_rx_libre": 128
        }

        # Estructuras para streaming de G-code
        self._bloque_lock = threading.RLock()
        self._serial_write_lock = threading.Lock()
        self._pendientes_respuesta = deque()
        self._cola_manual = deque()
        self._evento_sesion = threading.Event()
        self._hilo_virtual = None
        self._esperando_fin = False
        self._cambio_m6 = False
        self._cambio_listo = False
        self._bloqueo_corte = False
        self._plan_programa = []
        self._cola_lineas: List[str] = []
        self._cola_bytes_en_transito = deque()
        self._total_lineas_programa: int = 0
        self._linea_actual_enviada: int = 0
        self._en_ejecucion_gcode: bool = False
        self._en_pausa_gcode: bool = False
        self._tiempo_inicio_ejecucion: float = 0.0

        # Hilos de control en segundo plano
        self._hilo_lectura: Optional[threading.Thread] = None
        self._hilo_sondeo: Optional[threading.Thread] = None
        self._detener_hilos: bool = False

        # Funciones de retorno (callbacks)
        self.cb_linea_confirmada = None
        self.cb_resultado_programa = None
        self._objetivo_feed_override = None
        self._override_feed_pendiente = None
        self._objetivo_spindle_override = None
        self._override_spindle_pendiente = None
        self.spindle_override = 1.0
        self.feed_override = 1.0
        self._spindle_solicitado = 0.
        self.cb_estado_actualizado: Optional[Callable[[Dict[str, Any]], None]] = None
        self.cb_linea_consola: Optional[Callable[[str, str], None]] = None
        self.cb_progreso: Optional[Callable[[int, int, float, str], None]] = None
        self.cb_evento_error: Optional[Callable[[int, str], None]] = None
        self.cb_evento_alarma: Optional[Callable[[int, str], None]] = None
        self.cb_alerta_seguridad: Optional[Callable[[str, str, str], None]] = None

        # Expresiones regulares para parseo de reporte de estado GRBL v1.1
        # Ejemplo: <Idle|MPos:0.000,0.000,0.000|Bf:15,128|FS:0,0|WCO:0.000,0.000,0.000|Ov:100,100,100|Pn:XYZ>
        self._regex_estado = re.compile(r"<([A-Za-z]+)(?::(\d+))?\|([^>]+)>")
        self._regex_coords = re.compile(r"[-+]?\d*\.?\d+")

    # =========================================================================
    # ESCANEO Y GESTIÓN DE PUERTOS SERIALES
    # =========================================================================

    @staticmethod
    def escanear_puertos() -> List[Dict[str, Any]]:
        """
        Devuelve la lista de puertos COM físicos disponibles en Windows.
        Prioriza dispositivos CNC USB reales (CH340, Arduino, FTDI, CP210) sobre vínculos virtuales o Bluetooth.
        """
        puertos_encontrados = []
        if serial and hasattr(serial.tools, 'list_ports'):
            for p in serial.tools.list_ports.comports():
                desc = p.description or ""
                hwid = p.hwid or ""
                mfr = p.manufacturer or ""

                desc_lower = desc.lower()
                hwid_lower = hwid.lower()
                mfr_lower = mfr.lower()

                es_bluetooth = "bluetooth" in desc_lower or "bluetooth" in hwid_lower
                es_ch340 = "ch340" in desc_lower or "1a86" in hwid_lower
                es_arduino = "arduino" in desc_lower or "arduino" in mfr_lower or "2341" in hwid_lower
                es_cp210 = "cp210" in desc_lower or "10c4" in hwid_lower
                es_ftdi = "ftdi" in desc_lower or "0403" in hwid_lower

                # Formatear etiqueta concisa para la interfaz
                if es_ch340:
                    etiqueta = f"{p.device} - USB CH340 (CNC Detectado)"
                    tipo = "USB_CNC"
                    prioridad = 1
                elif es_arduino:
                    etiqueta = f"{p.device} - Arduino Uno (CNC)"
                    tipo = "USB_CNC"
                    prioridad = 1
                elif es_cp210 or es_ftdi:
                    etiqueta = f"{p.device} - Adaptador Serial USB"
                    tipo = "USB_CNC"
                    prioridad = 2
                elif es_bluetooth:
                    etiqueta = f"{p.device} (Bluetooth)"
                    tipo = "BLUETOOTH"
                    prioridad = 10
                elif p.vid:
                    etiqueta = f"{p.device} - USB Serial"
                    tipo = "USB_CNC"
                    prioridad = 3
                else:
                    nombre_corto = desc[:20] if len(desc) > 20 else desc
                    etiqueta = f"{p.device} - {nombre_corto}"
                    tipo = "GENERICO"
                    prioridad = 5

                puertos_encontrados.append({
                    "puerto": p.device,
                    "etiqueta": etiqueta,
                    "descripcion": desc,
                    "fabricante": mfr,
                    "tipo": tipo,
                    "prioridad": prioridad
                })

        # Ordenar: primero dispositivos USB CNC reales, luego genéricos, luego bluetooth
        puertos_encontrados.sort(key=lambda x: (x["prioridad"], x["puerto"]))

        # Opción de simulación virtual al final
        puertos_encontrados.append({
            "puerto": "SIMULADOR_VIRTUAL",
            "etiqueta": "SIMULADOR VIRTUAL GRBL (Didáctico)",
            "descripcion": "Emulador Virtual GRBL v1.1 (Didáctico ESCOM)",
            "fabricante": "IPN - ESCOM",
            "tipo": "SIMULADOR",
            "prioridad": 99
        })
        return puertos_encontrados

    def conectar(self, puerto: str, baudrate: int = 115200) -> bool:
        """Establece conexión con el puerto especificado o activa el simulador."""
        self.desconectar()

        self.nombre_puerto = puerto
        self.baudrate = baudrate
        self._detener_hilos = False
        self._evento_sesion = threading.Event()

        if puerto == "SIMULADOR_VIRTUAL":
            self.modo_virtual = True
            self.esta_conectado = True
            self.estado_maquina["estado"] = "IDLE"
            self._iniciar_hilos_virtuales()
            self._notificar_consola("c-system", f"[CONEXIÓN] Emulador Virtual GRBL v1.1 iniciado en modo didáctico.")
            self._notificar_consola("c-grbl", "Grbl 1.1h ['$' for help]")
            return True

        if not serial:
            self._notificar_consola("c-alarm", "[ERROR] La librería PySerial no está disponible.")
            return False

        try:
            # Abrir puerto serie con timeout y parámetros optimizados para drivers USB de Windows
            self.puerto_serial = serial.Serial(
                port=puerto,
                baudrate=baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=0.1,
                write_timeout=2.0,
                rtscts=False,
                dsrdtr=False
            )

            # Esperar inicialización del microcontrolador (reinicio por DTR)
            time.sleep(0.6)
            try:
                self.puerto_serial.reset_input_buffer()
                self.puerto_serial.reset_output_buffer()
            except Exception:
                pass

            self.modo_virtual = False
            self.esta_conectado = True
            self.estado_maquina["estado"] = "CONECTADO"

            # Iniciar hilos de lectura y sondeo
            self._iniciar_hilos_hardware()

            self._notificar_consola("c-system", f"[CONEXIÓN] Puerto {puerto} abierto exitosamente a {baudrate} baudios.")

            # Solicitar reporte de estado inmediato y configuración
            try:
                self.enviar_tiempo_real(b'?')
                if self.modo_lapiz:
                    self.enviar_directo('M5\n')
            except Exception:
                pass
            return True

        except Exception as e:
            self.esta_conectado = False
            self.puerto_serial = None
            self._notificar_consola("c-alarm", f"[ERROR] Falló la apertura de {puerto}: {str(e)}")
            return False

    def desconectar(self):
        """Detiene la sesión y espera a sus trabajadores antes de reutilizar el puerto."""
        if self.esta_conectado and self._en_ejecucion_gcode:
            self.parada_emergencia()
        self._detener_hilos = True
        self._evento_sesion.set()
        self._en_ejecucion_gcode = False
        self._en_pausa_gcode = False
        puerto = self.puerto_serial
        self.esta_conectado = False
        if puerto and puerto.is_open:
            try:
                puerto.close()
            except Exception:
                pass
        for hilo in (self._hilo_lectura, self._hilo_sondeo, self._hilo_virtual):
            if hilo and hilo is not threading.current_thread():
                hilo.join(timeout=3)
                if hilo.is_alive():
                    raise RuntimeError("El trabajador serial no terminó; reconexión bloqueada.")
        self.puerto_serial = None
        with self._bloque_lock:
            self._pendientes_respuesta.clear()
            self._cola_manual.clear()
            self._objetivo_feed_override = self._override_feed_pendiente = None
            self._objetivo_spindle_override = self._override_spindle_pendiente = None
            self.spindle_override = 1.0
            self.feed_override = 1.0
            self._cola_bytes_en_transito.clear()
            self._esperando_fin = False
            self._cambio_m6 = self._cambio_listo = False
        self.estado_maquina['estado'] = 'DESCONECTADO'
        self._notificar_consola('c-system', '[DESCONECTADO] Conexión serial finalizada.')
        if self.cb_estado_actualizado:
            self.cb_estado_actualizado(dict(self.estado_maquina))

    # =========================================================================
    # HILOS DE GESTIÓN SERIAL (HARDWARE REAL)
    # =========================================================================

    def _iniciar_hilos_hardware(self):
        """Inicia los hilos de escucha y de sondeo para comunicación serial física."""
        self._hilo_lectura = threading.Thread(target=self._bucle_lectura_serial, daemon=True)
        self._hilo_lectura.start()

        self._hilo_sondeo = threading.Thread(target=self._bucle_sondeo_estado, daemon=True)
        self._hilo_sondeo.start()

    def _bucle_lectura_serial(self):
        """Hilo de escucha continua que procesa respuestas entrantes de GRBL."""
        evento = self._evento_sesion
        puerto = self.puerto_serial
        buffer_linea = bytearray()

        while not evento.is_set() and self.esta_conectado:
            if not self.puerto_serial or not self.puerto_serial.is_open:
                break

            try:
                caracteres = puerto.read(64)
                if not caracteres:
                    continue

                for byte in caracteres:
                    if byte == ord('\n'):
                        linea_texto = buffer_linea.decode('utf-8', errors='ignore').strip()
                        buffer_linea.clear()
                        if linea_texto:
                            self._procesar_linea_grbl(linea_texto)
                    elif byte != ord('\r'):
                        buffer_linea.append(byte)

            except Exception as e:
                if not self._detener_hilos:
                    self._notificar_consola("c-alarm", f"[ERROR DE LECTURA] {str(e)}")
                break

        if not evento.is_set():
            self.esta_conectado = False
            self._en_ejecucion_gcode = False
            self.estado_maquina['estado'] = 'DESCONECTADO'
            if self.cb_estado_actualizado:
                self.cb_estado_actualizado(dict(self.estado_maquina))

    def _bucle_sondeo_estado(self):
        """Hilo de sondeo que consulta el estado enviando '?' cada 200 ms (especificación TT)."""
        evento = self._evento_sesion
        while not evento.is_set() and self.esta_conectado:
            try:
                if self.puerto_serial and self.puerto_serial.is_open:
                    self._escribir_serial(b'?')
            except Exception:
                pass
            evento.wait(0.2)

    # =========================================================================
    # PARSER DE TELEMETRÍA Y RESPUESTAS DE GRBL
    # =========================================================================

    def _procesar_linea_grbl(self, linea: str):
        """Interpreta cada línea de texto recibida desde el microcontrolador."""
        # 1. Reporte de estado en tiempo real (inicia con '<' y termina con '>')
        if linea.startswith('<') and linea.endswith('>'):
            self._parsear_reporte_estado(linea)
            return

        # 2. Confirmación de línea procesada por GRBL
        if linea == "ok":
            self._notificar_consola("c-ok", "ok")
            self._gestionar_confirmacion_buffer(exito=True)
            return

        # 3. Reporte de error de GRBL (ej. error:20)
        if linea.startswith("error:"):
            try:
                codigo = int(linea.split(":")[1])
            except ValueError:
                codigo = 1
            self._notificar_consola("c-error", linea)
            self._gestionar_confirmacion_buffer(exito=False)
            if self.cb_evento_error:
                self.cb_evento_error(codigo, linea)
            return

        # 4. Reporte de Alarma (ej. ALARM:1)
        if linea.startswith("ALARM:"):
            self._cancelar_por_error(linea)
            self.estado_maquina["estado"] = "ALARM"
            self._notificar_consola("c-alarm", linea)
            try:
                cod_alarma = int(linea.split(":")[1])
            except (ValueError, IndexError):
                cod_alarma = 1
            if self.cb_evento_alarma:
                self.cb_evento_alarma(cod_alarma, linea)
            if self.cb_estado_actualizado:
                self.cb_estado_actualizado(dict(self.estado_maquina))
            return

        # 5. Mensajes de retroalimentación o bienvenida
        if linea.startswith("[") or "Grbl" in linea:
            self._notificar_consola("c-grbl", linea)
            return

        # Salida general
        self._notificar_consola("c-info", linea)

    def _parsear_reporte_estado(self, texto_reporte: str):
        """Extrae campos del reporte <Estado|Campo1:Val|Campo2:Val...>."""
        match = self._regex_estado.match(texto_reporte)
        if not match:
            return

        estado_nombre = match.group(1).upper()
        subestado = match.group(2) or ""
        campos_str = match.group(3)

        self.estado_maquina["estado"] = estado_nombre
        self.estado_maquina["subestado"] = subestado

        self.estado_maquina["pines_limite"] = ""
        campos = campos_str.split('|')
        for campo in campos:
            partes = campo.split(':', 1)
            if len(partes) != 2:
                continue

            clave, valor = partes[0], partes[1]

            if clave == "WPos":
                coords = [float(x) for x in self._regex_coords.findall(valor)]
                if len(coords) >= 3:
                    self.estado_maquina["wpos"] = coords[:3]
                    # Actualizar MPos = WPos + WCO
                    self.estado_maquina["mpos"] = [
                        round(coords[i] + self.estado_maquina["wco"][i], 3) for i in range(3)
                    ]

            elif clave == "MPos":
                coords = [float(x) for x in self._regex_coords.findall(valor)]
                if len(coords) >= 3:
                    self.estado_maquina["mpos"] = coords[:3]
                    # Actualizar WPos = MPos - WCO
                    self.estado_maquina["wpos"] = [
                        round(coords[i] - self.estado_maquina["wco"][i], 3) for i in range(3)
                    ]

            elif clave == "WCO":
                coords = [float(x) for x in self._regex_coords.findall(valor)]
                if len(coords) >= 3:
                    self.estado_maquina["wco"] = coords[:3]

            elif clave == "FS":
                vals = [float(x) for x in self._regex_coords.findall(valor)]
                if len(vals) >= 2:
                    self.estado_maquina["feed_real"] = vals[0]
                    self.estado_maquina["spindle_real"] = vals[1]
                    self.estado_maquina["spindle_encendido"] = vals[1] > 0
                    if vals[1] > 0: self._spindle_solicitado = vals[1]

            elif clave == "F":
                vals = [float(x) for x in self._regex_coords.findall(valor)]
                if vals:
                    self.estado_maquina["feed_real"] = vals[0]

            elif clave == "Bf":
                vals = [int(x) for x in re.findall(r"\d+", valor)]
                if len(vals) >= 2:
                    self.estado_maquina["buffer_planificador"] = vals[0]
                    self.estado_maquina["buffer_rx_libre"] = vals[1]

            elif clave == "Ov":
                vals = [int(x) for x in re.findall(r"\d+", valor)]
                if len(vals) >= 3:
                    self.estado_maquina["override_feed"] = vals[0]
                    if self._override_feed_pendiente is not None and vals[0] != self._override_feed_pendiente:
                        self._override_feed_pendiente = None
                    self._ajustar_feed_override()
                    self.estado_maquina["override_rapid"] = vals[1]
                    self.estado_maquina["override_spindle"] = vals[2]
                    if self._override_spindle_pendiente is not None and vals[2] != self._override_spindle_pendiente:
                        self._override_spindle_pendiente = None
                    self._ajustar_spindle_override()

            elif clave == "Pn":
                self.estado_maquina["pines_limite"] = valor

        if any(c.startswith('MPos:') for c in campos):
            self.estado_maquina['wpos'] = [round(m-w, 3) for m, w in zip(self.estado_maquina['mpos'], self.estado_maquina['wco'])]
        elif any(c.startswith('WPos:') for c in campos):
            self.estado_maquina['mpos'] = [round(w+o, 3) for w, o in zip(self.estado_maquina['wpos'], self.estado_maquina['wco'])]
        if self._esperando_fin and estado_nombre == 'IDLE':
            self._esperando_fin = False
            self._en_ejecucion_gcode = False
            if self.cb_progreso:
                self.cb_progreso(self._total_lineas_programa, self._total_lineas_programa, 100., self._tiempo_programa())
            self._notificar_consola('c-system', '[PROGRAMA] Movimiento finalizado; máquina en reposo.')

        # Notificar al frontend mediante callback
        if self.cb_estado_actualizado:
            self.cb_estado_actualizado(dict(self.estado_maquina))

    # =========================================================================
    # COMANDOS DE TIEMPO REAL & CONTROL DE EJECUCIÓN
    # =========================================================================

    def parada_emergencia(self):
        """Envía inmediatamente el byte 0x18 (Ctrl+X) para detener la máquina al instante."""
        self._en_ejecucion_gcode = False
        self._en_pausa_gcode = False
        with self._bloque_lock:
            self._cola_lineas.clear()
            self._cola_bytes_en_transito.clear()
            self._pendientes_respuesta.clear()
            self._cola_manual.clear()
            self._objetivo_feed_override = self._override_feed_pendiente = None
            self._objetivo_spindle_override = self._override_spindle_pendiente = None
            self._esperando_fin = False
            self._cambio_m6 = self._cambio_listo = False

        if self.modo_virtual:
            self.estado_maquina["estado"] = "ALARM"
            self.estado_maquina["feed_real"] = 0.0
            self.estado_maquina["spindle_real"] = 0.0
            self.estado_maquina["spindle_encendido"] = False
            self._notificar_consola("c-alarm", "[E-STOP] Parada de emergencia ejecutada.")
            if self.cb_estado_actualizado:
                self.cb_estado_actualizado(dict(self.estado_maquina))
            return

        if self.puerto_serial and self.puerto_serial.is_open:
            if self.enviar_tiempo_real(b'\x18'):
                self._notificar_consola("c-alarm", "[E-STOP] Señal de reinicio inmediato (0x18) enviada a GRBL.")

    def pausar(self):
        """Envía el comando '!' (Feed Hold) para pausar el movimiento con desaceleración segura."""
        self._en_pausa_gcode = True
        if self.modo_virtual:
            self.estado_maquina["estado"] = "HOLD"
            self._notificar_consola("c-info", "[PAUSA] Movimiento pausado.")
            return

        if self.puerto_serial and self.puerto_serial.is_open:
            if self.enviar_tiempo_real(b'!'):
                self._notificar_consola("c-info", "[PAUSA] Señal Feed Hold (!) enviada.")

    def reanudar(self):
        """Envía el comando '~' (Cycle Start) para continuar el mecanizado."""
        if self._cambio_m6 and not self._cambio_listo:
            self._notificar_consola('c-warn', '[M6] Espere la confirmación de parada del husillo.')
            return
        if self._bloqueo_corte and not self.estado_maquina.get('spindle_encendido'):
            self._notificar_consola('c-warn', '[SEGURIDAD] Encienda el husillo antes de continuar.')
            return
        self._cambio_m6 = self._cambio_listo = self._bloqueo_corte = False
        self._en_pausa_gcode = False
        if self.modo_virtual:
            self.estado_maquina["estado"] = "RUN"
            self._notificar_consola("c-ok", "[REANUDAR] Mecanizado reanudado.")
            return

        if self.puerto_serial and self.puerto_serial.is_open:
            if self.enviar_tiempo_real(b'~'):
                self._notificar_consola("c-ok", "[REANUDAR] Señal Cycle Start (~) enviada.")

        # Reanudar alimentación de líneas en cola si estaban detenidas por pausa o cambio de herramienta
        self._alimentar_buffer_gcode()

    def desbloquear_alarma(self):
        """Envía el comando '$X' para desbloquear el estado de alarma de GRBL."""
        self.enviar_comando("$X")

    def ejecutar_homing(self):
        """Envía el comando '$H' para iniciar la secuencia de referenciado de ejes."""
        self.enviar_comando("$H")

    def poner_cero_eje(self, eje: str):
        """Fija el sistema de coordenadas de trabajo (cero pieza) en el eje indicado."""
        eje = eje.upper()
        if eje not in ("X", "Y", "Z"):
            return
        if self.estado_maquina.get("estado") == "ALARM":
            self._notificar_consola("c-alarm", f"[BLOQUEO] No se puede fijar cero en {eje}: la máquina está en ALARMA. Desbloquee con $X.")
            return
        if self.modo_virtual:
            idx = 0 if eje == "X" else (1 if eje == "Y" else 2)
            self.estado_maquina["wpos"][idx] = 0.0
            self._notificar_consola("c-ok", f"> G10 L20 P1 {eje}0")
            self._notificar_consola("c-ok", "ok")
            if self.cb_estado_actualizado:
                self.cb_estado_actualizado(dict(self.estado_maquina))
            return
        self.enviar_comando(f"G10 L20 P1 {eje}0")

    def poner_cero_plano_xy(self):
        """Fija los ejes cartesianos X e Y a cero en una sola instrucción atómica en G54."""
        if self.estado_maquina.get("estado") == "ALARM":
            self._notificar_consola("c-alarm", "[BLOQUEO] No se puede fijar cero XY: la máquina está en ALARMA. Desbloquee con $X.")
            return
        if self.modo_virtual:
            self.estado_maquina["wpos"][0] = 0.0
            self.estado_maquina["wpos"][1] = 0.0
            self._notificar_consola("c-ok", "> G10 L20 P1 X0 Y0")
            self._notificar_consola("c-ok", "ok")
            if self.cb_estado_actualizado:
                self.cb_estado_actualizado(dict(self.estado_maquina))
            return
        self.enviar_comando("G10 L20 P1 X0 Y0")

    def poner_cero_todos(self):
        """Fija X, Y y Z en cero en el sistema de coordenadas de trabajo actual (G54)."""
        if self.estado_maquina.get("estado") == "ALARM":
            self._notificar_consola("c-alarm", "[BLOQUEO] No se puede fijar el cero: la máquina está en ALARMA. Desbloquee con $X.")
            return
        if self.modo_virtual:
            self.estado_maquina["wpos"] = [0.0, 0.0, 0.0]
            self._notificar_consola("c-ok", "> G10 L20 P1 X0 Y0 Z0")
            self._notificar_consola("c-ok", "ok")
            if self.cb_estado_actualizado:
                self.cb_estado_actualizado(dict(self.estado_maquina))
            return
        self.enviar_comando("G10 L20 P1 X0 Y0 Z0")

    def mover_jog(self, eje: str, paso: float, velocidad: float):
        """Ejecuta un movimiento manual incremental según la directiva $J= de GRBL v1.1."""
        estado_actual = self.estado_maquina.get('estado', 'IDLE')
        if self._en_ejecucion_gcode:
            self._notificar_consola('c-warn', '[BLOQUEO] No se permite Jog durante el mecanizado de un programa.')
            return
        if estado_actual == 'ALARM':
            self._notificar_consola('c-alarm', '[BLOQUEO] Máquina en ALARMA. Desbloquee con $X antes de mover con Jog.')
            return
        if estado_actual not in ('IDLE', 'JOG'):
            self._notificar_consola('c-warn', f'[BLOQUEO] Jog requiere máquina en reposo o jog previo (estado actual: {estado_actual}).')
            return
        eje = eje.upper()
        if eje not in ("X", "Y", "Z"):
            return

        vel = max(10.0, float(velocidad))
        cmd = f"$J=G91 G21 {eje}{paso:.3f} F{vel:.1f}"

        if self.modo_virtual:
            idx = 0 if eje == "X" else (1 if eje == "Y" else 2)
            self.estado_maquina["wpos"][idx] = round(self.estado_maquina["wpos"][idx] + paso, 3)
            self.estado_maquina["mpos"][idx] = self.estado_maquina["wpos"][idx]
            self.estado_maquina["estado"] = "JOG"
            self._notificar_consola("c-ok", f"> {cmd}")
            if self.cb_estado_actualizado:
                self.cb_estado_actualizado(dict(self.estado_maquina))

            self._tiempo_ultimo_jog = time.time()
            evento = self._evento_sesion
            def fin_jog(tiempo_llamada):
                if evento.wait(.25):
                    return
                if evento is self._evento_sesion and self.estado_maquina.get("estado") == "JOG":
                    if time.time() - getattr(self, '_tiempo_ultimo_jog', 0) >= 0.24:
                        self.estado_maquina["estado"] = "IDLE"
                        if self.cb_estado_actualizado:
                            self.cb_estado_actualizado(dict(self.estado_maquina))

            threading.Thread(target=fin_jog, args=(self._tiempo_ultimo_jog,), daemon=True).start()
            return

        self.enviar_directo(f"{cmd}\n")
        self._notificar_consola("c-ok", f"> {cmd}")

    def establecer_feed_override(self, porcentaje: float):
        """Aplica el objetivo virtual o converge con reportes Ov del firmware físico."""
        limite_max = 2000 if self.modo_virtual else 200
        pct = max(10, min(limite_max, int(round(float(porcentaje)))))
        if self.modo_virtual:
            self.feed_override = pct / 100.
            self.estado_maquina['override_feed'] = pct
            if self.cb_estado_actualizado:
                self.cb_estado_actualizado(dict(self.estado_maquina))
            return
        if not self.esta_conectado:
            return
        with self._bloque_lock:
            self._objetivo_feed_override = pct
            self._ajustar_feed_override()

    def _ajustar_feed_override(self):
        # GRBL guarda los incrementos como flags: repetirlos en un paquete puede
        # colapsarlos. Esperar un Ov distinto antes de enviar otro incremento.
        with self._bloque_lock:
            if self.modo_virtual or not self.esta_conectado or self._objetivo_feed_override is None or self._override_feed_pendiente is not None:
                return
            actual = self.estado_maquina['override_feed']
            delta = self._objetivo_feed_override - actual
            if delta == 0:
                self._objetivo_feed_override = None
                return
            if self._objetivo_feed_override == 100:
                comando = 0x90
            elif delta >= 10: comando = 0x91
            elif delta <= -10: comando = 0x92
            elif delta > 0: comando = 0x93
            else: comando = 0x94
            self._override_feed_pendiente = actual
            if self.enviar_tiempo_real(bytes([comando])):
                self.enviar_tiempo_real(b'?')
            else:
                self._override_feed_pendiente = None
                self._objetivo_feed_override = None

    def establecer_spindle_override(self, porcentaje: float):
        """Ajusta el porcentaje de velocidad del husillo o potencia láser entre 10% y 200%."""
        pct = max(10, min(200, int(round(float(porcentaje)))))
        if self.modo_virtual:
            self.spindle_override = pct / 100.
            self.estado_maquina['override_spindle'] = pct
            if self.estado_maquina.get('spindle_encendido'):
                self.estado_maquina['spindle_real'] = round(self._spindle_solicitado * self.spindle_override, 1)
            if self.cb_estado_actualizado:
                self.cb_estado_actualizado(dict(self.estado_maquina))
            return
        if not self.esta_conectado:
            return
        with self._bloque_lock:
            self._objetivo_spindle_override = pct
            self._ajustar_spindle_override()

    def _ajustar_spindle_override(self):
        # GRBL v1.1 comandos de tiempo real de husillo:
        # 0x99: Reset a 100%, 0x9A: +10%, 0x9B: -10%, 0x9C: +1%, 0x9D: -1%
        with self._bloque_lock:
            if self.modo_virtual or not self.esta_conectado or self._objetivo_spindle_override is None or self._override_spindle_pendiente is not None:
                return
            actual = self.estado_maquina.get('override_spindle', 100)
            delta = self._objetivo_spindle_override - actual
            if delta == 0:
                self._objetivo_spindle_override = None
                return
            if self._objetivo_spindle_override == 100:
                comando = 0x99
            elif delta >= 10: comando = 0x9A
            elif delta <= -10: comando = 0x9B
            elif delta > 0: comando = 0x9C
            else: comando = 0x9D
            self._override_spindle_pendiente = actual
            if self.enviar_tiempo_real(bytes([comando])):
                self.enviar_tiempo_real(b'?')
            else:
                self._override_spindle_pendiente = None
                self._objetivo_spindle_override = None

    def establecer_tipo_herramienta(self, tipo: str):
        """Configura el tipo de herramienta activa ('fresa', 'lapiz' o 'laser')."""
        if self._en_ejecucion_gcode or self._pendientes_respuesta:
            self._notificar_consola('c-warn', '[BLOQUEO] Detenga el programa y espere los comandos pendientes antes de cambiar la herramienta.')
            return False
        tipo_normalizado = str(tipo).strip().lower()
        if tipo_normalizado == 'lapiz' and self.esta_conectado and not self.modo_virtual:
            if not self.enviar_directo('M5\n'):
                return False
        if tipo_normalizado == "lapiz":
            self.modo_lapiz = True
            self.modo_laser = False
            self.tipo_herramienta = "lapiz"
        elif tipo_normalizado in ("laser", "láser"):
            self.modo_lapiz = False
            self.modo_laser = True
            self.tipo_herramienta = "laser"
        else:
            self.modo_lapiz = False
            self.modo_laser = False
            self.tipo_herramienta = "fresa"

        self.estado_maquina["modo_lapiz"] = self.modo_lapiz
        self.estado_maquina["modo_laser"] = self.modo_laser
        self.estado_maquina["tipo_herramienta"] = self.tipo_herramienta

        if self.modo_lapiz:
            if self.modo_virtual:
                self.estado_maquina['spindle_encendido'] = False
                self.estado_maquina['spindle_real'] = 0.
            self._notificar_consola(
                "c-info",
                "[HERRAMIENTA] Modo LÁPIZ activado: El husillo motorizado no se encenderá durante el trabajo."
            )
        elif self.modo_laser:
            # En modo láser, se habilita el diodo (control PWM M3/M4/M5) sin esfuerzo mecánico de fresa
            self._notificar_consola(
                "c-info",
                "[HERRAMIENTA] Modo DIODO LÁSER activado: Diodo emisor habilitado con modulación PWM (M3/M4/M5). Sin interbloqueo de rotura de fresa."
            )
        else:
            self._notificar_consola(
                "c-info",
                "[HERRAMIENTA] Modo FRESA CNC activado: Husillo motorizado e interbloqueos de corte habilitados."
            )

        if self.cb_estado_actualizado:
            self.cb_estado_actualizado(dict(self.estado_maquina))
        return True

    def establecer_pausa_m6(self, habilitar: bool):
        """Habilita o deshabilita la pausa obligatoria de seguridad ante comando M6."""
        self.pausa_m6 = bool(habilitar)
        estado_str = "habilitada" if self.pausa_m6 else "deshabilitada"
        self._notificar_consola("c-info", f"[AJUSTES] Pausa segura ante comando M6 {estado_str}.")

    def _analizar_y_filtrar_herramienta(self, linea: str) -> tuple:
        """
        Interpreta y filtra los códigos T{n} (selección de herramienta) y M6/M06 (cambio de herramienta).
        El firmware nativo de GRBL v1.1 en microcontroladores ATmega328P no implementa internamente
        estos comandos (retornando error:20 'Comando G no soportado'). Como estándar en emisores CNC
        (Candle, UGS, bCNC), estos códigos son gestionados en la capa del host.

        Retorna:
            (linea_filtrada, herramienta_detectada, hubo_m6)
        """
        tokens = palabras(linea)
        t = next((int(v) for k, v in tokens if k == 'T'), None)
        m6 = any(k == 'M' and v == 6 for k, v in tokens)
        codigo = limpiar(linea)
        codigo = TOKEN.sub(lambda m: '' if m[1] == 'T' or (m[1] == 'M' and float(m[2]) == 6) else m[0], codigo)
        return codigo.strip(), str(t) if t is not None else None, m6

    def controlar_spindle(self, encendido: bool, rpm: int):
        """Enciende (M3 S...) o apaga (M5) el husillo/láser respetando los interbloqueos de seguridad."""
        # En modo lápiz, el husillo no debe encenderse bajo ninguna circunstancia
        if self.modo_lapiz:
            if encendido:
                self._notificar_consola(
                    "c-warn",
                    "[MODO LÁPIZ] El husillo no puede encenderse porque la herramienta activa es un Lápiz Didáctico."
                )
            self.estado_maquina["spindle_encendido"] = False
            self.estado_maquina["spindle_real"] = 0.0
            if self.cb_estado_actualizado:
                self.cb_estado_actualizado(dict(self.estado_maquina))
            return

        esta_mecanizando = self._en_ejecucion_gcode or self.estado_maquina.get("estado") in ("RUN", "HOLD")

        # INTERBLOQUEO DE SEGURIDAD CNC:
        # Solo aplica a FRESA mecánica para evitar que una broca avance sin rotación
        if not self.modo_laser and esta_mecanizando and (not encendido or int(rpm) <= 0):
            titulo = "BLOQUEO DE SEGURIDAD DEL HUSILLO"
            encabezado = "No se puede apagar el husillo durante el mecanizado"
            desc = "El husillo (Spindle) no puede apagarse mientras el mecanizado está en curso. Para proteger la herramienta de corte y la pieza, detenga o pause el programa primero."
            self._notificar_consola("c-alarm", f"[BLOQUEO DE SEGURIDAD] {desc}")
            if self.cb_alerta_seguridad:
                self.cb_alerta_seguridad(titulo, encabezado, desc)
            return

        # Ajuste de potencia durante el mecanizado: se aplica mediante real-time Spindle Override
        if esta_mecanizando and encendido and int(rpm) > 0:
            if self.modo_laser:
                pct = max(10, min(100, int(round((int(rpm) / 1000.0) * 100))))
                self.establecer_spindle_override(pct)
                return
            else:
                base = self._spindle_solicitado if self._spindle_solicitado > 0 else 12000.0
                pct = max(10, min(200, int(round((int(rpm) / base) * 100))))
                self.establecer_spindle_override(pct)
                return

        rpm = max(0, int(rpm))
        if encendido and rpm > 0:
            cmd = f"M3 S{rpm}"

        else:
            cmd = "M5"

        if self.modo_virtual:
            self.estado_maquina["spindle_encendido"] = encendido and rpm > 0
            self.estado_maquina["spindle_real"] = float(rpm) if encendido else 0.0
            etiqueta = "[DIODO LÁSER]" if self.modo_laser else ""
            self._notificar_consola("c-ok", f"> {cmd} {etiqueta}".strip())
            if self.cb_estado_actualizado:
                self.cb_estado_actualizado(dict(self.estado_maquina))
            return

        self.enviar_comando(cmd)

    # =========================================================================
    # ENVÍO DE COMANDOS DIRECTOS Y MDI
    # =========================================================================

    def enviar_comando(self, comando: str):
        comando = comando.strip()
        if not comando:
            return False
        if '\n' in comando or '\r' in comando:
            self._notificar_consola('c-error', '[BLOQUEO] Envíe un solo bloque por comando.')
            return False
        try:
            tokens = [] if comando.startswith('$') else palabras(comando)
            ms = [v for k, v in tokens if k == 'M']
            if self.modo_lapiz:
                comando = quitar_motor(comando) if tokens else comando
                tokens = palabras(comando) if tokens else tokens
            if self._en_ejecucion_gcode:
                # Solo se permite recuperar el giro durante una pausa segura.
                recuperacion = self._en_pausa_gcode and not self._pendientes_respuesta and not (self._cambio_m6 and not self._cambio_listo)
                es_husillo = tokens and all(k in 'MS' for k, _ in tokens)
                if not (recuperacion and es_husillo):
                    self._notificar_consola('c-warn', '[BLOQUEO] Comando manual rechazado durante el programa.')
                    return False
                if 5 in ms and not self._cambio_listo:
                    return False
            if any(m == 6 for m in ms):
                self._notificar_consola('c-warn', '[M6] Ejecute el cambio de herramienta desde un programa para sincronizar la parada.')
                return False
            filtrada, t, _ = self._analizar_y_filtrar_herramienta(comando) if tokens else (comando, None, False)
            if t:
                self.herramienta_activa = 'T'+t
                self.estado_maquina['herramienta'] = self.herramienta_activa
            if not filtrada:
                return True
            if self.modo_virtual:
                self._simular_respuesta_comando(filtrada)
                return True
            return self.enviar_directo(filtrada+'\n')
        except ValueError as e:
            self._notificar_consola('c-error', str(e))
            return False

    def _escribir_serial(self, datos: bytes) -> bool:
        """Transmite bytes por el puerto serial de forma atómica y protegida por cerrojo entre hilos."""
        if not self.puerto_serial or not self.puerto_serial.is_open:
            return False
        with self._serial_write_lock:
            try:
                escritos = self.puerto_serial.write(datos)
                if escritos != len(datos):
                    raise IOError('Escritura serial incompleta.')
                return True
            except Exception as e:
                self._notificar_consola("c-alarm", f"[ERROR DE TRANSMISIÓN] {str(e)}")
                return False

    def enviar_directo(self, texto_con_salto: str, clase='manual') -> bool:
        texto = texto_con_salto.strip()
        if not texto or '\n' in texto or '\r' in texto:
            return False
        try:
            datos = (texto+'\n').encode('ascii')
        except UnicodeEncodeError:
            self._notificar_consola('c-error', 'El comando debe ser ASCII.')
            return False
        if len(datos) > 80:
            self._notificar_consola('c-error', 'El bloque supera 79 caracteres útiles.')
            return False
        with self._bloque_lock:
            if clase == 'manual' and self._pendientes_respuesta and not self._en_ejecucion_gcode:
                if len(self._cola_manual) < 20:
                    self._cola_manual.append(texto)
                return True
            if self._pendientes_respuesta or (clase == 'manual' and self._en_ejecucion_gcode and not self._en_pausa_gcode):
                self._notificar_consola('c-warn', '[SERIAL] Espere la respuesta del comando anterior.')
                return False
            self._pendientes_respuesta.append((clase, texto))
            if not self._escribir_serial(datos):
                self._pendientes_respuesta.pop()
                return False
            return True

    def enviar_tiempo_real(self, byte_cmd: Any) -> bool:
        """Transmite un comando de tiempo real (single-byte) sin salto de línea a GRBL."""
        if isinstance(byte_cmd, int):
            datos = bytes([byte_cmd])
        elif isinstance(byte_cmd, bytes):
            datos = byte_cmd
        elif isinstance(byte_cmd, str):
            datos = byte_cmd.encode('latin-1')
        else:
            return False
        return self._escribir_serial(datos)

    # =========================================================================
    # STREAMING DE ARCHIVOS G-CODE CON CONFIRMACIÓN SERIALIZADA
    # =========================================================================

    def iniciar_programa(self, contenido_gcode: str):
        with self._bloque_lock:
            if not self.esta_conectado or self._en_ejecucion_gcode or self._pendientes_respuesta or self._cola_manual or self.estado_maquina.get('estado') != 'IDLE':
                self._notificar_consola('c-error', '[PROGRAMA] Requiere conexión en reposo y sin comandos pendientes.')
                return False
            analisis = ProcesadorGCode().analizar_programa(contenido_gcode)
            if not analisis['es_valido']:
                self._notificar_consola('c-error', '[PROGRAMA] '+str(analisis['errores'][0]))
                return False
            lineas = contenido_gcode.splitlines()
            if not any(limpiar(l) and limpiar(l) != '%' for l in lineas):
                return False
            plan = []
            interprete = Interprete(self.estado_maquina['wpos'])
            try:
                for linea in lineas:
                    limpia = limpiar(linea)
                    if limpia == '%': limpia = ''
                    if self.modo_lapiz: limpia = quitar_motor(limpia)
                    bloque = interprete.bloque(limpia)
                    filtrada, t, m6 = self._analizar_y_filtrar_herramienta(limpia)
                    if len((filtrada+'\n').encode('ascii')) > 80:
                        raise ValueError('Bloque mayor de 79 caracteres útiles.')
                    if m6 and (bloque['segmentos'] or any(k not in ('T', 'M', 'N') or (k == 'M' and v != 6) for k, v in bloque['tokens'])):
                        raise ValueError('Separe M6 de los movimientos en otro bloque.')
                    plan.append((filtrada, t, m6, bloque))
            except (ValueError, UnicodeEncodeError) as e:
                self._notificar_consola('c-error', '[PROGRAMA] '+str(e))
                return False
            self._cola_lineas = lineas
            self._plan_programa = plan
            self._total_lineas_programa = len(lineas)
            self._linea_actual_enviada = 0
            self._en_ejecucion_gcode = True
            self._en_pausa_gcode = False
            self._esperando_fin = False
            self._cambio_m6 = self._cambio_listo = self._bloqueo_corte = False
            self._tiempo_inicio_ejecucion = time.time()
        if self.modo_virtual:
            self._hilo_virtual = threading.Thread(target=self._bucle_ejecucion_virtual, daemon=True)
            self._hilo_virtual.start()
        else:
            # Establecer los mismos modos iniciales que usa el intérprete.
            if not self.enviar_directo('G21G90G17G54G94G91.1G0\n', 'inicio'):
                self._cancelar_por_error('No se pudo establecer el estado modal inicial.')
                return False
        return True

    def _tiempo_programa(self):
        segundos = int(time.time()-self._tiempo_inicio_ejecucion)
        return f'{segundos//60:02d}:{segundos%60:02d}'

    def _alertar(self, titulo, descripcion):
        self._notificar_consola('c-warn', descripcion)
        if self.cb_alerta_seguridad:
            self.cb_alerta_seguridad(titulo, titulo, descripcion)

    def _cancelar_por_error(self, mensaje):
        self.parada_emergencia()
        self.estado_maquina['estado'] = 'ALARM'
        if self.cb_estado_actualizado:
            self.cb_estado_actualizado(dict(self.estado_maquina))
        self._notificar_consola('c-error', '[PROGRAMA FALLIDO] '+mensaje)
        if self.cb_resultado_programa:
            self.cb_resultado_programa('Error')

    def _alimentar_buffer_gcode(self):
        # Una sola línea pendiente: las respuestas manuales y del programa nunca se mezclan.
        with self._bloque_lock:
            if not self._en_ejecucion_gcode or self._en_pausa_gcode or self._pendientes_respuesta or self._esperando_fin:
                return
            while self._linea_actual_enviada < len(self._plan_programa):
                texto, t, m6, bloque = self._plan_programa[self._linea_actual_enviada]
                if t:
                    self.herramienta_activa = 'T'+t
                    self.estado_maquina['herramienta'] = self.herramienta_activa
                if m6 and self.pausa_m6:
                    self._cambio_m6 = True
                    self._en_pausa_gcode = True
                    self._linea_actual_enviada += 1
                    # G4 P0 espera al planificador; después se confirma M5 antes de avisar.
                    if not self.enviar_directo('G4 P0\n', 'm6_barrera'):
                        self._cancelar_por_error('No se pudo sincronizar M6.')
                    return
                arranca = any(m in (3, 4) for m in bloque['m']) and bloque['p'].get('S', self._spindle_solicitado) > 0
                corta = bloque['segmentos'] and not bloque['rapido']
                apagado = 5 in bloque['m'] or bloque['p'].get('S', 1) == 0
                if corta and not self.modo_lapiz and not self.modo_laser and (apagado or not (arranca or self.estado_maquina['spindle_encendido'])):
                    self._bloqueo_corte = self._en_pausa_gcode = True
                    self.pausar()
                    self._alertar('CORTE CON HUSILLO APAGADO', 'Encienda el husillo antes de continuar; el movimiento no se ha enviado.')
                    return
                self._linea_actual_enviada += 1
                if texto:
                    if not self.enviar_directo(texto+'\n', 'programa'):
                        self._cancelar_por_error('No se pudo transmitir el bloque.')
                    return
            if not self.enviar_directo('G4 P0\n', 'fin_barrera'):
                self._cancelar_por_error('No se pudo confirmar el final físico.')

    def _gestionar_confirmacion_buffer(self, exito: bool):
        with self._bloque_lock:
            if not self._pendientes_respuesta:
                return
            clase, texto = self._pendientes_respuesta.popleft()
            if not exito:
                self._cola_manual.clear()
                if self._en_ejecucion_gcode:
                    self._cancelar_por_error('GRBL rechazó: '+texto)
                return
            self._actualizar_husillo(texto)
            if clase == 'manual' and self._cola_manual:
                siguiente = self._cola_manual.popleft()
                self.enviar_directo(siguiente+'\n')
                self._notificar_consola("c-ok", f"> {siguiente}")
                return
            if clase == 'm6_barrera':
                if not self.enviar_directo('M5\n', 'm6_apagado'):
                    self._cancelar_por_error('No se pudo apagar el husillo para M6.')
                return
            if clase == 'm6_apagado':
                self._cambio_listo = True
                self._alertar('CAMBIO DE HERRAMIENTA (M6)', f'Planificador detenido y M5 confirmado. Monte {self.herramienta_activa} y presione Continuar.')
                return
            if clase == 'fin_barrera':
                self._esperando_fin = True
                self.enviar_tiempo_real(b'?')
                return
            if self._en_ejecucion_gcode and clase == 'programa' and self.cb_linea_confirmada:
                self.cb_linea_confirmada(self._linea_actual_enviada - 1, False)
            if self._en_ejecucion_gcode and clase == 'programa' and self.cb_progreso:
                actual = self._linea_actual_enviada
                self.cb_progreso(actual, self._total_lineas_programa, min(99., actual/self._total_lineas_programa*100), self._tiempo_programa())
        self._alimentar_buffer_gcode()

    def _actualizar_husillo(self, texto):
        try:
            p = dict(palabras(texto))
            ms = [v for k, v in palabras(texto) if k == 'M']
        except ValueError:
            return
        if 'S' in p: self._spindle_solicitado = p['S']
        ov = getattr(self, 'spindle_override', 1.0)
        if any(m in (3, 4) for m in ms):
            self.estado_maquina['spindle_encendido'] = self._spindle_solicitado > 0
            self.estado_maquina['spindle_real'] = self._spindle_solicitado * ov
        elif 'S' in p and self.estado_maquina.get('spindle_encendido'):
            self.estado_maquina['spindle_real'] = self._spindle_solicitado * ov
        if 5 in ms or p.get('S', 1) == 0:
            self.estado_maquina['spindle_encendido'] = False
        if 5 in ms: self.estado_maquina['spindle_real'] = 0.

    # =========================================================================
    # EMULADOR VIRTUAL DIDÁCTICO (FALLBACK ACADÉMICO)
    # =========================================================================

    def _iniciar_hilos_virtuales(self):
        """Inicia el ciclo de telemetría del simulador didáctico."""
        evento = self._evento_sesion
        def bucle_sim():
            while not evento.is_set() and self.esta_conectado and self.modo_virtual:
                if self.cb_estado_actualizado:
                    self.cb_estado_actualizado(dict(self.estado_maquina))
                evento.wait(.2)
        self._hilo_sondeo = threading.Thread(target=bucle_sim, daemon=True)
        self._hilo_sondeo.start()

    def _simular_respuesta_comando(self, cmd: str):
        """Responde a comandos en el simulador virtual reproduciendo la sintaxis de GRBL."""
        c = cmd.upper()
        if not c.startswith('$'):
            self._actualizar_husillo(c)
        if c == "$$":
            self._notificar_consola("c-grbl", "$100=250.000 (x:step/mm)\n$101=250.000 (y:step/mm)\n$102=250.000 (z:step/mm)\n$110=2500.000 (x:max rate)\n$111=2500.000 (y:max rate)\n$112=800.000 (z:max rate)")
            self._notificar_consola("c-ok", "ok")
        elif c == "$G":
            self._notificar_consola("c-grbl", "[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F800 S0]")
            self._notificar_consola("c-ok", "ok")
        elif c == "$X":
            self.estado_maquina["estado"] = "IDLE"
            self._notificar_consola("c-ok", "[MSG:Caution: Unlocked]")
            self._notificar_consola("c-ok", "ok")
        elif c == "$H":
            self.estado_maquina["wpos"] = [0.0, 0.0, 0.0]
            self.estado_maquina["mpos"] = [0.0, 0.0, 0.0]
            self.estado_maquina["estado"] = "IDLE"
            self._notificar_consola("c-ok", "ok")
        elif c.startswith("G10 L20"):
            self.estado_maquina["wpos"] = [0.0, 0.0, 0.0]
            self._notificar_consola("c-ok", "ok")
        elif re.search(r"^\s*M0?[34]\b", c):
            if self.modo_lapiz:
                self.estado_maquina["spindle_encendido"] = False
                self.estado_maquina["spindle_real"] = 0.0
                self._notificar_consola(
                    "c-warn",
                    f"[MODO LÁPIZ] Comando '{cmd}' -> El código G contiene encendido de motor (M3/M4), pero el husillo no se encenderá por estar en modo lápiz."
                )
            else:
                self.estado_maquina["spindle_encendido"] = True
                match_s = re.search(r"S(\d+(?:\.\d+)?)", c)
                def_s = 1000.0 if self.modo_laser else 12000.0
                self.estado_maquina["spindle_real"] = float(match_s.group(1)) if match_s else def_s
                if self.modo_laser:
                    self._notificar_consola("c-ok", f"[DIODO LÁSER ACTIVADO] Potencia PWM: S{self.estado_maquina['spindle_real']:.0f}")
            self._notificar_consola("c-ok", "ok")
        elif re.search(r"^\s*M0?5\b", c):
            self.estado_maquina["spindle_encendido"] = False
            self.estado_maquina["spindle_real"] = 0.0
            if self.modo_laser:
                self._notificar_consola("c-ok", "[DIODO LÁSER APAGADO]")
            self._notificar_consola("c-ok", "ok")
        elif re.search(r"^\s*T(\d+)\b", c):
            m = re.search(r"^\s*T(\d+)\b", c)
            t_num = m.group(1)
            self.herramienta_activa = f"T{t_num}"
            self.estado_maquina["herramienta"] = f"T{t_num}"
            self._notificar_consola("c-info", f"[HERRAMIENTA] Herramienta T{t_num} seleccionada.")
            self._notificar_consola("c-ok", "ok")
        elif re.search(r"^\s*M0?6\b", c):
            if self.pausa_m6:
                self.estado_maquina["estado"] = "HOLD"
                self.estado_maquina["spindle_encendido"] = False
                self.estado_maquina["spindle_real"] = 0.0
                self._notificar_consola("c-warn", f"[CAMBIO DE HERRAMIENTA] Comando M6 procesado: Pausa de seguridad para cambio a {self.herramienta_activa}.")
            else:
                self._notificar_consola("c-info", f"[CAMBIO DE HERRAMIENTA] Comando M6 procesado con éxito.")
            self._notificar_consola("c-ok", "ok")
        else:
            self._notificar_consola("c-ok", "ok")

    def _bucle_ejecucion_virtual(self):
        """Ejecuta los mismos segmentos y modos validados para el hardware."""
        evento = self._evento_sesion
        self.estado_maquina['estado'] = 'RUN'
        ultimo_estado_emitido = 0.0
        ultimo_progreso_emitido = 0.0
        try:
            for idx, (texto, t, m6, bloque) in enumerate(self._plan_programa):
                if evento.is_set() or not self._en_ejecucion_gcode:
                    return
                if t:
                    self.herramienta_activa = 'T'+t
                    self.estado_maquina['herramienta'] = self.herramienta_activa
                if m6 and self.pausa_m6:
                    self._en_pausa_gcode = self._cambio_m6 = self._cambio_listo = True
                    self.estado_maquina['estado'] = 'HOLD'
                    self._actualizar_husillo('M5')
                    self._alertar('CAMBIO DE HERRAMIENTA (M6)', f'Simulación detenida. Monte {self.herramienta_activa} y presione Continuar.')
                while self._en_pausa_gcode and self._en_ejecucion_gcode and not evento.wait(.02):
                    pass
                if evento.is_set() or not self._en_ejecucion_gcode:
                    return
                self._actualizar_husillo(texto)
                if bloque['segmentos'] and not bloque['rapido'] and not (self.modo_lapiz or self.modo_laser or self.estado_maquina['spindle_encendido']):
                    self._bloqueo_corte = self._en_pausa_gcode = True
                    self.estado_maquina['estado'] = 'HOLD'
                    self._alertar('CORTE CON HUSILLO APAGADO', 'Encienda el husillo antes de continuar.')
                while self._en_pausa_gcode and self._en_ejecucion_gcode and not evento.wait(.02):
                    pass
                if evento.is_set() or not self._en_ejecucion_gcode:
                    return
                vel = 2500. if bloque['rapido'] else bloque['feed']
                for inicio, fin, tipo in bloque['segmentos']:
                    distancia = math.dist(inicio, fin)
                    duracion = distancia / vel * 60
                    pasos = max(1, math.ceil(min(2., duracion)/.035))
                    override = max(.1, getattr(self, 'feed_override', 1.))
                    dt_paso = min(.035, duracion/pasos) / override
                    for paso in range(1, pasos+1):
                        while self._en_pausa_gcode and self._en_ejecucion_gcode and not evento.wait(.02):
                            pass
                        if evento.is_set() or not self._en_ejecucion_gcode:
                            return
                        self.estado_maquina['wpos'] = [a+(b-a)*paso/pasos for a, b in zip(inicio, fin)]
                        self.estado_maquina['mpos'] = [w+o for w, o in zip(self.estado_maquina['wpos'], self.estado_maquina['wco'])]
                        self.estado_maquina['feed_real'] = vel*override
                        ahora = time.time()
                        if self.cb_estado_actualizado and (paso == pasos or ahora - ultimo_estado_emitido >= 0.030):
                            self.cb_estado_actualizado(dict(self.estado_maquina))
                            ultimo_estado_emitido = ahora
                        if evento.wait(dt_paso):
                            return
                if not bloque['segmentos'] and not bloque['espera']:
                    if evento.is_set():
                        return
                if bloque['espera']:
                    override = max(.1, getattr(self, 'feed_override', 1.))
                    if evento.wait(bloque['espera'] / override):
                        return
                self._linea_actual_enviada = idx+1
                if texto and not m6 and self.cb_linea_confirmada:
                    self.cb_linea_confirmada(idx, True)
                ahora_p = time.time()
                es_ultima = (idx + 1 >= self._total_lineas_programa)
                if self.cb_progreso and (es_ultima or ahora_p - ultimo_progreso_emitido >= 0.040):
                    self.cb_progreso(idx+1, self._total_lineas_programa, min(99., (idx+1)/self._total_lineas_programa*100), self._tiempo_programa())
                    ultimo_progreso_emitido = ahora_p
            if self._en_ejecucion_gcode and not evento.is_set():
                self._en_ejecucion_gcode = False
                self.estado_maquina['estado'] = 'IDLE'
                self.estado_maquina['feed_real'] = 0.
                if self.cb_estado_actualizado:
                    self.cb_estado_actualizado(dict(self.estado_maquina))
                if self.cb_progreso:
                    self.cb_progreso(self._total_lineas_programa, self._total_lineas_programa, 100., self._tiempo_programa())
        except Exception as e:
            self._cancelar_por_error(str(e))

    # =========================================================================
    # AUXILIARES DE NOTIFICACIÓN
    # =========================================================================

    def _notificar_consola(self, tipo: str, mensaje: str):
        """Envía mensajes a la consola serial respetando el callback registrado."""
        if self.cb_linea_consola:
            try:
                self.cb_linea_consola(tipo, mensaje)
            except Exception:
                pass
