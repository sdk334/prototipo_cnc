# -*- coding: utf-8 -*-
"""
Módulo Controlador y Driver Serial GRBL v1.1
Proyecto: Trabajo Terminal 2026-B072 (ESCOM - IPN)
Interfaz de Control para Máquinas CNC con Fines Educativos

Responsabilidad:
- Gestión de conexión física por puerto serial USB con PySerial a 115200 baudios.
- Hilo daemon de sondeo en tiempo real mediante consulta '?' cada 200 ms.
- Analizador de sintaxis de telemetría de GRBL v1.1 (WPos, MPos, FS, Ov, Bf, Pn).
- Protocolo de transmisión de G-code con control de flujo por conteo de caracteres (Character-Counting).
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

        # Estado en tiempo real parseado del controlador
        self.estado_maquina: Dict[str, Any] = {
            "estado": "DESCONECTADO",
            "subestado": "",
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
        self._bloque_lock = threading.Lock()
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
        self.cb_estado_actualizado: Optional[Callable[[Dict[str, Any]], None]] = None
        self.cb_linea_consola: Optional[Callable[[str, str], None]] = None
        self.cb_progreso: Optional[Callable[[int, int, float, str], None]] = None
        self.cb_evento_error: Optional[Callable[[int, str], None]] = None
        self.cb_evento_alarma: Optional[Callable[[int, str], None]] = None

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
        if self.esta_conectado:
            self.desconectar()

        self.nombre_puerto = puerto
        self.baudrate = baudrate
        self._detener_hilos = False

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
            # Abrir puerto serie con timeout de lectura no bloqueante
            self.puerto_serial = serial.Serial(
                port=puerto,
                baudrate=baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=0.1,
                write_timeout=0.5
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
                self.puerto_serial.write(b'?\n$I\n$G\n')
            except Exception:
                pass
            return True

        except Exception as e:
            self.esta_conectado = False
            self.puerto_serial = None
            self._notificar_consola("c-alarm", f"[ERROR] Falló la apertura de {puerto}: {str(e)}")
            return False

    def desconectar(self):
        """Cierra la conexión serial y detiene todos los hilos en segundo plano."""
        self._detener_hilos = True
        self.esta_conectado = False
        self._en_ejecucion_gcode = False

        if self.puerto_serial and self.puerto_serial.is_open:
            try:
                self.puerto_serial.close()
            except Exception:
                pass
        self.puerto_serial = None

        self.estado_maquina["estado"] = "DESCONECTADO"
        self._notificar_consola("c-system", "[DESCONECTADO] Conexión serial finalizada.")
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
        buffer_linea = bytearray()

        while not self._detener_hilos and self.esta_conectado:
            if not self.puerto_serial or not self.puerto_serial.is_open:
                break

            try:
                caracteres = self.puerto_serial.read(64)
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

        self.esta_conectado = False

    def _bucle_sondeo_estado(self):
        """Hilo de sondeo que consulta el estado enviando '?' cada 200 ms (especificación TT)."""
        while not self._detener_hilos and self.esta_conectado:
            try:
                if self.puerto_serial and self.puerto_serial.is_open:
                    # Enviar el carácter de tiempo real '?' directamente
                    self.puerto_serial.write(b'?')
            except Exception:
                pass
            time.sleep(0.2)  # Rigurosamente 200 ms conforme al Capítulo 5 del TT

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
                    self.estado_maquina["override_rapid"] = vals[1]
                    self.estado_maquina["override_spindle"] = vals[2]

            elif clave == "Pn":
                self.estado_maquina["pines_limite"] = valor

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
            try:
                self.puerto_serial.write(b'\x18')
                self._notificar_consola("c-alarm", "[E-STOP] Señal de reinicio inmediato (0x18) enviada a GRBL.")
            except Exception as e:
                self._notificar_consola("c-alarm", f"[ERROR E-STOP] {str(e)}")

    def pausar(self):
        """Envía el comando '!' (Feed Hold) para pausar el movimiento con desaceleración segura."""
        self._en_pausa_gcode = True
        if self.modo_virtual:
            self.estado_maquina["estado"] = "HOLD"
            self._notificar_consola("c-info", "[PAUSA] Movimiento pausado.")
            return

        if self.puerto_serial and self.puerto_serial.is_open:
            try:
                self.puerto_serial.write(b'!')
                self._notificar_consola("c-info", "[PAUSA] Señal Feed Hold (!) enviada.")
            except Exception as e:
                self._notificar_consola("c-alarm", f"[ERROR PAUSA] {str(e)}")

    def reanudar(self):
        """Envía el comando '~' (Cycle Start) para continuar el mecanizado."""
        self._en_pausa_gcode = False
        if self.modo_virtual:
            self.estado_maquina["estado"] = "RUN"
            self._notificar_consola("c-ok", "[REANUDAR] Mecanizado reanudado.")
            return

        if self.puerto_serial and self.puerto_serial.is_open:
            try:
                self.puerto_serial.write(b'~')
                self._notificar_consola("c-ok", "[REANUDAR] Señal Cycle Start (~) enviada.")
            except Exception as e:
                self._notificar_consola("c-alarm", f"[ERROR REANUDAR] {str(e)}")

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

            def fin_jog():
                time.sleep(0.25)
                if self.estado_maquina.get("estado") == "JOG":
                    self.estado_maquina["estado"] = "IDLE"
                    if self.cb_estado_actualizado:
                        self.cb_estado_actualizado(dict(self.estado_maquina))

            threading.Thread(target=fin_jog, daemon=True).start()
            return

        self.enviar_directo(f"{cmd}\n")
        self._notificar_consola("c-ok", f"> {cmd}")

    def establecer_feed_override(self, porcentaje: float):
        """Ajusta el multiplicador dinámico de velocidad de avance (10% a 250%)."""
        pct = max(10.0, min(250.0, float(porcentaje)))
        self.feed_override = pct / 100.0
        self.estado_maquina["override_feed"] = int(pct)
        if self.cb_estado_actualizado:
            self.cb_estado_actualizado(dict(self.estado_maquina))

        if not self.modo_virtual and self.esta_conectado:
            # En GRBL v1.1 real, los códigos de tiempo real modifican el feed override:
            if round(pct) == 100:
                self.enviar_tiempo_real(0x90)

    def controlar_spindle(self, encendido: bool, rpm: int):
        """Enciende (M3 S...) o apaga (M5) el husillo."""
        rpm = max(0, int(rpm))
        if encendido and rpm > 0:
            cmd = f"M3 S{rpm}"
            self.estado_maquina["spindle_encendido"] = True
            self.estado_maquina["spindle_real"] = float(rpm)
        else:
            cmd = "M5"
            self.estado_maquina["spindle_encendido"] = False
            self.estado_maquina["spindle_real"] = 0.0

        if self.modo_virtual:
            self._notificar_consola("c-ok", f"> {cmd}")
            if self.cb_estado_actualizado:
                self.cb_estado_actualizado(dict(self.estado_maquina))
            return

        self.enviar_comando(cmd)

    # =========================================================================
    # ENVÍO DE COMANDOS DIRECTOS Y MDI
    # =========================================================================

    def enviar_comando(self, comando: str):
        """Envía un comando textual a la máquina y lo muestra en consola."""
        comando = comando.strip()
        if not comando:
            return

        self._notificar_consola("c-ok", f"> {comando}")

        if self.modo_virtual:
            self._simular_respuesta_comando(comando)
            return

        self.enviar_directo(f"{comando}\n")

    def enviar_directo(self, texto_con_salto: str):
        """Transmite una cadena formateada con salto de línea por el puerto serial físico."""
        if not self.puerto_serial or not self.puerto_serial.is_open:
            return
        try:
            self.puerto_serial.write(texto_con_salto.encode('utf-8'))
        except Exception as e:
            self._notificar_consola("c-alarm", f"[ERROR DE TRANSMISIÓN] {str(e)}")

    # =========================================================================
    # STREAMING DE ARCHIVOS G-CODE (CHARACTER-COUNTING BUFFER)
    # =========================================================================

    def iniciar_programa(self, contenido_gcode: str):
        """Inicia la transmisión controlada de un programa de código G completo."""
        lineas = [l.strip() for l in contenido_gcode.splitlines() if l.strip()]
        if not lineas:
            return

        with self._bloque_lock:
            self._cola_lineas = lineas
            self._total_lineas_programa = len(lineas)
            self._linea_actual_enviada = 0
            self._cola_bytes_en_transito.clear()
            self._en_ejecucion_gcode = True
            self._en_pausa_gcode = False
            self._tiempo_inicio_ejecucion = time.time()

        self._notificar_consola("c-system", f"[PROGRAMA] Iniciando transmisión de {self._total_lineas_programa} líneas.")

        if self.modo_virtual:
            threading.Thread(target=self._bucle_ejecucion_virtual, daemon=True).start()
            return

        # Llenar el búfer inicial de 128 bytes
        self._alimentar_buffer_gcode()

    def _alimentar_buffer_gcode(self):
        """Envía líneas respetando el límite de 127 bytes del búfer de recepción en hardware."""
        with self._bloque_lock:
            if not self._en_ejecucion_gcode or self._en_pausa_gcode:
                return

            bytes_ocupados = sum(self._cola_bytes_en_transito)

            while self._linea_actual_enviada < len(self._cola_lineas):
                linea = self._cola_lineas[self._linea_actual_enviada]
                tam_linea = len(linea) + 1  # Incluye el carácter '\n'

                if bytes_ocupados + tam_linea <= self.TAMANO_BUFFER_RX:
                    # Enviar línea por serial
                    self.enviar_directo(f"{linea}\n")
                    self._cola_bytes_en_transito.append(tam_linea)
                    bytes_ocupados += tam_linea
                    self._linea_actual_enviada += 1
                else:
                    break

    def _gestionar_confirmacion_buffer(self, exito: bool):
        """Llamado cuando GRBL responde 'ok' o 'error:', liberando espacio en el búfer."""
        with self._bloque_lock:
            if self._cola_bytes_en_transito:
                self._cola_bytes_en_transito.popleft()

            if not self._en_ejecucion_gcode:
                return

            lineas_confirmadas = self._linea_actual_enviada - len(self._cola_bytes_en_transito)
            pct = min(100.0, (lineas_confirmadas / max(1, self._total_lineas_programa)) * 100.0)

            segundos = int(time.time() - self._tiempo_inicio_ejecucion)
            tiempo_str = f"{segundos // 60:02d}:{segundos % 60:02d}"

            if self.cb_progreso:
                self.cb_progreso(lineas_confirmadas, self._total_lineas_programa, round(pct, 1), tiempo_str)

            # Verificar si ha concluido la totalidad del archivo
            if lineas_confirmadas >= self._total_lineas_programa:
                self._en_ejecucion_gcode = False
                self._notificar_consola("c-system", f"[PROGRAMA] Ejecución finalizada en {tiempo_str}.")

        # Enviar más líneas disponibles
        self._alimentar_buffer_gcode()

    # =========================================================================
    # EMULADOR VIRTUAL DIDÁCTICO (FALLBACK ACADÉMICO)
    # =========================================================================

    def _iniciar_hilos_virtuales(self):
        """Inicia el ciclo de telemetría del simulador didáctico."""
        def bucle_sim():
            while not self._detener_hilos and self.esta_conectado and self.modo_virtual:
                if self.cb_estado_actualizado:
                    self.cb_estado_actualizado(dict(self.estado_maquina))
                time.sleep(0.2)

        threading.Thread(target=bucle_sim, daemon=True).start()

    def _simular_respuesta_comando(self, cmd: str):
        """Responde a comandos en el simulador virtual reproduciendo la sintaxis de GRBL."""
        c = cmd.upper()
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
        else:
            self._notificar_consola("c-ok", "ok")

    def _bucle_ejecucion_virtual(self):
        """
        Simula la ejecución paso a paso de un archivo G-code en el emulador virtual,
        con interpolación geométrica continua y actualización de coordenadas en tiempo real
        para que la punta de la herramienta se desplace visiblemente por el lienzo gráfico.
        """
        total = self._total_lineas_programa
        self.estado_maquina["estado"] = "RUN"
        velocidad_avance_actual = 800.0  # mm/min por defecto
        modo_movimiento_actual = "G0"

        for idx in range(1, total + 1):
            if not self._en_ejecucion_gcode or self._detener_hilos:
                break

            while self._en_pausa_gcode and self._en_ejecucion_gcode:
                time.sleep(0.1)

            linea = self._cola_lineas[idx - 1]
            self._notificar_consola("c-ok", f"{idx}: {linea}")

            linea_limpia = re.sub(r"\(.*?\)", "", linea).split(";")[0].strip().upper()

            # Detectar comando modal F (velocidad de avance)
            match_f = re.search(r"F(\d+(?:\.\d+)?)", linea_limpia)
            if match_f:
                velocidad_avance_actual = max(1.0, float(match_f.group(1)))

            # Detectar encendido / apagado de husillo (M3/M03 y M5/M05)
            if re.search(r"\bM0?3\b", linea_limpia):
                self.estado_maquina["spindle_encendido"] = True
                match_s = re.search(r"S(\d+(?:\.\d+)?)", linea_limpia)
                rpm = float(match_s.group(1)) if match_s else 12000.0
                self.estado_maquina["spindle_real"] = rpm
            elif re.search(r"\bM0?5\b", linea_limpia):
                self.estado_maquina["spindle_encendido"] = False
                self.estado_maquina["spindle_real"] = 0.0

            # Modal de movimiento
            if re.search(r"\bG00?\b", linea_limpia):
                modo_movimiento_actual = "G0"
            elif re.search(r"\bG0?1\b", linea_limpia):
                modo_movimiento_actual = "G1"
            elif re.search(r"\bG0?[23]\b", linea_limpia):
                modo_movimiento_actual = "G1"

            # Posición actual de inicio del segmento
            x_ini = float(self.estado_maquina["wpos"][0])
            y_ini = float(self.estado_maquina["wpos"][1])
            z_ini = float(self.estado_maquina["wpos"][2])

            # Coordenadas objetivo extraídas de la línea
            match_x = re.search(r"X([-+]?\d*\.?\d+)", linea_limpia)
            match_y = re.search(r"Y([-+]?\d*\.?\d+)", linea_limpia)
            match_z = re.search(r"Z([-+]?\d*\.?\d+)", linea_limpia)

            x_fin = float(match_x.group(1)) if match_x else x_ini
            y_fin = float(match_y.group(1)) if match_y else y_ini
            z_fin = float(match_z.group(1)) if match_z else z_ini

            # Distancia euclidiana en mm
            dx = x_fin - x_ini
            dy = y_fin - y_ini
            dz = z_fin - z_ini
            distancia = math.sqrt(dx * dx + dy * dy + dz * dz)

            es_rapido = (modo_movimiento_actual == "G0")
            override_mult = getattr(self, "feed_override", 1.0)
            vel_base = 2500.0 if es_rapido else velocidad_avance_actual
            vel = vel_base * override_mult
            self.estado_maquina["feed_real"] = vel

            if distancia > 0.01:
                # Duración física del movimiento (con límites pedagógicos adecuados)
                tiempo_fisico = distancia / (vel / 60.0) if vel > 0 else 0.1
                tiempo_segmento = max(0.035, min(2.0, tiempo_fisico))
                dt = 0.035  # Paso de interpolación (~28 FPS)
                pasos = max(1, int(tiempo_segmento / dt))

                for paso in range(1, pasos + 1):
                    if not self._en_ejecucion_gcode or self._detener_hilos:
                        break
                    while self._en_pausa_gcode and self._en_ejecucion_gcode:
                        time.sleep(0.1)

                    fraccion = paso / pasos
                    self.estado_maquina["wpos"][0] = round(x_ini + dx * fraccion, 3)
                    self.estado_maquina["wpos"][1] = round(y_ini + dy * fraccion, 3)
                    self.estado_maquina["wpos"][2] = round(z_ini + dz * fraccion, 3)
                    self.estado_maquina["mpos"] = list(self.estado_maquina["wpos"])

                    # Re-evaluar override en tiempo real
                    ov_actual = getattr(self, "feed_override", 1.0)
                    self.estado_maquina["feed_real"] = vel_base * ov_actual

                    if self.cb_estado_actualizado:
                        self.cb_estado_actualizado(dict(self.estado_maquina))

                    # dt adaptativo según el override para acelerar o frenar de inmediato
                    time.sleep(max(0.008, dt / max(0.1, ov_actual)))
            else:
                # Comandos sin movimiento físico (M3, M5, G21, G90, etc.)
                if self.cb_estado_actualizado:
                    self.cb_estado_actualizado(dict(self.estado_maquina))
                time.sleep(0.02)

            pct = round((idx / total) * 100.0, 1)
            segundos = int(time.time() - self._tiempo_inicio_ejecucion)
            tiempo_str = f"{segundos // 60:02d}:{segundos % 60:02d}"

            if self.cb_progreso:
                self.cb_progreso(idx, total, pct, tiempo_str)

        self.estado_maquina["estado"] = "IDLE"
        self.estado_maquina["feed_real"] = 0.0
        self._en_ejecucion_gcode = False
        if self.cb_estado_actualizado:
            self.cb_estado_actualizado(dict(self.estado_maquina))
        self._notificar_consola("c-system", "[PROGRAMA] Simulación virtual finalizada exitosamente.")

    # =========================================================================
    # AUXILIARES DE NOTIFICACIÓN
    # =========================================================================

    def _notificar_consola(self, tipo: str, mensaje: str):
        """Envía mensajes a la consola serial respetando el callback registrado."""
        if self.cb_linea_consola:
            self.cb_linea_consola(tipo, mensaje)
