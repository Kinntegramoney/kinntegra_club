import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  RefreshCw, CheckCircle, XCircle, Clock, User, Users, 
  FileText, AlertCircle, Mail, IndianRupee, ChevronDown, ChevronUp,
  Send, Eye
} from "lucide-react";
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

export default function PendingApprovals() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingClients, setPendingClients] = useState([]);
  const [pendingReinvestments, setPendingReinvestments] = useState([]);
  const [activeTab, setActiveTab] = useState("clients");
  const [processingId, setProcessingId] = useState(null);
  
  // Modal state
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [approvalAction, setApprovalAction] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [sendClientEmail, setSendClientEmail] = useState(true);
  const [itemType, setItemType] = useState(""); // 'client' or 'reinvestment'

  useEffect(() => {
    document.title = "Kinntegraa | Pending Approvals";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "broker") {
      navigate("/sub-broker/dashboard");
      return;
    }
    
    setUser(parsedUser);
    fetchPendingApprovals();
  }, [navigate]);

  const fetchPendingApprovals = async () => {
    setLoading(true);
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
      setLoading(false);
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

  const openApprovalModal = (item, type, action) => {
    setSelectedItem(item);
    setItemType(type);
    setApprovalAction(action);
    setApprovalNotes("");
    setSendClientEmail(true);
    setShowApprovalModal(true);
  };

  const handleApproval = async () => {
    if (!selectedItem) return;
    
    setProcessingId(selectedItem.id);
    try {
      const token = localStorage.getItem("token");
      const endpoint = itemType === "client" 
        ? `${API}/approval-workflow/client/${selectedItem.id}`
        : `${API}/approval-workflow/reinvestment/${selectedItem.id}`;
      
      await axios.post(endpoint, {
        action: approvalAction,
        notes: approvalNotes,
        send_client_email: sendClientEmail
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(
        approvalAction === "approve" 
          ? `${itemType === "client" ? "Client" : "Reinvestment"} approved successfully${sendClientEmail ? " - email sent to client" : ""}`
          : `${itemType === "client" ? "Client" : "Reinvestment"} rejected`
      );
      
      setShowApprovalModal(false);
      fetchPendingApprovals();
    } catch (error) {
      console.error("Error processing approval:", error);
      toast.error(error.response?.data?.detail || "Failed to process approval");
    } finally {
      setProcessingId(null);
    }
  };

  const totalPending = pendingClients.length + pendingReinvestments.length;

  return (
    <div className="min-h-screen bg-gray-50 flex" data-testid="pending-approvals-page">
      <Sidebar user={user} />

      <div className="flex-1 p-4 md:p-8 md:ml-64">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="page-title">
              Pending Approvals
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Review and approve submissions from sub-brokers
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {totalPending > 0 && (
              <div className="px-3 py-1.5 bg-etihad-gold-100 text-etihad-gold-700 rounded-full text-sm font-medium">
                {totalPending} pending
              </div>
            )}
            <Button
              variant="outline"
              onClick={fetchPendingApprovals}
              disabled={loading}
              data-testid="refresh-btn"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("clients")}
            className={`px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === "clients"
                ? "bg-etihad-gold-100 text-etihad-gold-700"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
            data-testid="tab-clients"
          >
            <User className="h-4 w-4" />
            Clients
            {pendingClients.length > 0 && (
              <span className="px-2 py-0.5 bg-etihad-gold-600 text-white text-xs rounded-full">
                {pendingClients.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("reinvestments")}
            className={`px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === "reinvestments"
                ? "bg-etihad-gold-100 text-etihad-gold-700"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
            data-testid="tab-reinvestments"
          >
            <FileText className="h-4 w-4" />
            Reinvestments
            {pendingReinvestments.length > 0 && (
              <span className="px-2 py-0.5 bg-etihad-gold-600 text-white text-xs rounded-full">
                {pendingReinvestments.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600 mx-auto mb-3" />
              <p className="text-gray-500">Loading pending approvals...</p>
            </div>
          ) : activeTab === "clients" ? (
            pendingClients.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-600 mb-1">All Caught Up!</h3>
                <p className="text-gray-400 text-sm">No pending client approvals</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {pendingClients.map((client) => (
                  <div 
                    key={client.id} 
                    className="p-4 md:p-5 hover:bg-gray-50 transition-colors"
                    data-testid={`client-${client.id}`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-etihad-gold-100 flex items-center justify-center flex-shrink-0">
                          <User className="h-6 w-6 text-etihad-gold-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{client.name}</h3>
                          <div className="flex flex-wrap gap-2 mt-1 text-sm text-gray-500">
                            <span>PAN: {client.pan_number}</span>
                            {client.email && <span>• {client.email}</span>}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                              By: {client.sub_broker_name || "Sub-broker"} ({client.sub_broker_code})
                            </span>
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                              {formatDate(client.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 ml-16 md:ml-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => openApprovalModal(client, "client", "reject")}
                          disabled={processingId === client.id}
                          data-testid={`reject-client-${client.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => openApprovalModal(client, "client", "approve")}
                          disabled={processingId === client.id}
                          data-testid={`approve-client-${client.id}`}
                        >
                          {processingId === client.id ? (
                            <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-1" />
                          )}
                          Approve
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            pendingReinvestments.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-600 mb-1">All Caught Up!</h3>
                <p className="text-gray-400 text-sm">No pending reinvestment approvals</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {pendingReinvestments.map((reinv) => (
                  <div 
                    key={reinv.id} 
                    className="p-4 md:p-5 hover:bg-gray-50 transition-colors"
                    data-testid={`reinvestment-${reinv.id}`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <FileText className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            Reinvestment Request
                          </h3>
                          <div className="flex flex-wrap gap-2 mt-1 text-sm text-gray-500">
                            <span>Client: {reinv.client_name}</span>
                            <span>• {reinv.cashflows_count} cashflows</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full font-medium">
                              ₹{reinv.total_amount?.toLocaleString('en-IN')}
                            </span>
                            <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-full capitalize">
                              {reinv.portfolio_category}
                            </span>
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                              By: {reinv.sub_broker_name || "Sub-broker"}
                            </span>
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                              {formatDate(reinv.created_at)}
                            </span>
                          </div>
                          {reinv.notes && (
                            <p className="mt-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
                              {reinv.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 ml-16 md:ml-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => openApprovalModal(reinv, "reinvestment", "reject")}
                          disabled={processingId === reinv.id}
                          data-testid={`reject-reinvestment-${reinv.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => openApprovalModal(reinv, "reinvestment", "approve")}
                          disabled={processingId === reinv.id}
                          data-testid={`approve-reinvestment-${reinv.id}`}
                        >
                          {processingId === reinv.id ? (
                            <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-1" />
                          )}
                          Approve
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Approval Modal */}
        <Dialog open={showApprovalModal} onOpenChange={setShowApprovalModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {approvalAction === "approve" ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                {approvalAction === "approve" ? "Approve" : "Reject"} {itemType === "client" ? "Client" : "Reinvestment"}
              </DialogTitle>
              <DialogDescription>
                {approvalAction === "approve" 
                  ? `This will ${itemType === "client" ? "approve the client account" : "approve the reinvestment request"}.`
                  : `This will ${itemType === "client" ? "reject the client account" : "reject the reinvestment request"}.`
                }
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {selectedItem && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium text-gray-900">
                    {itemType === "client" ? selectedItem.name : `₹${selectedItem.total_amount?.toLocaleString('en-IN')}`}
                  </div>
                  <div className="text-sm text-gray-500">
                    {itemType === "client" 
                      ? `PAN: ${selectedItem.pan_number}`
                      : `${selectedItem.cashflows_count} cashflows • ${selectedItem.client_name}`
                    }
                  </div>
                </div>
              )}
              
              {approvalAction === "approve" && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="send-email" 
                    checked={sendClientEmail}
                    onCheckedChange={setSendClientEmail}
                  />
                  <Label htmlFor="send-email" className="text-sm cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-500" />
                      Send approval email to client
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Client will receive an email to confirm the {itemType === "client" ? "account" : "reinvestment"}
                    </p>
                  </Label>
                </div>
              )}
              
              <div>
                <Label htmlFor="notes" className="text-sm font-medium">
                  Notes (optional)
                </Label>
                <Textarea
                  id="notes"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder={approvalAction === "approve" ? "Add any notes..." : "Reason for rejection..."}
                  className="mt-1.5"
                  rows={3}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowApprovalModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleApproval}
                disabled={processingId}
                className={approvalAction === "approve" 
                  ? "bg-green-600 hover:bg-green-700" 
                  : "bg-red-600 hover:bg-red-700"
                }
              >
                {processingId ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : approvalAction === "approve" ? (
                  <CheckCircle className="h-4 w-4 mr-2" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                {approvalAction === "approve" ? "Approve" : "Reject"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
