import crypto from 'node:crypto';
import {getConfig,saveConfig} from '../db/config.js';
import {seal,open} from '../security/credentialEnvelope.js';
import {gcsCredentials,rcloneConfig} from './backup/cloudStorage.js';
import {getLocation,replaceLocationSecret,type Location} from '../db/locations.js';

export type CloudProvider='gdrive'|'gcs'|'onedrive';
type Client={clientId:string;clientSecret:string};
type Settings={origin:string;google:Client;microsoft:Client};
export const cloudProvider=(value:string):value is CloudProvider=>['gdrive','gcs','onedrive'].includes(value);
const blank=():Settings=>({origin:'',google:{clientId:'',clientSecret:''},microsoft:{clientId:'',clientSecret:''}});
export const oauthSettings=async()=>await getConfig<Settings>('storage_oauth')||blank();
export const callbackURL=(origin:string,provider:CloudProvider)=>origin+'/api/storage-oauth/callback/'+provider;
export async function publicOAuthSettings(){
    const value=await oauthSettings();
    const redacted=(client:Client)=>({clientId:client.clientId,hasClientSecret:!!client.clientSecret,configured:!!(value.origin&&client.clientId&&client.clientSecret)});
    return {origin:value.origin,google:redacted(value.google),microsoft:redacted(value.microsoft),callbacks:Object.fromEntries((['gdrive','gcs','onedrive'] as const).map(p=>[p,value.origin?callbackURL(value.origin,p):'']))};
}
const safe=(value:unknown,max=4096):value is string=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
export async function saveOAuthSettings(input:any){
    let origin:URL;
    try{origin=new URL(input?.origin);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error()}
    catch{throw new Error('Enter the trusted HTTPS dashboard origin, without a path')}
    const previous=await oauthSettings();
    const value:Settings={origin:origin.origin,google:{...previous.google},microsoft:{...previous.microsoft}};
    for(const provider of ['google','microsoft'] as const){
        const incoming=input[provider];
        if(incoming===undefined)continue;
        if(!incoming||typeof incoming!=='object')throw new Error('Invalid OAuth app settings');
        if(incoming.clientId!==undefined){
            if(!safe(incoming.clientId,512))throw new Error('Invalid OAuth client ID');
            const next=incoming.clientId.trim();
            if(next!==value[provider].clientId&&!incoming.clientSecret)value[provider].clientSecret='';
            value[provider].clientId=next;
        }
        if(incoming.clientSecret!==undefined&&incoming.clientSecret!==''){
            if(!safe(incoming.clientSecret)||!incoming.clientSecret)throw new Error('Invalid OAuth client secret');
            value[provider].clientSecret=incoming.clientSecret;
        }
        if(provider==='google'&&value.google.clientId&&!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(value.google.clientId))throw new Error('Enter a Google Web application client ID');
        if(provider==='microsoft'&&value.microsoft.clientId&&!/^[0-9a-f-]{36}$/i.test(value.microsoft.clientId))throw new Error('Enter a Microsoft application client ID');
    }
    await saveConfig('storage_oauth',value);
    return publicOAuthSettings();
}

