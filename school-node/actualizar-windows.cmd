@echo off
rem Doble clic para ACTUALIZAR el nodo escolar Quetzal (conserva estudiantes, avance y configuracion).
rem Hace falta internet. Pide permiso de administrador.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" -Update
pause
