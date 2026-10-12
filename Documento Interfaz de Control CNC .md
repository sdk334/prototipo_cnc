

INSTITUTO POLITÉCNICO NACIONAL  
ESCUELA SUPERIOR DE CÓMPUTO

ESCOM

*Trabajo Terminal I*

“Interfaz de control para máquinas CNC con fines educativos”

2026-B072

Carrera: ingeniería en sistemas computacionales

*Presentan*

*Echeverría Arteaga Josué Martin*

*Paredes Martínez Jonathan Uriel*

*director*

*Dr. Gelacio Castillo Cabrera*

## Índice {#índice}

[**Índice	1**](#índice)

[**Índice de tablas	3**](#índice-de-tablas)

[**Índice de Imágenes	3**](#índice-de-imágenes)

[**Glosario de términos	4**](#glosario-de-términos)

[**Abreviaturas	7**](#abreviaturas)

[**Resumen	9**](#resumen)

[**Capítulo 1\. Antecedentes.	11**](#capítulo-1.-antecedentes.)

[**1.1 Planteamiento del problema.	11**](#1.1-planteamiento-del-problema.)

[**1.2 Solución propuesta.	11**](#1.2-solución-propuesta.)

[**1.3 Objetivos.	11**](#1.3-objetivos.)

[**1.3.1 Objetivo general.	11**](#1.3.1-objetivo-general.)

[**1.3.2 Objetivos específicos.	11**](#1.3.2-objetivos-específicos.)

[**1.4 Justificación.	12**](#1.4-justificación.)

[**1.5 Organización del documento.	12**](#1.5-organización-del-documento.)

[**Capítulo 2\. Estado del arte	16**](#capítulo-2.-estado-del-arte)

[**2.1 Revisión	16**](#2.1-revisión)

[**2.2 Interfaces comerciales dominantes:	16**](#2.2-interfaces-comerciales-dominantes:)

[**2.3  Soluciones de código abierto y educativas:	17**](#2.3-soluciones-de-código-abierto-y-educativas:)

[**2.4 Tendencias actuales en interfaz de control CNC:	17**](#2.4-tendencias-actuales-en-interfaz-de-control-cnc:)

[**2.5 Comparativa de interfaces:	18**](#2.5-comparativa-de-interfaces:)

[**2.6 Análisis comparativo:	20**](#2.6-análisis-comparativo:)

[**Capítulo 3\. Marco Teórico	21**](#capítulo-3.-marco-teórico)

[**3.1. Fundamentos del lenguaje G-code y M-code	21**](#3.1.-fundamentos-del-lenguaje-g-code-y-m-code)

[**3.2. Principios de funcionamiento de microcontroladores en CNC	21**](#3.2.-principios-de-funcionamiento-de-microcontroladores-en-cnc)

[**3.3. Análisis y selección del firmware GRBL v1.1	22**](#3.3.-análisis-y-selección-del-firmware-grbl-v1.1)

[**Capítulo 4\. Análisis de requerimientos	23**](#heading=)

[**4.1 Requerimientos funcionales (RF)	23**](#4.1-requerimientos-funcionales-\(rf\))

[**4.2 Requerimientos no funcionales (RNF)	25**](#heading=)

[**4.3 Análisis de riesgos	26**](#4.3-análisis-de-riesgos)

[**4.4 Factibilidad técnica	27**](#4.4-factibilidad-técnica)

[**4.5 Viabilidad económica	29**](#4.5-viabilidad-económica)

[**4.5.1 Costos de mano de obra (capital humano)	29**](#4.5.1-costos-de-mano-de-obra-\(capital-humano\))

[**4.5.2 Justificación de las horas de desarrollo	30**](#4.5.2-justificación-de-las-horas-de-desarrollo)

[**4.6 Recursos tecnológicos	31**](#heading=)

[**4.7 Resumen de inversión en software	31**](#4.7-resumen-de-inversión-en-software)

[**Capítulo 5\. Diseño de arquitectura (GUI \+ Backend)	32**](#heading=)

[**5.1 Arquitectura de capas del sistema de control CNC educativo	32**](#5.1-arquitectura-de-capas-del-sistema-de-control-cnc-educativo)

[**5.2 Diagrama de secuencia	34**](#5.2-diagrama-de-secuencia)

[**5.3 Tabla de mensajes	35**](#5.3-tabla-de-mensajes)

[**5.4 Tabla de errores	38**](#5.4-tabla-de-errores)

[**5.5 Caso de uso	40**](#5.5-caso-de-uso)

[**5.8 Mockups	59**](#5.8-mockups)

[**Capítulo 6\. Investigación y selección de firmware	69**](#heading=)

[**6.1 Candidatos de firmware analizados	70**](#6.1-candidatos-de-firmware-analizados)

[**6.2 GRBL v1.1 vs Marlin:	71**](#6.2-grbl-v1.1-vs-marlin:)

[**6.3 Configuración de parámetros	72**](#heading=)

[**Capítulo 7\. Metodología de desarrollo	74**](#heading=)

[**Referencias	76**](#referencias)

## Índice de tablas {#índice-de-tablas}

[1.1 tabla comparativa de interfaces	19](#1.1-tabla-comparativa-de-interfaces)

[1.2 tabla Análisis de Requerimientos	24](#1.2-tabla-análisis-de-requerimientos)

[1.3 tabla Análisis de Requerimientos no funcionales	25](#1.3-tabla-análisis-de-requerimientos-no-funcionales)

[1.4 tabla análisis de riesgos	26](#1.4-tabla-análisis-de-riesgos)

[1.5  tabla de Requisitos de la Computadora (Mínimos)	27](#1.5-tabla-de-requisitos-de-la-computadora-\(mínimos\))

[1.6  tabla de Requisitos de Software para el desarrollo de la interfaz	28](#1.6-tabla-de-requisitos-de-software-para-el-desarrollo-de-la-interfaz)

[1.7  tabla de Costos de Mano de Obra	29](#1.7-tabla-de-costos-de-mano-de-obra)

[1.8 Tabla de Recursos Tecnológicos	31](#1.8-tabla-de-recursos-tecnológicos)

[1.9 tabla de Diagrama de secuencia	34](#1.9-tabla-de-diagrama-de-secuencia)

[1.10  Tabla de mensajes	37](#1.10-tabla-de-mensajes)

[1.11  Tabla de Errores	39](#1.11-tabla-de-errores)

[1.12  Tabla Metodologia	75](#1.12-tabla-metodologia)

## 

## 

## Índice de Imágenes {#índice-de-imágenes}

> > > [Figura 1\. Pantalla principal. Creación propia.	59](#figura-1.-pantalla-principal.-creación-propia.)

> > > [Figura 2\. Atajo comandos de usuario. Creación propia.	60](#figura-2.-atajo-comandos-de-usuario.-creación-propia.)

> > > [Figura 3\. Mapa de alturas. Creación propia.	61](#figura-3.-mapa-de-alturas.-creación-propia.)

> > > [Figura 4\. Husillo. Creación propia.	61](#figura-4.-husillo.-creación-propia.)

> > > [Figura 5\. Control manual. Creación propia.	62](#figura-5.-control-manual.-creación-propia.)

> > > [Figura 6\. Ajustes de conexión. Creación propia.	63](#figura-6.-ajustes-de-conexión.-creación-propia.)

> > > [Figura 7\. Ajustes información de la máquina. Creación propia.	63](#figura-7.-ajustes-información-de-la-máquina.-creación-propia.)

> > > [Figura 8\. Ajustes emisor. Creación propia.	64](#figura-8.-ajustes-emisor.-creación-propia.)

> > > [Figura 9\. Ajustes interfaz de usuario. Creación propia.	65](#figura-9.-ajustes-interfaz-de-usuario.-creación-propia.)

> > > [Figura 10\. Ajustes y atajos. Creación propia.	65](#figura-10.-ajustes-y-atajos.-creación-propia.)

> > > [Figura 11\. Ajustes visualizador. Creación propia.	66](#figura-11.-ajustes-visualizador.-creación-propia.)

> > > [Figura 12\. Ajustes consola. Creación propia.	67](#figura-12.-ajustes-consola.-creación-propia.)

> > > [Figura 13\. Ajustes comandos de usuario. Creación propia.	68](#figura-13.-ajustes-comandos-de-usuario.-creación-propia.)

> > > [Figura 14\. Fórmula de pasos por milímetro	72](#figura-14.-fórmula-de-pasos-por-milímetro)

## Glosario de términos {#glosario-de-términos}

| Término | Definición |
| :---- | :---- |
| **Analizador de Código G (Parser)** | Módulo de software encargado de descomponer las líneas de instrucciones de texto en datos estructurados que el sistema puede procesar y validar. |
| **Código G (G-Code)** | Lenguaje de programación numérico que contiene las instrucciones de movimiento y acciones de la herramienta (coordenadas, velocidades, trayectorias). |
| **Código M (M-Code)** | Instrucciones auxiliares que controlan funciones de la máquina que no son de movimiento, como el encendido del husillo o sistemas de enfriamiento. |
| **Control numérico por Computadora (CNC)** | Sistema de automatización de máquinas herramienta operadas mediante comandos programados, en contraste con el control manual. |
| **Controlador de potencia (Driver)** | Componente electrónico que actúa como puente entre el microcontrolador y los motores, suministrando la corriente necesaria para el movimiento físico. |
| **Coordenadas máquina** | Sistema de referencia absoluto definido por los límites físicos y los sensores de inicio (home) de la estructura CNC. |
| **Coordenadas de trabajo** | Sistema de referencia relativo definido por el usuario (comúnmente mediante el comando G54) para situar el origen en la pieza a mecanizar. |
| **Desplazamiento (Offset)** | Diferencia numérica aplicada a las coordenadas para compensar la longitud de la herramienta o la posición de la pieza. |
| **Eje de movimiento** | Cada una de las direcciones principales de desplazamiento de la máquina ( X , Y y Z para sistemas de tres ejes). |
| **Firmware** | Programa de bajo nivel que reside en el microcontrolador (GRBL) y convierte comandos lógicos en señales eléctricas para los motores. |
| **GRBL** | Firmware de código abierto diseñado para microcontroladores que ejecutan el control de movimiento de máquinas CNC de 3 ejes. |
| **Husillo (Spindle)** | Eje rotatorio motorizado que sujeta y hace girar la herramienta de corte a altas revoluciones por minuto. |
| **Interfaz Gráfica de Usuario (GUI)** | Entorno visual compuesto por elementos interactivos que permite al usuario controlar el software de manera intuitiva. |
| **Interpolación lineal** | Movimiento coordinado de dos o más ejes para seguir una trayectoria en línea recta entre dos puntos a una velocidad constante. |
| **Latencia** | Retraso temporal entre el envío de una instrucción desde la interfaz y la ejecución o respuesta por parte del hardware. |
| **Memoria Intermedia (Buffer)** | Espacio de almacenamiento temporal donde se guardan las instrucciones de Código G antes de ser procesadas para asegurar un movimiento fluido. |
| **Microcontrolador** | Circuito integrado programable que ejecuta las funciones de control lógico y procesamiento de señales en tiempo real del sistema. |
| **Paso por revolución** | Número de pulsos eléctricos necesarios para que un motor a pasos complete un giro de 360 grados, determinando la precisión del movimiento. |
| **Puerto serial (COM)** | Interfaz de comunicación de datos donde la información se transmite bit a bit de manera secuencial entre la computadora y el microcontrolador. |
| **Punto de referencia (Home)** | Posición fija y conocida de la máquina utilizada para establecer el sistema de coordenadas inicial mediante sensores de límite. |
| **Retroalimentación pedagógica** | Información contextual proporcionada por la interfaz para ayudar al estudiante a entender el efecto de sus comandos o la causa de un error. |
| **Tasa de baudios (Baud Rate)** | Velocidad de transmisión de datos en una comunicación serial, expresada en bits por segundo (ej. 115,200 baudios  para GRBL v1.1). |
| **Traductor de error semántico** | Componente de software que interpreta códigos numéricos de falla del firmware y los transforma en explicaciones en lenguaje natural. |
| **Trayectoria de herramienta** | Representación espacial de la ruta que seguirá la punta de la herramienta de corte durante el proceso de manufactura. |
| **Unidad de control** | Conjunto de elementos (software y hardware) que supervisa y dirige de forma integral las operaciones de la máquina CNC. |
| **Validación de Límites** | Proceso de verificación que asegura que las coordenadas solicitadas no excedan las dimensiones físicas del área de trabajo. |
| **Velocidad de Avance (Feed Rate)** | Rapidez con la que la herramienta se desplaza a través del material durante una operación de corte, usualmente en mm/min. |
| **Idle** | Estado en el que la máquina CNC está conectada y lista, pero no está ejecutando un programa ni comandos de movimiento, esperando una nueva instrucción. |
| **Run** | Estado activo en el que el controlador está ejecutando continuamente las líneas de código G desde el búfer, lo que resulta en el movimiento físico de la máquina. |
| **Hold** | Estado de pausa temporal de la ejecución de un programa G-code, manteniendo la posición y la cola de comandos para permitir una reanudación segura. |

## Abreviaturas {#abreviaturas}

| Abreviatura | Significado | Descripción |
| :---- | :---- | :---- |
| **API** | Interfaz de Programación de Aplicaciones | Conjunto de definiciones y protocolos que permiten la comunicación entre diferentes componentes de software. |
| **CAD** | Diseño Asistido por Computadora | Uso de software para crear, modificar o analizar representaciones gráficas de objetos físicos. |
| **CAM** | Manufactura Asistida por Computadora | Software que utiliza modelos CAD para generar las instrucciones (Código G) que controlan la máquina CNC. |
| **CNC** | Control Numérico por Computadora | Sistema que utiliza comandos programados para controlar el movimiento y operación de máquinas herramienta. |
| **ESCOM** | Escuela Superior de Cómputo | Unidad académica del IPN donde se desarrolla el presente Trabajo Terminal. |
| **GRBL** | (Firmware de código abierto de control) | Software que convierte el código G en movimientos para una máquina CNC. |
| **GUI** | Interfaz Gráfica de Usuario | Entorno visual que permite la interacción humana con la computadora mediante elementos gráficos (iconos, menús). |
| **IDE** | Entorno de Desarrollo Integrado | Aplicación que proporciona servicios integrales para facilitar el desarrollo y depuración de software. |
| **IPN** | Instituto Politécnico Nacional | Institución educativa rectora de la educación tecnológica pública en México. |
| **SO** | Sistema Operativo | Software principal que gestiona los recursos de hardware y provee servicios a los programas de aplicación. |
| **RPM** | Revoluciones por Minuto | Unidad de medida de la frecuencia de rotación, aplicada en este proyecto a la velocidad del husillo. |
| **UART** | Transmisor-Receptor Asíncrono Universal | Protocolo de comunicación serial utilizado para el intercambio de datos entre la computadora y el microcontrolador. |
| **USB** | Bus Serial Universal | Estándar de comunicación para conectar periféricos y transferir datos entre dispositivos electrónicos. |

## Resumen {#resumen}

En este proyecto, nuestro objetivo es desarrollar una interfaz de control lógico para máquinas CNC específicamente orientada a la educación.

La interfaz necesita funcionar en conjunto con controladores que utilicen Arduino Nano y el firmware GRBL versión 1.1. La idea es que los estudiantes puedan trabajar sin esfuerzo con las máquinas a través de la interfaz gráfica que debe funcionar en los sistemas operativos Windows 10 y 11\.

Esto les permitirá cargar los archivos G-code o M-code, ajustar los parámetros de operación, visualizar las trayectorias antes de procesarlas y luego controlar completamente el proceso de mecanizado. La razón de este problema es que el software industrial profesional es caro e inflexible en el Instituto Politécnico Nacional (IPN). 

A través de la provisión de una herramienta rentable y adaptada, buscamos abordar la brecha tecnológica y proporcionar a los estudiantes de mantenimiento, mecatrónica y manufactura digital a nivel medio superior (CECYT 'S) una experiencia práctica realista de automatización e Industria 4.0. 

Palabras clave: CNC, Arduino Nano, GUI, manufactura digital, interfaz de control, GRBL, G-code, educación técnica.

## 

## 

**Advertencia**

*“Este documento contiene información desarrollada por la Escuela Superior de Cómputo del Instituto Politécnico Nacional, a partir de datos y documentos con derecho de propiedad y por lo tanto, su uso quedará restringido a las aplicaciones que explícitamente se convengan.”* 

*La aplicación no convenida exime a la escuela de su responsabilidad técnica y da lugar a las consecuencias legales que para tal efecto se determinen.* 

*Información adicional sobre este reporte técnico podrá obtenerse en:* 

*La Subdirección Académica de la Escuela Superior de Cómputo del Instituto Politécnico Nacional, situada en Av. Juan de Dios Bátiz s/n Teléfono: 57296000, extensión 52000\.*

## 

## **Capítulo 1\. Antecedentes.**  {#capítulo-1.-antecedentes.}

### **1.1 Planteamiento del problema.** {#1.1-planteamiento-del-problema.}

La producción digital y el control numérico computarizado son las piedras angulares de la Industria 4.0. Pero el acceso a tales tecnologías también está severamente limitado en este entorno escolar, particularmente entre los estudiantes de instituciones académicas públicas como el Instituto Politécnico Nacional (IPN) que albergan tal entorno académico. Precio muy alto: las licencias de software industrial son una barrera de entrada alta para una gran parte de los laboratorios escolares\[1\] . Caja negra tecnológica: el software comercial es a menudo un producto de código cerrado, lo que dificulta que los estudiantes comprendan los aspectos lógicos de la comunicación serial y el análisis de comandos. Rigidez operativa: las interfaces industriales no tienen en cuenta los propósitos de enseñanza y no proporcionan explicaciones pedagógicas para errores y comandos. 

### **1.2 Solución propuesta.**  {#1.2-solución-propuesta.}

Se sugiere la creación de una interfaz gráfica de usuario (GUI) educativa multiplataforma (Windows 10 y 11\) y de código abierto. Esta es una solución con hardware Arduino Nano y compatibilidad con firmware GRBL 1.1 con un enfoque pedagógico mediante la implementación de un diccionario de comandos y un traductor de errores en lenguaje común. 

### **1.3 Objetivos.**  {#1.3-objetivos.}

#### 1.3.1 Objetivo general. {#1.3.1-objetivo-general.}

Desarrollar e implementar una Interfaz Gráfica de Usuario (GUI) de control CNC, de código abierto y multiplataforma, compatible con el firmware GRBL v1.1 y Arduino Nano, con un enfoque didáctico para mejor entendimiento de los códigos G para los estudiantes y así fortalecer la formación práctica de los estudiantes del IPN en los principios del uso y programación de máquinas CNC.

#### 1.3.2 Objetivos específicos. {#1.3.2-objetivos-específicos.}

* Construir una interfaz gráfica de usuario (GUI) multiplataforma bajo una arquitectura de capas desacopladas, integrando controles manuales de ejes  y la gestión dinámica de sistemas de coordenadas.  
* Integrar un motor de visualización (2D/3D) que permite la simulación previa de trayectorias (*Air-Cut*) y el monitoreo visual en tiempo real del progreso del proceso de mecanizado.  
* Validar la funcionalidad integral del sistema mediante pruebas con hardware real, asegurando la estabilidad de la arquitectura y generando la documentación técnica y manuales de usuario pertinentes.

### **1.4 Justificación.**  {#1.4-justificación.}

Este proyecto de interfaz de control CNC educativa es esencial para hacer accesible la tecnología de control numérico computarizado (CNC) a todos en el Instituto Politécnico Nacional (IPN). Su impacto se extiende más allá de la simple funcionalidad y apunta a la barrera impuesta por el software propietario. 

La disponibilidad libre de tal capacidad operativa reduce la necesidad de licencias costosas y limitantes. Esto permite que más estaciones de trabajo, laboratorios y talleres estén encendidos y operando en lo que respecta a la práctica CNC, aprovechando la infraestructura y haciendo la tecnología accesible a un mayor número de estudiantes y profesores incluso con un presupuesto ajustado. Este es un gran proyecto en términos de prueba y aprendizaje. Y une e integra una serie de disciplinas necesarias para la ingeniería moderna: ingeniería de software y desarrollo de interfaces: interfaz de usuario y lógica de control y programación para gestión de trayectorias y comandos G-code. Electrónica de potencia y control: desarrollar e implementar circuitos de interfaz y control de motores paso a paso o servomotores en la máquina CNC. Comunicaciones industriales y protocolos: construir mecanismos de comunicación robustos y de baja latencia entre el software de control y el hardware de la máquina. Mecánica, cinemática y diseño de máquinas: aprender la dinámica de los sistemas de movimiento, calibración de máquinas y fabricación. Esta transferencia de conocimientos asegura que los graduados del IPN que completen este modelo o accedan a él poseerán un perfil de habilidades altamente competitivo y multidisciplinario. Estarán mejor equipados no solo para operar, sino para construir, mantener y optimizar sistemas complejos y así convertirse en más profesionales y líderes en la generación de talento emergente para I4.0, donde la automatización, la interconectividad y la fabricación digital representan nuestras plataformas indispensables para el futuro. 

### **1.5 Organización del documento.**  {#1.5-organización-del-documento.}

*Capítulo 1\. Antecedentes del Proyecto y Justificación*

Este capítulo presenta el contexto y la justificación del proyecto. Fabricación Digital Actual: comienza con una visión general del estado de la Industria 4.0, el papel creciente de los sistemas de control numérico automatizado (CNC) y el problema con la educación de que los ingenieros no están capacitados para manejar dicha tecnología. Planteamiento del Problema en el IPN: el problema en las unidades académicas del Instituto Politécnico Nacional (IPN) está bien definido con un enfoque específico en la falta de disponibilidad de herramientas de control CNC que sean accesibles (de manera tangible y configurable) y que también sean pedagógicamente sólidas. Objetivos Generales y Específicos: estos son los objetivos generales.

El objetivo general es diseñar una interfaz de control CNC de código abierto y bajo costo. Los objetivos específicos incluyen la comunicación serial, la visualización de G-code en tiempo real, la interfaz de usuario intuitiva y la implementación pedagógica y validación del sistema. Relevancia Técnica y Social: En un intento de dar una razón de por qué esto es importante, se argumenta el proyecto. Técnicamente, se centra en desarrollar una solución robusta y modular basada en tecnologías ya ampliamente utilizadas. La justificación social es considerar cómo su impacto en la calidad de la enseñanza ayudará a los estudiantes a obtener una comprensión más profunda de los procesos de control numérico.

*Capítulo 2\. Estado del Arte:* 

Un Estudio de Soluciones de Control CNC. Comparativa impulsada por datos para la toma de decisiones de diseño, esta sección. Se revisan soluciones comerciales: Se exploran sus características, ventajas y limitaciones, prestando especial atención al costo, la complejidad de uso y las preocupaciones relacionadas con las licencias. Plataformas de control CNC de código abierto (por ejemplo, bCNC, Universal Gcode Sender (UGS), GrblPanel) incluyendo sus arquitecturas y lenguajes de programación, junto con una descripción de la comunidad que apoya a cada una. Comparación técnica y pedagógica: Se desarrolla una matriz de comparación sobre las soluciones evaluadas. Esta matriz demuestra la diferencia entre las métricas clave, como la curva de aprendizaje, y la facilidad de personalización del código fuente y la compatibilidad con múltiples firmwares de microcontroladores, así como la idoneidad para una condición de laboratorio educativo, para identificar oportunidades para el desarrollo de la interfaz como se propuso anteriormente.

*Capítulo 3\. Marco Teórico y Antecedentes Técnicos.* 

En este capítulo se explican las bases teóricas y la selección tecnológica del desarrollo. Principios Básicos del Lenguaje G-code y M-code: Se muestran instrucciones importantes de G-code y M-code para manipular la máquina, así como el control de funciones externas (husillo, refrigerante), que proporcionan una hoja de ruta sobre cómo el analizador de la interfaz necesitará interpretar estas instrucciones. 

Principios de Microcontroladores en CNC: Se discuten los microcontroladores (por ejemplo, Arduino/ATmega328P) como la columna vertebral del sistema de control (gestión de interrupciones, generación de pulsos de paso y dirección de los controladores de motores paso a paso, comunicación serial).

Análisis y Elección del Firmware GRBL v1.1: La elección de GRBL (versión 1.1) como el firmware estándar del microcontrolador está justificada. Sus justificaciones han sido todas sobre su alta eficiencia, naturaleza de código abierto, gestión del búfer de movimiento y popularidad en la educación y aplicaciones de bricolaje.

*Capítulo 4 Análisis de Requerimientos*

Requerimientos Funcionales: Se dan los requisitos funcionales que los usuarios necesitarán, incluyendo:

Carga y visualización de archivos G-code (extensión .nc). Control manual (jogging) de los ejes X, Y, Z. Inicio, pausa y detención de la ejecución. Visualización del progreso y posición actual de la herramienta (DRO \- Lectura Digital). Establecer la tasa de avance y la velocidad del husillo.

Requerimientos No Funcionales: Se establecen criterios de calidad y rendimiento como:

Comunicación: Tasa de baudios mínima requerida (por ejemplo, 115200\) y robustez en la gestión de la cola de comandos seriales. Procesamiento: Latencias máximas aceptables entre la generación de comandos y la respuesta del hardware. Usabilidad (UI/UX): Una interfaz gráfica de usuario amigable e intuitiva con gráficos claros, adecuada para un entorno educativo. Compatibilidad: Capacidad para ejecutarse en sistemas operativos comunes (Windows, Linux, macOS).

*Capítulo 5\. Diseño de Arquitectura de Software y Sistema.* 

La arquitectura de todo el sistema se ve en este capítulo y se describe un orden lógico de la solución internamente. Diagrama de arquitectura de tres capas: Se proporciona un diagrama de la separación del software en tres niveles.

Capa de Interfaz de Usuario: Presentación visual, evento de clic y entrada de datos. Capa de Lógica de Procesamiento (Núcleo de Software): El analizador de G-code, el gestor de comunicación serial, la lógica de gestión de estado, manejo de búfer. Capa de Acceso a Hardware/Datos: Interfaz de puerto serial, protocolo de apretón de manos y gestión de configuración persistente.

Flujos de Comunicación Serial (Protocolo GRBL) \-- Estas son las secuencias de cómo la interfaz se comunica con el firmware GRBL a través del puerto serial, como el despacho de comandos en flujo, gestión de retroalimentación de estado (Idle, Run, Hold), o manejo de alarmas y errores.

Modelo de Datos Central: Se definen entidades de datos importantes incluyendo la tabla de coordenadas (espacio de trabajo), cola de comandos pendientes y configuración (velocidades y pasos por mm).

*Capítulo 6\. Investigación y Selección de Firmware.* 

Este capítulo presenta un análisis comparativo profundo que justifica la elección de GRBL v1.1 como el núcleo de control del sistema, evaluando candidatos de alto impacto como Marlin y FluidNC en términos de eficiencia de memoria, gestión de aceleración y soporte comunitario. El estudio se centra en la optimización para microcontroladores ATmega328P, asegurando que la lógica de control sea capaz de procesar trayectorias complejas sin comprometer la estabilidad temporal. Asimismo, se detallan los parámetros críticos de configuración, tales como la relación de pasos por milímetro, velocidades de avance (feed rate) y límites de seguridad (soft y hard limits), los cuales son fundamentales para garantizar un funcionamiento preciso, seguro y pedagógicamente transparente en el entorno de aprendizaje.

### 

## **Capítulo 2\. Estado del arte** {#capítulo-2.-estado-del-arte}

### **2.1 Revisión** {#2.1-revisión}

El desarrollo de una Interfaz de Control para una máquina de Control Numérico Computarizado (CNC) educativa requiere un análisis exhaustivo del estado actual de las tecnologías y soluciones existentes en el mercado y la academia \[2\]. Este apartado detalla una revisión de las interfaces de control CNC más relevantes, tanto comerciales como de código abierto, haciendo hincapié en sus características, arquitecturas, metodologías de interacción y su aplicabilidad o adaptabilidad a un entorno de aprendizaje.

### **2.2 Interfaces comerciales dominantes:** {#2.2-interfaces-comerciales-dominantes:}

* **Siemens Sinumerik:** Reconocida por su robustez, ofrece interfaces altamente profesionales y complejas \[3\]. Su enfoque está en la eficiencia y la programación avanzada, utilizando pantallas táctiles y paneles de operación dedicados. Aunque son un estándar industrial, su coste y complejidad las hacen poco accesibles para un entorno educativo inicial.   
* **Fanuc:** Líder en el mercado, sus interfaces se caracterizan por una curva de aprendizaje bien definida en el sector profesional \[4\]. Presentan menús jerárquicos y un gran enfoque en la programación a pie de máquina (conversacional). Su modelo de interacción está muy ligado al uso de teclados físicos y botones dedicados.   
* **Heidenhain TNC:** Especialmente popular en el ámbito de fresadoras, destaca por sus interfaces gráficas intuitivas y su programación conversacional con soporte gráfico \[5\]. Ofrecen una buena visualización de la trayectoria de la herramienta y son un referente en facilidad de uso, pero mantienen una estructura de alto rendimiento industrial. 

### **2.3  Soluciones de código abierto y educativas:** {#2.3-soluciones-de-código-abierto-y-educativas:}

* **Mach3/Mach4 (ArtSoft):** Si bien no son completamente de código abierto, han sido interfaces populares para proyectos de CNC de bajo coste y hobbistas \[6\]. Su principal limitación es su arquitectura basada en Windows y el uso de un puerto paralelo (en el caso de Mach3), aunque Mach4 ha mejorado la conectividad y modularidad. Su interfaz es altamente configurable, lo que la hace útil para entornos de experimentación, pero a menudo carece de la pedagogía explícita de una herramienta educativa.   
* **LinuxCNC (anteriormente EMC2):** La solución de código abierto más potente y flexible. Utiliza el kernel de Linux con extensiones de tiempo real (RTOS) para garantizar la precisión temporal \[7\]. Ofrece una amplia gama de interfaces gráficas (AXIS, Gmoccapy, etc.) y una capacidad de personalización casi ilimitada. Es una base excelente para un proyecto educativo debido a su transparencia y la posibilidad de modificar el código fuente, permitiendo a los estudiantes entender la lógica de control. Sin embargo, su configuración inicial puede ser compleja.   
* **GRBL (para microcontroladores):** Una solución minimalista y muy popular para CNC de pequeña escala, basada en microcontroladores (como Arduino). Su interfaz de control es típicamente un "controlador de puerto serial" ejecutándose en una PC (como Universal Gcode Sender o Candle), que simplemente envía comandos G-code \[8\]. Representa un excelente punto de partida para entender la comunicación y el control de bajo nivel. 

### **2.4 Tendencias actuales en interfaz de control CNC:** {#2.4-tendencias-actuales-en-interfaz-de-control-cnc:}

Las tendencias recientes se centran en la usabilidad, la conectividad y la digitalización \[9\]: 

1. Interacción táctil y gráfica: Transición de teclados físicos a pantallas táctiles de alta resolución, facilitando la interacción con modelos 3D y simulaciones en tiempo real.  
2. Web y movilidad: Desarrollo de interfaces basadas en  web (HTML5, JavaScript, WebSockets), permitiendo el control y monitoreo remoto desde cualquier dispositivo y simplificando la instalación del *software* de la interfaz.  
3. Realidad aumentada/virtual (AR/VR): Uso inicial de Realidad Aumentada para superponer información de producción o mantenimiento directamente sobre la máquina, mejorando la capacitación y el diagnóstico.  
4. **Integración de IoT y análisis de datos:** Conexión de las máquinas a la nube para la recopilación de datos de producción (condición de la herramienta, consumo de energía) y el mantenimiento predictivo \[10\].   
     
   

### **2.5 Comparativa de interfaces:** {#2.5-comparativa-de-interfaces:}

La selección de la interfaz de control adecuada es un paso fundamental en el desarrollo de un sistema de control numérico computarizado (CNC) educativo, ya que esta define la experiencia del usuario, la facilidad de uso, la curva de aprendizaje y, en última instancia, la efectividad didáctica del sistema. Para tomar una decisión informada, se ha realizado un análisis exhaustivo de diversas interfaces de control existentes en el mercado, abarcando tanto soluciones comerciales como desarrollos de código abierto.

La tabla comparativa que se presenta a continuación condensa las características clave, ventajas y desventajas de las opciones más relevantes, centrándose en criterios cruciales para un entorno educativo:

|  | Solución 1: Mach3/Mach4 | Solución 2: GRBL \+ Universal G-Code Sender (UGS)/Candle | Solución 3: LinuxCNC (EMC2) | Solución 4: Interfaz web (propuesta de desarrollo) |
| ----- | ----- | ----- | ----- | ----- |
| Arquitectura | Propietaria, basada en Windows. Requiere un puerto paralelo o una tarjeta controladora externa especializada. | Código abierto. Basada en firmware para microcontroladores (ej. Arduino Uno) y software host en PC (multiplataforma). | Código abierto. Basada en Linux (distribución dedicada). Requiere hardware específico para tiempo real. | Propuesta de desarrollo. Basada en una arquitectura *cliente-servidor* (navegador web y servidor de control). |
| Facilidad de uso (nivel educativo) | Intermedia a Alta. Estándar industrial, pero con múltiples configuraciones complejas para usuarios novatos. | Alta. Interfaz de usuario sencilla y enfocada en lo esencial (ejecución de G-Code). Excelente para iniciación. | Intermedia a Baja. Curva de aprendizaje más pronunciada debido a su enfoque altamente configurable y sistema operativo subyacente. | Alta. Se puede diseñar con una ergonomía y flujo de trabajo optimizados específicamente para fines didácticos. |
| Costo | Alto (Licencia de software \+ posible hardware adicional). | Muy Bajo (Firmware gratuito \+ hardware de bajo costo como Arduino). | Bajo (Software gratuito, solo costo del hardware). | Medio a Bajo (Costo de desarrollo inicial, bajo costo de licenciamiento/uso). |
| Tiempo real y precisión | Muy Buena. Control de movimiento optimizado. Depende del hardware utilizado. | Buena. Limitada por la capacidad del microcontrolador y la comunicación serial. Aceptable para máquinas pequeñas y educativas. | Excelente. Sistema operativo en tiempo real que garantiza alta precisión y control de baja latencia. | Potencialmente Buena. Depende de la tecnología de comunicación backend (ej. WebSockets) y el *hardware* de control subyacente. |
| Personalización y extensibilidad | Baja a Media. Limitada por la naturaleza propietaria, aunque permite *plugins* y *scripts*. | Alta. Código fuente abierto tanto para el firmware (GRBL) como para el software host. Muy popular en la comunidad *DIY*. | Muy Alta. Altamente configurable a través de archivos INI, *HAL* (Hardware Abstraction Layer) y *Python scripts*. | Muy Alta. Control total sobre el *frontend* (HTML/CSS/JS) y el *backend*, permitiendo la integración de módulos educativos específicos. |

##### **1.1 tabla comparativa de interfaces** {#1.1-tabla-comparativa-de-interfaces}

### **2.6 Análisis comparativo:** {#2.6-análisis-comparativo:}

El análisis comparativo revela que si bien soluciones industriales como Mach3/Mach4 ofrecen robustez y LinuxCNC ofrece el mejor control en tiempo real, su complejidad y costo pueden ser barreras significativas en un entorno educativo. Por otro lado, la combinación GRBL \+ Software Host es excelente por su bajo costo y simplicidad, pero está limitada en la complejidad de las máquinas que puede controlar y en la personalización de la interfaz de usuario.

El desarrollo de una Interfaz Gráfica de Usuario (GUI) de desarrollo propio con Python \[11\] emerge como la solución más prometedora para el proyecto de CNC Educativa. Esta alternativa, basada en la implementación de un software host personalizado, permite: 

1. Diseño Centrado en la Pedagogía: La interfaz puede ser diseñada desde cero priorizando la usabilidad y la integración de elementos didácticos (visualizaciones, feedback simplificado, modo paso a paso).  
2. Accesibilidad Multiplataforma: Al ser implementada con Python (Tecnología Cross-Platform), la interfaz es compatible con los sistemas operativos de escritorio definidos (Windows 10 y 11), simplificando su distribución en entornos académicos.  
3. Extensibilidad y Modularidad: Permite una fácil expansión futura para añadir módulos de simulación, diagnóstico o incluso tutoriales interactivos directamente en la interfaz.  
4. Control Moderno: Puede aprovechar arquitecturas de control backend probadas (como GRBL o Marlin) pero presenta una capa de interacción frontend completamente nueva y optimizada.

Por consiguiente, la estrategia se enfocará en el desarrollo de una interfaz de control con tecnología Python, buscando armonizar la robustez funcional necesaria para el control CNC con la sencillez didáctica fundamental para el proceso de enseñanza.

## 

## **Capítulo 3\. Marco Teórico** {#capítulo-3.-marco-teórico}

El desarrollo de una interfaz de control para máquinas de Control Numérico Computarizado (CNC) requiere una comprensión formal de las tecnologías subyacentes que permiten la comunicación entre el software de interfaz y el hardware de ejecución. A continuación, se establecen los principios teóricos y tecnológicos que sustentan la arquitectura del sistema \[12\]. 

### **3.1. Fundamentos del lenguaje G-code y M-code**  {#3.1.-fundamentos-del-lenguaje-g-code-y-m-code}

El funcionamiento de los sistemas CNC se basa en la interpretación de secuencias de comandos estandarizados que dictan el comportamiento espacial y operativo de la máquina herramienta. Estos comandos se dividen principalmente en dos categorías esenciales \[13\]: 

* **Código G (G-code):** Constituye el lenguaje de programación numérico principal que contiene las instrucciones de movimiento y acciones de la herramienta. Comandos como la interpolación lineal o circular definen las trayectorias exactas que la herramienta de corte seguirá a lo largo de los distintos ejes de movimiento de la máquina. Estas directrices también establecen el sistema de coordenadas de trabajo y la velocidad de avance (Feed Rate) requerida para el desplazamiento a través del material.  
* **Código M (M-code):** Abarca las instrucciones auxiliares que controlan funciones de la máquina que no involucran directamente el desplazamiento espacial de los ejes. Incluye comandos operativos esenciales, tales como el encendido y control de las revoluciones por minuto del husillo rotatorio (Spindle), y la activación de los sistemas de enfriamiento.  
* **Proceso de análisis sintáctico (Parser):** Para que una Interfaz Gráfica de Usuario (GUI) interactúe correctamente con estos lenguajes, se requiere un módulo de software encargado de descomponer las líneas de instrucciones de texto en datos estructurados. Este componente procesa y valida sintácticamente los datos antes de permitir su transmisión, garantizando un flujo de instrucciones seguro hacia la máquina \[14\]. 

### **3.2. Principios de funcionamiento de microcontroladores en CNC** {#3.2.-principios-de-funcionamiento-de-microcontroladores-en-cnc}

En las arquitecturas orientadas al ámbito de manufactura educativa y de código abierto, el microcontrolador actúa como el núcleo del sistema de control. Plataformas basadas en circuitos integrados programables, como el Arduino Nano, asumen la responsabilidad de ejecutar las funciones de control lógico en tiempo real \[15\]: 

* **Gestión de Controladores de Potencia (Drivers):** El microcontrolador traduce los comandos numéricos en señales eléctricas físicas. Emite pulsos sincronizados hacia los controladores de potencia (*drivers*), los cuales actúan como puente físico suministrando la corriente eléctrica necesaria para el movimiento de los motores paso a paso.  
* **Interrupciones y Tiempo Real:** La precisión del proceso depende del determinismo temporal. El procesamiento de señales en tiempo real gestiona las frecuencias necesarias para que cada componente físico (ejes X, Y, Z) alcance las coordenadas máquina establecidas sin pérdida de posición.  
* **Comunicación Serial:** El intercambio de datos entre la computadora central y el microcontrolador se efectúa mediante una interfaz de comunicación por puerto serial (COM/UART). La información se transmite de manera secuencial, bit a bit, a una velocidad definida por la tasa de baudios (Baud Rate), estableciendo el enlace primario para el control de la máquina \[16\]. 

### **3.3. Análisis y selección del firmware GRBL v1.1** {#3.3.-análisis-y-selección-del-firmware-grbl-v1.1}

El firmware constituye el programa de bajo nivel que reside dentro del microcontrolador y convierte directamente los comandos lógicos en impulsos mecánicos. En el ecosistema de control de 3 ejes, el firmware GRBL se posiciona como una solución óptima y estandarizada \[17\]. 

* **Planificación de Trayectorias y Manejo de Búferes:** GRBL emplea un esquema de memoria intermedia (*buffer*) como espacio de almacenamiento temporal para las instrucciones entrantes de Código G. Esto permite al firmware planificar con antelación las aceleraciones y desaceleraciones, asegurando un movimiento fluido y constante a lo largo de la trayectoria de manufactura.  
* **Telemetría y Estado del Sistema:** La versión 1.1 implementa mecanismos de retroalimentación de alto rendimiento. Permite consultar el estado absoluto de la máquina, las coordenadas de trabajo, la posición de referencia (*Home*) y los límites físicos, proveyendo a la interfaz de una capacidad de visualización y digitalización en tiempo real.  
* **Traducción Semántica y Pedagogía:** El firmware gestiona códigos de alarma y errores operativos internos. La interfaz integra un traductor de error semántico que interpreta estas fallas numéricas para transformarlas en explicaciones claras en lenguaje natural, cumpliendo así con el objetivo de proporcionar una retroalimentación pedagógica contextual que facilite la comprensión del estudiante \[18\].

## 

## **Capítulo 4\. Análisis de requerimientos**

El análisis de requerimientos define las capacidades técnicas y operativas necesarias para garantizar que la interfaz cumpla con su propósito didáctico y funcional.

### **4.1 Requerimientos funcionales (RF)** {#4.1-requerimientos-funcionales-(rf)}

| ID | Requerimiento | Descripción Detallada |
| :---- | :---- | :---- |
| RF-01 | Comunicación Serial | El sistema debe detectar automáticamente los puertos COM disponibles y permitir la conexión con el Arduino Nano a una tasa de 115200 baudios. |
| RF-02 | Intérprete G-Code | Procesar y validar archivos.nc y .gcode, identificando comandos de movimiento (G0, G1, G2, G3) y comandos auxiliares (M3, M4, M5). |
| RF-03 | Control de Ejes (Jogging) | Proporcionar una interfaz táctil o de teclado para mover los ejes X, Y y Z en pasos discretos (0.1, 1, 10, 100mm) o movimiento continuo. |
| RF-04 | Visualización 2D/3D | Renderizar la trayectoria del archivo cargado antes de la ejecución y mostrar la posición de la herramienta en tiempo real durante el mecanizado. |
| RF-05 | Gestión de Coordenadas | Permitir el cambio entre Coordenadas de Máquina (MCS) y de Trabajo (WCS), permitiendo establecer el "Cero Pieza" (G10 L20 P1) en cualquier punto. |
| RF-06 | Ciclo de Homing | Ejecutar la rutina de búsqueda de límites físicos (\$H) para sincronizar la posición lógica del software con la posición física de la máquina. |
| RF-07 | Parada de Emergencia | Botón de software que envía el comando de interrupción inmediata  y detiene el movimiento. |
| RF-08 | Consola de Diagnóstico | Terminal interactiva para enviar comandos \$ de configuración y recibir reportes de estado detallados. |
| RF-09 | Control de Periféricos | Interfaz para regular la velocidad (PWM) del husillo o la intensidad del láser mediante comandos S (Speed). |
| RF-10 | Historial de Trabajo | Registro de eventos que almacene el tiempo de ejecución, líneas procesadas y posibles errores. |
| RF-11 | Modo de Simulación (Air-Cut) | Permitir la ejecución del código de forma virtual sin enviar señales de potencia a los motores para verificar la lógica antes del corte real. |
| RF-12 | Diccionario G-Code Integrado | Al seleccionar una línea de código, la interfaz debe mostrar una breve explicación de qué hace ese comando específico (ej: G01 \= Movimiento Lineal Controlado). |
| RF-13 | Interpretador Semántico de Errores | En lugar de mostrar códigos numéricos (Error 20), el sistema debe traducir el error a lenguaje natural (ej: "Se ha excedido el límite suave del eje X"). |
| RF-14 | Asistente de Calibración | Interfaz guiada paso a paso para el cálculo de pasos por milímetro basada en mediciones físicas del usuario. |

##### **1.2 tabla Análisis de Requerimientos** {#1.2-tabla-análisis-de-requerimientos}

### 

### 

### **4.2 Requerimientos no funcionales (RNF)**

| ID | Categoría | Requerimiento | Descripción |
| :---- | :---- | :---- | :---- |
| RNF-01 | sistema operativo  | plataforma | La aplicación debe ser funcional en Windows 10/11 |
| RNF-02 | Usabilidad | Diseño Educativo | La interfaz debe incluir "Tooltips" o globos informativos que expliquen la función de cada botón al pasar el cursor. |
| RNF-03 | Eficiencia | Gestión de Latencia | El ciclo de actualización de la posición en pantalla no debe exceder los 250ms. |
| RNF-04 | Confiabilidad | Tolerancia a Fallos | Si la comunicación serie se interrumpe, el software debe parar y entrar en estado de espera de reconexión. |
| RNF-05 | Seguridad | Bloqueos Lógicos | El software debe impedir el inicio si no hay conexión exitosa o si hay una alarma activa. |
| RNF-06 | Aprendizaje | Tutoriales "In-App" | Inclusión de un flujo de bienvenida guiado para que el alumno aprenda a conectar y mover la máquina en su primer uso. |
| RNF-07 | Mantenibilidad | Código Comentado | El código fuente debe seguir estándares de documentación para que sea legible por otros estudiantes y docentes. |
| RNF-08 | Localización | Multi-idioma | Soporte inicial para español e inglés, configurable desde ajustes. |

##### **1.3 tabla Análisis de Requerimientos no funcionales** {#1.3-tabla-análisis-de-requerimientos-no-funcionales}

### 

### **4.3 Análisis de riesgos** {#4.3-análisis-de-riesgos}

Se presenta una matriz de riesgos categorizada para el desarrollo y despliegue de la interfaz educativa.

| ID | Riesgo | Categoría | Probabilidad | Plan de Mitigación |
| :---- | :---- | :---- | :---- | :---- |
| R1 | Incompatibilidad con versiones de GRBL | Técnico | Media | Estandarizar el desarrollo exclusivamente para GRBL v1.1 y realizar pruebas de comunicación serial rigurosas. |
| R2 | Latencia en la visualización 3D en tiempo real | Técnico | Media | Optimizar el renderizado mediante el uso de librerías eficientes y procesar el Código G por bloques. |
| R3 | Curva de aprendizaje elevada para el usuario final | Educativo | Baja | Realizar pruebas de usabilidad con alumnos de los primeros semestres y ajustar la interfaz según su retroalimentación. |
| R4 | Desincronización entre la interfaz y el estado real de la máquina | Técnico | Baja | Implementar un sistema de consultas periódicas al estado de GRBL para actualizar la interfaz. |
| R5 | Errores en la interpretación de comandos personalizados | Educativo | Media | Crear una base de datos exhaustiva de comandos G y M con descripciones claras en español. |

##### **1.4 tabla análisis de riesgos** {#1.4-tabla-análisis-de-riesgos}

### 

### **4.4 Factibilidad técnica** {#4.4-factibilidad-técnica}

El proyecto de la Interfaz de Control CNC Educativa presenta una alta factibilidad.  
La viabilidad se apoya  en la compatibilidad con el firmware estándar GRBL, la accesibilidad y bajo costo de la plataforma Arduino Nano, y la robustez de Python como lenguaje de desarrollo multiplataforma. Esto minimiza los riesgos técnicos y de implementación, asegurando que los requerimientos de control y comunicación serial con la máquina CNC sean plenamente satisfechos con las herramientas actuales.

| Componente | Descripción |
| ----- | ----- |
| Sistema Operativo | Windows 10 o 11 |
| Procesador | Doble núcleo (ej. Intel Core 2 Duo o similar). Suficiente para la lógica de la interfaz y la visualización 2D/3D. |
| Memoria RAM | 2 GB (Mínimo requerido para ejecutar el SO y el entorno Python con la GUI). |
| Almacenamiento | 500 MB de espacio libre. Necesario para la instalación del entorno Python y el código de la interfaz. |
| Puertos | 1 Puerto USB disponible. Necesario para establecer la comunicación serial con el Arduino/CNC. |

##### **1.5  tabla de Requisitos de la Computadora (Mínimos)** {#1.5-tabla-de-requisitos-de-la-computadora-(mínimos)}

| Requisito/Componente | Descripción |
| ----- | ----- |
| Intérprete Python (v3.x recomendado) | Lenguaje de programación principal del proyecto. |
| Librerías Python: PySerial | Obligatoria para la comunicación con el puerto COM. |
| Librerías Python: Librería de GUI (Ej. Tkinter/PyQt/Kivy) | Necesaria para la creación de la interfaz gráfica (RNF-02). |
| Librerías Python: Librería Gráfica (para RF-04) | Para la pre-visualización de trayectorias 2D/3D. |

##### **1.6  tabla de Requisitos de Software para el desarrollo de la interfaz** {#1.6-tabla-de-requisitos-de-software-para-el-desarrollo-de-la-interfaz}

Justificación del Uso de las Tecnologías:

* Intérprete Python (v3.0): Se eligió Python por su sintaxis limpia y legible, lo que facilita el mantenimiento del código por parte de la comunidad académica y es ideal para un entorno educativo. Su naturaleza multiplataforma satisface el RNF-01 (sistema operativo ), asegurando la compatibilidad en Windows y otros sistemas operativos.  
* Librerías Python:   
  PySerial: Es la librería estándar de facto en Python para la comunicación serial (RF-01). Su implementación es robusta y probada para manejar la alta tasa de baudios (115200) requerida por el *firmware* GRBL, garantizando un intercambio de datos fiable y de baja latencia (RNF-03).  
* Librerías Python:   
  Librería de GUI (Ej. Tkinter/PyQt/Kivy): Se opta por una librería que permite crear una GUI amigable e intuitiva (RNF-02). La elección final (por ejemplo, PyQt o Kivy) se hará buscando la mejor capacidad para ofrecer una experiencia de usuario moderna y la integración eficiente de elementos gráficos para fines didácticos.  
* Librerías Python:   
  Librería Gráfica ( RF-04 ): Es esencial para la función educativa principal. Una librería de visualización (ej. Matplotlib o PyOpenGL si se requiere 3D) permitirá al estudiante simular la trayectoria del G-code antes de la ejecución real (*Air-Cut* \- RF-11), validando visualmente el proceso y reduciendo el riesgo de errores en la máquina.


### **4.5 Viabilidad económica** {#4.5-viabilidad-económica}

Esta sección proporciona detalles sobre la inversión económica, que no se limita solo a los costos directos asociados con el desarrollo de la propiedad intelectual del sistema y la configuración del entorno de desarrollo, sino que también abarca los recursos financieros necesarios para asegurar la estabilidad presente y futura del proyecto \[1\]. Esto incluye desgloses de costos para licencias de software individuales, compras de hardware para simulaciones y pruebas, y la remuneración del equipo de ingeniería encargado del diseño e implementación de la interfaz de control CNC \[19\]. Asimismo, se contempla la inversión en asesoría legal para la protección formal de la propiedad intelectual del proyecto, incluyendo el registro de programas de cómputo ante la autoridad competente y, en caso de corresponder, mecanismos de protección industrial complementarios \[20\]. También se considera la elaboración de documentación técnica integral como parte del activo del proyecto, ya que una adecuada gestión de la inversión inicial resulta determinante para establecer el marco tecnológico, operativo y legal que permita una explotación comercial viable de la Interfaz de Control CNC \[1\], \[20\].

#### **4.5.1 Costos de mano de obra (capital humano)** {#4.5.1-costos-de-mano-de-obra-(capital-humano)}

El cálculo se basa en el esfuerzo técnico requerido para las dos áreas principales del sistema durante un periodo aproximado de 10 meses (dos semestres académicos).

| Rol | Horas Estimadas | Costo por Hora (MXN) | Total (MXN) |
| :---- | :---- | :---- | :---- |
| Desarrollador de Interfaz (Capa de Presentación) | 400 | \$150.00 | \$60,000.00 |
| Desarrollador de Lógica y Control (Capa de Procesamiento) | 450 | \$150.00 | \$67,500.00 |
| Subtotal Mano de Obra | 850 horas |  | \$127,500.00 |

##### **1.7  tabla de Costos de Mano de Obra**  {#1.7-tabla-de-costos-de-mano-de-obra}

### **4.5.2 Justificación de las horas de desarrollo** {#4.5.2-justificación-de-las-horas-de-desarrollo}

* La estimación de **850 horas hombre** para el desarrollo del proyecto se definió considerando las actividades técnicas necesarias para el diseño, implementación, validación y documentación de la interfaz de control CNC educativa. Dado que el sistema integra comunicación con hardware, procesamiento de instrucciones G-code, visualización gráfica y funciones orientadas al aprendizaje, se consideró una distribución del tiempo acorde con la complejidad de cada módulo.  
* **Investigación y diseño de arquitectura (100 horas):**  
   en esta etapa se contempla el análisis del funcionamiento del firmware GRBL, el estudio del protocolo de comunicación serial entre el software y el controlador CNC, así como la definición de la arquitectura general del sistema. También se incluye el diseño inicial de la interfaz gráfica y la planeación de los módulos funcionales que conforman la aplicación.  
* **Desarrollo de la capa de procesamiento lógico (250 horas):**  
   corresponde a la implementación del núcleo funcional del sistema, incluyendo el análisis e interpretación de archivos G-code, validación de instrucciones, gestión de coordenadas de trabajo, control de límites operativos y procesamiento de mensajes provenientes del controlador CNC. Esta fase representa una de las cargas más importantes debido a la lógica requerida para garantizar un funcionamiento seguro y coherente.  
* **Desarrollo de la interfaz gráfica y entorno visual (250 horas):**  
   esta etapa comprende la construcción de la interfaz de usuario, integración de paneles de control manual, consola de diagnóstico, monitoreo del estado de la máquina, visualización de trayectorias y herramientas de asistencia orientadas al aprendizaje del usuario. Se considera una carga considerable debido a la integración entre la parte visual y la respuesta dinámica del sistema.  
* **Pruebas, depuración y optimización (150 horas):**  
   incluye la ejecución de pruebas funcionales sobre la comunicación serial, validación de comandos enviados al controlador, detección y corrección de errores de comportamiento, así como ajustes de rendimiento relacionados con estabilidad general y respuesta visual del sistema.  
* **Documentación técnica del proyecto (100 horas):**  
   comprende la elaboración de manuales de usuario, documentación técnica del desarrollo realizado, diagramas de diseño, registros de pruebas, reportes de avance y la integración de la documentación requerida para la entrega formal del Trabajo Terminal.  
* **Total estimado: 850 horas hombre.**

### **4.6 Recursos tecnológicos**

| Concepto | Descripción | Costo de Uso (MXN) |
| :---- | :---- | :---- |
| Equipo de Cómputo | Estación de trabajo para desarrollo y pruebas | \$0.00 (Propio) |
| Entorno de Desarrollo | Visual Studio Code / Python 3.x (Código Abierto) | \$0.00 |
| Servicios de Energía e Internet | Proporcional a 10 meses de desarrollo | \$8,500.00 |
| **Subtotal Recursos** |  | **\$8,500.00** |

##### **1.8 Tabla de Recursos Tecnológicos**  {#1.8-tabla-de-recursos-tecnológicos}

### 

### **4.7 Resumen de inversión en software** {#4.7-resumen-de-inversión-en-software}

* La inversión estimada para el desarrollo de la interfaz de control CNC educativa asciende a **\$136,000.00 MXN**, considerando tanto el tiempo de desarrollo técnico como los recursos operativos necesarios durante el periodo de construcción del proyecto.  
* El componente de mayor peso corresponde al **desarrollo del software**, con un costo aproximado de **\$127,500.00 MXN**, calculado con base en las **850 horas hombre estimadas para el proyecto**, considerando actividades de análisis, diseño, programación, pruebas, corrección de errores y elaboración de documentación técnica. Para efectos de estimación económica, se consideró una tarifa promedio de trabajo de desarrollo equivalente a **\$150.00 MXN por hora**.  
* Adicionalmente, se contempla una inversión de **\$8,500.00 MXN** asociada a recursos tecnológicos y gastos operativos requeridos durante el desarrollo, incluyendo consumo eléctrico, servicio de internet, uso del equipo de cómputo y otros recursos indirectos necesarios para la ejecución continua del proyecto durante los **10 meses estimados de trabajo**.  
* De esta manera, el presupuesto total integra tanto el esfuerzo humano especializado como los recursos materiales mínimos requeridos para la implementación del sistema.

## 

## **Capítulo 5\. Diseño de arquitectura (GUI \+ Backend)**

La implementación del software se basa en una arquitectura de capas completamente desacopladas con el objetivo primordial de garantizar la mantenibilidad, extensibilidad y robustez del sistema a largo plazo.

Esta separación de responsabilidades se logra al dividir el sistema en capas bien definidas (como la capa de presentación/UI, la capa de lógica de negocio y la capa de acceso a datos/hardware), donde cada una opera de forma independiente y se comunica a través de interfaces claras.

El desacoplamiento ofrece varias ventajas críticas:

1. Facilita el desarrollo y la modificación: Los cambios en una capa (por ejemplo, actualizar la interfaz de usuario) no requieren modificaciones en otras capas (como la lógica del CNC), minimizando el riesgo de introducir errores y acelerando el ciclo de desarrollo.  
2. Asegura la mantenibilidad: Permite a los desarrolladores aislar y corregir problemas de manera más eficiente, ya que la fuente del error se localiza más fácilmente dentro de una capa específica.  
3. Promueve la extensibilidad: Nuevas funcionalidades o el soporte para diferente hardware pueden ser añadidos como nuevas capas o módulos sin alterar la base del código existente.

### **5.1 Arquitectura de capas del sistema de control CNC educativo** {#5.1-arquitectura-de-capas-del-sistema-de-control-cnc-educativo}

      La arquitectura del sistema se ha diseñado siguiendo un enfoque de capas bien definidas, lo que facilita la modularidad, el mantenimiento y la escalabilidad. A continuación, se detallan las responsabilidades y componentes clave de cada una de estas capas:

1. Capa de presentación (Frontend/interfaz de usuario):  
   * Dashboard de Control: Es la interfaz principal con la que interactúa el usuario. Permite el envío de comandos G-Code, la visualización del estado actual de la máquina (coordenadas, velocidad de avance, estado de la herramienta) y la gestión de archivos.  
   * Visualizador de Trayectorias (Canvas 2D/3D): Componente esencial para la experiencia educativa. Representa gráficamente la trayectoria que la herramienta de corte *va* a seguir (simulación previa) y la trayectoria que *está* siguiendo (visualización en tiempo real). Utiliza tecnologías de renderizado 2D y 3D para ofrecer una comprensión clara del proceso de mecanizado.

2. Capa de ayuda y educación (Módulo Transversal):  
   * Diccionario de comandos G-Code: Un recurso educativo integrado que provee una referencia rápida y detallada de todos los comandos G-Code soportados, incluyendo su sintaxis, parámetros y función. Esto es fundamental para el aprendizaje guiado.  
   * Traducciones de Errores Semánticos: Este módulo intercepta y traduce los mensajes de error crípticos o técnicos generados por el procesador G-Code (Backend) o la máquina (Hardware) en explicaciones pedagógicas y sugerencias de corrección comprensibles para un estudiante.  
3. Capa de Lógica (Backend/Servidor de Aplicación):  
   * *G-Code Processor* (Procesador G-Code): El núcleo lógico del sistema. Su principal función es:  
     * Analizador de Sintaxis: Valida que el código G-Code ingresado cumpla con la estructura gramatical y los comandos soportados, identificando errores sintácticos antes del envío a la máquina.  
     * Estimador de tiempos: Calcula de manera aproximada la duración total de la ejecución del programa G-Code, basándose en las velocidades de avance (F) especificadas y la longitud de las trayectorias.  
   * *Monitor de estado:* Un subsistema crítico implementado como un hilo de ejecución independiente.  
     * Función: realiza una consulta cíclica y persistente al *firmware* de la máquina CNC (e.g., Arduino/Grbl) para obtener información actualizada sobre las coordenadas actuales, el estado de los *buffers* de comunicación y posibles alarmas.  
     * Frecuencia: esta consulta se ejecuta rigurosamente cada 200ms, garantizando una retroalimentación de estado casi en tiempo real y precisa para la Capa de Presentación.  
4. Capa de comunicación (Conexión Hardware):  
   * Transmisor basado en el protocolo *character-counting*: Es la implementación del protocolo de comunicación serial diseñado para la transferencia robusta y controlada del G-Code hacia el microcontrolador (Arduino u otra placa de control).  
   * Objetivo: Su función primordial es evitar el desbordamiento del *buffer* de recepción del hardware de control de la máquina. Lo logra contando los caracteres de la línea enviada y esperando una señal de confirmación (*OK*) de la máquina antes de enviar la siguiente línea, asegurando que el *buffer* siempre tenga espacio disponible y manteniendo un flujo de datos constante y seguro.

### **5.2 Diagrama de secuencia** {#5.2-diagrama-de-secuencia}

![][image1]

##### **1.9 tabla de Diagrama de secuencia** {#1.9-tabla-de-diagrama-de-secuencia}

### 

### 

### 

### 

### 

### 

### 

### **5.3 Tabla de mensajes** {#5.3-tabla-de-mensajes}

A continuación en la Tabla 1.10  se presentan los mensajes de interacción y las reacciones del sistema correspondientes a diversas acciones realizadas por el usuario. Cada mensaje incluye tanto la respuesta visual que se le mostrará al usuario como la acción que el sistema llevará a cabo para asegurar una experiencia fluida en la interfaz.

| ID | Condición | Mensaje | Reacción del sistema |
| ----- | ----- | ----- | ----- |
| MSJ\_01 | Inicio de la aplicación | Bienvenido al sistema de control CNC educativo. Selecciona un puerto para comenzar. | El sistema escanea automáticamente los puertos COM disponibles y habilita el panel de conexión. |
| MSJ\_02 | No se detectan puertos seriales | No se encontraron dispositivos CNC conectados. Verifica la conexión USB. | Se mantiene bloqueado el botón de conexión y se ofrece opción de reintentar búsqueda. |
| MSJ\_03 | Conexión exitosa con GRBL | Conexión establecida correctamente con el controlador CNC. | El sistema obtiene versión de firmware, desbloquea controles manuales y actualiza estado a "Conectado". |
| MSJ\_04 | Firmware incompatible | Se detectó una versión de firmware no compatible con esta interfaz. | Se restringe el acceso a funciones críticas hasta validar compatibilidad. |
| MSJ\_05 | Error de conexión serial | No fue posible establecer comunicación con el dispositivo seleccionado. | El sistema cancela el intento y vuelve al estado inicial. |
| MSJ\_06 | Archivo G-code cargado exitosamente | Archivo cargado correctamente. Trayectoria lista para simulación o ejecución. | Se parsea el archivo, genera visualización 2D/3D y calcula estimación de tiempo. |
| MSJ\_07 | Archivo con formato inválido | El archivo seleccionado no contiene un formato compatible. | Se cancela la carga y se solicita seleccionar un archivo válido (.nc, .gcode, .tap). |
| MSJ\_08 | Error de sintaxis en G-code | Se detectó una instrucción con formato incorrecto en la línea correspondiente. | El sistema resalta la línea con error y bloquea la ejecución. |
| MSJ\_09 | Selección de línea G-code | Información del comando seleccionado disponible para consulta. | Se despliega explicación didáctica del comando G/M correspondiente. |
| MSJ\_10 | Movimiento manual (Jog) ejecutado | Movimiento manual aplicado correctamente. | Se envía comando incremental al controlador y actualiza coordenadas actuales. |
| MSJ\_11 | Movimiento fuera de límites | El desplazamiento solicitado supera el área segura configurada. | Se rechaza el comando y muestra advertencia preventiva. |
| MSJ\_12 | Inicio de homing | Iniciando secuencia de referencia de ejes. | El sistema envía comando \$H y monitorea respuesta del firmware. |
| MSJ\_13 | Homing completado | Referencia de máquina establecida correctamente. | Se actualizan coordenadas máquina y se habilitan operaciones posteriores. |
| MSJ\_14 | Intento de ejecutar sin homing | Se recomienda realizar homing antes de iniciar mecanizado. | Se solicita confirmación o se bloquea ejecución según configuración. |
| MSJ\_15 | Configuración de cero pieza | Punto de trabajo definido correctamente. | El sistema actualiza offsets del sistema de coordenadas de trabajo. |
| MSJ\_16 | Inicio de simulación | Simulación iniciada. No se enviarán comandos físicos a la máquina. | Se reproduce trayectoria virtual con actualización gráfica en tiempo real. |
| MSJ\_17 | Fin de simulación | Simulación completada exitosamente. | Se registra duración y libera controles. |
| MSJ\_18 | Inicio de ejecución real | Ejecución del programa iniciada. Supervisa el proceso. | Comienza transmisión secuencial del G-code mediante protocolo serial. |
| MSJ\_19 | Pausa solicitada | Ejecución pausada temporalmente. | El sistema envía comando Hold y conserva la posición actual. |
| MSJ\_20 | Reanudación de ejecución | Continuando la ejecución desde la última posición segura. | Se restablece el flujo de comandos pendientes. |
| MSJ\_21 | Parada manual | Ejecución detenida por el usuario. | Se interrumpe transmisión y limpia cola de comandos. |
| MSJ\_22 | Parada de emergencia | Emergencia activada. Movimiento detenido inmediatamente. | Se envía señal de interrupción inmediata y bloquea toda operación. |
| MSJ\_23 | Pérdida de comunicación | Se perdió la conexión con el controlador CNC. | El sistema entra en modo seguro y pausa automáticamente el proceso. |
| MSJ\_24 | Reconexión exitosa | Comunicación restablecida correctamente. | Se sincroniza el estado actual antes de permitir reanudación. |
| MSJ\_25 | Alarma del firmware | La máquina reportó una condición de alarma. | Se traduce el error técnico a lenguaje comprensible y se bloquea la ejecución. |
| MSJ\_26 | Ajuste de velocidad | Parámetro actualizado correctamente. | Se modifica feed rate o spindle speed y refleja el cambio en interfaz. |
| MSJ\_27 | Comando manual desde consola | Comando enviado al controlador. | Se transmite instrucción y se muestra respuesta textual del firmware. |
| MSJ\_28 | Fin de ejecución del programa | Programa completado sin incidencias. | Se registra historial, tiempo total y estadísticas del proceso. |
| MSJ\_29 | Primer uso del sistema | Parece ser tu primera vez aquí. ¿Deseas una guía rápida? | Se activa el tutorial interactivo de introducción. |
| MSJ\_30 | Cierre de aplicación con proceso activo | Hay una ejecución en curso. Detener ahora podría afectar el proceso. | El sistema solicita confirmación antes de cerrar. |

##### 1.10  Tabla de mensajes  {#1.10-tabla-de-mensajes}

### 

### 

### 

### 

### 

### **5.4 Tabla de errores** {#5.4-tabla-de-errores}

En la Tabla 1.11  se describen diferentes mensajes de error que pueden aparecer, junto con las reacciones correspondientes del sistema, dichos mecanismos de reacción ayudan a asegurar que los usuarios puedan solucionar los inconvenientes de manera eficiente con su experiencia de uso.

| ID | Error | Descripción | Reacción del sistema |
| ----- | ----- | ----- | ----- |
| ERR\_01 | Puerto serial no disponible | El puerto de comunicación seleccionado no se encuentra disponible o está siendo utilizado por otra aplicación. | El sistema cancela el intento de conexión, muestra una advertencia al usuario y permite reintentar tras actualizar la lista de puertos. |
| ERR\_02 | Fallo de conexión con controlador CNC | No fue posible establecer comunicación con el dispositivo CNC debido a un problema de conexión física o configuración incorrecta de parámetros seriales. | Se bloquean temporalmente los controles de operación y se solicita verificar cableado, alimentación y configuración del puerto. |
| ERR\_03 | Firmware no compatible | El controlador conectado responde con una versión de firmware distinta a la soportada por la interfaz. | El sistema notifica la incompatibilidad, restringe funciones críticas y recomienda utilizar una versión compatible de GRBL. |
| ERR\_04 | Archivo G-code inválido | El archivo cargado contiene un formato no reconocido o presenta estructura incompatible con el parser del sistema. | Se cancela la importación del archivo, se muestra el motivo del rechazo y se solicita seleccionar un archivo válido. |
| ERR\_05 | Error de sintaxis en G-code | Se detectó una instrucción con parámetros incorrectos o comandos mal estructurados dentro del archivo cargado. | El sistema resalta la línea conflictiva, detiene la ejecución preventiva y presenta información de apoyo para su corrección. |
| ERR\_06 | Movimiento fuera de límites seguros | El comando solicitado excede las dimensiones configuradas del área de trabajo o los límites virtuales definidos. | El movimiento es rechazado automáticamente y se genera una alerta preventiva para evitar posibles colisiones. |
| ERR\_07 | Pérdida de comunicación durante ejecución | La conexión serial con el controlador CNC se interrumpe mientras un proceso se encuentra en ejecución. | El sistema pausa inmediatamente el flujo de comandos, cambia a estado seguro y solicita reconexión antes de continuar. |
| ERR\_08 | Buffer de transmisión saturado | El sistema detecta acumulación excesiva de comandos pendientes hacia el controlador, comprometiendo la estabilidad de la comunicación. | Se regula automáticamente el envío de instrucciones mediante control de flujo hasta recuperar estabilidad. |
| ERR\_09 | Alarma de firmware GRBL | El firmware reporta una condición de alarma relacionada con homing, límites físicos o bloqueo operativo. | El sistema interpreta el código técnico, traduce el error a lenguaje comprensible y bloquea nuevas acciones hasta resolver la condición. |
| ERR\_10 | Intento de ejecución sin homing | Se intenta iniciar mecanizado sin haber establecido una referencia inicial de posición. | Se muestra advertencia al usuario y se solicita ejecutar la rutina de homing antes de continuar. |
| ERR\_11 | Activación de parada de emergencia | Se detecta una orden de detención inmediata por seguridad emitida por el usuario o por condición crítica del sistema. | Se interrumpe instantáneamente toda transmisión, se bloquean controles y se mantiene el sistema en estado de emergencia hasta reinicio o confirmación. |
| ERR\_12 | Error interno de simulación | Se presenta una inconsistencia al procesar o renderizar la trayectoria virtual del archivo cargado. | La simulación se cancela de forma controlada, se conserva el archivo cargado y se notifica al usuario para intentar nuevamente. |

##### **1.11  Tabla de Errores** {#1.11-tabla-de-errores}

### 

### 

### **5.5 Caso de uso** {#5.5-caso-de-uso}

| C.U – 01 – 01 – Detección de puertos seriales |  |
| ----- | :---- |
| **Nombre** | C.U – 01 – 01 – Detección de puertos seriales |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Solicitud de escaneo de puertos •  Estado del sistema operativo |
| **Datos de Salida** | •  Lista de puertos COM disponibles •  Panel de conexión habilitado |
| **Reglas y Requerimientos Asociados** | •  RF – 01 – Comunicación Serial •  RNF – 01 – Portabilidad Multiplataforma •  RNF – 02 – Usabilidad |
| **Viene de** | Inicio de la aplicación |
| **Trayectoria Principal** | 1\. El actor abre la interfaz CNC. 2\. El sistema ejecuta el escaneo automático de puertos disponibles. 3\. El sistema muestra los puertos detectados en pantalla. 4\. El actor selecciona el puerto correspondiente al controlador. 5\. El sistema deja disponible la opción de conexión. |
| **Trayectorias Alternativas** | TA\_1: 1\. El sistema no detecta puertos seriales activos. 2\. El sistema muestra un aviso al usuario. 3\. El sistema permite reintentar el escaneo. |

| C.U – 01 – 02 – Conexión serial con controlador CNC |  |
| ----- | :---- |
| **Nombre** | C.U – 01 – 02 – Conexión serial con controlador CNC |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Puerto COM seleccionado •  Tasa de baudios •  Orden de conexión |
| **Datos de Salida** | •  Conexión establecida •  Estado de enlace activo •  Versión de firmware detectada |
| **Reglas y Requerimientos Asociados** | •  RF – 01 – Comunicación Serial •  RNF – 04 – Confiabilidad •  RNF – 05 – Seguridad |
| **Viene de** | C.U – 01 – 01 – Detección de puertos seriales |
| **Trayectoria Principal** | 1\. El actor selecciona el puerto COM deseado. 2\. El actor confirma la tasa de baudios configurada. 3\. El sistema envía la solicitud de conexión al controlador. 4\. El controlador responde con su identificador y estado. 5\. El sistema valida que la comunicación sea correcta. 6\. El sistema muestra el estado "Conectado". 7\. El sistema habilita los controles de operación. |
| **Trayectorias Alternativas** | TA\_1: 1\. El puerto seleccionado no responde. 2\. El sistema rechaza la conexión. 3\. El sistema permite intentar de nuevo. |

 

| C.U – 01 – 03 – Verificación de firmware compatible |  |
| ----- | :---- |
| **Nombre** | C.U – 01 – 03 – Verificación de firmware compatible |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Respuesta del controlador •  Versión de firmware reportada |
| **Datos de Salida** | •  Confirmación de compatibilidad •  Bloqueo o habilitación de funciones |
| **Reglas y Requerimientos Asociados** | •  RF – 01 – Comunicación Serial •  RF – 02 – Intérprete G-Code •  RNF – 05 – Seguridad |
| **Viene de** | C.U – 01 – 02 – Conexión serial con controlador CNC |
| **Trayectoria Principal** | 1\. El sistema consulta la versión de firmware del controlador. 2\. El sistema compara la respuesta contra la versión soportada. 3\. El sistema valida compatibilidad con GRBL v1.1. 4\. El sistema confirma que el controlador es compatible. 5\. El sistema habilita la operación normal. |
| **Trayectorias Alternativas** | TA\_1: 1\. El firmware detectado no es compatible. 2\. El sistema informa la incompatibilidad. 3\. El sistema limita las funciones críticas. |

| C.U – 01 – 04 – Monitoreo de estado de comunicación |  |
| ----- | :---- |
| **Nombre** | C.U – 01 – 04 – Monitoreo de estado de comunicación |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Estado del enlace serial •  Respuesta periódica del firmware |
| **Datos de Salida** | •  Estado actualizado de la conexión •  Indicador visual de enlace |
| **Reglas y Requerimientos Asociados** | •  RF – 01 – Comunicación Serial •  RF – 08 – Consola de Diagnóstico •  RNF – 04 – Confiabilidad |
| **Viene de** | C.U – 01 – 02 – Conexión serial con controlador CNC |
| **Trayectoria Principal** | 1\. El sistema inicia el monitoreo continuo de la conexión. 2\. El sistema consulta periódicamente el estado del controlador. 3\. El sistema actualiza el indicador visual de conexión. 4\. El sistema conserva activa la comunicación mientras no existan fallos. 5\. El sistema registra cualquier variación del enlace. |
| **Trayectorias Alternativas** | TA\_1: 1\. La comunicación se vuelve inestable. 2\. El sistema marca advertencia de enlace. 3\. El sistema mantiene la sesión bajo observación. |

| C.U – 01 – 05 – Reconexión tras pérdida de enlace |  |
| ----- | :---- |
| **Nombre** | C.U – 01 – 05 – Reconexión tras pérdida de enlace |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Corte de comunicación •  Reintento de conexión |
| **Datos de Salida** | •  Conexión restablecida o cancelada •  Estado de seguridad activo |
| **Reglas y Requerimientos Asociados** | •  RF – 01 – Comunicación Serial •  RNF – 04 – Confiabilidad •  RNF – 05 – Seguridad |
| **Viene de** | C.U – 01 – 04 – Monitoreo de estado de comunicación |
| **Trayectoria Principal** | 1\. El sistema detecta pérdida de comunicación. 2\. El sistema pausa la operación activa. 3\. El sistema solicita reconexión. 4\. El actor reintenta el enlace. 5\. El sistema verifica la respuesta del controlador. 6\. El sistema restablece la conexión si la respuesta es válida. 7\. El sistema recupera el estado operativo. |
| **Trayectorias Alternativas** | TA\_1: 1\. La reconexión no se logra. 2\. El sistema conserva el modo seguro. 3\. El sistema informa al usuario que revise cableado o energía. |

**C.U – 02 – Gestión de archivos e interpretación de G-code**

| C.U – 02 – 01 – Carga de archivo G-code |  |
| ----- | :---- |
| **Nombre** | C.U – 02 – 01 – Carga de archivo G-code |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Archivo .nc, .gcode o .tap •  Selección del usuario |
| **Datos de Salida** | •  Archivo cargado •  Lista de instrucciones lista para análisis |
| **Reglas y Requerimientos Asociados** | •  RF – 02 – Intérprete G-Code •  RNF – 02 – Usabilidad •  RNF – 07 – Mantenibilidad |
| **Viene de** | C.U – 01 – 02 – Conexión serial con controlador CNC |
| **Trayectoria Principal** | 1\. El actor selecciona la opción de carga de archivo. 2\. El sistema abre el explorador de archivos. 3\. El actor elige un archivo compatible. 4\. El sistema importa el contenido. 5\. El sistema deja disponible el archivo para validación y vista previa. |
| **Trayectorias Alternativas** | TA\_1: 1\. El archivo no tiene una extensión válida. 2\. El sistema rechaza la carga. 3\. El sistema solicita seleccionar otro archivo. |

 

| C.U – 02 – 02 – Validación de sintaxis G-code |  |
| ----- | :---- |
| **Nombre** | C.U – 02 – 02 – Validación de sintaxis G-code |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Líneas del archivo cargado •  Comandos G y M |
| **Datos de Salida** | •  Validación correcta o incorrecta •  Líneas con error marcadas |
| **Reglas y Requerimientos Asociados** | •  RF – 02 – Intérprete G-Code •  RF – 12 – Diccionario G-Code Integrado •  RNF – 07 – Mantenibilidad |
| **Viene de** | C.U – 02 – 01 – Carga de archivo G-code |
| **Trayectoria Principal** | 1\. El sistema analiza línea por línea el archivo cargado. 2\. El sistema identifica comandos de movimiento y comandos auxiliares. 3\. El sistema verifica estructura y parámetros. 4\. El sistema marca el archivo como sintácticamente válido. 5\. El sistema habilita la simulación o ejecución. |
| **Trayectorias Alternativas** | TA\_1: 1\. El sistema detecta una instrucción mal formada. 2\. El sistema resalta la línea conflictiva. 3\. El sistema bloquea la ejecución hasta corregirla. |

| C.U – 02 – 03 – Interpretación de comandos G y M |  |
| ----- | :---- |
| **Nombre** | C.U – 02 – 03 – Interpretación de comandos G y M |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Archivo parseado •  Comando seleccionado |
| **Datos de Salida** | •  Función del comando interpretada •  Información técnica procesada |
| **Reglas y Requerimientos Asociados** | •  RF – 02 – Intérprete G-Code •  RF – 12 – Diccionario G-Code Integrado •  RNF – 06 – Aprendizaje |
| **Viene de** | C.U – 02 – 02 – Validación de sintaxis G-code |
| **Trayectoria Principal** | 1\. El sistema identifica cada comando dentro del programa. 2\. El sistema clasifica el tipo de instrucción. 3\. El sistema interpreta el efecto del comando en la máquina. 4\. El sistema conserva la información para visualización y ejecución. 5\. El sistema presenta el significado de la instrucción cuando se solicita. |
| **Trayectorias Alternativas** | TA\_1: 1\. El comando no está soportado. 2\. El sistema lo marca como no reconocido. 3\. El sistema evita su ejecución. |

 

| C.U – 02 – 04 – Diccionario didáctico de comandos |  |
| ----- | :---- |
| **Nombre** | C.U – 02 – 04 – Diccionario didáctico de comandos |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Línea G-code seleccionada •  Consulta de ayuda |
| **Datos de Salida** | •  Explicación del comando •  Ejemplo de uso |
| **Reglas y Requerimientos Asociados** | •  RF – 12 – Diccionario G-Code Integrado •  RNF – 06 – Aprendizaje •  RNF – 02 – Usabilidad |
| **Viene de** | C.U – 02 – 03 – Interpretación de comandos G y M |
| **Trayectoria Principal** | 1\. El actor selecciona una línea de G-code. 2\. El sistema consulta la base de comandos. 3\. El sistema muestra una descripción breve. 4\. El sistema muestra el efecto esperado sobre la máquina. 5\. El actor revisa la ayuda contextual. |
| **Trayectorias Alternativas** | TA\_1: 1\. El comando no tiene explicación registrada. 2\. El sistema muestra una ayuda general. 3\. El sistema sugiere revisar la sintaxis. |

| C.U – 02 – 05 – Estimación de tiempo de ejecución |  |
| ----- | :---- |
| **Nombre** | C.U – 02 – 05 – Estimación de tiempo de ejecución |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Archivo cargado •  Parámetros de avance |
| **Datos de Salida** | •  Tiempo estimado de ejecución •  Resumen aproximado del trabajo |
| **Reglas y Requerimientos Asociados** | •  RF – 02 – Intérprete G-Code •  RF – 10 – Historial de Trabajo •  RNF – 03 – Eficiencia |
| **Viene de** | C.U – 02 – 02 – Validación de sintaxis G-code |
| **Trayectoria Principal** | 1\. El sistema toma el programa cargado. 2\. El sistema analiza longitudes y velocidades. 3\. El sistema calcula una estimación de duración. 4\. El sistema muestra el resultado en pantalla. 5\. El sistema registra el valor como referencia de sesión. |
| **Trayectorias Alternativas** | TA\_1: 1\. El archivo no tiene parámetros suficientes para estimar. 2\. El sistema muestra una estimación parcial. 3\. El sistema avisa que el valor puede variar. |

 

| C.U – 02 – 06 – Registro semántico de comandos interpretados |  |
| ----- | :---- |
| **Nombre** | C.U – 02 – 06 – Registro semántico de comandos interpretados |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Comandos procesados •  Evento de análisis |
| **Datos de Salida** | •  Historial de comandos analizados •  Estado interpretado de la sesión |
| **Reglas y Requerimientos Asociados** | •  RF – 10 – Historial de Trabajo •  RF – 12 – Diccionario G-Code Integrado •  RNF – 07 – Mantenibilidad |
| **Viene de** | C.U – 02 – 03 – Interpretación de comandos G y M |
| **Trayectoria Principal** | 1\. El sistema interpreta una línea del archivo. 2\. El sistema guarda el significado del comando. 3\. El sistema asocia la interpretación con la sesión activa. 4\. El sistema permite consultar el registro desde la interfaz. |
| **Trayectorias Alternativas** | TA\_1: 1\. El sistema no puede registrar el comando. 2\. El sistema conserva el análisis principal. 3\. El sistema notifica un fallo no crítico. |

 

**C.U – 03 – Visualización y simulación de trayectoria**

| C.U – 03 – 01 – Vista previa 2D de trayectoria |  |
| ----- | :---- |
| **Nombre** | C.U – 03 – 01 – Vista previa 2D de trayectoria |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Archivo G-code cargado •  Geometría procesada |
| **Datos de Salida** | •  Trayectoria 2D mostrada •  Recorrido previo visible |
| **Reglas y Requerimientos Asociados** | •  RF – 04 – Visualización 2D/3D •  RF – 11 – Modo de Simulación •  RNF – 02 – Usabilidad |
| **Viene de** | C.U – 02 – 02 – Validación de sintaxis G-code |
| **Trayectoria Principal** | 1\. El actor abre la vista previa. 2\. El sistema renderiza la ruta en plano 2D. 3\. El sistema muestra ejes, contorno y recorrido. 4\. El actor revisa el trazado antes de ejecutar. |
| **Trayectorias Alternativas** | TA\_1: 1\. La trayectoria no puede renderizarse. 2\. El sistema informa la falla visual. 3\. El sistema conserva el archivo cargado. |

 

| C.U – 03 – 02 – Vista previa 3D de trayectoria |  |
| ----- | :---- |
| **Nombre** | C.U – 03 – 02 – Vista previa 3D de trayectoria |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Archivo interpretado •  Parámetros de visualización |
| **Datos de Salida** | •  Modelo 3D de la trayectoria •  Vista espacial de la herramienta |
| **Reglas y Requerimientos Asociados** | •  RF – 04 – Visualización 2D/3D •  RNF – 03 – Eficiencia •  RNF – 02 – Usabilidad |
| **Viene de** | C.U – 03 – 01 – Vista previa 2D de trayectoria |
| **Trayectoria Principal** | 1\. El actor cambia a vista 3D. 2\. El sistema procesa el modelo de trayectoria. 3\. El sistema muestra el volumen de trabajo. 4\. El sistema permite observar el recorrido desde distintos ángulos. |
| **Trayectorias Alternativas** | TA\_1: 1\. El equipo no soporta la visualización completa. 2\. El sistema reduce la complejidad del renderizado. 3\. El sistema mantiene la vista funcional. |

 

| C.U – 03 – 03 – Seguimiento en tiempo real de la herramienta |  |
| ----- | :---- |
| **Nombre** | C.U – 03 – 03 – Seguimiento en tiempo real de la herramienta |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Estado de ejecución •  Coordenadas actuales |
| **Datos de Salida** | •  Posición actual de la herramienta •  Avance actualizado |
| **Reglas y Requerimientos Asociados** | •  RF – 04 – Visualización 2D/3D •  RF – 10 – Historial de Trabajo •  RNF – 03 – Eficiencia |
| **Viene de** | C.U – 01 – 07 – Ejecución de programa CNC |
| **Trayectoria Principal** | 1\. El sistema recibe coordenadas actualizadas del controlador. 2\. El sistema refresca la posición visible. 3\. El sistema muestra el progreso del trabajo. 4\. El actor observa el avance en tiempo real. 5\. El sistema conserva sincronía entre estado físico y visual. |
| **Trayectorias Alternativas** | TA\_1: 1\. La actualización tarda más de lo previsto. 2\. El sistema mantiene el último valor visible. 3\. El sistema vuelve a consultar al controlador. |

 

| C.U – 03 – 04 – Simulación de movimiento |  |
| ----- | :---- |
| **Nombre** | C.U – 03 – 04 – Simulación de movimiento |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Archivo cargado •  Modo simulación activado |
| **Datos de Salida** | •  Recorrido virtual •  Sin envío físico de movimiento |
| **Reglas y Requerimientos Asociados** | •  RF – 11 – Modo de Simulación •  RF – 04 – Visualización 2D/3D •  RNF – 05 – Seguridad |
| **Viene de** | C.U – 03 – 02 – Vista previa 3D de trayectoria |
| **Trayectoria Principal** | 1\. El actor activa el modo simulación. 2\. El sistema confirma que no se moverá la máquina físicamente. 3\. El sistema reproduce el recorrido del archivo. 4\. El sistema actualiza la posición virtual. 5\. El actor valida la ruta antes de ejecutar. |
| **Trayectorias Alternativas** | TA\_1: 1\. La simulación presenta una inconsistencia. 2\. El sistema detiene la reproducción virtual. 3\. El sistema informa que revise el archivo. |

 

| C.U – 03 – 05 – Actualización de progreso visual |  |
| ----- | :---- |
| **Nombre** | C.U – 03 – 05 – Actualización de progreso visual |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Estado de ejecución •  Línea procesada |
| **Datos de Salida** | •  Barra de progreso •  Estado visual actualizado |
| **Reglas y Requerimientos Asociados** | •  RF – 04 – Visualización 2D/3D •  RF – 10 – Historial de Trabajo •  RNF – 03 – Eficiencia |
| **Viene de** | C.U – 01 – 07 – Ejecución de programa CNC |
| **Trayectoria Principal** | 1\. El sistema identifica la línea actual del programa. 2\. El sistema actualiza la barra de progreso. 3\. El sistema muestra porcentaje ejecutado. 4\. El sistema mantiene sincronía con la trayectoria. 5\. El actor visualiza el estado actual del mecanizado. |
| **Trayectorias Alternativas** | TA\_1: 1\. No se recibe actualización nueva. 2\. El sistema conserva el último avance visible. 3\. El sistema reintenta la consulta. |

**C.U – 04 – Control operativo de la máquina**

| C.U – 04 – 01 – Control manual de ejes |  |
| ----- | :---- |
| **Nombre** | C.U – 04 – 01 – Control manual de ejes |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Eje seleccionado •  Dirección del movimiento •  Incremento de avance |
| **Datos de Salida** | •  Desplazamiento manual aplicado •  Coordenadas actualizadas |
| **Reglas y Requerimientos Asociados** | •  RF – 03 – Control de Ejes (Jogging) •  RF – 05 – Gestión de Coordenadas •  RNF – 05 – Seguridad |
| **Viene de** | C.U – 01 – 02 – Conexión serial con controlador CNC |
| **Trayectoria Principal** | 1\. El actor abre el panel de jogging. 2\. El sistema muestra ejes X, Y y Z. 3\. El actor selecciona eje e incremento. 4\. El actor presiona el control de movimiento. 5\. El sistema valida límites seguros. 6\. El sistema envía el comando al controlador. 7\. El sistema actualiza las coordenadas. |
| **Trayectorias Alternativas** | TA\_1: 1\. El movimiento excede el área permitida. 2\. El sistema rechaza el comando. 3\. El sistema muestra advertencia preventiva. |

| C.U – 04 – 02 – Selección de incrementos de movimiento |  |
| ----- | :---- |
| **Nombre** | C.U – 04 – 02 – Selección de incrementos de movimiento |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Valor de incremento •  Modo continuo o discreto |
| **Datos de Salida** | •  Paso aplicado al jogging •  Configuración visual actualizada |
| **Reglas y Requerimientos Asociados** | •  RF – 03 – Control de Ejes (Jogging) •  RNF – 02 – Usabilidad •  RNF – 06 – Aprendizaje |
| **Viene de** | C.U – 04 – 01 – Control manual de ejes |
| **Trayectoria Principal** | 1\. El actor abre la lista de incrementos. 2\. El sistema muestra opciones de paso. 3\. El actor selecciona el incremento deseado. 4\. El sistema aplica el nuevo valor al control manual. 5\. El sistema refleja el cambio en la interfaz. |
| **Trayectorias Alternativas** | TA\_1: 1\. El actor intenta usar un valor no permitido. 2\. El sistema lo bloquea. 3\. El sistema solicita elegir un incremento válido. |

 

| C.U – 04 – 03 – Inicio de ejecución |  |
| ----- | :---- |
| **Nombre** | C.U – 04 – 03 – Inicio de ejecución |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Archivo validado •  Máquina lista •  Conexión activa |
| **Datos de Salida** | •  Programa en ejecución •  Estado operativo activo |
| **Reglas y Requerimientos Asociados** | •  RF – 02 – Intérprete G-Code •  RF – 04 – Visualización 2D/3D •  RF – 07 – Parada de Emergencia •  RNF – 05 – Seguridad |
| **Viene de** | C.U – 02 – 02 – Validación de sintaxis G-code |
| **Trayectoria Principal** | 1\. El actor presiona iniciar. 2\. El sistema valida conexión y condiciones seguras. 3\. El sistema verifica la ausencia de alarmas. 4\. El sistema comienza a transmitir comandos. 5\. El sistema actualiza el estado de ejecución. |
| **Trayectorias Alternativas** | TA\_1: 1\. La máquina no está lista. 2\. El sistema impide iniciar. 3\. El sistema solicita resolver la condición previa. |

| C.U – 04 – 04 – Pausa de ejecución |  |
| ----- | :---- |
| **Nombre** | C.U – 04 – 04 – Pausa de ejecución |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Orden de pausa •  Estado actual del programa |
| **Datos de Salida** | •  Ejecución detenida temporalmente •  Posición retenida |
| **Reglas y Requerimientos Asociados** | •  RF – 07 – Parada de Emergencia •  RNF – 04 – Confiabilidad •  RNF – 05 – Seguridad |
| **Viene de** | C.U – 04 – 03 – Inicio de ejecución |
| **Trayectoria Principal** | 1\. El actor presiona pausa. 2\. El sistema envía la orden de hold. 3\. El sistema detiene temporalmente la transmisión. 4\. El sistema conserva la posición actual. 5\. El sistema muestra estado pausado. |
| **Trayectorias Alternativas** | TA\_1: 1\. La pausa no es aceptada de inmediato. 2\. El sistema termina la línea en curso. 3\. El sistema entra en pausa segura. |

 

| C.U – 04 – 05 – Reanudación de ejecución |  |
| ----- | :---- |
| **Nombre** | C.U – 04 – 05 – Reanudación de ejecución |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Estado pausado •  Confirmación de continuar |
| **Datos de Salida** | •  Ejecución reanudada •  Flujo de comandos restaurado |
| **Reglas y Requerimientos Asociados** | •  RF – 07 – Parada de Emergencia •  RNF – 04 – Confiabilidad •  RNF – 05 – Seguridad |
| **Viene de** | C.U – 04 – 04 – Pausa de ejecución |
| **Trayectoria Principal** | 1\. El actor selecciona reanudar. 2\. El sistema verifica que la pausa sea recuperable. 3\. El sistema retoma el envío de comandos. 4\. El sistema actualiza el estado a "Run". 5\. El sistema continúa desde el punto seguro. |
| **Trayectorias Alternativas** | TA\_1: 1\. Existe una alarma activa. 2\. El sistema bloquea la reanudación. 3\. El sistema solicita resolver la alarma. |

 

| C.U – 04 – 06 – Detención controlada |  |
| ----- | :---- |
| **Nombre** | C.U – 04 – 06 – Detención controlada |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Orden de stop •  Estado del proceso |
| **Datos de Salida** | •  Ejecución cancelada •  Cola de comandos vaciada |
| **Reglas y Requerimientos Asociados** | •  RF – 07 – Parada de Emergencia •  RNF – 05 – Seguridad •  RNF – 04 – Confiabilidad |
| **Viene de** | C.U – 04 – 03 – Inicio de ejecución |
| **Trayectoria Principal** | 1\. El actor presiona detener. 2\. El sistema confirma la orden. 3\. El sistema cancela la ejecución. 4\. El sistema limpia la cola activa. 5\. El sistema deja la máquina en estado seguro. |
| **Trayectorias Alternativas** | TA\_1: 1\. El actor cancela la detención antes de confirmarla. 2\. El sistema mantiene la ejecución activa. 3\. El sistema vuelve a la pantalla principal. |

 

| C.U – 04 – 07 – Parada de emergencia |  |
| ----- | :---- |
| **Nombre** | C.U – 04 – 07 – Parada de emergencia |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Activación de emergencia •  Estado operativo actual |
| **Datos de Salida** | •  Movimiento detenido de inmediato •  Estado crítico registrado |
| **Reglas y Requerimientos Asociados** | •  RF – 07 – Parada de Emergencia •  RNF – 05 – Seguridad •  RNF – 04 – Confiabilidad |
| **Viene de** | C.U – 04 – 03 – Inicio de ejecución |
| **Trayectoria Principal** | 1\. El actor activa la parada de emergencia. 2\. El sistema interrumpe el flujo de comandos. 3\. El sistema bloquea nuevas operaciones. 4\. El sistema muestra el estado de emergencia. 5\. El sistema mantiene la máquina en condición segura. |
| **Trayectorias Alternativas** | TA\_1: 1\. La emergencia se activa estando en pausa. 2\. El sistema conserva el bloqueo. 3\. El sistema exige reinicio seguro. |

 

**C.U – 05 – Coordenadas, homing y calibración**

| C.U – 05 – 01 – Ciclo de homing |  |
| ----- | :---- |
| **Nombre** | C.U – 05 – 01 – Ciclo de homing |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Orden de homing •  Estado de sensores de límite |
| **Datos de Salida** | •  Origen establecido •  Máquina referenciada |
| **Reglas y Requerimientos Asociados** | •  RF – 06 – Ciclo de Homing •  RNF – 05 – Seguridad •  RNF – 04 – Confiabilidad |
| **Viene de** | C.U – 01 – 02 – Conexión serial con controlador CNC |
| **Trayectoria Principal** | 1\. El actor solicita la rutina de homing. 2\. El sistema verifica que la máquina esté lista. 3\. El sistema envía la orden de referencia. 4\. La máquina busca sus límites físicos. 5\. El sistema confirma el origen. 6\. El sistema actualiza las coordenadas base. |
| **Trayectorias Alternativas** | TA\_1: 1\. Un sensor no responde. 2\. El sistema cancela el homing. 3\. El sistema informa revisar sensores. |

 

| C.U – 05 – 02 – Gestión de coordenadas de máquina y trabajo |  |
| ----- | :---- |
| **Nombre** | C.U – 05 – 02 – Gestión de coordenadas de máquina y trabajo |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Modo de coordenadas seleccionado •  Coordenadas activas |
| **Datos de Salida** | •  MCS o WCS actualizadas •  Visualización del sistema de referencia |
| **Reglas y Requerimientos Asociados** | •  RF – 05 – Gestión de Coordenadas •  RNF – 06 – Aprendizaje •  RNF – 02 – Usabilidad |
| **Viene de** | C.U – 05 – 01 – Ciclo de homing |
| **Trayectoria Principal** | 1\. El actor abre el panel de coordenadas. 2\. El sistema muestra coordenadas de máquina y de trabajo. 3\. El actor cambia entre MCS y WCS. 4\. El sistema actualiza el sistema de referencia activo. 5\. El sistema refleja el cambio en pantalla. |
| **Trayectorias Alternativas** | TA\_1: 1\. No existe homing previo. 2\. El sistema limita la edición de WCS. 3\. El sistema solicita hacer referencia primero. |

 

| C.U – 05 – 03 – Definición de cero pieza |  |
| ----- | :---- |
| **Nombre** | C.U – 05 – 03 – Definición de cero pieza |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Punto de trabajo seleccionado •  Confirmación del usuario |
| **Datos de Salida** | •  Cero pieza fijado •  Offset aplicado |
| **Reglas y Requerimientos Asociados** | •  RF – 05 – Gestión de Coordenadas •  RNF – 05 – Seguridad •  RNF – 06 – Aprendizaje |
| **Viene de** | C.U – 05 – 02 – Gestión de coordenadas de máquina y trabajo |
| **Trayectoria Principal** | 1\. El actor ubica la herramienta en el punto deseado. 2\. El actor solicita fijar cero pieza. 3\. El sistema calcula el nuevo origen de trabajo. 4\. El sistema aplica el offset correspondiente. 5\. El sistema confirma el cambio. |
| **Trayectorias Alternativas** | TA\_1: 1\. El punto elegido está fuera de rango. 2\. El sistema rechaza el cambio. 3\. El sistema conserva el origen anterior. |

 

| C.U – 05 – 04 – Ajuste de offsets |  |
| ----- | :---- |
| **Nombre** | C.U – 05 – 04 – Ajuste de offsets |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Valor de offset •  Herramienta seleccionada |
| **Datos de Salida** | •  Offset actualizado •  Posición compensada |
| **Reglas y Requerimientos Asociados** | •  RF – 05 – Gestión de Coordenadas •  RNF – 06 – Aprendizaje •  RNF – 07 – Mantenibilidad |
| **Viene de** | C.U – 05 – 03 – Definición de cero pieza |
| **Trayectoria Principal** | 1\. El actor abre el panel de offsets. 2\. El sistema muestra los valores actuales. 3\. El actor modifica el valor deseado. 4\. El sistema valida el rango del ajuste. 5\. El sistema guarda el nuevo offset. 6\. El sistema actualiza la referencia de trabajo. |
| **Trayectorias Alternativas** | TA\_1: 1\. El valor ingresado es inconsistente. 2\. El sistema no aplica el ajuste. 3\. El sistema solicita corregir el dato. |

 

| C.U – 05 – 05 – Asistente de calibración de pasos por milímetro |  |
| ----- | :---- |
| **Nombre** | C.U – 05 – 05 – Asistente de calibración de pasos por milímetro |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Medidas físicas •  Distancia real recorrida •  Valor actual de pasos/mm |
| **Datos de Salida** | •  Nuevo valor calibrado •  Registro de ajuste |
| **Reglas y Requerimientos Asociados** | •  RF – 14 – Asistente de Calibración •  RNF – 06 – Aprendizaje •  RNF – 03 – Eficiencia |
| **Viene de** | C.U – 05 – 02 – Gestión de coordenadas de máquina y trabajo |
| **Trayectoria Principal** | 1\. El actor abre el asistente de calibración. 2\. El sistema guía el proceso paso a paso. 3\. El actor captura las mediciones físicas. 4\. El sistema calcula el ajuste necesario. 5\. El sistema propone el nuevo valor de pasos por milímetro. 6\. El actor confirma la actualización. 7\. El sistema guarda la calibración. |
| **Trayectorias Alternativas** | TA\_1: 1\. Las mediciones no son coherentes. 2\. El sistema rechaza el cálculo. 3\. El sistema solicita repetir la medición. |

 

| C.U – 05 – 06 – Validación de límites de trabajo |  |
| ----- | :---- |
| **Nombre** | C.U – 05 – 06 – Validación de límites de trabajo |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Coordenadas solicitadas •  Límites definidos del área de trabajo |
| **Datos de Salida** | •  Movimiento permitido o bloqueado •  Advertencia de seguridad |
| **Reglas y Requerimientos Asociados** | •  RF – 05 – Gestión de Coordenadas •  RNF – 05 – Seguridad •  RNF – 04 – Confiabilidad |
| **Viene de** | C.U – 05 – 03 – Definición de cero pieza |
| **Trayectoria Principal** | 1\. El sistema recibe una orden de movimiento. 2\. El sistema compara el valor contra los límites configurados. 3\. El sistema valida que el recorrido sea seguro. 4\. El sistema permite el movimiento si no hay riesgo. 5\. El sistema rechaza la orden si excede el área útil. |
| **Trayectorias Alternativas** | TA\_1: 1\. El desplazamiento solicitado excede el límite. 2\. El sistema bloquea el movimiento. 3\. El sistema muestra una advertencia preventiva. |

**C.U – 06 – Diagnóstico, ayuda y registro**

| C.U – 06 – 01 – Consola de diagnóstico |  |
| ----- | :---- |
| **Nombre** | C.U – 06 – 01 – Consola de diagnóstico |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Comando manual •  Consulta de estado |
| **Datos de Salida** | •  Respuesta del firmware •  Resultado de diagnóstico |
| **Reglas y Requerimientos Asociados** | •  RF – 08 – Consola de Diagnóstico •  RNF – 02 – Usabilidad •  RNF – 07 – Mantenibilidad |
| **Viene de** | C.U – 01 – 02 – Conexión serial con controlador CNC |
| **Trayectoria Principal** | 1\. El actor abre la consola de diagnóstico. 2\. El sistema habilita el envío manual de comandos. 3\. El actor escribe una instrucción de consulta. 4\. El actor envía el comando. 5\. El sistema transmite el dato al controlador. 6\. El sistema recibe la respuesta. 7\. El sistema muestra el resultado en lenguaje claro. |
| **Trayectorias Alternativas** | TA\_1: 1\. El comando es inválido. 2\. El sistema lo rechaza. 3\. El sistema sugiere revisar la sintaxis. |

| C.U – 06 – 02 – Interpretación semántica de errores |  |
| :---- | :---- |
| **Nombre** | C.U – 06 – 02 – Interpretación semántica de errores |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Código de error del firmware •  Mensaje técnico recibido |
| **Datos de Salida** | •  Error traducido a lenguaje natural •  Recomendación de corrección |
| **Reglas y Requerimientos Asociados** | •  RF – 13 – Interpretador Semántico de Errores •  RF – 08 – Consola de Diagnóstico •  RNF – 06 – Aprendizaje |
| **Viene de** | C.U – 06 – 01 – Consola de diagnóstico |
| **Trayectoria Principal** | 1\. El sistema recibe un código de error técnico. 2\. El sistema consulta su tabla de traducción. 3\. El sistema genera una explicación comprensible. 4\. El sistema muestra una sugerencia de solución. 5\. El sistema conserva el detalle técnico para revisión. |
| **Trayectorias Alternativas** | TA\_1: 1\. El error no tiene traducción registrada. 2\. El sistema muestra el mensaje original. 3\. El sistema agrega una sugerencia general. |

 

| C.U – 06 – 03 – Historial de trabajo |  |
| :---- | :---- |
| **Nombre** | C.U – 06 – 03 – Historial de trabajo |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Solicitud de consulta •  Filtro de sesión o fecha |
| **Datos de Salida** | •  Lista de sesiones •  Tiempo de ejecución •  Estado final |
| **Reglas y Requerimientos Asociados** | •  RF – 10 – Historial de Trabajo •  RNF – 07 – Mantenibilidad •  RNF – 06 – Aprendizaje |
| **Viene de** | C.U – 01 – 07 – Ejecución de programa CNC |
| **Trayectoria Principal** | 1\. El actor abre el historial. 2\. El sistema carga las sesiones almacenadas. 3\. El sistema muestra duración, líneas procesadas y estado final. 4\. El actor revisa una sesión específica. 5\. El sistema mantiene visible el detalle de la ejecución. |
| **Trayectorias Alternativas** | TA\_1: 1\. No existen registros previos. 2\. El sistema muestra historial vacío. 3\. El sistema informa que no hay sesiones guardadas. |

| C.U – 06 – 04 – Registro de eventos |  |
| :---- | :---- |
| **Nombre** | C.U – 06 – 04 – Registro de eventos |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Evento de sistema •  Actividad de usuario |
| **Datos de Salida** | •  Bitácora de eventos •  Trazabilidad de la sesión |
| **Reglas y Requerimientos Asociados** | •  RF – 10 – Historial de Trabajo •  RNF – 07 – Mantenibilidad •  RNF – 04 – Confiabilidad |
| **Viene de** | C.U – 06 – 03 – Historial de trabajo |
| **Trayectoria Principal** | 1\. El sistema detecta una acción relevante. 2\. El sistema registra hora, evento y resultado. 3\. El sistema almacena la información de la sesión. 4\. El actor puede consultar el evento después. |
| **Trayectorias Alternativas** | TA\_1: 1\. No se puede guardar el evento. 2\. El sistema conserva el proceso principal. 3\. El sistema marca el registro como pendiente. |

 

| C.U – 06 – 05 – Ayuda contextual y tutorial inicial |  |
| :---- | :---- |
| **Nombre** | C.U – 06 – 05 – Ayuda contextual y tutorial inicial |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Solicitud de ayuda •  Estado de primera ejecución |
| **Datos de Salida** | •  Tutorial guiado •  Indicaciones contextuales |
| **Reglas y Requerimientos Asociados** | •  RNF – 06 – Aprendizaje •  RNF – 02 – Usabilidad •  RF – 12 – Diccionario G-Code Integrado |
| **Viene de** | Inicio de sesión o primera apertura del sistema |
| **Trayectoria Principal** | 1\. El sistema detecta primer uso o solicitud de ayuda. 2\. El sistema muestra un flujo guiado. 3\. El sistema explica conexión, carga y ejecución. 4\. El actor avanza por los pasos de la guía. 5\. El sistema deja disponible la ayuda contextual en pantalla. |
| **Trayectorias Alternativas** | TA\_1: 1\. El actor cierra el tutorial. 2\. El sistema conserva la opción de abrirlo después. 3\. El sistema regresa al panel principal. |

 

| C.U – 06 – 06 – Control de husillo y periféricos |  |
| :---- | :---- |
| **Nombre** | C.U – 06 – 06 – Control de husillo y periféricos |
| **Actores** | Act\_01\_Usuario\_Final |
| **Datos de Entrada** | •  Valor de velocidad •  Orden de encendido o apagado |
| **Datos de Salida** | •  Husillo activado o detenido •  Velocidad aplicada |
| **Reglas y Requerimientos Asociados** | •  RF – 09 – Control de Periféricos •  RNF – 05 – Seguridad •  RNF – 03 – Eficiencia |
| **Viene de** | C.U – 04 – 03 – Inicio de ejecución |
| **Trayectoria Principal** | 1\. El actor abre el panel de periféricos. 2\. El sistema muestra el control del husillo. 3\. El actor define la velocidad deseada. 4\. El actor ordena el encendido o apagado. 5\. El sistema envía el comando correspondiente. 6\. El sistema confirma el estado del periférico. |
| **Trayectorias Alternativas** | TA\_1: 1\. La velocidad solicitada no es segura. 2\. El sistema bloquea el ajuste. 3\. El sistema solicita un valor válido. |

### **5.8 Mockups**   {#5.8-mockups}

![][image2]

###### **Figura 1\. Pantalla principal. Creación propia.**  {#figura-1.-pantalla-principal.-creación-propia.}

![][image3]

###### **Figura 2\. Atajo comandos de usuario. Creación propia.**  {#figura-2.-atajo-comandos-de-usuario.-creación-propia.}

![][image4]

###### **Figura 3\. Mapa de alturas. Creación propia.**  {#figura-3.-mapa-de-alturas.-creación-propia.}

![][image5]

###### **Figura 4\. Husillo. Creación propia.**  {#figura-4.-husillo.-creación-propia.}

![][image6]

###### **Figura 5\. Control manual. Creación propia.**  {#figura-5.-control-manual.-creación-propia.}

![][image7]

###### **Figura 6\. Ajustes de conexión. Creación propia.**  {#figura-6.-ajustes-de-conexión.-creación-propia.}

![][image8]

###### **Figura 7\. Ajustes información de la máquina. Creación propia.**  {#figura-7.-ajustes-información-de-la-máquina.-creación-propia.}

![][image9]

###### **Figura 8\. Ajustes emisor. Creación propia.**  {#figura-8.-ajustes-emisor.-creación-propia.}

![][image10]

###### **Figura 9\. Ajustes interfaz de usuario. Creación propia.**  {#figura-9.-ajustes-interfaz-de-usuario.-creación-propia.}

![][image11]

###### **Figura 10\. Ajustes y atajos. Creación propia.**  {#figura-10.-ajustes-y-atajos.-creación-propia.}

![][image12]

###### **Figura 11\. Ajustes visualizador. Creación propia.**  {#figura-11.-ajustes-visualizador.-creación-propia.}

![][image13]

###### Figura 12\. Ajustes consola. Creación propia.  {#figura-12.-ajustes-consola.-creación-propia.}

###### ![][image14]

###### **Figura 13\. Ajustes comandos de usuario. Creación propia.**  {#figura-13.-ajustes-comandos-de-usuario.-creación-propia.}

## 

## 

## 

## 

## 

## 

## 

## 

## 

## 

## 

## **Capítulo 6\. Investigación y selección de firmware**

La elección del *firmware* adecuado constituye un paso fundamental y crítico en el desarrollo de la Interfaz de Control CNC Educativa, ya que este software de bajo nivel es el responsable directo de interpretar los comandos G-code (código de máquina) y traducirlos en movimientos precisos y coordinados para los motores paso a paso de la máquina CNC. La selección debe estar guiada por criterios de funcionalidad, compatibilidad con el hardware previsto (especialmente la placa controladora como Arduino o ESP32), facilidad de uso e instalación, robustez, y, crucialmente, su idoneidad para un entorno educativo.Criterios de Evaluación y Selección

Se llevó a cabo una investigación exhaustiva de las opciones de *firmware* más populares y relevantes en la comunidad *hobby* y educativa de CNC. Los principales criterios de evaluación incluyeron:

1. Compatibilidad con Microcontrolador: Debe ser totalmente compatible con la arquitectura de la placa controladora elegida ( ATmega328P de Arduino Uno o nano).  
2. Soporte de Ejes (Axis Support): Debe soportar al menos 3 ejes (X, Y, Z) para cumplir con los requisitos mínimos de una fresadora o grabadora CNC estándar.  
3. Implementación de G-code: Necesita tener una implementación sólida y bien probada de los comandos G-code más comunes (movimiento lineal G0/G1, arcos G2/G3, parada M0/M1, control de husillo M3/M5, etc.).  
4. Licencia y Comunidad: Se priorizaron las opciones de código abierto (*Open Source*) con una comunidad activa, lo que facilita la resolución de problemas, el acceso a documentación detallada y la posibilidad de futuras modificaciones o mejoras.  
5. Funciones de Seguridad: Consideración de límites de *software* (soft limits), *hard limits* (interruptores de fin de carrera), y *homing* (búsqueda de origen).  
6. Enfoque Educativo: El *firmware* debe ser lo suficientemente transparente en su configuración y comportamiento para permitir a los estudiantes comprender la relación entre el G-code, el *firmware* y el movimiento físico de la máquina.

### 

### **6.1 Candidatos de firmware analizados** {#6.1-candidatos-de-firmware-analizados}

Se identificaron y analizaron en detalle los siguientes candidatos principales:

1\. GRBL (G-Code Ripper for Arduino)

* Descripción: Es el *firmware* más dominante y popular para pequeñas máquinas CNC basadas en Arduino. Es ligero, optimizado y extremadamente estable.  
* Ventajas: Alta compatibilidad con la mayoría de los *shields* y *drivers* CNC (como el CNC Shield V3), una comunidad masiva, excelente documentación, y un rendimiento probado en la interpretación de G-code. Es el estándar *de facto* para la educación y el *hobby*.  
* Desventajas: Está limitado por los recursos del Arduino Uno (memoria y velocidad de procesamiento), lo que puede restringir futuras expansiones o velocidades de *feedrate* muy altas.

2\. Marlin

* Descripción: Originalmente desarrollado para impresoras 3D, ha evolucionado para soportar máquinas CNC, aunque su enfoque sigue siendo principalmente la fabricación aditiva.  
* Ventajas: Gran flexibilidad y un conjunto de características muy amplio debido a su base de usuarios de impresión 3D.  
* Desventajas: Puede ser excesivamente complejo de configurar para una simple CNC de 3 ejes, y su rendimiento en el manejo de movimientos rápidos y precisos de fresado puede no ser tan pulido como GRBL.

3\. FluidNC (Basado en GRBL ESP32)

* Descripción: Una evolución de GRBL adaptada al microcontrolador ESP32. Aprovecha la mayor potencia de procesamiento, la memoria y la conectividad WiFi de esta plataforma.  
* Ventajas: Permite un control web (WebUI) directo sin necesidad de una aplicación *host* de escritorio, lo cual es ideal para una interfaz educativa moderna. Mayor velocidad de procesamiento que GRBL en Arduino, mejor manejo de *buffers* de comandos.  
* Desventajas: Requiere un hardware de control más avanzado (ESP32) y su base de usuarios es menor que la de GRBL en Arduino.

###  {#6.2-grbl-v1.1-vs-marlin:}

### 

### **6.2 GRBL v1.1 vs Marlin:** {#6.2-grbl-v1.1-vs-marlin:}

La elección del firmware es un componente crítico en el diseño y la funcionalidad de cualquier sistema de Control Numérico Computarizado (CNC). Para esta Interfaz de Control CNC Educativa, se ha llevado a cabo una evaluación comparativa entre dos de las soluciones de firmware más populares en la comunidad maker: 

GRBL v1.1 y Marlin.

Se selecciona GRBL v1.1 como el firmware principal para la implementación. Esta decisión se fundamenta en su diseño altamente optimizado para el microcontrolador ATmega328P, el corazón de la placa de desarrollo Arduino Nano, comúnmente utilizada en proyectos educativos y prototipos compactos.

A diferencia de Marlin, cuyo diseño original está enfocado primariamente en la impresión 3D (aunque ha sido adaptado para CNC), GRBL fue concebido desde sus inicios específicamente para el control de máquinas CNC, como fresadoras y cortadoras láser, que requieren movimientos precisos, rápidos y continuos.

La principal ventaja de GRBL radica en su eficiente gestión de la memoria y el procesamiento. En el entorno limitado de un Arduino Nano (con un ATmega328P), Marlin presenta importantes limitaciones de memoria (especialmente en RAM y espacio de programa) que restringen la activación de funciones avanzadas o la capacidad de manejar geometrías complejas a alta velocidad.

En contraste, GRBL v1.1 se distingue por su gestión de aceleración más fluida. Esto es esencial para el rendimiento en fresadoras CNC, donde las transiciones suaves entre segmentos de código G (comandos de movimiento) son cruciales para evitar vibraciones, errores de posicionamiento y garantizar la calidad del acabado superficial de la pieza. La rutina de "planeación" de movimiento (motion planning) de GRBL está altamente optimizada para procesar rápidamente el *buffer* de comandos G, permitiendo que la máquina opere a velocidades más altas con una precisión geométrica superior en comparación con las implementaciones básicas de Marlin en hardware limitado.

En resumen, mientras Marlin podría ser una opción para sistemas con microcontroladores más potentes (como la familia de 32 bits), GRBL v1.1 es la solución superior y más robusta para la plataforma Arduino Nano, asegurando un rendimiento óptimo en la gestión de movimientos y aceleración sin comprometer la escasa memoria disponible.

### **6.3 Configuración de parámetros**

La interfaz permitirá la edición didáctica de los pasos de la máquina siguiendo la relación:

###### **Figura 14\. Fórmula de pasos por milímetro** {#figura-14.-fórmula-de-pasos-por-milímetro}

   El objetivo fundamental de esta interfaz es desmitificar y hacer accesible la compleja interacción entre el *software* de control y los componentes físicos de una máquina CNC. Para ello, se establece una relación directa y transparente que permitirá a los usuarios (estudiantes o aprendices) no sólo visualizar, sino también modificar de manera segura y controlada los valores clave que rigen el comportamiento de la máquina.

La edición didáctica de estos registros se fundamentará en la siguiente estructura:

1\. Registros de posición (Coordenadas actuales)

* Propósito: Mostrar las coordenadas actuales (X, Y, Z) del cabezal de la máquina en el sistema de coordenadas activo (máquina o pieza).  
* Edición didáctica: Permitir la simulación de un *offset* o un cambio de *datum*. Al modificar estos valores en la interfaz, el estudiante podrá observar cómo el sistema de control interpreta una nueva posición de inicio sin mover físicamente la máquina, ayudando a comprender conceptos como la referencia de máquina (*Machine Zero*) y la referencia de pieza (*Work Zero*).

2\. Registros de velocidad y avance 

* Propósito: Definir la velocidad de desplazamiento de los ejes (avance, F) y la velocidad de rotación del husillo (velocidad, S).  
* Edición didáctica: Habilitar el cambio de estos parámetros en tiempo real (si la máquina lo permite de forma segura, o en modo simulación). Esto es crucial para entender la relación entre la velocidad de corte, el material y la vida útil de la herramienta. Un *slider* o campo de entrada permitirá a los usuarios experimentar con valores extremos y observar las advertencias del sistema o los efectos simulados en el proceso de mecanizado.

3\. Registros de compensación de herramientas 

* Propósito: almacenar los valores de longitud y diámetro que compensan las diferencias dimensionales de las herramientas utilizadas.  
* Edición didáctica: Ofrecer una tabla editable para modificar los valores de compensación (G43, G44, G41, G42). El usuario podrá introducir deliberadamente valores incorrectos para visualizar cómo un error de *offset* afecta la trayectoria de la herramienta y la geometría final de la pieza, reforzando la importancia de la medición precisa de herramientas.

4\. Registros de límites de software

* Propósito: Establecer los límites virtuales de trabajo para evitar que los ejes excedan sus límites físicos y colisionen.  
* Edición didáctica: Permitir la modificación temporal de estos límites. Esta característica es esencial para enseñar la configuración de la zona de trabajo segura y demostrar la función de protección del *software* de control ante movimientos potencialmente peligrosos.

5\. Registros de variables del sistema 

* Propósito: Almacenar variables internas utilizadas por *macros* o programas de automatización avanzada (e.g., variables de bucles, contadores, o resultados de cálculos).  
* Edición didáctica: Exponer un conjunto seleccionado de estas variables para su manipulación. Esto introduce al estudiante al concepto de la programación paramétrica y la lógica de control avanzada, permitiendo ver cómo la modificación de una variable puede alterar el flujo de un programa de mecanizado complejo (código G).

Mediante esta funcionalidad de edición didáctica, la interfaz transforma la lectura pasiva de datos en una interacción activa y experimental, consolidando la comprensión de los principios operativos de la máquina CNC.

## 

## 

## 

## **Capítulo 7\. Metodología de desarrollo**

El desarrollo del software para la Interfaz de Control CNC Educativa se fundamenta en el Modelo de Desarrollo Rápido de Aplicaciones (RAD).

Este modelo es el más adecuado para el proyecto, ya que prioriza la interacción temprana con el usuario y la iteración veloz. El enfoque RAD facilita la creación rápida de prototipos funcionales y evolutivos en ciclos cortos. Dada la necesidad de una validación constante con el hardware físico (la placa CNC y su *firmware* GRBL), la agilidad de RAD resulta beneficiosa.

El proceso de desarrollo está meticulosamente estructurado en cuatro fases principales, cada una con sus entregables y actividades definidas, lo que asegura un avance organizado y cuantificable.

| Fase RAD | Actividad / Entregable | Descripción Detallada |
| ----- | ----- | ----- |
| I. Planificación de Requisitos y Alcance | Definición de alcance, stack tecnológico y análisis de GRBL  | En esta fase inicial, se establecen los cimientos del proyecto. Esto incluye la elección del lenguaje de programación (determinando el entorno de desarrollo), la selección de las dependencias y librerías necesarias para la comunicación serial y la visualización gráfica, y un análisis exhaustivo del protocolo de comunicación y las capacidades del *firmware* GRBL. Se documentan los comandos G-code esenciales y las respuestas esperadas del *firmware* para asegurar una integración perfecta. |
| II. Diseño Centrado en el Usuario (Prototipado) | Prototipo de Interfaz Gráfica de Usuario (GUI) y Flujos de Control | Se prioriza la experiencia del usuario. Esta etapa implica la creación de *mockups* y *wireframes* detallados de la Interfaz de Control CNC. El enfoque principal es definir la disposición intuitiva de los controles de movimiento de ejes (X, Y, Z), la visualización del estado de la máquina y el diseño de los flujos para el control de velocidad (*Feed Rate*) y otros parámetros operativos. El prototipo es validado internamente para asegurar su usabilidad antes de pasar a la codificación. |
| III. Construcción y Codificación | Desarrollo de Módulos Técnicos Centrales | Es la fase de implementación intensiva. Los prototipos de diseño se transforman en código funcional mediante el desarrollo de tres módulos críticos: el Driver Serial, encargado de establecer, mantener y gestionar la comunicación asíncrona con el puerto USB/Serial de la placa CNC (transmitiendo comandos y recibiendo retroalimentación); el Parser de Datos, que interpreta los mensajes y las alarmas devueltas por GRBL para presentarlos al usuario de manera comprensible; y el Visor Gráfico (Visualizador de Trayectoria), responsable de renderizar la trayectoria del código G en tiempo real, ofreciendo una representación visual del trabajo de la máquina. |
| IV. Transición y Despliegue | Validación Integral, Documentación y Cierre de Proyecto | La fase final se centra en asegurar la calidad y la entrega del producto. Incluye pruebas rigurosas con hardware real para confirmar que la comunicación y el control sean estables y precisos en condiciones operativas. Se realiza una validación funcional de cada módulo y se verifica la compatibilidad total con GRBL. Finalmente, se genera la documentación técnica y de usuario completa y se procede a la entrega final del software ejecutable, marcando el cierre oficial del desarrollo. |

##### **1.12  Tabla Metodologia** {#1.12-tabla-metodologia}

## **Referencias**  {#referencias}

\[1\] D. E. Zazueta López, S. López Leyva y S. A. Romero-Rubio, "La necesidad de una educación 4.0 en México para adentrarse en la industria 4.0," Revista de Investigación en Tecnologías de la Información, vol. 11, no. 24, pp. 62–75, 2023\. \[En línea\]. Disponible en: https\://riti.es/index.php/riti/article/view/264

\[2\] M. A. Cruz y J. R. López, "Desarrollo de sistemas didácticos de control numérico (CNC) para la educación en ingeniería," Revista Iberoamericana de Automática e Informática Industrial, vol. 15, no. 2, pp. 112–125, 2021\.

\[3\] Siemens AG, "Sistemas CNC SINUMERIK: Automatización de máquinas herramienta," Siemens, 2023\. \[En línea\]. Disponible en: https\://www\.siemens.com/es/es/productos/automatizacion/sistemas/cnc-sinumerik.html

\[4\] FANUC Iberia, "Sistemas CNC de FANUC: El control numérico estándar de la industria," FANUC, 2023\. \[En línea\]. Disponible en: https\://www\.fanuc.eu/es/es/cnc

\[5\] DR. JOHANNES HEIDENHAIN GmbH, "Controles numéricos para fresadoras y centros de mecanizado," Heidenhain, 2023\. \[En línea\]. Disponible en: https\://www\.heidenhain.es/productos/controles-numericos

\[6\] Newfangled Solutions, "Mach3 CNC Controller Software," MachSupport, 2023\. \[En línea\]. Disponible en: https\://www\.machsupport.com/software/mach3/

\[7\] LinuxCNC, "The LinuxCNC Project," LinuxCNC.org, 2023\. \[En línea\]. Disponible en: http\://linuxcnc.org/

\[8\] S. Weaver y G. Nicolás, "GRBL v1.1: Open-source embedded CNC controller," GitHub Repository, 2022\. \[En línea\]. Disponible en: https\://github.com/grbl/grbl

\[9\] J. M. S. Rodríguez, Fabricación Inteligente y la Industria 4.0. Madrid, España: Ediciones Paraninfo, 2020\.

\[10\] R. Pérez et al., "Integración de IoT en máquinas CNC para monitorización en tiempo real," en Congreso Nacional de Ingeniería Electromecánica, 2022, pp. 45–52.

\[11\] Python Software Foundation, "Python 3 Documentation," Python.org, 2024\. \[En línea\]. Disponible en: https\://docs.python.org/es/3/

\[12\] F. Cruz y L. Martínez, Control Numérico Computarizado: Conceptos y Arquitecturas de Manufactura. Ciudad de México, México: Ediciones de Ingeniería, 2021\.

\[13\] FANUC Iberia, "Fundamentos del lenguaje de programación G y M en máquinas CNC," FANUC, 2022\. \[En línea\]. Disponible en: https\://www\.fanuc.eu/es/es/cnc/programacion

\[14\] J. A. Rodríguez, "Desarrollo de parsers de código G para interfaces multiplataforma," Revista de Automatización Informática, vol. 8, no. 3, pp. 45–52, 2020\.

\[15\] Arduino, "Arduino Nano: Especificaciones técnicas y control de hardware," Arduino.cc, 2023\. \[En línea\]. Disponible en: https\://store.arduino.cc/products/arduino-nano

\[16\] Texas Instruments, "Fundamentos de la comunicación UART y control de puertos seriales en microcontroladores," TI Documentation, 2021\. \[En línea\]. Disponible en: https\://www\.ti.com/lit/an/

\[17\] G. Nicolás y S. Weaver, "GRBL v1.1: Documentación oficial y características de alto rendimiento," GitHub Wiki, 2022\. \[En línea\]. Disponible en: https\://github.com/gnea/grbl/wiki

\[18\] M. A. García, "Análisis de telemetría, búferes y control en tiempo real para sistemas embebidos CNC," Ingeniería y Sistemas en Tiempo Real, vol. 12, pp. 112–118, 2022\.

\[19\] Universidad Nacional Autónoma de México, "Derechos de autor en el desarrollo del software institucional," 14 junio 2024\. \[En línea\]. Disponible en: https\://www\.tic.unam.mx/derechos-de-autor-en-el-desarrollo-del-software-institucional/

\[20\] Instituto Nacional del Derecho de Autor, "Trámites en línea para registro de obras y programas de cómputo," Gobierno de México. \[En línea\]. Disponible en: https\://tramitesindautor.cultura.gob.mx/

[image1]: assets/images/image1.png

[image2]: assets/images/image2.png

[image3]: assets/images/image3.png

[image4]: assets/images/image4.png

[image5]: assets/images/image5.png

[image6]: assets/images/image6.png

[image7]: assets/images/image7.png

[image8]: assets/images/image8.png

[image9]: assets/images/image9.png

[image10]: assets/images/image10.png

[image11]: assets/images/image11.png

[image12]: assets/images/image12.png

[image13]: assets/images/image13.png

[image14]: assets/images/image14.png