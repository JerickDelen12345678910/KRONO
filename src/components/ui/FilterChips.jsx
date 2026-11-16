export function FilterChips({ options, value, onChange, className = '', label = 'Filter' }) {
  return (
    <div className={`chips ${className}`} role="group" aria-label={label}>
      {options.map(({ value: optValue, label }) => (
        <button
          key={optValue}
          type="button"
          className={`chip ${value === optValue ? 'active' : ''}`}
          onClick={() => onChange(optValue)}
          aria-pressed={value === optValue}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
