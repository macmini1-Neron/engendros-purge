@echo off
title Money Gun - dilna
echo.
echo  MONEY GUN - DILNA (animace + efekty)
echo  -----------------------------------
echo  Spoustim lokalni server a oteviram prohlizec...
echo  (Toto okno nech otevrene; zavrenim okna server vypnes.)
echo.
start "money-gun-server" /min node "%~dp0_server.js"
timeout /t 1 >nul
start "" http://127.0.0.1:8132/money-gun-dilna.html
echo  Otevreno: http://127.0.0.1:8132/money-gun-dilna.html
echo.
pause
