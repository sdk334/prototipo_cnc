/**
 * CNC Basic v1.0 - Motor Gráfico del Visualizador 2D/3D (visualizer.js)
 * Renderizado en Canvas para trayectorias de herramienta, plano cartesiano,
 * cubo de navegación interactivo (ViewCube 3D) y realce de profundidad en el eje Z.
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

    // Ángulos de cámara 3D para órbita continua (en grados)
    this.rotacionPitch = 55; // Inclinación vertical (0° = Superior XY, 90° = Frontal XZ)
    this.rotacionYaw = 40;   // Rotación horizontal alrededor de Z (360°)
    this.escalaZ = 1.5;      // Factor de realce de profundidad del eje Z (1.0x, 1.5x, 2.5x, 4.0x)

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
    this.cargarTrayectoriaEjemplo();

    // Configuración de la rejilla milimétrica
    this.pasoCuadricula = 50; // mm por división principal
    this.coordenadaMaxX = 350;
    this.coordenadaMaxY = 280;

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

  // Control de interacción de ratón (órbita 3D en los 3 ejes, paneo y zoom)
  iniciarEventos() {
    // Evitar menú contextual en el lienzo para permitir paneo/órbita con clic derecho
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
          // En modo 3D: Órbita libre en los 3 ejes (X, Y, Z)
          this.tipoArrastre = 'orbit';
          this.lienzo.style.cursor = 'grabbing';
        } else {
          // En modo 2D: Paneo
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
        // Rotación 3D: Yaw (horizontal alrededor de Z) y Pitch (vertical)
        this.rotacionYaw = (this.rotacionYaw + deltaX * 0.45) % 360;
        this.rotacionPitch = Math.max(5, Math.min(88, this.rotacionPitch + deltaY * 0.45));
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

    this.lienzo.addEventListener('wheel', (evento) => {
      evento.preventDefault();
      const factorZoom = evento.deltaY < 0 ? 1.12 : 0.89;
      this.zoom = Math.max(0.2, Math.min(8.0, this.zoom * factorZoom));
      this.actualizarSuperposicionZoom();
      this.solicitarRenderizado();
    }, { passive: false });
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

      this.rotacionYaw = (this.rotacionYaw + dx * 0.8) % 360;
      this.rotacionPitch = Math.max(5, Math.min(88, this.rotacionPitch + dy * 0.8));

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
          this.rotacionPitch = 90;
          this.rotacionYaw = 180;
          this.actualizarCuboOrientacion();
          this.solicitarRenderizado();
        } else if (tipo === 'left') {
          this.modoVista = '3D';
          this.rotacionPitch = 90;
          this.rotacionYaw = 270;
          this.actualizarCuboOrientacion();
          this.solicitarRenderizado();
        } else if (tipo === 'bottom') {
          this.modoVista = '3D';
          this.rotacionPitch = 5;
          this.rotacionYaw = 0;
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

  // Sincroniza la rotación CSS 3D del cubo con la orientación actual de la cámara
  actualizarCuboOrientacion() {
    const cube = document.getElementById('viewcube-cube');
    if (!cube) return;

    if (this.modoVista === 'XY') {
      cube.style.transform = 'rotateX(-90deg) rotateZ(0deg)';
    } else if (this.modoVista === 'XZ') {
      cube.style.transform = 'rotateX(0deg) rotateY(0deg)';
    } else if (this.modoVista === 'YZ') {
      cube.style.transform = 'rotateX(0deg) rotateY(-90deg)';
    } else {
      const pitchCSS = this.rotacionPitch - 90;
      const yawCSS = -this.rotacionYaw;
      cube.style.transform = `rotateX(${pitchCSS}deg) rotateZ(${yawCSS}deg)`;
    }

    const btnIso = document.getElementById('vc-btn-iso');
    const btnXy = document.getElementById('vc-btn-xy');
    const btnXz = document.getElementById('vc-btn-xz');
    if (btnIso) btnIso.classList.toggle('active', this.modoVista === '3D');
    if (btnXy) btnXy.classList.toggle('active', this.modoVista === 'XY');
    if (btnXz) btnXz.classList.toggle('active', this.modoVista === 'XZ');
  }

  establecerZoom(delta) {
    this.zoom = Math.max(0.2, Math.min(8.0, this.zoom + delta));
    this.actualizarSuperposicionZoom();
    this.solicitarRenderizado();
  }

  reiniciarVista() {
    if (this.limitesMaterial && this.limitesMaterial.maxX > this.limitesMaterial.minX) {
      this.ajustarVistaAPieza();
    } else {
      this.zoom = 1.0;
      this.desplazamientoX = -35;
      this.desplazamientoY = 15;
      this.actualizarSuperposicionZoom();
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

    this.zoom = Math.max(0.4, Math.min(5.0, escalaOptima / 1.65));
    this.desplazamientoX = -35;
    this.desplazamientoY = 15;

    this.actualizarSuperposicionZoom();
    this.actualizarCuboOrientacion();
    this.solicitarRenderizado();
  }

  establecerModoVista(modo) {
    this.modoVista = modo;
    if (modo === 'XY') {
      this.rotacionPitch = 0;
      this.rotacionYaw = 0;
    } else if (modo === 'XZ') {
      this.rotacionPitch = 90;
      this.rotacionYaw = 0;
    } else if (modo === 'YZ') {
      this.rotacionPitch = 90;
      this.rotacionYaw = 90;
    } else if (modo === '3D') {
      this.rotacionPitch = 55;
      this.rotacionYaw = 40;
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
    if (etiquetaZoom) etiquetaZoom.textContent = `${Math.round(this.zoom * 100)}%`;
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

  // Conversión y proyección espacial 2D y 3D con órbita continua
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
      // Plano 2D frontal (Eje Z vs Eje X)
      return {
        x: centroPantallaX + (x - cx) * escala,
        y: centroPantallaY - ((z - cz) * this.escalaZ * 2.2) * escala,
        zProf: y
      };
    } else if (this.modoVista === 'YZ') {
      // Plano 2D lateral (Eje Z vs Eje Y)
      return {
        x: centroPantallaX + (y - cy) * escala,
        y: centroPantallaY - ((z - cz) * this.escalaZ * 2.2) * escala,
        zProf: x
      };
    } else {
      // Modo 3D con órbita continua en Pitch y Yaw
      const dx = (x - cx);
      const dy = (y - cy);
      const dz = (z - cz) * this.escalaZ;

      const radPitch = (this.rotacionPitch * Math.PI) / 180;
      const radYaw = (this.rotacionYaw * Math.PI) / 180;

      // 1. Rotación horizontal alrededor del eje Z (Yaw)
      const cosY = Math.cos(radYaw);
      const sinY = Math.sin(radYaw);
      const xr = dx * cosY - dy * sinY;
      const yr = dx * sinY + dy * cosY;
      const zr = dz;

      // 2. Inclinación vertical (Pitch)
      const cosP = Math.cos(radPitch);
      const sinP = Math.sin(radPitch);
      const xCam = xr;
      const yCam = yr * cosP - zr * sinP;
      const zCam = yr * sinP + zr * cosP;

      return {
        x: centroPantallaX + xCam * escala,
        y: centroPantallaY - yCam * escala,
        zProf: zCam
      };
    }
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

    this.dibujarCuadricula(ctx);
    this.dibujarMaterial(ctx);
    this.dibujarTrayectorias(ctx);
    this.dibujarOrigenWCS(ctx);
    this.dibujarRetículaHerramienta(ctx);
  }

  dibujarCuadricula(ctx) {
    ctx.save();
    ctx.lineWidth = 1;

    if (this.modoVista === 'XY') {
      for (let x = 0; x <= this.coordenadaMaxX; x += this.pasoCuadricula) {
        const p1 = this.convertirAPantalla(x, 0);
        const p2 = this.convertirAPantalla(x, this.coordenadaMaxY);

        ctx.strokeStyle = (x % 100 === 0) ? '#1f252d' : '#14181e';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        if (x > 0) {
          ctx.fillStyle = '#4c5663';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(x.toString(), p1.x, p1.y + 16);
        }
      }

      for (let y = 0; y <= this.coordenadaMaxY; y += this.pasoCuadricula) {
        const p1 = this.convertirAPantalla(0, y);
        const p2 = this.convertirAPantalla(this.coordenadaMaxX, y);

        ctx.strokeStyle = (y % 100 === 0) ? '#1f252d' : '#14181e';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        if (y > 0) {
          ctx.fillStyle = '#4c5663';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'right';
          ctx.fillText(y.toString(), p1.x - 8, p1.y + 3);
        }
      }
    } else if (this.modoVista === 'XZ') {
      ctx.strokeStyle = '#181e26';
      for (let x = 0; x <= this.coordenadaMaxX; x += this.pasoCuadricula) {
        const p1 = this.convertirAPantalla(x, 0, -20);
        const p2 = this.convertirAPantalla(x, 0, 50);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      // Línea de referencia Z = 0
      const z0p1 = this.convertirAPantalla(0, 0, 0);
      const z0p2 = this.convertirAPantalla(this.coordenadaMaxX, 0, 0);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(z0p1.x, z0p1.y);
      ctx.lineTo(z0p2.x, z0p2.y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // Rejilla 3D sobre el plano Z = 0 (Superficie del material)
      ctx.strokeStyle = '#141a22';
      for (let x = 0; x <= 350; x += 50) {
        const p1 = this.convertirAPantalla(x, 0, 0);
        const p2 = this.convertirAPantalla(x, 280, 0);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      for (let y = 0; y <= 280; y += 50) {
        const p1 = this.convertirAPantalla(0, y, 0);
        const p2 = this.convertirAPantalla(350, y, 0);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }

      // Tríada tridimensional de ejes en el origen WCS (0,0,0)
      const origen = this.convertirAPantalla(0, 0, 0);
      const pX = this.convertirAPantalla(40, 0, 0);
      const pY = this.convertirAPantalla(0, 40, 0);
      const pZ = this.convertirAPantalla(0, 0, 30);

      // Eje X (Rojo)
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(origen.x, origen.y);
      ctx.lineTo(pX.x, pX.y);
      ctx.stroke();
      ctx.fillStyle = '#ff3b30';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText('+X', pX.x + 4, pX.y + 4);

      // Eje Y (Verde)
      ctx.strokeStyle = '#34c759';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(origen.x, origen.y);
      ctx.lineTo(pY.x, pY.y);
      ctx.stroke();
      ctx.fillStyle = '#34c759';
      ctx.fillText('+Y', pY.x + 4, pY.y + 4);

      // Eje Z (Azul / Cian hacia arriba)
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

      // Aristas de profundidad hasta minZ
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

  // Trazado de trayectorias en alta velocidad a 60 FPS
  dibujarTrayectorias(ctx) {
    if (!this.trayectoria || this.trayectoria.length === 0) return;
    ctx.save();

    // 1. Trazado rápido G0 (líneas discontinuas grises) en un único batch
    ctx.strokeStyle = '#738090';
    ctx.lineWidth = 1.2;
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

    // 3. Trayectorias de corte G1/G2/G3 (líneas continuas cian) en un único batch
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([]);
    if (this.trayectoria.length < 1200) {
      ctx.shadowColor = 'rgba(0, 229, 255, 0.45)';
      ctx.shadowBlur = 4;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.beginPath();
    let hayG1 = false;
    for (let i = 0; i < this.trayectoria.length; i++) {
      const seg = this.trayectoria[i];
      if (seg.tipo !== 'G0') {
        const p1 = this.convertirAPantalla(seg.x1, seg.y1, seg.z1);
        const p2 = this.convertirAPantalla(seg.x2, seg.y2, seg.z2);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        hayG1 = true;
      }
    }
    if (hayG1) ctx.stroke();

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

  // Retícula indicadora y silueta de fresa en 3D
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

    // Silueta 3D de la fresa cilíndrica a lo largo del eje Z
    if (this.modoVista === '3D') {
      const posArriba = this.convertirAPantalla(this.posicionHerramienta.x, this.posicionHerramienta.y, this.posicionHerramienta.z + 20);
      ctx.strokeStyle = '#ffb703';
      ctx.fillStyle = 'rgba(255, 183, 3, 0.35)';
      ctx.lineWidth = 2;

      // Vástago de la herramienta
      ctx.beginPath();
      ctx.moveTo(pos.x - 4, pos.y);
      ctx.lineTo(posArriba.x - 4, posArriba.y);
      ctx.lineTo(posArriba.x + 4, posArriba.y);
      ctx.lineTo(pos.x + 4, pos.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cuello portaherramientas
      ctx.fillStyle = 'rgba(200, 210, 225, 0.7)';
      ctx.beginPath();
      ctx.rect(posArriba.x - 7, posArriba.y - 8, 14, 8);
      ctx.fill();
    }

    ctx.restore();
  }

  // Métodos puente para compatibilidad
  setToolPosition(x, y, z) { this.establecerPosicionHerramienta(x, y, z); }
  setViewMode(modo) { this.establecerModoVista(modo); }
  cambiarModoVista(modo) { this.establecerModoVista(modo); }
  setZoom(delta) { this.establecerZoom(delta); }
  ajustarZoom(factor) {
    const delta = factor > 1 ? 0.2 : -0.2;
    this.establecerZoom(delta);
  }
  resetView() { this.reiniciarVista(); }
  render() { this.solicitarRenderizado(); }
  loadGCode(gcode) { this.cargarTrayectoriaDesdeGCode(gcode); }
  cargarGCode(gcode) { this.cargarTrayectoriaDesdeGCode(gcode); }
}

// Compatibilidad de alias global
window.VisualizadorCNC = VisualizadorCNC;
window.CNCVisualizer = VisualizadorCNC;
window.visualizadorCNC = null;
window.cncVisualizer = null;
