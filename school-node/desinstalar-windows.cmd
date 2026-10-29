@echo off
rem Doble clic para QUITAR el nodo escolar Quetzal de esta computadora.
rem Los datos quedan en C:\Quetzal\data por si se necesitan. Pide permiso de administrador.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" -Uninstall
pause
