import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
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

  // Helper function to round to nearest 100
  const roundToHundred = (amount) => {
    return Math.floor(amount / 100) * 100;
  };

  // Group items by bond with allocations (matching broker's structure)
  const groupItemsByBond = (items) => {
    const entriesByBond = {};
    
    items.forEach(item => {
      const bondKey = `${item.bond_id}_${item.date}`;
      
      if (!entriesByBond[bondKey]) {
        entriesByBond[bondKey] = {
          bond_id: item.bond_id,
          bond_name: item.bond_name,
          bond_code: item.bond_code || item.deal_id || '',
          date: item.date,
          entry: item,
          allocations: [],
          total_net_amount: 0,
          total_round_down_amount: 0
        };
      }
      
      // Use net_amount for display (total cashflow), not reinvestment_amount
      // This matches the broker's "Net Amount" column which shows total cashflow
      const displayNetAmount = item.net_amount || item.reinvestment_amount || getAmount(item);
      const investmentAmount = item.reinvestment_amount || getAmount(item);
      const roundDownAmount = roundToHundred(investmentAmount);
      
      // Calculate default investment date (T+1 of repayment)
      const repaymentDate = item.date || item.expected_date;
      const defaultInvestmentDate = repaymentDate 
        ? format(addDays(new Date(repaymentDate), 1), 'yyyy-MM-dd')
        : null;
      
      // If item has allocations from the backend
      if (item.allocations && item.allocations.length > 0) {
        item.allocations.forEach(alloc => {
          const allocRoundDown = roundToHundred(alloc.amount || 0);
          const allocUcc = alloc.ucc || item.ucc || '';
          const allocPortfolio = alloc.portfolio_name || alloc.portfolio || item.portfolio_category || '';
          entriesByBond[bondKey].allocations.push({
            entry_id: item.id,
            ucc: allocUcc || '-',
            portfolio: allocPortfolio || '-',
            allocation_amount: alloc.amount || 0,
            round_down_amount: allocRoundDown,
            investment_date: alloc.investment_date || alloc.mf_investment_date || defaultInvestmentDate,
            approval_status: item.approval_status
          });
          // Only add to investment total if allocation has a valid portfolio (not "none")
          const hasValidPortfolio = allocPortfolio && allocPortfolio.toLowerCase() !== 'none';
          if (hasValidPortfolio) {
            entriesByBond[bondKey].total_round_down_amount += allocRoundDown;
          }
        });
      } else {
        // Single allocation
        const singleUcc = item.ucc || item.target_ucc || '';
        const singlePortfolio = item.portfolio_category || '';
        entriesByBond[bondKey].allocations.push({
          entry_id: item.id,
          ucc: singleUcc || '-',
          portfolio: singlePortfolio || '-',
          allocation_amount: investmentAmount,
          round_down_amount: roundDownAmount,
          investment_date: item.investment_date || item.mf_investment_date || defaultInvestmentDate,
          approval_status: item.approval_status
        });
        // Only add to investment total if allocation has a valid portfolio (not "none")
        const hasValidPortfolio = singlePortfolio && singlePortfolio.toLowerCase() !== 'none';
        if (hasValidPortfolio) {
          entriesByBond[bondKey].total_round_down_amount += roundDownAmount;
        }
      }
      
      // total_net_amount is the cashflow net amount (for display)
      entriesByBond[bondKey].total_net_amount += displayNetAmount;
    });
    
    return entriesByBond;
  };

  // Get current items based on active tab
  const getCurrentItemsList = () => {
    if (activeTab === 'pending') return pendingApprovals;
    if (activeTab === 'approved') return approvedItems;
    return rejectedItems;
  };

  // Toggle expand for a bond group
  const toggleExpand = (key) => {
    setExpandedBonds(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (!user) return null;

  const currentItems = getCurrentItemsList();
  const entriesByBond = groupItemsByBond(currentItems);
  const totalNetAmount = Object.values(entriesByBond).reduce((sum, b) => sum + b.total_net_amount, 0);
  const totalRoundDownAmount = Object.values(entriesByBond).reduce((sum, b) => sum + b.total_round_down_amount, 0);

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

        {/* Content - Matching Broker's Tagged (Pending) Structure */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600" />
            </div>
          ) : currentItems.length === 0 ? (
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
              {/* Summary Header Card - Matching Broker's Style */}
              <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
                <div 
                  className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-green-50 border-b border-green-100 bg-green-50/50"
                  onClick={() => toggleExpand('main')}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <Clock className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">
                        {activeTab === 'pending' ? 'Pending Approvals' : 
                         activeTab === 'approved' ? 'Approved Trades' : 'Rejected Items'}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>{Object.keys(entriesByBond).length} entries</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Net Repayment</p>
                      <p className="font-semibold text-gray-800">₹{totalNetAmount.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Investment Amt</p>
                      <p className="font-semibold text-green-700">₹{totalRoundDownAmount.toLocaleString('en-IN')}</p>
                    </div>
                    {expandedBonds['main'] !== false ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                  </div>
                </div>
                
                {/* Expanded Table - Two-level header matching broker design */}
                {expandedBonds['main'] !== false && (
                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      {/* Two-level header */}
                      <thead>
                        {/* Top level - Group headers */}
                        <tr className="bg-gray-100">
                          <th colSpan="3" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-blue-50">
                            Repayment Details
                          </th>
                          <th colSpan="4" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-green-50">
                            Investment Details
                          </th>
                          <th rowSpan="2" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-gray-50 align-middle">
                            Status
                          </th>
                          <th rowSpan="2" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-gray-50 align-middle">
                            Actions
                          </th>
                        </tr>
                        {/* Second level - Individual column headers */}
                        <tr className="bg-gray-50">
                          <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">Date of Repayment</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">Bond Name</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">Net Amount</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">Date of Investment</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">Portfolio</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">UCC</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(entriesByBond).map((bondGroup, bondIdx) => {
                          const allocations = bondGroup.allocations;
                          const hasMultiple = allocations.length > 1;
                          const rowCount = allocations.length;
                          const entry = bondGroup.entry;
                          const isPending = activeTab === 'pending';
                          const isApproved = activeTab === 'approved';
                          const isRejected = activeTab === 'rejected';
                          
                          return (
                            <React.Fragment key={bondIdx}>
                              {allocations.map((alloc, allocIdx) => {
                                const isFirst = allocIdx === 0;
                                const investmentDate = alloc.investment_date;
                                
                                return (
                                  <tr 
                                    key={`${bondIdx}-${allocIdx}`}
                                    className={`
                                      ${hasMultiple ? (isFirst ? 'border-t-2 border-t-green-400' : '') : ''}
                                      ${hasMultiple ? 'bg-green-50/30' : 'hover:bg-gray-50'}
                                    `}
                                  >
                                    {/* Date of Repayment - merged for multi-allocation */}
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
                                    
                                    {/* Bond Name - merged for multi-allocation */}
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
                                    
                                    {/* Net Amount - shows each allocation's amount (NOT merged) */}
                                    <td className="px-3 py-2 text-right font-mono text-gray-800 border border-gray-200">
                                      ₹{(alloc.allocation_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </td>
                                    
                                    {/* Date of Investment */}
                                    <td className="px-3 py-2 border border-gray-200">
                                      <span className="whitespace-nowrap text-gray-700">
                                        {investmentDate ? format(new Date(investmentDate), "dd MMM yyyy") : '-'}
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
                                    
                                    {/* Amount (Round Down) - per allocation */}
                                    <td className="px-3 py-2 text-right font-mono text-green-700 font-semibold border border-gray-200">
                                      ₹{(alloc.round_down_amount || 0).toLocaleString('en-IN')}
                                    </td>
                                    
                                    {/* Status - merged for multi-allocation */}
                                    {isFirst && (
                                      <td 
                                        className="px-3 py-2 text-center border border-gray-200 align-middle"
                                        rowSpan={hasMultiple ? rowCount : 1}
                                      >
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
                                            {alloc.approval_status || '-'}
                                          </Badge>
                                        )}
                                      </td>
                                    )}
                                    
                                    {/* Actions - merged for multi-allocation */}
                                    {isFirst && (
                                      <td 
                                        className="px-3 py-2 text-center border border-gray-200 align-middle"
                                        rowSpan={hasMultiple ? rowCount : 1}
                                      >
                                        {isPending && (
                                          <div className="flex items-center justify-center gap-1">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                              onClick={() => setConfirmDialog({ open: true, type: 'approve', item: entry })}
                                              disabled={processing === entry.id}
                                              title="Approve"
                                            >
                                              {processing === entry.id ? (
                                                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                              ) : (
                                                <Check className="h-3 w-3 mr-1" />
                                              )}
                                              Approve
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                              onClick={() => setConfirmDialog({ open: true, type: 'reject', item: entry })}
                                              disabled={processing === entry.id}
                                              title="Reject"
                                            >
                                              <X className="h-3 w-3 mr-1" />
                                              Reject
                                            </Button>
                                          </div>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                              
                              {/* Total row for the bond */}
                              <tr className="bg-green-100/50 border-b-2 border-b-green-400">
                                <td colSpan="2" className="px-3 py-2 text-right font-semibold text-gray-700 border border-gray-200">
                                  Total for {bondGroup.bond_name}:
                                </td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-gray-800 border border-gray-200">
                                  ₹{(bondGroup.total_net_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </td>
                                <td colSpan="3" className="border border-gray-200"></td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-green-700 border border-gray-200">
                                  ₹{(bondGroup.total_round_down_amount || 0).toLocaleString('en-IN')}
                                </td>
                                <td colSpan="2" className="border border-gray-200"></td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                    
                    {/* Grand Total Footer */}
                    <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
                      <div className="text-sm text-gray-600">
                        Total for {user?.name || 'Client'}:
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-sm">
                          <span className="text-gray-500">Net Repayment:</span>
                          <span className="font-semibold text-gray-800 ml-2">₹{totalNetAmount.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Investment Amount:</span>
                          <span className="font-semibold text-green-700 ml-2">₹{totalRoundDownAmount.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
