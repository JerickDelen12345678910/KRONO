export function SegmentedControl({ options, value, onChange, className = '' }) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label="View selection">
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
