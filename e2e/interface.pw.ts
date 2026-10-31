import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';

let processHandle: ChildProcess, directory: string, base: string, browserBase: string, token: string, user: any;
let password = 'Disposable-Test-Password-123';
const key = crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
const hostKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINb3o4m8E7d1+Nh4V2m3zF6nY7sR4r7yYh6m4fK3M2bV';
async function api(route: string, method = 'GET', body?: unknown) {
    const response = await fetch(base+'/api'+route,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const data = await response.json();
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${data.error}`);
    return data;
}
async function go(page: Page, name: string) {
    const menu = page.getByRole('button',{name:'Open navigation menu'});
    if(await menu.isVisible()) await menu.click();
    await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true}).click();
}
test.beforeAll(async () => {
    directory=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-interface-'));
    const port=await new Promise<number>(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=(server.address() as net.AddressInfo).port;server.close(()=>resolve(port))})});
    base=`http://127.0.0.1:${port}`; browserBase=`http://fortress-test.invalid:${port}`;
    const bootstrap=crypto.randomBytes(36).toString('hex');
    const settings={PORT:String(port),DB_TYPE:'sqlite',SQLITE_PATH:path.join(directory,'test.db'),FORTRESS_ENV_PATH:path.join(directory,'runtime.env'),JWT_SECRET:crypto.randomBytes(48).toString('hex'),FORTRESS_CREDENTIAL_KEY:crypto.randomBytes(32).toString('hex'),FORTRESS_BOOTSTRAP_TOKEN:bootstrap,NODE_ENV:'test'};
    fs.writeFileSync(settings.FORTRESS_ENV_PATH,Object.entries(settings).map(([k,v])=>`${k}=${v}`).join('\n'),{mode:0o600});
    const log=fs.openSync(path.join(directory,'controller.log'),'a',0o600);
    processHandle=spawn('bun',['server/index.ts'],{cwd:process.cwd(),env:{...process.env,...settings},stdio:['ignore',log,log]});
    fs.closeSync(log);
    let ready=false;
    for(let i=0;i<100;i++){try{const status=await fetch(base+'/api/status');if((await status.json()).dbInitialized){ready=true;break}}catch{} await new Promise(r=>setTimeout(r,50))}
    if(!ready)throw new Error('Disposable controller failed to start');
    const response=await fetch(base+'/api/config/setup',{method:'POST',headers:{'Content-Type':'application/json','X-Fortress-Bootstrap-Token':bootstrap},body:JSON.stringify({dbConfig:{type:'SQLite',filePath:settings.SQLITE_PATH},aiConfig:{provider:'None'},ssoConfig:{provider:null},authMode:'local',adminUser:{name:'Disposable Admin',email:'ui@example.invalid',password},selectedTools:['borg','restic','rsync']})});
    const setup=await response.json();if(!response.ok)throw new Error(setup.error);token=setup.token;user=setup.user;
});
test.afterAll(async()=>{
    if(processHandle){const stopped=new Promise(resolve=>processHandle.once('exit',resolve));processHandle.kill('SIGTERM');await stopped}
    if(directory)fs.rmSync(directory,{recursive:true,force:true});
});
test.beforeEach(async({page})=>{
    // Each test has a normal, server-issued session. No production data or accounts are used.
    const check=await fetch(base+'/api/auth/me',{headers:{Authorization:`Bearer ${token}`}});
    if(check.status===401){const session=await api('/auth/login','POST',{email:'ui@example.invalid',password});token=session.token;user=session.user;}
    if (!(await api('/systems')).length) await api('/systems','POST',{name:'Seed source',host:'seed.example.invalid',username:'backup',port:22,type:'remote',status:'offline',health:0,installedTools:[]});
    if (!(await api('/locations')).length) await api('/locations','POST',{name:'Seed local storage',type:'nfs',path:'/tmp/disposable-qa-backups'});
    await page.addInitScript(({token,user})=>{localStorage.setItem('fortress_token',token);localStorage.setItem('fortress_user_session',JSON.stringify(user))},{token,user});
    await page.goto(browserBase);await page.locator('[data-app-content]').waitFor();
});

