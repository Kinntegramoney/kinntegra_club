import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import React from "react";
import { 
  CheckCircle, XCircle, Clock, RefreshCw, FileText,
  TrendingUp, Calendar, Filter, Server, AlertCircle
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Reinvestment Trades View with Bifurcation
const ReinvestmentTradesView = ({ logs, groupByCashflow, formatCurrency, getStatusBadge }) => {
  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No reinvestment trades found</p>
      </div>
    );
  }

  const cashflowGroups = groupByCashflow(logs);
  
  return (
    <div className="bg-white rounded-lg border border-purple-200 overflow-hidden">
      <div className="px-4 py-3 bg-purple-50/50 border-b border-purple-100">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-purple-600" />
          <span className="font-medium text-gray-800">Reinvestment Trades</span>
          <span className="text-xs text-gray-500">({logs.length} entries)</span>
        </div>
      </div>
      
      <div className="p-4 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th colSpan="3" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-blue-50">
                Repayment Details
              </th>
              <th colSpan="4" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-purple-50">
                Investment Details
              </th>
              <th rowSpan="2" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200">
                Status
              </th>
            </tr>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Date</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Bond Name</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Net Amount</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Inv. Date</th>
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
              
              return (
                <React.Fragment key={cfGroup.cashflow_id}>
                  {allocations.map((alloc, allocIdx) => {
                    const isFirst = allocIdx === 0;
                    
                    return (
                      <tr 
                        key={`${cfGroup.cashflow_id}-${allocIdx}`}
                        className={`
                          ${hasMultiple ? (isFirst ? 'border-t-2 border-t-purple-400' : '') : ''}
                          ${hasMultiple ? 'bg-purple-50/30' : 'hover:bg-gray-50'}
                        `}
                      >
                        {/* Date - merged */}
                        {isFirst && (
                          <td 
                            className={`px-3 py-2 border border-gray-200 align-middle ${hasMultiple ? 'border-l-4 border-l-purple-400' : ''}`}
                            rowSpan={hasMultiple ? rowCount : 1}
                          >
                            <span className="whitespace-nowrap font-medium text-gray-800">
                              {cfGroup.date ? format(new Date(cfGroup.date), "dd MMM yyyy") : '-'}
                            </span>
                          </td>
                        )}
                        
                        {/* Bond Name - merged */}
                        {isFirst && (
                          <td 
                            className="px-3 py-2 border border-gray-200 align-middle"
                            rowSpan={hasMultiple ? rowCount : 1}
                          >
                            <div className="font-medium text-gray-800">{cfGroup.bond_name || 'N/A'}</div>
                          </td>
                        )}
                        
                        {/* Net Amount - per allocation */}
                        <td className="px-3 py-2 text-right font-mono text-gray-800 border border-gray-200">
                          ₹{formatCurrency(alloc.net_amount || alloc.amount || 0)}
                        </td>
                        
                        {/* Investment Date */}
                        <td className="px-3 py-2 border border-gray-200">
                          <span className="whitespace-nowrap text-gray-700">
                            {alloc.mf_investment_date ? format(new Date(alloc.mf_investment_date), "dd MMM yyyy") : '-'}
                          </span>
                        </td>
                        
                        {/* Portfolio */}
                        <td className="px-3 py-2 border border-gray-200">
                          <Badge className="bg-purple-100 text-purple-700 text-xs capitalize">
                            {alloc.portfolio_category || alloc.portfolio || '-'}
                          </Badge>
                        </td>
                        
                        {/* UCC */}
                        <td className="px-3 py-2 border border-gray-200">
                          <Badge variant="outline" className="text-xs font-mono">
                            {alloc.target_ucc || '-'}
                          </Badge>
                        </td>
                        
                        {/* Amount (Round Down) */}
                        <td className="px-3 py-2 text-right font-mono text-purple-700 font-semibold border border-gray-200">
                          ₹{formatCurrency(alloc.round_down_amount || alloc.amount || 0)}
                        </td>
                        
                        {/* Status - merged */}
                        {isFirst && (
                          <td 
                            className="px-3 py-2 text-center border border-gray-200 align-middle"
                            rowSpan={hasMultiple ? rowCount : 1}
                          >
                            {getStatusBadge(alloc.approval_status || 'pending')}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  
                  {/* Total row for multi-allocation */}
                  {hasMultiple && (
                    <tr className="bg-purple-100/50 border-b-2 border-b-purple-400">
                      <td colSpan="2" className="px-3 py-2 text-right font-semibold text-gray-700 border border-gray-200">
                        Total for {cfGroup.bond_name}:
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-gray-800 border border-gray-200">
                        ₹{formatCurrency(cfGroup.total_net_amount)}
                      </td>
                      <td colSpan="3" className="border border-gray-200"></td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-purple-700 border border-gray-200">
                        ₹{formatCurrency(cfGroup.total_round_down_amount)}
                      </td>
                      <td className="border border-gray-200"></td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Other Trades View (flat table)
const OtherTradesView = ({ logs, formatCurrency, getTagLabel, getStatusBadge, formatDate }) => {
  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No other trades found</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Bond</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Maturity Date</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Tag</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Portfolio</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">UCC</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Tagged By</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-teal-600" />
                    <span className="font-medium text-gray-800 text-sm">{log.bond_name}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-sm text-gray-600">
                  {log.expected_date ? format(new Date(log.expected_date), "dd MMM yyyy") : 'N/A'}
                </td>
                <td className="py-3 px-4 text-right font-mono text-sm">
                  ₹{formatCurrency(log.net_amount || log.amount)}
                </td>
                <td className="py-3 px-4 text-center">
                  <Badge variant="outline" className="text-xs capitalize">
                    {getTagLabel(log.reinvestment_tag)}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="text-sm text-gray-600 capitalize">
                    {log.portfolio_category?.replace('_', ' ') || '-'}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="text-sm text-gray-600 font-mono">
                    {log.target_ucc || '-'}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  {getStatusBadge(log.approval_status)}
                </td>
                <td className="py-3 px-4 text-sm text-gray-600">
                  {log.tagged_by_name || '-'}
                </td>
                <td className="py-3 px-4 text-sm text-gray-500">
                  {formatDate(log.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Round down to nearest 100
const roundToHundred = (amount) => {
  if (!amount || amount <= 0) return 0;
  return Math.floor(amount / 100) * 100;
};

// Group logs by cashflow_id for bifurcation
const groupByCashflow = (logs) => {
  const cashflowGroups = {};
  logs.forEach(log => {
    const cfId = log.cashflow_id || log.id;
    if (!cashflowGroups[cfId]) {
      cashflowGroups[cfId] = {
        cashflow_id: cfId,
        bond_name: log.bond_name,
        date: log.expected_date,
        allocations: [],
        total_net_amount: log.total_cashflow_net_amount || 0,
        total_round_down_amount: 0
      };
    }
    const roundDownAmt = log.amount || roundToHundred(log.net_amount || 0);
    cashflowGroups[cfId].allocations.push({
      ...log,
      round_down_amount: roundDownAmt
    });
    if (!cashflowGroups[cfId].total_net_amount) {
      cashflowGroups[cfId].total_net_amount += (log.net_amount || log.amount || 0);
    }
    cashflowGroups[cfId].total_round_down_amount += roundDownAmt;
  });
  // Sort allocations by index
  Object.values(cashflowGroups).forEach(cf => {
    cf.allocations.sort((a, b) => (a.allocation_index || 0) - (b.allocation_index || 0));
  });
  return cashflowGroups;
};

// Investment Logs View - Shows approved/submitted investments
const InvestmentLogsView = ({ logs, formatCurrency, getStatusBadge, roundToHundred }) => {
  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No approved investments found</p>
        <p className="text-gray-400 text-sm mt-1">Your approved investments will appear here</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="px-4 py-3 bg-green-50 border-b flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-green-600" />
        <span className="font-medium text-green-800">Approved Investments</span>
        <Badge className="bg-green-100 text-green-700 ml-2">{logs.length}</Badge>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-12">Sr No</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date of Repayment</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date of Reinvestment</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">UCC</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Portfolio Type</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Round Down Amount</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, idx) => {
              const roundDownAmount = log.amount || roundToHundred(log.net_amount || 0);
              const hasUCC = log.target_ucc || log.ucc;
              const hasPortfolio = log.portfolio_category || log.portfolio;
              const isIncomplete = !hasUCC || !hasPortfolio || hasPortfolio === 'none';
              
              // Calculate reinvestment date (repayment date + 1 month, 1st day)
              let reinvestmentDate = 'NA';
              if (log.expected_date && hasUCC && hasPortfolio && hasPortfolio !== 'none') {
                const repaymentDate = new Date(log.expected_date);
                const nextMonth = new Date(repaymentDate);
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                nextMonth.setDate(1);
                reinvestmentDate = format(nextMonth, "dd-MM-yyyy");
              }
              
              return (
                <tr key={log.id || idx} className={`border-b hover:bg-gray-50 ${isIncomplete ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-3 text-gray-600">{idx + 1}</td>
                  <td className={`px-4 py-3 font-medium ${isIncomplete ? 'text-red-600' : ''}`}>
                    {log.expected_date ? format(new Date(log.expected_date), "dd-MMM-yy") : 'NA'}
                  </td>
                  <td className={`px-4 py-3 ${isIncomplete ? 'text-red-600' : ''}`}>
                    {reinvestmentDate}
                  </td>
                  <td className={`px-4 py-3 font-mono ${!hasUCC ? 'text-red-600' : ''}`}>
                    {hasUCC || 'NA'}
                  </td>
                  <td className={`px-4 py-3 capitalize ${!hasPortfolio || hasPortfolio === 'none' ? 'text-red-600' : ''}`}>
                    {hasPortfolio && hasPortfolio !== 'none' ? hasPortfolio?.replace('_', ' ') : 'NA'}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${isIncomplete ? 'text-red-600' : 'text-green-700'}`}>
                    {roundDownAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {log.approval_status === 'submitted' || log.api_submitted ? (
                      <Badge className="bg-green-100 text-green-700 text-xs">
                        Submitted
                      </Badge>
                    ) : log.approval_status === 'cancellation_pending' ? (
                      <Badge className="bg-red-100 text-red-700 text-xs">
                        Cancel Pending
                      </Badge>
                    ) : log.approval_status === 'edit_pending' ? (
                      <Badge className="bg-amber-100 text-amber-700 text-xs">
                        Edit Pending
                      </Badge>
                    ) : (
                      <Badge className="bg-teal-100 text-teal-700 text-xs">
                        Approved
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Footer - Net Repayment Summary */}
      <div className="px-4 py-3 bg-blue-50 border-t flex items-center justify-end">
        <div className="flex items-center gap-4">
          <span className="text-gray-600 font-medium">Net repayment</span>
          <span className="text-lg font-bold text-blue-700">
            {logs.reduce((sum, log) => sum + (log.net_amount || log.amount || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default function ClientLogs() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tradeLogs, setTradeLogs] = useState([]);
  const [investmentLogs, setInvestmentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [tradeSubTab, setTradeSubTab] = useState("reinvestment"); // 'reinvestment' or 'investment'

  useEffect(() => {
    document.title = "Kinntegraa | My Logs";
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
    fetchTradeLogs();
    fetchInvestmentLogs();
  }, [navigate]);

  const fetchTradeLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/reinvestment-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTradeLogs(response.data || []);
    } catch (error) {
      console.error("Error fetching trade logs:", error);
      toast.error("Failed to load trade logs");
    } finally {
      setLoading(false);
    }
  };

  const fetchInvestmentLogs = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/reinvestment-logs?status=approved,submitted`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Filter to only show approved/submitted entries
      const approved = (response.data || []).filter(log => 
        ['approved', 'submitted'].includes(log.approval_status)
      );
      setInvestmentLogs(approved);
    } catch (error) {
      console.error("Error fetching investment logs:", error);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      return format(new Date(dateStr), "dd MMM yyyy HH:mm");
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
  };

  // Filter trade logs by status
  const filteredTradeLogs = tradeLogs.filter(log => {
    if (statusFilter === "all") return true;
    return log.approval_status === statusFilter;
  });

  const getStatusBadge = (status) => {
    const statusConfig = {
      'pending': { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
      'pending_broker_approval': { label: 'Pending Broker', color: 'bg-amber-100 text-amber-700', icon: Clock },
      'approved': { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
      'rejected': { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
      'submitted': { label: 'Submitted', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
      'cancelled': { label: 'Cancelled', color: 'bg-gray-100 text-gray-700', icon: XCircle },
      'cancellation_pending': { label: 'Cancellation Pending', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
      'edit_pending': { label: 'Edit Pending Approval', color: 'bg-purple-100 text-purple-700', icon: Clock },
    };
    
    const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-700', icon: Clock };
    const Icon = config.icon;
    
    return (
      <Badge className={`${config.color} text-xs flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getTagLabel = (tag) => {
    const labels = {
      'principal': 'Principal',
      'interest': 'Interest',
      'both': 'Both (P+I)',
      'none': 'None',
      'custom': 'Custom'
    };
    return labels[tag] || tag;
  };

  const handleRefresh = () => {
    fetchTradeLogs();
    fetchInvestmentLogs();
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex" data-testid="client-logs-page">
      <ClientSidebar user={user} />

      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800" data-testid="logs-title">Logs</h1>
                <p className="text-sm text-gray-500">History of all reinvestment and investment activities</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Trade Logs Content with Sub-tabs */}
        <>
          {/* Sub-tabs and Filters */}
          <div className="px-6 py-3 bg-white border-b">
              <div className="flex items-center justify-between">
                {/* Sub-tabs */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setTradeSubTab("reinvestment")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                      tradeSubTab === "reinvestment"
                        ? "bg-purple-100 text-purple-700"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <TrendingUp className="h-4 w-4" />
                    Reinvestment Trades
                    <Badge className={`${tradeSubTab === "reinvestment" ? "bg-purple-200 text-purple-800" : "bg-gray-200 text-gray-600"} text-xs`}>
                      {filteredTradeLogs.filter(l => l.cashflow_id).length}
                    </Badge>
                  </button>
                  <button
                    onClick={() => setTradeSubTab("investment")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                      tradeSubTab === "investment"
                        ? "bg-green-100 text-green-700"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <CheckCircle className="h-4 w-4" />
                    Investment
                    <Badge className={`${tradeSubTab === "investment" ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-600"} text-xs`}>
                      {investmentLogs.length}
                    </Badge>
                  </button>
                </div>
                
                {/* Status Filter */}
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40 h-9">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="pending_broker_approval">Pending Broker</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {loading ? (
                <div className="bg-white rounded-lg border p-8 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-teal-600 mx-auto mb-3" />
                  <p className="text-gray-500">Loading...</p>
                </div>
              ) : (
                <>
                  {/* Reinvestment Trades Sub-tab - Bifurcated View */}
                  {tradeSubTab === "reinvestment" && (
                    <ReinvestmentTradesView 
                      logs={filteredTradeLogs.filter(l => l.cashflow_id)}
                      groupByCashflow={groupByCashflow}
                      formatCurrency={formatCurrency}
                      getStatusBadge={getStatusBadge}
                    />
                  )}
                  
                  {/* Investment Sub-tab - Shows approved/submitted investments */}
                  {tradeSubTab === "investment" && (
                    <InvestmentLogsView 
                      logs={investmentLogs}
                      formatCurrency={formatCurrency}
                      getStatusBadge={getStatusBadge}
                      roundToHundred={roundToHundred}
                    />
                  )}
                </>
              )}
            </div>
          </>
      </div>
    </div>
  );
}
