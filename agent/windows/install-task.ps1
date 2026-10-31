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
    [switch]$Managed,
    [switch]$VerifySetup
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
$sourcePassword=(Resolve-Path -LiteralPath $config.passwordFile -ErrorAction Stop).Path
$hasSFTP=!!($config.sftpKeyFile -or $config.sftpKnownHostsFile)
if($hasSFTP){
    if(!$config.sftpKeyFile -or !$config.sftpKnownHostsFile){throw 'Managed SFTP requires both the SSH identity and pinned known_hosts'}
    $sourceSSHKey=(Resolve-Path -LiteralPath $config.sftpKeyFile -ErrorAction Stop).Path
    $sourceKnownHosts=(Resolve-Path -LiteralPath $config.sftpKnownHostsFile -ErrorAction Stop).Path
}
if($Managed){
    if(!$config.agentTokenFile){throw 'Managed mode requires an enrollment token file'}
    $sourceToken=(Resolve-Path -LiteralPath $config.agentTokenFile -ErrorAction Stop).Path
}
function Set-ProtectedSecurityDescriptor([string]$Path,[switch]$Directory){
    $acl=Get-Acl -LiteralPath $Path -ErrorAction Stop
    $sddl=if($Directory){'O:BAG:BAD:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)'}else{'O:BAG:BAD:PAI(A;;FA;;;SY)(A;;FA;;;BA)'}
    $acl.SetSecurityDescriptorSddlForm($sddl)
    Set-Acl -LiteralPath $Path -AclObject $acl -ErrorAction Stop
}
function Assert-FileDigest([string]$Path,[string]$Expected,[string]$Label){
    if((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ine $Expected){throw "$Label SHA256 mismatch"}
}
function Copy-Protected([string]$source,[string]$destination){
    $item=Get-Item -LiteralPath $source -Force -ErrorAction Stop
    if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Reparse-point input rejected'}
    Copy-Item -LiteralPath $source -Destination $destination -Force
    Set-ProtectedSecurityDescriptor -Path $destination
}
$root=Join-Path $env:ProgramData 'FortressBackup'
if(Test-Path -LiteralPath $root){
    if(((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Reparse-point install directory rejected'}
}else{New-Item -ItemType Directory -Path $root -Force | Out-Null}
# SID-based descriptors avoid localized group names and replace retained owners and trustees.
Set-ProtectedSecurityDescriptor -Path $root -Directory
$staging=Join-Path $root ('.staging-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
Set-ProtectedSecurityDescriptor -Path $staging -Directory
$agent=Join-Path $root 'fortress-agent.exe'
$restic=Join-Path $root 'restic.exe'
$password=Join-Path $root 'repo-password.txt'
$token=Join-Path $root 'agent-token.txt'
$configuration=Join-Path $root 'agent.json'
$stagedAgent=Join-Path $staging 'fortress-agent.exe'
$stagedRestic=Join-Path $staging 'restic.exe'
$stagedPassword=Join-Path $staging 'repo-password.txt'
$stagedToken=Join-Path $staging 'agent-token.txt'
$stagedConfig=Join-Path $staging 'agent.json'
try{
    Copy-Protected $sourceAgent $stagedAgent
    Copy-Protected $resticSource $stagedRestic
    Assert-FileDigest -Path $stagedAgent -Expected $AgentSha256 -Label 'Staged agent binary'
    Assert-FileDigest -Path $stagedRestic -Expected $ResticSha256 -Label 'Staged Restic binary'
    Copy-Protected $sourcePassword $stagedPassword
    if($Managed){Copy-Protected $sourceToken $stagedToken}
    if($hasSFTP){
        Copy-Protected $sourceSSHKey (Join-Path $staging 'storage-key')
        Copy-Protected $sourceKnownHosts (Join-Path $staging 'known_hosts')
        $config.sftpKeyFile=Join-Path $root 'storage-key'
        $config.sftpKnownHostsFile=Join-Path $root 'known_hosts'
    }
    $config.passwordFile=$password
    $config.resticPath=$restic
    if($Managed){$config.agentTokenFile=$token}
    [IO.File]::WriteAllText($stagedConfig, ($config | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    Set-ProtectedSecurityDescriptor -Path $stagedConfig

    $payloadNames=@('fortress-agent.exe','restic.exe','repo-password.txt','agent.json')
    if($Managed){$payloadNames+='agent-token.txt'}
    if($hasSFTP){$payloadNames+=@('storage-key','known_hosts')}
    $backedUp=@{}
    $installed=@{}
    $existingTask=$null
    $existingTaskXml=$null
    $existingTask=Get-ScheduledTask -TaskName $TaskName -TaskPath '\' -ErrorAction SilentlyContinue
    if($existingTask -and $existingTask.State -in @('Running','Queued')){throw 'A backup task is active. Wait for it to finish before upgrading.'}
    try{
        if($existingTask){
            $existingTaskXml=Export-ScheduledTask -TaskName $TaskName -TaskPath '\'
            Disable-ScheduledTask -TaskName $TaskName | Out-Null
        }
        foreach($name in $payloadNames){
            $destination=Join-Path $root $name
            if(Test-Path -LiteralPath $destination){
                $item=Get-Item -LiteralPath $destination -Force
                if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw "Reparse-point installation file rejected: $name"}
            }
        }
        foreach($name in $payloadNames){
            $destination=Join-Path $root $name
            $staged=Join-Path $staging $name
            $backup=Join-Path $staging ('backup-' + $name)
            if(Test-Path -LiteralPath $destination){
                Move-Item -LiteralPath $destination -Destination $backup
                $backedUp[$name]=$backup
            }
            Move-Item -LiteralPath $staged -Destination $destination
            $installed[$name]=$destination
        }
        Assert-FileDigest -Path $agent -Expected $AgentSha256 -Label 'Installed agent binary'
        Assert-FileDigest -Path $restic -Expected $ResticSha256 -Label 'Installed Restic binary'
        if($VerifySetup){
            if(!$Managed){throw 'Setup verification requires managed mode'}
            $checkName='FortressBackup-SetupCheck-' + [guid]::NewGuid().ToString('N')
            $checkLog=Join-Path $root 'setup-check.log'
            try{
                $checkAction=New-ScheduledTaskAction -Execute $agent -Argument ('-config "{0}" -operation preflight -log "{1}"' -f $configuration,$checkLog)
                $checkPrincipal=New-ScheduledTaskPrincipal -UserId SYSTEM -LogonType ServiceAccount -RunLevel Highest
                Register-ScheduledTask -TaskName $checkName -Action $checkAction -Principal $checkPrincipal -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries) | Out-Null
                $previousRun=(Get-ScheduledTaskInfo -TaskName $checkName).LastRunTime
                $timer=[Diagnostics.Stopwatch]::StartNew()
                Start-ScheduledTask -TaskName $checkName
                $finished=$false
                do{
                    Start-Sleep -Seconds 1
                    $info=Get-ScheduledTaskInfo -TaskName $checkName
                    $state=(Get-ScheduledTask -TaskName $checkName).State
                    # Task Scheduler's reported wall time can lag the process clock.
                    # This unique task has run when its baseline changes and it exits.
                    $finished=$info.LastRunTime -ne $previousRun -and $state -notin @('Running','Queued')
                }while(!$finished -and $timer.Elapsed.TotalSeconds -lt 100)
                if(!$finished -or $info.LastTaskResult -ne 0){throw "Setup verification failed as SYSTEM (state=$state, result=$($info.LastTaskResult), last run=$($info.LastRunTime)). Read $checkLog for the storage, HTTPS or enrollment error. No queued backup was claimed."}
            }finally{
                Stop-ScheduledTask -TaskName $checkName -ErrorAction SilentlyContinue
                Unregister-ScheduledTask -TaskName $checkName -Confirm:$false -ErrorAction SilentlyContinue
            }
        }
        $mode=if($Managed){'managed'}else{'backup'}
        $args='-config "{0}" -operation {1} -log "{2}"' -f $configuration,$mode,(Join-Path $root 'agent.log')
        $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 5) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
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
    }catch{
        $failure=$_
        $rollbackErrors=@()
        for($i=$payloadNames.Count-1;$i-ge 0;$i--){
            $name=$payloadNames[$i]
            $destination=Join-Path $root $name
            try{
                if($backedUp.ContainsKey($name)){
                    $backup=$backedUp[$name]
                    if(Test-Path -LiteralPath $destination){Remove-Item -LiteralPath $destination -Force}
                    Move-Item -LiteralPath $backup -Destination $destination
                }elseif($installed.ContainsKey($name) -and (Test-Path -LiteralPath $destination)){
                    Remove-Item -LiteralPath $destination -Force
                }
            }catch{$rollbackErrors+=$_.Exception.Message}
        }
        try{
            if($existingTaskXml){
                Register-ScheduledTask -TaskName $TaskName -Xml $existingTaskXml -Force | Out-Null
            }elseif(!$existingTask -and (Get-ScheduledTask -TaskName $TaskName -TaskPath '\' -ErrorAction SilentlyContinue)){
                Unregister-ScheduledTask -TaskName $TaskName -TaskPath '\' -Confirm:$false
            }
        }catch{$rollbackErrors+=$_.Exception.Message}
        if($rollbackErrors.Count -gt 0){throw "Upgrade failed: $($failure.Exception.Message). Rollback failed: $($rollbackErrors -join '; ')"}
        throw $failure
    }
}finally{
    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "Protected Fortress task registered: $TaskName. Verify VSS, SSH trust and a complete restore before production."
