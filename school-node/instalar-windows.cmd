@echo off
rem Doble clic (o clic derecho -> Ejecutar como administrador) para instalar
rem el nodo escolar Quetzal en esta computadora. Pide permiso de administrador.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" %*
pause
