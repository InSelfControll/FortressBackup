#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$InstallerPath)
$ErrorActionPreference='Stop'
$InstallerPath=(Resolve-Path -LiteralPath $InstallerPath).Path
$appRoot=Join-Path $env:ProgramFiles 'FortressBackup'
$dataRoot=Join-Path $env:ProgramData 'FortressBackup'
$shortcut=Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'Fortress Backup.lnk'
$registration='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{4FC94849-D647-4770-A754-0AD112B3D776}_is1'
$application=$null
$guiProcess=$null
function Invoke-TestInstaller([string]$Path,[string]$LogName){
    $log=Join-Path $env:RUNNER_TEMP $LogName
    $process=Start-Process -FilePath $Path -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="'+$log+'"')) -Wait -PassThru
    if($process.ExitCode -ne 0){throw "Installer process failed (exit $($process.ExitCode)). See $log"}
}
if((Test-Path -LiteralPath $appRoot) -or (Test-Path -LiteralPath $dataRoot)){throw 'Installer lifecycle test requires a clean Windows runner'}
try {
    # Installation must work offline, without configuring/enrolling an agent.
    Invoke-TestInstaller $InstallerPath 'fortress-install.log'
    foreach($name in @('FortressBackup.exe','fortress-agent.exe','restic.exe','setup.ps1','setup-ui.ps1','provision.ps1','install-task.ps1','uninstall-task.ps1','SHA256SUMS','unins000.exe','fortress.ico','LUCIDE-LICENSE.txt')){
        if(!(Test-Path -LiteralPath (Join-Path $appRoot $name))){throw "Installer omitted $name"}
    }
    Add-Type -AssemblyName System.Drawing
    foreach($name in @('FortressBackup.exe','fortress-agent.exe')){
        $info=[Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $appRoot $name))
        if($info.ProductName -ne 'Fortress Backup' -or !$info.FileVersion -or $info.OriginalFilename -ne $name){throw "Executable version metadata missing: $name"}
    }
    # Verify the installed app and both installer programs expose the brand icon.
    foreach($path in @((Join-Path $appRoot 'FortressBackup.exe'),(Join-Path $appRoot 'fortress-agent.exe'),(Join-Path $appRoot 'unins000.exe'),$InstallerPath)){
        $icon=[Drawing.Icon]::ExtractAssociatedIcon($path)
        try {
            $bitmap=$icon.ToBitmap()
            try {
                $brandColor=$false
                for($y=0;$y -lt $bitmap.Height -and !$brandColor;$y++){
                    for($x=0;$x -lt $bitmap.Width;$x++){
                        $pixel=$bitmap.GetPixel($x,$y)
                        if($pixel.R -eq 99 -and $pixel.G -eq 102 -and $pixel.B -eq 241){$brandColor=$true;break}
                    }
                }
                if(!$brandColor){throw 'The executable does not expose the Fortress icon'}
            }finally{$bitmap.Dispose()}
        }finally{$icon.Dispose()}
    }
    foreach($line in Get-Content -LiteralPath (Join-Path $appRoot 'SHA256SUMS')){
        $digest,$name=$line -split '  ',2
        if((Get-FileHash -LiteralPath (Join-Path $appRoot $name) -Algorithm SHA256).Hash -ine $digest){throw "Installed payload checksum mismatch: $name"}
    }
    if(!(Test-Path -LiteralPath $registration) -or !(Test-Path -LiteralPath $shortcut)){throw 'Installed app registration or Start menu entry missing'}
    if(Test-Path -LiteralPath $dataRoot){throw 'Installer configured an agent before the user opened the app'}
    if(Get-ScheduledTask -TaskName FortressBackup-Windows -ErrorAction SilentlyContinue){throw 'Installer started an unconfigured agent'}
    $shell=New-Object -ComObject WScript.Shell
    if($shell.CreateShortcut($shortcut).TargetPath -ine (Join-Path $appRoot 'FortressBackup.exe')){throw 'Start menu shortcut points to the wrong executable'}
    # Open the actual installed executable, rather than only constructing a form.
    $application=Start-Process -FilePath (Join-Path $appRoot 'FortressBackup.exe') -PassThru
    $deadline=(Get-Date).AddSeconds(30)
    while((Get-Date) -lt $deadline){
        $child=Get-CimInstance Win32_Process -Filter "ParentProcessId = $($application.Id)" | Select-Object -First 1
        if($child){
            $guiProcess=Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
            if($guiProcess -and $guiProcess.MainWindowTitle -eq 'Fortress Backup'){break}
        }
        Start-Sleep -Milliseconds 200
    }
    if(!$guiProcess -or $guiProcess.MainWindowTitle -ne 'Fortress Backup'){throw 'Installed app did not open its configuration window'}
    if(!$guiProcess.CloseMainWindow()){throw 'Installed app could not close normally'}
    if(!$application.WaitForExit(15000) -or $application.ExitCode -ne 0){throw 'Closing configuration did not exit cleanly'}
    $application=$null;$guiProcess=$null
    if(Test-Path -LiteralPath $dataRoot){throw 'Closing unconfigured app changed agent settings'}
    # A previous configuration must survive reinstall/upgrade and load in the UI.
    . (Join-Path $appRoot 'provision.ps1')
    . (Join-Path $appRoot 'setup-ui.ps1')
    $profile=@{repository='sftp://backup@example.invalid:23/repository';password=[guid]::NewGuid().ToString('N');sshPrivateKey='test-only';knownHosts='test-only'}
    $credentials=Save-ManagedRepository -Profile $profile -Directory $dataRoot
    $tokenPath=Join-Path $dataRoot 'agent-token.txt'
    $secret=[guid]::NewGuid().ToString('N')
    [IO.File]::WriteAllText($tokenPath,$secret)
    $configPath=Join-Path $dataRoot 'agent.json'
    $config=@{controllerUrl='https://controller.example.invalid';agentId=[guid]::NewGuid().ToString();agentTokenFile=$tokenPath;sources=@($env:RUNNER_TEMP);excludes=@('*.tmp');useVSS=$false;timeoutMinutes=60;host='saved-host'}
    [IO.File]::WriteAllText($configPath,($config|ConvertTo-Json))
    $before=(Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash
    $beforeKey=(Get-FileHash -LiteralPath $credentials.sftpKeyFile -Algorithm SHA256).Hash
    foreach($name in @('fortress-agent.exe','restic.exe')){Copy-Item -LiteralPath (Join-Path $appRoot $name) -Destination (Join-Path $dataRoot $name)}
    $action=New-ScheduledTaskAction -Execute (Join-Path $dataRoot 'fortress-agent.exe') -Argument '-operation managed'
    $principal=New-ScheduledTaskPrincipal -UserId SYSTEM -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName FortressBackup-Windows -Action $action -Principal $principal | Out-Null
    $beforeTask=Export-ScheduledTask -TaskName FortressBackup-Windows
    Invoke-TestInstaller $InstallerPath 'fortress-upgrade.log'
    if($before -ne (Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash -or $beforeKey -ne (Get-FileHash -LiteralPath $credentials.sftpKeyFile -Algorithm SHA256).Hash){throw 'Upgrade changed saved configuration or storage credentials'}
    if($beforeTask -ne (Export-ScheduledTask -TaskName FortressBackup-Windows)){throw 'Upgrade changed the configured agent task'}
    $window=New-SetupWindow -SetupRoot $appRoot
    try {
        if($window.Controls['controller'].Text -ne $config.controllerUrl -or $window.Controls['clientId'].Text -ne $config.agentId -or $window.Controls['token'].Text -ne $secret){throw 'Reopening the app did not load saved enrollment'}
        if($window.Controls['folders'].Items.Count -ne 1 -or $window.Controls['folders'].Items[0] -ne $env:RUNNER_TEMP){throw 'Reopening the app did not load saved folders'}
        if(!$window.Controls['token'].UseSystemPasswordChar){throw 'Saved token is visible'}
    }finally{$window.Dispose()}
    # Exercise the shared configuration writer without starting a backup task.
    $writerFixture=Join-Path $env:RUNNER_TEMP ('configuration-writer-'+[guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($writerFixture) | Out-Null
    try {
        @'
param($ConfigPath,[switch]$NonInteractive)
$written=Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if($written.excludes[0] -ne '*.tmp' -or $written.useVSS -ne $false -or $written.timeoutMinutes -ne 60 -or $written.host -ne 'saved-host'){throw 'Folder edit overwrote existing advanced settings'}
if($written.sources.Count -ne 1 -or $written.sources[0] -ne $env:RUNNER_TEMP){throw 'Folder edit did not apply the selected sources'}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'temporary-path'),$ConfigPath)
'@ | Set-Content -LiteralPath (Join-Path $writerFixture 'setup.ps1') -Encoding UTF8
        Install-ManagedSetup -SetupRoot $writerFixture -Profile $profile -Controller $config.controllerUrl -Id $config.agentId -Token $secret -Sources @($env:RUNNER_TEMP)
        $temporaryConfig=[IO.File]::ReadAllText((Join-Path $writerFixture 'temporary-path'))
        if(Test-Path -LiteralPath $temporaryConfig){throw 'Configuration writer left staged credentials behind'}
    }finally{Remove-Item -LiteralPath $writerFixture -Recurse -Force}
    Invoke-TestInstaller (Join-Path $appRoot 'unins000.exe') 'fortress-uninstall.log'
    if(Get-ScheduledTask -TaskName FortressBackup-Windows -ErrorAction SilentlyContinue){throw 'Uninstall left the agent task enabled'}
    foreach($path in @($registration,$shortcut,(Join-Path $appRoot 'FortressBackup.exe'),(Join-Path $dataRoot 'fortress-agent.exe'),(Join-Path $dataRoot 'restic.exe'))){if(Test-Path -LiteralPath $path){throw 'Uninstall left an application registration, shortcut, or executable'}}
    if($before -ne (Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash -or $beforeKey -ne (Get-FileHash -LiteralPath $credentials.sftpKeyFile -Algorithm SHA256).Hash){throw 'Uninstall removed saved configuration or storage credentials'}
    Write-Output 'Single-file installer, Start menu launch, configuration later, upgrade preservation, and uninstall verified'
}finally{
    if($guiProcess){Stop-Process -Id $guiProcess.Id -Force -ErrorAction SilentlyContinue}
    if($application){Stop-Process -Id $application.Id -Force -ErrorAction SilentlyContinue}
    Unregister-ScheduledTask -TaskName FortressBackup-Windows -Confirm:$false -ErrorAction SilentlyContinue
    if(Test-Path -LiteralPath $dataRoot){Remove-Item -LiteralPath $dataRoot -Recurse -Force}
}
