import type { MyPortfolio } from '@rt/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const portfolioKey = ['portfolio', 'mine'] as const;

const IN_PROGRESS = new Set(['awaiting_upload', 'processing', 'scanning']);

/** Polls while anything is still being processed or checked, then stops. */
export function useMyPortfolio() {
  return useQuery({
    queryKey: portfolioKey,
    queryFn: () => api.call('portfolio.getMine'),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => IN_PROGRESS.has(item.mediaStatus)) ? 3000 : false,
  });
}

/** Every change answers with the whole portfolio, so the cache is replaced, never patched. */
function usePortfolioMutation<TInput>(
  run: (input: TInput, current: MyPortfolio | undefined) => Promise<MyPortfolio>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => run(input, queryClient.getQueryData<MyPortfolio>(portfolioKey)),
    onSuccess: (portfolio) => {
      queryClient.setQueryData(portfolioKey, portfolio);
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: portfolioKey });
    },
  });
}

export const useAddItem = () =>
  usePortfolioMutation((mediaId: string) => api.call('portfolio.addItem', { body: { mediaId } }));

export const useUpdateCaption = () =>
  usePortfolioMutation((input: { itemId: string; caption: string }) =>
    api.call('portfolio.updateItem', {
      params: { itemId: input.itemId },
      body: { caption: input.caption },
    }),
  );

export const useRemoveItem = () =>
  usePortfolioMutation((itemId: string) =>
    api.call('portfolio.removeItem', { params: { itemId } }),
  );

/** Moves one item by one place. The whole order is sent with the version it was read at. */
export const useMoveItem = () =>
  usePortfolioMutation((input: { itemId: string; by: -1 | 1 }, current) => {
    const ids = current?.items.map((item) => item.id) ?? [];
    const from = ids.indexOf(input.itemId);
    const to = from + input.by;
    if (from < 0 || to < 0 || to >= ids.length) return Promise.resolve(current as MyPortfolio);
    const order = [...ids];
    [order[from], order[to]] = [order[to] as string, order[from] as string];
    return api.call('portfolio.reorder', {
      body: { itemIds: order },
      ifMatch: current?.version ?? 0,
    });
  });
