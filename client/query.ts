import { MutationCache, QueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export const queryClient = new QueryClient({
    mutationCache: new MutationCache({ onError: error => toast.error(error.message || 'The operation failed') }),
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 1, // 1 minute
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});
