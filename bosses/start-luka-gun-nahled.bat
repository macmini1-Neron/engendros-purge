@echo off
title Luka 3D money gun - nahled fazi
echo.
echo  LUKA - NAHLED FAZI (3D money gun)
echo  --------------------------------
echo  Spoustim lokalni server a oteviram prohlizec...
echo  (Toto okno nech otevrene; zavrenim okna server vypnes.)
echo.
start "luka-gun-server" /min node "%~dp0_server.js"
timeout /t 1 >nul
start "" http://127.0.0.1:8132/luka-3dgun-nahled.html
echo  Otevreno: http://127.0.0.1:8132/luka-3dgun-nahled.html
echo.
pause
