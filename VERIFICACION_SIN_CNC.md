# Matriz y evidencia de pruebas sin CNC

Actualizada el **3 de noviembre de 2026**, zona America/Mexico_City.

## Resultado

Se completaron las comprobaciones de software pendientes de la tabla original en el alcance ensayado. **ECP11, ECP12, ECP18 y ECP20 quedan completadas sin CNC; las otras nueve conservan únicamente su validación física pendiente.** Una prueba con simulador/puerto falso no acredita comportamiento físico. La medición de rendimiento está completada; la tabla original no fija un umbral numérico de aceptación.

## Tabla actualizada

| Prueba | Escenario | Estado actual | Evidencia sin hardware | Único pendiente: CNC física |
|---|---|---|---|---|
| ECP10 | Transmisión completa | Software verificado; pendiente física | Confirmaciones por línea, errores, barrera e Idle con puerto falso; integración Qt/Chromium. | Corrida física corta compatible: registrar envíos, aceptaciones, errores, duración y estado final. No usar pistaspai.nc hasta verificar compatibilidad. |
| ECP11 | Historial de trabajos | Completada sin CNC | Trabajo láser nuevo; cierre de la ventana y proceso; reapertura en proceso y perfil Chromium nuevos; recuperados archivo, herramienta, fecha, duración, líneas y resultado. | Ninguna para el historial. |
| ECP12 | Tutorial y diccionario | Completada sin CNC | Cinco pasos y cierre/reapertura del tutorial; búsquedas G01/M03/sin coincidencias; cierre del diccionario; programa y trayectoria íntegros; controles XY/XZ/3D operativos; capturas inspeccionadas. | Ninguna. |
| ECP13 | Control de avance/RPM | Software verificado; pendiente física | Overrides con confirmación de telemetría falsa; avance al 10/100/200 % y husillo en regresiones. | Verificar respuesta física de avance/RPM al 10/100/200 % y extremos seguros. No usar el tiempo estimado como prueba física. |
| ECP14 | Parada y reanudación | Software y documentación verificados; pendiente física | Pausa, reanudación, reset, limpieza de colas y M6 en pruebas falsas e integración. RF-07/MSJ_22 aclarados en documento académico y README. | Validar Feed Hold, Cycle Start, reinicio y paro físico independiente mediante procedimiento aprobado. |
| ECP15 | Calibración pasos/mm | Software verificado; pendiente física | Cálculo y validación; no guardar hasta ok; error, timeout y rechazo; confirmación por WebChannel real en simulación (250 × 10/9 = 277.778). | Por eje: registrar distancia ordenada y medida, valor inicial, cálculo, respuesta de GRBL y repetición posterior. |
| ECP16 | Homing y finales de carrera | Software verificado; pendiente física | Envío de $H, lectura de pines y manejo de alarmas disponibles; parser de pines probado. | Registrar configuración GRBL, sensores y condición inicial; activación controlada y estado final. |
| ECP17 | Movimiento físico Z | Software verificado; pendiente física | Interpretación, representación y comprobaciones de recorrido Z verificadas sin hardware. | Confirmar presencia/conexión del motor Z y movimiento real. Si no está instalado, declarar el alcance no probado. |
| ECP18 | Archivos/comandos inválidos | Completada sin CNC | Sintaxis inválida, código desconocido, bloques incompatibles, vacío y fallos de lectura; rechazo sin envío inesperado. FileReader real de archivo vacío conserva el programa anterior e informa el error. | Ninguna para los casos de software ensayados. |
| ECP19 | Límites de trayectoria | Software verificado; pendiente física | Casos dentro/fuera de X/Y/Z, incluido exceso positivo de Z corregido. Láser completo dentro de límites configurados. | Contrastar parámetros y origen con recorrido real y respuesta del controlador. La advertencia gráfica permite continuar y no sustituye límites físicos/firmware. |
| ECP20 | Rendimiento con programa grande | Medición completada sin CNC | Archivo y versión identificados por SHA-256; tres repeticiones con carga, análisis, cambios XY/XZ/3D y memoria aproximada. Datos abajo. | Ninguna para la medición de software solicitada. |
| ECP21 | Pérdida y recuperación de conexión | Software verificado; pendiente física | Cierre, limpieza de transacciones, trabajadores y reconexión con simulador/puertos falsos en regresiones. | Desconectar adaptador USB durante prueba controlada; comprobar mensaje, cierre y reconexión sin duplicar movimientos. |
| ECP22 | Modo láser / corte laser.nc | Simulación completa verificada; pendiente física | Archivo completo 199/199 líneas; potencia simulada S1000 durante encendido, final S0/apagado/IDLE; límites sin desbordamiento; registro y reapertura correctos. | Para operación real: revisar configuración GRBL, M3/M4/M5, potencia y límites con resguardos/procedimiento específicos. Seleccionar modo láser no configura automáticamente $32. |

## Ejecuciones y correcciones

