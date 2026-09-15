# Supervise the desk: restart the engine whenever it exits, with a short back-off.
# Usage:  powershell -ExecutionPolicy Bypass -File run_forever.ps1
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$delay = 5
while ($true) {
    $start = Get-Date
    Write-Host ("[{0}] starting BTC DESK" -f $start.ToString("s"))
    & python run.py
    $ran = (Get-Date) - $start
    if ($ran.TotalSeconds -gt 300) { $delay = 5 } else { $delay = [Math]::Min($delay * 2, 120) }
    Write-Host ("[{0}] engine exited after {1:n0}s; restarting in {2}s" -f (Get-Date).ToString("s"), $ran.TotalSeconds, $delay)
    Start-Sleep -Seconds $delay
}
