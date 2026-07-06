$ErrorActionPreference = 'Stop'
$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

docker compose down --volumes --remove-orphans
Write-Host 'Entorno Docker limpiado.'
