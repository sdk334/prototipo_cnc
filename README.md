# CNC Basic v1.0 - Interfaz de Control CNC Educativa

**Trabajo Terminal 2026-B072: “Interfaz de control para máquinas CNC con fines educativos”**  
**Instituto Politécnico Nacional - Escuela Superior de Cómputo (ESCOM)**

- **Autores:** 
  - Josué Martin Echeverría Arteaga
  - Jonathan Uriel Paredes Martínez
- **Director:** Dr. Gelacio Castillo Cabrera

---

##  Descripción del Proyecto

Este repositorio contiene la suite de **Mockups Interactivos de Alta Fidelidad** desarrollados en tecnologías web estándares (**HTML5, CSS3 y JavaScript ES6+**), diseñados para la estación de control CNC educativa basada en microcontrolador y firmware **GRBL v1.1**.

La interfaz reproduce fielmente el diseño industrial del Capítulo 5.8 del documento de Trabajo Terminal, ofreciendo interacción en tiempo real sin requerir instalación de servidores complejos.

---

##  Características y Módulos Implementados

1. **Pantalla Principal:**
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

## 🚀 Instalación y Ejecución en Windows (PyQt6 + Hardware Real)

La interfaz cuenta con una arquitectura de cuatro capas desacopladas conforme al **Capítulo 5 del Trabajo Terminal**, ejecutándose como una aplicación nativa de escritorio en Windows con **Python 3 y PyQt6**, comunicándose directamente con hardware real con **GRBL v1.1** a través de **PySerial** y el puente IPC **QWebChannel**.

### 1. Requisitos Previos
- Python 3.10 o superior (probado y optimizado en Python 3.14 en Windows).
- Placa controladora CNC conectada por USB (Arduino Uno con CNC Shield, etc.) o uso del emulador virtual integrado.

### 2. Instalación de Dependencias
```bash
pip install -r requirements.txt
```

### 3. Ejecución de la Aplicación de Escritorio
```bash
python main.py
```

> **Nota:** La aplicación también puede abrirse directamente en cualquier navegador web moderno (`index.html`) para previsualización offline gracias a su arquitectura con degradación elegante.

---

## ⌨️ Atajos de Teclado del Sistema

| Tecla / Combinación | Acción Realizada |
| :--- | :--- |
| `↑` / `↓` | Jog eje Y (Adelante / Atrás) |
| `←` / `→` | Jog eje X (Izquierda / Derecha) |
| `Re Pág` / `Av Pág` | Jog eje Z (Subir / Bajar herramienta) |
| `Barra Espaciadora` | Pausar / Continuar ejecución del programa |
| `Escape (ESC)` | Parada de emergencia (**E-STOP** inmediata) |
| `Ctrl + H` | Ejecutar ciclo de Homing (`$H`) |

---

## 📁 Estructura del Repositorio

```text
proyecto tt2/
│
├── main.py                                 # Punto de entrada de la aplicación nativa Windows (PyQt6)
├── controlador_grbl.py                     # Capa 4: Driver de comunicación serial GRBL v1.1 y streaming
├── procesador_gcode.py                     # Capa 3: Analizador léxico/sintáctico, estimador y errores
├── puente_interfaz.py                      # Puente IPC bidireccional (QWebChannel Python <-> JS)
├── qwebchannel.js                          # Biblioteca de enlace cliente Qt WebChannel
├── requirements.txt                        # Dependencias de Python (PyQt6, PyQt6-WebEngine, PySerial)
│
├── index.html                              # Capa 1: Estructura semántica de la interfaz de control
├── styles.css                              # Sistema de diseño aeronáutico oscuro con Font Awesome
├── app.js                                  # Controlador reactivo de la interfaz web y suscripción IPC
├── visualizer.js                           # Motor gráfico Canvas 2D/3D (vistas XY, XZ, 3D e isometría)
│
├── pieza_01.nc                             # Archivo G-Code didáctico de prueba (cajeado 2D)
├── Documento Interfaz de Control CNC .md   # Documento oficial del Trabajo Terminal (ESCOM)
└── README.md                               # Manual técnico de usuario e instalación
```