import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  CheckCircle, XCircle, Clock, TrendingUp, Building2,
  RefreshCw, ChevronDown, ChevronUp, User, UserPlus,
  Wallet, Home, ExternalLink, FileText
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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800", icon: Clock },
  approved: { label: "Approved", color: "bg-green-100 text-green-800", icon: CheckCircle },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800", icon: XCircle },
};

export default function ApprovalsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  
  // Tab state - 4 main tabs
  const [activeTab, setActiveTab] = useState("reinvestment_bonds");
  
  // Pending approvals data
  const [pendingClients, setPendingClients] = useState([]);
  const [pendingReinvestments, setPendingReinvestments] = useState([]);
  const [pendingTrades, setPendingTrades] = useState([]);
  const [pendingRealEstatePayments, setPendingRealEstatePayments] = useState([]);
  const [loading, setLoading] = useState(false);
  
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
  }, [navigate]);

  const fetchAllApprovals = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Fetch pending approvals from approval-workflow endpoint
      const response = await axios.get(`${API}/approval-workflow/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setPendingClients(response.data.pending_clients || []);
      setPendingReinvestments(response.data.pending_reinvestments || []);
      setPendingTrades(response.data.pending_trades || []);
      
      // TODO: Fetch real estate payment tags when API is ready
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

  const toggleExpand = (id) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
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
    if (!selectedItem || !approvalAction) return;
    
    setProcessingId(selectedItem.id);
    try {
      const token = localStorage.getItem("token");
      let endpoint;
      
      if (itemType === 'client') {
        endpoint = `${API}/approval-workflow/client/${selectedItem.id}/${approvalAction}`;
      } else if (itemType === 'reinvestment') {
        // Check if it's a cashflow-based tag or a submission
        if (selectedItem.cashflow_id || !selectedItem.submission_id) {
          // Cashflow-based reinvestment tag (from sub-broker)
          const cfId = selectedItem.cashflow_id || selectedItem.id;
          endpoint = `${API}/approval-workflow/reinvestment-tag/${cfId}/${approvalAction}`;
        } else {
          // Submission-based reinvestment
          endpoint = `${API}/approval-workflow/reinvestment/${selectedItem.id}/${approvalAction}`;
        }
      } else if (itemType === 'trade') {
        endpoint = `${API}/approval-workflow/trade/${selectedItem.id}?action=${approvalAction}`;
      } else if (itemType === 'real_estate_payment') {
        endpoint = `${API}/real-estate/payment/${selectedItem.id}/${approvalAction}`;
      }
      
      await axios.post(endpoint, {
        notes: approvalNotes,
        send_email: sendClientEmail
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const typeLabels = {
        'client': 'Client',
        'reinvestment': 'Reinvestment',
        'trade': 'Unit Allotment',
        'real_estate_payment': 'Payment Tag'
      };
      toast.success(`${typeLabels[itemType]} ${approvalAction === 'approve' ? 'approved' : 'rejected'} successfully`);
      setShowApprovalModal(false);
      fetchAllApprovals();
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

  if (!user) return null;

  const tabs = [
    { 
      id: "reinvestment_bonds", 
      label: "Reinvestment - Bonds", 
      icon: RefreshCw, 
      count: pendingReinvestments.length,
      color: "blue"
    },
    { 
      id: "client_creation", 
      label: "Client Creation", 
      icon: UserPlus, 
      count: pendingClients.length,
      color: "amber"
    },
    { 
      id: "allotment_bonds", 
      label: "Allotment - Bonds", 
      icon: TrendingUp, 
      count: pendingTrades.length,
      color: "green"
    },
    { 
      id: "payment_real_estate", 
      label: "Payment Tag - Real Estate", 
      icon: Home, 
      count: pendingRealEstatePayments.length,
      color: "purple"
    },
  ];

  const getColorClasses = (color, isActive) => {
    const colors = {
      blue: isActive ? "bg-blue-50 text-blue-700 border-blue-500" : "text-gray-600 border-transparent hover:bg-blue-50/50",
      amber: isActive ? "bg-amber-50 text-amber-700 border-amber-500" : "text-gray-600 border-transparent hover:bg-amber-50/50",
      green: isActive ? "bg-green-50 text-green-700 border-green-500" : "text-gray-600 border-transparent hover:bg-green-50/50",
      purple: isActive ? "bg-purple-50 text-purple-700 border-purple-500" : "text-gray-600 border-transparent hover:bg-purple-50/50",
    };
    return colors[color] || colors.blue;
  };

  const getBadgeColor = (color) => {
    const colors = {
      blue: "bg-blue-500",
      amber: "bg-amber-500",
      green: "bg-green-500",
      purple: "bg-purple-500",
    };
    return colors[color] || "bg-gray-500";
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
                <p className="text-sm text-gray-500">Review and approve pending requests</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchAllApprovals}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
          
          {/* Tab Navigation */}
          <div className="px-6 pb-0 flex gap-1 overflow-x-auto">
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
                  {/* Reinvestment - Bonds Tab */}
                  {activeTab === "reinvestment_bonds" && (
                    pendingReinvestments.length === 0 ? (
                      <EmptyState 
                        icon={RefreshCw} 
                        title="No Pending Reinvestments" 
                        description="All bond reinvestment requests have been processed"
                      />
                    ) : (
                      <ReinvestmentApprovalTable 
                        items={pendingReinvestments}
                        onApprove={(item) => openApprovalModal(item, 'reinvestment', 'approve')}
                        onReject={(item) => openApprovalModal(item, 'reinvestment', 'reject')}
                        processingId={processingId}
                        formatCurrency={formatCurrency}
                        formatDate={formatDate}
                      />
                    )
                  )}

                  {/* Client Creation Tab */}
                  {activeTab === "client_creation" && (
                    pendingClients.length === 0 ? (
                      <EmptyState 
                        icon={UserPlus} 
                        title="No Pending Client Approvals" 
                        description="All client creation requests have been processed"
                      />
                    ) : (
                      <div className="space-y-3">
                        {pendingClients.map((client) => (
                          <ClientCard 
                            key={client.id} 
                            client={client}
                            expanded={expandedItems[client.id]}
                            onToggle={() => toggleExpand(client.id)}
                            onApprove={() => openApprovalModal(client, 'client', 'approve')}
                            onReject={() => openApprovalModal(client, 'client', 'reject')}
                            processingId={processingId}
                            formatDate={formatDate}
                          />
                        ))}
                      </div>
                    )
                  )}

                  {/* Allotment - Bonds Tab */}
                  {activeTab === "allotment_bonds" && (
                    pendingTrades.length === 0 ? (
                      <EmptyState 
                        icon={TrendingUp} 
                        title="No Pending Unit Allotments" 
                        description="All bond unit allotment requests have been processed"
                      />
                    ) : (
                      <div className="space-y-3">
                        {pendingTrades.map((trade) => (
                          <TradeCard 
                            key={trade.id} 
                            trade={trade}
                            expanded={expandedItems[trade.id]}
                            onToggle={() => toggleExpand(trade.id)}
                            onApprove={() => openApprovalModal(trade, 'trade', 'approve')}
                            onReject={() => openApprovalModal(trade, 'trade', 'reject')}
                            processingId={processingId}
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                          />
                        ))}
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
                      <div className="space-y-3">
                        {pendingRealEstatePayments.map((payment) => (
                          <RealEstatePaymentCard 
                            key={payment.id} 
                            payment={payment}
                            expanded={expandedItems[payment.id]}
                            onToggle={() => toggleExpand(payment.id)}
                            onApprove={() => openApprovalModal(payment, 'real_estate_payment', 'approve')}
                            onReject={() => openApprovalModal(payment, 'real_estate_payment', 'reject')}
                            processingId={processingId}
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                          />
                        ))}
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Approval Modal */}
      <Dialog open={showApprovalModal} onOpenChange={setShowApprovalModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approvalAction === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
            </DialogTitle>
            <DialogDescription>
              {approvalAction === 'approve' 
                ? 'Are you sure you want to approve this request?' 
                : 'Are you sure you want to reject this request?'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Notes (Optional)</label>
              <Textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Add any notes..."
                className="min-h-[80px]"
              />
            </div>
            
            {itemType !== 'trade' && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="send-email"
                  checked={sendClientEmail}
                  onCheckedChange={setSendClientEmail}
                />
                <label htmlFor="send-email" className="text-sm text-gray-600">
                  Send notification email to client
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprovalModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApproval}
              disabled={processingId === selectedItem?.id}
              className={approvalAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {processingId === selectedItem?.id ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {approvalAction === 'approve' ? 'Approve' : 'Reject'}
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

// Round down to nearest 100 for investment amount
const roundToHundred = (amount) => {
  if (!amount || amount <= 0) return 0;
  return Math.floor(amount / 100) * 100;
};

// Reinvestment Approval Table Component - matches Tagged table design
function ReinvestmentApprovalTable({ items, onApprove, onReject, processingId, formatCurrency, formatDate }) {
  // Group items by client, then by cashflow for bifurcation
  const clientGroups = {};
  items.forEach(item => {
    const clientId = item.client_id;
    if (!clientGroups[clientId]) {
      clientGroups[clientId] = {
        client_id: clientId,
        client_name: item.client_name,
        client_pan: item.client_pan,
        sub_broker_name: item.sub_broker_name || item.tagged_by_name || 'Sub-Broker',
        entries: []
      };
    }
    clientGroups[clientId].entries.push(item);
  });

  // Group entries by cashflow_id for bifurcation display
  const groupByCashflow = (entries) => {
    const cashflowGroups = {};
    entries.forEach(entry => {
      const cfId = entry.cashflow_id || entry.id;
      if (!cashflowGroups[cfId]) {
        cashflowGroups[cfId] = {
          cashflow_id: cfId,
          bond_name: entry.bond_name,
          bond_code: entry.bond_code,
          date: entry.expected_date || entry.date,
          allocations: [],
          total_net_amount: entry.total_cashflow_net_amount || 0,
          total_round_down_amount: 0,
          primary_entry: entry,
          sub_broker_name: entry.sub_broker_name || entry.tagged_by_name || 'Sub-Broker'
        };
      }
      
      const netAmount = entry.net_amount || entry.amount || 0;
      const roundDownAmount = entry.amount || roundToHundred(netAmount);
      
      cashflowGroups[cfId].allocations.push({
        id: entry.id,
        entry: entry,
        allocation_index: entry.allocation_index || 0,
        ucc: entry.ucc || entry.target_ucc || '',
        portfolio: entry.portfolio || entry.portfolio_category || '',
        net_amount: netAmount,
        round_down_amount: roundDownAmount,
        investment_date: entry.mf_investment_date || entry.investment_date,
        tagged_by_name: entry.tagged_by_name || entry.sub_broker_name || 'Sub-Broker'
      });
      cashflowGroups[cfId].total_round_down_amount += roundDownAmount;
      if (!cashflowGroups[cfId].total_net_amount) {
        cashflowGroups[cfId].total_net_amount += netAmount;
      }
    });
    
    // Sort allocations by index
    Object.values(cashflowGroups).forEach(cf => {
      cf.allocations.sort((a, b) => (a.allocation_index || 0) - (b.allocation_index || 0));
    });
    
    return cashflowGroups;
  };

  return (
    <div className="space-y-4">
      {Object.values(clientGroups).map(clientGroup => {
        const cashflowGroups = groupByCashflow(clientGroup.entries);
        const totalNetAmount = Object.values(cashflowGroups).reduce((sum, cf) => sum + (cf.total_net_amount || 0), 0);
        const totalRoundDownAmount = Object.values(cashflowGroups).reduce((sum, cf) => sum + cf.total_round_down_amount, 0);
        
        return (
          <div key={clientGroup.client_id} className="bg-white rounded-lg border border-green-200 overflow-hidden">
            {/* Client Header */}
            <div className="px-4 py-3 flex items-center justify-between bg-green-50/50 border-b border-green-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{clientGroup.client_name}</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{clientGroup.client_pan}</span>
                    <span>•</span>
                    <span>{Object.keys(cashflowGroups).length} pending entries</span>
                    <span>•</span>
                    <Badge className="bg-purple-100 text-purple-700 text-xs">
                      Tagged by: {clientGroup.sub_broker_name}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-gray-500">Net Repayment</p>
                  <p className="font-semibold text-gray-800">₹{totalNetAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Investment Amt</p>
                  <p className="font-semibold text-green-700">₹{totalRoundDownAmount.toLocaleString('en-IN')}</p>
                </div>
              </div>
            </div>
            
            {/* Entries Table - Matching Tagged (Pending) structure */}
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
                  {Object.values(cashflowGroups).map((cfGroup, cfIdx) => {
                    const allocations = cfGroup.allocations;
                    const hasMultiple = allocations.length > 1;
                    const rowCount = allocations.length;
                    const primaryEntry = cfGroup.primary_entry;
                    
                    return (
                      <React.Fragment key={cfIdx}>
                        {allocations.map((alloc, allocIdx) => {
                          const isFirst = allocIdx === 0;
                          const isNonePortfolio = (alloc.portfolio || '').toLowerCase() === 'none';
                          
                          return (
                            <tr 
                              key={`${cfIdx}-${allocIdx}`}
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
                                    {formatDate(cfGroup.date)}
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
                                    <div className="font-medium text-gray-800">{cfGroup.bond_name}</div>
                                    {cfGroup.bond_code && (
                                      <div className="text-xs text-gray-500">({cfGroup.bond_code})</div>
                                    )}
                                  </div>
                                </td>
                              )}
                              
                              {/* Net Amount - per allocation */}
                              <td className="px-3 py-2 text-right font-mono text-gray-800 border border-gray-200">
                                ₹{(alloc.net_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </td>
                              
                              {/* Date of Investment */}
                              <td className="px-3 py-2 border border-gray-200">
                                <span className="whitespace-nowrap text-gray-700">
                                  {alloc.investment_date ? format(new Date(alloc.investment_date), "dd MMM yyyy") : '-'}
                                </span>
                              </td>
                              
                              {/* Portfolio */}
                              <td className="px-3 py-2 border border-gray-200">
                                <Badge className={`text-xs capitalize ${isNonePortfolio ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
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
                                ₹{(alloc.round_down_amount || 0).toLocaleString('en-IN')}
                              </td>
                              
                              {/* Status - merged */}
                              {isFirst && (
                                <td 
                                  className="px-3 py-2 text-center border border-gray-200 align-middle"
                                  rowSpan={hasMultiple ? rowCount : 1}
                                >
                                  <Badge className="bg-amber-100 text-amber-700 text-xs">
                                    <Clock className="h-3 w-3 mr-1 inline" />
                                    Pending
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
                              Total for {cfGroup.bond_name}:
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-gray-800 border border-gray-200">
                              ₹{(cfGroup.total_net_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                            <td colSpan="3" className="border border-gray-200"></td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-green-700 border border-gray-200">
                              ₹{(cfGroup.total_round_down_amount || 0).toLocaleString('en-IN')}
                            </td>
                            <td colSpan="2" className="border border-gray-200"></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              
              {/* Client Total */}
              <div className="mt-3 p-3 bg-green-100 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-green-800">
                    Total for {clientGroup.client_name}
                  </span>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-green-700">Net Repayment</p>
                      <p className="font-bold text-green-800">₹{totalNetAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-green-700">Investment Amount</p>
                      <p className="font-bold text-green-800 text-lg">₹{totalRoundDownAmount.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
                    <span>{clientGroup.entries.length} pending entries</span>
                    <span>•</span>
                    <Badge className="bg-purple-100 text-purple-700 text-xs">
                      Tagged by: {clientGroup.sub_broker_name}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-gray-500">Net Repayment</p>
                  <p className="font-semibold text-gray-800">₹{totalNetAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Investment Amt</p>
                  <p className="font-semibold text-green-700">₹{totalRoundDownAmount.toLocaleString('en-IN')}</p>
                </div>
              </div>
            </div>
            
            {/* Entries Table - Matching Tagged (Pending) structure */}
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
                                ₹{(alloc.net_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
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
                                ₹{(alloc.round_down_amount || 0).toLocaleString('en-IN')}
                              </td>
                              
                              {/* Status - merged */}
                              {isFirst && (
                                <td 
                                  className="px-3 py-2 text-center border border-gray-200 align-middle"
                                  rowSpan={hasMultiple ? rowCount : 1}
                                >
                                  <Badge className="bg-amber-100 text-amber-700 text-xs">
                                    <Clock className="h-3 w-3 mr-1 inline" />
                                    Pending
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
                              ₹{(bondGroup.total_net_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                            <td colSpan="3" className="border border-gray-200"></td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-green-700 border border-gray-200">
                              ₹{(bondGroup.total_round_down_amount || 0).toLocaleString('en-IN')}
                            </td>
                            <td colSpan="2" className="border border-gray-200"></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              
              {/* Client Total */}
              <div className="mt-3 p-3 bg-green-100 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-green-800">
                    Total for {clientGroup.client_name}
                  </span>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-green-700">Net Repayment</p>
                      <p className="font-bold text-green-800">₹{totalNetAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-green-700">Investment Amount</p>
                      <p className="font-bold text-green-800 text-lg">₹{totalRoundDownAmount.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Reinvestment Card Component (kept for backwards compatibility)
function ReinvestmentCard({ item, expanded, onToggle, onApprove, onReject, processingId, formatCurrency, formatDate }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden" data-testid={`reinvestment-${item.id}`}>
      <div 
        className="flex items-center justify-between p-3 bg-blue-50/50 cursor-pointer hover:bg-blue-50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
            <RefreshCw className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-gray-800 text-sm">{item.client_name}</p>
            <p className="text-xs text-gray-500">{item.bond_name} • ₹{formatCurrency(item.net_amount || item.amount)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-amber-100 text-amber-700">Pending</Badge>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </div>
      
      {expanded && (
        <div className="p-4 bg-white border-t border-gray-100">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500">Portfolio</p>
              <p className="text-sm font-medium">{item.portfolio_category || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Target UCC</p>
              <p className="text-sm font-medium">{item.target_ucc || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Expected Date</p>
              <p className="text-sm font-medium">{formatDate(item.expected_date)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Submitted By</p>
              <p className="text-sm font-medium">{item.submitted_by_name || 'Broker'}</p>
            </div>
          </div>
          
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onReject(); }}
              disabled={processingId === item.id}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); onApprove(); }}
              disabled={processingId === item.id}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Client Card Component
function ClientCard({ client, expanded, onToggle, onApprove, onReject, processingId, formatDate }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden" data-testid={`client-${client.id}`}>
      <div 
        className="flex items-center justify-between p-3 bg-amber-50/50 cursor-pointer hover:bg-amber-50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
            <User className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="font-medium text-gray-800 text-sm">{client.name}</p>
            <p className="text-xs text-gray-500">PAN: {client.pan_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-amber-100 text-amber-700">Pending</Badge>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </div>
      
      {expanded && (
        <div className="p-4 bg-white border-t border-gray-100">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500">Email</p>
              <p className="text-sm font-medium truncate">{client.email || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Phone</p>
              <p className="text-sm font-medium">{client.phone || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Created</p>
              <p className="text-sm font-medium">{formatDate(client.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Submitted By</p>
              <p className="text-sm font-medium">{client.linked_subbroker_name || 'Sub-broker'}</p>
            </div>
          </div>
          
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onReject(); }}
              disabled={processingId === client.id}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); onApprove(); }}
              disabled={processingId === client.id}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Trade/Allotment Card Component
function TradeCard({ trade, expanded, onToggle, onApprove, onReject, processingId, formatCurrency, formatDate }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden" data-testid={`trade-${trade.id}`}>
      <div 
        className="flex items-center justify-between p-3 bg-green-50/50 cursor-pointer hover:bg-green-50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="font-medium text-gray-800 text-sm">{trade.client_name}</p>
            <p className="text-xs text-gray-500">{trade.bond_name} • {trade.units} units</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-amber-100 text-amber-700">Pending</Badge>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </div>
      
      {expanded && (
        <div className="p-4 bg-white border-t border-gray-100">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500">Amount</p>
              <p className="text-sm font-medium">₹{formatCurrency(trade.total_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">UTR</p>
              <p className="text-sm font-medium">{trade.payment_reference || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Investment Date</p>
              <p className="text-sm font-medium">{formatDate(trade.investment_date)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Submitted By</p>
              <p className="text-sm font-medium">{trade.created_by_name || 'Sub-broker'}</p>
            </div>
          </div>
          
          {trade.payment_proof_url && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">Payment Proof</p>
              <a 
                href={`${BACKEND_URL}${trade.payment_proof_url}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                <FileText className="h-4 w-4" />
                View UTR Copy
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
          
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onReject(); }}
              disabled={processingId === trade.id}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); onApprove(); }}
              disabled={processingId === trade.id}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Real Estate Payment Card Component
function RealEstatePaymentCard({ payment, expanded, onToggle, onApprove, onReject, processingId, formatCurrency, formatDate }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden" data-testid={`payment-${payment.id}`}>
      <div 
        className="flex items-center justify-between p-3 bg-purple-50/50 cursor-pointer hover:bg-purple-50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center">
            <Home className="h-4 w-4 text-purple-600" />
          </div>
          <div>
            <p className="font-medium text-gray-800 text-sm">{payment.client_name}</p>
            <p className="text-xs text-gray-500">{payment.property_name} • ₹{formatCurrency(payment.amount)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-amber-100 text-amber-700">Pending</Badge>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </div>
      
      {expanded && (
        <div className="p-4 bg-white border-t border-gray-100">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500">Property</p>
              <p className="text-sm font-medium">{payment.property_name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Amount</p>
              <p className="text-sm font-medium">₹{formatCurrency(payment.amount)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Payment Date</p>
              <p className="text-sm font-medium">{formatDate(payment.payment_date)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Submitted By</p>
              <p className="text-sm font-medium">{payment.submitted_by_name || 'Sub-broker'}</p>
            </div>
          </div>
          
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onReject(); }}
              disabled={processingId === payment.id}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); onApprove(); }}
              disabled={processingId === payment.id}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
