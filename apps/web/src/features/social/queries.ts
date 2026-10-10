import type { FeedScope, Post, PostPage, TalentSocial } from '@rt/contracts';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { api } from '../../shared/api/client';

/** Every list of posts shares the 'posts' prefix, so a like can update all of them at once. */
export const socialKeys = {
  posts: ['posts'] as const,
  feed: (scope: FeedScope) => ['posts', 'feed', scope] as const,
  talentPosts: (handle: string) => ['posts', 'talent', handle] as const,
  social: (handle: string) => ['social', handle] as const,
  suggestions: ['suggestions'] as const,
  following: ['following'] as const,
};

const nextPage = (last: PostPage) => last.nextCursor ?? undefined;

export function useFeed(scope: FeedScope) {
  return useInfiniteQuery({
    queryKey: socialKeys.feed(scope),
    queryFn: ({ pageParam }) =>
      api.call('feed.list', { query: pageParam ? { scope, cursor: pageParam } : { scope } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPage,
  });
}

export function useTalentPosts(handle: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: socialKeys.talentPosts(handle),
    queryFn: ({ pageParam }) =>
      api.call('talents.posts', {
        params: { handle },
        query: pageParam ? { cursor: pageParam } : {},
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPage,
    enabled,
  });
}

export function useTalentSocial(handle: string, enabled = true) {
  return useQuery({
    queryKey: socialKeys.social(handle),
    queryFn: () => api.call('talents.social', { params: { handle } }),
    enabled,
  });
}

export function useSuggestions(enabled = true) {
  return useQuery({
    queryKey: socialKeys.suggestions,
    queryFn: () => api.call('feed.suggestions'),
    enabled,
    // The row should not reshuffle while someone is tapping through it.
    staleTime: 5 * 60 * 1000,
  });
}

/** Follow or unfollow. The button shows the new state at once and goes back if it fails. */
export function useFollow(handle: string) {
  const queryClient = useQueryClient();
  const key = socialKeys.social(handle);
  return useMutation({
    mutationFn: (follow: boolean) =>
      api.call(follow ? 'talents.follow' : 'talents.unfollow', { params: { handle } }),
    onMutate: async (follow) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<TalentSocial>(key);
      if (before && before.followedByViewer !== follow) {
        queryClient.setQueryData<TalentSocial>(key, {
          ...before,
          followedByViewer: follow,
          followers: Math.max(0, before.followers + (follow ? 1 : -1)),
        });
      }
      return { before };
    },
    onError: (_error, _follow, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before);
    },
    onSuccess: (social) => {
      queryClient.setQueryData(key, social);
      void queryClient.invalidateQueries({ queryKey: socialKeys.feed('following') });
      void queryClient.invalidateQueries({ queryKey: socialKeys.following });
    },
  });
}

type Pages = InfiniteData<PostPage>;

const withPost = (pages: Pages | undefined, id: string, change: (post: Post) => Post) =>
  pages && {
    ...pages,
    pages: pages.pages.map((page) => ({
      ...page,
      items: page.items.map((post) => (post.id === id ? change(post) : post)),
    })),
  };

/** Like or take a like back. Every list showing the post updates at once. */
export function useLike() {
  const queryClient = useQueryClient();
  const everywhere = (id: string, change: (post: Post) => Post) => {
    queryClient.setQueriesData<Pages>({ queryKey: socialKeys.posts }, (pages) =>
      withPost(pages, id, change),
    );
  };
  return useMutation({
    mutationFn: ({ id, like }: { id: string; like: boolean }) =>
      api.call(like ? 'posts.like' : 'posts.unlike', { params: { id } }),
    onMutate: ({ id, like }) => {
      everywhere(id, (post) =>
        post.liked === like
          ? post
          : { ...post, liked: like, likes: Math.max(0, post.likes + (like ? 1 : -1)) },
      );
    },
    onError: (_error, { id, like }) => {
      everywhere(id, (post) => ({
        ...post,
        liked: !like,
        likes: Math.max(0, post.likes + (like ? -1 : 1)),
      }));
    },
    onSuccess: (state, { id }) => {
      everywhere(id, (post) => ({ ...post, ...state }));
    },
  });
}
