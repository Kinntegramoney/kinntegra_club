import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Building2, BarChart3, User } from 'lucide-react';

// Cookie utility functions
const setCookie = (name, value, days = 365) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
};

const getCookie = (name) => {
  const nameEQ = `${name}=`;
  const cookies = document.cookie.split(';');
  for (let i = 0; i < cookies.length; i++) {
    let c = cookies[i].trim();
    if (c.indexOf(nameEQ) === 0) {
      return c.substring(nameEQ.length, c.length);
    }
  }
  return null;
};

const UserTypeSelector = ({ children }) => {
  const [showPopup, setShowPopup] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Pages where we should NOT show the popup or redirect
  const excludedPaths = [
    '/login',
    '/signup',
    '/re-broker-signup',
    '/mfd-signup',
    '/forgot-password',
    '/broker',
    '/sub-broker',
    '/client',
    '/admin'
  ];

  // Landing pages that are allowed without redirect
  const landingPages = [
    '/',
    '/real-estate-brokers',
    '/mf-distributors',
    '/private-investors',
    '/real-estate',
    '/bonds',
    '/wealth-planning',
    '/portfolio-analyzer'
  ];

  useEffect(() => {
    const checkUserType = () => {
      const currentPath = location.pathname;
      
      // Check if user is authenticated (logged in)
      const token = localStorage.getItem('token');
      const user = localStorage.getItem('user');
      if (token && user) {
        // User is logged in, don't show popup
        setShowPopup(false);
        setIsChecking(false);
        return;
      }
      
      // Check if current path is excluded (authenticated routes, login, etc.)
      const isExcludedPath = excludedPaths.some(path => currentPath.startsWith(path));
      if (isExcludedPath) {
        setIsChecking(false);
        return;
      }

      // Check if user is on a landing page
      const isOnLandingPage = landingPages.some(path => currentPath === path);
      
      // Get stored user type from cookie
      const userType = getCookie('kinntegraa_user_type');
      
      if (userType) {
        // User has already made a selection - don't show popup, allow free navigation
        setShowPopup(false);
      } else {
        // No cookie - show popup only on home page
        if (currentPath === '/' || currentPath === '') {
          setShowPopup(true);
        } else {
          // Allow navigation to other pages without popup
          setShowPopup(false);
        }
      }
      
      setIsChecking(false);
    };

    checkUserType();
  }, [location.pathname, navigate]);

  const handleSelection = (type) => {
    setCookie('kinntegraa_user_type', type);
    setShowPopup(false);
    
    if (type === 'real_estate_broker') {
      navigate('/real-estate-brokers', { replace: true });
    } else if (type === 'mf_distributor') {
      navigate('/mf-distributors', { replace: true });
    } else if (type === 'private_investor') {
      navigate('/private-investors', { replace: true });
    }
  };

  if (isChecking) {
    return null; // Don't render anything while checking
  }

  return (
    <>
      {children}
      
      {/* User Type Selection Popup */}
      {showPopup && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            style={{ zIndex: 1 }}
          />
          
          {/* Popup */}
          <div 
            className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-300"
            style={{ maxHeight: '90vh', zIndex: 2 }}
          >
            {/* Header */}
            <div 
              className="p-6 text-center"
              style={{ background: 'linear-gradient(135deg, #5B373C 0%, #3D252A 100%)' }}
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#C9A227' }}>
                <span className="text-white font-bold text-2xl">K</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Welcome to Kinntegraa</h2>
              <p className="text-white/80 text-sm">
                Help us personalize your experience
              </p>
            </div>
            
            {/* Content */}
            <div className="p-6">
              <p className="text-center text-gray-600 mb-6">
                I am a...
              </p>
              
              <div className="space-y-3">
                {/* Real Estate Broker (Dubai) Option */}
                <button
                  onClick={() => handleSelection('real_estate_broker')}
                  className="w-full p-4 rounded-xl border-2 transition-all hover:shadow-lg hover:scale-[1.02] flex items-center gap-4 group"
                  style={{ borderColor: '#E5E7EB' }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#C9A227'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E5E7EB'}
                >
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{ backgroundColor: '#5B373C' }}
                  >
                    <Building2 className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className="text-base font-semibold text-gray-900">Real Estate Broker (Dubai)</h3>
                    <p className="text-xs text-gray-500">
                      Fractional ownership, property management & client solutions
                    </p>
                  </div>
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#F8F5F0' }}
                  >
                    <span className="text-gray-400 group-hover:text-[#C9A227] transition-colors">→</span>
                  </div>
                </button>
                
                {/* MFD/RIA Option */}
                <button
                  onClick={() => handleSelection('mf_distributor')}
                  className="w-full p-4 rounded-xl border-2 transition-all hover:shadow-lg hover:scale-[1.02] flex items-center gap-4 group"
                  style={{ borderColor: '#E5E7EB' }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#C9A227'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E5E7EB'}
                >
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{ backgroundColor: '#C9A227' }}
                  >
                    <BarChart3 className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className="text-base font-semibold text-gray-900">MFD/RIA</h3>
                    <p className="text-xs text-gray-500">
                      Portfolio analysis, NCD opportunities & wealth planning
                    </p>
                  </div>
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#F8F5F0' }}
                  >
                    <span className="text-gray-400 group-hover:text-[#C9A227] transition-colors">→</span>
                  </div>
                </button>
                
                {/* Private Investor Option */}
                <button
                  onClick={() => handleSelection('private_investor')}
                  className="w-full p-4 rounded-xl border-2 transition-all hover:shadow-lg hover:scale-[1.02] flex items-center gap-4 group"
                  style={{ borderColor: '#E5E7EB' }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#C9A227'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E5E7EB'}
                >
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{ backgroundColor: '#059669' }}
                  >
                    <User className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className="text-base font-semibold text-gray-900">Private Investor</h3>
                    <p className="text-xs text-gray-500">
                      Real estate, NCDs, CAS analysis & data gathering services
                    </p>
                  </div>
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#F8F5F0' }}
                  >
                    <span className="text-gray-400 group-hover:text-[#C9A227] transition-colors">→</span>
                  </div>
                </button>
              </div>
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-center text-gray-400">
                You can change this anytime by clearing your cookies and revisiting the website
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UserTypeSelector;
