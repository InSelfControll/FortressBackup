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

function New-SetupWindow([string]$SetupRoot,[bool]$AutoConnect=$true){
    # PS 5.1 event closures do not retain script-scoped function lookup.
    $startOperation=${function:Start-SetupOperation}
    [Windows.Forms.Application]::EnableVisualStyles()
    $form=New-Object Windows.Forms.Form
    $iconPath=Join-Path $SetupRoot 'fortress.ico'
    if(!(Test-Path -LiteralPath $iconPath)){$iconPath=Join-Path $SetupRoot 'assets\fortress.ico'}
    $form.Icon=New-Object Drawing.Icon($iconPath)
    $form.Text='Fortress Backup'
    $form.ClientSize=New-Object Drawing.Size(650,605)
    $form.StartPosition='CenterScreen'
    $form.FormBorderStyle='FixedDialog'
    $form.MaximizeBox=$false
    $form.AutoScaleMode='Dpi'
    $form.Font=New-Object Drawing.Font('Segoe UI',10)
    $state=@{Worker=$null;Pending=$null;Stage='';Profile=$null;Controller='';Id='';Token=''}
    $form.Tag=$state
    function Add-SetupControl($Type,$Name,$Text,$X,$Y,$Width,$Height){
        $control=New-Object ('Windows.Forms.'+$Type)
        $control.Name=$Name;$control.Text=$Text
        $control.SetBounds($X,$Y,$Width,$Height)
        $form.Controls.Add($control)
        return $control
    }
    $heading=Add-SetupControl Label heading 'Connect this laptop to Fortress Backup' 20 15 610 30
    $heading.Font=New-Object Drawing.Font('Segoe UI',14,[Drawing.FontStyle]::Bold)
    [void](Add-SetupControl Label intro 'Use the enrollment credentials from Managed Clients. Your saved storage settings are downloaded automatically.' 20 52 610 45)
    [void](Add-SetupControl Label controllerLabel 'Controller HTTPS address' 20 105 205 25)
    $controller=Add-SetupControl TextBox controller '' 230 102 400 28
    [void](Add-SetupControl Label idLabel 'Enrollment client ID' 20 142 205 25)
    $id=Add-SetupControl TextBox clientId '' 230 139 400 28
    [void](Add-SetupControl Label tokenLabel 'Enrollment token' 20 179 205 25)
    $token=Add-SetupControl TextBox token '' 230 176 400 28
    $token.UseSystemPasswordChar=$true
    $connect=Add-SetupControl Button connect 'Connect' 490 215 140 33
    $repository=Add-SetupControl Label repository 'Saved repository: connect to load your assigned storage.' 20 258 610 43
    [void](Add-SetupControl Label folderLabel 'Folders to back up' 20 308 460 25)
    $folders=Add-SetupControl ListBox folders '' 20 337 455 115
    $folders.HorizontalScrollbar=$true
    $add=Add-SetupControl Button addFolder 'Add folder...' 490 337 140 33
    $remove=Add-SetupControl Button removeFolder 'Remove' 490 378 140 33
    $progress=Add-SetupControl ProgressBar progress '' 20 469 610 15
    $status=Add-SetupControl TextBox status 'Connect, choose folders, then save your configuration.' 20 492 610 57
    $status.Multiline=$true;$status.ReadOnly=$true;$status.ScrollBars='Vertical'
    $status.BorderStyle='None';$status.BackColor=[Drawing.SystemColors]::Control
    $status.AccessibleName='Setup status'
    $install=Add-SetupControl Button install 'Save and connect' 340 558 140 33
    $close=Add-SetupControl Button close 'Cancel' 490 558 140 33
    $install.Enabled=$false;$add.Enabled=$false;$remove.Enabled=$false
    $form.AcceptButton=$connect
    $form.CancelButton=$close
    $changed={
        if($state.Profile -and !$state.Worker){
            $state.Profile=$null;$state.Token='';$connect.Text='Connect'
            $install.Enabled=$false;$add.Enabled=$false
            $form.AcceptButton=$connect
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
        $add.Enabled=$false;$remove.Enabled=$false;$close.Enabled=$false
        $repository.Text='Saved repository: loading...'
        $status.Text='Connecting securely and retrieving your saved repository...'
        $progress.Style='Marquee'
        & $startOperation $state {
            param($root,$address,$clientId,$secret)
            $ErrorActionPreference='Stop'
            . (Join-Path $root 'provision.ps1')
            Get-ManagedRepository -Controller $address -Id $clientId -Token $secret
        } @($SetupRoot,$state.Controller,$state.Id,$state.Token)
    }.GetNewClosure())
    $add.Add_Click({
        $picker=New-Object Windows.Forms.FolderBrowserDialog
        try {
            $picker.Description='Choose a folder to back up'
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
        $install.Enabled=$false;$connect.Enabled=$false;$add.Enabled=$false;$remove.Enabled=$false;$close.Enabled=$false;$folders.Enabled=$false
        $controller.Enabled=$false;$id.Enabled=$false;$token.Enabled=$false
        $progress.Style='Marquee'
        $status.Text='Installing protected files and checking storage and controller access as SYSTEM. This may take several minutes...'
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
                $form.AcceptButton=$install
                $repository.Text='Saved repository: '+$state.Profile.storageName+' / '+$state.Profile.repositoryName
                $status.Text='Connected. Choose the folders you want to back up, then click Save and connect.'
            }else{
                $status.Text='Configured and connected. Open Managed Clients to start a backup and follow its progress. Saving the configuration does not mean a backup has completed.'
                $close.Text='Finish'
                $form.AcceptButton=$install
            }
        }catch{
            $failed=$true
            if($state.Stage -eq 'connect'){
                $repository.Text='Saved repository: could not connect.'
                $status.Text='Connection failed. Check HTTPS/DNS, enrollment credentials, and the assigned repository in Managed Clients.'
            }else{
                $errorDetail=$_.Exception
                while($errorDetail.InnerException){$errorDetail=$errorDetail.InnerException}
                $status.Text='Installation failed: '+$errorDetail.Message+' Check C:\ProgramData\FortressBackup\setup-check.log for verification details.'
            }
        }finally{
            $state.Worker.Dispose();$state.Worker=$null;$state.Pending=$null
            $progress.Style='Blocks';$progress.Value=0;$close.Enabled=$true
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
            $controller.Text=[string]$existing.controllerUrl
            $id.Text=[string]$existing.agentId
            if($existing.agentTokenFile){$token.Text=[IO.File]::ReadAllText([string]$existing.agentTokenFile).Trim()}
            foreach($source in $existing.sources){if($source -and !$folders.Items.Contains([string]$source)){[void]$folders.Items.Add([string]$source)}}
            $status.Text='Your saved configuration is loaded. The connection will be validated automatically; your background agent remains independent of this window.'
        }catch{$status.Text='Existing settings could not be loaded. Enter enrollment credentials to configure this laptop again.'}
    }
    $recoveryPanel=Add-RecoveryPanel $form $state
    $recoveryButton=Add-SetupControl Button backups 'Backups / Restore' 20 558 180 33
    $recoveryButton.Add_Click({
        if($state.Worker){return}
        $recoveryPanel.Visible=$true;$recoveryPanel.BringToFront();$form.AcceptButton=$null
    }.GetNewClosure())
    Set-FortressTheme $form $recoveryPanel
    if($AutoConnect -and $controller.Text -and $id.Text -and $token.Text){$form.Add_Shown({if(!$state.Worker){$connect.PerformClick()}}.GetNewClosure())}
    $timer.Start()
    return $form
}

