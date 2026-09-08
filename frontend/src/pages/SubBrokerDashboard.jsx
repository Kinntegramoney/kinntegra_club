import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { 
  TrendingUp, 
  Users, 
  Building2, 
  Landmark,
  RefreshCw,
  ArrowRightLeft,
  IndianRupee,
  Briefcase,
  Calendar,
  Mail,
  FileText,
  Settings
} from "lucide-react";
import { toast } from "sonner";
import { logUserActivity } from "@/utils/activityLogger";
import { format } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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

// Venn Diagram Colors
const COLORS = {
  venn: {
    bonds: '#D4A853',
    realEstate: '#4A5568',
    both: '#7C3AED'
  }
};

// Venn Diagram Component
const VennDiagram = ({ bondOnly, realEstateOnly, both }) => {
  const total = bondOnly + realEstateOnly + both;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-gray-400 text-sm">No investors yet</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-2">
      <svg viewBox="0 0 280 160" className="w-full h-full max-w-[280px]">
        {/* NCD Circle */}
        <circle cx="100" cy="80" r="55" fill={COLORS.venn.bonds} opacity="0.7" />
        {/* Real Estate Circle */}
        <circle cx="180" cy="80" r="55" fill={COLORS.venn.realEstate} opacity="0.7" />
        {/* Intersection - Both */}
        <ellipse cx="140" cy="80" rx="20" ry="45" fill={COLORS.venn.both} opacity="0.9" />
        
        {/* Numbers */}
        <text x="75" y="85" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">{bondOnly}</text>
        <text x="140" y="85" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">{both}</text>
        <text x="205" y="85" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">{realEstateOnly}</text>
      </svg>
    </div>
  );
};

// Format date time
const formatDateTime = () => {
  const now = new Date();
  return format(now, "hh:mm a | EEEE, do MMM yyyy");
};

