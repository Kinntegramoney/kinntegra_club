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

export default function ClientLogs() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [apiLogs, setApiLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("reinvestment"); // 'reinvestment' or 'api'

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
    fetchLogs();
    fetchApiLogs();
  }, [navigate]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/reinvestment-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(response.data || []);
    } catch (error) {
      console.error("Error fetching logs:", error);
      if (error.response?.status !== 404) {
        toast.error("Failed to load logs");
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchApiLogs = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/investment-api-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setApiLogs(response.data || []);
    } catch (error) {
      console.error("Error fetching API logs:", error);
      // Don't show error toast for API logs as it may not have any
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

  const getStatusBadge = (status) => {
    const statusConfig = {
      'pending': { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
      'approved': { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
      'rejected': { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
      'submitted': { label: 'Submitted to API', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
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

  const filteredLogs = logs.filter(log => {
    if (statusFilter === 'all') return true;
    return log.approval_status === statusFilter;
  });

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
              <Button variant="outline" size="sm" onClick={() => { fetchLogs(); fetchApiLogs(); }}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="px-6 flex gap-1">
            <button
              onClick={() => setActiveTab("reinvestment")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "reinvestment"
                  ? "bg-teal-50 text-teal-700 border-teal-500"
                  : "text-gray-600 border-transparent hover:bg-gray-50"
              }`}
            >
              <RefreshCw className="h-4 w-4" />
              Reinvestment Logs
              {logs.length > 0 && (
                <Badge variant="secondary" className="bg-teal-100 text-teal-700">{logs.length}</Badge>
              )}
            </button>
            <button
              onClick={() => setActiveTab("api")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "api"
                  ? "bg-blue-50 text-blue-700 border-blue-500"
                  : "text-gray-600 border-transparent hover:bg-gray-50"
              }`}
            >
              <Server className="h-4 w-4" />
              Investment API Logs
              {apiLogs.length > 0 && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700">{apiLogs.length}</Badge>
              )}
            </button>
          </div>
        </div>

        {/* Filters - only for reinvestment logs */}
        {activeTab === "reinvestment" && (
        <div className="px-6 py-3 bg-white border-b">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">Filter:</span>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="ml-auto text-sm text-gray-500">
              {filteredLogs.length} records
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
            ) : filteredLogs.length === 0 ? (
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
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50" data-testid={`log-${log.id}`}>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-teal-600" />
                            <span className="font-medium text-gray-800 text-sm">{log.bond_name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {formatDate(log.expected_date)?.split(' ')[0]}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-sm">
                          ₹{formatCurrency(log.net_amount)}
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
                          {log.tagged_by_name}
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
      </div>
    </div>
  );
}
