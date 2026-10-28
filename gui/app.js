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
 */

// Fallback global de consola para evitar ReferenceError bajo cualquier circunstancia
window.imprimirEnConsola = function (claseCss, mensaje) {
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
    lineasConfirmadas: new Map(),
    lineasSeleccionadas: new Set(),
    ultimoIndiceSeleccionado: null,
    indiceLineaEnEdicion: -1,
    pilaDeshacerGcode: [],
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
    temporizadorEjecucion: null,
    revolucionesPorMinuto: 12000,
    potenciaLaserPct: parseInt(localStorage.getItem('cnc_laser_power_pct'), 10) || 100,
    modificadorHusillo: 100,
    husilloActivo: false,
    // Tipo de herramienta seleccionada ('fresa' | 'lapiz' | 'laser')
    tipoHerramienta: localStorage.getItem('cnc_tipo_herramienta') || 'fresa',
    // RF-10: Trabajo actual en ejecución
    trabajoActual: null,
    // RNF-08: Idioma actual de la interfaz
    idiomaActual: localStorage.getItem('cnc_idioma') || 'es'
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
    // Control del husillo / láser
    bloqueHusillo: document.getElementById('block-spindle'),
    iconoHeaderHusillo: document.getElementById('spindle-header-icon'),
    tituloBloqueHusillo: document.getElementById('lbl-spindle-title'),
    botonAlternarHusillo: document.getElementById('btn-spindle-toggle'),
    iconoVentiladorHusillo: document.getElementById('spindle-fan-icon'),
    textoBotonHusillo: document.getElementById('lbl-spindle-btn-text'),
    badgeValorHusillo: document.getElementById('spindle-value-badge'),
    etiquetaUnidadHusillo: document.getElementById('lbl-spindle-unit'),
    entradaRpmHusillo: document.getElementById('input-spindle-rpm'),
    leyendaVelocidadHusillo: document.getElementById('lbl-spindle-legend'),
    etiquetaRpmEnVivo: document.getElementById('lbl-spindle-speed-live'),
    deslizadorModificadorHusillo: document.getElementById('slider-spindle-override'),
    etiquetaTeleHusillo: document.getElementById('lbl-tele-spindle'),
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
    botonGcodeAddLine: document.getElementById('btn-gcode-add-line'),
    botonGcodeEditLine: document.getElementById('btn-gcode-edit-line'),
    botonGcodeDeleteLines: document.getElementById('btn-gcode-delete-lines'),
    botonGcodeDeleteRange: document.getElementById('btn-gcode-delete-range'),
    botonGcodeFullEditor: document.getElementById('btn-gcode-full-editor'),
    menuContextualGcode: document.getElementById('gcode-context-menu'),
    modalDeleteRange: document.getElementById('modal-delete-range-backdrop'),
    modalGcodeEditor: document.getElementById('modal-gcode-editor-backdrop'),
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
    botonCerrarDiccionarioFooter: document.getElementById('btn-close-dict-footer'),
    campoBusquedaDiccionario: document.getElementById('dict-search'),
    cuerpoTablaDiccionario: document.getElementById('dict-table-body'),
    botonesFiltroDiccionario: document.querySelectorAll('.dict-filter-btn'),
    etiquetaConteoDiccionario: document.getElementById('lbl-dict-total-count'),
    // Modal Guía Rápida de Operación CNC Didáctica
    modalManual: document.getElementById('modal-manual-backdrop'),
    botonCerrarManual: document.getElementById('btn-close-manual-modal'),
    botonCerrarManualFooter: document.getElementById('btn-close-manual-footer'),
    botonesNavManual: document.querySelectorAll('.manual-nav-btn'),
    panelesManual: document.querySelectorAll('.manual-panel'),
    // Modal de Alerta de Seguridad
    modalSeguridad: document.getElementById('modal-seguridad-backdrop'),
    botonCerrarSeguridad: document.getElementById('btn-close-seguridad-modal'),
    botonEntendidoSeguridad: document.getElementById('btn-entendido-seguridad'),
    tituloSeguridad: document.getElementById('lbl-seguridad-titulo'),
    encabezadoSeguridad: document.getElementById('lbl-seguridad-encabezado'),
    descripcionSeguridad: document.getElementById('lbl-seguridad-descripcion'),
    accionSeguridad: document.getElementById('lbl-seguridad-accion'),
    // Modal de Mecanizado Finalizado
    modalFinMecanizado: document.getElementById('modal-fin-mecanizado-backdrop'),
    botonCerrarFin: document.getElementById('btn-close-fin-modal'),
    botonAceptarFin: document.getElementById('btn-aceptar-fin'),
    botonVerHistorialFin: document.getElementById('btn-ver-historial-fin'),
    lblFinTitulo: document.getElementById('lbl-fin-titulo'),
    lblFinSubtitulo: document.getElementById('lbl-fin-subtitulo'),
    lblFinEncabezado: document.getElementById('lbl-fin-encabezado'),
    lblFinDescripcion: document.getElementById('lbl-fin-descripcion'),
    lblFinTiempoReal: document.getElementById('lbl-fin-tiempo-real'),
    lblFinArchivo: document.getElementById('lbl-fin-archivo'),
    lblFinLineas: document.getElementById('lbl-fin-lineas'),
    lblFinHerramienta: document.getElementById('lbl-fin-herramienta'),
    // Pestañas y Selección de Herramienta
    botonTabTrayectoria: document.getElementById('tab-trayectoria'),
    botonTabHerramienta: document.getElementById('tab-herramienta'),
    etiquetaNombreHerramienta: document.getElementById('lbl-nombre-herramienta'),
    modalSeleccionHerramienta: document.getElementById('modal-tool-backdrop'),
    botonCerrarModalHerramienta: document.getElementById('btn-close-tool-modal'),
    botonCancelarModalHerramienta: document.getElementById('btn-cancel-tool'),
    botonAplicarModalHerramienta: document.getElementById('btn-apply-tool'),
    tarjetaToolFresa: document.getElementById('card-tool-fresa'),
    tarjetaToolLapiz: document.getElementById('card-tool-lapiz'),
    tarjetaToolLaser: document.getElementById('card-tool-laser'),
    selectorConfigHerramienta: document.getElementById('cfg-select-tool-type'),
    botonMenuSeleccionarHerramienta: document.getElementById('btn-menu-select-tool'),
    etiquetaBadgeHerramienta: document.getElementById('lbl-badge-tool-title'),
    iconoLegendHerramienta: document.getElementById('legend-icon-tool'),
    textoLegendHerramienta: document.getElementById('legend-text-tool'),
    selectorArchivoGcode: document.getElementById('file-input-gcode'),
    botonCargarDemo: document.getElementById('btn-menu-load-sample'),
    botonAbrirArchivoMenu: document.getElementById('btn-menu-open-file'),
    botonMenuDiccionario: document.getElementById('btn-menu-gcode-dict'),
    botonMenuAcercaDe: document.getElementById('btn-menu-about'),
    botonMenuHoming: document.getElementById('btn-menu-homing'),
    botonMenuDesbloquear: document.getElementById('btn-menu-unlock'),
    botonMenuReiniciarGrbl: document.getElementById('btn-menu-reset-grbl'),
    // Historial (RF-10)
    modalHistorial: document.getElementById('modal-historial-backdrop'),
    botonMenuHistorial: document.getElementById('btn-menu-historial'),
    botonAbrirHistorial: document.getElementById('btn-menu-historial'),
    botonCerrarHistorial: document.getElementById('btn-close-historial-modal'),
    botonCerrarHistorialBottom: document.getElementById('btn-close-historial-bottom'),
    tbodyHistorial: document.getElementById('tbody-historial'),
    kpiHistorialTotal: document.getElementById('kpi-historial-total'),
    kpiHistorialTiempo: document.getElementById('kpi-historial-tiempo'),
    kpiHistorialExito: document.getElementById('kpi-historial-exito'),
    inputBusquedaHistorial: document.getElementById('input-search-historial'),
    botonExportarHistorialJson: document.getElementById('btn-export-historial-json'),
    botonExportarHistorialCsv: document.getElementById('btn-export-historial-csv'),
    botonLimpiarHistorial: document.getElementById('btn-clear-historial'),
    // Tutorial (RNF-06 / C.U-06-05)
    modalTutorial: document.getElementById('modal-tutorial-backdrop'),
    botonMenuTutorial: document.getElementById('btn-menu-tutorial'),
    botonCerrarTutorial: document.getElementById('btn-close-tutorial-modal'),
    botonPrevTutorial: document.getElementById('btn-prev-tutorial'),
    botonNextTutorial: document.getElementById('btn-next-tutorial'),
    chkNoMostrarTutorial: document.getElementById('chk-no-mostrar-tutorial'),
    bannerPrimerUso: document.getElementById('toast-welcome-banner'),
    botonIniciarTutorialToast: document.getElementById('btn-start-tutorial-toast'),
    botonDescartarToast: document.getElementById('btn-dismiss-toast'),
    // Idioma (RNF-08)
    botonToggleIdioma: document.getElementById('btn-lang-toggle'),
    etiquetaIdiomaActual: document.getElementById('lbl-current-lang'),
    selectorIdiomaConfig: document.getElementById('cfg-language-select')
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
        HistorialManager.cargarDisco();

        // Solicitar escaneo inmediato de puertos serie reales
        window.puenteCNC.escanearPuertos();

        // Sincronizar herramienta guardada con el controlador Python
        if (typeof window.puenteCNC.establecerTipoHerramienta === 'function') {
          window.puenteCNC.establecerTipoHerramienta(estado.tipoHerramienta);
        }

        // Sincronizar ajuste de pausa segura M6 con el controlador Python
        if (typeof window.puenteCNC.establecerPausaM6 === 'function') {
          const pauseM6 = localStorage.getItem('cnc_pause_m6') !== 'false';
          window.puenteCNC.establecerPausaM6(pauseM6);
        }
      });
    } else {
      imprimirEnConsola('c-info', '[MODO NAVEGADOR] Ejecutando en modo didáctico offline.');
      establecerEstadoOperativo('IDLE');
    }
  }

  function configurarSuscripcionesPuente(puente) {
    puente.senial_linea_confirmada.connect(registrarLineaConfirmada);
    puente.senial_resultado_programa.connect(resultado => {
      if (estado.enEjecucion) detenerMecanizado(resultado, false);
      establecerEstadoOperativo('ALARM');
    });
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

    // 2. Recepción de telemetría en tiempo real desde Python (coalescida a 60 FPS con RAF)
    let datosEstadoPendiente = null;
    let animFrameEstado = null;

    puente.senial_estado.connect((jsonEstado) => {
      try {
        datosEstadoPendiente = JSON.parse(jsonEstado);

        // La posición espacial se transmite directamente al visualizador para interpolación LERP instantánea
        if (datosEstadoPendiente.wpos && Array.isArray(datosEstadoPendiente.wpos)) {
          const wx = Number(datosEstadoPendiente.wpos[0]);
          const wy = Number(datosEstadoPendiente.wpos[1]);
          const wz = Number(datosEstadoPendiente.wpos[2]);
          if (!isNaN(wx)) estado.coordenadasTrabajo.x = wx;
          if (!isNaN(wy)) estado.coordenadasTrabajo.y = wy;
          if (!isNaN(wz)) estado.coordenadasTrabajo.z = wz;
          if (window.visualizadorCNC) {
            window.visualizadorCNC.establecerPosicionHerramienta(wx, wy, wz);
          }
        }

        if (datosEstadoPendiente.mpos && Array.isArray(datosEstadoPendiente.mpos)) {
          const mx = Number(datosEstadoPendiente.mpos[0]);
          const my = Number(datosEstadoPendiente.mpos[1]);
          const mz = Number(datosEstadoPendiente.mpos[2]);
          if (!isNaN(mx)) estado.coordenadasMaquina.x = mx;
          if (!isNaN(my)) estado.coordenadasMaquina.y = my;
          if (!isNaN(mz)) estado.coordenadasMaquina.z = mz;
        }

        // Actualización de métricas del DOM sincronizada con el refresco del monitor (elimina layout thrashing)
        if (!animFrameEstado) {
          animFrameEstado = setTimeout(() => {
            animFrameEstado = null;
            if (!datosEstadoPendiente) return;
            const d = datosEstadoPendiente;
            if (Number.isFinite(d.override_feed)) mostrarFeedOverride(d.override_feed);
            if (Number.isFinite(d.override_spindle)) {
              estado.modificadorHusillo = d.override_spindle;
              if (elementos.deslizadorModificadorHusillo && document.activeElement !== elementos.deslizadorModificadorHusillo) {
                if (estado.tipoHerramienta === 'laser') {
                  elementos.deslizadorModificadorHusillo.value = Math.min(100, d.override_spindle);
                } else {
                  elementos.deslizadorModificadorHusillo.value = d.override_spindle;
                }
              }
            }

            actualizarLecturasDRO();
            establecerEstadoOperativo(d.estado);

            // Telemetría de avance y husillo (solo actualizar texto si cambió)
            const txtFeed = `${Math.round(d.feed_real)} mm/min`;
            if (elementos.metricaVelocidadAvance.textContent !== txtFeed) {
              elementos.metricaVelocidadAvance.textContent = txtFeed;
            }

            if (estado.tipoHerramienta === 'lapiz') {
              estado.husilloActivo = false;
              if (elementos.etiquetaRpmEnVivo && elementos.etiquetaRpmEnVivo.textContent !== '0 RPM') {
                elementos.etiquetaRpmEnVivo.textContent = '0 RPM';
              }
              if (elementos.metricaEstadoHusillo && elementos.metricaEstadoHusillo.textContent !== 'OFF (LÁPIZ)') {
                elementos.metricaEstadoHusillo.textContent = 'OFF (LÁPIZ)';
                elementos.metricaEstadoHusillo.classList.remove('highlight-cyan');
              }
              if (elementos.textoBotonHusillo && elementos.textoBotonHusillo.textContent !== 'Spindle Inactivo (Lápiz)') {
                elementos.textoBotonHusillo.textContent = 'Spindle Inactivo (Lápiz)';
                elementos.botonAlternarHusillo.classList.remove('active', 'modo-laser');
                elementos.botonAlternarHusillo.classList.add('modo-lapiz');
              }
              if (elementos.iconoVentiladorHusillo) {
                elementos.iconoVentiladorHusillo.classList.remove('fa-spin');
              }
            } else if (estado.tipoHerramienta === 'laser') {
              estado.husilloActivo = d.spindle_encendido;
              if (elementos.botonAlternarHusillo) {
                elementos.botonAlternarHusillo.classList.remove('modo-lapiz');
                elementos.botonAlternarHusillo.classList.add('modo-laser');
              }
              if (estado.husilloActivo) {
                const sReal = Math.round(d.spindle_real);
                const pctReal = sReal > 100 ? Math.min(100, Math.round((sReal / 1000) * 100)) : (sReal > 0 ? sReal : estado.potenciaLaserPct);
                estado.potenciaLaserPct = pctReal;
                if (elementos.entradaRpmHusillo && document.activeElement !== elementos.entradaRpmHusillo) {
                  elementos.entradaRpmHusillo.value = pctReal;
                }
                if (elementos.deslizadorModificadorHusillo && document.activeElement !== elementos.deslizadorModificadorHusillo) {
                  elementos.deslizadorModificadorHusillo.value = pctReal;
                }
                if (elementos.botonAlternarHusillo) elementos.botonAlternarHusillo.classList.add('active');
                if (elementos.textoBotonHusillo) elementos.textoBotonHusillo.textContent = 'Diodo Láser ON';
                if (elementos.metricaEstadoHusillo) {
                  elementos.metricaEstadoHusillo.textContent = `${pctReal}% LUZ`;
                  elementos.metricaEstadoHusillo.classList.add('highlight-cyan');
                }
                if (elementos.etiquetaRpmEnVivo) {
                  elementos.etiquetaRpmEnVivo.textContent = `${pctReal}% Luz (S${sReal})`;
                }
              } else {
                if (elementos.botonAlternarHusillo) elementos.botonAlternarHusillo.classList.remove('active');
                if (elementos.textoBotonHusillo) elementos.textoBotonHusillo.textContent = 'Diodo Láser OFF';
                if (elementos.metricaEstadoHusillo) {
                  elementos.metricaEstadoHusillo.textContent = 'OFF';
                  elementos.metricaEstadoHusillo.classList.remove('highlight-cyan');
                }
                if (elementos.etiquetaRpmEnVivo) {
                  elementos.etiquetaRpmEnVivo.textContent = '0% Luz (S0)';
                }
              }
            } else {
              const txtRpm = `${Math.round(d.spindle_real)} RPM`;
              if (elementos.etiquetaRpmEnVivo.textContent !== txtRpm) {
                elementos.etiquetaRpmEnVivo.textContent = txtRpm;
              }
              elementos.botonAlternarHusillo.classList.remove('modo-lapiz', 'modo-laser');
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
            }
            actualizarEstadoGiroVisualizador();

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
          }, 50);
        }
      } catch (e) {
        console.error('Error al procesar estado de telemetría:', e);
      }
    });

    // 3. Salida de consola serial desde Python
    puente.senial_consola.connect((tipo, mensaje) => {
      imprimirEnConsola(tipo, mensaje);
    });

    // 4. Progreso de transmisión de G-Code en hardware real (sincronizado a 60 FPS)
    let datosProgresoPendiente = null;
    let animFrameProgreso = null;

    puente.senial_progreso.connect((lineaActual, totalLineas, porcentaje, tiempo) => {
      datosProgresoPendiente = { lineaActual, totalLineas, porcentaje, tiempo };
      estado.indiceLineaActiva = Math.max(0, lineaActual - 1);

      if (!animFrameProgreso) {
        animFrameProgreso = setTimeout(() => {
          animFrameProgreso = null;
          if (!datosProgresoPendiente) return;
          const { lineaActual: act, totalLineas: tot, porcentaje: pct, tiempo: t } = datosProgresoPendiente;

          elementos.metricaNumeroLinea.textContent = `${act} / ${tot}`;
          elementos.barraProgresoRelleno.style.width = `${pct}%`;
          elementos.etiquetaPorcentajeProgreso.textContent = formatearPorcentajeProgreso(pct);
          elementos.metricaTiempoTranscurrido.textContent = t;
          elementos.telemetriaTiempoTranscurrido.textContent = t;

          if (window.visualizadorCNC) {
            window.visualizadorCNC.establecerProgresoEjecucion(act, tot);
          }

          resaltarLineaGcodeActiva();

          if (pct === 100 && act >= tot) {
            detenerMecanizado('Completado');
          }
        }, 50);
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
        if (r.segmentos && window.visualizadorCNC) {
          window.visualizadorCNC.errorGcode = r.es_valido ? null : JSON.stringify(r.errores);
          window.visualizadorCNC.establecerSegmentosTrayectoria(r.es_valido ? r.segmentos : [], r.envolvente);
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

    // 7. Alertas de seguridad e interbloqueos de la máquina
    if (puente.senial_alerta_seguridad) {
      puente.senial_alerta_seguridad.connect((titulo, encabezado, descripcion) => {
        const esM6 = (titulo && (titulo.includes('M6') || titulo.includes('HERRAMIENTA'))) ||
          (descripcion && (descripcion.includes('M6') || descripcion.includes('herramienta')));

        if (esM6) {
          estado.enEjecucion = true;
          estado.enPausa = true;
          establecerEstadoOperativo('HOLD');
          if (elementos.botonIniciarMecanizado) elementos.botonIniciarMecanizado.classList.add('hidden');
          if (elementos.botonPausarMecanizado) {
            elementos.botonPausarMecanizado.classList.remove('hidden');
            elementos.botonPausarMecanizado.disabled = false;
            elementos.botonPausarMecanizado.innerHTML = '<i class="fa-solid fa-play"></i> CONTINUAR';
          }
          if (elementos.botonDetenerMecanizado) elementos.botonDetenerMecanizado.classList.remove('hidden');

          const accionM6 = '<b>Acción requerida:</b> Monte la herramienta indicada en la pinza y presione el botón <b>CONTINUAR</b> en el panel de control para seguir con el mecanizado.';
          mostrarAlertaSeguridadHusillo(titulo, encabezado, descripcion, accionM6);
        } else {
          mostrarAlertaSeguridadHusillo(titulo, encabezado, descripcion);
        }
      });
    }

    // 8. Sincronización nativa de pantalla completa
    if (puente.senial_pantalla_completa) {
      puente.senial_pantalla_completa.connect((esFs) => {
        actualizarEstadoPantallaCompleta(esFs);
      });
    }
  }

  function conectarPuertoSeleccionado() {
    const puerto = elementos.selectorPuertoCom.value;
    if (!puerto) return;
    estado.puertoComSeleccionado = puerto;

    const esVirtual = (puerto === 'SIMULADOR_VIRTUAL' || !window.puenteCNC);
    if (elementos.deslizadorVelocidadJog) {
      const maxVal = esVirtual ? 2000 : 200;
      elementos.deslizadorVelocidadJog.max = maxVal;
      elementos.deslizadorVelocidadJog.title = esVirtual
        ? 'Velocidad de Simulación y Override (10% a 2000%)'
        : 'Modificador de velocidad y tiempo estimado (10% a 200%)';
    }

    const baud = parseInt(localStorage.getItem('cnc_baudrate'), 10) || 115200;
    if (window.puenteCNC) {
      window.puenteCNC.conectar(puerto, baud);
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

    const unidades = localStorage.getItem('cnc_units') || 'mm';
    const factorUnidad = (unidades === 'inch') ? (1.0 / 25.4) : 1.0;
    const numDec = parseInt(localStorage.getItem('cnc_dro_decimals'), 10) || 3;

    const xStr = (xVal * factorUnidad).toFixed(numDec);
    const yStr = (yVal * factorUnidad).toFixed(numDec);
    const zStr = (zVal * factorUnidad).toFixed(numDec);

    if (elementos.droValorX && elementos.droValorX.textContent !== xStr) elementos.droValorX.textContent = xStr;
    if (elementos.droValorY && elementos.droValorY.textContent !== yStr) elementos.droValorY.textContent = yStr;
    if (elementos.droValorZ && elementos.droValorZ.textContent !== zStr) elementos.droValorZ.textContent = zStr;

    const mxStr = (mxVal * factorUnidad).toFixed(numDec);
    const myStr = (myVal * factorUnidad).toFixed(numDec);
    const mzStr = (mzVal * factorUnidad).toFixed(numDec);

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
        if (estado.enEjecucion && estado.enPausa) {
          estado.enPausa = false;
          if (elementos.botonPausarMecanizado) {
            elementos.botonPausarMecanizado.innerHTML = '<i class="fa-solid fa-pause"></i> PAUSA';
          }
        }
      } else if (nuevoEstado === 'HOLD') {
        elementos.puntoIndicadorEstado.classList.add('dot-connected');
        if (estado.enEjecucion) {
          estado.enPausa = true;
          if (elementos.botonIniciarMecanizado) elementos.botonIniciarMecanizado.classList.add('hidden');
          if (elementos.botonPausarMecanizado) {
            elementos.botonPausarMecanizado.classList.remove('hidden');
            elementos.botonPausarMecanizado.disabled = false;
            elementos.botonPausarMecanizado.innerHTML = '<i class="fa-solid fa-play"></i> CONTINUAR';
          }
          if (elementos.botonDetenerMecanizado) elementos.botonDetenerMecanizado.classList.remove('hidden');
        }
      } else {
        elementos.puntoIndicadorEstado.classList.add('dot-off');
      }
    }
    actualizarEstadoGiroVisualizador();
  }

  // Sincronización de giro de herramienta / emisión láser entre estado CNC, UI y visualizador gráfico
  function actualizarEstadoGiroVisualizador() {
    const esLapiz = (estado.tipoHerramienta === 'lapiz');
    const esLaser = (estado.tipoHerramienta === 'laser');
    const debeGirar = !esLapiz && (
      (estado.enEjecucion && !estado.enPausa && estado.husilloActivo) ||
      (estado.estadoOperativo === 'RUN' && estado.husilloActivo) ||
      estado.husilloActivo);

    if (elementos.iconoVentiladorHusillo) {
      if (debeGirar && !esLaser) {
        elementos.iconoVentiladorHusillo.classList.add('fa-spin');
      } else {
        elementos.iconoVentiladorHusillo.classList.remove('fa-spin');
      }
    }

    if (window.visualizadorCNC && typeof window.visualizadorCNC.establecerGiroHerramienta === 'function') {
      window.visualizadorCNC.establecerGiroHerramienta(debeGirar);
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

    let factorSentido = 1;
    if (eje === 'X' && localStorage.getItem('cnc_invert_jog_x') === 'true') {
      factorSentido = -1;
    }

    const paso = Number(estado.incrementoPaso) || 0.1;
    const desplazamiento = paso * sentido * factorSentido;
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
    aplicarFeedOverride(evento.target.value);
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
    // Si la herramienta activa es el lápiz, el husillo no debe encenderse
    if (estado.tipoHerramienta === 'lapiz') {
      imprimirEnConsola('c-warn', '[MODO LÁPIZ] El husillo no puede encenderse porque la herramienta activa es un lápiz.');
      mostrarAlertaSeguridadHusillo(
        'HERRAMIENTA TIPO LÁPIZ ACTIVA',
        'El husillo no puede encenderse en modo Lápiz',
        'Está utilizando un lápiz didáctico para dibujo/trazado. El motor del husillo (Spindle) permanece apagado en esta modalidad para proteger el accesorio y evitar accidentes.\n\nPara usar el husillo, cambie la herramienta a Fresa CNC en el selector de herramienta.'
      );
      if (elementos.botonAlternarHusillo) {
        elementos.botonAlternarHusillo.classList.add('btn-spindle-denied');
        setTimeout(() => {
          elementos.botonAlternarHusillo.classList.remove('btn-spindle-denied');
        }, 700);
      }
      return;
    }

    const estaMecanizando = estado.enEjecucion ||
      estado.estadoOperativo === 'RUN' ||
      (estado.estadoOperativo === 'HOLD' && estado.enEjecucion);

    // INTERBLOQUEO DE SEGURIDAD CNC: Prohibido apagar el husillo mientras se mecaniza con FRESA
    if (estado.tipoHerramienta === 'fresa' && estado.husilloActivo && estaMecanizando) {
      mostrarAlertaSeguridadHusillo(
        'BLOQUEO DE SEGURIDAD DEL HUSILLO',
        'No es posible apagar el husillo mientras la máquina está mecanizando',
        'Apagar el husillo (Spindle) durante el mecanizado provocaría la rotura inmediata de la herramienta de corte, daños a la pieza de trabajo o sobrecarga en los motores paso a paso.\n\nPara apagar el husillo de forma segura, pause o detenga primero el mecanizado desde el panel de control.'
      );
      imprimirEnConsola('c-alarm', '[SEGURIDAD] Intento de apagado de husillo denegado durante el mecanizado.');

      if (elementos.botonAlternarHusillo) {
        elementos.botonAlternarHusillo.classList.add('btn-spindle-denied');
        setTimeout(() => {
          elementos.botonAlternarHusillo.classList.remove('btn-spindle-denied');
        }, 700);
      }
      return;
    }

    const nuevoEstado = !estado.husilloActivo;
    const esLaser = (estado.tipoHerramienta === 'laser');

    if (esLaser) {
      const pwmS = Math.round(((estado.potenciaLaserPct || 100) / 100) * 1000);
      estado.husilloActivo = nuevoEstado;
      if (window.puenteCNC) {
        window.puenteCNC.controlarSpindle(nuevoEstado, pwmS);
      } else {
        if (estado.husilloActivo) {
          elementos.botonAlternarHusillo.classList.add('active');
          elementos.textoBotonHusillo.textContent = 'Diodo Láser ON';
          elementos.metricaEstadoHusillo.textContent = `${estado.potenciaLaserPct}% LUZ`;
          elementos.metricaEstadoHusillo.classList.add('highlight-cyan');
          elementos.etiquetaRpmEnVivo.textContent = `${estado.potenciaLaserPct}% Luz (S${pwmS})`;
          imprimirEnConsola('c-grbl', `> M3 S${pwmS} [LÁSER ${estado.potenciaLaserPct}%]`);
        } else {
          elementos.botonAlternarHusillo.classList.remove('active');
          elementos.textoBotonHusillo.textContent = 'Diodo Láser OFF';
          elementos.metricaEstadoHusillo.textContent = 'OFF';
          elementos.metricaEstadoHusillo.classList.remove('highlight-cyan');
          elementos.etiquetaRpmEnVivo.textContent = '0% Luz (S0)';
          imprimirEnConsola('c-grbl', '> M5 [LÁSER OFF]');
        }
      }
      actualizarEstadoGiroVisualizador();
      return;
    }

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
    actualizarEstadoGiroVisualizador();
  }

  elementos.botonAlternarHusillo.addEventListener('click', alternarHusillo);

  elementos.entradaRpmHusillo.addEventListener('change', (evento) => {
    const estaMecanizando = estado.enEjecucion ||
      estado.estadoOperativo === 'RUN' ||
      (estado.estadoOperativo === 'HOLD' && estado.enEjecucion);

    if (estado.tipoHerramienta === 'laser') {
      let nuevoPct = parseInt(evento.target.value, 10);
      if (isNaN(nuevoPct)) nuevoPct = 100;
      nuevoPct = Math.max(0, Math.min(100, nuevoPct));
      estado.potenciaLaserPct = nuevoPct;
      localStorage.setItem('cnc_laser_power_pct', nuevoPct);
      evento.target.value = nuevoPct;
      if (elementos.deslizadorModificadorHusillo) {
        elementos.deslizadorModificadorHusillo.value = nuevoPct;
      }
      const pwmS = Math.round((nuevoPct / 100) * 1000);
      if (estaMecanizando) {
        elementos.etiquetaRpmEnVivo.textContent = `${nuevoPct}% Luz (S${pwmS})`;
        elementos.metricaEstadoHusillo.textContent = `${nuevoPct}% LUZ`;
        if (window.puenteCNC && typeof window.puenteCNC.establecerSpindleOverride === 'function') {
          window.puenteCNC.establecerSpindleOverride(nuevoPct);
        } else if (window.puenteCNC) {
          window.puenteCNC.controlarSpindle(true, pwmS);
        }
      } else if (estado.husilloActivo) {
        elementos.etiquetaRpmEnVivo.textContent = `${nuevoPct}% Luz (S${pwmS})`;
        elementos.metricaEstadoHusillo.textContent = `${nuevoPct}% LUZ`;
        if (window.puenteCNC) {
          window.puenteCNC.controlarSpindle(true, pwmS);
        } else {
          imprimirEnConsola('c-grbl', `> M3 S${pwmS} [POTENCIA ${nuevoPct}%]`);
        }
      } else {
        elementos.etiquetaRpmEnVivo.textContent = '0% Luz (S0)';
      }
      return;
    }

    let nuevaRpm = parseInt(evento.target.value, 10) || 0;
    if (estaMecanizando && nuevaRpm <= 0) {
      nuevaRpm = Math.max(1000, estado.revolucionesPorMinuto || 12000);
      evento.target.value = nuevaRpm;
      mostrarAlertaSeguridadHusillo(
        'VELOCIDAD NO PERMITIDA',
        'No se puede reducir la velocidad del husillo a 0 RPM durante el mecanizado',
        'Detener las revoluciones del husillo mientras la fresa avanza causará la rotura inmediata de la herramienta de corte.'
      );
      imprimirEnConsola('c-alarm', '[SEGURIDAD] No se puede fijar velocidad de husillo en 0 RPM durante el mecanizado.');
      return;
    }

    if (estaMecanizando) {
      const base = estado.rpmProgramadas || estado.revolucionesPorMinuto || 12000;
      const pct = Math.max(10, Math.min(200, Math.round((nuevaRpm / base) * 100)));
      estado.modificadorHusillo = pct;
      if (elementos.deslizadorModificadorHusillo) elementos.deslizadorModificadorHusillo.value = pct;
      elementos.etiquetaRpmEnVivo.textContent = `${nuevaRpm} RPM (${pct}%)`;
      if (window.puenteCNC && typeof window.puenteCNC.establecerSpindleOverride === 'function') {
        window.puenteCNC.establecerSpindleOverride(pct);
      }
      return;
    }

    estado.revolucionesPorMinuto = nuevaRpm;
    elementos.etiquetaRpmEnVivo.textContent = `${estado.revolucionesPorMinuto} RPM`;
    if (estado.husilloActivo && window.puenteCNC) {
      window.puenteCNC.controlarSpindle(true, estado.revolucionesPorMinuto);
    }
  });

  elementos.deslizadorModificadorHusillo.addEventListener('input', (evento) => {
    const estaMecanizando = estado.enEjecucion ||
      estado.estadoOperativo === 'RUN' ||
      (estado.estadoOperativo === 'HOLD' && estado.enEjecucion);

    if (estado.tipoHerramienta === 'laser') {
      let nuevoPct = parseInt(evento.target.value, 10);
      if (isNaN(nuevoPct)) nuevoPct = 100;
      nuevoPct = Math.max(0, Math.min(100, nuevoPct));
      estado.potenciaLaserPct = nuevoPct;
      localStorage.setItem('cnc_laser_power_pct', nuevoPct);
      if (elementos.entradaRpmHusillo) {
        elementos.entradaRpmHusillo.value = nuevoPct;
      }
      const pwmS = Math.round((nuevoPct / 100) * 1000);
      if (estaMecanizando) {
        elementos.etiquetaRpmEnVivo.textContent = `${nuevoPct}% Luz (S${pwmS})`;
        elementos.metricaEstadoHusillo.textContent = `${nuevoPct}% LUZ`;
        if (window.puenteCNC && typeof window.puenteCNC.establecerSpindleOverride === 'function') {
          window.puenteCNC.establecerSpindleOverride(nuevoPct);
        } else if (window.puenteCNC) {
          window.puenteCNC.controlarSpindle(true, pwmS);
        }
      } else if (estado.husilloActivo) {
        elementos.etiquetaRpmEnVivo.textContent = `${nuevoPct}% Luz (S${pwmS})`;
        elementos.metricaEstadoHusillo.textContent = `${nuevoPct}% LUZ`;
        if (window.puenteCNC) {
          window.puenteCNC.controlarSpindle(true, pwmS);
        }
      } else {
        elementos.etiquetaRpmEnVivo.textContent = `${nuevoPct}% Luz (S0)`;
      }
      return;
    }

    let modVal = parseInt(evento.target.value, 10);
    if (isNaN(modVal)) modVal = 100;
    if (estaMecanizando && modVal < 10) {
      modVal = 10;
      evento.target.value = 10;
    }
    estado.modificadorHusillo = modVal;
    const baseRpm = estado.rpmProgramadas || estado.revolucionesPorMinuto || 12000;
    const rpmAjustadas = Math.round(baseRpm * (estado.modificadorHusillo / 100));
    elementos.etiquetaRpmEnVivo.textContent = `${rpmAjustadas} RPM (${modVal}%)`;
    if (window.puenteCNC && typeof window.puenteCNC.establecerSpindleOverride === 'function') {
      window.puenteCNC.establecerSpindleOverride(modVal);
    }
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

  function actualizarContadorLineas() {
    const total = estado.lineasPrograma.length;
    const seleccionadas = estado.lineasSeleccionadas ? estado.lineasSeleccionadas.size : 0;
    if (elementos.etiquetaLineasGcode) {
      if (seleccionadas > 1) {
        elementos.etiquetaLineasGcode.textContent = `${total} líneas (${seleccionadas} sel.)`;
      } else {
        elementos.etiquetaLineasGcode.textContent = `${total} líneas`;
      }
    }
    const btnDel = document.getElementById('btn-gcode-delete-lines');
    if (btnDel) {
      if (seleccionadas > 1) {
        btnDel.innerHTML = `<i class="fa-solid fa-trash-can text-red"></i> Borrar (${seleccionadas})`;
      } else {
        btnDel.innerHTML = '<i class="fa-solid fa-trash-can text-red"></i> Borrar';
      }
    }
  }

  function renderizarListaCodigoG() {
    estado.lineasConfirmadas.clear();
    const total = estado.lineasPrograma.length;
    actualizarContadorLineas();
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
      const esActiva = (i === estado.indiceLineaActiva);
      const esSeleccionada = (estado.lineasSeleccionadas && estado.lineasSeleccionadas.has(i));
      const enEdicion = (i === estado.indiceLineaEnEdicion);

      let clases = 'gcode-line';
      if (esActiva) clases += ' active';
      if (esSeleccionada) clases += ' selected';
      if (enEdicion) clases += ' editing';

      elementoLista.className = clases;
      elementoLista.dataset.index = i;
      elementoLista.style.position = 'absolute';
      elementoLista.style.top = (i * ALTURA_LINEA_GCODE) + 'px';
      elementoLista.style.left = '0';
      elementoLista.style.right = '0';
      elementoLista.style.height = ALTURA_LINEA_GCODE + 'px';

      const columnaNumero = document.createElement('span');
      columnaNumero.className = 'line-num';
      columnaNumero.textContent = (i + 1).toString();
      elementoLista.appendChild(columnaNumero);

      if (enEdicion) {
        const contenedorEdicion = document.createElement('div');
        contenedorEdicion.className = 'line-edit-container';

        const inputEdicion = document.createElement('input');
        inputEdicion.type = 'text';
        inputEdicion.className = 'gcode-line-edit-input';
        inputEdicion.value = elemento.texto;
        inputEdicion.spellcheck = false;
        inputEdicion.autocomplete = 'off';

        inputEdicion.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            guardarEdicionLinea(i, inputEdicion.value);
            if (ev.shiftKey) insertarLineaGcode(i + 1);
          } else if (ev.key === 'Escape') {
            ev.preventDefault();
            cancelarEdicionLinea();
          } else if (ev.key === 'Tab') {
            ev.preventDefault();
            guardarEdicionLinea(i, inputEdicion.value);
            const siguiente = ev.shiftKey ? Math.max(0, i - 1) : Math.min(estado.lineasPrograma.length - 1, i + 1);
            iniciarEdicionLinea(siguiente);
          }
        });

        const btnGuardar = document.createElement('button');
        btnGuardar.type = 'button';
        btnGuardar.className = 'btn-edit-save';
        btnGuardar.title = 'Guardar (Enter)';
        btnGuardar.innerHTML = '<i class="fa-solid fa-check"></i>';
        btnGuardar.addEventListener('click', (ev) => {
          ev.stopPropagation();
          guardarEdicionLinea(i, inputEdicion.value);
        });

        const btnCancelar = document.createElement('button');
        btnCancelar.type = 'button';
        btnCancelar.className = 'btn-edit-cancel';
        btnCancelar.title = 'Cancelar (Esc)';
        btnCancelar.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        btnCancelar.addEventListener('click', (ev) => {
          ev.stopPropagation();
          cancelarEdicionLinea();
        });

        contenedorEdicion.appendChild(inputEdicion);
        contenedorEdicion.appendChild(btnGuardar);
        contenedorEdicion.appendChild(btnCancelar);
        elementoLista.appendChild(contenedorEdicion);

        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            inputEdicion.focus();
            inputEdicion.select();
          });
        } else if (typeof setTimeout === 'function') {
          setTimeout(() => {
            if (typeof inputEdicion.focus === 'function') inputEdicion.focus();
            if (typeof inputEdicion.select === 'function') inputEdicion.select();
          }, 0);
        }
      } else {
        const columnaTexto = document.createElement('span');
        columnaTexto.className = 'line-text';
        columnaTexto.innerHTML = formatearSintaxisCodigoG(elemento.texto);
        elementoLista.appendChild(columnaTexto);

        const contenedorAcciones = document.createElement('div');
        contenedorAcciones.className = 'gcode-line-actions';
        contenedorAcciones.innerHTML = `
          <button type="button" class="btn-line-action btn-line-add" title="Insertar línea debajo"><i class="fa-solid fa-plus"></i></button>
          <button type="button" class="btn-line-action btn-line-edit" title="Editar línea (Doble clic o F2)"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="btn-line-action btn-line-del" title="Borrar línea (Supr)"><i class="fa-solid fa-trash-can"></i></button>
        `;
        elementoLista.appendChild(contenedorAcciones);

        if (estado.lineasConfirmadas.has(i)) elementoLista.appendChild(crearIndicadorConfirmacion(estado.lineasConfirmadas.get(i)));
      }

      fragmento.appendChild(elementoLista);
    }

    elementos.contenedorLineasGcode.innerHTML = '';
    elementos.contenedorLineasGcode.appendChild(fragmento);
  }

  function crearIndicadorConfirmacion(virtual) {
    const indicador = document.createElement('span');
    indicador.className = 'gcode-ack';
    indicador.textContent = 'ok';
    indicador.title = virtual ? 'Simulador: comando procesado correctamente' : 'Máquina: comando enviado y confirmado con ok';
    indicador.setAttribute('aria-label', indicador.title);
    return indicador;
  }

  function registrarLineaConfirmada(indice, virtual = false) {
    if (!Number.isInteger(indice) || indice < 0 || indice >= estado.lineasPrograma.length) return;
    estado.lineasConfirmadas.set(indice, virtual);
    const fila = elementos.contenedorLineasGcode.querySelector(`.gcode-line[data-index="${indice}"]`);
    if (fila && !fila.querySelector('.gcode-ack')) fila.appendChild(crearIndicadorConfirmacion(virtual));
  }

  // Sincronización completa de cambios en el programa G-Code
  function sincronizarCambiosProgramaGcode(mensajeConsola) {
    estado.segundosEstimadosBase = estimarSegundosBaseDesdeLineas(estado.lineasPrograma);
    actualizarMetricasTelemetria();
    actualizarTiempoEstimado();
    renderizarListaCodigoG();

    const textoCompleto = estado.lineasPrograma.map(l => l.texto).join('\n');
    if (window.visualizadorCNC) {
      window.visualizadorCNC.cargarTrayectoriaDesdeGCode(textoCompleto);
      window.visualizadorCNC.solicitarRenderizado();
    }
    if (window.puenteCNC) {
      window.puenteCNC.analizarGcode(textoCompleto);
    }
    if (mensajeConsola) {
      imprimirEnConsola('c-info', mensajeConsola);
    }
  }

  // Funciones de Edición, Inserción y Borrado de Líneas
  function iniciarEdicionLinea(indice) {
    if (estado.enEjecucion) {
      imprimirEnConsola('c-warn', '[BLOQUEO] No se puede editar código G mientras el trabajo está en ejecución.');
      return;
    }
    if (indice < 0 || indice >= estado.lineasPrograma.length) return;
    estado.indiceLineaEnEdicion = indice;
    estado.indiceLineaActiva = indice;
    estado.lineasSeleccionadas.clear();
    estado.lineasSeleccionadas.add(indice);
    actualizarContadorLineas();

    const viewport = elementos.visorGcodeViewport || document.getElementById('gcode-list-viewport');
    if (viewport) {
      const posTop = indice * ALTURA_LINEA_GCODE;
      if (posTop < viewport.scrollTop || posTop > (viewport.scrollTop + viewport.clientHeight - 30)) {
        viewport.scrollTop = Math.max(0, posTop - 40);
      }
    }
    renderizarVentanaVisibleGcode();
  }

  function guardarEdicionLinea(indice, nuevoTexto) {
    if (indice < 0 || indice >= estado.lineasPrograma.length) {
      estado.indiceLineaEnEdicion = -1;
      return;
    }
    const textoFinal = (nuevoTexto ?? '').trim();
    const textoAnterior = estado.lineasPrograma[indice].texto;
    estado.indiceLineaEnEdicion = -1;

    if (textoFinal !== textoAnterior) {
      estado.pilaDeshacerGcode.push({
        tipo: 'editar',
        indice,
        anterior: textoAnterior
      });
      estado.lineasPrograma[indice].texto = textoFinal;
      sincronizarCambiosProgramaGcode(`[GCODE] Línea ${indice + 1} modificada: "${textoFinal}".`);
    } else {
      renderizarVentanaVisibleGcode();
    }
  }

  function cancelarEdicionLinea() {
    estado.indiceLineaEnEdicion = -1;
    renderizarVentanaVisibleGcode();
  }

  function insertarLineaGcode(posicion, textoInicial = 'G1 ') {
    if (estado.enEjecucion) {
      imprimirEnConsola('c-warn', '[BLOQUEO] No se puede insertar código G mientras el trabajo está en ejecución.');
      return;
    }
    const total = estado.lineasPrograma.length;
    let pos = (typeof posicion === 'number' && Number.isInteger(posicion))
      ? posicion
      : ((estado.indiceLineaActiva >= 0 && estado.indiceLineaActiva < total) ? (estado.indiceLineaActiva + 1) : total);
    pos = Math.max(0, Math.min(total, pos));

    estado.pilaDeshacerGcode.push({
      tipo: 'insertar',
      posicion: pos
    });

    estado.lineasPrograma.splice(pos, 0, { texto: textoInicial });
    estado.indiceLineaActiva = pos;
    estado.lineasSeleccionadas.clear();
    estado.lineasSeleccionadas.add(pos);

    sincronizarCambiosProgramaGcode(`[GCODE] Nueva línea insertada en la posición ${pos + 1}.`);
    iniciarEdicionLinea(pos);
  }

  function eliminarLineasSeleccionadas() {
    if (estado.enEjecucion) {
      imprimirEnConsola('c-warn', '[BLOQUEO] No se puede eliminar código G mientras el trabajo está en ejecución.');
      return;
    }
    const total = estado.lineasPrograma.length;
    if (total === 0) return;

    let indices = Array.from(estado.lineasSeleccionadas).filter(i => i >= 0 && i < total);
    if (indices.length === 0 && estado.indiceLineaActiva >= 0 && estado.indiceLineaActiva < total) {
      indices = [estado.indiceLineaActiva];
    }
    if (indices.length === 0) {
      imprimirEnConsola('c-warn', '[GCODE] Seleccione una o varias líneas para eliminar.');
      return;
    }

    if (indices.length > 25 && !confirm(`¿Desea eliminar ${indices.length} líneas de código G seleccionadas?`)) {
      return;
    }

    indices.sort((a, b) => b - a);
    const guardadas = indices.map(idx => ({ idx, item: { ...estado.lineasPrograma[idx] } }));
    estado.pilaDeshacerGcode.push({
      tipo: 'eliminar_multiples',
      items: guardadas
    });

    for (const idx of indices) {
      estado.lineasPrograma.splice(idx, 1);
    }

    estado.lineasSeleccionadas.clear();
    estado.indiceLineaEnEdicion = -1;
    const menorIndice = indices[indices.length - 1];
    const nuevoIndice = Math.min(menorIndice, Math.max(0, estado.lineasPrograma.length - 1));
    estado.indiceLineaActiva = nuevoIndice;
    if (estado.lineasPrograma.length > 0) {
      estado.lineasSeleccionadas.add(nuevoIndice);
    }

    sincronizarCambiosProgramaGcode(`[GCODE] Se eliminaron ${indices.length} línea(s) del programa.`);
  }

  function eliminarRangoLineas(inicio1Based, fin1Based) {
    if (estado.enEjecucion) {
      imprimirEnConsola('c-warn', '[BLOQUEO] No se puede eliminar código G mientras el trabajo está en ejecución.');
      return;
    }
    const total = estado.lineasPrograma.length;
    if (total === 0) return;

    const start = Math.max(1, Math.min(total, parseInt(inicio1Based, 10) || 1));
    const end = Math.max(start, Math.min(total, parseInt(fin1Based, 10) || start));
    const idxStart = start - 1;
    const cantidad = (end - start) + 1;

    const itemsGuardados = estado.lineasPrograma.slice(idxStart, idxStart + cantidad).map(item => ({ ...item }));
    estado.pilaDeshacerGcode.push({
      tipo: 'eliminar_rango',
      idxStart,
      items: itemsGuardados
    });

    estado.lineasPrograma.splice(idxStart, cantidad);
    estado.lineasSeleccionadas.clear();
    estado.indiceLineaEnEdicion = -1;
    estado.indiceLineaActiva = Math.min(idxStart, Math.max(0, estado.lineasPrograma.length - 1));
    if (estado.lineasPrograma.length > 0) {
      estado.lineasSeleccionadas.add(estado.indiceLineaActiva);
    }

    sincronizarCambiosProgramaGcode(`[GCODE] Se eliminó el rango de líneas ${start} a ${end} (${cantidad} líneas eliminadas).`);
  }

  function deshacerUltimaEdicionGcode() {
    if (estado.enEjecucion) {
      imprimirEnConsola('c-warn', '[BLOQUEO] No se puede modificar código G mientras el trabajo está en ejecución.');
      return;
    }
    if (estado.pilaDeshacerGcode.length === 0) {
      imprimirEnConsola('c-info', '[DESHACER] No hay acciones recientes de edición para deshacer.');
      return;
    }
    const accion = estado.pilaDeshacerGcode.pop();
    if (accion.tipo === 'editar') {
      if (estado.lineasPrograma[accion.indice]) {
        estado.lineasPrograma[accion.indice].texto = accion.anterior;
        sincronizarCambiosProgramaGcode(`[DESHACER] Restaurada línea ${accion.indice + 1}.`);
      }
    } else if (accion.tipo === 'insertar') {
      if (accion.posicion >= 0 && accion.posicion < estado.lineasPrograma.length) {
        estado.lineasPrograma.splice(accion.posicion, 1);
        sincronizarCambiosProgramaGcode(`[DESHACER] Eliminada línea insertada en posición ${accion.posicion + 1}.`);
      }
    } else if (accion.tipo === 'eliminar_multiples') {
      const items = [...accion.items].sort((a, b) => a.idx - b.idx);
      for (const it of items) {
        estado.lineasPrograma.splice(it.idx, 0, it.item);
      }
      sincronizarCambiosProgramaGcode(`[DESHACER] Restauradas ${items.length} líneas eliminadas.`);
    } else if (accion.tipo === 'eliminar_rango') {
      estado.lineasPrograma.splice(accion.idxStart, 0, ...accion.items);
      sincronizarCambiosProgramaGcode(`[DESHACER] Restauradas ${accion.items.length} líneas del rango.`);
    }
  }

  // Menú Contextual G-Code
  function abrirMenuContextualGcode(clientX, clientY, indice) {
    const menu = elementos.menuContextualGcode || document.getElementById('gcode-context-menu');
    if (!menu) return;
    const btnDel = menu.querySelector('#ctx-gcode-delete');
    if (btnDel) {
      const cant = estado.lineasSeleccionadas.size;
      btnDel.innerHTML = cant > 1
        ? `<i class="fa-solid fa-trash-can"></i> Borrar ${cant} líneas (Supr)`
        : '<i class="fa-solid fa-trash-can"></i> Borrar línea (Supr)';
    }
    menu.classList.remove('hidden');
    const anchoMenu = 190;
    const altoMenu = 190;
    const x = Math.min(clientX, window.innerWidth - anchoMenu - 10);
    const y = Math.min(clientY, window.innerHeight - altoMenu - 10);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }

  function cerrarMenuContextualGcode() {
    const menu = elementos.menuContextualGcode || document.getElementById('gcode-context-menu');
    if (menu) menu.classList.add('hidden');
  }

  // Delegación de eventos en la lista de líneas G-Code
  elementos.contenedorLineasGcode.addEventListener('click', (evento) => {
    cerrarMenuContextualGcode();

    const btnAdd = evento.target.closest('.btn-line-add');
    if (btnAdd) {
      evento.stopPropagation();
      const lineaEl = btnAdd.closest('.gcode-line');
      if (lineaEl) insertarLineaGcode(parseInt(lineaEl.dataset.index, 10) + 1);
      return;
    }

    const btnEdit = evento.target.closest('.btn-line-edit');
    if (btnEdit) {
      evento.stopPropagation();
      const lineaEl = btnEdit.closest('.gcode-line');
      if (lineaEl) iniciarEdicionLinea(parseInt(lineaEl.dataset.index, 10));
      return;
    }

    const btnDel = evento.target.closest('.btn-line-del');
    if (btnDel) {
      evento.stopPropagation();
      const lineaEl = btnDel.closest('.gcode-line');
      if (lineaEl) {
        const idx = parseInt(lineaEl.dataset.index, 10);
        estado.lineasSeleccionadas.clear();
        estado.lineasSeleccionadas.add(idx);
        eliminarLineasSeleccionadas();
      }
      return;
    }

    const lineaEl = evento.target.closest('.gcode-line');
    if (!lineaEl || lineaEl.dataset.index === undefined) return;
    if (lineaEl.classList.contains('editing')) return;

    const idx = parseInt(lineaEl.dataset.index, 10);

    if (evento.shiftKey && estado.ultimoIndiceSeleccionado !== null) {
      const min = Math.min(estado.ultimoIndiceSeleccionado, idx);
      const max = Math.max(estado.ultimoIndiceSeleccionado, idx);
      estado.lineasSeleccionadas.clear();
      for (let k = min; k <= max; k++) estado.lineasSeleccionadas.add(k);
      renderizarVentanaVisibleGcode();
      actualizarContadorLineas();
    } else if (evento.ctrlKey || evento.metaKey) {
      if (estado.lineasSeleccionadas.has(idx)) {
        estado.lineasSeleccionadas.delete(idx);
      } else {
        estado.lineasSeleccionadas.add(idx);
      }
      estado.ultimoIndiceSeleccionado = idx;
      renderizarVentanaVisibleGcode();
      actualizarContadorLineas();
    } else {
      estado.lineasSeleccionadas.clear();
      estado.lineasSeleccionadas.add(idx);
      estado.ultimoIndiceSeleccionado = idx;
      seleccionarLineaGcode(idx);
      actualizarContadorLineas();
    }
  });

  // Doble clic para editar en línea
  elementos.contenedorLineasGcode.addEventListener('dblclick', (evento) => {
    const lineaEl = evento.target.closest('.gcode-line');
    if (lineaEl && lineaEl.dataset.index !== undefined && !lineaEl.classList.contains('editing')) {
      iniciarEdicionLinea(parseInt(lineaEl.dataset.index, 10));
    }
  });

  // Clic derecho para menú contextual
  elementos.contenedorLineasGcode.addEventListener('contextmenu', (evento) => {
    evento.preventDefault();
    const lineaEl = evento.target.closest('.gcode-line');
    if (!lineaEl || lineaEl.dataset.index === undefined) return;
    const idx = parseInt(lineaEl.dataset.index, 10);
    if (!estado.lineasSeleccionadas.has(idx)) {
      estado.lineasSeleccionadas.clear();
      estado.lineasSeleccionadas.add(idx);
      estado.ultimoIndiceSeleccionado = idx;
      seleccionarLineaGcode(idx);
      actualizarContadorLineas();
    }
    abrirMenuContextualGcode(evento.clientX, evento.clientY, idx);
  });

  document.addEventListener('click', (evento) => {
    if (!evento.target.closest('#gcode-context-menu')) {
      cerrarMenuContextualGcode();
    }
  });

  // Atajos de teclado en el viewport de G-Code
  if (elementos.visorGcodeViewport) {
    elementos.visorGcodeViewport.addEventListener('keydown', (ev) => {
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA') return;

      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        eliminarLineasSeleccionadas();
      } else if (ev.key === 'Insert') {
        ev.preventDefault();
        insertarLineaGcode();
      } else if (ev.key === 'F2' || ev.key === 'Enter') {
        ev.preventDefault();
        if (estado.indiceLineaActiva >= 0) {
          iniciarEdicionLinea(estado.indiceLineaActiva);
        }
      } else if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        const prox = Math.min(estado.lineasPrograma.length - 1, estado.indiceLineaActiva + 1);
        seleccionarLineaGcode(prox);
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        const prev = Math.max(0, estado.indiceLineaActiva - 1);
        seleccionarLineaGcode(prev);
      } else if (ev.ctrlKey && (ev.key === 'z' || ev.key === 'Z')) {
        ev.preventDefault();
        deshacerUltimaEdicionGcode();
      }
    });
  }

  // Botones de la barra de herramientas de PROGRAMA G-CODE
  if (elementos.botonGcodeAddLine) {
    elementos.botonGcodeAddLine.addEventListener('click', () => insertarLineaGcode());
  }
  if (elementos.botonGcodeEditLine) {
    elementos.botonGcodeEditLine.addEventListener('click', () => {
      if (estado.indiceLineaActiva >= 0) iniciarEdicionLinea(estado.indiceLineaActiva);
    });
  }
  if (elementos.botonGcodeDeleteLines) {
    elementos.botonGcodeDeleteLines.addEventListener('click', () => eliminarLineasSeleccionadas());
  }
  if (elementos.botonGcodeDeleteRange) {
    elementos.botonGcodeDeleteRange.addEventListener('click', () => {
      if (estado.enEjecucion) {
        imprimirEnConsola('c-warn', '[BLOQUEO] No se puede eliminar código G mientras el trabajo está en ejecución.');
        return;
      }
      abrirModalBorrarRango();
    });
  }
  if (elementos.botonGcodeFullEditor) {
    elementos.botonGcodeFullEditor.addEventListener('click', () => {
      if (estado.enEjecucion) {
        imprimirEnConsola('c-warn', '[BLOQUEO] No se puede editar código G mientras el trabajo está en ejecución.');
        return;
      }
      abrirModalEditorCompleto();
    });
  }

  // Acciones del Menú Contextual
  const ctxEdit = document.getElementById('ctx-gcode-edit');
  if (ctxEdit) ctxEdit.addEventListener('click', () => {
    cerrarMenuContextualGcode();
    iniciarEdicionLinea(estado.indiceLineaActiva);
  });

  const ctxAddAbove = document.getElementById('ctx-gcode-add-above');
  if (ctxAddAbove) ctxAddAbove.addEventListener('click', () => {
    cerrarMenuContextualGcode();
    insertarLineaGcode(estado.indiceLineaActiva);
  });

  const ctxAddBelow = document.getElementById('ctx-gcode-add-below');
  if (ctxAddBelow) ctxAddBelow.addEventListener('click', () => {
    cerrarMenuContextualGcode();
    insertarLineaGcode(estado.indiceLineaActiva + 1);
  });

  const ctxDel = document.getElementById('ctx-gcode-delete');
  if (ctxDel) ctxDel.addEventListener('click', () => {
    cerrarMenuContextualGcode();
    eliminarLineasSeleccionadas();
  });

  const ctxDelRange = document.getElementById('ctx-gcode-delete-range');
  if (ctxDelRange) ctxDelRange.addEventListener('click', () => {
    cerrarMenuContextualGcode();
    abrirModalBorrarRango();
  });

  const ctxCopy = document.getElementById('ctx-gcode-copy');
  if (ctxCopy) ctxCopy.addEventListener('click', () => {
    cerrarMenuContextualGcode();
    const l = estado.lineasPrograma[estado.indiceLineaActiva];
    if (l && navigator.clipboard) {
      navigator.clipboard.writeText(l.texto).then(() => {
        imprimirEnConsola('c-info', `[PORTAPAPELES] Línea copiada: "${l.texto}"`);
      });
    }
  });

  // Modal Borrar Rango
  function abrirModalBorrarRango() {
    const modal = elementos.modalDeleteRange || document.getElementById('modal-delete-range-backdrop');
    if (!modal) return;
    const inpStart = document.getElementById('input-range-start');
    const inpEnd = document.getElementById('input-range-end');
    const total = estado.lineasPrograma.length;

    const startVal = (estado.indiceLineaActiva >= 0 && estado.indiceLineaActiva < total)
      ? (estado.indiceLineaActiva + 1)
      : 1;
    let endVal = startVal;
    if (estado.lineasSeleccionadas && estado.lineasSeleccionadas.size > 1) {
      endVal = Math.max(...estado.lineasSeleccionadas) + 1;
    }

    if (inpStart) {
      inpStart.max = total;
      inpStart.value = startVal;
    }
    if (inpEnd) {
      inpEnd.max = total;
      inpEnd.value = endVal;
    }
    actualizarVistaPreviaRango();
    modal.classList.remove('hidden');
  }

  function cerrarModalBorrarRango() {
    const modal = elementos.modalDeleteRange || document.getElementById('modal-delete-range-backdrop');
    if (modal) modal.classList.add('hidden');
  }

  function actualizarVistaPreviaRango() {
    const inpStart = document.getElementById('input-range-start');
    const inpEnd = document.getElementById('input-range-end');
    const preview = document.getElementById('lbl-range-preview');
    if (!preview) return;
    const total = estado.lineasPrograma.length;
    const s = Math.max(1, Math.min(total, parseInt(inpStart?.value, 10) || 1));
    const e = Math.max(s, Math.min(total, parseInt(inpEnd?.value, 10) || s));
    const cant = (e - s) + 1;
    preview.textContent = `Se eliminarán ${cant} línea(s) (de la línea ${s} a la ${e}).`;
  }

  const inpRangeStart = document.getElementById('input-range-start');
  const inpRangeEnd = document.getElementById('input-range-end');
  if (inpRangeStart) inpRangeStart.addEventListener('input', actualizarVistaPreviaRango);
  if (inpRangeEnd) inpRangeEnd.addEventListener('input', actualizarVistaPreviaRango);

  const btnCloseDelRange = document.getElementById('btn-close-delete-range-modal');
  const btnCancelDelRange = document.getElementById('btn-cancel-delete-range');
  const btnConfirmDelRange = document.getElementById('btn-confirm-delete-range');
  if (btnCloseDelRange) btnCloseDelRange.addEventListener('click', cerrarModalBorrarRango);
  if (btnCancelDelRange) btnCancelDelRange.addEventListener('click', cerrarModalBorrarRango);
  if (btnConfirmDelRange) btnConfirmDelRange.addEventListener('click', () => {
    const s = parseInt(inpRangeStart?.value, 10) || 1;
    const e = parseInt(inpRangeEnd?.value, 10) || s;
    cerrarModalBorrarRango();
    eliminarRangoLineas(s, e);
  });

  // Modal Editor Completo
  function abrirModalEditorCompleto() {
    const modal = elementos.modalGcodeEditor || document.getElementById('modal-gcode-editor-backdrop');
    if (!modal) return;
    const textarea = document.getElementById('textarea-gcode-full');
    const lblStats = document.getElementById('lbl-editor-line-stats');
    if (textarea) {
      textarea.value = estado.lineasPrograma.map(l => (typeof l === 'string' ? l : (l.texto || ''))).join('\n');
      if (lblStats) lblStats.textContent = `${estado.lineasPrograma.length} líneas`;
    }
    modal.classList.remove('hidden');
  }

  function cerrarModalEditorCompleto() {
    const modal = elementos.modalGcodeEditor || document.getElementById('modal-gcode-editor-backdrop');
    if (modal) modal.classList.add('hidden');
  }

  const btnCloseEditorModal = document.getElementById('btn-close-gcode-editor-modal');
  const btnCancelEditorModal = document.getElementById('btn-cancel-gcode-editor');
  const btnSaveEditorModal = document.getElementById('btn-save-gcode-editor');
  const btnEditorCleanEmpty = document.getElementById('btn-editor-clean-empty');
  const btnEditorUppercase = document.getElementById('btn-editor-uppercase');
  const textareaGcodeFull = document.getElementById('textarea-gcode-full');

  if (textareaGcodeFull) {
    textareaGcodeFull.addEventListener('input', () => {
      const lblStats = document.getElementById('lbl-editor-line-stats');
      if (lblStats) {
        const count = textareaGcodeFull.value.split('\n').filter(l => l.trim().length > 0).length;
        lblStats.textContent = `${count} líneas válidas`;
      }
    });
  }

  if (btnEditorCleanEmpty && textareaGcodeFull) {
    btnEditorCleanEmpty.addEventListener('click', () => {
      const lineas = textareaGcodeFull.value.split('\n').filter(l => l.trim().length > 0);
      textareaGcodeFull.value = lineas.join('\n');
      const lblStats = document.getElementById('lbl-editor-line-stats');
      if (lblStats) lblStats.textContent = `${lineas.length} líneas válidas`;
    });
  }

  if (btnEditorUppercase && textareaGcodeFull) {
    btnEditorUppercase.addEventListener('click', () => {
      const lineas = textareaGcodeFull.value.split('\n').map(l => {
        let partes = l.split(';');
        partes[0] = partes[0].toUpperCase();
        return partes.join(';');
      });
      textareaGcodeFull.value = lineas.join('\n');
    });
  }

  if (btnCloseEditorModal) btnCloseEditorModal.addEventListener('click', cerrarModalEditorCompleto);
  if (btnCancelEditorModal) btnCancelEditorModal.addEventListener('click', cerrarModalEditorCompleto);
  if (btnSaveEditorModal && textareaGcodeFull) {
    btnSaveEditorModal.addEventListener('click', () => {
      const lineas = textareaGcodeFull.value.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .map(texto => ({ texto }));

      cerrarModalEditorCompleto();
      if (lineas.length > 0) {
        estado.pilaDeshacerGcode.push({
          tipo: 'editor_completo',
          lineasPrevias: [...estado.lineasPrograma]
        });
        estado.lineasPrograma = lineas;
        estado.indiceLineaActiva = 0;
        estado.lineasSeleccionadas.clear();
        estado.lineasSeleccionadas.add(0);
        sincronizarCambiosProgramaGcode(`[EDITOR] Programa actualizado con ${lineas.length} líneas.`);
      }
    });
  }

  if (elementos.visorGcodeViewport) {
    elementos.visorGcodeViewport.addEventListener('scroll', () => {
      renderizarVentanaVisibleGcode();
    }, { passive: true });
  }

  let refrescoListaResize = null;
  window.addEventListener('resize', () => {
    if (refrescoListaResize !== null) return;
    refrescoListaResize = requestAnimationFrame(() => {
      refrescoListaResize = null;
      renderizarVentanaVisibleGcode();
    });
  });

  function escaparHTML(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  }

  function formatearSintaxisCodigoG(textoOriginal) {
    let salida = escaparHTML(textoOriginal);
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
    if (window.visualizadorCNC && (estado.enEjecucion || estado.enPausa)) {
      window.visualizadorCNC.establecerIndiceLineaActiva(indice);
    }
    resaltarLineaGcodeActiva();
    actualizarMetricasTelemetria();

    // En hardware, el DRO siempre procede de telemetría. Offline usa geometría modal.
    if (!window.puenteCNC && window.visualizadorCNC) {
      const segmento = window.visualizadorCNC.trayectoria.findLast(s => s.linea <= indice);
      estado.coordenadasTrabajo = segmento ? {x: segmento.x2, y: segmento.y2, z: segmento.z2} : {x: 0, y: 0, z: 0};
      estado.coordenadasMaquina = {...estado.coordenadasTrabajo};
      actualizarLecturasDRO();
    }
  }

  let ultimoIndiceResaltado = -1;

  function resaltarLineaGcodeActiva() {
    const idx = estado.indiceLineaActiva;
    if (idx === ultimoIndiceResaltado) return;
    ultimoIndiceResaltado = idx;

    const viewport = elementos.visorGcodeViewport || document.getElementById('gcode-list-viewport');
    if (viewport) {
      const posTop = idx * ALTURA_LINEA_GCODE;
      const viewTop = viewport.scrollTop;
      const viewBottom = viewTop + viewport.clientHeight;

      if (posTop < viewTop + 10 || posTop > viewBottom - 30) {
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
    if (!mensaje) return;

    // Filtro didáctico opcional de consultas periódicas de estado (<Idle|MPos:...>, etc.)
    const filtrarStatus = localStorage.getItem('cnc_console_filter_status') === 'true';
    if (filtrarStatus && typeof mensaje === 'string' && mensaje.trim().startsWith('<') && mensaje.trim().endsWith('>')) {
      return;
    }

    const renglon = document.createElement('div');
    let clases = `console-line ${claseCss}`;

    // Resaltado de alarmas y errores en color rojo
    const resaltarAlarmas = localStorage.getItem('cnc_console_highlight_alarms') !== 'false';
    const esAlarma = (claseCss && (claseCss.includes('alarm') || claseCss.includes('error'))) ||
      (typeof mensaje === 'string' && (/ALARM|error:/i.test(mensaje)));
    if (resaltarAlarmas && esAlarma) {
      clases += ' console-line-alarm-highlight';
    }
    renglon.className = clases;

    // Marcas de tiempo opcionales ([HH:MM:SS])
    const mostrarTimestamps = localStorage.getItem('cnc_console_timestamps') !== 'false';
    if (mostrarTimestamps) {
      const ahora = new Date();
      const horaStr = ahora.toTimeString().split(' ')[0];
      const stamp = document.createElement('span');
      stamp.className = 'console-timestamp';
      stamp.style.color = 'var(--text-muted)';
      stamp.style.marginRight = '6px';
      stamp.style.fontSize = '0.75rem';
      stamp.textContent = `[${horaStr}]`;
      renglon.appendChild(stamp);
      const spanTexto = document.createElement('span');
      spanTexto.textContent = mensaje;
      renglon.appendChild(spanTexto);
    } else {
      renglon.textContent = mensaje;
    }

    if (elementos.salidaConsola) {
      elementos.salidaConsola.appendChild(renglon);
      while (elementos.salidaConsola.children.length > 200) {
        elementos.salidaConsola.removeChild(elementos.salidaConsola.firstChild);
      }
      const autoScroll = localStorage.getItem('cnc_console_autoscroll') !== 'false';
      if (autoScroll) {
        elementos.salidaConsola.scrollTop = elementos.salidaConsola.scrollHeight;
      }
    }
  }
  window.imprimirEnConsola = imprimirEnConsola;

  function procesarComandoMdi(comandoSinFormato) {
    const comando = comandoSinFormato.trim();
    if (!comando) return;

    const estaMecanizando = estado.enEjecucion ||
      estado.estadoOperativo === 'RUN' ||
      (estado.estadoOperativo === 'HOLD' && estado.enEjecucion);

    // Interbloqueo de comando M5 manual durante mecanizado
    if (estaMecanizando && /\bM0?5\b/i.test(comando)) {
      imprimirEnConsola('c-alarm', '[SEGURIDAD] Comando M5 bloqueado: No se puede apagar el husillo durante el mecanizado.');
      mostrarAlertaSeguridadHusillo(
        'COMANDO M5 BLOQUEADO',
        'Apagado manual de husillo no permitido',
        'El comando M5 fue rechazado porque el mecanizado está en curso. Para apagar el husillo de forma segura, pause o detenga el programa primero.'
      );
      return;
    }

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
    if (!window.visualizadorCNC) return 1;
    window.visualizadorCNC.cargarTrayectoriaDesdeGCode(lineas);
    return Math.max(1, Math.round(window.visualizadorCNC.tiempoEstimadoSegundos || 0));
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
    if (elementos.metricaVelocidadAvance && !window.puenteCNC) {
      elementos.metricaVelocidadAvance.textContent = `${feedEfectivo} mm/min`;
    }

  }

  function formatearPorcentajeProgreso(valor) {
    const numero = Number(valor);
    return `${(Number.isFinite(numero) ? Math.max(0, Math.min(100, numero)) : 0).toFixed(1)}%`;
  }

  function mostrarFeedOverride(porcentaje) {
    const esVirtual = (estado.puertoComSeleccionado === 'SIMULADOR_VIRTUAL' || !window.puenteCNC);
    const maxVal = esVirtual ? 2000 : 200;
    const pct = Math.max(10, Math.min(maxVal, Math.round(Number(porcentaje) || 100)));
    estado.porcentajeVelocidadManual = pct;
    if (elementos.deslizadorVelocidadJog) {
      if (Number(elementos.deslizadorVelocidadJog.max) !== maxVal) {
        elementos.deslizadorVelocidadJog.max = maxVal;
      }
      elementos.deslizadorVelocidadJog.value = pct;
    }
    if (elementos.etiquetaVelocidadJog) elementos.etiquetaVelocidadJog.textContent = `${pct}%`;
    document.querySelectorAll('.btn-preset-feed').forEach(btn => {
      const val = Number(btn.getAttribute('data-feed-pct') || btn.dataset.feedPct);
      btn.classList.toggle('active', val === pct);
    });
    actualizarTiempoEstimado();
  }

  function aplicarFeedOverride(porcentaje) {
    mostrarFeedOverride(porcentaje);
    if (window.puenteCNC) window.puenteCNC.establecerFeedOverride(estado.porcentajeVelocidadManual);
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
      elementos.etiquetaPorcentajeProgreso.textContent = formatearPorcentajeProgreso(porcentajeAvance);
    }
  }

  async function iniciarMecanizado() {
    if (window.visualizadorCNC?.errorGcode) {
      imprimirEnConsola('c-error', window.visualizadorCNC.errorGcode);
      return;
    }
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

    estado.lineasConfirmadas.clear();
    renderizarVentanaVisibleGcode();
    estado.enEjecucion = true;
    estado.enPausa = false;
    estado.indiceLineaActiva = 0;
    establecerEstadoOperativo('RUN');
    actualizarEstadoGiroVisualizador();

    elementos.botonIniciarMecanizado.classList.add('hidden');
    elementos.botonPausarMecanizado.classList.remove('hidden');
    elementos.botonDetenerMecanizado.classList.remove('hidden');

    const textoCompleto = estado.lineasPrograma.map(l => l.texto).join('\n');

    // RF-10 / C.U-06-03: Registrar inicio de trabajo para el Historial
    const esSimulacionVirtual = (estado.puertoComSeleccionado === 'SIMULADOR_VIRTUAL' || !window.puenteCNC);
    estado.trabajoActual = {
      archivo: estado.nombreArchivoCargado || 'programa_cnc.nc',
      tiempoInicioMs: Date.now(),
      fecha: new Date().toLocaleString(),
      herramienta: estado.tipoHerramienta || 'fresa',
      totalLineas: estado.lineasPrograma.length,
      esSimulacion: esSimulacionVirtual
    };

    if (esSimulacionVirtual) {
      imprimirEnConsola('c-info', '[SIMULADOR] Ejecución en modo simulador virtual (RF-11 / C.U-03-04).');
    }

    if (estado.tipoHerramienta === 'lapiz') {
      const tieneM3 = estado.lineasPrograma.some(l => /\bM0?[34]\b/i.test(l.texto || ''));
      if (tieneM3) {
        imprimirEnConsola(
          'c-warn',
          '[MODO LÁPIZ] El código G contiene códigos de encendido de motor (M3/M4), pero el husillo no se encenderá por estar en modo lápiz.'
        );
      }
    }

    if (window.visualizadorCNC) {
      window.visualizadorCNC.establecerIndiceLineaActiva(0);
    }

    if (window.puenteCNC) {
      const aceptado = await window.puenteCNC.iniciarPrograma(textoCompleto);
      if (!aceptado) {
        estado.trabajoActual = null;
        estado.enEjecucion = false;
        estado.enPausa = false;
        elementos.botonIniciarMecanizado.classList.remove('hidden');
        elementos.botonPausarMecanizado.classList.add('hidden');
        elementos.botonDetenerMecanizado.classList.add('hidden');
        establecerEstadoOperativo('IDLE');
        imprimirEnConsola('c-error', '[PROGRAMA] Inicio rechazado. Revise la consola.');
      }
    } else {
      // Bucle de simulación offline
      imprimirEnConsola('c-info', '[EJECUCIÓN] Iniciando simulación local...');
      const totalLineas = estado.lineasPrograma.length;
      let segTranscurridos = 0;
      if (estado.temporizadorEjecucion) clearInterval(estado.temporizadorEjecucion);

      const pausasProcesadas = new Set();
      let avanceReloj = 0;
      estado.temporizadorEjecucion = setInterval(() => {
        if (!estado.enEjecucion || estado.enPausa) return;
        const velOverride = Math.max(0.1, (estado.porcentajeVelocidadManual || 100) / 100);
        avanceReloj += velOverride * 50;
        if (avanceReloj < 50) return;
        avanceReloj -= 50;
        const idx = estado.indiceLineaActiva;
        const linea = estado.lineasPrograma[idx]?.texto || '';
        const limpia = linea.replace(/\(.*?\)/g, '').split(';')[0].toUpperCase();
        const tokens = [...limpia.matchAll(/([A-Z])\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))/g)].map(m => [m[1], Number(m[2])]);
        const ms = tokens.filter(([k]) => k === 'M').map(([,v]) => v);
        const s = tokens.find(([k]) => k === 'S');
        if (s) estado.rpmProgramadas = s[1];
        if (ms.some(m => [3,4].includes(m)) && estado.tipoHerramienta !== 'lapiz') {
          estado.husilloActivo = (estado.rpmProgramadas || 0) > 0;
        }
        if (ms.includes(5) || (s && s[1] === 0)) estado.husilloActivo = false;
        const pausaM6 = ms.includes(6) && localStorage.getItem('cnc_pause_m6') !== 'false';
        if ((pausaM6 || ms.includes(0)) && !pausasProcesadas.has(idx)) {
          pausasProcesadas.add(idx);
          if (pausaM6) estado.husilloActivo = false;
          pausarMecanizado();
          mostrarAlertaSeguridadHusillo(pausaM6 ? 'CAMBIO DE HERRAMIENTA (M6)' : 'PAUSA M0', 'Simulación pausada', 'Presione Continuar para seguir.');
          return;
        }
        const esCorte = window.visualizadorCNC?.trayectoria.some(s => s.linea === idx && s.tipo === 'G1');
        if (esCorte && !estado.husilloActivo && estado.tipoHerramienta === 'fresa') {
          pausarMecanizado();
          mostrarAlertaSeguridadHusillo('CORTE CON HUSILLO APAGADO', 'Simulación pausada', 'Encienda el husillo antes de continuar.');
          return;
        }
        if (tokens.length && !ms.includes(6) && tokens.some(([k]) => k !== 'T')) registrarLineaConfirmada(idx, true);
        seleccionarLineaGcode(idx);
        actualizarEstadoGiroVisualizador();
        segTranscurridos++;
        const tiempoStr = `${String(Math.floor(segTranscurridos / 60)).padStart(2, '0')}:${String(segTranscurridos % 60).padStart(2, '0')}`;
        elementos.metricaTiempoTranscurrido.textContent = tiempoStr;
        elementos.telemetriaTiempoTranscurrido.textContent = tiempoStr;
        if (idx < totalLineas-1) estado.indiceLineaActiva = idx+1;
        else detenerMecanizado('Completado');
      }, 50);
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
    actualizarEstadoGiroVisualizador();
  }

  function detenerMecanizado(resultado = 'Detenido', enviarParada = true) {
    if (typeof resultado !== 'string' || !resultado) {
      resultado = 'Detenido';
    }
    estado.enEjecucion = false;
    estado.enPausa = false;
    if (estado.temporizadorEjecucion) clearInterval(estado.temporizadorEjecucion);

    if (window.puenteCNC && enviarParada && resultado !== 'Completado') window.puenteCNC.detener();

    elementos.botonIniciarMecanizado.classList.remove('hidden');
    elementos.botonPausarMecanizado.classList.add('hidden');
    elementos.botonDetenerMecanizado.classList.add('hidden');
    elementos.botonPausarMecanizado.innerHTML = '<i class="fa-solid fa-pause"></i> PAUSA';
    establecerEstadoOperativo('IDLE');
    if (window.visualizadorCNC) {
      window.visualizadorCNC.reiniciarProgresoEjecucion();
    }
    actualizarEstadoGiroVisualizador();

    // RF-10 / C.U-06-03: Registrar en el historial de trabajo
    if (estado.trabajoActual) {
      const duracionSeg = Math.max(1, Math.round((Date.now() - estado.trabajoActual.tiempoInicioMs) / 1000));
      const min = String(Math.floor(duracionSeg / 60)).padStart(2, '0');
      const seg = String(duracionSeg % 60).padStart(2, '0');
      const duracionStr = `${min}:${seg}`;

      let estadoFinal = resultado;
      if (estado.trabajoActual.esSimulacion) {
        estadoFinal = (resultado === 'Completado') ? 'Simulación Virtual' : 'Simulación Cancelada';
      }

      HistorialManager.registrarTrabajo({
        archivo: estado.trabajoActual.archivo,
        fecha: estado.trabajoActual.fecha,
        herramienta: estado.trabajoActual.herramienta === 'lapiz' ? 'Lápiz Didáctico' : (estado.trabajoActual.herramienta === 'laser' ? 'Diodo Láser' : 'Fresa CNC'),
        duracion: duracionStr,
        duracionSeg: duracionSeg,
        lineas: `${estado.indiceLineaActiva + 1} / ${estado.trabajoActual.totalLineas}`,
        resultado: estadoFinal
      });

      if (estadoFinal === 'Simulación Virtual') {
        imprimirEnConsola('c-system', '[SIMULADOR] Simulación virtual completada exitosamente.');
      } else if (estadoFinal === 'Completado') {
        imprimirEnConsola('c-system', `[FIN DE PROGRAMA] Programa completado sin incidencias en ${duracionStr} (MSJ_28).`);
      }

      // Si el mecanizado o simulación concluyó con éxito, mostrar el recuadro con la leyenda de finalizado y tiempo real
      if (resultado === 'Completado' || estadoFinal === 'Simulación Virtual' || estadoFinal === 'Completado') {
        mostrarModalFinMecanizado({
          archivo: estado.trabajoActual.archivo,
          duracion: duracionStr,
          duracionSeg: duracionSeg,
          totalLineas: estado.trabajoActual.totalLineas,
          lineas: `${estado.trabajoActual.totalLineas} / ${estado.trabajoActual.totalLineas}`,
          herramienta: estado.trabajoActual.herramienta === 'lapiz' ? 'Lápiz Didáctico' : (estado.trabajoActual.herramienta === 'laser' ? 'Diodo Láser' : 'Fresa CNC'),
          esSimulacion: Boolean(estado.trabajoActual.esSimulacion)
        });
      }

      estado.trabajoActual = null;
    }
  }

  elementos.botonIniciarMecanizado.addEventListener('click', iniciarMecanizado);
  elementos.botonPausarMecanizado.addEventListener('click', pausarMecanizado);
  elementos.botonDetenerMecanizado.addEventListener('click', () => detenerMecanizado('Detenido'));

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
      if (evento.repeat) { evento.preventDefault(); return; }
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
    else if (evento.key === 'Escape') {
      evento.preventDefault();
      // 1. Si está en pantalla completa, salir prioritariamente sin activar paro de emergencia
      if (document.fullscreenElement || estado.esPantallaCompleta) {
        conmutarPantallaCompleta();
        return;
      }
      // 2. Si hay un modal abierto, cerrarlo
      const modalAbierto = [
        elementos.modalDiccionario,
        elementos.modalManual,
        elementos.modalConfiguracion,
        elementos.modalSeleccionHerramienta,
        elementos.modalSeguridad,
        elementos.modalTutorial
      ].find(m => m && !m.classList.contains('hidden'));
      if (modalAbierto) {
        modalAbierto.classList.add('hidden');
        if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
        return;
      }
      // 3. Paro de emergencia solo si la máquina está en ejecución o en reposo normal
      elementos.botonParoEmergencia.click();
    }
  });

  // ==========================================
  // GESTIÓN DE MODALES Y MENÚS
  // ==========================================
  // Aplicación dinámica de temas visuales
  function aplicarTema(tema) {
    document.body.classList.remove('theme-cyber', 'theme-classic');
    if (tema === 'cyber') {
      document.body.classList.add('theme-cyber');
    } else if (tema === 'classic') {
      document.body.classList.add('theme-classic');
    }
    localStorage.setItem('cnc_theme', tema);
  }
  window.aplicarTema = aplicarTema;

  // Carga y sincronización de valores reales en el Modal de Configuración
  function cargarValoresModalConfiguracion() {
    // 1. Ajustes de Conexión
    const selPort = document.getElementById('cfg-port');
    if (selPort && elementos.selectorPuertoCom) {
      selPort.innerHTML = '';
      Array.from(elementos.selectorPuertoCom.options).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.textContent;
        if (opt.value === elementos.selectorPuertoCom.value) o.selected = true;
        selPort.appendChild(o);
      });
      if (selPort.options.length === 0) {
        const o = document.createElement('option');
        o.value = 'COM3';
        o.textContent = 'COM3 (Arduino Nano / Uno CH340)';
        o.selected = true;
        selPort.appendChild(o);
      }
    }
    const cfgBaud = document.getElementById('cfg-baud');
    if (cfgBaud) cfgBaud.value = localStorage.getItem('cnc_baudrate') || '115200';

    const cfgBuffer = document.getElementById('cfg-buffer-size');
    if (cfgBuffer) cfgBuffer.value = localStorage.getItem('cnc_buffer_size') || '128';

    const cfgDtr = document.getElementById('cfg-dtr-reset');
    if (cfgDtr) cfgDtr.checked = localStorage.getItem('cnc_dtr_reset') !== 'false';

    const cfgOk = document.getElementById('cfg-ok-check');
    if (cfgOk) cfgOk.checked = localStorage.getItem('cnc_ok_check') !== 'false';

    // 2. Información de la Máquina (GRBL)
    const cfgStepX = document.getElementById('cfg-step-x');
    if (cfgStepX) cfgStepX.value = localStorage.getItem('cnc_step_x') || '250.000';
    const cfgStepY = document.getElementById('cfg-step-y');
    if (cfgStepY) cfgStepY.value = localStorage.getItem('cnc_step_y') || '250.000';
    const cfgStepZ = document.getElementById('cfg-step-z');
    if (cfgStepZ) cfgStepZ.value = localStorage.getItem('cnc_step_z') || '400.000';

    const cfgTravelX = document.getElementById('cfg-travel-x');
    if (cfgTravelX) cfgTravelX.value = localStorage.getItem('cnc_travel_x') || '300.0';
    const cfgTravelY = document.getElementById('cfg-travel-y');
    if (cfgTravelY) cfgTravelY.value = localStorage.getItem('cnc_travel_y') || '200.0';
    const cfgTravelZ = document.getElementById('cfg-travel-z');
    if (cfgTravelZ) cfgTravelZ.value = localStorage.getItem('cnc_travel_z') || '60.0';

    const cfgMaxX = document.getElementById('cfg-maxrate-x');
    if (cfgMaxX) cfgMaxX.value = localStorage.getItem('cnc_maxrate_x') || '1500.0';
    const cfgMaxY = document.getElementById('cfg-maxrate-y');
    if (cfgMaxY) cfgMaxY.value = localStorage.getItem('cnc_maxrate_y') || '1500.0';
    const cfgMaxZ = document.getElementById('cfg-maxrate-z');
    if (cfgMaxZ) cfgMaxZ.value = localStorage.getItem('cnc_maxrate_z') || '600.0';

    const cfgAccelX = document.getElementById('cfg-accel-x');
    if (cfgAccelX) cfgAccelX.value = localStorage.getItem('cnc_accel_x') || '50.0';
    const cfgAccelY = document.getElementById('cfg-accel-y');
    if (cfgAccelY) cfgAccelY.value = localStorage.getItem('cnc_accel_y') || '50.0';
    const cfgAccelZ = document.getElementById('cfg-accel-z');
    if (cfgAccelZ) cfgAccelZ.value = localStorage.getItem('cnc_accel_z') || '50.0';

    // 2.1 Inversión de Sentido de Giro GRBL ($3)
    const cfgDirX = document.getElementById('cfg-dir-invert-x');
    const cfgDirY = document.getElementById('cfg-dir-invert-y');
    const cfgDirZ = document.getElementById('cfg-dir-invert-z');
    const lblDirMask = document.getElementById('lbl-cfg-dir-mask');
    const dirMask = parseInt(localStorage.getItem('cnc_dir_invert_mask') || '0', 10);
    if (cfgDirX) cfgDirX.checked = Boolean(dirMask & 1);
    if (cfgDirY) cfgDirY.checked = Boolean(dirMask & 2);
    if (cfgDirZ) cfgDirZ.checked = Boolean(dirMask & 4);
    if (lblDirMask) lblDirMask.textContent = `Valor $3=${dirMask}`;

    const fnActualizarMask = () => {
      let mask = 0;
      if (document.getElementById('cfg-dir-invert-x')?.checked) mask += 1;
      if (document.getElementById('cfg-dir-invert-y')?.checked) mask += 2;
      if (document.getElementById('cfg-dir-invert-z')?.checked) mask += 4;
      const lbl = document.getElementById('lbl-cfg-dir-mask');
      if (lbl) lbl.textContent = `Valor $3=${mask}`;
    };
    [cfgDirX, cfgDirY, cfgDirZ].forEach(chk => {
      if (chk) chk.onchange = fnActualizarMask;
    });

    // 3. Ajustes Emisor (Streamer)
    const cfgStreamer = document.getElementById('cfg-streamer-mode');
    if (cfgStreamer) cfgStreamer.value = localStorage.getItem('cnc_streamer_mode') || 'counting';

    const cfgInterval = document.getElementById('cfg-status-interval');
    if (cfgInterval) cfgInterval.value = localStorage.getItem('cnc_status_interval') || '100';

    const cfgSkip = document.getElementById('cfg-skip-comments');
    if (cfgSkip) cfgSkip.checked = localStorage.getItem('cnc_skip_comments') !== 'false';

    const cfgPauseM6 = document.getElementById('cfg-pause-m6');
    if (cfgPauseM6) cfgPauseM6.checked = localStorage.getItem('cnc_pause_m6') !== 'false';

    const cfgInvertJogX = document.getElementById('cfg-invert-jog-x');
    if (cfgInvertJogX) cfgInvertJogX.checked = localStorage.getItem('cnc_invert_jog_x') === 'true';

    // 4. Interfaz de Usuario
    const cfgTheme = document.getElementById('cfg-theme-select');
    if (cfgTheme) cfgTheme.value = localStorage.getItem('cnc_theme') || 'dark';

    const cfgUnits = document.getElementById('cfg-units-select');
    if (cfgUnits) cfgUnits.value = localStorage.getItem('cnc_units') || 'mm';

    const cfgDecimals = document.getElementById('cfg-dro-decimals');
    if (cfgDecimals) cfgDecimals.value = localStorage.getItem('cnc_dro_decimals') || '3';

    // 6. Ajustes Visualizador
    const cfgCutColor = document.getElementById('cfg-color-cut');
    if (cfgCutColor) cfgCutColor.value = localStorage.getItem('cnc_color_cut') || '#00e5ff';

    const cfgRapidColor = document.getElementById('cfg-color-rapid');
    if (cfgRapidColor) cfgRapidColor.value = localStorage.getItem('cnc_color_rapid') || '#708090';

    const cfgReticle = document.getElementById('cfg-show-tool-reticle');
    if (cfgReticle) cfgReticle.checked = localStorage.getItem('cnc_show_reticle') !== 'false';

    const cfgBedLimits = document.getElementById('cfg-show-bed-limits');
    if (cfgBedLimits) cfgBedLimits.checked = localStorage.getItem('cnc_show_bed_limits') !== 'false';

    const cfgTool3D = document.getElementById('cfg-show-tool-3d');
    if (cfgTool3D) cfgTool3D.checked = localStorage.getItem('cnc_show_tool_3d') !== 'false';

    const cfgToolType = document.getElementById('cfg-select-tool-type');
    if (cfgToolType) cfgToolType.value = estado.tipoHerramienta || 'fresa';

    // 7. Ajustes Consola
    const cfgAutoscroll = document.getElementById('cfg-console-autoscroll');
    if (cfgAutoscroll) cfgAutoscroll.checked = localStorage.getItem('cnc_console_autoscroll') !== 'false';

    const cfgTimestamps = document.getElementById('cfg-console-timestamps');
    if (cfgTimestamps) cfgTimestamps.checked = localStorage.getItem('cnc_console_timestamps') !== 'false';

    const cfgFilter = document.getElementById('cfg-console-filter-status');
    if (cfgFilter) cfgFilter.checked = localStorage.getItem('cnc_console_filter_status') === 'true';

    const cfgHighlight = document.getElementById('cfg-console-highlight-alarms');
    if (cfgHighlight) cfgHighlight.checked = localStorage.getItem('cnc_console_highlight_alarms') !== 'false';
  }

  elementos.botonAbrirConfiguracion.addEventListener('click', () => {
    cargarValoresModalConfiguracion();
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
    // 1. Conexión Serial
    const selPort = document.getElementById('cfg-port');
    const baudSelect = document.getElementById('cfg-baud');
    const bufferInput = document.getElementById('cfg-buffer-size');
    const dtrCheck = document.getElementById('cfg-dtr-reset');
    const okCheck = document.getElementById('cfg-ok-check');

    if (baudSelect) localStorage.setItem('cnc_baudrate', baudSelect.value);
    if (bufferInput) localStorage.setItem('cnc_buffer_size', bufferInput.value);
    if (dtrCheck) localStorage.setItem('cnc_dtr_reset', dtrCheck.checked);
    if (okCheck) localStorage.setItem('cnc_ok_check', okCheck.checked);

    if (selPort && selPort.value && selPort.value !== elementos.selectorPuertoCom.value) {
      elementos.selectorPuertoCom.value = selPort.value;
      conectarPuertoSeleccionado();
    }

    // 2. Parámetros de Máquina ($100, $101, $102) y ($130, $131, $132)
    const stepX = parseFloat(document.getElementById('cfg-step-x')?.value) || 250.0;
    const stepY = parseFloat(document.getElementById('cfg-step-y')?.value) || 250.0;
    const stepZ = parseFloat(document.getElementById('cfg-step-z')?.value) || 400.0;

    localStorage.setItem('cnc_step_x', stepX.toFixed(3));
    localStorage.setItem('cnc_step_y', stepY.toFixed(3));
    localStorage.setItem('cnc_step_z', stepZ.toFixed(3));

    const travelX = parseFloat(document.getElementById('cfg-travel-x')?.value) || 300.0;
    const travelY = parseFloat(document.getElementById('cfg-travel-y')?.value) || 200.0;
    const travelZ = parseFloat(document.getElementById('cfg-travel-z')?.value) || 60.0;

    localStorage.setItem('cnc_travel_x', travelX);
    localStorage.setItem('cnc_travel_y', travelY);
    localStorage.setItem('cnc_travel_z', travelZ);

    if (window.visualizadorCNC) {
      window.visualizadorCNC.establecerLimitesMaquina(travelX, travelY, travelZ);
    }

    // Enviar a GRBL tanto pasos/mm como límites de recorrido
    if (window.puenteCNC) {
      window.puenteCNC.enviarMDI(`$100=${stepX.toFixed(3)}`);
      window.puenteCNC.enviarMDI(`$101=${stepY.toFixed(3)}`);
      window.puenteCNC.enviarMDI(`$102=${stepZ.toFixed(3)}`);
      window.puenteCNC.enviarMDI(`$130=${travelX.toFixed(1)}`);
      window.puenteCNC.enviarMDI(`$131=${travelY.toFixed(1)}`);
      window.puenteCNC.enviarMDI(`$132=${travelZ.toFixed(1)}`);

      const maxRateX = parseFloat(document.getElementById('cfg-maxrate-x')?.value) || 1500.0;
      const maxRateY = parseFloat(document.getElementById('cfg-maxrate-y')?.value) || 1500.0;
      const maxRateZ = parseFloat(document.getElementById('cfg-maxrate-z')?.value) || 600.0;
      localStorage.setItem('cnc_maxrate_x', maxRateX);
      localStorage.setItem('cnc_maxrate_y', maxRateY);
      localStorage.setItem('cnc_maxrate_z', maxRateZ);

      const accelX = parseFloat(document.getElementById('cfg-accel-x')?.value) || 50.0;
      const accelY = parseFloat(document.getElementById('cfg-accel-y')?.value) || 50.0;
      const accelZ = parseFloat(document.getElementById('cfg-accel-z')?.value) || 50.0;
      localStorage.setItem('cnc_accel_x', accelX);
      localStorage.setItem('cnc_accel_y', accelY);
      localStorage.setItem('cnc_accel_z', accelZ);

      window.puenteCNC.enviarMDI(`$110=${maxRateX.toFixed(1)}`);
      window.puenteCNC.enviarMDI(`$111=${maxRateY.toFixed(1)}`);
      window.puenteCNC.enviarMDI(`$112=${maxRateZ.toFixed(1)}`);
      window.puenteCNC.enviarMDI(`$120=${accelX.toFixed(1)}`);
      window.puenteCNC.enviarMDI(`$121=${accelY.toFixed(1)}`);
      window.puenteCNC.enviarMDI(`$122=${accelZ.toFixed(1)}`);
    }

    // 2.1 Inversión de Sentido de Giro GRBL ($3)
    let maskDir = 0;
    if (document.getElementById('cfg-dir-invert-x')?.checked) maskDir += 1;
    if (document.getElementById('cfg-dir-invert-y')?.checked) maskDir += 2;
    if (document.getElementById('cfg-dir-invert-z')?.checked) maskDir += 4;
    localStorage.setItem('cnc_dir_invert_mask', maskDir);
    if (window.puenteCNC) {
      window.puenteCNC.enviarMDI(`$3=${maskDir}`);
    }

    // 3. Emisor (Streamer)
    const streamMode = document.getElementById('cfg-streamer-mode')?.value || 'counting';
    const statusInt = parseInt(document.getElementById('cfg-status-interval')?.value, 10) || 100;
    const skipCom = document.getElementById('cfg-skip-comments')?.checked !== false;
    const pauseM6 = document.getElementById('cfg-pause-m6')?.checked !== false;

    localStorage.setItem('cnc_streamer_mode', streamMode);
    localStorage.setItem('cnc_status_interval', statusInt);
    localStorage.setItem('cnc_skip_comments', skipCom);
    localStorage.setItem('cnc_pause_m6', pauseM6);

    const chkInvertJogX = document.getElementById('cfg-invert-jog-x');
    if (chkInvertJogX) {
      localStorage.setItem('cnc_invert_jog_x', chkInvertJogX.checked);
    }

    if (window.puenteCNC && typeof window.puenteCNC.establecerPausaM6 === 'function') {
      window.puenteCNC.establecerPausaM6(pauseM6);
    }

    // 4. Interfaz de Usuario
    const themeSel = document.getElementById('cfg-theme-select')?.value || 'dark';
    aplicarTema(themeSel);

    const unitsSel = document.getElementById('cfg-units-select')?.value || 'mm';
    localStorage.setItem('cnc_units', unitsSel);

    const droDec = parseInt(document.getElementById('cfg-dro-decimals')?.value, 10) || 3;
    localStorage.setItem('cnc_dro_decimals', droDec);
    actualizarLecturasDRO();

    // 6. Visualizador
    const cutColor = document.getElementById('cfg-color-cut')?.value || '#00e5ff';
    const rapidColor = document.getElementById('cfg-color-rapid')?.value || '#708090';
    const showReticle = document.getElementById('cfg-show-tool-reticle')?.checked !== false;
    const showBed = document.getElementById('cfg-show-bed-limits')?.checked !== false;
    const show3D = document.getElementById('cfg-show-tool-3d')?.checked !== false;

    if (window.visualizadorCNC) {
      window.visualizadorCNC.establecerColorCorte(cutColor);
      window.visualizadorCNC.establecerColorRapido(rapidColor);
      window.visualizadorCNC.establecerMostrarRetícula(showReticle);
      window.visualizadorCNC.establecerMostrarLimitesMesa(showBed);
      window.visualizadorCNC.establecerMostrarHerramienta3D(show3D);
    }

    const selHerramienta = document.getElementById('cfg-select-tool-type');
    if (selHerramienta && selHerramienta.value) {
      actualizarUIPorTipoHerramienta(selHerramienta.value);
    }

    // 7. Consola
    const autoScroll = document.getElementById('cfg-console-autoscroll')?.checked !== false;
    const timeStamps = document.getElementById('cfg-console-timestamps')?.checked !== false;
    const filterStatus = document.getElementById('cfg-console-filter-status')?.checked === true;
    const highlightAlarms = document.getElementById('cfg-console-highlight-alarms')?.checked !== false;

    localStorage.setItem('cnc_console_autoscroll', autoScroll);
    localStorage.setItem('cnc_console_timestamps', timeStamps);
    localStorage.setItem('cnc_console_filter_status', filterStatus);
    localStorage.setItem('cnc_console_highlight_alarms', highlightAlarms);

    elementos.modalConfiguracion.classList.add('hidden');
    imprimirEnConsola('c-ok', `[CONFIG] Configuración guardada: Área ${travelX}×${travelY}×${travelZ}mm | Pasos X:${stepX} Y:${stepY} Z:${stepZ} | Tema: ${themeSel} | Unidades: ${unitsSel}.`);
    if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
  });

  // Asistente Didáctico de Calibración de Pasos/mm
  const btnCalcularPasos = document.getElementById('btn-calcular-pasos');
  if (btnCalcularPasos) {
    btnCalcularPasos.addEventListener('click', () => {
      const eje = document.getElementById('calib-eje')?.value || 'X';
      const comandada = parseFloat(document.getElementById('calib-dist-comandada')?.value);
      const real = parseFloat(document.getElementById('calib-dist-real')?.value);
      const lblResultado = document.getElementById('lbl-resultado-calibracion');

      if (isNaN(comandada) || comandada <= 0 || isNaN(real) || real <= 0) {
        if (lblResultado) {
          lblResultado.style.color = '#dc2626';
          lblResultado.textContent = 'Valores inválidos. Ingrese distancias mayores a 0.';
        }
        return;
      }

      const inputEje = document.getElementById(`cfg-step-${eje.toLowerCase()}`);
      const actual = parseFloat(inputEje ? inputEje.value : '250.0') || 250.0;
      const nuevo = (actual * comandada) / real;

      if (inputEje) {
        inputEje.value = nuevo.toFixed(3);
      }
      localStorage.setItem(`cnc_step_${eje.toLowerCase()}`, nuevo.toFixed(3));

      const cmdNum = (eje === 'X') ? '100' : (eje === 'Y' ? '101' : '102');
      if (window.puenteCNC) {
        window.puenteCNC.enviarMDI(`$${cmdNum}=${nuevo.toFixed(3)}`);
      }

      if (lblResultado) {
        lblResultado.style.color = 'var(--green-start)';
        lblResultado.textContent = `✓ Eje ${eje}: $${cmdNum}=${nuevo.toFixed(3)} pasos/mm aplicado!`;
      }
      imprimirEnConsola('c-ok', `[CALIBRACIÓN] Nuevo valor para Eje ${eje}: $${cmdNum}=${nuevo.toFixed(3)} pasos/mm (Comandado: ${comandada}mm, Medido: ${real}mm).`);
    });
  }

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

  // Modal de Alerta de Seguridad (Interbloqueos de la Máquina)
  function mostrarAlertaSeguridadHusillo(titulo, encabezado, descripcion, accion) {
    if (elementos.tituloSeguridad && titulo) elementos.tituloSeguridad.textContent = titulo;
    if (elementos.encabezadoSeguridad && encabezado) elementos.encabezadoSeguridad.textContent = encabezado;
    if (elementos.descripcionSeguridad && descripcion) elementos.descripcionSeguridad.textContent = descripcion;

    const esM6 = (titulo && (titulo.includes('M6') || titulo.includes('HERRAMIENTA'))) ||
      (descripcion && (descripcion.includes('M6') || descripcion.includes('herramienta')));

    if (esM6) {
      estado.enEjecucion = true;
      estado.enPausa = true;
      establecerEstadoOperativo('HOLD');
      if (elementos.botonIniciarMecanizado) elementos.botonIniciarMecanizado.classList.add('hidden');
      if (elementos.botonPausarMecanizado) {
        elementos.botonPausarMecanizado.classList.remove('hidden');
        elementos.botonPausarMecanizado.disabled = false;
        elementos.botonPausarMecanizado.innerHTML = '<i class="fa-solid fa-play"></i> CONTINUAR';
      }
      if (elementos.botonDetenerMecanizado) elementos.botonDetenerMecanizado.classList.remove('hidden');

      if (elementos.accionSeguridad) {
        elementos.accionSeguridad.innerHTML = accion || '<b>Acción requerida:</b> Monte la herramienta indicada en la pinza y presione el botón <b>CONTINUAR</b> en el panel de control para seguir con el mecanizado.';
      }
    } else {
      if (elementos.accionSeguridad) {
        elementos.accionSeguridad.innerHTML = accion || '<b>Acción requerida:</b> Si necesita detener el husillo, presione primero <b>PAUSA</b> o <b>DETENER</b> en el panel de control de ejecución.';
      }
    }

    if (elementos.modalSeguridad) elementos.modalSeguridad.classList.remove('hidden');
    if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
  }
  window.mostrarAlertaSeguridadHusillo = mostrarAlertaSeguridadHusillo;

  if (elementos.botonCerrarSeguridad) {
    elementos.botonCerrarSeguridad.addEventListener('click', () => {
      elementos.modalSeguridad.classList.add('hidden');
      if (estado.enPausa && elementos.botonPausarMecanizado) {
        elementos.botonPausarMecanizado.classList.remove('hidden');
        elementos.botonPausarMecanizado.disabled = false;
        elementos.botonPausarMecanizado.innerHTML = '<i class="fa-solid fa-play"></i> CONTINUAR';
        elementos.botonPausarMecanizado.focus();
      }
      if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
    });
  }

  if (elementos.botonEntendidoSeguridad) {
    elementos.botonEntendidoSeguridad.addEventListener('click', () => {
      elementos.modalSeguridad.classList.add('hidden');
      if (estado.enPausa && elementos.botonPausarMecanizado) {
        elementos.botonPausarMecanizado.classList.remove('hidden');
        elementos.botonPausarMecanizado.disabled = false;
        elementos.botonPausarMecanizado.innerHTML = '<i class="fa-solid fa-play"></i> CONTINUAR';
        elementos.botonPausarMecanizado.focus();
      }
      if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
    });
  }

  if (elementos.modalSeguridad) {
    elementos.modalSeguridad.addEventListener('click', (evento) => {
      if (evento.target === elementos.modalSeguridad) {
        elementos.modalSeguridad.classList.add('hidden');
        if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
      }
    });
  }

  // Modal de Mecanizado Finalizado con Leyenda y Tiempo Real
  function mostrarModalFinMecanizado(datos) {
    if (!datos) return;
    if (elementos.lblFinTiempoReal) {
      const duracionSeg = datos.duracionSeg || 0;
      const min = Math.floor(duracionSeg / 60);
      const seg = duracionSeg % 60;
      let textoTiempo = '';
      if (min > 0) {
        textoTiempo = `${min}m ${seg}s (${datos.duracion || '00:00'})`;
      } else {
        textoTiempo = `${seg}s (${datos.duracion || '00:00'})`;
      }
      elementos.lblFinTiempoReal.textContent = textoTiempo;
    }
    if (elementos.lblFinArchivo) {
      elementos.lblFinArchivo.textContent = datos.archivo || 'Programa CNC';
      elementos.lblFinArchivo.title = datos.archivo || '';
    }
    if (elementos.lblFinLineas) {
      elementos.lblFinLineas.textContent = datos.lineas || `${datos.totalLineas || 0} / ${datos.totalLineas || 0}`;
    }
    if (elementos.lblFinHerramienta) {
      elementos.lblFinHerramienta.textContent = datos.herramienta || 'Fresa CNC';
    }
    if (elementos.lblFinTitulo) {
      elementos.lblFinTitulo.textContent = datos.esSimulacion ? 'Simulación Virtual Finalizada' : 'Mecanizado Finalizado';
    }
    if (elementos.lblFinSubtitulo) {
      elementos.lblFinSubtitulo.textContent = datos.esSimulacion
        ? 'Simulación completada con éxito'
        : 'Programa concluido satisfactoriamente';
    }
    if (elementos.lblFinEncabezado) {
      elementos.lblFinEncabezado.textContent = datos.esSimulacion
        ? '¡Simulación virtual completada con éxito!'
        : '¡Mecanizado completado con éxito!';
    }
    if (elementos.lblFinDescripcion) {
      elementos.lblFinDescripcion.textContent = datos.esSimulacion
        ? 'Se ha simulado el 100% de la trayectoria en el lienzo gráfico 2D/3D sin incidencias.'
        : 'Se han ejecutado todas las líneas del programa G-code y la máquina ha retornado a estado seguro.';
    }
    if (elementos.modalFinMecanizado) {
      elementos.modalFinMecanizado.classList.remove('hidden');
    }
    if (window.visualizadorCNC) {
      window.visualizadorCNC.solicitarRenderizado();
    }
  }
  window.mostrarModalFinMecanizado = mostrarModalFinMecanizado;

  if (elementos.botonCerrarFin) {
    elementos.botonCerrarFin.addEventListener('click', () => {
      if (elementos.modalFinMecanizado) elementos.modalFinMecanizado.classList.add('hidden');
      if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
    });
  }

  if (elementos.botonAceptarFin) {
    elementos.botonAceptarFin.addEventListener('click', () => {
      if (elementos.modalFinMecanizado) elementos.modalFinMecanizado.classList.add('hidden');
      if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
    });
  }

  if (elementos.botonVerHistorialFin) {
    elementos.botonVerHistorialFin.addEventListener('click', () => {
      if (elementos.modalFinMecanizado) elementos.modalFinMecanizado.classList.add('hidden');
      if (typeof HistorialManager !== 'undefined' && typeof HistorialManager.abrirModal === 'function') {
        HistorialManager.abrirModal();
      } else if (elementos.botonMenuHistorial) {
        elementos.botonMenuHistorial.click();
      } else if (elementos.botonAbrirHistorial) {
        elementos.botonAbrirHistorial.click();
      }
    });
  }

  if (elementos.modalFinMecanizado) {
    elementos.modalFinMecanizado.addEventListener('click', (evento) => {
      if (evento.target === elementos.modalFinMecanizado) {
        elementos.modalFinMecanizado.classList.add('hidden');
        if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
      }
    });
  }

  // ==========================================
  // GESTIÓN DE SELECCIÓN DE HERRAMIENTA (FRESA / LÁPIZ)
  // ==========================================
  let tipoHerramientaSeleccionada = estado.tipoHerramienta;

  async function actualizarUIPorTipoHerramienta(tipo) {
    if (estado.enEjecucion) {
      imprimirEnConsola('c-warn', '[BLOQUEO] Detenga el programa antes de cambiar la herramienta.');
      return;
    }
    if (window.puenteCNC && !await window.puenteCNC.establecerTipoHerramienta(tipo)) return;
    if (tipo === 'lapiz') {
      estado.tipoHerramienta = 'lapiz';
    } else if (tipo === 'laser' || tipo === 'láser') {
      estado.tipoHerramienta = 'laser';
    } else {
      estado.tipoHerramienta = 'fresa';
    }
    tipoHerramientaSeleccionada = estado.tipoHerramienta;
    localStorage.setItem('cnc_tipo_herramienta', estado.tipoHerramienta);

    if (window.visualizadorCNC) {
      window.visualizadorCNC.establecerTipoHerramienta(estado.tipoHerramienta);
    }



    const esLapiz = (estado.tipoHerramienta === 'lapiz');
    const esLaser = (estado.tipoHerramienta === 'laser');
    const esEn = (estado.idiomaActual === 'en');

    if (esLapiz) {
      estado.husilloActivo = false;
      if (elementos.bloqueHusillo) {
        elementos.bloqueHusillo.classList.remove('modo-laser');
        elementos.bloqueHusillo.classList.add('modo-lapiz');
      }
      if (elementos.iconoHeaderHusillo) {
        elementos.iconoHeaderHusillo.className = 'fa-solid fa-fan header-icon';
      }
      if (elementos.tituloBloqueHusillo) {
        elementos.tituloBloqueHusillo.textContent = esEn ? 'SPINDLE (INACTIVE)' : 'SPINDLE (INACTIVO)';
      }
      if (elementos.iconoVentiladorHusillo) {
        elementos.iconoVentiladorHusillo.className = 'fa-solid fa-fan spindle-icon';
        elementos.iconoVentiladorHusillo.classList.remove('fa-spin');
      }
      if (elementos.etiquetaUnidadHusillo) {
        elementos.etiquetaUnidadHusillo.textContent = 'RPM';
      }
      if (elementos.leyendaVelocidadHusillo) {
        elementos.leyendaVelocidadHusillo.textContent = esEn ? 'Speed' : 'Velocidad';
      }
      if (elementos.etiquetaTeleHusillo) {
        elementos.etiquetaTeleHusillo.textContent = 'SPINDLE';
      }
      if (elementos.botonAlternarHusillo) {
        elementos.botonAlternarHusillo.classList.remove('active', 'modo-laser');
        elementos.botonAlternarHusillo.classList.add('modo-lapiz');
      }
      if (elementos.textoBotonHusillo) {
        elementos.textoBotonHusillo.textContent = esEn ? 'Spindle Inactive (Pen)' : 'Spindle Inactivo (Lápiz)';
      }
      if (elementos.metricaEstadoHusillo) {
        elementos.metricaEstadoHusillo.textContent = esEn ? 'OFF (PEN)' : 'OFF (LÁPIZ)';
        elementos.metricaEstadoHusillo.classList.remove('highlight-cyan');
      }
      if (elementos.etiquetaRpmEnVivo) {
        elementos.etiquetaRpmEnVivo.textContent = '0 RPM';
      }
    } else if (esLaser) {
      if (elementos.bloqueHusillo) {
        elementos.bloqueHusillo.classList.remove('modo-lapiz');
        elementos.bloqueHusillo.classList.add('modo-laser');
      }
      if (elementos.iconoHeaderHusillo) {
        elementos.iconoHeaderHusillo.className = 'fa-solid fa-bolt header-icon text-purple';
      }
      if (elementos.tituloBloqueHusillo) {
        elementos.tituloBloqueHusillo.textContent = esEn ? 'LASER' : 'LÁSER';
      }
      if (elementos.iconoVentiladorHusillo) {
        elementos.iconoVentiladorHusillo.className = 'fa-solid fa-bolt spindle-icon';
        elementos.iconoVentiladorHusillo.classList.remove('fa-spin');
      }
      if (elementos.etiquetaUnidadHusillo) {
        elementos.etiquetaUnidadHusillo.textContent = esEn ? '% LIGHT' : '% LUZ';
      }
      if (elementos.entradaRpmHusillo) {
        elementos.entradaRpmHusillo.min = '0';
        elementos.entradaRpmHusillo.max = '100';
        elementos.entradaRpmHusillo.step = '5';
        elementos.entradaRpmHusillo.value = estado.potenciaLaserPct;
      }
      if (elementos.leyendaVelocidadHusillo) {
        elementos.leyendaVelocidadHusillo.textContent = esEn ? 'Laser Power' : 'Potencia Láser';
      }
      if (elementos.deslizadorModificadorHusillo) {
        elementos.deslizadorModificadorHusillo.min = '0';
        elementos.deslizadorModificadorHusillo.max = '100';
        elementos.deslizadorModificadorHusillo.step = '1';
        elementos.deslizadorModificadorHusillo.value = estado.potenciaLaserPct;
        elementos.deslizadorModificadorHusillo.title = esEn ? 'Laser light power (0% to 100%)' : 'Potencia de luz láser (0% a 100%)';
      }
      if (elementos.etiquetaTeleHusillo) {
        elementos.etiquetaTeleHusillo.textContent = esEn ? 'LASER' : 'LÁSER';
      }
      if (elementos.botonAlternarHusillo) {
        elementos.botonAlternarHusillo.classList.remove('modo-lapiz');
        elementos.botonAlternarHusillo.classList.add('modo-laser');
        if (estado.husilloActivo) {
          elementos.botonAlternarHusillo.classList.add('active');
          elementos.textoBotonHusillo.textContent = esEn ? 'Laser Diode ON' : 'Diodo Láser ON';
          elementos.metricaEstadoHusillo.textContent = esEn ? `${estado.potenciaLaserPct}% LIGHT` : `${estado.potenciaLaserPct}% LUZ`;
          elementos.metricaEstadoHusillo.classList.add('highlight-cyan');
          const pwmS = Math.round((estado.potenciaLaserPct / 100) * 1000);
          elementos.etiquetaRpmEnVivo.textContent = esEn ? `${estado.potenciaLaserPct}% Light (S${pwmS})` : `${estado.potenciaLaserPct}% Luz (S${pwmS})`;
        } else {
          elementos.botonAlternarHusillo.classList.remove('active');
          elementos.textoBotonHusillo.textContent = esEn ? 'Laser Diode OFF' : 'Diodo Láser OFF';
          elementos.metricaEstadoHusillo.textContent = 'OFF';
          elementos.metricaEstadoHusillo.classList.remove('highlight-cyan');
          elementos.etiquetaRpmEnVivo.textContent = esEn ? '0% Light (S0)' : '0% Luz (S0)';
        }
      }
    } else {
      if (elementos.bloqueHusillo) {
        elementos.bloqueHusillo.classList.remove('modo-laser', 'modo-lapiz');
      }
      if (elementos.iconoHeaderHusillo) {
        elementos.iconoHeaderHusillo.className = 'fa-solid fa-fan header-icon';
      }
      if (elementos.tituloBloqueHusillo) {
        elementos.tituloBloqueHusillo.textContent = 'SPINDLE';
      }
      if (elementos.iconoVentiladorHusillo) {
        elementos.iconoVentiladorHusillo.className = 'fa-solid fa-fan spindle-icon' + (estado.husilloActivo ? ' fa-spin' : '');
      }
      if (elementos.etiquetaUnidadHusillo) {
        elementos.etiquetaUnidadHusillo.textContent = 'RPM';
      }
      if (elementos.entradaRpmHusillo) {
        elementos.entradaRpmHusillo.min = '0';
        elementos.entradaRpmHusillo.max = '24000';
        elementos.entradaRpmHusillo.step = '500';
        elementos.entradaRpmHusillo.value = estado.revolucionesPorMinuto || 12000;
      }
      if (elementos.leyendaVelocidadHusillo) {
        elementos.leyendaVelocidadHusillo.textContent = esEn ? 'Speed' : 'Velocidad';
      }
      if (elementos.deslizadorModificadorHusillo) {
        elementos.deslizadorModificadorHusillo.min = '0';
        elementos.deslizadorModificadorHusillo.max = '150';
        elementos.deslizadorModificadorHusillo.step = '1';
        elementos.deslizadorModificadorHusillo.value = estado.modificadorHusillo || 100;
        elementos.deslizadorModificadorHusillo.title = 'Override Spindle (0% a 150%)';
      }
      if (elementos.etiquetaTeleHusillo) {
        elementos.etiquetaTeleHusillo.textContent = 'SPINDLE';
      }
      if (elementos.botonAlternarHusillo) {
        elementos.botonAlternarHusillo.classList.remove('modo-lapiz', 'modo-laser');
        if (estado.husilloActivo) {
          elementos.botonAlternarHusillo.classList.add('active');
          elementos.textoBotonHusillo.textContent = 'Spindle ON';
          elementos.metricaEstadoHusillo.textContent = 'ON';
          elementos.metricaEstadoHusillo.classList.add('highlight-cyan');
          const rpmAjustadas = Math.round((estado.revolucionesPorMinuto || 12000) * (estado.modificadorHusillo / 100));
          elementos.etiquetaRpmEnVivo.textContent = `${rpmAjustadas} RPM`;
        } else {
          elementos.botonAlternarHusillo.classList.remove('active');
          elementos.textoBotonHusillo.textContent = 'Spindle OFF';
          elementos.metricaEstadoHusillo.textContent = 'OFF';
          elementos.metricaEstadoHusillo.classList.remove('highlight-cyan');
          elementos.etiquetaRpmEnVivo.textContent = '0 RPM';
        }
      }
    }
    actualizarEstadoGiroVisualizador();

    const prefijoTab = document.getElementById('lbl-tab-tool-prefix');
    if (prefijoTab) {
      prefijoTab.textContent = esEn ? 'Tool:' : 'Herramienta:';
    }

    if (elementos.etiquetaNombreHerramienta) {
      elementos.etiquetaNombreHerramienta.textContent = esLapiz ? (esEn ? 'Pen' : 'Lápiz') : (esLaser ? (esEn ? 'Laser Diode' : 'Diodo Láser') : (esEn ? 'CNC Endmill' : 'Fresa CNC'));
    }
    if (elementos.etiquetaBadgeHerramienta) {
      elementos.etiquetaBadgeHerramienta.textContent = esLapiz
        ? (esEn ? 'TOOL POSITION (PEN)' : 'POSICIÓN HERRAMIENTA (LÁPIZ)')
        : (esLaser ? (esEn ? 'TOOL POSITION (LASER)' : 'POSICIÓN HERRAMIENTA (LÁSER)') : (esEn ? 'TOOL POSITION (ENDMILL)' : 'POSICIÓN HERRAMIENTA (FRESA)'));
    }
    if (elementos.textoLegendHerramienta) {
      elementos.textoLegendHerramienta.textContent = esLapiz
        ? (esEn ? 'Drawing Pen' : 'Lápiz Didáctico')
        : (esLaser ? (esEn ? 'Laser Diode' : 'Diodo Láser') : (esEn ? 'CNC Endmill' : 'Fresa CNC'));
    }
    if (elementos.iconoLegendHerramienta) {
      if (esLapiz) {
        elementos.iconoLegendHerramienta.className = 'fa-solid fa-pencil legend-symbol icon-tool';
      } else if (esLaser) {
        elementos.iconoLegendHerramienta.className = 'fa-solid fa-bolt legend-symbol icon-tool text-purple';
      } else {
        elementos.iconoLegendHerramienta.className = 'fa-solid fa-bore-hole legend-symbol icon-tool';
      }
    }

    const elemDone = document.getElementById('legend-line-done');
    const lblDone = document.getElementById('lbl-legend-done');
    if (elemDone) {
      if (esLaser) {
        elemDone.style.backgroundColor = '#c084fc';
        elemDone.style.boxShadow = '0 0 6px rgba(192, 132, 252, 0.6)';
        if (lblDone) lblDone.textContent = 'Ya grabado (Láser)';
      } else if (esLapiz) {
        elemDone.style.backgroundColor = '#f59e0b';
        elemDone.style.boxShadow = '0 0 6px rgba(245, 158, 11, 0.6)';
        if (lblDone) lblDone.textContent = 'Ya dibujado (Lápiz)';
      } else {
        elemDone.style.backgroundColor = '#22c55e';
        elemDone.style.boxShadow = '0 0 6px rgba(34, 197, 94, 0.6)';
        if (lblDone) lblDone.textContent = 'Ya cortado (Fresa)';
      }
    }

    if (elementos.selectorConfigHerramienta) {
      elementos.selectorConfigHerramienta.value = estado.tipoHerramienta;
    }

    if (elementos.tarjetaToolFresa && elementos.tarjetaToolLapiz) {
      elementos.tarjetaToolFresa.classList.toggle('active', estado.tipoHerramienta === 'fresa');
      elementos.tarjetaToolLapiz.classList.toggle('active', estado.tipoHerramienta === 'lapiz');
      if (elementos.tarjetaToolLaser) {
        elementos.tarjetaToolLaser.classList.toggle('active', estado.tipoHerramienta === 'laser');
      }
    }
  }
  window.actualizarUIPorTipoHerramienta = actualizarUIPorTipoHerramienta;

  function abrirModalSeleccionHerramienta() {
    tipoHerramientaSeleccionada = estado.tipoHerramienta;
    if (elementos.tarjetaToolFresa && elementos.tarjetaToolLapiz) {
      elementos.tarjetaToolFresa.classList.toggle('active', tipoHerramientaSeleccionada === 'fresa');
      elementos.tarjetaToolLapiz.classList.toggle('active', tipoHerramientaSeleccionada === 'lapiz');
      if (elementos.tarjetaToolLaser) {
        elementos.tarjetaToolLaser.classList.toggle('active', tipoHerramientaSeleccionada === 'laser');
      }
    }
    if (elementos.modalSeleccionHerramienta) {
      elementos.modalSeleccionHerramienta.classList.remove('hidden');
    }
    if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
  }

  if (elementos.botonTabHerramienta) {
    elementos.botonTabHerramienta.addEventListener('click', () => {
      abrirModalSeleccionHerramienta();
    });
  }

  if (elementos.botonTabTrayectoria) {
    elementos.botonTabTrayectoria.addEventListener('click', () => {
      elementos.botonTabTrayectoria.classList.add('active');
      if (elementos.botonTabHerramienta) elementos.botonTabHerramienta.classList.remove('active');
      if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
    });
  }

  if (elementos.botonMenuSeleccionarHerramienta) {
    elementos.botonMenuSeleccionarHerramienta.addEventListener('click', () => {
      abrirModalSeleccionHerramienta();
    });
  }

  if (elementos.tarjetaToolFresa) {
    elementos.tarjetaToolFresa.addEventListener('click', () => {
      tipoHerramientaSeleccionada = 'fresa';
      elementos.tarjetaToolFresa.classList.add('active');
      elementos.tarjetaToolLapiz.classList.remove('active');
      if (elementos.tarjetaToolLaser) elementos.tarjetaToolLaser.classList.remove('active');
    });
  }

  if (elementos.tarjetaToolLapiz) {
    elementos.tarjetaToolLapiz.addEventListener('click', () => {
      tipoHerramientaSeleccionada = 'lapiz';
      elementos.tarjetaToolLapiz.classList.add('active');
      elementos.tarjetaToolFresa.classList.remove('active');
      if (elementos.tarjetaToolLaser) elementos.tarjetaToolLaser.classList.remove('active');
    });
  }

  if (elementos.tarjetaToolLaser) {
    elementos.tarjetaToolLaser.addEventListener('click', () => {
      tipoHerramientaSeleccionada = 'laser';
      elementos.tarjetaToolLaser.classList.add('active');
      elementos.tarjetaToolFresa.classList.remove('active');
      elementos.tarjetaToolLapiz.classList.remove('active');
    });
  }

  if (elementos.botonAplicarModalHerramienta) {
    elementos.botonAplicarModalHerramienta.addEventListener('click', () => {
      actualizarUIPorTipoHerramienta(tipoHerramientaSeleccionada);
      if (elementos.modalSeleccionHerramienta) {
        elementos.modalSeleccionHerramienta.classList.add('hidden');
      }
      let nombreLargo = 'Fresa de Corte CNC (Herramienta Actual)';
      if (estado.tipoHerramienta === 'lapiz') nombreLargo = 'Lápiz de Grafito (Plotter Didáctico)';
      else if (estado.tipoHerramienta === 'laser') nombreLargo = 'Diodo Láser (Grabado / Corte Óptico)';
      imprimirEnConsola('c-info', `[HERRAMIENTA] Herramienta activa cambiada a: ${nombreLargo}.`);
      if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
    });
  }

  if (elementos.botonCerrarModalHerramienta) {
    elementos.botonCerrarModalHerramienta.addEventListener('click', () => {
      if (elementos.modalSeleccionHerramienta) elementos.modalSeleccionHerramienta.classList.add('hidden');
    });
  }

  if (elementos.botonCancelarModalHerramienta) {
    elementos.botonCancelarModalHerramienta.addEventListener('click', () => {
      if (elementos.modalSeleccionHerramienta) elementos.modalSeleccionHerramienta.classList.add('hidden');
    });
  }

  if (elementos.modalSeleccionHerramienta) {
    elementos.modalSeleccionHerramienta.addEventListener('click', (evento) => {
      if (evento.target === elementos.modalSeleccionHerramienta) {
        elementos.modalSeleccionHerramienta.classList.add('hidden');
      }
    });
  }

  if (elementos.selectorConfigHerramienta) {
    elementos.selectorConfigHerramienta.addEventListener('change', (e) => {
      actualizarUIPorTipoHerramienta(e.target.value);
    });
  }

  // ==========================================
  // LÓGICA INTERACTIVA DEL DICCIONARIO G-CODE
  // ==========================================
  let categoriaFiltroDiccionario = 'all';

  function aplicarFiltroDiccionario() {
    if (!elementos.cuerpoTablaDiccionario) return;
    const consulta = (elementos.campoBusquedaDiccionario ? elementos.campoBusquedaDiccionario.value : '').toLowerCase().trim();
    const filas = elementos.cuerpoTablaDiccionario.querySelectorAll('tr');
    let visibles = 0;

    filas.forEach(fila => {
      const catFila = fila.getAttribute('data-category') || '';
      const coincideCategoria = (categoriaFiltroDiccionario === 'all') || (catFila === categoriaFiltroDiccionario);
      const coincideTexto = !consulta || fila.textContent.toLowerCase().includes(consulta);

      if (coincideCategoria && coincideTexto) {
        fila.style.display = '';
        visibles++;
      } else {
        fila.style.display = 'none';
      }
    });

    if (elementos.etiquetaConteoDiccionario) {
      elementos.etiquetaConteoDiccionario.textContent = visibles;
    }
  }

  if (elementos.campoBusquedaDiccionario) {
    elementos.campoBusquedaDiccionario.addEventListener('input', aplicarFiltroDiccionario);
  }

  if (elementos.botonesFiltroDiccionario) {
    elementos.botonesFiltroDiccionario.forEach(btn => {
      btn.addEventListener('click', () => {
        elementos.botonesFiltroDiccionario.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        categoriaFiltroDiccionario = btn.getAttribute('data-category') || 'all';
        aplicarFiltroDiccionario();
      });
    });
  }

  if (elementos.botonCerrarDiccionario) {
    elementos.botonCerrarDiccionario.addEventListener('click', () => {
      if (elementos.modalDiccionario) elementos.modalDiccionario.classList.add('hidden');
    });
  }

  if (elementos.botonCerrarDiccionarioFooter) {
    elementos.botonCerrarDiccionarioFooter.addEventListener('click', () => {
      if (elementos.modalDiccionario) elementos.modalDiccionario.classList.add('hidden');
    });
  }

  if (elementos.botonMenuDiccionario) {
    elementos.botonMenuDiccionario.addEventListener('click', () => {
      if (elementos.modalDiccionario) {
        elementos.modalDiccionario.classList.remove('hidden');
        if (elementos.campoBusquedaDiccionario) {
          elementos.campoBusquedaDiccionario.focus();
        }
        imprimirEnConsola('c-info', '[AYUDA] Abriendo Diccionario Didáctico de Comandos G-Code y GRBL.');
      }
    });
  }

  // ==========================================
  // LÓGICA INTERACTIVA DE LA GUÍA RÁPIDA CNC
  // ==========================================
  if (elementos.botonesNavManual && elementos.panelesManual) {
    elementos.botonesNavManual.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-manual');
        elementos.botonesNavManual.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        elementos.panelesManual.forEach(panel => {
          if (panel.id === targetId) {
            panel.classList.add('active');
          } else {
            panel.classList.remove('active');
          }
        });
      });
    });
  }

  if (elementos.botonCerrarManual) {
    elementos.botonCerrarManual.addEventListener('click', () => {
      if (elementos.modalManual) elementos.modalManual.classList.add('hidden');
    });
  }

  if (elementos.botonCerrarManualFooter) {
    elementos.botonCerrarManualFooter.addEventListener('click', () => {
      if (elementos.modalManual) elementos.modalManual.classList.add('hidden');
    });
  }

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
        estado.nombreArchivoCargado = archivo.name;
        estado.indiceLineaActiva = 0;
        document.getElementById('lbl-loaded-filename').textContent = archivo.name;
        renderizarListaCodigoG();
        estado.segundosEstimadosBase = estimarSegundosBaseDesdeLineas(lineas);
        actualizarMetricasTelemetria();
        actualizarTiempoEstimado();
        const textoCompleto = lineas.map(l => l.texto).join('\n');
        if (window.visualizadorCNC) {
          window.visualizadorCNC.cargarTrayectoriaDesdeGCode(textoCompleto);
          window.visualizadorCNC.ajustarVistaAPieza();
        }
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
  // AJUSTE DE VELOCIDAD DE AVANCE (FEEDRATE F) DEL CÓDIGO G
  // ==========================================
  function detectarFeedsActuales() {
    let feedXY = 0;
    let feedZ = 0;
    if (estado.lineasPrograma) {
      for (const l of estado.lineasPrograma) {
        const txt = (typeof l === 'string' ? l : (l.texto || '')).replace(/\(.*?\)/g, '').split(';')[0].toUpperCase();
        const mF = txt.match(/\bF([-+]?\d*\.?\d+)\b/);
        if (mF) {
          const val = parseFloat(mF[1]);
          const esSoloZ = /\bZ[-+]?\d/.test(txt) && !/\b[XY][-+]?\d/.test(txt);
          if (esSoloZ && !feedZ) feedZ = val;
          else if (!esSoloZ && !feedXY) feedXY = val;
        }
        if (feedXY && feedZ) break;
      }
    }
    return {
      feedXY: feedXY || 120.0,
      feedZ: feedZ || 35.0
    };
  }

  function abrirModalAjustarVelocidad() {
    if (!estado.lineasPrograma || estado.lineasPrograma.length === 0) {
      imprimirEnConsola('c-warn', '[AVANCE] No hay ningún programa de código G cargado.');
      return;
    }
    const detected = detectarFeedsActuales();
    const lblDetect = document.getElementById('lbl-feed-actual-detectado');
    if (lblDetect) {
      lblDetect.textContent = `F${detected.feedXY.toFixed(1)} mm/min (Corte XY) | F${detected.feedZ.toFixed(1)} mm/min (Z)`;
    }
    const inpXY = document.getElementById('input-new-feed-xy');
    const inpZ = document.getElementById('input-new-feed-z');
    if (inpXY) inpXY.value = Math.max(300, Math.round(detected.feedXY * 2.5));
    if (inpZ) inpZ.value = Math.max(100, Math.round(detected.feedZ * 2));

    const modal = document.getElementById('modal-adjust-feed-backdrop');
    if (modal) modal.classList.remove('hidden');
  }

  function cerrarModalAjustarVelocidad() {
    const modal = document.getElementById('modal-adjust-feed-backdrop');
    if (modal) modal.classList.add('hidden');
  }

  function ajustarVelocidadGcodeLocal(contenidoGcode, nuevoFeedXY, nuevoFeedZ) {
    const lineas = contenidoGcode.split('\n');
    return lineas.map(l => {
      let partes = l.split(';');
      let code = partes[0];
      let comentario = partes.length > 1 ? (';' + partes.slice(1).join(';')) : '';
      let comentariosParen = [];
      let codeSinParen = code.replace(/\(.*?\)/g, (match) => {
        comentariosParen.push(match);
        return `__PAREN_${comentariosParen.length - 1}__`;
      });

      const esSoloZ = /\bZ[-+]?\d/i.test(codeSinParen) && !/\b[XY][-+]?\d/i.test(codeSinParen);

      codeSinParen = codeSinParen.replace(/\bF([-+]?\d*\.?\d+)\b/gi, () => {
        const fVal = (esSoloZ && nuevoFeedZ > 0) ? nuevoFeedZ : nuevoFeedXY;
        return `F${fVal.toFixed(1)}`;
      });

      comentariosParen.forEach((cp, idx) => {
        codeSinParen = codeSinParen.replace(`__PAREN_${idx}__`, cp);
      });

      return codeSinParen + comentario;
    }).join('\n');
  }

  async function aplicarNuevoFeedrateGcode() {
    const inpXY = document.getElementById('input-new-feed-xy');
    const inpZ = document.getElementById('input-new-feed-z');
    const nuevoFeedXY = parseFloat(inpXY?.value) || 600.0;
    const nuevoFeedZ = parseFloat(inpZ?.value) || 150.0;

    const textoActual = estado.lineasPrograma.map(l => (typeof l === 'string' ? l : (l.texto || ''))).join('\n');
    let textoAcelerado = '';

    if (window.puenteCNC && typeof window.puenteCNC.ajustarVelocidadGcode === 'function') {
      try {
        const res = window.puenteCNC.ajustarVelocidadGcode(textoActual, nuevoFeedXY, nuevoFeedZ);
        if (res && typeof res.then === 'function') {
          textoAcelerado = await res;
        } else if (typeof res === 'string') {
          textoAcelerado = res;
        }
      } catch (err) {
        console.warn('Fallback local ajustar feedrate:', err);
      }
    }

    if (!textoAcelerado) {
      textoAcelerado = ajustarVelocidadGcodeLocal(textoActual, nuevoFeedXY, nuevoFeedZ);
    }

    if (textoAcelerado) {
      const lineas = textoAcelerado.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .map(texto => ({ texto }));

      estado.lineasPrograma = lineas;
      estado.velocidadAvanceNominal = nuevoFeedXY;
      estado.indiceLineaActiva = 0;
      renderizarListaCodigoG();
      estado.segundosEstimadosBase = estimarSegundosBaseDesdeLineas(lineas);
      actualizarMetricasTelemetria();
      actualizarTiempoEstimado();

      if (window.visualizadorCNC) {
        window.visualizadorCNC.cargarTrayectoriaDesdeGCode(textoAcelerado);
        window.visualizadorCNC.ajustarVistaAPieza();
      }
      if (window.puenteCNC) window.puenteCNC.analizarGcode(textoAcelerado);

      cerrarModalAjustarVelocidad();
      imprimirEnConsola('c-ok', `[VELOCIDAD] Avance de corte acelerado a F${nuevoFeedXY} mm/min (XY) y F${nuevoFeedZ} mm/min (Z).`);
    }
  }

  // Eventos de botones de velocidad
  const btnAdjustFeed = document.getElementById('btn-adjust-feedrate');
  if (btnAdjustFeed) btnAdjustFeed.addEventListener('click', abrirModalAjustarVelocidad);

  const btnMenuAdjustFeed = document.getElementById('btn-menu-adjust-feed');
  if (btnMenuAdjustFeed) btnMenuAdjustFeed.addEventListener('click', abrirModalAjustarVelocidad);

  const btnCloseFeedModal = document.getElementById('btn-close-feed-modal');
  if (btnCloseFeedModal) btnCloseFeedModal.addEventListener('click', cerrarModalAjustarVelocidad);

  const btnCancelFeedModal = document.getElementById('btn-cancel-feed-modal');
  if (btnCancelFeedModal) btnCancelFeedModal.addEventListener('click', cerrarModalAjustarVelocidad);

  const btnApplyFeedModal = document.getElementById('btn-apply-feed-modal');
  if (btnApplyFeedModal) btnApplyFeedModal.addEventListener('click', aplicarNuevoFeedrateGcode);

  document.querySelectorAll('.btn-feed-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.getAttribute('data-feed');
      const fz = btn.getAttribute('data-feed-z');
      const inpXY = document.getElementById('input-new-feed-xy');
      const inpZ = document.getElementById('input-new-feed-z');
      if (inpXY && f) inpXY.value = f;
      if (inpZ && fz) inpZ.value = fz;
    });
  });

  // Botones de Override Rápido (50%, 100%, 150%, 200%)
  document.querySelectorAll('.btn-preset-feed').forEach(btn => {
    btn.addEventListener('click', () => {
      const pct = parseInt(btn.getAttribute('data-feed-pct'), 10) || 100;
      aplicarFeedOverride(pct);
      imprimirEnConsola('c-info', `[OVERRIDE] Feed Override establecido a ${pct}%.`);
    });
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

  function actualizarEstadoPantallaCompleta(esFs) {
    estado.esPantallaCompleta = !!esFs;
    document.body.classList.toggle('is-fullscreen', estado.esPantallaCompleta);

    const btnRestore = document.getElementById('btn-win-restore');
    const iconRestore = document.getElementById('icon-win-restore');
    if (iconRestore && btnRestore) {
      if (estado.esPantallaCompleta) {
        iconRestore.className = 'fa-solid fa-compress';
        btnRestore.title = estado.idiomaActual === 'en' ? 'Exit Fullscreen (F11 / Esc)' : 'Salir de Pantalla Completa (F11 / Esc)';
      } else {
        iconRestore.className = 'fa-solid fa-expand';
        btnRestore.title = estado.idiomaActual === 'en' ? 'Fullscreen (F11)' : 'Pantalla Completa (F11)';
      }
    }

    const btnMenu = document.getElementById('btn-menu-fullscreen');
    if (btnMenu) {
      const txt = estado.esPantallaCompleta
        ? (estado.idiomaActual === 'en' ? 'Exit Fullscreen' : 'Salir de Pantalla Completa')
        : (estado.idiomaActual === 'en' ? 'Fullscreen' : 'Pantalla Completa');
      const icon = estado.esPantallaCompleta ? 'fa-compress' : 'fa-expand';
      const sc = estado.esPantallaCompleta ? 'F11 / Esc' : 'F11';
      btnMenu.innerHTML = `<i class="fa-solid ${icon}"></i> ${txt} <span class="shortcut">${sc}</span>`;
    }

    if (window.visualizadorCNC) {
      window.visualizadorCNC.estaArrastrando = false;
      if (typeof window.visualizadorCNC.redimensionarLienzo === 'function') {
        window.visualizadorCNC.redimensionarLienzo();
      }
    }
  }

  let ultimoConmutarFs = 0;
  function conmutarPantallaCompleta() {
    const ahora = Date.now();
    if (ahora - ultimoConmutarFs < 400) return;
    ultimoConmutarFs = ahora;

    if (window.puenteCNC && typeof window.puenteCNC.alternarPantallaCompleta === 'function') {
      window.puenteCNC.alternarPantallaCompleta();
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => { });
      } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => { });
      }
    }
  }

  document.addEventListener('fullscreenchange', () => {
    actualizarEstadoPantallaCompleta(!!document.fullscreenElement);
  });

  const btnMenuFullscreen = document.getElementById('btn-menu-fullscreen');
  if (btnMenuFullscreen) {
    btnMenuFullscreen.addEventListener('click', () => {
      conmutarPantallaCompleta();
    });
  }

  // Controles nativos de ventana en barra superior (minimizar, restaurar/fullscreen, cerrar)
  const btnWinMin = document.getElementById('btn-win-min');
  if (btnWinMin) {
    btnWinMin.addEventListener('click', () => {
      if (window.puenteCNC && typeof window.puenteCNC.minimizarVentana === 'function') {
        window.puenteCNC.minimizarVentana();
      }
    });
  }

  const btnWinRestore = document.getElementById('btn-win-restore');
  if (btnWinRestore) {
    btnWinRestore.addEventListener('click', () => {
      conmutarPantallaCompleta();
    });
  }

  const btnWinClose = document.getElementById('btn-win-close');
  if (btnWinClose) {
    btnWinClose.addEventListener('click', () => {
      if (window.puenteCNC && typeof window.puenteCNC.cerrarVentana === 'function') {
        window.puenteCNC.cerrarVentana();
      } else {
        window.close();
      }
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
      cargarValoresModalConfiguracion();
      elementos.modalConfiguracion.classList.remove('hidden');
      const pestana = document.querySelector('.cfg-tab-btn[data-target="cfg-tab-heightmap"]');
      if (pestana) pestana.click();
      imprimirEnConsola('c-info', '[HERRAMIENTAS] Módulo de Mapa de Alturas.');
    });
  }

  const btnMenuCalibration = document.getElementById('btn-menu-calibration');
  if (btnMenuCalibration) {
    btnMenuCalibration.addEventListener('click', () => {
      cargarValoresModalConfiguracion();
      elementos.modalConfiguracion.classList.remove('hidden');
      const pestana = document.querySelector('.cfg-tab-btn[data-target="cfg-tab-maquina"]');
      if (pestana) pestana.click();
      const box = document.getElementById('box-calibracion-pasos');
      if (box) box.scrollIntoView({ behavior: 'smooth' });
      imprimirEnConsola('c-info', '[HERRAMIENTAS] Asistente de calibración de pasos por milímetro ($100, $101, $102).');
    });
  }

  const btnMenuMacros = document.getElementById('btn-menu-macros');
  if (btnMenuMacros) {
    btnMenuMacros.addEventListener('click', () => {
      cargarValoresModalConfiguracion();
      elementos.modalConfiguracion.classList.remove('hidden');
      const pestana = document.querySelector('.cfg-tab-btn[data-target="cfg-tab-macros"]');
      if (pestana) pestana.click();
      imprimirEnConsola('c-info', '[HERRAMIENTAS] Comandos rápidos y macros de usuario.');
    });
  }

  const btnMenuSelectTool = document.getElementById('btn-menu-select-tool');
  if (btnMenuSelectTool) {
    btnMenuSelectTool.addEventListener('click', () => {
      abrirModalSeleccionHerramienta();
    });
  }

  // --- MENÚ AYUDA ---
  const btnMenuManual = document.getElementById('btn-menu-manual');
  if (btnMenuManual) {
    btnMenuManual.addEventListener('click', () => {
      if (elementos.modalManual) {
        elementos.modalManual.classList.remove('hidden');
        imprimirEnConsola('c-info', '[AYUDA] Abriendo Guía Rápida de Operación CNC Didáctica.');
      }
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

  [
    elementos.modalConfiguracion,
    elementos.modalDiccionario,
    elementos.modalManual,
    elementos.modalSeleccionHerramienta,
    elementos.modalSeguridad
  ].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (evento) => {
        if (evento.target === modal) {
          modal.classList.add('hidden');
          if (window.visualizadorCNC) window.visualizadorCNC.solicitarRenderizado();
        }
      });
    }
  });

  // Render inicial de la aplicación y sincronización de trayectoria
  aplicarTema(localStorage.getItem('cnc_theme') || 'dark');
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
    const ANCHO_MIN = 250;      // Límite compacto al ajustar hacia la derecha

    // Cargar ancho guardado en almacenamiento local (siempre restringido entre ANCHO_MIN y ANCHO_MAX)
    let anchoActual = parseFloat(localStorage.getItem('cnc_sidebar_width')) || ANCHO_ORIGINAL;
    if (anchoActual < ANCHO_MIN) anchoActual = ANCHO_MIN;
    if (anchoActual > ANCHO_MAX) anchoActual = ANCHO_MAX;

    let colapsado = localStorage.getItem('cnc_sidebar_collapsed') === 'true';

    function aplicarDimensiones(ancho, guardar = true) {
      const anchoRestringido = Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, Math.round(ancho)));
      if (workspace.style.getPropertyValue('--sidebar-width') !== `${anchoRestringido}px`) {
        workspace.style.setProperty('--sidebar-width', `${anchoRestringido}px`);
      }
      anchoActual = anchoRestringido;
      if (guardar) localStorage.setItem('cnc_sidebar_width', anchoRestringido);
      if (window.visualizadorCNC) {
        window.visualizadorCNC.aplicarTamanoLienzo();
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
        window.visualizadorCNC.aplicarTamanoLienzo();
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
    let rafAncho = null;
    let anchoPendiente = null;

    resizer.addEventListener('mousedown', (e) => {
      // Ignorar si el clic fue en el botón de toggle
      if (e.target.closest('#btn-toggle-sidebar') || e.button !== 0 || arrastrando) return;

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
        if (!evento.buttons) { alSoltarMouse(); return; }
        // Al arrastrar a la derecha (evento.clientX > xInicial), delta es negativo -> panel se hace más angosto
        // Al arrastrar a la izquierda (evento.clientX < xInicial), se detiene rígidamente en 340px (ANCHO_MAX)
        const delta = xInicial - evento.clientX;
        let nuevoAncho = anchoInicial + delta;

        if (nuevoAncho < ANCHO_MIN) nuevoAncho = ANCHO_MIN;
        if (nuevoAncho > ANCHO_MAX) nuevoAncho = ANCHO_MAX;

        anchoPendiente = nuevoAncho;
        if (rafAncho === null) rafAncho = requestAnimationFrame(() => {
          rafAncho = null;
          if (arrastrando) aplicarDimensiones(anchoPendiente, false);
        });
      };

      const alSoltarMouse = () => {
        if (!arrastrando) return;
        arrastrando = false;
        resizer.classList.remove('is-dragging');
        document.body.classList.remove('resizing-col');
        window.removeEventListener('mousemove', alMoverMouse);
        window.removeEventListener('mouseup', alSoltarMouse);
        window.removeEventListener('blur', alSoltarMouse);
        window.removeEventListener('mouseleave', alSoltarMouse);
        window.removeEventListener('resize', alSoltarMouse);
        document.removeEventListener('visibilitychange', alSoltarMouse);
        if (rafAncho !== null) cancelAnimationFrame(rafAncho);
        rafAncho = null;
        aplicarDimensiones(anchoPendiente ?? anchoActual, true);
        anchoPendiente = null;
      };

      window.addEventListener('mousemove', alMoverMouse);
      window.addEventListener('mouseup', alSoltarMouse);
      window.addEventListener('blur', alSoltarMouse);
      window.addEventListener('mouseleave', alSoltarMouse);
      window.addEventListener('resize', alSoltarMouse);
      document.addEventListener('visibilitychange', alSoltarMouse);
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

  // ==========================================
  // COLAPSO Y EXPANSIÓN DE BLOQUES DEL PANEL LATERAL (DRO, JOG, SPINDLE, CONTROL)
  // ==========================================
  function inicializarColapsoBloquesSidebar() {
    document.querySelectorAll('.sidebar-header.collapsible').forEach(header => {
      const parentBlock = header.closest('.sidebar-block');
      if (!parentBlock) return;

      const blockId = parentBlock.id;
      if (blockId) {
        const guardado = localStorage.getItem('cnc_sidebar_collapsed_' + blockId);
        if (guardado === 'true') {
          parentBlock.classList.add('collapsed');
        }
      }

      header.addEventListener('click', () => {
        parentBlock.classList.toggle('collapsed');
        if (blockId) {
          localStorage.setItem('cnc_sidebar_collapsed_' + blockId, parentBlock.classList.contains('collapsed') ? 'true' : 'false');
        }
      });
    });
  }

  // =========================================================================
  // RF-10 / C.U-06-03 / C.U-06-04: HISTORIAL DE TRABAJO Y REGISTRO DE EVENTOS
  // =========================================================================
  const HistorialManager = {
    lista: [],
    _sanitizarItem(item) {
      if (!item) return item;
      if (typeof item.resultado !== 'string') {
        item.resultado = (item.resultado && item.resultado.isTrusted) ? 'Detenido' : (item.resultado ? String(item.resultado) : 'Completado');
      }
      return item;
    },
    async inicializar() {
      try {
        const guardado = localStorage.getItem('cnc_historial_trabajos');
        if (guardado) {
          const parsed = JSON.parse(guardado);
          this.lista = Array.isArray(parsed) ? parsed.map(i => this._sanitizarItem(i)) : [];
        }
      } catch (e) {
        this.lista = [];
      }
      this.renderizar();
      this.configurarEventos();

      await this.cargarDisco();
    },
    async cargarDisco() {
      // Cargar desde disco a través del puente Python si existe
      if (window.puenteCNC && typeof window.puenteCNC.cargarHistorialDisco === 'function') {
        try {
          const disco = await window.puenteCNC.cargarHistorialDisco();
          if (disco) {
            const parsed = JSON.parse(disco);
            if (Array.isArray(parsed)) {
              this.lista = parsed.map(i => this._sanitizarItem(i));
              this.renderizar();
            }
          }
        } catch (e) { }
      }
    },
    guardar() {
      try {
        const jsonStr = JSON.stringify(this.lista);
        localStorage.setItem('cnc_historial_trabajos', jsonStr);
        if (window.puenteCNC && typeof window.puenteCNC.guardarHistorialDisco === 'function') {
          window.puenteCNC.guardarHistorialDisco(jsonStr);
        }
      } catch (e) {
        console.error('Error al guardar historial:', e);
      }
    },
    registrarTrabajo(item) {
      const id = this.lista.length + 1;
      const nuevo = this._sanitizarItem({ id, ...item });
      this.lista.unshift(nuevo);
      if (this.lista.length > 200) this.lista.pop(); // Limitar historial a 200 entradas
      this.guardar();
      this.renderizar();
    },
    renderizar(filtro = '') {
      if (!elementos.tbodyHistorial) return;
      const f = filtro.toLowerCase().trim();
      const filtrados = f
        ? this.lista.filter(item => {
          const res = typeof item.resultado === 'string' ? item.resultado : '';
          return (item.archivo && item.archivo.toLowerCase().includes(f)) ||
            (res && res.toLowerCase().includes(f)) ||
            (item.herramienta && item.herramienta.toLowerCase().includes(f));
        })
        : this.lista;

      if (filtrados.length === 0) {
        elementos.tbodyHistorial.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No hay trabajos registrados en el historial de esta estación.</td></tr>`;
      } else {
        elementos.tbodyHistorial.innerHTML = filtrados.map(item => {
          let badgeClass = 'badge-status-completed';
          const res = typeof item.resultado === 'string' ? item.resultado : (item.resultado ? String(item.resultado) : 'Desconocido');
          if (res.includes('Simulación') || res.includes('Virtual') || res.includes('Simulation')) badgeClass = 'badge-status-simulacion';
          else if (res.includes('Detenido') || res.includes('Cancelado')) badgeClass = 'badge-status-stopped';
          else if (res.includes('Alarma') || res.includes('Error')) badgeClass = 'badge-status-error';

          return `<tr>
            <td style="font-family: var(--font-mono); color: var(--text-muted);">${escaparHTML(item.id)}</td>
            <td style="font-size: 11px;">${escaparHTML(item.fecha)}</td>
            <td style="font-weight: 600; color: #fff;">${escaparHTML(item.archivo)}</td>
            <td>${escaparHTML(item.herramienta)}</td>
            <td style="font-family: var(--font-mono);">${escaparHTML(item.duracion)}</td>
            <td style="font-family: var(--font-mono);">${escaparHTML(item.lineas)}</td>
            <td><span class="badge-status ${badgeClass}">${escaparHTML(res)}</span></td>
          </tr>`;
        }).join('');
      }

      // Actualizar KPIs
      if (elementos.kpiHistorialTotal) {
        elementos.kpiHistorialTotal.textContent = this.lista.length;
      }
      if (elementos.kpiHistorialTiempo) {
        const totalSeg = this.lista.reduce((acc, curr) => acc + (curr.duracionSeg || 0), 0);
        const h = String(Math.floor(totalSeg / 3600)).padStart(2, '0');
        const m = String(Math.floor((totalSeg % 3600) / 60)).padStart(2, '0');
        const s = String(totalSeg % 60).padStart(2, '0');
        elementos.kpiHistorialTiempo.textContent = `${h}:${m}:${s}`;
      }
      if (elementos.kpiHistorialExito) {
        if (this.lista.length === 0) {
          elementos.kpiHistorialExito.textContent = '100%';
        } else {
          const exitosos = this.lista.filter(i => {
            const res = typeof i.resultado === 'string' ? i.resultado : '';
            return res === 'Completado' || res.includes('Simulación') || res.includes('Virtual') || res.includes('Simulation');
          }).length;
          const pct = Math.round((exitosos / this.lista.length) * 100);
          elementos.kpiHistorialExito.textContent = `${pct}%`;
        }
      }

      // Actualizar rótulo informativo en el pie del modal
      if (typeof document !== 'undefined') {
        const infoEl = document.getElementById('historial-footer-info');
        if (infoEl) {
          const visible = filtrados.length;
          const total = this.lista.length;
          const icon = '<i class="fa-solid fa-database" style="color: var(--cyan-primary);"></i>';
          infoEl.innerHTML = f
            ? `${icon} <span>Mostrando ${visible} de ${total} trabajos (filtrado)</span>`
            : `${icon} <span>${total} trabajos registrados en memoria local</span>`;
        }
      }
    },
    exportarJSON() {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.lista, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `historial_cnc_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    },
    exportarCSV() {
      if (this.lista.length === 0) {
        alert('No hay registros en el historial para exportar.');
        return;
      }
      const headers = ["ID", "Fecha", "Archivo", "Herramienta", "Duracion", "Lineas", "Resultado"];
      const rows = this.lista.map(i => [i.id, `"${i.fecha}"`, `"${i.archivo}"`, `"${i.herramienta}"`, `"${i.duracion}"`, `"${i.lineas}"`, `"${i.resultado}"`]);
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `historial_cnc_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    limpiar() {
      if (confirm('¿Está seguro de que desea limpiar todo el historial de trabajos? Esta acción no se puede deshacer.')) {
        this.lista = [];
        this.guardar();
        this.renderizar();
        imprimirEnConsola('c-system', '[HISTORIAL] Historial de trabajos limpiado correctamente.');
      }
    },
    abrirModal() {
      this.renderizar();
      if (elementos.modalHistorial) elementos.modalHistorial.classList.remove('hidden');
    },
    configurarEventos() {
      if (elementos.botonMenuHistorial) {
        elementos.botonMenuHistorial.addEventListener('click', () => {
          this.abrirModal();
        });
      }
      if (elementos.modalHistorial) {
        elementos.modalHistorial.addEventListener('click', (evento) => {
          if (evento.target === elementos.modalHistorial) {
            elementos.modalHistorial.classList.add('hidden');
          }
        });
      }
      if (elementos.botonCerrarHistorial) {
        elementos.botonCerrarHistorial.addEventListener('click', () => {
          if (elementos.modalHistorial) elementos.modalHistorial.classList.add('hidden');
        });
      }
      if (elementos.botonCerrarHistorialBottom) {
        elementos.botonCerrarHistorialBottom.addEventListener('click', () => {
          if (elementos.modalHistorial) elementos.modalHistorial.classList.add('hidden');
        });
      }
      if (elementos.inputBusquedaHistorial) {
        elementos.inputBusquedaHistorial.addEventListener('input', (e) => {
          this.renderizar(e.target.value);
        });
      }
      if (elementos.botonExportarHistorialJson) {
        elementos.botonExportarHistorialJson.addEventListener('click', () => this.exportarJSON());
      }
      if (elementos.botonExportarHistorialCsv) {
        elementos.botonExportarHistorialCsv.addEventListener('click', () => this.exportarCSV());
      }
      if (elementos.botonLimpiarHistorial) {
        elementos.botonLimpiarHistorial.addEventListener('click', () => this.limpiar());
      }
    }
  };

  // =========================================================================
  // RNF-06 / C.U-06-05 / MSJ_29: TUTORIAL INTERACTIVO Y FLUJO DE BIENVENIDA
  // =========================================================================
  const TutorialManager = {
    pasoActual: 1,
    totalPasos: 5,
    inicializar() {
      this.configurarEventos();
      // Verificar si es primer uso tras la instalación (MSJ_29)
      const noMostrar = localStorage.getItem('cnc_tutorial_no_mostrar') === 'true';
      if (!noMostrar && elementos.bannerPrimerUso) {
        // Marcar de inmediato para que solo se muestre la primera vez tras la instalación
        localStorage.setItem('cnc_tutorial_no_mostrar', 'true');
        setTimeout(() => {
          elementos.bannerPrimerUso.classList.remove('hidden');
        }, 1500);
      }
    },
    abrir() {
      this.mostrarPaso(1);
      if (elementos.modalTutorial) elementos.modalTutorial.classList.remove('hidden');
      if (elementos.bannerPrimerUso) elementos.bannerPrimerUso.classList.add('hidden');
      localStorage.setItem('cnc_tutorial_no_mostrar', 'true');
    },
    cerrar() {
      if (elementos.modalTutorial) elementos.modalTutorial.classList.add('hidden');
      localStorage.setItem('cnc_tutorial_no_mostrar', 'true');
    },
    mostrarPaso(num) {
      this.pasoActual = Math.max(1, Math.min(this.totalPasos, num));
      document.querySelectorAll('.tutorial-step-dot').forEach(dot => {
        const step = parseInt(dot.getAttribute('data-step'), 10);
        dot.classList.toggle('active', step === this.pasoActual);
        dot.classList.toggle('completed', step < this.pasoActual);
      });
      document.querySelectorAll('.tutorial-pane').forEach((pane, idx) => {
        pane.classList.toggle('active', (idx + 1) === this.pasoActual);
      });

      if (elementos.botonPrevTutorial) {
        elementos.botonPrevTutorial.disabled = (this.pasoActual === 1);
      }
      if (elementos.botonNextTutorial) {
        const esUltimo = (this.pasoActual === this.totalPasos);
        const lang = estado.idiomaActual;
        elementos.botonNextTutorial.innerHTML = esUltimo
          ? (lang === 'en' ? '<i class="fa-solid fa-check"></i> Finish' : '<i class="fa-solid fa-check"></i> Finalizar')
          : (lang === 'en' ? 'Next <i class="fa-solid fa-arrow-right"></i>' : 'Siguiente <i class="fa-solid fa-arrow-right"></i>');
      }
    },
    configurarEventos() {
      if (elementos.botonMenuTutorial) {
        elementos.botonMenuTutorial.addEventListener('click', () => this.abrir());
      }
      if (elementos.botonCerrarTutorial) {
        elementos.botonCerrarTutorial.addEventListener('click', () => this.cerrar());
      }
      if (elementos.botonIniciarTutorialToast) {
        elementos.botonIniciarTutorialToast.addEventListener('click', () => {
          localStorage.setItem('cnc_tutorial_no_mostrar', 'true');
          this.abrir();
        });
      }
      if (elementos.botonDescartarToast) {
        elementos.botonDescartarToast.addEventListener('click', () => {
          if (elementos.bannerPrimerUso) elementos.bannerPrimerUso.classList.add('hidden');
          localStorage.setItem('cnc_tutorial_no_mostrar', 'true');
        });
      }
      if (elementos.botonPrevTutorial) {
        elementos.botonPrevTutorial.addEventListener('click', () => {
          this.mostrarPaso(this.pasoActual - 1);
        });
      }
      if (elementos.botonNextTutorial) {
        elementos.botonNextTutorial.addEventListener('click', () => {
          if (this.pasoActual === this.totalPasos) {
            this.cerrar();
          } else {
            this.mostrarPaso(this.pasoActual + 1);
          }
        });
      }
      document.querySelectorAll('.tutorial-step-dot').forEach(dot => {
        dot.addEventListener('click', () => {
          const step = parseInt(dot.getAttribute('data-step'), 10);
          if (step) this.mostrarPaso(step);
        });
      });
    }
  };

  // =========================================================================
  // RNF-08: LOCALIZACIÓN Y MULTI-IDIOMA (ES/EN)
  // =========================================================================
  // GESTOR DE INTERNACIONALIZACIÓN Y MULTI-IDIOMA (RNF-08)
  // =========================================================================
  const I18nManager = {
    diccionarios: {
      es: {
        titulo_app: "CNC Basic v1.0 - Interfaz de Control CNC Educativa",
        menu_archivo: "Archivo",
        menu_editar: "Editar",
        menu_maquina: "Máquina",
        menu_herramientas: "Herramientas",
        menu_vista: "Vista",
        menu_ayuda: "Ayuda",
        btn_abrir_archivo: "Abrir Archivo G-Code...",
        btn_cargar_demo: "Cargar pieza_01.nc (Demo)",
        btn_guardar_gcode: "Guardar G-Code",
        btn_historial: "Historial de Trabajos Realizados",
        btn_exportar_bitacora: "Exportar Bitácora de Sesión",
        btn_limpiar_prog: "Limpiar Programa",
        btn_limpiar_consola: "Limpiar Consola Serial",
        btn_homing: "Ciclo de Homing ($H)",
        btn_desbloquear: "Desbloquear Alarma ($X)",
        btn_reset_grbl: "Reset Software (Ctrl+X)",
        btn_ir_origen: "Ir a Cero Pieza (G0 X0 Y0 Z0)",
        btn_tipo_herramienta: "Tipo de Herramienta (Fresa / Lápiz)...",
        btn_mapa_alturas: "Mapa de Alturas (Auto-Level)",
        btn_calibracion: "Asistente de Calibración Pasos/mm",
        btn_macros: "Comandos Rápidos de Usuario",
        btn_vista_xy: "Vista XY (Planta)",
        btn_vista_xz: "Vista XZ (Frontal)",
        btn_vista_3d: "Vista 3D Isométrica",
        btn_alternar_cuadricula: "Alternar Cuadrícula",
        btn_pantalla_completa: "Pantalla Completa",
        btn_tutorial: "Tutorial de Bienvenida (Primer Uso)...",
        btn_diccionario: "Diccionario G-Code Interactivo",
        btn_manual: "Guía Rápida de Operación CNC",
        btn_acerca: "Acerca de CNC Basic v1.0 (TT ESCOM)",
        btn_config: "Config",
        lbl_limites_off: "Límites: OFF",
        lbl_limites_on: "Límites: ON",
        lbl_desbloquear_rapido: "DESBLOQUEAR ($X)",
        legend_pending: "Por recorrer",
        legend_done: "Ya recorrido",
        legend_rapid: "Rápido (G0)",
        legend_origin: "Origen WCS",
        legend_bed: "Mesa Máquina",
        legend_oob: "Exceso Límites",
        btn_orbit: "Órbita 3D",
        tab_trayectoria: "Trayectoria",
        tab_herramienta: "Herramienta",
        lbl_archivo: "ARCHIVO:",
        panel_gcode_title: "PROGRAMA G-CODE",
        panel_console_title: "CONSOLA SERIAL",
        btn_limpiar: "Limpiar",
        btn_enviar: "ENVIAR",
        placeholder_mdi: "Comando G-code (G0 X0, G91...)",
        placeholder_console: "Comando directo (?, $$, $X...)",
        dro_title: "POSICIÓN ACTUAL",
        dro_zero_xy: "ZERO XY",
        dro_zero_z: "ZERO Z",
        dro_zero_all: "ZERO ALL",
        jog_title: "JOG MANUAL",
        jog_vel_label: "Vel. / Override",
        exec_title: "CONTROL DE EJECUCIÓN",
        tele_linea: "LÍNEA",
        tele_avance: "AVANCE",
        tele_tiempo: "TIEMPO",
        tele_feed_real: "FEED REAL",
        tele_override: "OVERRIDE",
        tele_progreso: "Progreso",
        btn_start: "START",
        btn_pausa: "PAUSA",
        btn_detener: "DETENER",
        cube_top: "SUP",
        cube_front: "FRO",
        cube_right: "DER",
        cube_back: "TRA",
        cube_left: "IZQ",
        cube_bottom: "INF",
        banner_toast_title: "¡Bienvenido a CNC Basic v1.0!",
        banner_toast_body: "¿Es tu primera vez operando una fresadora CNC? Te recomendamos realizar el tutorial interactivo guiado (5 pasos).",
        btn_toast_dismiss: "Más tarde",
        btn_toast_start: "Iniciar Tutorial",
        lbl_tab_tool_prefix: "Herramienta:",
        cfg_modal_title: "Configuración del Sistema CNC",
        cfg_modal_subtitle: "Parámetros GRBL v1.1 & Preferencias de Usuario",
        cfg_nav_conexion: "Ajustes de Conexión",
        cfg_nav_maquina: "Info de la Máquina",
        cfg_nav_emisor: "Ajustes Emisor",
        cfg_nav_ui: "Interfaz de Usuario",
        cfg_nav_atajos: "Ajustes y Atajos",
        cfg_nav_visualizador: "Ajustes Visualizador",
        cfg_nav_consola: "Ajustes Consola",
        cfg_nav_macros: "Comandos de Usuario",
        cfg_nav_heightmap: "Mapa de Alturas",
        cfg_nav_creditos: "Derechos de Autor y Agradecimientos",
        cfg_sec_conexion: "Ajustes de Conexión Serial (UART)",
        cfg_sec_maquina: "Parámetros del Controlador CNC (GRBL)",
        cfg_sec_emisor: "Ajustes del Emisor de Código G (Streamer)",
        cfg_sec_ui: "Personalización de la Interfaz",
        cfg_sec_atajos: "Atajos de Teclado del Sistema",
        cfg_sec_visualizador: "Ajustes del Renderizador de Trayectoria",
        cfg_sec_consola: "Ajustes de la Consola Serial de Diagnóstico",
        cfg_sec_macros: "Comandos Rápidos y Macros Educativas",
        cfg_sec_heightmap: "Módulo de Mapa de Alturas (Compensación de Cama)",
        cfg_sec_creditos: "Derechos de Autor, Propiedad Intelectual y Agradecimientos",
        cfg_lbl_port: "Puerto Serial COM:",
        cfg_lbl_baud: "Velocidad de Baudios:",
        cfg_lbl_buffer: "Tamaño de Buffer de Comandos:",
        cfg_lbl_dtr: "Habilitar DTR Reset al conectar",
        cfg_lbl_ok: "Comprobación de Eco (OK check)",
        cfg_lbl_fw: "Firmware Detectado:",
        cfg_lbl_step_x: "$100 - Pasos/mm Eje X:",
        cfg_lbl_step_y: "$101 - Pasos/mm Eje Y:",
        cfg_lbl_step_z: "$102 - Pasos/mm Eje Z:",
        cfg_lbl_travel_x: "$130 - Recorrido Máx X (mm):",
        cfg_lbl_travel_y: "$131 - Recorrido Máx Y (mm):",
        cfg_lbl_travel_z: "$132 - Recorrido Máx Z (mm):",
        cfg_calib_title: "Asistente de Calibración de Pasos/mm ($100, $101, $102)",
        cfg_calib_desc: "Si al ordenar mover 100 mm la máquina se desplaza una distancia diferente, calcula el valor exacto aquí:",
        cfg_calib_eje: "Eje a Calibrar:",
        cfg_calib_comandada: "Distancia Comandada (mm):",
        cfg_calib_real: "Distancia Real Medida (mm):",
        cfg_btn_calc: "Calcular y Aplicar",
        cfg_lbl_streamer: "Modo de Envío de Líneas:",
        cfg_lbl_polling: "Frecuencia de Polling de Estado (?):",
        cfg_lbl_skip_comments: "Omitir líneas vacías y comentarios",
        cfg_lbl_pause_m6: "Pausa segura ante comando M6 (Cambio de herramienta)",
        cfg_lbl_theme: "Tema Visual:",
        cfg_lbl_units: "Sistema de Unidades:",
        cfg_lbl_decimals: "Número de Decimales en DRO:",
        cfg_lbl_language: "Idioma de la Interfaz / Interface Language (RNF-08):",
        cfg_lbl_color_cut: "Color de Trayectoria de Corte (G1/G2):",
        cfg_lbl_color_rapid: "Color de Movimiento Rápido (G0):",
        cfg_lbl_reticle: "Mostrar retícula de herramienta en tiempo real",
        cfg_lbl_bed_limits: "Mostrar límites de la cama de trabajo",
        cfg_lbl_tool_3d: "Dibujar cono de fresa en modo 3D",
        cfg_lbl_active_tool: "Herramienta Activa:",
        cfg_lbl_autoscroll: "Auto-desplazamiento automático al recibir mensajes",
        cfg_lbl_timestamps: "Incluir marcas de tiempo (Timestamps [HH:MM:SS])",
        cfg_lbl_filter_status: "Filtrar consultas periódicas de estado (<Idle...>)",
        cfg_lbl_highlight_alarms: "Resaltar errores y alarmas en color rojo",
        cfg_btn_cancel: "Cancelar",
        cfg_btn_save: "Guardar Configuración",
        cfg_btn_start_probe: "Iniciar Muestreo Automático",
        cfg_btn_clear_heightmap: "Limpiar Compensación",
        btn_run_macro: "Ejecutar",
        tool_modal_title: "Selección de Herramienta CNC",
        tool_modal_subtitle: "Configuración del elemento de trabajo montado (ESCOM - IPN)",
        tool_modal_instruction: "Seleccione la herramienta montada en el cabezal de la máquina CNC:",
        tool_name_fresa: "Fresa CNC",
        tool_name_lapiz: "Lápiz Didáctico",
        tool_name_laser: "Diodo Láser",
        tool_badge_fresa: "CORTE &amp; FRESADO",
        tool_badge_lapiz: "DIBUJO DIDÁCTICO",
        tool_badge_laser: "GRABADO &amp; CORTE LÁSER",
        tool_btn_cancel: "Cerrar",
        tool_btn_apply: "Aplicar Herramienta",
        consola_loc: "[LOCALIZACIÓN] Idioma configurado en Español."
      },
      en: {
        titulo_app: "CNC Basic v1.0 - Educational CNC Control Station",
        menu_archivo: "File",
        menu_editar: "Edit",
        menu_maquina: "Machine",
        menu_herramientas: "Tools",
        menu_vista: "View",
        menu_ayuda: "Help",
        btn_abrir_archivo: "Open G-Code File...",
        btn_cargar_demo: "Load pieza_01.nc (Demo)",
        btn_guardar_gcode: "Save G-Code",
        btn_historial: "Work History & Logs",
        btn_exportar_bitacora: "Export Session Log",
        btn_limpiar_prog: "Clear Program",
        btn_limpiar_consola: "Clear Serial Console",
        btn_homing: "Homing Cycle ($H)",
        btn_desbloquear: "Unlock Alarm ($X)",
        btn_reset_grbl: "Software Reset (Ctrl+X)",
        btn_ir_origen: "Go to Work Zero (G0 X0 Y0 Z0)",
        btn_tipo_herramienta: "Tool Type (Endmill / Pen)...",
        btn_mapa_alturas: "Heightmap (Auto-Level)",
        btn_calibracion: "Steps/mm Calibration Wizard",
        btn_macros: "User Quick Macros",
        btn_vista_xy: "XY View (Top)",
        btn_vista_xz: "XZ View (Front)",
        btn_vista_3d: "3D Isometric View",
        btn_alternar_cuadricula: "Toggle Grid",
        btn_pantalla_completa: "Fullscreen",
        btn_tutorial: "Welcome Tutorial (First Use)...",
        btn_diccionario: "Interactive G-Code Dictionary",
        btn_manual: "Quick CNC Operation Guide",
        btn_acerca: "About CNC Basic v1.0 (TT ESCOM)",
        btn_config: "Config",
        lbl_limites_off: "Limits: OFF",
        lbl_limites_on: "Limits: ON",
        lbl_desbloquear_rapido: "UNLOCK ($X)",
        legend_pending: "Pending path",
        legend_done: "Traversed",
        legend_rapid: "Rapid (G0)",
        legend_origin: "WCS Origin",
        legend_bed: "Machine Bed",
        legend_oob: "Out of Bounds",
        btn_orbit: "3D Orbit",
        tab_trayectoria: "Toolpath",
        tab_herramienta: "Tool",
        lbl_archivo: "FILE:",
        panel_gcode_title: "G-CODE PROGRAM",
        panel_console_title: "SERIAL CONSOLE",
        btn_limpiar: "Clear",
        btn_enviar: "SEND",
        placeholder_mdi: "G-code command (G0 X0, G91...)",
        placeholder_console: "Direct command (?, $$, $X...)",
        dro_title: "CURRENT POSITION",
        dro_zero_xy: "ZERO XY",
        dro_zero_z: "ZERO Z",
        dro_zero_all: "ZERO ALL",
        jog_title: "MANUAL JOG",
        jog_vel_label: "Speed / Override",
        exec_title: "EXECUTION CONTROL",
        tele_linea: "LINE",
        tele_avance: "FEED",
        tele_tiempo: "TIME",
        tele_feed_real: "REAL FEED",
        tele_override: "OVERRIDE",
        tele_progreso: "Progress",
        btn_start: "START",
        btn_pausa: "PAUSE",
        btn_detener: "STOP",
        cube_top: "TOP",
        cube_front: "FRONT",
        cube_right: "RIGHT",
        cube_back: "BACK",
        cube_left: "LEFT",
        cube_bottom: "BOTTOM",
        banner_toast_title: "Welcome to CNC Basic v1.0!",
        banner_toast_body: "First time running this CNC station? We recommend taking the 5-step guided interactive tutorial.",
        btn_toast_dismiss: "Later",
        btn_toast_start: "Start Tutorial",
        lbl_tab_tool_prefix: "Tool:",
        cfg_modal_title: "CNC System Configuration",
        cfg_modal_subtitle: "GRBL v1.1 Parameters & User Preferences",
        cfg_nav_conexion: "Connection Settings",
        cfg_nav_maquina: "Machine Information",
        cfg_nav_emisor: "Streamer Settings",
        cfg_nav_ui: "User Interface",
        cfg_nav_atajos: "Shortcuts & Keys",
        cfg_nav_visualizador: "Visualizer Settings",
        cfg_nav_consola: "Console Settings",
        cfg_nav_macros: "User Macros",
        cfg_nav_heightmap: "Heightmap",
        cfg_nav_creditos: "Copyright & Credits",
        cfg_sec_conexion: "Serial Connection Settings (UART)",
        cfg_sec_maquina: "CNC Controller Parameters (GRBL)",
        cfg_sec_emisor: "G-Code Streamer Settings",
        cfg_sec_ui: "User Interface Customization",
        cfg_sec_atajos: "System Keyboard Shortcuts",
        cfg_sec_visualizador: "Toolpath Visualizer Settings",
        cfg_sec_consola: "Diagnostic Serial Console Settings",
        cfg_sec_macros: "Quick Commands & Educational Macros",
        cfg_sec_heightmap: "Heightmap Module (Surface Compensation)",
        cfg_sec_creditos: "Copyright, Intellectual Property & Acknowledgments",
        cfg_lbl_port: "Serial COM Port:",
        cfg_lbl_baud: "Baud Rate:",
        cfg_lbl_buffer: "Command Buffer Size:",
        cfg_lbl_dtr: "Enable DTR Reset on Connect",
        cfg_lbl_ok: "Echo Check (OK check)",
        cfg_lbl_fw: "Detected Firmware:",
        cfg_lbl_step_x: "$100 - Steps/mm X Axis:",
        cfg_lbl_step_y: "$101 - Steps/mm Y Axis:",
        cfg_lbl_step_z: "$102 - Steps/mm Z Axis:",
        cfg_lbl_travel_x: "$130 - Max Travel X (mm):",
        cfg_lbl_travel_y: "$131 - Max Travel Y (mm):",
        cfg_lbl_travel_z: "$132 - Max Travel Z (mm):",
        cfg_calib_title: "Steps/mm Calibration Wizard ($100, $101, $102)",
        cfg_calib_desc: "If commanding 100 mm moves a different distance, calculate the exact value here:",
        cfg_calib_eje: "Axis to Calibrate:",
        cfg_calib_comandada: "Commanded Distance (mm):",
        cfg_calib_real: "Measured Real Distance (mm):",
        cfg_btn_calc: "Calculate and Apply",
        cfg_lbl_streamer: "Line Sending Mode:",
        cfg_lbl_polling: "Status Polling Frequency (?):",
        cfg_lbl_skip_comments: "Skip blank lines and comments",
        cfg_lbl_pause_m6: "Safe pause on M6 tool change command",
        cfg_lbl_theme: "Visual Theme:",
        cfg_lbl_units: "Unit System:",
        cfg_lbl_decimals: "DRO Decimal Places:",
        cfg_lbl_language: "Interface Language / Idioma (RNF-08):",
        cfg_lbl_color_cut: "Cutting Path Color (G1/G2):",
        cfg_lbl_color_rapid: "Rapid Move Color (G0):",
        cfg_lbl_reticle: "Show real-time tool reticle",
        cfg_lbl_bed_limits: "Show machine bed limits",
        cfg_lbl_tool_3d: "Draw 3D tool model",
        cfg_lbl_active_tool: "Active Tool:",
        cfg_lbl_autoscroll: "Autoscroll on new messages",
        cfg_lbl_timestamps: "Include timestamps ([HH:MM:SS])",
        cfg_lbl_filter_status: "Filter periodic status queries (<Idle...>)",
        cfg_lbl_highlight_alarms: "Highlight errors and alarms in red",
        cfg_btn_cancel: "Cancel",
        cfg_btn_save: "Save Configuration",
        cfg_btn_start_probe: "Start Probing",
        cfg_btn_clear_heightmap: "Clear Heightmap",
        btn_run_macro: "Execute",
        tool_modal_title: "CNC Tool Selection",
        tool_modal_subtitle: "Configuration of mounted working head (ESCOM - IPN)",
        tool_modal_instruction: "Select the tool mounted on the CNC machine head:",
        tool_name_fresa: "CNC Endmill",
        tool_name_lapiz: "Drawing Pen",
        tool_name_laser: "Laser Diode",
        tool_badge_fresa: "CUTTING &amp; MILLING",
        tool_badge_lapiz: "EDUCATIONAL DRAWING",
        tool_badge_laser: "LASER ENGRAVING &amp; CUTTING",
        tool_btn_cancel: "Close",
        tool_btn_apply: "Apply Tool",
        consola_loc: "[LOCALIZATION] Language set to English."
      }
    },
    inicializar() {
      const guardado = localStorage.getItem('cnc_idioma');
      const lang = guardado || estado.idiomaActual || 'es';
      this.aplicar(lang);
      if (elementos.botonToggleIdioma) {
        elementos.botonToggleIdioma.addEventListener('click', () => {
          const nuevo = (estado.idiomaActual === 'es') ? 'en' : 'es';
          this.aplicar(nuevo);
        });
      }
      if (elementos.selectorIdiomaConfig) {
        elementos.selectorIdiomaConfig.value = lang;
        elementos.selectorIdiomaConfig.addEventListener('change', (e) => {
          this.aplicar(e.target.value);
        });
      }
    },
    aplicar(lang) {
      estado.idiomaActual = lang;
      localStorage.setItem('cnc_idioma', lang);
      document.documentElement.lang = lang;

      if (elementos.etiquetaIdiomaActual) {
        elementos.etiquetaIdiomaActual.textContent = lang.toUpperCase();
      }
      if (elementos.selectorIdiomaConfig) {
        elementos.selectorIdiomaConfig.value = lang;
      }

      const d = this.diccionarios[lang] || this.diccionarios.es;

      const setTxt = (sel, txt) => {
        const el = document.querySelector(sel);
        if (el) el.textContent = txt;
      };
      const setHtml = (sel, html) => {
        const el = document.querySelector(sel);
        if (el) el.innerHTML = html;
      };

      // Menús principales
      setTxt('#menu-archivo > .menu-btn', d.menu_archivo);
      setTxt('#menu-editar > .menu-btn', d.menu_editar);
      setTxt('#menu-maquina > .menu-btn', d.menu_maquina);
      setTxt('#menu-herramientas > .menu-btn', d.menu_herramientas);
      setTxt('#menu-vista > .menu-btn', d.menu_vista);
      setTxt('#menu-ayuda > .menu-btn', d.menu_ayuda);

      // Desplegable Archivo
      setHtml('#btn-menu-open-file', `<i class="fa-solid fa-folder-open"></i> ${d.btn_abrir_archivo} <span class="shortcut">Ctrl+O</span>`);
      setHtml('#btn-menu-load-sample', `<i class="fa-solid fa-file-code"></i> ${d.btn_cargar_demo}`);
      setHtml('#btn-menu-save-gcode', `<i class="fa-solid fa-floppy-disk"></i> ${d.btn_guardar_gcode} <span class="shortcut">Ctrl+S</span>`);
      setHtml('#btn-menu-historial', `<i class="fa-solid fa-clock-rotate-left"></i> ${d.btn_historial}`);
      setHtml('#btn-menu-export-log', `<i class="fa-solid fa-file-export"></i> ${d.btn_exportar_bitacora}`);

      // Desplegable Editar
      setHtml('#btn-menu-clear-gcode', `<i class="fa-solid fa-eraser"></i> ${d.btn_limpiar_prog}`);
      setHtml('#btn-menu-clear-console', `<i class="fa-solid fa-trash-can"></i> ${d.btn_limpiar_consola}`);

      // Desplegable Máquina
      setHtml('#btn-menu-homing', `<i class="fa-solid fa-house"></i> ${d.btn_homing}`);
      setHtml('#btn-menu-unlock', `<i class="fa-solid fa-lock-open"></i> ${d.btn_desbloquear}`);
      setHtml('#btn-menu-reset-grbl', `<i class="fa-solid fa-rotate-right"></i> ${d.btn_reset_grbl}`);
      setHtml('#btn-menu-goto-origin', `<i class="fa-solid fa-location-crosshairs"></i> ${d.btn_ir_origen}`);

      // Desplegable Herramientas
      setHtml('#btn-menu-select-tool', `<i class="fa-solid fa-pen-ruler"></i> ${d.btn_tipo_herramienta}`);
      setHtml('#btn-menu-heightmap', `<i class="fa-solid fa-layer-group"></i> ${d.btn_mapa_alturas}`);
      setHtml('#btn-menu-calibration', `<i class="fa-solid fa-ruler-combined"></i> ${d.btn_calibracion}`);
      setHtml('#btn-menu-macros', `<i class="fa-solid fa-bolt"></i> ${d.btn_macros}`);

      // Desplegable Vista
      setHtml('#btn-menu-view-xy', `<i class="fa-solid fa-vector-square"></i> ${d.btn_vista_xy}`);
      setHtml('#btn-menu-view-xz', `<i class="fa-solid fa-bars-staggered"></i> ${d.btn_vista_xz}`);
      setHtml('#btn-menu-view-3d', `<i class="fa-solid fa-cube"></i> ${d.btn_vista_3d}`);
      setHtml('#btn-menu-toggle-grid', `<i class="fa-solid fa-border-all"></i> ${d.btn_alternar_cuadricula}`);
      setHtml('#btn-menu-fullscreen', `<i class="fa-solid fa-expand"></i> ${d.btn_pantalla_completa} <span class="shortcut">F11</span>`);

      // Desplegable Ayuda
      setHtml('#btn-menu-tutorial', `<i class="fa-solid fa-graduation-cap"></i> ${d.btn_tutorial}`);
      setHtml('#btn-menu-gcode-dict', `<i class="fa-solid fa-book-bookmark"></i> ${d.btn_diccionario}`);
      setHtml('#btn-menu-manual', `<i class="fa-solid fa-book-open"></i> ${d.btn_manual}`);
      setHtml('#btn-menu-about', `<i class="fa-solid fa-circle-info"></i> ${d.btn_acerca}`);

      // Barra de estado
      setHtml('#btn-open-config', `<i class="fa-solid fa-gear gear-icon"></i> ${d.btn_config}`);
      setHtml('#btn-quick-unlock', `<i class="fa-solid fa-lock-open"></i> ${d.lbl_desbloquear_rapido}`);
      const lblLimites = document.getElementById('lbl-limits-state');
      if (lblLimites) {
        lblLimites.textContent = estado.limitesAlcanzados ? d.lbl_limites_on : d.lbl_limites_off;
      }

      // Visualizador y Rótulos Flotantes
      setTxt('#lbl-tab-tool-prefix', d.lbl_tab_tool_prefix);
      setTxt('#lbl-legend-pending', d.legend_pending);
      setTxt('#lbl-legend-done', d.legend_done);
      setTxt('#badge-legend .line-rapid + .legend-text', d.legend_rapid);
      setTxt('#badge-legend .icon-origin + .legend-text', d.legend_origin);
      setTxt('#badge-legend .icon-bed + .legend-text', d.legend_bed);
      setTxt('#badge-legend #legend-row-exceso .legend-text', d.legend_oob);

      // ViewCube faces
      setTxt('.viewcube-face.face-top span:first-child', d.cube_top);
      setTxt('.viewcube-face.face-front span:first-child', d.cube_front);
      setTxt('.viewcube-face.face-right span:first-child', d.cube_right);
      setTxt('.viewcube-face.face-back span:first-child', d.cube_back);
      setTxt('.viewcube-face.face-left span:first-child', d.cube_left);
      setTxt('.viewcube-face.face-bottom span:first-child', d.cube_bottom);

      setHtml('#btn-view-orbit', `<i class="fa-solid fa-arrows-spin"></i> ${d.btn_orbit}`);
      setHtml('#tab-trayectoria', `<i class="fa-solid fa-route"></i> ${d.tab_trayectoria}`);
      setTxt('.loaded-file-indicator .file-label', d.lbl_archivo);

      // Paneles Inferiores (G-Code & Consola)
      setHtml('.panel-code-standalone .panel-title-bar span', `<i class="fa-solid fa-code text-cyan"></i> ${d.panel_gcode_title}`);
      setHtml('#btn-mdi-send', `<i class="fa-solid fa-paper-plane"></i> ${d.btn_enviar}`);
      const mdiIn = document.getElementById('mdi-input-cmd');
      if (mdiIn) mdiIn.placeholder = d.placeholder_mdi;

      setHtml('.panel-console-standalone .panel-title-bar span', `<i class="fa-solid fa-terminal text-cyan"></i> ${d.panel_console_title}`);
      setHtml('#btn-quick-clean-console', `<i class="fa-solid fa-eraser"></i> ${d.btn_limpiar}`);
      setHtml('#btn-console-send', `<i class="fa-solid fa-paper-plane"></i> ${d.btn_enviar}`);
      const cIn = document.getElementById('console-cmd-input');
      if (cIn) cIn.placeholder = d.placeholder_console;

      // Panel Lateral (Sidebar)
      setTxt('#block-dro .sidebar-header .title-sub', d.dro_title);
      setHtml('#btn-zero-xy', `<i class="fa-solid fa-bullseye"></i> ${d.dro_zero_xy}`);
      setHtml('#btn-zero-z-action', `<i class="fa-solid fa-bullseye"></i> ${d.dro_zero_z}`);
      setHtml('#btn-zero-all', `<i class="fa-solid fa-bullseye"></i> ${d.dro_zero_all}`);

      setTxt('#block-jog .sidebar-header .title-sub', d.jog_title);
      setTxt('#block-override .speed-txt', d.jog_vel_label);

      setTxt('#block-execution .sidebar-header .title-sub', d.exec_title);
      setTxt('#block-execution .tele-item:nth-child(1) .tele-label', d.tele_linea);
      setTxt('#block-execution .tele-item:nth-child(2) .tele-label', d.tele_avance);
      setTxt('#block-execution .tele-item:nth-child(3) .tele-label', d.tele_tiempo);
      setTxt('#block-execution .tele-item:nth-child(4) .tele-label', d.tele_feed_real);
      setTxt('#block-execution .tele-item:nth-child(6) .tele-label', d.tele_override);
      setTxt('#block-execution .prog-label', d.tele_progreso);

      setHtml('#btn-execution-action', `<i class="fa-solid fa-play"></i> ${d.btn_start}`);
      setHtml('#btn-execution-pause', `<i class="fa-solid fa-pause"></i> ${d.btn_pausa}`);
      setHtml('#btn-execution-stop', `<i class="fa-solid fa-stop"></i> ${d.btn_detener}`);

      // Banner Toast de bienvenida (si está visible)
      setTxt('.toast-welcome-title', d.banner_toast_title);
      setTxt('.toast-welcome-body', d.banner_toast_body);
      setTxt('#btn-dismiss-toast', d.btn_toast_dismiss);
      setTxt('#btn-start-tutorial-toast', d.btn_toast_start);

      // ================= MODAL DE CONFIGURACIÓN =================
      setTxt('#modal-config-backdrop .modal-title', d.cfg_modal_title);
      setTxt('#modal-config-backdrop .modal-subtitle', d.cfg_modal_subtitle);

      // Pestañas de navegación de configuración
      setHtml('button[data-target="cfg-tab-conexion"]', `<i class="fa-solid fa-network-wired tab-icon"></i> ${d.cfg_nav_conexion}`);
      setHtml('button[data-target="cfg-tab-maquina"]', `<i class="fa-solid fa-microchip tab-icon"></i> ${d.cfg_nav_maquina}`);
      setHtml('button[data-target="cfg-tab-emisor"]', `<i class="fa-solid fa-tower-broadcast tab-icon"></i> ${d.cfg_nav_emisor}`);
      setHtml('button[data-target="cfg-tab-ui"]', `<i class="fa-solid fa-palette tab-icon"></i> ${d.cfg_nav_ui}`);
      setHtml('button[data-target="cfg-tab-atajos"]', `<i class="fa-solid fa-keyboard tab-icon"></i> ${d.cfg_nav_atajos}`);
      setHtml('button[data-target="cfg-tab-visualizador"]', `<i class="fa-solid fa-eye tab-icon"></i> ${d.cfg_nav_visualizador}`);
      setHtml('button[data-target="cfg-tab-consola"]', `<i class="fa-solid fa-terminal tab-icon"></i> ${d.cfg_nav_consola}`);
      setHtml('button[data-target="cfg-tab-macros"]', `<i class="fa-solid fa-bolt tab-icon"></i> ${d.cfg_nav_macros}`);
      setHtml('button[data-target="cfg-tab-heightmap"]', `<i class="fa-solid fa-layer-group tab-icon"></i> ${d.cfg_nav_heightmap}`);
      setHtml('button[data-target="cfg-tab-creditos"]', `<i class="fa-solid fa-award tab-icon"></i> ${d.cfg_nav_creditos}`);

      // Títulos de sección de paneles de configuración
      setHtml('#cfg-tab-conexion .panel-section-title', `<i class="fa-solid fa-network-wired"></i> ${d.cfg_sec_conexion}`);
      setHtml('#cfg-tab-maquina .panel-section-title', `<i class="fa-solid fa-microchip"></i> ${d.cfg_sec_maquina}`);
      setHtml('#cfg-tab-emisor .panel-section-title', `<i class="fa-solid fa-tower-broadcast"></i> ${d.cfg_sec_emisor}`);
      setHtml('#cfg-tab-ui .panel-section-title', `<i class="fa-solid fa-palette"></i> ${d.cfg_sec_ui}`);
      setHtml('#cfg-tab-atajos .panel-section-title', `<i class="fa-solid fa-keyboard"></i> ${d.cfg_sec_atajos}`);
      setHtml('#cfg-tab-visualizador .panel-section-title', `<i class="fa-solid fa-eye"></i> ${d.cfg_sec_visualizador}`);
      setHtml('#cfg-tab-consola .panel-section-title', `<i class="fa-solid fa-terminal"></i> ${d.cfg_sec_consola}`);
      setHtml('#cfg-tab-macros .panel-section-title', `<i class="fa-solid fa-bolt"></i> ${d.cfg_sec_macros}`);
      setHtml('#cfg-tab-heightmap .panel-section-title', `<i class="fa-solid fa-layer-group"></i> ${d.cfg_sec_heightmap}`);
      setHtml('#cfg-tab-creditos .panel-section-title', `<i class="fa-solid fa-scale-balanced"></i> ${d.cfg_sec_creditos}`);

      // Etiquetas y checkboxes de configuración
      const setLbl = (inputSel, txt) => {
        const inp = document.querySelector(inputSel);
        if (inp && inp.closest('.form-group')) {
          const lbl = inp.closest('.form-group').querySelector('label');
          if (lbl) lbl.textContent = txt;
        }
      };

      setLbl('#cfg-port', d.cfg_lbl_port);
      setLbl('#cfg-baud', d.cfg_lbl_baud);
      setLbl('#cfg-buffer-size', d.cfg_lbl_buffer);
      const chkDtr = document.getElementById('cfg-dtr-reset');
      if (chkDtr && chkDtr.parentElement) {
        chkDtr.parentElement.innerHTML = `<input type="checkbox" id="cfg-dtr-reset" ${chkDtr.checked ? 'checked' : ''}> ${d.cfg_lbl_dtr}`;
      }
      const chkOk = document.getElementById('cfg-ok-check');
      if (chkOk && chkOk.parentElement) {
        chkOk.parentElement.innerHTML = `<input type="checkbox" id="cfg-ok-check" ${chkOk.checked ? 'checked' : ''}> ${d.cfg_lbl_ok}`;
      }

      setLbl('#cfg-step-x', d.cfg_lbl_step_x);
      setLbl('#cfg-step-y', d.cfg_lbl_step_y);
      setLbl('#cfg-step-z', d.cfg_lbl_step_z);
      setLbl('#cfg-travel-x', d.cfg_lbl_travel_x);
      setLbl('#cfg-travel-y', d.cfg_lbl_travel_y);
      setLbl('#cfg-travel-z', d.cfg_lbl_travel_z);

      setHtml('#box-calibracion-pasos h4', `<i class="fa-solid fa-calculator"></i> ${d.cfg_calib_title}`);
      setTxt('#box-calibracion-pasos .form-help', d.cfg_calib_desc);
      setLbl('#calib-eje', d.cfg_calib_eje);
      setLbl('#calib-dist-comandada', d.cfg_calib_comandada);
      setLbl('#calib-dist-real', d.cfg_calib_real);
      setHtml('#btn-calcular-pasos', `<i class="fa-solid fa-arrows-rotate"></i> ${d.cfg_btn_calc}`);

      setLbl('#cfg-streamer-mode', d.cfg_lbl_streamer);
      setLbl('#cfg-status-interval', d.cfg_lbl_polling);
      const chkSkip = document.getElementById('cfg-skip-comments');
      if (chkSkip && chkSkip.parentElement) {
        chkSkip.parentElement.innerHTML = `<input type="checkbox" id="cfg-skip-comments" ${chkSkip.checked ? 'checked' : ''}> ${d.cfg_lbl_skip_comments}`;
      }
      const chkPauseM6 = document.getElementById('cfg-pause-m6');
      if (chkPauseM6 && chkPauseM6.parentElement) {
        chkPauseM6.parentElement.innerHTML = `<input type="checkbox" id="cfg-pause-m6" ${chkPauseM6.checked ? 'checked' : ''}> ${d.cfg_lbl_pause_m6}`;
      }

      setLbl('#cfg-theme-select', d.cfg_lbl_theme);
      setLbl('#cfg-units-select', d.cfg_lbl_units);
      setLbl('#cfg-dro-decimals', d.cfg_lbl_decimals);
      const lblLang = document.querySelector('#cfg-language-select')?.closest('.form-group')?.querySelector('label');
      if (lblLang) lblLang.innerHTML = `<i class="fa-solid fa-language"></i> ${d.cfg_lbl_language}`;

      setLbl('#cfg-color-cut', d.cfg_lbl_color_cut);
      setLbl('#cfg-color-rapid', d.cfg_lbl_color_rapid);
      const chkReticle = document.getElementById('cfg-show-tool-reticle');
      if (chkReticle && chkReticle.parentElement) {
        chkReticle.parentElement.innerHTML = `<input type="checkbox" id="cfg-show-tool-reticle" ${chkReticle.checked ? 'checked' : ''}> ${d.cfg_lbl_reticle}`;
      }
      const chkBed = document.getElementById('cfg-show-bed-limits');
      if (chkBed && chkBed.parentElement) {
        chkBed.parentElement.innerHTML = `<input type="checkbox" id="cfg-show-bed-limits" ${chkBed.checked ? 'checked' : ''}> ${d.cfg_lbl_bed_limits}`;
      }
      const chkTool3D = document.getElementById('cfg-show-tool-3d');
      if (chkTool3D && chkTool3D.parentElement) {
        chkTool3D.parentElement.innerHTML = `<input type="checkbox" id="cfg-show-tool-3d" ${chkTool3D.checked ? 'checked' : ''}> ${d.cfg_lbl_tool_3d}`;
      }
      setLbl('#cfg-select-tool-type', d.cfg_lbl_active_tool);

      const chkScroll = document.getElementById('cfg-console-autoscroll');
      if (chkScroll && chkScroll.parentElement) {
        chkScroll.parentElement.innerHTML = `<input type="checkbox" id="cfg-console-autoscroll" ${chkScroll.checked ? 'checked' : ''}> ${d.cfg_lbl_autoscroll}`;
      }
      const chkTime = document.getElementById('cfg-console-timestamps');
      if (chkTime && chkTime.parentElement) {
        chkTime.parentElement.innerHTML = `<input type="checkbox" id="cfg-console-timestamps" ${chkTime.checked ? 'checked' : ''}> ${d.cfg_lbl_timestamps}`;
      }
      const chkFilter = document.getElementById('cfg-console-filter-status');
      if (chkFilter && chkFilter.parentElement) {
        chkFilter.parentElement.innerHTML = `<input type="checkbox" id="cfg-console-filter-status" ${chkFilter.checked ? 'checked' : ''}> ${d.cfg_lbl_filter_status}`;
      }
      const chkHighlight = document.getElementById('cfg-console-highlight-alarms');
      if (chkHighlight && chkHighlight.parentElement) {
        chkHighlight.parentElement.innerHTML = `<input type="checkbox" id="cfg-console-highlight-alarms" ${chkHighlight.checked ? 'checked' : ''}> ${d.cfg_lbl_highlight_alarms}`;
      }

      // Botones de macros
      document.querySelectorAll('.btn-run-macro').forEach(btn => {
        btn.innerHTML = `<i class="fa-solid fa-play"></i> ${d.btn_run_macro}`;
      });

      // Botones del footer del modal de configuración
      setTxt('#btn-cancel-config', d.cfg_btn_cancel);
      setTxt('#btn-save-config', d.cfg_btn_save);
      setHtml('#btn-start-probing', `<i class="fa-solid fa-play"></i> ${d.cfg_btn_start_probe}`);
      setHtml('#btn-clear-heightmap', `<i class="fa-solid fa-eraser"></i> ${d.cfg_btn_clear_heightmap}`);

      // ================= MODAL SELECCIÓN DE HERRAMIENTA =================
      setTxt('#modal-tool-backdrop .modal-title', d.tool_modal_title);
      setTxt('#modal-tool-backdrop .modal-subtitle', d.tool_modal_subtitle);
      setTxt('.tool-modal-instruction', d.tool_modal_instruction);
      setTxt('#title-card-tool-fresa', d.tool_name_fresa);
      setTxt('#title-card-tool-lapiz', d.tool_name_lapiz);
      setTxt('#title-card-tool-laser', d.tool_name_laser);
      setHtml('#badge-tool-fresa', d.tool_badge_fresa);
      setHtml('#badge-tool-lapiz', d.tool_badge_lapiz);
      setHtml('#badge-tool-laser', d.tool_badge_laser);
      setTxt('#btn-cancel-tool', d.tool_btn_cancel);
      setTxt('#btn-apply-tool', d.tool_btn_apply);

      // Re-sincronizar herramienta activa y rótulos de husillo/láser
      actualizarUIPorTipoHerramienta(estado.tipoHerramienta);

      imprimirEnConsola('c-info', d.consola_loc);
    }
  };

  // Inicializar divisor ajustable del panel lateral
  inicializarRedimensionamientoSidebar();

  // Inicializar colapso de bloques en el panel lateral
  inicializarColapsoBloquesSidebar();

  // Sincronizar herramienta activa al inicio
  actualizarUIPorTipoHerramienta(estado.tipoHerramienta);

  // Inicializar gestores pedagógicos y funcionales (RF-10, RNF-06, RNF-08)
  HistorialManager.inicializar();
  TutorialManager.inicializar();
  I18nManager.inicializar();

  // Inicializar puente PyQt6
  inicializarPuentePyQt();
});

