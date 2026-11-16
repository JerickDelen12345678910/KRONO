export function SegmentedControl({ options, value, onChange, className = '', ariaLabel = 'View selection' }) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={ariaLabel}>
      {options.map(({ value: optValue, label }) => (
        <button
          key={optValue}
          type="button"
          className={`segmented-btn ${value === optValue ? 'active' : ''}`}
          onClick={() => onChange(optValue)}
          aria-pressed={value === optValue}
        >
          {label}
        </button>
      ))}
    </div>
  );
}