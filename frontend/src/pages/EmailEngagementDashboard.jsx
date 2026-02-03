import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Mail,
  Users,
  CheckCircle,
  Clock,
  RefreshCw,
  Calendar,
  Search,
  Filter,
  TrendingUp,
  AlertCircle,
  ArrowLeft,
  Download,
  DollarSign,
  Tag,
  X
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Format currency
const formatINR = (value) => {
  if (!value) return "₹0";
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

// Summary Card Component
const SummaryCard = ({ icon: Icon, title, value, subtitle, color = "blue", trend }) => {
  const colorClasses = {
    blue: "bg-blue-50 border-blue-200 text-blue-600",
    green: "bg-emerald-50 border-emerald-200 text-emerald-600",
    amber: "bg-amber-50 border-amber-200 text-amber-600",
    red: "bg-red-50 border-red-200 text-red-600",
    gold: "bg-etihad-gold-50 border-etihad-gold-200 text-etihad-gold-600"
  };

  return (
    <div className={`rounded-xl border p-5 ${colorClasses[color]}`} data-testid={`summary-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg bg-white/50`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <Badge variant="outline" className="text-xs">
            {trend}
          </Badge>
        )}
      </div>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm font-medium mt-1">{title}</p>
      {subtitle && <p className="text-xs opacity-70 mt-0.5">{subtitle}</p>}
    </div>
  );
};

