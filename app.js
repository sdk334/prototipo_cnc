/**
 * CNC Basic v1.0 - Controlador de Lógica y Telemetría (app.js)
 * Proyecto: Trabajo Terminal 2026-B072 (ESCOM - IPN)
 * 
 * Responsabilidad:
 * - Integración con el Puente Nativo PyQt6 (QWebChannel) para hardware real con GRBL v1.1.
 * - Sincronización en tiempo real de coordenadas de trabajo y máquina (DRO).
 * - Control de Jog manual mediante directiva $J= de GRBL v1.1.
 * - Streaming de programas G-Code con control de flujo por conteo de caracteres.
 * - Despacho de comandos en tiempo real (E-STOP, Feed Hold, Cycle Start).
 * - Modo fallback didáctico automático si se ejecuta en navegador web estándar.
 */

// Fallback global de consola para evitar ReferenceError bajo cualquier circunstancia
window.imprimirEnConsola = function(claseCss, mensaje) {
  const el = document.getElementById('console-output');
  if (el) {
    const renglon = document.createElement('div');
    renglon.className = `console-line ${claseCss}`;
    renglon.textContent = mensaje;
    el.appendChild(renglon);
    el.scrollTop = el.scrollHeight;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // Inicialización del motor gráfico en el lienzo principal
  window.visualizadorCNC = new VisualizadorCNC('cnc-canvas');
  window.cncVisualizer = window.visualizadorCNC;

  // Referencia global al puente Python IPC
  window.puenteCNC = null;

  // ==========================================
  // ESTADO GLOBAL DE LA MÁQUINA CNC
  // ==========================================
  const estado = {
    // Incremento de paso para jogging manual (0.1 mm por defecto, coincide con botón activo en UI)
    incrementoPaso: 0.1,
    // Coordenadas relativas de trabajo (WCS - G54)
    coordenadasTrabajo: { x: 0.000, y: 0.000, z: 0.000 },
    // Coordenadas absolutas de la máquina (MCS)
    coordenadasMaquina: { x: 0.000, y: 0.000, z: 0.000 },
    // Estado operativo de GRBL ('IDLE', 'RUN', 'HOLD', 'ALARM', 'JOG', 'DESCONECTADO')
    estadoOperativo: 'DESCONECTADO',
    limitesHabilitados: false,
    // Velocidad de avance y estimación de tiempo
    porcentajeVelocidadManual: 100, // Override en porcentaje (100% nominal)
    segundosEstimadosBase: 37, // Duración base estimada a 100%
    velocidadAvanceNominal: 800, // mm/min base
    indiceLineaActiva: 0,
    lineasPrograma: [
      { texto: "G21 ; Unidades metricas en milimetros" },
      { texto: "G90 ; Posicionamiento absoluto" },
      { texto: "G94 ; Avance en mm/min" },
      { texto: "G0 Z5.0" },
      { texto: "M3 S12000 ; Spindle ON" },
      { texto: "G0 X110.0 Y140.0" },
      { texto: "G1 Z-1.0 F300" },
      { texto: "G1 X210.0 F800" },
      { texto: "G1 Y220.0" },
      { texto: "G1 X110.0" },
      { texto: "G1 Y140.0" },
      { texto: "G0 Z5.0" },
      { texto: "M5 ; Spindle OFF" }
    ],
    temporizadorEjecucion: null
  };

  // ==========================================
  // REFERENCIAS DE ELEMENTOS DE LA INTERFAZ
  // ==========================================
  const elementos = {
    // Selector y estado de puertos seriales
    selectorPuertoCom: document.getElementById('select-com-port'),
    botonRefrescarPuertos: document.getElementById('btn-refresh-ports'),
    puntoIndicadorPuerto: document.getElementById('port-status-dot'),
    // Pantalla DRO (Lectura Digital de Coordenadas)
    droValorX: document.getElementById('dro-val-x'),
    droValorY: document.getElementById('dro-val-y'),
    droValorZ: document.getElementById('dro-val-z'),
    droMaquinaX: document.getElementById('dro-mach-x'),
    droMaquinaY: document.getElementById('dro-mach-y'),
    droMaquinaZ: document.getElementById('dro-mach-z'),
    // Botones de puesta a cero
    botonCeroX: document.getElementById('btn-zero-x'),
    botonCeroY: document.getElementById('btn-zero-y'),
    botonCeroZ: document.getElementById('btn-zero-z'),
    botonCeroXY: document.getElementById('btn-zero-xy'),
    botonCeroSoloZ: document.getElementById('btn-zero-z-action'),
    botonCeroTodos: document.getElementById('btn-zero-all'),
    // Control manual (Jogging D-Pad)
    botonJogYMas: document.getElementById('btn-jog-y-plus'),
    botonJogYMenos: document.getElementById('btn-jog-y-minus'),
    botonJogXMas: document.getElementById('btn-jog-x-plus'),
    botonJogXMenos: document.getElementById('btn-jog-x-minus'),
    botonJogZMas: document.getElementById('btn-jog-z-plus'),
    botonJogZMenos: document.getElementById('btn-jog-z-minus'),
    botonesPaso: document.querySelectorAll('.step-btn'),
    deslizadorVelocidadJog: document.getElementById('slider-jog-speed'),
    etiquetaVelocidadJog: document.getElementById('lbl-jog-vel'),
    // Control del husillo
    botonAlternarHusillo: document.getElementById('btn-spindle-toggle'),
    iconoVentiladorHusillo: document.getElementById('spindle-fan-icon'),
    textoBotonHusillo: document.getElementById('lbl-spindle-btn-text'),
    entradaRpmHusillo: document.getElementById('input-spindle-rpm'),
    etiquetaRpmEnVivo: document.getElementById('lbl-spindle-speed-live'),
    deslizadorModificadorHusillo: document.getElementById('slider-spindle-override'),
    metricaEstadoHusillo: document.getElementById('metric-spindle-state'),
    // Barra de estado y paro de emergencia
    botonParoEmergencia: document.getElementById('btn-estop'),
    etiquetaEstadoControlador: document.getElementById('lbl-machine-state'),
    puntoIndicadorEstado: document.getElementById('state-status-dot'),
    botonDesbloqueoRapido: document.getElementById('btn-quick-unlock'),
    indicadorLimites: document.getElementById('pill-limits-state'),
    puntoIndicadorLimites: document.getElementById('limits-status-dot'),
    etiquetaEstadoLimites: document.getElementById('lbl-limits-state'),
    // Controles de cámara del visor
    botonVistaXY: document.getElementById('btn-view-xy'),
    botonVistaXZ: document.getElementById('btn-view-xz'),
    botonVista3D: document.getElementById('btn-view-3d'),
    botonZoomMas: document.getElementById('btn-zoom-in'),
    botonZoomMenos: document.getElementById('btn-zoom-out'),
    botonReiniciarZoom: document.getElementById('btn-zoom-reset'),
    // Visor de instrucciones y consola
    visorGcodeViewport: document.getElementById('gcode-list-viewport'),
    contenedorLineasGcode: document.getElementById('gcode-lines-container'),
    etiquetaLineasGcode: document.getElementById('lbl-gcode-count'),
    botonLimpiarConsolaRapido: document.getElementById('btn-quick-clean-console'),
    pestañaBotonGcode: document.getElementById('tab-btn-gcode'),
    pestañaBotonConsola: document.getElementById('tab-btn-console'),
    panelGcode: document.getElementById('pane-gcode'),
    panelConsola: document.getElementById('pane-console'),
    // Entrada manual MDI y terminal
    entradaMdi: document.getElementById('mdi-input-cmd'),
    botonEnviarMdi: document.getElementById('btn-mdi-send'),
    salidaConsola: document.getElementById('console-output'),
    entradaConsola: document.getElementById('console-cmd-input'),
    botonEnviarConsola: document.getElementById('btn-console-send'),
    // Panel de métricas y control de avance
    metricaNumeroLinea: document.getElementById('metric-line'),
    metricaVelocidadAvance: document.getElementById('metric-feed'),
    metricaTiempoTranscurrido: document.getElementById('metric-time'),
    metricaPorcentajeAvance: document.getElementById('metric-feed-pct'),
    metricaOverride: document.getElementById('metric-override'),
    barraProgresoRelleno: document.getElementById('progress-bar-fill'),
    etiquetaPorcentajeProgreso: document.getElementById('lbl-progress-percent'),
    botonIniciarMecanizado: document.getElementById('btn-execution-action'),
    botonPausarMecanizado: document.getElementById('btn-execution-pause'),
    botonDetenerMecanizado: document.getElementById('btn-execution-stop'),
    telemetriaBuffer: document.getElementById('tele-buffer'),
    telemetriaTiempoTranscurrido: document.getElementById('tele-elapsed'),
    // Ventanas modales
    botonAbrirConfiguracion: document.getElementById('btn-open-config'),
    modalConfiguracion: document.getElementById('modal-config-backdrop'),
    botonCerrarConfiguracion: document.getElementById('btn-close-config-modal'),
    botonCancelarConfiguracion: document.getElementById('btn-cancel-config'),
    botonGuardarConfiguracion: document.getElementById('btn-save-config'),
    botonesPestañasConfiguracion: document.querySelectorAll('.cfg-tab-btn'),
    panelesConfiguracion: document.querySelectorAll('.cfg-panel'),
    modalDiccionario: document.getElementById('modal-dict-backdrop'),
    botonCerrarDiccionario: document.getElementById('btn-close-dict-modal'),
    campoBusquedaDiccionario: document.getElementById('dict-search'),
    cuerpoTablaDiccionario: document.getElementById('dict-table-body'),
    selectorArchivoGcode: document.getElementById('file-input-gcode'),
    botonCargarDemo: document.getElementById('btn-menu-load-sample'),
    botonAbrirArchivoMenu: document.getElementById('btn-menu-open-file'),
    botonMenuDiccionario: document.getElementById('btn-menu-gcode-dict'),
    botonMenuAcercaDe: document.getElementById('btn-menu-about'),
    botonMenuHoming: document.getElementById('btn-menu-homing'),
    botonMenuDesbloquear: document.getElementById('btn-menu-unlock'),
    botonMenuReiniciarGrbl: document.getElementById('btn-menu-reset-grbl')
  };

  // ==========================================
  // INICIALIZACIÓN DEL PUENTE PYQT6 (QWebChannel)
  // ==========================================
  function inicializarPuentePyQt() {
    if (typeof QWebChannel !== 'undefined' && window.qt && window.qt.webChannelTransport) {
      new QWebChannel(window.qt.webChannelTransport, (canal) => {
        window.puenteCNC = canal.objects.puenteCNC;
        imprimirEnConsola('c-system', '[IPC] Puente nativo Python PyQt6 vinculado exitosamente.');

        // Suscribirse a señales de telemetría y eventos de Python
        configurarSuscripcionesPuente(window.puenteCNC);

        // Solicitar escaneo inmediato de puertos serie reales
        window.puenteCNC.escanearPuertos();
      });
    } else {
      imprimirEnConsola('c-info', '[MODO NAVEGADOR] Ejecutando en modo didáctico offline.');
      establecerEstadoOperativo('IDLE');
    }
  }

  function configurarSuscripcionesPuente(puente) {
    // 1. Recepción de puertos seriales disponibles (solo actualiza DOM si hubo cambios reales)
    puente.senial_puertos.connect((jsonPuertos) => {
      try {
        const listaPuertos = JSON.parse(jsonPuertos);
        const valorPrevio = elementos.selectorPuertoCom.value;

        // Comprobar si la lista es idéntica a la que ya tiene el selector para no parpadear
        const puertosActualesStr = Array.from(elementos.selectorPuertoCom.options).map(o => o.value).join(',');
        const nuevosPuertosStr = listaPuertos.map(p => p.puerto).join(',');

        if (puertosActualesStr === nuevosPuertosStr && elementos.selectorPuertoCom.options.length > 0) {
          return; // No mutar el DOM si la lista no cambió
        }

        elementos.selectorPuertoCom.innerHTML = '';
        let puertoSeleccionado = null;

        listaPuertos.forEach((p) => {
          const opcion = document.createElement('option');
          opcion.value = p.puerto;
          opcion.textContent = p.etiqueta || `${p.puerto} - ${p.descripcion}`;

          // Si el puerto previamente seleccionado sigue conectado, conservarlo
          if (p.puerto === valorPrevio) {
            opcion.selected = true;
            puertoSeleccionado = p.puerto;
          }
          elementos.selectorPuertoCom.appendChild(opcion);
        });

        // Si no se conservó el puerto previo, priorizar el dispositivo USB CNC real o conectar el simulador
        if (!puertoSeleccionado && listaPuertos.length > 0) {
          const dispositivoCnc = listaPuertos.find(p => p.tipo === 'USB_CNC');
          if (dispositivoCnc) {
            elementos.selectorPuertoCom.value = dispositivoCnc.puerto;
          } else {
            elementos.selectorPuertoCom.value = listaPuertos[0].puerto;
          }
          conectarPuertoSeleccionado();
        }
      } catch (e) {
        console.error('Error al parsear lista de puertos:', e);
      }
    });

    // 2. Recepción de telemetría en tiempo real desde el ciclo de 200 ms de Python (con diffing DOM)
    puente.senial_estado.connect((jsonEstado) => {
      try {
        const d = JSON.parse(jsonEstado);

        // Actualizar coordenadas de trabajo (WPos) y de máquina (MPos) con sanitización
        if (d.wpos && Array.isArray(d.wpos)) {
          const wx = Number(d.wpos[0]);
          const wy = Number(d.wpos[1]);
          const wz = Number(d.wpos[2]);
          if (!isNaN(wx)) estado.coordenadasTrabajo.x = wx;
          if (!isNaN(wy)) estado.coordenadasTrabajo.y = wy;
          if (!isNaN(wz)) estado.coordenadasTrabajo.z = wz;
        }

        if (d.mpos && Array.isArray(d.mpos)) {
          const mx = Number(d.mpos[0]);
          const my = Number(d.mpos[1]);
          const mz = Number(d.mpos[2]);
          if (!isNaN(mx)) estado.coordenadasMaquina.x = mx;
          if (!isNaN(my)) estado.coordenadasMaquina.y = my;
          if (!isNaN(mz)) estado.coordenadasMaquina.z = mz;
        }

        actualizarLecturasDRO();
        establecerEstadoOperativo(d.estado);

        // Telemetría de avance y husillo (solo actualizar texto si cambió)
        const txtFeed = `${Math.round(d.feed_real)} mm/min`;
        if (elementos.metricaVelocidadAvance.textContent !== txtFeed) {
          elementos.metricaVelocidadAvance.textContent = txtFeed;
        }

        const txtRpm = `${Math.round(d.spindle_real)} RPM`;
        if (elementos.etiquetaRpmEnVivo.textContent !== txtRpm) {
          elementos.etiquetaRpmEnVivo.textContent = txtRpm;
        }

        if (estado.husilloActivo !== d.spindle_encendido) {
          estado.husilloActivo = d.spindle_encendido;
          if (estado.husilloActivo) {
            elementos.botonAlternarHusillo.classList.add('active');
            elementos.textoBotonHusillo.textContent = 'Spindle ON';
            elementos.metricaEstadoHusillo.textContent = 'ON';
            elementos.metricaEstadoHusillo.classList.add('highlight-cyan');
          } else {
            elementos.botonAlternarHusillo.classList.remove('active');
            elementos.textoBotonHusillo.textContent = 'Spindle OFF';
            elementos.metricaEstadoHusillo.textContent = 'OFF';
            elementos.metricaEstadoHusillo.classList.remove('highlight-cyan');
          }
        }

        // Búfer del planificador
        const txtBuffer = `${d.buffer_planificador} / ${d.buffer_rx_libre}`;
        if (elementos.telemetriaBuffer.textContent !== txtBuffer) {
          elementos.telemetriaBuffer.textContent = txtBuffer;
        }

        // Pines de fin de carrera y sondas activas
        const txtLimites = d.pines_limite ? `Límites: [${d.pines_limite}]` : 'Límites: OFF';
        if (elementos.etiquetaEstadoLimites.textContent !== txtLimites) {
          elementos.etiquetaEstadoLimites.textContent = txtLimites;
          elementos.puntoIndicadorLimites.className = d.pines_limite ? 'indicator-dot dot-connected' : 'indicator-dot dot-off';
        }
      } catch (e) {
        console.error('Error al procesar estado de telemetría:', e);
      }
    });

    // 3. Salida de consola serial desde Python
    puente.senial_consola.connect((tipo, mensaje) => {
      imprimirEnConsola(tipo, mensaje);
    });

    // 4. Progreso de transmisión de G-Code en hardware real
    puente.senial_progreso.connect((lineaActual, totalLineas, porcentaje, tiempo) => {
      estado.indiceLineaActiva = Math.max(0, lineaActual - 1);
      elementos.metricaNumeroLinea.textContent = `${lineaActual} / ${totalLineas}`;
      elementos.barraProgresoRelleno.style.width = `${porcentaje}%`;
      elementos.etiquetaPorcentajeProgreso.textContent = `${porcentaje}%`;
      elementos.metricaTiempoTranscurrido.textContent = tiempo;
      elementos.telemetriaTiempoTranscurrido.textContent = tiempo;

      resaltarLineaGcodeActiva();

      if (lineaActual >= totalLineas) {
        estado.enEjecucion = false;
        estado.enPausa = false;
        elementos.botonIniciarMecanizado.classList.remove('hidden');
        elementos.botonPausarMecanizado.classList.add('hidden');
        elementos.botonDetenerMecanizado.classList.add('hidden');
      }
    });

    // 5. Análisis geométrico y estimación analítica de tiempo
    puente.senial_analisis_gcode.connect((jsonAnalisis) => {
      try {
        const r = JSON.parse(jsonAnalisis);
        if (r.tiempo_estimado_segundos) {
          estado.segundosEstimadosBase = r.tiempo_estimado_segundos;
        }
        document.getElementById('tele-vertices').textContent = r.total_lineas;
        if (r.segmentos && r.segmentos.length > 0 && window.visualizadorCNC) {
          window.visualizadorCNC.establecerSegmentosTrayectoria(r.segmentos, r.envolvente);
        }
        actualizarTiempoEstimado();
        imprimirEnConsola('c-info', `[ANÁLISIS] Tiempo base (100%): ${r.tiempo_estimado_formato} | Distancia corte: ${r.distancia_corte_mm} mm`);
      } catch (e) {
        console.error('Error al procesar análisis de G-code:', e);
      }
    });

    // 6. Traductor didáctico de errores semánticos de ESCOM
    puente.senial_error_didactico.connect((jsonError) => {
      try {
        const err = JSON.parse(jsonError);
        imprimirEnConsola('c-alarm', `[ERROR #${err.codigo}] ${err.titulo}: ${err.explicacion}`);
        imprimirEnConsola('c-info', `[SUGERENCIA] ${err.sugerencia}`);
      } catch (e) {
        console.error('Error al procesar error didáctico:', e);
      }
    });
  }

  function conectarPuertoSeleccionado() {
    const puerto = elementos.selectorPuertoCom.value;
    if (!puerto) return;

    if (window.puenteCNC) {
      window.puenteCNC.conectar(puerto, 115200);
      elementos.puntoIndicadorPuerto.className = 'indicator-dot dot-connected';
    }
  }

  elementos.selectorPuertoCom.addEventListener('change', conectarPuertoSeleccionado);

  // Escaneo manual al hacer clic en el botón de refrescar
  if (elementos.botonRefrescarPuertos) {
    elementos.botonRefrescarPuertos.addEventListener('click', () => {
      const icono = elementos.botonRefrescarPuertos.querySelector('i');
      if (icono) icono.classList.add('fa-spin');
      setTimeout(() => {
        if (icono) icono.classList.remove('fa-spin');
      }, 700);

      if (window.puenteCNC) {
        window.puenteCNC.escanearPuertos();
        imprimirEnConsola('c-info', '[PUERTOS] Actualizando lista de puertos seriales...');
      }
    });
  }

  // ==========================================
  // SINCRONIZACIÓN DE COORDENADAS Y PANTALLA DRO (Diffing sin repintados)
  // ==========================================
  function actualizarLecturasDRO() {
    const wx = Number(estado.coordenadasTrabajo.x);
    const wy = Number(estado.coordenadasTrabajo.y);
    const wz = Number(estado.coordenadasTrabajo.z);
    const xVal = isNaN(wx) ? 0.0 : wx;
    const yVal = isNaN(wy) ? 0.0 : wy;
    const zVal = isNaN(wz) ? 0.0 : wz;
    estado.coordenadasTrabajo.x = xVal;
    estado.coordenadasTrabajo.y = yVal;
    estado.coordenadasTrabajo.z = zVal;

    const mx = Number(estado.coordenadasMaquina.x);
    const my = Number(estado.coordenadasMaquina.y);
    const mz = Number(estado.coordenadasMaquina.z);
    const mxVal = isNaN(mx) ? xVal : mx;
    const myVal = isNaN(my) ? yVal : my;
    const mzVal = isNaN(mz) ? zVal : mz;
    estado.coordenadasMaquina.x = mxVal;
    estado.coordenadasMaquina.y = myVal;
    estado.coordenadasMaquina.z = mzVal;

    const xStr = xVal.toFixed(3);
    const yStr = yVal.toFixed(3);
    const zStr = zVal.toFixed(3);

    if (elementos.droValorX && elementos.droValorX.textContent !== xStr) elementos.droValorX.textContent = xStr;
    if (elementos.droValorY && elementos.droValorY.textContent !== yStr) elementos.droValorY.textContent = yStr;
    if (elementos.droValorZ && elementos.droValorZ.textContent !== zStr) elementos.droValorZ.textContent = zStr;

    const mxStr = mxVal.toFixed(3);
    const myStr = myVal.toFixed(3);
    const mzStr = mzVal.toFixed(3);

    if (elementos.droMaquinaX && elementos.droMaquinaX.textContent !== mxStr) elementos.droMaquinaX.textContent = mxStr;
    if (elementos.droMaquinaY && elementos.droMaquinaY.textContent !== myStr) elementos.droMaquinaY.textContent = myStr;
    if (elementos.droMaquinaZ && elementos.droMaquinaZ.textContent !== mzStr) elementos.droMaquinaZ.textContent = mzStr;

    if (window.visualizadorCNC) {
      window.visualizadorCNC.establecerPosicionHerramienta(xVal, yVal, zVal);
    }
  }

  // Actualiza visualmente el estado del controlador (IDLE, RUN, ALARM, HOLD) solo si cambia
  function establecerEstadoOperativo(nuevoEstado) {
    if (estado.estadoOperativo === nuevoEstado) return;
    estado.estadoOperativo = nuevoEstado;
    elementos.etiquetaEstadoControlador.textContent = nuevoEstado;

    elementos.puntoIndicadorEstado.className = 'indicator-dot';
    if (nuevoEstado === 'ALARM') {
      elementos.puntoIndicadorEstado.classList.add('dot-alarm');
      elementos.botonParoEmergencia.classList.add('alarm-active');
      if (elementos.botonDesbloqueoRapido) elementos.botonDesbloqueoRapido.classList.remove('hidden');
    } else {
      if (elementos.botonDesbloqueoRapido) elementos.botonDesbloqueoRapido.classList.add('hidden');
      if (nuevoEstado === 'IDLE') {
        elementos.puntoIndicadorEstado.classList.add('dot-idle');
        elementos.botonParoEmergencia.classList.remove('alarm-active');
      } else if (nuevoEstado === 'RUN' || nuevoEstado === 'JOG') {
        elementos.puntoIndicadorEstado.classList.add('dot-run');
        elementos.botonParoEmergencia.classList.remove('alarm-active');
      } else if (nuevoEstado === 'HOLD') {
        elementos.puntoIndicadorEstado.classList.add('dot-connected');
      } else {
        elementos.puntoIndicadorEstado.classList.add('dot-off');
      }
    }
  }

  // ==========================================
  // DESPLAZAMIENTO MANUAL DE EJES (JOGGING)
  // ==========================================
  function moverEjeManual(eje, sentido) {
    if (estado.estadoOperativo === 'ALARM') {
      imprimirEnConsola('c-error', '[ALARMA] Movimiento bloqueado por paro de emergencia (E-STOP). Use $X para rearmar.');
      return;
    }

    const paso = Number(estado.incrementoPaso) || 0.1;
    const desplazamiento = paso * sentido;
    const avanceCalculado = Math.round(estado.velocidadAvanceNominal * (estado.porcentajeVelocidadManual / 100));

    if (window.puenteCNC) {
      // Inyección real del comando $J= al microcontrolador
      window.puenteCNC.moverJog(eje, desplazamiento, avanceCalculado);
    } else {
      // Modo offline didáctico
      if (eje === 'X') estado.coordenadasTrabajo.x = (Number(estado.coordenadasTrabajo.x) || 0) + desplazamiento;
      else if (eje === 'Y') estado.coordenadasTrabajo.y = (Number(estado.coordenadasTrabajo.y) || 0) + desplazamiento;
      else if (eje === 'Z') estado.coordenadasTrabajo.z = (Number(estado.coordenadasTrabajo.z) || 0) + desplazamiento;
      estado.coordenadasMaquina = { ...estado.coordenadasTrabajo };
      actualizarLecturasDRO();
      const signo = desplazamiento > 0 ? '+' : '';
      imprimirEnConsola('c-ok', `> $J=G91 G21 ${eje}${signo}${desplazamiento.toFixed(3)} F${avanceCalculado}`);
    }
  }

  // Eventos de botones del D-Pad
  elementos.botonJogYMas.addEventListener('click', () => moverEjeManual('Y', 1));
  elementos.botonJogYMenos.addEventListener('click', () => moverEjeManual('Y', -1));
  elementos.botonJogXMas.addEventListener('click', () => moverEjeManual('X', 1));
  elementos.botonJogXMenos.addEventListener('click', () => moverEjeManual('X', -1));
  elementos.botonJogZMas.addEventListener('click', () => moverEjeManual('Z', 1));
  elementos.botonJogZMenos.addEventListener('click', () => moverEjeManual('Z', -1));

  // Selección de magnitud del incremento de paso
  elementos.botonesPaso.forEach(boton => {
    boton.addEventListener('click', () => {
      elementos.botonesPaso.forEach(b => b.classList.remove('active'));
      boton.classList.add('active');
      estado.incrementoPaso = parseFloat(boton.dataset.step);
    });
  });

  elementos.deslizadorVelocidadJog.addEventListener('input', (evento) => {
    estado.porcentajeVelocidadManual = parseInt(evento.target.value, 10) || 100;
    elementos.etiquetaVelocidadJog.textContent = `${estado.porcentajeVelocidadManual}%`;
    actualizarTiempoEstimado();
  });

  // Valida si la máquina está en condiciones de aceptar comandos de puesta a cero
  function validarMaquinaListaParaCero() {
    if (estado.estadoOperativo === 'ALARM') {
      imprimirEnConsola('c-alarm', '[BLOQUEO] No se puede fijar el cero: la máquina está en estado de ALARMA (GRBL Error #9).');
      imprimirEnConsola('c-info', '[ACCIÓN] Presione el botón naranja "DESBLOQUEAR ($X)" en la barra superior o en el menú "Máquina > Desbloquear ($X)".');
      if (elementos.botonDesbloqueoRapido) {
        elementos.botonDesbloqueoRapido.classList.remove('hidden');
        elementos.botonDesbloqueoRapido.focus();
      }
      return false;
    }
    return true;
  }

  // Funciones de puesta a cero de coordenadas de trabajo
  elementos.botonCeroX.addEventListener('click', () => {
    if (!validarMaquinaListaParaCero()) return;
    if (window.puenteCNC) window.puenteCNC.ponerCeroEje('X');
    else { estado.coordenadasTrabajo.x = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 X0'); }
  });
  elementos.botonCeroY.addEventListener('click', () => {
    if (!validarMaquinaListaParaCero()) return;
    if (window.puenteCNC) window.puenteCNC.ponerCeroEje('Y');
    else { estado.coordenadasTrabajo.y = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 Y0'); }
  });
  elementos.botonCeroZ.addEventListener('click', () => {
    if (!validarMaquinaListaParaCero()) return;
    if (window.puenteCNC) window.puenteCNC.ponerCeroEje('Z');
    else { estado.coordenadasTrabajo.z = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 Z0'); }
  });
  elementos.botonCeroXY.addEventListener('click', () => {
    if (!validarMaquinaListaParaCero()) return;
    if (window.puenteCNC) window.puenteCNC.ponerCeroPlanoXY();
    else { estado.coordenadasTrabajo.x = 0; estado.coordenadasTrabajo.y = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 X0 Y0'); }
  });
  elementos.botonCeroSoloZ.addEventListener('click', () => {
    if (!validarMaquinaListaParaCero()) return;
    if (window.puenteCNC) window.puenteCNC.ponerCeroEje('Z');
    else { estado.coordenadasTrabajo.z = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 Z0'); }
  });
  elementos.botonCeroTodos.addEventListener('click', () => {
    if (!validarMaquinaListaParaCero()) return;
    if (window.puenteCNC) window.puenteCNC.ponerCeroTodos();
    else { estado.coordenadasTrabajo.x = 0; estado.coordenadasTrabajo.y = 0; estado.coordenadasTrabajo.z = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 X0 Y0 Z0'); }
  });

  // Botón de desbloqueo rápido de alarma ($X)
  if (elementos.botonDesbloqueoRapido) {
    elementos.botonDesbloqueoRapido.addEventListener('click', () => {
      if (window.puenteCNC) {
        window.puenteCNC.desbloquearAlarma();
      } else {
        procesarComandoMdi('$X');
        establecerEstadoOperativo('IDLE');
      }
      imprimirEnConsola('c-info', '[DESBLOQUEO] Comando $X de desbloqueo enviado.');
    });
  }

  // ==========================================
  // CONTROL DEL HUSILLO DE FRESADO
  // ==========================================
  function alternarHusillo() {
    const nuevoEstado = !estado.husilloActivo;
    if (window.puenteCNC) {
      window.puenteCNC.controlarSpindle(nuevoEstado, estado.revolucionesPorMinuto);
    } else {
      estado.husilloActivo = nuevoEstado;
      if (estado.husilloActivo) {
        elementos.botonAlternarHusillo.classList.add('active');
        elementos.textoBotonHusillo.textContent = 'Spindle ON';
        elementos.metricaEstadoHusillo.textContent = 'ON';
        elementos.metricaEstadoHusillo.classList.add('highlight-cyan');
        imprimirEnConsola('c-grbl', `> M3 S${estado.revolucionesPorMinuto}`);
      } else {
        elementos.botonAlternarHusillo.classList.remove('active');
        elementos.textoBotonHusillo.textContent = 'Spindle OFF';
        elementos.metricaEstadoHusillo.textContent = 'OFF';
        elementos.metricaEstadoHusillo.classList.remove('highlight-cyan');
        imprimirEnConsola('c-grbl', '> M5');
      }
    }
  }

  elementos.botonAlternarHusillo.addEventListener('click', alternarHusillo);

  elementos.entradaRpmHusillo.addEventListener('change', (evento) => {
    estado.revolucionesPorMinuto = parseInt(evento.target.value, 10) || 0;
    elementos.etiquetaRpmEnVivo.textContent = `${estado.revolucionesPorMinuto} RPM`;
    if (estado.husilloActivo && window.puenteCNC) {
      window.puenteCNC.controlarSpindle(true, estado.revolucionesPorMinuto);
    }
  });

  elementos.deslizadorModificadorHusillo.addEventListener('input', (evento) => {
    estado.modificadorHusillo = parseInt(evento.target.value, 10);
    const rpmAjustadas = Math.round(estado.revolucionesPorMinuto * (estado.modificadorHusillo / 100));
    elementos.etiquetaRpmEnVivo.textContent = `${rpmAjustadas} RPM`;
  });

  // ==========================================
  // PARADA DE EMERGENCIA Y SENSORES DE LÍMITE
  // ==========================================
  elementos.botonParoEmergencia.addEventListener('click', () => {
    if (window.puenteCNC) {
      if (estado.estadoOperativo === 'ALARM') {
        window.puenteCNC.desbloquearAlarma();
        imprimirEnConsola('c-info', '[DESBLOQUEO] Enviando comando $X para desbloquear alarma...');
      } else {
        window.puenteCNC.paradaEmergencia();
      }
    } else {
      if (estado.estadoOperativo === 'ALARM') {
        establecerEstadoOperativo('IDLE');
        imprimirEnConsola('c-info', '[DESBLOQUEO] Alarma restablecida.');
      } else {
        establecerEstadoOperativo('ALARM');
        detenerMecanizado();
        imprimirEnConsola('c-error', '[EMERGENCIA] ¡PARADA E-STOP ACTIVADA!');
      }
    }
  });

  elementos.indicadorLimites.addEventListener('click', () => {
    estado.limitesHabilitados = !estado.limitesHabilitados;
    const cmd = estado.limitesHabilitados ? '$21=1' : '$21=0';
    if (window.puenteCNC) window.puenteCNC.enviarMDI(cmd);
    else imprimirEnConsola('c-info', `[CONFIG] Sensores de límite fin de carrera (${cmd}).`);
  });

  // ==========================================
  // VISOR DE LÍNEAS DE CÓDIGO G (VIRTUALIZADO DE ALTO RENDIMIENTO)
  // ==========================================
  const ALTURA_LINEA_GCODE = 22;

  function renderizarListaCodigoG() {
    const total = estado.lineasPrograma.length;
    if (elementos.etiquetaLineasGcode) {
      elementos.etiquetaLineasGcode.textContent = `${total} líneas`;
    }
    elementos.contenedorLineasGcode.style.height = (total * ALTURA_LINEA_GCODE) + 'px';
    elementos.contenedorLineasGcode.style.position = 'relative';

    renderizarVentanaVisibleGcode();
  }

  function renderizarVentanaVisibleGcode() {
    const total = estado.lineasPrograma.length;
    if (total === 0) {
      elementos.contenedorLineasGcode.innerHTML = '';
      return;
    }

    const viewport = elementos.visorGcodeViewport || document.getElementById('gcode-list-viewport');
    const scrollTop = viewport ? viewport.scrollTop : 0;
    const altoVisible = viewport ? viewport.clientHeight : 250;

    const buffer = 15;
    const lineasVisibles = Math.ceil(altoVisible / ALTURA_LINEA_GCODE) || 12;
    const inicio = Math.max(0, Math.floor(scrollTop / ALTURA_LINEA_GCODE) - buffer);
    const fin = Math.min(total, inicio + lineasVisibles + (buffer * 2));

    const fragmento = document.createDocumentFragment();

    for (let i = inicio; i < fin; i++) {
      const elemento = estado.lineasPrograma[i];
      const elementoLista = document.createElement('li');
      elementoLista.className = 'gcode-line' + (i === estado.indiceLineaActiva ? ' active' : '');
      elementoLista.dataset.index = i;
      elementoLista.style.position = 'absolute';
      elementoLista.style.top = (i * ALTURA_LINEA_GCODE) + 'px';
      elementoLista.style.left = '0';
      elementoLista.style.right = '0';
      elementoLista.style.height = ALTURA_LINEA_GCODE + 'px';

      const columnaNumero = document.createElement('span');
      columnaNumero.className = 'line-num';
      columnaNumero.textContent = (i + 1).toString();

      const columnaTexto = document.createElement('span');
      columnaTexto.className = 'line-text';
      columnaTexto.innerHTML = formatearSintaxisCodigoG(elemento.texto);

      elementoLista.appendChild(columnaNumero);
      elementoLista.appendChild(columnaTexto);
      fragmento.appendChild(elementoLista);
    }

    elementos.contenedorLineasGcode.innerHTML = '';
    elementos.contenedorLineasGcode.appendChild(fragmento);
  }

  // Delegación de eventos para selección interactiva de líneas sin duplicar listeners
  elementos.contenedorLineasGcode.addEventListener('click', (evento) => {
    const lineaEl = evento.target.closest('.gcode-line');
    if (lineaEl && lineaEl.dataset.index !== undefined) {
      seleccionarLineaGcode(parseInt(lineaEl.dataset.index, 10));
    }
  });

  if (elementos.visorGcodeViewport) {
    elementos.visorGcodeViewport.addEventListener('scroll', () => {
      renderizarVentanaVisibleGcode();
    }, { passive: true });
  }

  window.addEventListener('resize', () => {
    renderizarVentanaVisibleGcode();
  });

  function formatearSintaxisCodigoG(textoOriginal) {
    let salida = textoOriginal;
    if (salida.includes(';')) {
      const partes = salida.split(';');
      salida = colorearComandos(partes[0]) + `<span class="cmd-comment">;${partes.slice(1).join(';')}</span>`;
    } else {
      salida = colorearComandos(salida);
    }
    return salida;
  }

  function colorearComandos(cadena) {
    return cadena
      .replace(/(G[0-9]+(?:\.[0-9]+)?)/gi, '<span class="cmd-g">$1</span>')
      .replace(/(M[0-9]+)/gi, '<span class="cmd-m">$1</span>')
      .replace(/([XYZFS][0-9.-]+)/gi, '<b>$1</b>');
  }

  function seleccionarLineaGcode(indice) {
    if (indice < 0 || indice >= estado.lineasPrograma.length) return;
    estado.indiceLineaActiva = indice;
    resaltarLineaGcodeActiva();
    actualizarMetricasTelemetria();

    // Mover herramienta a la posición de la línea seleccionada para previsualización y simulación didáctica
    const linea = estado.lineasPrograma[indice];
    if (linea) {
      const mX = linea.texto.match(/X([-+]?\d*\.?\d+)/i);
      const mY = linea.texto.match(/Y([-+]?\d*\.?\d+)/i);
      const mZ = linea.texto.match(/Z([-+]?\d*\.?\d+)/i);
      let cambio = false;
      if (mX) {
        const valX = parseFloat(mX[1]);
        if (!isNaN(valX)) { estado.coordenadasTrabajo.x = valX; cambio = true; }
      }
      if (mY) {
        const valY = parseFloat(mY[1]);
        if (!isNaN(valY)) { estado.coordenadasTrabajo.y = valY; cambio = true; }
      }
      if (mZ) {
        const valZ = parseFloat(mZ[1]);
        if (!isNaN(valZ)) { estado.coordenadasTrabajo.z = valZ; cambio = true; }
      }
      if (cambio) {
        estado.coordenadasMaquina = { ...estado.coordenadasTrabajo };
        actualizarLecturasDRO();
      }
    }
  }

  function resaltarLineaGcodeActiva() {
    const idx = estado.indiceLineaActiva;
    const viewport = elementos.visorGcodeViewport || document.getElementById('gcode-list-viewport');
    if (viewport) {
      const posTop = idx * ALTURA_LINEA_GCODE;
      const viewTop = viewport.scrollTop;
      const viewBottom = viewTop + viewport.clientHeight;

      if (posTop < viewTop + 20 || posTop > viewBottom - 40) {
        viewport.scrollTop = Math.max(0, posTop - (viewport.clientHeight / 2));
      }
    }

    const elementoPrevio = elementos.contenedorLineasGcode.querySelector('.gcode-line.active');
    if (elementoPrevio) {
      if (parseInt(elementoPrevio.dataset.index, 10) === idx) return;
      elementoPrevio.classList.remove('active');
    }

    const elementoNuevo = elementos.contenedorLineasGcode.querySelector(`.gcode-line[data-index="${idx}"]`);
    if (elementoNuevo) {
      elementoNuevo.classList.add('active');
    } else {
      renderizarVentanaVisibleGcode();
    }
  }

  // ==========================================
  // CONSOLA SERIAL Y TERMINAL MDI
  // ==========================================
  function imprimirEnConsola(claseCss, mensaje) {
    const renglon = document.createElement('div');
    renglon.className = `console-line ${claseCss}`;
    renglon.textContent = mensaje;
    if (elementos.salidaConsola) {
      elementos.salidaConsola.appendChild(renglon);
      while (elementos.salidaConsola.children.length > 200) {
        elementos.salidaConsola.removeChild(elementos.salidaConsola.firstChild);
      }
      elementos.salidaConsola.scrollTop = elementos.salidaConsola.scrollHeight;
    }
  }
  window.imprimirEnConsola = imprimirEnConsola;

  function procesarComandoMdi(comandoSinFormato) {
    const comando = comandoSinFormato.trim();
    if (!comando) return;

    if (window.puenteCNC) {
      window.puenteCNC.enviarMDI(comando);
    } else {
      imprimirEnConsola('c-ok', `> ${comando}`);
      if (comando.toUpperCase() === '$$') {
        imprimirEnConsola('c-grbl', '$100=250.000 (x:step/mm)\n$101=250.000 (y:step/mm)\n$102=400.000 (z:step/mm)');
      } else if (comando.toUpperCase() === '$X') {
        establecerEstadoOperativo('IDLE');
        imprimirEnConsola('c-ok', '[MSG:Caution: Unlocked]');
      }
      imprimirEnConsola('c-ok', 'ok');
    }
  }

  elementos.botonEnviarMdi.addEventListener('click', () => {
    procesarComandoMdi(elementos.entradaMdi.value);
  });

  elementos.entradaMdi.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') procesarComandoMdi(elementos.entradaMdi.value);
  });

  elementos.botonEnviarConsola.addEventListener('click', () => {
    procesarComandoMdi(elementos.entradaConsola.value);
    elementos.entradaConsola.value = '';
  });

  elementos.entradaConsola.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      procesarComandoMdi(elementos.entradaConsola.value);
      elementos.entradaConsola.value = '';
    }
  });

  if (elementos.botonLimpiarConsolaRapido && elementos.salidaConsola) {
    elementos.botonLimpiarConsolaRapido.addEventListener('click', () => {
      elementos.salidaConsola.innerHTML = '';
      imprimirEnConsola('c-info', '[CONSOLA] Bitácora serial limpiada.');
    });
  }

  if (elementos.pestañaBotonGcode && elementos.pestañaBotonConsola) {
    elementos.pestañaBotonGcode.addEventListener('click', () => {
      elementos.pestañaBotonGcode.classList.add('active');
      elementos.pestañaBotonConsola.classList.remove('active');
      if (elementos.panelGcode) elementos.panelGcode.classList.add('active');
      if (elementos.panelConsola) elementos.panelConsola.classList.remove('active');
    });

    elementos.pestañaBotonConsola.addEventListener('click', () => {
      elementos.pestañaBotonConsola.classList.add('active');
      elementos.pestañaBotonGcode.classList.remove('active');
      if (elementos.panelConsola) elementos.panelConsola.classList.add('active');
      if (elementos.panelGcode) elementos.panelGcode.classList.remove('active');
    });
  }

  // ==========================================
  // EJECUCIÓN Y STREAMING DE MECANIZADO
  // ==========================================
  // Estima la duración física base del programa en segundos a 100% de avance
  function estimarSegundosBaseDesdeLineas(lineas) {
    let x = 0, y = 0, z = 0;
    let distCorte = 0, distRapido = 0;
    let velF = 800;

    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      const texto = (typeof l === 'string' ? l : (l.texto || '')).replace(/\(.*?\)/g, '').split(';')[0].trim().toUpperCase();
      if (!texto) continue;

      const mF = texto.match(/F(\d+(?:\.\d+)?)/);
      if (mF) velF = Math.max(1, parseFloat(mF[1]));

      const mX = texto.match(/X([-+]?\d*\.?\d+)/);
      const mY = texto.match(/Y([-+]?\d*\.?\d+)/);
      const mZ = texto.match(/Z([-+]?\d*\.?\d+)/);

      if (mX || mY || mZ) {
        const nx = mX ? parseFloat(mX[1]) : x;
        const ny = mY ? parseFloat(mY[1]) : y;
        const nz = mZ ? parseFloat(mZ[1]) : z;
        const d = Math.hypot(nx - x, ny - y, nz - z);

        const esRapido = /\bG00?\b/.test(texto) || (!texto.includes('G') && mZ && nz > z);
        if (esRapido) distRapido += d;
        else distCorte += d;

        x = nx; y = ny; z = nz;
      }
    }

    const segs = (distCorte / (velF / 60)) + (distRapido / (2500 / 60));
    return Math.max(1, Math.round(segs));
  }

  // Recalcula dinámicamente el tiempo estimado en función del porcentaje de velocidad / override actual
  function actualizarTiempoEstimado() {
    const porcentaje = Math.max(5, estado.porcentajeVelocidadManual || 100);
    const factor = porcentaje / 100;
    const segundosBase = estado.segundosEstimadosBase || 37;

    // Si la velocidad sube (ej. 200%), el tiempo se reduce a la mitad. Si baja (ej. 50%), el tiempo se duplica.
    const segundosAjustados = Math.max(1, Math.round(segundosBase / factor));

    const hrs = Math.floor(segundosAjustados / 3600);
    const min = Math.floor((segundosAjustados % 3600) / 60);
    const seg = segundosAjustados % 60;

    const formato = hrs > 0
      ? `${hrs.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`
      : `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;

    // Actualizar indicador de tiempo total en el visor
    const elemTeleTotal = document.getElementById('tele-total');
    if (elemTeleTotal) elemTeleTotal.textContent = formato;

    // Actualizar métricas del panel de ejecución
    if (elementos.metricaOverride) {
      elementos.metricaOverride.textContent = `${porcentaje}%`;
    }
    if (elementos.metricaPorcentajeAvance) {
      elementos.metricaPorcentajeAvance.textContent = `${porcentaje}%`;
    }

    const feedEfectivo = Math.round(estado.velocidadAvanceNominal * factor);
    if (elementos.metricaVelocidadAvance) {
      elementos.metricaVelocidadAvance.textContent = `${feedEfectivo} mm/min`;
    }

    // Notificar al puente nativo Python (en modo virtual y en hardware real)
    if (window.puenteCNC && window.puenteCNC.establecerFeedOverride) {
      window.puenteCNC.establecerFeedOverride(porcentaje);
    }
  }

  function actualizarMetricasTelemetria() {
    const totalLineas = estado.lineasPrograma.length;
    const lineaActual = Number.isFinite(estado.indiceLineaActiva) ? (estado.indiceLineaActiva + 1) : (totalLineas > 0 ? 1 : 0);
    if (elementos.metricaNumeroLinea) {
      elementos.metricaNumeroLinea.textContent = totalLineas > 0 ? `${lineaActual} / ${totalLineas}` : '0 / 0';
    }
    if (elementos.telemetriaBuffer) {
      elementos.telemetriaBuffer.textContent = totalLineas > 0 ? `${lineaActual} / ${totalLineas}` : '0 / 0';
    }

    const porcentajeAvance = totalLineas > 0 ? Math.min(100, Math.round((lineaActual / totalLineas) * 100)) : 0;
    if (elementos.barraProgresoRelleno) {
      elementos.barraProgresoRelleno.style.width = `${porcentajeAvance}%`;
    }
    if (elementos.etiquetaPorcentajeProgreso) {
      elementos.etiquetaPorcentajeProgreso.textContent = `${porcentajeAvance}%`;
    }
  }

  function iniciarMecanizado() {
    if (estado.estadoOperativo === 'ALARM') {
      alert('La máquina se encuentra en ALARMA. Desbloquee con $X antes de comenzar.');
      return;
    }

    // Comprobación de límites físicos de la máquina CNC ($130, $131, $132)
    if (window.visualizadorCNC && window.visualizadorCNC.estadoLimites && window.visualizadorCNC.estadoLimites.hayDesbordamiento) {
      const confirmacion = confirm(
        '⚠️ ADVERTENCIA DE SEGURIDAD (Soft Limits):\n\n' +
        'El archivo G-code sobrepasa el área física de trabajo de la máquina:\n' +
        window.visualizadorCNC.estadoLimites.mensaje + '\n\n' +
        'Si inicia el trabajo, la máquina activará una Alarma 2 (Soft Limit) o el carro mecánico colisionará con los topes de carrera.\n\n' +
        '¿Desea continuar de todos modos?'
      );
      if (!confirmacion) return;
    }

    estado.enEjecucion = true;
    estado.enPausa = false;
    establecerEstadoOperativo('RUN');

    elementos.botonIniciarMecanizado.classList.add('hidden');
    elementos.botonPausarMecanizado.classList.remove('hidden');
    elementos.botonDetenerMecanizado.classList.remove('hidden');

    const textoCompleto = estado.lineasPrograma.map(l => l.texto).join('\n');

    if (window.puenteCNC) {
      window.puenteCNC.iniciarPrograma(textoCompleto);
    } else {
      // Bucle de simulación offline
      imprimirEnConsola('c-info', '[EJECUCIÓN] Iniciando simulación local...');
      const totalLineas = estado.lineasPrograma.length;
      let segTranscurridos = 0;
      if (estado.temporizadorEjecucion) clearInterval(estado.temporizadorEjecucion);

      estado.temporizadorEjecucion = setInterval(() => {
        if (!estado.enEjecucion || estado.enPausa) return;
        segTranscurridos++;
        const minutos = String(Math.floor(segTranscurridos / 60)).padStart(2, '0');
        const segundos = String(segTranscurridos % 60).padStart(2, '0');
        const tiempoStr = `${minutos}:${segundos}`;
        if (elementos.metricaTiempoTranscurrido) elementos.metricaTiempoTranscurrido.textContent = tiempoStr;
        if (elementos.telemetriaTiempoTranscurrido) elementos.telemetriaTiempoTranscurrido.textContent = tiempoStr;

        if (estado.indiceLineaActiva < totalLineas - 1) {
          const proxIndice = estado.indiceLineaActiva + 1;
          seleccionarLineaGcode(proxIndice);
          const pct = Math.round(((proxIndice + 1) / totalLineas) * 100);
          if (elementos.metricaNumeroLinea) elementos.metricaNumeroLinea.textContent = `${proxIndice + 1} / ${totalLineas}`;
          if (elementos.barraProgresoRelleno) elementos.barraProgresoRelleno.style.width = `${pct}%`;
          if (elementos.etiquetaPorcentajeProgreso) elementos.etiquetaPorcentajeProgreso.textContent = `${pct}%`;
        } else {
          detenerMecanizado();
        }
      }, 400);
    }
  }

  function pausarMecanizado() {
    estado.enPausa = !estado.enPausa;
    if (estado.enPausa) {
      if (window.puenteCNC) window.puenteCNC.pausar();
      elementos.botonPausarMecanizado.innerHTML = '<i class="fa-solid fa-play"></i> CONTINUAR';
      establecerEstadoOperativo('HOLD');
    } else {
      if (window.puenteCNC) window.puenteCNC.reanudar();
      elementos.botonPausarMecanizado.innerHTML = '<i class="fa-solid fa-pause"></i> PAUSA';
      establecerEstadoOperativo('RUN');
    }
  }

  function detenerMecanizado() {
    estado.enEjecucion = false;
    estado.enPausa = false;
    if (estado.temporizadorEjecucion) clearInterval(estado.temporizadorEjecucion);

    if (window.puenteCNC) window.puenteCNC.detener();

    elementos.botonIniciarMecanizado.classList.remove('hidden');
    elementos.botonPausarMecanizado.classList.add('hidden');
    elementos.botonDetenerMecanizado.classList.add('hidden');
    elementos.botonPausarMecanizado.innerHTML = '<i class="fa-solid fa-pause"></i> PAUSA';
    establecerEstadoOperativo('IDLE');
  }

  elementos.botonIniciarMecanizado.addEventListener('click', iniciarMecanizado);
  elementos.botonPausarMecanizado.addEventListener('click', pausarMecanizado);
  elementos.botonDetenerMecanizado.addEventListener('click', detenerMecanizado);

  // ==========================================
  // CONTROLES DE CÁMARA DEL VISOR 2D / 3D
  // ==========================================
  elementos.botonVistaXY.addEventListener('click', () => {
    elementos.botonVistaXY.classList.add('active');
    elementos.botonVistaXZ.classList.remove('active');
    elementos.botonVista3D.classList.remove('active');
    window.visualizadorCNC.cambiarModoVista('XY');
  });

  elementos.botonVistaXZ.addEventListener('click', () => {
    elementos.botonVistaXZ.classList.add('active');
    elementos.botonVistaXY.classList.remove('active');
    elementos.botonVista3D.classList.remove('active');
    window.visualizadorCNC.cambiarModoVista('XZ');
  });

  elementos.botonVista3D.addEventListener('click', () => {
    elementos.botonVista3D.classList.add('active');
    elementos.botonVistaXY.classList.remove('active');
    elementos.botonVistaXZ.classList.remove('active');
    window.visualizadorCNC.cambiarModoVista('3D');
  });

  const botonVistaOrbita = document.getElementById('btn-view-orbit');
  if (botonVistaOrbita) {
    botonVistaOrbita.addEventListener('click', () => {
      window.visualizadorCNC.cambiarModoVista('3D');
    });
  }

  elementos.botonZoomMas.addEventListener('click', () => window.visualizadorCNC.ajustarZoom(1.2));
  elementos.botonZoomMenos.addEventListener('click', () => window.visualizadorCNC.ajustarZoom(0.8));
  elementos.botonReiniciarZoom.addEventListener('click', () => window.visualizadorCNC.reiniciarVista());

  // ==========================================
  // ATAJOS RÁPIDOS DE TECLADO
  // ==========================================
  window.addEventListener('keydown', (evento) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    if (evento.key === 'F11') {
      evento.preventDefault();
      conmutarPantallaCompleta();
      return;
    }
    if (evento.ctrlKey && (evento.key === 'o' || evento.key === 'O')) {
      evento.preventDefault();
      elementos.selectorArchivoGcode.click();
      return;
    }
    if (evento.ctrlKey && (evento.key === 's' || evento.key === 'S')) {
      evento.preventDefault();
      const btnGuardar = document.getElementById('btn-menu-save-gcode');
      if (btnGuardar) btnGuardar.click();
      return;
    }

    if (evento.key === 'ArrowUp') { evento.preventDefault(); moverEjeManual('Y', 1); }
    else if (evento.key === 'ArrowDown') { evento.preventDefault(); moverEjeManual('Y', -1); }
    else if (evento.key === 'ArrowLeft') { evento.preventDefault(); moverEjeManual('X', -1); }
    else if (evento.key === 'ArrowRight') { evento.preventDefault(); moverEjeManual('X', 1); }
    else if (evento.key === 'PageUp') { evento.preventDefault(); moverEjeManual('Z', 1); }
    else if (evento.key === 'PageDown') { evento.preventDefault(); moverEjeManual('Z', -1); }
    else if (evento.key === ' ') { evento.preventDefault(); if (estado.enEjecucion) pausarMecanizado(); }
    else if (evento.key === 'Escape') { elementos.botonParoEmergencia.click(); }
  });

  // ==========================================
  // GESTIÓN DE MODALES Y MENÚS
  // ==========================================
  elementos.botonAbrirConfiguracion.addEventListener('click', () => {
    elementos.modalConfiguracion.classList.remove('hidden');
  });
  elementos.botonCerrarConfiguracion.addEventListener('click', () => {
    elementos.modalConfiguracion.classList.add('hidden');
    if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
  });
  elementos.botonCancelarConfiguracion.addEventListener('click', () => {
    elementos.modalConfiguracion.classList.add('hidden');
    if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
  });
  elementos.botonGuardarConfiguracion.addEventListener('click', () => {
    // 1. Guardar dimensiones físicas útiles de la máquina ($130, $131, $132)
    const travelX = parseFloat(document.getElementById('cfg-travel-x')?.value) || 300.0;
    const travelY = parseFloat(document.getElementById('cfg-travel-y')?.value) || 200.0;
    const travelZ = parseFloat(document.getElementById('cfg-travel-z')?.value) || 60.0;

    localStorage.setItem('cnc_travel_x', travelX);
    localStorage.setItem('cnc_travel_y', travelY);
    localStorage.setItem('cnc_travel_z', travelZ);

    if (window.visualizadorCNC) {
      window.visualizadorCNC.establecerLimitesMaquina(travelX, travelY, travelZ);
    }

    // Si hay conexión con puente o GRBL, enviar parámetros $130, $131, $132
    if (window.puenteCNC) {
      window.puenteCNC.enviarMDI(`$130=${travelX.toFixed(1)}`);
      window.puenteCNC.enviarMDI(`$131=${travelY.toFixed(1)}`);
      window.puenteCNC.enviarMDI(`$132=${travelZ.toFixed(1)}`);
    }

    elementos.modalConfiguracion.classList.add('hidden');
    imprimirEnConsola('c-info', `[CONFIG] Parámetros guardados. Área útil CNC: ${travelX} × ${travelY} × ${travelZ} mm.`);
    if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
  });

  elementos.botonesPestañasConfiguracion.forEach(botonPestaña => {
    botonPestaña.addEventListener('click', () => {
      elementos.botonesPestañasConfiguracion.forEach(b => b.classList.remove('active'));
      elementos.panelesConfiguracion.forEach(p => p.classList.remove('active'));
      botonPestaña.classList.add('active');
      const panelDestino = document.getElementById(botonPestaña.dataset.target);
      if (panelDestino) panelDestino.classList.add('active');
    });
  });

  document.querySelectorAll('.btn-run-macro').forEach(botonMacro => {
    botonMacro.addEventListener('click', (evento) => {
      const comandosMacro = evento.currentTarget.dataset.macro.split(';');
      elementos.modalConfiguracion.classList.add('hidden');
      if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
      comandosMacro.forEach(c => procesarComandoMdi(c));
    });
  });

  elementos.botonMenuDiccionario.addEventListener('click', () => elementos.modalDiccionario.classList.remove('hidden'));
  elementos.botonCerrarDiccionario.addEventListener('click', () => {
    elementos.modalDiccionario.classList.add('hidden');
    if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
  });

  elementos.campoBusquedaDiccionario.addEventListener('input', (evento) => {
    const consulta = evento.target.value.toLowerCase();
    const filas = elementos.cuerpoTablaDiccionario.querySelectorAll('tr');
    filas.forEach(fila => {
      fila.style.display = fila.textContent.toLowerCase().includes(consulta) ? '' : 'none';
    });
  });

  elementos.botonCargarDemo.addEventListener('click', () => {
    estado.indiceLineaActiva = 0;
    renderizarListaCodigoG();
    estado.segundosEstimadosBase = estimarSegundosBaseDesdeLineas(estado.lineasPrograma);
    actualizarMetricasTelemetria();
    actualizarTiempoEstimado();
    const texto = estado.lineasPrograma.map(l => l.texto).join('\n');
    if (window.visualizadorCNC) {
      window.visualizadorCNC.cargarTrayectoriaDesdeGCode(texto);
      window.visualizadorCNC.ajustarVistaAPieza();
    }
    if (window.puenteCNC) window.puenteCNC.analizarGcode(texto);
    imprimirEnConsola('c-info', '[ARCHIVO] Archivo de demostración pieza_01.nc cargado.');
  });

  elementos.botonAbrirArchivoMenu.addEventListener('click', () => elementos.selectorArchivoGcode.click());
  elementos.selectorArchivoGcode.addEventListener('change', (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = (ev) => {
      const contenidoTexto = ev.target.result;
      const lineas = contenidoTexto.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .map(texto => ({ texto }));
      if (lineas.length > 0) {
        estado.lineasPrograma = lineas;
        estado.indiceLineaActiva = 0;
        document.getElementById('lbl-loaded-filename').textContent = archivo.name;
        renderizarListaCodigoG();
        estado.segundosEstimadosBase = estimarSegundosBaseDesdeLineas(lineas);
        actualizarMetricasTelemetria();
        actualizarTiempoEstimado();
        if (window.visualizadorCNC) {
          window.visualizadorCNC.cargarTrayectoriaDesdeGCode(contenidoTexto);
          window.visualizadorCNC.ajustarVistaAPieza();
        }
        const textoCompleto = lineas.map(l => l.texto).join('\n');
        if (window.puenteCNC) window.puenteCNC.analizarGcode(textoCompleto);
        imprimirEnConsola('c-info', `[ARCHIVO] Archivo ${archivo.name} cargado con ${lineas.length} líneas.`);
      }
    };
    lector.readAsText(archivo);
  });

  elementos.botonMenuHoming.addEventListener('click', () => {
    if (window.puenteCNC) window.puenteCNC.ejecutarHoming();
    else procesarComandoMdi('$H');
  });

  elementos.botonMenuDesbloquear.addEventListener('click', () => {
    if (window.puenteCNC) window.puenteCNC.desbloquearAlarma();
    else procesarComandoMdi('$X');
  });

  elementos.botonMenuReiniciarGrbl.addEventListener('click', () => {
    if (window.puenteCNC) window.puenteCNC.paradaEmergencia();
    else {
      detenerMecanizado();
      imprimirEnConsola('c-grbl', '\nGrbl 1.1h [ESCOM Didáctico: Reiniciado]');
      establecerEstadoOperativo('IDLE');
    }
  });

  elementos.botonMenuAcercaDe.addEventListener('click', () => {
    alert('CNC Basic v1.0\nInterfaz de control para máquinas CNC con fines educativos\nTrabajo Terminal 2026-B072 (ESCOM - IPN)\n\nAutores:\n• Josué Martin Echeverría Arteaga\n• Jonathan Uriel Paredes Martínez\n\nDirector:\n• Dr. Gelacio Castillo Cabrera');
  });

  // ==========================================
  // OPCIONES DEL MENÚ SUPERIOR
  // ==========================================

  // --- MENÚ VISTA ---
  const btnMenuViewXy = document.getElementById('btn-menu-view-xy');
  if (btnMenuViewXy) {
    btnMenuViewXy.addEventListener('click', () => {
      if (window.visualizadorCNC) {
        window.visualizadorCNC.cambiarModoVista('XY');
        imprimirEnConsola('c-info', '[VISTA] Cambiado a Vista XY (Planta 2D).');
      }
    });
  }

  const btnMenuViewXz = document.getElementById('btn-menu-view-xz');
  if (btnMenuViewXz) {
    btnMenuViewXz.addEventListener('click', () => {
      if (window.visualizadorCNC) {
        window.visualizadorCNC.cambiarModoVista('XZ');
        imprimirEnConsola('c-info', '[VISTA] Cambiado a Vista XZ (Frontal 2D).');
      }
    });
  }

  const btnMenuView3d = document.getElementById('btn-menu-view-3d');
  if (btnMenuView3d) {
    btnMenuView3d.addEventListener('click', () => {
      if (window.visualizadorCNC) {
        window.visualizadorCNC.cambiarModoVista('3D');
        imprimirEnConsola('c-info', '[VISTA] Cambiado a Vista 3D Isométrica.');
      }
    });
  }

  const btnMenuToggleGrid = document.getElementById('btn-menu-toggle-grid');
  if (btnMenuToggleGrid) {
    btnMenuToggleGrid.addEventListener('click', () => {
      if (window.visualizadorCNC) {
        const visible = window.visualizadorCNC.alternarCuadricula();
        imprimirEnConsola('c-info', `[VISTA] Cuadrícula ${visible ? 'activada' : 'ocultada'}.`);
        btnMenuToggleGrid.innerHTML = visible
          ? '<i class="fa-solid fa-border-all"></i> Alternar Cuadrícula'
          : '<i class="fa-solid fa-border-none"></i> Alternar Cuadrícula';
      }
    });
  }

  function conmutarPantallaCompleta() {
    if (window.puenteCNC && typeof window.puenteCNC.alternarPantallaCompleta === 'function') {
      window.puenteCNC.alternarPantallaCompleta();
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      }
    }
  }

  const btnMenuFullscreen = document.getElementById('btn-menu-fullscreen');
  if (btnMenuFullscreen) {
    btnMenuFullscreen.addEventListener('click', () => {
      conmutarPantallaCompleta();
    });
  }

  // --- MENÚ ARCHIVO ---
  const btnMenuSaveGcode = document.getElementById('btn-menu-save-gcode');
  if (btnMenuSaveGcode) {
    btnMenuSaveGcode.addEventListener('click', () => {
      const contenido = estado.lineasPrograma.map(l => l.texto).join('\n');
      if (!contenido.trim()) {
        imprimirEnConsola('c-alarm', '[ARCHIVO] No hay código G cargado para guardar.');
        return;
      }
      const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(blob);
      const nombre = document.getElementById('lbl-loaded-filename').textContent || 'programa.nc';
      enlace.download = nombre.endsWith('.nc') || nombre.endsWith('.gcode') ? nombre : `${nombre}.nc`;
      enlace.click();
      imprimirEnConsola('c-system', `[ARCHIVO] Programa guardado como ${enlace.download}.`);
    });
  }

  const btnMenuExportLog = document.getElementById('btn-menu-export-log');
  if (btnMenuExportLog) {
    btnMenuExportLog.addEventListener('click', () => {
      const lineasConsola = Array.from(elementos.cuerpoConsola.querySelectorAll('.console-line'))
        .map(linea => linea.textContent)
        .join('\n');
      if (!lineasConsola.trim()) {
        imprimirEnConsola('c-info', '[BITÁCORA] La consola se encuentra vacía.');
        return;
      }
      const blob = new Blob([lineasConsola], { type: 'text/plain;charset=utf-8' });
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(blob);
      enlace.download = `bitacora_cnc_${new Date().toISOString().slice(0, 10)}.txt`;
      enlace.click();
      imprimirEnConsola('c-system', '[BITÁCORA] Bitácora serial exportada exitosamente.');
    });
  }

  // --- MENÚ EDICIÓN ---
  const btnMenuClearGcode = document.getElementById('btn-menu-clear-gcode');
  if (btnMenuClearGcode) {
    btnMenuClearGcode.addEventListener('click', () => {
      estado.lineasPrograma = [];
      estado.indiceLineaActiva = 0;
      document.getElementById('lbl-loaded-filename').textContent = 'Ninguno';
      renderizarListaCodigoG();
      if (window.visualizadorCNC) {
        window.visualizadorCNC.limpiarTrayectoria();
      }
      imprimirEnConsola('c-info', '[EDICIÓN] Programa G-Code limpiado del espacio de trabajo.');
    });
  }

  const btnMenuClearConsole = document.getElementById('btn-menu-clear-console');
  if (btnMenuClearConsole) {
    btnMenuClearConsole.addEventListener('click', () => {
      elementos.cuerpoConsola.innerHTML = '';
      imprimirEnConsola('c-info', '[CONSOLA] Bitácora de consola serial limpiada.');
    });
  }

  // --- MENÚ MÁQUINA ---
  const btnMenuGotoOrigin = document.getElementById('btn-menu-goto-origin');
  if (btnMenuGotoOrigin) {
    btnMenuGotoOrigin.addEventListener('click', () => {
      procesarComandoMdi('G0 X0 Y0 Z0');
    });
  }

  // --- MENÚ HERRAMIENTAS ---
  const btnMenuHeightmap = document.getElementById('btn-menu-heightmap');
  if (btnMenuHeightmap) {
    btnMenuHeightmap.addEventListener('click', () => {
      elementos.modalConfiguracion.classList.remove('hidden');
      const pestana = document.querySelector('.cfg-tab-btn[data-tab="tab-control"]');
      if (pestana) pestana.click();
      imprimirEnConsola('c-info', '[HERRAMIENTAS] Asistente de nivelación y mapa de alturas.');
    });
  }

  const btnMenuCalibration = document.getElementById('btn-menu-calibration');
  if (btnMenuCalibration) {
    btnMenuCalibration.addEventListener('click', () => {
      elementos.modalConfiguracion.classList.remove('hidden');
      const pestana = document.querySelector('.cfg-tab-btn[data-tab="tab-motores"]');
      if (pestana) pestana.click();
      imprimirEnConsola('c-info', '[HERRAMIENTAS] Calibración de pasos por milímetro.');
    });
  }

  const btnMenuMacros = document.getElementById('btn-menu-macros');
  if (btnMenuMacros) {
    btnMenuMacros.addEventListener('click', () => {
      elementos.modalConfiguracion.classList.remove('hidden');
      const pestana = document.querySelector('.cfg-tab-btn[data-tab="tab-macros"]');
      if (pestana) pestana.click();
      imprimirEnConsola('c-info', '[HERRAMIENTAS] Comandos rápidos y macros.');
    });
  }

  // --- MENÚ AYUDA ---
  const btnMenuManual = document.getElementById('btn-menu-manual');
  if (btnMenuManual) {
    btnMenuManual.addEventListener('click', () => {
      elementos.modalDiccionario.classList.remove('hidden');
      imprimirEnConsola('c-info', '[AYUDA] Abriendo guía y diccionario de comandos G-Code.');
    });
  }

  // Cerrar menús desplegables inmediatamente al hacer clic en cualquier opción
  document.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const dropdown = item.closest('.dropdown-menu');
      if (dropdown) {
        dropdown.style.display = 'none';
        setTimeout(() => { dropdown.style.display = ''; }, 200);
      }
    });
  });

  [elementos.modalConfiguracion, elementos.modalDiccionario].forEach(modal => {
    modal.addEventListener('click', (evento) => {
      if (evento.target === modal) {
        modal.classList.add('hidden');
        if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
      }
    });
  });

  // Render inicial de la aplicación y sincronización de trayectoria
  renderizarListaCodigoG();
  actualizarLecturasDRO();
  estado.segundosEstimadosBase = estimarSegundosBaseDesdeLineas(estado.lineasPrograma);
  actualizarMetricasTelemetria();
  actualizarTiempoEstimado();
  if (window.visualizadorCNC) {
    window.visualizadorCNC.cargarTrayectoriaDesdeGCode(estado.lineasPrograma.map(l => l.texto).join('\n'));
  }

  // ==========================================
  // MONITOREO Y CONFIGURACIÓN DE LÍMITES CNC
  // ==========================================
  function configurarMonitoreoLimites() {
    const banner = document.getElementById('banner-limites-maquina');
    const lblDetalle = document.getElementById('lbl-limites-detalle');
    const btnCerrar = document.getElementById('btn-cerrar-alerta-limites');
    const filaLeyendaExceso = document.getElementById('legend-row-exceso');

    if (btnCerrar && banner) {
      btnCerrar.addEventListener('click', () => {
        banner.classList.add('hidden');
      });
    }

    if (window.visualizadorCNC) {
      window.visualizadorCNC.alertaLimitesCallback = (estadoLimites) => {
        if (!banner || !lblDetalle) return;

        if (estadoLimites && estadoLimites.hayDesbordamiento) {
          banner.classList.remove('hidden');
          const lim = window.visualizadorCNC.limitesMaquina;
          const minP = estadoLimites.minPieza;
          const maxP = estadoLimites.maxPieza;
          lblDetalle.textContent = `Pieza: X[${minP.x.toFixed(1)}..${maxP.x.toFixed(1)}] Y[${minP.y.toFixed(1)}..${maxP.y.toFixed(1)}] mm | Máquina: ${lim.maxX} × ${lim.maxY} mm | ${estadoLimites.mensaje}`;
          if (filaLeyendaExceso) filaLeyendaExceso.style.display = 'flex';
          imprimirEnConsola('c-alarm', `[ALERTA DE LÍMITES] ¡El modelo sobrepasa el área física de trabajo de la máquina! ${estadoLimites.mensaje}`);
        } else {
          banner.classList.add('hidden');
          if (filaLeyendaExceso) filaLeyendaExceso.style.display = 'none';
        }
      };

      // Cargar límites almacenados previamente o usar los por defecto ($130=300, $131=200, $132=60)
      const guardadoX = parseFloat(localStorage.getItem('cnc_travel_x')) || 300.0;
      const guardadoY = parseFloat(localStorage.getItem('cnc_travel_y')) || 200.0;
      const guardadoZ = parseFloat(localStorage.getItem('cnc_travel_z')) || 60.0;

      const inputX = document.getElementById('cfg-travel-x');
      const inputY = document.getElementById('cfg-travel-y');
      const inputZ = document.getElementById('cfg-travel-z');
      if (inputX) inputX.value = guardadoX.toFixed(3);
      if (inputY) inputY.value = guardadoY.toFixed(3);
      if (inputZ) inputZ.value = guardadoZ.toFixed(3);

      window.visualizadorCNC.establecerLimitesMaquina(guardadoX, guardadoY, guardadoZ);
    }
  }

  // Monitoreo y sincronización de límites físicos de la máquina
  configurarMonitoreoLimites();

  // ==========================================
  // REDIMENSIONAMIENTO DEL PANEL LATERAL DERECHO
  // ==========================================
  function inicializarRedimensionamientoSidebar() {
    const resizer = document.getElementById('sidebar-resizer');
    const workspace = document.querySelector('.app-workspace');
    const sidebar = document.getElementById('main-sidebar');
    const btnToggle = document.getElementById('btn-toggle-sidebar');
    const iconToggle = document.getElementById('icon-toggle-sidebar');
    if (!resizer || !workspace || !sidebar) return;

    const ANCHO_ORIGINAL = 340; // Ancho original estándar de la interfaz
    const ANCHO_MAX = 340;      // Límite estricto: NO permitir mover el panel más a la izquierda del tamaño original
    const ANCHO_MIN = 220;      // Límite compacto al ajustar hacia la derecha

    // Cargar ancho guardado en almacenamiento local (siempre restringido entre ANCHO_MIN y ANCHO_MAX)
    let anchoActual = parseFloat(localStorage.getItem('cnc_sidebar_width')) || ANCHO_ORIGINAL;
    if (anchoActual < ANCHO_MIN) anchoActual = ANCHO_MIN;
    if (anchoActual > ANCHO_MAX) anchoActual = ANCHO_MAX;

    let colapsado = localStorage.getItem('cnc_sidebar_collapsed') === 'true';

    function aplicarDimensiones(ancho, guardar = true) {
      const anchoRestringido = Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, Math.round(ancho)));
      workspace.style.setProperty('--sidebar-width', `${anchoRestringido}px`);
      if (guardar) localStorage.setItem('cnc_sidebar_width', anchoRestringido);
      if (window.visualizadorCNC) {
        window.visualizadorCNC.redimensionarLienzo();
      }
    }

    function aplicarEstadoColapso(estaColapsado, guardar = true) {
      if (estaColapsado) {
        workspace.classList.add('sidebar-collapsed');
        if (iconToggle) iconToggle.className = 'fa-solid fa-chevron-left';
        if (btnToggle) btnToggle.title = 'Mostrar panel lateral';
      } else {
        workspace.classList.remove('sidebar-collapsed');
        if (iconToggle) iconToggle.className = 'fa-solid fa-chevron-right';
        if (btnToggle) btnToggle.title = 'Ocultar panel lateral';
      }
      if (guardar) localStorage.setItem('cnc_sidebar_collapsed', estaColapsado ? 'true' : 'false');
      if (window.visualizadorCNC) {
        window.visualizadorCNC.redimensionarLienzo();
      }
    }

    // Inicializar estado previo
    aplicarDimensiones(anchoActual, false);
    if (colapsado) aplicarEstadoColapso(true, false);

    // Toggle de colapso rápido mediante el botón en el divisor
    if (btnToggle) {
      btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        colapsado = !workspace.classList.contains('sidebar-collapsed');
        aplicarEstadoColapso(colapsado, true);
      });
    }

    // Arrastre manual: solo permite ajustar hacia la derecha (hacerlo más angosto), nunca más a la izquierda de 340px
    let arrastrando = false;
    let xInicial = 0;
    let anchoInicial = anchoActual;

    resizer.addEventListener('mousedown', (e) => {
      // Ignorar si el clic fue en el botón de toggle
      if (e.target.closest('#btn-toggle-sidebar')) return;

      e.preventDefault();
      // Si estaba colapsado, restaurarlo primero
      if (workspace.classList.contains('sidebar-collapsed')) {
        aplicarEstadoColapso(false, true);
      }

      arrastrando = true;
      resizer.classList.add('is-dragging');
      document.body.classList.add('resizing-col');
      xInicial = e.clientX;
      anchoInicial = sidebar.getBoundingClientRect().width;

      const alMoverMouse = (evento) => {
        if (!arrastrando) return;
        // Al arrastrar a la derecha (evento.clientX > xInicial), delta es negativo -> panel se hace más angosto
        // Al arrastrar a la izquierda (evento.clientX < xInicial), se detiene rígidamente en 340px (ANCHO_MAX)
        const delta = xInicial - evento.clientX;
        let nuevoAncho = anchoInicial + delta;

        if (nuevoAncho < ANCHO_MIN) nuevoAncho = ANCHO_MIN;
        if (nuevoAncho > ANCHO_MAX) nuevoAncho = ANCHO_MAX;

        aplicarDimensiones(nuevoAncho, false);
      };

      const alSoltarMouse = () => {
        if (!arrastrando) return;
        arrastrando = false;
        resizer.classList.remove('is-dragging');
        document.body.classList.remove('resizing-col');
        window.removeEventListener('mousemove', alMoverMouse);
        window.removeEventListener('mouseup', alSoltarMouse);

        const anchoFinal = sidebar.getBoundingClientRect().width;
        aplicarDimensiones(anchoFinal, true);
      };

      window.addEventListener('mousemove', alMoverMouse);
      window.addEventListener('mouseup', alSoltarMouse);
    });

    // Doble clic en la barra para alternar rápidamente entre tamaño compacto (250px) y el estándar original (340px)
    resizer.addEventListener('dblclick', (e) => {
      if (e.target.closest('#btn-toggle-sidebar')) return;
      if (workspace.classList.contains('sidebar-collapsed')) {
        aplicarEstadoColapso(false, true);
        return;
      }
      const anchoActualPx = sidebar.getBoundingClientRect().width;
      const nuevoAncho = (anchoActualPx <= 270) ? ANCHO_ORIGINAL : 250;
      aplicarDimensiones(nuevoAncho, true);
    });
  }

  // Inicializar divisor ajustable del panel lateral
  inicializarRedimensionamientoSidebar();

  // Inicializar puente PyQt6
  inicializarPuentePyQt();
});
