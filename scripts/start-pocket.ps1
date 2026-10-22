param(
  [int]$Port = 3456,
  [string]$Pin = "",
  [switch]$NoTunnel
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$EnvLocalPath = Join-Path $ProjectRoot ".env.local"
if (Test-Path $EnvLocalPath) {
  Get-Content $EnvLocalPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $parts = $line.Split("=", 2)
      $k = $parts[0].Trim()
      $v = $parts[1].Trim()
      if ($k -and $v) {
        [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
      }
    }
  }
}

if ($Pin) {
  $env:AGY_POCKET_PIN = $Pin
}

if (-not $env:AGY_POCKET_PIN -or -not $env:AGY_POCKET_SECRET) {
  Write-Error "Faltan AGY_POCKET_PIN o AGY_POCKET_SECRET en .env.local."
  exit 1
}

$LanIp = (
  Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
  Select-Object -First 1 -ExpandProperty IPAddress
)

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  AGY POCKET - SESIÓN PERSISTENTE (90 DÍAS)          " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Local PC:   http://localhost:$Port" -ForegroundColor Green
if ($LanIp) {
  Write-Host "  Tu Celular: http://${LanIp}:$Port" -ForegroundColor Yellow
}

if (-not (Test-Path ".next\BUILD_ID")) {
  Write-Host "[*] Construyendo versión optimizada de producción..." -ForegroundColor Gray
  npm run build
}

$TunnelProc = $null
if (-not $NoTunnel) {
  try {
    $AppDataBinDir = Join-Path $env:LOCALAPPDATA "agy-pocket"
    if (-not (Test-Path $AppDataBinDir)) {
      New-Item -ItemType Directory -Path $AppDataBinDir -Force | Out-Null
    }
    $CloudflaredExe = Join-Path $AppDataBinDir "cloudflared.exe"
    if (-not (Test-Path $CloudflaredExe)) {
      Write-Host "[*] Descargando cliente de túnel Cloudflare (una sola vez en AppData)..." -ForegroundColor Gray
      Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $CloudflaredExe
    }

    $TunnelLog = Join-Path $AppDataBinDir "tunnel.log"
    if (Test-Path $TunnelLog) { Remove-Item $TunnelLog -Force }

    $TunnelProc = Start-Process -FilePath $CloudflaredExe -ArgumentList @("tunnel", "--url", "http://127.0.0.1:$Port", "--no-autoupdate") -RedirectStandardError $TunnelLog -WindowStyle Hidden -PassThru

    $TunnelUrl = $null
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Milliseconds 500
      if (Test-Path $TunnelLog) {
        $LogText = Get-Content $TunnelLog -Raw -ErrorAction SilentlyContinue
        if ($LogText -match "(https://[a-z0-9-]+\.trycloudflare\.com)") {
          $TunnelUrl = $Matches[1]
          break
        }
      }
    }

    if ($TunnelUrl) {
      Write-Host "  Túnel Remoto: $TunnelUrl" -ForegroundColor Cyan
      node .\scripts\publish-bridge.mjs $TunnelUrl
    }
  } catch {
    Write-Host "[WARN] No se pudo iniciar el túnel remoto automático: $($_.Exception.Message)" -ForegroundColor DarkYellow
  }
}

Write-Host "=====================================================" -ForegroundColor Cyan

try {
  npx next start -p $Port -H 0.0.0.0
} finally {
  if ($TunnelProc -and -not $TunnelProc.HasExited) {
    Stop-Process -Id $TunnelProc.Id -Force -ErrorAction SilentlyContinue
  }
}
