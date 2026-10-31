const bounds: Array<[number,number]> = [[0,59],[0,23],[1,31],[1,12],[0,7]];
export function parseCron(expression: string): Set<number>[] {
    if (typeof expression !== 'string' || expression.length > 120) throw new Error('Invalid cron expression');
    const fields=expression.trim().split(/\s+/);
    if(fields.length!==5)throw new Error('Enter a five-field UTC cron expression');
    return fields.map((field,index)=>{
        const [minimum,maximum]=bounds[index];const result=new Set<number>();
        for(const part of field.split(',')){
            const match=/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
            if(!match)throw new Error('Use numbers, ranges, lists, and steps in cron fields');
            const step=match[2]?Number(match[2]):1;
            if(step<1||step>maximum-minimum+1)throw new Error('Invalid cron step');
            const range=match[1]==='*'?[minimum,maximum]:match[1].includes('-')?match[1].split('-').map(Number):[Number(match[1]),match[2]?maximum:Number(match[1])];
            if(range[0]<minimum||range[1]>maximum||range[0]>range[1])throw new Error('Cron field is outside its allowed range');
            for(let value=range[0];value<=range[1];value+=step)result.add(value);
        }
        return result;
    });
}
export function cronMatches(expression:string, date:Date):boolean {
    const [minute,hour,day,month,weekday]=parseCron(expression);const fields=expression.trim().split(/\s+/);
    const dom=day.has(date.getUTCDate());const dow=weekday.has(date.getUTCDay())||(date.getUTCDay()===0&&weekday.has(7));
    const matchesDay=fields[2].startsWith('*')||fields[4].startsWith('*')?dom&&dow:dom||dow;
    return minute.has(date.getUTCMinutes())&&hour.has(date.getUTCHours())&&month.has(date.getUTCMonth()+1)&&matchesDay;
}
