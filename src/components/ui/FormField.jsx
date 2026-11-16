/** Label + control + hint + error. Use `as="div"` (role group) when the control is not a single input. */
export function FormField({ label, error, hint, as = 'label', children, className = '' }) {
  const Tag = as;
  return (
    <Tag className={`form-field ${className}`} {...(as === 'div' ? { role: 'group', 'aria-label': label } : {})}>
      <span>{label}</span>
      {children}
      {hint && !error && <small className="field-hint">{hint}</small>}
      {error && <small className="field-error" role="alert">{error}</small>}
    </Tag>
  );
}
