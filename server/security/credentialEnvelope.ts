/**
 * Shared AES-256-GCM envelope for controller-owned credentials.
 * The key is independent of JWT authentication and must be persisted.
 */
import { encryptWithKey, decryptWithKey, type EncryptedData } from '../encryption.js';

const MARKER='enc:v1:';
export const getCredentialKey=():string=>{
    const secret=process.env.FORTRESS_CREDENTIAL_KEY;
    if(!secret || !/^[a-fA-F0-9]{64}$/.test(secret))
        throw new Error('FORTRESS_CREDENTIAL_KEY must be a dedicated 32-byte hexadecimal key');
    return secret;
};
export const isEncrypted=(input:string):boolean=>input.startsWith(MARKER);
export const seal=(clear:string):string=>MARKER+JSON.stringify(encryptWithKey(clear,getCredentialKey()));
export const open=(ciphertext:string):string=>{
    if(!isEncrypted(ciphertext))throw new Error('Expected encrypted credential envelope');
    return decryptWithKey(JSON.parse(ciphertext.slice(MARKER.length)) as EncryptedData,getCredentialKey());
};
