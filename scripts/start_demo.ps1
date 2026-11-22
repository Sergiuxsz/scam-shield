# Scam Shield: start everything for a demo, in the right order.
#   .\scripts\start_demo.ps1          backend + web app (check screen + results dashboard)
#   .\scripts\start_demo.ps1 -Pill    also the desktop pill (listens on 127.0.0.1:7777)
# Stop: close the PowerShell windows this opens (and the pill: Integrare -> Stop Scam Shield).
param([switch]$Pill)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$detector = Join-Path $repo 'detector'
$ui = Join-Path $repo 'ui'
$py = Join-Path $repo '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { $py = 'python' }   # fall back to the Python on PATH
if (-not (Test-Path (Join-Path $repo 'models\flag_encoder\labels.json'))) {
    Write-Host 'No trained models in models/: the backend will run on rules only. See models/README.md.' -ForegroundColor Yellow
}

# 1. Detector backend (rules + fine-tuned models). Encoders on CPU = no GPU contention with other apps.
$api = "`$env:SCAM_ENCODER_DEVICE='cpu'; `$env:PYTHONIOENCODING='utf-8'; Set-Location '$detector'; & '$py' api.py"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $api -WindowStyle Minimized

# 2. Wait until it answers (models load in ~10-20 s)
Write-Host 'Waiting for the detector on http://127.0.0.1:8000 ...'
$ok = $false
for ($i = 0; $i -lt 90; $i++) {
    try { $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2; $ok = $true; break } catch { Start-Sleep -Seconds 2 }
}
if (-not $ok) { Write-Host 'Detector did not start. Check its window.' -ForegroundColor Red; exit 1 }
Write-Host ("Detector ready: " + ($h.signals | ConvertTo-Json -Compress)) -ForegroundColor Green

# 3. Web app (static files) on localhost:8765, served from ui/ so the app is at /app/
$web = "Set-Location '$ui'; & '$py' -m http.server 8765 --bind 127.0.0.1"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $web -WindowStyle Minimized
Start-Sleep -Seconds 2
Start-Process 'http://localhost:8765/app/#rezultate'

# 4. Optional: the desktop pill (needs `npm install` once in ui/desktop)
if ($Pill) {
    $desktop = Join-Path $ui 'desktop'
    Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$desktop'; npm start"
    Start-Sleep -Seconds 6
    # Guided demo panel: one button per demo step (opens http://127.0.0.1:7801)
    Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$desktop'; npm run control" -WindowStyle Minimized
}

Write-Host ''
Write-Host 'Demo checklist:' -ForegroundColor Cyan
Write-Host '  1. Rezultate -> Load folder -> a test folder (e.g. data/validation_set). Every row should say AI'
Write-Host '     (a yellow "rules" tag means the detector backend is down).'
Write-Host '  2. Do NOT reload the page between the dashboard and the live re-run.'
Write-Host '  3. Live re-run: Verifica -> Deschide un fisier -> same file -> must match its row.'
Write-Host '  4. Hands-on: paste a message in Verifica and read the warning aloud.'
