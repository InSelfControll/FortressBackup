#requires -Version 5.1
<#
 Register a Windows Task Scheduler entry for the Fortress Restic agent.
 Run elevated. Agent config, password file, SSH identity, and enrollment token
 must have restricted NTFS ACLs before running this script.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$AgentPath,
    [Parameter(Mandatory)][string]$ConfigPath,
    [string]$TaskName = 'FortressBackup-Windows',
    [int]$DailyHour = 2,
    [switch]$Managed
)
$ErrorActionPreference = 'Stop'
if ($DailyHour -lt 0 -or $DailyHour -gt 23) { throw 'DailyHour must be 0..23' }
if ($TaskName -notmatch '^[a-zA-Z0-9_-]{1,64}$') { throw 'Invalid task name' }
$agent = (Resolve-Path -LiteralPath $AgentPath -ErrorAction Stop).Path
$config = (Resolve-Path -LiteralPath $ConfigPath -ErrorAction Stop).Path
if (-not $agent.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase)) { throw 'AgentPath must point to an EXE' }
if ($agent.Contains('"') -or $config.Contains('"')) { throw 'Double quotes are not allowed in paths' }
$mode = if ($Managed) { 'managed' } else { 'backup' }
$arguments = '-config "{0}" -operation {1}' -f $config, $mode
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 5) -StartWhenAvailable
if ($Managed) {
    # schtasks /SC MINUTE /MO 1 repeats indefinitely, unlike a one-shot
    # New-ScheduledTaskTrigger whose repetition duration eventually expires.
    $command = '"{0}" {1}' -f $agent, $arguments
    & schtasks.exe /Create /SC MINUTE /MO 1 /TN $TaskName /TR $command /RU SYSTEM /RL HIGHEST /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "schtasks /Create failed ($LASTEXITCODE)" }
    Set-ScheduledTask -TaskName $TaskName -Settings $settings | Out-Null
} else {
    $action = New-ScheduledTaskAction -Execute $agent -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours($DailyHour))
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
}
Write-Output "Task registered: $TaskName (SYSTEM). Verify SSH trust, permissions and restore testing."
