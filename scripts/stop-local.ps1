$ErrorActionPreference = "Stop"

function Stop-PortProcess {
  param([int]$Port)

  $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $connections) {
    Write-Host "No listener on port $Port"
    return
  }

  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pid in $pids) {
    try {
      Stop-Process -Id $pid -Force -ErrorAction Stop
      Write-Host "Stopped process $pid on port $Port"
    } catch {
      Write-Host "Failed to stop process $pid on port ${Port}: $($_.Exception.Message)"
    }
  }
}

Stop-PortProcess -Port 5173
Stop-PortProcess -Port 8787
