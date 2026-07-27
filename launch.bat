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
REM  STEP 1: Check Docker Desktop
REM ============================================
echo [1/6] Checking Docker Desktop...
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
REM  STEP 2: Start Infrastructure (Docker)
REM ============================================
echo [2/6] Starting infrastructure containers...
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

echo Waiting 8s for databases to initialize...
timeout /t 8 /nobreak >nul
echo.

REM ============================================
REM  STEP 3: Install Backend Dependencies
REM ============================================
echo [3/6] Installing backend dependencies...
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
REM  STEP 4: Install Frontend Dependencies
REM ============================================
echo [4/6] Installing frontend dependencies...
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
REM  STEP 5: Install Arduino Bridge Dependencies
REM ============================================
echo [5/6] Checking Arduino bridge dependencies...
cd /d "%ROOT%arduino"
if exist node_modules\serialport (
    echo    Arduino bridge dependencies exist, skipping...
) else (
    call npm install
    if %errorlevel% neq 0 (
        echo [WARN] Arduino bridge npm install failed (non-critical).
    )
)
echo [OK] Arduino bridge ready.
echo.

REM ============================================
REM  STEP 6: Start Backend + Frontend
REM ============================================
echo [6/6] Starting backend and frontend...
echo.

start "PERN Backend" cmd /k "cd /d %ROOT%pern-backend && node server.js"
echo [OK] Backend starting on http://localhost:3000

timeout /t 3 /nobreak >nul

start "PERN Frontend" cmd /k "cd /d %ROOT%pern-frontend && npx vite --host"
echo [OK] Frontend starting on http://localhost:5173

echo.
echo ============================================
echo   ALL SERVICES RUNNING
echo ============================================
echo.
echo   Postgres      -^> localhost:5432
echo   MQTT Broker   -^> localhost:1883
echo   Backend API   -^> localhost:3000
echo   Frontend UI   -^> localhost:5173
echo   Arduino USB   -^> Plug in, then run: cd arduino ^& node bridge.js
echo.
echo   Close this window anytime. Servers run in their own windows.
echo ============================================
pause
