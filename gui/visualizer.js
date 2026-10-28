/**
 * CNC Basic v1.0 - Motor Gráfico del Visualizador 2D/3D (visualizer.js)
 * Renderizado en Canvas para trayectorias de herramienta, plano cartesiano,
 * cubo de navegación interactivo (ViewCube 3D), zoom de precisión hacia el cursor (hasta 25,000%)
 * y cuadrícula milimétrica/micrométrica adaptativa para inspección de pistas PCB de alta definición.
 */

// Iteración acotada incluso cuando la precisión de Number impide sumar el paso.
function* valoresCuadricula(inicio, fin, paso, maximo = 256) {
  const rango = fin - inicio;
  if (![inicio, fin, paso, rango].every(Number.isFinite) || paso <= 0 || rango < 0) return;
  const incremento = Math.max(paso, rango / (maximo - 1));
  const cantidad = Math.min(maximo, Math.floor(rango / incremento) + 1);
  for (let i = 0; i < cantidad; i++) yield inicio + i * incremento;
}

class VisualizadorCNC {
  constructor(idLienzo) {
    this.lienzo = document.getElementById(idLienzo);
    if (!this.lienzo) return;
    this.contexto = this.lienzo.getContext('2d', { alpha: false });
    this._temporizadorResize = null;
    this._rafResize = null;

    // Búfer gráfico de aceleración para la escena estática (mesa, cuadrícula, trayectorias)
    // Garantiza 60 FPS fijos sin caídas de fotogramas durante la animación o corte de la herramienta
    this.lienzoEstatico = document.createElement('canvas');
    this.contextoEstatico = this.lienzoEstatico.getContext('2d', { alpha: false });
    this.necesitaRedibujarEstatico = true;
    this._cacheVisibles = null;
    this._cacheVisiblesValida = false;

    // Parámetros de la cámara y proyección
    this.modoVista = 'XY'; // Opciones: 'XY', 'XZ', 'YZ', '3D'
    this.zoom = 1.0;
    this.desplazamientoX = -35;
    this.desplazamientoY = 15;

    // Ángulos de cámara 3D (en grados):
    // inclinacion: 0° = horizontal (Frontal XZ), 90° = vertical hacia abajo (Superior XY), 35° = perspectiva 3D
    // azimut: rotación horizontal alrededor del eje Z (-35° = isométrica desde frente-izquierda)
    this.rotacionInclinacion = 35;
    this.rotacionAzimut = -35;
    this.escalaZ = 1.5; // Factor de realce de profundidad del eje Z (1.0x, 1.5x, 2.5x, 4.0x)

    // Centro espacial de rotación (alrededor del cual gira la pieza)
    this.centroPieza = { x: 160, y: 180, z: 0 };

    // Posición espacial actual de la herramienta (en milímetros)
    this.posicionHerramienta = { x: 0.000, y: 0.000, z: 0.000 };
    this.posicionObjetivo = { x: 0.000, y: 0.000, z: 0.000 };

    // Estado y animación de rotación de la herramienta (simulación / corte activo)
    this.herramientaGirando = false;
    this.anguloGiroHerramienta = 0;
    this.animacionGiroId = null;
    this.velocidadGiroHerramienta = 22; // Grados por fotograma (~1320°/s a 60 fps)

    // Tipo de herramienta visualizada: 'fresa' (Herramienta actual de corte) o 'lapiz' (Lápiz escolar didáctico)
    this.tipoHerramienta = localStorage.getItem('cnc_tipo_herramienta') || 'fresa';

    // Control de interacción con ratón
    this.estaArrastrando = false;
    this.tipoArrastre = 'pan'; // 'pan' o 'orbit'
    this.ultimoRatonX = 0;
    this.ultimoRatonY = 0;

    // Segmentos de trayectoria { tipo: 'G0'|'G1', x1, y1, z1, x2, y2, z2, linea }
    this.trayectoria = [];
    this.lineaActualEjecucion = -1; // -1 = sin ejecución activa (todo pendiente)
    this.indiceSegmentoActivo = -1; // Índice del segmento geométrico activo
    this.progresoSegmentoActivo = 0.0; // Fracción recorrida en el segmento activo [0.0 - 1.0]
    this.totalLineasGcode = 0;
    this.limitesMaterial = null;
    this.limitesZ = { minZ: -1.0, maxZ: 5.0 };
    this.mostrarCuadricula = true;

    // Dimensiones físicas del área de trabajo de la máquina ($130, $131, $132)
    this.limitesMaquina = {
      maxX: 300.0,
      maxY: 200.0,
      maxZ: 60.0
    };
    this.estadoLimites = {
      hayDesbordamiento: false,
      minPieza: { x: 0, y: 0, z: 0 },
      maxPieza: { x: 0, y: 0, z: 0 },
      ejesExcedidos: [],
      mensaje: ''
    };
    this.alertaLimitesCallback = null;

    // Configuración visual personalizable (Figuras 11 del TT)
    this.colorCortePersonalizado = localStorage.getItem('cnc_color_cut') || '#00e5ff';
    this.colorRapidoPersonalizado = localStorage.getItem('cnc_color_rapid') || '#708090';
    this.mostrarRetículaHerramienta = localStorage.getItem('cnc_show_reticle') !== 'false';
    this.mostrarLimitesMesa = localStorage.getItem('cnc_show_bed_limits') !== 'false';
    this.mostrarHerramienta3D = localStorage.getItem('cnc_show_tool_3d') !== 'false';

    this.cargarTrayectoriaEjemplo();

    this.redibujadoPendiente = false;
    this.iniciarEventos();
    this.iniciarCuboNavegacion();
    this.redimensionarLienzo();
    window.addEventListener('resize', () => this.redimensionarLienzo());
    this._observadorTamano = new ResizeObserver(() => this.redimensionarLienzo());
    this._observadorTamano.observe(this.lienzo.parentElement);
    window.addEventListener('pagehide', () => {
      this._observadorTamano.disconnect();
      clearTimeout(this._temporizadorResize);
      if (this._rafResize !== null) cancelAnimationFrame(this._rafResize);
      if (this.animacionGiroId) cancelAnimationFrame(this.animacionGiroId);
    });
  }

  // Solicita redibujado sincronizado con la tasa de refresco del monitor (60 FPS / vsync)
  solicitarRenderizado() {
    if (document.querySelector('.modal-backdrop:not(.hidden)')) {
      return;
    }
    // Si la animación continua de giro ya está activa a 60 FPS, evitar encolar RAF redundante
    if (this.herramientaGirando) {
      return;
    }
    if (this.redibujadoPendiente) return;
    this.redibujadoPendiente = true;
    requestAnimationFrame(() => {
      this.redibujadoPendiente = false;
      this.renderizar();
    });
  }

  marcarEstaticoSucio() {
    this.necesitaRedibujarEstatico = true;
    this._cacheVisiblesValida = false;
    this._progInvalido = true;
    this.actualizarMatrizProyeccion();
  }

  // Estirar el buffer existente mientras se arrastra; reasignarlo al estabilizarse.
  redimensionarLienzo() {
    if (!this.anchoPantalla) {
      this.aplicarTamanoLienzo();
      return;
    }
    clearTimeout(this._temporizadorResize);
    this._temporizadorResize = setTimeout(() => {
      this._temporizadorResize = null;
      if (this._rafResize !== null) return;
      this._rafResize = requestAnimationFrame(() => {
        this._rafResize = null;
        this.aplicarTamanoLienzo();
      });
    }, 80);
  }