- **48 pruebas Python aprobadas**: `python -m unittest discover -s tests -v`.
- **35 pruebas JavaScript aprobadas**: `node --test tests/frontend.test.cjs tests/pendientes.test.cjs tests/memoria.test.cjs`.
- **Integración nativa aprobada**: `python tests/native_integration.py`. Ventana real, Qt/WebChannel, streaming por puerto falso, confirmaciones, M6, errores, historial y cierre. Se corrigió la expectativa obsoleta de esa prueba: un mensaje de progreso en reposo se ignora; no debe sustituir el progreso del archivo cargado.
- **Integración de pendientes aprobada**: `python tests/pendientes_integracion.py`. Chromium/Qt reales en dos procesos independientes; únicamente simulador, historial temporal y perfiles Chromium nuevos en memoria. Se probó calibración vía WebChannel, archivo vacío con FileReader, tutorial/diccionario, rendimiento y simulación láser completa, seguida de cierre y reapertura.
- Sintaxis Python/JavaScript y `git diff --check`: sin errores.
- Correcciones previas: aviso de archivo vacío/fallo de lectura; calibración guardada tras `ok` y manejo de rechazo/timeout; límite positivo Z.
- Correcciones encontradas en esta revisión: el tutorial ahora indica seleccionar el COM detectado para conectar; el mensaje y cierre de selección de herramienta esperan la aceptación del puente. Las pruebas incluyen aceptación y rechazo de herramienta.

## RF-07: diferencia resuelta en documentación

RF-07 y MSJ_22 del documento académico local y README distinguen reinicio por software (`0x18`, Ctrl+X), pausa (`!`) y reanudación (`~`). El reset cancela el programa y limpia las colas del emisor; el envío no confirma el paro mecánico. El paro físico independiente conserva su prueba con CNC. Referencia primaria: [comandos oficiales GRBL](https://github.com/gnea/grbl/blob/master/doc/markdown/commands.md).

## Rendimiento: ECP20

Mediciones repetidas tras corregir retenciones y trabajo duplicado. Archivo actual `gcode_samples\pistas.nc`, 156745 bytes, contenido idéntico al anterior `pistaspai.nc` (SHA-256 `4b75bcf4eb171d96256b9ea541fcdd49df98b6e17714cfaf036bfe45b2dfddf7`).

| Repetición | Carga/primeros fotogramas antes → después (ms) | Hasta análisis antes → después (ms) | Memoria Python + renderer antes → después (MiB) |
|---|---:|---:|---:|
| 1 | 657.2 → 332.9 | 1689.6 → 1196.8 | 566.36 → 536.7 |
| 2 | 512.1 → 314.2 | 1647.5 → 1191.3 | 650.36 → 597.22 |
| 3 | 500.3 → 285.7 | 1630 → 1254.9 | 730.14 → 648.16 |


Se verificó una sola construcción de trayectoria por carga. En la prueba extendida de 25 recargas, las últimas diez mediciones del renderer estuvieron entre 632.188 y 633.051 MiB, sin GC explícito durante las cargas. Al cambiar a un archivo sin movimientos quedan 0 segmentos y 0 entradas de caché. La inspección al final muestra memoria viva pequeña, pero el Working Set normal conserva reservas de Chromium. No equivale a un límite universal ni a una garantía de ausencia de toda fuga.

Causas, métricas separadas por proceso, cambios, límites del diagnóstico y reproducción: [MEMORIA_Y_RENDIMIENTO.md](MEMORIA_Y_RENDIMIENTO.md). La corrida final completa y sus hashes de fuentes están en `output/verificacion_sin_cnc/resultados.json`; se contrastaron con los archivos finales.

## Simulación láser y reapertura: ECP11/ECP22

- `corte laser.nc`: **199/199 líneas** completadas usando override virtual 500 %, en 26.15 s de reloj de esta ejecución. Es tiempo de simulación acelerada, no tiempo de corte ni prueba de potencia física.
- Encendido simulado observado con S1000; final S0, husillo/emisor apagado, avance cero, posición final 0/0/0 y estado IDLE.
- Envolvente simulada X 0–180 mm, Y 0–15.001 mm, Z 0 mm; dentro de límites configurados 300 × 200 × 60 mm.
- Se verificó modal de finalización y registro con archivo, herramienta, fecha, duración, líneas y resultado “Simulación Virtual”. Se cerró la ventana, se verificó cierre del controlador/trabajadores, terminó el proceso y se abrió otro proceso con perfil Chromium nuevo. El historial se recuperó desde el archivo temporal y sus seis campos coincidieron.
- Cero errores JavaScript reportados durante la integración de pendientes.

## Evidencia y reproducción

Los resultados detallados están en [resultados.json](output/verificacion_sin_cnc/resultados.json). Capturas generadas por la ventana nativa e inspeccionadas: [tutorial](output/verificacion_sin_cnc/tutorial.png), [diccionario](output/verificacion_sin_cnc/diccionario.png), [programa grande 3D](output/verificacion_sin_cnc/programa_grande_3d.png), [láser en simulación](output/verificacion_sin_cnc/laser_en_simulacion.png), [láser finalizado](output/verificacion_sin_cnc/laser_finalizado.png) e [historial tras reapertura](output/verificacion_sin_cnc/historial_reabierto.png).

Pruebas nuevas locales: `tests/test_sin_cnc.py`, `tests/pendientes.test.cjs`, `tests/pendientes_integracion.py`, `tests/memoria.test.cjs` y `tests/memoria_recargas.py`. El `.gitignore` existente excluye `tests/`, `output/` y `docs/`; estos archivos están disponibles localmente y no entran en un commit normal mientras se conserve esa regla. La matriz de este documento y la aclaración de README sí están fuera de esas exclusiones.

No se abrió ningún puerto CNC físico. Se usaron archivos temporales para el historial y perfiles de prueba; el historial real del usuario se preservó. Los cambios previos de trabajo se conservaron.
