# CNC Basic v1.0 - Interfaz de Control CNC Educativa

**Trabajo Terminal 2026-B072: “Interfaz de control para máquinas CNC con fines educativos”**  
**Instituto Politécnico Nacional - Escuela Superior de Cómputo (ESCOM)**

- **Autores:** 
  - Josué Martin Echeverría Arteaga
  - Jonathan Uriel Paredes Martínez
- **Director:** Dr. Gelacio Castillo Cabrera

---

## 📖 Descripción del Proyecto

**CNC Basic v1.0** es una estación de control numérico computarizado (CNC) de grado industrial y pedagógico desarrollada para máquinas de fresado, grabado y trazado controladas por firmware **GRBL v1.1** (Arduino Uno, Nano, ATmega328P o microcontroladores compatibles).

La plataforma combina un **núcleo nativo de alto rendimiento en Python 3 (PyQt6 + PySerial)** con una **interfaz gráfica moderna y reactiva en tecnologías web (HTML5, CSS3 aeronáutico y JavaScript ES6+)** enlazadas en tiempo real mediante el canal IPC bidireccional **QWebChannel**.

Cuenta con una arquitectura modular desacoplada en cuatro capas, permitiendo tanto la **operación con hardware físico real por puerto serie USB** como la **simulación didáctica virtual** en laboratorios donde no se disponga de máquina física.

---

## 🌟 Resumen de Características y Mejoras Implementadas

### 1. 🛡️ Interbloqueo y Seguridad Crítica del Husillo (Spindle Safety Interlock)
- **Protección de herramienta durante mecanizado**: Se impide terminantemente el apagado accidental del husillo (Spindle) mientras la máquina se encuentra cortando o en pausa activa (`RUN` o `HOLD`), tanto desde la interfaz gráfica como desde comandos manuales MDI (`M5`).
- **Alerta de seguridad industrial**: Modales visuales y sonoros con rechazo explícito y animación de bloqueo (`btn-spindle-denied`) informando al operador sobre el riesgo de rotura de fresa y desgarre de material.
- **Protección automática de corte sin giro**: En modo fresa, si el archivo G-Code o el operador intentan ejecutar avances de corte (`G1`, `G2`, `G3`) con el husillo detenido, el sistema detiene inmediatamente el movimiento, pasa a estado `HOLD` y despliega la advertencia correspondiente.

### 2. ✏️ Soporte de Doble Herramienta: Fresa CNC vs Lápiz Didáctico
- **Modal de Selección de Herramienta**: Permite conmutar con un solo clic entre:
  - **Fresa CNC (Herramienta de Corte)**: Para operaciones de maquinado convencional sobre madera, acrílico, aluminio o placas de circuito impreso (PCB).
  - **Lápiz Didáctico (Plotter de Trazado)**: Diseñado para prácticas seguras de laboratorio sobre papel, cartulina o plantillas sin riesgo de accidentes mecánicos ni desgaste de fresas.
