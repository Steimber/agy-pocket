$ErrorActionPreference = "SilentlyContinue"
$Port = 3456

# Ultra-fast .NET TCP + Process check (<15ms total, zero PowerShell cmdlet overhead)
$portOpen = $false
$tcp = New-Object System.Net.Sockets.TcpClient
try {
  $iar = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
  if ($iar.AsyncWaitHandle.WaitOne(70, $false) -and $tcp.Connected) {
    $portOpen = $true
  }
} catch {} finally {
  $tcp.Close()
}

$tunnelAlive = [System.Diagnostics.Process]::GetProcessesByName("cloudflared").Length -gt 0

if ($portOpen -and $tunnelAlive) {
  Write-Output "AGY_POCKET_ACTIVE (:3456 + cloudflared)"
  exit 0
}

$StartScript = Join-Path $PSScriptRoot "start-pocket.ps1"
Start-Process -FilePath "powershell.exe" -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-WindowStyle", "Hidden",
  "-File", "`"$StartScript`""
) -WindowStyle Hidden | Out-Null

Write-Output "AGY_POCKET_STARTING_BACKGROUND"
