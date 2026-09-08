import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Building2, 
  Users,
  CheckCircle,
  Target,
  DollarSign,
  TrendingUp,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Eye,
  Wallet,
  BarChart3,
  Handshake,
  ArrowRight,
  Menu,
  X,
  ChevronRight,
  Building,
  UserCheck,
  FileText,
  Calculator,
  Zap,
  Award,
  RefreshCw,
  PieChart,
  Banknote,
  Scale,
  Home,
  MapPin,
  Gavel,
  Search,
  Settings
} from 'lucide-react';

const RealEstateBrokersPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('brokers');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedChallenge, setExpandedChallenge] = useState(null);

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
    danger: '#DC2626',
    success: '#059669'
  };

  const navItems = [
    { path: '/', label: 'About Us' },
    { path: '/real-estate-brokers', label: 'Real Estate Brokers', active: true },
    { path: '/mf-distributors', label: 'MFD/RIA' },
    { path: '/private-investors', label: 'Private Investors' },
  ];

  // Challenges with Developers
  const developerChallenges = [
    {
      icon: Clock,
      challenge: 'Delayed Payments & Commissions',
      pain: 'Late or partial commission payments, especially on off-plan projects',
      solution: 'Quick closures through fractional aggregation lead to commissions paid on time',
      metric: 'Commission on closing'
    },
    {
      icon: Target,
      challenge: 'Limited Inventory Access',
      pain: 'No priority access to premium units or special pricing at launch',
      solution: 'Better opportunity to get allocation when new projects launch through aggregated demand',
      metric: 'Priority access'
    },
    {
      icon: DollarSign,
      challenge: 'Strict Sales Targets',
      pain: 'High monthly targets that are hard to meet with traditional sales',
      solution: 'Better pricing and deals when timely closures are achieved consistently',
      metric: 'Volume bonuses'
    },
    {
      icon: FileText,
      challenge: 'Complex Contract Terms',
      pain: 'Off-plan contracts are complex, making it hard to explain or close deals',
      solution: 'Standardized fractional ownership structure simplifies client conversations',
      metric: 'Faster closures'
    },
    {
      icon: RefreshCw,
      challenge: 'Changing Project Timelines',
      pain: 'Delays in project delivery affect broker credibility and client trust',
      solution: 'Transparent payment tracking visible to all stakeholders builds trust',
      metric: 'Client retention'
    },
    {
      icon: Users,
      challenge: 'Competition with In-house Teams',
      pain: 'Developers\' in-house sales teams compete directly with external brokers',
      solution: 'Aggregated demand from multiple clients gives brokers competitive edge',
      metric: 'Deal priority'
    }
  ];

  // Challenges with Agents
  const agentChallenges = [
    {
      icon: Zap,
      challenge: 'Slow Sales Cycles',
      pain: 'Long time to close deals, especially for premium properties',
      solution: 'Quicker sales through fractional ownership - multiple smaller tickets close faster',
      metric: '3x faster closures'
    },
    {
      icon: TrendingUp,
      challenge: 'Low Lead Conversion',
      pain: 'Many qualified leads can\'t afford full ownership, leading to lost opportunities',
      solution: 'Better conversion of leads - even budget-constrained clients can participate',
      metric: '40% more conversions'
    },
    {
      icon: DollarSign,
      challenge: 'Infrequent Commissions',
      pain: 'Long gaps between commission payments demotivate agents',
      solution: 'Motivated agents due to higher frequency of commissions earned',
      metric: 'Monthly earnings'
    },
    {
      icon: Handshake,
      challenge: 'Commission Disputes',
      pain: 'Disagreements over splits between agents and co-brokers are common',
      solution: 'Transparent commission tracking with automated fair splits',
      metric: 'Zero disputes'
    },
    {
      icon: UserCheck,
      challenge: 'Agent Reliability Issues',
      pain: 'Some agents fail to follow up or misrepresent properties',
      solution: 'Platform-tracked interactions ensure accountability and follow-through',
      metric: '100% tracked'
    },
    {
      icon: Award,
      challenge: 'Training Gaps',
      pain: 'Junior agents lack knowledge about Dubai laws, payment plans, regulations',
      solution: 'Standardized processes and templates reduce knowledge dependency',
      metric: 'Faster onboarding'
    }
  ];

  // Challenges with Clients
  const clientChallenges = [
    {
      icon: Eye,
      challenge: 'No Portfolio Visibility',
      pain: 'Clients struggle to track multiple investments across properties',
      solution: 'One-page view of all real estate holdings with clear ownership percentages',
      metric: 'Single dashboard'
    },
    {
      icon: PieChart,
      challenge: 'Liquidity Constraints',
      pain: 'Selling full property takes time; clients get stuck with illiquid assets',
      solution: 'Smaller shares can be easily sold to other investors quickly',
      metric: 'Quick exit'
    },
    {
      icon: Wallet,
      challenge: 'Payment Opacity',
      pain: 'Clients unsure about payment schedules and what\'s been paid to developers',
      solution: 'Payment tracking to developers visible - complete transparency',
      metric: 'Real-time tracking'
    },
    {
      icon: Building,
      challenge: 'Limited Property Access',
      pain: 'Clients can\'t easily see all available properties from their broker',
      solution: 'Access to all properties listed by the broker on their portal',
      metric: 'Full catalog access'
    },
    {
      icon: Calculator,
      challenge: 'ROI Expectations',
      pain: 'Unrealistic expectations regarding ROI, prices, or timelines',
      solution: 'Clear historical data and projections based on actual performance',
      metric: 'Data-driven decisions'
    },
    {
      icon: ShieldCheck,
      challenge: 'Trust Issues',
      pain: 'Clients distrust brokers due to past negative experiences or market scams',
      solution: 'Transparent platform with documented transactions builds confidence',
      metric: 'Verified records'
    }
  ];

  // Agent's Challenges with Clients (Agent Perspective)
  const agentClientChallenges = [
    {
      icon: Target,
      challenge: 'High Client Expectations',
      pain: 'Clients expect unrealistic returns, discounts, or instant results',
      solution: 'Fractional ownership sets realistic expectations with transparent portfolio tracking',
      metric: 'Clear ROI data'
    },
    {
      icon: Clock,
      challenge: 'Payment Delays',
      pain: 'Clients delay down payments or negotiate aggressively on payment plans',
      solution: 'Smaller fractional tickets are easier to commit to and pay upfront',
      metric: 'Faster payments'
    },
    {
      icon: RefreshCw,
      challenge: 'Frequent Preference Changes',
      pain: 'Clients change mind on property type, location, or budget mid-process',
      solution: 'Diversified fractional portfolio reduces dependency on single property choice',
      metric: 'Portfolio approach'
    },
    {
      icon: ShieldCheck,
      challenge: 'Trust & Credibility Issues',
      pain: 'Clients skeptical due to past experiences, scams, or lack of transparency',
      solution: 'Platform-verified transactions and transparent tracking builds trust',
      metric: 'Verified records'
    },
    {
      icon: FileText,
      challenge: 'Documentation Complexity',
      pain: 'Explaining RERA regulations, mortgage rules, visa benefits is time-consuming',
      solution: 'Standardized fractional structure with built-in compliance simplifies conversations',
      metric: 'Pre-documented'
    },
    {
      icon: Users,
      challenge: 'Cultural & Language Barriers',
      pain: 'Dubai\'s diverse client base requires multilingual communication',
      solution: 'Platform handles documentation; you focus on relationship building',
      metric: 'Simplified process'
    },
    {
      icon: TrendingUp,
      challenge: 'Market Volatility',
      pain: 'Fluctuating property prices make advising clients difficult',
      solution: 'Diversified fractional holdings reduce single-property risk exposure',
      metric: 'Risk diversified'
    },
    {
      icon: BarChart3,
      challenge: 'Competition from Portals',
      pain: 'Clients bypass agents and rely on property portals or developer teams',
      solution: 'Offer unique fractional ownership options that portals cannot provide',
      metric: 'Unique value'
    }
  ];

  // Agent's Challenges with Brokers (Agent Perspective)
  const agentBrokerChallenges = [
    {
      icon: DollarSign,
      challenge: 'Commission Disputes',
      pain: 'Disagreements on splits, delayed payments, or changed commission structures',
      solution: '75% brokerage sharing with transparent tracking - no disputes',
      metric: '75% to agents'
    },
    {
      icon: Building,
      challenge: 'Limited Listing Access',
      pain: 'Brokers restrict access to high-demand or premium properties',
      solution: 'Access to aggregated inventory across the Kinntegraa network',
      metric: 'Full access'
    },
    {
      icon: Target,
      challenge: 'High Sales Targets',
      pain: 'Pressure to meet quotas in a competitive market',
      solution: 'Fractional deals mean more transactions, easier target achievement',
      metric: 'More deals'
    },
    {
      icon: Award,
      challenge: 'Lack of Training & Support',
      pain: 'Brokers don\'t provide adequate training, marketing, or legal guidance',
      solution: 'Platform provides standardized processes, templates, and support',
      metric: 'Built-in support'
    },
    {
      icon: Users,
      challenge: 'Multiple Reporting Lines',
      pain: 'Working with multiple brokers leads to conflicts and confusion',
      solution: 'Single platform dashboard tracks all deals across brokers',
      metric: 'One dashboard'
    },
    {
      icon: Handshake,
      challenge: 'Competition Among Agents',
      pain: 'Internal competition creates tension and reduces collaboration',
      solution: 'Collaborative deal structures let agents share deals and commissions',
      metric: 'Team-friendly'
    }
  ];

  // Client Challenges in Dubai Real Estate (Pitched to Brokers)
  // Financial Challenges
  const clientFinancialChallenges = [
    {
      icon: Banknote,
      challenge: 'High Property Prices',
      pain: 'Premium locations and luxury projects can be very expensive for clients',
      solution: 'Fractional ownership lets clients access premium properties with smaller investments',
      metric: 'Entry from 25%'
    },
    {
      icon: Calculator,
      challenge: 'Hidden Costs & Fees',
      pain: 'DLD fees, agency fees, maintenance, service charges add up unexpectedly',
      solution: 'Transparent cost breakdown upfront - all fees visible before commitment',
      metric: 'Full transparency'
    },
    {
      icon: FileText,
      challenge: 'Mortgage & Financing',
      pain: 'Strict eligibility criteria or high interest rates for off-plan financing',
      solution: 'Fractional ownership reduces financing needs - smaller ticket sizes',
      metric: 'Lower barrier'
    },
    {
      icon: RefreshCw,
      challenge: 'Currency & Remittance',
      pain: 'NRI clients face difficulties in fund transfers or currency fluctuations',
      solution: 'Multiple payment options with clear currency tracking',
      metric: 'Easy transfers'
    }
  ];

  // Market Challenges
  const clientMarketChallenges = [
    {
      icon: TrendingUp,
      challenge: 'Market Volatility',
      pain: 'Property prices fluctuate quickly, affecting investment returns',
      solution: 'Diversified fractional holdings reduce single-property risk exposure',
      metric: 'Risk diversified'
    },
    {
      icon: Clock,
      challenge: 'Off-plan Project Delays',
      pain: 'Delays in construction and handover impact planning or rental income',
      solution: 'Portfolio approach - not all eggs in one basket',
      metric: 'Spread risk'
    },
    {
      icon: Building,
      challenge: 'Over-supply in Areas',
      pain: 'Certain districts may have too many similar properties, limiting rental yield',
      solution: 'Access to curated properties across diverse locations',
      metric: 'Curated selection'
    },
    {
      icon: BarChart3,
      challenge: 'Speculation Risk',
      pain: 'Rapid price appreciation/depreciation can affect expected returns',
      solution: 'Real data and transparent tracking for informed decisions',
      metric: 'Data-driven'
    }
  ];

  // Legal & Regulatory Challenges
  const clientLegalChallenges = [
    {
      icon: FileText,
      challenge: 'Complex Documentation',
      pain: 'Sales contracts, NOC approvals, RERA regulations can be confusing',
      solution: 'Standardized documentation with compliance built-in',
      metric: 'Pre-documented'
    },
    {
      icon: Gavel,
      challenge: 'Ownership Rules',
      pain: 'Freehold vs leasehold, visa-linked benefits, restrictions on foreigners',
      solution: 'Clear guidance on ownership structures for each client type',
      metric: 'Clear rules'
    },
    {
      icon: Scale,
      challenge: 'Dispute Resolution',
      pain: 'Handling developer disputes or landlord-tenant conflicts is complex',
      solution: 'Platform-mediated transactions with documented agreements',
      metric: 'Protected'
    }
  ];

  // Transactional Challenges
  const clientTransactionalChallenges = [
    {
      icon: Search,
      challenge: 'Finding Reliable Agents',
      pain: 'Risk of dealing with inexperienced or untrustworthy agents',
      solution: 'Your brokerage becomes the trusted partner with transparent platform',
      metric: 'Trust built'
    },
    {
      icon: Handshake,
      challenge: 'Negotiation Difficulties',
      pain: 'Getting the right price or fair deal requires market knowledge',
      solution: 'Real-time market data helps clients make informed decisions',
      metric: 'Fair pricing'
    },
    {
      icon: Eye,
      challenge: 'Transparency Issues',
      pain: 'Some properties or off-plan projects may have undisclosed issues',
      solution: 'Full property documentation and history visible on platform',
      metric: 'Full disclosure'
    },
    {
      icon: PieChart,
      challenge: 'Resale Challenges',
      pain: 'Selling properties in competitive market can be slow or require discounts',
      solution: 'Fractional shares can be sold more easily than full properties',
      metric: 'Quick exit'
    }
  ];

  // Lifestyle & Practical Challenges
  const clientLifestyleChallenges = [
    {
      icon: MapPin,
      challenge: 'Location & Connectivity',
      pain: 'Choosing areas with right schools, workplaces, and amenities',
      solution: 'Detailed location insights and property comparisons available',
      metric: 'Informed choice'
    },
    {
      icon: Settings,
      challenge: 'Maintenance & Service',
      pain: 'High annual service fees can impact cost of ownership',
      solution: 'Clear breakdown of all ongoing costs before purchase',
      metric: 'No surprises'
    },
    {
      icon: Wallet,
      challenge: 'Rental Yield vs ROI',
      pain: 'Balancing short-term rental income vs long-term capital appreciation',
      solution: 'Portfolio view helps optimize for client goals',
      metric: 'Goal-aligned'
    },
    {
      icon: Users,
      challenge: 'Cultural/Language Barriers',
      pain: 'Communicating with authorities, developers, or service providers',
      solution: 'Platform handles complexity; your team provides personal touch',
      metric: 'Simplified'
    }
  ];

  const ChallengeCard = ({ item, index, category }) => {
    const isExpanded = expandedChallenge === `${category}-${index}`;
    const Icon = item.icon;
    
    return (
      <div 
        className="rounded-xl overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-lg"
        style={{ 
          backgroundColor: colors.white,
          border: `1px solid ${isExpanded ? colors.gold : '#E5E7EB'}`
        }}
        onClick={() => setExpandedChallenge(isExpanded ? null : `${category}-${index}`)}
      >
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${colors.danger}15` }}
            >
              <AlertTriangle className="h-5 w-5" style={{ color: colors.danger }} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm mb-1" style={{ color: colors.text }}>
                {item.challenge}
              </h4>
              <p className="text-xs" style={{ color: colors.textLight }}>
                {item.pain}
              </p>
            </div>
            <ChevronRight 
              className={`h-5 w-5 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} 
              style={{ color: colors.textMuted }}
            />
          </div>
        </div>
        
        {isExpanded && (
          <div 
            className="px-5 pb-5 pt-3 border-t"
            style={{ borderColor: '#E5E7EB', backgroundColor: `${colors.gold}08` }}
          >
            <div className="flex items-start gap-4">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: colors.gold }}
              >
                <Icon className="h-5 w-5" style={{ color: colors.primary }} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold mb-1" style={{ color: colors.gold }}>
                  KINNTEGRAA SOLUTION
                </p>
                <p className="text-sm" style={{ color: colors.text }}>
                  {item.solution}
                </p>
                <div 
                  className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: `${colors.success}15`, color: colors.success }}
                >
                  <CheckCircle className="h-3 w-3" />
                  {item.metric}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

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
      <section className="py-12 md:py-16" style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 50%, ${colors.primaryDeep} 100%)` }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-sm font-medium mb-4" style={{ color: colors.gold }}>
              B2B2C FRACTIONAL AGGREGATION PLATFORM
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
              Managing Relationships
              <span className="block mt-2" style={{ color: colors.gold }}>The Hygienic Way</span>
            </h1>
            <p className="text-base md:text-lg text-white/80 max-w-2xl mx-auto">
              Real estate brokers face challenges with Developers, Agents, and Clients daily. 
              Kinntegraa's B2B2C platform facilitates managing all relationships transparently and efficiently.
            </p>
            
            {/* Quick Stats */}
            <div className="flex flex-wrap justify-center gap-4 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-bold" style={{ color: colors.gold }}>3</div>
                <div className="text-xs text-white/60">Key Relationships</div>
              </div>
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-bold" style={{ color: colors.gold }}>18+</div>
                <div className="text-xs text-white/60">Challenges Solved</div>
              </div>
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-bold" style={{ color: colors.gold }}>1</div>
                <div className="text-xs text-white/60">Unified Platform</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex justify-center -mt-6 relative z-10 px-4">
        <div className="inline-flex rounded-full p-1.5 shadow-lg overflow-x-auto" style={{ backgroundColor: colors.white }}>
          <button
            onClick={() => setActiveTab('brokers')}
            className={`px-4 md:px-6 py-2.5 rounded-full text-xs md:text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap`}
            style={{ 
              backgroundColor: activeTab === 'brokers' ? colors.primary : 'transparent', 
              color: activeTab === 'brokers' ? colors.white : colors.textLight 
            }}
          >
            <Building2 className="h-4 w-4" /> For Broker Firms
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={`px-4 md:px-6 py-2.5 rounded-full text-xs md:text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap`}
            style={{ 
              backgroundColor: activeTab === 'agents' ? colors.primary : 'transparent', 
              color: activeTab === 'agents' ? colors.white : colors.textLight 
            }}
          >
            <Users className="h-4 w-4" /> Your Agents
          </button>
          <button
            onClick={() => setActiveTab('clients')}
            className={`px-4 md:px-6 py-2.5 rounded-full text-xs md:text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap`}
            style={{ 
              backgroundColor: activeTab === 'clients' ? colors.primary : 'transparent', 
              color: activeTab === 'clients' ? colors.white : colors.textLight 
            }}
          >
            <UserCheck className="h-4 w-4" /> Your Clients
          </button>
        </div>
      </div>

      {/* FOR BROKER FIRMS TAB */}
      {activeTab === 'brokers' && (
        <>
          {/* Introduction */}
          <section className="py-12" style={{ backgroundColor: colors.white }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: colors.text }}>
                  Challenges Real Estate Brokers Face Daily
                </h2>
                <p className="text-sm md:text-base max-w-3xl mx-auto" style={{ color: colors.textLight }}>
                  Click on any challenge to see how Kinntegraa's platform provides a solution
                </p>
              </div>
            </div>
          </section>

          {/* Challenges with Developers */}
          <section className="py-8 md:py-12" style={{ backgroundColor: colors.cream }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3 mb-6">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Building className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-bold" style={{ color: colors.text }}>
                    Challenges with Developers
                  </h3>
                  <p className="text-xs" style={{ color: colors.textLight }}>
                    6 pain points → 6 solutions
                  </p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {developerChallenges.map((item, index) => (
                  <ChallengeCard key={index} item={item} index={index} category="developer" />
                ))}
              </div>

              {/* Summary Box */}
              <div 
                className="mt-8 p-6 rounded-xl"
                style={{ backgroundColor: colors.primary }}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-white mb-2">
                      The Kinntegraa Advantage with Developers
                    </h4>
                    <p className="text-sm text-white/80">
                      Quick closures through fractional aggregation mean timely commissions, better inventory access at launches, 
                      and improved pricing from consistent deal flow.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: `${colors.gold}20` }}>
                      <div className="text-xl font-bold" style={{ color: colors.gold }}>Faster</div>
                      <div className="text-xs text-white/60">Commissions</div>
                    </div>
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: `${colors.gold}20` }}>
                      <div className="text-xl font-bold" style={{ color: colors.gold }}>Priority</div>
                      <div className="text-xs text-white/60">Access</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Challenges with Agents */}
          <section className="py-8 md:py-12" style={{ backgroundColor: colors.white }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3 mb-6">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: colors.gold }}
                >
                  <Users className="h-5 w-5" style={{ color: colors.primary }} />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-bold" style={{ color: colors.text }}>
                    Challenges with Agents
                  </h3>
                  <p className="text-xs" style={{ color: colors.textLight }}>
                    6 pain points → 6 solutions
                  </p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agentChallenges.map((item, index) => (
                  <ChallengeCard key={index} item={item} index={index} category="agent" />
                ))}
              </div>

              {/* Summary Box */}
              <div 
                className="mt-8 p-6 rounded-xl"
                style={{ backgroundColor: `${colors.gold}15`, border: `2px solid ${colors.gold}` }}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold mb-2" style={{ color: colors.text }}>
                      The Kinntegraa Advantage with Agents
                    </h4>
                    <p className="text-sm" style={{ color: colors.textLight }}>
                      Quicker sales cycles, better lead conversion from budget-constrained clients, 
                      and motivated agents through higher frequency of commission payouts.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: colors.white }}>
                      <div className="text-xl font-bold" style={{ color: colors.primary }}>3x</div>
                      <div className="text-xs" style={{ color: colors.textLight }}>Faster Sales</div>
                    </div>
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: colors.white }}>
                      <div className="text-xl font-bold" style={{ color: colors.primary }}>40%</div>
                      <div className="text-xs" style={{ color: colors.textLight }}>More Conversions</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Challenges with Clients */}
          <section className="py-8 md:py-12" style={{ backgroundColor: colors.cream }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3 mb-6">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: colors.success }}
                >
                  <UserCheck className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-bold" style={{ color: colors.text }}>
                    Challenges with Clients
                  </h3>
                  <p className="text-xs" style={{ color: colors.textLight }}>
                    6 pain points → 6 solutions
                  </p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {clientChallenges.map((item, index) => (
                  <ChallengeCard key={index} item={item} index={index} category="client" />
                ))}
              </div>

              {/* Summary Box */}
              <div 
                className="mt-8 p-6 rounded-xl"
                style={{ backgroundColor: colors.success }}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-white mb-2">
                      The Kinntegraa Advantage with Clients
                    </h4>
                    <p className="text-sm text-white/90">
                      One-page view of all holdings, easy resale of smaller shares, transparent payment tracking to developers, 
                      and full access to broker's property catalog.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                      <div className="text-xl font-bold text-white">Full</div>
                      <div className="text-xs text-white/80">Transparency</div>
                    </div>
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                      <div className="text-xl font-bold text-white">Quick</div>
                      <div className="text-xs text-white/80">Liquidity</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Platform Features Overview */}
          <section className="py-12" style={{ backgroundColor: colors.white }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl md:text-3xl font-bold text-center mb-8" style={{ color: colors.text }}>
                One Platform. All Relationships. Complete Transparency.
              </h2>
              
              <div className="grid md:grid-cols-3 gap-6">
                {/* Developer Relations */}
                <div className="p-6 rounded-xl text-center" style={{ backgroundColor: colors.cream }}>
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: colors.primary }}
                  >
                    <Building className="h-8 w-8 text-white" />
                  </div>
                  <h4 className="font-bold mb-2" style={{ color: colors.text }}>Developer Relations</h4>
                  <ul className="text-sm space-y-2 text-left" style={{ color: colors.textLight }}>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Quick closures = Timely commissions
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Aggregated demand = Priority allocation
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Consistent volume = Better pricing
                    </li>
                  </ul>
                </div>

                {/* Agent Relations */}
                <div className="p-6 rounded-xl text-center" style={{ backgroundColor: colors.cream }}>
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: colors.gold }}
                  >
                    <Users className="h-8 w-8" style={{ color: colors.primary }} />
                  </div>
                  <h4 className="font-bold mb-2" style={{ color: colors.text }}>Agent Relations</h4>
                  <ul className="text-sm space-y-2 text-left" style={{ color: colors.textLight }}>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Fractional = Quicker sales
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Lower tickets = Better conversion
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Frequent deals = Motivated team
                    </li>
                  </ul>
                </div>

                {/* Client Relations */}
                <div className="p-6 rounded-xl text-center" style={{ backgroundColor: colors.cream }}>
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: colors.success }}
                  >
                    <UserCheck className="h-8 w-8 text-white" />
                  </div>
                  <h4 className="font-bold mb-2" style={{ color: colors.text }}>Client Relations</h4>
                  <ul className="text-sm space-y-2 text-left" style={{ color: colors.textLight }}>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Single dashboard for all holdings
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Easy resale of fractional shares
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Transparent payment tracking
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* FOR AGENTS TAB - Pitched to Brokers about their Agents' Challenges */}
      {activeTab === 'agents' && (
        <>
          {/* Introduction - For Brokers */}
          <section className="py-12" style={{ backgroundColor: colors.white }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: colors.text }}>
                  Challenges Your Agents Face Daily
                </h2>
                <p className="text-sm md:text-base max-w-3xl mx-auto" style={{ color: colors.textLight }}>
                  Your agents struggle with client objections and internal coordination issues. 
                  Kinntegraa helps your brokerage solve these problems systematically.
                </p>
              </div>
            </div>
          </section>

          {/* Agents' Challenges with Clients */}
          <section className="py-8 md:py-12" style={{ backgroundColor: colors.cream }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3 mb-6">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: colors.success }}
                >
                  <UserCheck className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-bold" style={{ color: colors.text }}>
                    Your Agents' Client Challenges
                  </h3>
                  <p className="text-xs" style={{ color: colors.textLight }}>
                    8 pain points your agents face → How Kinntegraa helps your brokerage
                  </p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {agentClientChallenges.map((item, index) => (
                  <ChallengeCard key={index} item={item} index={index} category="agent-client" />
                ))}
              </div>

              {/* Summary Box */}
              <div 
                className="mt-8 p-6 rounded-xl"
                style={{ backgroundColor: colors.success }}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-white mb-2">
                      How Kinntegraa Helps Your Agents with Clients
                    </h4>
                    <p className="text-sm text-white/90">
                      Fractional ownership expands your agents' client pool. Budget-constrained leads become viable buyers. 
                      Transparent tracking builds client trust in your brokerage.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                      <div className="text-xl font-bold text-white">4x</div>
                      <div className="text-xs text-white/80">Client Pool</div>
                    </div>
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                      <div className="text-xl font-bold text-white">Trust</div>
                      <div className="text-xs text-white/80">Built-in</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Agents' Internal Coordination Challenges */}
          <section className="py-8 md:py-12" style={{ backgroundColor: colors.white }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3 mb-6">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Building2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-bold" style={{ color: colors.text }}>
                    Your Agents' Coordination Challenges
                  </h3>
                  <p className="text-xs" style={{ color: colors.textLight }}>
                    6 internal issues your agents face → How Kinntegraa streamlines your operations
                  </p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agentBrokerChallenges.map((item, index) => (
                  <ChallengeCard key={index} item={item} index={index} category="agent-broker" />
                ))}
              </div>

              {/* Summary Box */}
              <div 
                className="mt-8 p-6 rounded-xl"
                style={{ backgroundColor: colors.primary }}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-white mb-2">
                      How Kinntegraa Streamlines Your Brokerage
                    </h4>
                    <p className="text-sm text-white/80">
                      Transparent commission tracking eliminates agent disputes. Collaborative deal structures 
                      reduce internal competition. Your agents focus on selling, not coordination.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: `${colors.gold}20` }}>
                      <div className="text-xl font-bold" style={{ color: colors.gold }}>Zero</div>
                      <div className="text-xs text-white/60">Disputes</div>
                    </div>
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: `${colors.gold}20` }}>
                      <div className="text-xl font-bold" style={{ color: colors.gold }}>Team</div>
                      <div className="text-xs text-white/60">Collaboration</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Benefits for Your Brokerage */}
          <section className="py-12" style={{ backgroundColor: colors.cream }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl md:text-3xl font-bold text-center mb-8" style={{ color: colors.text }}>
                Empower Your Agents. Grow Your Brokerage.
              </h2>
              
              <div className="grid md:grid-cols-3 gap-6">
                {/* Agents Close More Deals */}
                <div className="p-6 rounded-xl text-center" style={{ backgroundColor: colors.white }}>
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: colors.gold }}
                  >
                    <Zap className="h-8 w-8" style={{ color: colors.primary }} />
                  </div>
                  <h4 className="font-bold mb-2" style={{ color: colors.text }}>Your Agents Close More</h4>
                  <ul className="text-sm space-y-2 text-left" style={{ color: colors.textLight }}>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Fractional = More buyers can afford
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Smaller tickets close faster
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Convert budget-constrained leads
                    </li>
                  </ul>
                </div>

                {/* Agent Motivation */}
                <div className="p-6 rounded-xl text-center" style={{ backgroundColor: colors.white }}>
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: colors.success }}
                  >
                    <DollarSign className="h-8 w-8 text-white" />
                  </div>
                  <h4 className="font-bold mb-2" style={{ color: colors.text }}>Motivated Agent Team</h4>
                  <ul className="text-sm space-y-2 text-left" style={{ color: colors.textLight }}>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Frequent commission payouts
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Transparent commission tracking
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      No disputes, clear splits
                    </li>
                  </ul>
                </div>

                {/* Brokerage Trust */}
                <div className="p-6 rounded-xl text-center" style={{ backgroundColor: colors.white }}>
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: colors.primary }}
                  >
                    <ShieldCheck className="h-8 w-8 text-white" />
                  </div>
                  <h4 className="font-bold mb-2" style={{ color: colors.text }}>Brokerage Credibility</h4>
                  <ul className="text-sm space-y-2 text-left" style={{ color: colors.textLight }}>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Transparent portfolio tracking
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Documented transactions
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: colors.success }} />
                      Your agents build client trust
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* How Your Agents Use Kinntegraa */}
          <section className="py-12" style={{ backgroundColor: colors.white }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl font-bold text-center mb-8" style={{ color: colors.text }}>How Your Agents Use Kinntegraa</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { num: 1, title: 'Find Clients', desc: 'Agents identify clients who want premium property exposure but have limited capital' },
                  { num: 2, title: 'Show Options', desc: 'Present fractional ownership opportunities (25%, 50%, etc.)' },
                  { num: 3, title: 'Collaborate', desc: 'Agents collaborate to fill remaining ownership shares' },
                  { num: 4, title: 'Close & Earn', desc: 'Deal closes, commissions distributed transparently' }
                ].map((step, idx) => (
                  <div key={idx} className="p-5 rounded-xl text-center" style={{ backgroundColor: colors.cream }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: colors.gold }}>
                      <span className="text-base font-bold" style={{ color: colors.primary }}>{step.num}</span>
                    </div>
                    <h4 className="font-bold text-sm mb-2" style={{ color: colors.text }}>{step.title}</h4>
                    <p className="text-xs" style={{ color: colors.textLight }}>{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {/* FOR YOUR CLIENTS TAB - Client Challenges in Dubai Real Estate */}
      {activeTab === 'clients' && (
        <>
          {/* Introduction */}
          <section className="py-12" style={{ backgroundColor: colors.white }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: colors.text }}>
                  Challenges Your Clients Face in Dubai Real Estate
                </h2>
                <p className="text-sm md:text-base max-w-3xl mx-auto" style={{ color: colors.textLight }}>
                  Understand what holds your clients back and how Kinntegraa helps your brokerage 
                  address these concerns effectively.
                </p>
              </div>
            </div>
          </section>

          {/* Financial Challenges */}
          <section className="py-8 md:py-12" style={{ backgroundColor: colors.cream }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3 mb-6">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: colors.gold }}
                >
                  <Banknote className="h-5 w-5" style={{ color: colors.primary }} />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-bold" style={{ color: colors.text }}>
                    Financial Challenges
                  </h3>
                  <p className="text-xs" style={{ color: colors.textLight }}>
                    4 pain points → How you can help
                  </p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {clientFinancialChallenges.map((item, index) => (
                  <ChallengeCard key={index} item={item} index={index} category="client-financial" />
                ))}
              </div>

              {/* Summary Box */}
              <div 
                className="mt-8 p-6 rounded-xl"
                style={{ backgroundColor: colors.gold }}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold mb-2" style={{ color: colors.primary }}>
                      How Kinntegraa Helps You Address Financial Barriers
                    </h4>
                    <p className="text-sm" style={{ color: colors.primaryDark }}>
                      Fractional ownership lowers the entry barrier. Your clients can access premium Dubai properties 
                      with smaller investments while you maintain full transparency on costs.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: colors.primary }}>
                      <div className="text-xl font-bold text-white">Lower</div>
                      <div className="text-xs text-white/70">Entry Barrier</div>
                    </div>
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: colors.primary }}>
                      <div className="text-xl font-bold text-white">Clear</div>
                      <div className="text-xs text-white/70">Cost Breakdown</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Market Challenges */}
          <section className="py-8 md:py-12" style={{ backgroundColor: colors.white }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3 mb-6">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: colors.danger }}
                >
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-bold" style={{ color: colors.text }}>
                    Market Challenges
                  </h3>
                  <p className="text-xs" style={{ color: colors.textLight }}>
                    4 pain points → How you can help
                  </p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {clientMarketChallenges.map((item, index) => (
                  <ChallengeCard key={index} item={item} index={index} category="client-market" />
                ))}
              </div>

              {/* Summary Box */}
              <div 
                className="mt-8 p-6 rounded-xl"
                style={{ backgroundColor: colors.danger }}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-white mb-2">
                      How Kinntegraa Helps You Address Market Concerns
                    </h4>
                    <p className="text-sm text-white/90">
                      Diversified fractional holdings reduce single-property risk. Your clients get access to 
                      curated properties with real data for informed decision-making.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                      <div className="text-xl font-bold text-white">Diversified</div>
                      <div className="text-xs text-white/70">Risk</div>
                    </div>
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                      <div className="text-xl font-bold text-white">Real</div>
                      <div className="text-xs text-white/70">Data</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Legal & Regulatory Challenges */}
          <section className="py-8 md:py-12" style={{ backgroundColor: colors.cream }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3 mb-6">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Gavel className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-bold" style={{ color: colors.text }}>
                    Legal & Regulatory Challenges
                  </h3>
                  <p className="text-xs" style={{ color: colors.textLight }}>
                    3 pain points → How you can help
                  </p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-3 gap-4">
                {clientLegalChallenges.map((item, index) => (
                  <ChallengeCard key={index} item={item} index={index} category="client-legal" />
                ))}
              </div>

              {/* Summary Box */}
              <div 
                className="mt-8 p-6 rounded-xl"
                style={{ backgroundColor: colors.primary }}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-white mb-2">
                      How Kinntegraa Simplifies Legal Complexity
                    </h4>
                    <p className="text-sm text-white/80">
                      Standardized documentation with built-in compliance. Your clients get clear guidance 
                      on ownership rules while platform-mediated transactions protect all parties.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: `${colors.gold}20` }}>
                      <div className="text-xl font-bold" style={{ color: colors.gold }}>Compliant</div>
                      <div className="text-xs text-white/60">Documentation</div>
                    </div>
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: `${colors.gold}20` }}>
                      <div className="text-xl font-bold" style={{ color: colors.gold }}>Protected</div>
                      <div className="text-xs text-white/60">Transactions</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Transactional Challenges */}
          <section className="py-8 md:py-12" style={{ backgroundColor: colors.white }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3 mb-6">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: colors.success }}
                >
                  <Handshake className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-bold" style={{ color: colors.text }}>
                    Transactional Challenges
                  </h3>
                  <p className="text-xs" style={{ color: colors.textLight }}>
                    4 pain points → How you can help
                  </p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {clientTransactionalChallenges.map((item, index) => (
                  <ChallengeCard key={index} item={item} index={index} category="client-transactional" />
                ))}
              </div>

              {/* Summary Box */}
              <div 
                className="mt-8 p-6 rounded-xl"
                style={{ backgroundColor: colors.success }}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-white mb-2">
                      How Kinntegraa Builds Transaction Trust
                    </h4>
                    <p className="text-sm text-white/90">
                      Your brokerage becomes the trusted partner with platform-backed transparency. 
                      Fractional shares can be sold more easily, giving clients the liquidity they need.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                      <div className="text-xl font-bold text-white">Full</div>
                      <div className="text-xs text-white/70">Transparency</div>
                    </div>
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                      <div className="text-xl font-bold text-white">Easy</div>
                      <div className="text-xs text-white/70">Resale</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Lifestyle & Practical Challenges */}
          <section className="py-8 md:py-12" style={{ backgroundColor: colors.cream }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3 mb-6">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: '#6366F1' }}
                >
                  <Home className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-bold" style={{ color: colors.text }}>
                    Lifestyle & Practical Challenges
                  </h3>
                  <p className="text-xs" style={{ color: colors.textLight }}>
                    4 pain points → How you can help
                  </p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {clientLifestyleChallenges.map((item, index) => (
                  <ChallengeCard key={index} item={item} index={index} category="client-lifestyle" />
                ))}
              </div>

              {/* Summary Box */}
              <div 
                className="mt-8 p-6 rounded-xl"
                style={{ backgroundColor: '#6366F1' }}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-white mb-2">
                      How Kinntegraa Simplifies Client Experience
                    </h4>
                    <p className="text-sm text-white/90">
                      Detailed property insights help clients make informed location choices. Clear cost breakdowns 
                      eliminate surprises while your team provides the personal touch.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                      <div className="text-xl font-bold text-white">Informed</div>
                      <div className="text-xs text-white/70">Choices</div>
                    </div>
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                      <div className="text-xl font-bold text-white">No</div>
                      <div className="text-xs text-white/70">Surprises</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Benefits Summary for Clients */}
          <section className="py-12" style={{ backgroundColor: colors.white }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl md:text-3xl font-bold text-center mb-8" style={{ color: colors.text }}>
                Serve Your Clients Better with Kinntegraa
              </h2>
              
              <div className="grid md:grid-cols-5 gap-4">
                {[
                  { icon: Banknote, title: 'Financial', count: '4', desc: 'Lower barriers, clear costs' },
                  { icon: TrendingUp, title: 'Market', count: '4', desc: 'Diversified risk, real data' },
                  { icon: Gavel, title: 'Legal', count: '3', desc: 'Compliant, protected' },
                  { icon: Handshake, title: 'Transactional', count: '4', desc: 'Transparent, easy resale' },
                  { icon: Home, title: 'Lifestyle', count: '4', desc: 'Informed, no surprises' }
                ].map((cat, idx) => {
                  const Icon = cat.icon;
                  return (
                    <div key={idx} className="p-4 rounded-xl text-center" style={{ backgroundColor: colors.cream }}>
                      <div 
                        className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                        style={{ backgroundColor: colors.gold }}
                      >
                        <Icon className="h-6 w-6" style={{ color: colors.primary }} />
                      </div>
                      <h4 className="font-bold text-sm mb-1" style={{ color: colors.text }}>{cat.title}</h4>
                      <p className="text-2xl font-bold mb-1" style={{ color: colors.gold }}>{cat.count}</p>
                      <p className="text-xs" style={{ color: colors.textLight }}>{cat.desc}</p>
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-8 p-6 rounded-xl text-center" style={{ backgroundColor: colors.cream, border: `2px dashed ${colors.gold}` }}>
                <p className="text-lg font-semibold mb-2" style={{ color: colors.text }}>
                  19 Client Challenges Addressed Through Your Brokerage
                </p>
                <p className="text-sm" style={{ color: colors.textLight }}>
                  Kinntegraa helps you become the trusted partner your clients need in Dubai's complex real estate market.
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      {/* CTA Section */}
      <section className="py-12" style={{ backgroundColor: colors.primary }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="text-center lg:text-left">
              <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
                Ready to Transform Your Brokerage?
              </h3>
              <p className="text-sm text-white/80">
                Join brokers already using Kinntegraa to manage relationships hygienically.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => navigate('/re-broker-signup')}
                className="px-8 py-3 rounded-lg font-semibold transition-all hover:scale-105"
                style={{ backgroundColor: colors.gold, color: colors.primary }}
              >
                Get Started Free
              </button>
              <button
                onClick={() => navigate('/login')}
                className="px-8 py-3 rounded-lg font-semibold transition-all hover:scale-105 border-2 border-white/30 text-white"
              >
                Broker Login
              </button>
            </div>
            <div className="flex gap-4">
              <div className="p-3 rounded-lg text-center" style={{ backgroundColor: colors.gold }}>
                <div className="text-lg font-bold" style={{ color: colors.primary }}>18+</div>
                <div className="text-xs" style={{ color: colors.primaryDark }}>Problems Solved</div>
              </div>
              <div className="p-3 rounded-lg text-center" style={{ backgroundColor: colors.gold }}>
                <div className="text-lg font-bold" style={{ color: colors.primary }}>3</div>
                <div className="text-xs" style={{ color: colors.primaryDark }}>Relationships</div>
              </div>
              <div className="p-3 rounded-lg text-center" style={{ backgroundColor: colors.gold }}>
                <div className="text-lg font-bold" style={{ color: colors.primary }}>100%</div>
                <div className="text-xs" style={{ color: colors.primaryDark }}>Transparent</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default RealEstateBrokersPage;
