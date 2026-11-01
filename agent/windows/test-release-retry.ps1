#requires -Version 5.1
$ErrorActionPreference='Stop'
$check=Join-Path $PSScriptRoot 'check-release.ps1'
$root=Join-Path ([IO.Path]::GetTempPath()) ('FortressScanRetry-'+[guid]::NewGuid().ToString('N'))
$originalData=$env:ProgramData;$originalPrograms=$env:ProgramFiles
try{
 [IO.Directory]::CreateDirectory((Join-Path $root 'input')) | Out-Null
 [IO.File]::WriteAllText((Join-Path $root 'input\fixture.txt'),'test-only')
 $scanner=Join-Path $root 'fake-scanner.ps1'
 @'
param([switch]$Scan,[int]$ScanType,[string]$File,[switch]$DisableRemediation)
if(!$Scan -or $ScanType -ne 3 -or !$DisableRemediation){throw 'Scan protections missing'}
[IO.File]::WriteAllText((Join-Path (Split-Path $File -Parent) 'scanned'),'yes')
$global:LASTEXITCODE=0
'@ | Set-Content -LiteralPath $scanner
 $env:ProgramData=$root;$env:ProgramFiles=$root
 foreach($case in @('transient','permanent','exhausted')){
  & {
   $state=@{attempts=0;sleeps=0};$nativeItems=Get-Command Get-ChildItem
   function Get-Service {param($Name) [pscustomobject]@{Status='Running'}}
   function Get-ChildItem {
    [CmdletBinding()]param($Path,$LiteralPath,[switch]$File,[switch]$Recurse)
    if($Path){return [pscustomobject]@{FullName=$scanner}}
    & $nativeItems -LiteralPath $LiteralPath -File:$File -Recurse:$Recurse
   }
   function Update-MpSignature {
    [CmdletBinding()]param()
    $state.attempts++
    if($case -eq 'permanent'){Write-Error 'fatal fixture' -ErrorId 'HRESULT 0x80070005' -ErrorAction Stop}
    if($case -eq 'exhausted' -or $state.attempts -eq 1){Write-Error 'RPC fixture' -ErrorId 'HRESULT 0x800706be' -ErrorAction Stop}
   }
   function Get-MpComputerStatus {[pscustomobject]@{AMServiceEnabled=$true;AMEngineVersion='fixture';AntivirusSignatureVersion='fixture';AntivirusSignatureLastUpdated=[datetime]::UtcNow}}
   function Start-Sleep {param($Seconds) if($Seconds -ne 10){throw 'Unexpected delay'};$state.sleeps++}
   $report=Join-Path $root ($case+'.json');$failed=$false
   try{& $check -Directory (Join-Path $root 'input') -ReportPath $report}catch{$failed=$true}
   $result=Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
   $marker=Join-Path $root 'scanned'
   if($case -eq 'transient'){
    if($failed -or $state.attempts -ne 2 -or $state.sleeps -ne 1 -or !(Test-Path -LiteralPath $marker) -or $result.defender.result -ne 'NoDetections'){throw 'Transient retry did not reach the required scan'}
    Remove-Item -LiteralPath $marker
   }else{
    $expected=if($case -eq 'permanent'){1}else{3}
    if(!$failed -or $state.attempts -ne $expected -or (Test-Path -LiteralPath $marker) -or $result.defender.result -ne 'FailedOrNotRun'){throw 'Failed signature update did not block scanning/publication'}
   }
  }
 }
 Write-Output 'Transient RPC retry, retry exhaustion, and fatal update rejection verified'
}finally{
 $env:ProgramData=$originalData;$env:ProgramFiles=$originalPrograms
 if(Test-Path -LiteralPath $root){Remove-Item -LiteralPath $root -Recurse -Force}
}