export default function EmailEngagementDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [logs, setLogs] = useState([]);
  const [clients, setClients] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [allBonds, setAllBonds] = useState([]);
  
  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [holdingStatus, setHoldingStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Manual tagging modal state
  const [showTagModal, setShowTagModal] = useState(false);
  const [selectedEmailLog, setSelectedEmailLog] = useState(null);
  const [availableCashflows, setAvailableCashflows] = useState([]);
  const [tagForm, setTagForm] = useState({
    cashflow_id: "",
    transaction_date: "",
    payment_type: "normal" // "normal" or "prepayment"
  });
  const [tagging, setTagging] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      // Build query params
      const params = new URLSearchParams();
      if (dateFrom) params.append("date_from", dateFrom);
      if (dateTo) params.append("date_to", dateTo);
      if (selectedClient) params.append("client_id", selectedClient);
      if (holdingStatus) params.append("holding_status", holdingStatus);

      const [dashboardRes, clientsRes, allClientsRes, bondsRes] = await Promise.all([
        axios.get(`${API}/email-engagement/dashboard?${params.toString()}`, { headers }),
        axios.get(`${API}/email-engagement/clients`, { headers }),
        axios.get(`${API}/clients`, { headers }),
        axios.get(`${API}/bonds`, { headers })
      ]);

      setSummary(dashboardRes.data.summary);
      setLogs(dashboardRes.data.logs);
      setClients(clientsRes.data.clients || []);
      setAllClients(allClientsRes.data || []);
      setAllBonds(bondsRes.data || []);
    } catch (error) {
      console.error("Error fetching email engagement data:", error);
      toast.error("Failed to load email engagement data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo, selectedClient, holdingStatus]);

  useEffect(() => {
    document.title = "Email Engagement | Kinntegraa";
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const handleTriggerEmailProcessing = async () => {
    try {
      const token = localStorage.getItem("token");
      toast.info("Triggering email processing...");
      
      const response = await axios.post(
        `${API}/email-reader/trigger-now?days_back=7`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`Email processing complete! Processed ${response.data.result?.processed || 0} emails`);
      fetchDashboardData();
    } catch (error) {
      console.error("Error triggering email processing:", error);
      toast.error("Failed to trigger email processing");
    }
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelectedClient("");
    setHoldingStatus("");
    setSearchQuery("");
  };
  
  // Open manual tag modal for an email log
  const openTagModal = (emailLog) => {
    setSelectedEmailLog(emailLog);
    setTagForm({
      client_id: emailLog.client_id || "",
      bond_id: emailLog.bond_id || "",
      repayment_date: emailLog.repayment_date 
        ? emailLog.repayment_date.split('T')[0] 
        : ""
    });
    setShowTagModal(true);
  };
  
  // Submit manual tag
  const handleSubmitTag = async () => {
    if (!tagForm.client_id || !tagForm.bond_id || !tagForm.repayment_date) {
      toast.error("Please fill in all fields");
      return;
    }
    
    setTagging(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/email-engagement/manual-tag`,
        {
          email_log_id: selectedEmailLog.id,
          client_id: tagForm.client_id,
          bond_id: tagForm.bond_id,
          repayment_date: tagForm.repayment_date
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(response.data.message || "Email tagged successfully");
      setShowTagModal(false);
      setSelectedEmailLog(null);
      fetchDashboardData();
    } catch (error) {
      console.error("Error tagging email:", error);
      toast.error(error.response?.data?.detail || "Failed to tag email");
    } finally {
      setTagging(false);
    }
  };

  // Filter logs by search query
  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      log.client_name?.toLowerCase().includes(search) ||
      log.bond_name?.toLowerCase().includes(search) ||
      log.bond_code?.toLowerCase().includes(search) ||
      log.email_subject?.toLowerCase().includes(search)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600 mx-auto mb-3" />
          <p className="text-gray-500">Loading email engagement data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/broker/dashboard")}
                className="text-gray-600"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Mail className="h-6 w-6 text-etihad-gold-600" />
                <h1 className="text-xl font-bold text-gray-900">Email Engagement Dashboard</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={handleTriggerEmailProcessing}
                className="bg-etihad-gold-600 hover:bg-etihad-gold-700"
              >
                <Mail className="h-4 w-4 mr-1" />
                Process Emails Now
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            icon={Mail}
            title="Total Emails Read"
            value={summary?.total_emails_read || 0}
            color="blue"
          />
          <SummaryCard
            icon={Users}
            title="Clients Identified"
            value={summary?.clients_identified || 0}
            color="gold"
          />
          <SummaryCard
            icon={CheckCircle}
            title="Holdings Updated"
            value={summary?.holdings_updated || 0}
            color="green"
          />
          <SummaryCard
            icon={Clock}
            title="Holdings Pending"
            value={summary?.holdings_pending || 0}
            color="amber"
          />
        </div>

        {/* Amount Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              <span className="text-sm text-gray-600">Total Gross Amount</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700">{formatINR(summary?.total_gross_amount)}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <span className="text-sm text-gray-600">Total Net Amount</span>
            </div>
            <p className="text-2xl font-bold text-blue-700">{formatINR(summary?.total_net_amount)}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <span className="text-sm text-gray-600">Total TDS Deducted</span>
            </div>
            <p className="text-2xl font-bold text-amber-700">{formatINR(summary?.total_tds)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-5 w-5 text-gray-500" />
            <span className="font-medium text-gray-700">Filters</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">From Date</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">To Date</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Client</label>
              <Select value={selectedClient} onValueChange={(val) => setSelectedClient(val === "all" ? "" : val)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name} ({client.email_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Holding Status</label>
              <Select value={holdingStatus} onValueChange={(val) => setHoldingStatus(val === "all" ? "" : val)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="updated">Updated</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" size="sm" onClick={clearFilters} className="w-full h-9">
                Clear Filters
              </Button>
            </div>
          </div>
        </div>

        {/* Search and Table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-800">Email Read Logs</h3>
              <Badge variant="secondary">{filteredLogs.length}</Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by client, bond, subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 w-64"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Email Read Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Client Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Bond / Deal ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Repayment Date</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Gross Amount</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Net Amount</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Holding Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Last Updated</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center">
                      <Mail className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No email logs found</p>
                      <p className="text-gray-400 text-xs mt-1">Try adjusting your filters or process new emails</p>
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log, idx) => (
                    <tr key={log.id || idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-800">
                            {log.email_read_at ? format(new Date(log.email_read_at), "dd MMM yyyy") : '-'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {log.email_read_at ? format(new Date(log.email_read_at), "hh:mm a") : '-'}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-800">{log.client_name || <span className="text-amber-600 italic">Unmatched</span>}</p>
                          {log.client_pan && (
                            <p className="text-xs text-gray-500 font-mono">{log.client_pan}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-800">{log.bond_name || <span className="text-gray-400">-</span>}</p>
                          {log.bond_code && (
                            <Badge variant="outline" className="text-xs font-mono">
                              {log.bond_code}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {log.repayment_date ? format(new Date(log.repayment_date), "dd MMM yyyy") : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700">
                        {formatINR(log.gross_amount)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-blue-700">
                        {formatINR(log.net_amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {log.holding_updated ? (
                          <Badge className="bg-emerald-100 text-emerald-700">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Updated
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {log.holding_updated_at 
                          ? format(new Date(log.holding_updated_at), "dd MMM yyyy, hh:mm a") 
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(!log.client_id || !log.holding_updated) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openTagModal(log)}
                            className="h-7 px-2 text-xs border-etihad-gold-500 text-etihad-gold-700 hover:bg-etihad-gold-50"
                            data-testid={`tag-btn-${log.id}`}
                          >
                            <Tag className="h-3 w-3 mr-1" />
                            Tag
                          </Button>
                        )}
                        {log.manually_tagged && (
                          <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">
                            Manual
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Manual Tagging Modal */}
      <Dialog open={showTagModal} onOpenChange={setShowTagModal}>
        <DialogContent className="max-w-lg" data-testid="manual-tag-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-etihad-gold-600" />
              Manual Email Tagging
            </DialogTitle>
          </DialogHeader>
          
          {selectedEmailLog && (
            <div className="space-y-4">
              {/* Email Info Card */}
              <div className="bg-gray-50 rounded-lg p-3 border">
                <p className="text-xs text-gray-500 mb-1">Email Subject</p>
                <p className="font-medium text-gray-800 text-sm truncate">{selectedEmailLog.email_subject || 'N/A'}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                  <span>Read: {selectedEmailLog.email_read_at ? format(new Date(selectedEmailLog.email_read_at), "dd MMM yyyy") : 'N/A'}</span>
                  <span className="font-semibold text-emerald-700">Gross: {formatINR(selectedEmailLog.gross_amount)}</span>
                  <span className="font-semibold text-blue-700">Net: {formatINR(selectedEmailLog.net_amount)}</span>
                </div>
              </div>
              
              {/* Client Selection */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Select Client <span className="text-red-500">*</span>
                </label>
                <Select 
                  value={tagForm.client_id} 
                  onValueChange={(val) => setTagForm(prev => ({ ...prev, client_id: val }))}
                >
                  <SelectTrigger data-testid="tag-client-select">
                    <SelectValue placeholder="Choose a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {allClients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} {client.pan_number && `(${client.pan_number})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Bond/Deal Selection */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Select Bond/Deal <span className="text-red-500">*</span>
                </label>
                <Select 
                  value={tagForm.bond_id} 
                  onValueChange={(val) => setTagForm(prev => ({ ...prev, bond_id: val }))}
                >
                  <SelectTrigger data-testid="tag-bond-select">
                    <SelectValue placeholder="Choose a bond" />
                  </SelectTrigger>
                  <SelectContent>
                    {allBonds.map(bond => (
                      <SelectItem key={bond.id} value={bond.id}>
                        {bond.name} {bond.bond_code && `(${bond.bond_code})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Investment/Repayment Date */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Investment/Repayment Date <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  value={tagForm.repayment_date}
                  onChange={(e) => setTagForm(prev => ({ ...prev, repayment_date: e.target.value }))}
                  data-testid="tag-date-input"
                />
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowTagModal(false)}
              disabled={tagging}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitTag}
              disabled={tagging || !tagForm.client_id || !tagForm.bond_id || !tagForm.repayment_date}
              className="bg-etihad-gold-600 hover:bg-etihad-gold-700"
              data-testid="submit-tag-btn"
            >
              {tagging ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Tagging...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Tag Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
