import { useEffect, useState } from 'react';

interface OrderTimerProps {
  createdAt: string;
}

export function OrderTimer({ createdAt }: OrderTimerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsedMs = now - new Date(createdAt).getTime();
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const elapsedSec = Math.floor((elapsedMs % 60000) / 1000);
  const isLate = elapsedMin >= 20;

  return (
    <span className={`font-mono text-xs font-black tabular-nums ${isLate ? 'text-red-500 animate-pulse' : 'text-neutral-400'}`}>
      {String(elapsedMin).padStart(2, '0')}:{String(elapsedSec).padStart(2, '0')}{isLate ? ' ATRASADO' : ''}
    </span>
  );
}
