import math
import queue
import tempfile
import threading
import time
import unittest
from pathlib import Path

from PyQt6.QtCore import QCoreApplication
from core import ControladorGRBL, ProcesadorGCode, PuenteCNC
from core.interprete_gcode import Interprete, palabras


class PuertoFalso:
    is_open = True

    def __init__(self):
        self.enviados = []

    def write(self, datos):
        self.enviados.append(datos)
        return len(datos)

    def close(self):
        self.is_open = False


class PuertoGRBL(PuertoFalso):
    """Firmware de prueba: las respuestas recorren el hilo serial real."""
    def __init__(self):
        super().__init__()
        self.rx = queue.Queue()
        self.estado = 'Idle'
        self.rpm = 0.
        self.override = 100
        self.override_spindle = 100
        self.modelo = Interprete()

    def write(self, datos):
        super().write(datos)
        if datos == b'?':
            posicion = ','.join(str(v) for v in self.modelo.pos)
            self.rx.put(f'<{self.estado}|MPos:{posicion}|FS:0,{self.rpm}|Ov:{self.override},100,{self.override_spindle}>\n'.encode())
        elif datos and all(b in (0x90, 0x91, 0x92, 0x93, 0x94) for b in datos):
            # Un flag repetido dentro del mismo paquete solo se procesa una vez.
            flags = set(datos)
            if 0x90 in flags: self.override = 100
            self.override = max(10, min(200, self.override +
                (10 if 0x91 in flags else 0) - (10 if 0x92 in flags else 0) +
                (1 if 0x93 in flags else 0) - (1 if 0x94 in flags else 0)))
        elif datos and all(b in (0x99, 0x9A, 0x9B, 0x9C, 0x9D) for b in datos):
            flags = set(datos)
            if 0x99 in flags: self.override_spindle = 100
            self.override_spindle = max(10, min(200, self.override_spindle +
                (10 if 0x9A in flags else 0) - (10 if 0x9B in flags else 0) +
                (1 if 0x9C in flags else 0) - (1 if 0x9D in flags else 0)))
        elif datos == b'\x18':
            self.estado = 'Alarm'
            self.rpm = 0.
        elif datos.endswith(b'\n'):
            texto = datos.decode().strip()
            p = dict(palabras(texto))
            self.modelo.bloque(texto)
            if p.get('M') in (3, 4): self.rpm = p.get('S', self.rpm)
            if p.get('M') == 5: self.rpm = 0.
            self.estado = 'Idle' if texto == 'G4 P0' else 'Run'
            self.rx.put(b'ok\n')
        return len(datos)

    def read(self, cantidad):
        try:
            return self.rx.get(timeout=.02)
        except queue.Empty:
            return b''


