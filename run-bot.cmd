@echo off
REM FFXI Jarvis launcher — keeps the Discord bot running 24/7 on this PC.
REM Loops forever: if node ever crashes or exits, it restarts after 5 seconds.
cd /d "C:\Users\Blake\ffxi-jarvis"
:loop
echo [%date% %time%] starting FFXI Jarvis >> bot.log
node src\index.js >> bot.log 2>&1
echo [%date% %time%] FFXI Jarvis exited (code %errorlevel%) - restarting in 5s >> bot.log
timeout /t 5 /nobreak >nul
goto loop
