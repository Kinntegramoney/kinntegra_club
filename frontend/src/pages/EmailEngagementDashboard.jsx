import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { format } from "date-fns";
import { toZonedTime, format as formatTz } from "date-fns-tz";
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
  X,
  Landmark,
  Copy
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
    <div className={`rounded-xl border p-4 h-full flex flex-col ${colorClasses[color]}`} data-testid={`summary-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-lg bg-white/50`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <Badge variant="outline" className="text-xs">
            {trend}
          </Badge>
        )}
      </div>
      <p className="text-2xl font-bold">{value}</p>
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
  
  // Helper function to format date in IST
  const formatIST = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      const istDate = toZonedTime(date, 'Asia/Kolkata');
      return formatTz(istDate, "dd MMM yyyy, HH:mm", { timeZone: 'Asia/Kolkata' });
    } catch {
      return '-';
    }
  };
  
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
  
  // Client selection for unmatched entries
  const [showClientSelect, setShowClientSelect] = useState(null); // log id
  const [bondClients, setBondClients] = useState([]);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [loadingBondClients, setLoadingBondClients] = useState(false);
  
  // Process emails state
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processDays, setProcessDays] = useState("180"); // Default to 6 months
  const [processing, setProcessing] = useState(false);
  const [availableDeals, setAvailableDeals] = useState([]);
  const [selectedDeals, setSelectedDeals] = useState([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  
  // Reset tracker state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetOption, setResetOption] = useState("unapproved");
  const [resetFromDate, setResetFromDate] = useState("");
  const [resetting, setResetting] = useState(false);
  
  // Bond/Deal filter state
  const [selectedBond, setSelectedBond] = useState("");

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

  // Fetch available deals when process modal opens
  useEffect(() => {
    if (showProcessModal) {
      fetchAvailableDeals("180");
    }
  }, [showProcessModal]);

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

  // Fetch available deals from mailbox when process modal opens
  const fetchAvailableDeals = async (days = null) => {
    try {
      setLoadingDeals(true);
      const token = localStorage.getItem("token");
      console.log("Fetching available deals, token exists:", !!token);
      
      // Use provided days or current processDays value, default to 180 for initial load
      const daysToUse = days || processDays;
      const daysParam = daysToUse === "all" ? 365 : parseInt(daysToUse) || 180;
      
      console.log(`Calling available-deals API with days_back=${daysParam}`);
      const response = await axios.get(
        `${API}/email-reader/available-deals?days_back=${daysParam}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      console.log("Available deals response:", response.data);
      setAvailableDeals(response.data.deals || []);
    } catch (error) {
      console.error("Error fetching available deals:", error);
      console.error("Error response:", error.response?.data);
      toast.error("Failed to load deals from mailbox");
    } finally {
      setLoadingDeals(false);
    }
  };

  // Toggle deal selection
  const toggleDealSelection = (dealCode) => {
    setSelectedDeals(prev => 
      prev.includes(dealCode) 
        ? prev.filter(d => d !== dealCode)
        : [...prev, dealCode]
    );
  };

  // Select/Deselect all deals
  const toggleAllDeals = () => {
    if (selectedDeals.length === availableDeals.length) {
      setSelectedDeals([]);
    } else {
      setSelectedDeals(availableDeals.map(d => d.code));
    }
  };

  // Unified Process Emails function
  const handleProcessEmails = async () => {
    try {
      setProcessing(true);
      const token = localStorage.getItem("token");
      
      const daysParam = processDays === "all" ? 365 : parseInt(processDays);
      const filterMsg = selectedDeals.length > 0 
        ? ` for ${selectedDeals.length} selected deal(s)` 
        : " (all deals)";
      toast.info(`Processing emails from last ${daysParam} days${filterMsg}...`);
      
      const requestBody = selectedDeals.length > 0 
        ? { bond_codes: selectedDeals }
        : {};
      
      const response = await axios.post(
        `${API}/email-reader/process-emails?days_back=${daysParam}`,
        requestBody,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const result = response.data;
      let msg = `Processing complete! New: ${result.new_entries || 0}`;
      if (result.skipped_duplicates > 0) msg += `, Matched existing repayments: ${result.skipped_duplicates}`;
      if (result.skipped_filtered > 0) msg += `, Filtered out: ${result.skipped_filtered}`;
      toast.success(msg);
      
      setShowProcessModal(false);
      setSelectedDeals([]);
      fetchDashboardData();
    } catch (error) {
      console.error("Error processing emails:", error);
      toast.error(error.response?.data?.detail || "Failed to process emails");
    } finally {
      setProcessing(false);
    }
  };

  // Approve an email log to create actual_repayment
  const handleApproveLog = async (logId) => {
    try {
      const token = localStorage.getItem("token");
      toast.info("Approving email log...");
      
      const response = await axios.post(
        `${API}/email-reader/approve-log/${logId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success("Email log approved! Actual cashflow updated.");
      fetchDashboardData();
    } catch (error) {
      console.error("Error approving email log:", error);
      toast.error(error.response?.data?.detail || "Failed to approve email log");
    }
  };

  // Auto-tag a single email log entry (after client is matched)
  const handleAutoTagSingle = async (log) => {
    try {
      const token = localStorage.getItem("token");
      toast.info("Auto-tagging entry...");
      
      // Call the auto-tag API for this specific log
      const response = await axios.post(
        `${API}/email-engagement/auto-tag-single`,
        { 
          log_id: log.id,
          client_id: log.matched_client_id,
          gross_amount: log.gross_amount,
          bond_code: log.bond_code || log.bond_id
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        toast.success("Entry auto-tagged successfully! Actual cashflow updated.");
        fetchDashboardData();
      } else {
        toast.error(response.data.message || "Failed to auto-tag entry");
      }
    } catch (error) {
      console.error("Error auto-tagging entry:", error);
      toast.error(error.response?.data?.detail || "Failed to auto-tag entry");
    }
  };

  // Reset email tracker to allow re-reading emails
  const handleResetTracker = async () => {
    try {
      setResetting(true);
      const token = localStorage.getItem("token");
      
      const payload = {
        option: resetOption,
        from_date: resetOption === "from_date" ? resetFromDate : null
      };
      
      toast.info("Resetting email tracker...");
      
      const response = await axios.post(
        `${API}/email-reader/reset-tracker`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`Email tracker reset! ${response.data.deleted_count || 0} logs cleared.`);
      setShowResetModal(false);
      fetchDashboardData();
    } catch (error) {
      console.error("Error resetting tracker:", error);
      toast.error(error.response?.data?.detail || "Failed to reset email tracker");
    } finally {
      setResetting(false);
    }
  };

  // Fetch clients who have trades in a specific bond (with similarity scores)
  const fetchBondClients = async (bondId, emailClientName = '') => {
    try {
      setLoadingBondClients(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API}/email-reader/bond-clients/${bondId}`,
        { 
          headers: { Authorization: `Bearer ${token}` },
          params: { email_client_name: emailClientName }
        }
      );
      // Response includes similarity scores and is sorted by best match
      setBondClients(response.data.clients || []);
    } catch (error) {
      console.error("Error fetching bond clients:", error);
      setBondClients([]);
    } finally {
      setLoadingBondClients(false);
    }
  };

  // Open client selection dropdown for a log
  const openClientSelect = async (log) => {
    setShowClientSelect(log.id);
    setClientSearchQuery("");
    if (log.bond_id) {
      // Pass email's client name to get similarity scores
      await fetchBondClients(log.bond_id, log.client_name || '');
    }
  };

  // Assign a client to an email log
  const handleAssignClient = async (logId, clientId, clientName) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/email-reader/assign-client`,
        { log_id: logId, client_id: clientId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Client "${clientName}" assigned successfully`);
      setShowClientSelect(null);
      fetchDashboardData();
    } catch (error) {
      console.error("Error assigning client:", error);
      toast.error(error.response?.data?.detail || "Failed to assign client");
    }
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelectedClient("");
    setSelectedBond("");
    setHoldingStatus("");
    setSearchQuery("");
  };
  
  // Open manual tag modal for an email log
  const openTagModal = async (emailLog) => {
    setSelectedEmailLog(emailLog);
    setTagForm({
      transaction_date: "",
      payment_type: "normal"
    });
    
    // Fetch available investment dates for this specific client + deal combination
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      if (emailLog.client_name) params.append("client_name", emailLog.client_name);
      if (emailLog.bond_code) params.append("bond_code", emailLog.bond_code);
      else if (emailLog.bond_name) params.append("bond_name", emailLog.bond_name);
      
      const response = await axios.get(
        `${API}/email-engagement/client-investments?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAvailableCashflows(response.data.investments || []);
    } catch (error) {
      console.error("Error fetching investment dates:", error);
      setAvailableCashflows([]);
    }
    
    setShowTagModal(true);
  };
  
  // Auto-tag all pending repayments
  const [autoTagging, setAutoTagging] = useState(false);
  
  const handleAutoTag = async () => {
    setAutoTagging(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/email-engagement/auto-tag`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.tagged_count > 0) {
        toast.success(`Auto-tagged ${response.data.tagged_count} repayments successfully`);
      } else {
        toast.info(response.data.message || "No pending emails to tag");
      }
      fetchDashboardData();
    } catch (error) {
      console.error("Error auto-tagging:", error);
      toast.error(error.response?.data?.detail || "Failed to auto-tag repayments");
    } finally {
      setAutoTagging(false);
    }
  };
  
  // Submit manual tag - adds to actual repayment and adjusts XIRR
  const handleSubmitTag = async () => {
    if (!tagForm.transaction_date || !tagForm.payment_type) {
      toast.error("Please select transaction date and payment type");
      return;
    }
    
    setTagging(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/email-engagement/process-repayment`,
        {
          email_log_id: selectedEmailLog.id,
          transaction_date: tagForm.transaction_date,
          payment_type: tagForm.payment_type,
          gross_amount: selectedEmailLog.gross_amount,
          net_amount: selectedEmailLog.net_amount,
          tds_amount: selectedEmailLog.tds_amount,
          client_id: selectedEmailLog.client_id,
          client_name: selectedEmailLog.client_name,
          bond_id: selectedEmailLog.bond_id,
          bond_name: selectedEmailLog.bond_name
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(response.data.message || "Repayment processed successfully");
      setShowTagModal(false);
      setSelectedEmailLog(null);
      fetchDashboardData();
    } catch (error) {
      console.error("Error processing repayment:", error);
      toast.error(error.response?.data?.detail || "Failed to process repayment");
    } finally {
      setTagging(false);
    }
  };
  
  // Cleanup duplicate emails
  const cleanupDuplicates = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.delete(
        `${API}/email-reader/cleanup-duplicates`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const result = response.data;
      if (result.duplicates_removed > 0) {
        toast.success(`Removed ${result.duplicates_removed} duplicate entries. ${result.unique_entries_remaining} emails remaining.`);
        fetchDashboardData();
      } else {
        toast.info("No duplicate entries found.");
      }
    } catch (error) {
      console.error("Error cleaning up duplicates:", error);
      toast.error(error.response?.data?.detail || "Failed to cleanup duplicates");
    }
  };

  // Filter logs by search query
  const filteredLogs = logs.filter(log => {
    // Bond/Deal filter
    if (selectedBond && log.bond_code !== selectedBond) return false;
    
    // Search query filter
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      log.client_name?.toLowerCase().includes(search) ||
      log.bond_name?.toLowerCase().includes(search) ||
      log.bond_code?.toLowerCase().includes(search) ||
      log.email_subject?.toLowerCase().includes(search)
    );
  });
  
  // Get unique bonds for filter dropdown
  const uniqueBonds = [...new Map(logs.map(log => [log.bond_code, { code: log.bond_code, name: log.bond_name }])).values()].filter(b => b.code);

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
                <h1 className="text-xl font-bold text-gray-900">Email Tracker</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="border-gray-300 hover:bg-gray-50"
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={cleanupDuplicates}
                className="border-orange-300 text-orange-700 hover:bg-orange-50 bg-orange-50/50"
                data-testid="cleanup-duplicates-btn"
                title="Remove duplicate email entries"
              >
                <Copy className="h-4 w-4 mr-1.5" />
                Cleanup Duplicates
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowResetModal(true)}
                className="border-red-300 text-red-700 hover:bg-red-50 bg-red-50/50"
                data-testid="reset-tracker-btn"
              >
                <X className="h-4 w-4 mr-1.5" />
                Reset Tracker
              </Button>
              <Button
                size="sm"
                onClick={() => setShowProcessModal(true)}
                className="bg-etihad-gold-600 hover:bg-etihad-gold-700 text-white"
                data-testid="process-emails-btn"
              >
                <Mail className="h-4 w-4 mr-1.5" />
                Process Emails
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Email Tracker Modal */}
      <Dialog open={showResetModal} onOpenChange={setShowResetModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Reset Email Tracker
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">
              This will clear the email tracking history and allow the system to re-read emails from the mailbox.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800">
                <strong>Warning:</strong> This action will delete all email read logs. 
                Approved repayments will NOT be affected.
              </p>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">
                Select reset option:
              </label>
              <Select value={resetOption} onValueChange={setResetOption}>
                <SelectTrigger data-testid="reset-option-select">
                  <SelectValue placeholder="Select option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unapproved">Clear unapproved logs only</SelectItem>
                  <SelectItem value="all">Clear all logs (keep approved repayments)</SelectItem>
                  <SelectItem value="from_date">Clear logs from specific date</SelectItem>
                </SelectContent>
              </Select>
              {resetOption === "from_date" && (
                <Input
                  type="date"
                  value={resetFromDate}
                  onChange={(e) => setResetFromDate(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResetModal(false)}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetTracker}
              disabled={resetting}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-reset-btn"
            >
              {resetting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-1" />
                  Reset Tracker
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Process Emails Modal */}
      <Dialog open={showProcessModal} onOpenChange={(open) => {
        setShowProcessModal(open);
        if (!open) {
          setSelectedDeals([]);
          setAvailableDeals([]);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-etihad-gold-600" />
              Process Emails
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-gray-600">
              Read emails from mailbox and create log entries. 
              <strong> Duplicate entries will be skipped</strong> - existing records won't be updated.
            </p>
            
            {/* Time Period Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Select time period to read:
              </label>
              <Select value={processDays} onValueChange={(value) => {
                setProcessDays(value);
                // Refresh deals when period changes
                setTimeout(() => fetchAvailableDeals(), 100);
              }}>
                <SelectTrigger data-testid="process-days-select">
                  <SelectValue placeholder="Select days" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="60">Last 60 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 6 months</SelectItem>
                  <SelectItem value="all">All emails (1 year)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Deal ID Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Select Deal IDs to process:
                </label>
                {availableDeals.length > 0 && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={toggleAllDeals}
                    className="text-xs h-auto p-0"
                  >
                    {selectedDeals.length === availableDeals.length ? "Deselect All" : "Select All"}
                  </Button>
                )}
              </div>
              
              {loadingDeals ? (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-gray-500">Loading deals from mailbox...</span>
                </div>
              ) : availableDeals.length > 0 ? (
                <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                  {availableDeals.map((deal) => (
                    <label
                      key={deal.code}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-50 ${
                        selectedDeals.includes(deal.code) ? 'bg-etihad-gold-50 border border-etihad-gold-200' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedDeals.includes(deal.code)}
                          onChange={() => toggleDealSelection(deal.code)}
                          className="rounded border-gray-300 text-etihad-gold-600 focus:ring-etihad-gold-500"
                        />
                        <span className="text-sm font-medium">{deal.code}</span>
                        {deal.company_name && deal.company_name !== deal.code && (
                          <span className="text-xs text-gray-500 truncate max-w-[150px]">
                            ({deal.company_name})
                          </span>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {deal.count} emails
                      </Badge>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 text-center py-4 border rounded-md">
                  No emails found in selected period. Try selecting a longer time period.
                </div>
              )}
              
              {selectedDeals.length > 0 && (
                <p className="text-xs text-etihad-gold-700">
                  {selectedDeals.length} deal(s) selected - only these will be processed
                </p>
              )}
              {selectedDeals.length === 0 && availableDeals.length > 0 && (
                <p className="text-xs text-gray-500">
                  No deals selected - all {availableDeals.length} deals will be processed
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowProcessModal(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleProcessEmails}
              disabled={processing || loadingDeals}
              className="bg-etihad-gold-600 hover:bg-etihad-gold-700"
              data-testid="confirm-process-btn"
            >
              {processing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-1" />
                  Process {selectedDeals.length > 0 ? `${selectedDeals.length} Deal(s)` : 'All Emails'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Summary Cards - Compact Layout */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {/* Emails Card */}
          <div className="bg-blue-50 rounded-lg border border-blue-200 px-3 py-2" data-testid="summary-card-emails">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-blue-800 text-sm">Emails</span>
              </div>
              <span className="text-xl font-bold text-blue-700">{summary?.total_emails_read || 0}</span>
            </div>
            <div className="flex gap-3 text-xs mt-1">
              <span className="text-gray-600">Tagged: <strong className="text-emerald-700">{summary?.holdings_updated || 0}</strong></span>
              <span className="text-gray-600">Pending: <strong className="text-amber-700">{summary?.holdings_pending || 0}</strong></span>
              {summary?.duplicates_count > 0 && (
                <span className="text-gray-600">Duplicates: <strong className="text-orange-700">{summary.duplicates_count}</strong></span>
              )}
              {summary?.existing_repayments_count > 0 && (
                <span className="text-gray-600">Existing: <strong className="text-purple-700">{summary.existing_repayments_count}</strong></span>
              )}
            </div>
          </div>
          
          {/* Clients Card */}
          <div className="bg-etihad-gold-50 rounded-lg border border-etihad-gold-200 px-3 py-2" data-testid="summary-card-clients">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-etihad-gold-600" />
                <span className="font-semibold text-etihad-gold-800 text-sm">Investors</span>
              </div>
              <span className="text-xl font-bold text-etihad-gold-700">{(summary?.clients_identified || 0) + (summary?.clients_not_identified || 0)}</span>
            </div>
            <div className="flex gap-3 text-xs mt-1">
              <span className="text-gray-600">Identified: <strong className="text-emerald-700">{summary?.clients_identified || 0}</strong></span>
              <span className="text-gray-600">Not Identified: <strong className="text-red-700">{summary?.clients_not_identified || 0}</strong></span>
            </div>
          </div>
          
          {/* Holdings Card */}
          <div className="bg-emerald-50 rounded-lg border border-emerald-200 px-3 py-2" data-testid="summary-card-holdings">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-emerald-800 text-sm">Holdings</span>
              </div>
              <span className="text-xl font-bold text-emerald-700">{(summary?.holdings_updated || 0) + (summary?.holdings_pending || 0)}</span>
            </div>
            <div className="flex gap-3 text-xs mt-1">
              <span className="text-gray-600">Updated: <strong className="text-emerald-700">{summary?.holdings_updated || 0}</strong></span>
              <span className="text-gray-600">Pending: <strong className="text-amber-700">{summary?.holdings_pending || 0}</strong></span>
            </div>
          </div>
          
          {/* Unlisted NCDs Card */}
          <div 
            className={`bg-red-50 rounded-lg border px-3 py-2 cursor-pointer hover:bg-red-100 transition-colors ${summary?.unlisted_ncds_count > 0 ? 'border-red-300' : 'border-red-200'}`}
            data-testid="summary-card-unlisted"
            onClick={() => {
              if (summary?.unlisted_ncds_count > 0) {
                setHoldingStatus('unlisted');
              }
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="font-semibold text-red-800 text-sm">Unlisted NCDs</span>
              </div>
              <span className="text-xl font-bold text-red-700">{summary?.unlisted_ncds_count || 0}</span>
            </div>
            {summary?.unlisted_ncds_count > 0 && (
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-red-600">NCDs not in system</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); navigate('/broker/bulk-upload?tab=bonds'); }}
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Create NCD →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filters and Amount Summary Combined */}
        <div className="bg-white rounded-lg border p-3 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="font-medium text-gray-700 text-sm">Filters</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-gray-500">Gross: <strong className="text-emerald-700">{formatINR(summary?.total_gross_amount)}</strong></span>
              <span className="text-gray-500">Net: <strong className="text-blue-700">{formatINR(summary?.total_net_amount)}</strong></span>
              <span className="text-gray-500">TDS: <strong className="text-amber-700">{formatINR(summary?.total_tds)}</strong></span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Client</label>
              <Select value={selectedClient || "all"} onValueChange={(val) => setSelectedClient(val === "all" ? "" : val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Investors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Investors</SelectItem>
                  {clients.filter(client => client.id).map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name} ({client.email_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Bond/Deal</label>
              <Select value={selectedBond || "all"} onValueChange={(val) => setSelectedBond(val === "all" ? "" : val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Bonds" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bonds</SelectItem>
                  {uniqueBonds.map(bond => (
                    <SelectItem key={bond.code} value={bond.code}>
                      {bond.name || bond.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Status</label>
              <Select value={holdingStatus || "all"} onValueChange={(val) => setHoldingStatus(val === "all" ? "" : val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="updated">Auto Tagged</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="unlisted">Unlisted NCDs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Button variant="outline" onClick={clearFilters} className="w-full h-8 text-xs">
                Clear
              </Button>
            </div>
          </div>
        </div>

        {/* Unlisted NCDs Alert - Show when filtering by unlisted */}
        {holdingStatus === 'unlisted' && summary?.unlisted_ncd_codes?.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="font-medium text-red-800 text-sm">Unlisted NCDs Found in Emails</span>
              </div>
              <Button 
                size="sm" 
                onClick={() => navigate('/broker/bulk-upload?tab=bonds')}
                className="h-7 px-3 text-xs bg-red-600 hover:bg-red-700 text-white"
              >
                Create NCDs
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {summary.unlisted_ncd_codes.map((ncd, idx) => (
                <div key={idx} className="bg-white border border-red-200 rounded px-2 py-1 text-xs">
                  <span className="font-mono font-medium text-red-700">{ncd.code}</span>
                  <span className="text-gray-500 ml-1">({ncd.count} emails, {formatINR(ncd.total_amount)})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search and Table */}
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="px-3 py-2 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-800 text-sm">Emails</h3>
              <Badge variant="secondary" className="text-xs">{filteredLogs.length}</Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-7 w-48 text-xs"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-center px-2 py-2 font-medium text-gray-600 whitespace-nowrap w-10">S.No</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Email Received</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Client</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Matched Client</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Bond / Deal</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Txn Date / Units</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Amount</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center">
                      <Mail className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">No email logs found</p>
                      <p className="text-gray-400 text-xs mt-1">Try adjusting your filters or process new emails</p>
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log, idx) => (
                    <tr key={log.id || idx} className="border-b hover:bg-gray-50">
                      {/* Serial Number */}
                      <td className="px-2 py-2 text-center text-gray-500 font-medium">
                        {idx + 1}
                      </td>
                      {/* Email Received Date - Single line with read date on hover */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="group relative cursor-default">
                          <span className="text-gray-800">
                            {formatIST(log.email_date || log.email_received_at || log.email_read_at)}
                          </span>
                          <div className="absolute left-0 -top-8 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10 shadow-lg">
                            Read: {formatIST(log.email_read_at)}
                          </div>
                        </div>
                      </td>
                      {/* Client Name - Single line */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="text-gray-800 truncate block max-w-[120px]" title={log.client_name || 'Unknown'}>
                          {log.client_name || <span className="text-amber-600 italic">Unknown</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative">
                          {/* Show matched client name */}
                          {log.matched_client_name && (
                            <span className="font-medium text-emerald-700 truncate block max-w-[120px]" title={`${log.matched_client_name}${log.match_similarity ? ` (${Math.round(log.match_similarity * 100)}% match)` : ''}`}>
                              {log.matched_client_name}
                            </span>
                          )}
                          {/* Search input - only show if no match OR match is less than 95% */}
                          {(!log.matched_client_name || (log.match_similarity && log.match_similarity < 0.95)) && (
                            <div className="relative inline-block mt-1">
                              <Input
                                type="text"
                                placeholder={log.matched_client_name ? "Change..." : "Search..."}
                                value={showClientSelect === log.id ? clientSearchQuery : ''}
                                onChange={(e) => setClientSearchQuery(e.target.value)}
                                onFocus={() => openClientSelect(log)}
                                className="h-5 text-xs w-24 px-1.5"
                                data-testid={`client-search-${log.id}`}
                              />
                              {showClientSelect === log.id && (
                                <div className="absolute z-50 bg-white border rounded-lg shadow-lg p-2 w-56 mt-1 left-0">
                                  <div className="max-h-40 overflow-y-auto">
                                    {loadingBondClients ? (
                                      <p className="text-xs text-gray-500 p-2">Loading...</p>
                                    ) : bondClients.length === 0 ? (
                                      <p className="text-xs text-gray-500 p-2">No investors found</p>
                                    ) : (
                                      bondClients
                                        .filter(c => 
                                          !clientSearchQuery || 
                                          c.name.toLowerCase().includes(clientSearchQuery.toLowerCase())
                                        )
                                        .map((client, idx) => (
                                          <button
                                            key={client.id}
                                            onClick={() => handleAssignClient(log.id, client.id, client.name)}
                                            className={`w-full text-left px-2 py-1 text-xs hover:bg-gray-100 rounded flex justify-between items-center ${idx === 0 && client.similarity > 0 ? 'bg-emerald-50' : ''}`}
                                          >
                                            <span className="truncate">{client.name}</span>
                                            {client.similarity > 0 && (
                                              <span className="text-emerald-600 ml-1">{Math.round(client.similarity * 100)}%</span>
                                            )}
                                          </button>
                                        ))
                                    )}
                                  </div>
                                  <button
                                    onClick={() => setShowClientSelect(null)}
                                    className="w-full mt-1 text-xs text-gray-400 hover:text-gray-600"
                                  >
                                    Close
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      {/* Bond / Deal - Show deal ID in cell, bond name + deal ID on hover */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="group relative cursor-default">
                          <span className="text-gray-800 truncate block max-w-[150px]" title={log.bond_code || log.bond_name || '-'}>
                            {log.bond_code || log.bond_name || <span className="text-gray-400">-</span>}
                          </span>
                          {(log.bond_name || log.bond_code) && (
                            <div className="absolute left-0 -top-12 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10 shadow-lg">
                              <div className="font-medium">{log.bond_name || 'Unknown Bond'}</div>
                              {log.bond_code && <div className="text-gray-300">Deal ID: {log.bond_code}</div>}
                            </div>
                          )}
                        </div>
                      </td>
                      {/* Txn Date / Units - Single line */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        {log.matched_trade_date ? (
                          <div>
                            <span className="text-gray-800">{format(new Date(log.matched_trade_date), "dd MMM yyyy")}</span>
                            {log.matched_trade_units && (
                              <span className="text-gray-500 ml-1 text-xs">({log.matched_trade_units}u)</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      {/* Amount - Single line with hover for details */}
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="group relative inline-block cursor-help">
                          <span className="font-mono font-semibold text-emerald-700">
                            {formatINR(log.gross_amount)}
                          </span>
                          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block z-50">
                            <div className="bg-gray-900 text-white text-xs rounded px-2 py-1.5 shadow-lg whitespace-nowrap">
                              <div className="flex justify-between gap-3">
                                <span className="text-gray-400">Net:</span>
                                <span className="font-mono">{formatINR(log.net_amount)}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-gray-400">TDS:</span>
                                <span className="font-mono text-red-300">{formatINR(log.tds_amount || (log.gross_amount - log.net_amount))}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* Actions - Compact */}
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        {log.is_duplicate ? (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs py-0.5 px-1.5" title={`Duplicate of historical entry: ${log.duplicate_reason || 'Matches existing repayment'}`}>
                            <Copy className="h-3 w-3 mr-0.5" />
                            Duplicate
                          </Badge>
                        ) : log.duplicate_skipped ? (
                          <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs py-0.5 px-1.5" title="This email matched an existing repayment record - no new entry created">
                            <CheckCircle className="h-3 w-3 mr-0.5" />
                            Existing Repayment
                          </Badge>
                        ) : log.is_auto_tagged ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs py-0.5 px-1.5">
                            <CheckCircle className="h-3 w-3 mr-0.5" />
                            Tagged
                          </Badge>
                        ) : log.approved ? (
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs py-0.5 px-1.5">
                            <CheckCircle className="h-3 w-3 mr-0.5" />
                            Approved
                          </Badge>
                        ) : log.matched_client_id ? (
                          <Button
                            size="sm"
                            onClick={() => handleAutoTagSingle(log)}
                            className="h-6 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            data-testid={`tag-btn-${log.id}`}
                          >
                            <Tag className="h-3 w-3 mr-0.5" />
                            Tag
                          </Button>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Select Client</span>
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
              Process Repayment
            </DialogTitle>
          </DialogHeader>
          
          {selectedEmailLog && (
            <div className="space-y-4">
              {/* Email Info Card */}
              <div className="bg-gray-50 rounded-lg p-3 border">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-gray-800 text-sm">{selectedEmailLog.client_name || 'Unknown Client'}</p>
                  <Badge variant="outline" className="text-xs">{selectedEmailLog.bond_name || 'N/A'}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-gray-500">Repayment Date</p>
                    <p className="font-semibold">{selectedEmailLog.repayment_date ? format(new Date(selectedEmailLog.repayment_date), "dd MMM yyyy") : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Gross Amount</p>
                    <p className="font-semibold text-emerald-700">{formatINR(selectedEmailLog.gross_amount)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Net Amount</p>
                    <p className="font-semibold text-blue-700">{formatINR(selectedEmailLog.net_amount)}</p>
                  </div>
                </div>
              </div>
              
              {/* Transaction Date - Dropdown with Investment Dates */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Transaction Date <span className="text-red-500">*</span>
                </label>
                {availableCashflows.length > 0 ? (
                  <Select 
                    value={tagForm.transaction_date} 
                    onValueChange={(val) => setTagForm(prev => ({ ...prev, transaction_date: val }))}
                  >
                    <SelectTrigger data-testid="tag-date-select">
                      <SelectValue placeholder="Select investment date" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCashflows.filter(inv => inv.date).map((inv, idx) => (
                        <SelectItem key={idx} value={inv.date || `date-${idx}`}>
                          {inv.date ? format(new Date(inv.date), "dd MMM yyyy") : 'Unknown'} - {formatINR(inv.amount)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type="date"
                    value={tagForm.transaction_date}
                    onChange={(e) => setTagForm(prev => ({ ...prev, transaction_date: e.target.value }))}
                    data-testid="tag-date-input"
                  />
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {availableCashflows.length > 0 
                    ? `${availableCashflows.length} investment date(s) found for this client` 
                    : 'No matching investment records - enter date manually'}
                </p>
              </div>
              
              {/* Payment Type */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Payment Type <span className="text-red-500">*</span>
                </label>
                <Select 
                  value={tagForm.payment_type} 
                  onValueChange={(val) => setTagForm(prev => ({ ...prev, payment_type: val }))}
                >
                  <SelectTrigger data-testid="tag-payment-type-select">
                    <SelectValue placeholder="Select payment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal Repayment</SelectItem>
                    <SelectItem value="prepayment">Prepayment</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  {tagForm.payment_type === 'prepayment' 
                    ? 'Prepayment will adjust XIRR and reduce final maturity payout' 
                    : 'Normal scheduled repayment'}
                </p>
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
              disabled={tagging || !tagForm.transaction_date || !tagForm.payment_type}
              className="bg-etihad-gold-600 hover:bg-etihad-gold-700"
              data-testid="submit-tag-btn"
            >
              {tagging ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Process Repayment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
