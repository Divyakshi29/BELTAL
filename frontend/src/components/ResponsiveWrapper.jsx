import { useState, useEffect } from 'react';

export function useResponsive() {
    const [breakpoint, setBreakpoint] = useState({
        isMobile: false,
        isTablet: false,
        isDesktop: true
    });

    useEffect(() => {
        const checkBreakpoint = () => {
            const width = window.innerWidth;
            setBreakpoint({
                isMobile: width < 640,
                isTablet: width >= 640 && width < 1024,
                isDesktop: width >= 1024
            });
        };

        checkBreakpoint();
        window.addEventListener('resize', checkBreakpoint);
        return () => window.removeEventListener('resize', checkBreakpoint);
    }, []);

    return breakpoint;
}

export function ResponsiveWrapper({ children, className = '' }) {
    const { isMobile, isTablet } = useResponsive();

    return (
        <div className={`
      ${className}
      ${isMobile ? 'px-2' : isTablet ? 'px-4' : 'px-6'}
      ${isMobile ? 'py-2' : isTablet ? 'py-4' : 'py-6'}
    `}>
            {children}
        </div>
    );
}

export default ResponsiveWrapper;