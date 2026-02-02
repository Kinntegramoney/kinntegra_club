import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
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

// Round down to nearest 100
const roundToHundred = (amount) => {
  if (!amount || amount <= 0) return 0;
  return Math.floor(amount / 100) * 100;
};

export default function ClientLogs() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tradeLogs, setTradeLogs] = useState([]);
  const [investmentLogs, setInvestmentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("trade_logs"); // 'trade_logs' or 'investment'
  const [tradeSubTab, setTradeSubTab] = useState("reinvestment"); // 'reinvestment' or 'others'

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
          
          {/* Tabs */}
          <div className="px-6 flex gap-1 border-t">
            <button
              onClick={() => setActiveTab("trade_logs")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "trade_logs"
                  ? "bg-teal-50 text-teal-700 border-teal-500"
                  : "text-gray-600 border-transparent hover:bg-gray-50"
              }`}
              data-testid="trade-logs-tab"
            >
              <RefreshCw className="h-4 w-4" />
              Trade Logs
              {tradeLogs.length > 0 && (
                <Badge variant="secondary" className="bg-teal-100 text-teal-700">{tradeLogs.length}</Badge>
              )}
            </button>
            <button
              onClick={() => setActiveTab("investment")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "investment"
                  ? "bg-green-50 text-green-700 border-green-500"
                  : "text-gray-600 border-transparent hover:bg-gray-50"
              }`}
              data-testid="investment-tab"
            >
              <TrendingUp className="h-4 w-4" />
              Investment
              {investmentLogs.length > 0 && (
                <Badge variant="secondary" className="bg-green-100 text-green-700">{investmentLogs.length}</Badge>
              )}
            </button>
          </div>
        </div>

        {/* Trade Logs Tab */}
        {activeTab === "trade_logs" && (
          <>
            {/* Filters */}
            <div className="px-6 py-3 bg-white border-b">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-600">Filter:</span>
                </div>
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
                
                <div className="ml-auto text-sm text-gray-500">
                  {filteredTradeLogs.length} records
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {loading ? (
                  <div className="text-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-teal-600 mx-auto mb-3" />
                    <p className="text-gray-500">Loading...</p>
                  </div>
                ) : filteredTradeLogs.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-gray-600 mb-1">No Logs Found</h3>
                    <p className="text-gray-400 text-sm">
                      {statusFilter !== 'all' 
                        ? 'No logs match the selected filter' 
                        : 'Your reinvestment history will appear here'}
                    </p>
                  </div>
                ) : (
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
                        {filteredTradeLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50" data-testid={`log-${log.id}`}>
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
                )}
              </div>
            </div>
          </>
        )}

        {/* Investment Tab - Matching Broker's TradeLogs format exactly */}
        {activeTab === "investment" && (
          <div className="p-6">
            {loading ? (
              <div className="bg-white rounded-lg border p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin text-green-600 mx-auto mb-3" />
                <p className="text-gray-500">Loading investment logs...</p>
              </div>
            ) : investmentLogs.length === 0 ? (
              <div className="bg-white rounded-lg border p-8 text-center">
                <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No approved investments found</p>
                <p className="text-gray-400 text-sm mt-1">Your approved investments will appear here</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border overflow-hidden">
                <div className="px-4 py-3 bg-green-50 border-b flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800">Approved Investments</span>
                  <Badge className="bg-green-100 text-green-700 ml-2">{investmentLogs.length}</Badge>
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
                      {investmentLogs.map((log, idx) => {
                        const roundDownAmount = log.amount || roundToHundred(log.net_amount || 0);
                        const hasUCC = log.target_ucc || log.ucc;
                        const hasPortfolio = log.portfolio_category || log.portfolio;
                        const isIncomplete = !hasUCC || !hasPortfolio || hasPortfolio === 'none';
                        
                        // Calculate reinvestment date (typically repayment date + 1 month, 1st day)
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
                
                {/* Footer - Net Repayment Summary - Matching broker exactly */}
                <div className="px-4 py-3 bg-blue-50 border-t flex items-center justify-end">
                  <div className="flex items-center gap-4">
                    <span className="text-gray-600 font-medium">Net repayment</span>
                    <span className="text-lg font-bold text-blue-700">
                      {investmentLogs.reduce((sum, log) => sum + (log.net_amount || log.amount || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
