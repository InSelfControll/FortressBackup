#requires -Version 5.1
[CmdletBinding()]
param([string]$ConfigPath, [switch]$Elevated, [switch]$NonInteractive)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'provision.ps1')
try {
    $admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if(!$admin){
        if($Elevated){throw 'Administrator access is required to install the SYSTEM backup task.'}
        # Never put secrets in process arguments.
        $arguments='-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "{0}" -Elevated' -f $PSCommandPath
        if($ConfigPath){$arguments+=' -ConfigPath "{0}"' -f (Resolve-Path -LiteralPath $ConfigPath).Path}
        $process=Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
        exit $process.ExitCode
    }
    if(!$ConfigPath){
        . (Join-Path $PSScriptRoot 'setup-ui.ps1')
        $window=New-SetupWindow -SetupRoot $PSScriptRoot
        try {[void]$window.ShowDialog()}finally{$window.Dispose()}
        return
    }
    Write-Host 'Fortress Backup - Windows setup' -ForegroundColor Cyan
    Write-Host 'Enrollment does not install software. This setup selects folders, verifies access, and starts the agent.'
    Write-Host 'The saved repository, encryption password, and SSH identity are retrieved securely from Fortress.'
    $agent=Join-Path $PSScriptRoot 'fortress-agent.exe'
    $restic=Join-Path $PSScriptRoot 'restic.exe'
    $sums=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'SHA256SUMS')
    function Get-ReleaseDigest([string]$Name){
        $matches=@($sums | Where-Object {$_ -match ('^[a-fA-F0-9]{64}  '+[regex]::Escape($Name)+'$')})
        if($matches.Count -ne 1){throw "Missing or ambiguous release checksum for $Name. Extract the complete Windows ZIP."}
        return ($matches[0] -split '\s+')[0]
    }
    $agentHash=Get-ReleaseDigest 'fortress-agent.exe'
    $resticHash=Get-ReleaseDigest 'restic.exe'
    foreach($item in @(@($agent,$agentHash),@($restic,$resticHash))){
        if((Get-FileHash -LiteralPath $item[0] -Algorithm SHA256).Hash -ine $item[1]){throw 'Release binary checksum mismatch. Download the ZIP again.'}
    }
    & $agent -config $ConfigPath -operation validate
    if($LASTEXITCODE -ne 0){throw 'Configuration validation failed. Nothing was installed.'}
    Write-Host 'Installing protected files and checking storage and controller access as SYSTEM...'
    & (Join-Path $PSScriptRoot 'install-task.ps1') -AgentPath $agent -ConfigPath $ConfigPath -AgentSha256 $agentHash -ResticSha256 $resticHash -Managed -VerifySetup
    Start-ScheduledTask -TaskName FortressBackup-Windows
    Write-Host 'Setup verified. The agent has connected to the controller; polling has started.' -ForegroundColor Green
    Write-Host 'Open Managed Clients or the dashboard for check-ins and queued/running/completed operations.'
    Write-Host 'Local diagnostics: C:\ProgramData\FortressBackup\agent.log (latest run) and setup-check.log.'
    Write-Host 'A successful installation is not a completed backup. Verify a backup and a complete restore.'
}catch{
    if($NonInteractive){throw}
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show($_.Exception.Message,'Fortress Backup setup failed','OK','Error')
    Write-Host ('SETUP FAILED: '+$_.Exception.Message) -ForegroundColor Red
    Write-Host 'Read the error above. A failed verification does not start the polling task or consume queued backups.'
    exit 1
}
