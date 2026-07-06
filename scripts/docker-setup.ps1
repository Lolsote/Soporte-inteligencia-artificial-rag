$ErrorActionPreference = 'Stop'
$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

if (-not (Test-Path .env.docker)) {
  Copy-Item .env.docker.example .env.docker
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'Docker no está instalado o no está en PATH.'
  exit 1
}

$composeVersion = docker compose version 2>$null
if (-not $composeVersion) {
  Write-Error 'Docker Compose no está disponible.'
  exit 1
}

docker compose up --build -d

Write-Host ''
Write-Host 'Servicios iniciados.'
Write-Host '- API: http://localhost:3000'
Write-Host '- Ollama: http://localhost:11434'
Write-Host '- ChromaDB: http://localhost:8000'
Write-Host ''
Write-Host 'Para instalar modelos en Ollama ejecuta:'
Write-Host '  docker compose exec ollama ollama pull nomic-embed-text'
Write-Host '  docker compose exec ollama ollama pull llama3'
Write-Host ''
Write-Host 'Para poblar documentos:'
Write-Host '  docker compose exec app npm run seed'
