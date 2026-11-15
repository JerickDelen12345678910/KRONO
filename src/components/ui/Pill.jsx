export function Pill({ children, variant = 'primary', className = '' }) {
  const variantClasses = {
    primary: '',
    fit: 'pill-fit',
    map: 'pill-map',
    warn: 'pill-warn',
    prj: 'pill-prj',
    ok: 'pill-ok',
  };
  
  return (
    <span className={`pill ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}
