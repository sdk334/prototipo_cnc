"""Interpretación modal compartida por análisis, simulación y validación previa.

Los programas con cambios de coordenadas o planos no implementados se rechazan
explícitamente: nunca se aproxima silenciosamente una trayectoria para ejecutarla.
"""
import math
import re

TOKEN = re.compile(r'([A-Z])\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))', re.I)


def limpiar(linea):
    return re.sub(r'\([^()]*\)', '', linea).split(';', 1)[0].strip().upper()


def palabras(linea):
    texto = limpiar(linea)
    if not texto or texto == '%':
        return []
    matches = list(TOKEN.finditer(texto))
    if TOKEN.sub('', texto).strip():
        raise ValueError('Texto o valor numérico inválido en el bloque.')
    resultado = [(m[1].upper(), float(m[2])) for m in matches]
    if any(not math.isfinite(v) for _, v in resultado):
        raise ValueError('Valor numérico fuera de rango.')
    for letra in 'XYZIJKRFSNT':
        if sum(k == letra for k, _ in resultado) > 1:
            raise ValueError(f'Parámetro {letra} repetido.')
    if any(k in 'GMTN' and (v < 0 or (k != 'G' and v != int(v))) for k, v in resultado):
        raise ValueError('Código o número de herramienta inválido.')
    return resultado


def quitar_motor(linea):
    """Retira únicamente palabras M3/M4; conserva movimientos y parámetros."""
    return TOKEN.sub(lambda m: '' if m[1].upper() == 'M' and float(m[2]) in (3, 4)
                     else m[0], limpiar(linea)).strip()


class Interprete:
    def __init__(self, posicion=None):
        self.pos = list(posicion or (0., 0., 0.))
        self.absoluto = True
        self.unidad = 1.
        self.movimiento = 0
        self.feed = 800.

    def bloque(self, linea):
        tokens = palabras(linea)
        p = dict(tokens)
        gs = [v for k, v in tokens if k == 'G']
        ms = [v for k, v in tokens if k == 'M']
        permitidos = {0, 1, 2, 3, 4, 17, 20, 21, 40, 49, 54, 80, 90, 91, 91.1, 94}
        if any(g not in permitidos for g in gs):
            raise ValueError('Código G no soportado por el analizador seguro (plano XY/G54).')
        if any(m not in {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 30} for m in ms):
            raise ValueError('Código M no soportado.')
        if any(k not in 'GMXYZIJRFSPNT' for k, _ in tokens):
            raise ValueError('Parámetro no soportado.')
        for grupo in ({0, 1, 2, 3, 80}, {20, 21}, {90, 91}, {0, 1, 2, 3, 4}):
            valores = [g for g in gs if g in grupo]
            if len(valores) > 1:
                raise ValueError('Comandos G incompatibles en el mismo bloque.')
        if len([m for m in ms if m in (3, 4, 5)]) > 1:
            raise ValueError('Comandos de husillo incompatibles.')
        if 20 in gs: self.unidad = 25.4
        if 21 in gs: self.unidad = 1.
        if 90 in gs: self.absoluto = True
        if 91 in gs: self.absoluto = False
        for g in gs:
            if g in (0, 1, 2, 3, 80): self.movimiento = int(g)
        if 'F' in p:
            if p['F'] <= 0: raise ValueError('El avance F debe ser positivo.')
            self.feed = p['F'] * self.unidad
        if 'S' in p and p['S'] < 0: raise ValueError('S debe ser no negativo.')
        if any(k in p for k in 'IJR') and self.movimiento not in (2, 3):
            raise ValueError('I/J/R requieren un movimiento de arco.')
        if 'P' in p and 4 not in gs:
            raise ValueError('P solo está implementado para G4.')
        inicio = list(self.pos)
        fin = list(inicio)
        segmentos = []
        distancia = 0.
        if 4 in gs:
            if 'P' not in p or p['P'] < 0 or any(k in p for k in 'XYZ'):
                raise ValueError('G4 requiere P no negativo y no admite coordenadas.')
        elif self.movimiento == 80 and any(k in p for k in 'XYZIJR'):
            raise ValueError('No hay modo de movimiento activo (G80).')
        elif any(k in p for k in 'XYZ') or (self.movimiento in (2, 3) and any(k in p for k in 'IJR')):
            for i, eje in enumerate('XYZ'):
                if eje in p:
                    fin[i] = p[eje] * self.unidad + (0 if self.absoluto else inicio[i])
            if self.movimiento in (2, 3):
                if 'R' in p and any(k in p for k in 'IJ'):
                    raise ValueError('Arco con R e I/J simultáneos.')
                if 'R' in p:
                    r = p['R'] * self.unidad
                    dx, dy = fin[0]-inicio[0], fin[1]-inicio[1]
                    d = math.hypot(dx, dy)
                    if d < 1e-9 or d > 2*abs(r)+1e-7:
                        raise ValueError('Radio de arco inválido.')
                    h = math.sqrt(max(0., r*r-d*d/4))
                    signo = (1 if self.movimiento == 3 else -1) * (1 if r >= 0 else -1)
                    cx = (inicio[0]+fin[0])/2 - signo*dy*h/d
                    cy = (inicio[1]+fin[1])/2 + signo*dx*h/d
                elif any(k in p for k in 'IJ'):
                    cx = inicio[0]+p.get('I', 0)*self.unidad
                    cy = inicio[1]+p.get('J', 0)*self.unidad
                else:
                    raise ValueError('Arco sin centro ni radio.')
                radio = math.hypot(inicio[0]-cx, inicio[1]-cy)
                rfin = math.hypot(fin[0]-cx, fin[1]-cy)
                if radio < 1e-9 or abs(radio-rfin) > max(.005, .001*radio):
                    raise ValueError('El punto final no pertenece al arco.')
                a = math.atan2(inicio[1]-cy, inicio[0]-cx)
                b = math.atan2(fin[1]-cy, fin[0]-cx)
                delta = ((b-a) % (2*math.pi)) if self.movimiento == 3 else -((a-b) % (2*math.pi))
                if abs(delta) < 1e-10: delta = 2*math.pi*(1 if self.movimiento == 3 else -1)
                distancia = math.hypot(abs(delta)*radio, fin[2]-inicio[2])
                # Incluir los extremos cardinales exactos en la envolvente.
                fracciones = {0., 1.}
                pasos = max(8, min(4096, math.ceil(abs(delta)*radio/.25)))
                fracciones.update(i/pasos for i in range(1, pasos))
                for cardinal in (0, math.pi/2, math.pi, 3*math.pi/2):
                    recorrido = ((cardinal-a) % (2*math.pi)) if delta > 0 else -((a-cardinal) % (2*math.pi))
                    t = recorrido/delta
                    if 0 < t < 1: fracciones.add(t)
                anterior = inicio
                for t in sorted(fracciones)[1:]:
                    punto = [cx+radio*math.cos(a+delta*t), cy+radio*math.sin(a+delta*t), inicio[2]+(fin[2]-inicio[2])*t]
                    if t == 1: punto = fin
                    segmentos.append((anterior, punto, 'G1'))
                    anterior = punto
            else:
                distancia = math.dist(inicio, fin)
                if distancia: segmentos.append((inicio, fin, f'G{self.movimiento}'))
            self.pos = fin
        return {'tokens': tokens, 'm': ms, 'p': p, 'segmentos': segmentos,
                'distancia': distancia, 'rapido': self.movimiento == 0,
                'feed': self.feed, 'espera': p.get('P', 0) if 4 in gs else 0}
