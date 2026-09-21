[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 65535)]
  [int]$BackendPort,

  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 65535)]
  [int]$DevPort
)

$ErrorActionPreference = 'Stop'
$backendUrl = "http://127.0.0.1:$BackendPort"
$frontendUrl = "http://127.0.0.1:$DevPort"
$env:GAMBALATOR_PORT = "$BackendPort"
$env:GAMBALATOR_BACKEND_URL = $backendUrl
$env:GAMBALATOR_FRONTEND_URL = $frontendUrl
$env:GAMBALATOR_DEV_PORT = "$DevPort"
$backend = $null

try {
  $backend = Start-Process -FilePath 'mise' -ArgumentList @('run', 'backend-dev') -NoNewWindow -PassThru

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($backend.HasExited) {
      throw "The Gambalator backend stopped before it became ready."
    }

    try {
      $health = Invoke-WebRequest -UseBasicParsing -Uri "$backendUrl/api/health" -TimeoutSec 1
      if ($health.StatusCode -eq 200) {
        $ready = $true
        break
      }
    } catch {
      # The server is still starting.
    }

    Start-Sleep -Milliseconds 250
  }

  if (-not $ready) {
    throw "The Gambalator backend did not become ready at $backendUrl."
  }

  Write-Host "Frontend with hot reload: $frontendUrl"
  Write-Host "Press Ctrl+C to stop both the frontend and DonationAlerts backend."
  & mise run dev
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  if ($null -ne $backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id
  }
}