test('HTTP system enrollment and edit save real records without a host key or browser UUID',async({page})=>{
    expect(await page.evaluate(()=>isSecureContext)).toBe(false);
    expect(await page.evaluate(()=>typeof crypto.randomUUID)).toBe('undefined');
    await go(page,'Systems');await page.getByRole('button',{name:'Register Node'}).click();
    await page.getByLabel('Node Name',{exact:true}).fill('HTTP source');await page.getByLabel('Hostname / IP',{exact:true}).fill('source.example.invalid');
    await page.getByRole('button',{name:'Enroll System',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
    const systems=await api('/systems');expect(systems.some((s:any)=>s.name==='HTTP source')).toBe(true);
    await page.getByRole('heading',{name:'HTTP source',exact:true}).locator('../..').getByTitle('Edit System').click();await page.getByLabel('Node Name',{exact:true}).fill('Edited HTTP source');await page.getByRole('button',{name:'Update System',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
    expect((await api('/systems')).some((s:any)=>s.name==='Edited HTTP source')).toBe(true);
});

test('rejected save preserves input, reports the error, and can retry',async({page})=>{
    await go(page,'Systems');await page.getByRole('button',{name:'Register Node'}).click();await page.getByLabel('Node Name',{exact:true}).fill('Retry source');await page.getByLabel('Hostname / IP',{exact:true}).fill('invalid host with spaces');
    await page.getByRole('button',{name:'Enroll System',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Invalid system');await expect(page.getByLabel('Node Name',{exact:true})).toHaveValue('Retry source');
    await page.getByLabel('Hostname / IP',{exact:true}).fill('retry.example.invalid');await page.getByRole('button',{name:'Enroll System',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
});

test('SSH import preserves the entered passphrase and rejects incorrect passphrases',async({page})=>{
    const encrypted=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem',cipher:'aes-256-cbc',passphrase:'actual-key-passphrase'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
    await go(page,'Systems');await page.getByRole('button',{name:/Identity Vault/}).click();
    await page.getByPlaceholder('Production Master Key').fill('Encrypted QA identity');await page.getByPlaceholder('-----BEGIN OPENSSH...').fill(encrypted);await page.getByPlaceholder('••••••••',{exact:true}).fill('wrong-passphrase');
    await page.getByRole('button',{name:'Securely Store Identity'}).click();await expect(page.getByText(/could not be read/).first()).toBeVisible();await expect(page.getByPlaceholder('Production Master Key')).toHaveValue('Encrypted QA identity');
    await page.getByPlaceholder('••••••••',{exact:true}).fill('actual-key-passphrase');await page.getByRole('button',{name:'Securely Store Identity'}).click();await expect(page.getByRole('heading',{name:'Encrypted QA identity'})).toBeVisible();
    expect((await api('/keys')).some((k:any)=>k.name==='Encrypted QA identity')).toBe(true);
});

test('SFTP location saves and edits credentials over HTTP',async({page})=>{
    await go(page,'Storage Locations');await page.getByRole('button',{name:'Add Location',exact:true}).click();await page.getByRole('button',{name:'SFTP Server',exact:true}).click();
    await page.getByPlaceholder('Production S3 Backup').fill('QA Storage Box');await page.getByPlaceholder('backup.example.com').fill('u123456.your-storagebox.de');await page.getByPlaceholder('22',{exact:true}).fill('23');await page.getByPlaceholder('backup_user').fill('u123456');await page.getByPlaceholder('/backups/production').fill('backups/source');await page.getByPlaceholder('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5...').fill(hostKey);await page.getByPlaceholder('-----BEGIN OPENSSH PRIVATE KEY-----').fill(key);
    await page.getByRole('dialog').getByRole('button',{name:'Add Location',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
    const saved=(await api('/locations')).find((l:any)=>l.name==='QA Storage Box');expect(saved.hasSecretKey).toBe(true);expect(saved.path).toBe('sftp://u123456@u123456.your-storagebox.de:23/backups/source');
    await page.getByRole('heading',{name:'QA Storage Box',exact:true}).locator('..').getByTitle('Edit',{exact:true}).click();await page.getByPlaceholder('Production S3 Backup').fill('Edited Storage Box');await page.getByRole('button',{name:'Update Location'}).click();await expect(page.getByRole('dialog')).toBeHidden();expect((await api('/locations')).find((l:any)=>l.id===saved.id).hasSecretKey).toBe(true);
});

test('create, edit with a redacted passphrase, inspect logs, and delete a backup job',async({page})=>{
    await go(page,'Backup Jobs');await page.getByRole('button',{name:'Create Job',exact:true}).click();await page.getByPlaceholder('Web Server Backup').fill('Daily QA backup');await page.getByRole('dialog').locator('select').nth(0).selectOption({index:1});await page.getByRole('dialog').locator('select').nth(1).selectOption({index:1});await page.getByPlaceholder('Required - Enter passphrase for encrypted repository').fill('disposable-repository-passphrase');
    await page.getByRole('button',{name:'Create Backup Plan'}).click();await expect(page.getByRole('dialog')).toBeHidden();
    const saved=(await api('/jobs')).find((j:any)=>j.name==='Daily QA backup');expect(saved.id).toBeTruthy();expect(saved.repoPassword).toBeUndefined();
    await page.getByTitle('Edit Job').click();await page.getByPlaceholder('Web Server Backup').fill('Edited QA backup');await page.getByRole('button',{name:'Update Job',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();expect((await api('/jobs')).find((j:any)=>j.id===saved.id).hasRepoPassword).toBe(true);
    await page.getByTitle('View Logs').click();await expect(page.getByRole('dialog',{name:'Job details'})).toBeVisible();await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);await page.getByRole('button',{name:'Close job details'}).click();
    await page.getByTitle('Delete',{exact:true}).click();await expect(page.getByRole('heading',{name:'Edited QA backup',exact:true})).toHaveCount(0);expect((await api('/jobs')).some((j:any)=>j.id===saved.id)).toBe(false);
});

test('settings load persisted configuration and reject failed saves',async({page})=>{
    await api('/config/ai_config','PUT',{value:{provider:'OpenAI Compatible',baseUrl:'https://api.openai.com/v1',model:'saved-model',apiKey:'disposable-provider-key'}});
    await page.reload();await page.locator('[data-app-content]').waitFor();await go(page,'Settings');await expect(page.locator('input').filter({visible:true})).not.toHaveCount(0);
    const model=page.getByPlaceholder('gpt-4o');await expect(model).toHaveValue('saved-model');
    await page.route('**/api/config/ai_config',route=>route.fulfill({status:500,json:{error:'Disposable save failure'}}));await model.fill('unsaved-model');await page.getByRole('button',{name:'Save Changes'}).click();await expect(page.getByRole('alert')).toContainText('Disposable save failure');expect((await api('/config/ai_config')).value.model).toBe('saved-model');await page.unroute('**/api/config/ai_config');
    await page.getByRole('button',{name:'Save Changes'}).click();await expect(page.getByText('Settings saved.',{exact:true})).toBeVisible();expect((await api('/config/ai_config')).value.model).toBe('unsaved-model');
    await page.getByRole('button',{name:'Database',exact:true}).click();await page.getByRole('button',{name:'Check Active Database',exact:true}).click();await expect(page.getByText(/active sqlite database answered/)).toBeVisible();
});

test('export fetches cold data; invalid import stays editable; valid import persists',async({page})=>{
    await go(page,'Settings');await page.getByRole('button',{name:'Data Management',exact:true}).click();const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Export Data'}).click();const download=await downloading;const stream=await download.createReadStream();let content='';for await(const part of stream!)content+=part.toString();const data=JSON.parse(content);expect(Array.isArray(data.systems)).toBe(true);expect(data.systems.length).toBeGreaterThan(0);expect(content).not.toContain('PRIVATE KEY');expect(content).not.toContain('disposable-provider-key');
    const input=page.getByPlaceholder('Paste exported JSON here...');await input.fill('invalid JSON');await page.getByRole('button',{name:'Import Data'}).click();await expect(page.getByRole('alert')).toContainText('valid exported JSON');await expect(input).toHaveValue('invalid JSON');
    data.systems[0].name='Persisted imported source';await input.fill(JSON.stringify(data));await page.getByRole('button',{name:'Import Data'}).click();await expect(page.getByRole('status')).toContainText('Configuration imported');expect((await api('/systems')).some((s:any)=>s.name==='Persisted imported source')).toBe(true);
});

test('managed enrollment, schedule, job queue, and revocation persist',async({page})=>{
    await go(page,'Managed Clients');await page.getByLabel('Client name').fill('Disposable Windows Client');await page.getByRole('button',{name:'Enroll',exact:true}).click();await expect(page.getByText('Save credentials now. Token displayed only once.')).toBeVisible();await page.getByRole('button',{name:"I've saved these credentials"}).click();await page.getByLabel('Backup schedule').selectOption('60');await page.getByRole('button',{name:'backup',exact:true}).click();await expect(page.getByText(/backup · Queued — waiting for the Windows agent/)).toBeVisible();
    await go(page,'Dashboard');const activity=page.getByRole('region',{name:'Windows client activity'});await expect(activity.getByText('Disposable Windows Client',{exact:true})).toBeVisible();await expect(activity.getByText('Awaiting setup',{exact:true})).toBeVisible();await expect(activity.getByText(/Queued — waiting for the Windows agent/)).toBeVisible();await activity.getByRole('button',{name:'Open Managed Clients'}).click();
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Disable',exact:true}).click();await expect(page.getByRole('button',{name:'backup',exact:true})).toBeDisabled();
});

test('navigation, filters, clipboard, and errors remain usable on mobile',async({page})=>{
    await go(page,'Systems');const search=page.getByRole('textbox',{name:'Search',exact:true});await search.fill('no-matching-source');await expect(page.getByTitle('Edit System')).toHaveCount(0);await search.fill('');
    await go(page,'Settings');await page.getByRole('button',{name:'SSO / Identity',exact:true}).click();await expect(page.getByRole('button',{name:/Custom OIDC/})).toBeDisabled();await page.getByRole('button',{name:/GitHub Enterprise/}).click();
    await page.getByRole('button',{name:'Open navigation menu'}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Navigation menu'})).toBeHidden();await page.setViewportSize({width:844,height:390});await go(page,'Systems');await page.getByRole('button',{name:'Register Node'}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
});

test('password change checks the old password and revokes older sessions; login errors do not reload',async({page})=>{
    await go(page,'Settings');await page.getByRole('button',{name:'Security',exact:true}).click();await page.getByLabel('Current password',{exact:true}).fill('wrong-password');await page.getByLabel('New password',{exact:true}).fill('Updated-Disposable-Password-123');await page.getByLabel('Confirm new password',{exact:true}).fill('Updated-Disposable-Password-123');await page.getByRole('button',{name:'Update Password',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Current password is incorrect');
    const oldToken=token;await page.getByLabel('Current password',{exact:true}).fill(password);await page.getByRole('button',{name:'Update Password',exact:true}).click();await expect(page.getByRole('status')).toContainText('Password updated');password='Updated-Disposable-Password-123';expect((await fetch(base+'/api/auth/me',{headers:{Authorization:`Bearer ${oldToken}`}})).status).toBe(401);
    await page.getByRole('button',{name:'Open navigation menu'}).click();await page.getByRole('button',{name:'Sign Out',exact:true}).click();await page.getByPlaceholder('admin@company.com').fill('ui@example.invalid');await page.getByPlaceholder('••••••••',{exact:true}).fill('wrong-password');await page.getByRole('button',{name:'Sign In',exact:true}).click();await expect(page.getByText('Invalid credentials',{exact:true})).toBeVisible();await expect(page.getByPlaceholder('admin@company.com')).toHaveValue('ui@example.invalid');
});

test('resource failures show retry rather than an empty successful listing',async({page})=>{
    await page.route('**/api/systems',route=>route.request().method()==='GET'?route.fulfill({status:503,json:{error:'Disposable systems outage'}}):route.fallback());
    await page.reload();await page.locator('[data-app-content]').waitFor();await go(page,'Systems');await expect(page.getByRole('alert').first()).toContainText('Disposable systems outage');await expect(page.getByText('No Systems Registered')).toHaveCount(0);await page.unroute('**/api/systems');await page.getByRole('button',{name:'Retry',exact:true}).first().click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByTitle('Edit System').first()).toBeVisible();
});

test('job rejection and live logs preserve server errors and use bearer authentication',async({page})=>{
    const source=(await api('/systems'))[0], destination=(await api('/locations'))[0];
    const job=await api('/jobs','POST',{name:'Stream test',tool:'Restic',sourceId:source.id,destinationId:destination.id,sourcePaths:['/data'],repoPassword:'dummy-passphrase',schedule:'0 2 * * *',priority:'Medium',status:'Idle',retention:{keepDaily:7}});
    let authenticated=false;
    await page.route('**/api/jobs',async route=>route.fulfill({json:[{...job,status:'Running'}]}));
    await page.route(`**/api/jobs/${job.id}/logs/stream`,async route=>{authenticated=route.request().headers().authorization===`Bearer ${token}`;await route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({type:'info',message:'Authenticated live event',timestamp:new Date().toISOString()})+'\n\n'})});
    await go(page,'Backup Jobs');await page.getByTitle('View Logs').click();await expect(page.getByText(/Authenticated live event/)).toBeVisible();expect(authenticated).toBe(true);await page.getByRole('button',{name:'Close job details'}).click();await page.unroute('**/api/jobs');await page.unroute(`**/api/jobs/${job.id}/logs/stream`);
    await api('/jobs/'+job.id,'DELETE');
});

test('source health, deployment rejection, deletion, storage checks and identity upload work',async({page})=>{
    const source=await api('/systems','POST',{name:'Disposable actions source',host:'actions.example.invalid',username:'backup',type:'remote'});
    await page.reload();await page.locator('[data-app-content]').waitFor();await go(page,'Systems');const card=page.getByRole('heading',{name:source.name,exact:true}).locator('../..');
    await card.getByTitle('Check Connection',{exact:true}).click();await expect(page.getByText(/host fingerprint|verified|identity|authentication/i).last()).toBeVisible();
    await card.getByRole('button',{name:'Deploy Toolset'}).click();const deployment=page.getByRole('dialog',{name:'Engine deployment'});await deployment.getByRole('button',{name:'Password',exact:true}).click();await page.getByPlaceholder('Enter password for remote server').fill('dummy-password');await deployment.getByRole('button',{name:'Start Deployment'}).click();await expect(deployment.getByRole('button',{name:'Close Terminal'})).toBeVisible();await expect(deployment.getByText(/failed|fingerprint|required/i).first()).toBeVisible();await deployment.getByRole('button',{name:'Close Terminal'}).click();
    await card.getByTitle('Delete System').click();await card.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('heading',{name:source.name,exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:/Identity Vault/}).click();await page.getByPlaceholder('Production Master Key').fill('Uploaded QA identity');await page.locator('input[type=file]').setInputFiles({name:'id_qa',mimeType:'text/plain',buffer:Buffer.from(key)});await page.getByRole('button',{name:'Securely Store Identity'}).click();await expect(page.getByRole('heading',{name:'Uploaded QA identity'})).toBeVisible();await page.getByRole('button',{name:'Delete identity Uploaded QA identity',exact:true}).click();await expect(page.getByRole('heading',{name:'Uploaded QA identity'})).toHaveCount(0);await page.getByRole('button',{name:'Close identity vault'}).click();
    const location=await api('/locations','POST',{name:'Disposable actions storage',type:'nfs',path:'/tmp/disposable-qa-directory'});await page.reload();await page.locator('[data-app-content]').waitFor();await go(page,'Storage Locations');const storage=page.getByRole('heading',{name:location.name,exact:true}).locator('..');await storage.getByRole('button',{name:'Test Connection',exact:true}).click();await expect(storage.getByText('failed',{exact:true})).toBeVisible();await storage.getByTitle('Delete',{exact:true}).click();await storage.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('heading',{name:location.name,exact:true})).toHaveCount(0);
});

test('SSO settings validate credentials, copy callback over HTTP, and persist sign-in mode',async({page})=>{
    await go(page,'Settings');await page.getByRole('button',{name:'SSO / Identity'}).click();await page.getByLabel('Sign-in method').selectOption('sso');await page.getByRole('button',{name:'Save Changes'}).click();await expect(page.getByRole('alert')).toContainText('Select GitHub');
    await page.getByRole('button',{name:/GitHub Enterprise/}).click();await page.getByPlaceholder('oauth-client-id').fill('disposable-client-id');await page.getByPlaceholder('••••••••',{exact:true}).fill('disposable-client-secret');
    let copied=false;await page.evaluate(()=>{const original=document.execCommand.bind(document);document.execCommand=((command:string,...args:any[])=>{if(command==='copy'){(window as any).__copied=true;return true}return (original as any)(command,...args)}) as any});await page.getByRole('button',{name:'Copy redirect URI'}).click();copied=await page.evaluate(()=>(window as any).__copied===true);expect(copied).toBe(true);
    await page.getByRole('button',{name:'Save Changes'}).click();await expect(page.getByText('Settings saved.',{exact:true})).toBeVisible();expect((await api('/config/auth_mode')).value).toBe('sso');await page.getByLabel('Sign-in method').selectOption('local');await page.getByRole('button',{name:'Save Changes'}).click();await expect(page.getByText('Settings saved.',{exact:true})).toBeVisible();expect((await api('/config/auth_mode')).value).toBe('local');
});

test('restore retries snapshot and file listings, validates paths, and submits selected files',async({page})=>{
    const source=(await api('/systems'))[0],destination=(await api('/locations'))[0];const job=await api('/jobs','POST',{name:'Restore interface test',tool:'Restic',sourceId:source.id,destinationId:destination.id,sourcePaths:['/data'],repoPassword:'dummy-passphrase',schedule:'0 2 * * *',priority:'Medium'});
    const prefix=`**/api/jobs/${job.id}`;let snapshotAttempts=0,fileAttempts=0;let payload:any;
    await page.route(prefix+'/snapshots',route=>++snapshotAttempts===1?route.fulfill({status:503,json:{error:'Disposable snapshot outage'}}):route.fulfill({json:[{id:'snapshot-id',shortId:'abc123',time:'2026-10-31T10:00:00Z',paths:['/data']}]}));
    await page.route(prefix+'/snapshots/snapshot-id/files',route=>++fileAttempts===1?route.fulfill({status:503,json:{error:'Disposable file outage'}}):route.fulfill({json:[{path:'/data/example.txt',type:'file',size:123}]}));
    await page.route(prefix+'/restore',route=>{payload=route.request().postDataJSON();return route.fulfill({json:{success:true,logs:[{type:'success',message:'Controlled restore completed'}]}})});
    await page.reload();await page.locator('[data-app-content]').waitFor();await go(page,'Backup Jobs');const card=page.getByRole('heading',{name:job.name,exact:true}).locator('xpath=ancestor::div[contains(@class,"group")][1]');await card.getByTitle('Restore',{exact:true}).click();const modal=page.getByRole('dialog',{name:'Restore backup'});await expect(modal.getByRole('alert')).toContainText('snapshot outage');await modal.getByRole('button',{name:'Retry snapshots'}).click();await modal.getByRole('button',{name:/abc123/}).click();await page.getByPlaceholder('/tmp/restored_files').fill('/');await expect(modal.getByRole('button',{name:'Start Restore'})).toBeDisabled();await page.getByPlaceholder('/tmp/restored_files').fill('/tmp/disposable-restore');await modal.getByRole('button',{name:'Specific Files'}).click();await expect(modal.getByRole('alert')).toContainText('file list');await modal.getByRole('button',{name:'Retry files'}).click();await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'Start Restore'}).click();await expect(modal.getByText('Your files have been restored to the target directory.')).toBeVisible();expect(payload.paths).toEqual(['/data/example.txt']);expect(payload.systemId).toBe(source.id);await modal.getByRole('button',{name:'Close',exact:true}).click();await api('/jobs/'+job.id,'DELETE');
});

test('all pages fit phone, landscape, tablet and desktop viewports without horizontal overflow',async({page})=>{
    for(const viewport of [{width:320,height:568},{width:844,height:390},{width:768,height:1024},{width:1440,height:900}]){
        await page.setViewportSize(viewport);
        for(const view of ['Dashboard','Systems','Storage Locations','Backup Jobs','Managed Clients','Settings']){
            await go(page,view);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow,`${view} at ${viewport.width}px`).toBe(false);
        }
    }
});

test('startup outages show a retry without offering new server setup',async({page})=>{
    await page.route('**/api/status',route=>route.fulfill({status:503,json:{error:'Temporary outage'}}));await page.reload();await expect(page.getByRole('alert')).toContainText('controller is unavailable');await expect(page.getByText('Persistent Storage Core')).toHaveCount(0);await page.unroute('**/api/status');await page.route('**/api/status',route=>route.fulfill({json:{dbInitialized:false,setupComplete:false}}));await page.getByRole('button',{name:'Retry connection'}).click();await expect(page.getByRole('alert')).toContainText('database is unavailable');await page.unroute('**/api/status');await page.getByRole('button',{name:'Retry connection'}).click();await expect(page.locator('[data-app-content]')).toBeVisible();
});

test('clearing the browser session signs out and preserves server records',async({page})=>{
    const before=(await api('/systems')).length;await go(page,'Settings');await page.getByRole('button',{name:'Data Management'}).click();await page.getByRole('button',{name:'Clear Browser Session'}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('button',{name:'Clear Browser Session'})).toBeVisible();await page.getByRole('button',{name:'Clear Browser Session'}).click();await page.getByRole('button',{name:'Confirm Sign Out'}).click();await expect(page.getByRole('button',{name:'Sign In',exact:true})).toBeVisible();const session=await api('/auth/login','POST',{email:'ui@example.invalid',password});token=session.token;user=session.user;expect((await api('/systems')).length).toBe(before);
});

test('mobile setup scrolls through every step and waits for initialization errors',async({page})=>{
    // The first-run API is independently covered by backend tests. This fixture exercises wizard states.
    await page.route('**/api/status',route=>route.fulfill({json:{dbInitialized:true,setupComplete:false,dbType:'sqlite'}}));await page.reload();await expect(page.getByText('Persistent Storage Core')).toBeVisible();await page.getByRole('button',{name:'Configure Identity'}).click();await page.getByRole('button',{name:/Local Email & Password/}).click();await page.getByPlaceholder('Admin User').fill('Setup Administrator');await page.getByPlaceholder('admin@company.com').fill('setup@example.invalid');await page.getByPlaceholder('Min 12 characters').fill('Disposable-Setup-Password-123');await page.getByPlaceholder('••••••••',{exact:true}).fill('Disposable-Setup-Password-123');
    await page.getByRole('button',{name:'Configure Systems'}).click();await page.getByRole('button',{name:/Vault/}).click();await page.getByRole('button',{name:'Configure AI'}).click();await page.getByRole('button',{name:'Final Preparation'}).click();await page.getByLabel('One-time server bootstrap token').fill('disposable-bootstrap-token-1234567890');
    await page.route('**/api/config/setup',async route=>{await new Promise(r=>setTimeout(r,100));await route.fulfill({status:403,json:{error:'Invalid one-time bootstrap token'}})});await page.getByRole('button',{name:'Enter Command Center'}).click();await expect(page.getByRole('alert')).toContainText('Invalid one-time bootstrap token');await expect(page.getByRole('button',{name:'Enter Command Center'})).toBeEnabled();await expect(page.getByLabel('One-time server bootstrap token')).toHaveValue('disposable-bootstrap-token-1234567890');
});

test('automatic UTC schedules require stored credentials and remain opt-in',async({page})=>{
    const source=(await api('/systems'))[0],destination=(await api('/locations'))[0];const job=await api('/jobs','POST',{name:'Schedule opt-in test',tool:'Restic',sourceId:source.id,destinationId:destination.id,sourcePaths:['/data'],repoPassword:'dummy-passphrase',schedule:'0 0 1 1 *',priority:'Medium'});expect(job.scheduleEnabled).toBe(false);
    await page.reload();await page.locator('[data-app-content]').waitFor();await go(page,'Backup Jobs');const card=page.getByRole('heading',{name:job.name,exact:true}).locator('xpath=ancestor::div[contains(@class,"group")][1]');await card.getByTitle('Edit Job').click();await page.getByRole('checkbox',{name:/Run automatically/}).check();await page.getByRole('button',{name:'Update Job',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('saved SSH identity');expect((await api('/jobs')).find((j:any)=>j.id===job.id).scheduleEnabled).toBe(false);await page.getByRole('checkbox',{name:/Run automatically/}).uncheck();await page.getByRole('button',{name:'Update Job',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();await api('/jobs/'+job.id,'DELETE');
});

test('run buttons, dashboard actions and job filters use real controller state',async({page})=>{
    const source=(await api('/systems'))[0],destination=(await api('/locations'))[0];const create=(name:string)=>api('/jobs','POST',{name,tool:'Restic',sourceId:source.id,destinationId:destination.id,sourcePaths:['/data'],repoPassword:'dummy-passphrase',schedule:'0 2 * * *',priority:'Medium'});const one=await create('Run button test'),two=await create('Dashboard run test');
    await page.reload();await page.locator('[data-app-content]').waitFor();await go(page,'Backup Jobs');const card=page.getByRole('heading',{name:one.name,exact:true}).locator('xpath=ancestor::div[contains(@class,"group")][1]');await card.getByTitle('Run Now').click();await expect.poll(async()=>(await api('/jobs')).find((j:any)=>j.id===one.id).status).toBe('Failed');await expect(card.getByText('Failed',{exact:true})).toBeVisible();await card.getByTitle('View Logs').click();await expect(page.getByRole('dialog').getByText(/SSH|configuration|fingerprint/i).first()).toBeVisible();await page.getByRole('button',{name:'Close job details'}).click();
    await page.getByRole('button',{name:'Filters',exact:true}).click();await page.getByPlaceholder('Search jobs...').fill('Run button');await expect(page.getByRole('heading',{name:two.name,exact:true})).toHaveCount(0);await page.getByPlaceholder('Search jobs...').fill('');await go(page,'Dashboard');await page.getByRole('button',{name:/Run Idle Jobs/}).click();await expect.poll(async()=>(await api('/jobs')).find((j:any)=>j.id===two.id).status).toBe('Failed');await page.getByRole('button',{name:/Check Health/}).click();await expect(page.getByRole('button',{name:/Check Health/})).toBeEnabled();await api('/jobs/'+one.id,'DELETE');await api('/jobs/'+two.id,'DELETE');
});
