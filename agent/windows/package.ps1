#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$AgentDirectory,
    [Parameter(Mandatory)][string]$ResticPath,
    [Parameter(Mandatory)][ValidatePattern('^v\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$')][string]$Version,
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
$AgentDirectory=(Resolve-Path -LiteralPath $AgentDirectory).Path
$ResticPath=(Resolve-Path -LiteralPath $ResticPath).Path
$OutputDirectory=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$OutputDirectory=(Resolve-Path -LiteralPath $OutputDirectory).Path
foreach($name in @('fortress-agent.exe','FortressBackup.exe')){
    $expected=((Get-Content -LiteralPath (Join-Path $AgentDirectory ($name+'.sha256')) -Raw) -split '\s+')[0]
    if($expected -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash -LiteralPath (Join-Path $AgentDirectory $name) -Algorithm SHA256).Hash -ine $expected){throw "Artifact checksum mismatch: $name"}
}
$work=Join-Path $env:TEMP ('FortressPackage-'+[guid]::NewGuid().ToString('N'))
try {
    $bundle=Join-Path $work 'bundle'
    [IO.Directory]::CreateDirectory($bundle) | Out-Null
    foreach($name in @('fortress-agent.exe','FortressBackup.exe')){Copy-Item -LiteralPath (Join-Path $AgentDirectory $name) -Destination (Join-Path $bundle $name)}
    Copy-Item -LiteralPath $ResticPath -Destination (Join-Path $bundle 'restic.exe')
    foreach($name in @('Install FortressBackup.cmd','setup.ps1','setup-ui.ps1','provision.ps1','install-task.ps1','uninstall-task.ps1','agent.example.json','INSTALL.md','MANAGED.md','RESTIC-LICENSE.txt')){
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $bundle $name)
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'INSTALL.md') -Destination (Join-Path $bundle 'README.md')
    $checksums=Get-ChildItem -LiteralPath $bundle -File | Sort-Object Name | ForEach-Object {'{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(),$_.Name}
    [IO.File]::WriteAllLines((Join-Path $bundle 'SHA256SUMS'),$checksums,[Text.Encoding]::ASCII)
    $compiler=Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'
    $numericVersion=($Version.Substring(1) -split '-')[0]+'.0'
    & $compiler "/DBundleDir=$bundle" "/DOutputDir=$OutputDirectory" "/DAppVersion=$($Version.Substring(1))" "/DNumericVersion=$numericVersion" (Join-Path $PSScriptRoot 'installer.iss')
    if($LASTEXITCODE -ne 0){throw 'Windows installer compilation failed'}
    Compress-Archive -Path (Join-Path $bundle '*') -DestinationPath (Join-Path $OutputDirectory "fortressbackup-windows-amd64-$Version.zip")
    $assets=@{'fortress-agent.exe'='fortress-agent-windows-amd64.exe';'restic.exe'='restic-windows-amd64.exe';'FortressBackup.exe'='FortressBackup.exe';'Install FortressBackup.cmd'='Install.FortressBackup.cmd';'INSTALL.md'='WINDOWS-SETUP.md';'MANAGED.md'='MANAGED-WINDOWS.md'}
    foreach($name in @('setup.ps1','setup-ui.ps1','provision.ps1','install-task.ps1','uninstall-task.ps1','agent.example.json','RESTIC-LICENSE.txt')){$assets[$name]=$name}
    foreach($name in $assets.Keys){Copy-Item -LiteralPath (Join-Path $bundle $name) -Destination (Join-Path $OutputDirectory $assets[$name])}
}finally{
    if(Test-Path -LiteralPath $work){Remove-Item -LiteralPath $work -Recurse -Force}
}
