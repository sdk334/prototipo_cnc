# Memoria y rendimiento al recargar archivos

Revisión del 3 de noviembre de 2026, America/Mexico_City. No se conectó la CNC.

## Conclusión

El aumento inicial procedía principalmente del renderer de Chromium: memoria temporal y memoria conservada por sus asignadores después de trabajar. No se encontró crecimiento indefinido de archivos completos en las 25 recargas ensayadas. Sí se corrigieron dos retenciones de referencias del programa anterior y trabajo duplicado que aumentaba las asignaciones temporales.

## Causas y correcciones

1. **Trayectoria construida dos veces por cambio de programa.** `estimarSegundosBaseDesdeLineas` ya cargaba y analizaba la geometría; después sus llamadores volvían a construirla. Se eliminaron las segundas construcciones en apertura, edición, demo, ajuste de avance e inicialización. La integración registra y exige **una construcción por carga**. El análisis Python sigue siendo la validación autoritativa; no se cambió la transmisión.
2. **Caché invalidada pero todavía referenciada.** La bandera `_cacheVisiblesValida=false` no liberaba `_cacheVisibles`. Al cargar un archivo sin movimientos o limpiar/rechazar el programa, el render salía antes de reconstruirla y la caché del archivo anterior podía persistir. El diagnóstico anterior mostraba 6.804 entradas incluso después de cargar un programa sin segmentos. Ahora se elimina la referencia al invalidar y se reinician progreso, material y límites al limpiar/rechazar.
3. **Deshacer y selección conservados entre archivos.** El historial podía retener versiones anteriores del editor después de abrir otro programa. Ahora se limpia al abrir otro archivo, cargar el demo o vaciar el programa; se conserva al rechazar un archivo vacío, que no reemplaza el programa. También evita aplicar un deshacer del archivo anterior al nuevo.
4. **Asignaciones temporales innecesarias en el parser.** Se reutilizan tablas de códigos/grupos por análisis, se detectan repeticiones sin crear un arreglo filtrado por cada letra y se usan los parámetros numéricos ya analizados, evitando reconstruir la línea y volverla a procesar con expresiones regulares.

Las pruebas de retención fallaron antes de los cambios y pasan después. No se añadió recolección de basura forzada a la aplicación.

## Evidencia: memoria temporal frente a objetos vivos

En una corrida anterior de tres cargas, conectar el diagnóstico al final mostró un heap V8 de **247.34 MiB**; después de la recolección diagnóstica quedó en **3.26 MiB**. El Working Set conjunto bajó de 746.48 a 494.76 MiB. Esto demuestra que la gran subida inicial no correspondía íntegramente a objetos todavía necesarios. No identifica por sí solo cada reserva nativa de Chromium.

La prueba posterior extendida hizo **25 cargas del archivo grande**, cada una precedida por un archivo corto (50 cargas, más una final para comprobar liberación). No se conectó el depurador ni se invocó GC explícito durante esas 25 cargas; se conectó solo al final para inspeccionar la memoria viva.

- Archivo grande: `gcode_samples\pistas.nc`, 156745 bytes. Antes se llamaba `pistaspai.nc`; fue renombrado a `pistas.nc` durante el trabajo y su contenido no cambió. Los ensayos lo identifican por SHA-256: `4b75bcf4eb171d96256b9ea541fcdd49df98b6e17714cfaf036bfe45b2dfddf7`.
- Renderer: creció durante el calentamiento y después se estabilizó. Últimas diez cargas: **632.188–633.051 MiB**, variación **0.863 MiB**.
- Python, mismas últimas diez cargas: 313.598–316.945 MiB. Se miden procesos separados; no se incluye GPU ni procesos auxiliares.
- Al sondear y recolectar al final: heap V8 **3.164 MiB** con el archivo grande cargado. Tras cargar un archivo corto sin movimientos: **1.312 MiB**, **0 segmentos y 0 entradas de caché**.
- Los 6.804 segmentos del archivo grande y las 38 filas visibles permanecieron constantes. Al sondear al final hubo un documento y 256 manejadores de eventos. Las filas de consola crecieron por los mensajes de prueba; la aplicación ya limita la consola a 200 filas.
- El sondeo puede modificar el comportamiento de GC. Por eso las cifras de memoria viva posteriores al sondeo no se presentan como consumo normal del proceso. El Working Set normal siguió siendo de cientos de MiB; no se promete devolver toda la memoria al sistema operativo después de cada carga.

