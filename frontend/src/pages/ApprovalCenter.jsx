import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import ClientSidebar from "@/components/ClientSidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  RefreshCw, CheckCircle, XCircle, Clock, Send, 
  User, Users, FileText, Filter, ChevronDown, ChevronUp,
  AlertCircle, ArrowRight, Building2, Mail, IndianRupee, Eye,
  ClipboardList, History
} from "lucide-react";
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
import { Label } from "@/components/ui/label";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ACTION_CONFIG = {
  submitted: { icon: Send, color: "text-blue-600", bg: "bg-blue-50", label: "Submitted" },
  broker_approved: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", label: "Broker Approved" },
  broker_rejected: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: "Broker Rejected" },
  client_approved: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50", label: "Client Approved" },
  client_rejected: { icon: XCircle, color: "text-orange-600", bg: "bg-orange-50", label: "Client Rejected" },
  kinntegra_prepared: { icon: Building2, color: "text-purple-600", bg: "bg-purple-50", label: "API Prepared" },
  kinntegra_submitted: { icon: CheckCircle, color: "text-indigo-600", bg: "bg-indigo-50", label: "API Submitted" },
};

const ENTITY_CONFIG = {
  client: { icon: User, color: "text-amber-600", label: "Client" },
  reinvestment: { icon: FileText, color: "text-blue-600", label: "Reinvestment" },
};

