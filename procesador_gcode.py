# -*- coding: utf-8 -*-
"""
Módulo de Procesamiento y Validación de Códigos G
Proyecto: Trabajo Terminal 2026-B072 (ESCOM - IPN)
Interfaz de Control para Máquinas CNC con Fines Educativos

Responsabilidad:
- Analizar sintaxis de instrucciones G y M conforme al estándar GRBL v1.1.
- Extraer coordenadas cartesianas (X, Y, Z), centros de arco (I, J) y parámetros F/S.
- Estimar analíticamente el tiempo total de mecanizado y distancia recorrida.
- Traducir códigos de error de GRBL a explicaciones pedagógicas didácticas.
"""

import math
import re

# Diccionario didáctico de errores semánticos conforme a la especificación de ESCOM
DICCIONARIO_ERRORES_GRBL = {
    1: {
        "titulo": "Comando G-code no válido",
        "explicacion": "La letra del comando o número especificado no pertenece al conjunto soportado por el estándar GRBL v1.1.",
        "sugerencia": "Verifique que los comandos sean G0, G1, G2, G3, G90, G91, M3, M5, etc."
    },
    2: {
        "titulo": "Formato de valor numérico incorrecto",
        "explicacion": "El valor asignado a una coordenada o parámetro contiene caracteres no reconocidos o falta un número.",
        "sugerencia": "Asegúrese de usar punto decimal en lugar de coma (ej. X12.5 en lugar de X12,5)."
    },
    3: {
        "titulo": "Comando de sistema '$' no reconocido",
        "explicacion": "Se intentó enviar un comando de configuración GRBL no válido o mal estructurado.",
        "sugerencia": "Utilice $$ para ver ajustes, $H para homing o $X para desbloquear."
    },
    4: {
        "titulo": "Valor negativo no admitido",
        "explicacion": "Un parámetro que requiere un valor positivo o nulo recibió un número negativo.",
        "sugerencia": "Verifique velocidades de avance (F) o parámetros de configuración."
    },
    5: {
        "titulo": "Homing no habilitado",
        "explicacion": "Se envió el comando $H pero la máquina no tiene habilitado el ciclo de referencia por límites.",
        "sugerencia": "Revise el parámetro $22=1 en la configuración de la máquina."
    },
    6: {
        "titulo": "Tiempo de pulso de paso insuficiente",
        "explicacion": "El parámetro de duración de pulso de paso ($0) es menor a 3 microsegundos.",
        "sugerencia": "Configure $0 con un valor de al menos 10 us (ej. $0=10)."
    },
    7: {
        "titulo": "Fallo de lectura de EEPROM",
        "explicacion": "No se pudo leer la memoria no volátil del microcontrolador al arrancar.",
        "sugerencia": "Los parámetros se restablecieron por defecto. Vuelva a calibrar los ajustes con $$."
    },
    8: {
        "titulo": "Comando '$' bloqueado durante ejecución",
        "explicacion": "Un comando de configuración '$' solo puede ejecutarse cuando la máquina está en reposo (IDLE).",
        "sugerencia": "Espere a que termine el trabajo o detenga la ejecución antes de cambiar parámetros."
    },
    9: {
        "titulo": "Bloqueo de código G por estado de ALARMA o JOG (G-Code Locked Out)",
        "explicacion": "El microcontrolador GRBL está bloqueado por seguridad en estado ALARMA (o ejecutando un movimiento manual JOG). En este estado, GRBL rechaza intencionalmente cualquier comando de código G (fijación de ceros G10/G92, movimientos G0/G1 o activación de husillo M3).",
        "sugerencia": "1. Presione el botón 'DESBLOQUEAR ($X)' en la barra superior o en el menú 'Máquina > Desbloquear ($X)'.\n2. Si el sistema tiene finales de carrera habilitados ($22=1), ejecute el ciclo de referenciado 'Homing ($H)'.\n3. Una vez que el indicador cambie a verde (IDLE), presione 'ZERO ALL' nuevamente."
    },
    10: {
        "titulo": "Límites suaves no admitidos sin Homing",
        "explicacion": "No es posible habilitar límites suaves ($20=1) si el ciclo de Homing ($22=1) no está activo.",
        "sugerencia": "Active primero el ciclo de homing ($22=1) antes de habilitar límites suaves."
    },
    11: {
        "titulo": "Longitud de línea excedida",
        "explicacion": "La instrucción enviada supera el límite máximo de caracteres por línea del búfer serie.",
        "sugerencia": "Divida la instrucción o reduzca comentarios extensos."
    },
    15: {
        "titulo": "Objetivo de Jog fuera del recorrido",
        "explicacion": "El comando de desplazamiento manual ($J=) solicitado sobrepasa las dimensiones de la máquina.",
        "sugerencia": "Reduzca el incremento de paso o verifique los límites de recorrido de la máquina."
    },
    20: {
        "titulo": "Comando G no soportado",
        "explicacion": "La instrucción especificada no está implementada en el firmware de la máquina CNC.",
        "sugerencia": "Consulte el diccionario de códigos G integrado en el menú de ayuda."
    },
    21: {
        "titulo": "Comandos G del mismo grupo modal repetidos",
        "explicacion": "Se enviaron dos comandos incompatibles en la misma línea (ej. G0 y G1 simultáneos).",
        "sugerencia": "Separe las instrucciones en líneas distintas."
    },
    22: {
        "titulo": "Velocidad de avance F no especificada",
        "explicacion": "Se solicitó un movimiento de corte lineal (G1) sin haber definido previamente la velocidad de avance F.",
        "sugerencia": "Agregue el parámetro de avance en la línea, por ejemplo: G1 X10.0 Y10.0 F800."
    },
    33: {
        "titulo": "Objetivo de arco G2/G3 inválido",
        "explicacion": "El punto final del arco o los vectores de centro I/J no concuerdan matemáticamente.",
        "sugerencia": "Compruebe las coordenadas de inicio, fin y desplazamiento relativo del radio."
    }
}

