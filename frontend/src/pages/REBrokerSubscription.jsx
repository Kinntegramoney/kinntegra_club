import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  CreditCard, RefreshCw, Users, UserCheck, Building2, 
  CheckCircle, AlertTriangle, Clock, Zap
} from "lucide-react";
import REBrokerSidebar from "@/components/REBrokerSidebar";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function REBrokerSubscription() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [brokerProfile, setBrokerProfile] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Kinntegraa | RE Broker - Subscription";
    
    const userData = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    
    if (!userData || !token) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "re_broker") {
      navigate("/login");
      return;
    }
    
    setUser(parsedUser);
    fetchData(token);
  }, [navigate]);

  const fetchData = async (token) => {
    setLoading(true);
    try {
      const tkn = token || localStorage.getItem("token");
      
      // Fetch broker profile
      const profileRes = await axios.get(`${API}/re-broker/profile`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      setBrokerProfile(profileRes.data);
      
      // Fetch subscription details
      const subRes = await axios.get(`${API}/re-broker/subscription`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      setSubscription(subRes.data.subscription || getDefaultSubscription());
      setUsage(subRes.data.usage || getDefaultUsage());
    } catch (error) {
      console.error("Error fetching data:", error);
      // Set defaults on error
      setSubscription(getDefaultSubscription());
      setUsage(getDefaultUsage());
    } finally {
      setLoading(false);
    }
  };

  const getDefaultSubscription = () => ({
    plan: "Professional",
    status: "active",
    start_date: new Date().toISOString(),
    expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    limits: {
      agents: 10,
      clients: 100,
      listings: 50,
      syndication: true
    }
  });

  const getDefaultUsage = () => ({
    agents: 0,
    clients: 0,
    listings: 0,
    support_requests: 0
  });

  const getStatusBadge = (status) => {
    const config = {
      active: { color: "bg-green-100 text-green-700", icon: CheckCircle, label: "Active" },
      expiring: { color: "bg-yellow-100 text-yellow-700", icon: AlertTriangle, label: "Expiring Soon" },
      expired: { color: "bg-red-100 text-red-700", icon: AlertTriangle, label: "Expired" },
      suspended: { color: "bg-gray-100 text-gray-700", icon: Clock, label: "Suspended" },
    };
    const { color, icon: Icon, label } = config[status] || config.active;
    return (
      <Badge className={`${color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {label}
      </Badge>
    );
  };

  const calculateUsagePercent = (used, limit) => {
    if (!limit || limit === 0) return 0;
    return Math.min(Math.round((used / limit) * 100), 100);
  };

  const getUsageColor = (percent) => {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 70) return "bg-yellow-500";
    return "bg-green-500";
  };

  const daysUntilExpiry = subscription ? 
    Math.ceil((new Date(subscription.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)) : 0;

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <REBrokerSidebar user={user} brokerProfile={brokerProfile} />
      
      <div className="flex-1 md:ml-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="ml-12 md:ml-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
                <CreditCard className="h-6 w-6 text-indigo-600" />
                Subscription
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage your subscription plan and usage
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => fetchData()} data-testid="refresh-btn">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700">
                <Zap className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Current Plan Card */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">Current Plan</h2>
                    <p className="text-sm text-gray-500">Your subscription details</p>
                  </div>
                  {getStatusBadge(subscription?.status)}
                </div>
                
                <div className="grid md:grid-cols-3 gap-6">
                  {/* Plan Details */}
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4">
                    <p className="text-sm text-gray-500 mb-1">Plan</p>
                    <p className="text-2xl font-bold text-indigo-700">{subscription?.plan || 'Professional'}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      Started: {subscription?.start_date ? new Date(subscription.start_date).toLocaleDateString() : '-'}
                    </p>
                  </div>
                  
                  {/* Expiry */}
                  <div className={`rounded-lg p-4 ${daysUntilExpiry <= 30 ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                    <p className="text-sm text-gray-500 mb-1">Expires On</p>
                    <p className="text-2xl font-bold text-gray-800">
                      {subscription?.expiry_date ? new Date(subscription.expiry_date).toLocaleDateString() : '-'}
                    </p>
                    <p className={`text-xs mt-2 ${daysUntilExpiry <= 30 ? 'text-yellow-600' : 'text-gray-500'}`}>
                      {daysUntilExpiry > 0 ? `${daysUntilExpiry} days remaining` : 'Expired'}
                    </p>
                  </div>
                  
                  {/* Syndication Access */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-500 mb-1">Syndication Access</p>
                    <p className="text-2xl font-bold text-gray-800">
                      {subscription?.limits?.syndication ? 'Enabled' : 'Disabled'}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      Request platform support for listings
                    </p>
                  </div>
                </div>
              </div>

              {/* Usage Stats */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-6">Usage</h2>
                
                <div className="grid md:grid-cols-3 gap-6">
                  {/* Agents */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-purple-600" />
                        <span className="font-medium text-gray-700">Agents</span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {usage?.agents || 0} / {subscription?.limits?.agents || 10}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${getUsageColor(calculateUsagePercent(usage?.agents, subscription?.limits?.agents))} transition-all`}
                        style={{ width: `${calculateUsagePercent(usage?.agents, subscription?.limits?.agents)}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Clients */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-5 w-5 text-blue-600" />
                        <span className="font-medium text-gray-700">Clients</span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {usage?.clients || 0} / {subscription?.limits?.clients || 100}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${getUsageColor(calculateUsagePercent(usage?.clients, subscription?.limits?.clients))} transition-all`}
                        style={{ width: `${calculateUsagePercent(usage?.clients, subscription?.limits?.clients)}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Listings */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-teal-600" />
                        <span className="font-medium text-gray-700">Listings</span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {usage?.listings || 0} / {subscription?.limits?.listings || 50}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${getUsageColor(calculateUsagePercent(usage?.listings, subscription?.limits?.listings))} transition-all`}
                        style={{ width: `${calculateUsagePercent(usage?.listings, subscription?.limits?.listings)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Plan Features */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Plan Features</h2>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-gray-700">Project Management</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-gray-700">Agent Management</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-gray-700">Client Management</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-gray-700">Bulk Upload</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-gray-700">Holdings Tracking</span>
                  </div>
                  <div className={`flex items-center gap-3 p-3 rounded-lg ${subscription?.limits?.syndication ? 'bg-green-50' : 'bg-gray-50'}`}>
                    {subscription?.limits?.syndication ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-gray-400" />
                    )}
                    <span className={subscription?.limits?.syndication ? 'text-gray-700' : 'text-gray-400'}>
                      Platform Support & Syndication
                    </span>
                  </div>
                </div>
              </div>

              {/* Contact Support */}
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Need to upgrade or have questions?</h3>
                    <p className="text-indigo-100 mt-1">Contact our team for custom enterprise plans</p>
                  </div>
                  <Button variant="secondary" className="bg-white text-indigo-600 hover:bg-indigo-50">
                    Contact Sales
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
