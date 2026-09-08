import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  CheckCircle, XCircle, Clock, TrendingUp, Building2,
  RefreshCw, User, UserPlus, Eye, Save, Edit3,
  Wallet, Home, ExternalLink, FileText, Mail, Phone, MapPin,
  Award, Briefcase, Globe, CreditCard, Heart, MoreVertical
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Unified status vocabulary used across every Approvals tab (Clients, KYC,
// Bonds, Real Estate, Interests, RE Brokers, MFD/RIA). Each entry is
// { label, color (bg+text tailwind classes), icon }. Anything not listed
// falls back to a neutral "Unknown" pill via <StatusBadge/>.
const STATUS_CONFIG = {
  // Approval lifecycle
  pending:            { label: "Pending",           color: "bg-amber-100 text-amber-800",    icon: Clock },
  pending_approval:   { label: "Pending",           color: "bg-amber-100 text-amber-800",    icon: Clock },
  pending_payment:    { label: "Pending Payment",   color: "bg-amber-100 text-amber-800",    icon: Clock },
  approved:           { label: "Approved",          color: "bg-green-100 text-green-800",    icon: CheckCircle },
  rejected:           { label: "Rejected",          color: "bg-red-100 text-red-800",        icon: XCircle },
  
  // KYC / verification
  verified:           { label: "Verified",          color: "bg-green-100 text-green-800",    icon: CheckCircle },
  unverified:         { label: "Unverified",        color: "bg-amber-100 text-amber-800",    icon: Clock },
  
  // Interest / lead lifecycle
  open:               { label: "Open",              color: "bg-amber-100 text-amber-800",    icon: Clock },
  contacted:          { label: "Contacted",         color: "bg-blue-100 text-blue-700",      icon: Clock },
  converted:          { label: "Converted",         color: "bg-green-100 text-green-800",    icon: CheckCircle },
  not_interested:     { label: "Not Interested",    color: "bg-red-100 text-red-800",        icon: XCircle },
};

// Reusable status pill so every tab shows the same look for the same status.
const StatusBadge = ({ status, withIcon = false, className = "" }) => {
  const cfg = STATUS_CONFIG[status] || {
    label: status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ") : "Unknown",
    color: "bg-gray-100 text-gray-700",
    icon: Clock,
  };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${className}`}>
      {withIcon && Icon ? <Icon className="h-3 w-3" /> : null}
      {cfg.label}
    </span>
  );
};

export default function ApprovalsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState("client_creation");
  const [highlightItems, setHighlightItems] = useState(false);
  
  // Pending approvals data
  const [pendingClients, setPendingClients] = useState([]);
  const [pendingReinvestments, setPendingReinvestments] = useState([]);
  const [pendingTrades, setPendingTrades] = useState([]);
  const [pendingRealEstatePayments, setPendingRealEstatePayments] = useState([]);
  const [pendingREBrokers, setPendingREBrokers] = useState([]);
  const [pendingMFDRIA, setPendingMFDRIA] = useState([]);
  const [investorInterests, setInvestorInterests] = useState([]);
  const [pendingKYCVerifications, setPendingKYCVerifications] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // View Details Modal state
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editedItem, setEditedItem] = useState(null);
  const [itemType, setItemType] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Rejection Modal state  
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  
  // Not Interested Modal state (for interests)
  const [showNotInterestedModal, setShowNotInterestedModal] = useState(false);
  const [notInterestedReason, setNotInterestedReason] = useState("");
  
  const [processingId, setProcessingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Kinntegraa | Approvals";
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
    fetchAllApprovals();
    
    const tabParam = searchParams.get('tab');
    const highlightParam = searchParams.get('highlight');
    
    if (tabParam && ['reinvestment_bonds', 'client_creation', 'allotment_bonds', 'payment_real_estate', 're_brokers', 'mfd_ria', 'interests'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
    
    if (highlightParam === 'true') {
      setHighlightItems(true);
      setTimeout(() => setHighlightItems(false), 5000);
    }
  }, [navigate, searchParams]);

  const fetchAllApprovals = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Fetch pending Private Investors
      try {
        const investorsResponse = await axios.get(`${API}/private-investors/pending-approval`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPendingClients(investorsResponse.data || []);
      } catch (e) {
        console.error("Error fetching private investors:", e);
        // Fallback to old endpoint
        try {
          const response = await axios.get(`${API}/approval-workflow/pending`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setPendingClients(response.data.pending_clients || []);
        } catch (e2) {
          setPendingClients([]);
        }
      }
      
      // Fetch pending NCD allotments + reinvestments (independent of the
      // private-investor fetch above, so the broker's "Approve → Allotment-NCD"
      // tab always reflects current pending trades from MFD/RIA partners).
      try {
        const wf = await axios.get(`${API}/approval-workflow/pending`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPendingTrades(wf.data.pending_trades || []);
        setPendingReinvestments(wf.data.pending_reinvestments || []);
      } catch (e) {
        console.error("Error fetching approval-workflow pending:", e);
        setPendingTrades([]);
        setPendingReinvestments([]);
      }
      
      // Fetch pending RE Brokers
      try {
        const reBrokersResponse = await axios.get(`${API}/re-brokers?stage=applied`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPendingREBrokers(reBrokersResponse.data || []);
      } catch (e) {
        console.error("Error fetching RE brokers:", e);
        setPendingREBrokers([]);
      }
      
      // Fetch pending MFD/RIA partners
      try {
        const mfdResponse = await axios.get(`${API}/sub-brokers/pending-approval`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPendingMFDRIA(mfdResponse.data || []);
      } catch (e) {
        console.error("Error fetching MFD/RIA:", e);
        setPendingMFDRIA([]);
      }
      
      // Fetch investor interests (leads). The Interests tab is specifically
      // for Heart-button driven leads on real_estate / bond opportunities;
      // OTP-signup leads (opportunity_type === 'general') belong on the
      // Private Investors screen, not here.
      try {
        const interestsResponse = await axios.get(`${API}/leads`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const raw = interestsResponse.data || [];
        const onlyProductLeads = raw.filter(
          (l) => l?.opportunity_type === 'real_estate' || l?.opportunity_type === 'bond'
        );
        setInvestorInterests(onlyProductLeads);
      } catch (e) {
        console.error("Error fetching investor interests:", e);
        setInvestorInterests([]);
      }
      
      // Fetch pending KYC verifications
      try {
        const kycResponse = await axios.get(`${API}/broker/pending-kyc-verifications`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPendingKYCVerifications(kycResponse.data || []);
      } catch (e) {
        console.error("Error fetching pending KYC:", e);
        setPendingKYCVerifications([]);
      }
      
      setPendingRealEstatePayments([]);
      
    } catch (error) {
      console.error("Error fetching approvals:", error);
      if (error.response?.status !== 404) {
        toast.error("Failed to load approvals");
      }
    } finally {
      setLoading(false);
    }
  };

  const openDetailsModal = (item, type) => {
    setSelectedItem(item);
    setEditedItem({ ...item }); // Create editable copy
    setItemType(type);
    setHasChanges(false);
    setShowDetailsModal(true);
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedItem(null);
    setEditedItem(null);
    setItemType(null);
    setHasChanges(false);
  };

  const handleFieldChange = (field, value) => {
    setEditedItem(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSaveChanges = async () => {
    if (!editedItem || !hasChanges) return;
    
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      
      if (itemType === 'private_investor') {
        await axios.put(`${API}/crm/leads/${editedItem.id}`, editedItem, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else if (itemType === 're_broker') {
        await axios.put(`${API}/re-brokers/${editedItem.id}`, editedItem, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else if (itemType === 'mfd_ria') {
        await axios.put(`${API}/sub-brokers/${editedItem.id}`, editedItem, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      setSelectedItem(editedItem);
      setHasChanges(false);
      toast.success("Changes saved successfully");
      fetchAllApprovals();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const openRejectModal = () => {
    setShowDetailsModal(false);
    setRejectionReason("");
    setShowRejectModal(true);
  };

  const handleApprove = async () => {
    if (!selectedItem) return;
    
    setProcessingId(selectedItem.id);
    try {
      const token = localStorage.getItem("token");
      
      if (itemType === 'private_investor') {
        // Check if this is from MFD/RIA or self-signup
        const endpoint = selectedItem.source === 'mfd_ria' 
          ? `${API}/private-investors/${selectedItem.id}/approve-subbroker-client`
          : `${API}/private-investors/${selectedItem.id}/approve`;
        
        await axios.post(endpoint, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const sourceLabel = selectedItem.source === 'mfd_ria' ? `(Created by ${selectedItem.created_by_name || 'MFD/RIA'})` : '';
        toast.success(`Private Investor approved ${sourceLabel}! Login credentials sent via email.`);
      } else if (itemType === 're_broker') {
        await axios.post(`${API}/re-brokers/${selectedItem.id}/activate`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("RE Broker approved! Login credentials sent via email.");
      } else if (itemType === 'mfd_ria') {
        await axios.post(`${API}/sub-brokers/${selectedItem.id}/approve`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("MFD/RIA Partner approved! Login credentials sent via email.");
      }
      
      closeDetailsModal();
      fetchAllApprovals();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to approve");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!selectedItem || !rejectionReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    
    setProcessingId(selectedItem.id);
    try {
      const token = localStorage.getItem("token");
      
      if (itemType === 'private_investor') {
        // Check if this is from MFD/RIA or self-signup
        const endpoint = selectedItem.source === 'mfd_ria'
          ? `${API}/private-investors/${selectedItem.id}/reject-subbroker-client`
          : `${API}/private-investors/${selectedItem.id}/reject`;
        
        await axios.post(endpoint, {
          reason: rejectionReason
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Private Investor rejected. Rejection reason sent via email.");
      } else if (itemType === 're_broker') {
        await axios.delete(`${API}/re-brokers/${selectedItem.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { reason: rejectionReason }
        });
        toast.success("RE Broker rejected. Rejection reason sent via email.");
      } else if (itemType === 'mfd_ria') {
        await axios.post(`${API}/sub-brokers/${selectedItem.id}/reject`, {
          reason: rejectionReason
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("MFD/RIA Partner rejected. Rejection reason sent via email.");
      }
      
      setShowRejectModal(false);
      setSelectedItem(null);
      setItemType(null);
      fetchAllApprovals();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to reject");
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

  const handleApproveAllotment = async (tradeId, action, notes = null) => {
    setProcessingId(tradeId);
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({ action });
      if (notes) params.set("notes", notes);
      await axios.post(
        `${API}/approval-workflow/trade/${tradeId}?${params.toString()}`,
        null,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(action === "approve" ? "Trade approved — units allotted." : "Trade rejected.");
      fetchAllApprovals();
    } catch (error) {
      toast.error(error.response?.data?.detail || `Failed to ${action} trade`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveReinvestment = async (cashflowId, action, notes = null) => {
    setProcessingId(cashflowId);
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      if (notes) params.set("notes", notes);
      const qs = params.toString() ? `?${params.toString()}` : "";
      await axios.post(
        `${API}/approval-workflow/reinvestment-tag/${cashflowId}/${action}${qs}`,
        null,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(action === "approve" ? "Reinvestment approved — client notified for confirmation." : "Reinvestment rejected.");
      fetchAllApprovals();
    } catch (error) {
      toast.error(error.response?.data?.detail || `Failed to ${action} reinvestment`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleVerifyKYC = async (clientId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/private-investors/${clientId}/verify-kyc`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("KYC verified successfully! Client now has full access.");
      fetchAllApprovals();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to verify KYC");
    }
  };

  const handleUpdateInterestStatus = async (interestId, newStatus, reason = null) => {
    setProcessingId(interestId);
    try {
      const token = localStorage.getItem("token");
      const payload = { status: newStatus };
      if (reason) {
        payload.reason = reason;
      }
      await axios.put(`${API}/leads/${interestId}/status`, 
        payload,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      const statusLabels = {
        'contacted': 'Contacted',
        'converted': 'Converted',
        'not_interested': 'Not Interested'
      };
      toast.success(`Interest marked as ${statusLabels[newStatus] || newStatus}`);
      closeDetailsModal();
      setShowNotInterestedModal(false);
      setNotInterestedReason("");
      fetchAllApprovals();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update status");
    } finally {
      setProcessingId(null);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
  };

  if (!user) return null;

  const tabs = [
    { 
      id: "client_creation", 
      label: "Private Investors", 
      icon: UserPlus, 
      count: pendingClients.length + pendingKYCVerifications.length,
      color: "amber"
    },
    { 
      id: "interests", 
      label: "Interests", 
      icon: Heart, 
      count: investorInterests.filter(i => i.status === 'open').length,
      color: "pink"
    },
    { 
      id: "re_brokers", 
      label: "RE Brokers", 
      icon: Building2, 
      count: pendingREBrokers.length,
      color: "teal"
    },
    { 
      id: "mfd_ria", 
      label: "MFD/RIA Partners", 
      icon: User, 
      count: pendingMFDRIA.length,
      color: "purple"
    },
    { 
      id: "reinvestment_bonds", 
      label: "Reinvestment - NCD", 
      icon: RefreshCw, 
      count: pendingReinvestments.length,
      color: "blue"
    },
    { 
      id: "allotment_bonds", 
      label: "Allotment - NCD", 
      icon: TrendingUp, 
      count: pendingTrades.length,
      color: "green"
    },
    { 
      id: "payment_real_estate", 
      label: "Payment Tag - Real Estate", 
      icon: Home, 
      count: pendingRealEstatePayments.length,
      color: "orange"
    },
  ];

  const getColorClasses = (color, isActive) => {
    const colors = {
      blue: isActive ? "bg-blue-50 text-blue-700 border-blue-500" : "text-gray-600 border-transparent hover:bg-blue-50/50",
      amber: isActive ? "bg-amber-50 text-amber-700 border-amber-500" : "text-gray-600 border-transparent hover:bg-amber-50/50",
      green: isActive ? "bg-green-50 text-green-700 border-green-500" : "text-gray-600 border-transparent hover:bg-green-50/50",
      purple: isActive ? "bg-purple-50 text-purple-700 border-purple-500" : "text-gray-600 border-transparent hover:bg-purple-50/50",
      teal: isActive ? "bg-teal-50 text-teal-700 border-teal-500" : "text-gray-600 border-transparent hover:bg-teal-50/50",
      orange: isActive ? "bg-orange-50 text-orange-700 border-orange-500" : "text-gray-600 border-transparent hover:bg-orange-50/50",
      pink: isActive ? "bg-pink-50 text-pink-700 border-pink-500" : "text-gray-600 border-transparent hover:bg-pink-50/50",
      cyan: isActive ? "bg-cyan-50 text-cyan-700 border-cyan-500" : "text-gray-600 border-transparent hover:bg-cyan-50/50",
    };
    return colors[color] || colors.blue;
  };

  const getBadgeColor = (color) => {
    const colors = {
      blue: "bg-blue-500",
      amber: "bg-amber-500",
      green: "bg-green-500",
      purple: "bg-purple-500",
      pink: "bg-pink-500",
      teal: "bg-teal-500",
      orange: "bg-orange-500",
      cyan: "bg-cyan-500",
    };
    return colors[color] || "bg-gray-500";
  };

  // Get the title and description for the detail modal
  const getModalTitle = () => {
    if (itemType === 'private_investor') return 'Private Investor Application';
    if (itemType === 're_broker') return 'Real Estate Broker Application';
    if (itemType === 'mfd_ria') return 'MFD/RIA Partner Application';
    if (itemType === 'interest') return 'Client Interest Details';
    return 'Application Details';
  };

  return (
    <div className="min-h-screen bg-gray-50 flex" data-testid="approvals-page">
      <Sidebar user={user} />

      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800" data-testid="approvals-title">Approvals</h1>
                <p className="text-sm text-gray-500">Review and approve pending applications</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchAllApprovals}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
          
          {/* Tab Navigation */}
          <div className="px-6 pb-0 flex flex-wrap gap-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${getColorClasses(tab.color, isActive)}`}
                  data-testid={`tab-${tab.id}`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.count > 0 && (
                    <Badge className={`${getBadgeColor(tab.color)} text-white text-xs`}>{tab.count}</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4">
              {loading ? (
                <div className="text-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-amber-600 mx-auto mb-3" />
                  <p className="text-gray-500">Loading...</p>
                </div>
              ) : (
                <>
                  {/* Private Investors Tab */}
                  {activeTab === "client_creation" && (
                    <div className="space-y-6">
                      {/* Pending Applications Section */}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                          <UserPlus className="h-4 w-4 text-amber-600" />
                          Pending Applications
                          {pendingClients.length > 0 && (
                            <Badge className="bg-amber-100 text-amber-700">{pendingClients.length}</Badge>
                          )}
                        </h3>
                        {pendingClients.length === 0 ? (
                          <div className="bg-gray-50 rounded-lg p-6 text-center">
                            <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">No pending applications</p>
                          </div>
                        ) : (
                          <ApplicationTable
                            items={pendingClients}
                            type="private_investor"
                            onViewDetails={openDetailsModal}
                            formatDate={formatDate}
                          />
                        )}
                      </div>

                      {/* KYC Verification Section */}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-cyan-600" />
                          KYC Verification
                          {pendingKYCVerifications.length > 0 && (
                            <Badge className="bg-cyan-100 text-cyan-700">{pendingKYCVerifications.length}</Badge>
                          )}
                        </h3>
                        {pendingKYCVerifications.length === 0 ? (
                          <div className="bg-gray-50 rounded-lg p-6 text-center">
                            <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">All KYC submissions have been verified</p>
                          </div>
                        ) : (
                          <KYCVerificationList 
                            items={pendingKYCVerifications}
                            onVerify={handleVerifyKYC}
                            loading={loading}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Interests Tab */}
                  {activeTab === "interests" && (
                    investorInterests.length === 0 ? (
                      <EmptyState 
                        icon={Heart} 
                        title="No Investor Interests" 
                        description="When investors show interest in opportunities, they will appear here"
                      />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-pink-50">
                            <tr>
                              <th className="text-left py-3 px-4 text-xs font-medium text-pink-700 uppercase">Investor</th>
                              <th className="text-left py-3 px-4 text-xs font-medium text-pink-700 uppercase">Opportunity</th>
                              <th className="text-left py-3 px-4 text-xs font-medium text-pink-700 uppercase">Type</th>
                              <th className="text-left py-3 px-4 text-xs font-medium text-pink-700 uppercase">Interest Date</th>
                              <th className="text-left py-3 px-4 text-xs font-medium text-pink-700 uppercase">Status</th>
                              <th className="text-left py-3 px-4 text-xs font-medium text-pink-700 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {investorInterests.map((interest) => (
                              <tr key={interest.id || interest._id} className="hover:bg-pink-50/30 transition-colors">
                                <td className="py-3 px-4">
                                  <div>
                                    <p className="font-medium text-gray-900">{interest.client_name || interest.name || 'N/A'}</p>
                                    <p className="text-xs text-gray-500">{interest.client_email || interest.email || ''}</p>
                                    {(interest.client_mobile || interest.client_phone) && (
                                      <p className="text-xs text-gray-500">{interest.client_mobile || interest.client_phone}</p>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <div>
                                    <p className="font-medium text-gray-900">{interest.opportunity_name || interest.bond_name || interest.property_name || 'N/A'}</p>
                                    {interest.investment_amount && (
                                      <p className="text-xs text-gray-500">₹ {formatCurrency(interest.investment_amount)}</p>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    interest.opportunity_type === 'real_estate' 
                                      ? 'bg-orange-100 text-orange-700'
                                      : 'bg-green-100 text-green-700'
                                  }`}>
                                    {interest.opportunity_type === 'real_estate' ? 'Real Estate' : 'NCD'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-sm text-gray-600">
                                  {formatDate(interest.created_at || interest.interest_date)}
                                </td>
                                <td className="py-3 px-4">
                                  <StatusBadge status={interest.status || 'open'} />
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openDetailsModal(interest, 'interest')}
                                      className="text-pink-600 border-pink-300 hover:bg-pink-50"
                                    >
                                      <Eye className="h-3 w-3 mr-1" />
                                      View
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}

                  {/* RE Brokers Tab */}
                  {activeTab === "re_brokers" && (
                    pendingREBrokers.length === 0 ? (
                      <EmptyState 
                        icon={Building2} 
                        title="No Pending RE Broker Applications" 
                        description="All applications have been processed"
                      />
                    ) : (
                      <ApplicationTable
                        items={pendingREBrokers}
                        type="re_broker"
                        onViewDetails={openDetailsModal}
                        formatDate={formatDate}
                      />
                    )
                  )}

                  {/* MFD/RIA Tab */}
                  {activeTab === "mfd_ria" && (
                    pendingMFDRIA.length === 0 ? (
                      <EmptyState 
                        icon={User} 
                        title="No Pending MFD/RIA Applications" 
                        description="All applications have been processed"
                      />
                    ) : (
                      <ApplicationTable
                        items={pendingMFDRIA}
                        type="mfd_ria"
                        onViewDetails={openDetailsModal}
                        formatDate={formatDate}
                      />
                    )
                  )}

                  {/* Reinvestment - NCD Tab */}
                  {activeTab === "reinvestment_bonds" && (
                    pendingReinvestments.length === 0 ? (
                      <EmptyState 
                        icon={RefreshCw} 
                        title="No Pending Reinvestments" 
                        description="All NCD reinvestment requests have been processed"
                      />
                    ) : (
                      <div className="overflow-x-auto" data-testid="reinvestment-ncd-table">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b sticky top-0">
                            <tr className="text-left text-xs font-medium text-gray-600 uppercase">
                              <th className="py-3 px-4">Bond</th>
                              <th className="py-3 px-4">Client</th>
                              <th className="py-3 px-4">Tagged By</th>
                              <th className="py-3 px-4">Expected Date</th>
                              <th className="py-3 px-4 text-right">Principal (₹)</th>
                              <th className="py-3 px-4 text-right">Interest (₹)</th>
                              <th className="py-3 px-4 text-right">Net (₹)</th>
                              <th className="py-3 px-4">Tag</th>
                              <th className="py-3 px-4">UCC</th>
                              <th className="py-3 px-4">Portfolio</th>
                              <th className="py-3 px-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pendingReinvestments.map((reinv) => {
                              const cashflowId = reinv.cashflow_id || reinv.id;
                              const ucc = reinv.target_ucc || reinv.ucc || '—';
                              const portfolio = reinv.portfolio_category || reinv.portfolio || '—';
                              const principal = reinv.principal_net ?? reinv.principal_component ?? 0;
                              const interest = reinv.interest_net ?? ((reinv.interest_component || 0) - (reinv.tds_amount || 0));
                              const netAmt = reinv.net_amount ?? reinv.total_amount ?? 0;
                              const tag = reinv.reinvestment_tag || reinv.tag || '—';
                              return (
                                <tr
                                  key={`${cashflowId}-${reinv.allocation_index || 0}`}
                                  className={`border-b hover:bg-gray-50 ${highlightItems ? 'bg-amber-50/40' : ''}`}
                                  data-testid={`reinvestment-row-${cashflowId}`}
                                >
                                  <td className="py-3 px-4">
                                    <p className="font-medium text-gray-900">{reinv.bond_name || '—'}</p>
                                    <p className="text-xs text-gray-500">{reinv.bond_code || ''}</p>
                                  </td>
                                  <td className="py-3 px-4">
                                    <p className="font-medium text-gray-900">{reinv.client_name || '—'}</p>
                                    <p className="text-xs text-gray-500">{reinv.client_pan || ''}</p>
                                  </td>
                                  <td className="py-3 px-4">
                                    <p className="font-medium text-gray-900">{reinv.sub_broker_name || '—'}</p>
                                    {reinv.sub_broker_code && (
                                      <p className="text-xs text-gray-500">{reinv.sub_broker_code}</p>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-sm text-gray-600">
                                    {reinv.expected_date ? formatDate(reinv.expected_date).split(',')[0] : '—'}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono">
                                    {Number(principal).toLocaleString('en-IN')}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono">
                                    {Number(interest).toLocaleString('en-IN')}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono font-semibold">
                                    {Number(netAmt).toLocaleString('en-IN')}
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs capitalize">
                                      {tag} · pending
                                    </Badge>
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge variant="outline" className="text-xs">{ucc}</Badge>
                                  </td>
                                  <td className="py-3 px-4">
                                    <Badge variant="outline" className="text-xs capitalize">{portfolio}</Badge>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="flex items-center justify-end gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          const reason = window.prompt(
                                            `Reject reinvestment tag for ${reinv.client_name} on ${reinv.bond_name}?\n\nEnter rejection reason:`,
                                            ""
                                          );
                                          if (reason === null) return;
                                          if (!reason.trim()) {
                                            toast.error("Rejection reason is required");
                                            return;
                                          }
                                          handleApproveReinvestment(cashflowId, "reject", reason.trim());
                                        }}
                                        disabled={processingId === cashflowId}
                                        className="text-red-600 border-red-200 hover:bg-red-50"
                                        data-testid={`reinvestment-reject-${cashflowId}`}
                                      >
                                        <XCircle className="h-3 w-3 mr-1" />
                                        Reject
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          if (!window.confirm(
                                            `Approve this reinvestment tag?\n\nClient: ${reinv.client_name}\nBond: ${reinv.bond_name}\nTag: ${tag}\nUCC: ${ucc} · Portfolio: ${portfolio}\nNet: ₹${Number(netAmt).toLocaleString('en-IN')}\n\nClient will receive an approval email.`
                                          )) return;
                                          handleApproveReinvestment(cashflowId, "approve");
                                        }}
                                        disabled={processingId === cashflowId}
                                        className="bg-green-600 hover:bg-green-700 text-white"
                                        data-testid={`reinvestment-approve-${cashflowId}`}
                                      >
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                        {processingId === cashflowId ? "..." : "Approve"}
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}

                  {/* Allotment - NCD Tab */}
                  {activeTab === "allotment_bonds" && (
                    pendingTrades.length === 0 ? (
                      <EmptyState 
                        icon={TrendingUp} 
                        title="No Pending Unit Allotments" 
                        description="All NCD unit allotment requests have been processed"
                      />
                    ) : (
                      <div className="overflow-x-auto" data-testid="allotment-ncd-table">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b sticky top-0">
                            <tr className="text-left text-xs font-medium text-gray-600 uppercase">
                              <th className="py-3 px-4">Bond</th>
                              <th className="py-3 px-4">Client</th>
                              <th className="py-3 px-4">Submitted By</th>
                              <th className="py-3 px-4 text-right">Units</th>
                              <th className="py-3 px-4 text-right">Amount (₹)</th>
                              <th className="py-3 px-4">Investment Date</th>
                              <th className="py-3 px-4">UTR</th>
                              <th className="py-3 px-4">Submitted</th>
                              <th className="py-3 px-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pendingTrades.map((trade) => (
                              <tr
                                key={trade.id}
                                className={`border-b hover:bg-gray-50 ${highlightItems ? 'bg-amber-50/40' : ''}`}
                                data-testid={`allotment-row-${trade.id}`}
                              >
                                <td className="py-3 px-4">
                                  <p className="font-medium text-gray-900">{trade.bond_name || '—'}</p>
                                  <p className="text-xs text-gray-500">{trade.bond_code || ''}</p>
                                </td>
                                <td className="py-3 px-4">
                                  <p className="font-medium text-gray-900">{trade.client_name || '—'}</p>
                                  <p className="text-xs text-gray-500">{trade.client_pan || ''}</p>
                                </td>
                                <td className="py-3 px-4">
                                  <p className="font-medium text-gray-900">{trade.sub_broker_name || trade.created_by_name || '—'}</p>
                                  {trade.sub_broker_code && (
                                    <p className="text-xs text-gray-500">{trade.sub_broker_code}</p>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right font-mono">{trade.units || 0}</td>
                                <td className="py-3 px-4 text-right font-mono">
                                  {Number(trade.total_amount || 0).toLocaleString('en-IN')}
                                </td>
                                <td className="py-3 px-4 text-sm text-gray-600">
                                  {trade.investment_date ? formatDate(trade.investment_date).split(' ')[0] + ' ' + formatDate(trade.investment_date).split(' ')[1] + ' ' + formatDate(trade.investment_date).split(' ')[2] : '—'}
                                </td>
                                <td className="py-3 px-4">
                                  <p className="text-xs font-mono text-gray-700">{trade.payment_reference || '—'}</p>
                                  {trade.payment_proof_url && (
                                    <a
                                      href={trade.payment_proof_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                                      data-testid={`allotment-proof-${trade.id}`}
                                    >
                                      <FileText className="h-3 w-3" /> View proof
                                    </a>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-xs text-gray-500">
                                  {formatDate(trade.created_at)}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        const reason = window.prompt(
                                          `Reject this allotment for ${trade.client_name} (${trade.units} units of ${trade.bond_name})?\n\nEnter rejection reason:`,
                                          ""
                                        );
                                        if (reason === null) return;
                                        if (!reason.trim()) {
                                          toast.error("Rejection reason is required");
                                          return;
                                        }
                                        handleApproveAllotment(trade.id, "reject", reason.trim());
                                      }}
                                      disabled={processingId === trade.id}
                                      className="text-red-600 border-red-200 hover:bg-red-50"
                                      data-testid={`allotment-reject-${trade.id}`}
                                    >
                                      <XCircle className="h-3 w-3 mr-1" />
                                      Reject
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        if (!window.confirm(
                                          `Approve this allotment?\n\nClient: ${trade.client_name}\nBond: ${trade.bond_name}\nUnits: ${trade.units}\nAmount: ₹${Number(trade.total_amount || 0).toLocaleString('en-IN')}`
                                        )) return;
                                        handleApproveAllotment(trade.id, "approve");
                                      }}
                                      disabled={processingId === trade.id}
                                      className="bg-green-600 hover:bg-green-700 text-white"
                                      data-testid={`allotment-approve-${trade.id}`}
                                    >
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      {processingId === trade.id ? "..." : "Approve"}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}

                  {/* Payment Tag - Real Estate Tab */}
                  {activeTab === "payment_real_estate" && (
                    pendingRealEstatePayments.length === 0 ? (
                      <EmptyState 
                        icon={Home} 
                        title="No Pending Payment Tags" 
                        description="All real estate payment tag requests have been processed"
                      />
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        Payment approval table - existing functionality
                      </div>
                    )
                  )}

                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* View Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {itemType === 'private_investor' && <UserPlus className="h-5 w-5 text-amber-600" />}
              {itemType === 're_broker' && <Building2 className="h-5 w-5 text-teal-600" />}
              {itemType === 'mfd_ria' && <User className="h-5 w-5 text-purple-600" />}
              {getModalTitle()}
              <Badge className="ml-2 bg-blue-100 text-blue-700">
                <Edit3 className="h-3 w-3 mr-1" />
                Editable
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Review and edit the application details. Changes will be saved before approval.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {editedItem && itemType === 'private_investor' && (
              <PrivateInvestorDetails 
                item={editedItem} 
                formatDate={formatDate} 
                onFieldChange={handleFieldChange}
                editable={true}
              />
            )}
            {editedItem && itemType === 're_broker' && (
              <REBrokerDetails 
                item={editedItem} 
                formatDate={formatDate}
                onFieldChange={handleFieldChange}
                editable={true}
              />
            )}
            {editedItem && itemType === 'mfd_ria' && (
              <MFDRIADetails 
                item={editedItem} 
                formatDate={formatDate}
                onFieldChange={handleFieldChange}
                editable={true}
              />
            )}
            {editedItem && itemType === 'interest' && (
              <InterestDetails 
                item={editedItem} 
                formatDate={formatDate}
              />
            )}
          </div>

          <DialogFooter className="flex-col gap-3 sm:gap-2">
            {itemType === 'interest' ? (
              // For interests, show status update and close options
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
                <Button 
                  variant="outline" 
                  onClick={() => setShowNotInterestedModal(true)}
                  disabled={processingId === editedItem?.id || editedItem?.status === 'not_interested'}
                  className="text-red-600 border-red-200 hover:bg-red-50 w-full sm:w-auto"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Not Interested
                </Button>
                <div className="flex flex-col sm:flex-row gap-2 sm:ml-auto">
                  <Button variant="outline" onClick={closeDetailsModal} className="w-full sm:w-auto">
                    Close
                  </Button>
                  <Button
                    onClick={() => handleUpdateInterestStatus(editedItem?.id, 'contacted')}
                    disabled={processingId === editedItem?.id || editedItem?.status === 'contacted'}
                    className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                  >
                    <Phone className="h-4 w-4 mr-2" />
                    Mark as Contacted
                  </Button>
                  <Button
                    onClick={() => handleUpdateInterestStatus(editedItem?.id, 'converted')}
                    disabled={processingId === editedItem?.id || editedItem?.status === 'converted'}
                    className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark as Converted
                  </Button>
                </div>
              </div>
            ) : (
              // Regular approval workflow
              <>
                {hasChanges && (
                  <Button
                    variant="outline"
                    onClick={handleSaveChanges}
                    disabled={saving}
                    className="text-blue-600 border-blue-200 hover:bg-blue-50 sm:mr-auto"
                  >
                    {saving ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={openRejectModal}
                  disabled={processingId === editedItem?.id || saving}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={processingId === editedItem?.id || saving}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {processingId === editedItem?.id ? (
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Approve & Send Credentials
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Reason Modal */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Reject Application
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this application. This will be sent to the applicant.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label htmlFor="rejection-reason" className="text-sm font-medium">
              Rejection Reason *
            </Label>
            <Textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter the reason for rejection..."
              className="mt-2 min-h-[120px]"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectModal(false);
                setShowDetailsModal(true);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={processingId === selectedItem?.id || !rejectionReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {processingId === selectedItem?.id ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Not Interested Modal (for Interests) */}
      <Dialog open={showNotInterestedModal} onOpenChange={setShowNotInterestedModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Mark as Not Interested
            </DialogTitle>
            <DialogDescription>
              Please provide a reason why this investor is not interested.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label htmlFor="not-interested-reason" className="text-sm font-medium">
              Reason *
            </Label>
            <Textarea
              id="not-interested-reason"
              value={notInterestedReason}
              onChange={(e) => setNotInterestedReason(e.target.value)}
              placeholder="e.g., Budget constraints, Timeline mismatch, Found alternative investment..."
              className="mt-2 min-h-[100px]"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNotInterestedModal(false);
                setNotInterestedReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleUpdateInterestStatus(editedItem?.id, 'not_interested', notInterestedReason)}
              disabled={processingId === editedItem?.id || !notInterestedReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {processingId === editedItem?.id ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Confirm Not Interested
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Empty State Component
function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 rounded-full bg-green-100 mx-auto mb-4 flex items-center justify-center">
        <CheckCircle className="h-8 w-8 text-green-500" />
      </div>
      <h3 className="text-lg font-medium text-gray-600 mb-1">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  );
}

// Unified Application Table
function ApplicationTable({ items, type, onViewDetails, formatDate }) {
  const getIcon = () => {
    if (type === 'private_investor') return <UserPlus className="h-4 w-4 text-amber-600" />;
    if (type === 're_broker') return <Building2 className="h-4 w-4 text-teal-600" />;
    if (type === 'mfd_ria') return <User className="h-4 w-4 text-purple-600" />;
    return null;
  };

  const getBgColor = () => {
    if (type === 'private_investor') return 'bg-amber-50';
    if (type === 're_broker') return 'bg-teal-50';
    if (type === 'mfd_ria') return 'bg-purple-50';
    return 'bg-gray-50';
  };

  const getName = (item) => {
    if (type === 'private_investor') return item.name || item.full_name;
    if (type === 're_broker') return item.full_name;
    if (type === 'mfd_ria') return item.name || item.full_name;
    return 'N/A';
  };

  const getSubtitle = (item) => {
    if (type === 'private_investor') {
      // Show source (MFD/RIA or self-signup) for private investors
      if (item.source === 'mfd_ria') {
        return `${item.email} • Via ${item.created_by_name || 'MFD/RIA'}`;
      }
      return item.email;
    }
    if (type === 're_broker') return `${item.company_name} • RERA: ${item.rera_license_number}`;
    if (type === 'mfd_ria') {
      const partnerType = item.partner_type === 'both' ? 'MFD & RIA' : item.partner_type?.toUpperCase() || 'MFD';
      return `${item.email} • ${partnerType}`;
    }
    return '';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Applicant</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Contact</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Applied On</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Status</th>
            <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b hover:bg-gray-50 transition-colors">
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full ${getBgColor()} flex items-center justify-center`}>
                    {getIcon()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{getName(item)}</p>
                    <p className="text-xs text-gray-500">{getSubtitle(item)}</p>
                  </div>
                </div>
              </td>
              <td className="py-3 px-4">
                <div className="text-sm">
                  <p className="text-gray-600">{item.mobile_number || item.phone || 'N/A'}</p>
                  <p className="text-xs text-gray-400">{item.city && item.state ? `${item.city}, ${item.state}` : item.emirate || 'N/A'}</p>
                </div>
              </td>
              <td className="py-3 px-4">
                <p className="text-sm text-gray-600">{formatDate(item.created_at)}</p>
              </td>
              <td className="py-3 px-4">
                <StatusBadge status={item.status || 'pending'} />
              </td>
              <td className="py-3 px-4 text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onViewDetails(item, type)}
                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View Details
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Detail Section Component
function DetailSection({ icon: Icon, title, children, color = "gray" }) {
  const bgColors = {
    gray: "bg-gray-50",
    amber: "bg-amber-50",
    teal: "bg-teal-50",
    purple: "bg-purple-50",
    blue: "bg-blue-50"
  };
  const textColors = {
    gray: "text-gray-700",
    amber: "text-amber-700",
    teal: "text-teal-700",
    purple: "text-purple-700",
    blue: "text-blue-700"
  };

  return (
    <div className={`${bgColors[color]} rounded-lg p-4 mb-4`}>
      <h4 className={`text-sm font-semibold ${textColors[color]} mb-3 flex items-center gap-2 uppercase tracking-wide`}>
        <Icon className="h-4 w-4" />
        {title}
      </h4>
      <div className="grid grid-cols-2 gap-4">
        {children}
      </div>
    </div>
  );
}

// Editable Detail Field Component
function EditableField({ label, value, field, onChange, fullWidth = false, editable = true, type = "text", options = null, readOnly = false }) {
  if (readOnly || !editable) {
    return (
      <div className={fullWidth ? "col-span-2" : ""}>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className="text-sm font-medium text-gray-800">{value || 'N/A'}</p>
      </div>
    );
  }

  if (options) {
    return (
      <div className={fullWidth ? "col-span-2" : ""}>
        <Label className="text-xs text-gray-500">{label}</Label>
        <Select value={value || ''} onValueChange={(v) => onChange(field, v)}>
          <SelectTrigger className="mt-1 h-9 bg-white">
            <SelectValue placeholder={`Select ${label}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <div className={fullWidth ? "col-span-2" : ""}>
        <Label className="text-xs text-gray-500">{label}</Label>
        <Textarea
          value={value || ''}
          onChange={(e) => onChange(field, e.target.value)}
          className="mt-1 bg-white min-h-[60px]"
          placeholder={`Enter ${label}`}
        />
      </div>
    );
  }

  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <Label className="text-xs text-gray-500">{label}</Label>
      <Input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(field, e.target.value)}
        className="mt-1 h-9 bg-white"
        placeholder={`Enter ${label}`}
      />
    </div>
  );
}

// Private Investor Details (Steps 1 & 2)
function PrivateInvestorDetails({ item, formatDate, onFieldChange, editable = false }) {
  const countryOptions = [
    { value: 'India', label: 'India' },
    { value: 'United Arab Emirates', label: 'United Arab Emirates' },
    { value: 'United States', label: 'United States' },
    { value: 'United Kingdom', label: 'United Kingdom' },
    { value: 'Singapore', label: 'Singapore' },
    { value: 'Australia', label: 'Australia' },
    { value: 'Canada', label: 'Canada' },
    { value: 'Other', label: 'Other' }
  ];

  const passportOptions = [
    { value: 'indian', label: 'Indian Passport' },
    { value: 'foreign', label: 'Foreign Passport' }
  ];

  const isIndianPassport = item.passport_type === 'indian';

  return (
    <div>
      {/* Step Indicator */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold">1</div>
          <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold">2</div>
          <span className="text-sm font-medium text-amber-700">Basic Information & Identification Completed</span>
        </div>
      </div>

      <DetailSection icon={User} title="Basic Information" color="amber">
        <EditableField label="Full Name" value={item.full_name || item.name} field="full_name" onChange={onFieldChange} editable={editable} />
        <EditableField label="Email" value={item.email} field="email" onChange={onFieldChange} editable={editable} type="email" />
        <EditableField label="Mobile Number" value={item.mobile_number || item.phone} field="mobile_number" onChange={onFieldChange} editable={editable} />
        <EditableField 
          label="Country of Residency" 
          value={item.country_of_residency || item.country} 
          field="country_of_residency" 
          onChange={onFieldChange} 
          editable={editable}
          options={countryOptions}
        />
        <EditableField 
          label="Passport Type" 
          value={item.passport_type} 
          field="passport_type" 
          onChange={onFieldChange} 
          editable={editable}
          options={passportOptions}
          fullWidth
        />
      </DetailSection>

      {/* Identification Details Section */}
      <DetailSection icon={CreditCard} title="Identification Details" color="blue">
        {isIndianPassport ? (
          <EditableField 
            label="PAN Number" 
            value={item.pan_number} 
            field="pan_number" 
            onChange={onFieldChange} 
            editable={editable}
            fullWidth
          />
        ) : (
          <EditableField 
            label="Passport Number" 
            value={item.passport_number} 
            field="passport_number" 
            onChange={onFieldChange} 
            editable={editable}
            fullWidth
          />
        )}
      </DetailSection>

      <DetailSection icon={FileText} title="Application Details" color="gray">
        <EditableField label="Applied On" value={formatDate(item.created_at)} field="created_at" onChange={onFieldChange} readOnly />
        <EditableField label="Source" value={item.source || 'Public Signup'} field="source" onChange={onFieldChange} readOnly />
        <EditableField label="Onboarding Step" value={`Step ${item.onboarding_step || 2} of 2`} field="onboarding_step" onChange={onFieldChange} readOnly />
        <EditableField label="Status" value={item.status === 'pending_approval' ? 'Pending Approval' : item.status} field="status" onChange={onFieldChange} readOnly />
      </DetailSection>

      {/* Note about next steps */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-4">
        <p className="text-xs text-green-700">
          <strong>After Approval:</strong> Investor will receive login credentials via email and will be able to access their dashboard immediately.
          They will appear in the Private Investors tab with "Active" status.
        </p>
      </div>
    </div>
  );
}

// RE Broker Details
function REBrokerDetails({ item, formatDate, onFieldChange, editable = false }) {
  const emirateOptions = [
    { value: 'Dubai', label: 'Dubai' },
    { value: 'Abu Dhabi', label: 'Abu Dhabi' },
    { value: 'Sharjah', label: 'Sharjah' },
    { value: 'Ajman', label: 'Ajman' },
    { value: 'Ras Al Khaimah', label: 'Ras Al Khaimah' },
    { value: 'Fujairah', label: 'Fujairah' },
    { value: 'Umm Al Quwain', label: 'Umm Al Quwain' }
  ];

  const experienceOptions = [
    { value: '0-2', label: '0-2 Years' },
    { value: '2-5', label: '2-5 Years' },
    { value: '5-10', label: '5-10 Years' },
    { value: '10+', label: '10+ Years' }
  ];

  return (
    <div>
      <DetailSection icon={User} title="Personal Information" color="teal">
        <EditableField label="Full Name" value={item.full_name} field="full_name" onChange={onFieldChange} editable={editable} />
        <EditableField label="Email" value={item.email} field="email" onChange={onFieldChange} editable={editable} type="email" />
        <EditableField label="Mobile" value={item.mobile_number} field="mobile_number" onChange={onFieldChange} editable={editable} />
        <EditableField label="Nationality" value={item.nationality} field="nationality" onChange={onFieldChange} editable={editable} />
      </DetailSection>

      <DetailSection icon={Building2} title="Company & License Details" color="teal">
        <EditableField label="Company Name" value={item.company_name} field="company_name" onChange={onFieldChange} editable={editable} />
        <EditableField label="RERA License Number" value={item.rera_license_number} field="rera_license_number" onChange={onFieldChange} editable={editable} />
        <EditableField label="RERA Expiry Date" value={item.rera_expiry_date} field="rera_expiry_date" onChange={onFieldChange} editable={editable} type="date" />
        <EditableField label="Trade License Number" value={item.trade_license_number} field="trade_license_number" onChange={onFieldChange} editable={editable} />
        <EditableField label="Emirate" value={item.emirate} field="emirate" onChange={onFieldChange} editable={editable} options={emirateOptions} />
        <EditableField label="Office Address" value={item.office_address} field="office_address" onChange={onFieldChange} fullWidth editable={editable} type="textarea" />
      </DetailSection>

      <DetailSection icon={Briefcase} title="Professional Details" color="gray">
        <EditableField label="Specialization" value={item.specialization} field="specialization" onChange={onFieldChange} editable={editable} />
        <EditableField label="Years of Experience" value={item.years_of_experience} field="years_of_experience" onChange={onFieldChange} editable={editable} options={experienceOptions} />
        <EditableField label="Team Size" value={item.team_size} field="team_size" onChange={onFieldChange} editable={editable} type="number" />
        <EditableField label="Primary Areas" value={item.primary_areas} field="primary_areas" onChange={onFieldChange} fullWidth editable={editable} type="textarea" />
      </DetailSection>

      <DetailSection icon={Globe} title="Online Presence" color="gray">
        <EditableField label="Website" value={item.website} field="website" onChange={onFieldChange} editable={editable} />
        <EditableField label="LinkedIn" value={item.linkedin_profile} field="linkedin_profile" onChange={onFieldChange} editable={editable} />
        <EditableField label="Instagram" value={item.instagram_handle} field="instagram_handle" onChange={onFieldChange} editable={editable} />
      </DetailSection>

      <DetailSection icon={FileText} title="About" color="gray">
        <EditableField label="About" value={item.about} field="about" onChange={onFieldChange} fullWidth editable={editable} type="textarea" />
      </DetailSection>

      <DetailSection icon={Clock} title="Application Details" color="gray">
        <EditableField label="Applied On" value={formatDate(item.created_at)} field="created_at" onChange={onFieldChange} readOnly />
        <EditableField label="Current Stage" value={item.stage} field="stage" onChange={onFieldChange} readOnly />
      </DetailSection>
    </div>
  );
}

// MFD/RIA Details
function MFDRIADetails({ item, formatDate, onFieldChange, editable = false }) {
  const partnerTypeLabel = () => {
    if (item.partner_type === 'mfd') return 'MFD (Mutual Fund Distributor)';
    if (item.partner_type === 'ria') return 'RIA (Registered Investment Advisor)';
    if (item.partner_type === 'both') return 'Both MFD & RIA';
    return item.partner_type || 'MFD';
  };

  const isMFD = item.partner_type === 'mfd' || item.partner_type === 'both';
  const isRIA = item.partner_type === 'ria' || item.partner_type === 'both';

  const experienceOptions = [
    { value: '0-2', label: '0-2 Years' },
    { value: '2-5', label: '2-5 Years' },
    { value: '5-10', label: '5-10 Years' },
    { value: '10+', label: '10+ Years' }
  ];

  const aumOptions = [
    { value: 'below_1cr', label: 'Below 1 Crore' },
    { value: '1-5cr', label: '1-5 Crores' },
    { value: '5-10cr', label: '5-10 Crores' },
    { value: '10-50cr', label: '10-50 Crores' },
    { value: '50-100cr', label: '50-100 Crores' },
    { value: '100cr+', label: '100+ Crores' }
  ];

  const partnerTypeOptions = [
    { value: 'mfd', label: 'MFD (Mutual Fund Distributor)' },
    { value: 'ria', label: 'RIA (Registered Investment Advisor)' },
    { value: 'both', label: 'Both MFD & RIA' }
  ];

  const registrationTypeOptions = [
    { value: 'individual', label: 'Individual RIA' },
    { value: 'corporate', label: 'Corporate RIA' }
  ];

  return (
    <div>
      <DetailSection icon={User} title="Personal Information" color="purple">
        <EditableField label="Full Name" value={item.name || item.full_name} field="name" onChange={onFieldChange} editable={editable} />
        <EditableField label="Email" value={item.email} field="email" onChange={onFieldChange} editable={editable} type="email" />
        <EditableField label="Mobile" value={item.phone || item.mobile_number} field="phone" onChange={onFieldChange} editable={editable} />
        <EditableField label="Partner Type" value={item.partner_type} field="partner_type" onChange={onFieldChange} editable={editable} options={partnerTypeOptions} />
      </DetailSection>

      <DetailSection icon={CreditCard} title="Professional Details" color="gray">
        <EditableField label="PAN Number" value={item.pan} field="pan" onChange={onFieldChange} editable={editable} />
        <EditableField label="Years of Experience" value={item.years_of_experience} field="years_of_experience" onChange={onFieldChange} editable={editable} options={experienceOptions} />
        <EditableField label="Current AUM" value={item.current_aum} field="current_aum" onChange={onFieldChange} editable={editable} options={aumOptions} />
      </DetailSection>

      {isMFD && (
        <DetailSection icon={Award} title="MFD Details (AMFI)" color="blue">
          <EditableField label="ARN Number" value={item.arn} field="arn" onChange={onFieldChange} editable={editable} />
          <EditableField label="EUIN" value={item.euin} field="euin" onChange={onFieldChange} editable={editable} />
        </DetailSection>
      )}

      {isRIA && (
        <DetailSection icon={Award} title="RIA Details (SEBI)" color="purple">
          <EditableField label="SEBI Registration Number" value={item.sebi_registration_number} field="sebi_registration_number" onChange={onFieldChange} editable={editable} />
          <EditableField label="Registration Type" value={item.registration_type} field="registration_type" onChange={onFieldChange} editable={editable} options={registrationTypeOptions} />
        </DetailSection>
      )}

      <DetailSection icon={MapPin} title="Address Details" color="gray">
        <EditableField label="City" value={item.city} field="city" onChange={onFieldChange} editable={editable} />
        <EditableField label="State" value={item.state} field="state" onChange={onFieldChange} editable={editable} />
        <EditableField label="Pincode" value={item.pincode} field="pincode" onChange={onFieldChange} editable={editable} />
        <EditableField label="Full Address" value={item.address} field="address" onChange={onFieldChange} fullWidth editable={editable} type="textarea" />
      </DetailSection>

      <DetailSection icon={FileText} title="About" color="gray">
        <EditableField label="About" value={item.about} field="about" onChange={onFieldChange} fullWidth editable={editable} type="textarea" />
      </DetailSection>

      <DetailSection icon={Clock} title="Application Details" color="gray">
        <EditableField label="Applied On" value={formatDate(item.created_at)} field="created_at" onChange={onFieldChange} readOnly />
      </DetailSection>
    </div>
  );
}

// KYC Verification List Component
function KYCVerificationList({ items, onVerify, loading }) {
  const [processingId, setProcessingId] = useState(null);
  
  const handleVerify = async (clientId) => {
    setProcessingId(clientId);
    await onVerify(clientId);
    setProcessingId(null);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      return format(new Date(dateStr), "MMM dd, yyyy");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {items.map((client) => (
        <div 
          key={client.id}
          className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center">
                  <User className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800">{client.name}</h4>
                  <p className="text-sm text-gray-500">{client.email}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                <div>
                  <span className="text-gray-500">PAN:</span>
                  <span className="ml-2 font-mono">{client.pan_number || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Passport Type:</span>
                  <span className="ml-2 capitalize">{client.passport_type || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Residency:</span>
                  <span className="ml-2">{client.country_of_residency || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Submitted:</span>
                  <span className="ml-2">{formatDate(client.kyc_submitted_at)}</span>
                </div>
              </div>

              {/* KYC Documents */}
              {client.kyc_documents && client.kyc_documents.length > 0 && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Uploaded Documents ({client.kyc_documents.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {client.kyc_documents.map((doc, idx) => (
                      <Badge key={idx} variant="outline" className="bg-gray-50">
                        <FileText className="h-3 w-3 mr-1" />
                        {doc.filename}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="ml-4">
              <Button
                onClick={() => handleVerify(client.id)}
                disabled={processingId === client.id}
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                {processingId === client.id ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Verify KYC
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Interest Details Component
function InterestDetails({ item, formatDate }) {
  return (
    <div className="space-y-6">
      {/* Contact Information - Prominently displayed */}
      <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
        <h3 className="font-semibold text-pink-800 mb-3 flex items-center gap-2">
          <User className="h-4 w-4" />
          Contact Information
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-3 border border-pink-100">
            <p className="text-xs text-gray-500 uppercase mb-1">Name</p>
            <p className="font-semibold text-gray-800">{item.client_name || item.name || 'N/A'}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-pink-100">
            <p className="text-xs text-gray-500 uppercase mb-1">Email</p>
            <a 
              href={`mailto:${item.client_email || item.email}`} 
              className="font-semibold text-blue-600 hover:underline"
            >
              {item.client_email || item.email || 'N/A'}
            </a>
          </div>
          <div className="bg-white rounded-lg p-3 border border-pink-100">
            <p className="text-xs text-gray-500 uppercase mb-1">Phone</p>
            <a 
              href={`tel:${item.client_mobile || item.client_phone || item.phone}`} 
              className="font-semibold text-blue-600 hover:underline"
            >
              {item.client_mobile || item.client_phone || item.phone || 'N/A'}
            </a>
          </div>
          <div className="bg-white rounded-lg p-3 border border-pink-100">
            <p className="text-xs text-gray-500 uppercase mb-1">PAN Number</p>
            <p className="font-semibold text-gray-800 font-mono">{item.client_pan || item.pan || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Opportunity Details */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Opportunity Details
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Opportunity</p>
            <p className="font-semibold text-gray-800">{item.opportunity_name || item.bond_name || item.property_name || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Type</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              item.opportunity_type === 'real_estate' 
                ? 'bg-orange-100 text-orange-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {item.opportunity_type === 'real_estate' ? 'Real Estate' : 'NCD'}
            </span>
          </div>
          {item.investment_amount && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Investment Amount</p>
              <p className="font-semibold text-gray-800">₹ {item.investment_amount.toLocaleString('en-IN')}</p>
            </div>
          )}
          {item.interest_percentage && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Interest Percentage</p>
              <p className="font-semibold text-gray-800">{item.interest_percentage}%</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Interest Date</p>
            <p className="font-semibold text-gray-800">{formatDate(item.created_at || item.interest_date)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Status</p>
            <StatusBadge status={item.status || 'open'} />
          </div>
        </div>
      </div>

      {/* Not Interested Reason */}
      {item.status === 'not_interested' && item.not_interested_reason && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            Reason for Not Interested
          </h3>
          <p className="text-red-700">{item.not_interested_reason}</p>
        </div>
      )}

      {/* Notes */}
      {item.notes && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Notes
          </h3>
          <p className="text-gray-700">{item.notes}</p>
        </div>
      )}
    </div>
  );
}
