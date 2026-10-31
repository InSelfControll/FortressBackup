import React from 'react';
export function QueryStatus({ pending, error, retry }: { pending?: boolean; error?: Error | null; retry?: () => void }) {
    if (error) return <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">
        {error.message}<button className="ml-3 underline" onClick={retry}>Retry</button>
    </div>;
    return pending ? <p role="status" className="text-sm text-slate-400">Loading saved records...</p> : null;
}