export default function ApprovalCenter() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  
  // Pending Approvals state
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingClients, setPendingClients] = useState([]);
  const [pendingReinvestments, setPendingReinvestments] = useState([]);
  const [pendingSubTab, setPendingSubTab] = useState("clients");
  const [processingId, setProcessingId] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});
  
  // Approval Modal state
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [approvalAction, setApprovalAction] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [sendClientEmail, setSendClientEmail] = useState(true);
  const [itemType, setItemType] = useState("");
  
  // Logs state
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  
  // Leads state
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsFilter, setLeadsFilter] = useState("all"); // all, bond, real_estate
  const [leadsStatusFilter, setLeadsStatusFilter] = useState("all"); // all, open, closed, not_interested

  useEffect(() => {
    document.title = "Kinntegraa | Approvals & Logs";
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
    }
    fetchLogs();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchLogs();
    }
  }, [filterType]);

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

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const params = filterType !== "all" ? `?entity_type=${filterType}` : "";
      const response = await axios.get(`${API}/approval-logs${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(response.data);
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast.error("Failed to load approval logs");
    } finally {
      setLogsLoading(false);
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
      fetchLogs();
    } catch (error) {
      toast.error(error.response?.data?.detail || `Failed to ${approvalAction}`);
    } finally {
      setProcessingId(null);
    }
  };

  const getActionConfig = (action) => {
    return ACTION_CONFIG[action] || { 
      icon: AlertCircle, 
      color: "text-gray-600", 
      bg: "bg-gray-50", 
      label: action 
    };
  };

  const getEntityConfig = (type) => {
    return ENTITY_CONFIG[type] || { 
      icon: FileText, 
      color: "text-gray-600", 
      label: type 
    };
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case "broker": return <Users className="h-4 w-4 text-amber-600" />;
      case "sub_broker": return <User className="h-4 w-4 text-blue-600" />;
      case "client": return <User className="h-4 w-4 text-green-600" />;
      case "system": return <Building2 className="h-4 w-4 text-purple-600" />;
      default: return <User className="h-4 w-4 text-gray-600" />;
    }
  };

  if (!user) return null;

  const SidebarComponent = user.role === "broker" ? Sidebar : 
                          user.role === "sub_broker" ? SubBrokerSidebar : 
                          ClientSidebar;
  
  const isBroker = user.role === 'broker';
  const pendingCount = pendingClients.length + pendingReinvestments.length;

  return (
    <div className="min-h-screen bg-gray-50 flex" data-testid="approval-center-page">
      <SidebarComponent user={user} />

      <div className="flex-1 p-4 md:p-8 md:ml-64">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="page-title">
              Approvals & Logs
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Manage pending approvals and track workflow activities
            </p>
          </div>
          
          <Button
            variant="outline"
            onClick={() => { fetchPendingApprovals(); fetchLogs(); }}
            disabled={pendingLoading || logsLoading}
            data-testid="refresh-btn"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(pendingLoading || logsLoading) ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6 bg-white border">
            {isBroker && (
              <TabsTrigger value="pending" className="px-6 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700" data-testid="tab-pending">
                <ClipboardList className="h-4 w-4 mr-2" />
                Pending Approvals
                {pendingCount > 0 && (
                  <Badge className="ml-2 bg-red-500 text-white">{pendingCount}</Badge>
                )}
              </TabsTrigger>
            )}
            <TabsTrigger value="logs" className="px-6 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700" data-testid="tab-logs">
              <History className="h-4 w-4 mr-2" />
              Activity Logs
            </TabsTrigger>
          </TabsList>

          {/* Pending Approvals Tab - Broker Only */}
          {isBroker && (
            <TabsContent value="pending">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                {/* Sub-tabs for Clients vs Reinvestments */}
                <div className="border-b border-gray-100 px-6 py-3">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setPendingSubTab("clients")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        pendingSubTab === "clients" 
                          ? "bg-amber-100 text-amber-700" 
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <User className="h-4 w-4" />
                      Clients
                      {pendingClients.length > 0 && (
                        <Badge variant="secondary" className="ml-1">{pendingClients.length}</Badge>
                      )}
                    </button>
                    <button
                      onClick={() => setPendingSubTab("reinvestments")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        pendingSubTab === "reinvestments" 
                          ? "bg-blue-100 text-blue-700" 
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <FileText className="h-4 w-4" />
                      Reinvestments
                      {pendingReinvestments.length > 0 && (
                        <Badge variant="secondary" className="ml-1">{pendingReinvestments.length}</Badge>
                      )}
                    </button>
                  </div>
                </div>

                {/* Pending Content */}
                <div className="p-6">
                  {pendingLoading ? (
                    <div className="text-center py-12">
                      <RefreshCw className="h-8 w-8 animate-spin text-amber-600 mx-auto mb-3" />
                      <p className="text-gray-500">Loading pending approvals...</p>
                    </div>
                  ) : pendingSubTab === "clients" ? (
                    pendingClients.length === 0 ? (
                      <div className="text-center py-12">
                        <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-gray-600 mb-1">All Caught Up!</h3>
                        <p className="text-gray-400 text-sm">No pending client approvals</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {pendingClients.map((client) => (
                          <div key={client.id} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div 
                              className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                              onClick={() => toggleExpand(client.id)}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                                  <User className="h-5 w-5 text-amber-600" />
                                </div>
                                <div>
                                  <p className="font-medium text-gray-800">{client.name}</p>
                                  <p className="text-sm text-gray-500">PAN: {client.pan_number}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge className="bg-amber-100 text-amber-700">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Pending
                                </Badge>
                                {expandedItems[client.id] ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                              </div>
                            </div>
                            
                            {expandedItems[client.id] && (
                              <div className="p-4 border-t border-gray-100">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                                  <div>
                                    <p className="text-gray-500">Email</p>
                                    <p className="font-medium">{client.email || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-500">Mobile</p>
                                    <p className="font-medium">{client.mobile || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-500">Submitted By</p>
                                    <p className="font-medium">{client.submitted_by_name || 'Sub-broker'}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-500">Submitted At</p>
                                    <p className="font-medium">{formatDate(client.submitted_at)}</p>
                                  </div>
                                </div>
                                
                                <div className="flex gap-3 pt-3 border-t border-gray-100">
                                  <Button
                                    onClick={() => openApprovalModal(client, 'client', 'approve')}
                                    className="bg-green-600 hover:bg-green-700"
                                    disabled={processingId === client.id}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Approve
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => openApprovalModal(client, 'client', 'reject')}
                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                    disabled={processingId === client.id}
                                  >
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Reject
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
                      <div className="space-y-4">
                        {pendingReinvestments.map((reinvest) => (
                          <div key={reinvest.id} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div 
                              className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                              onClick={() => toggleExpand(reinvest.id)}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                                  <IndianRupee className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                  <p className="font-medium text-gray-800">{reinvest.client_name}</p>
                                  <p className="text-sm text-gray-500">₹{formatCurrency(reinvest.amount)}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge className="bg-blue-100 text-blue-700">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Pending
                                </Badge>
                                {expandedItems[reinvest.id] ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                              </div>
                            </div>
                            
                            {expandedItems[reinvest.id] && (
                              <div className="p-4 border-t border-gray-100">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                                  <div>
                                    <p className="text-gray-500">Source Bond</p>
                                    <p className="font-medium">{reinvest.source_bond_name || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-500">Target Scheme</p>
                                    <p className="font-medium">{reinvest.target_scheme_name || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-500">Submitted By</p>
                                    <p className="font-medium">{reinvest.submitted_by_name || 'Sub-broker'}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-500">Submitted At</p>
                                    <p className="font-medium">{formatDate(reinvest.submitted_at)}</p>
                                  </div>
                                </div>
                                
                                <div className="flex gap-3 pt-3 border-t border-gray-100">
                                  <Button
                                    onClick={() => openApprovalModal(reinvest, 'reinvestment', 'approve')}
                                    className="bg-green-600 hover:bg-green-700"
                                    disabled={processingId === reinvest.id}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Approve
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => openApprovalModal(reinvest, 'reinvestment', 'reject')}
                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                    disabled={processingId === reinvest.id}
                                  >
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Reject
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
            </TabsContent>
          )}

          {/* Activity Logs Tab */}
          <TabsContent value="logs">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              {/* Filter Header */}
              <div className="border-b border-gray-100 px-6 py-3 flex items-center justify-between">
                <p className="text-sm text-gray-500">Track all approval workflow activities</p>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[180px]" data-testid="filter-select">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="client">Clients</SelectItem>
                    <SelectItem value="trade">Trades</SelectItem>
                    <SelectItem value="reinvestment">Reinvestments</SelectItem>
                    <SelectItem value="bond">Bonds</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Logs Content */}
              {logsLoading ? (
                <div className="p-12 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                  <p className="text-gray-500">Loading logs...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="p-12 text-center">
                  <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-gray-600 mb-1">No Logs Found</h3>
                  <p className="text-gray-400 text-sm">Approval workflow activities will appear here</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {logs.map((log, index) => {
                    const actionConfig = getActionConfig(log.action);
                    const entityConfig = getEntityConfig(log.entity_type);
                    const ActionIcon = actionConfig.icon;
                    const EntityIcon = entityConfig.icon;

                    return (
                      <div key={log.id || index} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start gap-4">
                          {/* Action Icon */}
                          <div className={`w-10 h-10 rounded-full ${actionConfig.bg} flex items-center justify-center flex-shrink-0`}>
                            <ActionIcon className={`h-5 w-5 ${actionConfig.color}`} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-medium ${actionConfig.color}`}>{actionConfig.label}</span>
                              <ArrowRight className="h-4 w-4 text-gray-400" />
                              <span className="flex items-center gap-1">
                                <EntityIcon className={`h-4 w-4 ${entityConfig.color}`} />
                                <span className="text-gray-700">{log.entity_name || log.details?.client_name || 'Unknown'}</span>
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                {getRoleIcon(log.actor_role)}
                                <span>{log.actor_name || 'System'}</span>
                              </span>
                              <span>•</span>
                              <span>{formatDate(log.created_at)}</span>
                            </div>

                            {log.notes && (
                              <p className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                                {log.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
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
            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder={`Add any notes about this ${approvalAction}...`}
                className="mt-2"
              />
            </div>
            
            {itemType === 'client' && (
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="sendEmail" 
                  checked={sendClientEmail}
                  onCheckedChange={setSendClientEmail}
                />
                <Label htmlFor="sendEmail" className="text-sm">
                  <Mail className="h-4 w-4 inline mr-1" />
                  Send email notification to client
                </Label>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprovalModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApprovalSubmit}
              className={approvalAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
              disabled={processingId}
            >
              {processingId ? 'Processing...' : (approvalAction === 'approve' ? 'Approve' : 'Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
