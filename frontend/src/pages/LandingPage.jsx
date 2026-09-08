import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Users, TrendingUp, ArrowRight, Shield, Globe, Briefcase } from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState(null);

  const userTypes = [
    {
      id: "investor",
      title: "Private Investor",
      subtitle: "Individual Investor",
      description: "Access exclusive investment opportunities in bonds and real estate",
      icon: TrendingUp,
      color: "#2D5A3D",
      loginPath: "/login?type=investor",
      features: ["NCD Investments", "Real Estate Deals", "Portfolio Analytics"]
    },
    {
      id: "mfd",
      title: "MFD / RIA",
      subtitle: "Mutual Fund Distributor / Advisor",
      description: "Manage your clients, track investments, and grow your distribution business",
      icon: Users,
      color: "#C9A227",
      loginPath: "/login?type=mfd",
      features: ["Client Portfolio Management", "Investment Tracking", "Commission Reports"]
    },
    {
      id: "broker",
      title: "Real Estate Broker",
      subtitle: "Property Specialist",
      description: "List properties, manage clients, and close deals efficiently",
      icon: Building2,
      color: "#5B373C",
      loginPath: "/login?type=broker",
      features: ["Property Listings", "Client Management", "Deal Tracking"]
    }
  ];

  const handleContinue = () => {
    const selected = userTypes.find(t => t.id === selectedRole);
    if (selected) {
      navigate(selected.loginPath);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden"
         style={{ 
           background: 'linear-gradient(135deg, #5B373C 0%, #3D252A 50%, #1F1F1F 100%)',
         }}>
      
      {/* Background decorative elements */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.08 }}>
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#C9A227', stopOpacity: 0.5 }} />
            <stop offset="100%" style={{ stopColor: '#A68521', stopOpacity: 0.3 }} />
          </linearGradient>
        </defs>
        <ellipse cx="15%" cy="20%" rx="400" ry="400" fill="url(#grad1)" />
        <ellipse cx="85%" cy="80%" rx="500" ry="500" fill="url(#grad1)" />
        <ellipse cx="50%" cy="50%" rx="300" ry="300" fill="url(#grad1)" />
      </svg>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        
        {/* Header */}
        <header className="py-6 px-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden"
                style={{ boxShadow: '0 4px 12px rgba(201, 162, 39, 0.3)' }}
              >
                <img 
                  src="/logo.svg" 
                  alt="Kinntegraa Logo" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <span 
                  className="text-white text-xl font-bold hidden items-center justify-center w-full h-full rounded-full" 
                  style={{ fontFamily: 'serif', background: 'linear-gradient(135deg, #C9A227 0%, #A68521 100%)' }}
                >
                  K
                </span>
              </div>
              <div>
                <h1 className="text-white text-xl font-semibold tracking-wide">Kinntegraa</h1>
                <p className="text-gray-400 text-xs">Investment Platform</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/login")}
                className="text-gray-300 hover:text-white text-sm font-medium transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => navigate("/signup")}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ 
                  background: 'linear-gradient(135deg, #C9A227 0%, #A68521 100%)',
                  color: 'white'
                }}
              >
                Get Started
              </button>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <main className="flex-1 flex flex-col items-center justify-center px-8 py-12">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Welcome to <span style={{ color: '#C9A227' }}>Kinntegraa</span>
            </h2>
            <p className="text-gray-300 text-lg md:text-xl max-w-2xl mx-auto">
              Your gateway to premium investment opportunities in Bonds and Real Estate
            </p>
          </div>

          {/* Role Selection */}
          <div className="w-full max-w-5xl">
            <p className="text-center text-gray-400 mb-8 text-sm uppercase tracking-wider">
              I am a...
            </p>
            
            <div className="grid md:grid-cols-3 gap-6">
              {userTypes.map((type) => {
                const Icon = type.icon;
                const isSelected = selectedRole === type.id;
                
                return (
                  <div
                    key={type.id}
                    onClick={() => setSelectedRole(type.id)}
                    className={`
                      relative p-6 rounded-2xl cursor-pointer transition-all duration-300
                      ${isSelected 
                        ? 'bg-white/15 border-2 transform scale-[1.02]' 
                        : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
                      }
                    `}
                    style={{ 
                      borderColor: isSelected ? type.color : undefined,
                      boxShadow: isSelected ? `0 20px 40px -12px ${type.color}40` : undefined
                    }}
                    data-testid={`role-card-${type.id}`}
                  >
                    {/* Icon */}
                    <div 
                      className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
                      style={{ backgroundColor: `${type.color}20` }}
                    >
                      <Icon className="w-7 h-7" style={{ color: type.color }} />
                    </div>

                    {/* Title */}
                    <h3 className="text-white text-xl font-semibold mb-1">{type.title}</h3>
                    <p className="text-gray-400 text-sm mb-3">{type.subtitle}</p>
                    
                    {/* Description */}
                    <p className="text-gray-300 text-sm mb-4">{type.description}</p>

                    {/* Features */}
                    <ul className="space-y-2">
                      {type.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-gray-400 text-xs">
                          <div 
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: type.color }}
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {/* Selection indicator */}
                    {isSelected && (
                      <div 
                        className="absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: type.color }}
                      >
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Continue Button */}
            <div className="mt-10 text-center">
              <button
                onClick={handleContinue}
                disabled={!selectedRole}
                className={`
                  inline-flex items-center gap-2 px-8 py-4 rounded-xl text-lg font-semibold transition-all duration-300
                  ${selectedRole 
                    ? 'text-white cursor-pointer hover:scale-105' 
                    : 'text-gray-500 cursor-not-allowed bg-gray-800/50'
                  }
                `}
                style={selectedRole ? { 
                  background: 'linear-gradient(135deg, #C9A227 0%, #A68521 100%)',
                  boxShadow: '0 10px 30px -10px rgba(201, 162, 39, 0.5)'
                } : {}}
                data-testid="continue-button"
              >
                Continue to Sign In
                <ArrowRight className="w-5 h-5" />
              </button>
              
              <p className="mt-4 text-gray-500 text-sm">
                New to Kinntegraa?{' '}
                <button 
                  onClick={() => navigate("/signup")}
                  className="text-amber-500 hover:text-amber-400 font-medium"
                >
                  Register your interest
                </button>
              </p>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-gray-500">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              <span className="text-sm">Secure Platform</span>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              <span className="text-sm">UAE Licensed</span>
            </div>
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              <span className="text-sm">Professional Grade</span>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-6 px-8 border-t border-white/10">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-center md:text-left">
              <p className="text-gray-400 text-sm font-medium">Kinntegraa LLC-FZ</p>
              <p className="text-gray-500 text-xs">License No: 2418465.01</p>
            </div>
            <p className="text-gray-500 text-xs text-center">
              Meydan Grandstand, 6th floor, Meydan Road, Nad Al Sheba, Dubai, U.A.E.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
