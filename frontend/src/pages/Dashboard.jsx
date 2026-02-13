import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { 
  TrendingUp, 
  Users, 
  Building2, 
  Briefcase,
  Landmark,
  RefreshCw,
  Trash2,
  AlertTriangle,
  X,
  ArrowRightLeft,
  Mail
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Color palette - softer, professional tones
const COLORS = {
  primary: "#4F46E5",
  secondary: "#7C3AED",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#3B82F6",
  venn: {
    bonds: "#C8A456",      // Etihad Gold for Bonds
    realEstate: "#1A365D", // Etihad Dark Navy for Real Estate  
    both: "#8B6914"        // Etihad Bronze for overlap
  }
};

// Format currency for INR (Crores)
const formatINRCrores = (value) => {
  if (value === undefined || value === null || value === 0) return "₹0";
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)} K`;
  return `₹${value.toLocaleString('en-IN')}`;
};

// Format currency for AED (Millions)
const formatAEDMillions = (value) => {
  if (value === undefined || value === null || value === 0) return "AED 0";
  if (value >= 1000000) return `AED ${(value / 1000000).toFixed(2)} M`;
  if (value >= 1000) return `AED ${(value / 1000).toFixed(1)} K`;
  return `AED ${value.toLocaleString()}`;
};

// Format current date/time in the required format: "02:10 AM | Tuesday, 23rd Mar 2020"
const formatDateTime = () => {
  const now = new Date();
  
  // Time format: "02:10 AM"
  const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
  const timeStr = now.toLocaleTimeString('en-US', timeOptions);
  
  // Day of week
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[now.getDay()];
  
  // Day with ordinal suffix
  const day = now.getDate();
  const suffix = (day === 1 || day === 21 || day === 31) ? 'st' 
               : (day === 2 || day === 22) ? 'nd' 
               : (day === 3 || day === 23) ? 'rd' 
               : 'th';
  
  // Month abbreviation
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = months[now.getMonth()];
  
  // Year
  const year = now.getFullYear();
  
  return `${timeStr} | ${dayName}, ${day}${suffix} ${monthName} ${year}`;
};

// Venn Diagram Component - Softer colors, cleaner design
const VennDiagram = ({ bondOnly, realEstateOnly, both }) => {
  return (
    <div className="relative w-full h-44 flex items-center justify-center">
      <svg viewBox="0 0 280 160" className="w-full h-full max-w-[280px]">
        <defs>
          <clipPath id="leftCircle">
            <circle cx="95" cy="80" r="55" />
          </clipPath>
        </defs>
        
        {/* Left circle (Bonds) */}
        <circle 
          cx="95" 
          cy="80" 
          r="55" 
          fill={COLORS.venn.bonds}
          fillOpacity="0.75"
        />
        
        {/* Right circle (Real Estate) */}
        <circle 
          cx="170" 
          cy="80" 
          r="55" 
          fill={COLORS.venn.realEstate}
          fillOpacity="0.75"
        />
        
        {/* Overlap */}
        <g clipPath="url(#leftCircle)">
          <circle 
            cx="170" 
            cy="80" 
            r="55" 
            fill={COLORS.venn.both}
            fillOpacity="0.9"
          />
        </g>
        
        {/* Numbers */}
        <text x="65" y="85" textAnchor="middle" className="fill-white font-semibold" style={{ fontSize: '20px' }}>
          {bondOnly}
        </text>
        <text x="132" y="85" textAnchor="middle" className="fill-white font-semibold" style={{ fontSize: '20px' }}>
          {both}
        </text>
        <text x="200" y="85" textAnchor="middle" className="fill-white font-semibold" style={{ fontSize: '20px' }}>
          {realEstateOnly}
        </text>
      </svg>
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [emailSummary, setEmailSummary] = useState(null);
  const [aumDistribution, setAumDistribution] = useState({ by_asset_class: [], by_subbroker: [] });
  const [forexRate, setForexRate] = useState(22.5); // Default AED to INR rate
  const [goldRate, setGoldRate] = useState(78500); // Default Gold rate per 10g in INR
  const [silverRate, setSilverRate] = useState(950); // Default Silver rate per 10g in INR
  const [currentTime, setCurrentTime] = useState(formatDateTime());
  
  // Reset database state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  
  // Fix data state
  const [showFixDataModal, setShowFixDataModal] = useState(false);
  const [fixingData, setFixingData] = useState(false);
  const [fixDataResults, setFixDataResults] = useState(null);
  const [availableBonds, setAvailableBonds] = useState([]);
  const [selectedBondForFix, setSelectedBondForFix] = useState("");

  // Set page title and update time
  useEffect(() => {
    document.title = "Kinntegraa | Dashboard";
    
    // Update time every minute
    const timer = setInterval(() => {
      setCurrentTime(formatDateTime());
    }, 60000);
    
    return () => clearInterval(timer);
  }, []);

  const handleResetDatabase = async () => {
    if (resetConfirmText !== "RESET") {
      toast.error("Please type RESET to confirm");
      return;
    }
    
    setResetting(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/admin/reset-database?secret_key=KINNTEGRAA_RESET_2026`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      
      if (response.data.success) {
        toast.success(`Database reset successful! Deleted: ${Object.entries(response.data.deleted || {}).filter(([k,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(', ') || 'All data cleared'}`);
        setShowResetModal(false);
        setResetConfirmText("");
        // Refresh dashboard data
        fetchDashboardData();
      }
    } catch (error) {
      console.error("Reset error:", error);
      toast.error(error.response?.data?.detail || "Failed to reset database");
    } finally {
      setResetting(false);
    }
  };

  // Fetch available bonds for fix data
  const fetchAvailableBonds = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/bonds`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // API returns {data: [...], pagination: {...}}
      const bondsData = response.data?.data || response.data || [];
      if (Array.isArray(bondsData)) {
        setAvailableBonds(bondsData.filter(b => b.bond_code));
      }
    } catch (error) {
      console.error("Error fetching bonds:", error);
    }
  };

  // Fix all data for a bond (cleanup duplicates + recalculate maturity)
  const handleFixAllData = async () => {
    if (!selectedBondForFix) {
      toast.error("Please select a bond");
      return;
    }
    
    setFixingData(true);
    setFixDataResults(null);
    
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/admin/fix-all-data?bond_code=${selectedBondForFix}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      if (response.data.success) {
        setFixDataResults(response.data.results);
        toast.success(`Data fixed for ${selectedBondForFix}! Duplicates removed: ${response.data.results.duplicate_repayments_removed + response.data.results.duplicate_emails_removed}, Trades recalculated: ${response.data.results.trades_recalculated}`);
        // Refresh dashboard data
        fetchDashboardData();
      }
    } catch (error) {
      console.error("Fix data error:", error);
      toast.error(error.response?.data?.detail || "Failed to fix data");
    } finally {
      setFixingData(false);
    }
  };

  // Fix all bonds at once
  const handleFixAllBonds = async () => {
    setFixingData(true);
    setFixDataResults(null);
    
    let totalResults = {
      duplicate_repayments_removed: 0,
      duplicate_emails_removed: 0,
      trades_recalculated: 0,
      bonds_processed: 0
    };
    
    try {
      const token = localStorage.getItem("token");
      
      for (const bond of availableBonds) {
        if (!bond.bond_code) continue;
        
        const response = await axios.post(
          `${API}/admin/fix-all-data?bond_code=${bond.bond_code}`,
          {},
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        
        if (response.data.success) {
          totalResults.duplicate_repayments_removed += response.data.results.duplicate_repayments_removed || 0;
          totalResults.duplicate_emails_removed += response.data.results.duplicate_emails_removed || 0;
          totalResults.trades_recalculated += response.data.results.trades_recalculated || 0;
          totalResults.bonds_processed += 1;
        }
      }
      
      setFixDataResults(totalResults);
      toast.success(`All bonds fixed! ${totalResults.bonds_processed} bonds processed, ${totalResults.trades_recalculated} trades recalculated`);
      fetchDashboardData();
    } catch (error) {
      console.error("Fix all bonds error:", error);
      toast.error(error.response?.data?.detail || "Failed to fix all bonds");
    } finally {
      setFixingData(false);
    }
  };

  // Reset auto-tag data (delete all auto-tagged entries and reset email logs)
  const handleResetAutoTag = async () => {
    if (!selectedBondForFix) {
      toast.error("Please select a bond");
      return;
    }
    
    if (!window.confirm(`This will DELETE all auto-tagged repayments for ${selectedBondForFix} and reset email logs. You will need to run auto-tag again. Continue?`)) {
      return;
    }
    
    setFixingData(true);
    setFixDataResults(null);
    
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/admin/reset-auto-tag?bond_code=${selectedBondForFix}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      if (response.data.success) {
        setFixDataResults(response.data.results);
        toast.success(`Auto-tag data reset for ${selectedBondForFix}! You can now run auto-tag again from Email Engagement page.`);
        fetchDashboardData();
      }
    } catch (error) {
      console.error("Reset auto-tag error:", error);
      toast.error(error.response?.data?.detail || "Failed to reset auto-tag data");
    } finally {
      setFixingData(false);
    }
  };

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "broker") {
      navigate("/sub-broker/opportunities");
      return;
    }
    
    setUser(parsedUser);
    fetchDashboardData();
    fetchForexRate();
    fetchGoldRate();
    fetchSilverRate();
    fetchAvailableBonds();
  }, [navigate]);

  const fetchForexRate = async () => {
    try {
      const response = await axios.get(`${API}/forex/aed-to-inr`);
      if (response.data?.rate) {
        setForexRate(response.data.rate);
      }
    } catch (error) {
      console.error("Error fetching forex rate:", error);
      // Keep default rate
    }
  };

  const fetchGoldRate = async () => {
    try {
      // Use GoldPrice.org free API for INR gold prices
      const response = await axios.get('https://data-asg.goldprice.org/dbXRates/INR', {
        timeout: 5000
      });
      if (response.data?.items?.[0]?.xauPrice) {
        // Price is per troy oz, convert to per 10g
        // 1 troy oz = 31.1035 grams
        const pricePerOz = response.data.items[0].xauPrice;
        const pricePerGram = pricePerOz / 31.1035;
        const pricePer10g = Math.round(pricePerGram * 10);
        setGoldRate(pricePer10g);
      }
    } catch (error) {
      console.error("Error fetching gold rate:", error);
      // Keep default rate
    }
  };

  const fetchSilverRate = async () => {
    try {
      // Use GoldPrice.org free API for INR silver prices (XAG)
      const response = await axios.get('https://data-asg.goldprice.org/dbXRates/INR', {
        timeout: 5000
      });
      if (response.data?.items?.[0]?.xagPrice) {
        // Price is per troy oz, convert to per 10g
        // 1 troy oz = 31.1035 grams
        const pricePerOz = response.data.items[0].xagPrice;
        const pricePerGram = pricePerOz / 31.1035;
        const pricePer10g = Math.round(pricePerGram * 10);
        setSilverRate(pricePer10g);
      }
    } catch (error) {
      console.error("Error fetching silver rate:", error);
      // Keep default rate
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      const [summaryRes, aumRes, emailRes] = await Promise.all([
        axios.get(`${API}/dashboard/summary`, { headers }),
        axios.get(`${API}/dashboard/aum-distribution`, { headers }),
        axios.get(`${API}/email-engagement/summary`, { headers }).catch(() => ({ data: null }))
      ]);

      setSummary(summaryRes.data);
      setAumDistribution(aumRes.data);
      setEmailSummary(emailRes.data);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!user || loading) {
    return (
      <div className="flex h-screen bg-slate-950">
        <Sidebar user={user} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-etihad-maroon-500 mx-auto mb-4" />
            <p className="text-slate-400">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  // Client product distribution for Venn diagram
  const bondOnlyClients = summary?.clients?.bond_only || 0;
  const realEstateOnlyClients = summary?.clients?.real_estate_only || 0;
  const bothProductsClients = summary?.clients?.both_products || 0;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header with Date/Time */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">{currentTime}</p>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => { fetchDashboardData(); fetchForexRate(); fetchGoldRate(); setCurrentTime(formatDateTime()); }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                data-testid="refresh-dashboard-btn"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 max-w-7xl mx-auto space-y-6">
          {/* Dashboard Cards - Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="kpi-cards">
            
            {/* Total Clients - Venn Diagram Style */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="clients-venn-card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-indigo-500/10">
                    <Users className="h-5 w-5 text-etihad-maroon-500" />
                  </div>
                  <h3 className="font-semibold text-gray-800">Clients</h3>
                </div>
              </div>
              
              {/* Venn Diagram */}
              <VennDiagram 
                bondOnly={bondOnlyClients}
                realEstateOnly={realEstateOnlyClients}
                both={bothProductsClients}
              />
              
              {/* Legend */}
              <div className="flex justify-center gap-4 mt-2 pt-3 border-t">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.venn.bonds }}></div>
                  <span className="text-xs text-gray-600">Bonds</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.venn.realEstate }}></div>
                  <span className="text-xs text-gray-600">Real Estate</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.venn.both }}></div>
                  <span className="text-xs text-gray-600">Both</span>
                </div>
              </div>
            </div>

            {/* Sub-Brokers Count */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="subbrokers-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Briefcase className="h-5 w-5 text-amber-600" />
                </div>
                <h3 className="font-semibold text-gray-800">Sub-Brokers</h3>
              </div>
              
              <div className="flex items-center justify-center my-6">
                <div className="text-center">
                  <p className="text-5xl font-bold text-amber-700">{summary?.sub_brokers?.total || 0}</p>
                  <p className="text-sm text-gray-500 mt-2">Total Partners</p>
                </div>
              </div>
              
              <div className="flex justify-center gap-6 border-t pt-3 mt-2">
                <div className="text-center">
                  <p className="text-lg font-semibold text-emerald-600">{summary?.sub_brokers?.active || 0}</p>
                  <p className="text-xs text-gray-500">Active</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-400">{(summary?.sub_brokers?.total || 0) - (summary?.sub_brokers?.active || 0)}</p>
                  <p className="text-xs text-gray-500">Inactive</p>
                </div>
              </div>
            </div>

            {/* Email Tracker Card */}
            <div 
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer" 
              data-testid="email-tracker-card"
              onClick={() => navigate("/broker/email-engagement")}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Mail className="h-5 w-5 text-blue-500" />
                </div>
                <h3 className="font-semibold text-gray-800">Email Tracker</h3>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded ml-auto">Repayments</span>
              </div>
              
              <div className="flex items-center justify-center my-4">
                <div className="text-center">
                  <p className="text-4xl font-bold text-blue-600">{emailSummary?.total_emails_read || 0}</p>
                  <p className="text-sm text-gray-500 mt-1">Emails Read</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 border-t pt-3">
                <div className="text-center">
                  <p className="text-lg font-semibold text-emerald-600">{emailSummary?.holdings_updated || 0}</p>
                  <p className="text-xs text-gray-500">Holdings Updated</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-amber-600">{emailSummary?.holdings_pending || 0}</p>
                  <p className="text-xs text-gray-500">Pending</p>
                </div>
              </div>
            </div>
          </div>

          {/* Dashboard Cards - Row 2: Opportunities and AUM */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Opportunities - Bonds & Real Estate (Available Only) */}
            <div 
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer" 
              data-testid="opportunities-card"
              onClick={() => navigate("/broker/opportunities")}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                </div>
                <h3 className="font-semibold text-gray-800">Available Opportunities</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4 my-4">
                <div className="bg-etihad-gold-50 rounded-lg p-4 text-center border border-etihad-gold-200">
                  <Landmark className="h-8 w-8 text-etihad-gold-500 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-etihad-gold-700">{summary?.opportunities?.bonds?.available || 0}</p>
                  <p className="text-xs text-etihad-gold-600 mt-1">Bonds</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 text-center border border-slate-200">
                  <Building2 className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-slate-700">{summary?.opportunities?.real_estate?.available || 0}</p>
                  <p className="text-xs text-slate-600 mt-1">Real Estate</p>
                </div>
              </div>
            </div>
            
            {/* Bond AUM Details */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="bond-aum-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-etihad-gold-500/10">
                  <Landmark className="h-5 w-5 text-etihad-gold-500" />
                </div>
                <h3 className="font-semibold text-gray-800">Bond AUM</h3>
                <span className="text-xs bg-etihad-gold-100 text-etihad-gold-700 px-2 py-0.5 rounded">INR</span>
                <button 
                  onClick={() => { setShowFixDataModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors ml-auto"
                  data-testid="fix-data-btn"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Fix Data
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <p className="text-xs text-blue-600 uppercase tracking-wide">Invested</p>
                  <p className="text-lg font-bold text-blue-700 mt-1">{formatINRCrores(summary?.bond_aum?.total_invested || 0)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <p className="text-xs text-emerald-600 uppercase tracking-wide">Repaid</p>
                  <p className="text-lg font-bold text-emerald-700 mt-1">{formatINRCrores(summary?.bond_aum?.total_repaid || 0)}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                  <p className="text-xs text-orange-600 uppercase tracking-wide">Pending</p>
                  <p className="text-lg font-bold text-orange-700 mt-1">{formatINRCrores(summary?.bond_aum?.total_pending || 0)}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                  <p className="text-xs text-purple-600 uppercase tracking-wide">Profits</p>
                  <p className="text-lg font-bold text-purple-700 mt-1">{formatINRCrores(summary?.bond_aum?.profits || 0)}</p>
                </div>
              </div>
            </div>

            {/* Real Estate AUM Details */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="real-estate-aum-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-slate-500/10">
                  <Building2 className="h-5 w-5 text-slate-600" />
                </div>
                <h3 className="font-semibold text-gray-800">Real Estate AUM</h3>
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded ml-auto">AED</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-xs text-slate-600 uppercase tracking-wide">Deal Size</p>
                  <p className="text-lg font-bold text-slate-700 mt-1">{formatAEDMillions(summary?.real_estate_aum?.total_deal_size || 0)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <p className="text-xs text-emerald-600 uppercase tracking-wide">Paid</p>
                  <p className="text-lg font-bold text-emerald-700 mt-1">{formatAEDMillions(summary?.real_estate_aum?.total_paid || 0)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Market Rates Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Market Rates - Currencies & Commodities */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="market-rates-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <ArrowRightLeft className="h-5 w-5 text-cyan-600" />
                </div>
                <h3 className="font-semibold text-gray-800">Market Rates</h3>
                <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded ml-auto">Live</span>
              </div>
              
              <div className="space-y-3">
                {/* Forex Rates */}
                <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-lg p-3 border border-cyan-100">
                  <p className="text-xs text-cyan-700 font-medium mb-2">Forex</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">AED/INR</span>
                    <span className="text-lg font-bold text-cyan-700">₹{forexRate.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm text-gray-600">USD/INR</span>
                    <span className="text-lg font-bold text-cyan-700">₹{(forexRate * 3.67).toFixed(2)}</span>
                  </div>
                </div>
                
                {/* Commodities */}
                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-lg p-3 border border-amber-100">
                  <p className="text-xs text-amber-700 font-medium mb-2">Gold (24K)</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Per 10g</span>
                    <span className="text-lg font-bold text-amber-700">₹{goldRate.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions - Clean card style */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="quick-actions">
            <button
              onClick={() => navigate("/broker/opportunities")}
              className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all group"
              data-testid="quick-action-opportunities"
            >
              <div className="p-3 rounded-full bg-indigo-50 group-hover:bg-indigo-100 transition-colors">
                <TrendingUp className="h-5 w-5 text-etihad-maroon-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Opportunities</span>
            </button>
            
            <button
              onClick={() => navigate("/broker/admin/clients")}
              className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-200 hover:border-emerald-300 hover:shadow-md transition-all group"
              data-testid="quick-action-clients"
            >
              <div className="p-3 rounded-full bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Clients</span>
            </button>
            
            <button
              onClick={() => navigate("/broker/admin/sub-brokers")}
              className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-200 hover:border-amber-300 hover:shadow-md transition-all group"
              data-testid="quick-action-subbrokers"
            >
              <div className="p-3 rounded-full bg-amber-50 group-hover:bg-amber-100 transition-colors">
                <Briefcase className="h-5 w-5 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Sub-Brokers</span>
            </button>
            
            <button
              onClick={() => navigate("/broker/email-engagement")}
              className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group"
              data-testid="quick-action-email-engagement"
            >
              <div className="p-3 rounded-full bg-blue-50 group-hover:bg-blue-100 transition-colors">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Email Tracker</span>
            </button>
            
            <button
              onClick={() => setShowResetModal(true)}
              className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-200 hover:border-red-300 hover:shadow-md transition-all group"
              data-testid="reset-database-btn"
            >
              <div className="p-3 rounded-full bg-red-50 group-hover:bg-red-100 transition-colors">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <span className="text-sm font-medium text-gray-700">Reset DB</span>
            </button>
          </div>
        </div>
      </div>

      {/* Reset Database Modal */}
      {/* Fix Data Modal */}
      {showFixDataModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-full">
                <RefreshCw className="h-6 w-6 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Fix Data & Recalculate</h2>
              <button 
                onClick={() => { setShowFixDataModal(false); setFixDataResults(null); }}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <p className="text-gray-600 mb-4">
              This will clean up duplicate entries and recalculate maturity amounts for all trades with prepayments. Use this after importing new data or if you notice any discrepancies.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Bond (or fix all)
              </label>
              <select
                value={selectedBondForFix}
                onChange={(e) => setSelectedBondForFix(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="fix-data-bond-select"
              >
                <option value="">-- Select a Bond --</option>
                {availableBonds.map((bond) => (
                  <option key={bond.id || bond.bond_code} value={bond.bond_code}>
                    {bond.name || bond.bond_code} ({bond.bond_code})
                  </option>
                ))}
              </select>
            </div>
            
            {fixDataResults && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-semibold text-green-800 mb-2">Results:</h4>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>Duplicate repayments removed: {fixDataResults.duplicate_repayments_removed}</li>
                  <li>Duplicate emails removed: {fixDataResults.duplicate_emails_removed}</li>
                  <li>Trades recalculated: {fixDataResults.trades_recalculated}</li>
                  {fixDataResults.bonds_processed !== undefined && (
                    <li>Bonds processed: {fixDataResults.bonds_processed}</li>
                  )}
                </ul>
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={() => { setShowFixDataModal(false); setFixDataResults(null); }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleFixAllData}
                disabled={!selectedBondForFix || fixingData}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                data-testid="fix-selected-bond-btn"
              >
                {fixingData && <RefreshCw className="h-4 w-4 animate-spin" />}
                Fix Selected
              </button>
              <button
                onClick={handleFixAllBonds}
                disabled={fixingData || availableBonds.length === 0}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                data-testid="fix-all-bonds-btn"
              >
                {fixingData && <RefreshCw className="h-4 w-4 animate-spin" />}
                Fix All
              </button>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500 mb-2">
                If duplicates persist, use Reset Auto-Tag to clear all auto-tagged data and re-run auto-tag:
              </p>
              <button
                onClick={handleResetAutoTag}
                disabled={!selectedBondForFix || fixingData}
                className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                data-testid="reset-auto-tag-btn"
              >
                {fixingData && <RefreshCw className="h-4 w-4 animate-spin" />}
                Reset Auto-Tag Data
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Reset Database</h2>
              <button 
                onClick={() => setShowResetModal(false)}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <p className="text-gray-600 mb-4">
              This action will <strong>permanently delete</strong> all data including clients, investments, holdings, and transactions. This cannot be undone.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type <strong>RESET</strong> to confirm
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="RESET"
                data-testid="reset-confirm-input"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetDatabase}
                disabled={resetConfirmText !== "RESET" || resetting}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                data-testid="confirm-reset-btn"
              >
                {resetting && <RefreshCw className="h-4 w-4 animate-spin" />}
                Reset Database
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
