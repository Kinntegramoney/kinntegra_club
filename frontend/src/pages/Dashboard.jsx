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
  Activity,
  MapPin,
  PieChart,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  UserPlus,
  Landmark,
  Home,
  RefreshCw
} from "lucide-react";
import {
  PieChart as RechartsPie,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  Area,
  AreaChart
} from "recharts";

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

// Format currency
const formatCurrency = (value, currency = "AED") => {
  if (value === undefined || value === null) return `${currency} 0`;
  if (value >= 10000000) return `${currency} ${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `${currency} ${(value / 100000).toFixed(2)}L`;
  if (value >= 1000) return `${currency} ${(value / 1000).toFixed(1)}K`;
  return `${currency} ${value.toLocaleString()}`;
};

// Format number
const formatNumber = (value) => {
  if (value === undefined || value === null) return "0";
  return value.toLocaleString();
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [clientsByCity, setClientsByCity] = useState([]);
  const [aumDistribution, setAumDistribution] = useState({ by_asset_class: [], by_subbroker: [] });
  const [activityLog, setActivityLog] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

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
  }, [navigate]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      const [summaryRes, citiesRes, aumRes, activityRes, monthlyRes] = await Promise.all([
        axios.get(`${API}/dashboard/summary`, { headers }),
        axios.get(`${API}/dashboard/clients-by-city`, { headers }),
        axios.get(`${API}/dashboard/aum-distribution`, { headers }),
        axios.get(`${API}/dashboard/activity-log?limit=15`, { headers }),
        axios.get(`${API}/dashboard/monthly-stats?year=${selectedYear}`, { headers })
      ]);

      setSummary(summaryRes.data);
      setClientsByCity(citiesRes.data);
      setAumDistribution(aumRes.data);
      setActivityLog(activityRes.data);
      setMonthlyStats(monthlyRes.data);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchMonthlyStats();
    }
  }, [selectedYear]);

  const fetchMonthlyStats = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/dashboard/monthly-stats?year=${selectedYear}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMonthlyStats(res.data);
    } catch (error) {
      console.error("Error fetching monthly stats:", error);
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

  const kpiCards = [
    { 
      label: "Total Clients", 
      value: summary?.clients?.total || 0, 
      subValue: `${summary?.clients?.active || 0} Active`,
      icon: Users, 
      color: "from-indigo-500 to-indigo-600",
      bgColor: "bg-indigo-500/10",
      textColor: "text-indigo-400"
    },
    { 
      label: "Sub-Brokers", 
      value: summary?.sub_brokers?.total || 0, 
      subValue: `${summary?.sub_brokers?.active || 0} Active`,
      icon: Briefcase, 
      color: "from-violet-500 to-violet-600",
      bgColor: "bg-violet-500/10",
      textColor: "text-violet-400"
    },
    { 
      label: "Total AUM", 
      value: formatCurrency(summary?.aum?.total),
      subValue: "Bonds + Real Estate",
      icon: DollarSign, 
      color: "from-emerald-500 to-emerald-600",
      bgColor: "bg-emerald-500/10",
      textColor: "text-emerald-400",
      isLarge: true
    },
    { 
      label: "Bond Opportunities", 
      value: summary?.opportunities?.bonds?.total || 0, 
      subValue: `${summary?.opportunities?.bonds?.available || 0} Available`,
      icon: Landmark, 
      color: "from-amber-500 to-amber-600",
      bgColor: "bg-amber-500/10",
      textColor: "text-amber-400"
    },
    { 
      label: "Real Estate", 
      value: summary?.opportunities?.real_estate?.total || 0, 
      subValue: `${summary?.opportunities?.real_estate?.invested || 0} Invested`,
      icon: Building2, 
      color: "from-pink-500 to-pink-600",
      bgColor: "bg-pink-500/10",
      textColor: "text-pink-400"
    },
    { 
      label: "Trades Done", 
      value: summary?.trades_count || 0, 
      subValue: "Approved Trades",
      icon: Activity, 
      color: "from-cyan-500 to-cyan-600",
      bgColor: "bg-cyan-500/10",
      textColor: "text-cyan-400"
    }
  ];

  // Prepare data for client type distribution (using status)
  const clientTypeData = [
    { name: "Active", value: summary?.clients?.active || 0, color: COLORS.success },
    { name: "Inactive", value: (summary?.clients?.total || 0) - (summary?.clients?.active || 0), color: COLORS.danger }
  ].filter(d => d.value > 0);

  // Prepare AUM by asset class for pie chart
  const aumByAssetClass = aumDistribution.by_asset_class?.filter(d => d.value > 0) || [];

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
              <button 
                onClick={fetchDashboardData}
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
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="kpi-cards">
            {kpiCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <div 
                  key={card.label} 
                  className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all"
                  data-testid={`kpi-card-${index}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2 rounded-lg ${card.bgColor}`}>
                      <Icon className={`h-5 w-5 ${card.textColor}`} />
                    </div>
                  </div>
                  <p className={`text-2xl font-bold text-gray-800 ${card.isLarge ? 'text-xl' : ''}`}>
                    {typeof card.value === 'string' ? card.value : formatNumber(card.value)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{card.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{card.subValue}</p>
                </div>
              );
            })}
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Client Distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="client-distribution-chart">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <PieChart className="h-5 w-5 text-indigo-500" />
                Client Status
              </h3>
              <div className="h-[200px]">
                {clientTypeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={clientTypeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {clientTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#fff', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          color: '#374151'
                        }}
                      />
                      <Legend 
                        wrapperStyle={{ color: '#6b7280' }}
                        formatter={(value) => <span className="text-gray-600">{value}</span>}
                      />
                    </RechartsPie>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    No client data available
                  </div>
                )}
              </div>
              <div className="text-center mt-2">
                <p className="text-3xl font-bold text-gray-800">{summary?.clients?.total || 0}</p>
                <p className="text-xs text-gray-500">Total Clients</p>
              </div>
            </div>

            {/* AUM Distribution by Asset Class */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="aum-distribution-chart">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-500" />
                AUM Distribution
              </h3>
              <div className="h-[200px]">
                {aumByAssetClass.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={aumByAssetClass}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {aumByAssetClass.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS.chart[index % COLORS.chart.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#fff', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          color: '#374151'
                        }}
                        formatter={(value) => formatCurrency(value)}
                      />
                      <Legend 
                        wrapperStyle={{ color: '#6b7280' }}
                        formatter={(value) => <span className="text-gray-600">{value}</span>}
                      />
                    </RechartsPie>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    No AUM data available
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
                <div className="text-center">
                  <p className="text-lg font-bold text-indigo-600">{formatCurrency(summary?.aum?.bonds)}</p>
                  <p className="text-xs text-gray-500">Bonds</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-pink-600">{formatCurrency(summary?.aum?.real_estate)}</p>
                  <p className="text-xs text-gray-500">Real Estate</p>
                </div>
              </div>
            </div>

            {/* Client Spread by City */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="client-spread-chart">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-pink-500" />
                Client Spread by City
              </h3>
              <div className="h-[280px]">
                {clientsByCity.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={clientsByCity.slice(0, 6)} 
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" stroke="#6b7280" />
                      <YAxis dataKey="city" type="category" stroke="#6b7280" width={80} tick={{ fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#fff', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          color: '#374151'
                        }}
                      />
                      <Bar dataKey="count" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    No location data available
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sub-broker AUM */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="subbroker-aum-chart">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-violet-500" />
                AUM by Sub-Broker
              </h3>
              <div className="h-[300px]">
                {aumDistribution.by_subbroker?.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={aumDistribution.by_subbroker.slice(0, 8)} 
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
                      <YAxis stroke="#6b7280" tickFormatter={(value) => formatCurrency(value, '')} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#fff', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          color: '#374151'
                        }}
                        formatter={(value) => formatCurrency(value)}
                      />
                      <Bar dataKey="bond_aum" name="Bond AUM" stackId="a" fill={COLORS.primary} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="real_estate_aum" name="RE AUM" stackId="a" fill={COLORS.secondary} radius={[4, 4, 0, 0]} />
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    <div className="text-center">
                      <Briefcase className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No sub-broker data available</p>
                    </div>
                  </div>
                )}
              </div>
              {aumDistribution.by_subbroker?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Sub-Brokers</span>
                    <span className="text-gray-800 font-medium">{summary?.sub_brokers?.total || 0}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Monthly Console */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="monthly-console-chart">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-cyan-500" />
                  Monthly Console
                </h3>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  data-testid="year-selector"
                >
                  {[2025, 2024, 2023, 2022].map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyStats} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorInvestments" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={COLORS.success} stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorTrades" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" stroke="#6b7280" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#6b7280" tickFormatter={(value) => formatCurrency(value, '')} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        color: '#374151'
                      }}
                      formatter={(value) => formatCurrency(value)}
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="investments" 
                      name="RE Investments"
                      stroke={COLORS.success} 
                      fillOpacity={1} 
                      fill="url(#colorInvestments)" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="trades" 
                      name="Bond Trades"
                      stroke={COLORS.primary} 
                      fillOpacity={1} 
                      fill="url(#colorTrades)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Activity Log */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all" data-testid="activity-log">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5 text-amber-500" />
              Recent Activity
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activityLog.length > 0 ? (
                    activityLog.map((activity, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {activity.type === 'trade' && <Landmark className="h-4 w-4 text-indigo-500" />}
                            {activity.type === 'real_estate_investment' && <Building2 className="h-4 w-4 text-pink-500" />}
                            {activity.type === 'client_created' && <UserPlus className="h-4 w-4 text-emerald-500" />}
                            <span className="text-sm text-gray-700 capitalize">
                              {activity.type.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm text-gray-600 truncate max-w-xs">{activity.description}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm font-medium text-gray-800">
                            {activity.amount > 0 ? formatCurrency(activity.amount) : '-'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            activity.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                            activity.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            activity.status === 'invested' ? 'bg-indigo-100 text-indigo-700' :
                            activity.status === 'new' ? 'bg-cyan-100 text-cyan-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {activity.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-gray-500">
                            {activity.timestamp ? new Date(activity.timestamp).toLocaleDateString() : '-'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-400">
                        No recent activity
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <button
                onClick={() => navigate("/broker/admin/bonds")}
                className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 hover:border-amber-400 transition-all group"
                data-testid="quick-action-bonds"
              >
                <Landmark className="h-8 w-8 text-indigo-500 group-hover:scale-110 transition-transform" />
                <span className="mt-2 text-sm font-medium text-slate-300">Manage Bonds</span>
              </button>
              <button
                onClick={() => navigate("/broker/admin/real-estate")}
                className="flex flex-col items-center justify-center p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700 hover:border-pink-500/50 transition-all group"
                data-testid="quick-action-real-estate"
              >
                <Building2 className="h-8 w-8 text-pink-400 group-hover:scale-110 transition-transform" />
                <span className="mt-2 text-sm font-medium text-slate-300">Real Estate</span>
              </button>
              <button
                onClick={() => navigate("/broker/admin/clients")}
                className="flex flex-col items-center justify-center p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700 hover:border-emerald-500/50 transition-all group"
                data-testid="quick-action-clients"
              >
                <Users className="h-8 w-8 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="mt-2 text-sm font-medium text-slate-300">Manage Clients</span>
              </button>
              <button
                onClick={() => navigate("/broker/admin/sub-brokers")}
                className="flex flex-col items-center justify-center p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700 hover:border-violet-500/50 transition-all group"
                data-testid="quick-action-subbrokers"
              >
                <Briefcase className="h-8 w-8 text-violet-400 group-hover:scale-110 transition-transform" />
                <span className="mt-2 text-sm font-medium text-slate-300">Sub-Brokers</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
