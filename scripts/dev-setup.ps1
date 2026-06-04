<#
.SYNOPSIS
    First-time local dev setup for Nanchang Mahjong.
    Compatible with Windows PowerShell 5.1+ and PowerShell 7+.

.DESCRIPTION
    Automates the full first-time setup:
      1. Copies .env.example -> .env (if not present)
      2. Installs pnpm dependencies
      3. Starts Docker services
      4. Waits for DynamoDB + Cognito to be healthy
      5. Creates DynamoDB table + Cognito User Pool (idempotent)
      6. Patches .env with the Cognito IDs automatically
      7. Seeds the first admin user and prints the initial invite code

    Re-running this script is safe -- all steps are idempotent.

.EXAMPLE
    powershell scripts/dev-setup.ps1
    powershell scripts/dev-setup.ps1 -AdminEmail you@example.com -AdminPassword "Aa1!aaaa" -AdminHandle dad
#>

param(
    [string]$AdminEmail    = 'admin@nanchang.local',
    [string]$AdminPassword = 'Admin1234!',
    [string]$AdminHandle   = 'admin',
    [string]$AdminDisplay  = 'Admin'
)

$ErrorActionPreference = 'Stop'

function Write-Step { param([string]$msg) Write-Host "" ; Write-Host ">> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "   WARN $msg" -ForegroundColor Yellow }
function Write-Fail { param([string]$msg) Write-Host "   FAIL $msg" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 0. Prerequisites
# ---------------------------------------------------------------------------
Write-Step "Checking prerequisites"

foreach ($cmd in @('docker', 'pnpm', 'node')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Fail "$cmd is not installed or not on PATH"
        exit 1
    }
}
Write-Ok "docker, pnpm, node found"

$nodeVer = (node --version) -replace 'v', ''
if ([version]$nodeVer -lt [version]'22.0.0') {
    Write-Warn "Node $nodeVer detected -- Node 22+ is required. Consider using nvm."
}

# ---------------------------------------------------------------------------
# 1. .env file
# ---------------------------------------------------------------------------
Write-Step "Checking .env"

if (Test-Path '.env') {
    Write-Ok ".env already exists -- skipping copy"
} else {
    Copy-Item '.env.example' '.env'
    Write-Ok ".env created from .env.example"
}

# ---------------------------------------------------------------------------
# 2. pnpm install
# ---------------------------------------------------------------------------
Write-Step "Installing dependencies"
pnpm install --frozen-lockfile
Write-Ok "Dependencies installed"

# ---------------------------------------------------------------------------
# 3. Docker services
# ---------------------------------------------------------------------------
Write-Step "Starting Docker services"
docker compose up -d
Write-Ok "Docker services started"

# ---------------------------------------------------------------------------
# Helper: wait for a TCP port to accept connections.
# DynamoDB Local responds with HTTP 400 to plain GET requests (it only
# accepts DynamoDB API calls), so an HTTP check always throws. A TCP check
# is the correct approach: if the port is open the service is ready.
# ---------------------------------------------------------------------------
function Wait-Port {
    param([string]$Name, [int]$Port, [int]$MaxRetries = 40, [switch]$Required)
    $ready = $false
    for ($i = 0; $i -lt $MaxRetries; $i++) {
        $tcp = New-Object System.Net.Sockets.TcpClient
        try {
            $tcp.Connect('localhost', $Port)
            $ready = $true
            $tcp.Close()
            break
        } catch {
            # Not ready yet
        } finally {
            $tcp.Dispose()
        }
        Start-Sleep -Seconds 2
    }
    if ($ready) {
        Write-Ok "$Name ready (port $Port)"
    } elseif ($Required) {
        Write-Fail "$Name did not become ready in time. Check: docker compose logs"
        exit 1
    } else {
        Write-Warn "$Name did not respond in time -- continuing anyway"
    }
}

# ---------------------------------------------------------------------------
# 4. Wait for DynamoDB
# ---------------------------------------------------------------------------
Write-Step "Waiting for DynamoDB Local (port 8000)"
Wait-Port -Name "DynamoDB" -Port 8000 -Required

# ---------------------------------------------------------------------------
# 5. Wait for Cognito Local
# ---------------------------------------------------------------------------
Write-Step "Waiting for Cognito Local (port 9229)"
Wait-Port -Name "Cognito" -Port 9229

# ---------------------------------------------------------------------------
# 6. setup-local: create DDB table + Cognito User Pool
# ---------------------------------------------------------------------------
Write-Step "Creating DynamoDB table + Cognito User Pool"

# Capture stdout only (no 2>&1 -- PS5.1 wraps native stderr as ErrorRecords)
$setupLines = @()
pnpm --filter @nanchang/api run setup:local | ForEach-Object {
    Write-Host $_
    $setupLines += $_
}

# Extract pool-id and client-id from printed output
$poolIdLine   = $setupLines | Where-Object { $_ -match 'COGNITO_USER_POOL_ID=' } | Select-Object -First 1
$clientIdLine = $setupLines | Where-Object { $_ -match 'COGNITO_CLIENT_ID='    } | Select-Object -First 1

if ($poolIdLine -and $clientIdLine) {
    $poolId   = ($poolIdLine   -split '=', 2)[1].Trim()
    $clientId = ($clientIdLine -split '=', 2)[1].Trim()

    Write-Ok "Cognito User Pool: $poolId"
    Write-Ok "Cognito Client ID: $clientId"

    $envContent = Get-Content '.env' -Raw
    $envContent = $envContent -replace '(?m)^COGNITO_USER_POOL_ID=.*', "COGNITO_USER_POOL_ID=$poolId"
    $envContent = $envContent -replace '(?m)^COGNITO_CLIENT_ID=.*',    "COGNITO_CLIENT_ID=$clientId"
    [System.IO.File]::WriteAllText((Resolve-Path '.env').Path, $envContent, [System.Text.Encoding]::UTF8)

    Write-Ok ".env updated with Cognito IDs"
} else {
    Write-Warn "Could not auto-detect Cognito IDs from script output."
    Write-Warn "If the pool already existed the IDs are in your .env -- this is fine."
}

# ---------------------------------------------------------------------------
# 7. Seed admin user
# ---------------------------------------------------------------------------
Write-Step "Seeding admin user"
$env:ADMIN_EMAIL    = $AdminEmail
$env:ADMIN_PASSWORD = $AdminPassword
$env:ADMIN_HANDLE   = $AdminHandle
$env:ADMIN_DISPLAY  = $AdminDisplay

pnpm --filter @nanchang/api run seed:admin

# ---------------------------------------------------------------------------
# 8. Done
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Setup complete!  Start the app with:  pnpm dev"           -ForegroundColor Green
Write-Host ""
Write-Host "  Web app: http://localhost:5173"                            -ForegroundColor Green
Write-Host ""
Write-Host "  Admin login:"                                              -ForegroundColor Green
Write-Host "    Email:    $AdminEmail"                                   -ForegroundColor Green
Write-Host "    Password: $AdminPassword"                                -ForegroundColor Green
Write-Host ""
Write-Host "  Consoles:"                                                 -ForegroundColor Green
Write-Host "    MinIO:   http://localhost:9001  (minioadmin / minioadmin)" -ForegroundColor Green
Write-Host "    MailHog: http://localhost:8025"                          -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
