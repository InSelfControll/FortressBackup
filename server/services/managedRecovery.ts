import type {ManagedOperation,ManagedRequest,ManagedResult,Snapshot,ManagedFile} from '../../types';

export const recoveryCapability='recovery-v1';
export const crossDeviceCapability='recovery-v2';
export const cancelCapability='cancel-v1';
export const snapshotId=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
export const snapshotPath=(value:unknown):value is string=>typeof value==='string'&&value.startsWith('/')&&value.length<=4096&&!/[\\\u0000-\u001f\u007f]/.test(value)&&!value.split('/').some(segment=>segment==='..'||segment==='.');
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);

export function managedRequest(operation:ManagedOperation,value:any={}):ManagedRequest {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid operation request');
 const result:ManagedRequest={};
 if(value.allDevices!==undefined){if(typeof value.allDevices!=='boolean'||!['snapshots','files','restore'].includes(operation))throw new Error('Invalid backup scope');result.allDevices=value.allDevices;}
 if(operation==='files'||operation==='restore'){
  if(!snapshotId(value.snapshotId))throw new Error('Choose a saved snapshot');
  result.snapshotId=value.snapshotId;
 }
 if(operation==='snapshots'||operation==='files'){
  if(value.offset!==undefined&&(!Number.isSafeInteger(value.offset)||value.offset<0||value.offset>1000000))throw new Error('Invalid page offset');
  result.offset=value.offset??0;
 }
 if(operation==='files'){
  if(!snapshotPath(value.directory??'/'))throw new Error('Invalid snapshot directory');
  result.directory=value.directory??'/';
 }
 if(operation==='restore'&&value.paths!==undefined){
  if(!Array.isArray(value.paths)||!value.paths.length||value.paths.length>100||!value.paths.every(snapshotPath))throw new Error('Select 1..100 files or folders');
  result.paths=[...new Set<string>(value.paths)];
 }
 if(Buffer.byteLength(JSON.stringify(result))>24576)throw new Error('Restore selection is too large');
 return result;
}

export function managedResult(operation:ManagedOperation,value:any,request:ManagedRequest):ManagedResult|null {
 if(value==null){if(operation==='files'||operation==='restore')throw new Error('Operation result required');return null}
 if(Buffer.byteLength(JSON.stringify(value))>65536)throw new Error('Operation result too large');
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid operation result');
 if(operation==='restore'){
  if(value.snapshotId!==request.snapshotId||!text(value.restorePath,4096)||!(/^[A-Za-z]:\\/.test(value.restorePath)))throw new Error('Invalid restore result');
  return {snapshotId:value.snapshotId,restorePath:value.restorePath};
 }
 if(operation!=='files'&&operation!=='snapshots')throw new Error('Unexpected operation result');
 if(!Number.isSafeInteger(value.offset)||value.offset!==request.offset||typeof value.hasMore!=='boolean')throw new Error('Invalid result page');
 if(operation==='snapshots'){
  if(!Array.isArray(value.snapshots)||value.snapshots.length>200)throw new Error('Invalid snapshot list');
  const snapshots:Snapshot[]=value.snapshots.map((item:any)=>{
   if(!snapshotId(item.id)||!text(item.time,64)||!Number.isFinite(Date.parse(item.time))||!text(item.hostname,256)||!Array.isArray(item.paths)||item.paths.length>64||!item.paths.every((path:unknown)=>text(path,4096)))throw new Error('Invalid saved snapshot');
   return {id:item.id,shortId:item.id.slice(0,8),time:item.time,hostname:item.hostname,paths:item.paths};
  });
  return {snapshots,offset:value.offset,hasMore:value.hasMore};
 }
 if(value.snapshotId!==request.snapshotId||value.directory!==request.directory||!Array.isArray(value.entries)||value.entries.length>200)throw new Error('Invalid snapshot file list');
 const entries:ManagedFile[]=value.entries.map((item:any)=>{
  if(!snapshotPath(item.path)||!text(item.name,4096)||!['file','dir','symlink'].includes(item.type)||item.size!==undefined&&(!Number.isSafeInteger(item.size)||item.size<0))throw new Error('Invalid snapshot file');
  return {path:item.path,name:item.name,type:item.type,...(item.size===undefined?{}:{size:item.size})};
 });
 return {entries,directory:value.directory,snapshotId:value.snapshotId,offset:value.offset,hasMore:value.hasMore};
}
