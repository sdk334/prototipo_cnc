/**
 * CNC Basic v1.0 - Motor Gráfico del Visualizador 2D/3D (visualizer.js)
 * Renderizado en Canvas para trayectorias de herramienta, plano cartesiano,
 * cubo de navegación interactivo (ViewCube 3D), zoom de precisión hacia el cursor (hasta 25,000%)
 * y cuadrícula milimétrica/micrométrica adaptativa para inspección de pistas PCB de alta definición.
 */

class VisualizadorCNC {
  constructor(idLienzo) {
    this.lienzo = document.getElementById(idLienzo);
    if (!this.lienzo) return;
    this.contexto = this.lienzo.getContext('2d');

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

    // Control de interacción con ratón
    this.estaArrastrando = false;
    this.tipoArrastre = 'pan'; // 'pan' o 'orbit'
    this.ultimoRatonX = 0;
    this.ultimoRatonY = 0;

    // Segmentos de trayectoria { tipo: 'G0'|'G1', x1, y1, z1, x2, y2, z2 }
    this.trayectoria = [];
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

    this.cargarTrayectoriaEjemplo();

    this.redibujadoPendiente = false;
    this.iniciarEventos();
    this.iniciarCuboNavegacion();
    this.redimensionarLienzo();
    window.addEventListener('resize', () => this.redimensionarLienzo());
  }

  // Solicita redibujado sincronizado con la tasa de refresco del monitor (60 FPS / vsync)
  solicitarRenderizado() {
    if (document.querySelector('.modal-backdrop:not(.hidden)')) {
      return;
    }
    if (this.redibujadoPendiente) return;
    this.redibujadoPendiente = true;
    requestAnimationFrame(() => {
      this.redibujadoPendiente = false;
      this.renderizar();
    });
  }

  // Ajusta el lienzo a la resolución del dispositivo para máxima nitidez
  redimensionarLienzo() {
    const rectangulo = this.lienzo.parentElement.getBoundingClientRect();
    const proporcionPixeles = window.devicePixelRatio || 1;

    this.lienzo.width = rectangulo.width * proporcionPixeles;
    this.lienzo.height = rectangulo.height * proporcionPixeles;
    this.contexto.setTransform(proporcionPixeles, 0, 0, proporcionPixeles, 0, 0);

    this.anchoPantalla = rectangulo.width;
    this.altoPantalla = rectangulo.height;
    this.solicitarRenderizado();
  }

