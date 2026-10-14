; ==========================================
; Archivo: pieza_01.nc
; Pieza de prueba para CNC Basic v1.0
; Trabajo Terminal ESCOM - IPN (2026-B072)
; ==========================================

G21 ; Unidades metricas en milimetros
G90 ; Modo de posicionamiento absoluto
G94 ; Modo de avance en mm por minuto
G0 Z5.0 ; Posicion de seguridad Z
M3 S12000 ; Encendido de husillo a 12,000 RPM
G0 X110.0 Y140.0 ; Desplazamiento rapido a punto de inicio
G1 Z-1.0 F300 ; Penetración de herramienta en Z
G1 X210.0 F800 ; Corte lineal a X210.0
G1 Y220.0 ; Corte lineal a Y220.0
G1 X110.0 ; Corte lineal a X110.0
G1 Y140.0 ; Cierre de contorno a Y140.0
G0 Z5.0 ; Retraccion de herramienta
M5 ; Apagado de husillo
G0 X0 Y0 ; Retorno a origen WCS
M30 ; Fin de programa
