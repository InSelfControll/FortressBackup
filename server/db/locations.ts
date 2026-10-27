/**
 * Location persistence. Credentials are encrypted at rest and never returned by
 * list endpoints. Legacy plaintext rows are migrated when read by an admin job.
 */
import { run, query, getOne } from './helpers.js';
import { currentConfig } from './connection.js';
import { encryptWithKey, decryptWithKey, type EncryptedData } from '../encryption.js';

export interface Location {
    id: string; name: string; type: string; path: string;
    endpoint?: string; region?: string; access_key?: string; secret_key?: string;
}
export type PublicLocation = Omit<Location, 'access_key'|'secret_key'> & {hasAccessKey: boolean;hasSecretKey:boolean};
const key = ():string => {
    const secret = process.env.FORTRESS_CREDENTIAL_KEY;
    if (!secret || !/^[0-9a-fA-F]{64}$/.test(secret))
        throw new Error('FORTRESS_CREDENTIAL_KEY must be a dedicated 32-byte hexadecimal key');
    return secret;
};
const prefix = 'enc:v1:';
const encryptCredential = (value?:string):string|null => value ? prefix + JSON.stringify(encryptWithKey(value,key())) : null;
const decryptCredential = (value?:string|null):string|undefined => {
    if (!value) return undefined;
    if (!value.startsWith(prefix)) return value; // Legacy row, migrated below
    return decryptWithKey(JSON.parse(value.slice(prefix.length)) as EncryptedData, key());
};
const rawLocation = (id:string) => getOne<Location>(
    'SELECT id,name,type,path,endpoint,region,access_key,secret_key FROM locations WHERE id=?',[id]);

export const getAllLocations = async ():Promise<PublicLocation[]> => {
    const rows=await query<Location>('SELECT id,name,type,path,endpoint,region,access_key,secret_key FROM locations');
    return rows.map(({access_key,secret_key,...metadata})=>({
        ...metadata,hasAccessKey:!!access_key,hasSecretKey:!!secret_key
    }));
};

export const saveLocation = async (location:Location):Promise<void> => {
    const previous=await rawLocation(location.id);
    const access = location.access_key === undefined ? previous?.access_key || null : encryptCredential(location.access_key);
    const secret = location.secret_key === undefined ? previous?.secret_key || null : encryptCredential(location.secret_key);
    // Any legacy stored credential is encrypted on next edit, without losing it.
    const secureAccess = access && !access.startsWith(prefix) ? encryptCredential(access) : access;
    const secureSecret = secret && !secret.startsWith(prefix) ? encryptCredential(secret) : secret;
    if (currentConfig?.type==='sqlite') {
        await run(`INSERT INTO locations(id,name,type,path,endpoint,region,access_key,secret_key)
          VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,type=excluded.type,path=excluded.path,endpoint=excluded.endpoint,region=excluded.region,
          access_key=excluded.access_key,secret_key=excluded.secret_key`,
          [location.id,location.name,location.type,location.path,location.endpoint||null,location.region||null,secureAccess,secureSecret]);
    } else {
        await run(`INSERT INTO locations(id,name,type,path,endpoint,region,access_key,secret_key)
          VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
          name=EXCLUDED.name,type=EXCLUDED.type,path=EXCLUDED.path,endpoint=EXCLUDED.endpoint,region=EXCLUDED.region,
          access_key=EXCLUDED.access_key,secret_key=EXCLUDED.secret_key`,
          [location.id,location.name,location.type,location.path,location.endpoint||null,location.region||null,secureAccess,secureSecret]);
    }
};
export const deleteLocation = async (id:string):Promise<void> => {
    await run('DELETE FROM locations WHERE id=?',[id]);
};
export const getLocation = async (id:string):Promise<Location|null> => {
    const stored=await rawLocation(id);
    if (!stored) return null;
    const needsMigration=!!([stored.access_key,stored.secret_key].filter(Boolean).some(value=>!value!.startsWith(prefix)));
    const clear={...stored,access_key:decryptCredential(stored.access_key),secret_key:decryptCredential(stored.secret_key)};
    if (needsMigration) await saveLocation(clear);
    return clear;
};
