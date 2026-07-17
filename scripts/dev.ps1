#Requires -Version 5.1
<#
.SYNOPSIS
  Levanta los 3 servicios (auth, profile, gateway) en terminales separadas con output colorizado.

.DESCRIPTION
  - Construye libs/auth (necesario antes de los apps)
  - Inicia docker compose si la DB no está corriendo
  - Arranca los 3 servicios con concurrently
  - Ctrl+C detiene los 3 a la vez

.EXAMPLE
  .\scripts\dev.ps1
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Banner
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " auth-profile dev stack" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Build libs/auth
Write-Host "[1/3] Building @auth-profile/auth..." -ForegroundColor Yellow
pnpm build:libs
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: libs/auth build failed" -ForegroundColor Red
  exit $LASTEXITCODE
}

# 2. Verificar / arrancar DB
Write-Host ""
Write-Host "[2/3] Checking Docker..." -ForegroundColor Yellow
$dbRunning = docker compose -f docker-compose.local.yml ps --services --status running 2>$null
$requiredServices = @("redis", "auth-postgres", "profile-postgres")
$missing = $requiredServices | Where-Object { $dbRunning -notcontains $_ }
if ($missing.Count -gt 0) {
  Write-Host "  Starting missing containers: $($missing -join ', ')..." -ForegroundColor Yellow
  docker compose -f docker-compose.local.yml up -d redis auth-postgres profile-postgres
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: docker compose up failed" -ForegroundColor Red
    exit $LASTEXITCODE
  }
  Write-Host "  Waiting 3s for Postgres to be ready..." -ForegroundColor Yellow
  Start-Sleep -Seconds 3
} else {
  Write-Host "  All DB services running" -ForegroundColor Green
}

# 3. Arrancar los 3 servicios con concurrently
Write-Host ""
Write-Host "[3/3] Starting services..." -ForegroundColor Yellow
Write-Host "  Press Ctrl+C to stop all" -ForegroundColor DarkGray
Write-Host ""

pnpm dev:services
