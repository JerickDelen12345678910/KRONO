import { forwardRef } from 'react';

export const ToggleSwitch = forwardRef(function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      role="switch"
      type="button"
      className="toggle"
      onClick={() => onChange?.(!checked)}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-checked={checked}
      {...props}
    />
  );
});

ToggleSwitch.displayName = 'ToggleSwitch';
