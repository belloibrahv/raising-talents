import { CircleAlert, CircleCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FormMessageProps {
  readonly tone: 'error' | 'success';
  readonly children: string | null | undefined;
  /** False for standing notes that are part of the page, not news: no live region. */
  readonly announce?: boolean;
}

/** Errors interrupt (role=alert); confirmations wait their turn (role=status). */
export function FormMessage({ tone, children, announce = true }: FormMessageProps) {
  if (!children) return null;
  const Icon = tone === 'error' ? CircleAlert : CircleCheck;
  return (
    <Alert
      variant={tone === 'error' ? 'destructive' : 'success'}
      role={announce ? (tone === 'error' ? 'alert' : 'status') : undefined}
    >
      <Icon aria-hidden="true" />
      <AlertDescription className="text-base">{children}</AlertDescription>
    </Alert>
  );
}
