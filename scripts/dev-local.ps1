$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$npmCmd = (Get-Command npm.cmd).Source

function Test-PortListening {
  param([int]$Port)

  return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Start-ServiceWindow {
  param(
    [string]$Title,
    [string]$Command
  )

  $quotedRoot = '"' + $projectRoot + '"'
  $quotedCommand = $Command.Replace('"', '\"')
  $cmdCommand = "title $Title && cd /d $quotedRoot && $quotedCommand"
  Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", $cmdCommand) -WindowStyle Normal | Out-Null
  Write-Host "$Title started."
}

if (-not (Test-PortListening -Port 8787)) {
  Start-ServiceWindow -Title "Dinner Order Server" -Command "call `"$npmCmd`" run dev:server"
} else {
  Write-Host "Server already running on http://localhost:8787"
}

if (-not (Test-PortListening -Port 5173)) {
  Start-ServiceWindow -Title "Dinner Order Web" -Command "call `"$npmCmd`" run dev:web"
} else {
  Write-Host "Web already running on http://localhost:5173"
}

Write-Host ""
Write-Host "Expected local URLs:"
Write-Host "  Admin: http://localhost:5173/admin"
Write-Host "  Guest: http://localhost:5173/e/family-demo"
