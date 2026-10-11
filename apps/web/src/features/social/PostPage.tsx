import { useParams } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { buttonLink } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
import { ImageOff } from 'lucide-react';
import { Link } from 'react-router';
import { PostCard } from './PostCard';
import { usePost } from './queries';

/** One post with its comments open: where a notice about a comment leads. */
export function PostPage() {
  const { id = '' } = useParams();
  const post = usePost(id);

  if (post.isPending) return <PageSkeleton />;
  if (post.isError) {
    return (
      <Page title={t('comments.postGone')}>
        {isApiError(post.error, 'NOT_FOUND') ? (
          <EmptyState icon={ImageOff} title={t('comments.postGoneBody')}>
            <Link className={buttonLink('primary', 'sm')} to="/home">
              {t('comments.backHome')}
            </Link>
          </EmptyState>
        ) : (
          <FormMessage tone="error">{errorMessage(post.error)}</FormMessage>
        )}
      </Page>
    );
  }
  return (
    <Page
      title={t('social.postBy', { name: post.data.talent.displayName })}
      className="[&>div>header]:sr-only"
    >
      <div className="mx-auto w-full max-w-xl">
        <PostCard post={post.data} eager commentsOpen />
      </div>
    </Page>
  );
}
