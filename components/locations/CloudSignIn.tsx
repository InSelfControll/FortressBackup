import React,{useEffect,useRef,useState} from 'react';
import {apiFetch,requireData} from '../../client/api/client';

type Provider='gdrive'|'gcs'|'onedrive';
type Client={clientId:string;hasClientSecret:boolean;configured:boolean};
type Settings={origin:string;google:Client;microsoft:Client;callbacks:Record<Provider,string>};
const inputClass='w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white';
export function CloudSignIn({provider,readyId,onReady,onReset}:{provider:Provider;readyId:string|null;onReady:(id:string)=>void;onReset:()=>void}){
 const [settings,setSettings]=useState<Settings|null>(null),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const [origin,setOrigin]=useState(()=>typeof window!=='undefined'&&window.location.protocol==='https:'?window.location.origin:''),[clientId,setClientId]=useState(''),[secret,setSecret]=useState('');
 const [setupOpen,setSetupOpen]=useState(false),[saving,setSaving]=useState(false);
 const flow=useRef<string|null>(null),poll=useRef<ReturnType<typeof setInterval>|null>(null),mounted=useRef(true),polling=useRef(false);
 const popupRef=useRef<Window|null>(null),attempt=useRef(0);
 const providerKey=provider==='onedrive'?'microsoft':'google',name=providerKey==='google'?'Google':'Microsoft';
 useEffect(()=>{
  mounted.current=true;
  apiFetch<Settings>('/storage-oauth/settings').then(requireData).then(value=>{if(mounted.current){setSettings(value);setOrigin(value.origin||(window.location.protocol==='https:'?window.location.origin:''));setClientId(value[providerKey].clientId)}}).catch(e=>{if(mounted.current)setError(e.message)});
  return ()=>{mounted.current=false;attempt.current++;popupRef.current?.close();if(poll.current)clearInterval(poll.current);if(flow.current)void apiFetch('/storage-oauth/flows/'+flow.current,{method:'DELETE'})};
 },[providerKey]);
 useEffect(()=>{if(!readyId&&!busy&&flow.current){void apiFetch('/storage-oauth/flows/'+flow.current,{method:'DELETE'});flow.current=null;setStatus('')}},[readyId,busy]);
 const cancel=()=>{attempt.current++;if(poll.current)clearInterval(poll.current);if(flow.current)void apiFetch('/storage-oauth/flows/'+flow.current,{method:'DELETE'});flow.current=null;popupRef.current?.close();setBusy(false);setStatus('Sign-in canceled.');onReset()};
 const saveSettings=async()=>{
  setSaving(true);setError('');
  try{const value=requireData(await apiFetch<Settings>('/storage-oauth/settings',{method:'PUT',body:JSON.stringify({origin,[providerKey]:{clientId,clientSecret:secret||undefined}})}));setSettings(value);setSecret('');setStatus('Sign-in setup saved. Register the callback URLs below in your provider app.');}
  catch(e){setError(e instanceof Error?e.message:'Could not save sign-in settings')}finally{setSaving(false)}
 };
 const connect=async()=>{
  onReset();setError('');setStatus('');
  if(!settings?.[providerKey].configured){setSetupOpen(true);setError('Configure the OAuth app below before signing in.');return}
  if(window.location.origin!==settings.origin){setError('Open the HTTPS dashboard at '+settings.origin+' to sign in.');return}
  const popup=window.open('about:blank','fortress-cloud-signin','popup,width=620,height=760');
  if(!popup){setError('Allow pop-ups for this dashboard, then try sign-in again.');return}
  popupRef.current=popup;const currentAttempt=++attempt.current;
  setBusy(true);
  try{
   if(poll.current)clearInterval(poll.current);
   if(flow.current)void apiFetch('/storage-oauth/flows/'+flow.current,{method:'DELETE'});
   const started=requireData(await apiFetch<{id:string;url:string}>('/storage-oauth/'+provider+'/start',{method:'POST',body:'{}'}));
   if(!mounted.current||attempt.current!==currentAttempt){popup.close();void apiFetch('/storage-oauth/flows/'+started.id,{method:'DELETE'});return}
   flow.current=started.id;popup.location.href=started.url;setStatus('Finish signing in in the provider window.');
   const deadline=Date.now()+10*60_000;
   poll.current=setInterval(async()=>{
    if(polling.current||!mounted.current||attempt.current!==currentAttempt)return;
    polling.current=true;
    try{
     if(Date.now()>deadline)throw new Error('Sign-in expired. Please start again.');
     const value=requireData(await apiFetch<{status:string;provider:string;error?:string}>('/storage-oauth/flows/'+started.id));
     if(!mounted.current||attempt.current!==currentAttempt)return;
     if(value.status==='failed')throw new Error(value.error||'Sign-in did not finish. Try again.');
     if(value.status==='ready'){
      if(value.provider!==provider)throw new Error('The sign-in provider changed. Start again.');
      if(poll.current)clearInterval(poll.current);setBusy(false);setStatus('Account connected. Save this location to apply the connection.');onReady(started.id);popup.close();
     }
    }catch(e){if(attempt.current===currentAttempt){if(poll.current)clearInterval(poll.current);if(mounted.current){setBusy(false);setStatus('');setError(e instanceof Error?e.message:'Sign-in failed')}}}finally{polling.current=false}
   },1500);
  }catch(e){popup.close();if(mounted.current&&attempt.current===currentAttempt){setBusy(false);setError(e instanceof Error?e.message:'Could not start sign-in')}}
 };
 return <div className="space-y-3 rounded-xl border border-slate-700 p-4">
  <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy} onClick={connect} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy?'Waiting for sign-in...':'Sign in with '+name}</button>{busy&&<button type="button" onClick={cancel} className="text-sm text-slate-300 underline">Cancel sign-in</button>}<button type="button" onClick={()=>setSetupOpen(!setupOpen)} className="text-sm text-indigo-300 underline">Cloud sign-in setup</button></div>
  <p className="text-xs text-slate-400">Sign in on {name}’s website. Fortress never asks for your account password.</p>
  {status&&<p role="status" className="text-sm text-emerald-300">{status}</p>}
  {error&&<p role="alert" className="text-sm text-rose-300">{error}</p>}
  {settings?.origin&&typeof window!=='undefined'&&window.location.origin!==settings.origin&&<a className="block text-sm text-indigo-300 underline" href={settings.origin}>Open the HTTPS dashboard</a>}
  {setupOpen&&<div className="space-y-3 border-t border-slate-700 pt-4">
   <h4 className="font-semibold text-white">Set up {name} sign-in once</h4>
   <p className="text-xs text-slate-400">Create a Web application in {name==='Google'?'Google Cloud Console':'Microsoft Entra app registrations'}, register these callback URLs, then enter its client ID and secret. {name==='Google'?'Enable Google Drive API or Cloud Storage API and configure the OAuth consent screen.':'Choose work/school and personal accounts and delegated Files.ReadWrite plus offline_access permissions.'}</p>
   <a href={name==='Google'?'https://developers.google.com/identity/protocols/oauth2/web-server':'https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app'} target="_blank" rel="noreferrer" className="text-xs text-indigo-300 underline">{name} registration instructions</a>
   <label className="block text-sm text-slate-300">HTTPS dashboard origin<input aria-label="HTTPS dashboard origin" value={origin} onChange={e=>setOrigin(e.target.value)} className={inputClass} placeholder="https://backup.example.com" /></label>
   {(providerKey==='google'?['gdrive','gcs'] as const:['onedrive'] as const).map(p=><label key={p} className="block text-xs text-slate-400">{p==='gdrive'?'Google Drive':p==='gcs'?'Google Cloud Storage':'OneDrive'} callback URL<input aria-label={p+' callback URL'} readOnly value={settings?.origin===origin?settings.callbacks[p]:(origin.replace(/\/$/,'')+'/api/storage-oauth/callback/'+p)} className={inputClass} /></label>)}
   <label className="block text-sm text-slate-300">{name} client ID<input aria-label={name+' client ID'} value={clientId} onChange={e=>setClientId(e.target.value)} className={inputClass} autoComplete="off" /></label>
   <label className="block text-sm text-slate-300">{name} client secret<input aria-label={name+' client secret'} type="password" value={secret} onChange={e=>setSecret(e.target.value)} className={inputClass} autoComplete="new-password" placeholder={settings?.[providerKey].hasClientSecret?'Secret saved — leave blank to keep it':'Enter the app client secret'} /></label>
   <button type="button" onClick={saveSettings} disabled={saving||busy} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?'Saving sign-in setup...':'Save sign-in setup'}</button>
  </div>}
 </div>;
}