  // Control de interacción de ratón (órbita 3D, paneo y zoom enfocado hacia el cursor)
  iniciarEventos() {
    this.lienzo.addEventListener('contextmenu', (e) => e.preventDefault());

    this.lienzo.addEventListener('mousedown', (evento) => {
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
      const deltaX = evento.clientX - this.ultimoRatonX;
      const deltaY = evento.clientY - this.ultimoRatonY;
      this.ultimoRatonX = evento.clientX;
      this.ultimoRatonY = evento.clientY;

      if (this.tipoArrastre === 'orbit' || (this.modoVista === '3D' && evento.buttons === 1 && !evento.shiftKey)) {
        // Rotación 3D natural en los 3 ejes
        this.rotacionAzimut = (this.rotacionAzimut + deltaX * 0.45) % 360;
        this.rotacionInclinacion = Math.max(5, Math.min(88, this.rotacionInclinacion - deltaY * 0.45));
        this.actualizarCuboOrientacion();
        this.actualizarSuperposicionZoom();
        this.solicitarRenderizado();
      } else {
        // Paneo: desplazamiento de la escena
        this.desplazamientoX += deltaX;
        this.desplazamientoY += deltaY;
        this.solicitarRenderizado();
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.estaArrastrando) {
        this.estaArrastrando = false;
        this.lienzo.style.cursor = this.modoVista === '3D' ? 'grab' : 'crosshair';
      }
    });

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
      arrastrandoCubo = true;
      cuboUltimoX = e.clientX;
      cuboUltimoY = e.clientY;
      stage.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!arrastrandoCubo) return;
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
      this.solicitarRenderizado();
    });

    window.addEventListener('mouseup', () => {
      if (arrastrandoCubo) {
        arrastrandoCubo = false;
        stage.style.cursor = 'grab';
      }
    });

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
          this.solicitarRenderizado();
        } else if (tipo === 'left') {
          this.modoVista = '3D';
          this.rotacionInclinacion = 0;
          this.rotacionAzimut = -90;
          this.actualizarCuboOrientacion();
          this.solicitarRenderizado();
        } else if (tipo === 'bottom') {
          this.modoVista = '3D';
          this.rotacionInclinacion = 5;
          this.rotacionAzimut = 0;
          this.actualizarCuboOrientacion();
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

  // Actualiza la posición de la herramienta en pantalla (X, Y, Z)
  establecerPosicionHerramienta(x, y, z) {
    const dx = Math.abs(this.posicionHerramienta.x - x);
    const dy = Math.abs(this.posicionHerramienta.y - y);
    const dz = Math.abs(this.posicionHerramienta.z - z);

    if (dx < 0.001 && dy < 0.001 && dz < 0.001) {
      return;
    }

    this.posicionHerramienta.x = x;
    this.posicionHerramienta.y = y;
    this.posicionHerramienta.z = z;

    const indicadorX = document.getElementById('v-tool-x');
    const indicadorY = document.getElementById('v-tool-y');
    const indicadorZ = document.getElementById('v-tool-z');
    if (indicadorX) indicadorX.textContent = x.toFixed(1);
    if (indicadorY) indicadorY.textContent = y.toFixed(1);
    if (indicadorZ) indicadorZ.textContent = z.toFixed(1);

    this.solicitarRenderizado();
  }

  // Conversión y proyección espacial 2D y 3D (+Z siempre apunta hacia ARRIBA)
  convertirAPantalla(x, y, z = 0) {
    const escala = 1.65 * this.zoom;
    const cx = this.centroPieza ? this.centroPieza.x : 150;
    const cy = this.centroPieza ? this.centroPieza.y : 150;
    const cz = this.centroPieza ? this.centroPieza.z : 0;

    const centroPantallaX = (this.anchoPantalla / 2) + this.desplazamientoX;
    const centroPantallaY = (this.altoPantalla / 2) + this.desplazamientoY;

    if (this.modoVista === 'XY') {
      // Plano 2D superior exacto (XY)
      return {
        x: centroPantallaX + (x - cx) * escala,
        y: centroPantallaY - (y - cy) * escala,
        zProf: z
      };
    } else if (this.modoVista === 'XZ') {
      // Plano 2D frontal (Eje Z vs Eje X, +Z hacia arriba)
      return {
        x: centroPantallaX + (x - cx) * escala,
        y: centroPantallaY - ((z - cz) * this.escalaZ * 2.2) * escala,
        zProf: y
      };
    } else if (this.modoVista === 'YZ') {
      // Plano 2D lateral (Eje Z vs Eje Y, +Z hacia arriba)
      return {
        x: centroPantallaX + (y - cy) * escala,
        y: centroPantallaY - ((z - cz) * this.escalaZ * 2.2) * escala,
        zProf: x
      };
    } else {
      // Modo 3D espacial correcto:
      // X = horizontal, Y = fondo, Z = altura (+Z hacia arriba)
      const dx = (x - cx);
      const dy = (y - cy);
      const dz = (z - cz) * this.escalaZ;

      const radAzimut = (this.rotacionAzimut * Math.PI) / 180;
      const radInclinacion = (this.rotacionInclinacion * Math.PI) / 180;

      // 1. Rotación horizontal alrededor del eje vertical Z (Azimut / Yaw)
      const cosA = Math.cos(radAzimut);
      const sinA = Math.sin(radAzimut);
      const xr = dx * cosA - dy * sinA;
      const yr = dx * sinA + dy * cosA;
      const zr = dz;

      // 2. Inclinación de la cámara sobre el plano de la mesa (0° = horizontal, 90° = vertical)
      const sinI = Math.sin(radInclinacion);
      const cosI = Math.cos(radInclinacion);

      // Eje horizontal de pantalla (X hacia la derecha)
      const xPantalla = xr;
      // Eje vertical en pantalla: +Z sube físicamente hacia arriba (+zr * cosI)
      // y la profundidad +yr se proyecta hacia el fondo superior (+yr * sinI)
      const yPantalla = yr * sinI + zr * cosI;
      const zProfundidad = yr * cosI - zr * sinI;

      return {
        x: centroPantallaX + xPantalla * escala,
        y: centroPantallaY - yPantalla * escala,
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
    let modoMovimiento = 'G0';
    const nuevaTrayectoria = [];

    let minCorteX = Infinity, maxCorteX = -Infinity;
    let minCorteY = Infinity, maxCorteY = -Infinity;
    let minCorteZ = Infinity, maxCorteZ = -Infinity;

    for (let rawLinea of lineas) {
      const linea = rawLinea.replace(/\(.*?\)/g, '').split(';')[0].trim().toUpperCase();
      if (!linea) continue;

      if (/\bG90\b/.test(linea)) modoAbsoluto = true;
      if (/\bG91\b/.test(linea)) modoAbsoluto = false;

      if (/\bG00?\b/.test(linea)) modoMovimiento = 'G0';
      else if (/\bG0?1\b/.test(linea)) modoMovimiento = 'G1';
      else if (/\bG0?2\b/.test(linea)) modoMovimiento = 'G2';
      else if (/\bG0?3\b/.test(linea)) modoMovimiento = 'G3';

      const matchX = linea.match(/X([-+]?\d*\.?\d+)/);
      const matchY = linea.match(/Y([-+]?\d*\.?\d+)/);
      const matchZ = linea.match(/Z([-+]?\d*\.?\d+)/);

      let objetivoX = posX;
      let objetivoY = posY;
      let objetivoZ = posZ;
      let huboCoordenada = false;

      if (matchX) {
        const val = parseFloat(matchX[1]);
        objetivoX = modoAbsoluto ? val : posX + val;
        huboCoordenada = true;
      }
      if (matchY) {
        const val = parseFloat(matchY[1]);
        objetivoY = modoAbsoluto ? val : posY + val;
        huboCoordenada = true;
      }
      if (matchZ) {
        const val = parseFloat(matchZ[1]);
        objetivoZ = modoAbsoluto ? val : posZ + val;
        huboCoordenada = true;
      }

      if (!huboCoordenada) continue;

      const dx = objetivoX - posX;
      const dy = objetivoY - posY;
      const dz = objetivoZ - posZ;
      if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001 && Math.abs(dz) < 0.0001) {
        continue;
      }

      if (modoMovimiento === 'G2' || modoMovimiento === 'G3') {
        const matchI = linea.match(/I([-+]?\d*\.?\d+)/);
        const matchJ = linea.match(/J([-+]?\d*\.?\d+)/);
        const matchR = linea.match(/R([-+]?\d*\.?\d+)/);

        let cx = posX, cy = posY, radio = 0;
        let arcoValido = false;

        if (matchI || matchJ) {
          const i = matchI ? parseFloat(matchI[1]) : 0;
          const j = matchJ ? parseFloat(matchJ[1]) : 0;
          cx = posX + i;
          cy = posY + j;
          radio = Math.hypot(i, j);
          arcoValido = radio > 0.001;
        } else if (matchR) {
          radio = parseFloat(matchR[1]);
          const dXm = (objetivoX - posX) / 2;
          const dYm = (objetivoY - posY) / 2;
          const distMitad = Math.hypot(dXm, dYm);
          if (Math.abs(radio) >= distMitad && distMitad > 0.0001) {
            const h = Math.sqrt(Math.max(0, radio * radio - distMitad * distMitad));
            const signo = (modoMovimiento === 'G2' ? 1 : -1) * (radio < 0 ? -1 : 1);
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
              x2: arcX, y2: arcY, z2: arcZ
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
          nuevaTrayectoria.push({
            tipo: 'G1',
            x1: posX, y1: posY, z1: posZ,
            x2: objetivoX, y2: objetivoY, z2: objetivoZ
          });
          minCorteX = Math.min(minCorteX, posX, objetivoX);
          maxCorteX = Math.max(maxCorteX, posX, objetivoX);
          minCorteY = Math.min(minCorteY, posY, objetivoY);
          maxCorteY = Math.max(maxCorteY, posY, objetivoY);
          minCorteZ = Math.min(minCorteZ, posZ, objetivoZ);
          maxCorteZ = Math.max(maxCorteZ, posZ, objetivoZ);
        }
      } else {
        const tipo = modoMovimiento === 'G0' ? 'G0' : 'G1';
        nuevaTrayectoria.push({
          tipo,
          x1: posX, y1: posY, z1: posZ,
          x2: objetivoX, y2: objetivoY, z2: objetivoZ
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

    this.trayectoria = nuevaTrayectoria;
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

    this.solicitarRenderizado();
  }

  // Establece directamente los segmentos vectoriales
  establecerSegmentosTrayectoria(segmentos, envolvente = null) {
    if (Array.isArray(segmentos) && segmentos.length > 0) {
      this.trayectoria = segmentos;
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
      this.solicitarRenderizado();
    }
  }

  // Dibujado principal de la escena
  renderizar() {
    if (!this.contexto || !this.anchoPantalla) return;
    const ctx = this.contexto;

    // Fondo aeroespacial oscuro
    ctx.fillStyle = '#0a0c0e';
    ctx.fillRect(0, 0, this.anchoPantalla, this.altoPantalla);

    this.dibujarMesaMaquina(ctx);
    this.dibujarCuadricula(ctx);
    this.dibujarMaterial(ctx);
    this.dibujarTrayectorias(ctx);
    this.dibujarOrigenWCS(ctx);
    this.dibujarRetículaHerramienta(ctx);
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
      for (let x = inicioSecX; x <= finSecX; x += secundario) {
        const px = centroPantallaX + (x - cx) * escala;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, this.altoPantalla);
      }
      const inicioSecY = Math.floor(yMin / secundario) * secundario;
      const finSecY = Math.ceil(yMax / secundario) * secundario;
      for (let y = inicioSecY; y <= finSecY; y += secundario) {
        const py = centroPantallaY - (y - cy) * escala;
        ctx.moveTo(0, py);
        ctx.lineTo(this.anchoPantalla, py);
      }
      ctx.stroke();

      // 2. Líneas principales
      ctx.strokeStyle = '#1b232e';
      ctx.beginPath();
      for (let x = inicioX; x <= finX; x += principal) {
        const px = centroPantallaX + (x - cx) * escala;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, this.altoPantalla);
      }
      for (let y = inicioY; y <= finY; y += principal) {
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
      for (let x = inicioX; x <= finX; x += principal) {
        const px = centroPantallaX + (x - cx) * escala;
        if (px >= 20 && px <= this.anchoPantalla - 40) {
          ctx.fillText(`${x.toFixed(formatoCota)} mm`, px + 4, this.altoPantalla - 50);
        }
      }
      for (let y = inicioY; y <= finY; y += principal) {
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
      for (let x = inicioX; x <= finX; x += principal) {
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
        // Rejilla 3D adaptativa sobre el plano Z = 0
        const limites = this.limitesMaterial || { minX: 0, maxX: 300, minY: 0, maxY: 250 };
        const margen = Math.max(15, 35 / escala);
        const minX = Math.floor((limites.minX - margen) / principal) * principal;
        const maxX = Math.ceil((limites.maxX + margen) / principal) * principal;
        const minY = Math.floor((limites.minY - margen) / principal) * principal;
        const maxY = Math.ceil((limites.maxY + margen) / principal) * principal;

        ctx.strokeStyle = '#141a22';
        ctx.beginPath();
        const lineasMaximas = 60;
        const pasoReal = (maxX - minX) / principal > lineasMaximas ? principal * 2 : principal;
        for (let x = minX; x <= maxX; x += pasoReal) {
          const p1 = this.convertirAPantalla(x, minY, 0);
          const p2 = this.convertirAPantalla(x, maxY, 0);
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
        }
        for (let y = minY; y <= maxY; y += pasoReal) {
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
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(origen.x, origen.y);
      ctx.lineTo(pX.x, pX.y);
      ctx.stroke();
      ctx.fillStyle = '#ff3b30';
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
      ctx.fillRect(p1.x, p2.y, ancho, alto);
      ctx.strokeRect(p1.x, p2.y, ancho, alto);
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
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.lineTo(c4.x, c4.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Aristas de profundidad hacia abajo (corte negativo minZ)
      const b1 = this.convertirAPantalla(limites.minX, limites.minY, minZ);
      const b2 = this.convertirAPantalla(limites.maxX, limites.minY, minZ);
      const b3 = this.convertirAPantalla(limites.maxX, limites.maxY, minZ);
      const b4 = this.convertirAPantalla(limites.minX, limites.maxY, minZ);

      ctx.strokeStyle = 'rgba(46, 204, 113, 0.18)';
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y); ctx.lineTo(b1.x, b1.y);
      ctx.moveTo(c2.x, c2.y); ctx.lineTo(b2.x, b2.y);
      ctx.moveTo(c3.x, c3.y); ctx.lineTo(b3.x, b3.y);
      ctx.moveTo(c4.x, c4.y); ctx.lineTo(b4.x, b4.y);

      ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(b3.x, b3.y); ctx.lineTo(b4.x, b4.y);
      ctx.closePath();
      ctx.stroke();

      ctx.restore();
    }
  }

  // Trazado de trayectorias en alta velocidad a 60 FPS con detalle adaptativo a máximo zoom
  dibujarTrayectorias(ctx) {
    if (!this.trayectoria || this.trayectoria.length === 0) return;
    ctx.save();

    // 1. Trazado rápido G0 (líneas discontinuas grises elevadas) en un único batch
    ctx.strokeStyle = '#738090';
    ctx.lineWidth = Math.min(2.5, Math.max(1.0, 1.2 * Math.pow(this.zoom, 0.1)));
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    let hayG0 = false;
    for (let i = 0; i < this.trayectoria.length; i++) {
      const seg = this.trayectoria[i];
      if (seg.tipo === 'G0') {
        const p1 = this.convertirAPantalla(seg.x1, seg.y1, seg.z1);
        const p2 = this.convertirAPantalla(seg.x2, seg.y2, seg.z2);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        hayG0 = true;
      }
    }
    if (hayG0) ctx.stroke();

    // 2. Líneas verticales indicadoras de descenso de fresa (plunges) en 3D
    if (this.modoVista === '3D' && this.trayectoria.length < 3000) {
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      for (let i = 0; i < this.trayectoria.length; i++) {
        const seg = this.trayectoria[i];
        if (seg.tipo !== 'G0' && Math.abs(seg.z2 - seg.z1) > 0.05 && seg.z2 < 0) {
          const pTop = this.convertirAPantalla(seg.x2, seg.y2, 0);
          const pBot = this.convertirAPantalla(seg.x2, seg.y2, seg.z2);
          ctx.moveTo(pTop.x, pTop.y);
          ctx.lineTo(pBot.x, pBot.y);
        }
      }
      ctx.stroke();
    }

    // 3. Trayectorias de corte G1/G2/G3
    ctx.lineWidth = Math.min(3.2, Math.max(1.4, 1.8 * Math.pow(this.zoom, 0.12)));
    ctx.setLineDash([]);

    const maxX = this.limitesMaquina.maxX;
    const maxY = this.limitesMaquina.maxY;

    // 3a. Segmentos DENTRO de los límites de la máquina (Cian de corte normal)
    ctx.strokeStyle = '#00e5ff';
    if (this.trayectoria.length < 1200 && this.zoom < 10) {
      ctx.shadowColor = 'rgba(0, 229, 255, 0.45)';
      ctx.shadowBlur = 4;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.beginPath();
    let hayG1Dentro = false;
    for (let i = 0; i < this.trayectoria.length; i++) {
      const seg = this.trayectoria[i];
      if (seg.tipo !== 'G0') {
        const esOOB = (seg.x1 < 0 || seg.x1 > maxX || seg.x2 < 0 || seg.x2 > maxX ||
                       seg.y1 < 0 || seg.y1 > maxY || seg.y2 < 0 || seg.y2 > maxY);
        if (!esOOB) {
          const p1 = this.convertirAPantalla(seg.x1, seg.y1, seg.z1);
          const p2 = this.convertirAPantalla(seg.x2, seg.y2, seg.z2);
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          hayG1Dentro = true;
        }
      }
    }
    if (hayG1Dentro) ctx.stroke();

    // 3b. Segmentos FUERA de los límites de la máquina (Rojo de advertencia con resplandor)
    ctx.strokeStyle = '#ff3b30';
    ctx.shadowColor = 'rgba(255, 59, 48, 0.7)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    let hayG1OOB = false;
    for (let i = 0; i < this.trayectoria.length; i++) {
      const seg = this.trayectoria[i];
      if (seg.tipo !== 'G0') {
        const esOOB = (seg.x1 < 0 || seg.x1 > maxX || seg.x2 < 0 || seg.x2 > maxX ||
                       seg.y1 < 0 || seg.y1 > maxY || seg.y2 < 0 || seg.y2 > maxY);
        if (esOOB) {
          const p1 = this.convertirAPantalla(seg.x1, seg.y1, seg.z1);
          const p2 = this.convertirAPantalla(seg.x2, seg.y2, seg.z2);
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          hayG1OOB = true;
        }
      }
    }
    if (hayG1OOB) ctx.stroke();
    ctx.shadowBlur = 0;

    // 4. Si el usuario hace zoom a fondo (> 1200%), dibujar nodos/vértices G-code con culling ultra-rápido
    if (this.zoom > 12.0 && this.trayectoria.length < 25000) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const radioNodo = Math.min(3.0, Math.max(1.2, Math.sqrt(this.zoom / 14)));
      for (let i = 0; i < this.trayectoria.length; i++) {
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

  // Retícula indicadora y silueta cilíndrica de fresa en 3D proporcionada en zoom profundo
  dibujarRetículaHerramienta(ctx) {
    const pos = this.convertirAPantalla(this.posicionHerramienta.x, this.posicionHerramienta.y, this.posicionHerramienta.z);
    ctx.save();

    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = '#ffb703';
    ctx.shadowBlur = 6;

    const tamCruz = 12;
    ctx.beginPath();
    ctx.moveTo(pos.x - tamCruz, pos.y);
    ctx.lineTo(pos.x + tamCruz, pos.y);
    ctx.moveTo(pos.x, pos.y - tamCruz);
    ctx.lineTo(pos.x, pos.y + tamCruz);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
    ctx.stroke();

    // Silueta 3D de la fresa cilíndrica extendiéndose hacia ARRIBA (+Z)
    if (this.modoVista === '3D') {
      const posArribaReal = this.convertirAPantalla(this.posicionHerramienta.x, this.posicionHerramienta.y, this.posicionHerramienta.z + 20);
      const distPx = Math.abs(pos.y - posArribaReal.y);
      const distPxLimitada = Math.min(80, Math.max(25, distPx));
      const posArriba = {
        x: posArribaReal.x,
        y: pos.y - distPxLimitada
      };

      ctx.strokeStyle = '#ffb703';
      ctx.fillStyle = 'rgba(255, 183, 3, 0.35)';
      ctx.lineWidth = 2;

      // Vástago de la herramienta desde la punta hacia arriba
      ctx.beginPath();
      ctx.moveTo(pos.x - 4, pos.y);
      ctx.lineTo(posArriba.x - 4, posArriba.y);
      ctx.lineTo(posArriba.x + 4, posArriba.y);
      ctx.lineTo(pos.x + 4, pos.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cuello portaherramientas (pinza)
      ctx.fillStyle = 'rgba(200, 210, 225, 0.7)';
      ctx.beginPath();
      ctx.rect(posArriba.x - 7, posArriba.y - 8, 14, 8);
      ctx.fill();
    }

    ctx.restore();
  }

  // Alternar visibilidad de la cuadrícula milimétrica / 3D
  alternarCuadricula() {
    this.mostrarCuadricula = !this.mostrarCuadricula;
    this.solicitarRenderizado();
    return this.mostrarCuadricula;
  }

  // Limpiar la trayectoria gráfica en el lienzo
  limpiarTrayectoria() {
    this.trayectoria = [];
    this.envolventePieza = null;
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
      ctx.fillRect(p0.x, pMax.y, ancho, alto);

      // 2. Borde perimetral de la mesa
      ctx.lineWidth = hayDesb ? 2.5 : 1.5;
      ctx.strokeStyle = hayDesb ? 'rgba(255, 59, 48, 0.95)' : 'rgba(0, 229, 255, 0.7)';
      if (hayDesb) {
        ctx.shadowColor = 'rgba(255, 59, 48, 0.5)';
        ctx.shadowBlur = 8;
      } else {
        ctx.shadowColor = 'rgba(0, 229, 255, 0.25)';
        ctx.shadowBlur = 4;
      }
      ctx.strokeRect(p0.x, pMax.y, ancho, alto);
      ctx.shadowBlur = 0;

      // 3. Marcas de escuadra técnica en las 4 esquinas de la mesa
      const tamBracket = Math.min(16, Math.max(6, 12 * Math.sqrt(this.zoom)));
      ctx.strokeStyle = hayDesb ? '#ff453a' : '#00e5ff';
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

      // 4. Rótulo de la Mesa
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillStyle = hayDesb ? '#ff858d' : '#4dd2ff';
      ctx.fillText(`MESA CNC [${maxX} × ${maxY} mm]`, p0.x + 6, pMax.y - 6);

    } else if (this.modoVista === 'XZ') {
      const p0 = this.convertirAPantalla(0, 0, 0);
      const pMax = this.convertirAPantalla(maxX, 0, -maxZ);
      const ancho = pMax.x - p0.x;
      const alto = pMax.y - p0.y;

      ctx.fillStyle = 'rgba(12, 17, 24, 0.65)';
      ctx.fillRect(p0.x, p0.y, ancho, alto);

      ctx.lineWidth = hayDesb ? 2.5 : 1.5;
      ctx.strokeStyle = hayDesb ? 'rgba(255, 59, 48, 0.95)' : 'rgba(0, 229, 255, 0.7)';
      ctx.strokeRect(p0.x, p0.y, ancho, alto);

      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillStyle = hayDesb ? '#ff858d' : '#4dd2ff';
      ctx.fillText(`VOLUMEN XZ [X: ${maxX} mm | Z: ${maxZ} mm]`, p0.x + 6, p0.y - 6);

    } else {
      // Modo 3D Isométrico
      const c1 = this.convertirAPantalla(0, 0, 0);
      const c2 = this.convertirAPantalla(maxX, 0, 0);
      const c3 = this.convertirAPantalla(maxX, maxY, 0);
      const c4 = this.convertirAPantalla(0, maxY, 0);

      // Superficie de la mesa física sobre el plano Z = 0
      ctx.fillStyle = 'rgba(14, 20, 28, 0.75)';
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.lineTo(c4.x, c4.y);
      ctx.closePath();
      ctx.fill();

      // Perímetro de la mesa
      ctx.lineWidth = hayDesb ? 2.5 : 1.5;
      ctx.strokeStyle = hayDesb ? 'rgba(255, 59, 48, 0.95)' : 'rgba(0, 229, 255, 0.75)';
      if (hayDesb) {
        ctx.shadowColor = 'rgba(255, 59, 48, 0.6)';
        ctx.shadowBlur = 8;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Postes verticales y volumen de recorrido útil en Z
      const b1 = this.convertirAPantalla(0, 0, -maxZ);
      const b2 = this.convertirAPantalla(maxX, 0, -maxZ);
      const b3 = this.convertirAPantalla(maxX, maxY, -maxZ);
      const b4 = this.convertirAPantalla(0, maxY, -maxZ);

      ctx.strokeStyle = hayDesb ? 'rgba(255, 59, 48, 0.35)' : 'rgba(0, 229, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y); ctx.lineTo(b1.x, b1.y);
      ctx.moveTo(c2.x, c2.y); ctx.lineTo(b2.x, b2.y);
      ctx.moveTo(c3.x, c3.y); ctx.lineTo(b3.x, b3.y);
      ctx.moveTo(c4.x, c4.y); ctx.lineTo(b4.x, b4.y);
      ctx.moveTo(b1.x, b1.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(b3.x, b3.y);
      ctx.lineTo(b4.x, b4.y);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillStyle = hayDesb ? '#ff858d' : '#4dd2ff';
      ctx.fillText(`MESA [${maxX}×${maxY}×${maxZ}mm]`, c1.x + 8, c1.y - 8);
    }

    ctx.restore();
  }

  // Superposición visual de alerta sobre el lienzo cuando el modelo desborda
  dibujarAlertaLimitesOverlay(ctx) {
    if (!this.estadoLimites.hayDesbordamiento) return;

    ctx.save();
    const texto = `⚠️ ALERTA: MODELO FUERA DEL ÁREA CNC (${this.limitesMaquina.maxX}×${this.limitesMaquina.maxY}mm)`;
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    const anchoTexto = ctx.measureText(texto).width;

    const x = 12;
    const y = 48;
    const w = anchoTexto + 20;
    const h = 26;

    ctx.fillStyle = 'rgba(38, 12, 16, 0.94)';
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(255, 59, 48, 0.45)';
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff453a';
    ctx.fillText(texto, x + 10, y + 17);
    ctx.restore();
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
