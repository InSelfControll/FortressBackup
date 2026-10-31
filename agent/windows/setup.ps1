#requires -Version 5.1
[CmdletBinding()]
param([string]$ConfigPath, [switch]$Elevated)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'provision.ps1')
try {
    $admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if(!$admin){
        if($Elevated){throw 'Administrator access is required to install the SYSTEM backup task.'}
        # Keep the elevated window visible on success or failure. Never put secrets in process arguments.
        $arguments='-NoProfile -ExecutionPolicy Bypass -STA -File "{0}" -Elevated' -f $PSCommandPath
        if($ConfigPath){$arguments+=' -ConfigPath "{0}"' -f (Resolve-Path -LiteralPath $ConfigPath).Path}
        $process=Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
        exit $process.ExitCode
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
    $temporary=$null
    try {
        if(!$ConfigPath){
            $controller=(Read-Host 'Trusted HTTPS controller URL (https://...)').Trim().TrimEnd('/')
            $uri=$null
            if(![uri]::TryCreate($controller,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment){throw 'A trusted HTTPS controller origin is required. An HTTP server IP cannot be used.'}
            $id=(Read-Host 'Enrollment client ID from Managed Clients').Trim()
            $parsedId=[guid]::Empty
            if(![guid]::TryParse($id,[ref]$parsedId)){throw 'Enter the enrollment client ID, not the laptop IP address.'}
            $token=Read-Host 'Enrollment token (hidden)' -AsSecureString
            $tokenText=(New-Object Net.NetworkCredential('', $token)).Password
            if($tokenText -notmatch '^[A-Za-z0-9_-]{32,256}$'){throw 'Invalid enrollment token. Use the one-time token from Managed Clients.'}
            Write-Host 'Retrieving the repository already assigned in Fortress...'
            try {
                $profile=Get-ManagedRepository -Controller $controller -Id $id -Token $tokenText
            }catch{
                throw 'Could not retrieve the saved repository. Check the HTTPS address and enrollment credentials, and choose a repository for this laptop in Managed Clients.'
            }
            Write-Host ('Using saved storage: '+$profile.storageName+' / '+$profile.repositoryName) -ForegroundColor Cyan
            Add-Type -AssemblyName System.Windows.Forms
            $sources=@()
            do {
                $picker=New-Object Windows.Forms.FolderBrowserDialog
                try {
                    $picker.Description='Choose a folder to back up (Documents, Desktop, Pictures, or another folder)'
                    $picker.ShowNewFolderButton=$false
                    if($picker.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){throw 'Folder selection cancelled. Nothing was installed.'}
                    $sources+=$picker.SelectedPath
                    Write-Host ('Selected: '+$picker.SelectedPath)
                }finally{$picker.Dispose()}
            }while((Read-Host 'Add another folder? [y/N]') -match '^(y|yes)$')
            $ssh=Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
            if(!(Test-Path -LiteralPath $ssh)){
                Write-Host 'Installing the Windows OpenSSH client required for storage access...'
                Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0 | Out-Null
                if(!(Test-Path -LiteralPath $ssh)){throw 'Windows OpenSSH client installation did not complete. Check Windows optional features.'}
            }
            # Protect the directory before writing any plaintext secrets, including on PowerShell 5.1.
            $temporary=Join-Path $env:TEMP ('FortressSetup-'+[guid]::NewGuid().ToString('N'))
            $credentials=Save-ManagedRepository -Profile $profile -Directory $temporary
            $utf8=New-Object Text.UTF8Encoding($false)
            $tokenPath=Join-Path $temporary 'agent-token.txt'
            [IO.File]::WriteAllText($tokenPath,$tokenText,$utf8)
            $ConfigPath=Join-Path $temporary 'agent.json'
            $config=@{resticPath=$restic;repository=$credentials.repository;passwordFile=$credentials.passwordFile;sftpKeyFile=$credentials.sftpKeyFile;sftpKnownHostsFile=$credentials.sftpKnownHostsFile;sources=@($sources | Select-Object -Unique);excludes=@();host=$env:COMPUTERNAME;timeoutMinutes=240;useVSS=$true;controllerUrl=$controller;agentId=$id;agentTokenFile=$tokenPath}
            [IO.File]::WriteAllText($ConfigPath,($config | ConvertTo-Json -Depth 8),$utf8)
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
    }finally{
        if($temporary){Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue}
    }
}catch{
    Write-Host ('SETUP FAILED: '+$_.Exception.Message) -ForegroundColor Red
    Write-Host 'Read the error above. A failed verification does not start the polling task or consume queued backups.'
    exit 1
}finally{
    if($Elevated){[void](Read-Host 'Press Enter to close setup')}
}
