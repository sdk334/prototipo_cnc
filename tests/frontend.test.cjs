const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('gui/app.js', 'utf8');
const visualizer = fs.readFileSync('gui/visualizer.js', 'utf8');
function functionSource(name) {
  const start = app.indexOf(`  function ${name}(`);
  const end = app.indexOf('\n  }', start) + 4;
  assert.ok(start >= 0 && end > start);
  return app.slice(start, end);
}
const syntaxContext = vm.createContext({});
for (const name of ['escaparHTML', 'formatearSintaxisCodigoG', 'colorearComandos']) {
  vm.runInContext(functionSource(name), syntaxContext);
}

test('progreso muestra exactamente un decimal sin alterar el valor recibido', () => {
  vm.runInContext(functionSource('formatearPorcentajeProgreso'), syntaxContext);
  for (const [entrada, esperado] of [[7.528735632183908, '7.5%'], [0, '0.0%'], [100, '100.0%'], [99.99, '100.0%'], [NaN, '0.0%']]) {
    assert.equal(syntaxContext.formatearPorcentajeProgreso(entrada), esperado);
  }
});

test('preset comunica el porcentaje al puente y no se reenvía al refrescar métricas', () => {
  const enviados = [];
  const activos = [];
  const ctx = vm.createContext({
    estado: {porcentajeVelocidadManual: 100, segundosEstimadosBase: 60, velocidadAvanceNominal: 800},
    elementos: {metricaPorcentajeAvance: {}, etiquetaVelocidadJog: {}, deslizadorVelocidadJog: {}},
    document: {getElementById() {return null;}, querySelectorAll() {return [50,100,150,200].map(pct => ({dataset: {feedPct: pct}, classList: {toggle(c, on) {if (on) activos.push(pct);}}}));}},
    window: {puenteCNC: {establecerFeedOverride(pct) {enviados.push(pct);}}}
  });
  for (const nombre of ['actualizarTiempoEstimado', 'mostrarFeedOverride', 'aplicarFeedOverride']) vm.runInContext(functionSource(nombre), ctx);
  ctx.aplicarFeedOverride(200);
  ctx.actualizarTiempoEstimado();
  assert.deepEqual(enviados, [200]);
  assert.equal(ctx.elementos.metricaPorcentajeAvance.textContent, '200%');
  assert.equal(activos.at(-1), 200);
});

test('el coloreado escapa HTML en código y comentarios', () => {
  for (const texto of [';<img src=x onerror="alert(1)">', '( <script>window.puenteCNC.detener()</script> )', 'G1X1 & <b>']) {
    const html = syntaxContext.formatearSintaxisCodigoG(texto);
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('<script'));
    assert.ok(html.includes('&lt;'));
  }
  assert.match(syntaxContext.formatearSintaxisCodigoG('G1 X2'), /class="cmd-g"/);
});

// Probar el parser real del visualizador sin requerir un canvas o navegador.
const context = vm.createContext({window: {}, document: {addEventListener() {}}, console,
  localStorage: {getItem() {return null;}}});
vm.runInContext(visualizer + '\nthis.Visualizador = VisualizadorCNC;', context);
function parse(code) {
  const v = Object.create(context.Visualizador.prototype);
  v.marcarEstaticoSucio = () => {};
  v.solicitarRenderizado = () => {};
  v.evaluarLimitesPieza = () => {};
  v.cargarTrayectoriaDesdeGCode(code);
  return v;
}

test('cuadrícula tiene límite incluso si el paso no cambia un Number muy grande', () => {
  for (const [inicio, fin, paso] of [[0, 300, .0001], [1e20, 1e20+1e6, .001], [-1e300, 1e300, .1]]) {
    const valores = [...context.valoresCuadricula(inicio, fin, paso)];
    assert.ok(valores.length <= 256);
    assert.ok(valores.every(Number.isFinite));
  }
  assert.equal([...context.valoresCuadricula(0, Infinity, 1)].length, 0);
});

test('resize limita memoria y no reasigna lienzos cuando el tamaño no cambia', () => {
  let escrituras = 0;
  const rect = {width: 1920, height: 1080};
  function canvas() {
    let w = 0, h = 0;
    return {parentElement: {getBoundingClientRect: () => rect},
      get width() {return w;}, set width(v) {w=v; escrituras++;},
      get height() {return h;}, set height(v) {h=v; escrituras++;}};
  }
  const v = Object.create(context.Visualizador.prototype);
  v.lienzo = canvas(); v.lienzoEstatico = canvas();
  v.contexto = v.contextoEstatico = {setTransform() {}};
  v.marcarEstaticoSucio = v.solicitarRenderizado = () => {};
  context.window.devicePixelRatio = 4;
  v.aplicarTamanoLienzo();
  assert.ok(v.lienzo.width*v.lienzo.height <= 4194304);
  const antes = escrituras;
  v.aplicarTamanoLienzo();
  assert.equal(escrituras, antes);
  rect.width = 0; v.aplicarTamanoLienzo();
  assert.equal(escrituras, antes);
  rect.width = 20000; rect.height = 10000; v.aplicarTamanoLienzo();
  assert.ok(v.lienzo.width <= 4096 && v.lienzo.height <= 4096);
  assert.ok(v.lienzo.width*v.lienzo.height <= 4194304);
});

