/** Clipboard API is unavailable on plain HTTP LAN origins. */
export async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(text); return; } catch { /* Fall back to a user-initiated selection. */ }
    }
    const input = document.createElement('textarea');
    input.value = text; input.style.position = 'fixed'; input.style.opacity = '0';
    document.body.appendChild(input); input.select();
    try { if (!document.execCommand('copy')) throw new Error('Copy is unavailable. Select and copy the displayed value manually.'); }
    finally { input.remove(); }
}
