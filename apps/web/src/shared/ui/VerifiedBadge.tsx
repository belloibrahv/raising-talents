import { BadgeCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { t } from '../../i18n';

/** The mark of an agency moderators have checked (ADR-026). */
export function VerifiedBadge() {
  return (
    <Badge variant="success">
      <BadgeCheck aria-hidden="true" />
      {t('talent.verified')}
    </Badge>
  );
}
