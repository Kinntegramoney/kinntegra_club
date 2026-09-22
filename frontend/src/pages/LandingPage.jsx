import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Building2,
  Users,
  TrendingUp,
  MapPin,
  Mail,
  Phone,
  ArrowRight,
  Shield,
  Briefcase,
  BarChart3,
  Menu,
  X,
  ChevronDown,
  UserCircle2,
  Home,
  Wallet,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const LOGIN_OPTIONS = [
  { type: 'private_investor', label: 'Private Investors', icon: UserCircle2, hint: 'PAN / Passport' },
  { type: 'real_estate_partner', label: 'Real Estate Brokers', icon: Home, hint: 'RERA License No.' },
  { type: 'mfd_ria_partner', label: 'MFD/RIA', icon: Wallet, hint: 'Partner Code' },
];

const LandingPage = () => {
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
    { path: '/', label: 'About Us', active: true },
    { path: '/real-estate-brokers', label: 'Real Estate Brokers' },
    { path: '/mf-distributors', label: 'MFD/RIA' },
    { path: '/private-investors', label: 'Private Investors' },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.cream }}>
      {/* Navigation Header */}
      <nav style={{ backgroundColor: colors.primary }}>
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
                  style={item.active ? { borderBottom: `2px solid ${colors.gold}`, paddingBottom: '4px' } : {}}
                >
                  {item.label}
                </Link>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="px-5 py-2 rounded-full text-sm font-semibold transition-all hover:scale-105 flex items-center gap-2"
                    style={{ backgroundColor: colors.gold, color: colors.primary }}
                    data-testid="desktop-login-trigger"
                  >
                    Login
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 bg-white shadow-xl border border-gray-100 rounded-xl p-1">
                  {LOGIN_OPTIONS.map(({ type, label, icon: Icon, hint }) => (
                    <DropdownMenuItem
                      key={type}
                      onSelect={() => navigate(`/login?type=${type}`)}
                      className="cursor-pointer py-2.5 px-3 rounded-lg focus:bg-teal-50 focus:text-teal-900"
                      data-testid={`desktop-login-${type}`}
                    >
                      <Icon className="h-4 w-4 text-teal-600" />
                      <div className="ml-2 flex flex-col">
                        <span className="text-sm font-semibold">{label}</span>
                        <span className="text-[11px] text-gray-400">{hint}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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
              <div className="mt-4 border-t border-white/10 pt-3 space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-white/40 px-1">Login as</p>
                {LOGIN_OPTIONS.map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => { setMobileMenuOpen(false); navigate(`/login?type=${type}`); }}
                    className="w-full flex items-center gap-2 py-2 px-2 rounded-lg text-sm text-white/80 hover:bg-white/10 hover:text-white"
                    data-testid={`mobile-login-${type}`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="py-16" style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 50%, ${colors.primaryDeep} 100%)` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Investment & Financial
              <span className="block" style={{ color: colors.gold }}>Consultancy Platform</span>
            </h1>
            <p className="text-lg text-white/80 max-w-2xl mx-auto">
              Connecting investors with opportunities in Dubai real estate, unlisted NCDs, 
              and comprehensive financial planning tools.
            </p>
          </div>
        </div>
      </section>

      {/* Who We Are Section */}
      <section className="py-16" style={{ backgroundColor: colors.white }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold mb-8" style={{ color: colors.text }}>Who We Are</h2>
          
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <p className="text-lg mb-6" style={{ color: colors.textLight }}>
                <strong style={{ color: colors.text }}>Kinntegraa L.L.C-FZ</strong> is a Dubai-based company licensed by 
                Meydan Free Zone, United Arab Emirates.
              </p>
              <p className="mb-6" style={{ color: colors.textLight }}>
                We operate as an Investment Consultancy, Financial Consultancy, and Commercial Brokerage firm, 
                providing technology-enabled solutions for wealth creation and distribution.
              </p>
              <p style={{ color: colors.textLight }}>
                Our platform serves as a bridge connecting investors with curated investment opportunities 
                while enabling brokers and distributors to efficiently manage and distribute their offerings.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 rounded-xl" style={{ backgroundColor: colors.cream }}>
                <p className="text-2xl font-bold mb-1" style={{ color: colors.gold }}>2418465.01</p>
                <p className="text-sm" style={{ color: colors.textLight }}>License Number</p>
              </div>
              <div className="p-6 rounded-xl" style={{ backgroundColor: colors.cream }}>
                <p className="text-2xl font-bold mb-1" style={{ color: colors.gold }}>Dubai, UAE</p>
                <p className="text-sm" style={{ color: colors.textLight }}>Meydan Free Zone</p>
              </div>
              <div className="col-span-2 p-6 rounded-xl" style={{ backgroundColor: colors.cream }}>
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 mt-1" style={{ color: colors.gold }} />
                  <div>
                    <p className="font-semibold" style={{ color: colors.text }}>Meydan Grandstand, 6th Floor</p>
                    <p style={{ color: colors.textLight }}>Meydan Road, Nad Al Sheba, Dubai, U.A.E.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Services Section */}
      <section className="py-16" style={{ backgroundColor: colors.cream }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4" style={{ color: colors.text }}>Our Services</h2>
            <p style={{ color: colors.textLight }}>As per our Meydan Free Zone license, we provide the following services</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Investment Consultancy */}
            <div className="p-8 rounded-2xl" style={{ backgroundColor: colors.white }}>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-6" style={{ backgroundColor: colors.gold }}>
                <TrendingUp className="h-6 w-6" style={{ color: colors.primary }} />
              </div>
              <h3 className="text-xl font-bold mb-4" style={{ color: colors.text }}>Investment Consultancy</h3>
              <p style={{ color: colors.textLight }}>
                Expert guidance on investment strategies, portfolio construction, and wealth management 
                tailored to your financial goals.
              </p>
            </div>
            
            {/* Financial Consultancy */}
            <div className="p-8 rounded-2xl" style={{ backgroundColor: colors.white }}>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-6" style={{ backgroundColor: colors.gold }}>
                <BarChart3 className="h-6 w-6" style={{ color: colors.primary }} />
              </div>
              <h3 className="text-xl font-bold mb-4" style={{ color: colors.text }}>Financial Consultancy</h3>
              <p style={{ color: colors.textLight }}>
                Comprehensive financial planning, cash flow projections, and retirement planning services 
                for long-term wealth creation.
              </p>
            </div>
            
            {/* Commercial Brokerage */}
            <div className="p-8 rounded-2xl" style={{ backgroundColor: colors.white }}>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-6" style={{ backgroundColor: colors.gold }}>
                <Briefcase className="h-6 w-6" style={{ color: colors.primary }} />
              </div>
              <h3 className="text-xl font-bold mb-4" style={{ color: colors.text }}>Commercial Brokerage</h3>
              <p style={{ color: colors.textLight }}>
                B2B2C platform enabling brokers to list properties, distributors to offer products, 
                and agents to collaborate on distribution.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who We Serve Section */}
      <section className="py-16" style={{ backgroundColor: colors.white }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4" style={{ color: colors.text }}>Who We Serve</h2>
            <p style={{ color: colors.textLight }}>Our platform caters to diverse stakeholders in the investment ecosystem</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Private Investors */}
            <Link 
              to="/private-investors"
              className="p-8 rounded-2xl transition-all hover:shadow-lg hover:scale-[1.02] cursor-pointer block"
              style={{ backgroundColor: colors.cream }}
            >
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-6" style={{ backgroundColor: colors.primary }}>
                <Users className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3" style={{ color: colors.text }}>Private Investors</h3>
              <p className="mb-4" style={{ color: colors.textLight }}>
                NRIs, foreign investors, and resident Indians looking for real estate, NCDs, 
                and financial planning tools.
              </p>
              <div className="flex items-center gap-2" style={{ color: colors.gold }}>
                <span className="font-semibold">Learn More</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
            
            {/* Real Estate Brokers */}
            <Link 
              to="/real-estate-brokers"
              className="p-8 rounded-2xl transition-all hover:shadow-lg hover:scale-[1.02] cursor-pointer block"
              style={{ backgroundColor: colors.cream }}
            >
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-6" style={{ backgroundColor: colors.primary }}>
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3" style={{ color: colors.text }}>Real Estate Brokers</h3>
              <p className="mb-4" style={{ color: colors.textLight }}>
                List your properties, manage co-ownership opportunities, and collaborate 
                with your agent network.
              </p>
              <div className="flex items-center gap-2" style={{ color: colors.gold }}>
                <span className="font-semibold">Learn More</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
            
            {/* MFD/RIA */}
            <Link 
              to="/mf-distributors"
              className="p-8 rounded-2xl transition-all hover:shadow-lg hover:scale-[1.02] cursor-pointer block"
              style={{ backgroundColor: colors.cream }}
            >
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-6" style={{ backgroundColor: colors.primary }}>
                <Shield className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3" style={{ color: colors.text }}>MFD/RIA</h3>
              <p className="mb-4" style={{ color: colors.textLight }}>
                Analyze client portfolios, offer NCDs, and provide comprehensive 
                financial planning services.
              </p>
              <div className="flex items-center gap-2" style={{ color: colors.gold }}>
                <span className="font-semibold">Learn More</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16" style={{ backgroundColor: colors.primary }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Visit Us */}
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">Visit Us</h4>
              <p className="text-white/80">
                Meydan Grandstand, 6th Floor<br />
                Meydan Road, Nad Al Sheba<br />
                Dubai, U.A.E.
              </p>
            </div>
            
            {/* Email Us */}
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">Email Us</h4>
              <a href="mailto:updates@kinntegraa.club" className="text-white/80 hover:text-white">
                updates@kinntegraa.club
              </a>
            </div>
            
            {/* Call Us */}
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">Call Us</h4>
              <p className="text-white/80">
                +971-502381689<br />
                <span className="text-sm">Mon - Fri, 9am - 6pm GST</span>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
