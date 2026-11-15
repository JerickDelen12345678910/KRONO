const icons = {
  home: (<><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></>),
  cal: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  dumb: (<><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" /></>),
  pin: (<><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></>),
  user: (<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>),
  plus: (<><path d="M12 5v14M5 12h14" /></>),
  play: (<><path d="M7 4l13 8-13 8z" /></>),
  search: (<><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4" /></>),
  bell: (<><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" /></>),
  up: (<><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></>),
  alert: (<><path d="M12 3l10 18H2zM12 10v5M12 18v.01" /></>),
  lock: (<><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  nav: (<><path d="M3 11l18-8-8 18-2-8z" /></>),
  cloud: (<><path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z" /></>),
  sun: (<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></>),
  moon: (<><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></>),
  doc: (<><path d="M6 3h8l5 5v13H6zM14 3v5h5" /></>),
  // Add more as needed
};

export function Icon({ name, className = '', size = 20, 'aria-hidden': ariaHidden = 'true', ...props }) {
  const path = icons[name];
  if (!path) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }
  
  return (
    <svg 
      className={`icon ${className}`} 
      width={size} 
      height={size} 
      viewBox="0 0 24 24"
      aria-hidden={ariaHidden}
      {...props}
    >
      {path}
    </svg>
  );
}
