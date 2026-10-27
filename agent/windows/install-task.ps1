#requires -Version 5.1
<#
 Registers a local Windows Scheduled Task; no credentials leave the machine.
 Run elevated. Place the EXE/config first and restrict file ACLs separately.
 Creates a task which runs only when Windows is available.
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
$agent = (Resolve-Path -LiteralPath $AgentPath -ErrorAction Stop).Path
$config = (Resolve-Path -LiteralPath $ConfigPath -ErrorAction Stop).Path
if (-not $agent.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase)) { throw 'AgentPath must point to the Windows executable' }
if (-not [IO.Path]::IsPathRooted($config)) { throw 'ConfigPath must be absolute' }
$mode = if ($Managed) { 'managed' } else { 'backup' }
$action = New-ScheduledTaskAction -Execute $agent -Argument ('-config "{0}" -operation {1}' -f $config, $mode)
$trigger = if ($Managed) {
    $t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)
    $t.Repetition.Interval = 'PT1M'
    $t.Repetition.Duration = 'P1D'
    $t
} else { New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours($DailyHour)) }
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 5) -StartWhenAvailable
# SYSTEM has VSS privileges, but its Windows OpenSSH profile must have the
# correct pinned host key and dedicated private key for Hetzner.
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Output "Task registered: $TaskName (SYSTEM). Validate SSH trust, permissions and run a restore test before depending on it."