const GOOGLE_TOKEN='https://oauth2.googleapis.com/token';
const MICROSOFT_TOKEN='https://login.microsoftonline.com/common/oauth2/v2.0/token';
const scopes:Record<CloudProvider,string>={gdrive:'https://www.googleapis.com/auth/drive',gcs:'https://www.googleapis.com/auth/devstorage.read_write',onedrive:'offline_access https://graph.microsoft.com/Files.ReadWrite'};
type Flow={owner:string;provider:CloudProvider;expires:number;nonceHash:string;verifier:string;client:Client;redirect:string;status:'pending'|'ready'|'failed';credential?:string;error?:string};
// A controller restart expires unfinished logins. Saved locations remain in the database.
const flows=new Map<string,Flow>();
const hash=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
const prune=()=>{for(const [id,flow] of flows)if(flow.expires<Date.now())flows.delete(id)};
export async function beginCloudLogin(provider:CloudProvider,owner:string,requestOrigin:string){
    prune();
    const settings=await oauthSettings(),client=provider==='onedrive'?settings.microsoft:settings.google;
    if(!settings.origin||!client.clientId||!client.clientSecret)throw new Error('Configure the provider OAuth app under Cloud sign-in setup first');
    if(settings.origin!==requestOrigin)throw new Error('Open the dashboard at '+settings.origin+' to sign in');
    for(const [id,flow] of flows)if(flow.owner===owner&&flow.provider===provider)flows.delete(id);
    if(flows.size>=128)throw new Error('Too many pending cloud sign-ins. Try again shortly');
    const id=crypto.randomBytes(32).toString('base64url'),nonce=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
    const redirect=callbackURL(settings.origin,provider);
    flows.set(id,{owner,provider,expires:Date.now()+10*60_000,nonceHash:hash(nonce),verifier,client:{...client},redirect,status:'pending'});
    const url=new URL(provider==='onedrive'?'https://login.microsoftonline.com/common/oauth2/v2.0/authorize':'https://accounts.google.com/o/oauth2/v2/auth');
    Object.entries({client_id:client.clientId,redirect_uri:redirect,response_type:'code',scope:scopes[provider],state:id,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',...(provider==='onedrive'?{response_mode:'query',prompt:'select_account'}:{access_type:'offline',prompt:'consent'})}).forEach(([key,value])=>url.searchParams.set(key,value));
    return {id,nonce,url:url.toString()};
}
async function jsonRequest(url:string,init:RequestInit):Promise<any>{
    const response=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(15_000)});
    if(!response.ok)throw new Error('The provider rejected authorization. Check the app registration, permissions and callback URL, then sign in again');
    return response.json();
}
function currentFlow(id:string,owner?:string){
    prune();const flow=flows.get(id);
    if(!flow||owner!==undefined&&flow.owner!==owner)throw new Error('Cloud sign-in expired. Start sign-in again');
    return flow;
}
export function cloudLoginStatus(id:string,owner:string){const flow=currentFlow(id,owner);return {status:flow.status,provider:flow.provider,...(flow.error?{error:flow.error}:{})}}
export async function completeCloudLogin(provider:CloudProvider,id:string,nonce:string,code:string,denied=false){
    const flow=currentFlow(id);
    if(flow.provider!==provider||flow.status!=='pending'||!crypto.timingSafeEqual(Buffer.from(hash(nonce)),Buffer.from(flow.nonceHash)))throw new Error('Invalid cloud sign-in session. Start sign-in again in this browser');
    // Claim before exchanging the single-use authorization code; replay cannot race.
    flow.status='failed';flow.error='Authorization did not finish. Start sign-in again';
    if(denied)return;
    try{
        if(!safe(code,8192)||!code)throw new Error('Missing authorization code');
        const token=await jsonRequest(provider==='onedrive'?MICROSOFT_TOKEN:GOOGLE_TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:flow.client.clientId,client_secret:flow.client.clientSecret,redirect_uri:flow.redirect,code,code_verifier:flow.verifier})});
        if(!safe(token.access_token,8192)||!token.access_token||!safe(token.refresh_token,8192)||!token.refresh_token)throw new Error('The provider did not grant offline access. Reconnect and approve access for unattended backups');
        const expiry=new Date(Date.now()+Math.min(86400,Math.max(1,Number(token.expires_in)||3600))*1000).toISOString();
        let credential:string;
        if(provider==='gcs')credential=gcsCredentials(JSON.stringify({type:'authorized_user',client_id:flow.client.clientId,client_secret:flow.client.clientSecret,refresh_token:token.refresh_token}));
        else{
            let extra='';
            if(provider==='onedrive'){
                const drive=await jsonRequest('https://graph.microsoft.com/v1.0/me/drive?$select=id,driveType',{headers:{Authorization:'Bearer '+token.access_token}});
                if(!safe(drive.id,256)||!['personal','business','documentLibrary'].includes(drive.driveType))throw new Error('A usable OneDrive was not found for this account');
                extra=`drive_id = ${drive.id}\ndrive_type = ${drive.driveType}\n`;
            }else extra='scope = drive\n';
            credential=rcloneConfig(provider,'fortress:FortressBackup',`[fortress]\ntype = ${provider==='gdrive'?'drive':'onedrive'}\nclient_id = ${flow.client.clientId}\nclient_secret = ${flow.client.clientSecret}\ntoken = ${JSON.stringify({access_token:token.access_token,token_type:'Bearer',refresh_token:token.refresh_token,expiry})}\n${extra}`);
        }
        flow.credential=seal(credential);flow.status='ready';delete flow.error;
    }catch(error){
        flow.error=error instanceof Error&&/offline access|usable OneDrive|provider rejected/.test(error.message)?error.message:'Cloud authorization failed. Check the provider registration and try again';
    }
}
export function cloudLoginCredential(id:string,owner:string,provider:string){
    const flow=currentFlow(id,owner);
    if(flow.provider!==provider||flow.status!=='ready'||!flow.credential)throw new Error('Finish cloud sign-in for this storage provider first');
    return open(flow.credential);
}
export function forgetCloudLogin(id:string,owner:string){currentFlow(id,owner);flows.delete(id)}

// Keep the controller's OneDrive refresh token current too: SSH operations use
// temporary Rclone configs, while Windows keeps its own protected runtime file.
const refreshing=new Map<string,Promise<Location>>();
export async function readyCloudLocation(location:Location):Promise<Location>{
    if(location.type!=='onedrive')return location;
    const pending=refreshing.get(location.id);if(pending)return pending;
    const task=(async()=>{
        const latest=await getLocation(location.id)||location;
        if(latest.type!=='onedrive')return latest;
        const config=rcloneConfig('onedrive',latest.path,latest.secret_key);
        const field=(key:string)=>new RegExp('^'+key+' = (.*)$','m').exec(config)?.[1];
        const token=JSON.parse(field('token')!),clientId=field('client_id'),clientSecret=field('client_secret');
        // Imported remotes may use Rclone's own registered app; Rclone refreshes those.
        if(!clientId||!clientSecret||Date.parse(token.expiry)>Date.now()+60_000)return latest;
        const next=await jsonRequest(MICROSOFT_TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:clientId,client_secret:clientSecret,refresh_token:token.refresh_token,scope:scopes.onedrive})});
        if(!safe(next.access_token,8192)||!next.access_token||next.refresh_token!==undefined&&(!safe(next.refresh_token,8192)||!next.refresh_token))throw new Error('OneDrive authorization expired. Sign in again under Storage Locations');
        const updated={access_token:next.access_token,token_type:'Bearer',refresh_token:next.refresh_token||token.refresh_token,expiry:new Date(Date.now()+Math.min(86400,Math.max(1,Number(next.expires_in)||3600))*1000).toISOString()};
        const credential=config.replace(/^token = .*$/m,()=> 'token = '+JSON.stringify(updated));
        if(await replaceLocationSecret(latest.id,latest.secret_key!,credential))return {...latest,secret_key:credential};
        const current=await getLocation(latest.id);if(!current)throw new Error('The storage location was removed');return current;
    })();
    refreshing.set(location.id,task);
    try{return await task}finally{refreshing.delete(location.id)}
}
