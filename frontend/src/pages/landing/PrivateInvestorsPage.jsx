import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Building2, 
  Heart,
  BarChart3,
  Plane,
  Menu,
  X,
  Home,
  Users,
  Globe,
  TrendingUp,
  CheckCircle,
  XCircle,
  FileSearch,
  Database,
  DollarSign,
  Shield,
  AlertTriangle,
  MapPin,
  FileText,
  Building,
  Scale,
  Wallet,
  Clock,
  Target,
  ChevronRight,
  ChevronLeft,
  Monitor
} from 'lucide-react';

const PrivateInvestorsPage = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('indian');
  const [activeKnowledgeTab, setActiveKnowledgeTab] = useState('realEstate');
  const [activeServiceTab, setActiveServiceTab] = useState('realEstate');
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const scrollContainerRef = useRef(null);

  // App preview screenshots for Real Estate - actual app screenshots
  const appPreviews = [
    {
      title: 'Investment Opportunities',
      description: 'Browse available properties with key metrics',
      image: 'https://customer-assets.emergentagent.com/job_d399f115-c244-418b-a9bd-599656c42166/artifacts/jg2lqeym_image.png'
    },
    {
      title: 'Property Gallery',
      description: 'View high-quality property images',
      image: 'https://customer-assets.emergentagent.com/job_d399f115-c244-418b-a9bd-599656c42166/artifacts/pi8fky2i_image.png'
    },
    {
      title: 'Payment Schedule',
      description: 'Calculate your investment & track milestones',
      image: 'https://customer-assets.emergentagent.com/job_d399f115-c244-418b-a9bd-599656c42166/artifacts/2b12oini_image.png'
    },
    {
      title: 'XIRR Calculator',
      description: 'Estimate returns at different scenarios',
      image: 'https://customer-assets.emergentagent.com/job_d399f115-c244-418b-a9bd-599656c42166/artifacts/09ze6yuo_image.png'
    }
  ];

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
    { path: '/mf-distributors', label: 'MFD/RIA' },
    { path: '/private-investors', label: 'Private Investors', active: true },
  ];

  const clientCategories = [
    { id: 'indian', label: 'Indian Passport Holder', icon: Users, description: 'NRIs & Resident Indians' },
    { id: 'foreign', label: 'Foreign Passport Holder', icon: Globe, description: 'International Investors' }
  ];

  // Detailed Service Sections for Indian Passport Holders
  const indianServices = [
    {
      id: 'realEstate',
      title: 'Real Estate Investment',
      subtitle: 'UAE Off-Plan & Ready Properties',
      icon: Home,
      color: colors.gold,
      description: 'Access premium Dubai real estate through fractional ownership. Invest in high-quality properties starting from just 25% ownership, significantly lowering your entry barrier while maintaining full pro-rata benefits.',
      keyBenefits: [
        'Start with 25% ownership - lower capital requirement',
        'Access premium properties previously out of reach',
        'Pro-rata rental income and capital appreciation',
        'Transparent cost structure with no hidden fees',
        'Quicker exit than selling fully owned property'
      ],
      example: {
        name: 'Mr. Rajesh Patel',
        initials: 'RP',
        subtitle: 'NRI in London',
        scenario: 'Wanted to invest in Dubai real estate but found AED 1.5M properties too expensive for full ownership.',
        solution: 'Through Kinntegraa, invested AED 375,000 for 25% ownership in a premium Dubai Marina property.',
        outcome: 'Now receives pro-rata rental income of AED 1,875/month and participates in capital appreciation with significantly lower risk exposure.',
        stats: [
          { label: 'Investment', value: 'AED 375,000' },
          { label: 'Ownership', value: '25%' },
          { label: 'Property Value', value: 'AED 1.5M' }
        ]
      },
      considerations: [
        'Market & developer due diligence handled by Kinntegraa',
        'Legal documentation standardized on platform',
        'Payment tracking via transparent dashboard',
        'Exit facilitated through platform network'
      ]
    },
    {
      id: 'ncd',
      title: 'NCD Investments',
      subtitle: 'Collateral-Backed Fixed Income',
      icon: TrendingUp,
      color: colors.success,
      description: 'Invest in carefully curated unlisted NCDs (Non-Convertible Debentures) backed by collateral. Ideal for generating regular passive income with yields ranging from 10-13% per annum.',
      keyBenefits: [
        'Regular monthly/quarterly income',
        'Collateral-backed security',
        '10-13% p.a. yields - higher than bank FDs',
        'Ideal for retirement income planning',
        'Diversification from equity markets'
      ],
      example: {
        name: 'Mr. Amit Shah',
        initials: 'AS',
        subtitle: 'NRI in Dubai, invests for parents in Ahmedabad',
        scenario: 'Wanted to generate regular income for retired parents in India while maintaining capital safety.',
        solution: 'Invested ₹50 Lakhs in collateral-backed NCDs through Kinntegraa.',
        outcome: 'Parents now receive ₹50,000/month regular income, with principal secured by collateral.',
        stats: [
          { label: 'Investment', value: '₹50 Lakhs' },
          { label: 'Yield', value: '12% p.a.' },
          { label: 'Monthly Income', value: '₹50,000' }
        ]
      },
      considerations: [
        'Each NCD vetted for collateral coverage',
        'Tenure options from 12 to 36 months',
        'Interest payout options: monthly, quarterly, or cumulative',
        'Secondary market exit options available'
      ]
    },
    {
      id: 'casAnalysis',
      title: 'CAS Analysis',
      subtitle: 'Mutual Fund Portfolio Consolidation',
      icon: FileSearch,
      color: '#6366F1',
      description: 'Get a comprehensive view of all your mutual fund investments across multiple distributors. Our CAS (Consolidated Account Statement) analysis service aggregates, analyzes, and provides actionable insights on your MF portfolio.',
      keyBenefits: [
        'Single consolidated view across all distributors',
        'Portfolio overlap and redundancy analysis',
        'Category-wise allocation insights',
        'Performance comparison vs benchmarks',
        'Tax-loss harvesting opportunities'
      ],
      example: {
        name: 'Mrs. Priya Mehta',
        initials: 'PM',
        subtitle: 'NRI in Singapore, investments across 4 distributors',
        scenario: 'Had MF investments spread across 4 different platforms in India, with no clear view of overall allocation.',
        solution: 'Kinntegraa CAS analysis consolidated all investments into a single comprehensive report.',
        outcome: 'Discovered 40% portfolio overlap, reallocated to better diversified funds for improved returns.',
        stats: [
          { label: 'Total MF Value', value: '₹1.2 Cr' },
          { label: 'Distributors', value: '4 platforms' },
          { label: 'Report', value: 'Consolidated' }
        ]
      },
      considerations: [
        'Supports all major AMCs in India',
        'Recommendations for portfolio optimization',
        'Annual refresh option available'
      ]
    },
    {
      id: 'dataGathering',
      title: 'Data Gathering Services',
      subtitle: 'Wealth Longevity Analysis',
      icon: Database,
      color: '#8B5CF6',
      description: 'Comprehensive financial data aggregation service that creates detailed 30-year cash flow projections. Understand how long your wealth will last under different scenarios - essential for retirement and estate planning.',
      keyBenefits: [
        '30-year forward cash flow projections',
        'Multiple scenario analysis (optimistic/base/conservative)',
        'Inflation-adjusted calculations',
        'Goal-based planning integration',
        'Estate planning considerations'
      ],
      example: {
        name: 'Mr. Kiran Desai',
        initials: 'KD',
        subtitle: 'NRI in USA, planning retirement in India',
        scenario: 'Planning to return to India in 5 years, needed to understand if current wealth would sustain 30+ years of retirement.',
        solution: 'Kinntegraa conducted comprehensive wealth longevity analysis with 5 different scenarios.',
        outcome: 'Clear roadmap showing wealth sustainability under various conditions, with specific recommendations for gap coverage.',
        stats: [
          { label: 'Analysis Period', value: '30 years' },
          { label: 'Scenarios', value: '5 different' },
          { label: 'Output', value: 'Detailed Report' }
        ]
      },
      considerations: [
        'Covers all asset classes: real estate, equity, debt, gold',
        'Includes liability projections',
        'Healthcare cost escalation factored',
        'Annual review and update available'
      ]
    }
  ];

  // Detailed Service Section for Foreign Passport Holders (Only Real Estate)
  const foreignServices = [
    {
      id: 'realEstate',
      title: 'Dubai Real Estate Investment',
      subtitle: 'Premium Properties via Fractional Ownership',
      icon: Home,
      color: colors.gold,
      description: 'As a foreign passport holder, Dubai real estate offers attractive investment opportunities with 100% foreign ownership allowed in freehold areas. Kinntegraa makes this even more accessible through fractional ownership.',
      keyBenefits: [
        '100% foreign ownership in freehold areas',
        'Start with 25% ownership - lower capital commitment',
        'Golden Visa eligibility for qualifying investments',
        'No property tax, no capital gains tax in UAE',
        'Strong rental yields (6-10% gross)',
        'Quicker exit than selling fully owned property'
      ],
      example: {
        name: 'Mr. John Wilson',
        initials: 'JW',
        subtitle: 'UK investor, first-time Dubai buyer',
        scenario: 'Wanted exposure to Dubai real estate market but unfamiliar with local processes and wary of committing full capital.',
        solution: 'Invested AED 500,000 through Kinntegraa for 25% ownership in a premium villa worth AED 2M.',
        outcome: 'Now has Dubai property exposure with professional management, receiving AED 2,500/month rental income and expects 28-35% XIRR over investment horizon.',
        stats: [
          { label: 'Investment', value: 'AED 500,000' },
          { label: 'Ownership', value: '25%' },
          { label: 'Expected XIRR', value: '28-35%' }
        ]
      },
      considerations: [
        'All documentation handled through platform',
        'DLD (Dubai Land Department) registration support',
        'Verified developer and property due diligence',
        'Rental management services available',
        'Exit facilitated through platform network'
      ],
      additionalInfo: {
        title: 'Why Dubai for Foreign Investors?',
        points: [
          { title: 'Tax Efficiency', desc: 'No income tax, property tax, or capital gains tax' },
          { title: 'Stable Currency', desc: 'AED pegged to USD since 1997' },
          { title: 'World-Class Infrastructure', desc: 'Continuously developing metro, roads, and amenities' },
          { title: 'Golden Visa', desc: 'Long-term residency for qualifying property investments' },
          { title: 'Strong Regulatory Framework', desc: 'RERA protection and escrow requirements' }
        ]
      }
    }
  ];

  // NCD vs FD Comparison Data
  const ncdVsFdComparison = [
    { 
      feature: 'Security', 
      ncd: 'Backed by specific assets of the issuing company; in case of default, investors have claim on these assets',
      fd: 'Usually bank-guaranteed; deposits up to ₹5 lakh insured by DICGC'
    },
    { 
      feature: 'Interest Rates', 
      ncd: 'Typically higher (10-13% p.a.) because they are debt instruments issued by companies',
      fd: 'Generally lower, as banks offer safe but moderate returns (6-7% p.a.)'
    },
    { 
      feature: 'Tenure Flexibility', 
      ncd: 'Medium to long-term (1-10 years), often with staggered interest payouts',
      fd: 'Short to medium-term (7 days - 10 years)'
    },
    { 
      feature: 'Tax Efficiency', 
      ncd: 'Interest taxable, but some NCDs may offer tax-free status under specific schemes',
      fd: 'Fully taxable as per investor\'s income tax slab'
    },
    { 
      feature: 'Liquidity', 
      ncd: 'Listed NCDs can be traded on exchanges before maturity',
      fd: 'Locked until maturity; early withdrawal often penalized'
    },
    { 
      feature: 'Cash Flow', 
      ncd: 'Periodic interest payouts (monthly, quarterly, yearly) at higher rates',
      fd: 'Fixed interest payout, generally annual or on maturity'
    }
  ];

  // NCD Knowledge Points - Same card format as Real Estate
  const ncdKnowledgePoints = [
    {
      id: 'ncdVsFd',
      title: 'NCDs vs Fixed Deposits',
      icon: TrendingUp,
      color: colors.success,
      points: [
        { title: 'Higher Returns', desc: '10-13% p.a. vs 6-7% for bank FDs' },
        { title: 'Asset-Backed Security', desc: 'Collateral protection in case of default' }
      ]
    },
    {
      id: 'payoutOptions',
      title: 'Payout Options',
      icon: Wallet,
      color: colors.gold,
      points: [
        { title: 'Monthly Payout', desc: 'Regular income for retirement planning' },
        { title: 'Quarterly Payout', desc: 'Balanced frequency for most investors' },
        { title: 'Annual Payout', desc: 'Higher effective yield due to compounding' },
        { title: 'Cumulative Option', desc: 'Full payout at maturity with compound interest' }
      ]
    },
    {
      id: 'risks',
      title: 'Key Risks to Consider',
      icon: AlertTriangle,
      color: colors.danger,
      points: [
        { title: 'Credit/Default Risk', desc: 'Company may default on payments' },
        { title: 'Liquidity Risk', desc: 'May be hard to sell before maturity' },
        { title: 'Interest Rate Risk', desc: 'Value drops if market rates rise' },
        { title: 'Inflation Risk', desc: 'Fixed returns may lag inflation' }
      ]
    },
    {
      id: 'dueDiligence',
      title: 'Due Diligence Checklist',
      icon: FileSearch,
      color: '#6366F1',
      points: [
        { title: 'Issuer Credit Rating', desc: 'Check ratings from CRISIL, ICRA, CARE' },
        { title: 'Collateral Coverage', desc: 'Asset value should exceed NCD value' },
        { title: 'Company Track Record', desc: 'History of timely interest payments' },
        { title: 'SEBI Registration', desc: 'Ensure regulatory compliance' }
      ]
    },
    {
      id: 'taxImplications',
      title: 'Tax Implications',
      icon: Scale,
      color: colors.primary,
      points: [
        { title: 'Interest Income', desc: 'Taxable as per your income slab' },
        { title: 'TDS Deduction', desc: '10% TDS applicable on interest' },
        { title: 'Capital Gains', desc: 'LTCG after 1 year if sold on exchange' }
      ]
    },
    {
      id: 'kinntegraaValue',
      title: 'Kinntegraa Value Add',
      icon: Shield,
      color: colors.success,
      points: [
        { title: 'Pre-Vetted NCDs', desc: 'Only collateral-backed, verified issuers' },
        { title: 'Regular Monitoring', desc: 'Continuous tracking of NCD performance' },
        { title: 'Exit Facilitation', desc: 'Secondary market access through platform' },
        { title: 'Transparent Reporting', desc: 'Clear documentation and status updates' }
      ]
    }
  ];

  // NCD Risks
  const ncdRisks = [
    {
      id: 'credit',
      title: 'Credit / Default Risk',
      icon: AlertTriangle,
      color: colors.danger,
      description: 'Even if secured, the company may default on interest or principal. Asset value may not fully cover investor claims in worst-case scenarios.'
    },
    {
      id: 'liquidity',
      title: 'Liquidity Risk',
      icon: Clock,
      color: '#6366F1',
      description: 'NCDs may not be easily sold if they are not listed or if market demand is low.'
    },
    {
      id: 'interest',
      title: 'Interest Rate Risk',
      icon: TrendingUp,
      color: colors.gold,
      description: 'If market interest rates rise, older NCDs with lower coupon rates may lose market value.'
    },
    {
      id: 'reinvestment',
      title: 'Reinvestment Risk',
      icon: Target,
      color: colors.primary,
      description: 'For periodic interest payouts, reinvesting interest at the same yield may not be possible if rates fall.'
    },
    {
      id: 'regulatory',
      title: 'Regulatory / Legal Risk',
      icon: Scale,
      color: '#8B5CF6',
      description: 'Proper registration with SEBI / RBI is required; legal complications may arise if the issuing company defaults.'
    },
    {
      id: 'inflation',
      title: 'Inflation Risk',
      icon: BarChart3,
      color: colors.success,
      description: 'Fixed interest may underperform inflation over long periods, reducing real returns.'
    }
  ];

  // CAS Analysis Points to Note
  const casAnalysisPoints = [
    {
      id: 'understanding',
      title: 'Understanding CAS',
      icon: FileSearch,
      color: '#6366F1',
      points: [
        { title: 'What is CAS?', desc: 'Consolidated Account Statement from CAMS/KFintech showing all MF holdings' },
        { title: 'Single Source of Truth', desc: 'Aggregates investments across all AMCs and distributors' },
        { title: 'Includes All Folios', desc: 'Shows holdings across regular and direct plans' }
      ]
    },
    {
      id: 'analysis',
      title: 'Portfolio Analysis Benefits',
      icon: BarChart3,
      color: colors.gold,
      points: [
        { title: 'Overlap Detection', desc: 'Identify if multiple funds hold the same stocks, reducing diversification' },
        { title: 'Category Allocation', desc: 'Understand exposure to large-cap, mid-cap, small-cap, debt, etc.' },
        { title: 'Performance Tracking', desc: 'Compare fund returns against category benchmarks' }
      ]
    },
    {
      id: 'optimization',
      title: 'Portfolio Optimization',
      icon: Target,
      color: colors.success,
      points: [
        { title: 'Fund Consolidation', desc: 'Reduce number of funds for easier management without losing diversification' },
        { title: 'Tax Efficiency', desc: 'Optimize for LTCG/STCG based on holding periods' },
        { title: 'Rebalancing Needs', desc: 'Identify if current allocation matches your risk profile' }
      ]
    },
    {
      id: 'nri_specific',
      title: 'NRI-Specific Considerations',
      icon: Globe,
      color: colors.primary,
      points: [
        { title: 'KYC Compliance', desc: 'Ensure all folios have updated NRI KYC status' },
        { title: 'TDS Implications', desc: 'Understand withholding tax on redemptions for NRIs' },
        { title: 'Repatriation Rules', desc: 'Know which funds allow easy repatriation of proceeds' }
      ]
    }
  ];

  // Data Gathering / Wealth Longevity Points to Note
  const dataGatheringPoints = [
    {
      id: 'scope',
      title: 'Data Collection Scope',
      icon: Database,
      color: '#8B5CF6',
      points: [
        { title: 'Financial Assets', desc: 'Bank accounts, FDs, MFs, stocks, bonds, NPS, PPF, EPF' },
        { title: 'Real Assets', desc: 'Properties, gold, vehicles, and other physical assets' },
        { title: 'Liabilities', desc: 'Home loans, car loans, credit cards, personal loans' },
        { title: 'Insurance', desc: 'Life, health, property, and vehicle insurance policies' }
      ]
    },
    {
      id: 'cashflow',
      title: 'Cash Flow Projections',
      icon: TrendingUp,
      color: colors.gold,
      points: [
        { title: 'Income Streams', desc: 'Salary, rental income, dividends, interest, pension' },
        { title: 'Regular Expenses', desc: 'Living costs, EMIs, insurance premiums, SIPs' },
        { title: 'Milestone Expenses', desc: 'Children education, weddings, home purchase, medical' },
        { title: 'Inflation Adjustment', desc: 'All projections adjusted for realistic inflation rates' }
      ]
    },
    {
      id: 'scenarios',
      title: 'Scenario Analysis',
      icon: BarChart3,
      color: colors.success,
      points: [
        { title: 'Base Case', desc: 'Expected returns and normal expense growth' },
        { title: 'Conservative Case', desc: 'Lower returns, higher inflation, unexpected expenses' },
        { title: 'Optimistic Case', desc: 'Better returns, controlled expenses' },
        { title: 'Stress Test', desc: 'Major market crash, job loss, or health emergency' }
      ]
    },
    {
      id: 'longevity',
      title: 'Wealth Longevity Output',
      icon: Clock,
      color: colors.primary,
      points: [
        { title: '30-Year Projection', desc: 'Year-by-year view of wealth accumulation/depletion' },
        { title: 'Sustainability Score', desc: 'Probability of wealth lasting through retirement' },
        { title: 'Gap Analysis', desc: 'Shortfall identification and corrective measures' },
        { title: 'Action Plan', desc: 'Specific recommendations to improve financial security' }
      ]
    }
  ];

  // Knowledge tabs configuration
  const knowledgeTabs = [
    { id: 'realEstate', label: 'Real Estate', icon: Home, color: colors.gold },
    { id: 'ncd', label: 'NCDs', icon: TrendingUp, color: colors.success },
    { id: 'casAnalysis', label: 'CAS Analysis', icon: FileSearch, color: '#6366F1' },
    { id: 'dataGathering', label: 'Data Gathering', icon: Database, color: '#8B5CF6' }
  ];

  // Dubai Real Estate Investment Points to Note (shown for both categories)
  const dubaiRealEstatePoints = [
    {
      id: 'market',
      title: 'Market & Investment Potential',
      icon: TrendingUp,
      color: colors.gold,
      points: [
        { title: 'Property Price Trends', desc: 'Historical and projected growth in residential or commercial areas' },
        { title: 'Rental Yields', desc: 'Expected rental income vs property price; gross and net yield' },
        { title: 'Capital Appreciation', desc: 'Areas or projects with high long-term value growth' },
        { title: 'Supply-Demand Dynamics', desc: 'Upcoming developments, oversupply risks, and occupancy rates' }
      ]
    },
    {
      id: 'developer',
      title: 'Developer & Project Information',
      icon: Building,
      color: colors.primary,
      points: [
        { title: 'Developer Reputation', desc: 'Past project track record, delivery timelines, quality, and financial stability' },
        { title: 'RERA Registration', desc: 'Ensures legality and regulatory compliance of project approvals' },
        { title: 'Construction Progress', desc: 'Timelines for off-plan properties to plan financial commitments' },
        { title: 'Payment Plans', desc: 'Flexible payment plans, post-handover plans, or early-bird offers' }
      ]
    },
    {
      id: 'legal',
      title: 'Legal & Regulatory Details',
      icon: Scale,
      color: '#6366F1',
      points: [
        { title: 'Ownership Rights', desc: 'Freehold vs leasehold, eligibility for non-residents, title deed security' },
        { title: 'Visa-Linked Benefits', desc: 'Whether investment qualifies for UAE residency visa' },
        { title: 'Transaction Fees', desc: 'DLD fees, agency fees, escrow account usage' },
        { title: 'Dispute Resolution', desc: 'Mechanisms for legal recourse in case of conflicts' }
      ]
    },
    {
      id: 'financial',
      title: 'Financial & Tax Considerations',
      icon: Wallet,
      color: colors.success,
      points: [
        { title: 'Total Acquisition Cost', desc: 'Including service charges, maintenance fees, insurance, and utilities' },
        { title: 'Currency Risk', desc: 'Fluctuations between home currency and AED; hedging options' },
        { title: 'Exit Strategy', desc: 'Ease of resale, liquidity in secondary market, and expected ROI' },
        { title: 'Taxation', desc: 'No Dubai property/capital gains tax, but consider home country taxation' }
      ]
    },
    {
      id: 'risk',
      title: 'Risk Assessment',
      icon: AlertTriangle,
      color: colors.danger,
      points: [
        { title: 'Project Delivery Risk', desc: 'Delays or cancellations in off-plan developments' },
        { title: 'Market Volatility', desc: 'Impact of economic cycles, global interest rates, or regulatory changes' },
        { title: 'Tenant Risk', desc: 'Default risk if property is leased, especially for rental income planning' }
      ]
    },
    {
      id: 'lifestyle',
      title: 'Practical Considerations',
      icon: MapPin,
      color: '#8B5CF6',
      points: [
        { title: 'Location Suitability', desc: 'Proximity to work, schools, healthcare, and leisure facilities' },
        { title: 'Property Management', desc: 'Availability of management services for NRIs or absentee owners' },
        { title: 'Future Infrastructure', desc: 'Upcoming metro lines, malls, or airports that enhance property value' }
      ]
    }
  ];

  const currentCategory = clientCategories.find(c => c.id === activeCategory);
  const activeServices = activeCategory === 'indian' ? indianServices : foreignServices;

  // Service Detail Card Component - Same layout for all services
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

          {/* Additional Info for Foreign Investors */}
          {service.additionalInfo && (
            <div className="mt-6 pt-6" style={{ borderTop: `1px solid ${colors.cream}` }}>
              <h4 className="text-sm font-semibold mb-3" style={{ color: colors.text }}>
                {service.additionalInfo.title}
              </h4>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {service.additionalInfo.points.map((point, idx) => (
                  <div key={idx} className="p-3 rounded-lg" style={{ backgroundColor: colors.cream }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: service.color }}>{point.title}</p>
                    <p className="text-xs" style={{ color: colors.textLight }}>{point.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
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
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4">
              Solutions for
              <span className="block mt-2" style={{ color: colors.gold }}>Private Investors</span>
            </h1>
            <p className="text-base md:text-lg text-white/80 max-w-2xl mx-auto">
              Whether you hold an Indian or Foreign passport, we have tailored 
              solutions for your investment and financial planning needs.
            </p>
          </div>
        </div>
      </section>

      {/* Category Tabs */}
      <div className="flex justify-center -mt-6 relative z-10 px-4">
        <div className="inline-flex rounded-full p-1.5 shadow-lg overflow-x-auto" style={{ backgroundColor: colors.white }}>
          {clientCategories.map(cat => {
            const Icon = cat.icon;
            const serviceCount = cat.id === 'indian' ? 4 : 1;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 md:px-6 py-2.5 rounded-full text-xs md:text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap`}
                style={{ 
                  backgroundColor: activeCategory === cat.id ? colors.primary : 'transparent', 
                  color: activeCategory === cat.id ? colors.white : colors.textLight 
                }}
                data-testid={`category-tab-${cat.id}`}
              >
                <Icon className="h-4 w-4" />
                {cat.label}
                <span 
                  className="px-1.5 py-0.5 rounded-full text-xs"
                  style={{ 
                    backgroundColor: activeCategory === cat.id ? colors.gold : colors.cream,
                    color: activeCategory === cat.id ? colors.primary : colors.textLight
                  }}
                >
                  {serviceCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Service Offerings Based on Selection - Tabbed Interface */}
      <section className="py-12" style={{ backgroundColor: colors.white }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: colors.text }}>
              Our Services
            </h2>
            <p className="text-sm max-w-2xl mx-auto mb-6" style={{ color: colors.textLight }}>
              {activeCategory === 'indian' 
                ? 'Choose from our range of investment and financial planning services'
                : 'Dubai real estate investment through fractional ownership'
              }
            </p>
          </div>

          {/* Service Tabs - Only show for Indian Passport Holders */}
          {activeCategory === 'indian' && (
            <div className="flex justify-center mb-8">
              <div className="inline-flex rounded-xl p-1.5 shadow-md overflow-x-auto" style={{ backgroundColor: colors.cream }}>
                {activeServices.map(service => {
                  const ServiceIcon = service.icon;
                  return (
                    <button
                      key={service.id}
                      onClick={() => setActiveServiceTab(service.id)}
                      className="px-5 py-3 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap"
                      style={{ 
                        backgroundColor: activeServiceTab === service.id ? service.color : 'transparent', 
                        color: activeServiceTab === service.id ? colors.white : colors.textLight 
                      }}
                      data-testid={`service-tab-${service.id}`}
                    >
                      <ServiceIcon className="h-4 w-4" />
                      {service.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Service Content */}
          <div data-testid={`services-container-${activeCategory}`}>
            {activeCategory === 'indian' 
              ? activeServices.filter(s => s.id === activeServiceTab).map(service => (
                  <ServiceDetailCard key={service.id} service={service} />
                ))
              : activeServices.map(service => (
                  <ServiceDetailCard key={service.id} service={service} />
                ))
            }
          </div>

          {/* Unavailable Services Note for Foreign Passport Holders */}
          {activeCategory === 'foreign' && (
            <div 
              className="rounded-xl p-6 mt-8"
              style={{ backgroundColor: colors.cream, border: `1px dashed ${colors.textMuted}` }}
              data-testid="unavailable-services-note"
            >
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: colors.text }}>
                <AlertTriangle className="h-4 w-4" style={{ color: colors.gold }} />
                Services Not Available for Foreign Passport Holders
              </h4>
              <p className="text-xs mb-4" style={{ color: colors.textLight }}>
                Due to Indian regulatory requirements, the following services are only available to Indian passport holders (including NRIs):
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { title: 'NCD Investments', desc: 'Indian SEBI regulations' },
                  { title: 'CAS Analysis', desc: 'Indian MF data only' },
                  { title: 'Data Gathering', desc: 'Indian financial data' }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: colors.white }}>
                    <XCircle className="h-4 w-4 flex-shrink-0" style={{ color: colors.danger }} />
                    <div>
                      <p className="text-xs font-semibold" style={{ color: colors.text }}>{item.title}</p>
                      <p className="text-xs" style={{ color: colors.textMuted }}>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Unified "What You Need to Know" Section with Tabs */}
      <section className="py-12" style={{ backgroundColor: colors.cream }} data-testid="what-you-need-to-know">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: colors.text }}>
              What You Need to Know
            </h2>
            <p className="text-sm max-w-2xl mx-auto mb-6" style={{ color: colors.textLight }}>
              {activeCategory === 'indian' 
                ? 'Deep dive into each service offering to make informed investment decisions'
                : 'Key considerations for Dubai real estate investment'
              }
            </p>
            
            {/* Knowledge Tabs - Show all 4 for Indian, only Real Estate for Foreign */}
            <div className="flex justify-center">
              <div className="inline-flex rounded-xl p-1 shadow-md overflow-x-auto" style={{ backgroundColor: colors.white }}>
                {(activeCategory === 'indian' ? knowledgeTabs : knowledgeTabs.filter(t => t.id === 'realEstate')).map(tab => {
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

          {/* Real Estate Content */}
          {activeKnowledgeTab === 'realEstate' && (
            <div data-testid="knowledge-content-realEstate">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dubaiRealEstatePoints.map((section) => {
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
            </div>
          )}

          {/* NCD Content - Only for Indian - Same card format as Real Estate */}
          {activeKnowledgeTab === 'ncd' && activeCategory === 'indian' && (
            <div data-testid="knowledge-content-ncd">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ncdKnowledgePoints.map((section) => {
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
            </div>
          )}

          {/* CAS Analysis Content - Only for Indian */}
          {activeKnowledgeTab === 'casAnalysis' && activeCategory === 'indian' && (
            <div data-testid="knowledge-content-casAnalysis">
              <div className="grid md:grid-cols-2 gap-4">
                {casAnalysisPoints.map((section) => {
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

              {/* CAS Analysis Benefits Summary */}
              <div 
                className="mt-6 p-5 rounded-xl"
                style={{ backgroundColor: colors.white, border: `1px solid #6366F130` }}
              >
                <div className="flex items-start gap-4">
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#6366F1' }}
                  >
                    <FileSearch className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2" style={{ color: colors.text }}>Why Get Your CAS Analyzed?</h4>
                    <p className="text-sm mb-3" style={{ color: colors.textLight }}>
                      Most NRIs have MF investments spread across multiple distributors, leading to portfolio overlap 
                      and missed optimization opportunities.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {[
                        { value: '40%', label: 'Avg. Portfolio Overlap' },
                        { value: '1 Report', label: 'Consolidated View' }
                      ].map((stat, idx) => (
                        <div key={idx} className="text-center p-3 rounded-lg" style={{ backgroundColor: '#6366F110' }}>
                          <div className="text-lg font-bold" style={{ color: '#6366F1' }}>{stat.value}</div>
                          <div className="text-xs" style={{ color: colors.textMuted }}>{stat.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Data Gathering Content - Only for Indian */}
          {activeKnowledgeTab === 'dataGathering' && activeCategory === 'indian' && (
            <div data-testid="knowledge-content-dataGathering">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dataGatheringPoints.map((section) => {
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

              {/* Data Gathering Benefits Summary */}
              <div 
                className="mt-6 p-5 rounded-xl"
                style={{ backgroundColor: colors.white, border: `1px solid #8B5CF630` }}
              >
                <div className="flex items-start gap-4">
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#8B5CF6' }}
                  >
                    <Database className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2" style={{ color: colors.text }}>Why Wealth Longevity Analysis Matters</h4>
                    <p className="text-sm mb-3" style={{ color: colors.textLight }}>
                      Planning for retirement without understanding how long your wealth will last is like driving without a map. 
                      Our 30-year projections give you clarity and confidence.
                    </p>
                    <div className="grid sm:grid-cols-4 gap-3">
                      {[
                        { value: '30', label: 'Year Projection' },
                        { value: '5', label: 'Scenarios Analyzed' },
                        { value: '100%', label: 'Asset Coverage' },
                        { value: '1', label: 'Action Plan' }
                      ].map((stat, idx) => (
                        <div key={idx} className="text-center p-3 rounded-lg" style={{ backgroundColor: '#8B5CF610' }}>
                          <div className="text-lg font-bold" style={{ color: '#8B5CF6' }}>{stat.value}</div>
                          <div className="text-xs" style={{ color: colors.textMuted }}>{stat.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Kinntegraa Solutions Summary */}
      <section className="py-12" style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)` }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: colors.gold }}>
              <span className="text-2xl font-bold" style={{ color: colors.primary }}>K</span>
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
              Why Choose Kinntegraa?
            </h3>
            <p className="text-sm text-white/70 max-w-2xl mx-auto">
              We address every pain point investors face in their wealth journey
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <div className="p-5 rounded-xl text-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: colors.gold }}>
                <Wallet className="h-6 w-6" style={{ color: colors.primary }} />
              </div>
              <h4 className="font-semibold text-white mb-2">Lower Entry Barriers</h4>
              <p className="text-xs text-white/70">Start real estate investment from just 25% ownership</p>
            </div>

            <div className="p-5 rounded-xl text-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: colors.gold }}>
                <Shield className="h-6 w-6" style={{ color: colors.primary }} />
              </div>
              <h4 className="font-semibold text-white mb-2">Complete Transparency</h4>
              <p className="text-xs text-white/70">All documentation, costs, and tracking on one platform</p>
            </div>

            <div className="p-5 rounded-xl text-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: colors.gold }}>
                <TrendingUp className="h-6 w-6" style={{ color: colors.primary }} />
              </div>
              <h4 className="font-semibold text-white mb-2">Quicker Exit Options</h4>
              <p className="text-xs text-white/70">Exit faster than selling fully owned property</p>
            </div>
          </div>

          {/* Key Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { value: '25%', label: 'Min. Entry' },
              { value: '4', label: 'Services (Indian)' },
              { value: '100%', label: 'Transparent' },
              { value: 'Pro-rata', label: 'Returns' }
            ].map((stat, idx) => (
              <div key={idx} className="text-center p-4 rounded-lg" style={{ backgroundColor: colors.gold }}>
                <div className="text-xl font-bold" style={{ color: colors.primary }}>{stat.value}</div>
                <div className="text-xs" style={{ color: colors.primaryDark }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12" style={{ backgroundColor: colors.white }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h3 className="text-2xl font-bold mb-4" style={{ color: colors.text }}>Ready to Start Investing?</h3>
          <p className="mb-8" style={{ color: colors.textLight }}>
            Create your account and explore investment opportunities tailored for you.
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => navigate('/signup')}
              className="px-8 py-4 rounded-lg font-semibold transition-all hover:scale-105"
              style={{ backgroundColor: colors.gold, color: colors.primary }}
              data-testid="cta-get-started"
            >
              Get Started
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-4 rounded-lg font-semibold transition-all hover:scale-105"
              style={{ backgroundColor: colors.primary, color: colors.white }}
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

export default PrivateInvestorsPage;
