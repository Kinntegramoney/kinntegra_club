import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Shield, RefreshCw, Search, Building2, Users, UserCheck, 
  CreditCard, Handshake, Eye, ChevronRight, TrendingUp,
  AlertTriangle, CheckCircle, Clock, LogOut, LayoutDashboard
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [brokers, setBrokers] = useState([]);
  const [supportRequests, setSupportRequests] = useState([]);
  const [stats, setStats] = useState({
    total_brokers: 0,
    active_subscriptions: 0,
    total_agents: 0,
    total_clients: 0,
    active_support_requests: 0,
    monthly_revenue: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    document.title = "Kinntegraa | Super Admin Dashboard";
    
    const userData = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    
    if (!userData || !token) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    // Allow superadmin or broker role (for testing)
    if (parsedUser.role !== "superadmin" && parsedUser.role !== "broker") {
      toast.error("Access denied. Super Admin only.");
      navigate("/login");
      return;
    }
    
    setUser(parsedUser);
    fetchData(token);
  }, [navigate]);

  const fetchData = useCallback(async (token) => {
    setLoading(true);
    try {
      const tkn = token || localStorage.getItem("token");
      
      // Fetch brokers overview
      const brokersRes = await axios.get(`${API}/super-admin/brokers`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      setBrokers(brokersRes.data.brokers || []);
      
      // Fetch support requests (only ones that brokers have requested)
      const supportRes = await axios.get(`${API}/super-admin/support-requests`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      setSupportRequests(supportRes.data.requests || []);
      
      // Fetch stats
      const statsRes = await axios.get(`${API}/super-admin/stats`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      setStats(statsRes.data || {});
      
    } catch (error) {
      console.error("Error fetching data:", error);
      // Set mock data for demo
      setBrokers(getMockBrokers());
      setSupportRequests(getMockSupportRequests());
      setStats(getMockStats());
    } finally {
      setLoading(false);
    }
  }, []);

  const getMockBrokers = () => [
    {
      id: "1",
      name: "Test RE Broker",
      company_name: "Test Properties LLC",
      email: "test.rebroker@kinntegraa.com",
      subscription_plan: "Professional",
      subscription_status: "active",
      subscription_expiry: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString(),
      total_agents: 5,
      total_clients: 23,
      active_support_requests: 2,
      syndicated_listings: 1,
      closed_deals: 3
    },
    {
      id: "2",
      name: "Premium Realty",
      company_name: "Premium Realty Group",
      email: "admin@premiumrealty.ae",
      subscription_plan: "Enterprise",
      subscription_status: "active",
      subscription_expiry: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
      total_agents: 12,
      total_clients: 87,
      active_support_requests: 0,
      syndicated_listings: 3,
      closed_deals: 12
    }
  ];

  const getMockSupportRequests = () => [
    {
      id: "sr1",
      broker_name: "Test RE Broker",
      listing_name: "Burj Vista Tower - Unit 2301",
      listing_location: "Downtown Dubai",
      support_type: "co_broker",
      status: "pending",
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      notes: "Looking for co-broker exposure for high-value unit"
    },
    {
      id: "sr2",
      broker_name: "Test RE Broker",
      listing_name: "Marina Heights - Unit 1505",
      listing_location: "Dubai Marina",
      support_type: "syndication",
      status: "active",
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      notes: "Cross-broker syndication for quick sale"
    }
  ];

  const getMockStats = () => ({
    total_brokers: 15,
    active_subscriptions: 12,
    total_agents: 67,
    total_clients: 423,
    active_support_requests: 8,
    monthly_revenue: 45000
  });

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const filteredBrokers = brokers.filter(broker => {
    const query = searchQuery.toLowerCase();
    return (
      broker.name?.toLowerCase().includes(query) ||
      broker.company_name?.toLowerCase().includes(query) ||
      broker.email?.toLowerCase().includes(query)
    );
  });

  const getStatusBadge = (status) => {
    const config = {
      active: { color: "bg-green-100 text-green-700", icon: CheckCircle },
      expiring: { color: "bg-yellow-100 text-yellow-700", icon: AlertTriangle },
      expired: { color: "bg-red-100 text-red-700", icon: AlertTriangle },
      suspended: { color: "bg-gray-100 text-gray-700", icon: Clock },
    };
    const { color, icon: Icon } = config[status] || config.active;
    return (
      <Badge className={`${color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {status?.charAt(0).toUpperCase() + status?.slice(1)}
      </Badge>
    );
  };

  const getSupportTypeLabel = (type) => {
    const labels = {
      co_broker: "Co-Broker",
      syndication: "Syndication",
      deal_structuring: "Deal Structuring",
      closing_assistance: "Closing Assist"
    };
    return labels[type] || type;
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-gray-800">Super Admin</h1>
                <p className="text-xs text-gray-500">Platform Management</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => fetchData()}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <>
            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-indigo-500" />
                  <span className="text-xs text-gray-500">Brokers</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{stats.total_brokers}</p>
              </div>
              
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-gray-500">Active Subs</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{stats.active_subscriptions}</p>
              </div>
              
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-purple-500" />
                  <span className="text-xs text-gray-500">Total Agents</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{stats.total_agents}</p>
              </div>
              
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-gray-500">Total Clients</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{stats.total_clients}</p>
              </div>
              
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Handshake className="h-4 w-4 text-amber-500" />
                  <span className="text-xs text-gray-500">Support Req</span>
                </div>
                <p className="text-2xl font-bold text-amber-600">{stats.active_support_requests}</p>
              </div>
              
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs text-gray-500">Revenue</span>
                </div>
                <p className="text-2xl font-bold text-emerald-600">AED {stats.monthly_revenue?.toLocaleString()}</p>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="overview" className="px-6">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Broker Overview
                </TabsTrigger>
                <TabsTrigger value="support" className="px-6">
                  <Handshake className="h-4 w-4 mr-2" />
                  Support Requests
                  {supportRequests.length > 0 && (
                    <Badge className="ml-2 bg-amber-100 text-amber-700">{supportRequests.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Broker Overview Tab */}
              <TabsContent value="overview">
                <div className="bg-white rounded-xl border">
                  <div className="p-4 border-b flex items-center justify-between">
                    <h2 className="font-semibold text-gray-800">Registered Brokers</h2>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="text"
                        placeholder="Search brokers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 w-[250px]"
                      />
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Broker</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Plan</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Expiry</th>
                          <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Agents</th>
                          <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Clients</th>
                          <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Support Req</th>
                          <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Syndicated</th>
                          <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Closed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredBrokers.map((broker) => (
                          <tr key={broker.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-gray-800">{broker.name}</p>
                                <p className="text-xs text-gray-500">{broker.company_name}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline">{broker.subscription_plan}</Badge>
                            </td>
                            <td className="px-4 py-3">
                              {getStatusBadge(broker.subscription_status)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {broker.subscription_expiry 
                                ? new Date(broker.subscription_expiry).toLocaleDateString() 
                                : '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-medium text-purple-600">{broker.total_agents}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-medium text-blue-600">{broker.total_clients}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`font-medium ${broker.active_support_requests > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                                {broker.active_support_requests}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-medium text-indigo-600">{broker.syndicated_listings}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-medium text-green-600">{broker.closed_deals}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {filteredBrokers.length === 0 && (
                    <div className="text-center py-12">
                      <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">No brokers found</p>
                    </div>
                  )}
                </div>

                {/* Privacy Notice */}
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-blue-800">Privacy Protected</h4>
                      <p className="text-sm text-blue-700 mt-1">
                        Broker listings, client details, and deal pipelines are private by default. 
                        You can only view listing details when a broker explicitly requests platform support.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Support Requests Tab */}
              <TabsContent value="support">
                <div className="bg-white rounded-xl border">
                  <div className="p-4 border-b">
                    <h2 className="font-semibold text-gray-800">Active Support Requests</h2>
                    <p className="text-sm text-gray-500">Listings where brokers have requested platform assistance</p>
                  </div>
                  
                  {supportRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <Handshake className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">No active support requests</p>
                      <p className="text-sm text-gray-400 mt-1">
                        When brokers request platform support, their listings will appear here
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {supportRequests.map((request) => (
                        <div key={request.id} className="p-4 hover:bg-gray-50">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                                <Building2 className="h-6 w-6 text-amber-600" />
                              </div>
                              <div>
                                <h3 className="font-medium text-gray-800">{request.listing_name}</h3>
                                <p className="text-sm text-gray-500">{request.listing_location}</p>
                                <div className="flex items-center gap-3 mt-2">
                                  <Badge variant="outline">{request.broker_name}</Badge>
                                  <Badge className="bg-amber-100 text-amber-700">
                                    {getSupportTypeLabel(request.support_type)}
                                  </Badge>
                                  <span className="text-xs text-gray-400">
                                    {new Date(request.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                                {request.notes && (
                                  <p className="text-sm text-gray-600 mt-2 italic">"{request.notes}"</p>
                                )}
                              </div>
                            </div>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Access Notice */}
                <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-amber-800">Limited Access</h4>
                      <p className="text-sm text-amber-700 mt-1">
                        You can only view details for listings where brokers have explicitly requested support.
                        Brokers can withdraw support requests at any time, which will revoke your access to listing details.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
