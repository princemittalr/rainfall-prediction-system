<#
  Rainfall Prediction System - one-command launcher for Windows PowerShell.

  .\run.ps1                      # first run: venv + packages + real Mumbai data + start server
  .\run.ps1 -City delhi          # use another city (mumbai, delhi, kolkata, chennai, bengaluru, hyderabad, pune, guwahati, dhaka)
  .\run.ps1 -Synthetic           # skip the download and use the built-in synthetic dataset
  .\run.ps1 -Port 8080           # different port

  If scripts are blocked:  powershell -ExecutionPolicy Bypass -File .\run.ps1
#>
param(
    [string]$City = "mumbai",
    [switch]$Synthetic,
    [switch]$Refresh,
    [int]$Port = 8000
)
$ErrorActionPreference = "Continue"   # native tools report errors via exit codes, checked below
Set-Location -Path $PSScriptRoot

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# 1. Find Python 3.10+
Step "Checking Python"
$python = $null
foreach ($cand in @("python", "py")) {
    if (Get-Command $cand -ErrorAction SilentlyContinue) {
        $ver = & $cand -c "import sys; print(sys.version_info >= (3, 10))" 2>$null
        if ($ver -eq "True") { $python = $cand; break }
    }
}
if (-not $python) {
    Write-Host "Python 3.10 or newer is required. Install it from https://www.python.org/downloads/ (tick 'Add python.exe to PATH')." -ForegroundColor Red
    exit 1
}
& $python --version

# 2. Virtual environment + dependencies
$venvPy = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    Step "Creating virtual environment (.venv)"
    & $python -m venv .venv
}
Step "Installing Python packages (first run takes a minute)"
& $venvPy -m pip install --disable-pip-version-check -q --upgrade pip
& $venvPy -m pip install --disable-pip-version-check -q -r requirements.txt
if ($LASTEXITCODE -ne 0) { Write-Host "pip install failed - check your internet connection." -ForegroundColor Red; exit 1 }

# 3. Data
$real = "backend\data\rainfall_real.csv"
if ($Synthetic) {
    if (Test-Path $real) { & $venvPy backend\scripts\fetch_data.py --reset }
    Step "Using the synthetic demo dataset"
} elseif ($Refresh -or -not (Test-Path $real)) {
    Step "Downloading real historical weather for '$City' (Open-Meteo / ERA5)"
    & $venvPy backend\scripts\fetch_data.py --city $City
    if ($LASTEXITCODE -ne 0) { Write-Host "Download failed - continuing with the synthetic dataset." -ForegroundColor Yellow }
} else {
    Step "Real dataset already present (use -Refresh to download again)"
}

# 4. Run the analysis once and export the static snapshot (used by GitHub Pages)
Step "Running the statistical analysis"
& $venvPy backend\scripts\export_snapshot.py
if ($LASTEXITCODE -ne 0) { exit 1 }

# 5. Start the server and open the browser
$url = "http://127.0.0.1:$Port"
Step "Starting server at $url  (press Ctrl+C to stop)"
Write-Host "    API docs: $url/docs" -ForegroundColor DarkGray
Start-Job -ScriptBlock { param($u) Start-Sleep -Seconds 4; Start-Process $u } -ArgumentList $url | Out-Null
& $venvPy -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port $Port
