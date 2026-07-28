@echo off
title PERN IoT Platform - Full Launch
color 0A

set "ROOT=%~dp0"

REM ============================================
REM  Add Docker CLI to PATH
REM ============================================
set "DOCKER_BIN=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin"
if exist "%DOCKER_BIN%" (
    set "PATH=%DOCKER_BIN%;%PATH%"
)

echo ============================================
echo   PERN IoT Platform - Full Launch
echo ============================================
echo.

REM ============================================
REM  STEP 1: Create .env files from templates
REM ============================================
echo [1/7] Setting up environment files...

if not exist "%ROOT%pern-backend\.env" (
    if exist "%ROOT%pern-backend\.env.example" (
        copy /y "%ROOT%pern-backend\.env.example" "%ROOT%pern-backend\.env" >nul
        echo    Created pern-backend\.env from .env.example
    ) else (
        echo [ERROR] No pern-backend\.env.example found!
        pause
        exit /b 1
    )
) else (
    echo    pern-backend\.env exists, skipping...
)

if not exist "%ROOT%pern-frontend\.env" (
    if exist "%ROOT%pern-frontend\.env.example" (
        copy /y "%ROOT%pern-frontend\.env.example" "%ROOT%pern-frontend\.env" >nul
        echo    Created pern-frontend\.env from .env.example
    ) else (
        echo [WARN] No pern-frontend\.env.example found, creating default...
        (
            echo VITE_API_URL=http://localhost:3000/api
            echo VITE_LOGTO_ENDPOINT=https://your-tenant.logto.app
            echo VITE_LOGTO_APP_ID=your-logto-app-id
        ) > "%ROOT%pern-frontend\.env"
        echo    Created pern-frontend\.env with defaults
    )
) else (
    echo    pern-frontend\.env exists, skipping...
)

echo [OK] Environment files ready.
echo.

REM ============================================
REM  STEP 2: Check Docker Desktop
REM ============================================
echo [2/7] Checking Docker Desktop...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker is not running. Starting Docker Desktop...
    start "" "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe" 2>nul
    if %errorlevel% neq 0 (
        start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe" 2>nul
    )
    echo Waiting for Docker to start (up to 60s)...
    set /a COUNT=0
    :WAIT_DOCKER
    timeout /t 5 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% equ 0 goto DOCKER_OK
    set /a COUNT+=1
    if %COUNT% lss 12 goto WAIT_DOCKER
    echo [ERROR] Docker did not start in time!
    pause
    exit /b 1
    :DOCKER_OK
    echo [OK] Docker Desktop is running.
) else (
    echo [OK] Docker is already running.
)
echo.

REM ============================================
REM  STEP 3: Start Infrastructure (Docker)
REM ============================================
echo [3/7] Starting infrastructure containers...
cd /d "%ROOT%"

docker compose up -d postgres mqtt-broker
if %errorlevel% neq 0 (
    docker-compose up -d postgres mqtt-broker
    if %errorlevel% neq 0 (
        echo [ERROR] Docker compose failed!
        pause
        exit /b 1
    )
)
echo [OK] Postgres and MQTT containers started.
echo.

echo Waiting 10s for databases to initialize...
timeout /t 10 /nobreak >nul
echo.

REM ============================================
REM  STEP 4: Run database migrations
REM ============================================
echo [4/7] Running database setup...
cd /d "%ROOT%pern-backend"

node -e "const { Pool } = require('pg'); const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://pern:pern_secret@localhost:5432/pern_db' }); pool.query('SELECT 1').then(() => { console.log('[OK] Database connection successful'); pool.end(); }).catch(e => { console.error('[WARN] Database not ready yet:', e.message); pool.end(); })"
echo.

REM ============================================
REM  STEP 5: Install Backend Dependencies
REM ============================================
echo [5/7] Installing backend dependencies...
cd /d "%ROOT%pern-backend"
if exist node_modules (
    echo    node_modules exists, skipping...
) else (
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Backend npm install failed!
        pause
        exit /b 1
    )
)
echo [OK] Backend dependencies ready.
echo.

REM ============================================
REM  STEP 6: Install Frontend Dependencies
REM ============================================
echo [6/7] Installing frontend dependencies...
cd /d "%ROOT%pern-frontend"
if exist node_modules (
    echo    node_modules exists, skipping...
) else (
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Frontend npm install failed!
        pause
        exit /b 1
    )
)
echo [OK] Frontend dependencies ready.
echo.

REM ============================================
REM  STEP 7: Start Backend + Frontend
REM ============================================
echo [7/7] Starting backend and frontend...
echo.

start "PERN Backend" cmd /k "cd /d %ROOT%pern-backend && node server.js"
echo [OK] Backend starting on http://localhost:3000

timeout /t 3 /nobreak >nul

start "PERN Frontend" cmd /k "cd /d %ROOT%pern-frontend && npm run dev -- --host"
echo [OK] Frontend starting on http://localhost:5174

echo.
echo ============================================
echo   ALL SERVICES RUNNING
echo ============================================
echo.
echo   Postgres      -^> localhost:5432
echo   MQTT Broker   -^> localhost:1883
echo   Backend API   -^> localhost:3000
echo   Frontend UI   -^> http://localhost:5174
echo   Arduino USB   -^> Plug in, then run: cd arduino ^& node bridge.js
echo.
echo   Close this window anytime. Servers run in their own windows.
echo ============================================
pause
