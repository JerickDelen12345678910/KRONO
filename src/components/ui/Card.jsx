export function Card({ 
  children, 
  variant = 'default', // default, pri, fit, map, prj
  header,
  footer,
  className = '',
  ...props 
}) {
  const variantClass = variant !== 'default' ? variant : '';
  
  return (
    <article className={`ui-card ${variantClass} ${className}`} {...props}>
      {header && (
        <header className="ui-card-header">
          {header}
        </header>
      )}
      <div className="ui-card-body">
        {children}
      </div>
      {footer && (
        <footer className="ui-card-footer">
          {footer}
        </footer>
      )}
    </article>
  );
}
