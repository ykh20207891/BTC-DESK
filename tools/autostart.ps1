# Register / remove the BTC DESK logon task (current user, no admin rights needed).
#   powershell -ExecutionPolicy Bypass -File tools\autostart.ps1 install
#   powershell -ExecutionPolicy Bypass -File tools\autostart.ps1 remove
#   powershell -ExecutionPolicy Bypass -File tools\autostart.ps1 status
param([ValidateSet("install", "remove", "status")][string]$Action = "status")
$name = "BTC DESK"
$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root "run_forever.ps1"

switch ($Action) {
    "install" {
        $act = New-ScheduledTaskAction -Execute "powershell.exe" `
            -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory $root
        $trig = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
        $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
        $prin = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName $name -Action $act -Trigger $trig -Settings $set -Principal $prin -Force | Out-Null
        Start-ScheduledTask -TaskName $name
        Write-Output "installed and started: $name"
    }
    "remove" {
        Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
        Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like "*run.py*" -and $_.ExecutablePath -like "$root*" } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
        Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*run_forever.ps1*" } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
        Write-Output "removed: $name (engine stopped)"
    }
    "status" {
        $t = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if ($t) { Write-Output ("task: {0} ({1})" -f $t.State, ($t | Get-ScheduledTaskInfo).LastRunTime) } else { Write-Output "task: not installed" }
        try { Write-Output ("engine: " + (Invoke-WebRequest -Uri "http://127.0.0.1:8765/api/health" -UseBasicParsing -TimeoutSec 3).Content) }
        catch { Write-Output "engine: not answering on :8765" }
    }
}
