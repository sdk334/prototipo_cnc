# CNC Basic v1.0 - Interfaz de Control CNC Educativa

**Trabajo Terminal 2026-B072: “Interfaz de control para máquinas CNC con fines educativos”**  
**Instituto Politécnico Nacional - Escuela Superior de Cómputo (ESCOM)**

- **Autores:** 
  - Josué Martin Echeverría Arteaga
  - Jonathan Uriel Paredes Martínez (`jparedesm1600@alumno.ipn.mx`)
- **Director:** Dr. Gelacio Castillo Cabrera

---

## 📌 Descripción del Proyecto

Este repositorio contiene la suite de **Mockups Interactivos de Alta Fidelidad** desarrollados en tecnologías web estándares (**HTML5, CSS3 y JavaScript ES6+**), diseñados para la estación de control CNC educativa basada en microcontrolador y firmware **GRBL v1.1**.

La interfaz reproduce fielmente el diseño industrial del Capítulo 5.8 del documento de Trabajo Terminal, ofreciendo interacción en tiempo real sin requerir instalación de servidores complejos.

---

## 🚀 Características y Módulos Implementados

1. **Pantalla Principal (Figura 1):**
   - **DRO (Digital Read Out):** Coordenadas de trabajo (WCS) y de máquina (MCS) para los ejes X, Y y Z con resolución de 3 decimales y botones individuales y colectivos de puesta a cero (`ZERO XY`, `ZERO Z`, `ZERO ALL`).
   - **Control de Movimiento Manual (Jogging):** Mando tipo D-Pad en cruz para XY, controles dedicados de elevación Z, selectores de incremento de paso (`0.01`, `0.1`, `1`, `10` mm) y regulador de velocidad de avance.
   - **Control de Husillo (Spindle):** Interruptor de encendido/apagado, selector de RPM (hasta 24,000 RPM) y deslizador de override.
   - **Visualizador 2D / 3D Canvas:** Renderizado dinámico de la rejilla milimétrica, límites de material (stock), trayectorias de corte en cian (`G1/G2`), desplazamientos rápidos punteados (`G0`), origen WCS y retícula dorada de posición de herramienta interactiva.
   - **Visor de Código G:** Lista con numeración de líneas, coloreado sintáctico de comandos G/M, resaltado de línea en ejecución y sincronización de buffer.
   - **Consola Serial y Entrada MDI:** Terminal interactivo compatible con respuestas GRBL (`ok`, `$G`, `$$`, `$H`, `$X`, etc.) y envío directo de comandos G-Code.
   - **Panel de Control de Ejecución:** Telemetría de avance, tiempo de ciclo transcurrido, porcentaje de avance real, barra de progreso animada y botones de inicio, pausa y parada segura.

2. **Módulos de Configuración y Diagnóstico (Figuras 6 a 13):**
   - Panel de **Ajustes de Conexión Serial (UART)**.
   - Panel de **Información y Parámetros de Máquina** (Pasos/mm `$100`, `$101`, `$102`, aceleraciones y límites máximos).
   - Panel de **Emisor de G-Code** y algoritmos de buffering.
   - Panel de **Personalización de Interfaz** (Temas oscuros aeroespaciales, unidades métricas e imperiales).
   - Panel de **Atajos de Teclado** (Flechas para Jog, barra espaciadora para pausa, ESC para E-STOP).
   - Panel de **Ajustes de Visualizador y Render**.
   - Panel de **Consola de Diagnóstico**.
   - Panel de **Comandos Rápidos y Macros Educativas** (Sonda Z touch-plate, Safe Park, Spindle Warmup).
   - Panel de **Mapa de Alturas** (Auto-leveling probe matrix para PCB).
   - **Diccionario G-Code Educativo:** Tabla interactiva con búsqueda en tiempo real de comandos y explicaciones didácticas.

---

## 💻 Cómo Ejecutar los Mockups

No se requieren dependencias externas. Puedes abrir la interfaz de dos maneras:

### Opción 1: Apertura Directa en el Navegador
Haz doble clic sobre el archivo `index.html` en tu explorador de archivos para abrirlo en Chrome, Edge, Firefox o tu navegador preferido.

### Opción 2: Servidor Local Liviano (Recomendado)
Desde una terminal en este directorio:
```bash
# Con Python:
python -m http.server 8080

# O con npx (Node.js):
npx serve .
```
Luego abre `http://localhost:8080` en tu navegador.

---

## ⌨️ Atajos de Teclado del Sistema

| Tecla / Combinación | Acción Realizada |
| :--- | :--- |
| `↑` / `↓` | Jog eje Y (Adelante / Atrás) |
| `←` / `→` | Jog eje X (Izquierda / Derecha) |
| `Re Pág` / `Av Pág` | Jog eje Z (Subir / Bajar herramienta) |
| `Barra Espaciadora` | Pausar / Continuar ejecución del programa |
| `Escape (ESC)` | Parada de emergencia (**E-STOP**) |
| `Ctrl + H` | Ejecutar ciclo de Homing (`$H`) |

---

## 📦 Estructura del Repositorio

```text
proyecto tt2/
│
├── Documento Interfaz de Control CNC .md   # Documento oficial del Trabajo Terminal (ESCOM)
├── README.md                               # Documentación general y manual de usuario
├── .gitignore                              # Reglas de exclusión para Git
├── pieza_01.nc                             # Archivo G-Code de muestra para simulación
│
├── index.html                              # Estructura semántica de la interfaz
├── styles.css                              # Diseño y paleta industrial oscura
├── app.js                                  # Lógica reactiva de control, DRO y simulación
└── visualizer.js                           # Motor gráfico Canvas 2D/3D
```

---

## 📤 Subir a GitHub

Para publicar estos cambios en tu cuenta de GitHub (`jparedesm1600@alumno.ipn.mx`):

1. **Crea un nuevo repositorio en GitHub** (por ejemplo: `cnc-interface-mockups` o `trabajo-terminal-cnc`).
2. **Vincula tu repositorio remoto y haz push:**
```bash
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git branch -M main
git push -u origin main
```