function Set-FortressTheme($Form,$Recovery){
    $background=[Drawing.ColorTranslator]::FromHtml('#101827')
    $surface=[Drawing.ColorTranslator]::FromHtml('#1D293B')
    $text=[Drawing.ColorTranslator]::FromHtml('#E5EAF3')
    $muted=[Drawing.ColorTranslator]::FromHtml('#A9B6CD')
    $primary=[Drawing.ColorTranslator]::FromHtml('#6366F1')
    $Form.ClientSize=New-Object Drawing.Size(940,740)
    $Form.MinimumSize=New-Object Drawing.Size(640,400);$Form.FormBorderStyle='Sizable';$Form.MaximizeBox=$true
    $Form.BackColor=$background;$Form.ForeColor=$text
    $Form.Font=New-Object Drawing.Font('Segoe UI',10)
    $Form.AutoScroll=$true;$Form.AutoScrollMinSize=New-Object Drawing.Size(930,730)
    $Form.Add_Shown({$area=[Windows.Forms.Screen]::FromControl($Form).WorkingArea;$Form.Size=New-Object Drawing.Size([Math]::Min($Form.Width,$area.Width-24),[Math]::Min($Form.Height,$area.Height-24))}.GetNewClosure())
    $placements=@{
      heading=@(235,28,680,38);intro=@(235,80,675,50)
      controllerLabel=@(235,148,210,26);controller=@(455,145,455,31)
      idLabel=@(235,197,210,26);clientId=@(455,194,455,31)
      tokenLabel=@(235,246,210,26);token=@(455,243,455,31)
      connect=@(755,290,155,38);repository=@(235,345,675,50)
      folderLabel=@(235,405,480,28);folders=@(235,442,505,140)
      addFolder=@(755,442,155,38);removeFolder=@(755,491,155,38)
      progress=@(235,602,675,8);status=@(235,625,675,50)
      install=@(575,688,170,38);close=@(760,688,150,38);backups=@(20,176,185,44)
    }
    foreach($name in $placements.Keys){$c=$Form.Controls[$name];if($c){$b=$placements[$name];$c.SetBounds($b[0],$b[1],$b[2],$b[3])}}
    $Form.Controls['heading'].Text='Device protection'
    $Form.Controls['heading'].Font=New-Object Drawing.Font('Segoe UI',20,[Drawing.FontStyle]::Bold)
    $Form.Controls['intro'].Text='Configure folders, browse saved versions, and recover files. Once configured, the agent runs independently of this window.'
    $brand=New-Object Windows.Forms.Label;$brand.Name='brand';$brand.Text='FORTRESS'+"`n"+'BACKUP';$brand.SetBounds(22,30,185,75);$brand.Font=New-Object Drawing.Font('Segoe UI',17,[Drawing.FontStyle]::Bold);$Form.Controls.Add($brand)
    $nav=New-Object Windows.Forms.Label;$nav.Text='DEVICE SETTINGS';$nav.SetBounds(24,133,185,25);$nav.ForeColor=$muted;$Form.Controls.Add($nav)
    $hint=New-Object Windows.Forms.Label;$hint.Text='Encrypted backups'+"`n"+'Saved versions'+"`n"+'File recovery';$hint.SetBounds(24,265,180,95);$hint.ForeColor=$muted;$Form.Controls.Add($hint)
    $Recovery.Dock='None';$Recovery.SetBounds(215,12,710,718);$Recovery.AutoScroll=$true;$Recovery.AutoScrollMinSize=New-Object Drawing.Size(690,620);$Recovery.Anchor='Top,Bottom,Left,Right'
    $style={param($container)
      foreach($c in $container.Controls){
        $c.ForeColor=$text
        if($c -is [Windows.Forms.Button]){$c.FlatStyle='Flat';$c.FlatAppearance.BorderSize=0;$c.BackColor=$surface;$c.UseVisualStyleBackColor=$false;$c.Cursor='Hand'}
        elseif($c -is [Windows.Forms.TextBox] -or $c -is [Windows.Forms.ListBox] -or $c -is [Windows.Forms.ComboBox]){$c.BackColor=$surface}
        else{$c.BackColor=$background}
        if($c.Name -in @('install','connect','restore','restoreAll','load','backups')){$c.BackColor=$primary}
      }
    }.GetNewClosure()
    & $style $Form;& $style $Recovery
    $Form.Controls['status'].BackColor=$background
    $Recovery.BackColor=$background
}
