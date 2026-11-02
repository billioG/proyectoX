@echo off
chcp 65001 >nul
title Quetzal - Instalar en la Raspberry por SSH
rem DOBLE CLIC: instala Quetzal en una Raspberry Pi desde esta computadora, sin monitor ni teclado en la Raspberry.
rem Requiere: Raspberry con cable al router, SSH habilitado y esta computadora en la misma red.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-raspberry-por-ssh.ps1" %*
pause
