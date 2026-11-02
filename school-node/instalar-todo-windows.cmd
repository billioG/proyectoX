@echo off
chcp 65001 >nul
title Quetzal - Instalar todo
rem DOBLE CLIC: instala (o actualiza) el nodo escolar Quetzal y hace todo lo que se puede sin preguntar:
rem   - descarga Node.js y el codigo, abre el firewall, deja Quetzal arrancando solo y evita que la PC se duerma
rem   - lee el token de token.txt (junto a este archivo) si existe; si no, instala igual y avisa que falta
rem   - hace la primera sincronizacion, espera a que bajen los cursos y comprueba que todo quedo listo
rem   - guarda un resumen en C:\Quetzal\Resumen-instalacion.txt y abre el cartel para imprimir
rem Pide permiso de administrador una sola vez. Si ya esta instalado, solo actualiza.
cd /d "%~dp0"
set MODO=
if exist "C:\Quetzal\config.json" set MODO=-Update
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" -Auto %MODO% %*
pause
