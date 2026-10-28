# Revisión del software CNC Basic

Fecha: 26 de octubre de 2026.

## Correcciones implementadas

Los hallazgos originales que aparecen más abajo describen el estado anterior; sus números de línea son los de esa revisión. Las correcciones se realizaron posteriormente en esta misma sesión.

| Hallazgos | Corrección |
| --- | --- |
| 1 | Finalización separada de cancelación: barrera `G4 P0`, confirmación y reporte `Idle`; el progreso permanece por debajo de 100 % hasta entonces. La GUI no manda reset al completar. |
| 2 | M6 drena el planificador, manda M5 y espera su respuesta antes de mostrar el aviso. Continuar se bloquea hasta confirmar ese proceso. Se rechazan movimientos mezclados con M6. |
| 3 | Filtrado por palabras numéricas, sin depender de espacios, posición o ceros iniciales. En modo lápiz se retiran M3/M4 y se conservan los movimientos del bloque. Los comandos manuales durante un programa se restringen. |
| 4 | Interbloqueo previo al envío físico de cada corte, con estado modal del movimiento y del husillo. La recuperación requiere encender el husillo y continuar. |
| 5 | Escape de HTML tanto en el código coloreado como en todos los campos del historial. |
| 6 | Error o alarma cancela la alimentación, aborta el trabajo y notifica un resultado de error a la GUI. Nunca se registra ese trabajo como completado. |
| 7 | Una sola línea serial pendiente con su tipo de respuesta. Los comandos manuales se encolan en orden; iniciar un programa requiere que esa cola esté vacía. Los comandos en tiempo real usan su canal de bytes. |
| 8 | Evento de cancelación por sesión y espera del cierre de los trabajadores antes de reconectar. Un trabajador antiguo no puede continuar usando el puerto nuevo. |
| 9–10 | Intérprete Python compartido por simulación, prevalidación y análisis; unidades, estado modal, arcos XY por I/J o R, círculos completos, distancias y envolventes. Parser del navegador corregido también. Los códigos y planos no implementados se rechazan explícitamente. |
| 11 | Comentarios eliminados antes de transmitir, longitud medida en ASCII y rechazo previo de bloques mayores de 79 caracteres útiles. Fallos y escrituras parciales se detectan. |
| 12 | Coordenadas recalculadas después de procesar el reporte completo; se limpian los pines omitidos. |
| 13 | Lectura de disco mediante `await`, tanto al inicializar como al establecer el puente; una lista vacía también reemplaza el estado anterior. |
| 14 | Cierre con parada válida, desconexión en `finally` y retirada de callbacks y temporizadores. |

La transmisión ahora espera una respuesta por línea. Este cambio prioriza la correspondencia de comandos y respuestas y puede reducir la velocidad de alimentación frente al envío anticipado de múltiples líneas. Los programas se ejecutan con modos iniciales explícitos (mm, absoluto, XY, G54, avance por minuto); se rechazan cambios de coordenadas y planos que el intérprete todavía no representa.

### Verificación de las correcciones

Desde la raíz del repositorio:

```powershell
python -m unittest discover -s tests -v
node --test tests/frontend.test.cjs
python tests/browser_smoke.py
python tests/qt_smoke.py
python tests/native_integration.py
python tests/native_resize.py
python -m compileall -q core main.py
node --check gui/app.js
node --check gui/visualizer.js
```

Las pruebas incluyen un GRBL falso que intercambia respuestas a través de los hilos seriales reales del controlador y transmite los tres archivos de ejemplo. La prueba de navegador usa Chrome headless con perfil temporal; carga un archivo con HTML, comprueba que no se ejecute y verifica una trayectoria y ejecución incremental de 50.8 mm. No modifica el historial ni el perfil del usuario.

Resultado final: **37 pruebas Python aprobadas, 17 pruebas JavaScript aprobadas y cuatro pruebas de integración aprobadas (Chrome, Qt WebEngine, ventana nativa y estrés de redimensionamiento)**. Compilación de sintaxis Python, comprobaciones de sintaxis JavaScript y `git diff --check` sin errores.

