/**
 * CNC Basic v1.0 - Motor Gráfico del Visualizador 2D/3D (visualizer.js)
 * Renderizado en Canvas para trayectorias de herramienta, plano cartesiano y origen de pieza.
 */

class VisualizadorCNC {
  constructor(idLienzo) {
    this.lienzo = document.getElementById(idLienzo);
    if (!this.lienzo) return;
    this.contexto = this.lienzo.getContext('2d');

    // Parámetros de la cámara y proyección
    this.modoVista = 'XY'; // Opciones: 'XY', 'XZ', '3D'
    this.zoom = 1.0;
    this.desplazamientoX = 70;
    this.desplazamientoY = -30;
    this.estaArrastrando = false;
    this.arrastreInicioX = 0;
    this.arrastreInicioY = 0;

    // Posición espacial actual de la herramienta (en milímetros)
    this.posicionHerramienta = { x: 0.000, y: 0.000, z: 0.000 };

    // Segmentos de trayectoria { tipo: 'G0'|'G1', x1, y1, z1, x2, y2, z2 }
    this.trayectoria = [];
    this.cargarTrayectoriaEjemplo();

    // Configuración de la rejilla milimétrica
    this.pasoCuadricula = 50; // mm por división principal
    this.coordenadaMaxX = 350;
    this.coordenadaMaxY = 280;

    this.redibujadoPendiente = false;
    this.iniciarEventos();
    this.redimensionarLienzo();
    window.addEventListener('resize', () => this.redimensionarLienzo());
  }

