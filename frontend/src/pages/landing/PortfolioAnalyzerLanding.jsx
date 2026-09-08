import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  PieChart,
  ArrowRight,
  CheckCircle,
  BarChart3,
  TrendingUp,
  Menu,
  X,
  LineChart,
  Layers,
  RefreshCw,
  Search,
  FileText,
  Zap,
  Target,
  AlertTriangle
} from 'lucide-react';

const PortfolioAnalyzerLanding = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const colors = {
    primary: '#5B373C',
    primaryDark: '#3D252A',
    primaryDeep: '#1F1F1F',
    gold: '#C9A227',
    cream: '#F8F5F0',
    white: '#FFFFFF',
    text: '#374151',
    textLight: '#6B7280',
    textMuted: '#9CA3AF'
  };

  const navItems = [
    { path: '/', label: 'About Us' },
    { path: '/real-estate', label: 'Real Estate' },
    { path: '/bonds', label: 'Unlisted NCDs' },
    { path: '/wealth-planning', label: 'Financial Planning' },
    { path: '/portfolio-analyzer', label: 'MF Analyzer', active: true }
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.cream }}>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50" style={{ backgroundColor: colors.primary }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: colors.gold }}>
                <span className="text-white font-bold text-lg">K</span>
              </div>
              <span className="text-white font-semibold text-xl tracking-wide">KINNTEGRAA</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm font-medium transition-colors ${
                    item.active ? 'text-white' : 'text-white/70 hover:text-white'
                  }`}
                  style={{ borderBottom: item.active ? `2px solid ${colors.gold}` : 'none', paddingBottom: '4px' }}
                >
                  {item.label}
                </Link>
              ))}
              <button
                onClick={() => navigate('/login')}
                className="px-5 py-2 rounded-full text-sm font-semibold transition-all hover:scale-105"
                style={{ backgroundColor: colors.gold, color: colors.primary }}
              >
                Login
              </button>
            </div>

            <button
              className="md:hidden text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden" style={{ backgroundColor: colors.primaryDark }}>
            <div className="px-4 py-4 space-y-3">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="block w-full text-left text-white/80 hover:text-white py-2 text-sm"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2 rounded-full text-sm font-semibold mt-4"
                style={{ backgroundColor: colors.gold, color: colors.primary }}
              >
                Login
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-16" style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 50%, ${colors.primaryDeep} 100%)` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6" style={{ backgroundColor: 'rgba(201, 162, 39, 0.2)', border: `1px solid ${colors.gold}` }}>
              <PieChart className="h-4 w-4" style={{ color: colors.gold }} />
              <span style={{ color: colors.gold }} className="text-sm font-medium">About Kinntegraa | MF Analyzer</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              One Dashboard for
              <span className="block" style={{ color: colors.gold }}>All Your Mutual Funds</span>
            </h1>
            <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
              Consolidate your mutual fund holdings across multiple MFDs and brokers. 
              Get unified analytics, performance tracking, and intelligent insights for your entire MF portfolio.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <button
                onClick={() => navigate('/login')}
                className="px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 flex items-center justify-center gap-2"
                style={{ backgroundColor: colors.gold, color: colors.primary }}
              >
                Analyze My Portfolio
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl backdrop-blur-sm" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <RefreshCw className="h-6 w-6 mb-2 mx-auto" style={{ color: colors.gold }} />
                <div className="text-xl font-bold text-white">Real-time</div>
                <div className="text-white/60 text-xs">NAV Updates</div>
              </div>
              <div className="p-5 rounded-2xl backdrop-blur-sm" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <Layers className="h-6 w-6 mb-2 mx-auto" style={{ color: colors.gold }} />
                <div className="text-xl font-bold text-white">Multi-MFD</div>
                <div className="text-white/60 text-xs">Consolidation</div>
              </div>
              <div className="p-5 rounded-2xl backdrop-blur-sm" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <TrendingUp className="h-6 w-6 mb-2 mx-auto" style={{ color: colors.gold }} />
                <div className="text-xl font-bold text-white">XIRR</div>
                <div className="text-white/60 text-xs">Performance</div>
              </div>
              <div className="p-5 rounded-2xl backdrop-blur-sm" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <Search className="h-6 w-6 mb-2 mx-auto" style={{ color: colors.gold }} />
                <div className="text-xl font-bold text-white">Overlap</div>
                <div className="text-white/60 text-xs">Analysis</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16" style={{ backgroundColor: colors.white }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4" style={{ color: colors.text }}>
              Complete Portfolio Intelligence
            </h2>
            <p className="text-lg max-w-3xl mx-auto" style={{ color: colors.textLight }}>
              Get deep insights into your mutual fund portfolio with advanced analytics and actionable recommendations.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <div className="p-8 rounded-2xl" style={{ backgroundColor: colors.cream }}>
              <h3 className="text-xl font-bold mb-6" style={{ color: colors.primary }}>Key Features</h3>
              <ul className="space-y-4">
                {[
                  'Import from CAMS, KFintech, and all major platforms',
                  'Real-time NAV updates and portfolio valuation',
                  'Category-wise allocation and overlap analysis',
                  'XIRR calculation and benchmark comparison',
                  'Stock-level exposure across all funds',
                  'Gap analysis for portfolio optimization'
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: colors.gold }} />
                    <span style={{ color: colors.text }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-8 rounded-2xl" style={{ backgroundColor: colors.cream }}>
              <h3 className="text-xl font-bold mb-6" style={{ color: colors.primary }}>How It Works</h3>
              <div className="space-y-6">
                {[
                  { step: 1, title: 'Connect Accounts', desc: 'Upload CAS statements or connect via CAMS/KFintech' },
                  { step: 2, title: 'Auto-Sync Data', desc: 'Portfolio data is automatically fetched and updated' },
                  { step: 3, title: 'View Analytics', desc: 'See comprehensive portfolio analysis and insights' },
                  { step: 4, title: 'Optimize Portfolio', desc: 'Get actionable recommendations for better returns' }
                ].map((item, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                      style={{ backgroundColor: colors.primary }}>
                      {item.step}
                    </div>
                    <div>
                      <div className="font-semibold" style={{ color: colors.text }}>{item.title}</div>
                      <div className="text-sm" style={{ color: colors.textLight }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio Preview */}
      <section className="py-16" style={{ backgroundColor: colors.cream }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6" style={{ color: colors.text }}>
                See Your Complete Portfolio
              </h2>
              <p className="mb-8" style={{ color: colors.textLight }}>
                Get a bird's eye view of your mutual fund investments with category-wise allocation, 
                performance metrics, and intelligent insights.
              </p>

              <div className="space-y-4">
                {[
                  { icon: PieChart, title: 'Asset Allocation', desc: 'Visual breakdown by category, cap, and sector' },
                  { icon: TrendingUp, title: 'Performance Tracking', desc: 'XIRR, absolute returns, and benchmark comparison' },
                  { icon: AlertTriangle, title: 'Overlap Detection', desc: 'Find duplicate stock holdings across funds' },
                  { icon: Target, title: 'Rebalancing Alerts', desc: 'Get notified when allocation drifts from target' }
                ].map((item, idx) => (
                  <div key={idx} className="flex gap-4 p-4 rounded-xl" style={{ backgroundColor: colors.white }}>
                    <item.icon className="h-6 w-6 flex-shrink-0" style={{ color: colors.gold }} />
                    <div>
                      <div className="font-semibold" style={{ color: colors.text }}>{item.title}</div>
                      <div className="text-sm" style={{ color: colors.textLight }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 rounded-3xl shadow-2xl" style={{ backgroundColor: colors.white }}>
              <h4 className="font-bold text-lg mb-6" style={{ color: colors.text }}>Portfolio Overview</h4>
              
              <div className="flex items-center gap-8 mb-8">
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#E5E7EB" strokeWidth="20" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke={colors.primary} strokeWidth="20" 
                      strokeDasharray="150.8 251.3" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke={colors.gold} strokeWidth="20" 
                      strokeDasharray="62.8 251.3" strokeDashoffset="-150.8" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#10B981" strokeWidth="20" 
                      strokeDasharray="37.7 251.3" strokeDashoffset="-213.6" />
                  </svg>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: colors.primary }}></div>
                    <span style={{ color: colors.textLight }}>Large Cap (60%)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: colors.gold }}></div>
                    <span style={{ color: colors.textLight }}>Mid Cap (25%)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: '#10B981' }}></div>
                    <span style={{ color: colors.textLight }}>Small Cap (15%)</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: colors.cream }}>
                  <div>
                    <div className="font-medium" style={{ color: colors.text }}>Axis Bluechip Fund</div>
                    <div className="text-sm" style={{ color: colors.textMuted }}>Large Cap • Direct</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold" style={{ color: colors.text }}>₹12.5L</div>
                    <div className="text-sm text-green-600">+18.5% XIRR</div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: colors.cream }}>
                  <div>
                    <div className="font-medium" style={{ color: colors.text }}>HDFC Mid-Cap Opp</div>
                    <div className="text-sm" style={{ color: colors.textMuted }}>Mid Cap • Direct</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold" style={{ color: colors.text }}>₹8.2L</div>
                    <div className="text-sm text-green-600">+24.3% XIRR</div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: colors.cream }}>
                  <div>
                    <div className="font-medium" style={{ color: colors.text }}>Nippon Small Cap</div>
                    <div className="text-sm" style={{ color: colors.textMuted }}>Small Cap • Direct</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold" style={{ color: colors.text }}>₹4.8L</div>
                    <div className="text-sm text-green-600">+32.1% XIRR</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Analysis Types */}
      <section className="py-16" style={{ backgroundColor: colors.white }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4" style={{ color: colors.text }}>
              Advanced Analysis Tools
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: PieChart, title: 'Asset Allocation', desc: 'Category-wise breakdown of your entire portfolio with rebalancing suggestions.' },
              { icon: Search, title: 'Overlap Analysis', desc: 'Identify duplicate stock holdings across multiple funds to avoid concentration risk.' },
              { icon: BarChart3, title: 'Performance Attribution', desc: 'Understand which funds and stocks drove your returns or losses.' },
              { icon: Target, title: 'Gap Analysis', desc: 'Find gaps in your portfolio compared to ideal allocation models.' },
              { icon: FileText, title: 'Tax Harvesting', desc: 'Identify opportunities for tax-loss harvesting and LTCG optimization.' },
              { icon: Zap, title: 'Smart Recommendations', desc: 'AI-powered suggestions for portfolio optimization and fund switches.' }
            ].map((item, idx) => (
              <div key={idx} className="p-6 rounded-2xl" style={{ backgroundColor: colors.cream }}>
                <item.icon className="h-10 w-10 mb-4" style={{ color: colors.gold }} />
                <h4 className="font-bold text-lg mb-2" style={{ color: colors.text }}>{item.title}</h4>
                <p className="text-sm" style={{ color: colors.textLight }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16" style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)` }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h3 className="text-2xl font-bold text-white mb-4">Ready to Optimize Your Portfolio?</h3>
          <p className="text-white/80 mb-8">
            Get complete visibility into your mutual fund investments with our powerful analyzer.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-10 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
            style={{ backgroundColor: colors.gold, color: colors.primary }}
          >
            Analyze My Portfolio
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: `linear-gradient(135deg, ${colors.primaryDark} 0%, ${colors.primaryDeep} 100%)` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-white/40 text-sm">
              © 2026 Kinntegraa L.L.C-FZ. All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link to="/" className="text-white/40 text-sm hover:text-white/60">Home</Link>
              <span className="text-white/40 text-sm hover:text-white/60 cursor-pointer">Privacy Policy</span>
              <span className="text-white/40 text-sm hover:text-white/60 cursor-pointer">Terms of Service</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PortfolioAnalyzerLanding;
