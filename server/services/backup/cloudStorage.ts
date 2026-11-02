import type {BackupJobConfig} from './types.js';

/** Import only the selected, authenticated Drive remote; never execute config hooks. */
export function driveConfig(target:string, text:string|undefined):string {
    const match=/^([A-Za-z][A-Za-z0-9_-]{0,63}):([^\u0000-\u001f\u007f]*)$/.exec(target);
    if(!match || match[2].split('/').includes('..')) throw new Error('Enter a Google Drive target as remote:folder/path');
    if(!text || text.length>16384 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error('Import an authenticated, unencrypted Rclone config (maximum 16 KB)');
    const allowed=new Set(['type','client_id','client_secret','scope','token','root_folder_id','team_drive']);
    const values:Record<string,string>={};
    let selected=false,found=false;
    for(const raw of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
        const line=raw.trim();
        if(!line || line.startsWith('#') || line.startsWith(';'))continue;
        const section=/^\[([^\]]+)\]$/.exec(line);
        if(section){selected=section[1]===match[1];if(selected){if(found)throw new Error('Duplicate Rclone remote');found=true}continue}
        if(!selected)continue;
        const entry=/^([a-z_]+)\s*=\s*(.*)$/.exec(line);
        // Rclone may persist an empty service-account prompt in an OAuth remote.
        if(entry?.[1]==='service_account_file' && entry[2]==='')continue;
        if(!entry || !allowed.has(entry[1]) || Object.hasOwn(values,entry[1]))throw new Error('The Drive remote contains unsupported settings. Import a standard OAuth Google Drive remote without commands or external credential files');
        values[entry[1]]=entry[2];
    }
    if(values.type!=='drive')throw new Error('The selected Rclone remote must use type = drive');
    try{const token=JSON.parse(values.token);if(typeof token.refresh_token!=='string'||!token.refresh_token)throw new Error()}
    catch{throw new Error('Authorize this Google Drive remote in Rclone first; an OAuth refresh token is required')}
    return `[${match[1]}]\n`+Object.entries(values).map(([key,value])=>`${key} = ${value}\n`).join('');
}

export function azureRepository(config:Pick<BackupJobConfig,'destinationPath'|'destinationRegion'|'destinationAccessKey'|'destinationSecretKey'>):string{
    if(!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(config.destinationPath)||config.destinationPath.includes('--'))throw new Error('Enter a valid Azure container name (3–63 lowercase letters, numbers or hyphens)');
    if(!/^[a-z0-9]{3,24}$/.test(config.destinationAccessKey||''))throw new Error('Enter the Azure storage account name');
    if(!/^[A-Za-z0-9+/]{40,}={0,2}$/.test(config.destinationSecretKey||'') || (config.destinationSecretKey?.length||0)>512)throw new Error('Enter the Azure storage account key');
    const prefix=config.destinationRegion||'';
    if(prefix.length>1024 || /[\u0000-\u001f\u007f]/.test(prefix) || prefix.split('/').includes('..'))throw new Error('Invalid Azure repository folder');
    return `azure:${config.destinationPath}:/${prefix.replace(/^\/+|\/+$/g,'')}`;
}
