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
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Table Header - matching broker's Tagged (Pending) view */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Date of Repayment</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Bond Name (Deal ID)</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Net Repayment</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Round Down Inv. Amt</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">UCC</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Portfolio</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                      {activeTab === 'pending' && (
                        <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Flatten all items with their allocations for table display
                      const flatItems = [];
                      getCurrentItems().forEach((bond) => {
                        bond.items.forEach((item) => {
                          // If item has allocations, create a row for each
                          if (item.allocations && item.allocations.length > 0) {
                            item.allocations.forEach((alloc, allocIdx) => {
                              flatItems.push({
                                ...item,
                                allocation: alloc,
                                isFirst: allocIdx === 0,
                                isLast: allocIdx === item.allocations.length - 1,
                                hasMultiple: item.allocations.length > 1,
                                allocCount: item.allocations.length
                              });
                            });
                          } else {
                            // No allocations - single row
                            flatItems.push({
                              ...item,
                              allocation: null,
                              isFirst: true,
                              isLast: true,
                              hasMultiple: false,
                              allocCount: 1
                            });
                          }
                        });
                      });

                      return flatItems.map((item, idx) => {
                        const isPending = activeTab === 'pending';
                        const isApproved = activeTab === 'approved';
                        const isRejected = activeTab === 'rejected';

                        return (
                          <tr 
                            key={`${item.id}-${idx}`}
                            className={`
                              ${item.hasMultiple ? (item.isFirst ? 'border-t-2 border-green-200' : '') : 'border-t border-gray-100'}
                              ${item.hasMultiple && item.isLast ? '' : 'border-b border-gray-100'}
                              ${item.hasMultiple ? 'bg-green-50/30' : 'hover:bg-gray-50'}
                            `}
                          >
                            {/* Date of Repayment - only show on first row of grouped items */}
                            <td className={`px-4 py-3 ${item.hasMultiple && !item.isFirst ? 'border-l-4 border-green-300' : ''}`}>
                              {item.isFirst && (
                                <span className="whitespace-nowrap font-medium text-gray-900">
                                  {formatDate(item.date)}
                                </span>
                              )}
                            </td>
                            
                            {/* Bond Name (Deal ID) - only show on first row */}
                            <td className="px-4 py-3">
                              {item.isFirst && (
                                <div>
                                  <div className="font-medium text-gray-900">{item.bond_name}</div>
                                  {item.bond_code && (
                                    <div className="text-xs text-gray-500">({item.bond_code})</div>
                                  )}
                                </div>
                              )}
                            </td>
                            
                            {/* Net Repayment Amount */}
                            <td className="px-4 py-3 text-right font-mono text-gray-900">
                              {formatCurrency(
                                item.allocation 
                                  ? (item.allocation.amount || item.allocation.net_amount || 0)
                                  : (item.reinvestment_amount || getAmount(item))
                              )}
                            </td>
                            
                            {/* Round Down Investment Amount */}
                            <td className="px-4 py-3 text-right font-mono text-green-700 font-semibold">
                              {formatCurrency(
                                item.allocation 
                                  ? (item.allocation.rounded_amount || item.allocation.round_down_amount || item.allocation.amount || 0)
                                  : (item.rounded_total || getAmount(item))
                              )}
                            </td>
                            
                            {/* UCC */}
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-xs font-mono">
                                {item.allocation?.ucc || item.ucc || item.target_ucc || '-'}
                              </Badge>
                            </td>
                            
                            {/* Portfolio */}
                            <td className="px-4 py-3">
                              <Badge className="bg-blue-100 text-blue-700 text-xs capitalize">
                                {item.allocation?.portfolio_name || item.allocation?.portfolio || item.portfolio_category || '-'}
                              </Badge>
                            </td>
                            
                            {/* Status */}
                            <td className="px-4 py-3 text-center">
                              {isPending ? (
                                <Badge className="bg-amber-100 text-amber-700 text-xs">
                                  <Clock className="h-3 w-3 mr-1 inline" />
                                  Pending
                                </Badge>
                              ) : isApproved ? (
                                <Badge className="bg-green-100 text-green-700 text-xs">
                                  <Check className="h-3 w-3 mr-1 inline" />
                                  Approved
                                </Badge>
                              ) : isRejected ? (
                                <Badge className="bg-red-100 text-red-700 text-xs">
                                  <X className="h-3 w-3 mr-1 inline" />
                                  Rejected
                                </Badge>
                              ) : (
                                <Badge className="bg-gray-100 text-gray-600 text-xs">
                                  {item.approval_status || '-'}
                                </Badge>
                              )}
                            </td>
                            
                            {/* Actions - only show for pending and on first row */}
                            {activeTab === 'pending' && (
                              <td className="px-4 py-3 text-center">
                                {item.isFirst && (
                                  <div className="flex items-center justify-center gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => setConfirmDialog({ open: true, type: 'approve', item })}
                                      disabled={processing === item.id}
                                      className="bg-green-600 hover:bg-green-700 h-8 px-3"
                                    >
                                      {processing === item.id ? (
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Check className="h-3 w-3" />
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setConfirmDialog({ open: true, type: 'reject', item })}
                                      disabled={processing === item.id}
                                      className="text-red-600 border-red-200 hover:bg-red-50 h-8 px-3"
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
              
              {/* Summary Footer */}
              <div className="bg-gray-50 border-t border-gray-200 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm text-gray-600">
                    Showing <span className="font-semibold">{getCurrentItems().reduce((sum, bond) => sum + bond.items.length, 0)}</span> entries
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm">
                      <span className="text-gray-500">Total Net Repayment:</span>
                      <span className="font-semibold text-gray-800 ml-2">
                        {formatCurrency(getCurrentItems().reduce((sum, bond) => 
                          sum + bond.items.reduce((s, item) => s + (item.reinvestment_amount || getAmount(item)), 0), 0
                        ))}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-500">Total Investment:</span>
                      <span className="font-semibold text-green-700 ml-2">
                        {formatCurrency(getCurrentItems().reduce((sum, bond) => 
                          sum + bond.items.reduce((s, item) => s + (item.rounded_total || getAmount(item)), 0), 0
                        ))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
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
