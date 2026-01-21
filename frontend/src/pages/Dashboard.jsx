import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { 
  TrendingUp, 
  DollarSign, 
  Users, 
  Building2, 
  Briefcase,
  Landmark,
  RefreshCw,
  Trash2,
  AlertTriangle,
  X,
  IndianRupee,
  ArrowRightLeft
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Color palette
const COLORS = {
  primary: "#4F46E5",
  secondary: "#7C3AED",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#3B82F6",
  chart: ["#4F46E5", "#7C3AED", "#EC4899", "#F59E0B", "#10B981", "#3B82F6", "#6366F1", "#8B5CF6"]
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

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [aumDistribution, setAumDistribution] = useState({ by_asset_class: [], by_subbroker: [] });
  const [forexRate, setForexRate] = useState(22.5); // Default AED to INR rate
  
  // Reset database state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

  // Set page title
  useEffect(() => {
    document.title = "Kinntegraa | Dashboard";
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

  // Prepare sub-broker AUM data for chart
  const subBrokerChartData = (aumDistribution.by_subbroker || []).map(sb => ({
    ...sb,
    bond_aum_display: sb.bond_aum || 0,
    real_estate_aum_aed: sb.real_estate_aum || 0,
    real_estate_aum_inr: (sb.real_estate_aum || 0) * forexRate
  }));

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Analytics Dashboard</h1>
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
          {/* Dashboard Cards - Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="kpi-cards">
            
            {/* Total Clients - Venn Diagram Style */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="clients-venn-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-indigo-500/10">
                  <Users className="h-5 w-5 text-indigo-500" />
                </div>
                <h3 className="font-semibold text-gray-800">Total Clients</h3>
              </div>
              
              {/* Venn Diagram Style Display */}
              <div className="flex items-center justify-center gap-0 my-4 relative">
                {/* Bonds Circle */}
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center relative z-10">
                    <div className="text-center">
                      <p className="text-xl font-bold text-amber-700">{bondOnlyClients}</p>
                      <p className="text-xs text-amber-600">Bonds</p>
                    </div>
                  </div>
                </div>
                
                {/* Intersection - Both Products */}
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-amber-200 to-pink-200 border-2 border-purple-400 flex items-center justify-center -mx-6 z-20 shadow-lg">
                  <div className="text-center">
                    <p className="text-lg font-bold text-purple-700">{bothProductsClients}</p>
                    <p className="text-[10px] text-purple-600">Both</p>
                  </div>
                </div>
                
                {/* Real Estate Circle */}
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-pink-100 border-2 border-pink-400 flex items-center justify-center relative z-10">
                    <div className="text-center">
                      <p className="text-xl font-bold text-pink-700">{realEstateOnlyClients}</p>
                      <p className="text-xs text-pink-600">Real Estate</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="text-center border-t pt-3 mt-2">
                <p className="text-2xl font-bold text-gray-800">{summary?.clients?.total || 0}</p>
                <p className="text-xs text-gray-500">Total Clients</p>
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

          {/* AUM by Sub-Broker - Enhanced with Both Bonds and Real Estate */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="subbroker-aum-chart">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-violet-500" />
                AUM by Sub-Broker
              </h3>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-amber-500"></div>
                  <span className="text-gray-600">Bonds (INR)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-pink-500"></div>
                  <span className="text-gray-600">Real Estate (AED)</span>
                </div>
              </div>
            </div>
            
            {subBrokerChartData.length > 0 ? (
              <div className="space-y-4">
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={subBrokerChartData.slice(0, 8)} 
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
                      {subBrokerChartData.map((sb, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium text-gray-800">{sb.name}</td>
                          <td className="py-3 px-4 text-gray-600">{sb.partner_code}</td>
                          <td className="py-3 px-4 text-right text-amber-700 font-medium">
                            {formatINRCrores(sb.bond_aum)}
                          </td>
                          <td className="py-3 px-4 text-right text-pink-700 font-medium">
                            {formatAEDMillions(sb.real_estate_aum)}
                          </td>
                          <td className="py-3 px-4 text-right text-indigo-700 font-medium">
                            {sb.real_estate_aum > 0 ? (
                              <span title={`Converted at 1 AED = ₹${forexRate.toFixed(2)}`}>
                                {formatINRCrores(sb.real_estate_aum * forexRate)}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs font-medium">
                              {sb.client_count}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Briefcase className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No sub-broker data available</p>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <button
                onClick={() => navigate("/broker/admin/bonds")}
                className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 hover:border-amber-400 transition-all group"
                data-testid="quick-action-bonds"
              >
                <Landmark className="h-8 w-8 text-indigo-500 group-hover:scale-110 transition-transform" />
                <span className="mt-2 text-sm font-medium text-gray-700">Manage Bonds</span>
              </button>
              <button
                onClick={() => navigate("/broker/admin/real-estate")}
                className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 hover:border-pink-400 transition-all group"
                data-testid="quick-action-real-estate"
              >
                <Building2 className="h-8 w-8 text-pink-500 group-hover:scale-110 transition-transform" />
                <span className="mt-2 text-sm font-medium text-gray-700">Real Estate</span>
              </button>
              <button
                onClick={() => navigate("/broker/admin/clients")}
                className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 hover:border-emerald-400 transition-all group"
                data-testid="quick-action-clients"
              >
                <Users className="h-8 w-8 text-emerald-500 group-hover:scale-110 transition-transform" />
                <span className="mt-2 text-sm font-medium text-gray-700">Manage Clients</span>
              </button>
              <button
                onClick={() => navigate("/broker/admin/sub-brokers")}
                className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 hover:border-violet-400 transition-all group"
                data-testid="quick-action-subbrokers"
              >
                <Briefcase className="h-8 w-8 text-violet-500 group-hover:scale-110 transition-transform" />
                <span className="mt-2 text-sm font-medium text-gray-700">Sub-Brokers</span>
              </button>
              <button
                onClick={() => setShowResetModal(true)}
                className="flex flex-col items-center justify-center p-4 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 hover:border-red-400 transition-all group"
                data-testid="quick-action-reset"
              >
                <Trash2 className="h-8 w-8 text-red-500 group-hover:scale-110 transition-transform" />
                <span className="mt-2 text-sm font-medium text-red-700">Reset Data</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Reset Database Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-full">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Reset Database</h3>
              </div>
              <button
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmText("");
                }}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 font-medium mb-2">
                This action will permanently delete:
              </p>
              <ul className="text-sm text-red-700 space-y-1 ml-4">
                <li>All clients & client documents</li>
                <li>All sub-brokers</li>
                <li>All bonds & bond documents</li>
                <li>All real estate deals & attachments</li>
                <li>All trades, investments & cashflows</li>
                <li>All CAS analyses & reports</li>
                <li>All uploaded files</li>
              </ul>
              <p className="text-sm text-red-800 font-medium mt-3">
                Broker accounts will be preserved
              </p>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type <span className="font-bold text-red-600">RESET</span> to confirm
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="Type RESET"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                data-testid="reset-confirm-input"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmText("");
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleResetDatabase}
                disabled={resetConfirmText !== "RESET" || resetting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                data-testid="reset-confirm-button"
              >
                {resetting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Reset Database
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
