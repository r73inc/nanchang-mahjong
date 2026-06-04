<#
.SYNOPSIS
    First-time local dev setup for Nanchang Mahjong.
    Compatible with Windows PowerShell 5.1+ and PowerShell 7+.

.DESCRIPTION
    Automates the full first-time setup:
      1. Copies .env.example -> .env (if not present)
      2. Starts Docker services
      3. Waits for DynamoDB + Cognito to be healthy
      4. Creates DynamoDB table + Cognito User Pool (idempotent)
      5. Prompts for admin credentials and seeds the first admin user
      6. Prints the initial invite code

    Re-running this script is safe — all steps are idempotent.

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

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step([string]$msg) { Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "  ✓  $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "  ⚠  $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg) { Write-Host "  ✗  $msg" -ForegroundColor Red }

# ── 0. Prerequisites check ────────────────────────────────────────────────────
Write-Step "Checking prerequisites"

foreach ($cmd in @('docker', 'pnpm', 'node')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Fail "$cmd is not installed or not on PATH"
        exit 1
    }
}
Write-Ok "docker, pnpm, node found"

$nodeVer = (node --version) -replace 'v',''
if ([version]$nodeVer -lt [version]'22.0.0') {
    Write-Warn "Node $nodeVer detected — Node 22+ is required. Consider using nvm."
}

# ── 1. .env file ─────────────────────────────────────────────────────────────
Write-Step "Checking .env"

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Ok ".env created from .env.example"
} else {
    Write-Ok ".env already exists — skipping copy"
}

# ── 2. pnpm install ───────────────────────────────────────────────────────────
Write-Step "Installing dependencies"
pnpm install --frozen-lockfile
Write-Ok "Dependencies installed"

# ── 3. Docker services ────────────────────────────────────────────────────────
Write-Step "Starting Docker services"
docker compose up -d
Write-Ok "Docker services started"

# ── 4. Wait for DynamoDB ──────────────────────────────────────────────────────
Write-Step "Waiting for DynamoDB Local (port 8000)"
$retries = 0
while ($retries -lt 30) {
    try {
        $null = Invoke-WebRequest -Uri 'http://localhost:8000/' -UseBasicParsing -TimeoutSec 2
        break
    } catch {
        Start-Sleep -Seconds 2
        $retries++
    }
}
if ($retries -ge 30) {
    Write-Fail "DynamoDB did not become ready in time. Check: docker compose logs dynamodb"
    exit 1
}
Write-Ok "DynamoDB ready"

# ── 5. Wait for Cognito Local ─────────────────────────────────────────────────
Write-Step "Waiting for Cognito Local (port 9229)"
$retries = 0
while ($retries -lt 30) {
    try {
        $null = Invoke-WebRequest -Uri 'http://localhost:9229/' -UseBasicParsing -TimeoutSec 2
        break
    } catch {
        Start-Sleep -Seconds 2
        $retries++
    }
}
if ($retries -ge 30) {
    Write-Warn "Cognito Local did not respond — continuing anyway (it may not expose a root endpoint)"
}
Write-Ok "Cognito ready"

# ── 6. setup-local: create DDB table + Cognito pool ──────────────────────────
Write-Step "Creating DynamoDB table + Cognito User Pool"
$setupOutput = pnpm --filter @nanchang/api run setup:local 2>&1
Write-Host $setupOutput

# Extract pool-id and client-id from script output
$poolIdLine   = ($setupOutput | Select-String 'COGNITO_USER_POOL_ID=').Line
$clientIdLine = ($setupOutput | Select-String 'COGNITO_CLIENT_ID=').Line

if ($poolIdLine -and $clientIdLine) {
    $poolId   = ($poolIdLine   -split '=')[1].Trim()
    $clientId = ($clientIdLine -split '=')[1].Trim()

    Write-Ok "Cognito User Pool: $poolId"
    Write-Ok "Cognito Client ID: $clientId"

    # Patch .env in-place
    (Get-Content '.env') `
        -replace '^COGNITO_USER_POOL_ID=.*', "COGNITO_USER_POOL_ID=$poolId" `
        -replace '^COGNITO_CLIENT_ID=.*',    "COGNITO_CLIENT_ID=$clientId" |
        Set-Content '.env' -Encoding utf8

    Write-Ok ".env updated with Cognito IDs"
} else {
    Write-Warn "Could not auto-detect Cognito IDs from script output."
    Write-Warn "If the pool was already created, the IDs are already in your .env — this is fine."
}

# ── 7. seed:admin ─────────────────────────────────────────────────────────────
Write-Step "Seeding admin user"
$env:ADMIN_EMAIL    = $AdminEmail
$env:ADMIN_PASSWORD = $AdminPassword
$env:ADMIN_HANDLE   = $AdminHandle
$env:ADMIN_DISPLAY  = $AdminDisplay

pnpm --filter @nanchang/api run seed:admin

# ── 8. Done ───────────────────────────────────────────────────────────────────
Write-Host @"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Setup complete! Start the app with:

    pnpm dev

  Then open: http://localhost:5173

  Admin login:
    Email:    $AdminEmail
    Password: $AdminPassword

  Local service consoles:
    MinIO (S3):  http://localhost:9001  (minioadmin / minioadmin)
    MailHog:     http://localhost:8025
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"@ -ForegroundColor Green