export default function SubBrokerDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [forexRate, setForexRate] = useState(22.5);
  const [goldRate, setGoldRate] = useState(0);
  const [silverRate, setSilverRate] = useState(0);
  const [currentTime, setCurrentTime] = useState(formatDateTime());

  useEffect(() => {
    logUserActivity('dashboard');
  }, []);

  useEffect(() => {
    document.title = "Kinntegraa | Sub-Broker Analytics";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "sub_broker") {
      if (parsedUser.role === "broker") {
        navigate("/broker/dashboard");
      } else {
        navigate("/client/opportunities");
      }
      return;
    }
    
    setUser(parsedUser);
    fetchDashboardData();
    fetchForexRate();
    fetchGoldRate();
    fetchSilverRate();
  }, [navigate]);

  const fetchForexRate = async () => {
    try {
      const response = await axios.get(`${API}/forex/aed-to-inr`);
      if (response.data?.rate) {
        setForexRate(response.data.rate);
      }
    } catch (error) {
      console.error("Error fetching forex rate:", error);
    }
  };

  const fetchGoldRate = async () => {
    try {
      const response = await axios.get(`${API}/gold-rate`);
      if (response.data?.rate) {
        setGoldRate(response.data.rate);
      }
    } catch (error) {
      console.error("Error fetching gold rate:", error);
    }
  };

  const fetchSilverRate = async () => {
    try {
      const response = await axios.get(`${API}/silver-rate`);
      if (response.data?.rate) {
        setSilverRate(response.data.rate);
      }
    } catch (error) {
      console.error("Error fetching silver rate:", error);
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      const response = await axios.get(`${API}/sub-broker/dashboard/summary`, { headers });
      setSummary(response.data);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  if (!user || loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar user={user} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-etihad-maroon-500 mx-auto mb-4" />
            <p className="text-gray-500">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  const bondOnlyClients = summary?.clients?.bond_only || 0;
  const realEstateOnlyClients = summary?.clients?.real_estate_only || 0;
  const bothProductsClients = summary?.clients?.both_products || 0;

  const bondAumINR = summary?.bond_aum?.total_invested || 0;
  const reAumAED = summary?.real_estate_aum?.total_deal_size || 0;
  const reAumINR = reAumAED * forexRate;
  const totalAumINR = bondAumINR + reAumINR;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
              <p className="text-sm text-gray-500 mt-1">{currentTime}</p>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => { fetchDashboardData(); fetchForexRate(); fetchGoldRate(); fetchSilverRate(); setCurrentTime(formatDateTime()); }}
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
                  <h3 className="font-semibold text-gray-800">My Investors</h3>
                </div>
              </div>
              
              <VennDiagram 
                bondOnly={bondOnlyClients}
                realEstateOnly={realEstateOnlyClients}
                both={bothProductsClients}
              />
              
              <div className="flex justify-center gap-4 mt-2 pt-3 border-t">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.venn.bonds }}></div>
                  <span className="text-xs text-gray-600">NCD</span>
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

            {/* Available Opportunities */}
            <div 
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer" 
              data-testid="opportunities-card"
              onClick={() => navigate("/sub-broker/opportunities")}
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
                  <p className="text-xs text-etihad-gold-600 mt-1">NCD</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 text-center border border-slate-200">
                  <Building2 className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-slate-700">{summary?.opportunities?.real_estate?.available || 0}</p>
                  <p className="text-xs text-slate-600 mt-1">Real Estate</p>
                </div>
              </div>
            </div>

            {/* Market Rates */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="market-rates-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <ArrowRightLeft className="h-5 w-5 text-cyan-600" />
                </div>
                <h3 className="font-semibold text-gray-800">Market Rates</h3>
                <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded">Live</span>
              </div>
              
              <div className="space-y-3">
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
                
                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-lg p-3 border border-amber-100">
                  <p className="text-xs text-amber-700 font-medium mb-2">Commodities</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Gold (24K) /10g</span>
                    <span className="text-lg font-bold text-amber-700">₹{goldRate.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm text-gray-600">Silver /10g</span>
                    <span className="text-lg font-bold text-gray-600">₹{silverRate.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Dashboard Cards - Row 2: AUM Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* NCD AUM Details */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="bond-aum-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-etihad-gold-500/10">
                  <Landmark className="h-5 w-5 text-etihad-gold-500" />
                </div>
                <h3 className="font-semibold text-gray-800">NCD AUM</h3>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {summary?.bond_aum?.unique_clients || 0} Clients
                </span>
                <span className="text-xs bg-etihad-gold-100 text-etihad-gold-700 px-2 py-0.5 rounded ml-auto">INR</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <p className="text-xs text-blue-600 uppercase tracking-wide">Invested</p>
                  <p className="text-xl font-bold text-blue-700 mt-1">{formatINRCrores(summary?.bond_aum?.total_invested || 0)}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                  <p className="text-xs text-purple-600 uppercase tracking-wide">Expected Profits</p>
                  <p className="text-xl font-bold text-purple-700 mt-1">{formatINRCrores(summary?.bond_aum?.profits || 0)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <p className="text-xs text-emerald-600 uppercase tracking-wide">Repaid</p>
                  <p className="text-lg font-bold text-emerald-700 mt-1">{formatINRCrores(summary?.bond_aum?.total_repaid || 0)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    P: {formatINRCrores(summary?.bond_aum?.principal_repaid || 0)} | I: {formatINRCrores(summary?.bond_aum?.interest_repaid || 0)}
                  </p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                  <p className="text-xs text-amber-600 uppercase tracking-wide">Pending</p>
                  <p className="text-lg font-bold text-amber-700 mt-1">{formatINRCrores(summary?.bond_aum?.total_pending || 0)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    P: {formatINRCrores(summary?.bond_aum?.principal_pending || 0)} | I: {formatINRCrores(summary?.bond_aum?.interest_pending || 0)}
                  </p>
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
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {summary?.real_estate_aum?.unique_clients || 0} Clients
                </span>
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded ml-auto">AED</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <p className="text-xs text-emerald-600 uppercase tracking-wide">Invested</p>
                  <p className="text-xl font-bold text-emerald-700 mt-1">{formatAEDMillions(summary?.real_estate_aum?.total_invested || 0)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                  <p className="text-xs text-amber-600 uppercase tracking-wide">Open Opportunities</p>
                  <p className="text-xl font-bold text-amber-700 mt-1">{formatAEDMillions(summary?.real_estate_aum?.open_opportunities || 0)}</p>
                </div>
                <div className="col-span-2 bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-600 uppercase tracking-wide">Total Deal Size</p>
                  <p className="text-xl font-bold text-gray-700 mt-1">{formatAEDMillions(summary?.real_estate_aum?.total_deal_size || 0)}</p>
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                    <IndianRupee className="h-3 w-3" />
                    <span>≈ {formatINRCrores((summary?.real_estate_aum?.total_deal_size || 0) * forexRate)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Dashboard Cards - Row 3: Additional Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Data Gathering Card */}
            <div 
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer" 
              data-testid="data-gathering-card"
              onClick={() => navigate("/sub-broker/data-gathering")}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <FileText className="h-5 w-5 text-purple-500" />
                </div>
                <h3 className="font-semibold text-gray-800">Data Gathering</h3>
              </div>
              
              <div className="flex items-center justify-center my-4">
                <div className="text-center">
                  <p className="text-4xl font-bold text-purple-600">{summary?.data_gathering?.unique_families || 0}</p>
                  <p className="text-sm text-gray-500 mt-1">Unique Families</p>
                </div>
              </div>
              
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 text-center">Client financial profiles collected</p>
              </div>
            </div>

            {/* CAS Summary Card */}
            <div 
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer" 
              data-testid="cas-summary-card"
              onClick={() => navigate("/sub-broker/analysis")}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-indigo-500/10">
                  <FileText className="h-5 w-5 text-indigo-500" />
                </div>
                <h3 className="font-semibold text-gray-800">CAS Summary</h3>
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded ml-auto">MF Portfolio</span>
              </div>
              
              <div className="grid grid-cols-3 gap-2 my-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-indigo-600">{summary?.cas_summary?.cas_parsed_count || 0}</p>
                  <p className="text-xs text-gray-500">CAS Parsed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-600">{summary?.cas_summary?.unique_pan_count || 0}</p>
                  <p className="text-xs text-gray-500">Unique PANs</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-600">{formatINRCrores(summary?.cas_summary?.external_portfolio_value || 0)}</p>
                  <p className="text-xs text-gray-500">External MF</p>
                </div>
              </div>
              
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 text-center">
                  Total Portfolio: {formatINRCrores(summary?.cas_summary?.total_portfolio_value || 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

