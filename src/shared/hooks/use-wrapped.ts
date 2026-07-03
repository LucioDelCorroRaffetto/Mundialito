import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import type { Wrapped } from '@/shared/types/api';

interface UseWrappedOptions {
  /** Bypass admin del gate de torneo-no-terminado (?preview=1). */
  preview?: boolean;
}

/**
 * GET /users/me/wrapped. El backend devuelve 409 `TOURNAMENT_NOT_FINISHED`
 * hasta que termine el torneo (o con `preview` si el usuario es admin) — se
 * expone como `notReady` en vez de tratarlo como un error real, así el error
 * boundary de la página no lo muestra como falla.
 */
export function useWrapped(options: UseWrappedOptions = {}) {
  const query = useQuery({
    queryKey: ['wrapped', 'me', options.preview ?? false],
    queryFn: async () => {
      const { data: envelope } = await apiClient.get<{ data: Wrapped }>('/users/me/wrapped', {
        params: options.preview ? { preview: '1' } : undefined,
      });
      return envelope.data;
    },
    retry: false,
  });

  const notReady = query.isError && (query.error as any)?.response?.data?.error?.code === 'TOURNAMENT_NOT_FINISHED';

  return { ...query, notReady };
}
