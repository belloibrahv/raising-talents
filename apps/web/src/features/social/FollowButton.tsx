import { Check, Plus } from 'lucide-react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { Button } from '../../shared/ui/Button';
import { useFollow } from './queries';

interface FollowButtonProps {
  readonly handle: string;
  readonly name: string;
  readonly following: boolean;
  readonly size?: 'default' | 'sm';
  readonly className?: string;
}

/** One press follows, another stops. The label names who, for screen readers. */
export function FollowButton({
  handle,
  name,
  following,
  size = 'sm',
  className,
}: FollowButtonProps) {
  const follow = useFollow(handle);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={following ? 'secondary' : 'primary'}
        size={size}
        className={className}
        aria-pressed={following}
        disabled={follow.isPending}
        onClick={() => {
          follow.mutate(!following);
        }}
      >
        {following ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {following ? t('social.following') : t('social.follow')}{' '}
        <span className="sr-only">{name}</span>
      </Button>
      {follow.error ? (
        <span role="alert" className="text-sm text-destructive">
          {errorMessage(follow.error)}
        </span>
      ) : null}
    </span>
  );
}
