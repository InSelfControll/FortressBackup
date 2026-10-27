import path from 'node:path';

/** Shell quoting is defense in depth for the legacy SSH stdin runner. */
export function quote(value: string): string {
    if (typeof value!=='string'||!value||/[\u0000-\u001f\u007f]/.test(value) || value.length>4096)
        throw new Error('Invalid shell argument');
    return "'" + value.replace(/'/g, "'\\''") + "'";
}
export function absoluteSources(sources: string[]): string[] {
    if (!Array.isArray(sources) || sources.length===0 || sources.length>64)
        throw new Error('Expected 1..64 source paths');
    for(const source of sources){
        if(!path.posix.isAbsolute(source) || source.startsWith('-') ||
           source.split('/').includes('..') || /[\u0000-\u001f\u007f]/.test(source) ||
           ['/proc','/sys','/dev'].some(p=>source===p||source.startsWith(p+'/')))
            throw new Error('Invalid or forbidden backup source path');
    }
    return sources;
}
export function absoluteRestorePath(dir:string):string {
    if(typeof dir!=='string'|| !path.posix.isAbsolute(dir) || dir.split('/').includes('..') ||
       /[\u0000-\u001f\u007f]/.test(dir)||dir==='/' ||
       ['/proc','/sys','/dev','/etc'].some(p=>dir===p||dir.startsWith(p+'/')))
        throw new Error('Unsafe restore target path');
    return dir;
}
