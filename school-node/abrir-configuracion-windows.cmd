@echo off
rem Doble clic para ABRIR la configuracion del nodo (C:\Quetzal\config.json) con permiso de administrador.
rem Ahi estan el codigo de docente (teacherCode) y el nombre de la direccion (hostName). Pide permiso: toca Si.
powershell.exe -NoProfile -Command "Start-Process notepad.exe -ArgumentList 'C:\Quetzal\config.json' -Verb RunAs"
