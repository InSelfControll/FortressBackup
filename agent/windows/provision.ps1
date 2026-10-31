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
