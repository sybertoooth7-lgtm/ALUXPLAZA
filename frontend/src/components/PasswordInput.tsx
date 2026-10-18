// frontend/src/components/PasswordInput.tsx
// A password field with a show/hide button. Drop-in for <input type="password">:
// it takes every normal input prop (id, value, onChange, autoComplete, ref, ...)
// and only owns `type`.
//
// The password is hidden by default and the choice is per field, so showing the
// "new password" does not also reveal "confirm password". The button is a real
// <button type="button"> (it never submits the form), is reachable by keyboard,
// and exposes its state to screen readers through aria-label and aria-pressed.

import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'>;

export default function PasswordInput({ className = '', disabled, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        // pr-11 leaves room for the button so long passwords never run under it.
        className={`${className} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Keep focus in the input when the button is clicked with a mouse, so the
        // caret stays where the person was typing.
        onMouseDown={(e) => e.preventDefault()}
        disabled={disabled}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-alux-cyan/50 rounded-r-lg"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
