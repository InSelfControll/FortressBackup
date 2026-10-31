/**
 * Location persistence. Credentials are encrypted at rest and never returned by
 * list endpoints. Legacy plaintext rows are migrated when read by an admin job.
 */
import { run, query, getOne } from './helpers.js';
import { currentConfig } from './connection.js';
import { seal, open, isEncrypted } from '../security/credentialEnvelope.js';

export interface Location {
    id: string; name: string; type: string; path: string;
    endpoint?: string; region?: string; access_key?: string; secret_key?: string;
    host_public_key?: string;
}
export type PublicLocation = Omit<Location, 'access_key'|'secret_key'> & {hasAccessKey: boolean;hasSecretKey:boolean};
const encryptCredential=(value?:string):string|null=>value?seal(value):null;
const decryptCredential=(value?:string|null):string|undefined=>{
    if(!value)return undefined;
    return isEncrypted(value)?open(value):value; // Legacy rows migrate on read.
};
const rawLocation = (id:string) => getOne<Location>(
    'SELECT id,name,type,path,endpoint,region,access_key,secret_key,host_public_key FROM locations WHERE id=?',[id]);
const toPublicLocation=({access_key,secret_key,...metadata}:Location):PublicLocation=>({
    ...metadata,hasAccessKey:!!access_key,hasSecretKey:!!secret_key
});

export const getPublicLocation=async(id:string):Promise<PublicLocation|null>=>{
    const stored=await rawLocation(id);
    return stored?toPublicLocation(stored):null;
};

export const getAllLocations = async ():Promise<PublicLocation[]> => {
    const rows=await query<Location>('SELECT id,name,type,path,endpoint,region,access_key,secret_key,host_public_key FROM locations');
    return rows.map(toPublicLocation);
};

export const saveLocation = async (location:Location):Promise<void> => {
    const previous=await rawLocation(location.id);
    const access = location.access_key === undefined ? previous?.access_key || null : encryptCredential(location.access_key);
    const secret = location.secret_key === undefined ? previous?.secret_key || null : encryptCredential(location.secret_key);
    const hostPublicKey=location.host_public_key===undefined?previous?.host_public_key||null:location.host_public_key||null;
    // Any legacy stored credential is encrypted on next edit, without losing it.
    const secureAccess = access && !isEncrypted(access) ? encryptCredential(access) : access;
    const secureSecret = secret && !isEncrypted(secret) ? encryptCredential(secret) : secret;
    if (currentConfig?.type==='sqlite') {
        await run(`INSERT INTO locations(id,name,type,path,endpoint,region,access_key,secret_key,host_public_key)
          VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,type=excluded.type,path=excluded.path,endpoint=excluded.endpoint,region=excluded.region,
          access_key=excluded.access_key,secret_key=excluded.secret_key,host_public_key=excluded.host_public_key`,
          [location.id,location.name,location.type,location.path,location.endpoint||null,location.region||null,secureAccess,secureSecret,hostPublicKey]);
    } else {
        await run(`INSERT INTO locations(id,name,type,path,endpoint,region,access_key,secret_key,host_public_key)
          VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
          name=EXCLUDED.name,type=EXCLUDED.type,path=EXCLUDED.path,endpoint=EXCLUDED.endpoint,region=EXCLUDED.region,
          access_key=EXCLUDED.access_key,secret_key=EXCLUDED.secret_key,host_public_key=EXCLUDED.host_public_key`,
          [location.id,location.name,location.type,location.path,location.endpoint||null,location.region||null,secureAccess,secureSecret,hostPublicKey]);
    }
};
export const deleteLocation = async (id:string):Promise<void> => {
    await run('DELETE FROM locations WHERE id=?',[id]);
};
export const getLocation = async (id:string):Promise<Location|null> => {
    const stored=await rawLocation(id);
    if (!stored) return null;
    const needsMigration=!!([stored.access_key,stored.secret_key].filter(Boolean).some(value=>!isEncrypted(value!)));
    const clear={...stored,access_key:decryptCredential(stored.access_key),secret_key:decryptCredential(stored.secret_key)};
    if (needsMigration) await saveLocation(clear);
    return clear;
};
