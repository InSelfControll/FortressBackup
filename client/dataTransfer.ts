import * as API from './api/resources';
import { requireData } from './api/client';
import type { System, Location, BackupJob } from '../types';

type ExportData = { systems: System[]; locations: Location[]; jobs: BackupJob[] };
export function parseDataImport(text: string): ExportData {
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error('Enter valid exported JSON'); }
    if (!value || typeof value !== 'object') throw new Error('Expected an exported configuration object');
    const data = value as Partial<ExportData>;
    for (const key of ['systems','locations','jobs'] as const) {
        if (!Array.isArray(data[key]) || data[key]!.length > 1000) throw new Error(`Expected an array of at most 1000 ${key}`);
        for (const record of data[key]!) if (!record || typeof record !== 'object' || typeof record.id !== 'string' || typeof record.name !== 'string' || !record.name.trim()) throw new Error(`Invalid ${key} record`);
    }
    if (data.systems!.some(s=>typeof s.host !== 'string' || !s.host)) throw new Error('An imported system is missing its host');
    if (data.locations!.some(l=>typeof l.type !== 'string' || typeof l.path !== 'string' || !l.path)) throw new Error('An imported location is missing its type or path');
    const systems = new Set(data.systems!.map(s=>s.id)), locations = new Set(data.locations!.map(l=>l.id));
    if (data.jobs!.some(j=>!systems.has(j.sourceId) || !locations.has(j.destinationId) || !Array.isArray(j.sourcePaths) || !j.sourcePaths.length)) throw new Error('Every imported job must reference a system and location included in the export');
    return data as ExportData;
}

/** Import metadata through the API, preserving existing encrypted credentials on updates. */
export async function importData(text: string): Promise<number> {
    const data = parseDataImport(text);
    const existingSystems = requireData(await API.getSystems());
    const existingLocations = requireData(await API.getLocations());
    const existingJobs = requireData(await API.getJobs());
    const systemIds = new Map<string,string>(), locationIds = new Map<string,string>();
    let saved = 0;
    try {
        for (const source of data.systems) {
            const existing = existingSystems.find(s=>s.id===source.id);
            const {id,name,host,username,port,type,hostFingerprint,hostPublicKey} = source;
            const record={name,host,username,port,type,hostFingerprint,hostPublicKey};
            const result = requireData(existing
                ? await API.updateSystem(id, {...existing,...record,sshKeyId:existing.sshKeyId})
                : await API.createSystem({...record,sshKeyId:undefined,status:'offline',health:0,lastSeen:'',installedTools:[]}));
            systemIds.set(id,result.id); saved++;
        }
        for (const source of data.locations) {
            const {id,...record}=source;
            const result=requireData(existingLocations.some(l=>l.id===id)
                ? await API.updateLocation(id,record) : await API.createLocation(record));
            locationIds.set(id,result.id); saved++;
        }
        for (const source of data.jobs) {
            const {id,...record}=source;
            const existing=existingJobs.find(j=>j.id===id);
            const payload={...record,sourceId:systemIds.get(source.sourceId)!,destinationId:locationIds.get(source.destinationId)!,status:existing?.status||'Idle',scheduleEnabled:Boolean(existing?.scheduleEnabled),repoPassword:undefined} as Omit<BackupJob,'id'>;
            requireData(existing ? await API.updateJob(id,payload) : await API.createJob(payload)); saved++;
        }
        return saved;
    } catch(error) { throw new Error(`Import stopped after ${saved} saved records: ${error instanceof Error ? error.message : 'Request failed'}`); }
}
