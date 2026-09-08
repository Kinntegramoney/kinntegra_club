import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Calculator,
  ArrowRight,
  CheckCircle,
  BarChart3,
  Target,
  TrendingUp,
  Menu,
  X,
  Users,
  Wallet,
  PieChart,
  LineChart,
  FileText,
  Clock,
  Shield
} from 'lucide-react';

const WealthPlanningLanding = () => {
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
    { path: '/wealth-planning', label: 'Financial Planning', active: true },
    { path: '/portfolio-analyzer', label: 'MF Analyzer' },
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
              <Calculator className="h-4 w-4" style={{ color: colors.gold }} />
              <span style={{ color: colors.gold }} className="text-sm font-medium">About Kinntegraa | Financial Planning</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Know Exactly How Long
              <span className="block" style={{ color: colors.gold }}>Your Wealth Will Last</span>
            </h1>
            <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
              Our comprehensive data gathering and analysis tool helps you understand your complete financial picture — 
              income, expenses, goals, and investments — to project your wealth trajectory for decades.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <button
                onClick={() => navigate('/login')}
                className="px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 flex items-center justify-center gap-2"
                style={{ backgroundColor: colors.gold, color: colors.primary }}
              >
                Start Planning
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl backdrop-blur-sm" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <BarChart3 className="h-6 w-6 mb-2 mx-auto" style={{ color: colors.gold }} />
                <div className="text-xl font-bold text-white">30+</div>
                <div className="text-white/60 text-xs">Year Projections</div>
              </div>
              <div className="p-5 rounded-2xl backdrop-blur-sm" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <Users className="h-6 w-6 mb-2 mx-auto" style={{ color: colors.gold }} />
                <div className="text-xl font-bold text-white">Family</div>
                <div className="text-white/60 text-xs">Wide Analysis</div>
              </div>
              <div className="p-5 rounded-2xl backdrop-blur-sm" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <Target className="h-6 w-6 mb-2 mx-auto" style={{ color: colors.gold }} />
                <div className="text-xl font-bold text-white">Goals</div>
                <div className="text-white/60 text-xs">Based Planning</div>
              </div>
              <div className="p-5 rounded-2xl backdrop-blur-sm" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <LineChart className="h-6 w-6 mb-2 mx-auto" style={{ color: colors.gold }} />
                <div className="text-xl font-bold text-white">Real-time</div>
                <div className="text-white/60 text-xs">Simulations</div>
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
              Comprehensive Financial Planning
            </h2>
            <p className="text-lg max-w-3xl mx-auto" style={{ color: colors.textLight }}>
              Input your income sources, expenses, financial goals, and existing investments 
              for a complete picture of your family's financial future.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="p-8 rounded-2xl text-center" style={{ backgroundColor: colors.cream }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: colors.primary }}>
                <BarChart3 className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3" style={{ color: colors.text }}>Comprehensive Analysis</h3>
              <p style={{ color: colors.textLight }}>
                Input your income sources, expenses, financial goals, and existing investments for a complete picture.
              </p>
            </div>
            <div className="p-8 rounded-2xl text-center" style={{ backgroundColor: colors.cream }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: colors.primary }}>
                <Target className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3" style={{ color: colors.text }}>Wealth Projection</h3>
              <p style={{ color: colors.textLight }}>
                See year-by-year projections of your portfolio with different allocation scenarios and return assumptions.
              </p>
            </div>
            <div className="p-8 rounded-2xl text-center" style={{ backgroundColor: colors.cream }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: colors.primary }}>
                <TrendingUp className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3" style={{ color: colors.text }}>Required Returns</h3>
              <p style={{ color: colors.textLight }}>
                Discover exactly what returns your portfolio needs to achieve your goals and last through retirement.
              </p>
            </div>
          </div>

          {/* Data Gathering Modules */}
          <div className="p-8 rounded-2xl mb-16" style={{ backgroundColor: colors.cream }}>
            <h3 className="text-2xl font-bold mb-8 text-center" style={{ color: colors.primary }}>
              Complete Data Gathering Modules
            </h3>
            <div className="grid md:grid-cols-5 gap-4">
              {[
                { icon: Users, title: 'Family Members', desc: 'All family details' },
                { icon: Wallet, title: 'Income Sources', desc: 'Salary, rental, business' },
                { icon: FileText, title: 'Expenses', desc: 'Monthly & yearly expenses' },
                { icon: Target, title: 'Financial Goals', desc: 'Short & long term' },
                { icon: PieChart, title: 'Investments', desc: 'Current portfolio' }
              ].map((item, idx) => (
                <div key={idx} className="p-4 rounded-xl text-center" style={{ backgroundColor: colors.white }}>
                  <item.icon className="h-8 w-8 mx-auto mb-3" style={{ color: colors.gold }} />
                  <div className="font-semibold text-sm" style={{ color: colors.text }}>{item.title}</div>
                  <div className="text-xs" style={{ color: colors.textMuted }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Simulator Preview */}
      <section className="py-16" style={{ backgroundColor: colors.cream }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl overflow-hidden shadow-2xl" style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 50%, ${colors.primaryDeep} 100%)` }}>
            <div className="p-8 lg:p-12">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-4">Allocation Simulator</h3>
                  <p className="text-white/70 mb-6">
                    Test different equity-debt allocations and see how long your wealth will sustain. 
                    Get instant projections based on your actual financial data.
                  </p>
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                      <span className="text-white">Current Portfolio</span>
                      <span className="font-bold" style={{ color: colors.gold }}>₹6.55 Cr</span>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                      <span className="text-white">Allocation</span>
                      <span className="font-bold" style={{ color: colors.gold }}>80% Equity / 20% Debt</span>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                      <span className="text-white">Portfolio Lasts Until</span>
                      <span className="font-bold text-green-400">2054 (Age 81)</span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/login')}
                    className="px-8 py-4 rounded-full font-semibold transition-all hover:scale-105 flex items-center gap-2"
                    style={{ backgroundColor: colors.gold, color: colors.primary }}
                  >
                    Try the Calculator
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </div>
                <div className="hidden lg:block">
                  <div className="relative h-64">
                    <svg viewBox="0 0 400 200" className="w-full h-full">
                      <line x1="50" y1="20" x2="50" y2="180" stroke="rgba(255,255,255,0.1)" />
                      <line x1="50" y1="180" x2="380" y2="180" stroke="rgba(255,255,255,0.1)" />
                      <path 
                        d="M50,150 Q100,140 150,120 T250,80 T350,140" 
                        fill="none" 
                        stroke={colors.gold} 
                        strokeWidth="3"
                      />
                      <path 
                        d="M50,150 Q100,140 150,120 T250,80 T350,140 L350,180 L50,180 Z" 
                        fill={`${colors.gold}20`}
                      />
                      <circle cx="50" cy="150" r="6" fill={colors.gold} />
                      <circle cx="150" cy="120" r="6" fill={colors.gold} />
                      <circle cx="250" cy="80" r="6" fill={colors.gold} />
                      <circle cx="350" cy="140" r="6" fill={colors.gold} />
                      <text x="50" y="195" fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="middle">2026</text>
                      <text x="150" y="195" fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="middle">2036</text>
                      <text x="250" y="195" fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="middle">2046</text>
                      <text x="350" y="195" fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="middle">2056</text>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-16" style={{ backgroundColor: colors.white }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4" style={{ color: colors.text }}>
              Why Use Our Planning Tool?
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: Clock, title: 'Know Your Runway', desc: 'See exactly how many years your current wealth will last with different spending patterns.' },
              { icon: Target, title: 'Goal-Based Planning', desc: 'Map your financial goals and see if your current trajectory will achieve them.' },
              { icon: PieChart, title: 'Allocation Scenarios', desc: 'Test different equity/debt allocations and their impact on your wealth longevity.' },
              { icon: Shield, title: 'Risk Assessment', desc: 'Understand the risk profile of your current investments and optimize accordingly.' },
              { icon: FileText, title: 'Professional Reports', desc: 'Download comprehensive PDF and Excel reports for your financial planning.' },
              { icon: TrendingUp, title: 'Return Analysis', desc: 'Calculate the required returns needed to achieve your financial independence.' }
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
          <h3 className="text-2xl font-bold text-white mb-4">Ready to Plan Your Financial Future?</h3>
          <p className="text-white/80 mb-8">
            Get a clear picture of your family's wealth trajectory with our comprehensive planning tool.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-10 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105"
            style={{ backgroundColor: colors.gold, color: colors.primary }}
          >
            Start Planning Now
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

export default WealthPlanningLanding;
