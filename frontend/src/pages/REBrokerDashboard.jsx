import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  Building2, Users, UserCheck, Wallet, TrendingUp, RefreshCw,
  FileText, MapPin, Award, Settings
} from "lucide-react";
import REBrokerSidebar from "@/components/REBrokerSidebar";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Format currency for AED
const formatAED = (value) => {
  if (value === undefined || value === null || value === 0) return "AED 0";
  if (value >= 1000000) return `AED ${(value / 1000000).toFixed(2)} M`;
  if (value >= 1000) return `AED ${(value / 1000).toFixed(1)} K`;
  return `AED ${value.toLocaleString()}`;
};

// Format current date/time
const formatDateTime = () => {
  const now = new Date();
  const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
  const timeStr = now.toLocaleTimeString('en-US', timeOptions);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[now.getDay()];
  const day = now.getDate();
  const suffix = (day === 1 || day === 21 || day === 31) ? 'st' 
               : (day === 2 || day === 22) ? 'nd' 
               : (day === 3 || day === 23) ? 'rd' : 'th';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = months[now.getMonth()];
  const year = now.getFullYear();
  return `${timeStr} | ${dayName}, ${day}${suffix} ${monthName} ${year}`;
};

export default function REBrokerDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [brokerProfile, setBrokerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(formatDateTime());
  const [summary, setSummary] = useState({
    total_opportunities: 0,
    active_opportunities: 0,
    total_agents: 0,
    total_investors: 0,
    total_holdings: 0,
    total_aum: 0,
    pending_approvals: 0,
  });

  useEffect(() => {
    document.title = "Kinntegraa | RE Broker - Analytics";
    
    // Update time every minute
    const timer = setInterval(() => {
      setCurrentTime(formatDateTime());
    }, 60000);
    
    const userData = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    
    if (!userData || !token) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "re_broker") {
      toast.error("Access denied. This portal is for Real Estate Brokers only.");
      navigate("/login");
      return;
    }
    
    setUser(parsedUser);
    fetchBrokerProfile(token);
    fetchDashboardData(token);
    
    return () => clearInterval(timer);
  }, [navigate]);

  const fetchBrokerProfile = async (token) => {
    try {
      const response = await axios.get(`${API}/re-broker/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBrokerProfile(response.data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const fetchDashboardData = useCallback(async (token) => {
    setLoading(true);
    try {
      const tkn = token || localStorage.getItem("token");
      const response = await axios.get(`${API}/re-broker/dashboard-summary`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      setSummary(response.data || {});
    } catch (error) {
      console.error("Error fetching dashboard:", error);
      // Set default values on error
      setSummary({
        total_opportunities: 0,
        active_opportunities: 0,
        total_agents: 0,
        total_investors: 0,
        total_holdings: 0,
        total_aum: 0,
        pending_approvals: 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <REBrokerSidebar user={user} brokerProfile={brokerProfile} />
      
      <div className="flex-1 md:ml-0">
        {/* Header with Time */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="ml-12 md:ml-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800">Analytics</h1>
              <p className="text-sm text-gray-500">{currentTime}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => fetchDashboardData()} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button 
                variant="outline"
                onClick={() => navigate('/re-broker/settings')}
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8 space-y-6">
          {/* Stats Cards - Row 1 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* My Investors */}
            <div 
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer"
              onClick={() => navigate('/re-broker/private-investors')}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <UserCheck className="h-5 w-5 text-blue-500" />
                </div>
                <h3 className="font-medium text-gray-600 text-sm">My Investors</h3>
              </div>
              <p className="text-3xl font-bold text-gray-800">{summary.total_investors || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Total private investors</p>
            </div>

            {/* Opportunities */}
            <div 
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer"
              onClick={() => navigate('/re-broker/opportunities')}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <Building2 className="h-5 w-5 text-emerald-500" />
                </div>
                <h3 className="font-medium text-gray-600 text-sm">Opportunities</h3>
              </div>
              <p className="text-3xl font-bold text-emerald-600">{summary.total_opportunities || 0}</p>
              <p className="text-xs text-gray-500 mt-1">{summary.active_opportunities || 0} active listings</p>
            </div>

            {/* My Agents */}
            <div 
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer"
              onClick={() => navigate('/re-broker/agents')}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Users className="h-5 w-5 text-purple-500" />
                </div>
                <h3 className="font-medium text-gray-600 text-sm">My Agents</h3>
              </div>
              <p className="text-3xl font-bold text-purple-600">{summary.total_agents || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Team members</p>
            </div>

            {/* Pending Approvals */}
            <div 
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer"
              onClick={() => navigate('/re-broker/approvals')}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <FileText className="h-5 w-5 text-amber-500" />
                </div>
                <h3 className="font-medium text-gray-600 text-sm">Pending</h3>
              </div>
              <p className="text-3xl font-bold text-amber-600">{summary.pending_approvals || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Awaiting action</p>
            </div>
          </div>

          {/* Stats Cards - Row 2: AUM */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Real Estate AUM */}
            <div 
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer"
              onClick={() => navigate('/re-broker/holdings')}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-etihad-gold-500/10">
                  <Wallet className="h-5 w-5 text-etihad-gold-600" />
                </div>
                <h3 className="font-medium text-gray-600 text-sm">Real Estate AUM</h3>
              </div>
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-3xl font-bold text-etihad-gold-700">{formatAED(summary.total_aum || 0)}</p>
                  <p className="text-xs text-gray-500 mt-1">Total assets under management</p>
                </div>
                <div className="flex-1 text-right">
                  <p className="text-lg font-semibold text-gray-700">{summary.total_holdings || 0}</p>
                  <p className="text-xs text-gray-500">Holdings</p>
                </div>
              </div>
            </div>

            {/* Recent Activity / Performance */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-indigo-500/10">
                  <TrendingUp className="h-5 w-5 text-indigo-500" />
                </div>
                <h3 className="font-medium text-gray-600 text-sm">Performance</h3>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xl font-bold text-gray-800">{summary.conversions_this_month || 0}</p>
                  <p className="text-xs text-gray-500">Conversions</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-800">{summary.interests_this_month || 0}</p>
                  <p className="text-xs text-gray-500">Interests</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-800">{summary.new_investors_this_month || 0}</p>
                  <p className="text-xs text-gray-500">New Investors</p>
                </div>
              </div>
            </div>
          </div>

          {/* Profile & Quick Info Row */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* Profile Summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-etihad-gold-400 to-etihad-gold-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
                  {user?.name?.charAt(0) || "R"}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{user?.name}</h3>
                  <p className="text-sm text-gray-500">{brokerProfile?.company_name || user?.company_name}</p>
                </div>
              </div>
              
              <div className="space-y-2 text-sm border-t pt-4">
                {brokerProfile?.emirate && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span>{brokerProfile.emirate}, UAE</span>
                  </div>
                )}
                {(brokerProfile?.rera_license_number || user?.rera_license_number) && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Award className="h-4 w-4 text-gray-400" />
                    <span>RERA: {brokerProfile?.rera_license_number || user?.rera_license_number}</span>
                  </div>
                )}
                {brokerProfile?.specialization && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-1">Specialization</p>
                    <span className="inline-block px-2 py-1 bg-etihad-gold-50 text-etihad-gold-700 rounded text-xs font-medium capitalize">
                      {brokerProfile.specialization}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button 
                  onClick={() => navigate('/re-broker/opportunities')}
                  className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-etihad-gold-50 rounded-xl border border-gray-200 hover:border-etihad-gold-400 transition-all"
                >
                  <Building2 className="h-6 w-6 text-etihad-gold-600 mb-2" />
                  <span className="text-xs font-medium text-gray-700">Opportunities</span>
                </button>
                
                <button 
                  onClick={() => navigate('/re-broker/agents')}
                  className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-purple-50 rounded-xl border border-gray-200 hover:border-purple-400 transition-all"
                >
                  <Users className="h-6 w-6 text-purple-600 mb-2" />
                  <span className="text-xs font-medium text-gray-700">My Agents</span>
                </button>
                
                <button 
                  onClick={() => navigate('/re-broker/private-investors')}
                  className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-blue-50 rounded-xl border border-gray-200 hover:border-blue-400 transition-all"
                >
                  <UserCheck className="h-6 w-6 text-blue-600 mb-2" />
                  <span className="text-xs font-medium text-gray-700">Investors</span>
                </button>
                
                <button 
                  onClick={() => navigate('/re-broker/upload')}
                  className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-green-50 rounded-xl border border-gray-200 hover:border-green-400 transition-all"
                >
                  <FileText className="h-6 w-6 text-green-600 mb-2" />
                  <span className="text-xs font-medium text-gray-700">Upload</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
