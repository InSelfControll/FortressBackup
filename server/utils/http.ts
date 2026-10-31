interface FetchJsonLimits {
    timeoutMs: number;
    maxBytes: number;
    signal?: AbortSignal;
}

interface JsonResponse<T = any> {
    status: number;
    ok: boolean;
    data: T;
}

export const fetchJsonWithLimits = async <T = any>(
    input: string | URL | Request,
    init: RequestInit,
    { timeoutMs, maxBytes, signal }: FetchJsonLimits
): Promise<JsonResponse<T>> => {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason || new Error('Request aborted'));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });

    const timeout = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);
    let cancelBody: (() => void) | undefined;

    try {
        if (signal?.aborted) throw signal.reason || new Error('Request aborted');
        const response = await fetch(input, { ...init, redirect: 'error', signal: controller.signal });
        if (!response.body) return { status: response.status, ok: response.ok, data: null as T };

        const reader = response.body.getReader();
        cancelBody = () => { void reader.cancel().catch(() => undefined); };
        controller.signal.addEventListener('abort', cancelBody, { once: true });
        const chunks: Uint8Array[] = [];
        let total = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (controller.signal.aborted) throw controller.signal.reason;
            if (done) break;
            if (!value) continue;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel().catch(() => undefined);
                throw new Error(`Response body exceeds ${maxBytes} bytes`);
            }
            chunks.push(value);
        }

        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return {
            status: response.status,
            ok: response.ok,
            data: JSON.parse(new TextDecoder().decode(bytes)) as T
        };
    } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        if (cancelBody) controller.signal.removeEventListener('abort', cancelBody);
    }
};
