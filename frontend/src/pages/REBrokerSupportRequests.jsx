import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Handshake, RefreshCw, Search, Building2, Eye, X, 
  CheckCircle, Clock, AlertCircle, XCircle
} from "lucide-react";
import REBrokerSidebar from "@/components/REBrokerSidebar";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function REBrokerSupportRequests() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [brokerProfile, setBrokerProfile] = useState(null);
  const [supportRequests, setSupportRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    document.title = "Kinntegraa | RE Broker - Support Requests";
    
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
    fetchBrokerProfile(token);
    fetchSupportRequests(token);
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

  const fetchSupportRequests = useCallback(async (token) => {
    setLoading(true);
    try {
      const tkn = token || localStorage.getItem("token");
      const response = await axios.get(`${API}/re-broker/support-requests`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      const data = response.data;
      setSupportRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching support requests:", error);
      setSupportRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleWithdrawRequest = async (requestId) => {
    if (!confirm("Are you sure you want to withdraw this support request? The listing will return to Private status.")) {
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/re-broker/support-requests/${requestId}/withdraw`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Support request withdrawn successfully");
      fetchSupportRequests(token);
    } catch (error) {
      console.error("Error withdrawing request:", error);
      toast.error("Failed to withdraw request");
    }
  };

  const filteredRequests = supportRequests.filter(req => {
    const query = searchQuery.toLowerCase();
    return (
      req.listing_name?.toLowerCase().includes(query) ||
      req.support_type?.toLowerCase().includes(query) ||
      req.status?.toLowerCase().includes(query)
    );
  });

  const getStatusBadge = (status) => {
    const config = {
      pending: { color: "bg-yellow-100 text-yellow-700", icon: Clock, label: "Pending" },
      active: { color: "bg-blue-100 text-blue-700", icon: CheckCircle, label: "Active" },
      syndicated: { color: "bg-purple-100 text-purple-700", icon: Handshake, label: "Syndicated" },
      closed: { color: "bg-green-100 text-green-700", icon: CheckCircle, label: "Closed" },
      withdrawn: { color: "bg-gray-100 text-gray-700", icon: XCircle, label: "Withdrawn" },
    };
    const { color, icon: Icon, label } = config[status] || config.pending;
    return (
      <Badge className={`${color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {label}
      </Badge>
    );
  };

  const getSupportTypeLabel = (type) => {
    const labels = {
      co_broker: "Co-Broker Exposure",
      syndication: "Cross-Broker Syndication",
      deal_structuring: "Deal Structuring",
      closing_assistance: "Closing Assistance"
    };
    return labels[type] || type;
  };

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
                <Handshake className="h-6 w-6 text-purple-600" />
                Support Requests
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Track platform support requests for your listings ({filteredRequests.length} total)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search requests..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[250px]"
                  data-testid="search-input"
                />
              </div>
              <Button variant="outline" onClick={() => fetchSupportRequests()} data-testid="refresh-btn">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* Status Legend */}
        <div className="bg-white border-b px-4 md:px-8 py-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-gray-500">Status Legend:</span>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              <span className="text-gray-600">Private</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
              <span className="text-gray-600">Support Requested</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span>
              <span className="text-gray-600">Actively Syndicated</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              <span className="text-gray-600">Closed</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-purple-600" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border">
              <Handshake className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No support requests yet</p>
              <p className="text-sm text-gray-400 mb-4">
                Request platform support from the Projects page to get help with deal closing
              </p>
              <Button 
                onClick={() => navigate('/re-broker/opportunities')}
                variant="outline"
              >
                <Building2 className="h-4 w-4 mr-2" />
                Go to Projects
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Listing</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Support Type</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Requested</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredRequests.map((request) => (
                      <tr key={request.id || request._id} className="hover:bg-gray-50" data-testid={`request-row-${request.id || request._id}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-800">{request.listing_name || 'Listing'}</p>
                              <p className="text-xs text-gray-500">{request.listing_location || '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-700">{getSupportTypeLabel(request.support_type)}</p>
                          {request.notes && (
                            <p className="text-xs text-gray-500 truncate max-w-[200px]">{request.notes}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {request.created_at 
                            ? new Date(request.created_at).toLocaleDateString() 
                            : '-'}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(request.status)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/re-broker/opportunities/${request.listing_id}`)}
                              data-testid={`view-listing-${request.id || request._id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {request.status !== 'withdrawn' && request.status !== 'closed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleWithdrawRequest(request.id || request._id)}
                                data-testid={`withdraw-${request.id || request._id}`}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Withdraw
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Info Card */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-800">About Platform Support</h4>
                <p className="text-sm text-blue-700 mt-1">
                  When you request platform support, Super Admin gains limited visibility to help with deal closing. 
                  Your other listings and client details remain private. You can withdraw the request at any time 
                  to return the listing to private status.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
