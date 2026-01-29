import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  RefreshCw, Check, X, Clock, AlertCircle, 
  IndianRupee, TrendingUp, Wallet, ChevronDown, ChevronUp,
  Calendar, Briefcase, CreditCard, FileText
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { logUserActivity } from "@/utils/activityLogger";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const TAG_LABELS = {
  'principal': 'Principal',
  'interest': 'Interest',
  'both': 'Both (P+I)',
  'net_amount': 'Net Amount',
  'custom': 'Custom',
  'other': 'Custom',
  'none': 'None',
};

export default function ClientReinvestmentApprovals() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [approvedItems, setApprovedItems] = useState([]);
  const [rejectedItems, setRejectedItems] = useState([]);
  const [activeTab, setActiveTab] = useState("pending");
  const [expandedBonds, setExpandedBonds] = useState({});
  const [processing, setProcessing] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null, item: null });

  useEffect(() => {
    document.title = "Kinntegraa | Reinvestment Approvals";
    logUserActivity('reinvestment-approvals', { extra: { action: 'view' } });
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "client") {
      navigate("/broker/dashboard");
      return;
    }
    
    setUser(parsedUser);
    fetchApprovals();
  }, [navigate]);

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/reinvestment-approvals`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const items = response.data.items || [];
      
      // Separate by status
      setPendingApprovals(items.filter(i => i.approval_status === 'pending'));
      setApprovedItems(items.filter(i => i.approval_status === 'approved' || i.client_approved));
      setRejectedItems(items.filter(i => i.approval_status === 'rejected'));
      
    } catch (error) {
      console.error("Error fetching approvals:", error);
      if (error.response?.status !== 404) {
        toast.error("Failed to load reinvestment approvals");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (item) => {
    setProcessing(item.id);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/reinvestment/approve/${item.id}`, {
        approved: true
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Reinvestment approved successfully!");
      fetchApprovals();
    } catch (error) {
      console.error("Error approving:", error);
      toast.error(error.response?.data?.detail || "Failed to approve");
    } finally {
      setProcessing(null);
      setConfirmDialog({ open: false, type: null, item: null });
    }
  };

  const handleReject = async (item) => {
    setProcessing(item.id);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/reinvestment/approve/${item.id}`, {
        approved: false,
        rejection_reason: "Rejected by client"
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Reinvestment rejected");
      fetchApprovals();
    } catch (error) {
      console.error("Error rejecting:", error);
      toast.error(error.response?.data?.detail || "Failed to reject");
    } finally {
      setProcessing(null);
      setConfirmDialog({ open: false, type: null, item: null });
    }
  };

  const handleApproveAll = async () => {
    if (pendingApprovals.length === 0) return;
    
    setProcessing('all');
    try {
      const token = localStorage.getItem("token");
      
      // Approve all pending items
      for (const item of pendingApprovals) {
        await axios.put(`${API}/reinvestment/approve/${item.id}`, {
          approved: true
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      toast.success(`Approved ${pendingApprovals.length} reinvestments!`);
      fetchApprovals();
    } catch (error) {
      console.error("Error approving all:", error);
      toast.error("Failed to approve some items");
      fetchApprovals();
    } finally {
      setProcessing(null);
    }
  };

  const formatCurrency = (amount) => {
    if (!amount) return "₹0";
    return `₹${Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd MMM yyyy");
    } catch {
      return dateStr;
    }
  };

  const getAmount = (item) => {
    const tag = item.reinvestment_tag;
    if (tag === 'principal') return item.principal_component || 0;
    if (tag === 'interest') return (item.interest_component || 0) - (item.tds_amount || 0);
    if (tag === 'both') return (item.principal_component || 0) + (item.interest_component || 0) - (item.tds_amount || 0);
    if (tag === 'custom' || tag === 'other') return item.custom_amount || 0;
    return item.net_amount || 0;
  };

  const getTotalPending = () => {
    return pendingApprovals.reduce((sum, item) => sum + getAmount(item), 0);
  };

  const toggleBondExpand = (bondId) => {
    setExpandedBonds(prev => ({
      ...prev,
      [bondId]: !prev[bondId]
    }));
  };

  // Group items by bond
  const groupByBond = (items) => {
    const groups = {};
    items.forEach(item => {
      const bondId = item.bond_id;
      if (!groups[bondId]) {
        groups[bondId] = {
          bond_id: bondId,
          bond_name: item.bond_name,
          items: []
        };
      }
      groups[bondId].items.push(item);
    });
    return Object.values(groups);
  };

  const getCurrentItems = () => {
    if (activeTab === 'pending') return groupByBond(pendingApprovals);
    if (activeTab === 'approved') return groupByBond(approvedItems);
    return groupByBond(rejectedItems);
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <ClientSidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800" data-testid="reinvestment-approvals-title">
                Reinvestment Approvals
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Review and approve reinvestment requests from your broker
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={fetchApprovals} data-testid="refresh-btn">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              {activeTab === 'pending' && pendingApprovals.length > 0 && (
                <Button 
                  onClick={handleApproveAll}
                  disabled={processing === 'all'}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="approve-all-btn"
                >
                  {processing === 'all' ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Approve All ({pendingApprovals.length})
                </Button>
              )}
            </div>
          </div>
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="bg-gradient-to-r from-yellow-500 to-amber-500 rounded-lg p-4 text-white">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                <p className="text-yellow-100 text-sm">Pending Approval</p>
              </div>
              <p className="text-2xl font-bold mt-1">{pendingApprovals.length}</p>
              <p className="text-yellow-100 text-sm">{formatCurrency(getTotalPending())}</p>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg p-4 text-white">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                <p className="text-green-100 text-sm">My Trades</p>
              </div>
              <p className="text-2xl font-bold mt-1">{approvedItems.length}</p>
              <p className="text-green-100 text-sm">{formatCurrency(approvedItems.reduce((sum, item) => sum + getAmount(item), 0))}</p>
            </div>
            <div className="bg-gradient-to-r from-red-500 to-rose-500 rounded-lg p-4 text-white">
              <div className="flex items-center gap-2">
                <X className="h-5 w-5" />
                <p className="text-red-100 text-sm">Rejected</p>
              </div>
              <p className="text-2xl font-bold mt-1">{rejectedItems.length}</p>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-4 mt-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("pending")}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "pending" 
                  ? "border-etihad-gold-600 text-etihad-gold-700" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="pending-tab"
            >
              Pending Approval ({pendingApprovals.length})
            </button>
            <button
              onClick={() => setActiveTab("approved")}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "approved" 
                  ? "border-etihad-gold-600 text-etihad-gold-700" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="my-trades-tab"
            >
              My Trades ({approvedItems.length})
            </button>
            <button
              onClick={() => setActiveTab("rejected")}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "rejected" 
                  ? "border-etihad-gold-600 text-etihad-gold-700" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="rejected-tab"
            >
              Rejected ({rejectedItems.length})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600" />
            </div>
          ) : getCurrentItems().length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border">
              <Wallet className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">
                {activeTab === 'pending' 
                  ? "No pending reinvestment approvals" 
                  : activeTab === 'approved'
                  ? "No approved trades yet"
                  : "No rejected reinvestments"}
              </p>
              <p className="text-sm text-gray-400 mt-2">
                {activeTab === 'pending' 
                  ? "When your broker tags reinvestments for you, they will appear here for approval" 
                  : activeTab === 'approved'
                  ? "Your approved reinvestments will be listed here as confirmed trades"
                  : "Reinvestments you reject will appear here for reference"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {getCurrentItems().map((bond) => (
                <div 
                  key={bond.bond_id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  {/* Bond Header */}
                  <button
                    onClick={() => toggleBondExpand(bond.bond_id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-etihad-gold-500 to-amber-600 flex items-center justify-center text-white font-bold text-sm">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-gray-800">{bond.bond_name}</p>
                        <p className="text-xs text-gray-500">{bond.items.length} entries</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-800">
                          {formatCurrency(bond.items.reduce((sum, item) => sum + getAmount(item), 0))}
                        </p>
                        <p className="text-xs text-gray-500">Total Amount</p>
                      </div>
                      {expandedBonds[bond.bond_id] 
                        ? <ChevronUp className="h-5 w-5 text-gray-400" />
                        : <ChevronDown className="h-5 w-5 text-gray-400" />
                      }
                    </div>
                  </button>
                  
                  {/* Expanded Items */}
                  {expandedBonds[bond.bond_id] && (
                    <div className="border-t border-gray-100 divide-y divide-gray-100">
                      {bond.items.map((item) => (
                        <div 
                          key={item.id} 
                          className="p-4 hover:bg-gray-50"
                        >
                          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                            <div className="flex-1 space-y-3">
                              {/* Date and Tag Header */}
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4 text-gray-400" />
                                  <span className="font-medium text-gray-700">
                                    {formatDate(item.date)}
                                  </span>
                                </div>
                                <Badge className={`text-xs ${
                                  item.reinvestment_tag === 'principal' ? 'bg-blue-100 text-blue-700' :
                                  item.reinvestment_tag === 'interest' ? 'bg-green-100 text-green-700' :
                                  item.reinvestment_tag === 'both' ? 'bg-purple-100 text-purple-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {TAG_LABELS[item.reinvestment_tag] || item.reinvestment_tag}
                                </Badge>
                              </div>
                              
                              {/* Amount Details Row */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                <div className="bg-gray-50 rounded-lg px-3 py-2">
                                  <div className="flex items-center gap-1 text-gray-500">
                                    <IndianRupee className="h-3 w-3" />
                                    <span>Reinv. Amount</span>
                                  </div>
                                  <p className="font-semibold text-gray-800 mt-1">{formatCurrency(item.reinvestment_amount || getAmount(item))}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg px-3 py-2">
                                  <div className="flex items-center gap-1 text-gray-500">
                                    <CreditCard className="h-3 w-3" />
                                    <span>Rounded Amount</span>
                                  </div>
                                  <p className="font-semibold text-gray-800 mt-1">{formatCurrency(item.rounded_total || getAmount(item))}</p>
                                </div>
                                <div className="bg-amber-50 rounded-lg px-3 py-2">
                                  <div className="flex items-center gap-1 text-amber-600">
                                    <FileText className="h-3 w-3" />
                                    <span>Round-off</span>
                                  </div>
                                  <p className="font-semibold text-amber-700 mt-1">{formatCurrency(item.round_off_total || 0)}</p>
                                </div>
                                <div className="bg-indigo-50 rounded-lg px-3 py-2">
                                  <div className="flex items-center gap-1 text-indigo-600">
                                    <Briefcase className="h-3 w-3" />
                                    <span>UCC</span>
                                  </div>
                                  <p className="font-mono font-semibold text-indigo-700 mt-1">{item.ucc || item.target_ucc || '-'}</p>
                                </div>
                              </div>
                              
                              {/* Allocations/Portfolio Details */}
                              {item.allocations && item.allocations.length > 0 ? (
                                <div className="bg-purple-50/50 rounded-lg p-3">
                                  <div className="flex items-center gap-2 text-xs text-purple-600 font-medium mb-2">
                                    <Briefcase className="h-3 w-3" />
                                    Portfolio Allocations ({item.allocations.length})
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {item.allocations.map((alloc, idx) => (
                                      <div key={idx} className="bg-white rounded px-3 py-2 text-xs border border-purple-100">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="font-medium text-purple-800 capitalize">
                                            {alloc.portfolio_name || alloc.portfolio || 'Unknown'}
                                          </span>
                                          <span className="font-semibold text-purple-700">{formatCurrency(alloc.rounded_amount || alloc.amount)}</span>
                                        </div>
                                        {/* Show UCC for this allocation */}
                                        {alloc.ucc && (
                                          <div className="flex items-center gap-1 text-indigo-600 mb-1">
                                            <CreditCard className="h-3 w-3" />
                                            <span className="font-mono">{alloc.ucc}</span>
                                          </div>
                                        )}
                                        {alloc.mf_investment_date && (
                                          <div className="flex items-center gap-1 text-purple-500">
                                            <Calendar className="h-3 w-3" />
                                            <span>MF Date: {formatDate(alloc.mf_investment_date)}</span>
                                          </div>
                                        )}
                                        {alloc.percentage > 0 && (
                                          <div className="text-purple-400 mt-1">
                                            {alloc.percentage}% allocation
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : item.portfolio_category && (
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="bg-purple-50 px-3 py-2 rounded-lg">
                                    <span className="text-purple-500">Portfolio:</span>{' '}
                                    <span className="font-semibold text-purple-700 capitalize">{item.portfolio_category?.replace('_', ' ')}</span>
                                  </span>
                                </div>
                              )}
                            </div>
                            
                            {/* Actions Column */}
                            <div className="flex lg:flex-col gap-2 lg:min-w-[140px]">
                              {activeTab === 'pending' && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => setConfirmDialog({ open: true, type: 'approve', item })}
                                    disabled={processing === item.id}
                                    className="bg-green-600 hover:bg-green-700 flex-1"
                                  >
                                    {processing === item.id ? (
                                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                    ) : (
                                      <Check className="h-4 w-4 mr-1" />
                                    )}
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setConfirmDialog({ open: true, type: 'reject', item })}
                                    disabled={processing === item.id}
                                    className="text-red-600 border-red-200 hover:bg-red-50 flex-1"
                                  >
                                    <X className="h-4 w-4 mr-1" />
                                    Reject
                                  </Button>
                                </>
                              )}
                              
                              {activeTab === 'approved' && (
                                <Badge className="bg-green-100 text-green-700 w-full justify-center py-2">
                                  <Check className="h-4 w-4 mr-1" />
                                  Trade Confirmed
                                </Badge>
                              )}
                              
                              {activeTab === 'rejected' && (
                                <Badge className="bg-red-100 text-red-700 w-full justify-center py-2">
                                  <X className="h-4 w-4 mr-1" />
                                  Rejected
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, type: null, item: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.type === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.type === 'approve' 
                ? `Are you sure you want to approve the reinvestment of ${formatCurrency(getAmount(confirmDialog.item || {}))} for ${confirmDialog.item?.bond_name}?`
                : `Are you sure you want to reject this reinvestment request?`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setConfirmDialog({ open: false, type: null, item: null })}
            >
              Cancel
            </Button>
            <Button
              onClick={() => confirmDialog.type === 'approve' 
                ? handleApprove(confirmDialog.item) 
                : handleReject(confirmDialog.item)
              }
              className={confirmDialog.type === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {confirmDialog.type === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
