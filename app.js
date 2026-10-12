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
    // Coordenadas relativas de trabajo (WCS - G54)
    coordenadasTrabajo: { x: 0.000, y: 0.000, z: 0.000 },
    // Coordenadas absolutas de la máquina (MCS)
    coordenadasMaquina: { x: 0.000, y: 0.000, z: 0.000 },
    // Estado operativo de GRBL ('IDLE', 'RUN', 'HOLD', 'ALARM', 'JOG', 'DESCONECTADO')
    estadoOperativo: 'DESCONECTADO',
    limitesHabilitados: false,
    incrementoPaso: 0.1, // Distancia por pulsación (mm)
    porcentajeVelocidadManual: 50,
    // Control del husillo (Spindle)
    husilloActivo: false,
    revolucionesPorMinuto: 12000,
    modificadorHusillo: 100, // Override en porcentaje
    // Programa cargado y flujo de ejecución
    indiceLineaActiva: 0,
    enEjecucion: false,
    enPausa: false,
    segundosTranscurridos: 0,
    segundosTotalesEstimados: 525,
    velocidadAvanceNominal: 800, // mm/min
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
    contenedorLineasGcode: document.getElementById('gcode-lines-container'),
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

        // Si no se conservó el puerto previo, priorizar el dispositivo USB CNC real
        if (!puertoSeleccionado && listaPuertos.length > 0) {
          const dispositivoCnc = listaPuertos.find(p => p.tipo === 'USB_CNC');
          if (dispositivoCnc) {
            elementos.selectorPuertoCom.value = dispositivoCnc.puerto;
            conectarPuertoSeleccionado();
          } else {
            elementos.selectorPuertoCom.value = listaPuertos[0].puerto;
          }
        }
      } catch (e) {
        console.error('Error al parsear lista de puertos:', e);
      }
    });

    // 2. Recepción de telemetría en tiempo real desde el ciclo de 200 ms de Python (con diffing DOM)
    puente.senial_estado.connect((jsonEstado) => {
      try {
        const d = JSON.parse(jsonEstado);

        // Actualizar coordenadas de trabajo (WPos) y de máquina (MPos)
        estado.coordenadasTrabajo.x = d.wpos[0];
        estado.coordenadasTrabajo.y = d.wpos[1];
        estado.coordenadasTrabajo.z = d.wpos[2];

        estado.coordenadasMaquina.x = d.mpos[0];
        estado.coordenadasMaquina.y = d.mpos[1];
        estado.coordenadasMaquina.z = d.mpos[2];

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
        document.getElementById('tele-total').textContent = r.tiempo_estimado_formato;
        document.getElementById('tele-vertices').textContent = r.total_lineas;
        imprimirEnConsola('c-info', `[ANÁLISIS] Tiempo estimado: ${r.tiempo_estimado_formato} | Distancia corte: ${r.distancia_corte_mm} mm`);
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
    const xStr = estado.coordenadasTrabajo.x.toFixed(3);
    const yStr = estado.coordenadasTrabajo.y.toFixed(3);
    const zStr = estado.coordenadasTrabajo.z.toFixed(3);

    if (elementos.droValorX.textContent !== xStr) elementos.droValorX.textContent = xStr;
    if (elementos.droValorY.textContent !== yStr) elementos.droValorY.textContent = yStr;
    if (elementos.droValorZ.textContent !== zStr) elementos.droValorZ.textContent = zStr;

    const mxStr = estado.coordenadasMaquina.x.toFixed(3);
    const myStr = estado.coordenadasMaquina.y.toFixed(3);
    const mzStr = estado.coordenadasMaquina.z.toFixed(3);

    if (elementos.droMaquinaX.textContent !== mxStr) elementos.droMaquinaX.textContent = mxStr;
    if (elementos.droMaquinaY.textContent !== myStr) elementos.droMaquinaY.textContent = myStr;
    if (elementos.droMaquinaZ.textContent !== mzStr) elementos.droMaquinaZ.textContent = mzStr;

    if (window.visualizadorCNC) {
      window.visualizadorCNC.establecerPosicionHerramienta(
        estado.coordenadasTrabajo.x,
        estado.coordenadasTrabajo.y,
        estado.coordenadasTrabajo.z
      );
    }
  }

  // Actualiza visualmente el estado del controlador (IDLE, RUN, ALARM, HOLD) solo si cambia
  function establecerEstadoOperativo(nuevoEstado) {
    if (estado.estadoOperativo === nuevoEstado) return;
    estado.estadoOperativo = nuevoEstado;
    elementos.etiquetaEstadoControlador.textContent = nuevoEstado;

    elementos.puntoIndicadorEstado.className = 'indicator-dot';
    if (nuevoEstado === 'IDLE') {
      elementos.puntoIndicadorEstado.classList.add('dot-idle');
      elementos.botonParoEmergencia.classList.remove('alarm-active');
    } else if (nuevoEstado === 'RUN' || nuevoEstado === 'JOG') {
      elementos.puntoIndicadorEstado.classList.add('dot-run');
      elementos.botonParoEmergencia.classList.remove('alarm-active');
    } else if (nuevoEstado === 'HOLD') {
      elementos.puntoIndicadorEstado.classList.add('dot-connected');
    } else if (nuevoEstado === 'ALARM') {
      elementos.puntoIndicadorEstado.classList.add('dot-alarm');
      elementos.botonParoEmergencia.classList.add('alarm-active');
    } else {
      elementos.puntoIndicadorEstado.classList.add('dot-off');
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

    const desplazamiento = estado.incrementoPaso * sentido;
    const avanceCalculado = Math.round(estado.velocidadAvanceNominal * (estado.porcentajeVelocidadManual / 100));

    if (window.puenteCNC) {
      // Inyección real del comando $J= al microcontrolador
      window.puenteCNC.moverJog(eje, desplazamiento, avanceCalculado);
    } else {
      // Modo offline didáctico
      if (eje === 'X') estado.coordenadasTrabajo.x += desplazamiento;
      else if (eje === 'Y') estado.coordenadasTrabajo.y += desplazamiento;
      else if (eje === 'Z') estado.coordenadasTrabajo.z += desplazamiento;
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
    estado.porcentajeVelocidadManual = parseInt(evento.target.value, 10);
    elementos.etiquetaVelocidadJog.textContent = `${estado.porcentajeVelocidadManual}%`;
  });

  // Funciones de puesta a cero de coordenadas de trabajo
  elementos.botonCeroX.addEventListener('click', () => {
    if (window.puenteCNC) window.puenteCNC.ponerCeroEje('X');
    else { estado.coordenadasTrabajo.x = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 X0'); }
  });
  elementos.botonCeroY.addEventListener('click', () => {
    if (window.puenteCNC) window.puenteCNC.ponerCeroEje('Y');
    else { estado.coordenadasTrabajo.y = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 Y0'); }
  });
  elementos.botonCeroZ.addEventListener('click', () => {
    if (window.puenteCNC) window.puenteCNC.ponerCeroEje('Z');
    else { estado.coordenadasTrabajo.z = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 Z0'); }
  });
  elementos.botonCeroXY.addEventListener('click', () => {
    if (window.puenteCNC) { window.puenteCNC.ponerCeroEje('X'); window.puenteCNC.ponerCeroEje('Y'); }
    else { estado.coordenadasTrabajo.x = 0; estado.coordenadasTrabajo.y = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 X0 Y0'); }
  });
  elementos.botonCeroSoloZ.addEventListener('click', () => {
    if (window.puenteCNC) window.puenteCNC.ponerCeroEje('Z');
    else { estado.coordenadasTrabajo.z = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 Z0'); }
  });
  elementos.botonCeroTodos.addEventListener('click', () => {
    if (window.puenteCNC) window.puenteCNC.ponerCeroTodos();
    else { estado.coordenadasTrabajo.x = 0; estado.coordenadasTrabajo.y = 0; estado.coordenadasTrabajo.z = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 X0 Y0 Z0'); }
  });

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
  // VISOR DE LÍNEAS DE CÓDIGO G
  // ==========================================
  function renderizarListaCodigoG() {
    elementos.contenedorLineasGcode.innerHTML = '';
    estado.lineasPrograma.forEach((elemento, indice) => {
      const elementoLista = document.createElement('li');
      elementoLista.className = 'gcode-line';
      if (indice === estado.indiceLineaActiva) {
        elementoLista.classList.add('active');
      }

      const columnaNumero = document.createElement('span');
      columnaNumero.className = 'line-num';
      columnaNumero.textContent = (indice + 1).toString();

      const columnaTexto = document.createElement('span');
      columnaTexto.className = 'line-text';
      columnaTexto.innerHTML = formatearSintaxisCodigoG(elemento.texto);

      elementoLista.appendChild(columnaNumero);
      elementoLista.appendChild(columnaTexto);

      elementoLista.addEventListener('click', () => {
        seleccionarLineaGcode(indice);
      });

      elementos.contenedorLineasGcode.appendChild(elementoLista);
    });

    resaltarLineaGcodeActiva();
  }

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
    estado.indiceLineaActiva = indice;
    resaltarLineaGcodeActiva();
    actualizarMetricasTelemetria();
  }

  function resaltarLineaGcodeActiva() {
    const todasLasLineas = elementos.contenedorLineasGcode.querySelectorAll('.gcode-line');
    todasLasLineas.forEach((elem, i) => {
      if (i === estado.indiceLineaActiva) {
        elem.classList.add('active');
        elem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        elem.classList.remove('active');
      }
    });
  }

  // ==========================================
  // CONSOLA SERIAL Y TERMINAL MDI
  // ==========================================
  function imprimirEnConsola(claseCss, mensaje) {
    const renglon = document.createElement('div');
    renglon.className = `console-line ${claseCss}`;
    renglon.textContent = mensaje;
    elementos.salidaConsola.appendChild(renglon);
    elementos.salidaConsola.scrollTop = elementos.salidaConsola.scrollHeight;
  }

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

  elementos.pestañaBotonGcode.addEventListener('click', () => {
    elementos.pestañaBotonGcode.classList.add('active');
    elementos.pestañaBotonConsola.classList.remove('active');
    elementos.panelGcode.classList.add('active');
    elementos.panelConsola.classList.remove('active');
  });

  elementos.pestañaBotonConsola.addEventListener('click', () => {
    elementos.pestañaBotonConsola.classList.add('active');
    elementos.pestañaBotonGcode.classList.remove('active');
    elementos.panelConsola.classList.add('active');
    elementos.panelGcode.classList.remove('active');
  });

  // ==========================================
  // EJECUCIÓN Y STREAMING DE MECANIZADO
  // ==========================================
  function actualizarMetricasTelemetria() {
    const totalLineas = estado.lineasPrograma.length;
    const lineaActual = estado.indiceLineaActiva + 1;
    elementos.metricaNumeroLinea.textContent = `${lineaActual} / ${totalLineas}`;
    elementos.telemetriaBuffer.textContent = `${lineaActual} / ${totalLineas}`;

    const porcentajeAvance = Math.round((lineaActual / totalLineas) * 100);
    elementos.barraProgresoRelleno.style.width = `${porcentajeAvance}%`;
    elementos.etiquetaPorcentajeProgreso.textContent = `${porcentajeAvance}%`;
  }

  function iniciarMecanizado() {
    if (estado.estadoOperativo === 'ALARM') {
      alert('La máquina se encuentra en ALARMA. Desbloquee con $X antes de comenzar.');
      return;
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
      estado.temporizadorEjecucion = setInterval(() => {
        if (estado.indiceLineaActiva < estado.lineasPrograma.length - 1) {
          seleccionarLineaGcode(estado.indiceLineaActiva + 1);
        } else {
          detenerMecanizado();
        }
      }, 800);
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

  elementos.botonZoomMas.addEventListener('click', () => window.visualizadorCNC.ajustarZoom(1.2));
  elementos.botonZoomMenos.addEventListener('click', () => window.visualizadorCNC.ajustarZoom(0.8));
  elementos.botonReiniciarZoom.addEventListener('click', () => window.visualizadorCNC.reiniciarVista());

  // ==========================================
  // ATAJOS RÁPIDOS DE TECLADO
  // ==========================================
  window.addEventListener('keydown', (evento) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

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
  elementos.botonCerrarConfiguracion.addEventListener('click', () => elementos.modalConfiguracion.classList.add('hidden'));
  elementos.botonCancelarConfiguracion.addEventListener('click', () => elementos.modalConfiguracion.classList.add('hidden'));
  elementos.botonGuardarConfiguracion.addEventListener('click', () => {
    elementos.modalConfiguracion.classList.add('hidden');
    imprimirEnConsola('c-info', '[CONFIG] Parámetros guardados correctamente.');
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
      comandosMacro.forEach(c => procesarComandoMdi(c));
    });
  });

  elementos.botonMenuDiccionario.addEventListener('click', () => elementos.modalDiccionario.classList.remove('hidden'));
  elementos.botonCerrarDiccionario.addEventListener('click', () => elementos.modalDiccionario.classList.add('hidden'));

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
    actualizarMetricasTelemetria();
    const texto = estado.lineasPrograma.map(l => l.texto).join('\n');
    if (window.puenteCNC) window.puenteCNC.analizarGcode(texto);
    imprimirEnConsola('c-info', '[ARCHIVO] Archivo de demostración pieza_01.nc cargado.');
  });

  elementos.botonAbrirArchivoMenu.addEventListener('click', () => elementos.selectorArchivoGcode.click());
  elementos.selectorArchivoGcode.addEventListener('change', (evento) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = (ev) => {
      const lineas = ev.target.result.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .map(texto => ({ texto }));
      if (lineas.length > 0) {
        estado.lineasPrograma = lineas;
        estado.indiceLineaActiva = 0;
        document.getElementById('lbl-loaded-filename').textContent = archivo.name;
        renderizarListaCodigoG();
        actualizarMetricasTelemetria();
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

  [elementos.modalConfiguracion, elementos.modalDiccionario].forEach(modal => {
    modal.addEventListener('click', (evento) => {
      if (evento.target === modal) modal.classList.add('hidden');
    });
  });

  // Render inicial de la aplicación
  renderizarListaCodigoG();
  actualizarLecturasDRO();
  actualizarMetricasTelemetria();

  // Inicializar puente PyQt6
  inicializarPuentePyQt();
});