DICCIONARIO_ALARMAS_GRBL = {
    1: {
        "titulo": "Alarma 1: Fin de carrera alcanzado (Hard Limit)",
        "explicacion": "Uno de los interruptores límite mecánicos fue activado por contacto o ruido eléctrico.",
        "sugerencia": "Verifique los interruptores y libere el carro mecánico. Desbloquee con $X."
    },
    2: {
        "titulo": "Alarma 2: Límite suave de recorrido sobrepasado (Soft Limit)",
        "explicacion": "El movimiento ordenado supera el volumen de desplazamiento configurado para la máquina.",
        "sugerencia": "Revise las coordenadas de la pieza de trabajo o el origen WCS. Desbloquee con $X."
    },
    3: {
        "titulo": "Alarma 3: Paro de Emergencia / Reinicio en Movimiento",
        "explicacion": "Se recibió un reinicio de emergencia (0x18 / E-STOP) mientras la máquina estaba operando.",
        "sugerencia": "Compruebe la posición física del husillo y presione 'DESBLOQUEAR ($X)' para rearmar."
    },
    4: {
        "titulo": "Alarma 4: Fallo de sonda (Probe Fail)",
        "explicacion": "La sonda de contacto Z no hizo contacto antes de finalizar el recorrido límite de palpado.",
        "sugerencia": "Verifique la conexión de la sonda y vuelva a intentar la palpación."
    },
    5: {
        "titulo": "Alarma 5: Sonda en contacto previo",
        "explicacion": "La sonda Z ya estaba en contacto eléctrico antes de iniciar el ciclo de palpación.",
        "sugerencia": "Separe la herramienta de la placa de contacto antes de iniciar."
    },
    6: {
        "titulo": "Alarma 6: Fallo en ciclo de Homing",
        "explicacion": "El sensor límite no se activó dentro del recorrido configurado durante el referenciado.",
        "sugerencia": "Compruebe el sentido de giro de los motores y el cableado de los sensores."
    },
    7: {
        "titulo": "Alarma 7: Fallo de liberación de interruptor en Homing",
        "explicacion": "El sensor límite no se liberó tras el retroceso de seguridad (pulloff $27).",
        "sugerencia": "Aumente la distancia de retroceso de homing ($27) o revise el interruptor mecánico."
    }
}


