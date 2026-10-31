import {utils as sshUtils} from 'ssh2';
import {getJob} from '../db/jobs.js';
import {getLocation} from '../db/locations.js';
import {decrypt} from '../encryption.js';
import {getJwtSecret} from '../middleware/auth.js';
import {sftpTransport} from './backup/sftpTrust.js';
import {hostKeyEntry} from './backup/sshTrust.js';

/** Resolve only the repository explicitly assigned by an administrator. */
export async function managedRepository(jobId:string){
    const job=await getJob(jobId);
    if(!job||job.tool!=='Restic'||!job.repo_password||!job.destination_id)
        throw new Error('Select a saved Restic job with a repository encryption password');
    const location=await getLocation(job.destination_id);
    if(!location||location.type!=='sftp')
        throw new Error('Automatic Windows setup requires a saved Restic SFTP destination');
    sftpTransport({jobId:job.id,jobName:job.name,tool:'restic',sourcePaths:[],
        destinationType:'sftp',destinationPath:location.path,destinationAccessKey:location.access_key,
        destinationSecretKey:location.secret_key,destinationHostPublicKey:location.host_public_key});
    const privateKey=location.secret_key!.replace(/\r\n/g,'\n').trimEnd()+'\n';
    const parsed=sshUtils.parseKey(privateKey);
    if(parsed instanceof Error)
        throw new Error('The saved storage SSH identity must support unattended key authentication');
    const peer=new URL(location.path);
    let password:string;
    try{password=decrypt(JSON.parse(job.repo_password),getJwtSecret())}
    catch{throw new Error('The saved repository password cannot be decrypted; check controller encryption settings')}
    if(!password)throw new Error('The saved repository encryption password is empty');
    return {repositoryJobId:job.id,repositoryName:job.name,storageName:location.name,
        repository:location.path,password,sshPrivateKey:privateKey,
        knownHosts:hostKeyEntry(peer.hostname,Number(peer.port||22),location.host_public_key)+'\n'};
}
