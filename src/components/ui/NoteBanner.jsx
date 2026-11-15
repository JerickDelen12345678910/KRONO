import { Icon } from './Icon';

export function NoteBanner({ children, variant = 'warning', className = '' }) {
  const variantClass = variant === 'info' ? 'note-info' : '';
  const icons = {
    warning: 'alert',
    info: 'lock',
  };
  
  return (
    <div className={`note ${variantClass} ${className}`} role="alert">
      <Icon name={icons[variant]} size={20} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