## Rendimiento repetido

Tres repeticiones con el mismo contenido y la misma ventana Qt/Chromium, incluyendo cambio XY/XZ/3D. La primera incluye calentamiento. Sin tracemalloc, sin depurador conectado ni GC explícito en estas corridas de rendimiento.

| Repetición | Carga/primeros fotogramas antes → después (ms) | Hasta análisis antes → después (ms) | Memoria Python + renderer antes → después (MiB) |
|---|---:|---:|---:|
| 1 | 657.2 → 332.9 | 1689.6 → 1196.8 | 566.36 → 536.7 |
| 2 | 512.1 → 314.2 | 1647.5 → 1191.3 | 650.36 → 597.22 |
| 3 | 500.3 → 285.7 | 1630 → 1254.9 | 730.14 → 648.16 |


Media de carga/primeros fotogramas: **556.53 → 310.93 ms**. Memoria al terminar la tercera carga: **730.14 → 648.16 MiB**. Son mediciones locales; el estado del equipo y el calentamiento influyen y no se garantiza ese porcentaje de mejora en otro equipo.

| Repetición posterior | XY (ms) | XZ (ms) | 3D (ms) | Construcciones por carga |
|---|---:|---:|---:|---:|
| 1 | 109.1 | 105 | 70.1 | 1 |
| 2 | 73.4 | 143.7 | 62.2 | 1 |
| 3 | 69.5 | 95.7 | 63.5 | 1 |

La carga se mide hasta los primeros dos requestAnimationFrame; la señal de análisis incluye el trayecto hasta el backend. Son intervalos distintos y no deben sumarse. El cambio de vista se mide hasta dos requestAnimationFrame, no como FPS sostenidos.

## Validación final

- 48 pruebas Python aprobadas.
- 35 pruebas JavaScript aprobadas, incluidas ocho de memoria y sustitución de programa.
- Integración nativa con puerto falso aprobada: streaming, confirmaciones, M6, errores y cierre.
- Integración real Qt/Chromium aprobada: calibración, archivo vacío, tutorial/diccionario, tres cargas, simulación láser completa y reapertura del historial en otro proceso.
- Sintaxis Python/JavaScript y `git diff --check`: sin errores.
- La versión de fuentes de la integración final se contrastó mediante SHA-256 con los archivos finales. La prueba extendida ensaya la misma lógica de apertura y parser; después solo se amplió la limpieza al botón de demo y se adaptaron los scripts al renombrado del archivo, con regresiones específicas. Se preservaron las modificaciones concurrentes del demo.

## Reproducción y datos

Desde la raíz del proyecto, en PowerShell:

```powershell
python -m unittest discover -s tests -v
node --test tests/frontend.test.cjs tests/pendientes.test.cjs tests/memoria.test.cjs
python tests/native_integration.py
python tests/pendientes_integracion.py
$env:CNC_DELAY_CDP='1'
python tests/memoria_recargas.py repeticion 25
```

El diagnóstico usa `websocket-client` (disponible en este entorno), CDP solamente en loopback, perfiles Chromium e historial temporales. La instrumentación no se activa al ejecutar `main.py`. `CNC_TRACE_MEMORY=1` activa tracemalloc para investigar Python; sus tiempos no se usan como rendimiento normal. Para preservar datos previos, usar otra etiqueta al repetir el diagnóstico.

Datos en `output/memoria_recargas/`: `rendimiento_antes_desglose.json`, `rendimiento_antes_gc.json`, `antes.json` (diagnóstico con tracemalloc), `antes_sin_trazas.json` (sondeo temprano, no comparable como Working Set normal), `despues_natural.json` (25 recargas y sondeo final) y `rendimiento_despues.json`. Incluyen hashes de contenido y fuentes. `tests/` y `output/` siguen excluidos por el `.gitignore` existente; este reporte sí queda fuera de esas exclusiones.

El alcance es este archivo y estos recorridos. No acredita ausencia de toda fuga para cualquier archivo o una sesión de duración ilimitada. Las pruebas físicas pendientes de la matriz CNC no cambian.
