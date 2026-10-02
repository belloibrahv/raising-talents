interface FormMessageProps {
  readonly tone: 'error' | 'success';
  readonly children: string | null | undefined;
}

/** Errors interrupt (role=alert); confirmations wait their turn (role=status). */
export function FormMessage({ tone, children }: FormMessageProps) {
  if (!children) return null;
  return (
    <p className={`message message--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