test('mil eventos de resize se agrupan en una sola aplicación de tamaño', () => {
  const timers = new Map(), frames = [];
  let id = 0, cambios = 0;
  context.setTimeout = fn => {timers.set(++id, fn); return id;};
  context.clearTimeout = tid => timers.delete(tid);
  context.requestAnimationFrame = fn => {frames.push(fn); return frames.length;};
  const v = Object.create(context.Visualizador.prototype);
  v.anchoPantalla = 100; v._rafResize = null;
  v.aplicarTamanoLienzo = () => cambios++;
  for (let i=0; i<1000; i++) v.redimensionarLienzo();
  assert.equal(cambios, 0);
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.equal(frames.length, 1);
  frames[0]();
  assert.equal(cambios, 1);
});

test('los trazos se recortan antes de rasterizar coordenadas gigantes', () => {
  const v = Object.create(context.Visualizador.prototype);
  v.anchoPantalla = 100; v.altoPantalla = 80;
  const recorte = v.recortarSegmentoPantalla({x:-1e9,y:40}, {x:1e9,y:40});
  assert.ok(Math.abs(recorte[0].x+10) < .001);
  assert.ok(Math.abs(recorte[1].x-110) < .001);
  assert.equal(v.recortarSegmentoPantalla({x:-100,y:-100}, {x:-20,y:-20}), null);
  assert.equal(v.recortarSegmentoPantalla({x:Infinity,y:0}, {x:0,y:0}), null);
});

test('el relleno de superficies se acota al visor y se omite a gran aumento', () => {
  const v = Object.create(context.Visualizador.prototype);
  v.anchoPantalla = 100; v.altoPantalla = 80; v.zoom = 1;
  const puntos = [], ctx = {beginPath() {}, closePath() {}, fill() {},
    moveTo(x,y) {puntos.push({x,y});}, lineTo(x,y) {puntos.push({x,y});}};
  const vertices = [{x:-1e6,y:-1e6},{x:1e6,y:-1e6},{x:1e6,y:1e6},{x:-1e6,y:1e6}];
  v.rellenarPoligonoVisible(ctx, vertices);
  assert.ok(puntos.length >= 4);
  assert.ok(puntos.every(p => p.x>=-10 && p.x<=110 && p.y>=-10 && p.y<=90));
  puntos.length = 0; v.zoom = 250;
  v.rellenarPoligonoVisible(ctx, vertices);
  assert.equal(puntos.length, 0);
});

test('visualizador interpreta G91 compacto y pulgadas', () => {
  const v = parse('G20G91G1X1\nX1');
  assert.equal(v.trayectoria.at(-1).x2, 50.8);
  assert.equal(v.errorGcode, null);
});
test('visualizador conserva G0 entre bloques', () => {
  const v = parse('G0X10\nX20');
  assert.equal(v.trayectoria.at(-1).tipo, 'G0');
});
test('estimación respeta pulgadas, feed modal y tiempo de arco', () => {
  assert.ok(Math.abs(parse('G20G1X1F60').tiempoEstimadoSegundos-1) < 1e-6);
  const v = parse('G0X10\nG3X-10I-10F60');
  assert.ok(Math.abs(v.tiempoEstimadoSegundos-(.24+10*Math.PI)) < 1e-6);
});
test('visualizador dibuja círculo completo sin XYZ', () => {
  const v = parse('G0X10\nG3I-10J0');
  assert.ok(v.trayectoria.length > 8);
  assert.ok(Math.min(...v.trayectoria.map(s => s.x2)) < -9.9);
});
test('visualizador selecciona el centro correcto con R positivo', () => {
  const v = parse('G0X10\nG3X0Y10R10');
  for (const s of v.trayectoria.slice(1)) {
    assert.ok(Math.abs(Math.hypot(s.x2, s.y2)-10) < .00001);
  }
});
test('visualizador rechaza planos no implementados y valores malformados', () => {
  for (const code of ['G18G2X1Z1I1', 'G1Xabc']) {
    const v = parse(code);
    assert.ok(v.errorGcode);
    assert.equal(v.trayectoria.length, 0);
  }
});

test('finalización de interfaz no envía detener al completar', () => {
  const fuente = functionSource('detenerMecanizado');
  let paradas = 0;
  const elem = new Proxy({}, {get() { return {classList: {add() {}, remove() {}}, innerHTML: ''}; }});
  const ctx = vm.createContext({window: {puenteCNC: {detener() {paradas++;}}},
    estado: {trabajoActual: null}, elementos: elem, clearInterval() {},
    establecerEstadoOperativo() {}, actualizarEstadoGiroVisualizador() {}});
  vm.runInContext(fuente, ctx);
  ctx.detenerMecanizado('Completado');
  assert.equal(paradas, 0);
  ctx.detenerMecanizado('Detenido');
  assert.equal(paradas, 1);
});

