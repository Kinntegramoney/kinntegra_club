import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import ClientSidebar from "@/components/ClientSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  Search, Download, Calendar, Filter, RefreshCw,
  CheckCircle, XCircle, Clock, Users,
  ChevronDown, Eye, MoreVertical
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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800" },
  approved: { label: "Approved", color: "bg-green-100 text-green-800" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800" },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-800" },
  broker_approved: { label: "Broker Approved", color: "bg-green-100 text-green-800" },
  broker_rejected: { label: "Broker Rejected", color: "bg-red-100 text-red-800" },
  client_approved: { label: "Client Approved", color: "bg-emerald-100 text-emerald-800" },
  client_rejected: { label: "Client Rejected", color: "bg-orange-100 text-orange-800" },
  completed: { label: "Completed", color: "bg-green-100 text-green-800" },
};

export default function TradeLogs() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Fetch trade logs, reinvestment approval logs, and new reinvestment tagging logs
      const [tradesRes, reinvestmentRes, reinvestmentTaggingRes] = await Promise.all([
        axios.get(`${API}/trades/all`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
        axios.get(`${API}/approval-logs?entity_type=reinvestment`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
        axios.get(`${API}/reinvestment/logs`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }))
      ]);
      
      // Combine and format logs
      const tradeLogs = (tradesRes.data || []).map(trade => ({
        id: trade.id,
        type: "trade",
        client_name: trade.client_name || "N/A",
        ucc: trade.ucc || trade.client_ucc || "-",
        date: trade.created_at || trade.investment_date,
        trade_type: trade.trade_type || "Buy",
        amount: trade.total_amount || trade.amount || 0,
        payment_mode: trade.payment_mode || "NEFT",
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
        payment_mode: "-",
        advisor: log.performed_by_name || "-",
        status: log.action || log.status || "pending",
        details: log.details,
      }));

      // New reinvestment tagging logs
      const taggingLogs = (reinvestmentTaggingRes.data || []).map(log => ({
        id: log.id,
        type: "reinvestment_tag",
        client_name: log.client_name || "N/A",
        ucc: log.target_ucc || "-",
        date: log.created_at,
        trade_type: log.reinvestment_tag === 'reinvest' ? "Reinvest" : 
                    log.reinvestment_tag === 'withdraw' ? "Withdraw" : 
                    log.reinvestment_tag === 'other' ? "Other" : log.reinvestment_tag,
        amount: log.net_amount || 0,
        payment_mode: log.portfolio_category || "-",
        advisor: log.tagged_by_name || "-",
        status: log.approval_status || "pending",
        bond_name: log.bond_name,
        expected_date: log.expected_date,
        is_past_date: log.is_past_date,
        client_approved: log.client_approved,
      }));

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

  const filteredLogs = logs.filter(log => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!log.client_name?.toLowerCase().includes(query) && 
          !log.ucc?.toLowerCase().includes(query)) {
        return false;
      }
    }
    
    // Date filter
    if (dateFrom && new Date(log.date) < new Date(dateFrom)) return false;
    if (dateTo && new Date(log.date) > new Date(dateTo)) return false;
    
    // Status filter
    if (statusFilter !== "all" && log.status !== statusFilter) return false;
    
    return true;
  });

  const handleDownload = () => {
    // Export filtered logs to CSV
    const headers = ["Client Name", "UCC", "Date", "Type", "Amount", "Payment Mode", "Advisor", "Status"];
    const csvContent = [
      headers.join(","),
      ...filteredLogs.map(log => [
        `"${log.client_name}"`,
        log.ucc,
        format(new Date(log.date), "dd/MM/yyyy"),
        log.trade_type,
        log.amount,
        log.payment_mode,
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
                <p className="text-sm text-gray-500">View all transaction and approval logs</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={fetchLogs}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
                <Button size="sm" onClick={handleDownload} className="bg-blue-600 hover:bg-blue-700">
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>
            </div>
          </div>
          
        </div>

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

        {/* Content */}
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
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Payment Mode</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Advisor</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                          No logs found
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((log) => (
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
                              log.trade_type === "Reinvestment" ? "text-purple-600" : "text-blue-600"
                            }`}>
                              {log.trade_type}
                            </span>
                            {log.units && <span className="text-xs text-gray-500 ml-1">({log.units} units)</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-800 text-right font-mono">
                            ₹{log.amount?.toLocaleString('en-IN') || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{log.payment_mode}</td>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
