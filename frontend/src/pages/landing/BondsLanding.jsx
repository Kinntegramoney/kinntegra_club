import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  TrendingUp,
  ArrowRight,
  CheckCircle,
  Shield,
  Users,
  Wallet,
  ChevronRight,
  ChevronLeft,
  Menu,
  X,
  Loader2,
  Clock,
  Lock,
  UserCheck,
  FileText,
  Calculator,
  Eye,
  Heart
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const BondsLanding = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [bonds, setBonds] = useState([]);
  const [fundedBonds, setFundedBonds] = useState([]);
  const [activeSecurityTab, setActiveSecurityTab] = useState('available');
  const [currentSlide, setCurrentSlide] = useState(0);
  const sliderRef = useRef(null);

  const colors = {
    primary: '#5B373C',
    primaryDark: '#3D252A',
    primaryDeep: '#1F1F1F',
    gold: '#C9A227',
    cream: '#F8F5F0',
    white: '#FFFFFF',
    text: '#374151',
    textLight: '#6B7280',
    textMuted: '#9CA3AF',
    border: '#E5E7EB'
  };

  useEffect(() => {
    fetchLandingData();
  }, []);

  const fetchLandingData = async () => {
    try {
      const response = await fetch(`${API_URL}/api/public/landing-stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
        setBonds(data.bonds.sample_bonds || []);
        setFundedBonds(data.bonds.funded_bonds || []);
      }
    } catch (error) {
      console.error('Error fetching landing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    return `₹${amount?.toLocaleString('en-IN') || 0}`;
  };

  const navItems = [
    { path: '/', label: 'About Us' },
    { path: '/real-estate', label: 'Real Estate' },
    { path: '/bonds', label: 'Unlisted NCDs', active: true },
    { path: '/wealth-planning', label: 'Financial Planning' },
    { path: '/portfolio-analyzer', label: 'MF Analyzer' },
  ];

  // Bond Card Component - Matching internal app exactly
  const BondCard = ({ bond, isInvested }) => {
    const unitsAvailable = (bond.total_units || 1) - (bond.units_sold || 0);
    const daysToMaturity = bond.end_date ? Math.ceil((new Date(bond.end_date) - new Date()) / (1000 * 60 * 60 * 24)) : 0;
    const faceValue = bond.face_value || 100000;
    const todayPrice = faceValue; // Simplified for landing page
    const todayDateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const maturityDate = bond.end_date ? new Date(bond.end_date) : null;

    return (
      <div className="bg-white border border-gray-200 rounded-lg hover:border-amber-600 transition-colors flex flex-col h-full">
        {/* Bond Image/Placeholder Section - matching Real Estate */}
        <div className="relative h-44 overflow-hidden rounded-t-lg flex-shrink-0" style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, #3D2528 100%)` }}>
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <TrendingUp className="h-12 w-12 mx-auto mb-2 text-white/80" />
              <p className="text-white font-semibold text-lg">{bond.name || bond.issuer_name || 'Unlisted NCD'}</p>
              <p className="text-white/60 text-sm mt-1">{bond.bond_code || 'NCD'}</p>
            </div>
          </div>
        </div>
        
        <div className="p-5 flex-1 flex flex-col">
          {/* Header - Bond Name */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${colors.gold}20` }}>
                <TrendingUp className="h-5 w-5" style={{ color: colors.gold }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">{bond.name || bond.issuer_name}</h3>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="px-2 py-1 text-xs font-medium rounded" style={{ backgroundColor: `${colors.gold}20`, color: colors.primary }}>Bond</span>
              {isInvested ? (
                <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">Funded</span>
              ) : (
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Available</span>
              )}
            </div>
          </div>

          {/* Deal ID + Expected IRR */}
          <div className="bg-slate-50 rounded-lg p-3 mb-4 flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500 mb-1">Deal ID</p>
              <p className="font-semibold text-slate-700">{bond.bond_code || 'CDNRE001'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-1">Expected IRR</p>
              <p className="font-semibold text-green-700">{bond.secondary_irr || bond.coupon_rate || 18}%</p>
            </div>
          </div>

          {/* Price/Unit */}
          {!isInvested ? (
            <div className="rounded-lg p-3 mb-4" style={{ backgroundColor: `${colors.gold}10` }}>
              <p className="text-xs text-gray-500 mb-1">Price/Unit ({todayDateStr})</p>
              <p className="font-semibold" style={{ color: colors.primary }}>{formatCurrency(Math.round(todayPrice))}</p>
            </div>
          ) : (
            <div className="bg-emerald-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-500 mb-1">Repayment Progress</p>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-emerald-700 text-lg">
                  {bond.repaid_cashflows_count || 0} / {bond.total_cashflows_count || 12} Repaid
                </p>
                <div className="flex-1 bg-gray-200 rounded-full h-2 ml-2">
                  <div 
                    className="bg-emerald-500 h-2 rounded-full transition-all" 
                    style={{ width: `${((bond.repaid_cashflows_count || 0) / (bond.total_cashflows_count || 12)) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {/* Bond Info Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Face Value/Unit</p>
              <p className="font-semibold text-gray-800">{formatCurrency(faceValue)}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Units Available</p>
              <p className="font-semibold text-purple-700">
                {isInvested ? `${bond.total_units || 100} (Sold)` : `${unitsAvailable} of ${bond.total_units || 100}`}
              </p>
            </div>
          </div>

          {/* Interested / Investors Row */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className={`rounded-lg p-3 text-center ${bond.in_demand ? 'bg-orange-100 border border-orange-300' : 'bg-orange-50'}`}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <p className="text-xs text-gray-500">Interested</p>
                {bond.in_demand && (
                  <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[8px] rounded font-bold animate-pulse">
                    IN DEMAND
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-orange-500">{bond.interested_count || 0}</p>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ backgroundColor: `${colors.primary}10` }}>
              <p className="text-xs text-gray-500 mb-1">Investors</p>
              <p className="text-2xl font-bold" style={{ color: colors.primary }}>
                {bond.unique_investors || bond.investor_count || 0}
              </p>
            </div>
          </div>

          {/* Maturity */}
          {maturityDate && (
            <div className="bg-rose-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-500 mb-1">Maturity Date</p>
              <p className="font-semibold text-rose-700">
                {maturityDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                <span className="text-xs text-gray-500 font-normal ml-2">
                  ({isInvested ? 'Completed' : `${daysToMaturity} days left`})
                </span>
              </p>
            </div>
          )}

          {/* Quick Calculator - Only for available */}
          {!isInvested && (
            <div className="rounded-lg p-3 mb-4" style={{ background: `linear-gradient(90deg, ${colors.cream} 0%, rgba(201, 162, 39, 0.1) 100%)` }}>
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <Calculator className="h-3 w-3" />
                Quick Calculator (Price/Unit: {formatCurrency(Math.round(todayPrice))})
              </p>
              <div className="flex gap-2 items-center">
                <input 
                  type="number" 
                  min="1" 
                  max={unitsAvailable}
                  placeholder="Units"
                  className="w-20 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-amber-400 focus:outline-none"
                />
                <span className="text-gray-400 text-xs">or</span>
                <input 
                  type="text" 
                  placeholder="Amount (₹)"
                  className="w-28 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-amber-400 focus:outline-none"
                />
                <span className="calc-result text-xs text-gray-400 ml-1">Enter units or amount</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {!isInvested ? (
              <>
                <button
                  onClick={() => navigate('/signup')}
                  className="flex-1 py-2.5 rounded-lg font-semibold transition-all hover:opacity-90 flex items-center justify-center gap-2 text-white"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Eye className="h-4 w-4" />
                  View Details
                </button>
                <button
                  onClick={() => navigate('/signup')}
                  className="py-2.5 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-1 border-2 hover:bg-rose-50"
                  style={{ borderColor: '#F43F5E', color: '#F43F5E' }}
                  title="I'm Interested"
                >
                  <Heart className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                disabled
                className="flex-1 py-2.5 rounded-lg font-semibold cursor-not-allowed flex items-center justify-center gap-2 bg-gray-300 text-white"
              >
                <CheckCircle className="h-4 w-4" />
                Fully Subscribed
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.cream }}>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50" style={{ backgroundColor: colors.primary }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: colors.gold }}>
                <span style={{ color: colors.primary }} className="font-bold text-base">K</span>
              </div>
              <span className="text-white font-semibold text-lg tracking-wide">KINNTEGRAA</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm font-medium transition-colors ${
                    item.active ? 'text-white' : 'text-white/70 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <button
                onClick={() => navigate('/login')}
                className="px-5 py-2 rounded-full text-sm font-medium transition-all hover:scale-105"
                style={{ backgroundColor: colors.gold, color: colors.primary }}
              >
                Login
              </button>
            </div>

            <button className="md:hidden text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden" style={{ backgroundColor: colors.primaryDark }}>
            <div className="px-4 py-4 space-y-3">
              {navItems.map(item => (
                <Link key={item.path} to={item.path} className="block text-white/80 hover:text-white py-2 text-sm" onClick={() => setMobileMenuOpen(false)}>
                  {item.label}
                </Link>
              ))}
              <button onClick={() => navigate('/login')} className="w-full py-2 rounded-full text-sm font-medium mt-4" style={{ backgroundColor: colors.gold, color: colors.primary }}>
                Login
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-16" style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6" style={{ backgroundColor: 'rgba(201, 162, 39, 0.2)', border: `1px solid ${colors.gold}` }}>
              <TrendingUp className="h-4 w-4" style={{ color: colors.gold }} />
              <span style={{ color: colors.gold }} className="text-sm font-medium">About Kinntegraa | Unlisted NCDs</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Unlisted NCDs for
              <span className="block" style={{ color: colors.gold }}>Regular Income</span>
            </h1>
            <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
              NRIs can invest on behalf of their resident Indian dependents who need regular 
              cashflow. Collateral-backed debentures with attractive returns and flexible payout options.
            </p>
            <button
              onClick={() => document.getElementById('securities')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 flex items-center gap-2 mx-auto"
              style={{ backgroundColor: colors.gold, color: colors.primary }}
            >
              View Securities
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Why NCDs Section */}
      <section className="py-16" style={{ backgroundColor: colors.white }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4" style={{ color: colors.text }}>Why Invest in Unlisted NCDs?</h2>
            <p className="text-lg max-w-3xl mx-auto" style={{ color: colors.textLight }}>
              Secured fixed-income investments designed for consistent returns and capital protection
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Shield, title: 'Collateral Backed', items: ['Property-backed security', 'Principal protection', 'Legal documentation', 'Registered debentures'] },
              { icon: TrendingUp, title: 'Attractive Returns', items: ['10-13% annual yields', 'Fixed interest rates', 'Monthly/Quarterly payouts', 'Predictable income'] },
              { icon: Clock, title: 'Flexible Tenures', items: ['6 months to 36 months', 'Early exit provisions', 'Reinvestment options', 'Maturity alerts'] }
            ].map((section, idx) => (
              <div key={idx} className="p-8 rounded-2xl" style={{ backgroundColor: colors.cream }}>
                <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-6" style={{ backgroundColor: colors.primary }}>
                  <section.icon className="h-7 w-7 text-white" />
                </div>
                <h4 className="text-xl font-bold mb-3" style={{ color: colors.text }}>{section.title}</h4>
                <ul className="space-y-2">
                  {section.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.gold }} />
                      <span className="text-sm" style={{ color: colors.text }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NRI Investor Example */}
      <section className="py-16" style={{ backgroundColor: colors.cream }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)` }}>
            <div className="p-8 lg:p-12">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4" style={{ backgroundColor: 'rgba(201, 162, 39, 0.2)', border: `1px solid ${colors.gold}` }}>
                  <Users className="h-4 w-4" style={{ color: colors.gold }} />
                  <span style={{ color: colors.gold }} className="text-sm font-medium">For NRI Families</span>
                </div>
                <h3 className="text-2xl font-bold text-white">Help Your Family Get Regular Income</h3>
              </div>
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="p-6 rounded-2xl mb-6" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                    <h4 className="font-bold text-white mb-4">The Scenario</h4>
                    <p className="text-white/80">
                      Rajesh, an NRI in Dubai, wants to provide his retired parents in India with regular monthly 
                      income. Instead of sending money frequently, he invests in NCDs that pay monthly interest 
                      directly to his parents' bank account.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                      <span className="text-white/70">Investment</span>
                      <span className="text-white font-bold">₹25 Lakhs</span>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                      <span className="text-white/70">Monthly Income</span>
                      <span className="text-white font-bold">₹31,250</span>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                      <span className="text-white/70">Annual Yield</span>
                      <span className="text-white font-bold">15% p.a.</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="p-6 rounded-2xl" style={{ backgroundColor: 'rgba(201, 162, 39, 0.2)' }}>
                    <h4 className="font-bold text-white mb-4">Benefits</h4>
                    <ul className="space-y-3">
                      {['Regular monthly income for parents', 'Capital stays secure with collateral backing', 'No hassle of monthly transfers', 'Tax efficient for resident dependents', 'Full transparency via investor portal'].map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-white/90">
                          <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.gold }} />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Securities Slider Section */}
      <section id="securities" className="py-16" style={{ backgroundColor: colors.cream }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4" style={{ color: colors.text }}>
              Unlisted NCD Portfolio
            </h2>
            <p style={{ color: colors.textLight }}>
              Current investment opportunities in collateral-backed unlisted securities
            </p>
          </div>

          {/* Tabs for Available vs Invested */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex rounded-full p-1" style={{ backgroundColor: colors.white }}>
              <button
                onClick={() => { setActiveSecurityTab('available'); setCurrentSlide(0); }}
                className="px-6 py-2 rounded-full text-sm font-medium transition-all"
                style={{ 
                  backgroundColor: activeSecurityTab === 'available' ? colors.primary : 'transparent',
                  color: activeSecurityTab === 'available' ? colors.white : colors.textLight
                }}
              >
                Available
              </button>
              <button
                onClick={() => { setActiveSecurityTab('invested'); setCurrentSlide(0); }}
                className="px-6 py-2 rounded-full text-sm font-medium transition-all"
                style={{ 
                  backgroundColor: activeSecurityTab === 'invested' ? colors.primary : 'transparent',
                  color: activeSecurityTab === 'invested' ? colors.white : colors.textLight
                }}
              >
                Invested/Funded
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin" style={{ color: colors.gold }} />
            </div>
          ) : (() => {
            const filteredBonds = activeSecurityTab === 'available' 
              ? bonds
              : fundedBonds;
            
            return filteredBonds.length > 0 ? (
              <div className="relative">
                {/* Slider Navigation */}
                {filteredBonds.length > 3 && (
                  <>
                    <button onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))} disabled={currentSlide === 0} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 disabled:opacity-50" style={{ backgroundColor: colors.white }}>
                      <ChevronLeft className="h-6 w-6" style={{ color: colors.primary }} />
                    </button>
                    <button onClick={() => setCurrentSlide(Math.min(filteredBonds.length - 3, currentSlide + 1))} disabled={currentSlide >= filteredBonds.length - 3} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 disabled:opacity-50" style={{ backgroundColor: colors.white }}>
                      <ChevronRight className="h-6 w-6" style={{ color: colors.primary }} />
                    </button>
                  </>
                )}
                
                {/* Slider Container */}
                <div className="overflow-hidden" ref={sliderRef}>
                  <div className="flex transition-transform duration-500 ease-in-out gap-6" style={{ transform: `translateX(-${currentSlide * (100 / 3 + 2)}%)` }}>
                    {filteredBonds.map((bond, idx) => (
                      <div key={idx} className="flex-shrink-0 w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]">
                        <BondCard bond={bond} isInvested={activeSecurityTab === 'invested'} />
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Slider Dots */}
                {filteredBonds.length > 3 && (
                  <div className="flex justify-center gap-2 mt-6">
                    {Array.from({ length: Math.max(1, filteredBonds.length - 2) }).map((_, idx) => (
                      <button key={idx} onClick={() => setCurrentSlide(idx)} className={`w-2.5 h-2.5 rounded-full transition-all ${currentSlide === idx ? 'w-8' : ''}`} style={{ backgroundColor: currentSlide === idx ? colors.gold : colors.textMuted }} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                {activeSecurityTab === 'available' ? (
                  <>
                    <Lock className="h-16 w-16 mx-auto mb-4" style={{ color: colors.textMuted }} />
                    <p style={{ color: colors.textLight }}>No securities currently available. Check back soon!</p>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-16 w-16 mx-auto mb-4" style={{ color: colors.textMuted }} />
                    <p style={{ color: colors.textLight }}>No funded securities to display yet.</p>
                  </>
                )}
              </div>
            );
          })()}

          <div className="text-center mt-8">
            <button
              onClick={() => navigate('/signup')}
              className="px-8 py-4 rounded-full font-semibold transition-all hover:scale-105 flex items-center gap-2 mx-auto"
              style={{ backgroundColor: colors.gold, color: colors.primary }}
            >
              View All Securities
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16" style={{ backgroundColor: colors.primary }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h3 className="text-2xl font-bold text-white mb-4">Secure regular income for your family</h3>
          <p className="text-white/80 mb-8">Sign up to explore NCD opportunities and start building a fixed-income portfolio.</p>
          <button
            onClick={() => navigate('/signup')}
            className="px-8 py-4 rounded-full font-semibold transition-all hover:scale-105"
            style={{ backgroundColor: colors.gold, color: colors.primary }}
          >
            Sign Up for Free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: colors.primaryDeep }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-white/60 text-sm">© 2026 Kinntegraa L.L.C-FZ. All rights reserved.</p>
            <div className="flex gap-6">
              {navItems.map(item => (
                <Link key={item.path} to={item.path} className="text-white/60 text-sm hover:text-white">{item.label}</Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default BondsLanding;