class BloqueGCode:
    """Representa una instrucción o bloque de código G procesado."""
    def __init__(self, numero_linea: int, texto_original: str):
        self.numero_linea = numero_linea
        self.texto_original = texto_original.strip()
        self.texto_limpio = ""
        self.comando_principal = None
        self.parametros = {}
        self.es_comentario = False
        self.es_valido = True
        self.mensaje_error = None


class ProcesadorGCode:
    """Motor de análisis, validación sintáctica y cálculo de tiempos para programas G-Code."""

    # Expresión regular para separar letra y valor numérico (ej. X12.5, G0, F800)
    PATRON_TOKEN = re.compile(r'([A-Za-z])\s*([-+]?\d*\.?\d+)')

    def __init__(self, velocidad_rapido_default: float = 2500.0):
        # Velocidad de avance rápido G0 en mm/min para estimación
        self.velocidad_rapido_default = velocidad_rapido_default

    def limpiar_linea(self, linea: str) -> str:
        """Elimina comentarios entre paréntesis (...) o tras punto y coma ;."""
        linea = re.sub(r'\(.*?\)', '', linea)
        linea = linea.split(';')[0]
        return linea.strip().upper()

    def parsear_linea(self, numero_linea: int, linea_cruda: str) -> BloqueGCode:
        """Analiza sintácticamente una línea individual de G-code."""
        bloque = BloqueGCode(numero_linea, linea_cruda)
        limpia = self.limpiar_linea(linea_cruda)
        bloque.texto_limpio = limpia

        if not limpia:
            bloque.es_comentario = True
            return bloque

        # Extraer tokens mediante regex
        coincidencias = self.PATRON_TOKEN.findall(limpia)
        if not coincidencias and not limpia.startswith('$'):
            bloque.es_valido = False
            bloque.mensaje_error = "Instrucción con formato irreconocible o no alfanumérico."
            return bloque

        for letra, valor_str in coincidencias:
            letra = letra.upper()
            try:
                valor = float(valor_str)
            except ValueError:
                bloque.es_valido = False
                bloque.mensaje_error = f"Valor numérico no válido para el parámetro {letra}."
                return bloque

            # Guardar comando modal o de acción principal
            if letra in ('G', 'M') and bloque.comando_principal is None:
                bloque.comando_principal = f"{letra}{int(valor)}"

            bloque.parametros[letra] = valor

        return bloque

    def analizar_programa(self, contenido_gcode: str) -> dict:
        """
        Analiza un archivo completo de G-code, calculando estadísticas,
        dimensiones máximas/mínimas y tiempo estimado de ejecución.
        """
        lineas = contenido_gcode.splitlines()
        bloques = []
        errores = []
        segmentos = []

        # Estado modal de simulación analítica
        pos_actual = {"X": 0.0, "Y": 0.0, "Z": 0.0}
        modo_absoluto = True
        velocidad_corte_actual = 800.0
        tiempo_total_segundos = 0.0
        distancia_total_corte = 0.0
        distancia_total_rapido = 0.0

        min_coords = {"X": float("inf"), "Y": float("inf"), "Z": float("inf")}
        max_coords = {"X": float("-inf"), "Y": float("-inf"), "Z": float("-inf")}

        for idx, linea in enumerate(lineas, start=1):
            bloque = self.parsear_linea(idx, linea)
            bloques.append(bloque)

            if not bloque.es_valido:
                errores.append({
                    "linea": idx,
                    "texto": bloque.texto_original,
                    "error": bloque.mensaje_error
                })
                continue

            if bloque.es_comentario or not bloque.parametros:
                continue

            # Actualizar modo modal absoluto o incremental
            if "G" in bloque.parametros:
                g_num = int(bloque.parametros["G"])
                if g_num == 90:
                    modo_absoluto = True
                elif g_num == 91:
                    modo_absoluto = False

            # Actualizar velocidad de avance F
            if "F" in bloque.parametros:
                velocidad_corte_actual = max(1.0, bloque.parametros["F"])

            # Calcular nueva posición objetivo
            pos_nueva = dict(pos_actual)
            hay_movimiento = False

            for eje in ("X", "Y", "Z"):
                if eje in bloque.parametros:
                    hay_movimiento = True
                    val = bloque.parametros[eje]
                    if modo_absoluto:
                        pos_nueva[eje] = val
                    else:
                        pos_nueva[eje] += val

                    # Actualizar envolvente volumétrica (Bounding Box)
                    min_coords[eje] = min(min_coords[eje], pos_nueva[eje])
                    max_coords[eje] = max(max_coords[eje], pos_nueva[eje])

            if hay_movimiento:
                dx = pos_nueva["X"] - pos_actual["X"]
                dy = pos_nueva["Y"] - pos_actual["Y"]
                dz = pos_nueva["Z"] - pos_actual["Z"]
                distancia = math.sqrt(dx * dx + dy * dy + dz * dz)

                es_rapido = bloque.comando_principal == "G0"
                if es_rapido:
                    distancia_total_rapido += distancia
                    vel = self.velocidad_rapido_default
                else:
                    distancia_total_corte += distancia
                    vel = velocidad_corte_actual

                # Tiempo en segundos: (distancia mm / velocidad mm/min) * 60
                if vel > 0:
                    tiempo_total_segundos += (distancia / vel) * 60.0

                segmentos.append({
                    "tipo": "G0" if es_rapido else "G1",
                    "x1": round(pos_actual["X"], 3),
                    "y1": round(pos_actual["Y"], 3),
                    "z1": round(pos_actual["Z"], 3),
                    "x2": round(pos_nueva["X"], 3),
                    "y2": round(pos_nueva["Y"], 3),
                    "z2": round(pos_nueva["Z"], 3)
                })

                pos_actual = pos_nueva

        # Normalizar límites si no hubo movimiento
        for eje in ("X", "Y", "Z"):
            if min_coords[eje] == float("inf"):
                min_coords[eje] = 0.0
                max_coords[eje] = 0.0

        minutos = int(tiempo_total_segundos // 60)
        segundos = int(tiempo_total_segundos % 60)
        tiempo_formateado = f"{minutos:02d}:{segundos:02d}"

        return {
            "total_lineas": len(lineas),
            "lineas_procesadas": len(bloques),
            "es_valido": len(errores) == 0,
            "errores": errores,
            "tiempo_estimado_segundos": round(tiempo_total_segundos, 1),
            "tiempo_estimado_formato": tiempo_formateado,
            "distancia_corte_mm": round(distancia_total_corte, 2),
            "distancia_rapido_mm": round(distancia_total_rapido, 2),
            "distancia_total_mm": round(distancia_total_corte + distancia_total_rapido, 2),
            "segmentos": segmentos if len(segmentos) <= 500 else [],
            "envolvente": {
                "min": min_coords,
                "max": max_coords,
                "ancho_x": round(max(0.0, max_coords["X"] - min_coords["X"]), 2),
                "alto_y": round(max(0.0, max_coords["Y"] - min_coords["Y"]), 2),
                "profundidad_z": round(max(0.0, max_coords["Z"] - min_coords["Z"]), 2)
            }
        }

    @staticmethod
    def traducir_error_grbl(codigo_error: int) -> dict:
        """Traduce un código de error de GRBL (error:X) al formato pedagógico de ESCOM."""
        return DICCIONARIO_ERRORES_GRBL.get(codigo_error, {
            "titulo": f"Error GRBL #{codigo_error}",
            "explicacion": "El microcontrolador reportó una condición de error no habitual durante la ejecución.",
            "sugerencia": "Verifique los límites mecánicos, conexiones del cable USB o reinicie el software (Ctrl+X)."
        })

    @staticmethod
    def traducir_alarma_grbl(codigo_alarma: int) -> dict:
        """Traduce un código de alarma de GRBL (ALARM:X) al formato pedagógico de ESCOM."""
        return DICCIONARIO_ALARMAS_GRBL.get(codigo_alarma, {
            "titulo": f"Alarma de Seguridad GRBL #{codigo_alarma}",
            "explicacion": "El microcontrolador activó una condición de seguridad de parada.",
            "sugerencia": "Presione 'DESBLOQUEAR ($X)' en la barra superior o ejecute el ciclo de referenciado 'Homing ($H)'."
        })
