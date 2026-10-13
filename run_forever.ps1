# Supervise the desk: restart the engine whenever it exits, with a short back-off.
# Usage:  powershell -ExecutionPolicy Bypass -File run_forever.ps1
# Output goes to data\run_forever.log (the engine's own log is data\engine.log).
$ErrorActionPreference = "Continue"
$PSDefaultParameterValues['*:Encoding'] = 'utf8'   # Windows PowerShell 5.1 would write UTF-16 otherwise
$env:PYTHONIOENCODING = 'utf-8'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$PSScriptRoot\data" | Out-Null
$log = "$PSScriptRoot\data\run_forever.log"
$py = "$PSScriptRoot\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }

# one desk per machine: if the port already answers, another copy is running
try {
    $null = Invoke-WebRequest -Uri "http://127.0.0.1:8765/api/health" -UseBasicParsing -TimeoutSec 3
    Add-Content $log ("[{0}] already running on :8765, not starting a second copy" -f (Get-Date).ToString("s"))
    exit 0
} catch [System.Net.WebException] {
    if ($_.Exception.Response) {   # 503 = running but unhealthy: still running
        Add-Content $log ("[{0}] already running on :8765 (unhealthy), not starting a second copy" -f (Get-Date).ToString("s"))
        exit 0
    }
} catch { }

$delay = 5
while ($true) {
    $start = Get-Date
    Add-Content $log ("[{0}] starting BTC DESK with {1}" -f $start.ToString("s"), $py)
    cmd /c "`"$py`" run.py >> `"$log`" 2>&1"   # cmd redirects: PowerShell 5.1 would wrap stderr lines as errors
    $ran = (Get-Date) - $start
    if ($ran.TotalSeconds -gt 300) { $delay = 5 } else { $delay = [Math]::Min($delay * 2, 120) }
    Add-Content $log ("[{0}] engine exited after {1:n0}s; restarting in {2}s" -f (Get-Date).ToString("s"), $ran.TotalSeconds, $delay)
    Start-Sleep -Seconds $delay
}
