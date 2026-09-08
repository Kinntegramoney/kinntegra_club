import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  BarChart3, 
  TrendingUp,
  Building2,
  FileText,
  Menu,
  X,
  CheckCircle,
  ChevronRight,
  Shield,
  Users,
  Target,
  Award,
  Briefcase,
  PieChart,
  FileSearch,
  Database,
  DollarSign,
  Clock,
  AlertTriangle,
  Globe,
  Wallet,
  Scale
} from 'lucide-react';

const MFDistributorsPage = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeServiceTab, setActiveServiceTab] = useState('casAnalysis');
  const [activeKnowledgeTab, setActiveKnowledgeTab] = useState('platform');

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
    success: '#059669',
    danger: '#DC2626'
  };

  const navItems = [
    { path: '/', label: 'About Us' },
    { path: '/real-estate-brokers', label: 'Real Estate Brokers' },
    { path: '/mf-distributors', label: 'MFD/RIA', active: true },
    { path: '/private-investors', label: 'Private Investors' },
  ];

  // Services for MFDs/RIAs
  const services = [
    {
      id: 'casAnalysis',
      title: 'CAS Analysis & Portfolio Review',
      subtitle: 'Comprehensive MF Portfolio Analysis',
      icon: PieChart,
      color: '#6366F1',
      description: 'Upload client CAS statements and get detailed portfolio analysis. Identify overlaps, analyze allocation, and generate professional reports for your clients.',
      keyBenefits: [
        'Automatic CAS PDF parsing',
        'Multi-distributor portfolio consolidation',
        'Portfolio overlap detection',
        'Asset allocation analysis',
        'Performance benchmarking',
        'Professional client reports'
      ],
      example: {
        name: 'Mr. Suresh Kumar',
        initials: 'SK',
        subtitle: 'AMFI Registered MFD, Mumbai',
        scenario: 'Had 200+ clients with investments across multiple AMCs and platforms, making portfolio reviews time-consuming.',
        solution: 'Using Kinntegraa CAS Analysis, now uploads client CAS and gets instant portfolio analysis with overlap detection.',
        outcome: 'Reduced portfolio review time from 2 hours to 15 minutes per client, increased client meetings by 3x.',
        stats: [
          { label: 'Time Saved', value: '85%' },
          { label: 'Clients Served', value: '200+' },
          { label: 'Reports/Month', value: '150+' }
        ]
      },
      considerations: [
        'Supports all major AMCs in India',
        'SEBI compliant reporting',
        'White-label reports available',
        'Bulk upload capability'
      ]
    },
    {
      id: 'ncdDistribution',
      title: 'NCD Distribution',
      subtitle: 'Collateral-Backed Fixed Income Products',
      icon: TrendingUp,
      color: colors.success,
      description: 'Offer your clients access to carefully curated unlisted NCDs with attractive yields. Diversify their portfolios beyond mutual funds with fixed income products.',
      keyBenefits: [
        'Pre-vetted NCD opportunities',
        'Collateral-backed security',
        '10-13% p.a. yields',
        'Monthly/quarterly payout options',
        'Commission tracking dashboard',
        'Complete documentation support'
      ],
      example: {
        name: 'Mrs. Priya Sharma',
        initials: 'PS',
        subtitle: 'SEBI Registered RIA, Delhi',
        scenario: 'Clients with large FD portfolios seeking better returns without equity risk.',
        solution: 'Introduced collateral-backed NCDs through Kinntegraa, offering 10-12% yields vs 6-7% FD rates.',
        outcome: 'Moved Rs. 5 Cr client assets from FDs to NCDs, increased client satisfaction and retention.',
        stats: [
          { label: 'AUM Moved', value: 'Rs. 5 Cr' },
          { label: 'Yield Improvement', value: '4-5%' },
          { label: 'Client Retention', value: '95%' }
        ]
      },
      considerations: [
        'Each NCD vetted for collateral coverage',
        'Transparent commission structure',
        'Client interest tracking',
        'Regulatory compliance handled'
      ]
    },
    {
      id: 'realEstate',
      title: 'Dubai Real Estate',
      subtitle: 'Fractional Property Investment',
      icon: Building2,
      color: colors.gold,
      description: 'Offer your HNI clients access to premium Dubai properties through fractional ownership. Diversify their portfolios with international real estate.',
      keyBenefits: [
        'Premium Dubai properties',
        'Fractional ownership from 25%',
        'Off-plan & ready properties',
        'Expected XIRR 25-35%',
        'Rental income + appreciation',
        'Complete transaction support'
      ],
      example: {
        name: 'Mr. Rajiv Mehta',
        initials: 'RM',
        subtitle: 'AMFI MFD with HNI Clients, Bangalore',
        scenario: 'HNI clients wanted international diversification but found Dubai property prices too high for full ownership.',
        solution: 'Introduced fractional ownership through Kinntegraa, allowing clients to invest AED 375,000 for 25% ownership.',
        outcome: 'Successfully placed 3 HNI clients in Dubai properties, earned attractive referral commissions.',
        stats: [
          { label: 'Clients Placed', value: '3' },
          { label: 'Total Investment', value: 'AED 1.5M' },
          { label: 'Expected XIRR', value: '28-32%' }
        ]
      },
      considerations: [
        'Due diligence handled by Kinntegraa',
        'Referral commission structure',
        'Client onboarding support',
        'Ongoing reporting for clients'
      ]
    },
    {
      id: 'financialPlanning',
      title: 'Financial Planning Tools',
      subtitle: 'Wealth Longevity & Cash Flow Analysis',
      icon: FileText,
      color: '#8B5CF6',
      description: 'Provide comprehensive financial planning to your clients with 30-year cash flow projections, retirement planning, and wealth longevity analysis.',
      keyBenefits: [
        '30-year cash flow projections',
        'Retirement corpus calculator',
        'Goal-based planning',
        'Scenario analysis tools',
        'Professional planning reports',
        'Client presentation templates'
      ],
      example: {
        name: 'Mr. Anand Iyer',
        initials: 'AI',
        subtitle: 'SEBI RIA, Chennai',
        scenario: 'Needed to demonstrate value beyond just product distribution to justify advisory fees.',
        solution: 'Uses Kinntegraa financial planning tools to create comprehensive wealth plans for clients.',
        outcome: 'Increased advisory fee acceptance from 40% to 85% of clients by showing clear value addition.',
        stats: [
          { label: 'Fee Acceptance', value: '85%' },
          { label: 'Avg Plan Value', value: 'Rs. 25K' },
          { label: 'Client Satisfaction', value: '4.8/5' }
        ]
      },
      considerations: [
        'Customizable report templates',
        'White-label options available',
        'Regular updates and maintenance',
        'Training and support provided'
      ]
    }
  ];

  // Knowledge tabs for MFDs
  const knowledgeTabs = [
    { id: 'platform', label: 'Platform Benefits', icon: Award, color: colors.gold },
    { id: 'compliance', label: 'Compliance', icon: Shield, color: colors.primary },
    { id: 'commission', label: 'Commission Structure', icon: DollarSign, color: colors.success }
  ];

  // Platform Benefits Points
  const platformBenefits = [
    {
      id: 'efficiency',
      title: 'Operational Efficiency',
      icon: Clock,
      color: colors.gold,
      points: [
        { title: 'Automated CAS Parsing', desc: 'No manual data entry, instant analysis' },
        { title: 'Bulk Processing', desc: 'Handle multiple client portfolios simultaneously' },
        { title: 'Quick Reports', desc: 'Generate professional reports in minutes' }
      ]
    },
    {
      id: 'products',
      title: 'Product Diversification',
      icon: Briefcase,
      color: colors.success,
      points: [
        { title: 'NCDs', desc: 'Fixed income products for conservative clients' },
        { title: 'Dubai Real Estate', desc: 'International diversification for HNIs' },
        { title: 'Financial Planning', desc: 'Value-added advisory services' }
      ]
    },
    {
      id: 'revenue',
      title: 'Revenue Enhancement',
      icon: TrendingUp,
      color: '#6366F1',
      points: [
        { title: 'New Income Streams', desc: 'Commission from NCDs and real estate' },
        { title: 'Advisory Fees', desc: 'Justify fees with comprehensive planning' },
        { title: 'Client Retention', desc: 'Better services mean stickier clients' }
      ]
    },
    {
      id: 'support',
      title: 'Business Support',
      icon: Users,
      color: '#8B5CF6',
      points: [
        { title: 'Training Resources', desc: 'Product and platform training' },
        { title: 'Marketing Materials', desc: 'Client-ready presentations' },
        { title: 'Dedicated Support', desc: 'Relationship manager assigned' }
      ]
    }
  ];

  // Compliance Points
  const compliancePoints = [
    {
      id: 'amfi',
      title: 'AMFI Registration',
      icon: Award,
      color: colors.gold,
      points: [
        { title: 'Valid ARN Required', desc: 'Must have active AMFI Registration Number' },
        { title: 'NISM Certification', desc: 'Valid NISM-V-A certification needed' },
        { title: 'KYD Compliance', desc: 'Know Your Distributor norms followed' }
      ]
    },
    {
      id: 'sebi',
      title: 'SEBI RIA Requirements',
      icon: Shield,
      color: colors.primary,
      points: [
        { title: 'RIA Registration', desc: 'Valid SEBI RIA certificate required' },
        { title: 'Net Worth Criteria', desc: 'Meet minimum net worth requirements' },
        { title: 'Qualification', desc: 'CFP/CFA or equivalent preferred' }
      ]
    },
    {
      id: 'platform',
      title: 'Platform Compliance',
      icon: FileSearch,
      color: colors.success,
      points: [
        { title: 'Agreement', desc: 'Standard distributor agreement required' },
        { title: 'Document Verification', desc: 'KYC and registration docs verified' },
        { title: 'Ongoing Compliance', desc: 'Annual renewal and audit support' }
      ]
    }
  ];

  // Commission Structure Points
  const commissionPoints = [
    {
      id: 'wallet',
      title: 'Wallet System',
      icon: Wallet,
      color: '#6366F1',
      points: [
        { title: 'Prepaid Wallet', desc: 'Load credits for CAS analysis & data gathering services' },
        { title: 'Pay-Per-Use', desc: 'Deduct from wallet balance for each service used' },
        { title: 'Easy Top-Up', desc: 'Recharge wallet anytime via bank transfer' }
      ]
    },
    {
      id: 'realEstate',
      title: 'Dubai Real Estate',
      icon: Building2,
      color: colors.gold,
      points: [
        { title: 'Referral Commission', desc: '1-2% of property transaction value' },
        { title: 'Paid on Completion', desc: 'Commission released after successful transaction' }
      ]
    },
    {
      id: 'ncd',
      title: 'NCD/Bond Distribution',
      icon: TrendingUp,
      color: colors.success,
      points: [
        { title: 'Upfront Commission', desc: '0.50-1% of investment amount' },
        { title: 'Timely Payouts', desc: 'Commission settlement on deal closure' }
      ]
    },
    {
      id: 'payment',
      title: 'Payment & Settlement',
      icon: Globe,
      color: colors.primary,
      points: [
        { title: 'Currency Options', desc: 'Commissions paid in AED or USD' },
        { title: 'India Remittance', desc: 'Option to remit to Indian bank account' },
        { title: 'Charges Note', desc: 'Remittance & currency exchange charges borne by distributor' }
      ]
    }
  ];

  // Service Detail Card Component
  const ServiceDetailCard = ({ service }) => {
    const Icon = service.icon;
    
    return (
      <div 
        className="rounded-2xl overflow-hidden mb-8"
        style={{ backgroundColor: colors.white, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
        data-testid={`service-card-${service.id}`}
      >
        {/* Header */}
        <div 
          className="p-6"
          style={{ background: `linear-gradient(135deg, ${service.color}15 0%, ${service.color}05 100%)`, borderBottom: `3px solid ${service.color}` }}
        >
          <div className="flex items-start gap-4">
            <div 
              className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: service.color }}
            >
              <Icon className="h-7 w-7 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-1" style={{ color: colors.text }}>{service.title}</h3>
              <p className="text-sm font-medium" style={{ color: service.color }}>{service.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Description */}
          <p className="text-sm leading-relaxed mb-6" style={{ color: colors.textLight }}>
            {service.description}
          </p>

          {/* Key Benefits */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: colors.text }}>
              <CheckCircle className="h-4 w-4" style={{ color: colors.success }} />
              Key Benefits
            </h4>
            <div className="grid sm:grid-cols-2 gap-2">
              {service.keyBenefits.map((benefit, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: service.color }} />
                  <span className="text-xs" style={{ color: colors.text }}>{benefit}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Example Case Study */}
          <div 
            className="rounded-xl p-5 mb-6"
            style={{ backgroundColor: colors.cream }}
          >
            <h4 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: colors.text }}>
              <Target className="h-4 w-4" style={{ color: service.color }} />
              Example: How It Works
            </h4>
            
            <div className="flex items-center gap-3 mb-4">
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: service.color }}
              >
                <span className="text-white font-bold">{service.example.initials}</span>
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: colors.text }}>{service.example.name}</p>
                <p className="text-xs" style={{ color: colors.textLight }}>{service.example.subtitle}</p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: colors.textMuted }}>SITUATION</p>
                <p className="text-xs" style={{ color: colors.text }}>{service.example.scenario}</p>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: colors.textMuted }}>SOLUTION</p>
                <p className="text-xs" style={{ color: colors.text }}>{service.example.solution}</p>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: colors.textMuted }}>OUTCOME</p>
                <p className="text-xs" style={{ color: colors.text }}>{service.example.outcome}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {service.example.stats.map((stat, idx) => (
                <div key={idx} className="text-center p-2 rounded-lg" style={{ backgroundColor: colors.white }}>
                  <div className="text-sm font-bold" style={{ color: service.color }}>{stat.value}</div>
                  <div className="text-xs" style={{ color: colors.textMuted }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Considerations */}
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: colors.text }}>
              <Shield className="h-4 w-4" style={{ color: colors.primary }} />
              Key Considerations
            </h4>
            <div className="grid sm:grid-cols-2 gap-2">
              {service.considerations.map((point, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: service.color }} />
                  <span className="text-xs" style={{ color: colors.textLight }}>{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
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
                data-testid="nav-login-button"
              >
                Login
              </button>
            </div>

            <button
              className="md:hidden text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-toggle"
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
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <Award className="h-4 w-4" style={{ color: colors.gold }} />
              <span className="text-sm text-white/80">For AMFI Registered MFDs & SEBI Registered RIAs</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4">
              Grow Your Practice with
              <span className="block mt-2" style={{ color: colors.gold }}>Kinntegraa</span>
            </h1>
            <p className="text-base md:text-lg text-white/80 max-w-2xl mx-auto mb-8">
              A comprehensive platform for Indian Mutual Fund Distributors and Investment Advisors. 
              Analyze portfolios, distribute NCDs, offer Dubai real estate, and provide financial planning services.
            </p>
            
            {/* Eligibility Badges */}
            <div className="flex flex-wrap justify-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ backgroundColor: colors.gold }}>
                <Award className="h-4 w-4" style={{ color: colors.primary }} />
                <span className="text-sm font-semibold" style={{ color: colors.primary }}>AMFI Registered MFD</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ backgroundColor: colors.white }}>
                <Shield className="h-4 w-4" style={{ color: colors.primary }} />
                <span className="text-sm font-semibold" style={{ color: colors.primary }}>SEBI Registered RIA</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section with Tabs */}
      <section className="py-12" style={{ backgroundColor: colors.white }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: colors.text }}>
              Platform Services
            </h2>
            <p className="text-sm max-w-2xl mx-auto mb-6" style={{ color: colors.textLight }}>
              Expand your practice with our suite of tools and products designed for financial professionals
            </p>
          </div>

          {/* Service Tabs */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex rounded-xl p-1.5 shadow-md overflow-x-auto" style={{ backgroundColor: colors.cream }}>
              {services.map(service => {
                const ServiceIcon = service.icon;
                return (
                  <button
                    key={service.id}
                    onClick={() => setActiveServiceTab(service.id)}
                    className="px-4 py-3 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap"
                    style={{ 
                      backgroundColor: activeServiceTab === service.id ? service.color : 'transparent', 
                      color: activeServiceTab === service.id ? colors.white : colors.textLight 
                    }}
                    data-testid={`service-tab-${service.id}`}
                  >
                    <ServiceIcon className="h-4 w-4" />
                    {service.title.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Service Content */}
          <div>
            {services.filter(s => s.id === activeServiceTab).map(service => (
              <ServiceDetailCard key={service.id} service={service} />
            ))}
          </div>
        </div>
      </section>

      {/* What You Need to Know Section */}
      <section className="py-12" style={{ backgroundColor: colors.cream }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: colors.text }}>
              What You Need to Know
            </h2>
            <p className="text-sm max-w-2xl mx-auto mb-6" style={{ color: colors.textLight }}>
              Important information for MFDs and RIAs joining the platform
            </p>
            
            {/* Knowledge Tabs */}
            <div className="flex justify-center">
              <div className="inline-flex rounded-xl p-1 shadow-md overflow-x-auto" style={{ backgroundColor: colors.white }}>
                {knowledgeTabs.map(tab => {
                  const TabIcon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveKnowledgeTab(tab.id)}
                      className="px-4 py-2.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap"
                      style={{ 
                        backgroundColor: activeKnowledgeTab === tab.id ? tab.color : 'transparent', 
                        color: activeKnowledgeTab === tab.id ? colors.white : colors.textLight 
                      }}
                      data-testid={`knowledge-tab-${tab.id}`}
                    >
                      <TabIcon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Platform Benefits Content */}
          {activeKnowledgeTab === 'platform' && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {platformBenefits.map((section) => {
                const Icon = section.icon;
                return (
                  <div 
                    key={section.id}
                    className="rounded-xl overflow-hidden"
                    style={{ backgroundColor: colors.white }}
                  >
                    <div className="p-3 flex items-center gap-3" style={{ borderBottom: `2px solid ${section.color}` }}>
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: section.color }}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <h4 className="font-semibold text-sm" style={{ color: colors.text }}>
                        {section.title}
                      </h4>
                    </div>
                    <div className="p-4">
                      <div className="space-y-2">
                        {section.points.map((point, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: section.color }} />
                            <div>
                              <p className="text-xs font-medium" style={{ color: colors.text }}>{point.title}</p>
                              <p className="text-xs" style={{ color: colors.textMuted }}>{point.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Compliance Content */}
          {activeKnowledgeTab === 'compliance' && (
            <div className="grid md:grid-cols-3 gap-4">
              {compliancePoints.map((section) => {
                const Icon = section.icon;
                return (
                  <div 
                    key={section.id}
                    className="rounded-xl overflow-hidden"
                    style={{ backgroundColor: colors.white }}
                  >
                    <div className="p-3 flex items-center gap-3" style={{ borderBottom: `2px solid ${section.color}` }}>
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: section.color }}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <h4 className="font-semibold text-sm" style={{ color: colors.text }}>
                        {section.title}
                      </h4>
                    </div>
                    <div className="p-4">
                      <div className="space-y-2">
                        {section.points.map((point, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: section.color }} />
                            <div>
                              <p className="text-xs font-medium" style={{ color: colors.text }}>{point.title}</p>
                              <p className="text-xs" style={{ color: colors.textMuted }}>{point.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Commission Content */}
          {activeKnowledgeTab === 'commission' && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {commissionPoints.map((section) => {
                const Icon = section.icon;
                return (
                  <div 
                    key={section.id}
                    className="rounded-xl overflow-hidden"
                    style={{ backgroundColor: colors.white }}
                  >
                    <div className="p-3 flex items-center gap-3" style={{ borderBottom: `2px solid ${section.color}` }}>
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: section.color }}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <h4 className="font-semibold text-sm" style={{ color: colors.text }}>
                        {section.title}
                      </h4>
                    </div>
                    <div className="p-4">
                      <div className="space-y-2">
                        {section.points.map((point, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: section.color }} />
                            <div>
                              <p className="text-xs font-medium" style={{ color: colors.text }}>{point.title}</p>
                              <p className="text-xs" style={{ color: colors.textMuted }}>{point.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12" style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)` }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h3 className="text-2xl font-bold text-white mb-4">Ready to Grow Your Practice?</h3>
          <p className="text-white/80 mb-8">
            Join hundreds of MFDs and RIAs already using Kinntegraa to expand their services and grow their business.
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => navigate('/mfd-signup')}
              className="px-8 py-4 rounded-lg font-semibold transition-all hover:scale-105"
              style={{ backgroundColor: colors.gold, color: colors.primary }}
              data-testid="cta-get-started"
            >
              Get Started
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-4 rounded-lg font-semibold transition-all hover:scale-105 border-2 border-white/30 text-white"
              data-testid="cta-login"
            >
              Login
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default MFDistributorsPage;