  aplicarTamanoLienzo() {
    const rectangulo = this.lienzo.parentElement.getBoundingClientRect();
    const ancho = rectangulo.width, alto = rectangulo.height;
    if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho <= 0 || alto <= 0) return;
    // Dos buffers: como máximo 32 MiB en total para píxeles RGBA.
    const escala = Math.min(window.devicePixelRatio || 1, 2, 4096 / ancho, 4096 / alto,
                            Math.sqrt(4194304 / (ancho * alto)));
    const anchoDevice = Math.max(1, Math.floor(ancho * escala));
    const altoDevice = Math.max(1, Math.floor(alto * escala));
    const cambio = this.anchoPantalla !== ancho || this.altoPantalla !== alto ||
                   this.lienzo.width !== anchoDevice || this.lienzo.height !== altoDevice;
    if (!cambio) return;
    for (const lienzo of [this.lienzo, this.lienzoEstatico]) {
      if (lienzo.width !== anchoDevice) lienzo.width = anchoDevice;
      if (lienzo.height !== altoDevice) lienzo.height = altoDevice;
    }
    this.contexto.setTransform(anchoDevice / ancho, 0, 0, altoDevice / alto, 0, 0);
    this.contextoEstatico.setTransform(anchoDevice / ancho, 0, 0, altoDevice / alto, 0, 0);
    this.anchoPantalla = ancho;
    this.altoPantalla = alto;
    this.marcarEstaticoSucio();
    if (this.contexto && typeof this.contexto.save === 'function' && typeof this.renderizar === 'function') {
      this.renderizar();
    } else {
      this.solicitarRenderizado();
    }
  }

  // Control de interacción de ratón (órbita 3D, paneo y zoom enfocado hacia el cursor)
  iniciarEventos() {
    this.lienzo.addEventListener('contextmenu', (e) => e.preventDefault());

    this.lienzo.addEventListener('mousedown', (evento) => {
      if (![0, 2].includes(evento.button)) return;
      this.estaArrastrando = true;
      this.ultimoRatonX = evento.clientX;
      this.ultimoRatonY = evento.clientY;

      if (evento.button === 2 || evento.shiftKey || evento.ctrlKey) {
        // Clic derecho o Shift+Clic: Paneo de cámara
        this.tipoArrastre = 'pan';
        this.lienzo.style.cursor = 'move';
      } else {
        // Clic izquierdo:
        if (this.modoVista === '3D') {
          this.tipoArrastre = 'orbit';
          this.lienzo.style.cursor = 'grabbing';
        } else {
          this.tipoArrastre = 'pan';
          this.lienzo.style.cursor = 'grabbing';
        }
      }
    });

    window.addEventListener('mousemove', (evento) => {
      if (!this.estaArrastrando) return;
      if (!evento.buttons) { soltarArrastre(); return; }
      const deltaX = evento.clientX - this.ultimoRatonX;
      const deltaY = evento.clientY - this.ultimoRatonY;
      this.ultimoRatonX = evento.clientX;
      this.ultimoRatonY = evento.clientY;

      if (this.tipoArrastre === 'orbit' || (this.modoVista === '3D' && evento.buttons === 1 && !evento.shiftKey)) {
        // Rotación 3D natural en los 3 ejes
        this.rotacionAzimut = (this.rotacionAzimut + deltaX * 0.45) % 360;
        this.rotacionInclinacion = Math.max(5, Math.min(88, this.rotacionInclinacion - deltaY * 0.45));
        this.marcarEstaticoSucio();
        this.solicitarRenderizado();
      } else {
        // Paneo: desplazamiento de la escena
        this.desplazamientoX += deltaX;
        this.desplazamientoY += deltaY;
        this.marcarEstaticoSucio();
        this.solicitarRenderizado();
      }
    });

    const soltarArrastre = () => {
      this.estaArrastrando = false;
      this.tipoArrastre = null;
      if (this.lienzo) {
        this.lienzo.style.cursor = this.modoVista === '3D' ? 'grab' : 'crosshair';
      }
    };
    window.addEventListener('mouseup', soltarArrastre);
    window.addEventListener('blur', soltarArrastre);
    window.addEventListener('mouseleave', soltarArrastre);
    window.addEventListener('resize', soltarArrastre);
    document.addEventListener('visibilitychange', soltarArrastre);

    // Zoom hacia el cursor del ratón (hasta 25,000% para inspección microscópica de pistas)
    this.lienzo.addEventListener('wheel', (evento) => {
      evento.preventDefault();
      const factorZoom = evento.deltaY < 0 ? 1.20 : 0.83;
      this.aplicarZoomConPuntoFijo(factorZoom, evento.clientX, evento.clientY);
    }, { passive: false });
  }

  // Aplica zoom manteniendo inmóvil el punto bajo el cursor del ratón (Zoom to Cursor)
  aplicarZoomConPuntoFijo(factor, clientX = null, clientY = null) {
    const zoomAnterior = this.zoom;
    // Permite zoom desde 5% (piezas masivas) hasta 25,000% (inspección de pistas PCB de 0.1 mm)
    const nuevoZoom = Math.max(0.05, Math.min(250.0, this.zoom * factor));
    if (Math.abs(nuevoZoom - zoomAnterior) < 0.00001) return;

    const rect = this.lienzo.getBoundingClientRect();
    const mouseX = (clientX !== null ? clientX : rect.left + rect.width / 2) - rect.left;
    const mouseY = (clientY !== null ? clientY : rect.top + rect.height / 2) - rect.top;

    const centroPantallaX = this.anchoPantalla / 2;
    const centroPantallaY = this.altoPantalla / 2;

    const ratio = nuevoZoom / zoomAnterior;

    // Fórmula geométrica: desplaza el viewport para que la pista bajo el ratón no se mueva
    this.desplazamientoX = mouseX - centroPantallaX - (mouseX - centroPantallaX - this.desplazamientoX) * ratio;
    this.desplazamientoY = mouseY - centroPantallaY - (mouseY - centroPantallaY - this.desplazamientoY) * ratio;

    this.zoom = nuevoZoom;
    this.actualizarSuperposicionZoom();
    this.marcarEstaticoSucio();
    this.solicitarRenderizado();
  }

  // Inicializa el Cubo de Navegación 3D (ViewCube) y vincula eventos de arrastre y clics
  iniciarCuboNavegacion() {
    const stage = document.getElementById('viewcube-stage');
    const cube = document.getElementById('viewcube-cube');
    if (!stage || !cube) return;

    let arrastrandoCubo = false;
    let cuboUltimoX = 0;
    let cuboUltimoY = 0;

    stage.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.button !== 0) return;
      arrastrandoCubo = true;
      cuboUltimoX = e.clientX;
      cuboUltimoY = e.clientY;
      stage.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!arrastrandoCubo) return;
      if (!e.buttons) { soltarCubo(); return; }
      const dx = e.clientX - cuboUltimoX;
      const dy = e.clientY - cuboUltimoY;
      cuboUltimoX = e.clientX;
      cuboUltimoY = e.clientY;

      this.rotacionAzimut = (this.rotacionAzimut + dx * 0.7) % 360;
      this.rotacionInclinacion = Math.max(5, Math.min(88, this.rotacionInclinacion - dy * 0.7));

      if (this.modoVista !== '3D') {
        this.modoVista = '3D';
        const etiquetaModo = document.getElementById('lbl-view-mode');
        if (etiquetaModo) etiquetaModo.textContent = '3D';
        const btn3d = document.getElementById('btn-view-3d');
        const btnXy = document.getElementById('btn-view-xy');
        const btnXz = document.getElementById('btn-view-xz');
        const btnOrbit = document.getElementById('btn-view-orbit');
        if (btn3d) btn3d.classList.add('active');
        if (btnOrbit) btnOrbit.classList.add('active');
        if (btnXy) btnXy.classList.remove('active');
        if (btnXz) btnXz.classList.remove('active');
      }

      this.actualizarCuboOrientacion();
      this.actualizarSuperposicionZoom();
      this.marcarEstaticoSucio();
      this.solicitarRenderizado();
    });

    const soltarCubo = () => {
      arrastrandoCubo = false;
      stage.style.cursor = 'grab';
    };
    for (const evento of ['mouseup', 'blur', 'mouseleave', 'resize']) window.addEventListener(evento, soltarCubo);
    document.addEventListener('visibilitychange', soltarCubo);

    // Clic en las caras del cubo para orientar vistas estándar
    const caras = cube.querySelectorAll('.viewcube-face');
    caras.forEach(cara => {
      cara.addEventListener('click', (e) => {
        e.stopPropagation();
        const tipo = cara.dataset.face;
        if (tipo === 'top') {
          this.establecerModoVista('XY');
        } else if (tipo === 'front') {
          this.establecerModoVista('XZ');
        } else if (tipo === 'right') {
          this.establecerModoVista('YZ');
        } else if (tipo === 'back') {
          this.modoVista = '3D';
          this.rotacionInclinacion = 0;
          this.rotacionAzimut = 180;
          this.actualizarCuboOrientacion();
          this.marcarEstaticoSucio();
          this.solicitarRenderizado();
        } else if (tipo === 'left') {
          this.modoVista = '3D';
          this.rotacionInclinacion = 0;
          this.rotacionAzimut = -90;
          this.actualizarCuboOrientacion();
          this.marcarEstaticoSucio();
          this.solicitarRenderizado();
        } else if (tipo === 'bottom') {
          this.modoVista = '3D';
          this.rotacionInclinacion = 5;
          this.rotacionAzimut = 0;
          this.actualizarCuboOrientacion();
          this.marcarEstaticoSucio();
          this.solicitarRenderizado();
        }
      });
    });

    // Botones rápidos del ViewCube
    const btnIso = document.getElementById('vc-btn-iso');
    if (btnIso) {
      btnIso.addEventListener('click', (e) => {
        e.stopPropagation();
        this.establecerModoVista('3D');
      });
    }
    const btnXy = document.getElementById('vc-btn-xy');
    if (btnXy) {
      btnXy.addEventListener('click', (e) => {
        e.stopPropagation();
        this.establecerModoVista('XY');
      });
    }
    const btnXz = document.getElementById('vc-btn-xz');
    if (btnXz) {
      btnXz.addEventListener('click', (e) => {
        e.stopPropagation();
        this.establecerModoVista('XZ');
      });
    }
    const btnZscale = document.getElementById('vc-btn-zscale');
    if (btnZscale) {
      btnZscale.addEventListener('click', (e) => {
        e.stopPropagation();
        this.ciclarEscalaZ();
      });
    }

    this.actualizarCuboOrientacion();
  }

  // Alterna el factor multiplicador del eje Z para examinar capas finas o profundidad de corte
  ciclarEscalaZ() {
    if (this.escalaZ === 1.0) this.escalaZ = 1.5;
    else if (this.escalaZ === 1.5) this.escalaZ = 2.5;
    else if (this.escalaZ === 2.5) this.escalaZ = 4.0;
    else this.escalaZ = 1.0;

    const lbl = document.getElementById('vc-lbl-zscale');
    if (lbl) lbl.textContent = `${this.escalaZ.toFixed(1)}x`;
    const lblBottom = document.getElementById('lbl-view-zscale');
    if (lblBottom) lblBottom.textContent = `${this.escalaZ.toFixed(1)}x`;

    this.marcarEstaticoSucio();
    this.solicitarRenderizado();
  }

  // Sincroniza la rotación CSS 3D del cubo con la orientación actual de la cámara sin deformación
  actualizarCuboOrientacion() {
    const cube = document.getElementById('viewcube-cube');
    if (!cube) return;

    if (this.modoVista === 'XY') {
      cube.style.transform = 'rotateX(-90deg) rotateY(0deg)';
    } else if (this.modoVista === 'XZ') {
      cube.style.transform = 'rotateX(0deg) rotateY(0deg)';
    } else if (this.modoVista === 'YZ') {
      cube.style.transform = 'rotateX(0deg) rotateY(-90deg)';
    } else {
      // En modo 3D: rotación alrededor de X para inclinar y alrededor de Y para azimut (sin rotateZ)
      const inclCSS = -this.rotacionInclinacion;
      const azimCSS = -this.rotacionAzimut;
      cube.style.transform = `rotateX(${inclCSS}deg) rotateY(${azimCSS}deg)`;
    }

    const btnIso = document.getElementById('vc-btn-iso');
    const btnXy = document.getElementById('vc-btn-xy');
    const btnXz = document.getElementById('vc-btn-xz');
    if (btnIso) btnIso.classList.toggle('active', this.modoVista === '3D');
    if (btnXy) btnXy.classList.toggle('active', this.modoVista === 'XY');
    if (btnXz) btnXz.classList.toggle('active', this.modoVista === 'XZ');
  }

  establecerZoom(delta) {
    this.aplicarZoomConPuntoFijo(delta > 0 ? 1.35 : 0.74);
  }

  ajustarZoom(factor) {
    this.aplicarZoomConPuntoFijo(factor > 1 ? 1.35 : 0.74);
  }

  reiniciarVista() {
    if (this.limitesMaterial && this.limitesMaterial.maxX > this.limitesMaterial.minX) {
      this.ajustarVistaAPieza();
    } else {
      this.zoom = 1.0;
      this.desplazamientoX = -35;
      this.desplazamientoY = 15;
      this.rotacionInclinacion = 35;
      this.rotacionAzimut = -35;
      this.actualizarSuperposicionZoom();
      this.actualizarCuboOrientacion();
      this.marcarEstaticoSucio();
      this.solicitarRenderizado();
    }
  }

  // Encuadra y centra automáticamente la pieza en pantalla
  ajustarVistaAPieza() {
    if (!this.limitesMaterial || !this.anchoPantalla) return;
    const anchoPieza = Math.max(10, this.limitesMaterial.maxX - this.limitesMaterial.minX);
    const altoPieza = Math.max(10, this.limitesMaterial.maxY - this.limitesMaterial.minY);
    const centroX = (this.limitesMaterial.minX + this.limitesMaterial.maxX) / 2;
    const centroY = (this.limitesMaterial.minY + this.limitesMaterial.maxY) / 2;

    this.centroPieza = {
      x: centroX,
      y: centroY,
      z: 0
    };

    const escalaDeseadaX = (this.anchoPantalla * 0.65) / anchoPieza;
    const escalaDeseadaY = (this.altoPantalla * 0.65) / altoPieza;
    const escalaOptima = Math.min(escalaDeseadaX, escalaDeseadaY);

    this.zoom = Math.max(0.1, Math.min(250.0, escalaOptima / 1.65));
    this.desplazamientoX = -35;
    this.desplazamientoY = 15;

    this.actualizarSuperposicionZoom();
    this.actualizarCuboOrientacion();
    this.marcarEstaticoSucio();
    this.solicitarRenderizado();
  }

  establecerModoVista(modo) {
    this.modoVista = modo;
    if (modo === 'XY') {
      this.rotacionInclinacion = 90;
      this.rotacionAzimut = 0;
    } else if (modo === 'XZ') {
      this.rotacionInclinacion = 0;
      this.rotacionAzimut = 0;
    } else if (modo === 'YZ') {
      this.rotacionInclinacion = 0;
      this.rotacionAzimut = 90;
    } else if (modo === '3D') {
      this.rotacionInclinacion = 35;
      this.rotacionAzimut = -35;
    }

    const etiquetaModo = document.getElementById('lbl-view-mode');
    if (etiquetaModo) etiquetaModo.textContent = modo;

    const btnXy = document.getElementById('btn-view-xy');
    const btnXz = document.getElementById('btn-view-xz');
    const btn3d = document.getElementById('btn-view-3d');
    const btnOrbit = document.getElementById('btn-view-orbit');
    if (btnXy) btnXy.classList.toggle('active', modo === 'XY');
    if (btnXz) btnXz.classList.toggle('active', modo === 'XZ');
    if (btn3d) btn3d.classList.toggle('active', modo === '3D');
    if (btnOrbit) btnOrbit.classList.toggle('active', modo === '3D');

    this.actualizarCuboOrientacion();
    this.actualizarSuperposicionZoom();
    this.marcarEstaticoSucio();
    this.solicitarRenderizado();
  }

  actualizarSuperposicionZoom() {
    const etiquetaZoom = document.getElementById('lbl-view-zoom');
    if (etiquetaZoom) {
      const porcentaje = Math.round(this.zoom * 100);
      etiquetaZoom.textContent = `${porcentaje}%`;
    }
    const etiquetaZ = document.getElementById('lbl-view-zscale');
    if (etiquetaZ) etiquetaZ.textContent = `${this.escalaZ.toFixed(1)}x`;
  }

  // Actualiza la posición de la herramienta en pantalla (X, Y, Z) con objetivo desacoplado para 60 FPS
  establecerPosicionHerramienta(x, y, z) {
    const numX = Number(x);
    const numY = Number(y);
    const numZ = Number(z);
    if (isNaN(numX) || isNaN(numY) || isNaN(numZ)) {
      return;
    }

    this.posicionObjetivo.x = numX;
    this.posicionObjetivo.y = numY;
    this.posicionObjetivo.z = numZ;

    if (this.lineaActualEjecucion >= 0) {
      this.actualizarProgresoTrayectoriaDesdePosicion();
    }

    // Si la herramienta no está animada (máquina detenida o movimiento manual paso a paso),
    // aplicamos la posición de inmediato y solicitamos renderizado dinámico
    if (!this.herramientaGirando) {
      const dx = Math.abs(this.posicionHerramienta.x - numX);
      const dy = Math.abs(this.posicionHerramienta.y - numY);
      const dz = Math.abs(this.posicionHerramienta.z - numZ);

      if (dx < 0.0005 && dy < 0.0005 && dz < 0.0005) {
        return;
      }

      this.posicionHerramienta.x = numX;
      this.posicionHerramienta.y = numY;
      this.posicionHerramienta.z = numZ;
      this.actualizarIndicadoresPosicionTexto(numX, numY, numZ);
      this.solicitarRenderizado();
    }
  }

  // Actualiza las etiquetas DRO del visor con diffing de texto evitando reflows
  actualizarIndicadoresPosicionTexto(x, y, z) {
    if (!this.elemToolX) this.elemToolX = document.getElementById('v-tool-x');
    if (!this.elemToolY) this.elemToolY = document.getElementById('v-tool-y');
    if (!this.elemToolZ) this.elemToolZ = document.getElementById('v-tool-z');
    const sx = x.toFixed(1);
    const sy = y.toFixed(1);
    const sz = z.toFixed(1);
    if (this.elemToolX && this.elemToolX.textContent !== sx) this.elemToolX.textContent = sx;
    if (this.elemToolY && this.elemToolY.textContent !== sy) this.elemToolY.textContent = sy;
    if (this.elemToolZ && this.elemToolZ.textContent !== sz) this.elemToolZ.textContent = sz;
  }

  // Precalcula la matriz y razones trigonométricas 3D una sola vez por cuadro para máxima fluidez a 60 FPS
  actualizarMatrizProyeccion() {
    const radAzimut = (this.rotacionAzimut * Math.PI) / 180;
    const radInclinacion = (this.rotacionInclinacion * Math.PI) / 180;
    const escala = 1.65 * this.zoom;
    const cx = (this.centroPieza && !isNaN(this.centroPieza.x)) ? this.centroPieza.x : 150;
    const cy = (this.centroPieza && !isNaN(this.centroPieza.y)) ? this.centroPieza.y : 150;
    const cz = (this.centroPieza && !isNaN(this.centroPieza.z)) ? this.centroPieza.z : 0;

    const centroPantallaX = (this.anchoPantalla / 2) + this.desplazamientoX;
    const centroPantallaY = (this.altoPantalla / 2) + this.desplazamientoY;

    this.cache3D = {
      escala,
      cx, cy, cz,
      centroPantallaX, centroPantallaY,
      cosA: Math.cos(radAzimut),
      sinA: Math.sin(radAzimut),
      cosI: Math.cos(radInclinacion),
      sinI: Math.sin(radInclinacion),
      escalaZ: this.escalaZ
    };
  }

  // Conversión y proyección espacial 2D y 3D (+Z siempre apunta hacia ARRIBA) ultra-optimizada
  convertirAPantalla(x, y, z = 0) {
    const px = Number(x) || 0;
    const py = Number(y) || 0;
    const pz = Number(z) || 0;

    if (!this.cache3D) {
      this.actualizarMatrizProyeccion();
    }
    const c = this.cache3D;

    if (this.modoVista === 'XY') {
      // Plano 2D superior exacto (XY)
      return {
        x: c.centroPantallaX + (px - c.cx) * c.escala,
        y: c.centroPantallaY - (py - c.cy) * c.escala,
        zProf: pz
      };
    } else if (this.modoVista === 'XZ') {
      // Plano 2D frontal (Eje Z vs Eje X, +Z hacia arriba)
      return {
        x: c.centroPantallaX + (px - c.cx) * c.escala,
        y: c.centroPantallaY - ((pz - c.cz) * c.escalaZ * 2.2) * c.escala,
        zProf: py
      };
    } else if (this.modoVista === 'YZ') {
      // Plano 2D lateral (Eje Z vs Eje Y, +Z hacia arriba)
      return {
        x: c.centroPantallaX + (py - c.cy) * c.escala,
        y: c.centroPantallaY - ((pz - c.cz) * c.escalaZ * 2.2) * c.escala,
        zProf: px
      };
    } else {
      // Modo 3D espacial hiper-optimizado (sin Math.sin/cos repetitivos)
      const dx = px - c.cx;
      const dy = py - c.cy;
      const dz = (pz - c.cz) * c.escalaZ;

      const xr = dx * c.cosA - dy * c.sinA;
      const yr = dx * c.sinA + dy * c.cosA;
      const zr = dz;

      const xPantalla = xr;
      const yPantalla = yr * c.sinI + zr * c.cosI;
      const zProfundidad = yr * c.cosI - zr * c.sinI;

      return {
        x: c.centroPantallaX + xPantalla * c.escala,
        y: c.centroPantallaY - yPantalla * c.escala,
        zProf: zProfundidad
      };
    }
  }

  // Calcula paso de rejilla inteligente adaptado a la magnificación del zoom (desde 50 mm hasta 0.01 mm)
  obtenerPasoCuadriculaAdaptativo() {
    const escala = 1.65 * this.zoom;
    // Buscamos que las divisiones principales midan entre 45 y 100 píxeles en pantalla
    const pasoDeseadoMm = 70 / escala;

    const exponente = Math.floor(Math.log10(pasoDeseadoMm));
    const fraccion = pasoDeseadoMm / Math.pow(10, exponente);

    let factor = 1;
    if (fraccion >= 5) factor = 5;
    else if (fraccion >= 2) factor = 2;
    else factor = 1;

    const pasoPrincipal = factor * Math.pow(10, exponente);
    const pasoSecundario = pasoPrincipal / 5;

    return {
      principal: Math.max(0.005, pasoPrincipal),
      secundario: Math.max(0.001, pasoSecundario)
    };
  }

  // Trayectoria demostrativa inicial
  cargarTrayectoriaEjemplo() {
    const gcodeInicial = [
      "G21 ; Unidades metricas en milimetros",
      "G90 ; Posicionamiento absoluto",
      "G94 ; Avance en mm/min",
      "G0 Z5.0",
      "M3 S12000 ; Spindle ON",
      "G0 X110.0 Y140.0",
      "G1 Z-1.0 F300",
      "G1 X210.0 F800",
      "G1 Y220.0",
      "G1 X110.0",
      "G1 Y140.0",
      "G0 Z5.0",
      "M5 ; Spindle OFF",
      "G0 X0 Y0",
      "M30"
    ];
    this.cargarTrayectoriaDesdeGCode(gcodeInicial);
  }

  // Analiza y genera la geometría 2D/3D directamente desde G-Code
  cargarTrayectoriaDesdeGCode(contenidoGcode) {
    let lineas = [];
    if (Array.isArray(contenidoGcode)) {
      lineas = contenidoGcode.map(l => typeof l === 'string' ? l : (l.texto || ''));
    } else if (typeof contenidoGcode === 'string') {
      lineas = contenidoGcode.split(/\r?\n/);
    }

    let posX = 0.0, posY = 0.0, posZ = 0.0;
    let modoAbsoluto = true;
    let unidad = 1;
    let feed = 800, tiempo = 0;
    this.errorGcode = null;
    let modoMovimiento = 'G0';
    const nuevaTrayectoria = [];
    let terminado = false;
    const rechazar = mensaje => {
      this.errorGcode = mensaje;
      this.trayectoria = [];
      this.marcarEstaticoSucio();
      this.solicitarRenderizado();
    };

    let minCorteX = Infinity, maxCorteX = -Infinity;
    let minCorteY = Infinity, maxCorteY = -Infinity;
    let minCorteZ = Infinity, maxCorteZ = -Infinity;

    for (let idxLinea = 0; idxLinea < lineas.length; idxLinea++) {
      const rawLinea = lineas[idxLinea];
      let linea = rawLinea.replace(/\(.*?\)/g, '').split(';')[0].trim().toUpperCase();
      if (!linea) continue;

      const tokenRE = /([A-Z])\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))/g;
      const tokens = [...linea.matchAll(tokenRE)].map(m => [m[1], Number(m[2])]);
      const gs = tokens.filter(([k]) => k === 'G').map(([,v]) => v);
      const soportados = [0,1,2,3,4,17,20,21,40,49,54,80,90,91,91.1,94];
      const ms = tokens.filter(([k]) => k === 'M').map(([,v]) => v);
      const repetidos = [...'XYZIJRFSNT'].some(k => tokens.filter(([letra]) => letra === k).length > 1);
      const incompatible = [[0,1,2,3,80], [20,21], [90,91], [0,1,2,3,4]].some(grupo => gs.filter(g => grupo.includes(g)).length > 1);
      if ((terminado && linea !== '%') || (linea !== '%' && linea.replace(tokenRE, '').trim()) || repetidos || incompatible ||
          gs.some(g => !soportados.includes(g)) || ms.some(m => ![0,1,2,3,4,5,6,7,8,9,30].includes(m)) ||
          tokens.some(([k,v]) => !'GMXYZIJRFSPNT'.includes(k) || !Number.isFinite(v) || (['F'].includes(k) && v <= 0) ||
            (['S','T','N'].includes(k) && v < 0))) {
        rechazar(`Línea ${idxLinea+1}: código inválido o no soportado (plano XY/G54).`);
        return;
      }
      terminado = ms.some(m => [2,30].includes(m));
      linea = tokens.map(([k,v]) => `${k}${v}`).join(' ');
      if (gs.includes(90)) modoAbsoluto = true;
      if (gs.includes(91)) modoAbsoluto = false;
      if (gs.includes(20)) unidad = 25.4;
      if (gs.includes(21)) unidad = 1;
      const palabraF = tokens.find(([k]) => k === 'F');
      if (palabraF) feed = palabraF[1] * unidad;
      for (const g of gs) if ([0,1,2,3,80].includes(g)) modoMovimiento = `G${g}`;
      if (gs.includes(4)) {
        if (!tokens.some(([k,v]) => k === 'P' && v >= 0) || tokens.some(([k]) => 'XYZ'.includes(k))) {
          rechazar(`Línea ${idxLinea+1}: G4 requiere P no negativo.`); return;
        }
        tiempo += tokens.find(([k]) => k === 'P')[1];
        continue;
      }
      if (tokens.some(([k]) => 'IJR'.includes(k)) && !['G2','G3'].includes(modoMovimiento) ||
          tokens.some(([k]) => k === 'P') || (modoMovimiento === 'G80' && tokens.some(([k]) => 'XYZ'.includes(k)))) {
        rechazar(`Línea ${idxLinea+1}: parámetros incompatibles con el modo de movimiento.`); return;
      }

      const matchX = linea.match(/X([-+]?\d*\.?\d+)/);
      const matchY = linea.match(/Y([-+]?\d*\.?\d+)/);
      const matchZ = linea.match(/Z([-+]?\d*\.?\d+)/);

      let objetivoX = posX;
      let objetivoY = posY;
      let objetivoZ = posZ;
      let huboCoordenada = false;

      if (matchX) {
        const val = parseFloat(matchX[1]) * unidad;
        objetivoX = modoAbsoluto ? val : posX + val;
        huboCoordenada = true;
      }
      if (matchY) {
        const val = parseFloat(matchY[1]) * unidad;
        objetivoY = modoAbsoluto ? val : posY + val;
        huboCoordenada = true;
      }
      if (matchZ) {
        const val = parseFloat(matchZ[1]) * unidad;
        objetivoZ = modoAbsoluto ? val : posZ + val;
        huboCoordenada = true;
      }

      const arcoCompleto = ['G2', 'G3'].includes(modoMovimiento) && tokens.some(([k]) => ['I','J'].includes(k));
      if (!huboCoordenada && !arcoCompleto) continue;

      const dx = objetivoX - posX;
      const dy = objetivoY - posY;
      const dz = objetivoZ - posZ;
      if (!arcoCompleto && Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001 && Math.abs(dz) < 0.0001) {
        continue;
      }

      if (modoMovimiento === 'G2' || modoMovimiento === 'G3') {
        const matchI = linea.match(/I([-+]?\d*\.?\d+)/);
        const matchJ = linea.match(/J([-+]?\d*\.?\d+)/);
        const matchR = linea.match(/R([-+]?\d*\.?\d+)/);

        let cx = posX, cy = posY, radio = 0;
        let arcoValido = false;

        if (matchI || matchJ) {
          const i = matchI ? parseFloat(matchI[1]) * unidad : 0;
          const j = matchJ ? parseFloat(matchJ[1]) * unidad : 0;
          cx = posX + i;
          cy = posY + j;
          radio = Math.hypot(i, j);
          arcoValido = radio > 0.000001 && !matchR && Math.abs(Math.hypot(objetivoX-cx, objetivoY-cy)-radio) <= Math.max(.005, .001*radio);
        } else if (matchR) {
          radio = parseFloat(matchR[1]) * unidad;
          const dXm = (objetivoX - posX) / 2;
          const dYm = (objetivoY - posY) / 2;
          const distMitad = Math.hypot(dXm, dYm);
          if (Math.abs(radio) >= distMitad && distMitad > 0.0001) {
            const h = Math.sqrt(Math.max(0, radio * radio - distMitad * distMitad));
            const signo = (modoMovimiento === 'G2' ? -1 : 1) * (radio < 0 ? -1 : 1);
            cx = posX + dXm - signo * (dYm / distMitad) * h;
            cy = posY + dYm + signo * (dXm / distMitad) * h;
            radio = Math.abs(radio);
            arcoValido = true;
          }
        }

        if (arcoValido) {
          let anguloInicio = Math.atan2(posY - cy, posX - cx);
          let anguloFin = Math.atan2(objetivoY - cy, objetivoX - cx);

          if (modoMovimiento === 'G2') {
            if (anguloFin >= anguloInicio) anguloFin -= 2 * Math.PI;
          } else {
            if (anguloFin <= anguloInicio) anguloFin += 2 * Math.PI;
          }

          const deltaAngulo = anguloFin - anguloInicio;
          tiempo += Math.hypot(radio * deltaAngulo, dz) / feed * 60;
          const pasos = Math.max(8, Math.min(64, Math.ceil(Math.abs(deltaAngulo) / (Math.PI / 16))));
          let pPrevX = posX, pPrevY = posY, pPrevZ = posZ;

          for (let p = 1; p <= pasos; p++) {
            const t = p / pasos;
            const ang = anguloInicio + deltaAngulo * t;
            const arcX = cx + radio * Math.cos(ang);
            const arcY = cy + radio * Math.sin(ang);
            const arcZ = posZ + dz * t;

            nuevaTrayectoria.push({
              tipo: 'G1',
              x1: pPrevX, y1: pPrevY, z1: pPrevZ,
              x2: arcX, y2: arcY, z2: arcZ,
              linea: idxLinea
            });

            minCorteX = Math.min(minCorteX, arcX);
            maxCorteX = Math.max(maxCorteX, arcX);
            minCorteY = Math.min(minCorteY, arcY);
            maxCorteY = Math.max(maxCorteY, arcY);
            minCorteZ = Math.min(minCorteZ, arcZ);
            maxCorteZ = Math.max(maxCorteZ, arcZ);

            pPrevX = arcX;
            pPrevY = arcY;
            pPrevZ = arcZ;
          }
        } else {
          rechazar(`Línea ${idxLinea+1}: arco inválido.`);
          return;
        }
      } else {
        const tipo = modoMovimiento === 'G0' ? 'G0' : 'G1';
        tiempo += Math.hypot(dx, dy, dz) / (tipo === 'G0' ? 2500 : feed) * 60;
        nuevaTrayectoria.push({
          tipo,
          x1: posX, y1: posY, z1: posZ,
          x2: objetivoX, y2: objetivoY, z2: objetivoZ,
          linea: idxLinea
        });

        if (tipo === 'G1') {
          minCorteX = Math.min(minCorteX, posX, objetivoX);
          maxCorteX = Math.max(maxCorteX, posX, objetivoX);
          minCorteY = Math.min(minCorteY, posY, objetivoY);
          maxCorteY = Math.max(maxCorteY, posY, objetivoY);
          minCorteZ = Math.min(minCorteZ, posZ, objetivoZ);
          maxCorteZ = Math.max(maxCorteZ, posZ, objetivoZ);
        }
      }

      posX = objetivoX;
      posY = objetivoY;
      posZ = objetivoZ;
    }

    this.tiempoEstimadoSegundos = tiempo;
    this.trayectoria = nuevaTrayectoria;
    this.totalLineasGcode = lineas.length;
    this.lineaActualEjecucion = -1;
    this.evaluarLimitesPieza();

    if (minCorteX !== Infinity && maxCorteX !== -Infinity) {
      this.limitesMaterial = {
        minX: Math.max(0, minCorteX - 15),
        maxX: maxCorteX + 15,
        minY: Math.max(0, minCorteY - 15),
        maxY: maxCorteY + 15
      };
      this.centroPieza = {
        x: (minCorteX + maxCorteX) / 2,
        y: (minCorteY + maxCorteY) / 2,
        z: 0
      };
    } else {
      this.limitesMaterial = { minX: 95, maxX: 225, minY: 125, maxY: 235 };
      this.centroPieza = { x: 160, y: 180, z: 0 };
    }

    this.limitesZ = {
      minZ: minCorteZ !== Infinity ? minCorteZ : -2.5,
      maxZ: maxCorteZ !== -Infinity ? maxCorteZ : 5.0
    };

    this.marcarEstaticoSucio();
    this.solicitarRenderizado();
  }

  // Establece directamente los segmentos vectoriales
  establecerSegmentosTrayectoria(segmentos, envolvente = null) {
    if (Array.isArray(segmentos)) {
      this.trayectoria = segmentos.map((seg, idx) => ({
        ...seg,
        linea: (seg.linea !== undefined) ? seg.linea : idx
      }));
      this.totalLineasGcode = Math.max(0, ...this.trayectoria.map(s => s.linea + 1));
      this.lineaActualEjecucion = -1;
      this.indiceSegmentoActivo = -1;
      this.progresoSegmentoActivo = 0.0;
      this.evaluarLimitesPieza();
      if (envolvente && envolvente.min && envolvente.max) {
        this.limitesMaterial = {
          minX: Math.max(0, envolvente.min.X - 15),
          maxX: envolvente.max.X + 15,
          minY: Math.max(0, envolvente.min.Y - 15),
          maxY: envolvente.max.Y + 15
        };
        this.centroPieza = {
          x: (envolvente.min.X + envolvente.max.X) / 2,
          y: (envolvente.min.Y + envolvente.max.Y) / 2,
          z: 0
        };
      }
      this.marcarEstaticoSucio();
      this.solicitarRenderizado();
    }
  }

  // Dibuja la escena de fondo estática (mesa, cuadrícula, material stock, trayectorias vectoriales y origen)
  // en un búfer offscreen acelerado para evitar recalcular miles de segmentos en cada fotograma
  renderizarEscenaEstatica() {
    if (!this.contextoEstatico || !this.anchoPantalla) return;
    const ctx = this.contextoEstatico;

    // Fondo aeroespacial oscuro
    ctx.fillStyle = '#0a0c0e';
    ctx.fillRect(0, 0, this.anchoPantalla, this.altoPantalla);

    this.dibujarCuadricula(ctx);
    if (this.mostrarLimitesMesa !== false) {
      this.dibujarMesaMaquina(ctx);
    }
    this.dibujarMaterial(ctx);
    this.dibujarTrayectorias(ctx);
    this.dibujarOrigenWCS(ctx);
  }

  // Dibujado principal ultra-optimizado a 60 FPS estables
  renderizar() {
    if (!this.contexto || !this.anchoPantalla) return;
    const ctx = this.contexto;

    // Medición y actualización en tiempo real de FPS reales
    const ahoraFps = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!this._ultimoCalculoFps) this._ultimoCalculoFps = ahoraFps;
    if (!this._contadorCuadros) this._contadorCuadros = 0;
    this._contadorCuadros++;
    if (ahoraFps - this._ultimoCalculoFps >= 500) {
      const fpsReal = Math.round((this._contadorCuadros * 1000) / (ahoraFps - this._ultimoCalculoFps));
      this._ultimoCalculoFps = ahoraFps;
      this._contadorCuadros = 0;
      if (!this._elemTeleFps) this._elemTeleFps = document.getElementById('tele-fps');
      if (this._elemTeleFps && this._elemTeleFps.textContent !== String(fpsReal)) {
        this._elemTeleFps.textContent = String(fpsReal);
      }
    }

    // 1. Si la escena estática cambió (cámara, zoom, nuevo archivo), se actualiza el búfer
    if (this.necesitaRedibujarEstatico) {
      this.actualizarMatrizProyeccion();
      this.actualizarCuboOrientacion();
      this.actualizarSuperposicionZoom();
      this.renderizarEscenaEstatica();
      this.necesitaRedibujarEstatico = false;
    }

    // 2. Transferencia ultra-rápida por hardware (bitblt instantáneo ~0.05ms)
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.lienzoEstatico, 0, 0);
    ctx.restore();

    // 3. Renderizado de capa dinámica en vivo (únicamente tramos transitados sobre el fondo estático)
    if (this.lineaActualEjecucion >= 0 && this.indiceSegmentoActivo >= 0) {
      this.dibujarProgresoEjecucion(ctx);
    }

    // 4. Renderizado de capas dinámicas (herramienta girando con punta fina y alertas)
    if (this.mostrarRetículaHerramienta !== false) {
      this.dibujarRetículaHerramienta(ctx);
    }
    this.dibujarAlertaLimitesOverlay(ctx);
  }

  // Cuadrícula milimétrica y micrométrica adaptativa según nivel de magnificación
  dibujarCuadricula(ctx) {
    ctx.save();
    const { principal, secundario } = this.obtenerPasoCuadriculaAdaptativo();
    const escala = 1.65 * this.zoom;
    const cx = this.centroPieza ? this.centroPieza.x : 150;
    const cy = this.centroPieza ? this.centroPieza.y : 150;
    const centroPantallaX = (this.anchoPantalla / 2) + this.desplazamientoX;
    const centroPantallaY = (this.altoPantalla / 2) + this.desplazamientoY;

    if (this.modoVista === 'XY') {
      if (!this.mostrarCuadricula) {
        ctx.restore();
        return;
      }
      // Límites visibles en coordenadas del mundo milimétrico
      const xMin = cx + (0 - centroPantallaX) / escala;
      const xMax = cx + (this.anchoPantalla - centroPantallaX) / escala;
      const yMin = cy - (this.altoPantalla - centroPantallaY) / escala;
      const yMax = cy - (0 - centroPantallaY) / escala;

      const inicioX = Math.floor(xMin / principal) * principal;
      const finX = Math.ceil(xMax / principal) * principal;
      const inicioY = Math.floor(yMin / principal) * principal;
      const finY = Math.ceil(yMax / principal) * principal;

      // 1. Líneas secundarias (tenues)
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#10141a';
      ctx.beginPath();
      const inicioSecX = Math.floor(xMin / secundario) * secundario;
      const finSecX = Math.ceil(xMax / secundario) * secundario;
      for (const x of valoresCuadricula(inicioSecX, finSecX, secundario)) {
        const px = centroPantallaX + (x - cx) * escala;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, this.altoPantalla);
      }
      const inicioSecY = Math.floor(yMin / secundario) * secundario;
      const finSecY = Math.ceil(yMax / secundario) * secundario;
      for (const y of valoresCuadricula(inicioSecY, finSecY, secundario)) {
        const py = centroPantallaY - (y - cy) * escala;
        ctx.moveTo(0, py);
        ctx.lineTo(this.anchoPantalla, py);
      }
      ctx.stroke();

      // 2. Líneas principales
      ctx.strokeStyle = '#1b232e';
      ctx.beginPath();
      for (const x of valoresCuadricula(inicioX, finX, principal)) {
        const px = centroPantallaX + (x - cx) * escala;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, this.altoPantalla);
      }
      for (const y of valoresCuadricula(inicioY, finY, principal)) {
        const py = centroPantallaY - (y - cy) * escala;
        ctx.moveTo(0, py);
        ctx.lineTo(this.anchoPantalla, py);
      }
      ctx.stroke();

      // 3. Etiquetas de medida en pantalla
      ctx.fillStyle = '#4c5867';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      const formatoCota = principal < 0.1 ? 3 : (principal < 1 ? 2 : (principal < 10 ? 1 : 0));
      for (const x of valoresCuadricula(inicioX, finX, principal)) {
        const px = centroPantallaX + (x - cx) * escala;
        if (px >= 20 && px <= this.anchoPantalla - 40) {
          ctx.fillText(`${x.toFixed(formatoCota)} mm`, px + 4, this.altoPantalla - 50);
        }
      }
      for (const y of valoresCuadricula(inicioY, finY, principal)) {
        const py = centroPantallaY - (y - cy) * escala;
        if (py >= 20 && py <= this.altoPantalla - 60) {
          ctx.fillText(`${y.toFixed(formatoCota)} mm`, 14, py - 4);
        }
      }
    } else if (this.modoVista === 'XZ') {
      if (!this.mostrarCuadricula) {
        ctx.restore();
        return;
      }
      const xMin = cx + (0 - centroPantallaX) / escala;
      const xMax = cx + (this.anchoPantalla - centroPantallaX) / escala;
      const inicioX = Math.floor(xMin / principal) * principal;
      const finX = Math.ceil(xMax / principal) * principal;

      ctx.strokeStyle = '#181e26';
      ctx.beginPath();
      for (const x of valoresCuadricula(inicioX, finX, principal)) {
        const px = centroPantallaX + (x - cx) * escala;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, this.altoPantalla);
      }
      ctx.stroke();

      // Línea de referencia Z = 0
      const z0py = centroPantallaY - ((0 - (this.centroPieza ? this.centroPieza.z : 0)) * this.escalaZ * 2.2) * escala;
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, z0py);
      ctx.lineTo(this.anchoPantalla, z0py);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      if (this.mostrarCuadricula) {
        // Rejilla 3D sobre la superficie física de la mesa de la máquina (Z = 0)
        const minX = 0;
        const maxX = this.limitesMaquina.maxX;
        const minY = 0;
        const maxY = this.limitesMaquina.maxY;

        ctx.strokeStyle = '#18222e';
        ctx.beginPath();
        const lineasMaximas = 60;
        const pasoReal = Math.max(principal, Math.max(maxX - minX, maxY - minY) / lineasMaximas);
        for (const x of valoresCuadricula(minX, maxX, pasoReal)) {
          const p1 = this.convertirAPantalla(x, minY, 0);
          const p2 = this.convertirAPantalla(x, maxY, 0);
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
        }
        for (const y of valoresCuadricula(minY, maxY, pasoReal)) {
          const p1 = this.convertirAPantalla(minX, y, 0);
          const p2 = this.convertirAPantalla(maxX, y, 0);
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
        }
        ctx.stroke();
      }

      // Tríada tridimensional de ejes en el origen WCS (0,0,0)
      const origen = this.convertirAPantalla(0, 0, 0);
      const longitudEje = Math.max(18, Math.min(50, 32 * Math.pow(this.zoom, 0.25)));
      const pX = this.convertirAPantalla(longitudEje / escala * 1.65, 0, 0);
      const pY = this.convertirAPantalla(0, longitudEje / escala * 1.65, 0);
      const pZ = this.convertirAPantalla(0, 0, (longitudEje * 0.8) / (escala * this.escalaZ));

      // Eje X (Rojo hacia la derecha)
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(origen.x, origen.y);
      ctx.lineTo(pX.x, pX.y);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText('+X', pX.x + 4, pX.y + 4);

      // Eje Y (Verde hacia el fondo)
      ctx.strokeStyle = '#34c759';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(origen.x, origen.y);
      ctx.lineTo(pY.x, pY.y);
      ctx.stroke();
      ctx.fillStyle = '#34c759';
      ctx.fillText('+Y', pY.x + 4, pY.y + 4);

      // Eje Z (Azul / Cian apuntando hacia ARRIBA)
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(origen.x, origen.y);
      ctx.lineTo(pZ.x, pZ.y);
      ctx.stroke();
      ctx.fillStyle = '#00e5ff';
      ctx.fillText('+Z', pZ.x + 4, pZ.y - 4);
    }

    ctx.restore();
  }

  // Representa el bloque de material (2D o prisma extruido 3D)
  dibujarMaterial(ctx) {
    const limites = this.limitesMaterial || { minX: 95, maxX: 225, minY: 125, maxY: 235 };
    const minZ = (this.limitesZ && this.limitesZ.minZ < 0) ? this.limitesZ.minZ : -2.5;

    if (this.modoVista === 'XY') {
      const p1 = this.convertirAPantalla(limites.minX, limites.minY);
      const p2 = this.convertirAPantalla(limites.maxX, limites.maxY);
      const ancho = p2.x - p1.x;
      const alto = p1.y - p2.y;

      if (ancho <= 0 || alto <= 0) return;

      ctx.save();
      ctx.fillStyle = 'rgba(16, 42, 28, 0.22)';
      ctx.strokeStyle = 'rgba(46, 204, 113, 0.28)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const vertices=[{x:p1.x,y:p2.y},{x:p2.x,y:p2.y},{x:p2.x,y:p1.y},p1];
      this.rellenarPoligonoVisible(ctx, vertices);
      this.trazarAristasVisibles(ctx, vertices);
      ctx.restore();
    } else if (this.modoVista === '3D') {
      // Bloque tridimensional de material a mecanizar
      ctx.save();
      const c1 = this.convertirAPantalla(limites.minX, limites.minY, 0);
      const c2 = this.convertirAPantalla(limites.maxX, limites.minY, 0);
      const c3 = this.convertirAPantalla(limites.maxX, limites.maxY, 0);
      const c4 = this.convertirAPantalla(limites.minX, limites.maxY, 0);

      // Cara superior (superficie del material Z = 0)
      ctx.fillStyle = 'rgba(16, 42, 28, 0.25)';
      ctx.strokeStyle = 'rgba(46, 204, 113, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      this.rellenarPoligonoVisible(ctx, [c1,c2,c3,c4]);
      this.trazarAristasVisibles(ctx, [c1,c2,c3,c4]);

      // Aristas de profundidad hacia abajo (corte negativo minZ)
      const b1 = this.convertirAPantalla(limites.minX, limites.minY, minZ);
      const b2 = this.convertirAPantalla(limites.maxX, limites.minY, minZ);
      const b3 = this.convertirAPantalla(limites.maxX, limites.maxY, minZ);
      const b4 = this.convertirAPantalla(limites.minX, limites.maxY, minZ);

      ctx.strokeStyle = 'rgba(46, 204, 113, 0.18)';
      for (const arista of [[c1,b1], [c2,b2], [c3,b3], [c4,b4]]) this.trazarAristasVisibles(ctx, arista, false);
      this.trazarAristasVisibles(ctx, [b1,b2,b3,b4]);

      ctx.restore();
    }
  }

  // Obtiene el color de trayectoria ya recorrida (completada) según la herramienta activa
  obtenerColorRecorrido() {
    if (this.tipoHerramienta === 'laser') {
      return '#c084fc'; // Púrpura / magenta láser brillante de corte óptico
    } else if (this.tipoHerramienta === 'lapiz') {
      return '#f59e0b'; // Dorado / ámbar trazo visible de lápiz
    } else {
      return '#22c55e'; // Verde esmeralda corte mecanizado de fresa CNC
    }
  }

  // Convierte un color hexadecimal a formato rgba con la opacidad especificada
  ajustarOpacidadColor(hex, opacidad) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex;
    let c = hex.slice(1);
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.slice(0, 2), 16) || 0;
    const g = parseInt(c.slice(2, 4), 16) || 229;
    const b = parseInt(c.slice(4, 6), 16) || 255;
    return `rgba(${r}, ${g}, ${b}, ${opacidad})`;
  }

  // Color de trayectoria pendiente (donde aún falta pasar la herramienta)
  obtenerColorPendiente() {
    const colorBase = this.colorCortePersonalizado || '#00e5ff';
    return (this.lineaActualEjecucion >= 0) ? this.ajustarOpacidadColor(colorBase, 0.45) : colorBase;
  }

  // Establece el progreso de ejecución a partir de la línea actual de G-code reportada (1-based)
  establecerProgresoEjecucion(lineaActual, totalLineas = null) {
    const numLinea = Number(lineaActual);
    const nuevaLinea = (!isNaN(numLinea) && numLinea >= 1) ? (numLinea - 1) : -1;
    if (this.lineaActualEjecucion !== nuevaLinea) {
      this.lineaActualEjecucion = nuevaLinea;
      if (totalLineas && numLinea >= Number(totalLineas)) {
        this.indiceSegmentoActivo = this.trayectoria.length;
        this.progresoSegmentoActivo = 1.0;
      } else {
        this.actualizarProgresoTrayectoriaDesdePosicion();
      }
      this.solicitarRenderizado();
    }
  }

  // Establece el índice de línea activa de G-code (0-based)
  establecerIndiceLineaActiva(indice) {
    const num = Number(indice);
    const nueva = (!isNaN(num) && num >= 0) ? num : -1;
    if (this.lineaActualEjecucion !== nueva) {
      this.lineaActualEjecucion = nueva;
      if (nueva === 0) {
        this.indiceSegmentoActivo = 0;
        this.progresoSegmentoActivo = 0.0;
      }
      this.actualizarProgresoTrayectoriaDesdePosicion();
      this.solicitarRenderizado();
    }
  }

  // Reinicia el progreso para volver a colorear toda la trayectoria como pendiente
  reiniciarProgresoEjecucion() {
    this.lineaActualEjecucion = -1;
    this.indiceSegmentoActivo = -1;
    this.progresoSegmentoActivo = 0.0;
    this.solicitarRenderizado();
  }

  // Determina con precisión física qué tramos de la trayectoria ya fueron efectivamente
  // transitados por la punta física de la herramienta, garantizando avance sincrónico sin bloqueos
  actualizarProgresoTrayectoriaDesdePosicion() {
    if (!this.trayectoria || this.trayectoria.length === 0) return;
    if (this.lineaActualEjecucion === undefined || this.lineaActualEjecucion < 0) return;

    const posH = this.posicionHerramienta;
    const n = this.trayectoria.length;

    if (this.indiceSegmentoActivo === undefined || this.indiceSegmentoActivo < 0) {
      this.indiceSegmentoActivo = 0;
      this.progresoSegmentoActivo = 0.0;
    }

    // El índice avanza únicamente según la posición física reportada de la punta. La línea confirmada
    // (ok de GRBL) va adelantada por el búfer del planificador, por lo que no se usa para iluminar el trayecto.
    let idx = this.indiceSegmentoActivo;
    if (idx >= n) {
      this.indiceSegmentoActivo = n;
      this.progresoSegmentoActivo = 1.0;
      return;
    }

    // 2. Ventana de búsqueda acotada para proyectar la punta física de la herramienta
    const lookahead = Math.min(n, idx + 60);
    let mejorIdx = idx;
    let mejorU = this.progresoSegmentoActivo || 0.0;
    let menorDistSq = Infinity;

    for (let i = idx; i < lookahead; i++) {
      const seg = this.trayectoria[i];

      const vx = seg.x2 - seg.x1;
      const vy = seg.y2 - seg.y1;
      const vz = seg.z2 - seg.z1;
      const lenSq = vx * vx + vy * vy + vz * vz;

      if (lenSq < 0.00001) {
        if (i === idx) idx++;
        continue;
      }

      const wx = posH.x - seg.x1;
      const wy = posH.y - seg.y1;
      const wz = posH.z - seg.z1;
      const u = (wx * vx + wy * vy + wz * vz) / lenSq;
      const uClamp = Math.max(0.0, Math.min(1.0, u));

      const px = seg.x1 + vx * uClamp;
      const py = seg.y1 + vy * uClamp;
      const pz = seg.z1 + vz * uClamp;

      const ddx = posH.x - px;
      const ddy = posH.y - py;
      const ddz = posH.z - pz;
      const distSq = ddx * ddx + ddy * ddy + ddz * ddz;

      if (distSq < menorDistSq) {
        menorDistSq = distSq;
        mejorIdx = i;
        mejorU = uClamp;
      }
      if (u >= 0.02 && u <= 0.98 && distSq < 1.0) {
        mejorIdx = i;
        mejorU = u;
        break;
      }
    }

    // Si el segmento actual ya se completó (la punta llegó al extremo final p2 y hay siguiente)
    if (mejorIdx === idx && mejorU >= 0.98 && idx + 1 < n) {
      const segActual = this.trayectoria[idx];
      const dfx = posH.x - segActual.x2;
      const dfy = posH.y - segActual.y2;
      const dfz = posH.z - segActual.z2;
      if ((dfx * dfx + dfy * dfy + dfz * dfz) < 1.5) {
        mejorIdx = idx + 1;
        mejorU = 0.0;
      }
    }

    // El índice activo solo puede progresar hacia adelante
    if (mejorIdx > this.indiceSegmentoActivo) {
      this.indiceSegmentoActivo = mejorIdx;
      this.progresoSegmentoActivo = mejorU;
    } else if (mejorIdx === this.indiceSegmentoActivo) {
      this.progresoSegmentoActivo = Math.max(this.progresoSegmentoActivo || 0.0, mejorU);
    }
  }

  rellenarPoligonoVisible(ctx, puntos) {
    // A gran aumento solo importan pistas y contornos: evitar repintar dos
    // superficies translúcidas de pantalla completa en cada movimiento.
    if (this.zoom > 12) return;
    if (puntos.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return;
    let poligono = puntos;
    for (const [eje, limite, signo] of [['x', -10, 1], ['x', this.anchoPantalla+10, -1],
                                       ['y', -10, 1], ['y', this.altoPantalla+10, -1]]) {
      const salida = [];
      for (let i=0; i<poligono.length; i++) {
        const a=poligono[i], b=poligono[(i+1)%poligono.length];
        const dentroA=(a[eje]-limite)*signo>=0, dentroB=(b[eje]-limite)*signo>=0;
        if (dentroA) salida.push(a);
        if (dentroA !== dentroB) {
          const t=(limite-a[eje])/(b[eje]-a[eje]);
          salida.push({x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t});
        }
      }
      poligono=salida;
      if (!poligono.length) return;
    }
    poligono = poligono.map(p => ({
      x: Math.max(-10, Math.min(this.anchoPantalla+10, p.x)),
      y: Math.max(-10, Math.min(this.altoPantalla+10, p.y))
    }));
    ctx.beginPath();
    ctx.moveTo(poligono[0].x,poligono[0].y);
    for (const p of poligono.slice(1)) ctx.lineTo(p.x,p.y);
    ctx.closePath();
    ctx.fill();
  }

  trazarAristasVisibles(ctx, puntos, cerrar = true) {
    ctx.beginPath();
    for (let i=0; i<puntos.length-(cerrar ? 0 : 1); i++) {
      const arista=this.recortarSegmentoPantalla(puntos[i], puntos[(i+1)%puntos.length]);
      if (!arista) continue;
      ctx.moveTo(arista[0].x,arista[0].y);
      ctx.lineTo(arista[1].x,arista[1].y);
    }
    ctx.stroke();
  }

  recortarSegmentoPantalla(p1, p2) {
    if (![p1.x, p1.y, p2.x, p2.y].every(Number.isFinite)) return null;
    const dx = p2.x-p1.x, dy = p2.y-p1.y;
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, p1.x+10], [dx, this.anchoPantalla+10-p1.x],
                           [-dy, p1.y+10], [dy, this.altoPantalla+10-p1.y]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const t = q/p;
      if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
    return [{x:p1.x+dx*t0, y:p1.y+dy*t0}, {x:p1.x+dx*t1, y:p1.y+dy*t1}];
  }

  // Trazado de trayectorias en alta velocidad a 60 FPS con detalle adaptativo a máximo zoom
  // Dibuja la trayectoria base completa (G0 rápido, corte G1/G2/G3 y límites) en el búfer estático
  dibujarTrayectoriasBase(ctx) {
    if (!this.trayectoria || this.trayectoria.length === 0) return;
    ctx.save();

    const n = this.trayectoria.length;
    if (!this._cacheVisiblesValida || !this._cacheVisibles || this._cacheVisibles.length !== n) {
      this._cacheVisibles = this.trayectoria.map(seg => this.recortarSegmentoPantalla(
        this.convertirAPantalla(seg.x1, seg.y1, seg.z1), this.convertirAPantalla(seg.x2, seg.y2, seg.z2)));
      this._cacheVisiblesValida = true;
    }
    const visibles = this._cacheVisibles;
    const maxX = this.limitesMaquina.maxX;
    const maxY = this.limitesMaquina.maxY;
    const es3D = (this.modoVista === '3D');
    const colorPendiente = this.colorCortePersonalizado || '#00e5ff';
    const baseLineWidth = Math.min(3.2, Math.max(1.4, 1.8 * Math.pow(this.zoom, 0.12)));

    // 1. Trazado rápido G0 base (líneas discontinuas grises)
    ctx.strokeStyle = this.colorRapidoPersonalizado || '#738090';
    ctx.lineWidth = Math.min(2.5, Math.max(1.0, 1.2 * Math.pow(this.zoom, 0.1)));
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    let hayG0 = false;
    let prevG0X = null, prevG0Y = null, prevG0Z = null;

    for (let i = 0; i < n; i++) {
      if (!visibles[i]) continue;
      const seg = this.trayectoria[i];
      if (seg.tipo === 'G0') {
        const [p1, p2] = visibles[i];
        if (prevG0X !== seg.x1 || prevG0Y !== seg.y1 || prevG0Z !== seg.z1) {
          ctx.moveTo(p1.x, p1.y);
        }
        ctx.lineTo(p2.x, p2.y);
        prevG0X = seg.x2; prevG0Y = seg.y2; prevG0Z = seg.z2;
        hayG0 = true;
      } else {
        prevG0X = null;
      }
    }
    if (hayG0) ctx.stroke();

    // 2. Líneas verticales indicadoras de descenso de fresa (plunges) en 3D
    if (es3D && n < 3000) {
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (!visibles[i]) continue;
        const seg = this.trayectoria[i];
        if (seg.tipo !== 'G0' && Math.abs(seg.z2 - seg.z1) > 0.05 && seg.z2 < 0) {
          const pTop = this.convertirAPantalla(seg.x2, seg.y2, 0);
          const [, pBot] = visibles[i];
          ctx.moveTo(pTop.x, pTop.y);
          ctx.lineTo(pBot.x, pBot.y);
        }
      }
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // 3. Trayectorias de corte G1/G2/G3 base (Cian / pendiente)
    ctx.lineWidth = baseLineWidth;
    ctx.strokeStyle = colorPendiente;
    ctx.beginPath();
    let hayG1 = false;
    let prevG1X = null, prevG1Y = null, prevG1Z = null;

    for (let i = 0; i < n; i++) {
      if (!visibles[i]) continue;
      const seg = this.trayectoria[i];
      if (seg.tipo !== 'G0') {
        const esOOB = (seg.x1 < 0 || seg.x1 > maxX || seg.x2 < 0 || seg.x2 > maxX ||
                       seg.y1 < 0 || seg.y1 > maxY || seg.y2 < 0 || seg.y2 > maxY);
        if (esOOB) {
          prevG1X = null;
          continue;
        }

        const [p1, p2] = visibles[i];
        const esCont = (prevG1X === seg.x1 && prevG1Y === seg.y1 && prevG1Z === seg.z1);
        if (!esCont) {
          ctx.moveTo(p1.x, p1.y);
        }
        ctx.lineTo(p2.x, p2.y);
        prevG1X = seg.x2; prevG1Y = seg.y2; prevG1Z = seg.z2;
        hayG1 = true;
      } else {
        prevG1X = null;
      }
    }
    if (hayG1) ctx.stroke();

    // 4. Segmentos FUERA de los límites (Rojo de alerta)
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = baseLineWidth;
    ctx.beginPath();
    let hayG1OOB = false;
    let prevOOBX = null, prevOOBY = null, prevOOBZ = null;

    for (let i = 0; i < n; i++) {
      if (!visibles[i]) continue;
      const seg = this.trayectoria[i];
      if (seg.tipo !== 'G0') {
        const esOOB = (seg.x1 < 0 || seg.x1 > maxX || seg.x2 < 0 || seg.x2 > maxX ||
                       seg.y1 < 0 || seg.y1 > maxY || seg.y2 < 0 || seg.y2 > maxY);
        if (esOOB) {
          const [p1, p2] = visibles[i];
          const esContinuo = (prevOOBX === seg.x1 && prevOOBY === seg.y1 && prevOOBZ === seg.z1);
          if (!esContinuo) {
            ctx.moveTo(p1.x, p1.y);
          }
          ctx.lineTo(p2.x, p2.y);
          prevOOBX = seg.x2; prevOOBY = seg.y2; prevOOBZ = seg.z2;
          hayG1OOB = true;
        } else {
          prevOOBX = null;
        }
      } else {
        prevOOBX = null;
      }
    }
    if (hayG1OOB) ctx.stroke();

    // 5. Nodos/vértices G-code con zoom extremo (> 1200%)
    if (this.zoom > 12.0 && n < 25000) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const radioNodo = Math.min(3.0, Math.max(1.2, Math.sqrt(this.zoom / 14)));
      for (let i = 0; i < n; i++) {
        if (!visibles[i]) continue;
        const seg = this.trayectoria[i];
        if (seg.tipo !== 'G0') {
          const p = this.convertirAPantalla(seg.x2, seg.y2, seg.z2);
          if (p.x >= -10 && p.x <= this.anchoPantalla + 10 && p.y >= -10 && p.y <= this.altoPantalla + 10) {
            ctx.moveTo(p.x + radioNodo, p.y);
            ctx.arc(p.x, p.y, radioNodo, 0, Math.PI * 2);
          }
        }
      }
      ctx.fill();
    }

    ctx.restore();
  }

  // Alias compatible
  dibujarTrayectorias(ctx) {
    this.dibujarTrayectoriasBase(ctx);
  }

  // Capa dinámica de progreso en vivo. Los segmentos ya transitados se acumulan de forma
  // incremental en un búfer offscreen (solo se dibujan los segmentos nuevos), por lo que el costo
  // por fotograma ya no crece con el tamaño del programa (antes era O(n) en cada frame).
  dibujarProgresoEjecucion(ctx) {
    if (!this.trayectoria || this.trayectoria.length === 0) return;
    const visibles = this._cacheVisibles;
    if (!visibles) return;
    const n = this.trayectoria.length;
    const idxActivo = Math.min(n, Math.max(0, this.indiceSegmentoActivo !== undefined ? this.indiceSegmentoActivo : -1));
    if (idxActivo < 0) return;
    const progActivo = Math.max(0.0, Math.min(1.0, this.progresoSegmentoActivo || 0.0));
    const maxX = this.limitesMaquina.maxX;
    const maxY = this.limitesMaquina.maxY;
    const colorRecorrido = this.obtenerColorRecorrido();
    const baseLineWidth = Math.min(3.2, Math.max(1.4, 1.8 * Math.pow(this.zoom, 0.12)));

    // Búfer acumulado de segmentos completados
    if (!this._progCanvas) {
      this._progCanvas = document.createElement('canvas');
      this._progCtx = this._progCanvas.getContext('2d');
      this._progInvalido = true;
    }
    const pc = this._progCanvas;
    const pctx = this._progCtx;
    if (pc.width !== this.lienzoEstatico.width || pc.height !== this.lienzoEstatico.height) {
      pc.width = this.lienzoEstatico.width;
      pc.height = this.lienzoEstatico.height;
      this._progInvalido = true;
    }
    if (this._progInvalido || idxActivo < this._progIdx || this._progColor !== colorRecorrido) {
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.clearRect(0, 0, pc.width, pc.height);
      this._progIdx = 0;
      this._progInvalido = false;
      this._progColor = colorRecorrido;
    }
    if (idxActivo > this._progIdx) {
      pctx.setTransform(pc.width / this.anchoPantalla, 0, 0, pc.height / this.altoPantalla, 0, 0);
      const desde = this._progIdx;

      // 1. G0 recorridos (desvanecidos)
      pctx.strokeStyle = 'rgba(115, 128, 144, 0.35)';
      pctx.lineWidth = Math.min(2.0, Math.max(0.8, 1.0 * Math.pow(this.zoom, 0.1)));
      pctx.setLineDash([3, 4]);
      pctx.beginPath();
      let hayG0 = false;
      let pgx = null, pgy = null, pgz = null;
      for (let i = desde; i < idxActivo; i++) {
        if (!visibles[i]) continue;
        const seg = this.trayectoria[i];
        if (seg.tipo === 'G0') {
          const [p1, p2] = visibles[i];
          if (pgx !== seg.x1 || pgy !== seg.y1 || pgz !== seg.z1) pctx.moveTo(p1.x, p1.y);
          pctx.lineTo(p2.x, p2.y);
          pgx = seg.x2; pgy = seg.y2; pgz = seg.z2;
          hayG0 = true;
        } else {
          pgx = null;
        }
      }
      if (hayG0) pctx.stroke();

      // 2. G1/G2/G3 recorridos (color vivo según herramienta activa)
      pctx.setLineDash([]);
      pctx.lineWidth = baseLineWidth * 1.25;
      pctx.strokeStyle = colorRecorrido;
      pctx.beginPath();
      let hayG1 = false;
      let pdx = null, pdy = null, pdz = null;
      for (let i = desde; i < idxActivo; i++) {
        if (!visibles[i]) continue;
        const seg = this.trayectoria[i];
        if (seg.tipo === 'G0') { pdx = null; continue; }
        const esOOB = (seg.x1 < 0 || seg.x1 > maxX || seg.x2 < 0 || seg.x2 > maxX ||
                       seg.y1 < 0 || seg.y1 > maxY || seg.y2 < 0 || seg.y2 > maxY);
        if (esOOB) { pdx = null; continue; }
        const [p1, p2] = visibles[i];
        if (!(pdx === seg.x1 && pdy === seg.y1 && pdz === seg.z1)) pctx.moveTo(p1.x, p1.y);
        pctx.lineTo(p2.x, p2.y);
        pdx = seg.x2; pdy = seg.y2; pdz = seg.z2;
        hayG1 = true;
      }
      if (hayG1) pctx.stroke();
      this._progIdx = idxActivo;
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(pc, 0, 0);
    ctx.restore();

    // 3. Fracción del segmento activo (único cálculo por fotograma)
    if (idxActivo < n && progActivo > 0.001 && visibles[idxActivo]) {
      const seg = this.trayectoria[idxActivo];
      if (seg.tipo !== 'G0') {
        const esOOB = (seg.x1 < 0 || seg.x1 > maxX || seg.x2 < 0 || seg.x2 > maxX ||
                       seg.y1 < 0 || seg.y1 > maxY || seg.y2 < 0 || seg.y2 > maxY);
        if (!esOOB) {
          const [p1] = visibles[idxActivo];
          const pMid = this.convertirAPantalla(
            seg.x1 + (seg.x2 - seg.x1) * progActivo,
            seg.y1 + (seg.y2 - seg.y1) * progActivo,
            seg.z1 + (seg.z2 - seg.z1) * progActivo);
          ctx.save();
          ctx.setLineDash([]);
          ctx.lineWidth = baseLineWidth * 1.25;
          ctx.strokeStyle = colorRecorrido;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(pMid.x, pMid.y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  // Punto de origen de coordenadas de trabajo (0,0,0)
  dibujarOrigenWCS(ctx) {
    const origen = this.convertirAPantalla(0, 0, 0);
    ctx.save();
    ctx.fillStyle = '#00e5ff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(origen.x, origen.y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(origen.x, origen.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Control de giro y rotación de la herramienta (animación durante simulación o corte real)
  establecerGiroHerramienta(girando, velocidad = 22) {
    this.velocidadGiroHerramienta = velocidad;
    const nuevoEstado = Boolean(girando);
    if (this.herramientaGirando === nuevoEstado) return;
    this.herramientaGirando = nuevoEstado;

    if (this.herramientaGirando) {
      this.iniciarAnimacionGiro();
    } else {
      if (this.animacionGiroId) {
        cancelAnimationFrame(this.animacionGiroId);
        this.animacionGiroId = null;
      }
      this.solicitarRenderizado();
    }
  }

  iniciarAnimacionGiro() {
    if (this.animacionGiroId) return;
    let tiempoPrevio = performance.now();

    const pasoAnimacion = (tiempoActual) => {
      if (!this.herramientaGirando) {
        this.animacionGiroId = null;
        this.renderizar();
        return;
      }

      // Si la ventana o pestaña está en segundo plano, evitar consumo innecesario
      if (document.hidden) {
        this.animacionGiroId = requestAnimationFrame(pasoAnimacion);
        return;
      }

      if (document.querySelector('.modal-backdrop:not(.hidden)')) {
        this.animacionGiroId = requestAnimationFrame(pasoAnimacion);
        return;
      }

      const dt = Math.min(100, Math.max(1, tiempoActual - tiempoPrevio));
      tiempoPrevio = tiempoActual;

      const factorFrame = dt / 16.67;
      this.anguloGiroHerramienta = (this.anguloGiroHerramienta + this.velocidadGiroHerramienta * factorFrame) % 360;

      // Interpolación ultra-suave (LERP) de la posición física de la fresa a 60 FPS
      // Elimina por completo los micro-tirones y saltos producidos por temporizadores asíncronos
      const dx = this.posicionObjetivo.x - this.posicionHerramienta.x;
      const dy = this.posicionObjetivo.y - this.posicionHerramienta.y;
      const dz = this.posicionObjetivo.z - this.posicionHerramienta.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq > 0.000001) {
        const factorLerp = Math.min(1.0, Math.max(0.18, dt * 0.035));
        this.posicionHerramienta.x += dx * factorLerp;
        this.posicionHerramienta.y += dy * factorLerp;
        this.posicionHerramienta.z += dz * factorLerp;
        this.actualizarIndicadoresPosicionTexto(this.posicionHerramienta.x, this.posicionHerramienta.y, this.posicionHerramienta.z);
        if (this.lineaActualEjecucion >= 0) {
          this.actualizarProgresoTrayectoriaDesdePosicion();
        }
      }

      this.renderizar();
      this.animacionGiroId = requestAnimationFrame(pasoAnimacion);
    };

    this.animacionGiroId = requestAnimationFrame(pasoAnimacion);
  }

  // Retícula indicadora de alta precisión y herramienta de corte (fresa/V-bit) con punta ultra fina y animación de giro
  // Retícula indicadora de alta precisión y herramienta de corte (fresa/V-bit) con punta visible adaptable al zoom
  dibujarRetículaHerramienta(ctx) {
    const pos = this.convertirAPantalla(this.posicionHerramienta.x, this.posicionHerramienta.y, this.posicionHerramienta.z);
    if (!pos || isNaN(pos.x) || isNaN(pos.y)) return;

    ctx.save();

    // Factor de escala visual adaptativo según el nivel de magnificación/zoom:
    // Al hacer zoom sobre las pistas del PCB, la herramienta escala armónicamente
    // con el corte para que la punta y el cuerpo mantengan proporción realista y nunca se hagan chicos.
    const factorEscalaZoom = Math.max(1.0, Math.min(6.5, Math.pow(this.zoom, 0.40)));

    // Comprobamos si la vista tiene componente vertical para proyectar el vástago 3D (3D, XZ, YZ)
    const posArribaReal = this.convertirAPantalla(
      this.posicionHerramienta.x,
      this.posicionHerramienta.y,
      this.posicionHerramienta.z + 25
    );

    const dx = posArribaReal.x - pos.x;
    const dy = posArribaReal.y - pos.y;
    const distEje = Math.hypot(dx, dy);

    const esVistaProyectada3D = distEje >= 4 && (this.mostrarHerramienta3D !== false);

    // Si la herramienta seleccionada es el Lápiz didáctico escolar:
    if (this.tipoHerramienta === 'lapiz') {
      if (esVistaProyectada3D) {
        this.dibujarLapiz3D(ctx, pos, factorEscalaZoom, dx, dy, distEje);
      } else {
        this.dibujarLapiz2D(ctx, pos, factorEscalaZoom);
      }
      ctx.restore();
      return;
    }

    // Si la herramienta seleccionada es el Diodo Láser:
    if (this.tipoHerramienta === 'laser') {
      if (esVistaProyectada3D) {
        this.dibujarLaser3D(ctx, pos, factorEscalaZoom, dx, dy, distEje);
      } else {
        this.dibujarLaser2D(ctx, pos, factorEscalaZoom);
      }
      ctx.restore();
      return;
    }

    if (esVistaProyectada3D) {
      // -------------------------------------------------------------
      // VISTA 3D / ELEVACIÓN: Fresa de grabado/corte cónica con punta visible
      // -------------------------------------------------------------
      const ux = dx / distEje;
      const uy = dy / distEje;
      const nx = -uy;
      const ny = ux;

      // Longitud y radios visuales adaptativos según el nivel de zoom
      const rCuerpo = 4.2 * factorEscalaZoom;
      const rVastago = rCuerpo * 1.15;
      const rPinza = rCuerpo * 1.95;


      const distPx = Math.max(48 * factorEscalaZoom, distEje * 1.6);
      const distPxLimitada = Math.min(260, distPx);
      const hPunta = Math.max(16.0 * factorEscalaZoom, distPxLimitada * 0.28);
      const hGav = hPunta * 2.1;
      const hVastago = distPxLimitada;
      const hPinza = distPxLimitada + 15 * factorEscalaZoom;

      // Coordenadas clave
      const ptBaseConoL = { x: pos.x + ux * hPunta - nx * rCuerpo, y: pos.y + uy * hPunta - ny * rCuerpo };
      const ptBaseConoR = { x: pos.x + ux * hPunta + nx * rCuerpo, y: pos.y + uy * hPunta + ny * rCuerpo };

      const ptGavL = { x: pos.x + ux * hGav - nx * rCuerpo, y: pos.y + uy * hGav - ny * rCuerpo };
      const ptGavR = { x: pos.x + ux * hGav + nx * rCuerpo, y: pos.y + uy * hGav + ny * rCuerpo };

      const ptVastagoL = { x: pos.x + ux * hVastago - nx * rVastago, y: pos.y + uy * hVastago - ny * rVastago };
      const ptVastagoR = { x: pos.x + ux * hVastago + nx * rVastago, y: pos.y + uy * hVastago + ny * rVastago };

      const ptPinzaL = { x: pos.x + ux * hPinza - nx * rPinza, y: pos.y + uy * hPinza - ny * rPinza };
      const ptPinzaR = { x: pos.x + ux * hPinza + nx * rPinza, y: pos.y + uy * hPinza + ny * rPinza };

      // 1. PINZA / MANDRIL PORTAHERRAMIENTAS (Collet Chuck ER)
      const gradPinza = ctx.createLinearGradient(ptVastagoL.x, ptVastagoL.y, ptVastagoR.x, ptVastagoR.y);
      gradPinza.addColorStop(0, '#1a1f26');
      gradPinza.addColorStop(0.3, '#3a4452');
      gradPinza.addColorStop(0.7, '#242a33');
      gradPinza.addColorStop(1, '#111418');

      ctx.fillStyle = gradPinza;
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ptVastagoL.x - nx * 3, ptVastagoL.y - ny * 3);
      ctx.lineTo(ptPinzaL.x, ptPinzaL.y);
      ctx.lineTo(ptPinzaR.x, ptPinzaR.y);
      ctx.lineTo(ptVastagoR.x + nx * 3, ptVastagoR.y + ny * 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Banda de tuerca metálica
      ctx.strokeStyle = '#6e7d91';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ptPinzaL.x + ux * 4, ptPinzaL.y + uy * 4);
      ctx.lineTo(ptPinzaR.x + ux * 4, ptPinzaR.y + uy * 4);
      ctx.stroke();

      // 2. VÁSTAGO DE CARBURO (Shank)
      const gradVastago = ctx.createLinearGradient(ptGavL.x, ptGavL.y, ptGavR.x, ptGavR.y);
      gradVastago.addColorStop(0, '#4a535e');
      gradVastago.addColorStop(0.35, '#8c98a6');
      gradVastago.addColorStop(0.7, '#5d6773');
      gradVastago.addColorStop(1, '#2c323a');

      ctx.fillStyle = gradVastago;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ptGavL.x, ptGavL.y);
      ctx.lineTo(ptVastagoL.x, ptVastagoL.y);
      ctx.lineTo(ptVastagoR.x, ptVastagoR.y);
      ctx.lineTo(ptGavR.x, ptGavR.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 3. CUERPO DE CORTE CILÍNDRICO (Flute section)
      const gradCuerpo = ctx.createLinearGradient(ptBaseConoL.x, ptBaseConoL.y, ptBaseConoR.x, ptBaseConoR.y);
      gradCuerpo.addColorStop(0, '#785b05');
      gradCuerpo.addColorStop(0.4, '#ffd166');
      gradCuerpo.addColorStop(0.75, '#e09f00');
      gradCuerpo.addColorStop(1, '#4a3600');

      ctx.fillStyle = gradCuerpo;
      ctx.beginPath();
      ctx.moveTo(ptBaseConoL.x, ptBaseConoL.y);
      ctx.lineTo(ptGavL.x, ptGavL.y);
      ctx.lineTo(ptGavR.x, ptGavR.y);
      ctx.lineTo(ptBaseConoR.x, ptBaseConoR.y);
      ctx.closePath();
      ctx.fill();

      // 4. PUNTA CÓNICA ULTRA AFILADA DE PRECISIÓN (V-Bit Sharp Tip)
      // Converge directamente al punto de corte milimétrico en (pos.x, pos.y) totalmente despejado
      const gradPunta = ctx.createLinearGradient(ptBaseConoL.x, ptBaseConoL.y, ptBaseConoR.x, ptBaseConoR.y);
      gradPunta.addColorStop(0, '#594000');
      gradPunta.addColorStop(0.3, '#ffc107');
      gradPunta.addColorStop(0.5, '#fff9c4');
      gradPunta.addColorStop(0.7, '#ffb300');
      gradPunta.addColorStop(1, '#4a3600');

      ctx.fillStyle = gradPunta;
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = Math.max(1.0, 1.2 * Math.pow(factorEscalaZoom, 0.3));
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(ptBaseConoL.x, ptBaseConoL.y);
      ctx.lineTo(ptBaseConoR.x, ptBaseConoR.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Arista central de corte hacia el vértice exacto (pos.x, pos.y)
      const ptBaseConoCentro = { x: pos.x + ux * hPunta, y: pos.y + uy * hPunta };
      ctx.strokeStyle = 'rgba(255, 249, 196, 0.9)';
      ctx.lineWidth = Math.max(1.0, 1.1 * Math.pow(factorEscalaZoom, 0.25));
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(ptBaseConoCentro.x, ptBaseConoCentro.y);
      ctx.stroke();

      // Micro-punto afilado visible en el punto exacto de corte (sin cruces ni aros azules)
      ctx.fillStyle = '#fff9c4';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, Math.max(1.0, Math.min(2.0, 1.0 * Math.pow(factorEscalaZoom, 0.2))), 0, Math.PI * 2);
      ctx.fill();

      // 5. GAVILANES HELICOIDALES EN ROTACIÓN (Animación 3D)
      const angRad = (this.anguloGiroHerramienta * Math.PI) / 180;
      const numFlutes = 2;

      ctx.save();
      for (let f = 0; f < numFlutes; f++) {
        const baseFluteAng = angRad + (f * Math.PI);
        ctx.beginPath();

        let comenzo = false;
        const pasosH = 14;
        for (let i = 0; i <= pasosH; i++) {
          const frac = i / pasosH;
          const h = 2 + frac * (hGav - 2);

          // Radio en este punto de altura (cono en parte baja, cilindro arriba)
          const rH = (h < hPunta)
            ? (rCuerpo * (h / hPunta))
            : rCuerpo;

          const twist = (h / hGav) * Math.PI * 1.6;
          const flutePhase = baseFluteAng + twist;
          const cosPhase = Math.cos(flutePhase);

          // Solo dibujamos cuando el gavilán pasa por el frente visible
          if (cosPhase > -0.15) {
            const sinPhase = Math.sin(flutePhase);
            const xPos = pos.x + ux * h + nx * (sinPhase * rH);
            const yPos = pos.y + uy * h + ny * (sinPhase * rH);

            if (!comenzo) {
              ctx.moveTo(xPos, yPos);
              comenzo = true;
            } else {
              ctx.lineTo(xPos, yPos);
            }
          } else {
            comenzo = false;
          }
        }

        ctx.strokeStyle = this.herramientaGirando
          ? '#ffe082'
          : '#ffb703';
        ctx.lineWidth = this.herramientaGirando ? (1.5 * Math.pow(factorEscalaZoom, 0.3)) : (1.2 * Math.pow(factorEscalaZoom, 0.3));
        ctx.stroke();
      }
      ctx.restore();

    } else {
      // -------------------------------------------------------------
      // VISTA 2D SUPERIOR (PLANO XY): Mira óptica micrométrica limpia y nítida
      // -------------------------------------------------------------
      const angRad = (this.anguloGiroHerramienta * Math.PI) / 180;

      // 1. Diámetro exterior adaptativo de la herramienta
      const rHerramienta = Math.max(6.0, Math.min(45.0, 5.5 * factorEscalaZoom));
      ctx.strokeStyle = this.herramientaGirando ? 'rgba(255, 209, 102, 0.95)' : 'rgba(255, 183, 3, 0.85)';
      ctx.lineWidth = Math.max(1.2, 1.4 * Math.pow(factorEscalaZoom, 0.25));
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, rHerramienta, 0, Math.PI * 2);
      ctx.stroke();

      // 2. Si está girando: FILOS DE CORTE EN ROTACIÓN Y ANILLO ORBITAL
      if (this.herramientaGirando) {
        ctx.save();
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = Math.max(1.2, 1.4 * Math.pow(factorEscalaZoom, 0.25));

        // Anillo orbital punteado giratorio indicando dirección de rotación
        ctx.setLineDash([3, 4]);
        ctx.lineDashOffset = -(this.anguloGiroHerramienta * 0.2);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, rHerramienta + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 2 filos de corte espirales rotatorios dentro de la herramienta
        const rIn = Math.max(2.0, 2.0 * Math.pow(factorEscalaZoom, 0.3));
        const rOut = rHerramienta - 0.6;
        for (let b = 0; b < 2; b++) {
          const a = angRad + (b * Math.PI);
          ctx.beginPath();
          ctx.moveTo(pos.x + Math.cos(a) * rIn, pos.y + Math.sin(a) * rIn);
          ctx.quadraticCurveTo(
            pos.x + Math.cos(a + 0.4) * (rIn + rOut) * 0.5,
            pos.y + Math.sin(a + 0.4) * (rIn + rOut) * 0.5,
            pos.x + Math.cos(a + 0.8) * rOut,
            pos.y + Math.sin(a + 0.8) * rOut
          );
          ctx.stroke();
        }
        ctx.restore();
      }

      // 3. INDICADOR CENTRAL DE PRECISIÓN LIMPIO (Sin cruces ni retículas que tapen la pista)
      ctx.save();
      const colorRet = this.herramientaGirando ? '#ffe082' : '#ffd166';
      ctx.strokeStyle = colorRet;
      ctx.lineWidth = Math.max(1.0, 1.2 * Math.pow(factorEscalaZoom, 0.25));

      const radioAnillo2D = Math.max(3.0, Math.min(10.0, 3.0 * Math.pow(factorEscalaZoom, 0.35)));
      const radioLaser2D = Math.max(1.4, Math.min(3.2, 1.4 * Math.pow(factorEscalaZoom, 0.3)));

      // Micro-anillo concéntrico fino
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radioAnillo2D, 0, Math.PI * 2);
      ctx.stroke();

      // Punto central micrométrico en el punto exacto de corte
      ctx.fillStyle = colorRet;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radioLaser2D, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // Define el tipo de herramienta activa ('fresa', 'lapiz' o 'laser') y refresca el lienzo
  establecerTipoHerramienta(tipo) {
    if (tipo === 'lapiz') {
      this.tipoHerramienta = 'lapiz';
    } else if (tipo === 'laser' || tipo === 'láser') {
      this.tipoHerramienta = 'laser';
    } else {
      this.tipoHerramienta = 'fresa';
    }
    localStorage.setItem('cnc_tipo_herramienta', this.tipoHerramienta);
    this.solicitarRenderizado();
  }

  // Retícula y haz 2D de alta precisión para Diodo Láser
  dibujarLaser2D(ctx, pos, factorEscalaZoom) {
    ctx.save();
    const radioBase = 12 * factorEscalaZoom;
    const estaActivo = Boolean(this.herramientaGirando);

    // 1. Halo difuso del diodo láser cuando está encendido
    if (estaActivo) {
      const gradienteHalo = ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, radioBase * 2.2);
      gradienteHalo.addColorStop(0, 'rgba(236, 72, 153, 0.95)');
      gradienteHalo.addColorStop(0.25, 'rgba(168, 85, 247, 0.7)');
      gradienteHalo.addColorStop(0.6, 'rgba(147, 51, 234, 0.25)');
      gradienteHalo.addColorStop(1, 'rgba(147, 51, 234, 0)');

      ctx.fillStyle = gradienteHalo;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radioBase * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Destello de 4 puntas de difracción óptica
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.75)';
      ctx.lineWidth = 1.2;
      const lRay = radioBase * 1.8;
      ctx.beginPath();
      ctx.moveTo(pos.x - lRay, pos.y); ctx.lineTo(pos.x + lRay, pos.y);
      ctx.moveTo(pos.x, pos.y - lRay); ctx.lineTo(pos.x, pos.y + lRay);
      ctx.stroke();
    }

    // 2. Anillo de colimación exterior
    ctx.strokeStyle = estaActivo ? '#c084fc' : '#8b5cf6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radioBase, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Cruz óptica de puntería con apertura central
    ctx.strokeStyle = estaActivo ? '#f472b6' : '#a78bfa';
    ctx.lineWidth = 1.2;
    const gap = 3 * factorEscalaZoom;
    const len = 7 * factorEscalaZoom;
    ctx.beginPath();
    ctx.moveTo(pos.x - gap - len, pos.y); ctx.lineTo(pos.x - gap, pos.y);
    ctx.moveTo(pos.x + gap, pos.y); ctx.lineTo(pos.x + gap + len, pos.y);
    ctx.moveTo(pos.x, pos.y - gap - len); ctx.lineTo(pos.x, pos.y - gap);
    ctx.moveTo(pos.x, pos.y + gap); ctx.lineTo(pos.x, pos.y + gap + len);
    ctx.stroke();

    // 4. Punto focal central ultra nítido
    ctx.fillStyle = estaActivo ? '#ffffff' : '#e9d5ff';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, Math.max(1.5, 2.0 * factorEscalaZoom), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Renderizado fotorrealista 3D de un cabezal con Diodo Láser semiconductor montado en el eje Z
  dibujarLaser3D(ctx, pos, factorEscalaZoom, dx, dy, distEje) {
    ctx.save();
    const ux = dx / distEje;
    const uy = dy / distEje;
    const nx = -uy;
    const ny = ux;

    const estaActivo = Boolean(this.herramientaGirando);
    const distPx = Math.max(48 * factorEscalaZoom, distEje * 1.6);
    const distPxLimitada = Math.min(260, distPx);

    // Alturas proyectadas
    const hFocal = Math.max(14 * factorEscalaZoom, distPxLimitada * 0.22);
    const hLente = hFocal + 10 * factorEscalaZoom;
    const hCuerpo = distPxLimitada + 12 * factorEscalaZoom;

    const rLente = 3.2 * factorEscalaZoom;
    const rCuerpo = 7.5 * factorEscalaZoom;

    // 1. HAZ LÁSER FOCAL
    if (estaActivo) {
      const gradHaz = ctx.createLinearGradient(pos.x + ux * hFocal, pos.y + uy * hFocal, pos.x, pos.y);
      gradHaz.addColorStop(0, 'rgba(168, 85, 247, 0.85)');
      gradHaz.addColorStop(0.7, 'rgba(236, 72, 153, 0.95)');
      gradHaz.addColorStop(1, '#ffffff');

      ctx.fillStyle = 'rgba(168, 85, 247, 0.35)';
      ctx.beginPath();
      ctx.moveTo(pos.x + ux * hFocal - nx * (rLente * 0.7), pos.y + uy * hFocal - ny * (rLente * 0.7));
      ctx.lineTo(pos.x, pos.y);
      ctx.lineTo(pos.x + ux * hFocal + nx * (rLente * 0.7), pos.y + uy * hFocal + ny * (rLente * 0.7));
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = gradHaz;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(pos.x + ux * hFocal, pos.y + uy * hFocal);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 2.5 * factorEscalaZoom, 0, Math.PI * 2);
      ctx.fill();

      const glow = ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, 9 * factorEscalaZoom);
      glow.addColorStop(0, 'rgba(236, 72, 153, 0.8)');
      glow.addColorStop(1, 'rgba(147, 51, 234, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 9 * factorEscalaZoom, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(pos.x + ux * hFocal, pos.y + uy * hFocal);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. LENTE COLIMADORA DE LATÓN
    const pLenteBotL = { x: pos.x + ux * hFocal - nx * rLente, y: pos.y + uy * hFocal - ny * rLente };
    const pLenteBotR = { x: pos.x + ux * hFocal + nx * rLente, y: pos.y + uy * hFocal + ny * rLente };
    const pLenteTopL = { x: pos.x + ux * hLente - nx * rLente, y: pos.y + uy * hLente - ny * rLente };
    const pLenteTopR = { x: pos.x + ux * hLente + nx * rLente, y: pos.y + uy * hLente + ny * rLente };

    const gradLat = ctx.createLinearGradient(pLenteBotL.x, pLenteBotL.y, pLenteBotR.x, pLenteBotR.y);
    gradLat.addColorStop(0, '#78350f');
    gradLat.addColorStop(0.3, '#fde047');
    gradLat.addColorStop(0.7, '#d97706');
    gradLat.addColorStop(1, '#451a03');

    ctx.fillStyle = gradLat;
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pLenteBotL.x, pLenteBotL.y);
    ctx.lineTo(pLenteTopL.x, pLenteTopL.y);
    ctx.lineTo(pLenteTopR.x, pLenteTopR.y);
    ctx.lineTo(pLenteBotR.x, pLenteBotR.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. MÓDULO DISIPADOR DE ALUMINIO ANODIZADO
    const pCpoBotL = { x: pos.x + ux * hLente - nx * rCuerpo, y: pos.y + uy * hLente - ny * rCuerpo };
    const pCpoBotR = { x: pos.x + ux * hLente + nx * rCuerpo, y: pos.y + uy * hLente + ny * rCuerpo };
    const pCpoTopL = { x: pos.x + ux * hCuerpo - nx * rCuerpo, y: pos.y + uy * hCuerpo - ny * rCuerpo };
    const pCpoTopR = { x: pos.x + ux * hCuerpo + nx * rCuerpo, y: pos.y + uy * hCuerpo + ny * rCuerpo };

    const gradAlu = ctx.createLinearGradient(pCpoBotL.x, pCpoBotL.y, pCpoBotR.x, pCpoBotR.y);
    gradAlu.addColorStop(0, '#0f172a');
    gradAlu.addColorStop(0.25, '#334155');
    gradAlu.addColorStop(0.55, '#1e293b');
    gradAlu.addColorStop(1, '#020617');

    ctx.fillStyle = gradAlu;
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pCpoBotL.x, pCpoBotL.y);
    ctx.lineTo(pCpoTopL.x, pCpoTopL.y);
    ctx.lineTo(pCpoTopR.x, pCpoTopR.y);
    ctx.lineTo(pCpoBotR.x, pCpoBotR.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Aletas del disipador de calor
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 1.5;
    const numAletas = 5;
    for (let i = 1; i <= numAletas; i++) {
      const hFin = hLente + (hCuerpo - hLente) * (i / (numAletas + 1));
      ctx.beginPath();
      ctx.moveTo(pos.x + ux * hFin - nx * (rCuerpo * 0.95), pos.y + uy * hFin - ny * (rCuerpo * 0.95));
      ctx.lineTo(pos.x + ux * hFin + nx * (rCuerpo * 0.95), pos.y + uy * hFin + ny * (rCuerpo * 0.95));
      ctx.stroke();
    }

    // Tapa superior
    const pTapaL = { x: pos.x + ux * (hCuerpo + 4 * factorEscalaZoom) - nx * (rCuerpo * 0.85), y: pos.y + uy * (hCuerpo + 4 * factorEscalaZoom) - ny * (rCuerpo * 0.85) };
    const pTapaR = { x: pos.x + ux * (hCuerpo + 4 * factorEscalaZoom) + nx * (rCuerpo * 0.85), y: pos.y + uy * (hCuerpo + 4 * factorEscalaZoom) + ny * (rCuerpo * 0.85) };
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(pCpoTopL.x, pCpoTopL.y);
    ctx.lineTo(pTapaL.x, pTapaL.y);
    ctx.lineTo(pTapaR.x, pTapaR.y);
    ctx.lineTo(pCpoTopR.x, pCpoTopR.y);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // Renderizado fotorrealista 3D de un Lápiz de grafito escolar montado en la CNC
  dibujarLapiz3D(ctx, pos, factorEscalaZoom, dx, dy, distEje) {
    const ux = dx / distEje;
    const uy = dy / distEje;
    const nx = -uy;
    const ny = ux;

    const rLapiz = 4.2 * factorEscalaZoom;
    const distPx = Math.max(54 * factorEscalaZoom, distEje * 1.7);
    const distPxLimitada = Math.min(270, distPx);

    // Alturas proyectadas a lo largo del eje del lápiz desde la punta de contacto pos (h = 0)
    const hPuntaGrafito = Math.max(5.5 * factorEscalaZoom, distPxLimitada * 0.09);
    const hMadera = Math.max(16.0 * factorEscalaZoom, distPxLimitada * 0.28);
    const hCuerpo = distPxLimitada;
    const hVirola = distPxLimitada + 10 * factorEscalaZoom;
    const hGoma = hVirola + 8 * factorEscalaZoom;

    // 1. ADAPTADOR / BRACKET DE MONTAJE CNC (Collarín porta-lápiz en eje Z)
    const hSujetador = hCuerpo * 0.72;
    const anchoSujetador = rLapiz * 1.85;
    const pSujL = { x: pos.x + ux * hSujetador - nx * anchoSujetador, y: pos.y + uy * hSujetador - ny * anchoSujetador };
    const pSujR = { x: pos.x + ux * hSujetador + nx * anchoSujetador, y: pos.y + uy * hSujetador + ny * anchoSujetador };
    const pSujTopL = { x: pSujL.x + ux * (13 * factorEscalaZoom), y: pSujL.y + uy * (13 * factorEscalaZoom) };
    const pSujTopR = { x: pSujR.x + ux * (13 * factorEscalaZoom), y: pSujR.y + uy * (13 * factorEscalaZoom) };

    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pSujL.x, pSujL.y);
    ctx.lineTo(pSujTopL.x, pSujTopL.y);
    ctx.lineTo(pSujTopR.x, pSujTopR.y);
    ctx.lineTo(pSujR.x, pSujR.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tornillo de fijación micrométrico
    const pTornillo = { x: (pSujL.x + pSujTopL.x) * 0.5 - nx * 2, y: (pSujL.y + pSujTopL.y) * 0.5 - ny * 2 };
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(pTornillo.x, pTornillo.y, 2.3 * factorEscalaZoom, 0, Math.PI * 2);
    ctx.fill();

    // 2. GOMA DE BORRAR TRASERA (Color rosa tradicional)
    const ptGomaL = { x: pos.x + ux * hVirola - nx * (rLapiz * 0.88), y: pos.y + uy * hVirola - ny * (rLapiz * 0.88) };
    const ptGomaR = { x: pos.x + ux * hVirola + nx * (rLapiz * 0.88), y: pos.y + uy * hVirola + ny * (rLapiz * 0.88) };
    const ptGomaTopL = { x: pos.x + ux * hGoma - nx * (rLapiz * 0.8), y: pos.y + uy * hGoma - ny * (rLapiz * 0.8) };
    const ptGomaTopR = { x: pos.x + ux * hGoma + nx * (rLapiz * 0.8), y: pos.y + uy * hGoma + ny * (rLapiz * 0.8) };
    const ptGomaCap = { x: pos.x + ux * (hGoma + 2.5 * factorEscalaZoom), y: pos.y + uy * (hGoma + 2.5 * factorEscalaZoom) };

    const gradGoma = ctx.createLinearGradient(ptGomaL.x, ptGomaL.y, ptGomaR.x, ptGomaR.y);
    gradGoma.addColorStop(0, '#be185d');
    gradGoma.addColorStop(0.35, '#fb7185');
    gradGoma.addColorStop(0.7, '#f43f5e');
    gradGoma.addColorStop(1, '#9d174d');

    ctx.fillStyle = gradGoma;
    ctx.beginPath();
    ctx.moveTo(ptGomaL.x, ptGomaL.y);
    ctx.lineTo(ptGomaTopL.x, ptGomaTopL.y);
    ctx.quadraticCurveTo(ptGomaCap.x, ptGomaCap.y, ptGomaTopR.x, ptGomaTopR.y);
    ctx.lineTo(ptGomaR.x, ptGomaR.y);
    ctx.closePath();
    ctx.fill();

    // 3. VIROLA METÁLICA (Aluminio de ensamble de goma)
    const ptVirolaL = { x: pos.x + ux * hCuerpo - nx * (rLapiz * 0.95), y: pos.y + uy * hCuerpo - ny * (rLapiz * 0.95) };
    const ptVirolaR = { x: pos.x + ux * hCuerpo + nx * (rLapiz * 0.95), y: pos.y + uy * hCuerpo + ny * (rLapiz * 0.95) };

    const gradVirola = ctx.createLinearGradient(ptVirolaL.x, ptVirolaL.y, ptVirolaR.x, ptVirolaR.y);
    gradVirola.addColorStop(0, '#475569');
    gradVirola.addColorStop(0.3, '#f1f5f9');
    gradVirola.addColorStop(0.65, '#cbd5e1');
    gradVirola.addColorStop(1, '#334155');

    ctx.fillStyle = gradVirola;
    ctx.beginPath();
    ctx.moveTo(ptVirolaL.x, ptVirolaL.y);
    ctx.lineTo(ptGomaL.x, ptGomaL.y);
    ctx.lineTo(ptGomaR.x, ptGomaR.y);
    ctx.lineTo(ptVirolaR.x, ptVirolaR.y);
    ctx.closePath();
    ctx.fill();

    // Bandas grabadas de la virola metálica
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let r = 0.3; r <= 0.7; r += 0.3) {
      const hBand = hCuerpo + (hVirola - hCuerpo) * r;
      ctx.beginPath();
      ctx.moveTo(pos.x + ux * hBand - nx * (rLapiz * 0.95), pos.y + uy * hBand - ny * (rLapiz * 0.95));
      ctx.lineTo(pos.x + ux * hBand + nx * (rLapiz * 0.95), pos.y + uy * hBand + ny * (rLapiz * 0.95));
      ctx.stroke();
    }

    // 4. CUERPO HEXAGONAL AMARILLO (3 facetas visibles con iluminación y bisel)
    const f1 = 0.32;
    const ptCpoL_bot = { x: pos.x + ux * hMadera - nx * rLapiz, y: pos.y + uy * hMadera - ny * rLapiz };
    const ptCpoL_top = { x: pos.x + ux * hCuerpo - nx * rLapiz, y: pos.y + uy * hCuerpo - ny * rLapiz };

    const ptCpoM1_bot = { x: pos.x + ux * hMadera - nx * (rLapiz * f1), y: pos.y + uy * hMadera - ny * (rLapiz * f1) };
    const ptCpoM1_top = { x: pos.x + ux * hCuerpo - nx * (rLapiz * f1), y: pos.y + uy * hCuerpo - ny * (rLapiz * f1) };

    const ptCpoM2_bot = { x: pos.x + ux * hMadera + nx * (rLapiz * f1), y: pos.y + uy * hMadera + ny * (rLapiz * f1) };
    const ptCpoM2_top = { x: pos.x + ux * hCuerpo + nx * (rLapiz * f1), y: pos.y + uy * hCuerpo + ny * (rLapiz * f1) };

    const ptCpoR_bot = { x: pos.x + ux * hMadera + nx * rLapiz, y: pos.y + uy * hMadera + ny * rLapiz };
    const ptCpoR_top = { x: pos.x + ux * hCuerpo + nx * rLapiz, y: pos.y + uy * hCuerpo + ny * rLapiz };

    // Faceta Izquierda (Sombra)
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.moveTo(ptCpoL_bot.x, ptCpoL_bot.y);
    ctx.lineTo(ptCpoL_top.x, ptCpoL_top.y);
    ctx.lineTo(ptCpoM1_top.x, ptCpoM1_top.y);
    ctx.lineTo(ptCpoM1_bot.x, ptCpoM1_bot.y);
    ctx.closePath();
    ctx.fill();

    // Faceta Central (Luz directa - Amarillo oro)
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(ptCpoM1_bot.x, ptCpoM1_bot.y);
    ctx.lineTo(ptCpoM1_top.x, ptCpoM1_top.y);
    ctx.lineTo(ptCpoM2_top.x, ptCpoM2_top.y);
    ctx.lineTo(ptCpoM2_bot.x, ptCpoM2_bot.y);
    ctx.closePath();
    ctx.fill();

    // Faceta Derecha (Semisombra)
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.moveTo(ptCpoM2_bot.x, ptCpoM2_bot.y);
    ctx.lineTo(ptCpoM2_top.x, ptCpoM2_top.y);
    ctx.lineTo(ptCpoR_top.x, ptCpoR_top.y);
    ctx.lineTo(ptCpoR_bot.x, ptCpoR_bot.y);
    ctx.closePath();
    ctx.fill();

    // Aristas brillantes longitudinales del hexágono
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ptCpoM1_bot.x, ptCpoM1_bot.y);
    ctx.lineTo(ptCpoM1_top.x, ptCpoM1_top.y);
    ctx.moveTo(ptCpoM2_bot.x, ptCpoM2_bot.y);
    ctx.lineTo(ptCpoM2_top.x, ptCpoM2_top.y);
    ctx.stroke();

    // 5. CUELLO DE MADERA AFILADA (Madera de cedro natural tallada)
    const ptMadL = ptCpoL_bot;
    const ptMadR = ptCpoR_bot;
    const rGrafito = rLapiz * 0.38;
    const ptGrafL = { x: pos.x + ux * hPuntaGrafito - nx * rGrafito, y: pos.y + uy * hPuntaGrafito - ny * rGrafito };
    const ptGrafR = { x: pos.x + ux * hPuntaGrafito + nx * rGrafito, y: pos.y + uy * hPuntaGrafito + ny * rGrafito };

    const gradMadera = ctx.createLinearGradient(ptMadL.x, ptMadL.y, ptMadR.x, ptMadR.y);
    gradMadera.addColorStop(0, '#d97706');
    gradMadera.addColorStop(0.25, '#fde68a');
    gradMadera.addColorStop(0.5, '#fef3c7');
    gradMadera.addColorStop(0.75, '#fde68a');
    gradMadera.addColorStop(1, '#b45309');

    ctx.fillStyle = gradMadera;
    ctx.beginPath();
    ctx.moveTo(ptGrafL.x, ptGrafL.y);
    ctx.lineTo(ptMadL.x, ptMadL.y);
    // Ondulaciones mecánicas del afilado
    ctx.lineTo(ptCpoM1_bot.x + ux * 2, ptCpoM1_bot.y + uy * 2);
    ctx.lineTo(ptCpoM2_bot.x + ux * 2, ptCpoM2_bot.y + uy * 2);
    ctx.lineTo(ptMadR.x, ptMadR.y);
    ctx.lineTo(ptGrafR.x, ptGrafR.y);
    ctx.closePath();
    ctx.fill();

    // Veta longitudinal de madera
    ctx.strokeStyle = 'rgba(180, 83, 9, 0.4)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(ptGrafL.x * 0.5 + ptGrafR.x * 0.5, ptGrafL.y * 0.5 + ptGrafR.y * 0.5);
    ctx.lineTo(pos.x + ux * hMadera, pos.y + uy * hMadera);
    ctx.stroke();

    // 6. MINA DE GRAFITO AFILADA (Punta de contacto en pos.x, pos.y)
    const gradGrafito = ctx.createLinearGradient(ptGrafL.x, ptGrafL.y, ptGrafR.x, ptGrafR.y);
    gradGrafito.addColorStop(0, '#0f172a');
    gradGrafito.addColorStop(0.4, '#475569');
    gradGrafito.addColorStop(0.7, '#1e293b');
    gradGrafito.addColorStop(1, '#020617');

    ctx.fillStyle = gradGrafito;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(ptGrafL.x, ptGrafL.y);
    ctx.lineTo(ptGrafR.x, ptGrafR.y);
    ctx.closePath();
    ctx.fill();

    // Micro-punto de grafito en el vértice exacto de dibujo
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, Math.max(1.2, 1.4 * Math.pow(factorEscalaZoom, 0.25)), 0, Math.PI * 2);
    ctx.fill();
  }

  // Renderizado en planta superior 2D (Plano XY) del Lápiz didáctico
  dibujarLapiz2D(ctx, pos, factorEscalaZoom) {
    const rHex = Math.max(7.0, Math.min(38.0, 6.5 * factorEscalaZoom));
    const rMad = rHex * 0.65;
    const rGraf = rHex * 0.28;

    // 1. Perfil hexagonal exterior amarillo
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3;
      const hx = pos.x + Math.cos(ang) * rHex;
      const hy = pos.y + Math.sin(ang) * rHex;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = Math.max(1.2, 1.5 * Math.pow(factorEscalaZoom, 0.25));
    ctx.stroke();

    // 2. Cono concéntrico de madera clara tallada
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, rMad, 0, Math.PI * 2);
    ctx.fillStyle = '#fef3c7';
    ctx.fill();
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. Mina central de grafito oscuro
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, rGraf, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    // 4. Retícula óptica fina de trazador
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.75)';
    ctx.lineWidth = 1;
    const lCruz = rHex + 4;
    ctx.beginPath();
    ctx.moveTo(pos.x - lCruz, pos.y);
    ctx.lineTo(pos.x - rGraf - 1, pos.y);
    ctx.moveTo(pos.x + rGraf + 1, pos.y);
    ctx.lineTo(pos.x + lCruz, pos.y);
    ctx.moveTo(pos.x, pos.y - lCruz);
    ctx.lineTo(pos.x, pos.y - rGraf - 1);
    ctx.moveTo(pos.x, pos.y + rGraf + 1);
    ctx.lineTo(pos.x, pos.y + lCruz);
    ctx.stroke();
  }

  // Alternar visibilidad de la cuadrícula milimétrica / 3D
  alternarCuadricula() {
    this.mostrarCuadricula = !this.mostrarCuadricula;
    this.marcarEstaticoSucio();
    this.solicitarRenderizado();
    return this.mostrarCuadricula;
  }

  // Limpiar la trayectoria gráfica en el lienzo
  limpiarTrayectoria() {
    this.trayectoria = [];
    this.envolventePieza = null;
    this.marcarEstaticoSucio();
    this.solicitarRenderizado();
  }

  // Establece las dimensiones físicas útiles de la máquina CNC ($130, $131, $132)
  establecerLimitesMaquina(maxX, maxY, maxZ) {
    this.limitesMaquina = {
      maxX: Math.max(10, parseFloat(maxX) || 300.0),
      maxY: Math.max(10, parseFloat(maxY) || 200.0),
      maxZ: Math.max(5, parseFloat(maxZ) || 60.0)
    };
    this.evaluarLimitesPieza();
    this.marcarEstaticoSucio();
    this.solicitarRenderizado();
  }

  // Comprueba si la pieza o código G excede las dimensiones de la máquina
  evaluarLimitesPieza() {
    if (!this.trayectoria || this.trayectoria.length === 0) {
      this.estadoLimites = {
        hayDesbordamiento: false,
        minPieza: { x: 0, y: 0, z: 0 },
        maxPieza: { x: 0, y: 0, z: 0 },
        ejesExcedidos: [],
        mensaje: ''
      };
      if (this.alertaLimitesCallback) this.alertaLimitesCallback(this.estadoLimites);
      return this.estadoLimites;
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < this.trayectoria.length; i++) {
      const s = this.trayectoria[i];
      minX = Math.min(minX, s.x1, s.x2);
      maxX = Math.max(maxX, s.x1, s.x2);
      minY = Math.min(minY, s.y1, s.y2);
      maxY = Math.max(maxY, s.y1, s.y2);
      minZ = Math.min(minZ, s.z1, s.z2);
      maxZ = Math.max(maxZ, s.z1, s.z2);
    }

    const ejesExcedidos = [];
    const limX = this.limitesMaquina.maxX;
    const limY = this.limitesMaquina.maxY;
    const limZ = this.limitesMaquina.maxZ;

    if (minX < -0.01) {
      ejesExcedidos.push(`X menor a 0 (${minX.toFixed(2)} mm)`);
    }
    if (maxX > limX + 0.01) {
      ejesExcedidos.push(`X mayor a ${limX} mm (${maxX.toFixed(2)} mm, exceso +${(maxX - limX).toFixed(2)} mm)`);
    }
    if (minY < -0.01) {
      ejesExcedidos.push(`Y menor a 0 (${minY.toFixed(2)} mm)`);
    }
    if (maxY > limY + 0.01) {
      ejesExcedidos.push(`Y mayor a ${limY} mm (${maxY.toFixed(2)} mm, exceso +${(maxY - limY).toFixed(2)} mm)`);
    }
    if (minZ < -limZ - 0.01) {
      ejesExcedidos.push(`Z profundidad excede ${limZ} mm (${minZ.toFixed(2)} mm)`);
    }

    const hayDesbordamiento = ejesExcedidos.length > 0;
    this.estadoLimites = {
      hayDesbordamiento,
      minPieza: { x: minX, y: minY, z: minZ },
      maxPieza: { x: maxX, y: maxY, z: maxZ },
      ejesExcedidos,
      mensaje: hayDesbordamiento ? ejesExcedidos.join(' · ') : 'Dentro del área física de la máquina'
    };

    if (this.alertaLimitesCallback) {
      this.alertaLimitesCallback(this.estadoLimites);
    }

    return this.estadoLimites;
  }

  // Dibuja el área de trabajo física predefinida de la máquina CNC ($130, $131, $132)
  dibujarMesaMaquina(ctx) {
    const maxX = this.limitesMaquina.maxX;
    const maxY = this.limitesMaquina.maxY;
    const maxZ = this.limitesMaquina.maxZ;
    const hayDesb = this.estadoLimites.hayDesbordamiento;

    ctx.save();

    if (this.modoVista === 'XY') {
      const p0 = this.convertirAPantalla(0, 0);
      const pMax = this.convertirAPantalla(maxX, maxY);
      const ancho = pMax.x - p0.x;
      const alto = p0.y - pMax.y;

      // 1. Superficie de la mesa física mecanizable
      ctx.fillStyle = 'rgba(12, 17, 24, 0.75)';
      this.rellenarPoligonoVisible(ctx, [{x:p0.x,y:pMax.y},{x:pMax.x,y:pMax.y},{x:pMax.x,y:p0.y},p0]);

      // 2. Borde perimetral de la mesa
      ctx.lineWidth = hayDesb ? 2.5 : 1.5;
      ctx.strokeStyle = hayDesb ? 'rgba(220, 38, 38, 0.95)' : 'rgba(0, 229, 255, 0.7)';
      this.trazarAristasVisibles(ctx, [{x:p0.x,y:pMax.y},{x:pMax.x,y:pMax.y},{x:pMax.x,y:p0.y},p0]);

      // 3. Marcas de escuadra técnica en las 4 esquinas de la mesa
      const tamBracket = Math.min(16, Math.max(6, 12 * Math.sqrt(this.zoom)));
      ctx.strokeStyle = hayDesb ? '#dc2626' : '#00e5ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      // Esquina (0,0)
      ctx.moveTo(p0.x, p0.y - tamBracket);
      ctx.lineTo(p0.x, p0.y);
      ctx.lineTo(p0.x + tamBracket, p0.y);
      // Esquina (maxX, 0)
      ctx.moveTo(pMax.x - tamBracket, p0.y);
      ctx.lineTo(pMax.x, p0.y);
      ctx.lineTo(pMax.x, p0.y - tamBracket);
      // Esquina (maxX, maxY)
      ctx.moveTo(pMax.x, pMax.y + tamBracket);
      ctx.lineTo(pMax.x, pMax.y);
      ctx.lineTo(pMax.x - tamBracket, pMax.y);
      // Esquina (0, maxY)
      ctx.moveTo(p0.x + tamBracket, pMax.y);
      ctx.lineTo(p0.x, pMax.y);
      ctx.lineTo(p0.x, pMax.y + tamBracket);
      ctx.stroke();

      // 4. Rótulo de la Mesa con fondo protector
      const textoMesa = `MESA CNC [${maxX} × ${maxY} mm]`;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      const wTexto = ctx.measureText(textoMesa).width;
      ctx.fillStyle = 'rgba(10, 14, 18, 0.94)';
      ctx.fillRect(p0.x + 4, pMax.y - 18, wTexto + 8, 14);
      ctx.fillStyle = hayDesb ? '#fbbf24' : '#4dd2ff';
      ctx.fillText(textoMesa, p0.x + 8, pMax.y - 7);

    } else if (this.modoVista === 'XZ') {
      const p0 = this.convertirAPantalla(0, 0, 0);
      const pMax = this.convertirAPantalla(maxX, 0, maxZ);
      const ancho = pMax.x - p0.x;
      const alto = p0.y - pMax.y;

      // Volumen útil de la máquina hacia arriba (+Z)
      ctx.fillStyle = 'rgba(12, 17, 24, 0.65)';
      this.rellenarPoligonoVisible(ctx, [{x:p0.x,y:pMax.y},{x:pMax.x,y:pMax.y},{x:pMax.x,y:p0.y},p0]);

      ctx.lineWidth = hayDesb ? 2.5 : 1.5;
      ctx.strokeStyle = hayDesb ? 'rgba(220, 38, 38, 0.95)' : 'rgba(0, 229, 255, 0.7)';
      this.trazarAristasVisibles(ctx, [{x:p0.x,y:pMax.y},{x:pMax.x,y:pMax.y},{x:pMax.x,y:p0.y},p0]);

      // Línea sólida de la cama de la máquina en Z = 0
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(pMax.x, p0.y);
      ctx.stroke();

      // Rótulo de la Mesa XZ con fondo protector
      const textoMesaXZ = `MESA XZ [X: ${maxX} mm | Recorrido Z: +${maxZ} mm]`;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      const wTextoXZ = ctx.measureText(textoMesaXZ).width;
      ctx.fillStyle = 'rgba(10, 14, 18, 0.94)';
      ctx.fillRect(p0.x + 4, pMax.y - 18, wTextoXZ + 8, 14);
      ctx.fillStyle = hayDesb ? '#fbbf24' : '#4dd2ff';
      ctx.fillText(textoMesaXZ, p0.x + 8, pMax.y - 7);

    } else {
      // Modo 3D Isométrico:
      // 1. Superficie inferior de la mesa de trabajo física (Z = 0)
      const c1 = this.convertirAPantalla(0, 0, 0);
      const c2 = this.convertirAPantalla(maxX, 0, 0);
      const c3 = this.convertirAPantalla(maxX, maxY, 0);
      const c4 = this.convertirAPantalla(0, maxY, 0);

      // 2. Límite superior de carrera vertical del cabezal Z (+maxZ hacia ARRIBA)
      const t1 = this.convertirAPantalla(0, 0, maxZ);
      const t2 = this.convertirAPantalla(maxX, 0, maxZ);
      const t3 = this.convertirAPantalla(maxX, maxY, maxZ);
      const t4 = this.convertirAPantalla(0, maxY, maxZ);

      // Superficie física de la mesa sobre el plano Z = 0 (Base donde descansa la pieza)
      ctx.fillStyle = 'rgba(14, 20, 28, 0.85)';
      this.rellenarPoligonoVisible(ctx, [c1,c2,c3,c4]);

      // Perímetro sólido de la mesa en Z = 0
      ctx.lineWidth = hayDesb ? 2.5 : 2.0;
      ctx.strokeStyle = hayDesb ? 'rgba(220, 38, 38, 0.95)' : 'rgba(0, 229, 255, 0.85)';
      this.trazarAristasVisibles(ctx, [c1,c2,c3,c4]);

      // Columnas guía y volumen de trabajo que asciende hacia ARRIBA (+maxZ)
      ctx.strokeStyle = hayDesb ? 'rgba(220, 38, 38, 0.45)' : 'rgba(0, 229, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      for (const arista of [[c1,t1], [c2,t2], [c3,t3], [c4,t4]]) this.trazarAristasVisibles(ctx, arista, false);
      this.trazarAristasVisibles(ctx, [t1,t2,t3,t4]);
      ctx.setLineDash([]);

      // Rótulos de la mesa base y de la altura máxima Z con fondo protector
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      const txtMesa3D = `MESA BASE (Z=0) [${maxX}×${maxY}mm]`;
      const w3D = ctx.measureText(txtMesa3D).width;
      ctx.fillStyle = 'rgba(10, 14, 18, 0.94)';
      ctx.fillRect(c1.x + 4, c1.y - 19, w3D + 8, 14);
      ctx.fillStyle = hayDesb ? '#fbbf24' : '#4dd2ff';
      ctx.fillText(txtMesa3D, c1.x + 8, c1.y - 8);

      const txtZ = `Z: +${maxZ}mm`;
      const wZ = ctx.measureText(txtZ).width;
      ctx.fillStyle = 'rgba(10, 14, 18, 0.94)';
      ctx.fillRect(t1.x + 4, t1.y - 19, wZ + 8, 14);
      ctx.fillStyle = 'rgba(0, 229, 255, 0.85)';
      ctx.fillText(txtZ, t1.x + 8, t1.y - 8);
    }

    ctx.restore();
  }

  // Superposición visual de alerta sobre el lienzo cuando el modelo desborda (esquina inferior izquierda)
  dibujarAlertaLimitesOverlay(ctx) {
    if (!this.estadoLimites || !this.estadoLimites.hayDesbordamiento) return;

    ctx.save();
    const texto = `⚠️ ALERTA: MODELO FUERA DEL ÁREA CNC (${this.limitesMaquina.maxX}×${this.limitesMaquina.maxY}mm)`;
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    const anchoTexto = ctx.measureText(texto).width;

    const alto = this.altoPantalla || (this.lienzo ? this.lienzo.clientHeight : 400);
    const x = 12;
    const h = 26;
    // Ubicar en la esquina inferior izquierda, justo por encima de los datos de vista (overlay-bottom-left)
    const y = Math.round(alto - h - 34);
    const w = anchoTexto + 20;

    ctx.fillStyle = 'rgba(28, 12, 12, 0.95)';
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, 4);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.fillText(texto, x + 10, y + 17);
    ctx.restore();
  }

  // Métodos de personalización gráfica invocables desde la configuración
  establecerColorCorte(color) {
    this.colorCortePersonalizado = color;
    localStorage.setItem('cnc_color_cut', color);
    this.marcarEstaticoSucio();
    this.solicitarRenderizado();
  }

  establecerColorRapido(color) {
    this.colorRapidoPersonalizado = color;
    localStorage.setItem('cnc_color_rapid', color);
    this.marcarEstaticoSucio();
    this.solicitarRenderizado();
  }

  establecerMostrarRetícula(mostrar) {
    this.mostrarRetículaHerramienta = Boolean(mostrar);
    localStorage.setItem('cnc_show_reticle', this.mostrarRetículaHerramienta);
    this.solicitarRenderizado();
  }

  establecerMostrarLimitesMesa(mostrar) {
    this.mostrarLimitesMesa = Boolean(mostrar);
    localStorage.setItem('cnc_show_bed_limits', this.mostrarLimitesMesa);
    this.marcarEstaticoSucio();
    this.solicitarRenderizado();
  }

  establecerMostrarHerramienta3D(mostrar) {
    this.mostrarHerramienta3D = Boolean(mostrar);
    localStorage.setItem('cnc_show_tool_3d', this.mostrarHerramienta3D);
    this.solicitarRenderizado();
  }

  // Métodos puente para compatibilidad
  setToolPosition(x, y, z) { this.establecerPosicionHerramienta(x, y, z); }
  setViewMode(modo) { this.establecerModoVista(modo); }
  cambiarModoVista(modo) { this.establecerModoVista(modo); }
  toggleGrid() { return this.alternarCuadricula(); }
  clearTrajectory() { this.limpiarTrayectoria(); }
  setZoom(delta) { this.establecerZoom(delta); }
  resetView() { this.reiniciarVista(); }
  render() { this.solicitarRenderizado(); }
  loadGCode(gcode) { this.cargarTrayectoriaDesdeGCode(gcode); }
  cargarGCode(gcode) { this.cargarTrayectoriaDesdeGCode(gcode); }
  setMachineLimits(x, y, z) { this.establecerLimitesMaquina(x, y, z); }
  checkLimits() { return this.evaluarLimitesPieza(); }
}

// Compatibilidad de alias global
window.VisualizadorCNC = VisualizadorCNC;
window.CNCVisualizer = VisualizadorCNC;
window.visualizadorCNC = null;
window.cncVisualizer = null;
