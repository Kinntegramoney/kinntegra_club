import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  CheckCircle, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp,
  Wallet, TrendingUp, Calendar, AlertCircle, Info, Ban, Pencil, ArrowRight
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ClientApprovals() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [activeTab, setActiveTab] = useState("new");
  
  // Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [notes, setNotes] = useState("");

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
    if (parsedUser.role !== "client") {
      navigate("/broker/dashboard");
      return;
    }
    
    setUser(parsedUser);
    fetchPendingApprovals();
  }, [navigate]);

  const fetchPendingApprovals = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/pending-approvals`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPendingApprovals(response.data || []);
    } catch (error) {
      console.error("Error fetching pending approvals:", error);
      if (error.response?.status !== 404) {
        toast.error("Failed to load pending approvals");
      }
    } finally {
      setLoading(false);
    }
  };

  // Filter approvals by type
  const newApprovals = pendingApprovals.filter(a => a.approval_status === 'pending' || a.approval_status === 'pending_reapproval');
  const cancellationApprovals = pendingApprovals.filter(a => a.approval_status === 'cancellation_pending');
  const editApprovals = pendingApprovals.filter(a => a.approval_status === 'edit_pending');

  const openConfirmModal = (item, action) => {
    setSelectedItem(item);
    setActionType(action);
    setNotes("");
    setShowConfirmModal(true);
  };

  const handleApprovalAction = async () => {
    if (!selectedItem || !actionType) return;
    
    setProcessingId(selectedItem.id);
    try {
      const token = localStorage.getItem("token");
      
      await axios.post(
        `${API}/client/approve-reinvestment/${selectedItem.id}`,
        {
          action: actionType,
          notes: notes
        },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      const approvalType = selectedItem.approval_status;
      let successMsg = '';
      
      if (approvalType === 'cancellation_pending') {
        successMsg = actionType === 'approve' 
          ? 'Cancellation approved. Reinvestment has been cancelled.' 
          : 'Cancellation rejected. Original reinvestment remains active.';
      } else if (approvalType === 'edit_pending') {
        successMsg = actionType === 'approve' 
          ? 'Edit approved! Updated reinvestment will be scheduled.' 
          : 'Edit rejected. Original values restored.';
      } else {
        successMsg = actionType === 'approve' 
          ? 'Reinvestment approved! Investment will be scheduled.' 
          : 'Reinvestment rejected.';
      }
      
      toast.success(successMsg);
      setShowConfirmModal(false);
      fetchPendingApprovals();
    } catch (error) {
      toast.error(error.response?.data?.detail || `Failed to ${actionType}`);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      return format(new Date(dateStr), "dd MMM yyyy");
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
  };

  // Round down to nearest 100 for investment amount
  const roundToHundred = (amount) => {
    if (!amount || amount <= 0) return 0;
    return Math.floor(amount / 100) * 100;
  };

  // Client Approval Table Component - matches broker's Tagged (Pending) format exactly
  const ClientApprovalTable = ({ items, onApprove, onReject, processingId, formatCurrency, formatDate }) => {
    // Group items by bond with allocations (matching broker's structure)
    const groupItemsByBond = (entries) => {
      const bondGroups = {};
      entries.forEach(entry => {
        const bondKey = `${entry.bond_id || 'unknown'}_${entry.cashflow_id || entry.id}`;
        if (!bondGroups[bondKey]) {
          bondGroups[bondKey] = {
            bond_id: entry.bond_id,
            bond_name: entry.bond_name,
            bond_code: entry.bond_code || entry.deal_id || '',
            date: entry.expected_date || entry.date,
            entry: entry,
            allocations: [],
            total_net_amount: 0,
            total_round_down_amount: 0
          };
        }
        
        const netAmount = entry.net_amount || entry.amount || 0;
        const roundDownAmount = entry.amount || roundToHundred(netAmount);
        
        // If entry has allocations from the backend
        if (entry.allocations && entry.allocations.length > 0) {
          entry.allocations.forEach(alloc => {
            const allocRoundDown = roundToHundred(alloc.amount || 0);
            bondGroups[bondKey].allocations.push({
              entry_id: entry.id,
              entry: entry,
              ucc: alloc.ucc || alloc.target_ucc || entry.ucc || entry.target_ucc || '-',
              portfolio: alloc.portfolio || alloc.portfolio_name || entry.portfolio || entry.portfolio_category || '-',
              net_amount: alloc.amount || 0,
              round_down_amount: allocRoundDown,
              investment_date: alloc.investment_date || alloc.mf_investment_date || entry.mf_investment_date,
              tagged_by_name: entry.tagged_by_name || 'Broker',
              is_sub_broker: entry.tagged_by_sub_broker
            });
            bondGroups[bondKey].total_round_down_amount += allocRoundDown;
          });
        } else {
          // Single allocation
          bondGroups[bondKey].allocations.push({
            entry_id: entry.id,
            entry: entry,
            ucc: entry.ucc || entry.target_ucc || '-',
            portfolio: entry.portfolio || entry.portfolio_category || '-',
            net_amount: netAmount,
            round_down_amount: roundDownAmount,
            investment_date: entry.mf_investment_date || entry.investment_date,
            tagged_by_name: entry.tagged_by_name || 'Broker',
            is_sub_broker: entry.tagged_by_sub_broker
          });
          bondGroups[bondKey].total_round_down_amount += roundDownAmount;
        }
        
        bondGroups[bondKey].total_net_amount += netAmount;
      });
      return bondGroups;
    };

    const bondGroups = groupItemsByBond(items);
    const totalNetAmount = Object.values(bondGroups).reduce((sum, b) => sum + b.total_net_amount, 0);
    const totalRoundDownAmount = Object.values(bondGroups).reduce((sum, b) => sum + b.total_round_down_amount, 0);

    return (
      <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between bg-green-50/50 border-b border-green-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Pending Approvals</h3>
              <p className="text-sm text-gray-500">{items.length} entries awaiting your approval</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-gray-500">Net Repayment</p>
              <p className="font-semibold text-gray-800">₹{formatCurrency(totalNetAmount)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Investment Amt</p>
              <p className="font-semibold text-green-700">₹{formatCurrency(totalRoundDownAmount)}</p>
            </div>
          </div>
        </div>
        
        {/* Table - Matching Tagged (Pending) structure */}
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            {/* Two-level header */}
            <thead>
              <tr className="bg-gray-100">
                <th colSpan="3" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-blue-50">
                  Repayment Details
                </th>
                <th colSpan="4" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-green-50">
                  Investment Details
                </th>
                <th rowSpan="2" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200">
                  Status
                </th>
                <th rowSpan="2" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200">
                  Actions
                </th>
              </tr>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Date of Repayment</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Bond Name</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Net Amount</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Date of Investment</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Portfolio</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">UCC</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Amount</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(bondGroups).map((bondGroup, bondIdx) => {
                const allocations = bondGroup.allocations;
                const hasMultiple = allocations.length > 1;
                const rowCount = allocations.length;
                const primaryEntry = bondGroup.entry;
                const isReapproval = primaryEntry.approval_status === 'pending_reapproval';
                
                return (
                  <React.Fragment key={bondIdx}>
                    {allocations.map((alloc, allocIdx) => {
                      const isFirst = allocIdx === 0;
                      
                      return (
                        <tr 
                          key={`${bondIdx}-${allocIdx}`}
                          className={`
                            ${hasMultiple ? (isFirst ? 'border-t-2 border-t-green-400' : '') : ''}
                            ${hasMultiple ? 'bg-green-50/30' : 'hover:bg-gray-50'}
                          `}
                        >
                          {/* Date of Repayment - merged */}
                          {isFirst && (
                            <td 
                              className={`px-3 py-2 border border-gray-200 align-middle ${hasMultiple ? 'border-l-4 border-l-green-400' : ''}`}
                              rowSpan={hasMultiple ? rowCount : 1}
                            >
                              <span className="whitespace-nowrap font-medium text-gray-800">
                                {formatDate(bondGroup.date)}
                              </span>
                            </td>
                          )}
                          
                          {/* Bond Name - merged */}
                          {isFirst && (
                            <td 
                              className="px-3 py-2 border border-gray-200 align-middle"
                              rowSpan={hasMultiple ? rowCount : 1}
                            >
                              <div>
                                <div className="font-medium text-gray-800">{bondGroup.bond_name}</div>
                                {bondGroup.bond_code && (
                                  <div className="text-xs text-gray-500">({bondGroup.bond_code})</div>
                                )}
                              </div>
                            </td>
                          )}
                          
                          {/* Net Amount - per allocation */}
                          <td className="px-3 py-2 text-right font-mono text-gray-800 border border-gray-200">
                            ₹{formatCurrency(alloc.net_amount || 0)}
                          </td>
                          
                          {/* Date of Investment */}
                          <td className="px-3 py-2 border border-gray-200">
                            <span className="whitespace-nowrap text-gray-700">
                              {alloc.investment_date ? format(new Date(alloc.investment_date), "dd MMM yyyy") : '-'}
                            </span>
                          </td>
                          
                          {/* Portfolio */}
                          <td className="px-3 py-2 border border-gray-200">
                            <Badge className="bg-blue-100 text-blue-700 text-xs capitalize">
                              {alloc.portfolio || '-'}
                            </Badge>
                          </td>
                          
                          {/* UCC */}
                          <td className="px-3 py-2 border border-gray-200">
                            <Badge variant="outline" className="text-xs font-mono">
                              {alloc.ucc || '-'}
                            </Badge>
                          </td>
                          
                          {/* Amount (Round Down) */}
                          <td className="px-3 py-2 text-right font-mono text-green-700 font-semibold border border-gray-200">
                            ₹{formatCurrency(alloc.round_down_amount || 0)}
                          </td>
                          
                          {/* Status - merged */}
                          {isFirst && (
                            <td 
                              className="px-3 py-2 text-center border border-gray-200 align-middle"
                              rowSpan={hasMultiple ? rowCount : 1}
                            >
                              <Badge className={isReapproval ? "bg-amber-100 text-amber-700 text-xs" : "bg-amber-100 text-amber-700 text-xs"}>
                                <Clock className="h-3 w-3 mr-1 inline" />
                                {isReapproval ? 'Re-approval' : 'Pending'}
                              </Badge>
                            </td>
                          )}
                          
                          {/* Actions - merged */}
                          {isFirst && (
                            <td 
                              className="px-3 py-2 text-center border border-gray-200 align-middle"
                              rowSpan={hasMultiple ? rowCount : 1}
                            >
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="sm"
                                  onClick={() => onApprove(primaryEntry)}
                                  disabled={processingId === primaryEntry.id}
                                  className="h-7 px-2 bg-green-600 hover:bg-green-700"
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onReject(primaryEntry)}
                                  disabled={processingId === primaryEntry.id}
                                  className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    
                    {/* Total row for multi-allocation */}
                    {hasMultiple && (
                      <tr className="bg-green-100/50 border-b-2 border-b-green-400">
                        <td colSpan="2" className="px-3 py-2 text-right font-semibold text-gray-700 border border-gray-200">
                          Total for {bondGroup.bond_name}:
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-gray-800 border border-gray-200">
                          ₹{formatCurrency(bondGroup.total_net_amount || 0)}
                        </td>
                        <td colSpan="3" className="border border-gray-200"></td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-green-700 border border-gray-200">
                          ₹{formatCurrency(bondGroup.total_round_down_amount || 0)}
                        </td>
                        <td colSpan="2" className="border border-gray-200"></td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          
          {/* Overall Total */}
          <div className="mt-3 p-3 bg-green-100 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-medium text-green-800">
                Total Investment
              </span>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-green-700">Net Repayment</p>
                  <p className="font-bold text-green-800">₹{formatCurrency(totalNetAmount)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-green-700">Investment Amount</p>
                  <p className="font-bold text-green-800 text-lg">₹{formatCurrency(totalRoundDownAmount)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const getTagLabel = (tag) => {
    const labels = {
      'principal': 'Principal Only',
      'interest': 'Interest Only',
      'both': 'Principal + Interest',
      'none': 'No Reinvestment',
      'custom': 'Custom Amount'
    };
    return labels[tag] || tag;
  };

  const getPortfolioLabel = (portfolio) => {
    const labels = {
      'wealth': 'Wealth Portfolio',
      'short_term': 'Short Term Portfolio',
      'bonds': 'Bonds',
      'real_estate': 'Real Estate',
      'none': 'No Portfolio'
    };
    return labels[portfolio] || portfolio;
  };

  // Render individual approval item
  const renderApprovalItem = (item) => {
    const isCancellation = item.approval_status === 'cancellation_pending';
    const isEdit = item.approval_status === 'edit_pending';
    
    return (
      <div key={item.id} className="p-4 hover:bg-gray-50" data-testid={`approval-${item.id}`}>
        <div className="flex items-start justify-between gap-4">
          {/* Left: Main Info */}
          <div className="flex items-start gap-3 flex-1">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isCancellation ? 'bg-red-100' : isEdit ? 'bg-amber-100' : 'bg-teal-100'
            }`}>
              {isCancellation ? (
                <Ban className="h-5 w-5 text-red-600" />
              ) : isEdit ? (
                <Pencil className="h-5 w-5 text-amber-600" />
              ) : (
                <TrendingUp className="h-5 w-5 text-teal-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-gray-800">{item.bond_name}</h4>
                {isCancellation && (
                  <Badge className="bg-red-100 text-red-700 text-xs">Cancellation Request</Badge>
                )}
                {isEdit && (
                  <Badge className="bg-amber-100 text-amber-700 text-xs">Edit Request</Badge>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                Maturity: {formatDate(item.expected_date)}
              </p>
              
              {/* Cancellation Reason */}
              {isCancellation && item.cancellation_reason && (
                <div className="mt-2 p-2 bg-red-50 rounded-lg border border-red-100">
                  <p className="text-xs text-red-700">
                    <span className="font-medium">Reason: </span>{item.cancellation_reason}
                  </p>
                </div>
              )}
              
              {/* Edit Changes */}
              {isEdit && item.original_values && (
                <div className="mt-2 p-2 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-xs font-medium text-amber-800 mb-1">Changes requested:</p>
                  <div className="space-y-1">
                    {item.original_values.reinvestment_tag !== item.reinvestment_tag && (
                      <p className="text-xs text-amber-700">
                        Tag: {getTagLabel(item.original_values.reinvestment_tag)} <ArrowRight className="h-3 w-3 inline mx-1" /> {getTagLabel(item.reinvestment_tag)}
                      </p>
                    )}
                    {item.original_values.portfolio_category !== item.portfolio_category && (
                      <p className="text-xs text-amber-700">
                        Portfolio: {getPortfolioLabel(item.original_values.portfolio_category)} <ArrowRight className="h-3 w-3 inline mx-1" /> {getPortfolioLabel(item.portfolio_category)}
                      </p>
                    )}
                    {item.original_values.target_ucc !== item.target_ucc && (
                      <p className="text-xs text-amber-700">
                        UCC: {item.original_values.target_ucc || 'Default'} <ArrowRight className="h-3 w-3 inline mx-1" /> {item.target_ucc || 'Default'}
                      </p>
                    )}
                    {item.edit_reason && (
                      <p className="text-xs text-amber-600 mt-1 italic">Reason: {item.edit_reason}</p>
                    )}
                  </div>
                </div>
              )}
              
              {/* Investment Details */}
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-xs text-gray-500">Net Amount</p>
                  <p className="font-semibold text-gray-800">₹{formatCurrency(item.net_amount)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-xs text-gray-500">Reinvest Tag</p>
                  <p className="font-medium text-teal-700 text-sm">{getTagLabel(item.reinvestment_tag)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-xs text-gray-500">Portfolio</p>
                  <p className="font-medium text-gray-700 text-sm">{getPortfolioLabel(item.portfolio_category)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-xs text-gray-500">Target UCC</p>
                  <p className="font-medium text-gray-700 text-sm">{item.target_ucc || 'Default'}</p>
                </div>
              </div>
              
              {/* Split Allocations if present */}
              {item.has_split_allocations && item.ucc_allocations?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-2">Split Allocations:</p>
                  <div className="flex flex-wrap gap-2">
                    {item.ucc_allocations.map((alloc, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {alloc.ucc}: ₹{formatCurrency(alloc.amount)} → {alloc.portfolio}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Tagged By */}
              <p className="text-xs text-gray-400 mt-3">
                {isCancellation ? 'Cancellation requested' : isEdit ? 'Edited' : 'Tagged'} by: {item.tagged_by_name} on {formatDate(isCancellation ? item.cancellation_requested_at : isEdit ? item.last_edited_at : item.created_at)}
              </p>
            </div>
          </div>
          
          {/* Right: Actions */}
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              onClick={() => openConfirmModal(item, 'approve')}
              disabled={processingId === item.id}
              className={isCancellation ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {isCancellation ? 'Approve Cancel' : isEdit ? 'Approve Edit' : 'Approve'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openConfirmModal(item, 'reject')}
              disabled={processingId === item.id}
              className={isCancellation ? "text-teal-600 border-teal-200 hover:bg-teal-50" : "text-red-600 border-red-200 hover:bg-red-50"}
            >
              <XCircle className="h-4 w-4 mr-1" />
              {isCancellation ? 'Keep Active' : isEdit ? 'Reject Edit' : 'Reject'}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Render empty state for a tab
  const renderEmptyState = (type) => (
    <div className="text-center py-12">
      <div className="w-16 h-16 rounded-full bg-green-100 mx-auto mb-4 flex items-center justify-center">
        <CheckCircle className="h-8 w-8 text-green-500" />
      </div>
      <h3 className="text-lg font-medium text-gray-600 mb-1">All Caught Up!</h3>
      <p className="text-gray-400 text-sm">
        {type === 'new' && 'No new reinvestment approvals'}
        {type === 'cancellation' && 'No cancellation requests pending'}
        {type === 'edit' && 'No edit requests pending'}
      </p>
    </div>
  );

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex" data-testid="client-approvals-page">
      <ClientSidebar user={user} />

      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800" data-testid="approvals-title">Pending Approvals</h1>
                <p className="text-sm text-gray-500">Review and approve reinvestment requests from your broker</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchPendingApprovals}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="mx-6 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-800 font-medium">About Reinvestment Approvals</p>
              <p className="text-sm text-blue-700 mt-1">
                Your broker has tagged upcoming maturity amounts for reinvestment. 
                Once approved, the funds will be automatically invested in mutual funds through Kinntegra.
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="bg-white rounded-lg border border-gray-200 text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-teal-600 mx-auto mb-3" />
              <p className="text-gray-500">Loading...</p>
            </div>
          ) : pendingApprovals.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 text-center py-12">
              <div className="w-16 h-16 rounded-full bg-green-100 mx-auto mb-4 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-600 mb-1">All Caught Up!</h3>
              <p className="text-gray-400 text-sm">No pending approvals at the moment</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="border-b px-4">
                  <TabsList className="h-12 bg-transparent">
                    <TabsTrigger 
                      value="new" 
                      className="data-[state=active]:border-b-2 data-[state=active]:border-teal-600 rounded-none"
                    >
                      New Approvals
                      {newApprovals.length > 0 && (
                        <Badge className="ml-2 bg-teal-100 text-teal-700">{newApprovals.length}</Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger 
                      value="cancellation" 
                      className="data-[state=active]:border-b-2 data-[state=active]:border-red-600 rounded-none"
                    >
                      Cancellations
                      {cancellationApprovals.length > 0 && (
                        <Badge className="ml-2 bg-red-100 text-red-700">{cancellationApprovals.length}</Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger 
                      value="edit" 
                      className="data-[state=active]:border-b-2 data-[state=active]:border-amber-600 rounded-none"
                    >
                      Edits
                      {editApprovals.length > 0 && (
                        <Badge className="ml-2 bg-amber-100 text-amber-700">{editApprovals.length}</Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="new" className="m-0">
                  {newApprovals.length === 0 ? (
                    renderEmptyState('new')
                  ) : (
                    <ClientApprovalTable 
                      items={newApprovals}
                      onApprove={(item) => openConfirmModal(item, 'approve')}
                      onReject={(item) => openConfirmModal(item, 'reject')}
                      processingId={processingId}
                      formatCurrency={formatCurrency}
                      formatDate={formatDate}
                    />
                  )}
                </TabsContent>

                <TabsContent value="cancellation" className="m-0">
                  {cancellationApprovals.length === 0 ? (
                    renderEmptyState('cancellation')
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {cancellationApprovals.map(item => renderApprovalItem(item))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="edit" className="m-0">
                  {editApprovals.length === 0 ? (
                    renderEmptyState('edit')
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {editApprovals.map(item => renderApprovalItem(item))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedItem?.approval_status === 'cancellation_pending' ? (
                actionType === 'approve' ? 'Confirm Cancellation' : 'Keep Reinvestment Active'
              ) : selectedItem?.approval_status === 'edit_pending' ? (
                actionType === 'approve' ? 'Confirm Edit' : 'Reject Edit'
              ) : (
                actionType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedItem?.approval_status === 'cancellation_pending' ? (
                actionType === 'approve' 
                  ? 'By approving, the reinvestment will be cancelled and funds will not be invested.' 
                  : 'By rejecting, the original reinvestment will remain active.'
              ) : selectedItem?.approval_status === 'edit_pending' ? (
                actionType === 'approve' 
                  ? 'By approving, the updated reinvestment details will be applied.' 
                  : 'By rejecting, the original values will be restored.'
              ) : (
                actionType === 'approve' 
                  ? 'By approving, you authorize the reinvestment to be scheduled through Kinntegra. This action cannot be undone.' 
                  : 'Are you sure you want to reject this reinvestment request?'
              )}
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="py-4">
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Bond</span>
                  <span className="text-sm font-medium">{selectedItem.bond_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Amount</span>
                  <span className="text-sm font-medium">₹{formatCurrency(selectedItem.net_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Reinvest Type</span>
                  <span className="text-sm font-medium">{getTagLabel(selectedItem.reinvestment_tag)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Portfolio</span>
                  <span className="text-sm font-medium">{getPortfolioLabel(selectedItem.portfolio_category)}</span>
                </div>
              </div>
              
              <div className="mt-4">
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Notes (Optional)
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={actionType === 'approve' ? "Any special instructions..." : "Reason for rejection..."}
                  className="min-h-[80px]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApprovalAction}
              disabled={processingId === selectedItem?.id}
              className={
                selectedItem?.approval_status === 'cancellation_pending' && actionType === 'approve' 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : actionType === 'approve' 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-red-600 hover:bg-red-700'
              }
            >
              {processingId === selectedItem?.id ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {selectedItem?.approval_status === 'cancellation_pending' ? (
                actionType === 'approve' ? 'Confirm Cancellation' : 'Keep Active'
              ) : selectedItem?.approval_status === 'edit_pending' ? (
                actionType === 'approve' ? 'Approve Edit' : 'Reject Edit'
              ) : (
                actionType === 'approve' ? 'Approve & Schedule' : 'Reject'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
