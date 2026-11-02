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
    }catch{
        $detail='Controller request failed. Check the HTTPS connection and Managed Clients.'
        # Show actionable controller conflicts (old runtime / active job), never credentials.
        if($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 409){
            try{$errorBody=$_.ErrorDetails.Message | ConvertFrom-Json;if($errorBody.error){$detail=([string]$errorBody.error -replace '[\x00-\x1f\x7f]',' ').Substring(0,[Math]::Min(400,([string]$errorBody.error).Length))}}catch{}
        }
        throw $detail
    }
    if($Route -eq 'request'){
        # A queued request remains visible even if the task is temporarily unavailable.
        try {Start-ScheduledTask -TaskName 'FortressBackup-Windows' -ErrorAction Stop}catch{}
    }
    return ($result | ConvertTo-Json -Depth 12 -Compress)
}

function Add-RecoveryPanel($Form,$SetupState,$Content,$BackupButton){
    $invokeAPI=${function:Invoke-RecoveryAPI}
    $errorMessage=${function:Get-FortressErrorMessage}
    $panel=New-FortressControl $Content Panel recovery
    $panel.Dock='Fill';$panel.AutoScroll=$true;$panel.Visible=$false;$panel.Margin=New-Object Windows.Forms.Padding(0)
    $r=@{Worker=$null;Pending=$null;Job=$null;Operation='';Request=$null;Entries=@();Snapshots=@();Offset=0;More=$false;Directory='/';Snapshot='';AllDevices=$true;Selected=(New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal));NextPoll=[datetime]::MinValue;RestorePath=''}
    $panel.Tag=$r
    $layout=New-FortressTable $panel recoveryLayout
    $layout.Dock='Top';$layout.AutoSize=$true
    $fitViewport={ $layout.MinimumSize=New-Object Drawing.Size(0,$panel.ClientSize.Height) }.GetNewClosure()
    $panel.Add_SizeChanged($fitViewport)
    [void]$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::AutoSize)))
    [void]$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::AutoSize)))
    [void]$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent,100)))
    [void]$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::AutoSize)))
    [void]$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::AutoSize)))
    $toolbar=New-FortressFlow $null snapshotToolbar;$layout.Controls.Add($toolbar,0,0)
    $load=New-FortressButton $toolbar load 'Refresh backups'
    $scope=New-FortressControl $toolbar CheckBox scope 'Include old / other devices'
    $scope.AutoSize=$true;$scope.Dock='None';$scope.Margin=New-Object Windows.Forms.Padding(12,9,0,0);$scope.Checked=$true
    $snapshotRow=New-FortressTable $null snapshotRow;$snapshotRow.Margin=New-Object Windows.Forms.Padding(0,0,0,12)
    $snapshotLabel=New-FortressControl $null Label snapshotLabel 'Saved version';$snapshotRow.Controls.Add($snapshotLabel,0,0)
    $versions=New-FortressControl $null ComboBox snapshots
    $versions.DropDownStyle='DropDownList';$versions.DisplayMember='Label';$versions.AccessibleName='Saved backup version'
    $versions.DrawMode='OwnerDrawFixed';$versions.ItemHeight=28
    $versions.Add_DrawItem({param($sender,$event)
        $event.DrawBackground()
        $text=if($event.Index -ge 0){[string]$sender.Items[$event.Index].Label}else{'Choose a saved version...'}
        $color=if($event.Index -ge 0){$event.ForeColor}else{[Drawing.ColorTranslator]::FromHtml('#64748B')}
        [Windows.Forms.TextRenderer]::DrawText($event.Graphics,$text,$event.Font,$event.Bounds,$color,([Windows.Forms.TextFormatFlags]::VerticalCenter -bor [Windows.Forms.TextFormatFlags]::EndEllipsis))
        $event.DrawFocusRectangle()
    }.GetNewClosure())
    $snapshotRow.Controls.Add($versions,0,1);$layout.Controls.Add($snapshotRow,0,1)
    $browser=New-FortressTable $null fileBrowser
    $browser.Dock='Fill';$browser.AutoSize=$false;$browser.BackColor=[Drawing.Color]::White;$browser.Padding=New-Object Windows.Forms.Padding(16)
    $browser.MinimumSize=New-Object Drawing.Size(0,200);$layout.Controls.Add($browser,0,2)
    [void]$browser.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::AutoSize)))
    [void]$browser.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent,100)))
    $browserToolbar=New-FortressTable $null browserToolbar 2
    $browserToolbar.ColumnStyles[1].SizeType='AutoSize';$browserToolbar.Margin=New-Object Windows.Forms.Padding(0,0,0,12);$browser.Controls.Add($browserToolbar,0,0)
    $directory=New-FortressControl $null Label directory 'Folder: /'
    $directory.AutoSize=$false;$directory.AutoEllipsis=$true;$directory.Dock='Fill';$directory.TextAlign='MiddleLeft';$directory.Margin=New-Object Windows.Forms.Padding(0,0,12,0);$browserToolbar.Controls.Add($directory,0,0)
    $browseActions=New-FortressFlow $null browseActions;$browseActions.Margin=New-Object Windows.Forms.Padding(0);$browserToolbar.Controls.Add($browseActions,1,0)
    $up=New-FortressButton $browseActions up 'Up one folder'
    $enter=New-FortressButton $browseActions enter 'Open folder'
    $fileArea=New-FortressControl $null Panel fileArea;$fileArea.Dock='Fill';$fileArea.Margin=New-Object Windows.Forms.Padding(0);$browser.Controls.Add($fileArea,0,1)
    $entries=New-FortressControl $fileArea CheckedListBox entries
    $entries.Dock='Fill';$entries.CheckOnClick=$true;$entries.HorizontalScrollbar=$true;$entries.IntegralHeight=$false;$entries.BorderStyle='None';$entries.BackColor=[Drawing.Color]::White;$entries.ItemHeight=24;$entries.AccessibleName='Files and folders in saved backup'
    $empty=New-FortressControl $fileArea Label emptyFiles "Choose a saved version`n`nFiles and folders will appear here."
    $empty.AutoSize=$false;$empty.Dock='Fill';$empty.TextAlign='MiddleCenter';$empty.ForeColor=[Drawing.ColorTranslator]::FromHtml('#64748B');$empty.BackColor=[Drawing.Color]::White;$empty.BringToFront()
    $selection=New-FortressTable $null selection 2;$selection.ColumnStyles[1].SizeType='AutoSize';$selection.Margin=New-Object Windows.Forms.Padding(0,8,0,8);$layout.Controls.Add($selection,0,3)
    $selected=New-FortressControl $null Label selected '0 selected'
    $selected.ForeColor=[Drawing.ColorTranslator]::FromHtml('#64748B');$selected.Anchor='Left,Right';$selection.Controls.Add($selected,0,0)
    $selectionActions=New-FortressFlow $null selectionActions;$selectionActions.Margin=New-Object Windows.Forms.Padding(0);$selection.Controls.Add($selectionActions,1,0)
    $more=New-FortressButton $selectionActions more 'Load more'
    $clear=New-FortressButton $selectionActions clear 'Clear selection'
    $clear.MinimumSize=New-Object Drawing.Size(0,28);$clear.Padding=New-Object Windows.Forms.Padding(10,2,10,2)
    $restoreActions=New-FortressFlow $null restoreActions;$restoreActions.Margin=New-Object Windows.Forms.Padding(0,8,0,0);$selection.Controls.Add($restoreActions,0,1);$selection.SetColumnSpan($restoreActions,2)
    $restore=New-FortressButton $restoreActions restore 'Restore selected' primary
    $all=New-FortressButton $restoreActions restoreAll 'Restore entire backup'
    $operation=New-FortressCard $null operation;$operation.Margin=New-Object Windows.Forms.Padding(0);$operation.Padding=New-Object Windows.Forms.Padding(12);$layout.Controls.Add($operation,0,4)
    $activity=New-FortressControl $null Label activity 'Ready when you are'
    $activity.Font=New-Object Drawing.Font('Segoe UI',11,[Drawing.FontStyle]::Bold);$operation.Controls.Add($activity,0,0)
    $status=New-FortressControl $null TextBox status 'A backup creates a snapshot: a saved version of your files. Restores go to a new folder, keeping original files safe.'
    $status.Multiline=$true;$status.ReadOnly=$true;$status.ScrollBars='Vertical';$status.AccessibleName='Restore status';$status.BorderStyle='None';$status.BackColor=[Drawing.Color]::White;$status.Height=40;$status.TabStop=$false;$operation.Controls.Add($status,0,1)
    $backupProgress=New-FortressControl $null ProgressBar backupProgress
    $backupProgress.Height=6;$backupProgress.Maximum=1000;$backupProgress.Visible=$false;$backupProgress.AccessibleName='Backup progress';$operation.Controls.Add($backupProgress,0,2)
    $progressText=New-FortressControl $null Label progressText
    $progressText.Visible=$false;$progressText.ForeColor=[Drawing.ColorTranslator]::FromHtml('#64748B');$progressText.AccessibleName='Backup progress details';$operation.Controls.Add($progressText,0,3)
    $operationActions=New-FortressFlow $null operationActions;$operationActions.Margin=New-Object Windows.Forms.Padding(0);$operation.Controls.Add($operationActions,0,4)
    $cancel=New-FortressButton $operationActions cancel 'Cancel operation'
    $open=New-FortressButton $operationActions open 'Open restored folder'
    $backup=$BackupButton
    $setEnabled={param([bool]$enabled)
        $enabled=$enabled -and !$r.Worker -and (!$r.Job -or $r.Job.state -notin @('pending','running'))
        $configured=Test-Path -LiteralPath (Join-Path $env:ProgramData 'FortressBackup\agent.json')
        $load.Enabled=$enabled -and $configured;$backup.Enabled=$enabled -and $configured -and !$SetupState.Worker;$scope.Enabled=$enabled;$versions.Enabled=$enabled -and $versions.Items.Count -gt 0
        $up.Enabled=$enabled -and $r.Snapshot -and $r.Directory -ne '/'
        $more.Enabled=$enabled -and $r.More
        $entries.Enabled=$enabled;$clear.Enabled=$enabled -and $r.Selected.Count -gt 0;$enter.Enabled=$enabled -and $entries.SelectedIndex -ge 0 -and $r.Entries.Count -gt $entries.SelectedIndex -and $r.Entries[$entries.SelectedIndex].type -eq 'dir'
        $restore.Enabled=$enabled -and $r.Snapshot -and $r.Selected.Count -gt 0 -and $r.Selected.Count -le 100
        $all.Enabled=$enabled -and !!$r.Snapshot
        $cancel.Enabled=!!$r.Job -and $r.Job.state -in @('pending','running') -and !$r.Worker
        $open.Enabled=$enabled -and !!$r.RestorePath
        $open.Visible=!!$r.RestorePath;$cancel.Visible=$cancel.Enabled
        $more.Visible=$r.More
        $browserToolbar.Visible=!!$r.Snapshot
        $selection.Visible=!!$r.Snapshot -or $r.More
        $restoreActions.Visible=!!$r.Snapshot
        $clear.Visible=!!$r.Snapshot;$selected.Visible=!!$r.Snapshot
        $empty.Visible=$entries.Items.Count -eq 0
        $entries.Visible=!$empty.Visible
        if($empty.Visible){$empty.BringToFront()}
        if(!$configured){$empty.Text="Connect this laptop first`n`nOpen Device settings, choose folders, then Save and connect."}
    }.GetNewClosure()
    $SetupState.RecoveryRefresh=$setEnabled
    $scope.Add_CheckedChanged({$r.AllDevices=$scope.Checked;$r.Snapshot='';$r.Selected.Clear();$selected.Text='0 selected.';$versions.Items.Clear();$entries.Items.Clear(); & $setEnabled $true}.GetNewClosure())
    $start={param([string]$operation,$request)
        if($SetupState.Worker -or $r.Worker -or ($r.Job -and $r.Job.state -in @('pending','running'))){return}
        if($operation -in @('snapshots','files','restore')){$request.allDevices=$r.AllDevices}
        $r.Operation=$operation;$r.Request=$request;$r.Job=$null;$r.RestorePath=''
        $activity.Text=switch($operation){'snapshots'{'Loading backups'} 'files'{'Loading files'} 'backup'{'Backing up this laptop'} 'restore'{'Restoring files'}}
        $status.ForeColor=[Drawing.ColorTranslator]::FromHtml('#334155')
        $empty.Text=$activity.Text+"...`n`nYou can follow the operation on the dashboard."
        $status.Text='Contacting the controller...'; & $setEnabled $false
        $r.Worker=[PowerShell]::Create()
        [void]$r.Worker.AddScript($invokeAPI.ToString()).AddArgument('request').AddArgument(@{operation=$operation;request=$request})
        $r.Pending=$r.Worker.BeginInvoke();$SetupState.RecoveryWorker=$true
    }.GetNewClosure()
    $browse={param([string]$path)
        $r.Directory=$path;$directory.Text='Folder: '+$path;$r.Entries=@();$r.Offset=0;$r.More=$false;$entries.Items.Clear()
        & $start 'files' @{snapshotId=$r.Snapshot;directory=$path;offset=0}
    }.GetNewClosure()
    $load.Add_Click({
        $r.Snapshot='';$r.Selected.Clear();$selected.Text='0 selected.';$r.Snapshots=@();$r.Entries=@();$r.Offset=0;$r.More=$false
        $versions.Items.Clear();$entries.Items.Clear()
        & $start 'snapshots' @{offset=0}
    }.GetNewClosure())
    $backup.Add_Click({ & $start 'backup' @{} }.GetNewClosure())
    $versions.Add_SelectionChangeCommitted({
        if($versions.SelectedItem){$r.Snapshot=$versions.SelectedItem.Id;$r.Selected.Clear();$selected.Text='0 selected.'; & $browse '/'}
    }.GetNewClosure())
    $entries.Add_ItemCheck({param($sender,$event)
        if($event.Index -lt $r.Entries.Count){
            $path=[string]$r.Entries[$event.Index].path
            if($event.NewValue -eq [Windows.Forms.CheckState]::Checked){[void]$r.Selected.Add($path)}else{[void]$r.Selected.Remove($path)}
            $selected.Text=[string]$r.Selected.Count+' selected. Use Open folder to browse.'
            & $setEnabled (!$r.Worker -and (!$r.Job -or $r.Job.state -notin @('pending','running')))
        }
    }.GetNewClosure())
    $entries.Add_SelectedIndexChanged({ & $setEnabled (!$r.Worker) }.GetNewClosure())
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
    $cancel.Add_Click({if(!$r.Worker -and $r.Job -and $r.Job.state -in @('pending','running')){$r.Worker=[PowerShell]::Create();[void]$r.Worker.AddScript($invokeAPI.ToString()).AddArgument('cancel').AddArgument(@{id=$r.Job.id});$r.Pending=$r.Worker.BeginInvoke();$SetupState.RecoveryWorker=$true}}.GetNewClosure())
    $timer=New-Object Windows.Forms.Timer;$timer.Interval=200
    $timer.Add_Tick({
        if($r.Worker -and $r.Pending.IsCompleted){
            try{
                $output=$r.Worker.EndInvoke($r.Pending)
                if($r.Worker.Streams.Error.Count -gt 0){throw $r.Worker.Streams.Error[0].Exception}
                $r.Job=([string]$output[0] | ConvertFrom-Json)
                $SetupState.ConnectionLabel.Text='Connected';$SetupState.ConnectionLabel.ForeColor=[Drawing.ColorTranslator]::FromHtml('#86EFAC')
                $activity.Text=if($r.Job.state -eq 'pending'){'Waiting for the laptop agent'}elseif($r.Job.state -eq 'running'){switch($r.Operation){'backup'{'Backup in progress'} 'restore'{'Restoring files'} default{'Loading saved backups'}}}else{'Ready'}
                $backupProgress.Visible=$r.Operation -eq 'backup' -and $r.Job.state -in @('pending','running')
                $progressText.Visible=$backupProgress.Visible
                if($backupProgress.Visible){
                    $p=$r.Job.progress
                    if($p -and $p.totalBytes -gt 0){
                        $backupProgress.Style='Blocks';$backupProgress.Value=[Math]::Min(999,[int]($p.percentDone*1000))
                        $progressText.Text=if($p.percentDone -ge 1){'Finalizing backup...'}else{('{0:P1} - {1:N0} of {2:N0} bytes - {3:N0} files' -f ([Math]::Min(0.999,[double]$p.percentDone)),$p.bytesDone,$p.totalBytes,$p.filesDone)}
                        if(([datetime]::UtcNow-([datetime]$p.updatedAt).ToUniversalTime()).TotalSeconds -gt 20){$progressText.Text+=' - progress updates delayed'}elseif($p.secondsRemaining -gt 0){$progressText.Text+=(' - about {0:N0}s remaining' -f $p.secondsRemaining)}
                    }else{$backupProgress.Style='Marquee';$progressText.Text='Waiting for measured progress. No percentage has been reported.'}
                }
                $status.Text=$r.Operation+': '+$r.Job.state
                if($r.Job.state -eq 'pending'){$status.Text+=' - waiting for the laptop agent. See Managed Clients for current activity.'}
                if($r.Job.cancelRequested){$status.Text='Cancellation requested; waiting for the agent to stop.'}
                if($r.Job.state -eq 'canceled'){$status.Text='Operation canceled. Original files are preserved.'}
                if($r.Job.state -eq 'failed'){throw [string]$r.Job.message}
                if($r.Job.state -eq 'success'){
                    $activity.Text='Ready';$data=$r.Job.result
                    if($r.Operation -eq 'snapshots'){
                        if(!$data -or !$data.PSObject.Properties['snapshots']){throw 'Update the app, then Save and connect to enable browsing.'}
                        foreach($s in @($data.snapshots)){
                            [void]$versions.Items.Add([pscustomobject]@{Id=$s.id;Label=([datetime]$s.time).ToLocalTime().ToString('g')+' / '+$s.id.Substring(0,8)+' / '+$s.hostname})
                        }
                        $r.Offset=$versions.Items.Count;$r.More=[bool]$data.hasMore
                        $empty.Text=if(!$versions.Items.Count){"No saved backups yet`n`nUse Backup now to create your first saved version."}else{"Choose a saved version`n`nThen browse folders or restore the entire backup."}
                        $status.Text=if(!$versions.Items.Count){'No snapshots found in the selected scope. Use Backup now to create the first saved version.'}else{[string]$versions.Items.Count+' snapshots loaded. Choose a saved version to browse files.'}
                    }elseif($r.Operation -eq 'files'){
                        foreach($entry in @($data.entries)){
                            $r.Entries+=@($entry)
                            $label=[string]$entry.name;if($entry.type -eq 'dir'){$label+='/'}
                            [void]$entries.Items.Add($label,$r.Selected.Contains([string]$entry.path))
                        }
                        $r.Offset=$r.Entries.Count;$r.More=[bool]$data.hasMore
                        $empty.Text="This folder is empty`n`nUse Up one folder to keep browsing."
                        $status.Text='Select files or folders to restore. Checked folders include their contents.'
                    }elseif($r.Operation -eq 'restore'){
                        $r.RestorePath=[string]$data.restorePath
                        $activity.Text='Restore finished'
                        $status.Text='Restored to: '+$r.RestorePath
                    }elseif($r.Operation -eq 'backup'){
                        $activity.Text='Backup saved'
                        $status.Text='Backup saved. Refresh snapshots to view the new saved version.'
                    }
                }
            }catch{
                $activity.Text='Could not finish';$status.ForeColor=[Drawing.ColorTranslator]::FromHtml('#B42318')
                $status.Text=(& $errorMessage $_)
                $panel.ScrollControlIntoView($operation)
                $empty.Text="No files loaded`n`nResolve the message below, then refresh backups."
            }
            finally{$r.Worker.Dispose();$r.Worker=$null;$r.Pending=$null;$SetupState.RecoveryWorker=$false;$r.NextPoll=[datetime]::UtcNow.AddSeconds(2); & $setEnabled (!$r.Job -or $r.Job.state -notin @('pending','running'));if($r.Operation -in @('backup','restore')){$panel.ScrollControlIntoView($operation)}elseif($r.Job -and $r.Job.state -eq 'success'){$panel.AutoScrollPosition=[Drawing.Point]::Empty}}
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
