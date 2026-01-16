import { useEffect } from 'react';

/**
 * Custom hook to set the page title dynamically
 * @param {string} title - The page-specific title (e.g., "Login", "Dashboard")
 */
export function usePageTitle(title) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `Kinntegraa | ${title}` : 'Kinntegraa';
    
    // Cleanup: restore previous title when component unmounts
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}

export default usePageTitle;
