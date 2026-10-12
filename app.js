/**
 * CNC Basic v1.0 - Controlador de Lógica y Telemetría (app.js)
 * Gestión del estado del sistema, DRO, jogging manual, simulación de código G y comunicación serial.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Inicialización del motor gráfico en el lienzo principal
  window.visualizadorCNC = new VisualizadorCNC('cnc-canvas');
  window.cncVisualizer = window.visualizadorCNC;

  // ==========================================
  // ESTADO GLOBAL DE LA MÁQUINA CNC
  // ==========================================
  const estado = {
    // Coordenadas relativas de trabajo (WCS - G54)
    coordenadasTrabajo: { x: 266.715, y: 224.548, z: 0.000 },
    // Coordenadas absolutas de la máquina (MCS)
    coordenadasMaquina: { x: 266.715, y: 224.548, z: 0.000 },
    // Estado operativo de GRBL ('IDLE', 'RUN', 'HOLD', 'ALARM')
    estadoOperativo: 'IDLE',
    limitesHabilitados: false,
    incrementoPaso: 0.1, // Distancia por pulsación (mm)
    porcentajeVelocidadManual: 50,
    // Control del husillo (Spindle)
    husilloActivo: false,
    revolucionesPorMinuto: 12000,
    modificadorHusillo: 100, // Override en porcentaje
    // Programa cargado y flujo de ejecución
    indiceLineaActiva: 12, // Resalta línea 13 (base 0)
    enEjecucion: false,
    enPausa: false,
    segundosTranscurridos: 13,
    segundosTotalesEstimados: 525, // 08:45 minutos
    velocidadAvanceNominal: 800, // mm/min
    lineasPrograma: [
      { texto: "G21 ; Unidades metricas en milimetros" },
      { texto: "G90 ; Posicionamiento absoluto" },
      { texto: "G94 ; Avance en mm/min" },
      { texto: "G0 Z5.0" },
      { texto: "M3 S12000 ; spindle ON" },
      { texto: "G0 X110.0 Y140.0" },
      { texto: "G1 Z-1.0 F300" },
      { texto: "G1 X210.0 F800" },
      { texto: "G1 Y220.0" },
      { texto: "G1 X110.0" },
      { texto: "G1 Y140.0" },
      { texto: "G0 Z5.0" },
      { texto: "M5 ; spindle OFF" }
    ],
    temporizadorEjecucion: null
  };

  // ==========================================
  // REFERENCIAS DE ELEMENTOS DE LA INTERFAZ
  // ==========================================
  const elementos = {
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
  // SINCRONIZACIÓN DE COORDENADAS Y PANTALLA DRO
  // ==========================================
  function actualizarLecturasDRO() {
    elementos.droValorX.textContent = estado.coordenadasTrabajo.x.toFixed(3);
    elementos.droValorY.textContent = estado.coordenadasTrabajo.y.toFixed(3);
    elementos.droValorZ.textContent = estado.coordenadasTrabajo.z.toFixed(3);

    elementos.droMaquinaX.textContent = estado.coordenadasMaquina.x.toFixed(3);
    elementos.droMaquinaY.textContent = estado.coordenadasMaquina.y.toFixed(3);
    elementos.droMaquinaZ.textContent = estado.coordenadasMaquina.z.toFixed(3);

    if (window.visualizadorCNC) {
      window.visualizadorCNC.establecerPosicionHerramienta(
        estado.coordenadasTrabajo.x,
        estado.coordenadasTrabajo.y,
        estado.coordenadasTrabajo.z
      );
    }
  }

  // Actualiza visualmente el estado del controlador (IDLE, RUN, ALARM)
  function establecerEstadoOperativo(nuevoEstado) {
    estado.estadoOperativo = nuevoEstado;
    elementos.etiquetaEstadoControlador.textContent = nuevoEstado;
    elementos.puntoIndicadorEstado.className = 'indicator-dot';

    if (nuevoEstado === 'IDLE') {
      elementos.puntoIndicadorEstado.classList.add('dot-idle');
      elementos.botonParoEmergencia.classList.remove('alarm-active');
    } else if (nuevoEstado === 'RUN') {
      elementos.puntoIndicadorEstado.classList.add('dot-run');
      elementos.botonParoEmergencia.classList.remove('alarm-active');
    } else if (nuevoEstado === 'ALARM') {
      elementos.puntoIndicadorEstado.classList.add('dot-alarm');
      elementos.botonParoEmergencia.classList.add('alarm-active');
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
    if (eje === 'X') {
      estado.coordenadasTrabajo.x = Math.max(0, Math.min(320, estado.coordenadasTrabajo.x + desplazamiento));
      estado.coordenadasMaquina.x = estado.coordenadasTrabajo.x;
    } else if (eje === 'Y') {
      estado.coordenadasTrabajo.y = Math.max(0, Math.min(220, estado.coordenadasTrabajo.y + desplazamiento));
      estado.coordenadasMaquina.y = estado.coordenadasTrabajo.y;
    } else if (eje === 'Z') {
      estado.coordenadasTrabajo.z = Math.max(-50, Math.min(60, estado.coordenadasTrabajo.z + desplazamiento));
      estado.coordenadasMaquina.z = estado.coordenadasTrabajo.z;
    }

    actualizarLecturasDRO();
    const avanceCalculado = Math.round(estado.velocidadAvanceNominal * (estado.porcentajeVelocidadManual / 100));
    const signo = desplazamiento > 0 ? '+' : '';
    imprimirEnConsola('c-ok', `> $J=G91 G21 ${eje}${signo}${desplazamiento.toFixed(3)} F${avanceCalculado}`);
    imprimirEnConsola('c-ok', 'ok');
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
  elementos.botonCeroX.addEventListener('click', () => { estado.coordenadasTrabajo.x = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 X0\nok'); });
  elementos.botonCeroY.addEventListener('click', () => { estado.coordenadasTrabajo.y = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 Y0\nok'); });
  elementos.botonCeroZ.addEventListener('click', () => { estado.coordenadasTrabajo.z = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 Z0\nok'); });
  elementos.botonCeroXY.addEventListener('click', () => { estado.coordenadasTrabajo.x = 0; estado.coordenadasTrabajo.y = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 X0 Y0\nok'); });
  elementos.botonCeroSoloZ.addEventListener('click', () => { estado.coordenadasTrabajo.z = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 Z0\nok'); });
  elementos.botonCeroTodos.addEventListener('click', () => { estado.coordenadasTrabajo.x = 0; estado.coordenadasTrabajo.y = 0; estado.coordenadasTrabajo.z = 0; actualizarLecturasDRO(); imprimirEnConsola('c-ok', '> G10 L20 P1 X0 Y0 Z0\nok'); });

  // ==========================================
  // CONTROL DEL HUSILLO DE FRESADO
  // ==========================================
  function alternarHusillo() {
    estado.husilloActivo = !estado.husilloActivo;
    if (estado.husilloActivo) {
      elementos.botonAlternarHusillo.classList.add('active');
      elementos.textoBotonHusillo.textContent = 'Spindle ON';
      elementos.metricaEstadoHusillo.textContent = 'ON';
      elementos.metricaEstadoHusillo.classList.add('highlight-cyan');
      imprimirEnConsola('c-grbl', `> M3 S${estado.revolucionesPorMinuto}`);
      imprimirEnConsola('c-ok', 'ok');
    } else {
      elementos.botonAlternarHusillo.classList.remove('active');
      elementos.textoBotonHusillo.textContent = 'Spindle OFF';
      elementos.metricaEstadoHusillo.textContent = 'OFF';
      elementos.metricaEstadoHusillo.classList.remove('highlight-cyan');
      imprimirEnConsola('c-grbl', '> M5');
      imprimirEnConsola('c-ok', 'ok');
    }
  }

  elementos.botonAlternarHusillo.addEventListener('click', alternarHusillo);

  elementos.entradaRpmHusillo.addEventListener('change', (evento) => {
    estado.revolucionesPorMinuto = parseInt(evento.target.value, 10) || 0;
    elementos.etiquetaRpmEnVivo.textContent = `${estado.revolucionesPorMinuto} RPM`;
    if (estado.husilloActivo) {
      imprimirEnConsola('c-grbl', `> S${estado.revolucionesPorMinuto}`);
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
    if (estado.estadoOperativo !== 'ALARM') {
      establecerEstadoOperativo('ALARM');
      detenerMecanizado();
      imprimirEnConsola('c-error', '[EMERGENCIA] ¡PARADA E-STOP ACTIVADA! Transmisión y ejes interrumpidos de inmediato.');
    } else {
      if (confirm('¿Desea desbloquear la alarma de seguridad ($X) y rearmar la máquina?')) {
        establecerEstadoOperativo('IDLE');
        imprimirEnConsola('c-info', '> $X');
        imprimirEnConsola('c-ok', '[MSG:Caution: Unlocked]');
        imprimirEnConsola('c-ok', 'ok');
      }
    }
  });

  elementos.indicadorLimites.addEventListener('click', () => {
    estado.limitesHabilitados = !estado.limitesHabilitados;
    if (estado.limitesHabilitados) {
      elementos.puntoIndicadorLimites.className = 'indicator-dot dot-connected';
      elementos.etiquetaEstadoLimites.textContent = 'Límites: ON';
      imprimirEnConsola('c-info', '[CONFIG] Sensores de límite fin de carrera HABILITADOS ($21=1).');
    } else {
      elementos.puntoIndicadorLimites.className = 'indicator-dot dot-off';
      elementos.etiquetaEstadoLimites.textContent = 'Límites: OFF';
      imprimirEnConsola('c-info', '[CONFIG] Sensores de límite fin de carrera DESHABILITADOS ($21=0).');
    }
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

    desplazarALineaActiva();
  }

  // Resaltado léxico de instrucciones G, M y comentarios
  function formatearSintaxisCodigoG(textoOriginal) {
    let salida = textoOriginal;
    if (salida.includes(';')) {
      const partes = salida.split(';');
      const codigo = partes[0];
      const comentario = partes.slice(1).join(';');
      salida = colorearComandos(codigo) + `<span class="cmd-comment">;${comentario}</span>`;
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
    const todasLasLineas = elementos.contenedorLineasGcode.querySelectorAll('.gcode-line');
    todasLasLineas.forEach((elem, i) => {
      if (i === indice) elem.classList.add('active');
      else elem.classList.remove('active');
    });
    actualizarMetricasTelemetria();
  }

  function desplazarALineaActiva() {
    const lineaSeleccionada = elementos.contenedorLineasGcode.querySelector('.gcode-line.active');
    if (lineaSeleccionada) {
      lineaSeleccionada.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
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

    imprimirEnConsola('c-ok', `> ${comando}`);
    const comandoMayusculas = comando.toUpperCase();

    if (comandoMayusculas === '$$') {
      imprimirEnConsola('c-grbl', '$100=250.000 (x:step/mm)\n$101=250.000 (y:step/mm)\n$102=400.000 (z:step/mm)\n$110=1000.000 (x:max feed)\n$120=50.000 (x:accel)\n$130=300.000 (x:max travel)');
      imprimirEnConsola('c-ok', 'ok');
    } else if (comandoMayusculas === '$H') {
      imprimirEnConsola('c-info', '[HOMING] Ejecutando búsqueda de límites de referencia física...');
      estado.coordenadasTrabajo.x = 0; estado.coordenadasTrabajo.y = 0; estado.coordenadasTrabajo.z = 0;
      actualizarLecturasDRO();
      imprimirEnConsola('c-ok', 'ok');
    } else if (comandoMayusculas === '$X') {
      establecerEstadoOperativo('IDLE');
      imprimirEnConsola('c-info', '[MSG:Caution: Unlocked]');
      imprimirEnConsola('c-ok', 'ok');
    } else if (comandoMayusculas.startsWith('G0') || comandoMayusculas.startsWith('G1')) {
      const coincidenciaX = comandoMayusculas.match(/X([0-9.-]+)/);
      const coincidenciaY = comandoMayusculas.match(/Y([0-9.-]+)/);
      const coincidenciaZ = comandoMayusculas.match(/Z([0-9.-]+)/);
      if (coincidenciaX) estado.coordenadasTrabajo.x = parseFloat(coincidenciaX[1]);
      if (coincidenciaY) estado.coordenadasTrabajo.y = parseFloat(coincidenciaY[1]);
      if (coincidenciaZ) estado.coordenadasTrabajo.z = parseFloat(coincidenciaZ[1]);
      actualizarLecturasDRO();
      imprimirEnConsola('c-ok', 'ok');
    } else if (comandoMayusculas === 'M3' || comandoMayusculas.startsWith('M3 ')) {
      alternarHusillo();
    } else if (comandoMayusculas === 'M5') {
      if (estado.husilloActivo) alternarHusillo();
    } else {
      imprimirEnConsola('c-ok', 'ok');
    }
  }

  elementos.botonEnviarMdi.addEventListener('click', () => {
    procesarComandoMdi(elementos.entradaMdi.value);
  });

  elementos.entradaMdi.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      procesarComandoMdi(elementos.entradaMdi.value);
    }
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
  // SIMULACIÓN Y TELEMETRÍA DE MECANIZADO
  // ==========================================
  function actualizarMetricasTelemetria() {
    const totalLineas = estado.lineasPrograma.length;
    const lineaActual = estado.indiceLineaActiva + 1;
    elementos.metricaNumeroLinea.textContent = `${lineaActual} / ${totalLineas}`;
    elementos.telemetriaBuffer.textContent = `${lineaActual} / ${totalLineas}`;

    const porcentajeAvance = Math.round((lineaActual / totalLineas) * 100);
    elementos.barraProgresoRelleno.style.width = `${porcentajeAvance}%`;
    elementos.etiquetaPorcentajeProgreso.textContent = `${porcentajeAvance}%`;

    elementos.metricaTiempoTranscurrido.textContent = formatearTiempo(estado.segundosTranscurridos);
    elementos.telemetriaTiempoTranscurrido.textContent = formatearTiempo(estado.segundosTranscurridos);
  }

  function formatearTiempo(segundos) {
    const horas = String(Math.floor(segundos / 3600)).padStart(2, '0');
    const minutos = String(Math.floor((segundos % 3600) / 60)).padStart(2, '0');
    const segs = String(segundos % 60).padStart(2, '0');
    return `${horas}:${minutos}:${segs}`;
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

    imprimirEnConsola('c-info', '[EJECUCIÓN] Transmitiendo programa al controlador GRBL...');

    if (estado.indiceLineaActiva >= estado.lineasPrograma.length - 1) {
      estado.indiceLineaActiva = 0;
      estado.segundosTranscurridos = 0;
    }

    estado.temporizadorEjecucion = setInterval(avanzarPasoMecanizado, 900);
  }

  function avanzarPasoMecanizado() {
    if (estado.indiceLineaActiva < estado.lineasPrograma.length - 1) {
      seleccionarLineaGcode(estado.indiceLineaActiva + 1);
      estado.segundosTranscurridos += 2;
      actualizarMetricasTelemetria();

      const textoLinea = estado.lineasPrograma[estado.indiceLineaActiva].texto;
      extraerCoordenadasDeTexto(textoLinea);
      imprimirEnConsola('c-grbl', `> ${textoLinea}`);
    } else {
      detenerMecanizado();
      imprimirEnConsola('c-info', '[FIN] Mecanizado concluido satisfactoriamente (M30/M5).');
    }
  }

  function extraerCoordenadasDeTexto(texto) {
    const mayusculas = texto.toUpperCase();
    const mx = mayusculas.match(/X([0-9.-]+)/);
    const my = mayusculas.match(/Y([0-9.-]+)/);
    const mz = mayusculas.match(/Z([0-9.-]+)/);
    if (mx) estado.coordenadasTrabajo.x = parseFloat(mx[1]);
    if (my) estado.coordenadasTrabajo.y = parseFloat(my[1]);
    if (mz) estado.coordenadasTrabajo.z = parseFloat(mz[1]);
    actualizarLecturasDRO();
  }

  function pausarMecanizado() {
    estado.enPausa = !estado.enPausa;
    if (estado.enPausa) {
      clearInterval(estado.temporizadorEjecucion);
      elementos.botonPausarMecanizado.innerHTML = '<i class="fa-solid fa-play"></i> CONTINUAR';
      establecerEstadoOperativo('HOLD');
      imprimirEnConsola('c-info', '[PAUSA] Transmisión pausada (! Feed Hold activado).');
    } else {
      elementos.botonPausarMecanizado.innerHTML = '<i class="fa-solid fa-pause"></i> PAUSA';
      establecerEstadoOperativo('RUN');
      estado.temporizadorEjecucion = setInterval(avanzarPasoMecanizado, 900);
      imprimirEnConsola('c-info', '[REANUDAR] Continuando ejecución (~ Cycle Start activado).');
    }
  }

  function detenerMecanizado() {
    estado.enEjecucion = false;
    estado.enPausa = false;
    clearInterval(estado.temporizadorEjecucion);
    establecerEstadoOperativo('IDLE');

    elementos.botonIniciarMecanizado.classList.remove('hidden');
    elementos.botonPausarMecanizado.classList.add('hidden');
    elementos.botonDetenerMecanizado.classList.add('hidden');
    elementos.botonPausarMecanizado.innerHTML = '<i class="fa-solid fa-pause"></i> PAUSA';
  }

  elementos.botonIniciarMecanizado.addEventListener('click', iniciarMecanizado);
  elementos.botonPausarMecanizado.addEventListener('click', pausarMecanizado);
  elementos.botonDetenerMecanizado.addEventListener('click', detenerMecanizado);

  // ==========================================
  // CONTROLES DE PERSPECTIVA DEL VISUALIZADOR
  // ==========================================
  elementos.botonVistaXY.addEventListener('click', () => {
    activarBotonVista(elementos.botonVistaXY);
    window.visualizadorCNC.establecerModoVista('XY');
  });

  elementos.botonVistaXZ.addEventListener('click', () => {
    activarBotonVista(elementos.botonVistaXZ);
    window.visualizadorCNC.establecerModoVista('XZ');
  });

  elementos.botonVista3D.addEventListener('click', () => {
    activarBotonVista(elementos.botonVista3D);
    window.visualizadorCNC.establecerModoVista('3D');
  });

  function activarBotonVista(botonActivo) {
    [elementos.botonVistaXY, elementos.botonVistaXZ, elementos.botonVista3D].forEach(b => b.classList.remove('active'));
    botonActivo.classList.add('active');
  }

  elementos.botonZoomMas.addEventListener('click', () => window.visualizadorCNC.establecerZoom(0.25));
  elementos.botonZoomMenos.addEventListener('click', () => window.visualizadorCNC.establecerZoom(-0.25));
  elementos.botonReiniciarZoom.addEventListener('click', () => window.visualizadorCNC.reiniciarVista());

  // ==========================================
  // ATAJOS RÁPIDOS DE TECLADO
  // ==========================================
  window.addEventListener('keydown', (evento) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
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

  elementos.botonCerrarConfiguracion.addEventListener('click', () => elementos.modalConfiguracion.classList.add('hidden'));
  elementos.botonCancelarConfiguracion.addEventListener('click', () => elementos.modalConfiguracion.classList.add('hidden'));
  elementos.botonGuardarConfiguracion.addEventListener('click', () => {
    elementos.modalConfiguracion.classList.add('hidden');
    imprimirEnConsola('c-info', '[CONFIG] Parámetros guardados y sincronizados correctamente en la memoria EEPROM.');
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
      const textoFila = fila.textContent.toLowerCase();
      fila.style.display = textoFila.includes(consulta) ? '' : 'none';
    });
  });

  elementos.botonCargarDemo.addEventListener('click', () => {
    estado.indiceLineaActiva = 0;
    renderizarListaCodigoG();
    actualizarMetricasTelemetria();
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
        imprimirEnConsola('c-info', `[ARCHIVO] Archivo ${archivo.name} cargado con ${lineas.length} líneas.`);
      }
    };
    lector.readAsText(archivo);
  });

  elementos.botonMenuHoming.addEventListener('click', () => procesarComandoMdi('$H'));
  elementos.botonMenuDesbloquear.addEventListener('click', () => procesarComandoMdi('$X'));
  elementos.botonMenuReiniciarGrbl.addEventListener('click', () => {
    detenerMecanizado();
    imprimirEnConsola('c-grbl', '\nGrbl 1.1h [ESCOM Didáctico: Reiniciado]');
    establecerEstadoOperativo('IDLE');
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
});
