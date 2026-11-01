#requires -Version 5.1
# Fixed outbound operations share the controller's queue and appear on its dashboard.
function Invoke-RecoveryAPI([string]$Route,$Body){
    $ErrorActionPreference='Stop'
    $configPath=Join-Path $env:ProgramData 'FortressBackup\agent.json'
    if(!(Test-Path -LiteralPath $configPath)){throw 'Save and connect in Configuration first.'}
    $config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $uri=$null
    if(![uri]::TryCreate([string]$config.controllerUrl,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment){throw 'Configure a trusted HTTPS controller first.'}
    $secret=[IO.File]::ReadAllText([string]$config.agentTokenFile).Trim()
    if($secret -notmatch '^[A-Za-z0-9_-]{32,256}$'){throw 'Saved enrollment credentials are invalid. Save and connect again.'}
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    try {
        $result=Invoke-RestMethod -Uri ($config.controllerUrl.TrimEnd('/')+'/api/managed-agents/'+$Route) -Method Post -ContentType 'application/json' -Headers @{'Authorization'='Bearer '+$secret;'X-Fortress-Agent-Id'=[string]$config.agentId} -Body ($Body | ConvertTo-Json -Depth 8 -Compress) -TimeoutSec 30 -MaximumRedirection 0
    }catch{throw 'Controller request failed. Check the HTTPS connection and Managed Clients. If another operation is active, wait for it to finish; after an upgrade click Save and connect.'}
    if($Route -eq 'request'){
        # A queued request remains visible even if the task is temporarily unavailable.
        try {Start-ScheduledTask -TaskName 'FortressBackup-Windows' -ErrorAction Stop}catch{}
    }
    return ($result | ConvertTo-Json -Depth 12 -Compress)
}

function Add-RecoveryPanel($Form,$SetupState){
    $invokeAPI=${function:Invoke-RecoveryAPI}
    $panel=New-Object Windows.Forms.Panel
    $panel.Name='recovery';$panel.Dock='Fill';$panel.Visible=$false
    $Form.Controls.Add($panel)
    $r=@{Worker=$null;Pending=$null;Job=$null;Operation='';Request=$null;Entries=@();Snapshots=@();Offset=0;More=$false;Directory='/';Snapshot='';Selected=(New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal));NextPoll=[datetime]::MinValue;RestorePath=''}
    function Add-RecoveryControl($Type,$Name,$Text,$X,$Y,$Width,$Height){
        $c=New-Object ('Windows.Forms.'+$Type);$c.Name=$Name;$c.Text=$Text;$c.SetBounds($X,$Y,$Width,$Height);$panel.Controls.Add($c);return $c
    }
    $heading=Add-RecoveryControl Label heading 'Saved backups and restore' 20 15 610 30
    $heading.Font=New-Object Drawing.Font('Segoe UI',14,[Drawing.FontStyle]::Bold)
    [void](Add-RecoveryControl Label explanation 'A backup creates a snapshot: a saved version of your files. Browse saved versions, then restore everything or selected files into a new recovery folder. Original files are preserved.' 20 52 610 65)
    $load=Add-RecoveryControl Button load 'Load saved backups' 20 121 190 33
    $versions=Add-RecoveryControl ComboBox snapshots '' 20 167 610 30
    $versions.DropDownStyle='DropDownList';$versions.DisplayMember='Label'
    $directory=Add-RecoveryControl Label directory 'Folder: /' 20 207 300 40
    $enter=Add-RecoveryControl Button enter 'Open folder' 340 207 140 33
    $up=Add-RecoveryControl Button up 'Up one folder' 490 207 140 33
    $entries=Add-RecoveryControl CheckedListBox entries '' 20 251 610 180
    $entries.CheckOnClick=$true;$entries.HorizontalScrollbar=$true
    $selected=Add-RecoveryControl Label selected 'Select a folder and use Open folder. Checked folders include their contents.' 20 438 610 25
    $more=Add-RecoveryControl Button more 'Load more' 20 469 110 30
    $clear=Add-RecoveryControl Button clear 'Clear selection' 140 469 130 30
    $restore=Add-RecoveryControl Button restore 'Restore selected' 280 469 170 30
    $all=Add-RecoveryControl Button restoreAll 'Restore entire backup' 460 469 170 30
    $status=Add-RecoveryControl TextBox status 'Load saved backups using your saved connection. Operations also appear on the dashboard.' 20 507 610 43
    $status.Multiline=$true;$status.ReadOnly=$true;$status.ScrollBars='Vertical';$status.AccessibleName='Restore status'
    $open=Add-RecoveryControl Button open 'Open restored folder' 20 558 190 33
    $back=Add-RecoveryControl Button back 'Configuration' 460 558 170 33
    $setEnabled={param([bool]$enabled)
        $load.Enabled=$enabled;$versions.Enabled=$enabled;$back.Enabled=$enabled
        $up.Enabled=$enabled -and $r.Snapshot -and $r.Directory -ne '/'
        $more.Enabled=$enabled -and $r.More
        $entries.Enabled=$enabled;$clear.Enabled=$enabled;$enter.Enabled=$enabled
        $restore.Enabled=$enabled -and $r.Snapshot -and $r.Selected.Count -gt 0 -and $r.Selected.Count -le 100
        $all.Enabled=$enabled -and !!$r.Snapshot
        $open.Enabled=$enabled -and !!$r.RestorePath
    }.GetNewClosure()
    $start={param([string]$operation,$request)
        if($r.Worker -or ($r.Job -and $r.Job.state -in @('pending','running'))){return}
        $r.Operation=$operation;$r.Request=$request;$r.Job=$null;$r.RestorePath=''
        $status.Text=$operation+': queuing on controller...'; & $setEnabled $false
        $r.Worker=[PowerShell]::Create()
        [void]$r.Worker.AddScript($invokeAPI.ToString()).AddArgument('request').AddArgument(@{operation=$operation;request=$request})
        $r.Pending=$r.Worker.BeginInvoke();$SetupState.RecoveryWorker=$true
    }.GetNewClosure()
    $browse={param([string]$path)
        $r.Directory=$path;$directory.Text='Folder: '+$path;$r.Entries=@();$r.Offset=0;$r.More=$false;$entries.Items.Clear()
        & $start 'files' @{snapshotId=$r.Snapshot;directory=$path;offset=0}
    }.GetNewClosure()
    $load.Add_Click({
        $r.Snapshot='';$r.Selected.Clear();$r.Snapshots=@();$r.Entries=@();$r.Offset=0;$r.More=$false
        $versions.Items.Clear();$entries.Items.Clear()
        & $start 'snapshots' @{offset=0}
    }.GetNewClosure())
    $versions.Add_SelectionChangeCommitted({
        if($versions.SelectedItem){$r.Snapshot=$versions.SelectedItem.Id;$r.Selected.Clear(); & $browse '/'}
    }.GetNewClosure())
    $entries.Add_ItemCheck({param($sender,$event)
        if($event.Index -lt $r.Entries.Count){
            $path=[string]$r.Entries[$event.Index].path
            if($event.NewValue -eq [Windows.Forms.CheckState]::Checked){[void]$r.Selected.Add($path)}else{[void]$r.Selected.Remove($path)}
            $selected.Text=[string]$r.Selected.Count+' selected. Use Open folder to browse.'
            & $setEnabled (!$r.Worker -and (!$r.Job -or $r.Job.state -notin @('pending','running')))
        }
    }.GetNewClosure())
    $enter.Add_Click({
        if($entries.SelectedIndex -ge 0 -and $r.Entries[$entries.SelectedIndex].type -eq 'dir'){ & $browse ([string]$r.Entries[$entries.SelectedIndex].path)}
    }.GetNewClosure())
    $up.Add_Click({$path=$r.Directory.Substring(0,$r.Directory.LastIndexOf('/'));if(!$path){$path='/'}; & $browse $path}.GetNewClosure())
    $more.Add_Click({
        if($r.Snapshot){ & $start 'files' @{snapshotId=$r.Snapshot;directory=$r.Directory;offset=$r.Offset}}
        else{ & $start 'snapshots' @{offset=$r.Offset}}
    }.GetNewClosure())
    $clear.Add_Click({$r.Selected.Clear();for($i=0;$i -lt $entries.Items.Count;$i++){$entries.SetItemChecked($i,$false)};$selected.Text='0 selected.'; & $setEnabled $true}.GetNewClosure())
    $restore.Add_Click({if($r.Selected.Count -gt 0 -and $r.Selected.Count -le 100){ & $start 'restore' @{snapshotId=$r.Snapshot;paths=@($r.Selected)}}}.GetNewClosure())
    $all.Add_Click({if($r.Snapshot){ & $start 'restore' @{snapshotId=$r.Snapshot}}}.GetNewClosure())
    $open.Add_Click({
        $base=[IO.Path]::GetFullPath((Join-Path $env:ProgramData 'FortressBackup\restores'))+'\'
        $target=[IO.Path]::GetFullPath($r.RestorePath)
        if($target.StartsWith($base,[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $target -PathType Container)){Start-Process explorer.exe -ArgumentList ('"'+$target+'"')}
    }.GetNewClosure())
    $back.Add_Click({$panel.Visible=$false;$Form.AcceptButton=$null}.GetNewClosure())
    $timer=New-Object Windows.Forms.Timer;$timer.Interval=200
    $timer.Add_Tick({
        if($r.Worker -and $r.Pending.IsCompleted){
            try{
                $output=$r.Worker.EndInvoke($r.Pending)
                if($r.Worker.Streams.Error.Count -gt 0){throw $r.Worker.Streams.Error[0].Exception}
                $r.Job=([string]$output[0] | ConvertFrom-Json)
                $status.Text=$r.Operation+': '+$r.Job.state
                if($r.Job.state -eq 'pending'){$status.Text+=' - waiting for the laptop agent. See Managed Clients for current activity.'}
                if($r.Job.state -eq 'failed'){throw [string]$r.Job.message}
                if($r.Job.state -eq 'success'){
                    $data=$r.Job.result
                    if($r.Operation -eq 'snapshots'){
                        if(!$data -or !$data.PSObject.Properties['snapshots']){throw 'Update the app, then Save and connect to enable browsing.'}
                        foreach($s in @($data.snapshots)){
                            [void]$versions.Items.Add([pscustomobject]@{Id=$s.id;Label=([datetime]$s.time).ToLocalTime().ToString('g')+' / '+$s.id.Substring(0,8)+' / '+$s.hostname})
                        }
                        $r.Offset=$versions.Items.Count;$r.More=[bool]$data.hasMore
                        if(!$versions.Items.Count){$status.Text='No saved backups found for this laptop. Run a backup first.'}
                    }elseif($r.Operation -eq 'files'){
                        foreach($entry in @($data.entries)){
                            $r.Entries+=@($entry)
                            $label=[string]$entry.name;if($entry.type -eq 'dir'){$label+='/'}
                            [void]$entries.Items.Add($label,$r.Selected.Contains([string]$entry.path))
                        }
                        $r.Offset=$r.Entries.Count;$r.More=[bool]$data.hasMore
                    }elseif($r.Operation -eq 'restore'){
                        $r.RestorePath=[string]$data.restorePath
                        $status.Text='Restored to: '+$r.RestorePath
                    }
                }
            }catch{$status.Text='Operation failed: '+$_.Exception.Message}
            finally{$r.Worker.Dispose();$r.Worker=$null;$r.Pending=$null;$SetupState.RecoveryWorker=$false;$r.NextPoll=[datetime]::UtcNow.AddSeconds(2); & $setEnabled (!$r.Job -or $r.Job.state -notin @('pending','running'))}
        }
        if(!$r.Worker -and $r.Job -and $r.Job.state -in @('pending','running') -and [datetime]::UtcNow -ge $r.NextPoll){
            $r.Worker=[PowerShell]::Create()
            [void]$r.Worker.AddScript($invokeAPI.ToString()).AddArgument('result').AddArgument(@{id=$r.Job.id})
            $r.Pending=$r.Worker.BeginInvoke();$SetupState.RecoveryWorker=$true
        }
    }.GetNewClosure())
    $Form.Add_FormClosed({$timer.Stop();$timer.Dispose();if($r.Worker){$r.Worker.Dispose()}}.GetNewClosure())
    & $setEnabled $true
    $timer.Start()
    return $panel
}
