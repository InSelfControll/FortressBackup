import { quote } from './commandSafety.js';

const keyAlgorithms=new Set([
    'ssh-ed25519','ssh-rsa','ecdsa-sha2-nistp256','ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521','sk-ssh-ed25519@openssh.com','sk-ecdsa-sha2-nistp256@openssh.com'
]);

export const validateHostPublicKey=(value:unknown):string=>{
    if(typeof value!=='string'||value.length>8192||/[\u0000-\u001f\u007f]/.test(value.trim()))
        throw new Error('Invalid SSH host public key');
    const [algorithm,encoded,...comment]=value.trim().split(/\s+/);
    if(!keyAlgorithms.has(algorithm)||!encoded||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
        throw new Error('Invalid SSH host public key');
    const blob=Buffer.from(encoded,'base64');
    if(blob.length<12||blob.toString('base64').replace(/=+$/,'')!==encoded.replace(/=+$/,''))
        throw new Error('Invalid SSH host public key');
    const typeLength=blob.readUInt32BE(0);
    if(typeLength>128||blob.length<4+typeLength||blob.subarray(4,4+typeLength).toString()!==algorithm)
        throw new Error('Invalid SSH host public key');
    return algorithm+' '+encoded+(comment.length?' '+comment.join(' '):'');
};

export const hostKeyEntry=(host:string,port:number,publicKey:unknown):string=>{
    if(!/^[A-Za-z0-9.-]{1,253}$/.test(host)||!Number.isInteger(port)||port<1||port>65535)
        throw new Error('Invalid SSH host or port');
    return `${port===22?host:`[${host}]:${port}`} ${validateHostPublicKey(publicKey)}`;
};

export const trustFileSetup=(entry:string):string=>[
    'FORTRESS_TRUST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/fortress-peer.XXXXXXXXXX") || exit 1',
    'fortress_peer_cleanup() { rm -f -- "$FORTRESS_TRUST_DIR/known_hosts"; rmdir -- "$FORTRESS_TRUST_DIR"; }',
    'trap fortress_peer_cleanup EXIT',
    "trap 'exit 1' HUP INT TERM",
    'chmod 700 "$FORTRESS_TRUST_DIR" || exit 1',
    'umask 077',
    `printf '%s\\n' ${quote(entry)} > "$FORTRESS_TRUST_DIR/known_hosts" || exit 1`,
    'chmod 600 "$FORTRESS_TRUST_DIR/known_hosts" || exit 1',
    ''
].join('\n');
