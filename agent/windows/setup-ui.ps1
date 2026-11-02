#requires -Version 5.1
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if(!('FortressWindowsShell' -as [type])){
    Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class FortressWindowsShell {
    [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
    public static extern int SetCurrentProcessExplicitAppUserModelID(string appId);
}
'@
}
[void][FortressWindowsShell]::SetCurrentProcessExplicitAppUserModelID('InSelfControll.FortressBackup')

# Network and SYSTEM verification run away from the UI thread. Secrets stay in
# memory and protected files, never command-line arguments or the status display.
function Start-SetupOperation($State,[scriptblock]$Work,[object[]]$Arguments){
    $worker=[PowerShell]::Create()
    try {
        [void]$worker.AddScript($Work.ToString())
        foreach($argument in $Arguments){[void]$worker.AddArgument($argument)}
        $State.Worker=$worker
        $State.Pending=$worker.BeginInvoke()
    }catch{$worker.Dispose();$State.Worker=$null;throw}
}

. (Join-Path $PSScriptRoot 'recovery-ui.ps1')

# Native layout and styles are shared by settings and recovery. No extra runtime.
function New-FortressControl($Parent,[string]$Type,[string]$Name,[string]$Text=''){
    $c=New-Object ('Windows.Forms.'+$Type)
    $c.Name=$Name;$c.Text=$Text;$c.Dock='Top'
    $c.Margin=New-Object Windows.Forms.Padding(0,0,0,8)
    $c.ForeColor=[Drawing.ColorTranslator]::FromHtml('#1E293B')
    if($c -is [Windows.Forms.Label]){$c.AutoSize=$true;$c.UseCompatibleTextRendering=$false;$c.UseMnemonic=$false}
    if($c -is [Windows.Forms.TextBox]){$c.BorderStyle='FixedSingle';$c.BackColor=[Drawing.Color]::White;$c.MinimumSize=New-Object Drawing.Size(0,30)}
    if($Parent){[void]$Parent.Controls.Add($c)}
    return $c
}
function New-FortressTable($Parent,[string]$Name,[int]$Columns=1){
    $table=New-FortressControl $Parent TableLayoutPanel $Name
    $table.AutoSize=$true;$table.AutoSizeMode='GrowAndShrink';$table.ColumnCount=$Columns
    $table.Margin=New-Object Windows.Forms.Padding(0)
    for($i=0;$i -lt $Columns;$i++){[void]$table.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Percent,(100/$Columns))))}
    return $table
}
function New-FortressButton($Parent,[string]$Name,[string]$Text,[string]$Role='secondary'){
    $b=New-FortressControl $Parent Button $Name $Text
    $b.UseMnemonic=$false;$b.AutoSize=$true;$b.AutoSizeMode='GrowAndShrink';$b.Dock='None'
    $b.MinimumSize=New-Object Drawing.Size(0,38)
    $horizontal=if($Role -eq 'nav'){8}else{14}
    $b.Padding=New-Object Windows.Forms.Padding($horizontal,6,$horizontal,6)
    $b.Margin=New-Object Windows.Forms.Padding(0,0,8,0)
    $b.FlatStyle='Flat';$b.FlatAppearance.BorderSize=1;$b.UseVisualStyleBackColor=$false;$b.Cursor='Hand'
    $apply={
        $primary=$Role -eq 'primary';$nav=$Role -eq 'nav'
        $background=if(!$b.Enabled){if($nav){'#111827'}else{'#EDF0F5'}}elseif($primary){'#4F46E5'}elseif($nav){'#111827'}else{'#FFFFFF'}
        $foreground=if(!$b.Enabled){'#7D8799'}elseif($primary -or $nav){'#FFFFFF'}else{'#334155'}
        $b.BackColor=[Drawing.ColorTranslator]::FromHtml($background);$b.ForeColor=[Drawing.ColorTranslator]::FromHtml($foreground)
        $b.FlatAppearance.BorderColor=[Drawing.ColorTranslator]::FromHtml($(if($primary -or $nav){$background}else{'#D8DFE9'}))
        $b.FlatAppearance.MouseOverBackColor=[Drawing.ColorTranslator]::FromHtml($(if($primary){'#4338CA'}elseif($nav){'#253249'}else{'#F3F5FA'}))
    }.GetNewClosure()
    & $apply;$b.Add_EnabledChanged($apply)
    return $b
}
function New-FortressFlow($Parent,[string]$Name){
    $flow=New-FortressControl $Parent FlowLayoutPanel $Name
    $flow.AutoSize=$true;$flow.AutoSizeMode='GrowAndShrink';$flow.WrapContents=$false
    $flow.Margin=New-Object Windows.Forms.Padding(0,0,0,12)
    return $flow
}
function New-FortressCard($Parent,[string]$Name){
    $card=New-FortressTable $Parent $Name
    $card.BackColor=[Drawing.Color]::White;$card.Padding=New-Object Windows.Forms.Padding(20)
    $card.Margin=New-Object Windows.Forms.Padding(0,0,0,16)
    return $card
}
function Get-FortressErrorMessage($Record){
    $errorDetail=$Record.Exception
    while($errorDetail.InnerException){$errorDetail=$errorDetail.InnerException}
    $message=([string]$errorDetail.Message -replace '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]',' ').Trim()
    if(!$message){return 'The operation could not finish. Check your connection and try again.'}
    return $message.Substring(0,[Math]::Min(1600,$message.Length))
}

