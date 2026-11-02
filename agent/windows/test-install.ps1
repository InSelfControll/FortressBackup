#requires -Version 5.1
# Run by Windows CI with Windows PowerShell, including its UTF-8 BOM behavior.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'provision.ps1')
. (Join-Path $PSScriptRoot 'setup-ui.ps1')
# Screenshots come from the native Windows controls, using disposable test data.
function Save-TestWindow($Window,[string]$Name){
    $Window.PerformLayout();[Windows.Forms.Application]::DoEvents()
    # Capture the top of the scrollable page consistently, including at larger text.
    $recoveryView=$Window.Controls.Find('recovery',$true)[0]
    if($recoveryView -and $recoveryView.Visible){$recoveryView.AutoScrollPosition=[Drawing.Point]::Empty}
    [Windows.Forms.Application]::DoEvents()
    $image=New-Object Drawing.Bitmap($Window.Width,$Window.Height)
    try{$Window.DrawToBitmap($image,(New-Object Drawing.Rectangle(0,0,$Window.Width,$Window.Height)));$image.Save((Join-Path $env:RUNNER_TEMP $Name),[Drawing.Imaging.ImageFormat]::Png)}finally{$image.Dispose()}
}
function Assert-TestLayout($Container){
    foreach($control in $Container.Controls){
        if(!$control.Visible){continue}
        if($control.Right -gt $Container.ClientSize.Width+2){throw ('Control extends past its container: '+$control.Name)}
        if(!$Container.AutoScroll -and $control.Bottom -gt $Container.ClientSize.Height+2){throw ('Control is cut off vertically: '+$control.Name)}
        if($control -is [Windows.Forms.Button]){
            $preferred=$control.GetPreferredSize([Drawing.Size]::Empty)
            if($preferred.Width -gt $control.Width+2 -or $preferred.Height -gt $control.Height+2){throw ('Button text is clipped: '+$control.Name)}
        }
        if($Container -is [Windows.Forms.TableLayoutPanel]){
            foreach($other in $Container.Controls){
                if($other -eq $control -or !$other.Visible){continue}
                $overlap=[Drawing.Rectangle]::Intersect($control.Bounds,$other.Bounds)
                if($overlap.Width -gt 1 -and $overlap.Height -gt 1){throw ('Controls overlap: '+$control.Name+' / '+$other.Name)}
            }
        }
        Assert-TestLayout $control
    }
}

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
                $round=0
                foreach($route in $(if($operation -eq 'backup'){@('request','result','result')}else{@('request','result')})){
                    $round++
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
                        if($operation -eq 'backup' -and $round -eq 2){$response=@{id=$jobId;state='running';operation='backup';progress=@{percentDone=0.42;bytesDone=42;totalBytes=100;filesDone=2;totalFiles=5;updatedAt=[datetime]::UtcNow.ToString('o')}}}
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
        $window.Controls.Find('controller',$true)[0].Clear()
        $window.Controls.Find('folders',$true)[0].Items.Clear()
        $window.Controls.Find('connect',$true)[0].PerformClick()
        if($window.Controls.Find('status',$true)[0].Text -notmatch 'HTTPS'){throw 'GUI did not validate the controller address'}
        $window.Controls.Find('controller',$true)[0].Text=$config.controllerUrl
        $window.Controls.Find('clientId',$true)[0].Text=$config.agentId
        $window.Controls.Find('token',$true)[0].Text=$expectedToken
        if(!$window.Controls.Find('token',$true)[0].UseSystemPasswordChar){throw 'GUI enrollment token is visible'}
        $window.Controls.Find('connect',$true)[0].PerformClick()
        if(!$window.Tag.Worker -or $window.Controls.Find('close',$true)[0].Enabled){throw 'GUI did not enter its busy state'}
        $window.Close()
        if($window.IsDisposed){throw 'GUI closed during an operation'}
        $deadline=(Get-Date).AddSeconds(40)
        while($window.Tag.Worker -and (Get-Date) -lt $deadline){[Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 50}
        if(!$window.Tag.Profile){throw ('GUI connection failed: '+$window.Controls.Find('status',$true)[0].Text)}
        if($window.Controls.Find('repository',$true)[0].Text -notmatch 'Saved storage / Saved repository'){throw 'GUI did not display the saved repository'}
        if($window.Controls.Find('install',$true)[0].Enabled -or !$window.Controls.Find('addFolder',$true)[0].Enabled){throw 'GUI allowed installation without folders'}
        Save-TestWindow $window 'fortress-setup-gui.png'
        Assert-TestLayout $window
        [void]$window.Controls.Find('folders',$true)[0].Items.Add($root)
        $window.Controls.Find('folders',$true)[0].SelectedIndex=0
        $window.Controls.Find('removeFolder',$true)[0].PerformClick()
        if($window.Controls.Find('folders',$true)[0].Items.Count -or $window.Controls.Find('install',$true)[0].Enabled){throw 'GUI folder removal failed'}
        $profile=$window.Tag.Profile
        $window.Controls.Find('controller',$true)[0].Text='https://changed.example.invalid'
        if($window.Tag.Profile -or $window.Controls.Find('install',$true)[0].Enabled){throw 'GUI reused stale credentials after connection settings changed'}
        $window.Controls.Find('close',$true)[0].PerformClick()
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
        if(!$window.Tag.Profile){throw ('Saved enrollment did not reconnect automatically: '+$window.Controls.Find('status',$true)[0].Text)}
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
    Disable-ScheduledTask -TaskName $task | Out-Null
    Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
    if(!(Test-Path -LiteralPath (Join-Path $root 'heartbeat'))){throw 'Setup never authenticated to the controller'}
    if((Get-Content -LiteralPath (Join-Path $installed 'setup-check.log') -Raw) -notmatch 'No queued job claimed'){throw 'Setup success diagnostics missing'}
    $savedConfig=Get-Content -LiteralPath $installedCfg -Raw|ConvertFrom-Json
    if($savedConfig.sftpKeyFile -ne (Join-Path $installed 'storage-key') -or $savedConfig.sftpKnownHostsFile -ne (Join-Path $installed 'known_hosts')){throw 'Storage credential paths were not rewritten for SYSTEM'}
    # Exercise recovery in the same actual WinForms window with saved credentials.
    $window=New-SetupWindow -SetupRoot $PSScriptRoot -AutoConnect:$false
    function Wait-RecoveryUI([scriptblock]$Condition){
        $deadline=(Get-Date).AddSeconds(40)
        while(!( & $Condition) -and (Get-Date) -lt $deadline){[Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 50}
        if(!( & $Condition)){throw ('Recovery GUI timed out: '+$window.Controls.Find('recovery',$true)[0].Controls.Find('status',$true)[0].Text)}
    }
    try{
        $window.Show();$window.Controls.Find('backups',$true)[0].PerformClick()
        $recovery=$window.Controls.Find('recovery',$true)[0]
        if(!$recovery.Visible){throw 'Recovery did not open in the existing window'}
        if($window.Controls.Find('backups',$true)[0].Text -ne 'Snapshots' -or $window.Controls.Find('backupNow',$true)[0].Text -ne 'Backup now'){throw 'Snapshot / backup navigation missing'}
        Wait-RecoveryUI {$recovery.Controls.Find('status',$true)[0].Text -like '*Client already has an active job*' -and $recovery.Controls.Find('load',$true)[0].Enabled}
        if($recovery.Controls.Find('status',$true)[0].Text -match 'EndInvoke|Exception calling'){throw 'Recovery exposed its reflection wrapper instead of the actionable error'}
        Save-TestWindow $window 'fortress-recovery-error.png'
        $recovery.Controls.Find('load',$true)[0].PerformClick()
        Wait-RecoveryUI {$recovery.Controls.Find('snapshots',$true)[0].Items.Count -eq 1 -and $recovery.Controls.Find('snapshots',$true)[0].Enabled}
        $recovery.Controls.Find('snapshots',$true)[0].SelectedIndex=0
        $recovery.Controls.Find('snapshots',$true)[0].GetType().GetMethod('OnSelectionChangeCommitted',[Reflection.BindingFlags]'Instance,NonPublic').Invoke($recovery.Controls.Find('snapshots',$true)[0],@([EventArgs]::Empty))
        Wait-RecoveryUI {$recovery.Controls.Find('entries',$true)[0].Items.Count -eq 1 -and $recovery.Controls.Find('entries',$true)[0].Enabled}
        if($recovery.Controls.Find('restore',$true)[0].Enabled){throw 'GUI allowed an empty selective restore'}
        Save-TestWindow $window 'fortress-recovery-gui.png'
        Assert-TestLayout $window
        $normalSize=$window.ClientSize
        $window.ClientSize=New-Object Drawing.Size(860,640)
        Save-TestWindow $window 'fortress-recovery-compact.png'
        Assert-TestLayout $window
        $window.Font=New-Object Drawing.Font('Segoe UI',14)
        Save-TestWindow $window 'fortress-recovery-large-text.png'
        Assert-TestLayout $window
        $window.Font=New-Object Drawing.Font('Segoe UI',10);$window.ClientSize=$normalSize
        $recovery.Controls.Find('entries',$true)[0].SetItemChecked(0,$true)
        if(!$recovery.Controls.Find('restore',$true)[0].Enabled){throw 'GUI did not enable selected-file restore'}
        $recovery.Controls.Find('restore',$true)[0].PerformClick()
        Wait-RecoveryUI {$recovery.Controls.Find('status',$true)[0].Text -like 'Restored to:*' -and $recovery.Controls.Find('open',$true)[0].Enabled}
        $window.Controls.Find('deviceSettings',$true)[0].PerformClick()
        if($recovery.Visible){throw 'Configuration did not return in the same window'}
        $window.Controls.Find('backupNow',$true)[0].PerformClick()
        Wait-RecoveryUI {$recovery.Controls.Find('backupProgress',$true)[0].Visible -and $recovery.Controls.Find('backupProgress',$true)[0].Value -eq 420}
        Wait-RecoveryUI {$recovery.Controls.Find('status',$true)[0].Text -like 'Backup saved.*' -and $window.Controls.Find('backupNow',$true)[0].Enabled}
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
