#requires -Version 5.1
<#
 Install an immutable-by-non-admins Windows backup task. The administrator
 must supply SHA256 digests obtained through a trusted distribution channel.
 Uses SYSTEM for VSS; no network listener is opened.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$AgentPath,
    [Parameter(Mandatory)][string]$ConfigPath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$AgentSha256,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ResticSha256,
    [string]$TaskName='FortressBackup-Windows',
    [int]$DailyHour=2,
    [switch]$Managed
)
$ErrorActionPreference='Stop'
if($DailyHour -lt 0 -or $DailyHour -gt 23){throw 'Invalid DailyHour'}
if($TaskName -notmatch '^[a-zA-Z0-9_-]{1,64}$'){throw 'Invalid task name'}
$sourceAgent=(Resolve-Path -LiteralPath $AgentPath -ErrorAction Stop).Path
$sourceConfig=(Resolve-Path -LiteralPath $ConfigPath -ErrorAction Stop).Path
if(!(Test-Path -LiteralPath $sourceAgent -PathType Leaf)){throw 'Agent executable is missing'}
if(!((Get-FileHash -LiteralPath $sourceAgent -Algorithm SHA256).Hash -ieq $AgentSha256)){throw 'Agent binary SHA256 does not match trusted release'}
$config=Get-Content -LiteralPath $sourceConfig -Raw | ConvertFrom-Json -ErrorAction Stop
if(!$config.resticPath -or !$config.passwordFile){throw 'Agent config requires resticPath and passwordFile'}
$resticSource=(Resolve-Path -LiteralPath $config.resticPath -ErrorAction Stop).Path
if(!((Get-FileHash -LiteralPath $resticSource -Algorithm SHA256).Hash -ieq $ResticSha256)){throw 'Restic binary SHA256 mismatch'}
if($config.sshCommand){throw 'Arbitrary RESTIC_SFTP_COMMAND is not allowed for elevated tasks'}
$root=Join-Path $env:ProgramData 'FortressBackup'
if(Test-Path -LiteralPath $root){
    if(((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Reparse-point install directory rejected'}
}else{New-Item -ItemType Directory -Path $root -Force | Out-Null}
# SID-based ACLs avoid localized group names; protect the directory before copying.
& icacls.exe $root /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not secure install directory'}
function Copy-Protected([string]$source,[string]$destination){
    $item=Get-Item -LiteralPath $source -Force -ErrorAction Stop
    if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Reparse-point input rejected'}
    Copy-Item -LiteralPath $source -Destination $destination -Force
    & icacls.exe $destination /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Could not secure installed file'}
}
$agent=Join-Path $root 'fortress-agent.exe'
$restic=Join-Path $root 'restic.exe'
Copy-Protected $sourceAgent $agent
Copy-Protected $resticSource $restic
$sourcePassword=(Resolve-Path -LiteralPath $config.passwordFile -ErrorAction Stop).Path
$password=Join-Path $root 'repo-password.txt'
Copy-Protected $sourcePassword $password
$config.passwordFile=$password
$config.resticPath=$restic
if($Managed){
    if(!$config.agentTokenFile){throw 'Managed mode requires an enrollment token file'}
    $sourceToken=(Resolve-Path -LiteralPath $config.agentTokenFile -ErrorAction Stop).Path
    $token=Join-Path $root 'agent-token.txt'
    Copy-Protected $sourceToken $token
    $config.agentTokenFile=$token
}
$configuration=Join-Path $root 'agent.json'
$config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $configuration -Encoding UTF8
& icacls.exe $configuration /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not secure agent configuration'}
$mode=if($Managed){'managed'}else{'backup'}
$args='-config "{0}" -operation {1}' -f $configuration,$mode
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 5) -StartWhenAvailable
if($Managed){
    $command='"{0}" {1}' -f $agent,$args
    & schtasks.exe /Create /SC MINUTE /MO 1 /TN $TaskName /TR $command /RU SYSTEM /RL HIGHEST /F | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Task creation failed'}
    Set-ScheduledTask -TaskName $TaskName -Settings $settings | Out-Null
}else{
    $action=New-ScheduledTaskAction -Execute $agent -Argument $args
    $trigger=New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours($DailyHour))
    $principal=New-ScheduledTaskPrincipal -UserId SYSTEM -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
}
Write-Output "Protected Fortress task registered: $TaskName. Verify VSS, SSH trust and a complete restore before production."
