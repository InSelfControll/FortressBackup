#requires -Version 5.1
# Native Windows regression: protected cloud staging and digest rejection.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'provision.ps1')
$work=Join-Path $env:TEMP ('FortressCloudTest-'+[guid]::NewGuid().ToString('N'))
$runtime=Join-Path $env:ProgramData 'FortressBackup'
$exe=Join-Path $PSScriptRoot 'fortress-agent.exe'
$digest=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
try{
 foreach($backend in @('azure','gdrive','onedrive','gcs')){
  $profile=@{backend=$backend;repository=$(if($backend -eq 'azure'){'azure:backups:/laptop'}elseif($backend -eq 'gcs'){'gs:backups:/laptop'}else{'rclone:drive:laptop'});password='test-password';azureAccountName='testaccount';azureAccountKey=('a'*86+'==');rcloneConfig="[drive]`ntype = drive`ntoken = {`"refresh_token`":`"test-only`"}`n"}
  if($backend -eq 'onedrive'){$profile.rcloneConfig="[drive]`ntype = onedrive`ndrive_id = b!test-drive`ndrive_type = personal`ntoken = {`"refresh_token`":`"test-only`"}`n"}
  $profile.gcsCredentials='{"type":"authorized_user","client_id":"test-only","client_secret":"test-only","refresh_token":"test-only","token_uri":"https://oauth2.googleapis.com/token"}'
  $credentials=Save-ManagedRepository -Profile $profile -Directory (Join-Path $work $backend)
  $token=Join-Path (Join-Path $work $backend) 'agent-token.txt'
  [IO.File]::WriteAllText($token,('a'*43))
  $config=@{resticPath=$exe;sources=@($env:WINDIR);controllerUrl='https://controller.example.invalid';agentId='cloud-test';agentTokenFile=$token}
  foreach($name in $credentials.Keys){$config[$name]=$credentials[$name]}
  if($backend -in @('gdrive','onedrive')){$config.rclonePath=$exe}
  $configPath=Join-Path $work ($backend+'.json')
  [IO.File]::WriteAllText($configPath,($config|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
  $task='FortressBackup-CloudTest'
  & (Join-Path $PSScriptRoot 'install-task.ps1') -AgentPath $exe -ConfigPath $configPath -AgentSha256 $digest -ResticSha256 $digest -RcloneSha256 $digest -TaskName $task
  Disable-ScheduledTask -TaskName $task | Out-Null
  Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
  $saved=Get-Content -LiteralPath (Join-Path $runtime 'agent.json') -Raw | ConvertFrom-Json
  $field=if($backend -eq 'azure'){'azureKeyFile'}elseif($backend -eq 'gcs'){'gcsCredentialsFile'}else{'rcloneConfigFile'}
  $expected=if($backend -eq 'azure'){$profile.azureAccountKey}elseif($backend -eq 'gcs'){$profile.gcsCredentials}else{$profile.rcloneConfig}
  if([IO.File]::ReadAllText($saved.$field) -cne $expected){throw 'Cloud credential copy changed its contents'}
  $acl=Get-Acl -LiteralPath $saved.$field
  if(!$acl.AreAccessRulesProtected -or @($acl.Access | Where-Object {$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544')}).Count){throw 'Cloud credentials have an unsafe ACL'}
  & (Join-Path $runtime 'fortress-agent.exe') -config (Join-Path $runtime 'agent.json') -operation validate
  if($LASTEXITCODE -ne 0){throw 'Installed cloud config did not validate'}
  Unregister-ScheduledTask -TaskName $task -Confirm:$false
  if($backend -in @('gdrive','onedrive')){
   $rejected=$false
   try{& (Join-Path $PSScriptRoot 'install-task.ps1') -AgentPath $exe -ConfigPath $configPath -AgentSha256 $digest -ResticSha256 $digest -RcloneSha256 ('0'*64) -TaskName $task}catch{$rejected=$true}
   if(!$rejected){throw 'Untrusted Rclone binary was accepted'}
  }
 }
 Write-Output 'Azure and Drive protected runtime staging verified.'
}finally{
 Unregister-ScheduledTask -TaskName FortressBackup-CloudTest -Confirm:$false -ErrorAction SilentlyContinue
 if(Test-Path -LiteralPath $work){Remove-Item -LiteralPath $work -Recurse -Force}
}
