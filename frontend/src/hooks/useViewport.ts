import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 900;

function getViewportWidth() {
  if (typeof window === 'undefined') return 1440;
  return window.innerWidth;
}

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = useState(() => getViewportWidth() < breakpoint);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
}
