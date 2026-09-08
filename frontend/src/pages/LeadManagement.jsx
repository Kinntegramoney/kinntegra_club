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
  Search, Users, MapPin, MoreVertical, TrendingUp, Building2,
  RefreshCw, CheckCircle, XCircle, Clock
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  
  // Leads/Client Interest data
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsFilter, setLeadsFilter] = useState("all");
  const [leadsStatusFilter, setLeadsStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    document.title = "Kinntegraa | Client Interest";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchLeads();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchLeads();
    }
  }, [leadsFilter, leadsStatusFilter]);

  const fetchLeads = async () => {
    setLeadsLoading(true);
    try {
      const token = localStorage.getItem("token");
      let params = [];
      if (leadsFilter !== "all") params.push(`opportunity_type=${leadsFilter}`);
      if (leadsStatusFilter !== "all") params.push(`status=${leadsStatusFilter}`);
      const queryString = params.length > 0 ? `?${params.join('&')}` : "";
      
      const response = await axios.get(`${API}/leads${queryString}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLeads(response.data);
    } catch (error) {
      console.error("Error fetching leads:", error);
    } finally {
      setLeadsLoading(false);
    }
  };

  const updateLeadStatus = async (leadId, newStatus) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/leads/${leadId}/status`, 
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success(`Lead marked as ${newStatus.replace('_', ' ')}`);
      fetchLeads();
    } catch (error) {
      console.error("Error updating lead:", error);
      toast.error("Failed to update lead status");
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      return format(new Date(dateStr), "MMM dd, yyyy");
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
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

  const filteredLeads = leads.filter(lead => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!lead.client_name?.toLowerCase().includes(query) &&
          !lead.product_name?.toLowerCase().includes(query) &&
          !lead.client_pan?.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  });

  if (!user) return null;

  const SidebarComponent = user.role === "broker" ? Sidebar : SubBrokerSidebar;
  const openLeadsCount = leads.filter(l => l.status === 'open').length;

  return (
    <div className="min-h-screen bg-gray-50 flex" data-testid="lead-management-page">
      <SidebarComponent user={user} />

      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800" data-testid="lead-management-title">Client Interest</h1>
                <p className="text-sm text-gray-500">Track and manage client interest in opportunities</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchLeads}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Stats Bar */}
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Total:</span>
                <span className="font-semibold text-gray-800">{filteredLeads.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span className="text-sm text-gray-500">Open:</span>
                <span className="font-semibold text-blue-600">{filteredLeads.filter(l => l.status === 'open').length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-sm text-gray-500">Closed:</span>
                <span className="font-semibold text-green-600">{filteredLeads.filter(l => l.status === 'closed').length}</span>
              </div>
            </div>

            {/* Filters */}
            <div className="px-4 py-3 border-b">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by client name, product, or PAN..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9"
                    data-testid="lead-search-input"
                  />
                </div>
                
                <Select value={leadsStatusFilter} onValueChange={setLeadsStatusFilter}>
                  <SelectTrigger className="w-36 h-9" data-testid="status-filter">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="not_interested">Not Interested</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={leadsFilter} onValueChange={setLeadsFilter}>
                  <SelectTrigger className="w-36 h-9" data-testid="type-filter">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="bond">NCD</SelectItem>
                    <SelectItem value="real_estate">Real Estate</SelectItem>
                    <SelectItem value="general">Website Signup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Leads Table */}
            <div className="overflow-x-auto">
              {leadsLoading ? (
                <div className="text-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                  <p className="text-gray-500">Loading leads...</p>
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-gray-600 mb-1">No Leads Found</h3>
                  <p className="text-gray-400 text-sm">Client interest will appear here when they express interest</p>
                </div>
              ) : (
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
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-gray-50" data-testid={`lead-row-${lead.id}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800">{lead.client_name}</div>
                          {lead.client_pan ? (
                            <div className="text-xs text-gray-500">PAN: {lead.client_pan}</div>
                          ) : (
                            <>
                              {lead.client_email && (
                                <div className="text-xs text-gray-500">{lead.client_email}</div>
                              )}
                              {lead.client_mobile && (
                                <div className="text-xs text-gray-500">{lead.client_mobile}</div>
                              )}
                            </>
                          )}
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
                              lead.opportunity_type === 'bond' ? 'bg-amber-100' : 
                              lead.opportunity_type === 'general' ? 'bg-blue-100' : 'bg-teal-100'
                            }`}>
                              {lead.opportunity_type === 'bond' ? (
                                <TrendingUp className="h-4 w-4 text-amber-600" />
                              ) : lead.opportunity_type === 'general' ? (
                                <Users className="h-4 w-4 text-blue-600" />
                              ) : (
                                <Building2 className="h-4 w-4 text-teal-600" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium text-gray-800 text-sm">{lead.product_name}</div>
                              <div className="text-xs text-gray-500 capitalize">
                                {lead.opportunity_type === 'general' ? 'Website Signup' : lead.opportunity_type?.replace('_', ' ')}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {lead.opportunity_type === 'general' ? (
                            <span className="text-gray-500 text-sm">-</span>
                          ) : (
                            <span className="font-mono font-semibold text-gray-800">
                              ₹{formatCurrency(lead.interest_amount)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDate(lead.created_at)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {getStatusBadge(lead.status)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {lead.status !== 'closed' && (
                                <DropdownMenuItem onClick={() => updateLeadStatus(lead.id, 'closed')}>
                                  <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                                  Mark as Closed
                                </DropdownMenuItem>
                              )}
                              {lead.status !== 'open' && (
                                <DropdownMenuItem onClick={() => updateLeadStatus(lead.id, 'open')}>
                                  <Clock className="h-4 w-4 mr-2 text-blue-600" />
                                  Reopen
                                </DropdownMenuItem>
                              )}
                              {lead.status !== 'not_interested' && (
                                <DropdownMenuItem onClick={() => updateLeadStatus(lead.id, 'not_interested')}>
                                  <XCircle className="h-4 w-4 mr-2 text-gray-600" />
                                  Mark Not Interested
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
