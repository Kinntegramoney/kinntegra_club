import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import Sidebar from "@/components/Sidebar";
import ClientSidebar from "@/components/ClientSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  Search, Users, MapPin, User,
  CheckCircle, XCircle, Clock, MoreVertical, TrendingUp, Building2,
  RefreshCw, FileText, ChevronDown, ChevronUp
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_CONFIG = {
  open: { label: "Open", color: "bg-blue-100 text-blue-800", icon: Clock },
  closed: { label: "Closed", color: "bg-green-100 text-green-800", icon: CheckCircle },
  not_interested: { label: "Not Interested", color: "bg-gray-100 text-gray-800", icon: XCircle },
  pending: { label: "Pending", color: "bg-etihad-gold-100 text-etihad-gold-800", icon: Clock },
  approved: { label: "Approved", color: "bg-green-100 text-green-800", icon: CheckCircle },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800", icon: XCircle },
};

export default function LeadManagement() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState("approvals");
  const [pendingSubTab, setPendingSubTab] = useState("clients");
  
  // Pending approvals data
  const [pendingClients, setPendingClients] = useState([]);
  const [pendingReinvestments, setPendingReinvestments] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  
  // Sub-broker's own submissions
  const [mySubmissions, setMySubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  
  // Leads data
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsFilter, setLeadsFilter] = useState("all");
  const [leadsStatusFilter, setLeadsStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // UI state
  const [expandedItems, setExpandedItems] = useState({});
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemType, setItemType] = useState(null);
  const [approvalAction, setApprovalAction] = useState(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [sendClientEmail, setSendClientEmail] = useState(true);
  const [processingId, setProcessingId] = useState(null);

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
    setUser(parsedUser);
    
    if (parsedUser.role === 'broker') {
      fetchPendingApprovals();
    } else if (parsedUser.role === 'sub_broker') {
      fetchMySubmissions();
      setActiveTab("mysubmissions"); // Default to My Submissions for sub-brokers
    }
    fetchLeads();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchLeads();
    }
  }, [leadsFilter, leadsStatusFilter]);

  const fetchMySubmissions = async () => {
    setSubmissionsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/approval-workflow/my-submissions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMySubmissions(response.data || []);
    } catch (error) {
      console.error("Error fetching submissions:", error);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const fetchPendingApprovals = async () => {
    setPendingLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/approval-workflow/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPendingClients(response.data.pending_clients || []);
      setPendingReinvestments(response.data.pending_reinvestments || []);
    } catch (error) {
      console.error("Error fetching pending approvals:", error);
      toast.error("Failed to load pending approvals");
    } finally {
      setPendingLoading(false);
    }
  };

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

  const toggleExpand = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const openApprovalModal = (item, type, action) => {
    setSelectedItem(item);
    setItemType(type);
    setApprovalAction(action);
    setApprovalNotes("");
    setSendClientEmail(true);
    setShowApprovalModal(true);
  };

  const handleApprovalSubmit = async () => {
    if (!selectedItem || !approvalAction) return;
    
    setProcessingId(selectedItem.id);
    try {
      const token = localStorage.getItem("token");
      const endpoint = itemType === 'client' 
        ? `${API}/approval-workflow/client/${selectedItem.id}/${approvalAction}`
        : `${API}/approval-workflow/reinvestment/${selectedItem.id}/${approvalAction}`;
      
      await axios.post(endpoint, {
        notes: approvalNotes,
        send_email: sendClientEmail
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(`${itemType === 'client' ? 'Client' : 'Reinvestment'} ${approvalAction === 'approve' ? 'approved' : 'rejected'} successfully`);
      setShowApprovalModal(false);
      fetchPendingApprovals();
    } catch (error) {
      toast.error(error.response?.data?.detail || `Failed to ${approvalAction}`);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      return format(new Date(dateStr), "MMM dd, yyyy HH:mm");
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

  const SidebarComponent = user.role === "broker" ? Sidebar : 
                          user.role === "sub_broker" ? SubBrokerSidebar : 
                          ClientSidebar;
  
  const isBroker = user.role === 'broker';
  const isSubBroker = user.role === 'sub_broker';
  const pendingCount = pendingClients.length + pendingReinvestments.length;
  const openLeadsCount = leads.filter(l => l.status === 'open').length;
  const pendingSubmissionsCount = mySubmissions.filter(s => s.status === 'pending_broker').length;

  return (
    <div className="min-h-screen bg-gray-50 flex" data-testid="lead-management-page">
      <SidebarComponent user={user} />

      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800" data-testid="lead-management-title">Lead Management</h1>
                <p className="text-sm text-gray-500">Manage approvals and track client interest</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { 
                  if (isBroker) fetchPendingApprovals(); 
                  if (isSubBroker) fetchMySubmissions();
                  fetchLeads();
                }}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
          
          {/* Tab Navigation */}
          <div className="px-6 pb-0 flex gap-1">
            {isBroker && (
              <button
                onClick={() => setActiveTab("approvals")}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  activeTab === "approvals"
                    ? "bg-etihad-gold-50 text-etihad-gold-700 border-etihad-gold-500"
                    : "text-gray-600 border-transparent hover:bg-gray-100"
                }`}
                data-testid="tab-approvals"
              >
                Reinvestment Approval
                {pendingReinvestments.length > 0 && (
                  <Badge className="ml-2 bg-red-500 text-white text-xs">{pendingReinvestments.length}</Badge>
                )}
              </button>
            )}
            {isSubBroker && (
              <button
                onClick={() => setActiveTab("mysubmissions")}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  activeTab === "mysubmissions"
                    ? "bg-blue-50 text-blue-700 border-blue-500"
                    : "text-gray-600 border-transparent hover:bg-gray-100"
                }`}
                data-testid="tab-mysubmissions"
              >
                My Reinvestments
                {pendingSubmissionsCount > 0 && (
                  <Badge className="ml-2 bg-blue-500 text-white text-xs">{pendingSubmissionsCount}</Badge>
                )}
              </button>
            )}
            <button
              onClick={() => setActiveTab("leads")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === "leads"
                  ? "bg-green-50 text-green-700 border-green-500"
                  : "text-gray-600 border-transparent hover:bg-gray-100"
              }`}
              data-testid="tab-leads"
            >
              Client Interest
              {openLeadsCount > 0 && (
                <Badge className="ml-2 bg-green-500 text-white text-xs">{openLeadsCount}</Badge>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Reinvestment Approval Tab */}
          {activeTab === "approvals" && isBroker && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Sub-tabs */}
              <div className="border-b border-gray-100 px-4 py-3 bg-gray-50">
                <div className="flex gap-2">
                  <button
                    onClick={() => setPendingSubTab("clients")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                      pendingSubTab === "clients" 
                        ? "bg-white text-etihad-gold-700 shadow-sm" 
                        : "text-gray-600 hover:bg-white"
                    }`}
                    data-testid="subtab-clients"
                  >
                    <User className="h-4 w-4" />
                    Clients
                    {pendingClients.length > 0 && (
                      <span className="bg-etihad-gold-100 text-etihad-gold-700 text-xs px-1.5 py-0.5 rounded">{pendingClients.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setPendingSubTab("reinvestments")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                      pendingSubTab === "reinvestments" 
                        ? "bg-white text-blue-700 shadow-sm" 
                        : "text-gray-600 hover:bg-white"
                    }`}
                    data-testid="subtab-reinvestments"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reinvestments
                    {pendingReinvestments.length > 0 && (
                      <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded">{pendingReinvestments.length}</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Pending Content */}
              <div className="p-4">
                {pendingLoading ? (
                  <div className="text-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600 mx-auto mb-3" />
                    <p className="text-gray-500">Loading...</p>
                  </div>
                ) : pendingSubTab === "clients" ? (
                  pendingClients.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-3" />
                      <h3 className="text-lg font-medium text-gray-600 mb-1">All Caught Up!</h3>
                      <p className="text-gray-400 text-sm">No pending client approvals</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pendingClients.map((client) => (
                        <div key={client.id} className="border border-gray-200 rounded-lg overflow-hidden" data-testid={`pending-client-${client.id}`}>
                          <div 
                            className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                            onClick={() => toggleExpand(client.id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-etihad-gold-100 flex items-center justify-center">
                                <User className="h-4 w-4 text-etihad-gold-600" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-800 text-sm">{client.name}</p>
                                <p className="text-xs text-gray-500">PAN: {client.pan_number}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 text-xs bg-etihad-gold-100 text-etihad-gold-700 rounded">Pending</span>
                              {expandedItems[client.id] ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                            </div>
                          </div>
                          
                          {expandedItems[client.id] && (
                            <div className="p-3 border-t bg-white">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
                                <div><p className="text-xs text-gray-500">Email</p><p className="font-medium">{client.email || "-"}</p></div>
                                <div><p className="text-xs text-gray-500">Phone</p><p className="font-medium">{client.phone || "-"}</p></div>
                                <div><p className="text-xs text-gray-500">Created By</p><p className="font-medium">{client.created_by_name || "Self"}</p></div>
                                <div><p className="text-xs text-gray-500">Created On</p><p className="font-medium">{formatDate(client.created_at)}</p></div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => openApprovalModal(client, 'client', 'reject')}>
                                  <XCircle className="h-4 w-4 mr-1" /> Reject
                                </Button>
                                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => openApprovalModal(client, 'client', 'approve')}>
                                  <CheckCircle className="h-4 w-4 mr-1" /> Approve
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  pendingReinvestments.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-3" />
                      <h3 className="text-lg font-medium text-gray-600 mb-1">All Caught Up!</h3>
                      <p className="text-gray-400 text-sm">No pending reinvestment approvals</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pendingReinvestments.map((reinv) => (
                        <div key={reinv.id} className="border border-gray-200 rounded-lg overflow-hidden" data-testid={`pending-reinv-${reinv.id}`}>
                          <div 
                            className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                            onClick={() => toggleExpand(`reinv-${reinv.id}`)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                                <RefreshCw className="h-4 w-4 text-blue-600" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-800 text-sm">{reinv.client_name}</p>
                                <p className="text-xs text-gray-500">{reinv.bond_name || reinv.product_name}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded capitalize">{reinv.reinvestment_tag || "Pending"}</span>
                              {expandedItems[`reinv-${reinv.id}`] ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                            </div>
                          </div>
                          
                          {expandedItems[`reinv-${reinv.id}`] && (
                            <div className="p-3 border-t bg-white">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
                                <div><p className="text-xs text-gray-500">Amount</p><p className="font-medium font-mono">₹{formatCurrency(reinv.amount)}</p></div>
                                <div><p className="text-xs text-gray-500">Tag</p><p className="font-medium capitalize">{reinv.reinvestment_tag || "-"}</p></div>
                                <div><p className="text-xs text-gray-500">Tagged By</p><p className="font-medium">{reinv.created_by_name || "-"}</p></div>
                                <div><p className="text-xs text-gray-500">Tagged On</p><p className="font-medium">{formatDate(reinv.created_at)}</p></div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => openApprovalModal(reinv, 'reinvestment', 'reject')}>
                                  <XCircle className="h-4 w-4 mr-1" /> Reject
                                </Button>
                                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => openApprovalModal(reinv, 'reinvestment', 'approve')}>
                                  <CheckCircle className="h-4 w-4 mr-1" /> Approve
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* My Reinvestments Tab (Sub-broker only) */}
          {activeTab === "mysubmissions" && isSubBroker && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Stats Bar */}
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Total:</span>
                  <span className="font-semibold text-gray-800">{mySubmissions.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-etihad-gold-500"></span>
                  <span className="text-sm text-gray-500">Pending:</span>
                  <span className="font-semibold text-etihad-gold-600">{mySubmissions.filter(s => s.status === 'pending_broker').length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="text-sm text-gray-500">Approved:</span>
                  <span className="font-semibold text-green-600">{mySubmissions.filter(s => s.status === 'approved' || s.status === 'completed').length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-sm text-gray-500">Rejected:</span>
                  <span className="font-semibold text-red-600">{mySubmissions.filter(s => s.status === 'rejected').length}</span>
                </div>
              </div>

              {/* Submissions List */}
              <div className="p-4">
                {submissionsLoading ? (
                  <div className="text-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                    <p className="text-gray-500">Loading submissions...</p>
                  </div>
                ) : mySubmissions.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-gray-600 mb-1">No Reinvestment Submissions</h3>
                    <p className="text-gray-400 text-sm">Your reinvestment submissions will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mySubmissions.map((submission) => {
                      const statusConfig = {
                        pending_broker: { label: "Pending Approval", color: "bg-etihad-gold-100 text-etihad-gold-800", icon: Clock },
                        pending_client: { label: "Awaiting Client", color: "bg-blue-100 text-blue-800", icon: Clock },
                        approved: { label: "Approved", color: "bg-green-100 text-green-800", icon: CheckCircle },
                        completed: { label: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle },
                        rejected: { label: "Rejected", color: "bg-red-100 text-red-800", icon: XCircle },
                      };
                      const config = statusConfig[submission.status] || statusConfig.pending_broker;
                      const StatusIcon = config.icon;
                      
                      return (
                        <div key={submission.id} className="border border-gray-200 rounded-lg overflow-hidden" data-testid={`submission-${submission.id}`}>
                          <div 
                            className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                            onClick={() => toggleExpand(`sub-${submission.id}`)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                                <RefreshCw className="h-4 w-4 text-blue-600" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-800 text-sm">{submission.client_name}</p>
                                <p className="text-xs text-gray-500">₹{formatCurrency(submission.amount)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                                <StatusIcon className="h-3 w-3" />
                                {config.label}
                              </span>
                              {expandedItems[`sub-${submission.id}`] ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                            </div>
                          </div>
                          
                          {expandedItems[`sub-${submission.id}`] && (
                            <div className="p-3 border-t bg-white">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
                                <div><p className="text-xs text-gray-500">Cashflow ID</p><p className="font-medium font-mono text-xs">{submission.cashflow_id?.slice(0, 8) || '-'}...</p></div>
                                <div><p className="text-xs text-gray-500">Tag</p><p className="font-medium capitalize">{submission.reinvestment_tag || '-'}</p></div>
                                <div><p className="text-xs text-gray-500">Submitted</p><p className="font-medium">{formatDate(submission.created_at)}</p></div>
                                <div><p className="text-xs text-gray-500">Updated</p><p className="font-medium">{formatDate(submission.updated_at || submission.created_at)}</p></div>
                              </div>
                              {submission.broker_notes && (
                                <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                                  <p className="text-xs text-gray-500 mb-1">Broker Notes:</p>
                                  <p className="text-gray-700">{submission.broker_notes}</p>
                                </div>
                              )}
                              {submission.rejection_reason && (
                                <div className="mt-2 p-2 bg-red-50 rounded text-sm">
                                  <p className="text-xs text-red-500 mb-1">Rejection Reason:</p>
                                  <p className="text-red-700">{submission.rejection_reason}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Client Interest Tab */}
          {activeTab === "leads" && (
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
                      <SelectItem value="bond">Bonds</SelectItem>
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
                    <RefreshCw className="h-8 w-8 animate-spin text-green-600 mx-auto mb-3" />
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
                                lead.opportunity_type === 'bond' ? 'bg-etihad-gold-100' : 
                                lead.opportunity_type === 'general' ? 'bg-blue-100' : 'bg-teal-100'
                              }`}>
                                {lead.opportunity_type === 'bond' ? (
                                  <TrendingUp className="h-4 w-4 text-etihad-gold-600" />
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
                            <div className="font-mono font-semibold text-gray-800">
                              ₹{formatCurrency(lead.investment_amount)}
                            </div>
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
                                {lead.status === 'open' && (
                                  <>
                                    <DropdownMenuItem onClick={() => updateLeadStatus(lead.id, 'closed')}>
                                      <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                                      Mark as Closed
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => updateLeadStatus(lead.id, 'not_interested')}>
                                      <XCircle className="h-4 w-4 mr-2 text-gray-600" />
                                      Not Interested
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {lead.status !== 'open' && (
                                  <DropdownMenuItem onClick={() => updateLeadStatus(lead.id, 'open')}>
                                    <Clock className="h-4 w-4 mr-2 text-blue-600" />
                                    Reopen Lead
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
          )}
        </div>
      </div>

      {/* Approval Modal */}
      <Dialog open={showApprovalModal} onOpenChange={setShowApprovalModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approvalAction === 'approve' ? 'Approve' : 'Reject'} {itemType === 'client' ? 'Client' : 'Reinvestment'}
            </DialogTitle>
            <DialogDescription>
              {approvalAction === 'approve' 
                ? `Are you sure you want to approve this ${itemType}?`
                : `Are you sure you want to reject this ${itemType}?`
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  itemType === 'client' ? 'bg-etihad-gold-100' : 'bg-blue-100'
                }`}>
                  {itemType === 'client' ? (
                    <User className="h-5 w-5 text-etihad-gold-600" />
                  ) : (
                    <RefreshCw className="h-5 w-5 text-blue-600" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-800">
                    {selectedItem?.name || selectedItem?.client_name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {selectedItem?.pan_number || selectedItem?.bond_name || selectedItem?.product_name}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Notes (optional)</label>
              <Textarea
                placeholder="Add any notes about this decision..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="send-email"
                checked={sendClientEmail}
                onCheckedChange={setSendClientEmail}
              />
              <label htmlFor="send-email" className="text-sm text-gray-600">
                Send notification email
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprovalModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApprovalSubmit}
              disabled={processingId === selectedItem?.id}
              className={approvalAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {processingId === selectedItem?.id ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : approvalAction === 'approve' ? (
                <CheckCircle className="h-4 w-4 mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              {approvalAction === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
