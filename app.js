/**
 * CNC Basic v1.0 - Controlador Principal (app.js)
 * Manejo de estado del sistema, DRO, Jogging, Simulación de G-Code, MDI y Modales.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Inicializar renderizador Canvas
  window.cncVisualizer = new CNCVisualizer('cnc-canvas');

  // ==========================================
  // ESTADO GLOBAL DE LA MÁQUINA
  // ==========================================
  const state = {
    // Coordenadas de Trabajo (WCS - G54)
    wcs: { x: 266.715, y: 224.548, z: 0.000 },
    // Coordenadas de Máquina (MCS)
    mcs: { x: 266.715, y: 224.548, z: 0.000 },
    // Estado GRBL: 'IDLE', 'RUN', 'HOLD', 'ALARM'
    machineStatus: 'IDLE',
    limitsEnabled: false,
    selectedStep: 0.1, // mm
    jogSpeedPct: 50,
    // Spindle
    spindleOn: false,
    spindleRpm: 12000,
    spindleOverride: 100,
    // G-Code y Ejecución
    activeLineIndex: 12, // Línea 13 (0-indexed 12)
    isRunning: false,
    isPaused: false,
    elapsedSeconds: 13,
    totalSeconds: 525, // 08:45
    feedrate: 800,
    gcodeLines: [
      { text: "G21 ; Unidades metricas en milimetros" },
      { text: "G90 ; Posicionamiento absoluto" },
      { text: "G94 ; Avance en mm/min" },
      { text: "G0 Z5.0" },
      { text: "M3 S12000 ; spindle ON" },
      { text: "G0 X110.0 Y140.0" },
      { text: "G1 Z-1.0 F300" },
      { text: "G1 X210.0 F800" },
      { text: "G1 Y220.0" },
      { text: "G1 X110.0" },
      { text: "G1 Y140.0" },
      { text: "G0 Z5.0" },
      { text: "M5 ; spindle OFF" }
    ],
    simulationTimer: null,
    clockTimer: null
  };

  // ==========================================
  // REFERENCIAS DOM
  // ==========================================
  const dom = {
    // DRO Readouts
    droValX: document.getElementById('dro-val-x'),
    droValY: document.getElementById('dro-val-y'),
    droValZ: document.getElementById('dro-val-z'),
    droMachX: document.getElementById('dro-mach-x'),
    droMachY: document.getElementById('dro-mach-y'),
    droMachZ: document.getElementById('dro-mach-z'),
    // Botones Zero
    btnZeroX: document.getElementById('btn-zero-x'),
    btnZeroY: document.getElementById('btn-zero-y'),
    btnZeroZ: document.getElementById('btn-zero-z'),
    btnZeroXY: document.getElementById('btn-zero-xy'),
    btnZeroZAction: document.getElementById('btn-zero-z-action'),
    btnZeroAll: document.getElementById('btn-zero-all'),
    // Jog D-Pad
    btnJogYPlus: document.getElementById('btn-jog-y-plus'),
    btnJogYMinus: document.getElementById('btn-jog-y-minus'),
    btnJogXPlus: document.getElementById('btn-jog-x-plus'),
    btnJogXMinus: document.getElementById('btn-jog-x-minus'),
    btnJogZPlus: document.getElementById('btn-jog-z-plus'),
    btnJogZMinus: document.getElementById('btn-jog-z-minus'),
    stepButtons: document.querySelectorAll('.step-btn'),
    sliderJogSpeed: document.getElementById('slider-jog-speed'),
    lblJogVel: document.getElementById('lbl-jog-vel'),
    // Spindle
    btnSpindleToggle: document.getElementById('btn-spindle-toggle'),
    lblSpindleBtnText: document.getElementById('lbl-spindle-btn-text'),
    inputSpindleRpm: document.getElementById('input-spindle-rpm'),
    lblSpindleSpeedLive: document.getElementById('lbl-spindle-speed-live'),
    sliderSpindleOverride: document.getElementById('slider-spindle-override'),
    metricSpindleState: document.getElementById('metric-spindle-state'),
    // Status Bar & E-STOP
    btnEstop: document.getElementById('btn-estop'),
    lblMachineState: document.getElementById('lbl-machine-state'),
    stateStatusDot: document.getElementById('state-status-dot'),
    pillLimitsState: document.getElementById('pill-limits-state'),
    limitsStatusDot: document.getElementById('limits-status-dot'),
    lblLimitsState: document.getElementById('lbl-limits-state'),
    // Visualizer Mode & Zoom
    btnViewXY: document.getElementById('btn-view-xy'),
    btnViewXZ: document.getElementById('btn-view-xz'),
    btnView3D: document.getElementById('btn-view-3d'),
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnZoomReset: document.getElementById('btn-zoom-reset'),
    // G-Code Viewport
    gcodeContainer: document.getElementById('gcode-lines-container'),
    tabBtnGcode: document.getElementById('tab-btn-gcode'),
    tabBtnConsole: document.getElementById('tab-btn-console'),
    paneGcode: document.getElementById('pane-gcode'),
    paneConsole: document.getElementById('pane-console'),
    // MDI & Console
    mdiInput: document.getElementById('mdi-input-cmd'),
    btnMdiSend: document.getElementById('btn-mdi-send'),
    consoleOutput: document.getElementById('console-output'),
    consoleInput: document.getElementById('console-cmd-input'),
    btnConsoleSend: document.getElementById('btn-console-send'),
    // Execution Control
    metricLine: document.getElementById('metric-line'),
    metricFeed: document.getElementById('metric-feed'),
    metricTime: document.getElementById('metric-time'),
    metricFeedPct: document.getElementById('metric-feed-pct'),
    progressBarFill: document.getElementById('progress-bar-fill'),
    lblProgressPercent: document.getElementById('lbl-progress-percent'),
    btnExecutionAction: document.getElementById('btn-execution-action'),
    btnExecutionPause: document.getElementById('btn-execution-pause'),
    btnExecutionStop: document.getElementById('btn-execution-stop'),
    teleElapsed: document.getElementById('tele-elapsed'),
    teleBuffer: document.getElementById('tele-buffer'),
    // Modales
    btnOpenConfig: document.getElementById('btn-open-config'),
    modalConfig: document.getElementById('modal-config-backdrop'),
    btnCloseConfig: document.getElementById('btn-close-config-modal'),
    btnCancelConfig: document.getElementById('btn-cancel-config'),
    btnSaveConfig: document.getElementById('btn-save-config'),
    cfgTabBtns: document.querySelectorAll('.cfg-tab-btn'),
    cfgPanels: document.querySelectorAll('.cfg-panel'),
    modalDict: document.getElementById('modal-dict-backdrop'),
    btnCloseDict: document.getElementById('btn-close-dict-modal'),
    dictSearch: document.getElementById('dict-search'),
    dictTableBody: document.getElementById('dict-table-body'),
    fileInputGcode: document.getElementById('file-input-gcode'),
    btnMenuLoadSample: document.getElementById('btn-menu-load-sample'),
    btnMenuOpenFile: document.getElementById('btn-menu-open-file'),
    btnMenuGcodeDict: document.getElementById('btn-menu-gcode-dict'),
    btnMenuAbout: document.getElementById('btn-menu-about'),
    btnMenuHoming: document.getElementById('btn-menu-homing'),
    btnMenuUnlock: document.getElementById('btn-menu-unlock'),
    btnMenuResetGrbl: document.getElementById('btn-menu-reset-grbl')
  };

  // ==========================================
  // FUNCIONES DE SINCRONIZACIÓN Y DRO
  // ==========================================
  function updateDRO() {
    dom.droValX.textContent = state.wcs.x.toFixed(3);
    dom.droValY.textContent = state.wcs.y.toFixed(3);
    dom.droValZ.textContent = state.wcs.z.toFixed(3);

    dom.droMachX.textContent = state.mcs.x.toFixed(3);
    dom.droMachY.textContent = state.mcs.y.toFixed(3);
    dom.droMachZ.textContent = state.mcs.z.toFixed(3);

    // Sincronizar posición con visualizador Canvas
    if (window.cncVisualizer) {
      window.cncVisualizer.setToolPosition(state.wcs.x, state.wcs.y, state.wcs.z);
    }
  }

  function setMachineState(newState) {
    state.machineStatus = newState;
    dom.lblMachineState.textContent = newState;
    dom.stateStatusDot.className = 'indicator-dot';

    if (newState === 'IDLE') {
      dom.stateStatusDot.classList.add('dot-idle');
      dom.btnEstop.classList.remove('alarm-active');
    } else if (newState === 'RUN') {
      dom.stateStatusDot.classList.add('dot-run');
      dom.btnEstop.classList.remove('alarm-active');
    } else if (newState === 'ALARM') {
      dom.stateStatusDot.classList.add('dot-alarm');
      dom.btnEstop.classList.add('alarm-active');
    }
  }

  // ==========================================
  // JOGGING Y MOVIMIENTO MANUAL
  // ==========================================
  function jogAxis(axis, direction) {
    if (state.machineStatus === 'ALARM') {
      appendConsole('c-error', '[ALARMA] Máquina bloqueada por E-STOP. Use $X para desbloquear.');
      return;
    }

    const delta = state.selectedStep * direction;
    if (axis === 'X') {
      state.wcs.x = Math.max(0, Math.min(320, state.wcs.x + delta));
      state.mcs.x = state.wcs.x;
    } else if (axis === 'Y') {
      state.wcs.y = Math.max(0, Math.min(220, state.wcs.y + delta));
      state.mcs.y = state.wcs.y;
    } else if (axis === 'Z') {
      state.wcs.z = Math.max(-50, Math.min(60, state.wcs.z + delta));
      state.mcs.z = state.wcs.z;
    }

    updateDRO();
    appendConsole('c-ok', `> $J=G91 G21 ${axis}${delta > 0 ? '+' : ''}${delta.toFixed(3)} F${Math.round(state.feedrate * (state.jogSpeedPct / 100))}`);
    appendConsole('c-ok', 'ok');
  }

  // Eventos de botones Jog
  dom.btnJogYPlus.addEventListener('click', () => jogAxis('Y', 1));
  dom.btnJogYMinus.addEventListener('click', () => jogAxis('Y', -1));
  dom.btnJogXPlus.addEventListener('click', () => jogAxis('X', 1));
  dom.btnJogXMinus.addEventListener('click', () => jogAxis('X', -1));
  dom.btnJogZPlus.addEventListener('click', () => jogAxis('Z', 1));
  dom.btnJogZMinus.addEventListener('click', () => jogAxis('Z', -1));

  // Selectores de incremento de paso (0.01, 0.1, 1, 10 mm)
  dom.stepButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      dom.stepButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedStep = parseFloat(btn.dataset.step);
    });
  });

  // Slider de velocidad Jog
  dom.sliderJogSpeed.addEventListener('input', (e) => {
    state.jogSpeedPct = parseInt(e.target.value, 10);
    dom.lblJogVel.textContent = `${state.jogSpeedPct}%`;
  });

  // Botones de puesta a cero de ejes
  dom.btnZeroX.addEventListener('click', () => { state.wcs.x = 0; updateDRO(); appendConsole('c-ok', '> G10 L20 P1 X0\nok'); });
  dom.btnZeroY.addEventListener('click', () => { state.wcs.y = 0; updateDRO(); appendConsole('c-ok', '> G10 L20 P1 Y0\nok'); });
  dom.btnZeroZ.addEventListener('click', () => { state.wcs.z = 0; updateDRO(); appendConsole('c-ok', '> G10 L20 P1 Z0\nok'); });
  dom.btnZeroXY.addEventListener('click', () => { state.wcs.x = 0; state.wcs.y = 0; updateDRO(); appendConsole('c-ok', '> G10 L20 P1 X0 Y0\nok'); });
  dom.btnZeroZAction.addEventListener('click', () => { state.wcs.z = 0; updateDRO(); appendConsole('c-ok', '> G10 L20 P1 Z0\nok'); });
  dom.btnZeroAll.addEventListener('click', () => { state.wcs.x = 0; state.wcs.y = 0; state.wcs.z = 0; updateDRO(); appendConsole('c-ok', '> G10 L20 P1 X0 Y0 Z0\nok'); });

  // ==========================================
  // HUSILLO (SPINDLE)
  // ==========================================
  function toggleSpindle() {
    state.spindleOn = !state.spindleOn;
    if (state.spindleOn) {
      dom.btnSpindleToggle.classList.add('active');
      dom.lblSpindleBtnText.textContent = 'Spindle ON';
      dom.metricSpindleState.textContent = 'ON';
      dom.metricSpindleState.classList.add('highlight-cyan');
      appendConsole('c-grbl', `> M3 S${state.spindleRpm}`);
      appendConsole('c-ok', 'ok');
    } else {
      dom.btnSpindleToggle.classList.remove('active');
      dom.lblSpindleBtnText.textContent = 'Spindle OFF';
      dom.metricSpindleState.textContent = 'OFF';
      dom.metricSpindleState.classList.remove('highlight-cyan');
      appendConsole('c-grbl', '> M5');
      appendConsole('c-ok', 'ok');
    }
  }

  dom.btnSpindleToggle.addEventListener('click', toggleSpindle);

  dom.inputSpindleRpm.addEventListener('change', (e) => {
    state.spindleRpm = parseInt(e.target.value, 10) || 0;
    dom.lblSpindleSpeedLive.textContent = `${state.spindleRpm} RPM`;
    if (state.spindleOn) {
      appendConsole('c-grbl', `> S${state.spindleRpm}`);
    }
  });

  dom.sliderSpindleOverride.addEventListener('input', (e) => {
    state.spindleOverride = parseInt(e.target.value, 10);
    const realRpm = Math.round(state.spindleRpm * (state.spindleOverride / 100));
    dom.lblSpindleSpeedLive.textContent = `${realRpm} RPM`;
  });

  // ==========================================
  // E-STOP & LÍMITES
  // ==========================================
  dom.btnEstop.addEventListener('click', () => {
    if (state.machineStatus !== 'ALARM') {
      setMachineState('ALARM');
      stopExecution();
      appendConsole('c-error', '[EMERGENCIA] ¡PARADA E-STOP ACTIVADA! Ejes bloqueados inmediatamente.');
    } else {
      // Si ya estaba en alarma, mostrar diálogo de desbloqueo $X
      if (confirm('¿Desea desbloquear la alarma de seguridad ($X) y rearmar la máquina?')) {
        setMachineState('IDLE');
        appendConsole('c-info', '> $X');
        appendConsole('c-ok', '[MSG:Caution: Unlocked]');
        appendConsole('c-ok', 'ok');
      }
    }
  });

  dom.pillLimitsState.addEventListener('click', () => {
    state.limitsEnabled = !state.limitsEnabled;
    if (state.limitsEnabled) {
      dom.limitsStatusDot.className = 'indicator-dot dot-connected';
      dom.lblLimitsState.textContent = 'Límites: ON';
      appendConsole('c-info', '[CONFIG] Sensores de límite fin de carrera HABILITADOS ($21=1).');
    } else {
      dom.limitsStatusDot.className = 'indicator-dot dot-off';
      dom.lblLimitsState.textContent = 'Límites: OFF';
      appendConsole('c-info', '[CONFIG] Sensores de límite fin de carrera DESHABILITADOS ($21=0).');
    }
  });

  // ==========================================
  // RENDERIZADO DEL VISOR DE G-CODE
  // ==========================================
  function renderGcodeList() {
    dom.gcodeContainer.innerHTML = '';
    state.gcodeLines.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'gcode-line';
      if (index === state.activeLineIndex) {
        li.classList.add('active');
      }

      const numSpan = document.createElement('span');
      numSpan.className = 'line-num';
      numSpan.textContent = (index + 1).toString();

      const textSpan = document.createElement('span');
      textSpan.className = 'line-text';
      textSpan.innerHTML = formatGcodeSyntax(item.text);

      li.appendChild(numSpan);
      li.appendChild(textSpan);

      li.addEventListener('click', () => {
        selectGcodeLine(index);
      });

      dom.gcodeContainer.appendChild(li);
    });

    scrollActiveLineIntoView();
  }

  function formatGcodeSyntax(raw) {
    let html = raw;
    // Comentarios
    if (html.includes(';')) {
      const parts = html.split(';');
      const code = parts[0];
      const comment = parts.slice(1).join(';');
      html = formatTokens(code) + `<span class="cmd-comment">;${comment}</span>`;
    } else {
      html = formatTokens(html);
    }
    return html;
  }

  function formatTokens(str) {
    return str
      .replace(/(G[0-9]+(?:\.[0-9]+)?)/gi, '<span class="cmd-g">$1</span>')
      .replace(/(M[0-9]+)/gi, '<span class="cmd-m">$1</span>')
      .replace(/([XYZFS][0-9.-]+)/gi, '<b>$1</b>');
  }

  function selectGcodeLine(index) {
    state.activeLineIndex = index;
    const all = dom.gcodeContainer.querySelectorAll('.gcode-line');
    all.forEach((el, i) => {
      if (i === index) el.classList.add('active');
      else el.classList.remove('active');
    });
    updateTelemetry();
  }

  function scrollActiveLineIntoView() {
    const activeEl = dom.gcodeContainer.querySelector('.gcode-line.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // ==========================================
  // CONSOLA SERIAL Y MDI
  // ==========================================
  function appendConsole(cssClass, text) {
    const div = document.createElement('div');
    div.className = `console-line ${cssClass}`;
    div.textContent = text;
    dom.consoleOutput.appendChild(div);
    dom.consoleOutput.scrollTop = dom.consoleOutput.scrollHeight;
  }

  function handleMdiCommand(rawCmd) {
    const cmd = rawCmd.trim();
    if (!cmd) return;

    appendConsole('c-ok', `> ${cmd}`);

    // Procesar comandos educativos comunes
    const upper = cmd.toUpperCase();
    if (upper === '$$') {
      appendConsole('c-grbl', '$100=250.000 (x:step/mm)\n$101=250.000 (y:step/mm)\n$102=400.000 (z:step/mm)\n$110=1000.000 (x:max feed)\n$120=50.000 (x:accel)\n$130=300.000 (x:max travel)');
      appendConsole('c-ok', 'ok');
    } else if (upper === '$H') {
      appendConsole('c-info', '[HOMING] Ejecutando búsqueda de límites de referencia...');
      state.wcs.x = 0; state.wcs.y = 0; state.wcs.z = 0;
      updateDRO();
      appendConsole('c-ok', 'ok');
    } else if (upper === '$X') {
      setMachineState('IDLE');
      appendConsole('c-info', '[MSG:Caution: Unlocked]');
      appendConsole('c-ok', 'ok');
    } else if (upper.startsWith('G0') || upper.startsWith('G1')) {
      // Simular movimiento según coordenadas pasadas en el comando
      const matchX = upper.match(/X([0-9.-]+)/);
      const matchY = upper.match(/Y([0-9.-]+)/);
      const matchZ = upper.match(/Z([0-9.-]+)/);
      if (matchX) state.wcs.x = parseFloat(matchX[1]);
      if (matchY) state.wcs.y = parseFloat(matchY[1]);
      if (matchZ) state.wcs.z = parseFloat(matchZ[1]);
      updateDRO();
      appendConsole('c-ok', 'ok');
    } else if (upper === 'M3' || upper.startsWith('M3 ')) {
      toggleSpindle();
    } else if (upper === 'M5') {
      if (state.spindleOn) toggleSpindle();
    } else {
      appendConsole('c-ok', 'ok');
    }
  }

  dom.btnMdiSend.addEventListener('click', () => {
    handleMdiCommand(dom.mdiInput.value);
  });

  dom.mdiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleMdiCommand(dom.mdiInput.value);
    }
  });

  dom.btnConsoleSend.addEventListener('click', () => {
    handleMdiCommand(dom.consoleInput.value);
    dom.consoleInput.value = '';
  });

  dom.consoleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleMdiCommand(dom.consoleInput.value);
      dom.consoleInput.value = '';
    }
  });

  // Pestañas G-Code / Consola
  dom.tabBtnGcode.addEventListener('click', () => {
    dom.tabBtnGcode.classList.add('active');
    dom.tabBtnConsole.classList.remove('active');
    dom.paneGcode.classList.add('active');
    dom.paneConsole.classList.remove('active');
  });

  dom.tabBtnConsole.addEventListener('click', () => {
    dom.tabBtnConsole.classList.add('active');
    dom.tabBtnGcode.classList.remove('active');
    dom.paneConsole.classList.add('active');
    dom.paneGcode.classList.remove('active');
  });

  // ==========================================
  // CONTROL DE EJECUCIÓN (SIMULACIÓN DIDÁCTICA)
  // ==========================================
  function updateTelemetry() {
    const totalLines = state.gcodeLines.length;
    const currentLine = state.activeLineIndex + 1;
    dom.metricLine.textContent = `${currentLine} / ${totalLines}`;
    dom.teleBuffer.textContent = `${currentLine} / ${totalLines}`;

    const pct = Math.round((currentLine / totalLines) * 100);
    dom.progressBarFill.style.width = `${pct}%`;
    dom.lblProgressPercent.textContent = `${pct}%`;

    dom.metricTime.textContent = formatTime(state.elapsedSeconds);
    dom.teleElapsed.textContent = formatTime(state.elapsedSeconds);
  }

  function formatTime(sec) {
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function startExecution() {
    if (state.machineStatus === 'ALARM') {
      alert('La máquina está en estado de ALARMA (E-STOP). Desbloquee antes de iniciar.');
      return;
    }

    state.isRunning = true;
    state.isPaused = false;
    setMachineState('RUN');

    dom.btnExecutionAction.classList.add('hidden');
    dom.btnExecutionPause.classList.remove('hidden');
    dom.btnExecutionStop.classList.remove('hidden');

    appendConsole('c-info', '[EJECUCIÓN] Iniciando transmisión de programa pieza_01.nc...');

    // Si ya estaba al final, reiniciar desde la línea 1
    if (state.activeLineIndex >= state.gcodeLines.length - 1) {
      state.activeLineIndex = 0;
      state.elapsedSeconds = 0;
    }

    state.simulationTimer = setInterval(stepExecution, 900);
  }

  function stepExecution() {
    if (state.activeLineIndex < state.gcodeLines.length - 1) {
      selectGcodeLine(state.activeLineIndex + 1);
      state.elapsedSeconds += 2;
      updateTelemetry();

      const lineText = state.gcodeLines[state.activeLineIndex].text;
      handleLineCoordinates(lineText);
      appendConsole('c-grbl', `> ${lineText}`);
    } else {
      // Fin del programa
      stopExecution();
      appendConsole('c-info', '[FIN] Mecanizado completado con éxito (M30/M5).');
    }
  }

  function handleLineCoordinates(text) {
    const upper = text.toUpperCase();
    const mx = upper.match(/X([0-9.-]+)/);
    const my = upper.match(/Y([0-9.-]+)/);
    const mz = upper.match(/Z([0-9.-]+)/);
    if (mx) state.wcs.x = parseFloat(mx[1]);
    if (my) state.wcs.y = parseFloat(my[1]);
    if (mz) state.wcs.z = parseFloat(mz[1]);
    updateDRO();
  }

  function pauseExecution() {
    state.isPaused = !state.isPaused;
    if (state.isPaused) {
      clearInterval(state.simulationTimer);
      dom.btnExecutionPause.textContent = '▶ CONTINUAR';
      setMachineState('HOLD');
      appendConsole('c-info', '[PAUSA] Transmisión detenida temporalmente (! Feed Hold).');
    } else {
      dom.btnExecutionPause.textContent = '⏸ PAUSA';
      setMachineState('RUN');
      state.simulationTimer = setInterval(stepExecution, 900);
      appendConsole('c-info', '[REANUDAR] Continuando ejecución (~ Cycle Start).');
    }
  }

  function stopExecution() {
    state.isRunning = false;
    state.isPaused = false;
    clearInterval(state.simulationTimer);
    setMachineState('IDLE');

    dom.btnExecutionAction.classList.remove('hidden');
    dom.btnExecutionPause.classList.add('hidden');
    dom.btnExecutionStop.classList.add('hidden');
    dom.btnExecutionPause.textContent = '⏸ PAUSA';
  }

  dom.btnExecutionAction.addEventListener('click', startExecution);
  dom.btnExecutionPause.addEventListener('click', pauseExecution);
  dom.btnExecutionStop.addEventListener('click', stopExecution);

  // ==========================================
  // CONTROLES DE VISTA Y ZOOM DEL VISUALIZADOR
  // ==========================================
  dom.btnViewXY.addEventListener('click', () => {
    setActiveViewBtn(dom.btnViewXY);
    window.cncVisualizer.setViewMode('XY');
  });

  dom.btnViewXZ.addEventListener('click', () => {
    setActiveViewBtn(dom.btnViewXZ);
    window.cncVisualizer.setViewMode('XZ');
  });

  dom.btnView3D.addEventListener('click', () => {
    setActiveViewBtn(dom.btnView3D);
    window.cncVisualizer.setViewMode('3D');
  });

  function setActiveViewBtn(activeBtn) {
    [dom.btnViewXY, dom.btnViewXZ, dom.btnView3D].forEach(b => b.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  dom.btnZoomIn.addEventListener('click', () => window.cncVisualizer.setZoom(0.25));
  dom.btnZoomOut.addEventListener('click', () => window.cncVisualizer.setZoom(-0.25));
  dom.btnZoomReset.addEventListener('click', () => window.cncVisualizer.resetView());

  // ==========================================
  // ATAJOS DE TECLADO
  // ==========================================
  window.addEventListener('keydown', (e) => {
    // Si el usuario está escribiendo en un input, no disparar jog
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      return;
    }

    if (e.key === 'ArrowUp') { e.preventDefault(); jogAxis('Y', 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); jogAxis('Y', -1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); jogAxis('X', -1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); jogAxis('X', 1); }
    else if (e.key === 'PageUp') { e.preventDefault(); jogAxis('Z', 1); }
    else if (e.key === 'PageDown') { e.preventDefault(); jogAxis('Z', -1); }
    else if (e.key === ' ') { e.preventDefault(); if (state.isRunning) pauseExecution(); }
    else if (e.key === 'Escape') { dom.btnEstop.click(); }
  });

  // ==========================================
  // MODALES Y MENÚS DESPLEGABLES
  // ==========================================
  dom.btnOpenConfig.addEventListener('click', () => {
    dom.modalConfig.classList.remove('hidden');
  });

  dom.btnCloseConfig.addEventListener('click', () => dom.modalConfig.classList.add('hidden'));
  dom.btnCancelConfig.addEventListener('click', () => dom.modalConfig.classList.add('hidden'));
  dom.btnSaveConfig.addEventListener('click', () => {
    dom.modalConfig.classList.add('hidden');
    appendConsole('c-info', '[CONFIG] Parámetros guardados y sincronizados con EEPROM GRBL.');
  });

  // Pestañas internas del modal de configuración
  dom.cfgTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dom.cfgTabBtns.forEach(b => b.classList.remove('active'));
      dom.cfgPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(btn.dataset.target);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Ejecución de Macros desde el modal
  document.querySelectorAll('.btn-run-macro').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const macroCmds = e.target.dataset.macro.split(';');
      dom.modalConfig.classList.add('hidden');
      macroCmds.forEach(c => handleMdiCommand(c));
    });
  });

  // Modal Diccionario G-Code
  dom.btnMenuGcodeDict.addEventListener('click', () => dom.modalDict.classList.remove('hidden'));
  dom.btnCloseDict.addEventListener('click', () => dom.modalDict.classList.add('hidden'));

  dom.dictSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const rows = dom.dictTableBody.querySelectorAll('tr');
    rows.forEach(r => {
      const txt = r.textContent.toLowerCase();
      r.style.display = txt.includes(query) ? '' : 'none';
    });
  });

  // Carga de archivo demo
  dom.btnMenuLoadSample.addEventListener('click', () => {
    state.activeLineIndex = 0;
    renderGcodeList();
    updateTelemetry();
    appendConsole('c-info', '[ARCHIVO] Se ha cargado el programa pieza_01.nc.');
  });

  dom.btnMenuOpenFile.addEventListener('click', () => dom.fileInputGcode.click());
  dom.fileInputGcode.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .map(text => ({ text }));
      if (lines.length > 0) {
        state.gcodeLines = lines;
        state.activeLineIndex = 0;
        document.getElementById('lbl-loaded-filename').textContent = file.name;
        renderGcodeList();
        updateTelemetry();
        appendConsole('c-info', `[ARCHIVO] Archivo ${file.name} cargado con ${lines.length} líneas.`);
      }
    };
    reader.readAsText(file);
  });

  // Menús de Homing y Unlock
  dom.btnMenuHoming.addEventListener('click', () => handleMdiCommand('$H'));
  dom.btnMenuUnlock.addEventListener('click', () => handleMdiCommand('$X'));
  dom.btnMenuResetGrbl.addEventListener('click', () => {
    stopExecution();
    appendConsole('c-grbl', '\nGrbl 1.1h [ESCOM Didáctico: Reiniciado]');
    setMachineState('IDLE');
  });

  dom.btnMenuAbout.addEventListener('click', () => {
    alert('CNC Basic v1.0\nInterfaz de control para máquinas CNC con fines educativos\nTrabajo Terminal 2026-B072 (ESCOM - IPN)\n\nAutores:\n• Josué Martin Echeverría Arteaga\n• Jonathan Uriel Paredes Martínez\n\nDirector:\n• Dr. Gelacio Castillo Cabrera');
  });

  // Cerrar modales al hacer clic en el backdrop
  [dom.modalConfig, dom.modalDict].forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.add('hidden');
    });
  });

  // Render inicial
  renderGcodeList();
  updateDRO();
  updateTelemetry();
});