### Estabilidad de redimensionamiento y pantalla completa

Se agrupan las ráfagas de resize antes de recrear los buffers, se evita reasignarlos si las dimensiones no cambian y se limita cada lienzo a 4,194,304 píxeles y 4,096 por lado. El panel lateral aplica como máximo un cambio de anchura por frame y todos los arrastres se liberan en blur, cambio de visibilidad, resize o pérdida de botones del ratón. Las cuadrículas tienen un número finito de iteraciones incluso con coordenadas extremas.

Se eliminaron las transiciones intermedias normal/maximizada al salir de fullscreen, se conserva el estado anterior y los atajos nativos permiten salir de fullscreen sin depender del renderizador web. La aplicación deja de forzar D3D/ANGLE y configura renderizado por software antes de crear QApplication, según los mecanismos descritos por [Qt WebEngine](https://doc.qt.io/qt-6/qtwebengine-debugging.html) y [Qt Quick](https://doc.qt.io/qt-6/qtquick-visualcanvas-adaptations.html). El visualizador usa Canvas 2D; su vista 3D no requiere WebGL.

La prueba con 6,804 segmentos y zoom de 25,000 % detectó dibujos completos de aproximadamente 550 ms. Se recortaron polígonos y trazos al área visible antes de rasterizar y se omiten los rellenos de mesa/material a gran aumento, conservando contornos y trayectorias. En la prueba posterior se observaron 108 dibujos, máximo de 60.5 ms por dibujo y pausa máxima del bucle Qt de 102 ms durante 80 ciclos de ventana/fullscreen y 1,000 eventos de arrastre. No hubo capturas persistentes de ratón ni errores JavaScript. El bloqueo total del escritorio descrito por el usuario no se reprodujo; las pruebas cubren los problemas de carga gráfica y de interacción encontrados, sin probar una CNC física.

### Confirmación visual por comando

El visor muestra `ok` en verde junto a cada bloque del programa que recibe una respuesta `ok` del firmware. No se deduce del porcentaje de progreso: comentarios, bloques no enviados, órdenes internas del host y errores no se marcan. Los indicadores se conservan al desplazar o redibujar el visor y se limpian al cargar o iniciar un programa. En simulación, el indicador identifica su origen en la descripción emergente. La prueba nativa verifica el texto, el color, la conservación al redibujar y la ausencia de marcas tras un rechazo.

### Corrección del control de override y formato del progreso

El progreso ahora se presenta con exactamente un decimal, por ejemplo `7.5%`. Los presets y el deslizador aplican explícitamente el override; los refrescos de pantalla ya no reenvían órdenes de velocidad. La telemetría `Ov` actualiza los valores mostrados. El reloj de simulación en navegador también responde al porcentaje seleccionado.

En hardware, cada incremento espera un cambio confirmado en `Ov` antes de enviar el siguiente. Se evita enviar múltiples incrementos iguales en un solo paquete, porque el firmware los representa mediante flags de ejecución. Referencia: [implementación oficial de GRBL](https://github.com/gnea/grbl/blob/master/grbl/protocol.c). Las pruebas cubren 50 %, 100 %, 200 %, cambios de objetivo durante la confirmación y la relación de duración del simulador.

**Integración nativa resuelta:** el cierre `0xC0000409` provenía de la prueba, que construía `QApplication([])` sin `argv[0]`. Al usar `QApplication(sys.argv)`, como ya hacía la aplicación, Qt WebEngine carga correctamente. El diagnóstico inicial sobre la instalación de Qt fue demasiado amplio; no fue necesario cambiar paquetes globales. Las pruebas nativas usan la configuración gráfica de la aplicación, un perfil de Chromium en memoria y un historial temporal aislado.

La prueba `native_integration.py` construye la clase real `VentanaPrincipalCNC` y recorre carga de historial, escape de HTML, ejecución incremental, finalización sin reset, M6 con apagado confirmado, continuación, rechazo de firmware, registro de error y cierre de los hilos. En esa prueba se detectó y corrigió además que el historial perdía el nombre del archivo cargado y siempre usaba `programa_cnc.nc`. Queda pendiente únicamente la validación con hardware físico.

## Registro de la revisión inicial

Alcance: inspección del código Python, JavaScript, HTML, CSS y archivos de configuración del repositorio; comprobación de sintaxis Python y JavaScript; reproducción del controlador con un puerto falso en memoria y del analizador con programas pequeños. No se probó hardware físico ni se ejecutó una validación visual integral de la aplicación. No se modificó el código de la aplicación ni los cambios locales previos. No se encontró una suite de pruebas en el repositorio.

## Prioridad crítica

1. **La finalización puede cancelar movimientos pendientes.** `core/controlador_grbl.py:986` considera finalizado el programa al recibir las confirmaciones de las líneas. `gui/app.js:516` llama a `detenerMecanizado('Completado')` cuando todas están confirmadas; esa función (`1570`) llama siempre a `puenteCNC.detener()`, que termina en `parada_emergencia()` y transmite un reinicio. La aceptación de las líneas no verifica que el planificador haya terminado de mover la máquina. Debe separarse la finalización de la cancelación y esperar la finalización física antes de registrar éxito.

2. **M6 no apaga el husillo en hardware.** En `core/controlador_grbl.py:930`, la pausa llama a `controlar_spindle(False, 0)`, pero el interbloqueo de esa función rechaza apagar durante `_en_ejecucion_gcode`. Reproducción con husillo activo y programa `M6\nG0 X1`: se enviaron `!` y `(M6)`, sin `M5`; el estado del husillo siguió activo. Además, se anuncia una pausa segura sin esperar confirmación de parada. Hay que sincronizar la parada de movimiento y el apagado real antes de permitir el cambio manual.

3. **El bloqueo del motor en modo lápiz se evade.** `core/controlador_grbl.py:814` solo detecta M3/M4 al inicio del comando; `S1000 M3` se transmite completo. El filtro del streaming (`961`) depende de límites de palabra y deja pasar `M3S1000`. Ambos casos se reprodujeron. Debe analizarse cada palabra de código, independientemente del orden y de los espacios. El filtro de M5 manual presenta una restricción semejante en `822`.

4. **La protección contra corte sin husillo solo existe en simulación.** El control en `core/controlador_grbl.py:1229` pertenece al bucle virtual. El streaming físico (`908`) envía `G1 X10 F100` con el husillo apagado, sin pausa ni advertencia; reproducido con puerto falso. Debe definirse y aplicarse la protección también para hardware, teniendo en cuenta el estado modal y el orden de ejecución.

5. **Un archivo G-code puede inyectar HTML y JavaScript en la interfaz.** `gui/app.js:1104` asigna a `innerHTML` el resultado de `formatearSintaxisCodigoG` (`1133`), que no escapa el texto de entrada. Un comentario con una etiqueta HTML y un manejador de eventos llega al DOM. En la aplicación nativa, ese código comparte el contexto que expone `window.puenteCNC`. El historial (`3525`) también interpola datos sin escapar. Usar nodos de texto o escapar el contenido antes de agregar el marcado de coloreado. Hallazgo por inspección; no se ejecutó una carga maliciosa.

## Prioridad alta

6. **El streaming continúa después de un error.** `core/controlador_grbl.py:986` recibe `exito=False`, pero no usa el argumento: libera una entrada y alimenta más líneas. Se reprodujo que `error:20` mantiene la ejecución activa y provoca dos envíos adicionales. Debe detener la alimentación y marcar el trabajo como fallido; no presentar un archivo parcialmente rechazado como completado.

7. **Las confirmaciones de comandos manuales se confunden con las del programa.** El MDI, jog y consultas iniciales envían líneas fuera de `_cola_bytes_en_transito`; todo `ok` pasa por la misma función que elimina la primera entrada del streaming. Un comando ajeno al archivo puede adelantar el progreso y liberar espacio incorrectamente. Centralizar las líneas que generan respuesta en una cola compartida o impedir su mezcla durante streaming.

8. **Reconexión con hilos anteriores todavía activos.** `core/controlador_grbl.py:243` activa una bandera de parada sin esperar a los hilos. `conectar()` vuelve a ponerla en falso y sustituye `self.puerto_serial`; los hilos antiguos pueden continuar sobre el puerto nuevo o poner `esta_conectado=False` al salir. Usar una señal de parada por sesión y esperar el cierre de los hilos antes de reutilizar la conexión. Hallazgo por inspección; la manifestación depende de los tiempos de ejecución.

9. **Simulación y previsualización no representan fielmente el programa.** El bucle virtual (`1088`) trata coordenadas como absolutas, no convierte G20 y convierte G2/G3 en rectas. `gui/visualizer.js:707` reconoce algunos modos con límites de palabra que fallan en bloques compactos como `G91G1X1`; tampoco convierte pulgadas. La trayectoria mostrada puede diferir de la trayectoria física. Compartir una interpretación modal consistente y rechazar explícitamente lo no soportado.

10. **Dimensiones, distancias y tiempos incorrectos en el analizador.** `core/procesador_gcode.py:203` pierde palabras G repetidas porque las almacena en un diccionario; no conserva el modo rápido entre líneas, no convierte pulgadas y mide arcos como cuerdas. Reproducciones: `G91 G1 X1 F60\nX1` resulta en 1 mm en vez de 2; `G20\nG1 X1 F60` resulta en 1 mm; `G0 X10\nX20` contabiliza solo 10 mm rápidos; un semicírculo de radio 10 se mide como 20 mm y pierde su extensión en Y. Además, `G1 Xabc F100` se declara válido. Corregir análisis de tokens, validación completa y geometría.

## Prioridad media

11. **Una línea larga bloquea indefinidamente el envío.** `core/controlador_grbl.py:968` nunca consume ni rechaza una línea mayor que el buffer. Un comentario de 131 caracteres al inicio deja el trabajo activo sin enviar nada. Además cuenta caracteres, aunque el envío usa UTF-8 y puede ocupar más bytes. Limpiar comentarios, contar bytes codificados y reportar líneas que excedan los límites.

12. **Coordenadas de trabajo desfasadas cuando cambia WCO.** `core/controlador_grbl.py:363` calcula WPos al procesar MPos antes de actualizar WCO. Con `<Idle|MPos:10,20,30|WCO:1,2,3>` se obtuvo `[10,20,30]` en vez de `[9,18,27]`. Recalcular después de procesar todos los campos del reporte; limpiar también los pines cuando no se reporten.

13. **El historial de disco se lee como si fuera síncrono.** `gui/app.js:3481` llama `cargarHistorialDisco()` y pasa el resultado directamente a `JSON.parse`. El cliente local `gui/qwebchannel.js:344` devuelve una Promise cuando no se da callback; el error de parseo queda oculto en un `catch` vacío. Esperar la Promise o usar callback antes de actualizar la lista.

14. **El cierre llama un método inexistente y omite desconectar en ese bloque.** `core/puente_interfaz.py:86` llama `detener_programa()`, que no está definido. La excepción se silencia y se omite el siguiente `desconectar()` del mismo bloque. `main.py` sí intenta desconectar después, pero no realiza por ello una parada explícita del trabajo físico. Corregir el método invocado y garantizar el cierre incluso si falla una operación.

## Resultado de validación

- Sintaxis Python: correcta en los módulos propios.
- `node --check`: correcto en `gui/app.js`, `gui/visualizer.js` y `gui/qwebchannel.js`.
- Reproducciones en memoria: confirman los casos descritos de lápiz, M6, corte sin motor, continuación tras error, línea larga, WCO y analizador.
- Los hallazgos sobre finalización, inyección HTML, mezcla de confirmaciones, reconexión, historial y cierre se fundamentan en el flujo del código; requieren además pruebas de integración al corregirse.

Orden sugerido: finalización física y M6; filtrado y bloqueo de comandos; inyección HTML; tratamiento de errores y confirmaciones; ciclo de conexión; parser y simulación; persistencia y cierre.
