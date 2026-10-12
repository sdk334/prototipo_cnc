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
    20: {
        "titulo": "Comando G no soportado",
        "explicacion": "La instrucción especificada no está implementada en el firmware de la máquina CNC.",
        "sugerencia": "Consulte el diccionario de códigos G integrado en el menú de ayuda."
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
