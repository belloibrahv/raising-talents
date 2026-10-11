import type { CommentPage, FeedScope, Post, PostPage, TalentSocial } from '@rt/contracts';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { isApiError } from '../../shared/api/api-error';
import { api } from '../../shared/api/client';

/** Every list of posts shares the 'posts' prefix, so a like can update all of them at once. */
export const socialKeys = {
  posts: ['posts'] as const,
  feed: (scope: FeedScope) => ['posts', 'feed', scope] as const,
  talentPosts: (handle: string) => ['posts', 'talent', handle] as const,
  social: (handle: string) => ['social', handle] as const,
  suggestions: ['suggestions'] as const,
  following: ['following'] as const,
  /** One post on its own. Kept apart from the lists, which hold pages. */
  post: (id: string) => ['post', id] as const,
  comments: (postId: string) => ['comments', postId] as const,
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

/** Changes one post in every list that shows it, and on its own page. */
function changePost(queryClient: QueryClient, id: string, change: (post: Post) => Post) {
  queryClient.setQueriesData<Pages>({ queryKey: socialKeys.posts }, (pages) =>
    withPost(pages, id, change),
  );
  queryClient.setQueryData<Post>(socialKeys.post(id), (post) => post && change(post));
}

/** Like or take a like back. Every list showing the post updates at once. */
export function useLike() {
  const queryClient = useQueryClient();
  const everywhere = (id: string, change: (post: Post) => Post) => {
    changePost(queryClient, id, change);
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

export function usePost(id: string) {
  return useQuery({
    queryKey: socialKeys.post(id),
    queryFn: () => api.call('posts.get', { params: { id } }),
    retry: (failures, error) => !isApiError(error, 'NOT_FOUND') && failures < 2,
  });
}

type CommentPages = InfiniteData<CommentPage>;

export function useComments(postId: string) {
  return useInfiniteQuery({
    queryKey: socialKeys.comments(postId),
    queryFn: ({ pageParam }) =>
      api.call('posts.comments', {
        params: { id: postId },
        query: pageParam ? { cursor: pageParam } : {},
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: CommentPage) => last.nextCursor ?? undefined,
  });
}

/** Adds a comment at the top of the list and to the count on the post. */
export function useAddComment(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api.call('posts.comment', { params: { id: postId }, body: { body } }),
    onSuccess: (comment) => {
      queryClient.setQueryData<CommentPages>(socialKeys.comments(postId), (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page, index) => ({
                ...page,
                items: index === 0 ? [comment, ...page.items] : page.items,
                total: page.total + 1,
              })),
            }
          : data,
      );
      changePost(queryClient, postId, (post) => ({ ...post, comments: post.comments + 1 }));
    },
  });
}

export function useDeleteComment(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.call('comments.delete', { params: { id } }),
    onSuccess: (_nothing, id) => {
      queryClient.setQueryData<CommentPages>(socialKeys.comments(postId), (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.filter((comment) => comment.id !== id),
                total: Math.max(0, page.total - 1),
              })),
            }
          : data,
      );
      changePost(queryClient, postId, (post) => ({
        ...post,
        comments: Math.max(0, post.comments - 1),
      }));
    },
  });
}
