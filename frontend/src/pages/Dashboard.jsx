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
  IndianRupee,
  ArrowRightLeft,
  ChevronDown,
  User
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    bonds: "#6366F1",      // Soft indigo for Bonds
    realEstate: "#EC4899", // Soft pink for Real Estate  
    both: "#8B5CF6"        // Soft purple for overlap
  },
  chart: ["#6366F1", "#EC4899", "#8B5CF6", "#10B981", "#F59E0B", "#3B82F6"]
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
  const [aumDistribution, setAumDistribution] = useState({ by_asset_class: [], by_subbroker: [] });
  const [forexRate, setForexRate] = useState(22.5); // Default AED to INR rate
  const [currentTime, setCurrentTime] = useState(formatDateTime());
  const [selectedSubBroker, setSelectedSubBroker] = useState("all");
  
  // Reset database state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

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
      const response = await axios.post(
        `${API}/admin/reset-database?secret_key=KINNTEGRAA_RESET_2026`
      );
      
      if (response.data.success) {
        toast.success("Database reset successful!");
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

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      const [summaryRes, aumRes] = await Promise.all([
        axios.get(`${API}/dashboard/summary`, { headers }),
        axios.get(`${API}/dashboard/aum-distribution`, { headers })
      ]);

      setSummary(summaryRes.data);
      setAumDistribution(aumRes.data);
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
            <RefreshCw className="h-8 w-8 animate-spin text-indigo-500 mx-auto mb-4" />
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
  const totalClients = summary?.clients?.total || 0;

  // Prepare sub-broker AUM data for chart
  const subBrokerChartData = (aumDistribution.by_subbroker || []).map((sb, index) => ({
    ...sb,
    bond_aum_display: sb.bond_aum || 0,
    real_estate_aum_aed: sb.real_estate_aum || 0,
    real_estate_aum_inr: (sb.real_estate_aum || 0) * forexRate,
    fill: COLORS.chart[index % COLORS.chart.length]
  }));

  // Filter chart data based on selected sub-broker
  const filteredChartData = selectedSubBroker === "all" 
    ? subBrokerChartData 
    : subBrokerChartData.filter(sb => sb.name === selectedSubBroker);

  // Calculate totals
  const totalSubBrokers = aumDistribution.by_subbroker?.length || 0;
  const totalAUM = subBrokerChartData.reduce((acc, sb) => acc + (sb.bond_aum || 0) + ((sb.real_estate_aum || 0) * forexRate), 0);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto md:ml-64">
        {/* Header with Date/Time */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Analytics Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">{currentTime}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
                <ArrowRightLeft className="h-3 w-3" />
                <span>1 AED = ₹{forexRate.toFixed(2)}</span>
              </div>
              <button 
                onClick={() => { fetchDashboardData(); fetchForexRate(); setCurrentTime(formatDateTime()); }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                data-testid="refresh-dashboard-btn"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Dashboard Cards - Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="kpi-cards">
            
            {/* Total Clients - Venn Diagram Style */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="clients-venn-card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-indigo-500/10">
                    <Users className="h-5 w-5 text-indigo-500" />
                  </div>
                  <h3 className="font-semibold text-gray-800">Clients</h3>
                </div>
              </div>
              
              {/* Venn Diagram */}
              <VennDiagram 
                bondOnly={bondOnlyClients}
                realEstateOnly={realEstateOnlyClients}
                both={bothProductsClients}
                total={totalClients}
              />
              
              {/* Legend */}
              <div className="flex justify-center gap-4 mt-2 pt-3 border-t">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.venn.bonds }}></div>
                  <span className="text-xs text-gray-600">Bonds ({bondOnlyClients})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.venn.realEstate }}></div>
                  <span className="text-xs text-gray-600">RE ({realEstateOnlyClients})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.venn.both }}></div>
                  <span className="text-xs text-gray-600">Both ({bothProductsClients})</span>
                </div>
              </div>
            </div>

            {/* Sub-Brokers Count */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="subbrokers-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-violet-500/10">
                  <Briefcase className="h-5 w-5 text-violet-500" />
                </div>
                <h3 className="font-semibold text-gray-800">Sub-Brokers</h3>
              </div>
              
              <div className="flex items-center justify-center my-6">
                <div className="text-center">
                  <p className="text-5xl font-bold text-violet-600">{summary?.sub_brokers?.total || 0}</p>
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

            {/* Opportunities - Bonds & Real Estate */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="opportunities-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                </div>
                <h3 className="font-semibold text-gray-800">Opportunities</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4 my-4">
                {/* Bonds */}
                <div className="bg-amber-50 rounded-lg p-4 text-center border border-amber-200">
                  <Landmark className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-amber-700">{summary?.opportunities?.bonds?.total || 0}</p>
                  <p className="text-xs text-amber-600 mt-1">Bonds</p>
                  <p className="text-xs text-gray-500">{summary?.opportunities?.bonds?.available || 0} available</p>
                </div>
                
                {/* Real Estate */}
                <div className="bg-pink-50 rounded-lg p-4 text-center border border-pink-200">
                  <Building2 className="h-8 w-8 text-pink-500 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-pink-700">{summary?.opportunities?.real_estate?.total || 0}</p>
                  <p className="text-xs text-pink-600 mt-1">Real Estate</p>
                  <p className="text-xs text-gray-500">{summary?.opportunities?.real_estate?.available || 0} available</p>
                </div>
              </div>
            </div>
          </div>

          {/* Dashboard Cards - Row 2: AUM Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Bond AUM Details */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="bond-aum-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Landmark className="h-5 w-5 text-amber-500" />
                </div>
                <h3 className="font-semibold text-gray-800">Bond AUM</h3>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded ml-auto">INR</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <p className="text-xs text-blue-600 uppercase tracking-wide">Total Invested</p>
                  <p className="text-lg font-bold text-blue-700 mt-1">{formatINRCrores(summary?.bond_aum?.total_invested || 0)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <p className="text-xs text-emerald-600 uppercase tracking-wide">Total Repaid</p>
                  <p className="text-lg font-bold text-emerald-700 mt-1">{formatINRCrores(summary?.bond_aum?.total_repaid || 0)}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                  <p className="text-xs text-orange-600 uppercase tracking-wide">Total Pending</p>
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
                <div className="p-2 rounded-lg bg-pink-500/10">
                  <Building2 className="h-5 w-5 text-pink-500" />
                </div>
                <h3 className="font-semibold text-gray-800">Real Estate AUM</h3>
                <span className="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded ml-auto">AED</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-pink-50 rounded-lg p-3 border border-pink-100">
                  <p className="text-xs text-pink-600 uppercase tracking-wide">Total Deal Size</p>
                  <p className="text-xs text-gray-500">(incl. DLD & Admin)</p>
                  <p className="text-lg font-bold text-pink-700 mt-1">{formatAEDMillions(summary?.real_estate_aum?.total_deal_size || 0)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <p className="text-xs text-emerald-600 uppercase tracking-wide">Total Paid</p>
                  <p className="text-xs text-gray-500">by Clients</p>
                  <p className="text-lg font-bold text-emerald-700 mt-1">{formatAEDMillions(summary?.real_estate_aum?.total_paid || 0)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* AUM by Sub-Broker - New Design with Dropdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="subbroker-aum-chart">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-violet-500/10">
                  <User className="h-5 w-5 text-violet-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800">AUM basis Sublogin</h3>
              </div>
              
              {/* Sub-Broker Dropdown */}
              <Select value={selectedSubBroker} onValueChange={setSelectedSubBroker}>
                <SelectTrigger className="w-[200px]" data-testid="subbroker-select">
                  <SelectValue placeholder="Select Advisor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Advisors</SelectItem>
                  {subBrokerChartData.map((sb, index) => (
                    <SelectItem key={index} value={sb.name}>{sb.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {subBrokerChartData.length > 0 ? (
              <div className="space-y-4">
                {/* Stacked Bar Chart - Horizontal */}
                <div className="h-16 bg-gray-50 rounded-lg overflow-hidden flex">
                  {subBrokerChartData.map((sb, index) => {
                    const sbAUM = (sb.bond_aum || 0) + ((sb.real_estate_aum || 0) * forexRate);
                    const percentage = totalAUM > 0 ? (sbAUM / totalAUM) * 100 : 0;
                    
                    if (percentage < 0.5) return null; // Skip very small segments
                    
                    return (
                      <div 
                        key={index}
                        className="h-full flex items-center justify-center relative group cursor-pointer transition-opacity hover:opacity-90"
                        style={{ 
                          width: `${percentage}%`,
                          backgroundColor: sb.fill,
                          minWidth: percentage > 3 ? '40px' : '20px'
                        }}
                        title={`${sb.name}: ${formatINRCrores(sbAUM)}`}
                      >
                        {/* Tooltip on hover */}
                        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-lg">
                          <div className="font-semibold">{sb.name}</div>
                          <div>{formatINRCrores(sbAUM)}</div>
                          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"></div>
                        </div>
                        
                        {percentage > 8 && (
                          <span className="text-white text-xs font-medium truncate px-1">
                            {sb.name.split(' ')[0]}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Summary Stats */}
                <div className="flex justify-between items-center pt-2">
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-sm text-gray-500">Total Advisors</span>
                      <p className="text-xl font-bold text-gray-800">{totalSubBrokers}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">Total AUM</span>
                      <p className="text-xl font-bold text-indigo-600">{formatINRCrores(totalAUM)}</p>
                    </div>
                  </div>
                  
                  {/* Legend - showing top contributors */}
                  <div className="flex flex-wrap gap-2 max-w-md justify-end">
                    {subBrokerChartData.slice(0, 5).map((sb, index) => (
                      <div key={index} className="flex items-center gap-1.5 text-xs">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: sb.fill }}></div>
                        <span className="text-gray-600">{sb.name?.split(' ')[0]}</span>
                      </div>
                    ))}
                    {subBrokerChartData.length > 5 && (
                      <span className="text-xs text-gray-400">+{subBrokerChartData.length - 5} more</span>
                    )}
                  </div>
                </div>

                {/* Detailed Bar Chart */}
                <div className="h-[300px] mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={filteredChartData.slice(0, 8)} 
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="name" 
                        stroke="#6b7280" 
                        angle={-45}
                        textAnchor="end"
                        interval={0}
                        tick={{ fontSize: 11 }}
                        height={60}
                      />
                      <YAxis stroke="#6b7280" tickFormatter={(value) => {
                        if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
                        if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
                        if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                        return value;
                      }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#fff', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          color: '#374151'
                        }}
                        formatter={(value, name) => {
                          if (name === 'Bond AUM') {
                            return [formatINRCrores(value), name];
                          }
                          return [formatAEDMillions(value), name];
                        }}
                      />
                      <Bar dataKey="bond_aum" name="Bond AUM" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="real_estate_aum" name="RE AUM (AED)" fill="#EC4899" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Sub-broker AUM Table with INR conversion for Real Estate */}
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Sub-Broker</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Partner Code</th>
                        <th className="text-right py-3 px-4 font-medium text-amber-600">Bond AUM (INR)</th>
                        <th className="text-right py-3 px-4 font-medium text-pink-600">RE AUM (AED)</th>
                        <th className="text-right py-3 px-4 font-medium text-indigo-600">
                          <div className="flex items-center justify-end gap-1">
                            <IndianRupee className="h-3 w-3" />
                            RE AUM (INR)
                          </div>
                        </th>
                        <th className="text-center py-3 px-4 font-medium text-gray-600">Clients</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredChartData.map((sb, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: sb.fill }}></div>
                              <span className="font-medium text-gray-800">{sb.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-gray-600">{sb.partner_code}</td>
                          <td className="py-3 px-4 text-right text-amber-700 font-medium">
                            {formatINRCrores(sb.bond_aum)}
                          </td>
                          <td className="py-3 px-4 text-right text-pink-700 font-medium">
                            {formatAEDMillions(sb.real_estate_aum)}
                          </td>
                          <td className="py-3 px-4 text-right text-indigo-700 font-medium">
                            {formatINRCrores(sb.real_estate_aum_inr)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                              {sb.client_count || 0}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Briefcase className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>No sub-broker data available</p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-3" data-testid="quick-actions">
            <button
              onClick={() => navigate("/broker/opportunities")}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm"
            >
              View Opportunities
            </button>
            <button
              onClick={() => navigate("/broker/admin/clients")}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
            >
              Manage Clients
            </button>
            <button
              onClick={() => navigate("/broker/admin/sub-brokers")}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
            >
              Manage Sub-Brokers
            </button>
            <button
              onClick={() => setShowResetModal(true)}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors text-sm flex items-center gap-2"
              data-testid="reset-database-btn"
            >
              <Trash2 className="h-4 w-4" />
              Reset Database
            </button>
          </div>
        </div>
      </div>

      {/* Reset Database Modal */}
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
