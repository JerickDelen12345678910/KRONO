import { useState, useEffect } from 'react';

export function StatusBar() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <span>{time}</span>
      <span>5G ▮▮▮</span>
    </div>
  );
}
