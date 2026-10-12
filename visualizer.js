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
    this.limitesMaterial = null;
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
    if (this.limitesMaterial && this.limitesMaterial.maxX > this.limitesMaterial.minX) {
      this.ajustarVistaAPieza();
    } else {
      this.zoom = 1.0;
      this.desplazamientoX = 70;
      this.desplazamientoY = -30;
      this.actualizarSuperposicionZoom();
      this.solicitarRenderizado();
    }
  }

  // Encuadra y hace zoom automáticamente para centrar la pieza cargada en pantalla
  ajustarVistaAPieza() {
    if (!this.limitesMaterial || !this.anchoPantalla) return;
    const anchoPieza = Math.max(10, this.limitesMaterial.maxX - this.limitesMaterial.minX);
    const altoPieza = Math.max(10, this.limitesMaterial.maxY - this.limitesMaterial.minY);
    const centroX = (this.limitesMaterial.minX + this.limitesMaterial.maxX) / 2;
    const centroY = (this.limitesMaterial.minY + this.limitesMaterial.maxY) / 2;

    const escalaDeseadaX = (this.anchoPantalla * 0.72) / anchoPieza;
    const escalaDeseadaY = (this.altoPantalla * 0.72) / altoPieza;
    const escalaOptima = Math.min(escalaDeseadaX, escalaDeseadaY);

    this.zoom = Math.max(0.4, Math.min(5.0, escalaOptima / 1.65));
    const escala = 1.65 * this.zoom;

    this.desplazamientoX = Math.round((this.anchoPantalla / 2) - 60 - (centroX * escala));
    this.desplazamientoY = Math.round((centroY * escala) - (this.altoPantalla / 2) + 50);

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

  // Trayectoria demostrativa inicial correspondiente al programa G-Code por defecto
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

  // Analiza y genera la geometría 2D/3D directamente desde texto o arreglo de instrucciones G-Code
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

    for (let rawLinea of lineas) {
      // Quitar comentarios tras ';' o entre '(...)'
      const linea = rawLinea.replace(/\(.*?\)/g, '').split(';')[0].trim().toUpperCase();
      if (!linea) continue;

      // Detectar modos modales de distancia
      if (/\bG90\b/.test(linea)) modoAbsoluto = true;
      if (/\bG91\b/.test(linea)) modoAbsoluto = false;

      // Detectar modo modal de movimiento
      if (/\bG00?\b/.test(linea)) modoMovimiento = 'G0';
      else if (/\bG0?1\b/.test(linea)) modoMovimiento = 'G1';
      else if (/\bG0?2\b/.test(linea)) modoMovimiento = 'G2';
      else if (/\bG0?3\b/.test(linea)) modoMovimiento = 'G3';

      // Extraer coordenadas
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
        // Interpolación de arcos circulares
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
        }
      }

      posX = objetivoX;
      posY = objetivoY;
      posZ = objetivoZ;
    }

    this.trayectoria = nuevaTrayectoria;

    // Calcular bloque de material envolvente con margen de 15 mm
    if (minCorteX !== Infinity && maxCorteX !== -Infinity) {
      this.limitesMaterial = {
        minX: Math.max(0, minCorteX - 15),
        maxX: maxCorteX + 15,
        minY: Math.max(0, minCorteY - 15),
        maxY: maxCorteY + 15
      };
    } else {
      this.limitesMaterial = { minX: 95, maxX: 225, minY: 125, maxY: 235 };
    }

    this.solicitarRenderizado();
  }

  // Establece directamente los segmentos vectoriales (por ejemplo desde el analizador de Python)
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
      }
      this.solicitarRenderizado();
    }
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
    const limites = this.limitesMaterial || { minX: 95, maxX: 225, minY: 125, maxY: 235 };
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
  }

  // Líneas continuas para corte y discontinuas para movimiento en vacío (Batching de alto rendimiento a 60 FPS)
  dibujarTrayectorias(ctx) {
    if (!this.trayectoria || this.trayectoria.length === 0) return;
    ctx.save();

    // 1. Trazado rápido G0 (líneas discontinuas grises) en un único batch
    ctx.strokeStyle = '#6e7a88';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.shadowBlur = 0;
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

    // 2. Trayectorias de corte G1/G2/G3 (líneas continuas cian) en un único batch
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([]);
    if (this.trayectoria.length < 1200) {
      ctx.shadowColor = 'rgba(0, 229, 255, 0.4)';
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