- **Renderizado Gráfico 3D y 2D Diferenciado**:
  - *Fresa*: Modelo 3D con pinza portapinzas ER11 dorada, husillo de alta velocidad y herramienta cilíndrica plateada con animación de rotación sincronizada a las RPM.
  - *Lápiz*: Modelo 3D realista con cuerpo hexagonal amarillo tradicional (tipo grafito #2 escolar), cono de madera afilada, mina de grafito, virola metálica y borrador rosado.
- **Inhibición Total del Motor en Modo Lápiz**:
  - En modo lápiz, el husillo se deshabilita y se apaga de forma permanente (`0 RPM`, `OFF (LÁPIZ)`).
  - El botón del husillo queda deshabilitado visualmente (`Spindle Inactivo (Lápiz)`).
  - Si el archivo G-Code contiene instrucciones de encendido de motor (`M3` o `M4`), el sistema **no enciende el husillo** y genera una notificación didáctica en la consola serial indicando que el código contiene arranque de motor pero ha sido omitido por encontrarse en modo lápiz.
  - Al transmitir a una máquina física real, los comandos `M3`/`M4` se sustituyen por comentarios inocuos para evitar que el relé/PWM del spindle se active físicamente.
  - El interbloqueo de corte sin husillo se desactiva de forma inteligente en modo lápiz, permitiendo trazar libremente sin interrupciones.

### 3. ⏱️ Modificador de Velocidad en Tiempo Real (Feed Override)
- Implementación del protocolo de comandos en tiempo real de GRBL v1.1 mediante inyección directa de bytes (`0x90` para 100%, incrementos dinámicos de 10% a 250%).
- Deslizador interactivo en la interfaz con actualización instantánea de las lecturas de telemetría y recálculo adaptativo de tiempos de ciclo estimados.

### 4. 📐 Visualizador Gráfico Canvas 2D/3D Multivista
- **Vistas ortogonales e isométricas**: Proyección XY (superior), XZ (frontal), YZ (lateral) y 3D interactivo con rotación orbital, paneo y zoom con la rueda del ratón.
- **Detección de límites suaves (Soft Limits)**: Comprobación automática de las dimensiones del programa G-Code contra los recorridos máximos configurados en el firmware (`$130`, `$131`, `$132`) antes de comenzar la corrida.
- **Renderizado cromático de trayectorias**: Movimientos rápidos (`G0`) en líneas discontinuas y movimientos de corte o trazado (`G1/G2/G3`) en cian brillante continuo con marcador de progreso en tiempo real.

### 5. 🎛️ Consola Serial y Terminal MDI Educativo
- Terminal serial interactivo con filtrado de comandos, atajos rápidos (`$H`, `$X`, `$$`, `$G`) y traducción pedagógica de errores y alarmas de GRBL.
- Diccionario de Código G integrado con buscador en tiempo real para consulta de directivas estándar (`G00`, `G01`, `G02`, `G03`, `G17`, `G21`, `G90`, `M03`, `M05`, etc.).

### 6. 🖥️ Experiencia de Usuario Nativa y Pantalla Completa
- Integración nativa de Windows mediante **PyQt6 WebEngine** acelerado por hardware con WebGL y soporte completo para pantallas táctiles de alta densidad (HiDPI).
- Modo de pantalla completa inmersiva accesible mediante la tecla `F11` o desde el menú de vista de la aplicación.
- Barra lateral flexible con paneles colapsables (DRO, Jogging, Husillo, Progreso) y divisor arrastrable con memoria de tamaño.

---

## 📁 Estructura del Proyecto

El proyecto está organizado de manera modular en carpetas temáticas para facilitar su mantenimiento y escalabilidad:

```text
proyecto tt2/
│
├── core/                                 # Capa de Backend y Comunicación Nativa (Python)
│   ├── __init__.py                       # Exportación del paquete core
│   ├── controlador_grbl.py               # Driver serial GRBL v1.1, streaming y emulador virtual
│   ├── procesador_gcode.py               # Analizador léxico/sintáctico, estimador y errores
│   └── puente_interfaz.py                # Puente IPC bidireccional PyQt6 QWebChannel <-> JS
│
├── gui/                                  # Capa de Frontend Web (UI / UX)
│   ├── index.html                        # Estructura semántica de la estación de control
│   ├── styles.css                        # Sistema de diseño aeronáutico oscuro y responsivo
│   ├── app.js                            # Lógica reactiva de la interfaz, suscripciones y estados
│   ├── visualizer.js                     # Motor gráfico Canvas 2D/3D (ortogonal e isométrico)
│   └── qwebchannel.js                    # Biblioteca cliente oficial Qt WebChannel para JS
│
├── gcode_samples/                        # Programas G-Code de Prueba y Demostración
│   ├── pieza_01.nc                       # Cajeado didáctico de prueba (fresado 2.5D)
│   └── pistaspai.nc                      # Trazado de pistas de circuito impreso (PCB / Lápiz)
│
├── docs/                                 # Documentación Académica y Recursos del Trabajo Terminal
│   ├── Documento Interfaz de Control CNC .md   # Manuscrito formal del Trabajo Terminal (ESCOM)
│   └── assets/                           # Diagramas y capturas de pantalla de la interfaz
│       └── images/
│           ├── image1.png ... image14.png
│
├── main.py                               # Punto de entrada principal ejecutable en Windows
├── requirements.txt                      # Dependencias de Python (PyQt6, PyQt6-WebEngine, pyserial)
├── README.md                             # Manual técnico y guía de usuario
└── .gitignore                            # Exclusiones de Git y temporales
```

---

## 🚀 Instalación y Puesta en Marcha

### 1. Requisitos del Sistema
- **Sistema Operativo:** Windows 10 u 11 (64 bits).
- **Python:** Versión 3.10 o superior (validado y optimizado en Python 3.14).
- **Hardware:** Máquina CNC conectada por USB con firmware **GRBL v1.1** (o utilizar el modo virtual emulado si no hay máquina conectada).

### 2. Instalación de Dependencias
Abra una terminal de PowerShell o CMD en la carpeta raíz del proyecto y ejecute:

```bash
pip install -r requirements.txt
```

Las dependencias principales son:
- `PyQt6`: Ventana nativa y sistema de eventos.
- `PyQt6-WebEngine`: Motor Chromium integrado para visualización gráfica sin servidores externos.
- `pyserial`: Comunicación física con el microcontrolador a 115200 baudios.

### 3. Ejecución de la Aplicación
Para iniciar la interfaz de control:

```bash
python main.py
```

> **Nota para Pruebas Offline:** También es posible abrir directamente `gui/index.html` en cualquier navegador web moderno (Chrome, Edge, Firefox) para demostraciones didácticas gracias a su arquitectura con degradación elegante.

---

## ⌨️ Atajos de Teclado del Sistema

| Tecla / Combinación | Acción Realizada |
| :--- | :--- |
| `F11` | Alternar modo pantalla completa inmersiva |
| `↑` / `↓` | Jog eje Y (Adelante / Atrás) |
| `←` / `→` | Jog eje X (Izquierda / Derecha) |
| `Re Pág` / `Av Pág` | Jog eje Z (Subir / Bajar herramienta) |
| `Barra Espaciadora` | Pausar / Continuar ejecución del programa |
| `Escape (ESC)` | Parada de emergencia (**E-STOP** inmediata) |
| `Ctrl + H` | Ejecutar ciclo de búsqueda de ceros de máquina (**Homing $H**) |
| `Ctrl + X` | Desbloquear estado de alarma de GRBL (**$X**) |
| `Ctrl + O` | Abrir cuadro de diálogo para cargar archivo G-Code |
| `Ctrl + S` | Guardar / Exportar programa de código G |

---

## 🎓 Créditos y Afiliación Académica

Este desarrollo forma parte de la fase final del **Trabajo Terminal 2026-B072** en la **Escuela Superior de Cómputo (ESCOM)** del **Instituto Politécnico Nacional (IPN)**, Ciudad de México, México.