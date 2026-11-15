import { forwardRef } from 'react';
import { Icon } from './Icon';

export const Button = forwardRef(function Button({
  children,
  variant = 'primary', // primary, secondary, fit, map, ghost
  size = 'md',         // md, sm
  fullWidth = false,
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  className = '',
  type = 'button',
  onClick,
  ...props
}, ref) {
  const baseClasses = 'btn';
  const variantClasses = {
    primary: '',
    secondary: 'btn-secondary',
    fit: 'btn-fit',
    map: 'btn-map',
    ghost: 'btn-ghost',
  };
  const sizeClasses = {
    md: '',
    sm: 'btn-sm',
  };
  const widthClass = fullWidth ? 'btn-full' : '';

  return (
    <button
      ref={ref}
      type={type}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {leftIcon && !loading && <Icon name={leftIcon} />}
      {children}
      {rightIcon && !loading && <Icon name={rightIcon} />}
    </button>
  );
});

Button.displayName = 'Button';
