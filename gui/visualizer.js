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

    // Búfer gráfico de aceleración para la escena estática (mesa, cuadrícula, trayectorias)
    // Garantiza 60 FPS fijos sin caídas de fotogramas durante la animación o corte de la herramienta
    this.lienzoEstatico = document.createElement('canvas');
    this.contextoEstatico = this.lienzoEstatico.getContext('2d');
    this.necesitaRedibujarEstatico = true;

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
    this.actualizarMatrizProyeccion();
  }

  // Ajusta el lienzo a la resolución del dispositivo para máxima nitidez
  redimensionarLienzo() {
    const rectangulo = this.lienzo.parentElement.getBoundingClientRect();
    const proporcionPixeles = window.devicePixelRatio || 1;

    const anchoDevice = Math.max(1, Math.round(rectangulo.width * proporcionPixeles));
    const altoDevice = Math.max(1, Math.round(rectangulo.height * proporcionPixeles));

    this.lienzo.width = anchoDevice;
    this.lienzo.height = altoDevice;
    this.contexto.setTransform(proporcionPixeles, 0, 0, proporcionPixeles, 0, 0);

    if (!this.lienzoEstatico) {
      this.lienzoEstatico = document.createElement('canvas');
      this.contextoEstatico = this.lienzoEstatico.getContext('2d');
    }
    this.lienzoEstatico.width = anchoDevice;
    this.lienzoEstatico.height = altoDevice;
    this.contextoEstatico.setTransform(proporcionPixeles, 0, 0, proporcionPixeles, 0, 0);

    this.anchoPantalla = rectangulo.width;
    this.altoPantalla = rectangulo.height;
    this.marcarEstaticoSucio();
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
      this.marcarEstaticoSucio();
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

    // Si la herramienta no está animada (máquina detenida o movimiento manual paso a paso),
    // aplicamos la posición de inmediato y solicitamos renderizado estático
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

    this.marcarEstaticoSucio();
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

    this.dibujarMesaMaquina(ctx);
    this.dibujarCuadricula(ctx);
    this.dibujarMaterial(ctx);
    this.dibujarTrayectorias(ctx);
    this.dibujarOrigenWCS(ctx);
  }

  // Dibujado principal ultra-optimizado a 60 FPS estables
  renderizar() {
    if (!this.contexto || !this.anchoPantalla) return;
    const ctx = this.contexto;

    // Medición y actualización en tiempo real de FPS reales
    const ahoraFps = performance.now();
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

    // 3. Renderizado de capas dinámicas (herramienta girando con punta fina y alertas)
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
        // Rejilla 3D sobre la superficie física de la mesa de la máquina (Z = 0)
        const minX = 0;
        const maxX = this.limitesMaquina.maxX;
        const minY = 0;
        const maxY = this.limitesMaquina.maxY;

        ctx.strokeStyle = '#18222e';
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

    const n = this.trayectoria.length;
    const maxX = this.limitesMaquina.maxX;
    const maxY = this.limitesMaquina.maxY;
    const es3D = (this.modoVista === '3D');

    // 1. Trazado rápido G0 (líneas discontinuas grises elevadas) en un único batch continuo
    ctx.strokeStyle = '#738090';
    ctx.lineWidth = Math.min(2.5, Math.max(1.0, 1.2 * Math.pow(this.zoom, 0.1)));
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    let hayG0 = false;
    let prevG0X = null, prevG0Y = null, prevG0Z = null;

    for (let i = 0; i < n; i++) {
      const seg = this.trayectoria[i];
      if (seg.tipo === 'G0') {
        const esContinuo = (prevG0X === seg.x1 && prevG0Y === seg.y1 && prevG0Z === seg.z1);
        if (!esContinuo) {
          const p1 = this.convertirAPantalla(seg.x1, seg.y1, seg.z1);
          ctx.moveTo(p1.x, p1.y);
        }
        const p2 = this.convertirAPantalla(seg.x2, seg.y2, seg.z2);
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

    // 3. Trayectorias de corte G1/G2/G3 agrupadas con reutilización de vértices
    ctx.lineWidth = Math.min(3.2, Math.max(1.4, 1.8 * Math.pow(this.zoom, 0.12)));
    ctx.setLineDash([]);

    // 3a. Segmentos DENTRO de los límites (Cian normal de mecanizado)
    ctx.strokeStyle = '#00e5ff';
    ctx.beginPath();
    let hayG1 = false;
    let prevG1X = null, prevG1Y = null, prevG1Z = null;

    for (let i = 0; i < n; i++) {
      const seg = this.trayectoria[i];
      if (seg.tipo !== 'G0') {
        const esOOB = (seg.x1 < 0 || seg.x1 > maxX || seg.x2 < 0 || seg.x2 > maxX ||
                       seg.y1 < 0 || seg.y1 > maxY || seg.y2 < 0 || seg.y2 > maxY);
        if (!esOOB) {
          const esContinuo = (prevG1X === seg.x1 && prevG1Y === seg.y1 && prevG1Z === seg.z1);
          if (!esContinuo) {
            const p1 = this.convertirAPantalla(seg.x1, seg.y1, seg.z1);
            ctx.moveTo(p1.x, p1.y);
          }
          const p2 = this.convertirAPantalla(seg.x2, seg.y2, seg.z2);
          ctx.lineTo(p2.x, p2.y);
          prevG1X = seg.x2; prevG1Y = seg.y2; prevG1Z = seg.z2;
          hayG1 = true;
        } else {
          prevG1X = null;
        }
      } else {
        prevG1X = null;
      }
    }
    if (hayG1) ctx.stroke();

    // 3b. Segmentos FUERA de los límites (Rojo de alerta)
    ctx.strokeStyle = '#ff3b30';
    ctx.beginPath();
    let hayG1OOB = false;
    let prevOOBX = null, prevOOBY = null, prevOOBZ = null;

    for (let i = 0; i < n; i++) {
      const seg = this.trayectoria[i];
      if (seg.tipo !== 'G0') {
        const esOOB = (seg.x1 < 0 || seg.x1 > maxX || seg.x2 < 0 || seg.x2 > maxX ||
                       seg.y1 < 0 || seg.y1 > maxY || seg.y2 < 0 || seg.y2 > maxY);
        if (esOOB) {
          const esContinuo = (prevOOBX === seg.x1 && prevOOBY === seg.y1 && prevOOBZ === seg.z1);
          if (!esContinuo) {
            const p1 = this.convertirAPantalla(seg.x1, seg.y1, seg.z1);
            ctx.moveTo(p1.x, p1.y);
          }
          const p2 = this.convertirAPantalla(seg.x2, seg.y2, seg.z2);
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

    // 4. Si el usuario hace zoom a fondo (> 1200%), dibujar nodos/vértices G-code con culling ultra-rápido
    if (this.zoom > 12.0 && n < 25000) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const radioNodo = Math.min(3.0, Math.max(1.2, Math.sqrt(this.zoom / 14)));
      for (let i = 0; i < n; i++) {
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

      const dt = Math.min(50, tiempoActual - tiempoPrevio);
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
        const factorLerp = Math.min(1.0, Math.max(0.20, dt * 0.024));
        this.posicionHerramienta.x += dx * factorLerp;
        this.posicionHerramienta.y += dy * factorLerp;
        this.posicionHerramienta.z += dz * factorLerp;
        this.actualizarIndicadoresPosicionTexto(this.posicionHerramienta.x, this.posicionHerramienta.y, this.posicionHerramienta.z);
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

    const esVistaProyectada3D = distEje >= 4;

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

  // Define el tipo de herramienta activa ('fresa' o 'lapiz') y refresca el lienzo
  establecerTipoHerramienta(tipo) {
    this.tipoHerramienta = (tipo === 'lapiz') ? 'lapiz' : 'fresa';
    localStorage.setItem('cnc_tipo_herramienta', this.tipoHerramienta);
    this.solicitarRenderizado();
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
      ctx.fillRect(p0.x, pMax.y, ancho, alto);

      // 2. Borde perimetral de la mesa
      ctx.lineWidth = hayDesb ? 2.5 : 1.5;
      ctx.strokeStyle = hayDesb ? 'rgba(255, 59, 48, 0.95)' : 'rgba(0, 229, 255, 0.7)';
      ctx.strokeRect(p0.x, pMax.y, ancho, alto);

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
      const pMax = this.convertirAPantalla(maxX, 0, maxZ);
      const ancho = pMax.x - p0.x;
      const alto = p0.y - pMax.y;

      // Volumen útil de la máquina hacia arriba (+Z)
      ctx.fillStyle = 'rgba(12, 17, 24, 0.65)';
      ctx.fillRect(p0.x, pMax.y, ancho, alto);

      ctx.lineWidth = hayDesb ? 2.5 : 1.5;
      ctx.strokeStyle = hayDesb ? 'rgba(255, 59, 48, 0.95)' : 'rgba(0, 229, 255, 0.7)';
      ctx.strokeRect(p0.x, pMax.y, ancho, alto);

      // Línea sólida de la cama de la máquina en Z = 0
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(pMax.x, p0.y);
      ctx.stroke();

      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillStyle = hayDesb ? '#ff858d' : '#4dd2ff';
      ctx.fillText(`MESA XZ [X: ${maxX} mm | Recorrido Z: +${maxZ} mm]`, p0.x + 6, pMax.y - 6);

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
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.lineTo(c4.x, c4.y);
      ctx.closePath();
      ctx.fill();

      // Perímetro sólido de la mesa en Z = 0
      ctx.lineWidth = hayDesb ? 2.5 : 2.0;
      ctx.strokeStyle = hayDesb ? 'rgba(255, 59, 48, 0.95)' : 'rgba(0, 229, 255, 0.85)';
      ctx.stroke();

      // Columnas guía y volumen de trabajo que asciende hacia ARRIBA (+maxZ)
      ctx.strokeStyle = hayDesb ? 'rgba(255, 59, 48, 0.45)' : 'rgba(0, 229, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      // Aristas verticales de altura (desde la mesa Z=0 hasta el techo Z=+maxZ)
      ctx.moveTo(c1.x, c1.y); ctx.lineTo(t1.x, t1.y);
      ctx.moveTo(c2.x, c2.y); ctx.lineTo(t2.x, t2.y);
      ctx.moveTo(c3.x, c3.y); ctx.lineTo(t3.x, t3.y);
      ctx.moveTo(c4.x, c4.y); ctx.lineTo(t4.x, t4.y);
      // Marco perimetral del techo (+maxZ)
      ctx.moveTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.lineTo(t4.x, t4.y);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      // Rótulos de la mesa base y de la altura máxima Z
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillStyle = hayDesb ? '#ff858d' : '#4dd2ff';
      ctx.fillText(`MESA BASE (Z=0) [${maxX}×${maxY}mm]`, c1.x + 8, c1.y - 8);
      ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
      ctx.fillText(`Z: +${maxZ}mm`, t1.x + 8, t1.y - 8);
    }

    ctx.restore();
  }

  // Superposición visual de alerta sobre el lienzo cuando el modelo desborda (ultra-rápido sin shadowBlur)
  dibujarAlertaLimitesOverlay(ctx) {
    if (!this.estadoLimites || !this.estadoLimites.hayDesbordamiento) return;

    ctx.save();
    const texto = `⚠️ ALERTA: MODELO FUERA DEL ÁREA CNC (${this.limitesMaquina.maxX}×${this.limitesMaquina.maxY}mm)`;
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    if (!this.anchoTextoAlerta) {
      this.anchoTextoAlerta = ctx.measureText(texto).width;
    }
    const anchoTexto = this.anchoTextoAlerta;

    const x = 12;
    const y = 48;
    const w = anchoTexto + 20;
    const h = 26;

    ctx.fillStyle = 'rgba(40, 10, 14, 0.95)';
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff6b6b';
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
