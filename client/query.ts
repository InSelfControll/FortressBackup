import { MutationCache, QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    mutationCache: new MutationCache({
        onError: async error => {
            // Authentication also uses this cache. Loading it must not initialize browser styles.
            if (typeof document === 'undefined') return;
            const { default: toast } = await import('react-hot-toast');
            toast.error(error.message || 'The operation failed');
        },
    }),
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 1, // 1 minute
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});
