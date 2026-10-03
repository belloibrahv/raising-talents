import { useId, useRef } from 'react';

interface FilePickerProps {
  readonly label: string;
  readonly accept: string;
  readonly disabled?: boolean;
  readonly onPick: (file: File) => void;
  readonly variant?: 'primary' | 'secondary';
}

/**
 * A real file input behind a button-styled label: keyboard, screen readers and the
 * phone's camera and gallery picker all work as the platform intends.
 */
export function FilePicker({
  label,
  accept,
  disabled,
  onPick,
  variant = 'primary',
}: FilePickerProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        className="visually-hidden file-picker__input"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so choosing the same file again still fires a change.
          event.target.value = '';
          if (file) onPick(file);
        }}
      />
      <label
        htmlFor={id}
        className={`button button--${variant}`}
        aria-disabled={disabled || undefined}
      >
        {label}
      </label>
    </div>
  );
}
