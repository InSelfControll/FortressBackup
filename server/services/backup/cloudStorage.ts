import {createPrivateKey} from 'node:crypto';
import type {BackupJobConfig} from './types.js';

/** Import only the selected, authenticated Drive remote; never execute config hooks. */
export function rcloneConfig(type:'gdrive'|'onedrive',target:string, text:string|undefined):string {
    const match=/^([A-Za-z][A-Za-z0-9_-]{0,63}):([^\u0000-\u001f\u007f]*)$/.exec(target);
    if(!match || match[2].split('/').includes('..')) throw new Error('Enter a cloud drive target as remote:folder/path');
    if(!text || text.length>16384 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error('Import an authenticated, unencrypted Rclone config (maximum 16 KB)');
    const allowed=new Set(type==='gdrive'?['type','client_id','client_secret','scope','token','root_folder_id','team_drive']:['type','client_id','client_secret','token','drive_id','drive_type','root_folder_id','region','access_scopes','tenant']);
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
        if(type==='gdrive' && entry?.[1]==='service_account_file' && entry[2]==='')continue;
        if(!entry || !allowed.has(entry[1]) || Object.hasOwn(values,entry[1]))throw new Error('The cloud remote contains unsupported settings. Import a standard OAuth remote without commands or external credential files');
        values[entry[1]]=entry[2];
    }
    if(values.type!==(type==='gdrive'?'drive':'onedrive'))throw new Error('The selected Rclone remote has the wrong storage type');
    if(type==='onedrive' && (!/^[A-Za-z0-9!._-]{1,256}$/.test(values.drive_id||'') || !['personal','business','documentLibrary'].includes(values.drive_type)))throw new Error('OneDrive requires its drive ID and drive type');
    try{const token=JSON.parse(values.token);if(typeof token.refresh_token!=='string'||!token.refresh_token)throw new Error()}
    catch{throw new Error('Authorize this cloud remote first; an OAuth refresh token is required')}
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

export const driveConfig=(target:string,text:string|undefined)=>rcloneConfig('gdrive',target,text);

/** Only standard Google credentials: external-account executable/URL plugins are excluded. */
export function gcsCredentials(text:string|undefined):string{
    let value:any;
    try{if(!text || text.length>16384)throw new Error();value=JSON.parse(text)}catch{throw new Error('Import a Google Cloud service account JSON key or sign in with Google')}
    if(!value || typeof value!=='object' || Array.isArray(value) || (value.token_uri && value.token_uri!=='https://oauth2.googleapis.com/token') || (value.universe_domain && value.universe_domain!=='googleapis.com'))throw new Error('Unsupported Google Cloud credential configuration');
    const nonempty=(key:string)=>typeof value[key]==='string' && !!value[key] && !/[\u0000-\u001f\u007f]/.test(value[key]);
    if(value.type==='service_account'){
        if(!nonempty('project_id') || !nonempty('client_email') || !/^[^@\s]+@[^@\s]+\.gserviceaccount\.com$/.test(value.client_email) || typeof value.private_key!=='string')throw new Error('The Google service account key is incomplete');
        try{if(createPrivateKey(value.private_key).asymmetricKeyType!=='rsa')throw new Error()}catch{throw new Error('The Google service account private key is invalid')}
        return JSON.stringify({type:value.type,project_id:value.project_id,private_key_id:value.private_key_id,private_key:value.private_key,client_email:value.client_email,client_id:value.client_id,token_uri:'https://oauth2.googleapis.com/token'});
    }
    if(value.type==='authorized_user' && ['client_id','client_secret','refresh_token'].every(nonempty))return JSON.stringify({type:value.type,client_id:value.client_id,client_secret:value.client_secret,refresh_token:value.refresh_token,token_uri:'https://oauth2.googleapis.com/token'});
    throw new Error('Use a Google service account key or browser sign-in credentials');
}
export function gcsRepository(config:Pick<BackupJobConfig,'destinationPath'|'destinationRegion'|'destinationSecretKey'>):string{
    const bucket=config.destinationPath,prefix=config.destinationRegion||'';
    if(!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)||bucket.includes('..')||/^\d+\.\d+\.\d+\.\d+$/.test(bucket))throw new Error('Enter a valid Google Cloud Storage bucket name');
    if(prefix.length>1024||/[\u0000-\u001f\u007f]/.test(prefix)||prefix.split('/').includes('..'))throw new Error('Invalid Google Cloud repository folder');
    gcsCredentials(config.destinationSecretKey);
    return `gs:${bucket}:/${prefix.replace(/^\/+|\/+$/g,'')}`;
}
