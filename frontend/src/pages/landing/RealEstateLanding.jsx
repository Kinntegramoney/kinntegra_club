import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Building2, 
  ArrowRight,
  CheckCircle,
  MapPin,
  Layers,
  Users,
  TrendingUp,
  Wallet,
  Target,
  Lock,
  Grid,
  Handshake,
  LineChart,
  Landmark,
  BarChart3,
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Home,
  Loader2,
  DollarSign,
  Percent,
  Calendar,
  User,
  Briefcase,
  Eye,
  Award,
  Star,
  PieChart,
  UserCheck,
  Heart,
  Plus,
  Settings,
  Shield
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Cache for real estate data (since it's static)
let cachedRealEstateData = null;

const RealEstateLanding = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(!cachedRealEstateData);
  const [stats, setStats] = useState(cachedRealEstateData?.stats || null);
  const [properties, setProperties] = useState(cachedRealEstateData?.properties || []);
  const [fundedProperties, setFundedProperties] = useState(cachedRealEstateData?.fundedProperties || []);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [propertyTab, setPropertyTab] = useState('available');
  const sliderRef = useRef(null);

  const colors = {
    primary: '#5B373C',
    primaryDark: '#4A2D31',
    primaryDeep: '#3A2327',
    gold: '#C9A227',
    goldLight: '#D4B84A',
    cream: '#F5F3EF',
    white: '#FFFFFF',
    text: '#374151',
    textLight: '#6B7280',
    textMuted: '#9CA3AF',
    border: '#E5E7EB'
  };

  useEffect(() => {
    // Use cached data if available
    if (cachedRealEstateData) {
      setLoading(false);
      return;
    }
    fetchLandingData();
  }, []);

  const fetchLandingData = async () => {
    try {
      const response = await fetch(`${API_URL}/api/public/landing-stats`);
      if (response.ok) {
        const data = await response.json();
        const realEstateData = {
          stats: data.real_estate,
          properties: data.real_estate?.sample_properties || [],
          fundedProperties: data.real_estate?.funded_properties || []
        };
        // Cache the data
        cachedRealEstateData = realEstateData;
        setStats(realEstateData.stats);
        setProperties(realEstateData.properties);
        setFundedProperties(realEstateData.fundedProperties);
      }
    } catch (error) {
      console.error('Error fetching landing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    if (amount >= 1000000) return `AED ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `AED ${(amount / 1000).toFixed(0)}K`;
    return `AED ${amount?.toLocaleString() || 0}`;
  };

  const formatCurrencyShort = (amount) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
    return amount?.toLocaleString() || '0';
  };

  const navItems = [
    { path: '/', label: 'About Us' },
    { path: '/real-estate', label: 'Real Estate', active: true },
    { path: '/bonds', label: 'Unlisted NCDs' },
    { path: '/wealth-planning', label: 'Financial Planning' },
    { path: '/portfolio-analyzer', label: 'MF Analyzer' },
  ];

  // Property Card Component matching internal app
  const PropertyCard = ({ property, isInvested }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    
    const nextImage = (e) => {
      e.stopPropagation();
      if (property.images && property.images.length > 1) {
        setCurrentImageIndex((prev) => (prev + 1) % property.images.length);
      }
    };
    
    const prevImage = (e) => {
      e.stopPropagation();
      if (property.images && property.images.length > 1) {
        setCurrentImageIndex((prev) => (prev - 1 + property.images.length) % property.images.length);
      }
    };

    return (
      <div className="bg-white border border-gray-200 rounded-lg hover:border-amber-600 transition-colors flex flex-col h-full">
        {/* Property Images Carousel */}
        <div className="relative h-44 overflow-hidden rounded-t-lg bg-gray-100 flex-shrink-0">
          {property.images && property.images.length > 0 ? (
            <>
              <img 
                src={property.images[currentImageIndex]?.data 
                  ? `data:${property.images[currentImageIndex]?.content_type || 'image/jpeg'};base64,${property.images[currentImageIndex].data}`
                  : property.images[currentImageIndex]?.url}
                alt={`${property.building_name} - Image ${currentImageIndex + 1}`}
                className="w-full h-full object-cover transition-opacity duration-300"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              
              {property.images.length > 1 && (
                <>
                  <button 
                    onClick={prevImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors z-10"
                  >
                    <ChevronDown className="h-4 w-4 rotate-90" />
                  </button>
                  <button 
                    onClick={nextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors z-10"
                  >
                    <ChevronDown className="h-4 w-4 -rotate-90" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">
                    {currentImageIndex + 1} / {property.images.length}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${colors.cream} 0%, rgba(201, 162, 39, 0.1) 100%)` }}>
              <div className="text-center">
                <Building2 className="h-10 w-10 mx-auto mb-1" style={{ color: colors.gold }} />
                <p className="text-[10px]" style={{ color: colors.textMuted }}>No images</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Card Content */}
        <div className="p-5 flex-1 flex flex-col">
          {/* Header - Property Name */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${colors.gold}20` }}>
                <Building2 className="h-5 w-5" style={{ color: colors.gold }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">{property.building_name}</h3>
                <p className="text-sm text-gray-500">Unit {property.unit_no || 'N/A'} • Floor {property.floor || 'N/A'}</p>
                {property.unit_type && (
                  <p className="text-xs font-medium" style={{ color: colors.primary }}>{property.unit_type}</p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">Off-Plan</span>
              {isInvested ? (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">Invested</span>
              ) : (
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Available</span>
              )}
            </div>
          </div>

          {/* Property Info Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Size</p>
              <p className="font-semibold text-gray-800">{property.total_area?.toLocaleString() || 'N/A'} sqft</p>
            </div>
            <div className="rounded-lg p-3" style={{ backgroundColor: `${colors.gold}10` }}>
              <p className="text-xs text-gray-500 mb-1">Total Cost</p>
              <p className="font-semibold" style={{ color: colors.primary }}>{formatCurrency(property.total_cost)}</p>
            </div>
          </div>

          {/* Price & Returns Info */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Price/sqft</p>
              <p className="font-semibold text-blue-700">
                {property.unit_price ? formatCurrency(property.unit_price) : formatCurrency(property.total_cost / (property.total_area || 1))}
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Expected Sale/sqft</p>
              <p className="font-semibold text-green-700">
                {property.expected_sale_rate ? formatCurrency(property.expected_sale_rate) : 'TBD'}
              </p>
            </div>
          </div>

          {/* Sale Date & XIRR */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-amber-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Expected Sale Date</p>
              <p className="font-semibold text-amber-700">
                {property.estimated_sell_date 
                  ? new Date(property.estimated_sell_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) 
                  : 'TBD'}
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Expected XIRR</p>
              <p className="font-semibold text-purple-700">
                {property.expected_xirr ? `${property.expected_xirr}%` : '~28-32%'}
              </p>
            </div>
          </div>

          {/* Location */}
          {property.location && (
            <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
              <MapPin className="h-4 w-4" />
              {property.location}
            </div>
          )}

          {/* Interest & Confirmed Participants */}
          {!isInvested ? (
            <div className="flex items-center justify-between mb-4 py-3 border-t border-b border-gray-100">
              <div className="text-center flex-1">
                <p className="text-xs text-gray-500">Interested</p>
                <p className="font-bold" style={{ color: colors.gold }}>{property.interested_count || 0}</p>
              </div>
              <div className="w-px h-8 bg-gray-200"></div>
              <div className="text-center flex-1">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <UserCheck className="h-3 w-3 text-emerald-500" />
                  <p className="text-xs text-gray-500">Investors</p>
                </div>
                <p className="font-bold text-emerald-600">
                  {property.current_investors || property.investors?.length || 0}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center mb-4 py-2 bg-emerald-50 rounded-lg border border-emerald-200">
              <UserCheck className="h-4 w-4 text-emerald-600 mr-2" />
              <p className="text-sm font-medium text-emerald-700">
                Fully Invested • {property.current_investors || 4} participants • 100% committed
              </p>
            </div>
          )}

          {/* Payment Schedule Timeline - for available properties */}
          {!isInvested && property.payment_schedule && property.payment_schedule.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1 text-[9px] text-gray-400 mb-2">
                <span>Schedule</span>
                <div className="flex items-center gap-0.5 ml-1">
                  {[12.5, 25, 37.5, 50].map((pct) => (
                    <span key={pct} className="px-1 py-0.5 bg-gray-100 text-gray-500 rounded text-[8px]">{pct}%</span>
                  ))}
                  <span className="px-1 py-0.5 bg-gray-100 text-gray-500 rounded text-[8px]">Custom</span>
                </div>
                <span className="ml-auto px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-[8px]">AED</span>
              </div>
              
              {/* Timeline visualization */}
              <div className="relative">
                <div className="flex items-center justify-between text-[8px] text-gray-400 mb-1">
                  {property.payment_schedule.slice(0, 5).map((payment, idx) => (
                    <span key={idx}>
                      {payment.date ? new Date(payment.date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : ''}
                    </span>
                  ))}
                </div>
                <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="absolute left-0 top-0 h-full rounded-full" 
                    style={{ 
                      backgroundColor: colors.gold, 
                      width: `${(property.payments_completed || 0) / property.payment_schedule.length * 100}%` 
                    }} 
                  />
                  {property.payment_schedule.slice(0, 5).map((_, idx) => (
                    <div 
                      key={idx} 
                      className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white"
                      style={{ 
                        left: `${(idx / (property.payment_schedule.length - 1)) * 100}%`,
                        transform: 'translateX(-50%) translateY(-50%)',
                        backgroundColor: idx < (property.payments_completed || 0) ? colors.gold : '#E5E7EB'
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-[8px] mt-1">
                  {property.payment_schedule.slice(0, 5).map((payment, idx) => (
                    <div key={idx} className="text-center">
                      <span className="font-medium" style={{ color: colors.primary }}>{payment.percentage}%</span>
                      <br />
                      <span className="text-gray-400">
                        {formatCurrencyShort((payment.percentage / 100) * (property.total_cost * 0.25))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-auto flex gap-2">
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
                className="w-full py-2.5 rounded-lg font-semibold cursor-not-allowed flex items-center justify-center gap-2 bg-gray-300 text-white"
              >
                <CheckCircle className="h-4 w-4" />
                Fully Funded
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
      <section className="pt-24 pb-16" style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 50%, ${colors.primaryDeep} 100%)` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6" style={{ backgroundColor: 'rgba(201, 162, 39, 0.2)', border: `1px solid ${colors.gold}` }}>
              <Building2 className="h-4 w-4" style={{ color: colors.gold }} />
              <span style={{ color: colors.gold }} className="text-sm font-medium">About Kinntegraa | Real Estate</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Real Estate Listing
              <span className="block" style={{ color: colors.gold }}>& Distribution Platform</span>
            </h1>
            <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
              A B2B2C platform for brokers to list their properties, manage co-ownership opportunities, 
              and enable their agents to collaborate on sales. Streamline your real estate distribution.
            </p>
          </div>
        </div>
      </section>

      {/* Platform Benefits Section */}
      <section className="py-16" style={{ backgroundColor: colors.white }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold mb-4" style={{ color: colors.text }}>
                  Why List on Kinntegraa?
                </h2>
                <p className="text-lg max-w-3xl mx-auto" style={{ color: colors.textLight }}>
                  Manage your property listings, track agent performance, and streamline co-ownership sales 
                  all in one powerful platform designed for real estate brokerages.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { icon: Lock, title: 'List Your Properties', items: ['Upload property details & images', 'Set co-ownership terms & pricing', 'Define payment schedules', 'Manage multiple listings easily'] },
                  { icon: Target, title: 'Agent Collaboration', items: ['Invite your agents to the platform', 'Track agent-wise sales performance', 'Assign properties to agents', 'Monitor lead conversions'] },
                  { icon: Grid, title: 'Streamlined Operations', items: ['Centralized dashboard for all deals', 'Automated investor communications', 'Document management system', 'Real-time reporting & analytics'] }
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

          {/* How It Works Section */}
          <section className="py-16" style={{ backgroundColor: colors.cream }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="rounded-3xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)` }}>
                <div className="p-8 lg:p-12">
                  <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4" style={{ backgroundColor: 'rgba(201, 162, 39, 0.2)', border: `1px solid ${colors.gold}` }}>
                      <Building2 className="h-4 w-4" style={{ color: colors.gold }} />
                      <span style={{ color: colors.gold }} className="text-sm font-medium">How It Works</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white">Your Properties, Your Agents, Your Platform</h3>
                  </div>
                  
                  <div className="grid lg:grid-cols-2 gap-8 items-start">
                    <div>
                      <div className="p-6 rounded-2xl mb-6" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                        <h4 className="font-bold text-white mb-4">For Brokers</h4>
                        <p className="text-white/80">
                          List your own Dubai properties on Kinntegraa. Set co-ownership terms, define payment schedules, 
                          and let your agent network distribute the opportunities to their clients. 
                          Full control remains with you.
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                          <span className="text-white/70">Your Role</span>
                          <span className="text-white font-bold">Property Owner/Lister</span>
                        </div>
                        <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                          <span className="text-white/70">Platform Role</span>
                          <span className="text-white font-bold">Technology & Distribution</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="p-6 rounded-2xl mb-6" style={{ backgroundColor: 'rgba(201, 162, 39, 0.2)' }}>
                        <h4 className="font-bold text-white mb-4">Platform Features</h4>
                        <ul className="space-y-3">
                          {['List unlimited properties with full details & media', 'Onboard and manage your agent network', 'Track all investor interest and conversions', 'Automated payment schedule management'].map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-white/90">
                              <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.gold }} />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-4 rounded-xl text-center" style={{ backgroundColor: colors.gold }}>
                          <div className="font-bold text-2xl" style={{ color: colors.primary }}>100%</div>
                          <div className="text-xs" style={{ color: colors.primaryDark }}>Your Control</div>
                        </div>
                        <div className="p-4 rounded-xl text-center" style={{ backgroundColor: colors.gold }}>
                          <div className="font-bold text-2xl" style={{ color: colors.primary }}>B2B2C</div>
                          <div className="text-xs" style={{ color: colors.primaryDark }}>Model</div>
                        </div>
                        <div className="p-4 rounded-xl text-center" style={{ backgroundColor: colors.gold }}>
                          <div className="font-bold text-2xl" style={{ color: colors.primary }}>24/7</div>
                          <div className="text-xs" style={{ color: colors.primaryDark }}>Platform Access</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Platform Stats */}
          <section className="py-12" style={{ backgroundColor: colors.white }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold mb-4" style={{ color: colors.text }}>Platform Statistics</h2>
                <p className="text-lg max-w-2xl mx-auto" style={{ color: colors.textLight }}>Live data from properties listed on the platform</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-6 rounded-2xl text-center" style={{ backgroundColor: colors.cream }}>
                  <Wallet className="h-8 w-8 mx-auto mb-3" style={{ color: colors.gold }} />
                  <div className="text-2xl font-bold mb-1" style={{ color: colors.primary }}>{loading ? '...' : formatCurrency(stats?.total_invested || 0)}</div>
                  <div className="text-sm" style={{ color: colors.textLight }}>Total Listed Value</div>
                  <div className="text-xs mt-2 font-medium" style={{ color: colors.gold }}>{loading ? '' : `${stats?.unique_investors || 0} Co-owners`}</div>
                </div>
                <div className="p-6 rounded-2xl text-center" style={{ backgroundColor: colors.cream }}>
                  <Users className="h-8 w-8 mx-auto mb-3" style={{ color: colors.gold }} />
                  <div className="text-2xl font-bold mb-1" style={{ color: colors.primary }}>{loading ? '...' : stats?.unique_investors || 0}</div>
                  <div className="text-sm" style={{ color: colors.textLight }}>Total Co-owners</div>
                </div>
                <div className="p-6 rounded-2xl text-center" style={{ backgroundColor: colors.cream }}>
                  <Building2 className="h-8 w-8 mx-auto mb-3" style={{ color: colors.gold }} />
                  <div className="text-2xl font-bold mb-1" style={{ color: colors.primary }}>{loading ? '...' : stats?.available_properties || 0}</div>
                  <div className="text-sm" style={{ color: colors.textLight }}>Active Listings</div>
                </div>
                <div className="p-6 rounded-2xl text-center" style={{ backgroundColor: colors.primary }}>
                  <Target className="h-8 w-8 mx-auto mb-3" style={{ color: colors.gold }} />
                  <div className="text-2xl font-bold mb-1 text-white">{loading ? '...' : formatCurrency(stats?.min_co_own_amount || 0)}</div>
                  <div className="text-sm text-white/70">Min. Co-ownership Amount</div>
                </div>
              </div>
            </div>
          </section>

          {/* Properties Slider Section */}
          <section id="properties" className="py-16" style={{ backgroundColor: colors.cream }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4" style={{ backgroundColor: `${colors.gold}20` }}>
                  <Eye className="h-4 w-4" style={{ color: colors.gold }} />
                  <span style={{ color: colors.gold }} className="text-sm font-medium">Listed Properties</span>
                </div>
                <h2 className="text-3xl font-bold mb-4" style={{ color: colors.text }}>Current Listings</h2>
                <p style={{ color: colors.textLight }}>Properties listed by brokers for co-ownership distribution</p>
              </div>

              {/* Tabs */}
              <div className="flex justify-center mb-8">
                <div className="inline-flex rounded-full p-1" style={{ backgroundColor: colors.white }}>
                  <button onClick={() => { setPropertyTab('available'); setCurrentSlide(0); }} className="px-6 py-2 rounded-full text-sm font-medium transition-all" style={{ backgroundColor: propertyTab === 'available' ? colors.primary : 'transparent', color: propertyTab === 'available' ? colors.white : colors.textLight }}>
                    Available Properties
                  </button>
                  <button onClick={() => { setPropertyTab('invested'); setCurrentSlide(0); }} className="px-6 py-2 rounded-full text-sm font-medium transition-all" style={{ backgroundColor: propertyTab === 'invested' ? colors.primary : 'transparent', color: propertyTab === 'invested' ? colors.white : colors.textLight }}>
                    Invested/Funded
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-12 w-12 animate-spin" style={{ color: colors.gold }} />
                </div>
              ) : (() => {
                const filteredProperties = propertyTab === 'available' 
                  ? properties
                  : fundedProperties;
                
                return filteredProperties.length > 0 ? (
                  <div className="relative">
                    {/* Slider Navigation */}
                    {filteredProperties.length > 3 && (
                      <>
                        <button onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))} disabled={currentSlide === 0} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 disabled:opacity-50" style={{ backgroundColor: colors.white }}>
                          <ChevronLeft className="h-6 w-6" style={{ color: colors.primary }} />
                        </button>
                        <button onClick={() => setCurrentSlide(Math.min(filteredProperties.length - 3, currentSlide + 1))} disabled={currentSlide >= filteredProperties.length - 3} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 disabled:opacity-50" style={{ backgroundColor: colors.white }}>
                          <ChevronRight className="h-6 w-6" style={{ color: colors.primary }} />
                        </button>
                      </>
                    )}
                    
                    {/* Slider Container */}
                    <div className="overflow-hidden" ref={sliderRef}>
                      <div className="flex transition-transform duration-500 ease-in-out gap-6" style={{ transform: `translateX(-${currentSlide * (100 / 3 + 2)}%)` }}>
                        {filteredProperties.map((property, idx) => (
                          <div key={idx} className="flex-shrink-0 w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]">
                            <PropertyCard property={property} isInvested={propertyTab === 'invested'} />
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Slider Dots */}
                    {filteredProperties.length > 3 && (
                      <div className="flex justify-center gap-2 mt-6">
                        {Array.from({ length: Math.max(1, filteredProperties.length - 2) }).map((_, idx) => (
                          <button key={idx} onClick={() => setCurrentSlide(idx)} className={`w-2.5 h-2.5 rounded-full transition-all ${currentSlide === idx ? 'w-8' : ''}`} style={{ backgroundColor: currentSlide === idx ? colors.gold : colors.textMuted }} />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    {propertyTab === 'available' ? (
                      <>
                        <Building2 className="h-16 w-16 mx-auto mb-4" style={{ color: colors.textMuted }} />
                        <p style={{ color: colors.textLight }}>No properties currently available. Check back soon!</p>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-16 w-16 mx-auto mb-4" style={{ color: colors.textMuted }} />
                        <p style={{ color: colors.textLight }}>No funded properties to display yet.</p>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          </section>

      {/* CTA */}
      <section className="py-16" style={{ backgroundColor: colors.primary }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h3 className="text-2xl font-bold text-white mb-4">Ready to invest in Dubai real estate?</h3>
          <p className="text-white/80 mb-8">Sign up to access property details and start building your portfolio.</p>
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

export default RealEstateLanding;