class ControladorTests(unittest.TestCase):
    def setUp(self):
        self.c = ControladorGRBL()
        self.c.esta_conectado = True
        self.c.estado_maquina['estado'] = 'IDLE'
        self.p = self.c.puerto_serial = PuertoFalso()
        self.progreso = []
        self.alertas = []
        self.c.cb_progreso = lambda *a: self.progreso.append(a)
        self.c.cb_alerta_seguridad = lambda *a: self.alertas.append(a)

    def iniciar(self, codigo):
        aceptado = self.c.iniciar_programa(codigo)
        if aceptado and not self.c.modo_virtual:
            self.assertEqual(self.p.enviados.pop(), b'G21G90G17G54G94G91.1G0\n')
            self.ok()
        return aceptado

    def ok(self):
        self.c._procesar_linea_grbl('ok')

    def test_fin_espera_barrera_e_idle_sin_reset(self):
        self.assertTrue(self.iniciar('G0 X10'))
        self.ok()
        self.assertEqual(self.p.enviados[-1], b'G4 P0\n')
        self.assertTrue(self.c._en_ejecucion_gcode)
        self.assertLess(self.progreso[-1][2], 100)
        self.ok()
        self.c._procesar_linea_grbl('<Run|MPos:5,0,0>')
        self.assertTrue(self.c._en_ejecucion_gcode)
        self.c._procesar_linea_grbl('<Idle|MPos:10,0,0>')
        self.assertFalse(self.c._en_ejecucion_gcode)
        self.assertEqual(self.progreso[-1][2], 100)
        self.assertNotIn(b'\x18', self.p.enviados)

    def test_m6_solo_avisa_despues_de_apagar(self):
        self.c.estado_maquina.update(spindle_encendido=True, spindle_real=12000.)
        self.assertTrue(self.iniciar('T2M6\nM3 S12000\nG1 X1 F100'))
        self.assertEqual(self.p.enviados, [b'G4 P0\n'])
        self.assertEqual(self.alertas, [])
        self.c.reanudar()
        self.assertTrue(self.c._en_pausa_gcode)
        self.ok()
        self.assertEqual(self.p.enviados[-1], b'M5\n')
        self.assertEqual(self.alertas, [])
        self.ok()
        self.assertFalse(self.c.estado_maquina['spindle_encendido'])
        self.assertTrue(self.c._cambio_listo)
        self.assertEqual(len(self.alertas), 1)
        self.c.reanudar()
        self.assertEqual(self.p.enviados[-1], b'M3 S12000\n')

    def test_m6_error_no_anuncia_cambio_seguro(self):
        self.iniciar('M6\nG0 X1')
        self.ok()
        self.c._procesar_linea_grbl('error:20')
        self.assertFalse(self.c._en_ejecucion_gcode)
        self.assertFalse(self.alertas)

    def test_lapiz_mdi_orden_y_compacto(self):
        self.c.modo_lapiz = True
        for comando in ('S1000 M3', 'M3S1000', 'N1M04S1000G1X10F100'):
            self.assertTrue(self.c.enviar_comando(comando))
            enviados = palabras(self.p.enviados[-1].decode())
            self.assertFalse(any(k == 'M' and v in (3, 4) for k, v in enviados))
            self.ok()
        self.assertIn(b'N1S1000G1X10F100\n', self.p.enviados)

    def test_lapiz_stream_preserva_movimiento(self):
        self.c.modo_lapiz = True
        self.assertTrue(self.iniciar('M3S1000G1X10F100'))
        self.assertEqual(self.p.enviados[0], b'S1000G1X10F100\n')

    def test_corte_bloqueado_y_recuperacion(self):
        self.iniciar('G1X1F100')
        self.assertTrue(self.c._en_pausa_gcode)
        self.assertNotIn(b'G1X1F100\n', self.p.enviados)
        self.c.reanudar()
        self.assertTrue(self.c._en_pausa_gcode)
        self.assertTrue(self.c.enviar_comando('S12000M3'))
        self.ok()
        self.c.reanudar()
        self.assertEqual(self.p.enviados[-1], b'G1X1F100\n')

    def test_arranque_y_corte_mismo_bloque(self):
        self.assertTrue(self.iniciar('M3S12000G1X1F100'))
        self.assertEqual(self.p.enviados[-1], b'M3S12000G1X1F100\n')

    def test_m5_manual_no_se_evade(self):
        self.iniciar('G0X1')
        self.assertFalse(self.c.enviar_comando('S0M5'))
        self.assertNotIn(b'S0M5\n', self.p.enviados)

    def test_error_no_envia_siguiente_y_no_completa(self):
        self.iniciar('G0X1\nG0X2')
        self.c._procesar_linea_grbl('error:20')
        self.assertFalse(self.c._en_ejecucion_gcode)
        self.assertNotIn(b'G0X2\n', self.p.enviados)
        self.assertFalse(any(p[2] == 100 for p in self.progreso))

    def test_ok_por_linea_solo_despues_de_confirmacion_fisica(self):
        confirmadas = []
        self.c.cb_linea_confirmada = lambda *args: confirmadas.append(args)
        self.assertTrue(self.iniciar('; comentario\nG0X1\nG0X2'))
        self.assertEqual(confirmadas, [])  # El preámbulo y enviar una línea no son un ok.
        self.ok()
        self.assertEqual(confirmadas, [(1, False)])
        self.c._procesar_linea_grbl('error:20')
        self.assertEqual(confirmadas, [(1, False)])

    def test_confirmaciones_virtuales_no_marcan_comentarios_ni_m6(self):
        confirmadas = []
        self.c.cb_linea_confirmada = lambda *args: confirmadas.append(args)
        self.c.modo_virtual = self.c.modo_lapiz = True
        self.c.pausa_m6 = False
        self.assertTrue(self.c.iniciar_programa('; comentario\nT1\nM6\nG0X1'))
        self.c._hilo_virtual.join(1)
        self.assertEqual(confirmadas, [(3, True)])

    def test_manual_pendiente_impide_programa(self):
        self.assertTrue(self.c.enviar_comando('$$'))
        self.assertFalse(self.iniciar('G0X1'))
        self.ok()
        self.assertTrue(self.iniciar('G0X1'))
        self.assertFalse(self.c.enviar_comando('$$'))
        self.c.mover_jog('X', 1, 100)
        self.assertFalse(any(b'$J=' in d for d in self.p.enviados))

    def test_configuracion_manual_se_encola_sin_perder_comandos(self):
        for cmd in ('$100=250', '$101=250', '$102=400'):
            self.assertTrue(self.c.enviar_comando(cmd))
        self.assertEqual(self.p.enviados, [b'$100=250\n'])
        self.assertFalse(self.c.iniciar_programa('G0X1'))
        self.ok()
        self.assertEqual(self.p.enviados[-1], b'$101=250\n')
        self.ok()
        self.assertEqual(self.p.enviados[-1], b'$102=400\n')
        self.ok()
        self.assertFalse(self.c._cola_manual)
        self.assertFalse(self.c._pendientes_respuesta)

    def test_comentarios_largos_unicode_no_bloquean(self):
        self.assertTrue(self.iniciar(';'+'á'*300+'\nG0X1'))
        self.assertEqual(self.p.enviados[-1], b'G0X1\n')

    def test_bloque_largo_rechazado_antes_de_enviar(self):
        self.assertFalse(self.iniciar('G0X'+'1'*90))
        self.assertEqual(self.p.enviados, [])
        self.assertFalse(self.c._en_ejecucion_gcode)

    def test_wco_y_pines(self):
        self.c._procesar_linea_grbl('<Idle|MPos:10,20,30|WCO:1,2,3|Pn:X>')
        self.assertEqual(self.c.estado_maquina['wpos'], [9, 18, 27])
        self.c._procesar_linea_grbl('<Idle|WPos:9,18,27|WCO:2,3,4>')
        self.assertEqual(self.c.estado_maquina['mpos'], [11, 21, 31])
        self.assertEqual(self.c.estado_maquina['pines_limite'], '')

    def test_alarma_detiene_transmision(self):
        self.iniciar('G0X1\nG0X2')
        self.c._procesar_linea_grbl('ALARM:1')
        self.ok()
        self.assertFalse(self.c._en_ejecucion_gcode)
        self.assertNotIn(b'G0X2\n', self.p.enviados)

    def test_desconexion_espera_hilos(self):
        evento = self.c._evento_sesion
        self.c._hilo_lectura = threading.Thread(target=lambda: evento.wait(1))
        self.c._hilo_lectura.start()
        self.c.desconectar()
        self.assertFalse(self.c._hilo_lectura.is_alive())
        self.assertTrue(evento.is_set())
        self.assertFalse(self.p.is_open)

    def test_reset_limpia_transaccion(self):
        self.iniciar('G0X1')
        self.c.parada_emergencia()
        self.assertFalse(self.c._pendientes_respuesta)
        self.assertIn(b'\x18', self.p.enviados)

    def test_simulacion_comparte_incremental_unidades_y_arcos(self):
        self.c.modo_virtual = self.c.modo_lapiz = True
        self.assertTrue(self.iniciar('G20G91G1X.01F600\nX.01\nG21G90\nG3X0Y0I-.254J0'))
        self.c._hilo_virtual.join(3)
        self.assertFalse(self.c._hilo_virtual.is_alive())
        self.assertAlmostEqual(self.c.estado_maquina['wpos'][0], 0)
        self.assertTrue(any(p[2] == 100 for p in self.progreso))

    def test_escritura_incompleta_cancela_programa(self):
        self.p.write = lambda datos: 0
        self.assertFalse(self.c.iniciar_programa('G0X1'))
        self.assertFalse(self.c._en_ejecucion_gcode)

    def test_override_fisico_espera_confirmacion_por_incremento(self):
        self.c.establecer_feed_override(200)
        self.assertEqual(self.p.enviados, [b'\x91', b'?'])
        self.assertEqual(self.c.estado_maquina['override_feed'], 100)
        self.c._procesar_linea_grbl('<Run|Ov:100,100,100|MPos:0,0,0>')
        self.assertEqual(len(self.p.enviados), 2)
        for pct in range(110, 201, 10):
            self.c._procesar_linea_grbl(f'<Run|Ov:{pct},100,100|MPos:0,0,0>')
        self.assertEqual(self.c.estado_maquina['override_feed'], 200)
        self.assertIsNone(self.c._objetivo_feed_override)
        self.assertEqual(self.p.enviados.count(b'\x91'), 10)

    def test_override_cambia_objetivo_mientras_confirma(self):
        self.c.establecer_feed_override(200)
        self.c.establecer_feed_override(50)
        self.assertEqual(self.p.enviados, [b'\x91', b'?'])
        for pct in range(110, 49, -10):
            self.c._procesar_linea_grbl(f'<Run|Ov:{pct},100,100>')
        self.assertEqual(self.c.estado_maquina['override_feed'], 50)
        self.assertIsNone(self.c._objetivo_feed_override)
        self.c.establecer_feed_override(100)
        self.assertEqual(self.p.enviados[-2:], [b'\x90', b'?'])

    def test_spindle_override_fisico(self):
        self.c.establecer_spindle_override(50)
        self.assertEqual(self.p.enviados[-2:], [b'\x9b', b'?'])
        for pct in range(90, 49, -10):
            self.c._procesar_linea_grbl(f'<Run|Ov:100,100,{pct}>')
        self.assertEqual(self.c.estado_maquina['override_spindle'], 50)
        self.assertIsNone(self.c._objetivo_spindle_override)
        self.c.establecer_spindle_override(100)
        self.assertEqual(self.p.enviados[-2:], [b'\x99', b'?'])

    def test_spindle_override_durante_mecanizado_no_se_bloquea(self):
        self.c._en_ejecucion_gcode = True
        self.c._spindle_solicitado = 12000.0
        self.c.controlar_spindle(True, 6000)
        self.assertEqual(self.c._objetivo_spindle_override, 50)
        self.c._en_ejecucion_gcode = False

    def test_override_virtual_cambia_velocidad_y_duracion(self):
        class Reloj:
            def __init__(self): self.esperas = []
            def is_set(self): return False
            def wait(self, segundos): self.esperas.append(segundos); return False
        duraciones = []
        for pct in (50, 200):
            c = ControladorGRBL()
            c.esta_conectado = c.modo_virtual = c.modo_lapiz = True
            c.estado_maquina['estado'] = 'IDLE'
            reloj = c._evento_sesion = Reloj()
            velocidades = []
            c.cb_estado_actualizado = lambda e: velocidades.append(e['feed_real'])
            c.establecer_feed_override(pct)
            self.assertTrue(c.iniciar_programa('G1X1F60'))
            c._hilo_virtual.join(1)
            self.assertFalse(c._hilo_virtual.is_alive())
            self.assertIn(60*pct/100, velocidades)
            duraciones.append(sum(reloj.esperas))
        self.assertAlmostEqual(duraciones[0]/duraciones[1], 4)

    def test_husillo_conserva_s_modal_tras_m5(self):
        self.c._actualizar_husillo('M3S12000')
        self.c._actualizar_husillo('M5')
        self.assertFalse(self.c.estado_maquina['spindle_encendido'])
        self.c._actualizar_husillo('M3')
        self.assertEqual(self.c.estado_maquina['spindle_real'], 12000)
        self.assertTrue(self.c.estado_maquina['spindle_encendido'])

    def test_reconexion_virtual_no_reutiliza_trabajadores(self):
        for _ in range(3):
            self.c.conectar('SIMULADOR_VIRTUAL')
            hilo = self.c._hilo_sondeo
            evento = self.c._evento_sesion
            self.c.desconectar()
            self.assertFalse(hilo.is_alive())
            self.assertTrue(evento.is_set())

    def test_interfaz_serial_completa_muestras_con_hilos_reales(self):
        for archivo in Path('gcode_samples').glob('*.nc'):
            with self.subTest(archivo=archivo.name):
                c = ControladorGRBL()
                puerto = c.puerto_serial = PuertoGRBL()
                c.esta_conectado = True
                c.estado_maquina['estado'] = 'IDLE'
                c.modo_laser = 'laser' in archivo.name
                c.modo_lapiz = archivo.name == 'pistaspai.nc'
                fin = threading.Event()
                c.cb_progreso = lambda actual, total, pct, tiempo: fin.set() if pct == 100 else None
                # Operador de prueba: continúa únicamente después del aviso M6 confirmado.
                c.cb_alerta_seguridad = lambda *args: c.reanudar() if c._cambio_listo else None
                c._iniciar_hilos_hardware()
                try:
                    self.assertTrue(c.iniciar_programa(archivo.read_text(encoding='utf-8-sig')))
                    self.assertTrue(fin.wait(10), 'El programa no completó su intercambio serial.')
                    self.assertNotIn(b'\x18', puerto.enviados)
                    self.assertFalse(c._en_ejecucion_gcode)
                finally:
                    c.desconectar()
                self.assertFalse(c._hilo_lectura.is_alive())
                self.assertFalse(c._hilo_sondeo.is_alive())


