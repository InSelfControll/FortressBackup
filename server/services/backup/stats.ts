const units:Record<string,number>={B:1,bytes:1,KB:1000,MB:1e6,GB:1e9,TB:1e12,KiB:1024,MiB:1024**2,GiB:1024**3,TiB:1024**4};
export function parseBackupStats(output:string):{bytesProcessed:number;filesProcessed:number} {
    for(const line of output.split('\n').reverse()){
        try {
            const value=JSON.parse(line);
            if(value?.message_type==='summary' && Number.isFinite(value.total_bytes_processed) && Number.isFinite(value.total_files_processed))
                return {bytesProcessed:Math.max(0,value.total_bytes_processed),filesProcessed:Math.max(0,value.total_files_processed)};
        }catch{ /* Text output is used by Borg and Rsync. */ }
    }
    const normalized=output.replace(/(\d),(?=\d)/g,'$1');
    const size=/(?:Total transferred file size:|Total file size:|Original size:|This archive:)\s*([\d.]+)\s*(bytes|[KMGT]i?B|B)/i.exec(normalized)
        || /([\d.]+)\s*(bytes|[KMGT]i?B|B)\b/i.exec(normalized);
    const count=/(?:Number of (?:regular files transferred|files):)\s*(\d+)/i.exec(normalized) || /(\d+)\s*files?\b/i.exec(normalized);
    const unit=Object.keys(units).find(unit=>unit.toLowerCase()===size?.[2].toLowerCase());
    return {bytesProcessed:size&&unit?Number(size[1])*units[unit]:0,filesProcessed:count?Number(count[1]):0};
}
