@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  FFXI Jarvis - one-time admin setup (Windows)
REM  Run this once after cloning. It checks prerequisites, installs deps,
REM  creates your .env, installs cloudflared (for the in-game feed), and
REM  registers the slash commands.
REM ===========================================================================
cd /d "%~dp0"
echo.
echo ==== FFXI Jarvis setup ====
echo.

REM --- 1. Node.js ---
where node >nul 2>&1
if errorlevel 1 (
  echo [X] Node.js is not installed or not on PATH.
  echo     Install Node 22.5.0 or newer from https://nodejs.org/ then re-run this.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODEV=%%v
echo [OK] Node.js !NODEV!

REM --- 2. npm install ---
echo.
echo Installing dependencies (npm install)...
call npm install
if errorlevel 1 (
  echo [X] npm install failed. Fix the error above and re-run.
  pause
  exit /b 1
)
echo [OK] Dependencies installed.

REM --- 3. .env ---
echo.
if exist ".env" (
  echo [OK] .env already exists - leaving it as-is.
) else (
  copy ".env.example" ".env" >nul
  echo [OK] Created .env from .env.example.
  echo     You MUST edit it and fill in DISCORD_TOKEN, CLIENT_ID, and your channel IDs.
)

REM --- 4. cloudflared (for the public in-game feed) ---
echo.
where cloudflared >nul 2>&1
if errorlevel 1 (
  if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    echo [OK] cloudflared found in Program Files.
  ) else (
    echo [..] cloudflared not found. Installing via winget...
    winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
      echo [!] Could not auto-install cloudflared. The bot still runs, but the
      echo     public in-game feed needs it. Install manually later if you want it,
      echo     or set ENABLE_TUNNEL=false in .env to disable the feed.
    ) else (
      echo [OK] cloudflared installed.
    )
  )
) else (
  echo [OK] cloudflared is on PATH.
)

REM --- 5. Open .env for editing ---
echo.
echo Opening .env so you can fill in your tokens/IDs...
notepad ".env"

REM --- 6. Register slash commands ---
echo.
echo Registering slash commands...
call npm run deploy
if errorlevel 1 (
  echo [!] Command registration failed - check DISCORD_TOKEN/CLIENT_ID in .env, then run "npm run deploy".
) else (
  echo [OK] Slash commands registered.
)

echo.
echo ==== Setup complete ====
echo Start the bot any time by double-clicking run-bot.cmd
echo.
pause
