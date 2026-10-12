/**
 * CNC Basic v1.0 - Renderizador Canvas 2D/3D (visualizer.js)
 * Dibuja la rejilla métrica, trayectorias G-Code, origen WCS y retícula de herramienta en tiempo real.
 */

class CNCVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // Estado de la cámara / proyección
    this.viewMode = 'XY'; // 'XY', 'XZ', '3D'
    this.zoom = 1.0;
    this.panX = 70;
    this.panY = -30;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

    // Posición actual de la herramienta (en mm)
    this.toolPos = { x: 266.715, y: 224.548, z: 0.000 };

    // Trayectoria cargada: lista de segmentos { type: 'G0'|'G1', x1, y1, z1, x2, y2, z2 }
    this.toolpath = [];
    this.loadSampleToolpath();

    // Configuración visual
    this.gridStep = 50; // mm por cuadrícula mayor
    this.maxCoordX = 350;
    this.maxCoordY = 280;

    this.initEvents();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.displayWidth = rect.width;
    this.displayHeight = rect.height;
    this.render();
  }

  initEvents() {
    // Arrastre con ratón para Paneado
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX - this.panX;
      this.dragStartY = e.clientY - this.panY;
      this.canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.panX = e.clientX - this.dragStartX;
      this.panY = e.clientY - this.dragStartY;
      this.render();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.canvas.style.cursor = 'crosshair';
    });

    // Zoom con rueda de ratón
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      this.zoom = Math.max(0.3, Math.min(6.0, this.zoom * zoomFactor));
      this.updateZoomOverlay();
      this.render();
    }, { passive: false });
  }

  setZoom(delta) {
    this.zoom = Math.max(0.3, Math.min(6.0, this.zoom + delta));
    this.updateZoomOverlay();
    this.render();
  }

  resetView() {
    this.zoom = 1.0;
    this.panX = 70;
    this.panY = -30;
    this.updateZoomOverlay();
    this.render();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    const modeLbl = document.getElementById('lbl-view-mode');
    if (modeLbl) modeLbl.textContent = mode;
    this.render();
  }

  updateZoomOverlay() {
    const zoomLbl = document.getElementById('lbl-view-zoom');
    if (zoomLbl) zoomLbl.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  setToolPosition(x, y, z) {
    this.toolPos.x = x;
    this.toolPos.y = y;
    this.toolPos.z = z;

    // Actualizar badge flotante
    const badgeX = document.getElementById('v-tool-x');
    const badgeY = document.getElementById('v-tool-y');
    if (badgeX) badgeX.textContent = x.toFixed(1);
    if (badgeY) badgeY.textContent = y.toFixed(1);

    this.render();
  }

  // Transforma coordenadas mm CNC a píxeles en canvas
  toScreen(x, y, z = 0) {
    const scale = 1.65 * this.zoom;
    const originX = 60 + this.panX;
    const originY = (this.displayHeight - 50) + this.panY;

    if (this.viewMode === 'XY') {
      return {
        x: originX + x * scale,
        y: originY - y * scale
      };
    } else if (this.viewMode === 'XZ') {
      return {
        x: originX + x * scale,
        y: originY - (z + 40) * scale * 2.5
      };
    } else {
      // 3D Isométrico
      const isoX = (x - y) * Math.cos(Math.PI / 6);
      const isoY = (x + y) * Math.sin(Math.PI / 6) - (z * 1.5);
      return {
        x: originX + 180 + isoX * scale * 0.9,
        y: originY - 140 + isoY * scale * 0.9
      };
    }
  }

  loadSampleToolpath() {
    // Genera la trayectoria idéntica a la pieza_01.nc de la imagen de referencia
    this.toolpath = [
      // Rápido al inicio
      { type: 'G0', x1: 0, y1: 0, z1: 5, x2: 40, y2: 30, z2: 5 },
      // Contorno rectangular exterior
      { type: 'G1', x1: 40, y1: 30, z1: -1, x2: 240, y2: 30, z2: -1 },
      { type: 'G1', x1: 240, y1: 30, z1: -1, x2: 240, y2: 180, z2: -1 },
      { type: 'G1', x1: 240, y1: 180, z1: -1, x2: 190, y2: 180, z2: -1 },
      { type: 'G1', x1: 190, y1: 180, z1: -1, x2: 190, y2: 130, z2: -1 },
      { type: 'G1', x1: 190, y1: 130, z1: -1, x2: 40, y2: 130, z2: -1 },
      { type: 'G1', x1: 40, y1: 130, z1: -1, x2: 40, y2: 30, z2: -1 },
      // Cajera interior
      { type: 'G0', x1: 40, y1: 30, z1: 5, x2: 110, y2: 70, z2: 5 },
      { type: 'G1', x1: 110, y1: 70, z1: -1, x2: 170, y2: 70, z2: -1 },
      { type: 'G1', x1: 170, y1: 70, z1: -1, x2: 170, y2: 140, z2: -1 },
      { type: 'G1', x1: 170, y1: 140, z1: -1, x2: 110, y2: 140, z2: -1 },
      { type: 'G1', x1: 110, y1: 140, z1: -1, x2: 110, y2: 70, z2: -1 },
      // Desplazamiento a posición final de la herramienta
      { type: 'G0', x1: 110, y1: 70, z1: 5, x2: 266.7, y2: 224.5, z2: 5 }
    ];
  }

  render() {
    if (!this.ctx || !this.displayWidth) return;
    const ctx = this.ctx;

    // Limpiar canvas con fondo muy oscuro
    ctx.fillStyle = '#0a0c0e';
    ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);

    // 1. Dibujar Rejilla Métrica
    this.drawGrid(ctx);

    // 2. Dibujar envolvente de material de trabajo (Stock verde tenue)
    this.drawStock(ctx);

    // 3. Dibujar Trayectorias G-Code
    this.drawToolpath(ctx);

    // 4. Dibujar Marcador de Origen WCS (0,0)
    this.drawOriginWCS(ctx);

    // 5. Dibujar Retícula de la Herramienta en dorado
    this.drawToolMarker(ctx);
  }

  drawGrid(ctx) {
    const scale = 1.65 * this.zoom;
    ctx.save();

    if (this.viewMode === 'XY') {
      // Líneas de la cuadrícula
      ctx.lineWidth = 1;
      for (let x = 0; x <= this.maxCoordX; x += this.gridStep) {
        const p1 = this.toScreen(x, 0);
        const p2 = this.toScreen(x, this.maxCoordY);

        ctx.strokeStyle = (x % 100 === 0) ? '#1f252d' : '#14181e';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Etiquetas numéricas de X
        if (x > 0) {
          ctx.fillStyle = '#4c5663';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(x.toString(), p1.x, p1.y + 16);
        }
      }

      for (let y = 0; y <= this.maxCoordY; y += this.gridStep) {
        const p1 = this.toScreen(0, y);
        const p2 = this.toScreen(this.maxCoordX, y);

        ctx.strokeStyle = (y % 100 === 0) ? '#1f252d' : '#14181e';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Etiquetas numéricas de Y
        if (y > 0) {
          ctx.fillStyle = '#4c5663';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'right';
          ctx.fillText(y.toString(), p1.x - 8, p1.y + 3);
        }
      }
    } else if (this.viewMode === 'XZ') {
      // Vista frontal XZ
      ctx.strokeStyle = '#181e26';
      ctx.lineWidth = 1;
      for (let x = 0; x <= this.maxCoordX; x += this.gridStep) {
        const p1 = this.toScreen(x, 0, -20);
        const p2 = this.toScreen(x, 0, 50);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    } else {
      // Rejilla isométrica 3D
      ctx.strokeStyle = '#141920';
      ctx.lineWidth = 1;
      for (let x = 0; x <= 300; x += 50) {
        const p1 = this.toScreen(x, 0, 0);
        const p2 = this.toScreen(x, 250, 0);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      for (let y = 0; y <= 250; y += 50) {
        const p1 = this.toScreen(0, y, 0);
        const p2 = this.toScreen(300, y, 0);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  drawStock(ctx) {
    if (this.viewMode !== 'XY') return;
    const p1 = this.toScreen(35, 25);
    const p2 = this.toScreen(255, 195);
    const width = p2.x - p1.x;
    const height = p1.y - p2.y;

    ctx.save();
    ctx.fillStyle = 'rgba(16, 42, 28, 0.22)';
    ctx.strokeStyle = 'rgba(46, 204, 113, 0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fillRect(p1.x, p2.y, width, height);
    ctx.strokeRect(p1.x, p2.y, width, height);
    ctx.restore();
  }

  drawToolpath(ctx) {
    ctx.save();
    for (const seg of this.toolpath) {
      const start = this.toScreen(seg.x1, seg.y1, seg.z1);
      const end = this.toScreen(seg.x2, seg.y2, seg.z2);

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);

      if (seg.type === 'G0') {
        // Movimiento Rápido
        ctx.strokeStyle = '#6e7a88';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
      } else {
        // Corte G1 / G2
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

  drawOriginWCS(ctx) {
    const orig = this.toScreen(0, 0, 0);
    ctx.save();
    ctx.fillStyle = '#00e5ff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(orig.x, orig.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Círculo concéntrico
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(orig.x, orig.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawToolMarker(ctx) {
    const pos = this.toScreen(this.toolPos.x, this.toolPos.y, this.toolPos.z);
    ctx.save();

    // Cruz dorada
    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = '#ffb703';
    ctx.shadowBlur = 6;

    const crossSize = 12;
    ctx.beginPath();
    // Línea horizontal
    ctx.moveTo(pos.x - crossSize, pos.y);
    ctx.lineTo(pos.x + crossSize, pos.y);
    // Línea vertical
    ctx.moveTo(pos.x, pos.y - crossSize);
    ctx.lineTo(pos.x, pos.y + crossSize);
    ctx.stroke();

    // Círculo central
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
    ctx.stroke();

    // Si es vista 3D, dibuja cono o cilindro de herramienta simulado
    if (this.viewMode === '3D') {
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
}

// Instancia global del visualizador
window.cncVisualizer = null;
