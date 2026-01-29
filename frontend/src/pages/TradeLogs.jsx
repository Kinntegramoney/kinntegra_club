import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import ClientSidebar from "@/components/ClientSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  Search, Download, Calendar, Filter, RefreshCw,
  CheckCircle, XCircle, Clock, Users, Activity,
  ChevronDown, Eye, MoreVertical, ChevronLeft, ChevronRight,
  TrendingUp, Pencil, Ban, FileText
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Round down to nearest 100
const roundToHundred = (amount) => {
  if (!amount || amount <= 0) return 0;
  return Math.floor(amount / 100) * 100;
};

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-etihad-gold-100 text-etihad-gold-800" },
  approved: { label: "Approved", color: "bg-green-100 text-green-800" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800" },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-800" },
  broker_approved: { label: "Broker Approved", color: "bg-green-100 text-green-800" },
  broker_rejected: { label: "Broker Rejected", color: "bg-red-100 text-red-800" },
  client_approved: { label: "Client Approved", color: "bg-emerald-100 text-emerald-800" },
  client_rejected: { label: "Client Rejected", color: "bg-orange-100 text-orange-800" },
  completed: { label: "Completed", color: "bg-green-100 text-green-800" },
};

const PAGE_SECTIONS = {
  'holdings': 'Holdings',
  'opportunities': 'Opportunities',
  'real-estate-details': 'Real Estate Details',
  'real-estate-investments': 'Real Estate Investments',
  'bond-details': 'Bond Details',
  'dashboard': 'Dashboard',
  'clients': 'Clients',
  'client-details': 'Client Details',
  'profile': 'Profile',
  'analysis': 'Analysis',
  'leads': 'Lead Management',
  'reinvestment': 'Reinvestment Tagging',
  'reinvestment-approvals': 'Reinvestment Approvals',
  'trade-verification': 'Trade Verification',
};