test('historial espera la respuesta asíncrona y permite lista vacía', async () => {
  const start = app.indexOf('    async cargarDisco() {');
  const end = app.indexOf('\n    guardar()', start);
  const metodo = app.slice(start, end).replace(/,\s*$/, '');
  const ctx = vm.createContext({window: {puenteCNC: {cargarHistorialDisco: async () => '[{"archivo":"disco.nc"}]'}}});
  vm.runInContext(`this.h = {lista: [], _sanitizarItem(i) {return i;}, renderizar() {}, ${metodo}};`, ctx);
  await ctx.h.cargarDisco();
  assert.equal(ctx.h.lista[0].archivo, 'disco.nc');
  ctx.window.puenteCNC.cargarHistorialDisco = async () => '[]';
  await ctx.h.cargarDisco();
  assert.equal(ctx.h.lista.length, 0);
});

test('historial escapa todos los campos del archivo y resultado', () => {
  const start = app.indexOf("    renderizar(filtro = '') {", app.indexOf('const HistorialManager'));
  const end = app.indexOf('\n    exportarJSON()', start);
  const metodo = app.slice(start, end).replace(/,\s*$/, '');
  const ctx = vm.createContext({elementos: {tbodyHistorial: {innerHTML: ''}}});
  vm.runInContext(functionSource('escaparHTML'), ctx);
  vm.runInContext(`this.h = {lista: [{archivo: '<img src=x onerror=alert(1)>', resultado: '<script>x</script>'}], ${metodo}};`, ctx);
  ctx.h.renderizar();
  const html = ctx.elementos.tbodyHistorial.innerHTML;
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
  assert.ok(html.includes('&lt;img'));
});

test('edicion, insercion, borrado y deshacer de lineas G-Code actualizan estado correctamente', () => {
  const ctx = vm.createContext({
    estado: {
      lineasPrograma: [{ texto: 'G0 X0 Y0' }, { texto: 'G1 X10 Y10 F500' }, { texto: 'G0 Z5' }],
      lineasConfirmadas: new Map(),
      lineasSeleccionadas: new Set(),
      ultimoIndiceSeleccionado: null,
      indiceLineaActiva: 1,
      indiceLineaEnEdicion: -1,
      pilaDeshacerGcode: [],
      segundosEstimadosBase: 10,
      enEjecucion: false
    },
    elementos: {
      etiquetaLineasGcode: {},
      contenedorLineasGcode: { style: {}, innerHTML: '', querySelector() { return null; }, appendChild() {} },
      visorGcodeViewport: { scrollTop: 0, clientHeight: 300 }
    },
    document: {
      getElementById() { return null; },
      createDocumentFragment() { return { appendChild() {} }; },
      createElement() { return { style: {}, dataset: {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {} } }; }
    },
    window: {},
    ALTURA_LINEA_GCODE: 22,
    imprimirEnConsola() {},
    formatearSintaxisCodigoG(t) { return t; },
    estimarSegundosBaseDesdeLineas() { return 10; },
    actualizarMetricasTelemetria() {},
    actualizarTiempoEstimado() {}
  });

  for (const name of [
    'actualizarContadorLineas',
    'renderizarVentanaVisibleGcode',
    'renderizarListaCodigoG',
    'sincronizarCambiosProgramaGcode',
    'iniciarEdicionLinea',
    'guardarEdicionLinea',
    'insertarLineaGcode',
    'eliminarLineasSeleccionadas',
    'eliminarRangoLineas',
    'deshacerUltimaEdicionGcode'
  ]) {
    vm.runInContext(functionSource(name), ctx);
  }

  // 1. Edición de una línea específica
  ctx.guardarEdicionLinea(1, 'G1 X20 Y20 F600');
  assert.equal(ctx.estado.lineasPrograma[1].texto, 'G1 X20 Y20 F600');
  assert.equal(ctx.estado.pilaDeshacerGcode.length, 1);

  // 2. Inserción entre líneas (en posición 2, entre línea 1 y 2)
  ctx.insertarLineaGcode(2, 'G1 Z-2 F100');
  assert.equal(ctx.estado.lineasPrograma.length, 4);
  assert.equal(ctx.estado.lineasPrograma[2].texto, 'G1 Z-2 F100');

  // 3. Borrado múltiple (seleccionar índices 1 y 2)
  ctx.estado.lineasSeleccionadas.add(1);
  ctx.estado.lineasSeleccionadas.add(2);
  ctx.eliminarLineasSeleccionadas();
  assert.equal(ctx.estado.lineasPrograma.length, 2);
  assert.equal(ctx.estado.lineasPrograma[0].texto, 'G0 X0 Y0');
  assert.equal(ctx.estado.lineasPrograma[1].texto, 'G0 Z5');

  // 4. Deshacer borrado
  ctx.deshacerUltimaEdicionGcode();
  assert.equal(ctx.estado.lineasPrograma.length, 4);

  // 5. Borrado por rango (líneas 2 a 3 en 1-based = índices 1 y 2)
  ctx.eliminarRangoLineas(2, 3);
  assert.equal(ctx.estado.lineasPrograma.length, 2);
});

