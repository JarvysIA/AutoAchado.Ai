$ErrorActionPreference = 'Stop'
$connectorRoot = $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path -LiteralPath $chromePath)) { $chromePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' }
if (-not (Test-Path -LiteralPath $chromePath)) { throw 'Instale Chrome ou Edge antes de iniciar o conector.' }
$env:WHATSAPP_CHROME_PATH = $chromePath
$connectorState = Join-Path $connectorRoot '.state'
New-Item -ItemType Directory -Force -Path $connectorState | Out-Null
$existing = Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue
if (-not $existing) {
  Start-Process -FilePath $nodePath -ArgumentList 'index.mjs' -WorkingDirectory $connectorRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $connectorState 'connector.log') -RedirectStandardError (Join-Path $connectorState 'connector-error.log')
}
Write-Output 'Conector iniciado: http://127.0.0.1:3210 — abra esse endereço no notebook.'
