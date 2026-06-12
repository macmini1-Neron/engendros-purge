@echo off
title Boss Test View - server
echo.
echo  BOSS TEST VIEW  (real in-game model + creative sandbox)
echo  ------------------------------------------------------
echo  Spoustim lokalni server a oteviram prohlizec...
echo  (Toto okno nech otevrene; zavrenim okna server vypnes.)
echo.
start "boss-test-server" /min node "%~dp0_server.js"
timeout /t 1 >nul
start "" http://127.0.0.1:8132/bosses/boss-test-view.html
echo  Otevreno: http://127.0.0.1:8132/bosses/boss-test-view.html
echo.
pause
