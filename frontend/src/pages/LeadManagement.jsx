import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  Search, Users, MapPin, Calendar, Eye, 
  CheckCircle, XCircle, Clock, MoreVertical, TrendingUp, Building2,
  RefreshCw, Filter
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_CONFIG = {
  open: { label: "Open", color: "bg-blue-100 text-blue-800", icon: Clock },
  closed: { label: "Closed", color: "bg-green-100 text-green-800", icon: CheckCircle },
  not_interested: { label: "Not Interested", color: "bg-gray-100 text-gray-800", icon: XCircle },
};

export default function LeadManagement() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    document.title = "Kinntegraa | Lead Management";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (!["broker", "sub_broker"].includes(parsedUser.role)) {
      navigate("/client/opportunities");
      return;
    }
    
    setUser(parsedUser);
    fetchLeads();
  }, [navigate]);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/leads`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLeads(response.data || []);
    } catch (error) {
      console.error("Error fetching leads:", error);
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (leadId, newStatus) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/leads/${leadId}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Lead marked as ${newStatus.replace('_', ' ')}`);
      fetchLeads();
    } catch (error) {
      console.error("Error updating lead:", error);
      toast.error("Failed to update lead status");
    }
  };

  const filteredLeads = leads.filter(lead => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!lead.client_name?.toLowerCase().includes(query) &&
          !lead.product_name?.toLowerCase().includes(query) &&
          !lead.client_pan?.toLowerCase().includes(query)) {
        return false;
      }
    }
    
    // Status filter
    if (statusFilter !== "all" && lead.status !== statusFilter) {
      return false;
    }
    
    // Type filter
    if (typeFilter !== "all" && lead.opportunity_type !== typeFilter) {
      return false;
    }
    
    return true;
  });

  const openLeads = filteredLeads.filter(l => l.status === "open");
  const closedLeads = filteredLeads.filter(l => l.status === "closed");

  const getSidebar = () => {
    if (user?.role === "broker") return <Sidebar user={user} />;
    return <SubBrokerSidebar user={user} />;
  };

  const getStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || { label: status, color: "bg-gray-100 text-gray-800", icon: Clock };
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    );
  };

  const formatCurrency = (amount) => {
    if (!amount) return "-";
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {getSidebar()}
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800" data-testid="lead-management-title">Lead Management</h1>
                <p className="text-sm text-gray-500">Track client interest and manage leads</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={fetchLeads}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
          
          {/* Stats Bar */}
          <div className="px-6 py-3 border-t bg-gray-50 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Total:</span>
              <span className="font-semibold text-gray-800">{filteredLeads.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span className="text-sm text-gray-500">Open:</span>
              <span className="font-semibold text-blue-600">{openLeads.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-sm text-gray-500">Closed:</span>
              <span className="font-semibold text-green-600">{closedLeads.length}</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 bg-white border-b">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by client name, product, or PAN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="lead-search-input"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="status-filter">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="not_interested">Not Interested</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40" data-testid="type-filter">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="bond">Bonds</SelectItem>
                <SelectItem value="real_estate">Real Estate</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Client</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Product</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Interest</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase w-12">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                          <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                          <p className="font-medium">No leads found</p>
                          <p className="text-sm mt-1">Leads will appear here when clients express interest in opportunities</p>
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead) => (
                        <tr key={lead.id} className="hover:bg-gray-50" data-testid={`lead-row-${lead.id}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800">{lead.client_name}</div>
                            <div className="text-xs text-gray-500">{lead.client_pan}</div>
                            {lead.client_city && (
                              <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                                <MapPin className="h-3 w-3" />
                                {lead.client_city}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                lead.opportunity_type === 'bond' ? 'bg-amber-100' : 'bg-teal-100'
                              }`}>
                                {lead.opportunity_type === 'bond' ? (
                                  <TrendingUp className="h-4 w-4 text-amber-600" />
                                ) : (
                                  <Building2 className="h-4 w-4 text-teal-600" />
                                )}
                              </div>
                              <div>
                                <div className="font-medium text-gray-800 text-sm">{lead.product_name}</div>
                                <div className="text-xs text-gray-500">
                                  {lead.opportunity_type === 'bond' ? 'Bond' : 'Real Estate'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {lead.investment_amount ? (
                              <div>
                                <div className="font-mono font-semibold text-gray-800">
                                  {formatCurrency(lead.investment_amount)}
                                </div>
                                <div className="text-xs text-gray-500">Amount</div>
                              </div>
                            ) : lead.interest_percentage ? (
                              <div>
                                <div className="font-mono font-semibold text-gray-800">
                                  {lead.interest_percentage}%
                                </div>
                                <div className="text-xs text-gray-500">Share</div>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-600">
                              {lead.created_at ? format(new Date(lead.created_at), "dd MMM yyyy") : "-"}
                            </div>
                            <div className="text-xs text-gray-400">
                              {lead.created_at ? format(new Date(lead.created_at), "HH:mm") : ""}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getStatusBadge(lead.status)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`lead-actions-${lead.id}`}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => navigate(
                                    lead.opportunity_type === 'bond' 
                                      ? `/bonds/${lead.opportunity_id}`
                                      : `/${user?.role === 'broker' ? 'broker' : 'sub-broker'}/real-estate/${lead.opportunity_id}`
                                  )}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Opportunity
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {lead.status !== 'open' && (
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(lead.id, 'open')}>
                                    <Clock className="h-4 w-4 mr-2 text-blue-600" />
                                    Mark as Open
                                  </DropdownMenuItem>
                                )}
                                {lead.status !== 'closed' && (
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(lead.id, 'closed')}>
                                    <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                                    Mark as Closed
                                  </DropdownMenuItem>
                                )}
                                {lead.status !== 'not_interested' && (
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(lead.id, 'not_interested')}>
                                    <XCircle className="h-4 w-4 mr-2 text-gray-600" />
                                    Mark as Not Interested
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