  // Solicita redibujado sincronizado con la tasa de refresco del monitor (60 FPS / vsync)
  solicitarRenderizado() {
    // Si hay un modal visible, no redibujar el canvas en segundo plano para evitar colisiones GPU y parpadeos
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

  // Control de interacción de ratón (paneo y zoom)
  iniciarEventos() {
    this.lienzo.addEventListener('mousedown', (evento) => {
      this.estaArrastrando = true;
      this.arrastreInicioX = evento.clientX - this.desplazamientoX;
      this.arrastreInicioY = evento.clientY - this.desplazamientoY;
      this.lienzo.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (evento) => {
      if (!this.estaArrastrando) return;
      this.desplazamientoX = evento.clientX - this.arrastreInicioX;
      this.desplazamientoY = evento.clientY - this.arrastreInicioY;
      this.solicitarRenderizado();
    });

    window.addEventListener('mouseup', () => {
      this.estaArrastrando = false;
      this.lienzo.style.cursor = 'crosshair';
    });

    this.lienzo.addEventListener('wheel', (evento) => {
      evento.preventDefault();
      const factorZoom = evento.deltaY < 0 ? 1.12 : 0.89;
      this.zoom = Math.max(0.3, Math.min(6.0, this.zoom * factorZoom));
      this.actualizarSuperposicionZoom();
      this.solicitarRenderizado();
    }, { passive: false });
  }

  establecerZoom(delta) {
    this.zoom = Math.max(0.3, Math.min(6.0, this.zoom + delta));
    this.actualizarSuperposicionZoom();
    this.solicitarRenderizado();
  }

  reiniciarVista() {
    this.zoom = 1.0;
    this.desplazamientoX = 70;
    this.desplazamientoY = -30;
    this.actualizarSuperposicionZoom();
    this.solicitarRenderizado();
  }

  establecerModoVista(modo) {
    this.modoVista = modo;
    const etiquetaModo = document.getElementById('lbl-view-mode');
    if (etiquetaModo) etiquetaModo.textContent = modo;
    this.solicitarRenderizado();
  }

  actualizarSuperposicionZoom() {
    const etiquetaZoom = document.getElementById('lbl-view-zoom');
    if (etiquetaZoom) etiquetaZoom.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  // Actualiza la posición de la herramienta y sus indicadores en pantalla
  establecerPosicionHerramienta(x, y, z) {
    const dx = Math.abs(this.posicionHerramienta.x - x);
    const dy = Math.abs(this.posicionHerramienta.y - y);
    const dz = Math.abs(this.posicionHerramienta.z - z);

    // Evita redibujados innecesarios si la herramienta no se ha desplazado
    if (dx < 0.001 && dy < 0.001 && dz < 0.001) {
      return;
    }

    this.posicionHerramienta.x = x;
    this.posicionHerramienta.y = y;
    this.posicionHerramienta.z = z;

    const indicadorX = document.getElementById('v-tool-x');
    const indicadorY = document.getElementById('v-tool-y');
    if (indicadorX) indicadorX.textContent = x.toFixed(1);
    if (indicadorY) indicadorY.textContent = y.toFixed(1);

    this.solicitarRenderizado();
  }

  // Conversión de coordenadas de la máquina (mm) a coordenadas de pantalla (píxeles)
  convertirAPantalla(x, y, z = 0) {
    const escala = 1.65 * this.zoom;
    const origenX = 60 + this.desplazamientoX;
    const origenY = (this.altoPantalla - 50) + this.desplazamientoY;

    if (this.modoVista === 'XY') {
      return {
        x: origenX + x * escala,
        y: origenY - y * escala
      };
    } else if (this.modoVista === 'XZ') {
      return {
        x: origenX + x * escala,
        y: origenY - (z + 40) * escala * 2.5
      };
    } else {
      // Proyección isométrica tridimensional
      const isometricoX = (x - y) * Math.cos(Math.PI / 6);
      const isometricoY = (x + y) * Math.sin(Math.PI / 6) - (z * 1.5);
      return {
        x: origenX + 180 + isometricoX * escala * 0.9,
        y: origenY - 140 + isometricoY * escala * 0.9
      };
    }
  }

  // Trayectoria demostrativa correspondiente a la pieza de prueba
  cargarTrayectoriaEjemplo() {
    this.trayectoria = [
      { tipo: 'G0', x1: 0, y1: 0, z1: 5, x2: 40, y2: 30, z2: 5 },
      { tipo: 'G1', x1: 40, y1: 30, z1: -1, x2: 240, y2: 30, z2: -1 },
      { tipo: 'G1', x1: 240, y1: 30, z1: -1, x2: 240, y2: 180, z2: -1 },
      { tipo: 'G1', x1: 240, y1: 180, z1: -1, x2: 190, y2: 180, z2: -1 },
      { tipo: 'G1', x1: 190, y1: 180, z1: -1, x2: 190, y2: 130, z2: -1 },
      { tipo: 'G1', x1: 190, y1: 130, z1: -1, x2: 40, y2: 130, z2: -1 },
      { tipo: 'G1', x1: 40, y1: 130, z1: -1, x2: 40, y2: 30, z2: -1 },
      { tipo: 'G0', x1: 40, y1: 30, z1: 5, x2: 110, y2: 70, z2: 5 },
      { tipo: 'G1', x1: 110, y1: 70, z1: -1, x2: 170, y2: 70, z2: -1 },
      { tipo: 'G1', x1: 170, y1: 70, z1: -1, x2: 170, y2: 140, z2: -1 },
      { tipo: 'G1', x1: 170, y1: 140, z1: -1, x2: 110, y2: 140, z2: -1 },
      { tipo: 'G1', x1: 110, y1: 140, z1: -1, x2: 110, y2: 70, z2: -1 },
      { tipo: 'G0', x1: 110, y1: 70, z1: 5, x2: 266.7, y2: 224.5, z2: 5 }
    ];
  }

  // Dibujado del conjunto gráfico completo
  renderizar() {
    if (!this.contexto || !this.anchoPantalla) return;
    const ctx = this.contexto;

    // Fondo oscuro principal
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
    } else {
      // Rejilla de perspectiva isométrica
      ctx.strokeStyle = '#141920';
      for (let x = 0; x <= 300; x += 50) {
        const p1 = this.convertirAPantalla(x, 0, 0);
        const p2 = this.convertirAPantalla(x, 250, 0);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      for (let y = 0; y <= 250; y += 50) {
        const p1 = this.convertirAPantalla(0, y, 0);
        const p2 = this.convertirAPantalla(300, y, 0);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // Representa el bloque de material a mecanizar (área verde tenue)
  dibujarMaterial(ctx) {
    if (this.modoVista !== 'XY') return;
    const p1 = this.convertirAPantalla(35, 25);
    const p2 = this.convertirAPantalla(255, 195);
    const ancho = p2.x - p1.x;
    const alto = p1.y - p2.y;

    ctx.save();
    ctx.fillStyle = 'rgba(16, 42, 28, 0.22)';
    ctx.strokeStyle = 'rgba(46, 204, 113, 0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fillRect(p1.x, p2.y, ancho, alto);
    ctx.strokeRect(p1.x, p2.y, ancho, alto);
    ctx.restore();
  }

  // Líneas continuas para corte y discontinuas para movimiento en vacío
  dibujarTrayectorias(ctx) {
    ctx.save();
    for (const segmento of this.trayectoria) {
      const inicio = this.convertirAPantalla(segmento.x1, segmento.y1, segmento.z1);
      const fin = this.convertirAPantalla(segmento.x2, segmento.y2, segmento.z2);

      ctx.beginPath();
      ctx.moveTo(inicio.x, inicio.y);
      ctx.lineTo(fin.x, fin.y);

      if (segmento.tipo === 'G0') {
        // Desplazamiento rápido sin corte
        ctx.strokeStyle = '#6e7a88';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
      } else {
        // Avance de corte
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([]);
        ctx.shadowColor = 'rgba(0, 229, 255, 0.4)';
        ctx.shadowBlur = 4;
        ctx.stroke();
      }
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

  // Retícula indicadora de la posición actual del cabezal
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

    // Silueta de fresa en vista isométrica
    if (this.modoVista === '3D') {
      ctx.fillStyle = 'rgba(255, 183, 3, 0.25)';
      ctx.beginPath();
      ctx.moveTo(pos.x - 5, pos.y - 25);
      ctx.lineTo(pos.x + 5, pos.y - 25);
      ctx.lineTo(pos.x, pos.y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  // Métodos puente para compatibilidad
  setToolPosition(x, y, z) { this.establecerPosicionHerramienta(x, y, z); }
  setViewMode(modo) { this.establecerModoVista(modo); }
  setZoom(delta) { this.establecerZoom(delta); }
  resetView() { this.reiniciarVista(); }
  render() { this.solicitarRenderizado(); }
}

// Compatibilidad de alias global
window.VisualizadorCNC = VisualizadorCNC;
window.CNCVisualizer = VisualizadorCNC;
window.visualizadorCNC = null;
window.cncVisualizer = null;