class AnalizadorTests(unittest.TestCase):
    def setUp(self): self.p = ProcesadorGCode()

    def test_incremental_varias_palabras_g(self):
        r = self.p.analizar_programa('G91G1X1F60\nX1')
        self.assertTrue(r['es_valido'])
        self.assertEqual(r['distancia_total_mm'], 2)

    def test_pulgadas(self):
        r = self.p.analizar_programa('G20\nG1X1F60')
        self.assertEqual(r['distancia_total_mm'], 25.4)
        self.assertEqual(r['tiempo_estimado_segundos'], 1)

    def test_rapido_modal_y_origen_en_envolvente(self):
        r = self.p.analizar_programa('G0X10\nX20')
        self.assertEqual(r['distancia_rapido_mm'], 20)
        self.assertEqual(r['envolvente']['ancho_x'], 20)

    def test_semicirculo_longitud_y_extremos(self):
        r = self.p.analizar_programa('G0X10\nG3X-10Y0I-10J0F60')
        self.assertEqual(r['distancia_corte_mm'], round(math.pi*10, 2))
        self.assertAlmostEqual(r['envolvente']['max']['Y'], 10)

    def test_circulo_completo_sin_xyz(self):
        r = self.p.analizar_programa('G0X10\nG2I-10J0F60')
        self.assertEqual(r['distancia_corte_mm'], round(math.pi*20, 2))
        self.assertAlmostEqual(r['envolvente']['min']['X'], -10)

    def test_radio_negativo_arco_mayor(self):
        a = Interprete(); a.pos = [10, 0, 0]
        b = a.bloque('G3X0Y10R-10F60')
        self.assertAlmostEqual(b['distancia'], 15*math.pi)

    def test_valores_invalidos_y_no_soportados(self):
        for codigo in ('G1XabcF100', 'G1X1X2', 'G1G0X1', 'G18G2X1Z1I1', 'G1X1F0', 'G3X100I1', 'G90.1', 'G10L20P1X0'):
            with self.subTest(codigo=codigo):
                self.assertFalse(self.p.analizar_programa(codigo)['es_valido'])

    def test_muestras_del_repositorio(self):
        for archivo in Path('gcode_samples').glob('*.nc'):
            with self.subTest(archivo=archivo.name):
                self.assertTrue(self.p.analizar_programa(archivo.read_text(encoding='utf-8-sig'))['es_valido'])


class PuenteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.app = QCoreApplication.instance() or QCoreApplication([])

    def test_cierre_para_y_desconecta(self):
        c = ControladorGRBL(); p = c.puerto_serial = PuertoFalso(); c.esta_conectado = True
        puente = PuenteCNC(c, ProcesadorGCode())
        puente.destruir()
        self.assertIn(b'\x18', p.enviados)
        self.assertFalse(p.is_open)
        self.assertIsNone(c.cb_alerta_seguridad)

    def test_historial_con_ruta_aislada_lee_y_guarda(self):
        with tempfile.TemporaryDirectory(prefix='cnc-history-test-') as carpeta:
            ruta = Path(carpeta) / 'historial' / 'prueba.json'
            puente = PuenteCNC(ControladorGRBL(), ProcesadorGCode(), ruta_historial=ruta)
            try:
                self.assertEqual(puente.cargarHistorialDisco(), '[]')
                self.assertIsNone(puente._ruta_historial_antiguo)
                datos = '[{"archivo":"prueba.nc","resultado":"Completado"}]'
                self.assertEqual(puente.guardarHistorialDisco(datos), 'OK')
                self.assertEqual(puente.cargarHistorialDisco(), datos)
                self.assertEqual(ruta.read_text(encoding='utf-8'), datos)
            finally:
                puente.destruir()


if __name__ == '__main__':
    unittest.main()
