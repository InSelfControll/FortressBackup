/**
 * Only a verified GitHub email may be linked to an existing Fortress user.
 * Never fall back to a synthetic or unverified address.
 */
export function selectVerifiedGitHubEmail(records:unknown):string|null{
    if(!Array.isArray(records))return null;
    const choices=records.filter((entry:unknown)=>{
        if(!entry || typeof entry!=='object')return false;
        const candidate=entry as Record<string,unknown>;
        return candidate.verified===true && typeof candidate.email==='string' &&
            candidate.email.length>=3 && candidate.email.length<=254 &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email);
    }) as Array<{email:string;primary?:boolean}>;
    const chosen=choices.find(entry=>entry.primary===true)||choices[0];
    return chosen?.email.trim().toLowerCase()||null;
}
