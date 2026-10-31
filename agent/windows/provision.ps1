#requires -Version 5.1
# Shared by interactive setup and the Windows installation verification.
function Get-ManagedRepository([string]$Controller,[string]$Id,[string]$Token){
    $uri=$null
    if(![uri]::TryCreate($Controller,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment){throw 'A trusted HTTPS controller origin is required.'}
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $profile=Invoke-RestMethod -Uri ($Controller.TrimEnd('/')+'/api/managed-agents/setup') -Method Post -ContentType 'application/json' -Body '{}' -Headers @{'Authorization'=('Bearer '+$Token);'X-Fortress-Agent-Id'=$Id} -MaximumRedirection 0 -TimeoutSec 30
    if(!$profile.repository -or !$profile.password -or !$profile.sshPrivateKey -or !$profile.knownHosts){throw 'The assigned repository is incomplete. Update its saved credentials in Fortress.'}
    return $profile
}

function Save-ManagedRepository([object]$Profile,[string]$Directory){
    # Create with the final ACL before writing plaintext credentials. The setup
    # launcher uses Windows PowerShell 5.1/.NET Framework for this atomic API.
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetSecurityDescriptorSddlForm('O:BAG:BAD:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)')
    [IO.Directory]::CreateDirectory($Directory,$acl) | Out-Null
    $utf8=New-Object Text.UTF8Encoding($false)
    $password=Join-Path $Directory 'repo-password.txt'
    $key=Join-Path $Directory 'storage-key'
    $hosts=Join-Path $Directory 'known_hosts'
    [IO.File]::WriteAllText($password,[string]$Profile.password,$utf8)
    [IO.File]::WriteAllText($key,([string]$Profile.sshPrivateKey).Replace("`r`n","`n").TrimEnd()+"`n",$utf8)
    [IO.File]::WriteAllText($hosts,[string]$Profile.knownHosts,$utf8)
    return @{repository=[string]$Profile.repository;passwordFile=$password;sftpKeyFile=$key;sftpKnownHostsFile=$hosts}
}

function Install-ManagedSetup([string]$SetupRoot,[object]$Profile,[string]$Controller,[string]$Id,[string]$Token,[string[]]$Sources){
    if(!$Sources.Count){throw 'Choose at least one folder to back up.'}
    foreach($source in $Sources){
        if(![IO.Path]::IsPathRooted($source) -or !(Test-Path -LiteralPath $source -PathType Container)){throw 'A selected folder no longer exists. Choose it again.'}
    }
    $ssh=Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
    if(!(Test-Path -LiteralPath $ssh)){
        Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0 | Out-Null
        if(!(Test-Path -LiteralPath $ssh)){throw 'Windows OpenSSH client installation did not complete. Check Windows optional features.'}
    }
    $temporary=Join-Path $env:TEMP ('FortressSetup-'+[guid]::NewGuid().ToString('N'))
    try {
        $credentials=Save-ManagedRepository -Profile $Profile -Directory $temporary
        $utf8=New-Object Text.UTF8Encoding($false)
        $tokenPath=Join-Path $temporary 'agent-token.txt'
        [IO.File]::WriteAllText($tokenPath,$Token,$utf8)
        $configPath=Join-Path $temporary 'agent.json'
        $config=@{resticPath=(Join-Path $SetupRoot 'restic.exe');repository=$credentials.repository;passwordFile=$credentials.passwordFile;sftpKeyFile=$credentials.sftpKeyFile;sftpKnownHostsFile=$credentials.sftpKnownHostsFile;sources=@($Sources | Select-Object -Unique);excludes=@();host=$env:COMPUTERNAME;timeoutMinutes=240;useVSS=$true;controllerUrl=$Controller;agentId=$Id;agentTokenFile=$tokenPath}
        [IO.File]::WriteAllText($configPath,($config | ConvertTo-Json -Depth 8),$utf8)
        & (Join-Path $SetupRoot 'setup.ps1') -ConfigPath $configPath -NonInteractive
    }finally{
        if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue}
    }
}
