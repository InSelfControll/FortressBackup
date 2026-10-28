/**
 * Configuration persistence. Provider and database connection secrets are
 * sealed using a dedicated AES-256-GCM key, not JWT_SECRET.
 */
import { run, getOne } from './helpers.js';
import { currentConfig } from './connection.js';
import { seal, open } from '../security/credentialEnvelope.js';

const encryptedKeys=new Set(['ai_config','sso_config','db_config']);
type Envelope={fortressEncryptedVersion:1;payload:string};
function decode<T>(key:string,value:string):{value:T;legacy:boolean}{
    const parsed=JSON.parse(value) as T|Envelope;
    if(encryptedKeys.has(key)){
        if(parsed && typeof parsed==='object' && 'fortressEncryptedVersion' in parsed){
            const envelope=parsed as Envelope;
            if(envelope.fortressEncryptedVersion!==1 || typeof envelope.payload!=='string')
                throw new Error('Unknown encrypted configuration format');
            return {value:JSON.parse(open(envelope.payload)) as T,legacy:false};
        }
        return {value:parsed as T,legacy:true};
    }
    return {value:parsed as T,legacy:false};
}
export const saveConfig=async(key:string,value:unknown):Promise<void>=>{
    const stored=encryptedKeys.has(key)
       ? JSON.stringify({fortressEncryptedVersion:1,payload:seal(JSON.stringify(value))} satisfies Envelope)
       : JSON.stringify(value);
    if (currentConfig?.type==='sqlite'){
       await run('INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,stored]);
    }else{
       await run('INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[key,stored]);
    }
};
export const getConfig=async<T>(key:string):Promise<T|null>=>{
    const row=await getOne<{value:string}>('SELECT value FROM config WHERE key=?',[key]);
    if(!row)return null;
    const result=decode<T>(key,row.value);
    // Opportunistically re-encrypt old records; no plaintext is returned in API responses.
    if(result.legacy)await saveConfig(key,result.value);
    return result.value;
};