export default function TradeLogs() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("trades"); // "trades", "activity", or "investment"
  
  // Trade logs state
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // User activity state
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const [activityDateFrom, setActivityDateFrom] = useState("");
  const [activityDateTo, setActivityDateTo] = useState("");
  const [activityRoleFilter, setActivityRoleFilter] = useState("all");
  const [activitySectionFilter, setActivitySectionFilter] = useState("all");
  const [activityTotalPages, setActivityTotalPages] = useState(1);
  
  // Investment logs state (client-approved reinvestments)
  const [investmentLogs, setInvestmentLogs] = useState([]);
  const [investmentLoading, setInvestmentLoading] = useState(false);
  const [investmentSearchQuery, setInvestmentSearchQuery] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [selectedInvestment, setSelectedInvestment] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [modifyFormData, setModifyFormData] = useState({});
  const [processingAction, setProcessingAction] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [activityPage, setActivityPage] = useState(1);
  const [investmentPage, setInvestmentPage] = useState(1);

  useEffect(() => {
    document.title = "Kinntegraa | Logs";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchLogs();
  }, [navigate]);

  // Fetch activity logs when switching to activity tab
  useEffect(() => {
    if (activeTab === "activity" && user) {
      fetchActivityLogs();
    }
  }, [activeTab, activityPage, activityRoleFilter, activitySectionFilter, activityDateFrom, activityDateTo]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Fetch trade logs, reinvestment approval logs, and new reinvestment tagging logs
      const [tradesRes, reinvestmentRes, reinvestmentTaggingRes] = await Promise.all([
        axios.get(`${API}/trades`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
        axios.get(`${API}/approval-logs?entity_type=reinvestment`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
        axios.get(`${API}/reinvestment/logs`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }))
      ]);
      
      // Combine and format logs
      const tradeLogs = (tradesRes.data || []).map(trade => ({
        id: trade.id,
        type: "trade",
        client_name: trade.client_name || "N/A",
        ucc: trade.ucc || trade.client_ucc || "-",
        date: trade.investment_date || trade.created_at,
        trade_type: trade.trade_type || "Buy",
        amount: trade.total_amount || trade.amount || 0,
        portfolio: trade.portfolio_category || "-",
        advisor: trade.advisor_name || trade.sub_broker_name || "-",
        status: trade.status || "pending",
        bond_name: trade.bond_name,
        units: trade.units,
      }));

      const reinvestmentLogs = (reinvestmentRes.data || []).map(log => ({
        id: log.id,
        type: "reinvestment",
        client_name: log.entity_name || log.client_name || "N/A",
        ucc: log.ucc || "-",
        date: log.created_at,
        trade_type: "Reinvestment",
        amount: log.amount || 0,
        portfolio: log.portfolio_category || "-",
        advisor: log.performed_by_name || "-",
        status: log.action || log.status || "pending",
        details: log.details,
      }));

      // New reinvestment tagging logs
      const taggingLogs = (reinvestmentTaggingRes.data || []).map(log => {
        let typeLabel = 'Reinv';
        const tag = log.reinvestment_tag || log.tag || '';
        if (tag === 'principal') typeLabel = 'Reinv-Principal';
        else if (tag === 'interest') typeLabel = 'Reinv-Interest';
        else if (tag === 'both') typeLabel = 'Reinv-Both';
        else if (tag === 'none') typeLabel = 'Reinv-None';
        else if (tag === 'custom') typeLabel = 'Reinv-Custom';
        else if (tag) typeLabel = `Reinv-${tag.charAt(0).toUpperCase() + tag.slice(1)}`;
        
        return {
          id: log.id,
          type: "reinvestment_tag",
          client_name: log.client_name || "N/A",
          ucc: log.target_ucc || log.ucc || "-",
          date: log.expected_date || log.created_at,
          trade_type: typeLabel,
          amount: log.amount || log.net_amount || 0,
          portfolio: log.portfolio_category || log.portfolio || "-",
          advisor: log.tagged_by_name || "-",
          status: log.approval_status || "pending",
          bond_name: log.bond_name,
          expected_date: log.expected_date,
          is_past_date: log.is_past_date,
          client_approved: log.client_approved,
        };
      });

      setLogs([...tradeLogs, ...reinvestmentLogs, ...taggingLogs].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
      ));
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast.error("Failed to load logs");
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityLogs = async () => {
    setActivityLoading(true);
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({
        page: activityPage,
        limit: itemsPerPage,
      });
      
      if (activityRoleFilter !== 'all') params.append('user_role', activityRoleFilter);
      if (activitySectionFilter !== 'all') params.append('page_section', activitySectionFilter);
      if (activityDateFrom) params.append('date_from', activityDateFrom);
      if (activityDateTo) params.append('date_to', activityDateTo);
      
      const res = await axios.get(`${API}/activity-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setActivityLogs(res.data.logs || []);
      setActivityTotalPages(res.data.total_pages || 1);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      if (error.response?.status === 403) {
        toast.error("You don't have permission to view activity logs");
      } else {
        toast.error("Failed to load activity logs");
      }
    } finally {
      setActivityLoading(false);
    }
  };

  // Fetch investment logs (client-approved reinvestments)
  const fetchInvestmentLogs = async () => {
    setInvestmentLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/reinvestment/approved-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvestmentLogs(res.data || []);
    } catch (error) {
      console.error("Error fetching investment logs:", error);
      toast.error("Failed to load investment logs");
    } finally {
      setInvestmentLoading(false);
    }
  };

  // Fetch investment logs when switching to investment tab
  useEffect(() => {
    if (activeTab === "investment" && user) {
      fetchInvestmentLogs();
    }
  }, [activeTab, user]);

  // Handle cancel investment (requires client approval)
  const handleCancelInvestment = async () => {
    if (!selectedInvestment) return;
    setProcessingAction(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/reinvestment/cancel/${selectedInvestment.id}`,
        { reason: cancelReason },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success("Cancellation request sent to client for approval");
      setShowCancelModal(false);
      setCancelReason("");
      setSelectedInvestment(null);
      fetchInvestmentLogs();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to request cancellation");
    } finally {
      setProcessingAction(false);
    }
  };

  // Handle modify investment (requires client re-approval)
  const handleModifyInvestment = async () => {
    if (!selectedInvestment) return;
    setProcessingAction(true);
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/reinvestment/edit/${selectedInvestment.id}`,
        modifyFormData,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success("Modification request sent to client for re-approval");
      setShowModifyModal(false);
      setModifyFormData({});
      setSelectedInvestment(null);
      fetchInvestmentLogs();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to request modification");
    } finally {
      setProcessingAction(false);
    }
  };

  // Open cancel modal
  const openCancelModal = (investment) => {
    setSelectedInvestment(investment);
    setCancelReason("");
    setShowCancelModal(true);
  };

  // Open modify modal
  const openModifyModal = (investment) => {
    setSelectedInvestment(investment);
    setModifyFormData({
      reinvestment_tag: investment.reinvestment_tag || 'both',
      portfolio_category: investment.portfolio_category || 'wealth',
      target_ucc: investment.target_ucc || '',
      reason: ''
    });
    setShowModifyModal(true);
  };

  const filteredInvestmentLogs = investmentLogs.filter(log => {
    if (investmentSearchQuery) {
      const query = investmentSearchQuery.toLowerCase();
      return log.client_name?.toLowerCase().includes(query) || 
             log.bond_name?.toLowerCase().includes(query) ||
             log.target_ucc?.toLowerCase().includes(query);
    }
    return true;
  });

  const filteredLogs = logs.filter(log => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!log.client_name?.toLowerCase().includes(query) && 
          !log.ucc?.toLowerCase().includes(query)) {
        return false;
      }
    }
    
    if (dateFrom && new Date(log.date) < new Date(dateFrom)) return false;
    if (dateTo && new Date(log.date) > new Date(dateTo)) return false;
    if (statusFilter !== "all" && log.status !== statusFilter) return false;
    
    return true;
  });

  const filteredActivityLogs = activityLogs.filter(log => {
    if (activitySearchQuery) {
      const query = activitySearchQuery.toLowerCase();
      if (!log.user_name?.toLowerCase().includes(query) && 
          !log.page_section?.toLowerCase().includes(query) &&
          !log.bond_name?.toLowerCase().includes(query) &&
          !log.property_name?.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  });

  // Pagination calculations for trade logs
  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFrom, dateTo, statusFilter]);

  useEffect(() => {
    setActivityPage(1);
  }, [activitySearchQuery, activityDateFrom, activityDateTo, activityRoleFilter, activitySectionFilter]);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const goToActivityPage = (page) => {
    if (page >= 1 && page <= activityTotalPages) {
      setActivityPage(page);
    }
  };

  const getPageNumbers = (current, total) => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (total <= maxVisiblePages) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      if (current <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(total);
      } else if (current >= total - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = total - 3; i <= total; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = current - 1; i <= current + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(total);
      }
    }
    return pages;
  };

  const handleDownload = () => {
    const headers = ["Client Name", "UCC", "Date", "Type", "Amount", "Portfolio", "Advisor", "Status"];
    const csvContent = [
      headers.join(","),
      ...filteredLogs.map(log => [
        `"${log.client_name}"`,
        log.ucc,
        format(new Date(log.date), "dd/MM/yyyy"),
        log.trade_type,
        log.amount,
        log.portfolio,
        log.advisor,
        log.status
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trade_logs_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const handleActivityDownload = () => {
    const headers = ["User Name", "Role", "Page Section", "Timestamp", "Bond/Property", "Client Viewed"];
    const csvContent = [
      headers.join(","),
      ...filteredActivityLogs.map(log => [
        `"${log.user_name || 'N/A'}"`,
        log.user_role,
        log.page_section,
        log.timestamp ? format(new Date(log.timestamp), "dd/MM/yyyy HH:mm") : '-',
        log.bond_name || log.property_name || '-',
        log.viewed_client_name || '-'
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity_logs_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const getSidebar = () => {
    if (user?.role === "broker") return <Sidebar user={user} />;
    if (user?.role === "sub_broker") return <SubBrokerSidebar user={user} />;
    return <ClientSidebar user={user} />;
  };

  const getStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || { label: status, color: "bg-gray-100 text-gray-800" };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getRoleBadge = (role) => {
    const colors = {
      broker: 'bg-purple-100 text-purple-800',
      sub_broker: 'bg-blue-100 text-blue-800',
      client: 'bg-green-100 text-green-800',
    };
    const labels = {
      broker: 'Broker',
      sub_broker: 'Sub-Broker',
      client: 'Client',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[role] || 'bg-gray-100 text-gray-800'}`}>
        {labels[role] || role}
      </span>
    );
  };

  // Only show activity tab for broker and sub-broker
  const showActivityTab = user?.role === 'broker' || user?.role === 'sub_broker';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {getSidebar()}
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800">Logs</h1>
                <p className="text-sm text-gray-500">View all transaction, approval, and user activity logs</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={activeTab === 'trades' ? fetchLogs : fetchActivityLogs}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
                <Button size="sm" onClick={activeTab === 'trades' ? handleDownload : handleActivityDownload} className="bg-blue-600 hover:bg-blue-700">
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>
            </div>
          </div>
          
          {/* Tabs */}
          {showActivityTab && (
            <div className="px-6 border-t">
              <div className="flex gap-6">
                <button
                  onClick={() => setActiveTab("trades")}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === "trades"
                      ? "border-etihad-gold-600 text-etihad-gold-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="trade-logs-tab"
                >
                  Trade Logs
                </button>
                <button
                  onClick={() => setActiveTab("investment")}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1 ${
                    activeTab === "investment"
                      ? "border-green-600 text-green-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="investment-logs-tab"
                >
                  <TrendingUp className="h-4 w-4" />
                  Investment
                </button>
                <button
                  onClick={() => setActiveTab("activity")}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1 ${
                    activeTab === "activity"
                      ? "border-etihad-gold-600 text-etihad-gold-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="user-activity-tab"
                >
                  <Activity className="h-4 w-4" />
                  User Activity
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Trade Logs Tab Content */}
        {activeTab === "trades" && (
          <>
            {/* Filters */}
            <div className="px-6 py-4 bg-white border-b">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-36 h-9"
                    placeholder="From"
                  />
                  <span className="text-gray-400">to</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-36 h-9"
                    placeholder="To"
                  />
                </div>
                
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by client name or UCC..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Trade Logs Content */}
            <div className="p-6">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="bg-white rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Client Name</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">UCC</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Type</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Amount</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Portfolio</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Advisor</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {paginatedLogs.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                              No logs found
                            </td>
                          </tr>
                        ) : (
                          paginatedLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-800">{log.client_name}</div>
                                {log.bond_name && (
                                  <div className="text-xs text-gray-500">{log.bond_name}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 font-mono">{log.ucc}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {log.date ? format(new Date(log.date), "dd MMM yyyy") : "-"}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-sm font-medium ${
                                  log.trade_type?.startsWith("Reinv") ? "text-purple-600" : "text-blue-600"
                                }`}>
                                  {log.trade_type}
                                </span>
                                {log.units && <span className="text-xs text-gray-500 ml-1">({log.units} units)</span>}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-800 text-right font-mono">
                                ₹{log.amount?.toLocaleString('en-IN') || 0}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 capitalize">{log.portfolio?.replace('_', ' ')}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{log.advisor}</td>
                              <td className="px-4 py-3 text-center">
                                {getStatusBadge(log.status)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem>
                                      <Eye className="h-4 w-4 mr-2" />
                                      View Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Download className="h-4 w-4 mr-2" />
                                      Download Receipt
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>Show</span>
                        <Select value={itemsPerPage.toString()} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
                          <SelectTrigger className="w-16 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="25">25</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                          </SelectContent>
                        </Select>
                        <span>entries</span>
                        <span className="ml-2 text-gray-400">|</span>
                        <span className="ml-2">
                          Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(currentPage - 1)}
                          disabled={currentPage === 1}
                          className="h-8 w-8 p-0"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        
                        {getPageNumbers(currentPage, totalPages).map((page, idx) => (
                          page === '...' ? (
                            <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">...</span>
                          ) : (
                            <Button
                              key={page}
                              variant={currentPage === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => goToPage(page)}
                              className={`h-8 w-8 p-0 ${currentPage === page ? 'bg-etihad-gold-600 hover:bg-etihad-gold-700' : ''}`}
                            >
                              {page}
                            </Button>
                          )
                        ))}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(currentPage + 1)}
                          disabled={currentPage === totalPages}
                          className="h-8 w-8 p-0"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {/* Show total when pagination not needed */}
                  {totalPages <= 1 && totalItems > 0 && (
                    <div className="px-4 py-3 border-t bg-gray-50 text-sm text-gray-600">
                      Showing {totalItems} {totalItems === 1 ? 'entry' : 'entries'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* User Activity Tab Content */}
        {activeTab === "activity" && (
          <>
            {/* Activity Filters */}
            <div className="px-6 py-4 bg-white border-b">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <Input
                    type="date"
                    value={activityDateFrom}
                    onChange={(e) => setActivityDateFrom(e.target.value)}
                    className="w-36 h-9"
                    placeholder="From"
                  />
                  <span className="text-gray-400">to</span>
                  <Input
                    type="date"
                    value={activityDateTo}
                    onChange={(e) => setActivityDateTo(e.target.value)}
                    className="w-36 h-9"
                    placeholder="To"
                  />
                </div>
                
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by user name or section..."
                    value={activitySearchQuery}
                    onChange={(e) => setActivitySearchQuery(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                
                <Select value={activityRoleFilter} onValueChange={setActivityRoleFilter}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="sub_broker">Sub-Broker</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={activitySectionFilter} onValueChange={setActivitySectionFilter}>
                  <SelectTrigger className="w-44 h-9">
                    <SelectValue placeholder="All Sections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    <SelectItem value="holdings">Holdings</SelectItem>
                    <SelectItem value="opportunities">Opportunities</SelectItem>
                    <SelectItem value="real-estate-details">Real Estate Details</SelectItem>
                    <SelectItem value="bond-details">Bond Details</SelectItem>
                    <SelectItem value="dashboard">Dashboard</SelectItem>
                    <SelectItem value="profile">Profile</SelectItem>
                    <SelectItem value="clients">Clients</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Activity Logs Content */}
            <div className="p-6">
              {activityLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="bg-white rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">User</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Role</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Page Section</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Details</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredActivityLogs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                              <Activity className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                              <p>No activity logs found</p>
                              <p className="text-xs mt-1">User visits will appear here as they navigate the platform</p>
                            </td>
                          </tr>
                        ) : (
                          filteredActivityLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-800">{log.user_name || 'Unknown'}</div>
                              </td>
                              <td className="px-4 py-3">
                                {getRoleBadge(log.user_role)}
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium">
                                  {PAGE_SECTIONS[log.page_section] || log.page_section}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {log.bond_name && (
                                  <div>Bond: <span className="font-medium">{log.bond_name}</span></div>
                                )}
                                {log.property_name && (
                                  <div>Property: <span className="font-medium">{log.property_name}</span></div>
                                )}
                                {log.viewed_client_name && (
                                  <div>Client: <span className="font-medium">{log.viewed_client_name}</span></div>
                                )}
                                {log.metadata?.action && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    Action: <span className="capitalize">{log.metadata.action}</span>
                                  </div>
                                )}
                                {!log.bond_name && !log.property_name && !log.viewed_client_name && !log.metadata?.action && '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {log.timestamp ? (
                                  <>
                                    <div>{format(new Date(log.timestamp), "dd MMM yyyy")}</div>
                                    <div className="text-xs text-gray-400">{format(new Date(log.timestamp), "HH:mm:ss")}</div>
                                  </>
                                ) : '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Activity Pagination Controls */}
                  {activityTotalPages > 1 && (
                    <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>Page {activityPage} of {activityTotalPages}</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToActivityPage(activityPage - 1)}
                          disabled={activityPage === 1}
                          className="h-8 w-8 p-0"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        
                        {getPageNumbers(activityPage, activityTotalPages).map((page, idx) => (
                          page === '...' ? (
                            <span key={`activity-ellipsis-${idx}`} className="px-2 text-gray-400">...</span>
                          ) : (
                            <Button
                              key={`activity-page-${page}`}
                              variant={activityPage === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => goToActivityPage(page)}
                              className={`h-8 w-8 p-0 ${activityPage === page ? 'bg-etihad-gold-600 hover:bg-etihad-gold-700' : ''}`}
                            >
                              {page}
                            </Button>
                          )
                        ))}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToActivityPage(activityPage + 1)}
                          disabled={activityPage === activityTotalPages}
                          className="h-8 w-8 p-0"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {/* Show total when pagination not needed */}
                  {activityTotalPages <= 1 && filteredActivityLogs.length > 0 && (
                    <div className="px-4 py-3 border-t bg-gray-50 text-sm text-gray-600">
                      Showing {filteredActivityLogs.length} {filteredActivityLogs.length === 1 ? 'entry' : 'entries'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Investment Logs Tab Content */}
        {activeTab === "investment" && (
          <>
            {/* Investment Filters */}
            <div className="px-6 py-4 bg-white border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by client, bond or UCC..."
                      value={investmentSearchQuery}
                      onChange={(e) => setInvestmentSearchQuery(e.target.value)}
                      className="pl-9 h-9 w-64"
                    />
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={fetchInvestmentLogs}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              </div>
            </div>

            {/* Investment Logs Content */}
            <div className="p-6">
              {investmentLoading ? (
                <div className="bg-white rounded-lg border p-8 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-green-600 mx-auto mb-3" />
                  <p className="text-gray-500">Loading investment logs...</p>
                </div>
              ) : filteredInvestmentLogs.length === 0 ? (
                <div className="bg-white rounded-lg border p-8 text-center">
                  <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No client-approved investments found</p>
                  <p className="text-gray-400 text-sm mt-1">Investments will appear here after client approval</p>
                </div>
              ) : (
                <div className="bg-white rounded-lg border overflow-hidden">
                  <div className="px-4 py-3 bg-green-50 border-b flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-800">Client-Approved Investments</span>
                    <Badge className="bg-green-100 text-green-700 ml-2">{filteredInvestmentLogs.length}</Badge>
                  </div>
                  
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Bond Name (Deal ID)</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-600">Net Amount</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-600">Investment Amt</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">UCC</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Portfolio</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvestmentLogs.map((log, idx) => {
                        const netAmount = log.amount || log.net_amount || 0;
                        const roundDownAmount = roundToHundred(netAmount);
                        
                        return (
                          <tr key={log.id || idx} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <span className="font-medium">
                                {log.expected_date ? format(new Date(log.expected_date), "dd MMM yyyy") : 'N/A'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <div className="font-medium">{log.client_name}</div>
                                <div className="text-xs text-gray-500">{log.client_pan}</div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <div className="font-medium">{log.bond_name}</div>
                                <div className="text-xs text-gray-500">({log.bond_code || log.deal_id || 'N/A'})</div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              ₹{netAmount.toLocaleString('en-IN')}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-green-700 font-semibold">
                              ₹{roundDownAmount.toLocaleString('en-IN')}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-xs">
                                {log.target_ucc || 'Default'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <Badge className="bg-blue-100 text-blue-700 text-xs capitalize">
                                {log.portfolio_category || 'N/A'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {log.approval_status === 'submitted' ? (
                                <Badge className="bg-green-100 text-green-700 text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1 inline" />
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
                                <Badge className="bg-blue-100 text-blue-700 text-xs">
                                  Approved
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openModifyModal(log)}>
                                    <Pencil className="h-3 w-3 mr-2" />
                                    Modify
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => openCancelModal(log)}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Ban className="h-3 w-3 mr-2" />
                                    Cancel
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {/* Summary Footer */}
                  <div className="px-4 py-3 bg-green-50 border-t flex items-center justify-between">
                    <span className="text-sm text-green-700">
                      {filteredInvestmentLogs.length} approved investment{filteredInvestmentLogs.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-green-600">Total Net Amount</p>
                        <p className="font-semibold text-green-800">
                          ₹{filteredInvestmentLogs.reduce((sum, l) => sum + (l.amount || l.net_amount || 0), 0).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-green-600">Total Investment</p>
                        <p className="font-bold text-green-800">
                          ₹{filteredInvestmentLogs.reduce((sum, l) => sum + roundToHundred(l.amount || l.net_amount || 0), 0).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Cancel Investment Modal */}
        <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Ban className="h-5 w-5" />
                Cancel Investment
              </DialogTitle>
              <DialogDescription>
                This investment has been approved by the client. Cancellation will require client re-approval.
              </DialogDescription>
            </DialogHeader>
            
            {selectedInvestment && (
              <div className="py-4 space-y-4">
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Client</span>
                    <span className="font-medium">{selectedInvestment.client_name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Bond</span>
                    <span className="font-medium">{selectedInvestment.bond_name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Amount</span>
                    <span className="font-medium">₹{(selectedInvestment.amount || selectedInvestment.net_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Reason for cancellation</Label>
                  <Textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Enter reason..."
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancelModal(false)} disabled={processingAction}>
                Back
              </Button>
              <Button 
                onClick={handleCancelInvestment} 
                disabled={processingAction}
                className="bg-red-600 hover:bg-red-700"
              >
                {processingAction ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Ban className="h-4 w-4 mr-2" />
                )}
                Request Cancellation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modify Investment Modal */}
        <Dialog open={showModifyModal} onOpenChange={setShowModifyModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-amber-600" />
                Modify Investment
              </DialogTitle>
              <DialogDescription>
                Modify this approved investment. Changes will require client re-approval.
              </DialogDescription>
            </DialogHeader>
            
            {selectedInvestment && (
              <div className="py-4 space-y-4">
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <div className="font-medium">{selectedInvestment.bond_name}</div>
                  <div className="text-sm text-gray-500">
                    ₹{(selectedInvestment.amount || selectedInvestment.net_amount || 0).toLocaleString('en-IN')} • {selectedInvestment.client_name}
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Tag Type</Label>
                    <Select
                      value={modifyFormData.reinvestment_tag}
                      onValueChange={(value) => setModifyFormData(prev => ({ ...prev, reinvestment_tag: value }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select tag" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="principal">Principal</SelectItem>
                        <SelectItem value="interest">Interest</SelectItem>
                        <SelectItem value="both">Both (P+I)</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Portfolio</Label>
                    <Select
                      value={modifyFormData.portfolio_category}
                      onValueChange={(value) => setModifyFormData(prev => ({ ...prev, portfolio_category: value }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select portfolio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wealth">Wealth</SelectItem>
                        <SelectItem value="tax">Tax</SelectItem>
                        <SelectItem value="short_term">Short Term</SelectItem>
                        <SelectItem value="commodities">Commodities</SelectItem>
                        <SelectItem value="bonds">Bonds</SelectItem>
                        <SelectItem value="real_estate">Real Estate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Reason for change</Label>
                    <Textarea
                      value={modifyFormData.reason || ''}
                      onChange={(e) => setModifyFormData(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder="Enter reason..."
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowModifyModal(false)} disabled={processingAction}>
                Cancel
              </Button>
              <Button 
                onClick={handleModifyInvestment} 
                disabled={processingAction || !modifyFormData.reinvestment_tag || !modifyFormData.portfolio_category}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {processingAction ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Pencil className="h-4 w-4 mr-2" />
                )}
                Request Modification
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
