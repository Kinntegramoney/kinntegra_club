import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import CurrencySettingsModal from "@/components/CurrencySettingsModal";
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
  Mail,
  Settings,
  FileText
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

// Format currency for INR (Lakhs) - for smaller amounts like P/I bifurcation
const formatINRLakhs = (value) => {
  if (value === undefined || value === null || value === 0) return "₹0";
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)} K`;
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
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
  
  // Individual reset state
  const [showIndividualResetModal, setShowIndividualResetModal] = useState(false);
  const [individualResetType, setIndividualResetType] = useState(null);
  const [individualResetConfirm, setIndividualResetConfirm] = useState("");
  const [individualResetting, setIndividualResetting] = useState(false);
  
  // CAS Summary state (replaces market values)
  const [casSummary, setCasSummary] = useState(null);
  const [loadingCasSummary, setLoadingCasSummary] = useState(false);
  // Available bonds for reset functionality
  const [availableBonds, setAvailableBonds] = useState([]);
  
  // Data Cleanup state (for actual repayments)
  const [cleaningData, setCleaningData] = useState(false);
  const [cleanupResults, setCleanupResults] = useState(null);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  
  // NCD Reset state
  const [showNCDResetModal, setShowNCDResetModal] = useState(false);
  const [ncdList, setNCDList] = useState([]);
  const [selectedNCDForReset, setSelectedNCDForReset] = useState("");
  const [ncdResetType, setNCDResetType] = useState("repayments");
  const [ncdResetting, setNCDResetting] = useState(false);
  const [ncdResetResults, setNCDResetResults] = useState(null);
  const [loadingNCDList, setLoadingNCDList] = useState(false);
  
  // Currency settings state
  const [showCurrencySettingsModal, setShowCurrencySettingsModal] = useState(false);

  // Data Gathering Reset state
  const [showDataGatheringResetModal, setShowDataGatheringResetModal] = useState(false);
  const [familiesList, setFamiliesList] = useState([]);
  const [selectedFamilies, setSelectedFamilies] = useState([]);
  const [dataGatheringResetting, setDataGatheringResetting] = useState(false);
  const [dataGatheringResetResults, setDataGatheringResetResults] = useState(null);
  const [loadingFamiliesList, setLoadingFamiliesList] = useState(false);
  const [dataGatheringResetConfirm, setDataGatheringResetConfirm] = useState("");

  // Set page title and update time
  useEffect(() => {
    document.title = "Kinntegraa | Analytics";
    
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

  // Individual reset types configuration
  const resetTypes = {
    "real-estate": { label: "Real Estate", endpoint: "/admin/reset/real-estate", color: "bg-blue-500", icon: "🏢" },
    clients: { label: "Clients", endpoint: "/admin/reset/clients", color: "bg-green-500", icon: "👥" },
    "sub-brokers": { label: "Sub-Brokers", endpoint: "/admin/reset/sub-brokers", color: "bg-purple-500", icon: "🤝" },
    "cas-analysis": { label: "CAS Analysis", endpoint: "/admin/reset/cas-analysis", color: "bg-cyan-500", icon: "📈" }
  };

  // Handle individual reset
  const handleIndividualReset = async () => {
    if (!individualResetType || individualResetConfirm !== "RESET") {
      toast.error("Please type RESET to confirm");
      return;
    }
    
    setIndividualResetting(true);
    try {
      const token = localStorage.getItem("token");
      const config = resetTypes[individualResetType];
      const response = await axios.post(
        `${API}${config.endpoint}?secret_key=KINNTEGRAA_RESET_2026`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        toast.success(`${config.label} reset successful!`);
        setShowIndividualResetModal(false);
        setIndividualResetType(null);
        setIndividualResetConfirm("");
        fetchDashboardData();
        if (individualResetType === "cas-analysis") {
          fetchCasSummary();
        }
      }
    } catch (error) {
      console.error("Individual reset error:", error);
      toast.error(error.response?.data?.detail || "Failed to reset");
    } finally {
      setIndividualResetting(false);
    }
  };

  // Handle data cleanup for actual repayments
  const handleDataCleanup = async () => {
    setCleaningData(true);
    setCleanupResults(null);
    
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      const results = {};
      
      // Step 1: Fix trade assignments
      toast.info("Step 1/3: Fixing trade assignments...");
      try {
        const res1 = await axios.post(`${API}/admin/fix-actual-repayment-trade-assignment`, {}, { headers });
        results.tradeAssignment = res1.data;
      } catch (e) {
        results.tradeAssignment = { error: e.response?.data?.detail || e.message };
      }
      
      // Step 2: Validate and fix issues
      toast.info("Step 2/3: Validating and fixing issues...");
      try {
        const res2 = await axios.post(`${API}/admin/validate-actual-repayments?fix_issues=true`, {}, { headers });
        results.validation = res2.data;
      } catch (e) {
        results.validation = { error: e.response?.data?.detail || e.message };
      }
      
      // Step 3: Deduplicate
      toast.info("Step 3/3: Removing duplicates...");
      try {
        const res3 = await axios.post(`${API}/admin/deduplicate-actual-repayments`, {}, { headers });
        results.deduplication = res3.data;
      } catch (e) {
        results.deduplication = { error: e.response?.data?.detail || e.message };
      }
      
      setCleanupResults(results);
      toast.success("Data cleanup completed!");
      
    } catch (error) {
      console.error("Cleanup error:", error);
      toast.error(error.response?.data?.detail || "Failed to cleanup data");
    } finally {
      setCleaningData(false);
    }
  };

  // Fetch NCD list for reset
  const fetchNCDList = async () => {
    setLoadingNCDList(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/admin/ncds/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setNCDList(response.data.ncds || response.data.bonds || []);
      }
    } catch (error) {
      console.error("Error fetching NCD list:", error);
      toast.error("Failed to fetch NCD list");
    } finally {
      setLoadingNCDList(false);
    }
  };

  // Handle NCD Reset
  const handleNCDReset = async () => {
    if (!selectedNCDForReset) {
      toast.error("Please select an NCD");
      return;
    }
    
    setNCDResetting(true);
    setNCDResetResults(null);
    
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/admin/reset/ncd-complete?bond_id=${selectedNCDForReset}&reset_type=${ncdResetType}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setNCDResetResults(response.data.results);
        toast.success(response.data.message);
        // Refresh NCD list
        fetchNCDList();
      }
    } catch (error) {
      console.error("NCD Reset error:", error);
      toast.error(error.response?.data?.detail || "Failed to reset NCD");
    } finally {
      setNCDResetting(false);
    }
  };

  // Handle reset all historical repayments
  const handleResetAllRepayments = async () => {
    if (!window.confirm("Are you sure you want to delete ALL historical repayments for ALL clients? This cannot be undone.")) {
      return;
    }
    
    setNCDResetting(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/admin/reset/historical-repayments?reset_all_clients=true`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        toast.success(`Deleted ${response.data.deleted_count} historical repayments`);
        fetchNCDList();
      }
    } catch (error) {
      console.error("Reset all repayments error:", error);
      toast.error(error.response?.data?.detail || "Failed to reset repayments");
    } finally {
      setNCDResetting(false);
    }
  };

  // Fetch Data Gathering families list for reset modal
  const fetchFamiliesList = async () => {
    setLoadingFamiliesList(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/admin/data-gathering/families-list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setFamiliesList(response.data.families || []);
      }
    } catch (error) {
      console.error("Error fetching families list:", error);
      toast.error("Failed to load families list");
    } finally {
      setLoadingFamiliesList(false);
    }
  };

  // Handle Data Gathering Reset
  const handleDataGatheringReset = async () => {
    if (dataGatheringResetConfirm !== "RESET") {
      toast.error("Please type RESET to confirm");
      return;
    }
    
    setDataGatheringResetting(true);
    setDataGatheringResetResults(null);
    
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/admin/reset/data-gathering`,
        {
          family_ids: selectedFamilies,
          secret_key: "KINNTEGRAA_RESET_2026"
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setDataGatheringResetResults(response.data);
        toast.success(response.data.message);
        // Refresh families list and dashboard
        fetchFamiliesList();
        fetchDashboardData();
        setSelectedFamilies([]);
        setDataGatheringResetConfirm("");
      }
    } catch (error) {
      console.error("Data Gathering Reset error:", error);
      toast.error(error.response?.data?.detail || "Failed to reset data gathering");
    } finally {
      setDataGatheringResetting(false);
    }
  };

  // Toggle family selection
  const toggleFamilySelection = (familyId) => {
    setSelectedFamilies(prev => 
      prev.includes(familyId) 
        ? prev.filter(id => id !== familyId)
        : [...prev, familyId]
    );
  };

  // Select/Deselect all families
  const toggleSelectAllFamilies = () => {
    if (selectedFamilies.length === familiesList.length) {
      setSelectedFamilies([]);
    } else {
      setSelectedFamilies(familiesList.map(f => f.id));
    }
  };

  // Fetch CAS summary (parsed count, external portfolio, unique PANs)
  const fetchCasSummary = async () => {
    setLoadingCasSummary(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/admin/cas-summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setCasSummary(response.data);
      }
    } catch (error) {
      console.error("Error fetching CAS summary:", error);
    } finally {
      setLoadingCasSummary(false);
    }
  };

  // Fetch CAS summary on mount
  useEffect(() => {
    if (user?.role === 'broker') {
      fetchCasSummary();
    }
  }, [user]);

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

  // Reset auto-tag data (delete all auto-tagged entries and reset email logs)
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
                  <h3 className="font-semibold text-gray-800">Private Investors</h3>
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

            {/* Available Opportunities - NCD & Real Estate */}
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
                  <p className="text-xs text-etihad-gold-600 mt-1">NCD</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 text-center border border-slate-200">
                  <Building2 className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-3xl font-bold text-slate-700">{summary?.opportunities?.real_estate?.available || 0}</p>
                  <p className="text-xs text-slate-600 mt-1">Real Estate</p>
                </div>
              </div>
            </div>
          </div>

          {/* Dashboard Cards - Row 2: Market Rates and AUM */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Market Rates - Currencies & Commodities */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="market-rates-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <ArrowRightLeft className="h-5 w-5 text-cyan-600" />
                </div>
                <h3 className="font-semibold text-gray-800">Market Rates</h3>
                <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded">Live</span>
                <button
                  onClick={() => setShowCurrencySettingsModal(true)}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 text-xs font-medium rounded-lg transition-colors"
                  data-testid="currency-settings-btn"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Currency Settings
                </button>
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
                {/* Row 1: Invested and Expected Profits */}
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 flex flex-col">
                  <p className="text-xs text-blue-600 uppercase tracking-wide">Invested</p>
                  <p className="text-lg font-bold text-blue-700 mt-1">{formatINRCrores(summary?.bond_aum?.total_invested || 0)}</p>
                  <div className="flex gap-2 mt-1 h-4" aria-hidden="true" />
                </div>
                <div className="bg-purple-50 rounded-lg p-3 border border-purple-100 flex flex-col">
                  <p className="text-xs text-purple-600 uppercase tracking-wide">Expected Profits</p>
                  <p className="text-lg font-bold text-purple-700 mt-1">{formatINRCrores(summary?.bond_aum?.profits || 0)}</p>
                  <div className="flex gap-2 mt-1 h-4" aria-hidden="true" />
                </div>
                
                {/* Row 2: Repaid and Pending */}
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100 flex flex-col">
                  <p className="text-xs text-emerald-600 uppercase tracking-wide">Repaid</p>
                  <p className="text-lg font-bold text-emerald-700 mt-1">{formatINRCrores(summary?.bond_aum?.total_repaid || 0)}</p>
                  <div className="flex gap-2 mt-1 h-4 items-center">
                    <span className="text-xs text-gray-500">P: {formatINRLakhs(summary?.bond_aum?.principal_repaid || 0)}</span>
                    <span className="text-xs text-gray-400">|</span>
                    <span className="text-xs text-gray-500">I: {formatINRLakhs(summary?.bond_aum?.interest_repaid || 0)}</span>
                  </div>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 border border-orange-100 flex flex-col">
                  <p className="text-xs text-orange-600 uppercase tracking-wide">Pending</p>
                  <p className="text-lg font-bold text-orange-700 mt-1">{formatINRCrores(summary?.bond_aum?.total_pending || 0)}</p>
                  <div className="flex gap-2 mt-1 h-4 items-center">
                    <span className="text-xs text-gray-500">P: {formatINRLakhs(summary?.bond_aum?.principal_pending || 0)}</span>
                    <span className="text-xs text-gray-400">|</span>
                    <span className="text-xs text-gray-500">I: {formatINRLakhs(summary?.bond_aum?.interest_pending || 0)}</span>
                  </div>
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
                {/* Row 1: Invested and Open Opportunities */}
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <p className="text-xs text-blue-600 uppercase tracking-wide">Invested</p>
                  <p className="text-lg font-bold text-blue-700 mt-1">{formatAEDMillions(summary?.real_estate_aum?.total_invested || 0)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                  <p className="text-xs text-amber-600 uppercase tracking-wide">Open Opportunities</p>
                  <p className="text-lg font-bold text-amber-700 mt-1">{formatAEDMillions(summary?.real_estate_aum?.open_opportunities || 0)}</p>
                </div>
                
                {/* Row 2: Deal Size and Paid */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-xs text-slate-600 uppercase tracking-wide">Total Deal Size</p>
                  <p className="text-lg font-bold text-slate-700 mt-1">{formatAEDMillions(summary?.real_estate_aum?.total_deal_size || 0)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <p className="text-xs text-emerald-600 uppercase tracking-wide">Paid</p>
                  <p className="text-lg font-bold text-emerald-700 mt-1">{formatAEDMillions(summary?.real_estate_aum?.total_paid || 0)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Email Tracker Row with Data Gathering and Reset Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

            {/* Data Gathering Card */}
            <div 
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer" 
              data-testid="data-gathering-card"
              onClick={() => navigate("/broker/data-gathering")}
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

            {/* Reset Actions Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="reset-actions-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <Trash2 className="h-5 w-5 text-red-500" />
                </div>
                <h3 className="font-semibold text-gray-800">Reset Actions</h3>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setShowResetModal(true)}
                  className="flex flex-col items-center gap-1.5 p-3 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  data-testid="reset-database-btn"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-medium text-red-700">Reset All</span>
                </button>
                
                <button
                  onClick={() => { setIndividualResetType('real-estate'); setShowIndividualResetModal(true); }}
                  className="flex flex-col items-center gap-1.5 p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                  data-testid="reset-real-estate-btn"
                >
                  <Building2 className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-medium text-blue-700">Real Estate</span>
                </button>
                
                <button
                  onClick={() => { setIndividualResetType('clients'); setShowIndividualResetModal(true); }}
                  className="flex flex-col items-center gap-1.5 p-3 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                  data-testid="reset-clients-btn"
                >
                  <Users className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">Investors</span>
                </button>
                
                <button
                  onClick={() => { setIndividualResetType('sub-brokers'); setShowIndividualResetModal(true); }}
                  className="flex flex-col items-center gap-1.5 p-3 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                  data-testid="reset-sub-brokers-btn"
                >
                  <Briefcase className="h-4 w-4 text-purple-600" />
                  <span className="text-xs font-medium text-purple-700">Sub-Brokers</span>
                </button>
                
                <button
                  onClick={() => { setIndividualResetType('cas-analysis'); setShowIndividualResetModal(true); }}
                  className="flex flex-col items-center gap-1.5 p-3 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-colors"
                  data-testid="reset-cas-analysis-btn"
                >
                  <RefreshCw className="h-4 w-4 text-cyan-600" />
                  <span className="text-xs font-medium text-cyan-700">CAS</span>
                </button>
                
                <button
                  onClick={() => { fetchNCDList(); setShowNCDResetModal(true); }}
                  className="flex flex-col items-center gap-1.5 p-3 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                  data-testid="ncd-reset-btn"
                >
                  <Trash2 className="h-4 w-4 text-rose-600" />
                  <span className="text-xs font-medium text-rose-700">NCD</span>
                </button>
                
                <button
                  onClick={() => { fetchFamiliesList(); setShowDataGatheringResetModal(true); }}
                  className="flex flex-col items-center gap-1.5 p-3 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
                  data-testid="reset-families-btn"
                >
                  <Users className="h-4 w-4 text-orange-600" />
                  <span className="text-xs font-medium text-orange-700">Families</span>
                </button>
              </div>
            </div>

            {/* CAS Summary Card */}
            <div 
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer" 
              data-testid="cas-summary-card"
              onClick={() => navigate("/broker/analysis")}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-indigo-500/10">
                  <FileText className="h-5 w-5 text-indigo-500" />
                </div>
                <h3 className="font-semibold text-gray-800">CAS Summary</h3>
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded ml-auto">MF Portfolio</span>
              </div>
              
              {loadingCasSummary ? (
                <div className="flex items-center justify-center py-6">
                  <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-indigo-50 rounded-lg p-2 text-center">
                      <p className="text-xl font-bold text-indigo-700">{casSummary?.cas_parsed_count || 0}</p>
                      <p className="text-xs text-indigo-600">CAS Parsed</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-2 text-center">
                      <p className="text-xl font-bold text-purple-700">{casSummary?.unique_pan_count || 0}</p>
                      <p className="text-xs text-purple-600">Unique PANs</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-amber-700">{formatINRCrores(casSummary?.external_portfolio_value || 0)}</p>
                      <p className="text-xs text-amber-600">External AUM</p>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 text-center border-t pt-2">
                    External = Not under ARN-145633
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* NCD Reset Modal */}
      {showNCDResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-rose-100 rounded-full">
                <Trash2 className="h-6 w-6 text-rose-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">NCD Reset Options</h2>
              <button 
                onClick={() => { setShowNCDResetModal(false); setNCDResetResults(null); setSelectedNCDForReset(""); }}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <p className="text-gray-600 mb-4">
              Select an NCD and choose what to reset:
            </p>
            
            {/* NCD Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Select NCD</label>
              {loadingNCDList ? (
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                  <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
                  <span className="text-gray-500">Loading NCDs...</span>
                </div>
              ) : (
                <select
                  value={selectedNCDForReset}
                  onChange={(e) => setSelectedNCDForReset(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500"
                >
                  <option value="">-- Select NCD --</option>
                  {ncdList.map((ncd) => (
                    <option key={ncd.id} value={ncd.id}>
                      {ncd.bond_code || ncd.name} ({ncd.trades_count} investments, {ncd.repayments_count} repayments)
                    </option>
                  ))}
                </select>
              )}
            </div>
            
            {/* Reset Type Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Reset Type</label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="radio"
                    name="resetType"
                    value="repayments"
                    checked={ncdResetType === "repayments"}
                    onChange={(e) => setNCDResetType(e.target.value)}
                    className="text-rose-600"
                  />
                  <div>
                    <p className="font-medium text-gray-800">Reset Historical Repayments</p>
                    <p className="text-xs text-gray-500">Delete all actual repayments and email logs for this NCD</p>
                  </div>
                </label>
                
                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="radio"
                    name="resetType"
                    value="investments"
                    checked={ncdResetType === "investments"}
                    onChange={(e) => setNCDResetType(e.target.value)}
                    className="text-rose-600"
                  />
                  <div>
                    <p className="font-medium text-gray-800">Reset Investment Details</p>
                    <p className="text-xs text-gray-500">Delete all investments for this NCD</p>
                  </div>
                </label>
                
                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="radio"
                    name="resetType"
                    value="ncd"
                    checked={ncdResetType === "ncd"}
                    onChange={(e) => setNCDResetType(e.target.value)}
                    className="text-rose-600"
                  />
                  <div>
                    <p className="font-medium text-gray-800">Reset NCD Only</p>
                    <p className="text-xs text-gray-500">Delete the NCD definition (keeps investments and repayments)</p>
                  </div>
                </label>
                
                <label className="flex items-center gap-3 p-3 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100 border border-red-200">
                  <input
                    type="radio"
                    name="resetType"
                    value="all"
                    checked={ncdResetType === "all"}
                    onChange={(e) => setNCDResetType(e.target.value)}
                    className="text-red-600"
                  />
                  <div>
                    <p className="font-medium text-red-800">Reset All</p>
                    <p className="text-xs text-red-600">Delete NCD + all investments + all repayments</p>
                  </div>
                </label>
              </div>
            </div>
            
            {/* Results */}
            {ncdResetResults && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-green-800 mb-2">Reset Complete</h3>
                <div className="space-y-1 text-sm">
                  {ncdResetResults.bond_deleted && <p className="text-green-700">NCD definition deleted</p>}
                  {ncdResetResults.trades_deleted > 0 && <p className="text-green-700">{ncdResetResults.trades_deleted} investments deleted</p>}
                  {ncdResetResults.actual_repayments_deleted > 0 && <p className="text-green-700">{ncdResetResults.actual_repayments_deleted} repayments deleted</p>}
                  {ncdResetResults.email_logs_deleted > 0 && <p className="text-green-700">{ncdResetResults.email_logs_deleted} email logs deleted</p>}
                  {ncdResetResults.holding_cashflows_deleted > 0 && <p className="text-green-700">{ncdResetResults.holding_cashflows_deleted} cashflows deleted</p>}
                </div>
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowNCDResetModal(false); setNCDResetResults(null); setSelectedNCDForReset(""); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={handleNCDReset}
                disabled={ncdResetting || !selectedNCDForReset}
                className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {ncdResetting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Reset Selected
                  </>
                )}
              </button>
            </div>
            
            {/* Reset All Repayments for All Investors */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600 mb-2">Or reset all historical repayments across all NCDs:</p>
              <button
                onClick={handleResetAllRepayments}
                disabled={ncdResetting}
                className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Reset ALL Historical Repayments (All Investors)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Reset Modal */}
      {showIndividualResetModal && individualResetType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">
                Reset {resetTypes[individualResetType]?.label}
              </h2>
              <button 
                onClick={() => {
                  setShowIndividualResetModal(false);
                  setIndividualResetType(null);
                  setIndividualResetConfirm("");
                }}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <p className="text-gray-600 mb-4">
              This will <strong>permanently delete</strong> all {resetTypes[individualResetType]?.label} data. This action cannot be undone.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type <strong>RESET</strong> to confirm
              </label>
              <input
                type="text"
                value={individualResetConfirm}
                onChange={(e) => setIndividualResetConfirm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="RESET"
                data-testid="individual-reset-confirm-input"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowIndividualResetModal(false);
                  setIndividualResetType(null);
                  setIndividualResetConfirm("");
                }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleIndividualReset}
                disabled={individualResetConfirm !== "RESET" || individualResetting}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                data-testid="confirm-individual-reset-btn"
              >
                {individualResetting && <RefreshCw className="h-4 w-4 animate-spin" />}
                Reset {resetTypes[individualResetType]?.label}
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
      
      {/* Data Gathering Reset Modal */}
      {showDataGatheringResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-100 rounded-full">
                <Users className="h-6 w-6 text-orange-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Reset Data Gathering Families</h2>
              <button 
                onClick={() => { setShowDataGatheringResetModal(false); setDataGatheringResetResults(null); setSelectedFamilies([]); setDataGatheringResetConfirm(""); }}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Family Selection */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Select Families to Delete
                </label>
                <button
                  onClick={toggleSelectAllFamilies}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  {selectedFamilies.length === familiesList.length && familiesList.length > 0 ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              
              {loadingFamiliesList ? (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                  <span className="ml-2 text-gray-500">Loading families...</span>
                </div>
              ) : familiesList.length === 0 ? (
                <div className="text-center py-4 bg-gray-50 rounded-lg border border-gray-200">
                  <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No families found</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                  {familiesList.map((family) => (
                    <label 
                      key={family.id}
                      className={`flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 ${selectedFamilies.includes(family.id) ? 'bg-orange-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFamilies.includes(family.id)}
                        onChange={() => toggleFamilySelection(family.id)}
                        className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{family.family_name}</p>
                        {family.created_at && (
                          <p className="text-xs text-gray-500">Created: {new Date(family.created_at).toLocaleDateString()}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              
              <p className="text-xs text-gray-500 mt-2">
                {selectedFamilies.length === 0 
                  ? 'No families selected - will delete ALL families' 
                  : `${selectedFamilies.length} of ${familiesList.length} families selected`}
              </p>
            </div>
            
            {/* Warning Message */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-orange-800">
                <strong>Warning:</strong> {selectedFamilies.length === 0 
                  ? 'This will delete ALL data gathering families and their members permanently.' 
                  : `This will delete ${selectedFamilies.length} selected family(ies) and their members permanently.`}
              </p>
            </div>
            
            {/* Confirmation Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type <strong>RESET</strong> to confirm
              </label>
              <input
                type="text"
                value={dataGatheringResetConfirm}
                onChange={(e) => setDataGatheringResetConfirm(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="RESET"
                data-testid="data-gathering-reset-confirm-input"
              />
            </div>
            
            {/* Results */}
            {dataGatheringResetResults && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 font-medium">{dataGatheringResetResults.message}</p>
                <div className="text-sm text-green-700 mt-1">
                  {dataGatheringResetResults.deleted_counts?.data_gathering_families > 0 && (
                    <p>{dataGatheringResetResults.deleted_counts.data_gathering_families} families deleted</p>
                  )}
                  {dataGatheringResetResults.deleted_counts?.data_gathering_members > 0 && (
                    <p>{dataGatheringResetResults.deleted_counts.data_gathering_members} members deleted</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDataGatheringResetModal(false); setDataGatheringResetResults(null); setSelectedFamilies([]); setDataGatheringResetConfirm(""); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDataGatheringReset}
                disabled={dataGatheringResetConfirm !== "RESET" || dataGatheringResetting}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                data-testid="confirm-data-gathering-reset-btn"
              >
                {dataGatheringResetting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    {selectedFamilies.length === 0 ? 'Delete All Families' : `Delete ${selectedFamilies.length} Family(ies)`}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Currency Settings Modal */}
      {showCurrencySettingsModal && (
        <CurrencySettingsModal
          onClose={() => setShowCurrencySettingsModal(false)}
          onSuccess={() => {
            fetchForexRate();
            toast.success("Currency settings updated successfully");
          }}
        />
      )}
    </div>
  );
}
