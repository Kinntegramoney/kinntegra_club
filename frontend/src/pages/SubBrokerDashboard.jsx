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
  Clock
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

export default function SubBrokerDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [forexRate, setForexRate] = useState(22.5);

  // Log user activity
  useEffect(() => {
    logUserActivity('dashboard');
  }, []);

  useEffect(() => {
    document.title = "Kinntegraa | Sub-Broker Dashboard";
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

  const bondOnlyClients = summary?.clients?.bond_only || 0;
  const realEstateOnlyClients = summary?.clients?.real_estate_only || 0;
  const bothProductsClients = summary?.clients?.both_products || 0;

  // Calculate total AUM in INR for display
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">My Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">Welcome back, {user.name}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
                <ArrowRightLeft className="h-3 w-3" />
                <span>1 AED = ₹{forexRate.toFixed(2)}</span>
              </div>
              <button 
                onClick={() => { fetchDashboardData(); fetchForexRate(); }}
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
          {/* Total AUM Summary */}
          <div className="bg-gradient-to-r from-violet-600 to-etihad-maroon-600 rounded-xl p-6 text-white" data-testid="total-aum-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-white/20 rounded-lg">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold">Total AUM Under Management</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-white/70 text-sm">Total AUM (INR Equivalent)</p>
                <p className="text-3xl font-bold mt-1">{formatINRCrores(totalAumINR)}</p>
              </div>
              <div>
                <p className="text-white/70 text-sm">Bond AUM (INR)</p>
                <p className="text-2xl font-bold mt-1">{formatINRCrores(bondAumINR)}</p>
              </div>
              <div>
                <p className="text-white/70 text-sm">Real Estate AUM (AED)</p>
                <p className="text-2xl font-bold mt-1">{formatAEDMillions(reAumAED)}</p>
                <p className="text-white/60 text-xs mt-1">≈ {formatINRCrores(reAumINR)}</p>
              </div>
            </div>
          </div>

          {/* Dashboard Cards - Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="kpi-cards">
            
            {/* My Clients */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="clients-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-indigo-500/10">
                    <Users className="h-5 w-5 text-etihad-maroon-500" />
                  </div>
                  <h3 className="font-semibold text-gray-800">My Clients</h3>
                </div>
              </div>
              <p className="text-4xl font-bold text-etihad-maroon-600">{summary?.clients?.total || 0}</p>
              <p className="text-xs text-gray-500 mt-1">{summary?.clients?.active || 0} active clients</p>
            </div>
            
            {/* Available Opportunities */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="opportunities-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                  </div>
                  <h3 className="font-semibold text-gray-800">Available Opportunities</h3>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-etihad-gold-600">{summary?.opportunities?.bonds?.available || 0}</p>
                  <p className="text-xs text-gray-500">Bonds</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-600">{summary?.opportunities?.real_estate?.available || 0}</p>
                  <p className="text-xs text-gray-500">Real Estate</p>
                </div>
              </div>
            </div>
            
            {/* Upcoming Repayments */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="repayments-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Calendar className="h-5 w-5 text-amber-500" />
                  </div>
                  <h3 className="font-semibold text-gray-800">Upcoming Repayments</h3>
                </div>
              </div>
              <p className="text-4xl font-bold text-amber-600">{summary?.upcoming_repayments?.count || 0}</p>
              <p className="text-xs text-gray-500 mt-1">For all clients</p>
            </div>
            
            {/* Total AUM */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="total-aum-summary">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Briefcase className="h-5 w-5 text-purple-500" />
                  </div>
                  <h3 className="font-semibold text-gray-800">Total AUM</h3>
                </div>
              </div>
              <p className="text-2xl font-bold text-purple-600">{formatINRCrores(totalAumINR)}</p>
              <p className="text-xs text-gray-500 mt-1">Combined value</p>
            </div>
          </div>

          {/* Dashboard Cards - Row 2: Client Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="breakdown-cards">
            {/* Client Breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="clients-index-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-indigo-500/10">
                  <Users className="h-5 w-5 text-etihad-maroon-500" />
                </div>
                <h3 className="font-semibold text-gray-800">Client Breakdown</h3>
              </div>
              
              {/* Client Index Breakdown */}
              <div className="space-y-3">
                {/* Bonds Only */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-etihad-gold-500"></div>
                    <span className="text-sm text-gray-600">Bonds Only</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{bondOnlyClients}</span>
                    <span className="text-xs text-gray-400">
                      ({summary?.clients?.total > 0 ? Math.round((bondOnlyClients / summary.clients.total) * 100) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className="bg-etihad-gold-500 h-2 rounded-full transition-all" 
                    style={{ width: `${summary?.clients?.total > 0 ? (bondOnlyClients / summary.clients.total) * 100 : 0}%` }}
                  />
                </div>

                {/* Real Estate Only */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-slate-500"></div>
                    <span className="text-sm text-gray-600">Real Estate Only</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{realEstateOnlyClients}</span>
                    <span className="text-xs text-gray-400">
                      ({summary?.clients?.total > 0 ? Math.round((realEstateOnlyClients / summary.clients.total) * 100) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className="bg-slate-500 h-2 rounded-full transition-all" 
                    style={{ width: `${summary?.clients?.total > 0 ? (realEstateOnlyClients / summary.clients.total) * 100 : 0}%` }}
                  />
                </div>

                {/* Both Products */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                    <span className="text-sm text-gray-600">Both Products</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{bothProductsClients}</span>
                    <span className="text-xs text-gray-400">
                      ({summary?.clients?.total > 0 ? Math.round((bothProductsClients / summary.clients.total) * 100) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className="bg-purple-500 h-2 rounded-full transition-all" 
                    style={{ width: `${summary?.clients?.total > 0 ? (bothProductsClients / summary.clients.total) * 100 : 0}%` }}
                  />
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
                <span className="text-xs bg-etihad-gold-100 text-etihad-gold-700 px-2 py-0.5 rounded ml-auto">INR</span>
              </div>
              
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Total Deal Size</p>
                    <p className="text-lg font-bold text-gray-700 mt-1">{formatINRCrores(summary?.bond_aum?.total_deal_size || 0)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                    <p className="text-xs text-blue-600 uppercase tracking-wide">Total Invested</p>
                    <p className="text-lg font-bold text-blue-700 mt-1">{formatINRCrores(summary?.bond_aum?.total_invested || 0)}</p>
                    <p className="text-xs text-gray-500">(Payments received)</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-100">
                    <p className="text-xs text-emerald-600">Repaid</p>
                    <p className="text-sm font-bold text-emerald-700">{formatINRCrores(summary?.bond_aum?.total_repaid || 0)}</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-2 border border-orange-100">
                    <p className="text-xs text-orange-600">Pending</p>
                    <p className="text-sm font-bold text-orange-700">{formatINRCrores(summary?.bond_aum?.total_pending || 0)}</p>
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
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded ml-auto">AED</span>
              </div>
              
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-xs text-gray-600 uppercase tracking-wide">Total Deal Size</p>
                  <p className="text-xl font-bold text-gray-700 mt-1">{formatAEDMillions(summary?.real_estate_aum?.total_deal_size || 0)}</p>
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                    <IndianRupee className="h-3 w-3" />
                    <span>≈ {formatINRCrores((summary?.real_estate_aum?.total_deal_size || 0) * forexRate)}</span>
                  </div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <p className="text-xs text-emerald-600 uppercase tracking-wide">Total Invested</p>
                  <p className="text-lg font-bold text-emerald-700 mt-1">{formatAEDMillions(summary?.real_estate_aum?.total_paid || 0)}</p>
                  <p className="text-xs text-gray-500">(Payments received from clients)</p>
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                    <IndianRupee className="h-3 w-3" />
                    <span>≈ {formatINRCrores((summary?.real_estate_aum?.total_paid || 0) * forexRate)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <button
                onClick={() => navigate("/sub-broker/opportunities")}
                className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 hover:border-indigo-400 transition-all group"
                data-testid="quick-action-opportunities"
              >
                <TrendingUp className="h-8 w-8 text-etihad-maroon-500 group-hover:scale-110 transition-transform" />
                <span className="mt-2 text-sm font-medium text-gray-700">Opportunities</span>
              </button>
              <button
                onClick={() => navigate("/sub-broker/holdings")}
                className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 hover:border-emerald-400 transition-all group"
                data-testid="quick-action-holdings"
              >
                <Landmark className="h-8 w-8 text-emerald-500 group-hover:scale-110 transition-transform" />
                <span className="mt-2 text-sm font-medium text-gray-700">Holdings</span>
              </button>
              <button
                onClick={() => navigate("/sub-broker/profile")}
                className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 hover:border-violet-400 transition-all group"
                data-testid="quick-action-profile"
              >
                <Briefcase className="h-8 w-8 text-violet-500 group-hover:scale-110 transition-transform" />
                <span className="mt-2 text-sm font-medium text-gray-700">My Profile</span>
              </button>
              <button
                onClick={() => navigate("/analysis")}
                className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 hover:border-pink-400 transition-all group"
                data-testid="quick-action-analysis"
              >
                <Building2 className="h-8 w-8 text-pink-500 group-hover:scale-110 transition-transform" />
                <span className="mt-2 text-sm font-medium text-gray-700">CAS Analysis</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
