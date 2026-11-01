#requires -Version 5.1
# Run on the build runner, never change antivirus settings on a user's laptop.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Directory,
    [Parameter(Mandatory)][string]$ReportPath,
    [switch]$RequireSigned
)
$ErrorActionPreference='Stop'
$Directory=(Resolve-Path -LiteralPath $Directory).Path.TrimEnd('\')
$ReportPath=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ReportPath)
$files=@(Get-ChildItem -LiteralPath $Directory -File -Recurse | Where-Object {$_.FullName -ine $ReportPath} | Sort-Object FullName)
if(!$files.Count){throw 'No release files to check'}
$records=@($files | ForEach-Object {
    $record=[ordered]@{name=$_.FullName.Substring($Directory.Length+1);sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    if($_.Extension -in @('.exe','.ps1')){
        $signature=Get-AuthenticodeSignature -LiteralPath $_.FullName
        $record.signature=[ordered]@{status=[string]$signature.Status;publisher=$(if($signature.SignerCertificate){$signature.SignerCertificate.Subject}else{$null});thumbprint=$(if($signature.SignerCertificate){$signature.SignerCertificate.Thumbprint}else{$null});timestamped=!!$signature.TimeStamperCertificate}
    }
    $record
})
$unsigned=@($records | Where-Object {$_.signature -and $_.signature.status -eq 'NotSigned'})
$report=[ordered]@{
    checkedAt=[DateTime]::UtcNow.ToString('o')
    files=$records
    unsignedFiles=$unsigned.Count
    requireSigned=[bool]$RequireSigned
    defender=[ordered]@{result='NotRun'}
    smartScreen=[ordered]@{result='NotTested';note='A Defender scan and valid signatures do not guarantee SmartScreen reputation or the absence of future antivirus warnings.'}
}
try {
    $invalid=@($records | Where-Object {$_.signature -and $_.signature.status -notin @('Valid','NotSigned')})
    if($invalid.Count){throw 'A release file has an invalid or untrusted Authenticode signature'}
    if($RequireSigned -and ($unsigned.Count -or @($records | Where-Object {$_.signature -and !$_.signature.timestamped}).Count)){
        throw 'Stable releases require valid, timestamped Authenticode signatures on executable and PowerShell files. Configure a trusted code-signing identity first.'
    }
    if((Get-Service WinDefend).Status -ne 'Running'){Start-Service WinDefend}
    # Defender platform updates can restart its CIM provider mid-request.
    # Retry only transient RPC failures; an update must still succeed before scanning.
    for($attempt=0;$attempt -lt 3;$attempt++){
        try {
            Update-MpSignature
            $engine=Get-MpComputerStatus
            break
        }catch{
            if($attempt -ge 2 -or $_.FullyQualifiedErrorId -notmatch '0x800706b[ae]'){throw}
            Write-Host 'Defender RPC service is restarting; waiting before retrying the signature update.'
            Start-Sleep -Seconds 10
        }
    }
    if(!$engine.AMServiceEnabled -or !$engine.AMEngineVersion -or !$engine.AntivirusSignatureVersion){throw 'Microsoft Defender is not ready to scan release files'}
    $scanner=Get-ChildItem -Path (Join-Path $env:ProgramData 'Microsoft\Windows Defender\Platform\*\MpCmdRun.exe') -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    $scannerPath=if($scanner){$scanner.FullName}else{Join-Path $env:ProgramFiles 'Windows Defender\MpCmdRun.exe'}
    # Microsoft's custom-scan flag scans archives and ignores file exclusions.
    # It prevents remediation, so a detected artifact cannot disappear silently.
    & $scannerPath -Scan -ScanType 3 -File $Directory -DisableRemediation
    if($LASTEXITCODE -ne 0){throw "Defender detected a threat or could not complete the scan (exit $LASTEXITCODE)"}
    foreach($record in $records){
        if((Get-FileHash -LiteralPath (Join-Path $Directory $record.name) -Algorithm SHA256).Hash -ine $record.sha256){throw 'Release files changed during verification'}
    }
    $report.defender=[ordered]@{result='NoDetections';engineVersion=$engine.AMEngineVersion;signatureVersion=$engine.AntivirusSignatureVersion;signatureUpdatedAt=$engine.AntivirusSignatureLastUpdated.ToUniversalTime().ToString('o');fileCount=$files.Count;archivesScanned=$true;fileExclusionsIgnored=$true}
    Write-Host ("Defender scan completed without detections. Unsigned files: {0}. SmartScreen reputation was not tested." -f $unsigned.Count)
}catch{
    $report.defender=[ordered]@{result='FailedOrNotRun';error=$_.Exception.Message}
    throw
}finally{
    [IO.File]::WriteAllText($ReportPath,($report | ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
}
