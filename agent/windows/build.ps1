#requires -Version 5.1
[CmdletBinding()]
param([ValidatePattern('^v\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$')][string]$Version='v0.1.0-dev')
$ErrorActionPreference='Stop'
$resourceCompiler=Get-ChildItem -Path (Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin\*\x64\rc.exe') | Sort-Object FullName -Descending | Select-Object -First 1
$converter=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\cvtres.exe'
if(!$resourceCompiler -or !(Test-Path -LiteralPath $converter)){throw 'Windows SDK Resource Compiler and .NET Framework resource converter are required to build the Windows app.'}
$work=Join-Path $env:TEMP ('FortressResources-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($work) | Out-Null
$icon=(Join-Path $PSScriptRoot 'assets\fortress.ico').Replace('\','\\')
$displayVersion=$Version.Substring(1)
$numericVersion=($displayVersion -split '-')[0].Replace('.',',')+',0'
$flags=if($displayVersion.Contains('-')){2}else{0}
$binaries=@(
    @{Name='fortress-agent.exe';Directory=$PSScriptRoot;Description='Fortress Backup background agent';GUI=$false},
    @{Name='FortressBackup.exe';Directory=(Join-Path $PSScriptRoot 'cmd\setup');Description='Fortress Backup';GUI=$true}
)
try {
    foreach($binary in $binaries){
        $resource=Join-Path $work ($binary.Name+'.rc')
        $compiled=Join-Path $work ($binary.Name+'.res')
        $object=Join-Path $binary.Directory 'resources_windows_amd64.syso'
        @"
LANGUAGE 9, 1
1 ICON "$icon"
1 VERSIONINFO
FILEVERSION $numericVersion
PRODUCTVERSION $numericVersion
FILEFLAGSMASK 0x3fL
FILEFLAGS $flags
FILEOS 0x40004L
FILETYPE 0x1L
BEGIN
  BLOCK "StringFileInfo"
  BEGIN
    BLOCK "040904b0"
    BEGIN
      VALUE "CompanyName", "Fortress Backup\0"
      VALUE "FileDescription", "$($binary.Description)\0"
      VALUE "FileVersion", "$displayVersion\0"
      VALUE "InternalName", "$($binary.Name)\0"
      VALUE "OriginalFilename", "$($binary.Name)\0"
      VALUE "ProductName", "Fortress Backup\0"
      VALUE "ProductVersion", "$displayVersion\0"
      VALUE "Comments", "https://github.com/InSelfControll/FortressBackup\0"
    END
  END
  BLOCK "VarFileInfo"
  BEGIN
    VALUE "Translation", 0x409, 1200
  END
END
"@ | Set-Content -LiteralPath $resource -Encoding Unicode
        & $resourceCompiler.FullName /nologo "/fo$compiled" $resource
        if($LASTEXITCODE -ne 0){throw 'Windows icon/version resource compilation failed'}
        & $converter /NOLOGO /MACHINE:X64 "/OUT:$object" $compiled
        if($LASTEXITCODE -ne 0){throw 'Windows resource conversion failed'}
    }
    Push-Location $PSScriptRoot
    try {
        & go build -trimpath -o fortress-agent.exe .
        if($LASTEXITCODE -ne 0){throw 'Agent build failed'}
        & go build -trimpath -ldflags '-H=windowsgui' -o FortressBackup.exe ./cmd/setup
        if($LASTEXITCODE -ne 0){throw 'App build failed'}
    }finally{Pop-Location}
    foreach($binary in $binaries){
        $path=Join-Path $PSScriptRoot $binary.Name
        $digest=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        [IO.File]::WriteAllText(($path+'.sha256'),($digest+'  '+$binary.Name),[Text.Encoding]::ASCII)
    }
}finally{
    foreach($binary in $binaries){Remove-Item -LiteralPath (Join-Path $binary.Directory 'resources_windows_amd64.syso') -Force -ErrorAction SilentlyContinue}
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