function New-SetupWindow([string]$SetupRoot,[bool]$AutoConnect=$true){
    # PS 5.1 event closures do not retain script-scoped function lookup.
    $startOperation=${function:Start-SetupOperation}
    [Windows.Forms.Application]::EnableVisualStyles()
    $form=New-Object Windows.Forms.Form
    $iconPath=Join-Path $SetupRoot 'fortress.ico'
    if(!(Test-Path -LiteralPath $iconPath)){$iconPath=Join-Path $SetupRoot 'assets\fortress.ico'}
    $form.Icon=New-Object Drawing.Icon($iconPath)
    $form.Text='Fortress Backup'
    $form.ClientSize=New-Object Drawing.Size(1120,800)
    $form.MinimumSize=New-Object Drawing.Size(860,620)
    $form.StartPosition='CenterScreen';$form.FormBorderStyle='Sizable';$form.MaximizeBox=$true
    $form.AutoScaleMode='Dpi';$form.AutoScaleDimensions=New-Object Drawing.SizeF(96,96)
    $form.Font=New-Object Drawing.Font('Segoe UI',10)
    $form.BackColor=[Drawing.ColorTranslator]::FromHtml('#F3F5FA')
    $state=@{Worker=$null;Pending=$null;Stage='';Profile=$null;Controller='';Id='';Token=''}
    $form.Tag=$state
    $errorMessage=${function:Get-FortressErrorMessage}
    $shell=New-FortressTable $form shell 2
    $shell.Dock='Fill';$shell.AutoSize=$false
    $shell.ColumnStyles[0].SizeType='Absolute';$shell.ColumnStyles[0].Width=204
    $shell.ColumnStyles[1].SizeType='Percent';$shell.ColumnStyles[1].Width=100
    [void]$shell.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent,100)))
    $sidebar=New-FortressTable $null sidebar
    $sidebar.Dock='Fill';$sidebar.AutoSize=$false;$sidebar.Padding=New-Object Windows.Forms.Padding(18,24,18,20)
    $sidebar.BackColor=[Drawing.ColorTranslator]::FromHtml('#111827')
    $shell.Controls.Add($sidebar,0,0)
    for($i=0;$i -lt 5;$i++){[void]$sidebar.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::AutoSize)))}
    [void]$sidebar.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent,100)))
    [void]$sidebar.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::AutoSize)))
    [void]$sidebar.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::AutoSize)))
    $brand=New-FortressControl $null Label brand 'Fortress Backup'
    $brand.ForeColor=[Drawing.Color]::White;$brand.Font=New-Object Drawing.Font('Segoe UI',14,[Drawing.FontStyle]::Bold)
    $brand.Margin=New-Object Windows.Forms.Padding(0,0,0,4);$sidebar.Controls.Add($brand,0,0)
    $brandNote=New-FortressControl $null Label brandNote 'Your files, protected.'
    $brandNote.ForeColor=[Drawing.ColorTranslator]::FromHtml('#A5B4CB');$brandNote.Margin=New-Object Windows.Forms.Padding(0,0,0,32);$sidebar.Controls.Add($brandNote,0,1)
    $recoveryButton=New-FortressButton $null backups 'Snapshots' nav
    $recoveryButton.Dock='Fill';$recoveryButton.TextAlign='MiddleLeft';$recoveryButton.Margin=New-Object Windows.Forms.Padding(0,0,0,8);$sidebar.Controls.Add($recoveryButton,0,2)
    $settingsButton=New-FortressButton $null deviceSettings 'Device settings' nav
    $settingsButton.Dock='Fill';$settingsButton.TextAlign='MiddleLeft';$settingsButton.Margin=New-Object Windows.Forms.Padding(0,0,0,24);$sidebar.Controls.Add($settingsButton,0,3)
    $connectionState=New-FortressControl $null Label connectionState 'Not connected'
    $connectionState.ForeColor=[Drawing.ColorTranslator]::FromHtml('#A5B4CB');$sidebar.Controls.Add($connectionState,0,4);$state.ConnectionLabel=$connectionState
    $hint=New-FortressControl $null Label backgroundHint 'Backups continue when this window is closed.'
    $hint.ForeColor=[Drawing.ColorTranslator]::FromHtml('#A5B4CB');$hint.Margin=New-Object Windows.Forms.Padding(0,16,0,16);$sidebar.Controls.Add($hint,0,6)
    $close=New-FortressButton $null close 'Close app' nav
    $close.Dock='Fill';$close.TextAlign='MiddleLeft';$sidebar.Controls.Add($close,0,7)
    $main=New-FortressTable $null main
    $main.Dock='Fill';$main.AutoSize=$false;$main.Padding=New-Object Windows.Forms.Padding(28,24,28,24);$shell.Controls.Add($main,1,0)
    [void]$main.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::AutoSize)))
    [void]$main.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent,100)))
    $header=New-FortressTable $null pageHeader 2
    $header.ColumnStyles[1].SizeType='AutoSize';$header.Margin=New-Object Windows.Forms.Padding(0,0,0,20)
    $main.Controls.Add($header,0,0)
    $titles=New-FortressTable $null pageTitles
    $heading=New-FortressControl $null Label heading 'Device settings'
    $heading.Font=New-Object Drawing.Font('Segoe UI',22,[Drawing.FontStyle]::Bold);$heading.Margin=New-Object Windows.Forms.Padding(0,0,0,6)
    $titles.Controls.Add($heading,0,0)
    $intro=New-FortressControl $null Label intro "Manage this laptop's connection and backup folders."
    $intro.ForeColor=[Drawing.ColorTranslator]::FromHtml('#64748B');$titles.Controls.Add($intro,0,1);$header.Controls.Add($titles,0,0)
    $backupButton=New-FortressButton $null backupNow 'Backup now' primary
    $backupButton.Anchor='Top,Right';$backupButton.Margin=New-Object Windows.Forms.Padding(16,4,0,0);$header.Controls.Add($backupButton,1,0)
    $content=New-FortressControl $null Panel content
    $content.Dock='Fill';$content.Margin=New-Object Windows.Forms.Padding(0);$main.Controls.Add($content,0,1)
    $settings=New-FortressControl $content Panel settings
    $settings.Dock='Fill';$settings.Margin=New-Object Windows.Forms.Padding(0)
    $settingsScroll=New-FortressControl $settings Panel settingsScroll
    $settingsScroll.Dock='Fill';$settingsScroll.AutoScroll=$true;$settingsScroll.Margin=New-Object Windows.Forms.Padding(0)
    $settingsLayout=New-FortressTable $settingsScroll settingsLayout
    $connectionCard=New-FortressCard $null connectionCard
    $settingsLayout.Controls.Add($connectionCard,0,0)
    $connectionHeader=New-FortressTable $null connectionHeader 2
    $connectionHeader.ColumnStyles[1].SizeType='AutoSize';$connectionCard.Controls.Add($connectionHeader,0,0)
    $connectionTitle=New-FortressControl $null Label connectionTitle 'Connection'
    $connectionTitle.Font=New-Object Drawing.Font('Segoe UI',12,[Drawing.FontStyle]::Bold);$connectionHeader.Controls.Add($connectionTitle,0,0)
    $editConnection=New-FortressControl $null LinkLabel editConnection 'Edit connection'
    $editConnection.AutoSize=$true;$editConnection.Dock='None';$editConnection.LinkColor=[Drawing.ColorTranslator]::FromHtml('#4F46E5');$editConnection.Visible=$false;$connectionHeader.Controls.Add($editConnection,1,0)
    $connectionHelp=New-FortressControl $null Label connectionHelp 'Use your enrollment from Managed Clients. Your storage settings load automatically.'
    $connectionHelp.ForeColor=[Drawing.ColorTranslator]::FromHtml('#64748B');$connectionHelp.Margin=New-Object Windows.Forms.Padding(0,0,0,16);$connectionCard.Controls.Add($connectionHelp,0,1)
    $controllerLabel=New-FortressControl $null Label controllerLabel 'Controller HTTPS address';$connectionCard.Controls.Add($controllerLabel,0,2)
    $controller=New-FortressControl $null TextBox controller;$controller.AccessibleName='Controller HTTPS address';$connectionCard.Controls.Add($controller,0,3)
    $credentials=New-FortressTable $null credentials 2
    $credentials.Margin=New-Object Windows.Forms.Padding(0,4,0,8);$connectionCard.Controls.Add($credentials,0,4)
    $idLabel=New-FortressControl $null Label idLabel 'Enrollment client ID';$credentials.Controls.Add($idLabel,0,0)
    $tokenLabel=New-FortressControl $null Label tokenLabel 'Enrollment token';$credentials.Controls.Add($tokenLabel,1,0)
    $id=New-FortressControl $null TextBox clientId;$id.AccessibleName='Enrollment client ID';$id.Margin=New-Object Windows.Forms.Padding(0,0,12,0);$credentials.Controls.Add($id,0,1)
    $token=New-FortressControl $null TextBox token;$token.AccessibleName='Enrollment token';$token.UseSystemPasswordChar=$true;$credentials.Controls.Add($token,1,1)
    $connectionActions=New-FortressTable $null connectionActions 2
    $connectionActions.ColumnStyles[1].SizeType='AutoSize';$connectionActions.Margin=New-Object Windows.Forms.Padding(0,8,0,0)
    $repository=New-FortressControl $null Label repository 'Connect to load your assigned repository.'
    $repository.ForeColor=[Drawing.ColorTranslator]::FromHtml('#64748B');$repository.Anchor='Left,Right';$repository.Margin=New-Object Windows.Forms.Padding(0,0,12,0);$connectionActions.Controls.Add($repository,0,0)
    $connect=New-FortressButton $null connect 'Connect';$connect.Margin=New-Object Windows.Forms.Padding(0);$connectionActions.Controls.Add($connect,1,0);$connectionCard.Controls.Add($connectionActions,0,5)
    $folderCard=New-FortressCard $null folderCard;$settingsLayout.Controls.Add($folderCard,0,1)
    $folderHeader=New-FortressTable $null folderHeader 2;$folderHeader.ColumnStyles[1].SizeType='AutoSize'
    $folderLabel=New-FortressControl $null Label folderLabel 'Backup folders';$folderLabel.Font=New-Object Drawing.Font('Segoe UI',12,[Drawing.FontStyle]::Bold);$folderLabel.Anchor='Left,Right';$folderHeader.Controls.Add($folderLabel,0,0)
    $folderActions=New-FortressFlow $null folderActions;$folderHeader.Controls.Add($folderActions,1,0)
    $add=New-FortressButton $folderActions addFolder 'Add folder'
    $remove=New-FortressButton $folderActions removeFolder 'Remove'
    $folderCard.Controls.Add($folderHeader,0,0)
    $folderHint=New-FortressControl $null Label folderHint 'Select folders on this laptop. Changes apply after you save.'
    $folderHint.ForeColor=[Drawing.ColorTranslator]::FromHtml('#64748B');$folderCard.Controls.Add($folderHint,0,1)
    $folders=New-FortressControl $null ListBox folders
    $folders.Height=112;$folders.IntegralHeight=$false;$folders.HorizontalScrollbar=$true;$folders.BorderStyle='FixedSingle';$folders.BackColor=[Drawing.Color]::White;$folders.AccessibleName='Backup folders';$folderCard.Controls.Add($folders,0,2)
    $setupFooter=New-FortressCard $settings setupFooter;$setupFooter.Dock='Bottom';$setupFooter.Padding=New-Object Windows.Forms.Padding(16)
    $progress=New-FortressControl $null ProgressBar progress;$progress.Height=6;$progress.Visible=$false;$setupFooter.Controls.Add($progress,0,0)
    $status=New-FortressControl $null TextBox status 'Connect, choose your folders, then save to start protecting this laptop.'
    $status.Multiline=$true;$status.ReadOnly=$true;$status.ScrollBars='Vertical';$status.BorderStyle='None';$status.BackColor=[Drawing.Color]::White;$status.Height=40;$status.TabStop=$false;$status.AccessibleName='Setup status';$setupFooter.Controls.Add($status,0,1)
    $saveActions=New-FortressTable $null saveActions 2;$saveActions.ColumnStyles[1].SizeType='AutoSize';$setupFooter.Controls.Add($saveActions,0,2)
    $saveHint=New-FortressControl $null Label saveHint 'Original files stay on this laptop.';$saveHint.ForeColor=[Drawing.ColorTranslator]::FromHtml('#64748B');$saveHint.Anchor='Left,Right';$saveActions.Controls.Add($saveHint,0,0)
    $install=New-FortressButton $null install 'Save and connect' primary;$install.Margin=New-Object Windows.Forms.Padding(12,0,0,0);$saveActions.Controls.Add($install,1,0)
    $install.Enabled=$false;$add.Enabled=$false;$remove.Enabled=$false
    $form.AcceptButton=$connect;$form.CancelButton=$close
    $connectionFields=@($connectionHelp,$controllerLabel,$controller,$credentials)
    $setConnectionEditing={param([bool]$editing)
        foreach($field in $connectionFields){$field.Visible=$editing}
        $editConnection.Text=if($editing){'Hide details'}else{'Edit connection'}
    }.GetNewClosure()
    $editConnection.Add_Click({ & $setConnectionEditing (!$controller.Visible) }.GetNewClosure())
    $changed={
        if($state.Profile -and !$state.Worker){
            $state.Profile=$null;$state.Token='';$connect.Text='Connect';$connectionState.Text='Connection changed'
            $install.Enabled=$false;$add.Enabled=$false
            $form.AcceptButton=$connect
            & $setConnectionEditing $true
            $repository.Text='Connection settings changed. Click Connect to load your saved repository.'
        }
    }.GetNewClosure()
    $controller.Add_TextChanged($changed);$id.Add_TextChanged($changed);$token.Add_TextChanged($changed)
    $close.Add_Click({$form.Close()}.GetNewClosure())
    $form.Add_FormClosing({param($sender,$event) if($state.Worker -or $state.RecoveryWorker){$event.Cancel=$true}}.GetNewClosure())
    $connect.Add_Click({
        $address=$controller.Text.Trim().TrimEnd('/')
        $uri=$null;$parsedId=[guid]::Empty
        if(![uri]::TryCreate($address,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment){$status.Text='Enter a trusted HTTPS controller address.';return}
        if(![guid]::TryParse($id.Text.Trim(),[ref]$parsedId)){$status.Text='Enter the enrollment client ID from Managed Clients, not the laptop IP.';return}
        if($token.Text -notmatch '^[A-Za-z0-9_-]{32,256}$'){$status.Text='Enter the enrollment token from Managed Clients.';return}
        $state.Controller=$address;$state.Id=$id.Text.Trim();$state.Token=$token.Text
        $state.Stage='connect';$state.Profile=$null
        $install.Enabled=$false;$connect.Enabled=$false;$controller.Enabled=$false;$id.Enabled=$false;$token.Enabled=$false
        $add.Enabled=$false;$remove.Enabled=$false;$close.Enabled=$false;$backupButton.Enabled=$false;$recoveryButton.Enabled=$false
        $connectionState.Text='Connecting...';$connectionState.ForeColor=[Drawing.ColorTranslator]::FromHtml('#FCD34D')
        $repository.Text='Saved repository: loading...'
        $status.Text='Connecting securely and retrieving your saved repository...'
        $progress.Visible=$true;$progress.Style='Marquee'
        & $startOperation $state {
            param($root,$address,$clientId,$secret)
            $ErrorActionPreference='Stop'
            . (Join-Path $root 'provision.ps1')
            $profile=Get-ManagedRepository -Controller $address -Id $clientId -Token $secret
            $updated=Update-ManagedRuntime -SetupRoot $root -Profile $profile -Controller $address -Id $clientId -Token $secret
            $profile | Add-Member -NotePropertyName runtimeUpdated -NotePropertyValue $updated -Force
            return $profile
        } @($SetupRoot,$state.Controller,$state.Id,$state.Token)
    }.GetNewClosure())
    $add.Add_Click({
        $picker=New-Object Windows.Forms.FolderBrowserDialog
        try {
            $picker.Description='Choose a backup folder'
            $picker.ShowNewFolderButton=$false
            if($picker.ShowDialog($form) -eq [Windows.Forms.DialogResult]::OK -and !$folders.Items.Contains($picker.SelectedPath)){
                [void]$folders.Items.Add($picker.SelectedPath)
                $install.Enabled=!!$state.Profile
            }
        }finally{$picker.Dispose()}
    }.GetNewClosure())
    $folders.Add_SelectedIndexChanged({$remove.Enabled=$folders.SelectedIndex -ge 0 -and !$state.Worker}.GetNewClosure())
    $remove.Add_Click({
        if($folders.SelectedIndex -ge 0){$folders.Items.RemoveAt($folders.SelectedIndex)}
        $install.Enabled=!!$state.Profile -and $folders.Items.Count -gt 0
    }.GetNewClosure())
    $install.Add_Click({
        if(!$state.Profile -or !$folders.Items.Count){return}
        $state.Stage='install'
        $install.Enabled=$false;$connect.Enabled=$false;$add.Enabled=$false;$remove.Enabled=$false;$close.Enabled=$false;$backupButton.Enabled=$false;$recoveryButton.Enabled=$false;$folders.Enabled=$false
        $controller.Enabled=$false;$id.Enabled=$false;$token.Enabled=$false
        $progress.Visible=$true;$progress.Style='Marquee'
        $status.Text='Saving your folders and verifying backup access. This may take a few minutes...'
        & $startOperation $state {
            param($root,$profile,$address,$clientId,$secret,$sources)
            $ErrorActionPreference='Stop'
            . (Join-Path $root 'provision.ps1')
            Install-ManagedSetup -SetupRoot $root -Profile $profile -Controller $address -Id $clientId -Token $secret -Sources $sources
        } @($SetupRoot,$state.Profile,$state.Controller,$state.Id,$state.Token,@($folders.Items))
    }.GetNewClosure())
    $timer=New-Object Windows.Forms.Timer
    $timer.Interval=100
    $timer.Add_Tick({
        if(!$state.Worker -or !$state.Pending.IsCompleted){return}
        $failed=$false
        try {
            $result=$state.Worker.EndInvoke($state.Pending)
            if($state.Worker.Streams.Error.Count -gt 0){throw $state.Worker.Streams.Error[0].Exception}
            if($state.Stage -eq 'connect'){
                $state.Profile=$result[0];$connect.Text='Refresh connection'
                $editConnection.Visible=$true; & $setConnectionEditing $false
                $connectionState.Text='Connected';$connectionState.ForeColor=[Drawing.ColorTranslator]::FromHtml('#86EFAC')
                $form.AcceptButton=$install
                $repository.Text='Saved repository: '+$state.Profile.storageName+' / '+$state.Profile.repositoryName
                $status.Text=if($state.Profile.runtimeUpdated){'Connected. Background agent updated and verified. Open Snapshots to browse saved backups.'}else{'Connected. Choose backup folders, then click Save and connect to save changes.'}
            }else{
                $status.Text='Settings saved. Use Backup now to protect these folders. The background agent stays connected when you close this window.'
                $close.Text='Close app'
                $form.AcceptButton=$install
            }
        }catch{
            $failed=$true
            if($state.Stage -eq 'connect'){
                $connectionState.Text='Connection needs attention';$connectionState.ForeColor=[Drawing.ColorTranslator]::FromHtml('#FCD34D')
                $repository.Text='Saved repository: could not connect.'
                $status.Text='Connection failed: '+(& $errorMessage $_)+' Check HTTPS/DNS and Managed Clients. If a backup is running, retry after it finishes.'
            }else{
                $status.Text='Installation failed: '+(& $errorMessage $_)+' Check C:\ProgramData\FortressBackup\setup-check.log for verification details.'
            }
        }finally{
            $state.Worker.Dispose();$state.Worker=$null;$state.Pending=$null
            $progress.Visible=$false;$progress.Style='Blocks';$progress.Value=0;$close.Enabled=$true;$recoveryButton.Enabled=$true
            if($state.RecoveryRefresh){ & $state.RecoveryRefresh $true }
            if($true){
                $connect.Enabled=$true;$controller.Enabled=$true;$id.Enabled=$true;$token.Enabled=$true;$folders.Enabled=$true
                $add.Enabled=!!$state.Profile;$remove.Enabled=$folders.SelectedIndex -ge 0
                $install.Enabled=!!$state.Profile -and $folders.Items.Count -gt 0
            }
        }
    }.GetNewClosure())
    $form.Add_FormClosed({$timer.Stop();$timer.Dispose();$state.Token='';$token.Clear();$state.Profile=$null}.GetNewClosure())
    $existingPath=Join-Path $env:ProgramData 'FortressBackup\agent.json'
    if(Test-Path -LiteralPath $existingPath){
        try {
            $existing=Get-Content -LiteralPath $existingPath -Raw | ConvertFrom-Json
            $connectionState.Text='Saved connection'
            $controller.Text=[string]$existing.controllerUrl
            $id.Text=[string]$existing.agentId
            if($existing.agentTokenFile){$token.Text=[IO.File]::ReadAllText([string]$existing.agentTokenFile).Trim()}
            foreach($source in $existing.sources){if($source -and !$folders.Items.Contains([string]$source)){[void]$folders.Items.Add([string]$source)}}
            $status.Text='Your saved configuration is loaded. The connection will be validated automatically; your background agent remains independent of this window.'
        }catch{$status.Text='Existing settings could not be loaded. Enter enrollment credentials to configure this laptop again.'}
    }
    $recoveryPanel=Add-RecoveryPanel $form $state $content $backupButton
    $showSettings={
        $recoveryPanel.Visible=$false;$settings.Visible=$true;$settings.BringToFront()
        $heading.Text='Device settings';$intro.Text="Manage this laptop's connection and backup folders."
        $settingsButton.BackColor=[Drawing.ColorTranslator]::FromHtml('#29364D');$recoveryButton.BackColor=[Drawing.ColorTranslator]::FromHtml('#111827')
        $form.AcceptButton=$connect
    }.GetNewClosure()
    $showBackups={
        $settings.Visible=$false;$recoveryPanel.Visible=$true;$recoveryPanel.BringToFront()
        $heading.Text='Backups & restore';$intro.Text='Browse saved versions and recover the files you need.'
        $recoveryButton.BackColor=[Drawing.ColorTranslator]::FromHtml('#29364D');$settingsButton.BackColor=[Drawing.ColorTranslator]::FromHtml('#111827')
        $form.AcceptButton=$null
    }.GetNewClosure()
    $settingsButton.Add_Click($showSettings)
    $recoveryButton.Add_Click({
        & $showBackups
        if(!$state.Worker){$recoveryPanel.Controls.Find('load',$true)[0].PerformClick()}
    }.GetNewClosure())
    $backupButton.Add_Click($showBackups)
    & $showSettings
    $form.Add_Shown({
        $area=[Windows.Forms.Screen]::FromControl($form).WorkingArea
        $form.MinimumSize=New-Object Drawing.Size([Math]::Min($form.MinimumSize.Width,$area.Width-24),[Math]::Min($form.MinimumSize.Height,$area.Height-24))
        $form.Size=New-Object Drawing.Size([Math]::Min($form.Width,$area.Width-24),[Math]::Min($form.Height,$area.Height-24))
    }.GetNewClosure())
    if($AutoConnect -and $controller.Text -and $id.Text -and $token.Text){$form.Add_Shown({if(!$state.Worker){$connect.PerformClick()}}.GetNewClosure())}
    $timer.Start()
    return $form
}
