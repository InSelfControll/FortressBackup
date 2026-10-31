#requires -Version 5.1
# Remove only this application's task/runtime. Keep configuration and repositories.
$ErrorActionPreference='Stop'
try {
    $root=Join-Path $env:ProgramData 'FortressBackup'
    if((Test-Path -LiteralPath $root) -and ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Unexpected configuration directory link.'}
    $agent=Join-Path $root 'fortress-agent.exe'
    $task=Get-ScheduledTask -TaskName FortressBackup-Windows -TaskPath '\' -ErrorAction SilentlyContinue
    if($task){
        if(@($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -ine $agent){throw 'The scheduled task no longer belongs to this installation.'}
        if($task.State -in @('Running','Queued')){Stop-ScheduledTask -TaskName FortressBackup-Windows -TaskPath '\'}
        Unregister-ScheduledTask -TaskName FortressBackup-Windows -TaskPath '\' -Confirm:$false
    }
    foreach($name in @('fortress-agent.exe','restic.exe')){
        $path=Join-Path $root $name
        if(Test-Path -LiteralPath $path){
            if(((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Unexpected runtime file link. No configuration was removed.'}
            Remove-Item -LiteralPath $path -Force
        }
    }
}catch{
    Write-Error 'Could not remove the Fortress background task or runtime. Configuration and repositories have been preserved.' -ErrorAction Continue
    exit 1
}
