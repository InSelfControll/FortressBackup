#requires -Version 5.1
# Run by Windows CI with Windows PowerShell, including its UTF-8 BOM behavior.
$ErrorActionPreference='Stop'
$root=Join-Path $env:RUNNER_TEMP ('fortress-setup-test-'+[guid]::NewGuid().ToString('N'))
$task='FortressBackup-SetupTest'
$installed=Join-Path $env:ProgramData 'FortressBackup'
New-Item -ItemType Directory -Path $root | Out-Null
$certificate=$null
$serverJob=$null
$port=$null
try {
    $exe=(Resolve-Path (Join-Path $PSScriptRoot 'fortress-agent.exe')).Path
    $password=Join-Path $root 'password.txt'
    $token=Join-Path $root 'token.txt'
    $cfg=Join-Path $root 'agent.json'
    [IO.File]::WriteAllText($password,[guid]::NewGuid().ToString('N'))
    [IO.File]::WriteAllText($token,[guid]::NewGuid().ToString('N'))
    $config=@{resticPath=$exe;passwordFile=$password;agentTokenFile=$token;repository='sftp:example.invalid:repo';sources=@($root);controllerUrl='https://controller.example.invalid';agentId=[guid]::NewGuid().ToString()}
    $config | ConvertTo-Json | Set-Content -LiteralPath $cfg -Encoding UTF8
    & $exe -config $cfg -operation validate
    if($LASTEXITCODE -ne 0){throw 'Agent rejected a valid PowerShell 5.1 configuration with a BOM'}
    $hash=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
    & (Join-Path $PSScriptRoot 'install-task.ps1') -AgentPath $exe -ConfigPath $cfg -AgentSha256 $hash -ResticSha256 $hash -TaskName $task -Managed
    $installedCfg=Join-Path $installed 'agent.json'
    & (Join-Path $installed 'fortress-agent.exe') -config $installedCfg -operation validate
    if($LASTEXITCODE -ne 0){throw 'Installed configuration cannot be read by the real agent'}
    $bytes=[IO.File]::ReadAllBytes($installedCfg)
    if($bytes[0] -eq 239){throw 'Installer wrote a UTF-8 BOM'}
    # Exercise successful preflight with the real agent, a local trusted HTTPS
    # controller fixture, and a harmless Restic stub. VSS/restore runs separately.
    $restic=Join-Path $root 'restic.exe'
    Add-Type -TypeDefinition 'public class ResticStub { public static int Main(string[] args) { return args.Length > 0 ? 0 : 1; } }' -OutputAssembly $restic -OutputType ConsoleApplication
    $config.resticPath=$restic
    $resticHash=(Get-FileHash -LiteralPath $restic -Algorithm SHA256).Hash
    $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0)
    $listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
    $certificate=New-SelfSignedCertificate -DnsName localhost -CertStoreLocation Cert:\LocalMachine\My
    $store=New-Object Security.Cryptography.X509Certificates.X509Store('Root','LocalMachine')
    $store.Open('ReadWrite');$store.Add($certificate);$store.Close()
    & netsh http add sslcert "ipport=0.0.0.0:$port" "certhash=$($certificate.Thumbprint)" 'appid={aab65062-e484-4b41-96db-faa6bcc832d2}' | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Test TLS binding failed'}
    $serverJob=Start-Job -ArgumentList $port,$root -ScriptBlock {
        param($port,$root)
        $http=New-Object Net.HttpListener
        $http.Prefixes.Add("https://localhost:$port/")
        $http.Start()
        [IO.File]::WriteAllText((Join-Path $root 'ready'),'ready')
        try {
            $request=$http.GetContext()
            if($request.Request.HttpMethod -ne 'POST' -or $request.Request.RawUrl -ne '/api/managed-agents/heartbeat'){throw 'Preflight tried to claim a job'}
            if(!$request.Request.Headers['Authorization'].StartsWith('Bearer ')){throw 'Enrollment authentication missing'}
            $body=[Text.Encoding]::UTF8.GetBytes('{"ok":true}')
            $request.Response.ContentType='application/json'
            $request.Response.ContentLength64=$body.Length
            $request.Response.OutputStream.Write($body,0,$body.Length)
            $request.Response.Close()
            [IO.File]::WriteAllText((Join-Path $root 'heartbeat'),'authenticated')
        }finally{$http.Stop();$http.Close()}
    }
    $deadline=(Get-Date).AddSeconds(30)
    while(!(Test-Path -LiteralPath (Join-Path $root 'ready')) -and (Get-Date) -lt $deadline){Start-Sleep -Milliseconds 200}
    if(!(Test-Path -LiteralPath (Join-Path $root 'ready'))){throw 'Test HTTPS server did not start'}
    $config.controllerUrl="https://localhost:$port"
    $config | ConvertTo-Json | Set-Content -LiteralPath $cfg -Encoding UTF8
    & (Join-Path $PSScriptRoot 'install-task.ps1') -AgentPath $exe -ConfigPath $cfg -AgentSha256 $hash -ResticSha256 $resticHash -TaskName $task -Managed -VerifySetup
    if(!(Test-Path -LiteralPath (Join-Path $root 'heartbeat'))){throw 'Setup never authenticated to the controller'}
    if((Get-Content -LiteralPath (Join-Path $installed 'setup-check.log') -Raw) -notmatch 'No queued job claimed'){throw 'Setup success diagnostics missing'}
    $before=(Get-FileHash -LiteralPath $installedCfg -Algorithm SHA256).Hash
    $beforeTask=Export-ScheduledTask -TaskName $task
    # An invalid controller causes preflight to fail before any storage or network request.
    $config.controllerUrl='http://controller.example.invalid'
    $config | ConvertTo-Json | Set-Content -LiteralPath $cfg -Encoding UTF8
    $rejected=$false
    try {
        & (Join-Path $PSScriptRoot 'install-task.ps1') -AgentPath $exe -ConfigPath $cfg -AgentSha256 $hash -ResticSha256 $resticHash -TaskName $task -Managed -VerifySetup
    }catch{$rejected=$true}
    if(!$rejected){throw 'Invalid setup was accepted'}
    if($before -ne (Get-FileHash -LiteralPath $installedCfg -Algorithm SHA256).Hash){throw 'Previous configuration lost after failed verification'}
    if($beforeTask -ne (Export-ScheduledTask -TaskName $task)){throw 'Previous task lost after failed verification'}
    $log=Get-Content -LiteralPath (Join-Path $installed 'setup-check.log') -Raw
    if($log -notmatch 'plain HTTPS origin'){throw 'Setup error was not recorded for the user'}
    if(@(Get-ScheduledTask | Where-Object {$_.TaskName -like 'FortressBackup-SetupCheck-*'}).Count){throw 'Temporary verification task leaked'}
    Write-Output 'PowerShell 5.1 config, SYSTEM preflight failure, diagnostics, and rollback verified'
}catch{
    $checkLog=Join-Path $installed 'setup-check.log'
    if(Test-Path -LiteralPath $checkLog){Get-Content -LiteralPath $checkLog | Write-Output}
    if($serverJob){Receive-Job $serverJob -ErrorAction Continue}
    throw
}finally{
    if($serverJob){Stop-Job $serverJob -ErrorAction SilentlyContinue;Remove-Job $serverJob -Force -ErrorAction SilentlyContinue}
    if($port){& netsh http delete sslcert "ipport=0.0.0.0:$port" | Out-Null}
    if($certificate){
        Remove-Item -LiteralPath "Cert:\LocalMachine\Root\$($certificate.Thumbprint)","Cert:\LocalMachine\My\$($certificate.Thumbprint)" -Force -ErrorAction SilentlyContinue
    }
    Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $root,$installed -Recurse -Force -ErrorAction SilentlyContinue
}
