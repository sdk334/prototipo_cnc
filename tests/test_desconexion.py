import unittest
from unittest.mock import MagicMock
from core import ControladorGRBL, ProcesadorGCode, PuenteCNC


class PuertoMock:
    def __init__(self):
        self.is_open = True
        self.datos_escritos = []

    def write(self, datos):
        self.datos_escritos.append(datos)
        return len(datos)

    def close(self):
        self.is_open = False


class TestDesconexionCNC(unittest.TestCase):
    def setUp(self):
        self.controlador = ControladorGRBL()
        self.alertas = []
        self.estados = []
        self.consolas = []

        self.controlador.cb_alerta_seguridad = lambda t, e, d: self.alertas.append((t, e, d))
        self.controlador.cb_estado_actualizado = lambda est: self.estados.append(est)
        self.controlador.cb_linea_consola = lambda tipo, msg: self.consolas.append((tipo, msg))

    def test_desconexion_abrupta_emite_alerta_y_actualiza_estado(self):
        puerto = PuertoMock()
        self.controlador.puerto_serial = puerto
        self.controlador.esta_conectado = True
        self.controlador.modo_virtual = False
        self.controlador.estado_maquina['estado'] = 'IDLE'

        self.controlador._manejar_desconexion_abrupta("Cable USB desconectado físicamente")

        self.assertFalse(self.controlador.esta_conectado)
        self.assertEqual(self.controlador.estado_maquina['estado'], 'DESCONECTADO')
        self.assertFalse(puerto.is_open)
        self.assertIsNone(self.controlador.puerto_serial)

        # Se debe haber emitido la alerta de seguridad al usuario
        self.assertEqual(len(self.alertas), 1)
        titulo, encabezado, desc = self.alertas[0]
        self.assertIn("DESCONEXIÓN", titulo)
        self.assertIn("Cable USB desconectado", desc)

        # Se debe haber notificado el estado DESCONECTADO
        self.assertTrue(any(e.get('estado') == 'DESCONECTADO' for e in self.estados))

    def test_bloqueo_de_comandos_al_estar_desconectado(self):
        self.controlador.esta_conectado = False
        self.controlador.modo_virtual = False
        self.controlador.estado_maquina['estado'] = 'DESCONECTADO'

        # Todos los métodos de envío deben ser bloqueados
        self.assertFalse(self.controlador.enviar_comando("G0 X10"))
        self.assertFalse(self.controlador.enviar_directo("G0 X10\n"))
        self.assertFalse(self.controlador.enviar_tiempo_real(b'?'))
        self.assertFalse(self.controlador.iniciar_programa("G0 X10\nM2"))
        self.assertFalse(self.controlador.aplicar_calibracion("X", 800.0))

        # Jog, homing y ceros no deben generar comandos ni excepciones
        self.controlador.mover_jog("X", 10.0, 500.0)
        self.controlador.ejecutar_homing()
        self.controlador.poner_cero_eje("X")
        self.controlador.poner_cero_plano_xy()

        # Las colas deben permanecer completamente vacías
        self.assertEqual(len(self.controlador._pendientes_respuesta), 0)
        self.assertEqual(len(self.controlador._cola_manual), 0)
        self.assertEqual(len(self.controlador._cola_lineas), 0)

        # La consola debe reflejar mensajes de bloqueo
        mensajes_bloqueo = [msg for tipo, msg in self.consolas if "[BLOQUEO]" in msg]
        self.assertGreater(len(mensajes_bloqueo), 0)

    def test_desconexion_durante_mecanizado_limpia_colas(self):
        puerto = PuertoMock()
        self.controlador.puerto_serial = puerto
        self.controlador.esta_conectado = True
        self.controlador.modo_virtual = False
        self.controlador._en_ejecucion_gcode = True
        self.controlador._en_pausa_gcode = False
        self.controlador._cola_lineas = ["G1 X10 F500", "G1 Y10 F500", "M2"]
        self.controlador._pendientes_respuesta.append(('prog', 'G1 X10 F500'))
        self.controlador._cola_manual.append("M3 S1000")

        self.controlador._manejar_desconexion_abrupta("Fallo I/O")

        self.assertFalse(self.controlador._en_ejecucion_gcode)
        self.assertFalse(self.controlador._en_pausa_gcode)
        self.assertEqual(len(self.controlador._cola_lineas), 0)
        self.assertEqual(len(self.controlador._pendientes_respuesta), 0)
        self.assertEqual(len(self.controlador._cola_manual), 0)
        self.assertEqual(self.controlador.estado_maquina['estado'], 'DESCONECTADO')

    def test_hotplug_desconexion_puerto_activo(self):
        procesador = ProcesadorGCode()
        puente = PuenteCNC(self.controlador, procesador)

        alertas_puente = []
        puente.senial_alerta_seguridad.connect(lambda t, e, d: alertas_puente.append((t, e, d)))

        puerto = PuertoMock()
        self.controlador.puerto_serial = puerto
        self.controlador.esta_conectado = True
        self.controlador.modo_virtual = False
        self.controlador.nombre_puerto = "COM9"
        self.controlador.estado_maquina['estado'] = 'IDLE'

        puente._nombres_puertos_previos = ["COM9"]
        puente._firma_puertos_previa = [("COM9", "Arduino Uno")]

        # Mockear escanear_puertos para simular que COM9 ya no existe
        self.controlador.escanear_puertos = MagicMock(return_value=[])

        puente._verificar_cambios_hotplug()

        self.assertFalse(self.controlador.esta_conectado)
        self.assertEqual(self.controlador.estado_maquina['estado'], 'DESCONECTADO')
        self.assertEqual(len(alertas_puente), 1)
        self.assertIn("DESCONEXIÓN", alertas_puente[0][0])


if __name__ == '__main__':
    unittest.main()
