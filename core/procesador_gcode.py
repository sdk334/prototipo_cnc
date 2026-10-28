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
from .interprete_gcode import Interprete, palabras, TOKEN

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
        try:
            palabras(limpia)
        except ValueError as e:
            if not limpia.startswith('$'):
                bloque.es_valido = False
                bloque.mensaje_error = str(e)
                return bloque
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
        interprete = Interprete()
        errores, segmentos = [], []
        limites = [[0., 0., 0.], [0., 0., 0.]]
        rapido = corte = tiempo = 0.
        lineas = contenido_gcode.splitlines()
        terminado = False
        for idx, linea in enumerate(lineas):
            try:
                if terminado and self.limpiar_linea(linea) not in ('', '%'):
                    raise ValueError("Hay instrucciones después del fin de programa.")
                bloque = interprete.bloque(linea)
                for inicio, fin, tipo in bloque['segmentos']:
                    segmentos.append(dict(tipo=tipo, x1=inicio[0], y1=inicio[1], z1=inicio[2],
                                          x2=fin[0], y2=fin[1], z2=fin[2], linea=idx))
                    for i in range(3):
                        limites[0][i] = min(limites[0][i], inicio[i], fin[i])
                        limites[1][i] = max(limites[1][i], inicio[i], fin[i])
                if bloque['rapido']:
                    rapido += bloque['distancia']
                else:
                    corte += bloque['distancia']
                vel = self.velocidad_rapido_default if bloque['rapido'] else bloque['feed']
                tiempo += bloque['distancia'] / vel * 60 + bloque['espera']
                terminado = any(m in (2, 30) for m in bloque['m'])
            except ValueError as e:
                errores.append(dict(linea=idx+1, texto=linea, error=str(e)))
                break
        return dict(total_lineas=len(lineas), lineas_procesadas=len(lineas),
                    es_valido=not errores, errores=errores,
                    tiempo_estimado_segundos=round(tiempo, 1),
                    tiempo_estimado_formato=f"{int(tiempo)//60:02d}:{int(tiempo)%60:02d}",
                    distancia_corte_mm=round(corte, 2), distancia_rapido_mm=round(rapido, 2),
                    distancia_total_mm=round(corte+rapido, 2), segmentos=segmentos,
                    envolvente=dict(min=dict(zip('XYZ', limites[0])), max=dict(zip('XYZ', limites[1])),
                                    ancho_x=limites[1][0]-limites[0][0],
                                    alto_y=limites[1][1]-limites[0][1],
                                    profundidad_z=limites[1][2]-limites[0][2]))

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

    @staticmethod
    def reflejar_eje_x(contenido_gcode: str) -> str:
        """
        Invierte geométricamente las coordenadas del eje X (efecto espejo / mirror X).
        Esencial en fresado de circuitos impresos (PCB Bottom Layer) donde las pistas
        requieren inversión especular horizontal para coincidir con la orientación de los componentes.
        Invierte X alrededor de la envolvente (X_nuevo = X_max + X_min - X), invierte arcos G2 <-> G3
        e invierte el parámetro I (I = -I).
        """
        lineas = contenido_gcode.splitlines()

        # 1. Determinar X_min y X_max del programa
        xs = []
        for l in lineas:
            l_limpia = re.sub(r'\(.*?\)', '', l).split(';')[0].upper()
            m = re.search(r'\bX([-+]?\d*\.?\d+)\b', l_limpia)
            if m:
                xs.append(float(m.group(1)))

        if not xs:
            return contenido_gcode

        x_min = min(xs)
        x_max = max(xs)
        ancho = x_max + x_min

        lineas_reflejadas = []
        for l in lineas:
            partes = l.split(';', 1)
            code = partes[0]
            comentario_semi = (';' + partes[1]) if len(partes) > 1 else ''

            # Aislar comentarios entre paréntesis para no alterarlos
            comentarios_paren = []
            def guardar_paren(m):
                comentarios_paren.append(m.group(0))
                return f'__PAREN_{len(comentarios_paren)-1}__'

            code_sin_paren = re.sub(r'\(.*?\)', guardar_paren, code)

            # Invertir sentido de arcos circulares (G2 <-> G3)
            def swap_g2_g3(m):
                g_num = m.group(1).lstrip('0')
                return 'G3' if g_num == '2' else 'G2'

            code_mod = re.sub(r'\bG0?([23])\b', swap_g2_g3, code_sin_paren, flags=re.IGNORECASE)

            # Reflejar coordenada X
            def replace_x(m):
                x_val = float(m.group(1))
                x_nuevo = round(ancho - x_val, 4)
                texto_x = f"{x_nuevo:.4f}".rstrip('0').rstrip('.')
                return f'X{texto_x}'

            code_mod = re.sub(r'\bX([-+]?\d*\.?\d+)\b', replace_x, code_mod, flags=re.IGNORECASE)

            # Invertir vector de centro de arco I
            def replace_i(m):
                i_val = float(m.group(1))
                i_nuevo = round(-i_val, 4)
                texto_i = f"{i_nuevo:.4f}".rstrip('0').rstrip('.')
                return f'I{texto_i}'

            code_mod = re.sub(r'\bI([-+]?\d*\.?\d+)\b', replace_i, code_mod, flags=re.IGNORECASE)

            # Restaurar comentarios entre paréntesis
            for idx_p, c_p in enumerate(comentarios_paren):
                code_mod = code_mod.replace(f'__PAREN_{idx_p}__', c_p)

            lineas_reflejadas.append(code_mod + comentario_semi)

        return '\n'.join(lineas_reflejadas)

    def ajustar_velocidad_avance(self, contenido_gcode: str, nuevo_feed_corte: float, nuevo_feed_z: float = None) -> str:
        """
        Sobrescribe o escala los parámetros de velocidad de avance F en el programa G-code.
        Ideal para archivos generados por FlatCAM o CAM que vienen con velocidades de avance
        demasiado lentas (ej. F120 mm/min = 2 mm/s).
        """
        lineas = contenido_gcode.splitlines()
        lineas_modificadas = []
        feed_corte = max(10.0, float(nuevo_feed_corte))
        feed_z = max(10.0, float(nuevo_feed_z)) if nuevo_feed_z is not None and nuevo_feed_z > 0 else None

        feeds_en_archivo = []
        for l in lineas:
            m = re.search(r'\bF([-+]?\d*\.?\d+)\b', l.split(';')[0])
            if m:
                feeds_en_archivo.append(float(m.group(1)))

        feed_min_archivo = min(feeds_en_archivo) if feeds_en_archivo else None
        feed_max_archivo = max(feeds_en_archivo) if feeds_en_archivo else None
        umbral_z = (feed_min_archivo + feed_max_archivo) / 2.0 if (feed_min_archivo and feed_max_archivo and feed_max_archivo > feed_min_archivo * 1.5) else 60.0

        for idx_l, l in enumerate(lineas):
            partes = l.split(';', 1)
            code = partes[0]
            comentario_semi = (';' + partes[1]) if len(partes) > 1 else ''

            comentarios_paren = []
            def guardar_paren(m):
                comentarios_paren.append(m.group(0))
                return f'__PAREN_{len(comentarios_paren)-1}__'

            code_sin_paren = re.sub(r'\(.*?\)', guardar_paren, code)

            # Detectar si la línea actual o la siguiente inmediata contiene penetración en Z
            linea_sig = lineas[idx_l + 1].split(';')[0] if idx_l + 1 < len(lineas) else ''
            es_z = bool(re.search(r'\bZ[-+]?\d', code_sin_paren, re.I) or re.search(r'^\s*G0?1\s+Z[-+]?\d', linea_sig, re.I))

            def replace_f(m):
                f_orig = float(m.group(1))
                if feed_z is not None and (es_z or f_orig <= umbral_z):
                    f_val = feed_z
                else:
                    f_val = feed_corte
                return f'F{f_val:.1f}'

            code_mod = re.sub(r'\bF([-+]?\d*\.?\d+)\b', replace_f, code_sin_paren, flags=re.IGNORECASE)

            for idx_p, c_p in enumerate(comentarios_paren):
                code_mod = code_mod.replace(f'__PAREN_{idx_p}__', c_p)

            lineas_modificadas.append(code_mod + comentario_semi)

        return '\n'.join(lineas_modificadas)
