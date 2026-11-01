#requires -Version 5.1
# Run by Windows CI with Windows PowerShell, including its UTF-8 BOM behavior.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'provision.ps1')
. (Join-Path $PSScriptRoot 'setup-ui.ps1')
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
    # This fixture uses an extra task name for rollback assertions. Keep it idle
    # while the production task is upgraded/verified so minute ticks cannot race preflight.
    Disable-ScheduledTask -TaskName $task | Out-Null
    Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
    $installedCfg=Join-Path $installed 'agent.json'
    # Match the installed bundle before testing a later real runtime upgrade.
    Copy-Item -LiteralPath $exe -Destination (Join-Path $PSScriptRoot 'restic.exe') -Force
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
    $profileFixture=@{repository='sftp://backup@storage.example.invalid:23/repository';password=[guid]::NewGuid().ToString('N');sshPrivateKey=('identity-'+[guid]::NewGuid().ToString('N'));knownHosts=('pinned-host-'+[guid]::NewGuid().ToString('N'));repositoryName='Saved repository';storageName='Saved storage'}
    $expectedToken=[IO.File]::ReadAllText($token)
    $serverJob=Start-Job -ArgumentList $port,$root,($profileFixture|ConvertTo-Json),$expectedToken,$config.agentId -ScriptBlock {
        param($port,$root,$profileJson,$expectedToken,$agentId)
        $http=New-Object Net.HttpListener
        $http.Prefixes.Add("https://localhost:$port/")
        $http.Start()
        [IO.File]::WriteAllText((Join-Path $root 'ready'),'ready')
        try {
            foreach($route in @('setup','setup','heartbeat','heartbeat')){
                do {
                    $request=$http.GetContext()
                    $background=$request.Request.RawUrl -eq '/api/managed-agents/poll'
                    if($background){
                        $reader=New-Object IO.StreamReader($request.Request.InputStream);[void]$reader.ReadToEnd();$reader.Dispose()
                        $bytes=[Text.Encoding]::UTF8.GetBytes('{"job":null,"ok":true}')
                        $request.Response.ContentType='application/json';$request.Response.ContentLength64=$bytes.Length
                        $request.Response.OutputStream.Write($bytes,0,$bytes.Length);$request.Response.Close()
                    }
                }while($background)
                if($request.Request.HttpMethod -ne 'POST' -or $request.Request.RawUrl -ne ('/api/managed-agents/'+$route)){throw 'Setup tried to claim a job'}
                if($request.Request.Headers['Authorization'] -ne ('Bearer '+$expectedToken) -or $request.Request.Headers['X-Fortress-Agent-Id'] -ne $agentId){throw 'Enrollment authentication missing'}
                $response=if($route -eq 'setup'){$profileJson}else{'{"ok":true}'}
                $body=[Text.Encoding]::UTF8.GetBytes($response)
                $request.Response.ContentType='application/json'
                $request.Response.ContentLength64=$body.Length
                $request.Response.OutputStream.Write($body,0,$body.Length)
                $request.Response.Close()
                [IO.File]::WriteAllText((Join-Path $root $route),'authenticated')
            }
            $conflictSent=$false
            $snapshotId='a'*64
            foreach($operation in @('snapshots','files','restore','backup')){
                $jobId=[guid]::NewGuid().ToString()
                foreach($route in @('request','result')){
                    do {
                        $request=$http.GetContext()
                        $background=$request.Request.RawUrl -in @('/api/managed-agents/poll','/api/managed-agents/heartbeat')
                        if($background){
                            $reader=New-Object IO.StreamReader($request.Request.InputStream);[void]$reader.ReadToEnd();$reader.Dispose()
                            $bytes=[Text.Encoding]::UTF8.GetBytes('{"job":null,"ok":true}')
                            $request.Response.ContentType='application/json';$request.Response.ContentLength64=$bytes.Length
                            $request.Response.OutputStream.Write($bytes,0,$bytes.Length);$request.Response.Close()
                        }elseif(!$conflictSent -and $operation -eq 'snapshots' -and $route -eq 'request'){
                            if($request.Request.RawUrl -ne '/api/managed-agents/request'){throw 'Snapshot navigation did not request the backup list'}
                            $reader=New-Object IO.StreamReader($request.Request.InputStream);[void]$reader.ReadToEnd();$reader.Dispose()
                            $bytes=[Text.Encoding]::UTF8.GetBytes('{"error":"Client already has an active job"}')
                            $request.Response.StatusCode=409;$request.Response.ContentType='application/json';$request.Response.ContentLength64=$bytes.Length
                            $request.Response.OutputStream.Write($bytes,0,$bytes.Length);$request.Response.Close()
                            $conflictSent=$true;$background=$true
                        }
                    }while($background)
                    if($request.Request.RawUrl -ne ('/api/managed-agents/'+$route)){throw ('Recovery used an unexpected route: '+$request.Request.RawUrl)}
                    if($request.Request.Headers['Authorization'] -ne ('Bearer '+$expectedToken) -or $request.Request.Headers['X-Fortress-Agent-Id'] -ne $agentId){throw 'Recovery authentication missing'}
                    $reader=New-Object IO.StreamReader($request.Request.InputStream)
                    $body=$reader.ReadToEnd() | ConvertFrom-Json;$reader.Dispose()
                    if($route -eq 'request'){
                        if($body.operation -ne $operation){throw 'Recovery queued the wrong operation'}
                        if($operation -eq 'backup' -and $body.request.PSObject.Properties['allDevices']){throw 'Backup inherited an invalid snapshot-list scope'}
                        if($operation -eq 'restore' -and ($body.request.paths.Count -ne 1 -or $body.request.paths[0] -ne '/document[1].txt')){throw 'Recovery lost the exact selected filename'}
                        $response=@{id=$jobId;state='pending';operation=$operation}
                    }else{
                        if($body.id -ne $jobId){throw 'Recovery requested another job result'}
                        $data=switch($operation){
                            snapshots {@{snapshots=@(@{id=$snapshotId;time='2026-11-01T00:00:00Z';hostname='test-host'});offset=0;hasMore=$false}}
                            files {@{entries=@(@{name='document[1].txt';path='/document[1].txt';type='file';size=7});directory='/';snapshotId=$snapshotId;offset=0;hasMore=$false}}
                            restore {@{snapshotId=$snapshotId;restorePath='C:\ProgramData\FortressBackup\restores\'+$jobId}}
                        }
                        $response=@{id=$jobId;state='success';operation=$operation;result=$data}
                    }
                    $bytes=[Text.Encoding]::UTF8.GetBytes(($response | ConvertTo-Json -Depth 10 -Compress))
                    $request.Response.ContentType='application/json';$request.Response.ContentLength64=$bytes.Length
                    $request.Response.OutputStream.Write($bytes,0,$bytes.Length);$request.Response.Close()
                }
            }
        }finally{$http.Stop();$http.Close()}
    }
    $deadline=(Get-Date).AddSeconds(30)
    while(!(Test-Path -LiteralPath (Join-Path $root 'ready')) -and (Get-Date) -lt $deadline){Start-Sleep -Milliseconds 200}
    if(!(Test-Path -LiteralPath (Join-Path $root 'ready'))){throw 'Test HTTPS server did not start'}
    $config.controllerUrl="https://localhost:$port"
    # Exercise the actual GUI and its asynchronous, authenticated connection.
    # Closing before Install must leave the existing task and files untouched.
    $beforeGui=(Get-FileHash -LiteralPath $installedCfg -Algorithm SHA256).Hash
    $window=New-SetupWindow -SetupRoot $PSScriptRoot -AutoConnect:$false
    try {
        $window.Show()
        $window.Controls['controller'].Clear()
        $window.Controls['folders'].Items.Clear()
        $window.Controls['connect'].PerformClick()
        if($window.Controls['status'].Text -notmatch 'HTTPS'){throw 'GUI did not validate the controller address'}
        $window.Controls['controller'].Text=$config.controllerUrl
        $window.Controls['clientId'].Text=$config.agentId
        $window.Controls['token'].Text=$expectedToken
        if(!$window.Controls['token'].UseSystemPasswordChar){throw 'GUI enrollment token is visible'}
        $window.Controls['connect'].PerformClick()
        if(!$window.Tag.Worker -or $window.Controls['close'].Enabled){throw 'GUI did not enter its busy state'}
        $window.Close()
        if($window.IsDisposed){throw 'GUI closed during an operation'}
        $deadline=(Get-Date).AddSeconds(40)
        while($window.Tag.Worker -and (Get-Date) -lt $deadline){[Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 50}
        if(!$window.Tag.Profile){throw ('GUI connection failed: '+$window.Controls['status'].Text)}
        if($window.Controls['repository'].Text -notmatch 'Saved storage / Saved repository'){throw 'GUI did not display the saved repository'}
        if($window.Controls['install'].Enabled -or !$window.Controls['addFolder'].Enabled){throw 'GUI allowed installation without folders'}
        $image=New-Object Drawing.Bitmap($window.Width,$window.Height)
        try {
            $window.DrawToBitmap($image,(New-Object Drawing.Rectangle(0,0,$window.Width,$window.Height)))
            $image.Save((Join-Path $env:RUNNER_TEMP 'fortress-setup-gui.png'),[Drawing.Imaging.ImageFormat]::Png)
        }finally{$image.Dispose()}
        [void]$window.Controls['folders'].Items.Add($root)
        $window.Controls['folders'].SelectedIndex=0
        $window.Controls['removeFolder'].PerformClick()
        if($window.Controls['folders'].Items.Count -or $window.Controls['install'].Enabled){throw 'GUI folder removal failed'}
        $profile=$window.Tag.Profile
        $window.Controls['controller'].Text='https://changed.example.invalid'
        if($window.Tag.Profile -or $window.Controls['install'].Enabled){throw 'GUI reused stale credentials after connection settings changed'}
        $window.Controls['close'].PerformClick()
        if($beforeGui -ne (Get-FileHash -LiteralPath $installedCfg -Algorithm SHA256).Hash){throw 'Cancelling GUI setup changed the installed configuration'}
    }finally{if(!$window.IsDisposed){$window.Dispose()}}
    # A newer installed bundle updates the old SYSTEM runtime on automatic reconnect.
    Copy-Item -LiteralPath $restic -Destination (Join-Path $PSScriptRoot 'restic.exe') -Force
    @(($hash.ToLowerInvariant()+'  fortress-agent.exe'),($resticHash.ToLowerInvariant()+'  restic.exe')) | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'SHA256SUMS') -Encoding ascii
    # A reopened configured app connects automatically without another button click.
    $reopenConfig=Get-Content -LiteralPath $installedCfg -Raw | ConvertFrom-Json
    $reopenConfig.controllerUrl=$config.controllerUrl
    [IO.File]::WriteAllText($installedCfg,($reopenConfig | ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
    $window=New-SetupWindow -SetupRoot $PSScriptRoot
    try{
        $window.Show()
        $deadline=(Get-Date).AddSeconds(40)
        while(!$window.Tag.Profile -and (Get-Date) -lt $deadline){[Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 50}
        if(!$window.Tag.Profile){throw ('Saved enrollment did not reconnect automatically: '+$window.Controls['status'].Text)}
        if(!$window.Tag.Profile.runtimeUpdated){throw 'New app did not update the older SYSTEM runtime automatically'}
        if((Get-FileHash -LiteralPath (Join-Path $installed 'restic.exe') -Algorithm SHA256).Hash -ne $resticHash){throw 'Background runtime is still from the older app'}
        if((Get-Content -LiteralPath $installedCfg -Raw | ConvertFrom-Json).sources[0] -ne $root){throw 'Automatic runtime upgrade changed backup folders'}
        $window.Close()
    }finally{if(!$window.IsDisposed){$window.Dispose()}}
    Disable-ScheduledTask -TaskName 'FortressBackup-Windows' | Out-Null
    Stop-ScheduledTask -TaskName 'FortressBackup-Windows' -ErrorAction SilentlyContinue
    $generated=Join-Path $root 'generated credentials'
    $credentials=Save-ManagedRepository -Profile $profile -Directory $generated
    foreach($name in $credentials.Keys){$config[$name]=$credentials[$name]}
    if([IO.File]::ReadAllText($config.passwordFile) -ne $profileFixture.password){throw 'Saved encryption password was not provisioned'}
    if([IO.File]::ReadAllText($config.sftpKeyFile) -ne ($profileFixture.sshPrivateKey+"`n")){throw 'Saved SSH identity lost its final newline'}
    if((Get-Acl -LiteralPath $generated).Sddl -match ';;;WD|;;;BU|;;;AU'){throw 'Provisioned credentials are readable by ordinary users'}
    $config | ConvertTo-Json | Set-Content -LiteralPath $cfg -Encoding UTF8
    & (Join-Path $PSScriptRoot 'install-task.ps1') -AgentPath $exe -ConfigPath $cfg -AgentSha256 $hash -ResticSha256 $resticHash -TaskName $task -Managed -VerifySetup
    if(!(Test-Path -LiteralPath (Join-Path $root 'heartbeat'))){throw 'Setup never authenticated to the controller'}
    if((Get-Content -LiteralPath (Join-Path $installed 'setup-check.log') -Raw) -notmatch 'No queued job claimed'){throw 'Setup success diagnostics missing'}
    $savedConfig=Get-Content -LiteralPath $installedCfg -Raw|ConvertFrom-Json
    if($savedConfig.sftpKeyFile -ne (Join-Path $installed 'storage-key') -or $savedConfig.sftpKnownHostsFile -ne (Join-Path $installed 'known_hosts')){throw 'Storage credential paths were not rewritten for SYSTEM'}
    # Exercise recovery in the same actual WinForms window with saved credentials.
    $window=New-SetupWindow -SetupRoot $PSScriptRoot -AutoConnect:$false
    function Wait-RecoveryUI([scriptblock]$Condition){
        $deadline=(Get-Date).AddSeconds(40)
        while(!( & $Condition) -and (Get-Date) -lt $deadline){[Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 50}
        if(!( & $Condition)){throw ('Recovery GUI timed out: '+$window.Controls['recovery'].Controls['status'].Text)}
    }
    try{
        $window.Show();$window.Controls['backups'].PerformClick()
        $recovery=$window.Controls['recovery']
        if(!$recovery.Visible){throw 'Recovery did not open in the existing window'}
        if($window.Controls['backups'].Text -ne 'Snapshots' -or $window.Controls['backupNow'].Text -ne 'Backup now'){throw 'Snapshot / backup navigation missing'}
        Wait-RecoveryUI {$recovery.Controls['status'].Text -like '*Client already has an active job*' -and $recovery.Controls['load'].Enabled}
        $recovery.Controls['load'].PerformClick()
        Wait-RecoveryUI {$recovery.Controls['snapshots'].Items.Count -eq 1 -and $recovery.Controls['snapshots'].Enabled}
        $recovery.Controls['snapshots'].SelectedIndex=0
        $recovery.Controls['snapshots'].GetType().GetMethod('OnSelectionChangeCommitted',[Reflection.BindingFlags]'Instance,NonPublic').Invoke($recovery.Controls['snapshots'],@([EventArgs]::Empty))
        Wait-RecoveryUI {$recovery.Controls['entries'].Items.Count -eq 1 -and $recovery.Controls['entries'].Enabled}
        if($recovery.Controls['restore'].Enabled){throw 'GUI allowed an empty selective restore'}
        $recovery.Controls['entries'].SetItemChecked(0,$true)
        if(!$recovery.Controls['restore'].Enabled){throw 'GUI did not enable selected-file restore'}
        $recovery.Controls['restore'].PerformClick()
        Wait-RecoveryUI {$recovery.Controls['status'].Text -like 'Restored to:*' -and $recovery.Controls['open'].Enabled}
        $recovery.Controls['back'].PerformClick()
        if($recovery.Visible){throw 'Configuration did not return in the same window'}
        $window.Controls['backupNow'].PerformClick()
        Wait-RecoveryUI {$recovery.Controls['status'].Text -like 'Backup saved.*' -and $recovery.Controls['backup'].Enabled}
        $window.Close()
    }finally{if(!$window.IsDisposed){$window.Dispose()}}
    $beforeKey=(Get-FileHash -LiteralPath $savedConfig.sftpKeyFile -Algorithm SHA256).Hash
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
    if($beforeKey -ne (Get-FileHash -LiteralPath $savedConfig.sftpKeyFile -Algorithm SHA256).Hash){throw 'Previous storage identity lost after failed verification'}
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
    Stop-ScheduledTask -TaskName 'FortressBackup-Windows' -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName 'FortressBackup-Windows' -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $root,$installed -Recurse -Force -ErrorAction SilentlyContinue
}
