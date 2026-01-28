import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Search, Download, Mail, Check, X, FileText, Users, TrendingUp, DollarSign, MoreVertical, Eye, Calendar, User, MapPin, Building2, CreditCard, UserCheck, ClipboardList, FileImage, Upload, AlertCircle, CheckCircle, Clock, XCircle, Send, ArrowRight, IndianRupee, RefreshCw, Calculator, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import ClientSidebar from "@/components/ClientSidebar";
import { format } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Holdings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDetails, setClientDetails] = useState(null); // Full client KYC details
  const [clientHoldings, setClientHoldings] = useState(null);
  const [clientTrades, setClientTrades] = useState([]); // Trades for the selected client
  const [clientRealEstate, setClientRealEstate] = useState([]); // Real estate investments for the selected client
  const [loading, setLoading] = useState(true);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openMenu, setOpenMenu] = useState(null);
  const [openTradeMenu, setOpenTradeMenu] = useState(null); // For trades tab three-dot menu
  const [tradeDetailsModal, setTradeDetailsModal] = useState(null); // For trade details modal
  const [modalData, setModalData] = useState(null);
  const [activeTab, setActiveTab] = useState("summary"); // "summary" or trade index
  const [mainTab, setMainTab] = useState("holdings"); // "holdings", "trades", or "profile"
  const menuRef = useRef(null);
  const tradeMenuRef = useRef(null);
  
  // Prepayment modal state
  const [showPrepaymentModal, setShowPrepaymentModal] = useState(false);
  const [prepaymentTradeId, setPrepaymentTradeId] = useState(null);
  const [prepaymentTrade, setPrepaymentTrade] = useState(null);
  const [prepaymentDate, setPrepaymentDate] = useState("");
  const [prepaymentAmount, setPrepaymentAmount] = useState("");
  const [prepaymentNotes, setPrepaymentNotes] = useState("");
  const [recordingPrepayment, setRecordingPrepayment] = useState(false);

  // Set page title
  useEffect(() => {
    document.title = "Kinntegraa | Holdings";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    setUser(JSON.parse(userData));
    fetchClients();
  }, [navigate]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenu(null);
      }
      if (tradeMenuRef.current && !tradeMenuRef.current.contains(event.target)) {
        setOpenTradeMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/holdings/clients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClients(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Failed to load clients");
      setLoading(false);
    }
  };

  const fetchClientHoldings = async (clientId) => {
    setLoadingHoldings(true);
    try {
      const token = localStorage.getItem("token");
      const [holdingsRes, clientRes, tradesRes, realEstateRes, reinvLogsRes] = await Promise.all([
        axios.get(`${API}/holdings/client/${clientId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/clients/${clientId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/trades?client_id=${clientId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/real-estate-opportunities/client/${clientId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: [] })), // Handle if endpoint doesn't exist yet
        axios.get(`${API}/reinvestment-logs?client_id=${clientId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: [] })) // Fetch reinvestment logs for trades tab
      ]);
      setClientHoldings(holdingsRes.data);
      setClientDetails(clientRes.data);
      
      // Combine trades and reinvestment logs for the Trades tab
      const trades = tradesRes.data || [];
      const reinvLogs = reinvLogsRes.data || [];
      
      // Transform reinvestment logs to trade-like format
      const reinvAsTrades = reinvLogs.map(log => ({
        id: log.id,
        client_id: log.client_id,
        client_name: log.client_name,
        client_pan: log.client_pan,
        bond_id: log.bond_id,
        bond_name: log.bond_name,
        bond_code: log.target_ucc || log.bond_code,
        units: log.units || 0,
        total_amount: log.net_amount || log.total_amount || 0,
        calculated_price: log.net_amount ? Math.round(log.net_amount / (log.units || 1)) : 0,
        investment_date: log.expected_date || log.created_at,
        created_at: log.created_at,
        status: log.approval_status || 'approved',
        reinvestment_tag: log.reinvestment_tag,
        is_historical: log.is_past_date || true,
        portfolio: log.portfolio_category || 'Wealth',
        created_by_name: log.tagged_by_name,
        payment_reference: log.payment_reference,
        broker_notes: log.notes,
        is_reinvestment_log: true
      }));
      
      // Combine and deduplicate by id
      const allTrades = [...trades, ...reinvAsTrades];
      const uniqueTrades = allTrades.filter((trade, index, self) => 
        index === self.findIndex(t => t.id === trade.id)
      );
      
      // Sort by date (most recent first)
      const sortedTrades = uniqueTrades.sort((a, b) => 
        new Date(b.investment_date || b.created_at) - new Date(a.investment_date || a.created_at)
      );
      setClientTrades(sortedTrades);
      setClientRealEstate(realEstateRes.data || []);
    } catch (error) {
      console.error("Error fetching holdings:", error);
      toast.error("Failed to load holdings");
    } finally {
      setLoadingHoldings(false);
    }
  };

  const handleClientSelect = (client) => {
    setSelectedClient(client);
    setMainTab("holdings"); // Reset to holdings tab when selecting new client
    fetchClientHoldings(client.id);
  };

  const handleMarkRepaid = async (cashflowId, isRepaid) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.put(`${API}/holdings/cashflow/${cashflowId}/mark-repaid`, 
        { is_repaid: isRepaid },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      // Check if interest was amended due to principal prepayment
      if (response.data.interest_amended > 0) {
        toast.success(`Marked as repaid. ${response.data.interest_amended} future interest payment(s) amended due to principal prepayment.`);
      } else {
        toast.success(isRepaid ? "Marked as repaid" : "Marked as pending");
      }
      
      if (selectedClient) {
        fetchClientHoldings(selectedClient.id);
      }
    } catch (error) {
      console.error("Error updating cashflow:", error);
      toast.error("Failed to update repayment status");
    }
  };

  const handleRevertAmendment = async (cashflowId) => {
    if (!window.confirm('Revert this interest amount to the original value?')) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/holdings/cashflow/${cashflowId}/revert-amendment`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Amendment reverted to original amount");
      if (selectedClient) {
        fetchClientHoldings(selectedClient.id);
      }
    } catch (error) {
      console.error("Error reverting amendment:", error);
      toast.error(error.response?.data?.detail || "Failed to revert amendment");
    }
  };

  const openPrepaymentModal = (trade) => {
    setPrepaymentTradeId(trade.trade_id);
    setPrepaymentTrade(trade);
    setPrepaymentDate("");
    setPrepaymentAmount("");
    setPrepaymentNotes("");
    setShowPrepaymentModal(true);
  };

  const handleRecordPrepayment = async () => {
    if (!prepaymentDate || !prepaymentAmount) {
      toast.error("Please enter prepayment date and amount");
      return;
    }
    
    const amount = parseFloat(prepaymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid prepayment amount");
      return;
    }
    
    setRecordingPrepayment(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/holdings/trade/${prepaymentTradeId}/record-prepayment`,
        {
          prepayment_date: prepaymentDate,
          prepaid_amount: amount,
          notes: prepaymentNotes || null
        },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      const result = response.data;
      
      // Show detailed success message with percentage
      let message = `₹${amount.toLocaleString('en-IN')} (${result.prepayment_percentage?.toFixed(2) || 0}%) principal prepaid.`;
      if (result.remaining_principal > 0) {
        message += ` Remaining: ₹${result.remaining_principal?.toLocaleString('en-IN')} (${result.remaining_percentage?.toFixed(2)}%)`;
      }
      if (result.cashflows_amended > 0) {
        message += ` • ${result.cashflows_amended} payment(s) recalculated`;
      }
      if (result.email_sent) {
        message += ` • Client notified via email`;
      }
      
      toast.success(message, { duration: 6000 });
      setShowPrepaymentModal(false);
      
      // Show additional info for reinvestment updates
      if (result.reinvestment_tags_updated > 0) {
        toast.info(`${result.reinvestment_tags_updated} reinvestment tag(s) marked for review`, { duration: 4000 });
      }
      
      if (selectedClient) {
        fetchClientHoldings(selectedClient.id);
      }
    } catch (error) {
      console.error("Error recording prepayment:", error);
      toast.error(error.response?.data?.detail || "Failed to record prepayment");
    } finally {
      setRecordingPrepayment(false);
    }
  };

  // Cashflow management handlers removed - logic simplified

  const handleDownloadExcel = async () => {
    if (!selectedClient) return;
    
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/holdings/client/${selectedClient.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `holdings_${selectedClient.pan_number}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success("Holdings report downloaded");
    } catch (error) {
      console.error("Error downloading:", error);
      toast.error("Failed to download report");
    }
  };

  const handleDownloadRepaymentTemplate = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/holdings/repayment-template`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `repayment_update_template.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success("Repayment template downloaded");
    } catch (error) {
      console.error("Error downloading template:", error);
      toast.error("Failed to download template");
    }
  };

  const handleExportCashflows = async () => {
    if (!selectedClient) return;
    
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/holdings/export-cashflows/${selectedClient.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cashflows_${selectedClient.pan_number}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success("Cashflows exported");
    } catch (error) {
      console.error("Error exporting cashflows:", error);
      toast.error("Failed to export cashflows");
    }
  };

  const handleBulkRepaymentUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/holdings/bulk-repayment-upload`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      const result = response.data;
      
      if (result.success_count > 0) {
        toast.success(`Updated ${result.success_count} repayments (${result.prepaid_count} prepaid)`);
        if (selectedClient) {
          fetchClientHoldings(selectedClient.id);
        }
      }
      
      if (result.failed_count > 0) {
        toast.error(`${result.failed_count} entries failed. Check console for details.`);
        console.error("Bulk upload errors:", result.errors);
      }
      
      // Clear the file input
      e.target.value = '';
      
    } catch (error) {
      console.error("Error uploading repayments:", error);
      toast.error(error.response?.data?.detail || "Failed to upload repayments");
      e.target.value = '';
    }
  };

  // Send Holdings Report Email to Client (with sub-broker CC)
  const [sendingEmail, setSendingEmail] = useState(false);
  const handleSendReportEmail = async () => {
    if (!selectedClient) return;
    
    setSendingEmail(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/holdings/client/${selectedClient.id}/send-report-email`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(response.data.message || "Holdings report sent to client");
    } catch (error) {
      console.error("Error sending report email:", error);
      toast.error(error.response?.data?.detail || "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  // Sync Repayments from Email (reads from updates@kinntegraa.club)
  const [syncingEmails, setSyncingEmails] = useState(false);
  const handleSyncEmailRepayments = async () => {
    setSyncingEmails(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/email-reader/process?days_back=30`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const result = response.data;
      if (result.processed > 0 || result.matched > 0) {
        toast.success(`Synced ${result.matched} repayments from ${result.total_emails} emails`);
        // Refresh holdings if a client is selected
        if (selectedClient) {
          fetchClientHoldings(selectedClient.id);
        }
      } else if (result.total_emails === 0) {
        toast.info("No new repayment emails found");
      } else {
        toast.warning(`Found ${result.total_emails} emails but no matches`);
      }
      
      if (result.errors?.length > 0) {
        console.warn("Email sync errors:", result.errors);
      }
    } catch (error) {
      console.error("Error syncing email repayments:", error);
      toast.error(error.response?.data?.detail || "Failed to sync repayments from emails");
    } finally {
      setSyncingEmails(false);
    }
  };

  // Historical transactions upload with supersede option
  const [historicalUploading, setHistoricalUploading] = useState(false);
  const handleHistoricalUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setHistoricalUploading(true);
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/bulk/historical-trades`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      const result = response.data;
      
      if (result.investments_created > 0 || result.repayments_recorded > 0) {
        toast.success(`Created ${result.investments_created} investments, recorded ${result.repayments_recorded} repayments`);
        if (selectedClient) {
          fetchClientHoldings(selectedClient.id);
        }
      }
      
      if (result.errors?.length > 0) {
        toast.warning(`${result.errors.length} entries had issues. Check console.`);
        console.warn("Historical upload errors:", result.errors);
      }
      
      e.target.value = '';
    } catch (error) {
      console.error("Error uploading historical data:", error);
      toast.error(error.response?.data?.detail || "Failed to upload historical data");
      e.target.value = '';
    } finally {
      setHistoricalUploading(false);
    }
  };

  const openCashflowModal = (holding) => {
    setModalData(holding);
    setActiveTab("summary");
    setOpenMenu(null);
  };

  const closeModal = () => {
    setModalData(null);
    setActiveTab("summary");
  };

  // Get consolidated EXPECTED cashflows by date (from bond definition)
  const getExpectedCashflowsByDate = (trades) => {
    if (!trades) return [];
    
    const byDate = {};
    
    trades.forEach(trade => {
      // Use expected_cashflows (from bond definition) instead of cashflows
      const expectedCfs = trade.expected_cashflows || [];
      expectedCfs.forEach(cf => {
        // Handle investment entries (outflows) separately
        const isInvestment = cf.type === 'investment';
        
        if (!byDate[cf.date]) {
          byDate[cf.date] = {
            date: cf.date,
            type: isInvestment ? 'investment' : 'inflow',
            principal_component: 0,
            interest_component: 0,
            gross_amount: 0,
            tds_amount: 0,
            net_amount: 0,
            investment_amount: 0,  // Track investment separately
            transactions: []
          };
        }
        
        if (isInvestment) {
          // Investment entry - track as negative (outflow)
          byDate[cf.date].type = 'investment';
          byDate[cf.date].investment_amount += Math.abs(cf.amount || cf.gross_amount || 0);
          byDate[cf.date].gross_amount += cf.gross_amount || cf.amount || 0;
          byDate[cf.date].net_amount += cf.net_amount || cf.amount || 0;
        } else {
          // Inflow entry - normal cashflow
          byDate[cf.date].principal_component += cf.principal_component || 0;
          byDate[cf.date].interest_component += cf.interest_component || 0;
          byDate[cf.date].gross_amount += cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0));
          byDate[cf.date].tds_amount += cf.tds_amount || 0;
          byDate[cf.date].net_amount += cf.net_amount || 0;
        }
        
        byDate[cf.date].transactions.push({
          trade_id: trade.trade_id,
          units: trade.units,
          investment_date: trade.investment_date,
          type: isInvestment ? 'investment' : 'inflow'
        });
      });
    });
    
    return Object.values(byDate).sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  // Get consolidated ACTUAL cashflows by date (repaid cashflows + investment + pending maturity)
  const getActualCashflowsByDate = (trades) => {
    if (!trades) return [];
    
    const byDate = {};
    
    trades.forEach(trade => {
      // Use actual_cashflows which now includes investment, repayments, and maturity
      const actualCfs = trade.actual_cashflows || [];
      actualCfs.forEach(cf => {
        const cfDate = cf.date;
        const isInvestment = cf.type === 'investment';
        
        if (!byDate[cfDate]) {
          byDate[cfDate] = {
            date: cfDate,
            type: isInvestment ? 'investment' : (cf.type || 'repayment'),
            principal_component: 0,
            interest_component: 0,
            gross_amount: 0,
            tds_amount: 0,
            net_amount: 0,
            investment_amount: 0,
            transactions: [],
            is_prepaid: false,
            is_repaid: cf.is_repaid
          };
        }
        
        if (isInvestment) {
          byDate[cfDate].type = 'investment';
          byDate[cfDate].investment_amount += Math.abs(cf.amount || cf.gross_amount || 0);
          byDate[cfDate].gross_amount += cf.gross_amount || cf.amount || 0;
          byDate[cfDate].net_amount += cf.net_amount || cf.amount || 0;
        } else {
          byDate[cfDate].principal_component += cf.principal_component || 0;
          byDate[cfDate].interest_component += cf.interest_component || 0;
          byDate[cfDate].gross_amount += cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0));
          byDate[cfDate].tds_amount += cf.tds_amount || 0;
          byDate[cfDate].net_amount += cf.net_amount || 0;
          if (cf.is_prepaid) byDate[cfDate].is_prepaid = true;
          if (cf.type === 'maturity') byDate[cfDate].type = 'maturity';
        }
        
        byDate[cfDate].transactions.push({
          trade_id: trade.trade_id,
          units: trade.units,
          investment_date: trade.investment_date,
          is_prepaid: cf.is_prepaid,
          type: cf.type
        });
      });
    });
    
    return Object.values(byDate).sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  // Get consolidated cashflows by date (legacy - for current state)
  const getConsolidatedCashflowsByDate = (trades) => {
    if (!trades) return [];
    
    const byDate = {};
    
    trades.forEach(trade => {
      trade.cashflows.forEach(cf => {
        if (!byDate[cf.date]) {
          byDate[cf.date] = {
            date: cf.date,
            principal_component: 0,
            interest_component: 0,
            tds_amount: 0,
            net_amount: 0,
            transactions: [],
            all_repaid: true,
            cashflow_ids: []
          };
        }
        
        byDate[cf.date].principal_component += cf.principal_component;
        byDate[cf.date].interest_component += cf.interest_component;
        byDate[cf.date].tds_amount += cf.tds_amount;
        byDate[cf.date].net_amount += cf.net_amount;
        byDate[cf.date].transactions.push({
          trade_id: trade.trade_id,
          units: trade.units,
          investment_date: trade.investment_date,
          cf_id: cf.id,
          is_repaid: cf.is_repaid,
          is_prepaid: cf.is_prepaid
        });
        byDate[cf.date].cashflow_ids.push(cf.id);
        if (!cf.is_repaid) {
          byDate[cf.date].all_repaid = false;
        }
      });
    });
    
    return Object.values(byDate).sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  // Consolidate holdings by bond_id for SUMMARY VIEW
  // Shows one row per bond with total units/amounts
  // Individual trades (with different investment dates) are stored in trades[] array for detail view
  const getConsolidatedHoldings = () => {
    if (!clientHoldings?.holdings) return [];
    
    const consolidated = {};
    
    clientHoldings.holdings.forEach(holding => {
      const bondId = holding.bond_id;
      
      if (!consolidated[bondId]) {
        consolidated[bondId] = {
          bond_id: bondId,
          bond_name: holding.bond_name,
          total_units: 0,
          invested_amount: 0,
          total_principal: 0,
          total_interest_gross: 0,
          total_tds: 0,
          repaid_principal: 0,
          repaid_interest: 0,
          repaid_tds: 0,
          net_repaid: 0,
          upcoming_expected: 0,
          prepaid_count: 0,
          prepaid_amount: 0,
          xirr: null,
          actual_xirr: null,
          trades: []  // Will contain separate entries for each investment date
        };
      }
      
      // Accumulate totals for summary view
      consolidated[bondId].total_units += holding.units || 0;
      consolidated[bondId].invested_amount += holding.invested_amount;
      consolidated[bondId].total_principal += holding.total_principal;
      consolidated[bondId].total_interest_gross += holding.total_interest_gross;
      consolidated[bondId].total_tds += holding.total_tds;
      consolidated[bondId].repaid_principal += holding.repaid_principal;
      consolidated[bondId].repaid_interest += holding.repaid_interest;
      consolidated[bondId].repaid_tds += holding.repaid_tds;
      consolidated[bondId].net_repaid += holding.net_repaid;
      consolidated[bondId].upcoming_expected += holding.upcoming_expected;
      consolidated[bondId].prepaid_count += holding.prepaid_count || 0;
      consolidated[bondId].prepaid_amount += holding.prepaid_amount || 0;
      
      // For XIRR in summary, use weighted average or the bond's expected rate
      // Since different tranches may have different actual XIRRs, we'll show the bond's expected XIRR
      if (holding.xirr !== null && holding.xirr !== undefined) {
        if (consolidated[bondId].xirr === null) {
          consolidated[bondId].xirr = holding.xirr;
        }
      }
      
      // For actual XIRR in summary, we need to recalculate based on combined cashflows
      // For now, show the first available actual XIRR (detail view will show per-tranche XIRRs)
      if (holding.actual_xirr !== null && holding.actual_xirr !== undefined) {
        if (consolidated[bondId].actual_xirr === null) {
          consolidated[bondId].actual_xirr = holding.actual_xirr;
        }
      }
      
      // Add this holding as a separate trade entry for the detail view
      // Each holding from backend now represents a unique bond+date combination
      consolidated[bondId].trades.push({
        trade_id: holding.trade_id,
        units: holding.units,
        investment_date: holding.investment_date,
        invested_amount: holding.invested_amount,
        prepaid_count: holding.prepaid_count || 0,
        prepaid_amount: holding.prepaid_amount || 0,
        xirr: holding.xirr,
        actual_xirr: holding.actual_xirr,
        cashflows: (holding.cashflows || []).sort((a, b) => new Date(a.date) - new Date(b.date)),
        expected_cashflows: holding.expected_cashflows || [],
        actual_cashflows: holding.actual_cashflows || []
      });
    });
    
    Object.values(consolidated).forEach(bond => {
      bond.trades.sort((a, b) => new Date(a.investment_date) - new Date(b.investment_date));
      bond.status = bond.upcoming_expected > 0 ? 'active' : 'fully_repaid';
    });
    
    return Object.values(consolidated);
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.pan_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const consolidatedHoldings = getConsolidatedHoldings();
  const filteredHoldings = consolidatedHoldings.filter(h => 
    statusFilter === 'all' || h.status === statusFilter
  );

  const formatINR = (amount) => {
    if (!amount || amount === 0) return '₹ 0';
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    let formatted;
    if (absAmount >= 10000000) {
      formatted = `₹ ${(absAmount / 10000000).toFixed(2)} Cr`;
    } else if (absAmount >= 100000) {
      formatted = `₹ ${(absAmount / 100000).toFixed(2)} L`;
    } else if (absAmount >= 1000) {
      formatted = `₹ ${(absAmount / 1000).toFixed(2)} K`;
    } else {
      formatted = `₹ ${absAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return isNegative ? `-${formatted}` : formatted;
  };

  // Format absolute amounts in Indian numbering (e.g., ₹12,34,567.00)
  const formatAbsoluteINR = (amount) => {
    if (!amount || amount === 0) return '₹0.00';
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    const formatted = absAmount.toLocaleString('en-IN', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    return isNegative ? `-₹${formatted}` : `₹${formatted}`;
  };

  // Download Combined Cashflow PDF (Expected + Actual) - Side by Side Layout
  const downloadCombinedCashflowPDF = async (holdingData, expectedCashflows, actualCashflows) => {
    const formatAmount = (amt) => {
      if (!amt || amt === 0) return '₹0';
      return `₹${Math.abs(amt).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Calculate Expected totals
    const expInvestments = expectedCashflows.filter(cf => cf.type === 'investment');
    const expInflows = expectedCashflows.filter(cf => cf.type !== 'investment');
    const expTotalInvestment = expInvestments.reduce((sum, cf) => sum + Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0), 0);
    const expTotalGross = expInflows.reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0);
    const expProfit = expTotalGross - expTotalInvestment;

    // Calculate Actual totals
    const actInvestments = actualCashflows.filter(cf => cf.type === 'investment');
    const actInflows = actualCashflows.filter(cf => cf.type !== 'investment');
    const actTotalInvestment = actInvestments.reduce((sum, cf) => sum + Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0), 0);
    const actTotalGross = actInflows.reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0);
    const actProfit = actTotalGross - actTotalInvestment;

    toast.info("Generating PDF...");

    // Build side-by-side rows - align expected and actual cashflows by date
    const allDates = new Set([
      ...expectedCashflows.map(cf => cf.date),
      ...actualCashflows.map(cf => cf.date)
    ]);
    const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
    
    // Create lookup maps
    const expMap = {};
    expectedCashflows.forEach(cf => { expMap[cf.date] = cf; });
    const actMap = {};
    actualCashflows.forEach(cf => { actMap[cf.date] = cf; });

    // Build HTML for PDF - Side by Side with colors matching frontend
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Cashflow Report - ${holdingData.bond_name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 20px; color: #374151; background: #fff; font-size: 11px; }
          .header { margin-bottom: 15px; padding-bottom: 12px; border-bottom: 3px solid #C9A227; }
          .header h1 { font-size: 18px; font-weight: 700; color: #5B373C; margin-bottom: 5px; }
          .header p { font-size: 12px; color: #6b7280; }
          
          /* Summary Cards - Matching Frontend */
          .summary-cards { display: flex; gap: 15px; margin-bottom: 20px; }
          .summary-card { flex: 1; padding: 15px; border-radius: 8px; text-align: center; }
          .summary-card.investment { background: #fef2f2; border: 1px solid #fecaca; }
          .summary-card.investment .value { color: #dc2626; }
          .summary-card.returns { background: #f0fdf4; border: 1px solid #bbf7d0; }
          .summary-card.returns .value { color: #059669; }
          .summary-card.profit { background: #ecfdf5; border: 1px solid #6ee7b7; }
          .summary-card.profit .value { color: #047857; }
          .summary-card.xirr-exp { background: #f0fdf4; border: 1px solid #86efac; }
          .summary-card.xirr-exp .value { color: #059669; }
          .summary-card.xirr-act { background: #f5f3ff; border: 1px solid #c4b5fd; }
          .summary-card.xirr-act .value { color: #7c3aed; }
          .summary-card .label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
          .summary-card .value { font-size: 16px; font-weight: 700; }
          
          /* Two Column Layout */
          .two-col { display: flex; gap: 20px; }
          .col { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
          
          /* Section Headers */
          .section-header { padding: 12px 15px; font-weight: 600; font-size: 12px; display: flex; justify-content: space-between; align-items: center; }
          .section-header.expected { background: linear-gradient(135deg, #5B373C 0%, #7c4a50 100%); color: #fff; }
          .section-header.actual { background: linear-gradient(135deg, #C9A227 0%, #d4b33c 100%); color: #fff; }
          
          /* Tables */
          table { width: 100%; border-collapse: collapse; }
          th { background: #f9fafb; padding: 10px 12px; text-align: left; font-size: 10px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
          th:last-child { text-align: right; }
          td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
          td:last-child { text-align: right; font-family: 'SF Mono', 'Consolas', monospace; }
          
          /* Row Colors - Matching Frontend */
          tr.investment { background: #fef2f2; }
          tr.investment td { color: #dc2626; font-weight: 600; }
          tr.received { background: #f0fdf4; }
          tr.received td { color: #059669; }
          tr.pending { background: #fefce8; }
          tr.pending td { color: #ca8a04; }
          tr.maturity { background: #FBF7E9; }
          tr.maturity td { color: #5B373C; font-weight: 600; }
          
          /* Footer Stats */
          .footer-stats { display: flex; justify-content: space-between; padding: 12px 15px; background: #f9fafb; border-top: 1px solid #e5e7eb; }
          .footer-stat .label { font-size: 10px; color: #6b7280; }
          .footer-stat .value { font-size: 14px; font-weight: 700; }
          .footer-stat .value.green { color: #059669; }
          .footer-stat .value.purple { color: #7c3aed; }
          
          .page-footer { margin-top: 20px; text-align: center; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📊 Cashflow Statement</h1>
          <p><strong>${holdingData.bond_name}</strong> · ${holdingData.total_units || holdingData.units || '-'} Units · Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}</p>
        </div>
        
        <!-- Summary Cards Row -->
        <div class="summary-cards">
          <div class="summary-card investment">
            <div class="label">Total Investment</div>
            <div class="value">${formatAmount(expTotalInvestment)}</div>
          </div>
          <div class="summary-card returns">
            <div class="label">Expected Returns</div>
            <div class="value">${formatAmount(expTotalGross)}</div>
          </div>
          <div class="summary-card profit">
            <div class="label">Expected Profit</div>
            <div class="value">${formatAmount(expProfit)}</div>
          </div>
          <div class="summary-card xirr-exp">
            <div class="label">Expected XIRR</div>
            <div class="value">${holdingData.xirr?.toFixed(2) || '-'}%</div>
          </div>
          <div class="summary-card xirr-act">
            <div class="label">Actual XIRR</div>
            <div class="value">${holdingData.actual_xirr?.toFixed(2) || '-'}%</div>
          </div>
        </div>

        <!-- Two Column Cashflow Tables -->
        <div class="two-col">
          <!-- Expected Cashflow Column -->
          <div class="col">
            <div class="section-header expected">
              <span>📅 EXPECTED CASHFLOW</span>
              <span>${expectedCashflows.length} entries</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${expectedCashflows.map(cf => {
                  const isInvestment = cf.type === 'investment';
                  const isMaturity = cf.type === 'maturity';
                  const amount = isInvestment 
                    ? Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0)
                    : (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0));
                  return `
                    <tr class="${isInvestment ? 'investment' : isMaturity ? 'maturity' : 'received'}">
                      <td>${format(new Date(cf.date), 'dd MMM yyyy')}</td>
                      <td>${isInvestment ? 'Investment' : isMaturity ? 'Maturity' : 'Inflow'}</td>
                      <td>${isInvestment ? '-' : ''}${formatAmount(amount)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            <div class="footer-stats">
              <div class="footer-stat">
                <div class="label">Profit</div>
                <div class="value green">${formatAmount(expProfit)}</div>
              </div>
              <div class="footer-stat">
                <div class="label">XIRR</div>
                <div class="value green">${holdingData.xirr?.toFixed(2) || '-'}%</div>
              </div>
            </div>
          </div>
          
          <!-- Actual Cashflow Column -->
          <div class="col">
            <div class="section-header actual">
              <span>✅ ACTUAL CASHFLOW</span>
              <span>${actualCashflows.length} entries</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${actualCashflows.length > 0 ? actualCashflows.map(cf => {
                  const isInvestment = cf.type === 'investment';
                  const isMaturity = cf.type === 'maturity';
                  const isReceived = cf.is_repaid;
                  const amount = isInvestment 
                    ? Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0)
                    : (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0));
                  const rowClass = isInvestment ? 'investment' : isReceived ? 'received' : 'pending';
                  const status = isInvestment ? 'Paid' : isReceived ? 'Received' : isMaturity ? 'At Maturity' : 'Pending';
                  return `
                    <tr class="${rowClass}">
                      <td>${format(new Date(cf.date), 'dd MMM yyyy')}</td>
                      <td>${status}</td>
                      <td>${isInvestment ? '-' : ''}${formatAmount(amount)}</td>
                    </tr>
                  `;
                }).join('') : '<tr><td colspan="3" style="text-align:center;padding:20px;color:#9ca3af;">No actual cashflow yet</td></tr>'}
              </tbody>
            </table>
            <div class="footer-stats">
              <div class="footer-stat">
                <div class="label">Profit</div>
                <div class="value green">${formatAmount(actProfit)}</div>
              </div>
              <div class="footer-stat">
                <div class="label">XIRR</div>
                <div class="value purple">${holdingData.actual_xirr?.toFixed(2) || '-'}%</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="page-footer">
          Generated by Kinntegraa · ${format(new Date(), 'dd MMM yyyy HH:mm')} · This is a system generated report
        </div>
      </body>
      </html>
    `;

    try {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position: fixed; left: -9999px; top: 0; width: 1200px; height: 900px; border: none;';
      document.body.appendChild(iframe);
      
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      await new Promise(resolve => setTimeout(resolve, 500));

      const html2pdf = (await import('html2pdf.js')).default;
      
      await html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename: `Cashflow_Report_${holdingData.bond_name?.replace(/\s+/g, '_') || 'Report'}_${format(new Date(), 'yyyyMMdd')}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { 
            scale: 2, 
            useCORS: true, 
            logging: false,
            letterRendering: true,
            backgroundColor: '#ffffff',
            windowWidth: 1200
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
          pagebreak: { mode: 'avoid-all' }
        })
        .from(iframeDoc.body)
        .save();

      document.body.removeChild(iframe);
      toast.success('PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF Error:', err);
      toast.error('Failed to generate PDF: ' + err.message);
    }
  };

  // Download Combined Cashflow Excel (Side by Side with Colors) - XLSX format
  const downloadCombinedCashflowExcel = async (holdingData, expectedCashflows, actualCashflows) => {
    try {
      toast.info("Generating Excel...");
      
      // Calculate totals
      const expInvestments = expectedCashflows.filter(cf => cf.type === 'investment');
      const expInflows = expectedCashflows.filter(cf => cf.type !== 'investment');
      const expTotalInvestment = expInvestments.reduce((sum, cf) => sum + Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0), 0);
      const expTotalGross = expInflows.reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0);
      const expProfit = expTotalGross - expTotalInvestment;
      
      const actInvestments = actualCashflows.filter(cf => cf.type === 'investment');
      const actInflows = actualCashflows.filter(cf => cf.type !== 'investment');
      const actTotalInvestment = actInvestments.reduce((sum, cf) => sum + Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0), 0);
      const actTotalGross = actInflows.reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0);
      const actProfit = actTotalGross - actTotalInvestment;
      
      // Build CSV with side-by-side columns
      let csv = '';
      
      // Header
      csv += `Cashflow Report - ${holdingData.bond_name}\n`;
      csv += `Units,${holdingData.total_units || holdingData.units || ''},,,,,,,,,\n`;
      csv += `Generated,${format(new Date(), 'dd-MMM-yy')},,,,,,,,,\n`;
      csv += '\n';
      
      // Column Headers - Side by Side
      csv += 'EXPECTED CASHFLOWS,,,,,,,ACTUAL CASHFLOWS,,,\n';
      csv += 'Date,Type,Principal,Interest,Gross Amount,TDS,Net Amount,,,Date,Type,Principal,Interest,Gross Amount,TDS,Net Amount,Status\n';
      
      // Determine max rows
      const maxRows = Math.max(expectedCashflows.length, actualCashflows.length);
      
      for (let i = 0; i < maxRows; i++) {
        const exp = expectedCashflows[i];
        const act = actualCashflows[i];
        
        // Expected columns
        if (exp) {
          const isInv = exp.type === 'investment';
          const gross = isInv ? -Math.abs(exp.investment_amount || exp.gross_amount || 0) : (exp.gross_amount || ((exp.principal_component || 0) + (exp.interest_component || 0)));
          csv += `${exp.date},${isInv ? 'Investment' : exp.type === 'maturity' ? 'Maturity' : 'Inflow'},${exp.principal_component || 0},${exp.interest_component || 0},${gross},${exp.tds_amount || 0},${exp.net_amount || gross}`;
        } else {
          csv += ',,,,,,,';
        }
        
        csv += ',,,'; // Separator columns
        
        // Actual columns
        if (act) {
          const isInv = act.type === 'investment';
          const gross = isInv ? -Math.abs(act.investment_amount || act.gross_amount || 0) : (act.gross_amount || ((act.principal_component || 0) + (act.interest_component || 0)));
          const status = isInv ? 'Paid' : act.is_repaid ? 'Received' : act.type === 'maturity' ? 'At Maturity' : 'Pending';
          csv += `${act.date},${isInv ? 'Investment' : act.is_prepaid ? 'Prepayment' : act.type === 'maturity' ? 'Maturity' : 'Repayment'},${act.principal_component || 0},${act.interest_component || 0},${gross},${act.tds_amount || 0},${act.net_amount || gross},${status}`;
        }
        
        csv += '\n';
      }
      
      // Summary rows
      csv += '\n';
      csv += `Expected Total Investment,${expTotalInvestment},,,,,,,,Actual Total Investment,${actTotalInvestment}\n`;
      csv += `Expected Total Returns,${expTotalGross},,,,,,,,Actual Total Returns,${actTotalGross}\n`;
      csv += `Expected Profit,${expProfit},,,,,,,,Actual Profit,${actProfit}\n`;
      csv += `Expected XIRR,${holdingData.xirr?.toFixed(2) || '-'}%,,,,,,,,Actual XIRR,${holdingData.actual_xirr?.toFixed(2) || '-'}%\n`;
      
      // Create and download the file
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cashflow_Report_${holdingData.bond_name?.replace(/\s+/g, '_') || 'Report'}_${format(new Date(), 'yyyyMMdd')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success('Excel (CSV) downloaded successfully!');
    } catch (err) {
      console.error('Excel Error:', err);
      toast.error('Failed to generate Excel: ' + err.message);
    }
  };

  const expectedCashflows = modalData ? getExpectedCashflowsByDate(modalData.trades) : [];
  const actualCashflows = modalData ? getActualCashflowsByDate(modalData.trades) : [];

  if (!user) return null;

  const SidebarComponent = user.role === 'broker' ? Sidebar : user.role === 'client' ? ClientSidebar : SubBrokerSidebar;
  const consolidatedCashflows = modalData ? getConsolidatedCashflowsByDate(modalData.trades) : [];
  const expectedCashflows = modalData ? getExpectedCashflowsByDate(modalData.trades) : [];
  const actualCashflows = modalData ? getActualCashflowsByDate(modalData.trades) : [];

  return (
    <div className="flex h-screen bg-gray-50">
      <SidebarComponent user={user} />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Client List */}
        <div className="w-60 bg-white border-r border-gray-200 flex flex-col">
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 15px 20px; color: #374151; background: #fff; font-size: 10px; }
          .header { margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #C9A227; }
          .header h1 { font-size: 14px; font-weight: 600; color: #5B373C; margin-bottom: 3px; }
          .header p { font-size: 10px; color: #6b7280; }
          .summary-box { display: flex; gap: 15px; margin-bottom: 12px; padding: 10px; background: linear-gradient(135deg, #F5F3EF 0%, #FBF7E9 100%); border-radius: 6px; border: 1px solid #E8D89F; }
          .summary-item { flex: 1; text-align: center; }
          .summary-item label { font-size: 7px; color: #5B373C; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px; }
          .summary-item span { font-size: 11px; font-weight: 600; color: #111827; }
          .summary-item.green span { color: #059669; }
          .summary-item.purple span { color: #7c3aed; }
          .two-col { display: flex; gap: 12px; }
          .col { flex: 1; min-width: 0; }
          .section-title { font-size: 10px; font-weight: 600; color: #fff; padding: 5px 8px; margin-bottom: 0; }
          .section-title.expected { background: #5B373C; }
          .section-title.actual { background: #C9A227; }
          table { width: 100%; border-collapse: collapse; font-size: 8px; margin-bottom: 6px; table-layout: fixed; }
          th { background: #F5F3EF; color: #5B373C; padding: 4px 5px; text-align: left; font-size: 7px; text-transform: uppercase; letter-spacing: 0.3px; font-weight: 600; border-bottom: 1px solid #C9A227; }
          th:last-child { text-align: right; }
          td { padding: 4px 5px; border-bottom: 1px solid #f3f4f6; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          td:last-child { text-align: right; font-family: 'SF Mono', 'Consolas', monospace; font-size: 8px; }
          tr.outflow { background: #fef2f2; }
          tr.outflow td { color: #dc2626; }
          tr.maturity { background: #FBF7E9; }
          tr.maturity td { color: #5B373C; }
          tr.totals { background: #f0fdf4; }
          tr.totals td { font-weight: 600; color: #059669; border-top: 1px solid #d1fae5; }
          .footer-stats { display: flex; justify-content: space-between; padding: 6px 8px; background: #F5F3EF; border-radius: 4px; margin-top: 4px; }
          .footer-stat { text-align: center; }
          .footer-stat label { font-size: 6px; color: #5B373C; text-transform: uppercase; display: block; }
          .footer-stat span { font-size: 9px; font-weight: 600; }
          .footer-stat span.green { color: #059669; }
          .page-footer { margin-top: 10px; text-align: center; font-size: 7px; color: #9ca3af; border-top: 1px solid #C9A227; padding-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Cashflow Statement</h1>
          <p>${holdingData.bond_name} · ${holdingData.total_units || holdingData.units || '-'} Units · Generated: ${format(new Date(), 'dd MMM yyyy')}</p>
        </div>
        
        <div class="summary-box">
          <div class="summary-item">
            <label>Investment</label>
            <span>${formatAmount(expTotalInvestment)}</span>
          </div>
          <div class="summary-item">
            <label>Expected Returns</label>
            <span>${formatAmount(expTotalGross)}</span>
          </div>
          <div class="summary-item green">
            <label>Expected Profit</label>
            <span>${formatAmount(expProfit)}</span>
          </div>
          <div class="summary-item">
            <label>Expected XIRR</label>
            <span>${holdingData.xirr?.toFixed(2) || '-'}%</span>
          </div>
          <div class="summary-item purple">
            <label>Actual XIRR</label>
            <span>${holdingData.actual_xirr?.toFixed(2) || '-'}%</span>
          </div>
        </div>

        <div class="two-col">
          <!-- Expected Cashflow Column -->
          <div class="col">
            <div class="section-title expected">EXPECTED CASHFLOW</div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${expInvestments.map(cf => `
                  <tr class="outflow">
                    <td>${format(new Date(cf.date), 'dd MMM yyyy')}</td>
                    <td>-${formatAmount(Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0))}</td>
                  </tr>
                `).join('')}
                ${expInflows.map(cf => `
                  <tr>
                    <td>${format(new Date(cf.date), 'dd MMM yyyy')}</td>
                    <td>${formatAmount(cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0))}</td>
                  </tr>
                `).join('')}
                <tr class="totals">
                  <td>Profit</td>
                  <td>${formatAmount(expProfit)}</td>
                </tr>
              </tbody>
            </table>
            <div class="footer-stats">
              <div class="footer-stat">
                <label>Investment</label>
                <span>${formatAmount(expTotalInvestment)}</span>
              </div>
              <div class="footer-stat">
                <label>Returns</label>
                <span>${formatAmount(expTotalGross)}</span>
              </div>
              <div class="footer-stat">
                <label>Profit</label>
                <span class="green">${formatAmount(expProfit)}</span>
              </div>
              <div class="footer-stat">
                <label>XIRR</label>
                <span class="green">${holdingData.xirr?.toFixed(2) || '-'}%</span>
              </div>
            </div>
          </div>

          <!-- Actual Cashflow Column -->
          <div class="col">
            <div class="section-title actual">ACTUAL CASHFLOW</div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${actInvestments.map(cf => `
                  <tr class="outflow">
                    <td>${format(new Date(cf.date), 'dd MMM yyyy')}</td>
                    <td>-${formatAmount(Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0))}</td>
                  </tr>
                `).join('')}
                ${actInflows.map((cf, idx) => `
                  <tr class="${cf.type === 'maturity' ? 'maturity' : ''}">
                    <td>${format(new Date(cf.date), 'dd MMM yyyy')}</td>
                    <td>${formatAmount(cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0))}</td>
                  </tr>
                `).join('')}
                ${actualCashflows.length > 0 ? `
                  <tr class="totals">
                    <td>Profit</td>
                    <td>${formatAmount(actProfit)}</td>
                  </tr>
                ` : `
                  <tr>
                    <td colspan="2" style="text-align:center;color:#9ca3af;">No actual cashflow yet</td>
                  </tr>
                `}
              </tbody>
            </table>
            <div class="footer-stats">
              <div class="footer-stat">
                <label>Investment</label>
                <span>${formatAmount(actTotalInvestment)}</span>
              </div>
              <div class="footer-stat">
                <label>Returns</label>
                <span>${formatAmount(actTotalGross)}</span>
              </div>
              <div class="footer-stat">
                <label>Profit</label>
                <span class="green">${formatAmount(actProfit)}</span>
              </div>
              <div class="footer-stat">
                <label>XIRR</label>
                <span class="green">${holdingData.actual_xirr?.toFixed(2) || '-'}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Individual Transaction Details -->
        ${holdingData.trades && holdingData.trades.length > 0 ? `
        <div class="page-break" style="margin-top: 15px; padding-top: 10px; border-top: 2px solid #C9A227;">
          <h2 style="font-size: 11px; font-weight: 600; color: #5B373C; margin-bottom: 8px;">Individual Transaction Details</h2>
          ${holdingData.trades.map((trade, idx) => `
            <div style="margin-bottom: 10px; padding: 8px; background: ${idx % 2 === 0 ? '#F5F3EF' : '#fff'}; border: 1px solid #e5e7eb; border-radius: 4px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span style="font-size: 9px; font-weight: 600; color: #5B373C;">Trade #${idx + 1} - ${trade.units || '-'} Units</span>
                <span style="font-size: 8px; color: #6b7280;">Inv. Date: ${trade.investment_date ? format(new Date(trade.investment_date), 'dd MMM yyyy') : '-'}</span>
              </div>
              <div style="display: flex; gap: 10px; font-size: 8px;">
                <div style="flex: 1;">
                  <span style="color: #9ca3af;">Investment:</span>
                  <span style="font-weight: 500; color: #dc2626;"> ${formatAmount(trade.total_amount || trade.calculated_investment || 0)}</span>
                </div>
                <div style="flex: 1;">
                  <span style="color: #9ca3af;">Expected XIRR:</span>
                  <span style="font-weight: 500; color: #1e40af;"> ${trade.xirr?.toFixed(2) || '-'}%</span>
                </div>
                <div style="flex: 1;">
                  <span style="color: #9ca3af;">Actual XIRR:</span>
                  <span style="font-weight: 500; color: #059669;"> ${trade.actual_xirr?.toFixed(2) || '-'}%</span>
                </div>
              </div>
              ${trade.expected_cashflows && trade.expected_cashflows.length > 0 ? `
              <table style="margin-top: 5px;">
                <thead>
                  <tr>
                    <th style="width: 25%;">Date</th>
                    <th style="width: 20%;">Type</th>
                    <th style="width: 20%;">Principal</th>
                    <th style="width: 15%;">Interest</th>
                    <th style="width: 20%;">Gross</th>
                  </tr>
                </thead>
                <tbody>
                  ${trade.expected_cashflows.slice(0, 8).map(cf => `
                    <tr class="${cf.type === 'investment' ? 'outflow' : cf.type === 'maturity' ? 'maturity' : ''}">
                      <td>${cf.date ? format(new Date(cf.date), 'dd MMM yy') : '-'}</td>
                      <td style="text-transform: capitalize;">${cf.type || '-'}</td>
                      <td>${formatAmount(cf.principal_component || 0)}</td>
                      <td>${formatAmount(cf.interest_component || 0)}</td>
                      <td>${formatAmount(cf.gross_amount || cf.amount || 0)}</td>
                    </tr>
                  `).join('')}
                  ${trade.expected_cashflows.length > 8 ? `
                    <tr><td colspan="5" style="text-align:center;color:#9ca3af;font-size:7px;">...and ${trade.expected_cashflows.length - 8} more entries</td></tr>
                  ` : ''}
                </tbody>
              </table>
              ` : ''}
            </div>
          `).join('')}
        </div>
        ` : ''}

        <div class="page-footer">
          <p>System generated report · For queries, contact your relationship manager</p>
        </div>
      </body>
      </html>
    `;

    try {
      // Create an iframe for PDF generation - more reliable than div
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position: fixed; left: -9999px; top: 0; width: 1100px; height: 800px; border: none;';
      document.body.appendChild(iframe);
      
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // Wait for content to render
      await new Promise(resolve => setTimeout(resolve, 500));

      const html2pdf = (await import('html2pdf.js')).default;
      
      await html2pdf()
        .set({
          margin: [5, 5, 5, 5],
          filename: `Cashflow_Report_${holdingData.bond_name?.replace(/\s+/g, '_') || 'Report'}_${format(new Date(), 'yyyyMMdd')}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { 
            scale: 2, 
            useCORS: true, 
            logging: false,
            letterRendering: true,
            backgroundColor: '#ffffff',
            windowWidth: 1100
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
          pagebreak: { mode: 'avoid-all' }
        })
        .from(iframeDoc.body)
        .save();

      document.body.removeChild(iframe);
      toast.success('PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF Error:', err);
      toast.error('Failed to generate PDF: ' + err.message);
    }
  };

  // Download Combined Cashflow Excel (Expected + Actual)
  const downloadCombinedCashflowExcel = async (holdingData, expectedCashflows, actualCashflows) => {
    try {
      toast.info("Generating Excel...");
      
      // Build CSV data (simpler and works without external libraries)
      let csv = 'Cashflow Report - ' + holdingData.bond_name + '\n';
      csv += 'Units,' + (holdingData.total_units || holdingData.units || '') + '\n';
      csv += 'Generated,' + format(new Date(), 'dd MMM yyyy') + '\n\n';
      
      // Expected Cashflows section
      csv += 'EXPECTED CASHFLOWS\n';
      csv += 'Date,Type,Principal,Interest,Gross Amount,TDS,Net Amount\n';
      
      const expInvestments = expectedCashflows.filter(cf => cf.type === 'investment');
      const expInflows = expectedCashflows.filter(cf => cf.type !== 'investment');
      let expTotalInvestment = 0;
      let expTotalGross = 0;
      
      expInvestments.forEach(cf => {
        const amt = Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0);
        expTotalInvestment += amt;
        csv += `${cf.date},Investment,-${amt},0,-${amt},0,-${amt}\n`;
      });
      
      expInflows.forEach(cf => {
        const gross = cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0));
        expTotalGross += gross;
        csv += `${cf.date},${cf.type === 'maturity' ? 'Maturity' : 'Inflow'},${cf.principal_component || 0},${cf.interest_component || 0},${gross},${cf.tds_amount || 0},${cf.net_amount || 0}\n`;
      });
      
      csv += `\nExpected Total Investment,${expTotalInvestment}\n`;
      csv += `Expected Total Returns,${expTotalGross}\n`;
      csv += `Expected Profit,${expTotalGross - expTotalInvestment}\n`;
      csv += `Expected XIRR,${holdingData.xirr?.toFixed(2) || '-'}%\n\n`;
      
      // Actual Cashflows section
      csv += 'ACTUAL CASHFLOWS\n';
      csv += 'Date,Type,Principal,Interest,Gross Amount,TDS,Net Amount,Status\n';
      
      const actInvestments = actualCashflows.filter(cf => cf.type === 'investment');
      const actInflows = actualCashflows.filter(cf => cf.type !== 'investment');
      let actTotalInvestment = 0;
      let actTotalGross = 0;
      
      actInvestments.forEach(cf => {
        const amt = Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0);
        actTotalInvestment += amt;
        csv += `${cf.date},Investment,-${amt},0,-${amt},0,-${amt},Paid\n`;
      });
      
      actInflows.forEach(cf => {
        const gross = cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0));
        actTotalGross += gross;
        const status = cf.is_repaid ? 'Received' : (cf.type === 'maturity' ? 'Due at Maturity' : 'Pending');
        csv += `${cf.date},${cf.type === 'maturity' ? 'Maturity' : (cf.is_prepaid ? 'Prepayment' : 'Repayment')},${cf.principal_component || 0},${cf.interest_component || 0},${gross},${cf.tds_amount || 0},${cf.net_amount || 0},${status}\n`;
      });
      
      csv += `\nActual Total Investment,${actTotalInvestment}\n`;
      csv += `Actual Total Returns,${actTotalGross}\n`;
      csv += `Actual Profit,${actTotalGross - actTotalInvestment}\n`;
      csv += `Actual XIRR,${holdingData.actual_xirr?.toFixed(2) || '-'}%\n`;
      
      // Create and download the file
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cashflow_Report_${holdingData.bond_name?.replace(/\s+/g, '_') || 'Report'}_${format(new Date(), 'yyyyMMdd')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success('Excel (CSV) downloaded successfully!');
    } catch (err) {
      console.error('Excel Error:', err);
      toast.error('Failed to generate Excel: ' + err.message);
    }
  };

  if (!user) return null;

  const SidebarComponent = user.role === 'broker' ? Sidebar : user.role === 'client' ? ClientSidebar : SubBrokerSidebar;
  const consolidatedCashflows = modalData ? getConsolidatedCashflowsByDate(modalData.trades) : [];
  const expectedCashflows = modalData ? getExpectedCashflowsByDate(modalData.trades) : [];
  const actualCashflows = modalData ? getActualCashflowsByDate(modalData.trades) : [];

  return (
    <div className="flex h-screen bg-gray-50">
      <SidebarComponent user={user} />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Client List Panel - Narrower */}
        <div className="w-60 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                data-testid="search-investor"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-3 text-center text-gray-500 text-sm">Loading...</div>
            ) : filteredClients.length === 0 ? (
              <div className="p-3 text-center text-gray-500 text-sm">No investors found</div>
            ) : (
              filteredClients.map((client) => (
                <div
                  key={client.id}
                  data-testid={`client-item-${client.id}`}
                  onClick={() => handleClientSelect(client)}
                  className={`px-3 py-2.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedClient?.id === client.id ? 'bg-etihad-gold-50 border-l-4 border-l-amber-600' : ''
                  }`}
                >
                  <p className={`font-medium text-sm truncate ${selectedClient?.id === client.id ? 'text-etihad-gold-700' : 'text-gray-800'}`}>
                    {client.name}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">({client.pan_number})</p>
                  {client.total_investment > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatINR(client.total_investment)}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          {!selectedClient ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Users className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p>Select an investor to view holdings</p>
              </div>
            </div>
          ) : loadingHoldings ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              <p>Loading holdings...</p>
            </div>
          ) : clientHoldings ? (
            <div className="p-6">
              {/* Header Tabs */}
              <div className="flex items-center gap-6 mb-6 border-b border-gray-200">
                <button 
                  onClick={() => setMainTab("holdings")}
                  className={`pb-3 border-b-2 font-medium transition-colors ${
                    mainTab === "holdings" 
                      ? "border-etihad-gold-600 text-etihad-gold-700" 
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="tab-holdings"
                >
                  Bonds
                </button>
                <button 
                  onClick={() => setMainTab("trades")}
                  className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
                    mainTab === "trades" 
                      ? "border-etihad-gold-600 text-etihad-gold-700" 
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="tab-trades"
                >
                  <ClipboardList className="h-4 w-4" />
                  Trades ({clientTrades.length})
                </button>
                <button 
                  onClick={() => setMainTab("real-estate")}
                  className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
                    mainTab === "real-estate" 
                      ? "border-etihad-gold-600 text-etihad-gold-700" 
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="tab-real-estate"
                >
                  <Building2 className="h-4 w-4" />
                  Real Estate ({clientRealEstate.length})
                </button>
                <button 
                  onClick={() => setMainTab("profile")}
                  className={`pb-3 border-b-2 font-medium transition-colors ${
                    mainTab === "profile" 
                      ? "border-etihad-gold-600 text-etihad-gold-700" 
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="tab-profile"
                >
                  Profile
                </button>
              </div>
              
              {/* Broker Tools - Quick Actions (Broker only) */}
              {user?.role === 'broker' && (
                <div className="flex items-center gap-3 mb-4 p-3 bg-gradient-to-r from-slate-50 to-gray-50 border border-gray-200 rounded-lg">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Quick Tools:</span>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleSyncEmailRepayments}
                    disabled={syncingEmails}
                    className="text-blue-700 border-blue-200 hover:bg-blue-50"
                    data-testid="sync-email-btn"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncingEmails ? 'animate-spin' : ''}`} />
                    {syncingEmails ? 'Syncing...' : 'Sync Emails'}
                  </Button>
                  
                  <label className="cursor-pointer">
                    <input 
                      type="file" 
                      accept=".xlsx,.xls" 
                      onChange={handleHistoricalUpload}
                      className="hidden"
                      data-testid="historical-upload-input"
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      as="span"
                      disabled={historicalUploading}
                      className="text-green-700 border-green-200 hover:bg-green-50 pointer-events-none"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {historicalUploading ? 'Uploading...' : 'Upload Data'}
                    </Button>
                  </label>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/broker/bulk-upload?tab=historical-trades')}
                    className="text-etihad-gold-600 hover:text-etihad-gold-700 hover:bg-etihad-gold-50 ml-auto"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Bulk Upload Module
                  </Button>
                </div>
              )}
              
              {/* Profile Tab Content */}
              {mainTab === "profile" && clientDetails && (
                <div className="space-y-6">
                  {/* Personal Details */}
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                      <User className="h-5 w-5 text-etihad-gold-600" />
                      <h3 className="font-semibold text-gray-800">Personal Details</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Full Name</p>
                        <p className="font-medium text-gray-800">{clientDetails.name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">PAN Number</p>
                        <p className="font-mono font-medium text-gray-800">{clientDetails.pan_number || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Date of Birth</p>
                        <p className="font-medium text-gray-800">
                          {clientDetails.date_of_birth ? format(new Date(clientDetails.date_of_birth), "MMM dd, yyyy") : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Father/Husband Name</p>
                        <p className="font-medium text-gray-800">{clientDetails.father_husband_name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Occupation</p>
                        <p className="font-medium text-gray-800">{clientDetails.occupation || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Demat Account No.</p>
                        <p className="font-mono font-medium text-gray-800">{clientDetails.demat_account_no || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Email</p>
                        <p className="font-medium text-gray-800">{clientDetails.email || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Mobile</p>
                        <p className="font-medium text-gray-800">{clientDetails.mobile || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Country of Residency</p>
                        <p className="font-medium text-gray-800">{clientDetails.country_of_residency || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Passport Type</p>
                        <p className="font-medium text-gray-800 capitalize">{clientDetails.passport_type || 'Indian'}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Address Details */}
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                      <MapPin className="h-5 w-5 text-etihad-gold-600" />
                      <h3 className="font-semibold text-gray-800">Address Details</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="lg:col-span-2">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Address Line 1</p>
                        <p className="font-medium text-gray-800">{clientDetails.address_line1 || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Address Line 2</p>
                        <p className="font-medium text-gray-800">{clientDetails.address_line2 || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">City</p>
                        <p className="font-medium text-gray-800">{clientDetails.city || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">State</p>
                        <p className="font-medium text-gray-800">{clientDetails.state || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Pincode</p>
                        <p className="font-mono font-medium text-gray-800">{clientDetails.pincode || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Country</p>
                        <p className="font-medium text-gray-800">{clientDetails.country || 'India'}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Bank Details */}
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                      <Building2 className="h-5 w-5 text-etihad-gold-600" />
                      <h3 className="font-semibold text-gray-800">Bank Details</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Bank Name</p>
                        <p className="font-medium text-gray-800">{clientDetails.bank_name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Account Number</p>
                        <p className="font-mono font-medium text-gray-800">{clientDetails.account_number || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Branch</p>
                        <p className="font-medium text-gray-800">{clientDetails.branch || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">IFSC Code</p>
                        <p className="font-mono font-medium text-gray-800">{clientDetails.ifsc_code || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Account Type</p>
                        <p className="font-medium text-gray-800">{clientDetails.account_type || '-'}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* International Bank Details (NRI) */}
                  {(clientDetails.passport_type === 'foreign' || clientDetails.intl_bank_name) && (
                    <div className="bg-white rounded-lg border border-gray-200 p-5">
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                        <Building2 className="h-5 w-5 text-blue-600" />
                        <h3 className="font-semibold text-gray-800">International Bank Details</h3>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded ml-auto">NRI</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Bank Name</p>
                          <p className="font-medium text-gray-800">{clientDetails.intl_bank_name || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Account Number</p>
                          <p className="font-mono font-medium text-gray-800">{clientDetails.intl_account_number || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">IBAN</p>
                          <p className="font-mono font-medium text-gray-800">{clientDetails.intl_iban || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">SWIFT Code</p>
                          <p className="font-mono font-medium text-gray-800">{clientDetails.intl_swift_code || '-'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Passport Details */}
                  {(clientDetails.passport_number || clientDetails.passport_type === 'foreign') && (
                    <div className="bg-white rounded-lg border border-gray-200 p-5">
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                        <CreditCard className="h-5 w-5 text-etihad-maroon-600" />
                        <h3 className="font-semibold text-gray-800">Passport Details</h3>
                        <span className="text-xs bg-indigo-100 text-etihad-maroon-700 px-2 py-0.5 rounded ml-auto capitalize">{clientDetails.passport_type || 'Indian'}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Passport Number</p>
                          <p className="font-mono font-medium text-gray-800">{clientDetails.passport_number || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Valid From</p>
                          <p className="font-medium text-gray-800">
                            {clientDetails.passport_valid_from ? format(new Date(clientDetails.passport_valid_from), "MMM dd, yyyy") : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Valid Until</p>
                          <p className="font-medium text-gray-800">
                            {clientDetails.passport_valid_until ? format(new Date(clientDetails.passport_valid_until), "MMM dd, yyyy") : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Country of Issue</p>
                          <p className="font-medium text-gray-800">{clientDetails.passport_country_of_issue || '-'}</p>
                        </div>
                        {clientDetails.country_of_residency && (
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Country of Residency</p>
                            <p className="font-medium text-gray-800">{clientDetails.country_of_residency || '-'}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Emirates ID Details - Shows when country of residency is UAE */}
                  {clientDetails.country_of_residency && 
                   (clientDetails.country_of_residency.toLowerCase().includes('emirates') || 
                    clientDetails.country_of_residency.toLowerCase() === 'uae') && (
                    <div className="bg-white rounded-lg border border-gray-200 p-5">
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                        <CreditCard className="h-5 w-5 text-teal-600" />
                        <h3 className="font-semibold text-gray-800">Emirates ID Details</h3>
                        <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded ml-auto">UAE Resident</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Emirates ID Number</p>
                          <p className="font-mono font-medium text-gray-800">{clientDetails.emirates_id || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Emirates ID Expiry</p>
                          <p className="font-medium text-gray-800">
                            {clientDetails.emirates_id_expiry ? format(new Date(clientDetails.emirates_id_expiry), "MMM dd, yyyy") : '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* UCC List */}
                  {clientDetails.ucc_list && clientDetails.ucc_list.length > 0 && (
                    <div className="bg-white rounded-lg border border-gray-200 p-5">
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                        <FileText className="h-5 w-5 text-green-600" />
                        <h3 className="font-semibold text-gray-800">UCC List</h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {clientDetails.ucc_list.map((ucc, idx) => (
                          <span key={idx} className="px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-mono">
                            {ucc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Nominee Details */}
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                      <UserCheck className="h-5 w-5 text-etihad-gold-600" />
                      <h3 className="font-semibold text-gray-800">Nominee Details</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Nominee Name</p>
                        <p className="font-medium text-gray-800">{clientDetails.nominee_name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Relationship</p>
                        <p className="font-medium text-gray-800">{clientDetails.nominee_relationship || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Date of Birth</p>
                        <p className="font-medium text-gray-800">
                          {clientDetails.nominee_dob ? format(new Date(clientDetails.nominee_dob), "MMM dd, yyyy") : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Mobile</p>
                        <p className="font-medium text-gray-800">{clientDetails.nominee_mobile || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Trades Tab Content - Clean HTML Table */}
              {mainTab === "trades" && (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  {clientTrades.length === 0 ? (
                    <div className="text-center py-12">
                      <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">No trades found for this client</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px]">
                        <thead>
                          <tr className="bg-gray-50 border-b text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                            <th className="px-3 py-3 text-left">Client Name</th>
                            <th className="px-3 py-3 text-left">UCC</th>
                            <th className="px-3 py-3 text-left">Date</th>
                            <th className="px-3 py-3 text-left">Type</th>
                            <th className="px-3 py-3 text-right">Amount</th>
                            <th className="px-3 py-3 text-left">Portfolio</th>
                            <th className="px-3 py-3 text-left">Advisor</th>
                            <th className="px-3 py-3 text-center">Status</th>
                            <th className="px-3 py-3 text-center w-12"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {clientTrades.map((trade) => {
                            const getTradeTypeLabel = () => {
                              const tag = trade.reinvestment_tag || '';
                              if (tag === 'principal') return 'Reinv-Principal';
                              if (tag === 'interest') return 'Reinv-Interest';
                              if (tag === 'both') return 'Reinv-Both';
                              if (tag === 'none' || tag === 'not_invest') return 'Not Invest';
                              if (tag === 'custom' || tag === 'other') return 'Reinv-Custom';
                              if (tag && tag !== 'not_tagged') return `Reinv-${tag.charAt(0).toUpperCase() + tag.slice(1)}`;
                              if (trade.is_historical) return 'Principal';
                              return 'Investment';
                            };
                            const tradeType = getTradeTypeLabel();
                            
                            return (
                              <tr 
                                key={trade.id} 
                                className="hover:bg-gray-50 transition-colors"
                                data-testid={`trade-row-${trade.id}`}
                              >
                                <td className="px-3 py-3 text-sm font-medium text-gray-800 whitespace-nowrap">
                                  {trade.client_name || selectedClient?.name}
                                </td>
                                <td className="px-3 py-3 text-xs font-mono text-gray-600 whitespace-nowrap">
                                  {trade.bond_code || '-'}
                                </td>
                                <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                                  {format(new Date(trade.investment_date), "dd MMM yyyy")}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <span className={`text-xs font-medium ${
                                    tradeType.startsWith('Reinv') ? 'text-purple-600' : 
                                    tradeType === 'Principal' ? 'text-blue-600' :
                                    tradeType === 'Interest' ? 'text-green-600' :
                                    'text-gray-600'
                                  }`}>
                                    {tradeType}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-sm font-mono font-semibold text-gray-800 text-right whitespace-nowrap">
                                  {formatINR(trade.total_amount)}
                                </td>
                                <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                                  {trade.portfolio || 'Wealth'}
                                </td>
                                <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap max-w-[120px] truncate">
                                  {trade.created_by_name || '-'}
                                </td>
                                <td className="px-3 py-3 text-center whitespace-nowrap">
                                  {trade.status === 'pending' ? (
                                    <span className="px-2 py-0.5 bg-etihad-gold-100 text-etihad-gold-700 text-[10px] rounded font-medium">Pending</span>
                                  ) : trade.status === 'approved' ? (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] rounded font-medium">Approved</span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] rounded font-medium">Rejected</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-center relative" ref={openTradeMenu === trade.id ? tradeMenuRef : null}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenTradeMenu(openTradeMenu === trade.id ? null : trade.id);
                                    }}
                                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                                    data-testid={`trade-menu-${trade.id}`}
                                  >
                                    <MoreVertical className="h-4 w-4 text-gray-500" />
                                  </button>
                                  {openTradeMenu === trade.id && (
                                    <div className="absolute right-0 top-8 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] text-left">
                                      <button
                                        onClick={() => {
                                          setTradeDetailsModal(trade);
                                          setOpenTradeMenu(null);
                                        }}
                                        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                      >
                                        <Eye className="h-4 w-4 text-gray-500" />
                                        View Details
                                      </button>
                                      {trade.payment_proof_url && (
                                        <a
                                          href={trade.payment_proof_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                                          onClick={() => setOpenTradeMenu(null)}
                                        >
                                          <FileImage className="h-4 w-4" />
                                          View UTR Copy
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              
              {/* Real Estate Tab Content */}
              {mainTab === "real-estate" && (
                <div className="space-y-6">
                  {clientRealEstate.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>No real estate investments found</p>
                    </div>
                  ) : (
                    <>
                      {/* Summary Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg p-5 text-white">
                          <p className="text-teal-100 text-sm">Total Properties</p>
                          <p className="text-2xl font-bold">{clientRealEstate.length}</p>
                        </div>
                        <div className="bg-gradient-to-br from-etihad-gold-500 to-etihad-gold-600 rounded-lg p-5 text-white">
                          <p className="text-etihad-gold-100 text-sm">Total Investment</p>
                          <p className="text-2xl font-bold">
                            AED {new Intl.NumberFormat('en-AE').format(
                              clientRealEstate.reduce((sum, re) => sum + (re.investment_amount || 0), 0)
                            )}
                          </p>
                        </div>
                        <div className="bg-gradient-to-br from-etihad-maroon-500 to-etihad-maroon-600 rounded-lg p-5 text-white">
                          <p className="text-etihad-maroon-100 text-sm">Avg Share</p>
                          <p className="text-2xl font-bold">
                            {(clientRealEstate.reduce((sum, re) => sum + (re.share_percentage || 0), 0) / clientRealEstate.length).toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      {/* Properties List */}
                      <div className="space-y-4">
                        {clientRealEstate.map((property, idx) => (
                          <div key={idx} className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <Building2 className="h-5 w-5 text-teal-600" />
                                  <h4 className="font-semibold text-gray-800">{property.building_name || 'Property'}</h4>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    property.status === 'fully_invested' 
                                      ? 'bg-green-100 text-green-700' 
                                      : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {property.status === 'fully_invested' ? 'Fully Allocated' : 'Active'}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-500 mb-3">
                                  {property.project_name} • Unit {property.unit_no} • {property.developer_name}
                                </p>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div>
                                    <p className="text-xs text-gray-500">Share</p>
                                    <p className="font-semibold text-gray-800">{property.share_percentage?.toFixed(1)}%</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">Investment</p>
                                    <p className="font-semibold text-gray-800">AED {new Intl.NumberFormat('en-AE').format(property.investment_amount || 0)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">Unit Price</p>
                                    <p className="font-semibold text-gray-800">AED {new Intl.NumberFormat('en-AE').format(property.unit_price || 0)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">Invested On</p>
                                    <p className="font-semibold text-gray-800">
                                      {property.invested_at ? format(new Date(property.invested_at), 'dd MMM yyyy') : '-'}
                                    </p>
                                  </div>
                                </div>

                                {/* Payment Progress */}
                                {property.payment_schedule && property.payment_schedule.length > 0 && (
                                  <div className="mt-4 pt-4 border-t border-gray-100">
                                    <p className="text-xs text-gray-500 mb-2">Payment Progress</p>
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                                        <div 
                                          className="bg-teal-500 h-2 rounded-full transition-all" 
                                          style={{ width: `${property.payments_completed_percent || 0}%` }}
                                        />
                                      </div>
                                      <span className="text-sm font-medium text-gray-600">
                                        {property.payments_completed || 0}/{property.payment_schedule.length} milestones
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(`/broker/real-estate/${property.id}`)}
                                className="ml-4"
                              >
                                <Eye className="h-4 w-4 mr-1" /> View
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              
              {/* Holdings Tab Content */}
              {mainTab === "holdings" && (
              <>
              {/* Summary Section with Repayment Status Chart */}
              <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                {/* Top Row: Summary Stats */}
                <div className="flex items-center gap-4 text-xs mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">Total Investment:</span>
                    <span className="font-mono font-semibold text-gray-800">{formatINR(clientHoldings.summary.total_investment)}</span>
                  </div>
                  <div className="h-4 w-px bg-gray-200"></div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">Total Gross Expected:</span>
                    <span className="font-mono font-semibold text-emerald-600">{formatINR(clientHoldings.summary.total_expected)}</span>
                  </div>
                  <div className="h-4 w-px bg-gray-200"></div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">Total Gross Profit:</span>
                    <span className={`font-mono font-semibold ${clientHoldings.summary.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatINR(clientHoldings.summary.total_profit)}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-gray-200"></div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">Total O/S Principal:</span>
                    <span className="font-mono font-semibold text-blue-600">{formatINR(
                      filteredHoldings.reduce((sum, h) => sum + (h.total_principal - h.repaid_principal), 0)
                    )}</span>
                  </div>
                </div>
                
                {/* Repayment Status Chart */}
                {filteredHoldings.length > 0 && (
                <div className="pt-3 border-t border-gray-100">
                  {(() => {
                    const totalReceived = filteredHoldings.reduce((sum, h) => sum + (h.net_repaid || 0), 0);
                    const totalOutstanding = filteredHoldings.reduce((sum, h) => sum + (h.upcoming_expected || 0), 0);
                    const grandTotal = totalReceived + totalOutstanding;
                    const receivedPercent = grandTotal > 0 ? (totalReceived / grandTotal) * 100 : 0;
                    
                    return (
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Repayment Status:</span>
                        
                        {/* Compact Progress Bar */}
                        <div className="flex-1 relative h-5 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="absolute left-0 top-0 h-full bg-green-500 transition-all duration-500"
                            style={{ width: `${receivedPercent}%` }}
                          />
                          <div 
                            className="absolute top-0 h-full bg-blue-500 transition-all duration-500"
                            style={{ left: `${receivedPercent}%`, width: `${100 - receivedPercent}%` }}
                          />
                        </div>
                        
                        {/* Inline Legend */}
                        <div className="flex items-center gap-4 text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                            <span className="text-gray-600">Received:</span>
                            <span className="font-mono font-semibold text-green-700">{formatINR(totalReceived)}</span>
                            <span className="text-gray-400">({receivedPercent.toFixed(0)}%)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                            <span className="text-gray-600">Outstanding:</span>
                            <span className="font-mono font-semibold text-blue-700">{formatINR(totalOutstanding)}</span>
                            <span className="text-gray-400">({(100 - receivedPercent).toFixed(0)}%)</span>
                          </div>
                          <div className="flex items-center gap-1.5 pl-2 border-l border-gray-300">
                            <span className="text-gray-600">Total:</span>
                            <span className="font-mono font-semibold text-gray-800">{formatINR(grandTotal)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                )}
              </div>
              
              {/* Holding Report Table */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-5 w-5 text-etihad-gold-600" />
                      <h3 className="font-semibold text-gray-800">Holding Report</h3>
                    </div>
                    
                    {/* Status Filter Radio Buttons */}
                    <div className="flex items-center gap-4 ml-4 pl-4 border-l border-gray-200">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="radio" 
                          name="holdingStatus" 
                          checked={statusFilter === 'all'} 
                          onChange={() => setStatusFilter('all')} 
                          className="h-3.5 w-3.5 text-etihad-gold-600 focus:ring-etihad-gold-500" 
                        />
                        <span className="text-sm text-gray-600">All</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="radio" 
                          name="holdingStatus" 
                          checked={statusFilter === 'active'} 
                          onChange={() => setStatusFilter('active')} 
                          className="h-3.5 w-3.5 text-etihad-gold-600 focus:ring-etihad-gold-500" 
                        />
                        <span className="text-sm text-gray-600">Active</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="radio" 
                          name="holdingStatus" 
                          checked={statusFilter === 'fully_repaid'} 
                          onChange={() => setStatusFilter('fully_repaid')} 
                          className="h-3.5 w-3.5 text-etihad-gold-600 focus:ring-etihad-gold-500" 
                        />
                        <span className="text-sm text-gray-600">Completed</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={handleDownloadExcel} className="text-etihad-gold-700 hover:text-etihad-gold-800" data-testid="download-holdings-btn">
                      <Download className="h-4 w-4 mr-2" />
                      DOWNLOAD
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleSendReportEmail}
                      disabled={sendingEmail}
                      className="text-etihad-gold-700 hover:text-etihad-gold-800"
                      data-testid="email-holdings-btn"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      {sendingEmail ? 'SENDING...' : 'EMAIL'}
                    </Button>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-2 px-2 text-[10px] font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">Scheme</th>
                        <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Investment</th>
                        <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Gross Expected</th>
                        <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Profit</th>
                        <th className="text-center py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Expected XIRR</th>
                        <th className="text-center py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Actual XIRR</th>
                        <th className="text-center py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHoldings.map((holding) => {
                        // Get all expected cashflows (from secondary market calculator)
                        const allExpectedCashflows = (holding.trades || []).flatMap(trade => trade.expected_cashflows || []);
                        // EXPECTED Gross (sum of expected inflows - this is the target without prepayments affecting it)
                        const expectedGross = allExpectedCashflows
                          .filter(cf => cf.type !== 'investment')
                          .reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0);
                        const expectedProfit = expectedGross - holding.invested_amount;
                        
                        // ACTUAL Gross (from actual cashflows - sum of repayments made + due)
                        // This changes due to prepayments affecting interest calculations
                        const allActualCashflows = (holding.trades || []).flatMap(trade => trade.actual_cashflows || []);
                        const actualGross = allActualCashflows
                          .filter(cf => cf.type !== 'investment')
                          .reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0);
                        const actualProfit = actualGross - holding.invested_amount;
                        
                        // Difference due to prepayments (Actual - Expected)
                        // Negative means less profit due to prepayments reducing interest
                        const grossDifference = actualGross - expectedGross;
                        const profitDifference = actualProfit - expectedProfit;
                        
                        // Format number with commas (Indian format)
                        const formatNum = (num) => num.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                        
                        // Format difference in brackets (no minus sign)
                        const formatDiff = (num) => `(${Math.abs(num).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;
                        
                        // Show difference row if there's a significant change (> ₹1)
                        const showDifference = Math.abs(grossDifference) > 1;
                        
                        // Tooltip text for Gross Expected column
                        const grossDiffTooltip = `Previous expected: ₹${formatNum(expectedGross)} - Actual expected now: ₹${formatNum(actualGross)}`;
                        
                        // Tooltip text for Profit column - shows profit difference explanation
                        const profitDiffTooltip = `Previous profit: ₹${formatNum(expectedProfit)} - Actual profit now: ₹${formatNum(actualProfit)}`;
                        
                        return (
                        <tr key={holding.bond_id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-2 sticky left-0 bg-white">
                            <p className="font-medium text-gray-800 text-xs truncate max-w-[120px]" title={holding.bond_name}>{holding.bond_name}</p>
                            <p className="text-[10px] text-gray-400">{holding.total_units} units</p>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-xs">
                            <p>{formatNum(holding.invested_amount)}</p>
                            {/* No difference shown for Investment - it doesn't change */}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-xs">
                            <p>{formatNum(actualGross)}</p>
                            {showDifference && <p className="text-[10px] text-red-600 cursor-help" title={grossDiffTooltip}>{formatDiff(grossDifference)}</p>}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-xs">
                            <p className={actualProfit >= 0 ? 'text-green-600' : 'text-red-600'}>{formatNum(actualProfit)}</p>
                            {showDifference && <p className="text-[10px] text-red-600 cursor-help" title={profitDiffTooltip}>{formatDiff(profitDifference)}</p>}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {holding.xirr !== null && holding.xirr !== undefined ? (
                              <span className="font-mono text-xs">{holding.xirr.toFixed(2)}%</span>
                            ) : (
                              <span className="text-gray-400 text-[10px]">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {holding.actual_xirr !== null && holding.actual_xirr !== undefined ? (
                              <span className="font-mono text-xs">{holding.actual_xirr.toFixed(2)}%</span>
                            ) : (
                              <span className="text-gray-400 text-[10px]">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button 
                              onClick={() => openCashflowModal(holding)} 
                              className="px-2 py-1 text-[10px] font-medium text-etihad-gold-700 bg-etihad-gold-50 hover:bg-etihad-gold-100 rounded border border-etihad-gold-200 transition-colors"
                              data-testid={`view-details-${holding.bond_id}`}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {filteredHoldings.length === 0 && (
                    <div className="p-8 text-center text-gray-500">No holdings found for selected filter</div>
                  )}
                </div>
              </div>
              </>
              )}
            </div>
          ) : null}
        </div>
      </div>
      
      {/* Cashflow Modal Popup */}
      {modalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          
          <div className="relative bg-white rounded-xl shadow-2xl w-[95%] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-etihad-gold-50 to-orange-50">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Cashflow Details</h2>
                <p className="text-sm text-gray-600">{modalData.bond_name} • {modalData.total_units} units • Invested: {formatINR(modalData.invested_amount)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadCombinedCashflowPDF(modalData, expectedCashflows, actualCashflows)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-etihad-gold-600 hover:bg-etihad-gold-700 rounded-lg text-white text-sm font-medium transition-colors"
                  title="Download as PDF"
                >
                  <FileText className="h-4 w-4" />
                  PDF
                </button>
                <button
                  onClick={() => downloadCombinedCashflowExcel(modalData, expectedCashflows, actualCashflows)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm font-medium transition-colors"
                  title="Download as Excel (CSV)"
                >
                  <Download className="h-4 w-4" />
                  Excel
                </button>
                <button onClick={closeModal} className="p-2 hover:bg-white/50 rounded-full transition-colors" data-testid="close-modal-btn">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>
            
            {/* Tabs: Summary + Individual Transactions */}
            <div className="flex border-b border-gray-200 bg-gray-50 px-4 overflow-x-auto">
              {/* Summary Tab */}
              <button
                onClick={() => setActiveTab("summary")}
                className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                  activeTab === "summary" 
                    ? 'border-etihad-gold-600 text-etihad-gold-700 bg-white' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                data-testid="tab-summary"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>Summary</span>
                </div>
              </button>
              
              {/* Individual Transaction Tabs - Only show if multiple distinct investment dates */}
              {(() => {
                // Get unique investment dates
                const uniqueDates = [...new Set(modalData.trades.map(t => t.investment_date?.split('T')[0]))];
                // Only show individual tabs if more than 1 unique date
                if (uniqueDates.length <= 1) return null;
                
                return modalData.trades.map((trade, index) => (
                  <button
                    key={trade.trade_id}
                    onClick={() => setActiveTab(index)}
                    className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                      activeTab === index 
                        ? 'border-etihad-gold-600 text-etihad-gold-700 bg-white' 
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                    data-testid={`trade-tab-${index}`}
                  >
                    <span className="block">{format(new Date(trade.investment_date), "dd MMM yyyy")}</span>
                    <span className="text-xs text-gray-400">{trade.units} units</span>
                  </button>
                ));
              })()}
            </div>
            
            {/* Tab Content */}
            <div className="flex-1 overflow-auto">
              {/* Summary Tab Content */}
              {activeTab === "summary" && (
                <div className="p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    
                    {/* LEFT COLUMN - Expected Repayments */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
                      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Expected Cashflow
                        </h3>
                      </div>
                      
                      {/* Expected Cashflows Table */}
                      <div className="flex-1 max-h-[300px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                            <tr>
                              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {expectedCashflows.length > 0 ? expectedCashflows.map((cf, idx) => (
                              cf.type === 'investment' ? (
                                <tr key={idx} className="bg-red-50">
                                  <td className="py-3 px-4 font-mono text-sm text-red-700">{format(new Date(cf.date), "dd MMM yyyy")}</td>
                                  <td className="py-3 px-4 text-right font-mono text-sm font-semibold text-red-600">
                                    -{formatAbsoluteINR(Math.abs(cf.investment_amount || cf.gross_amount || 0))}
                                  </td>
                                </tr>
                              ) : (
                                <tr key={idx} className="bg-white hover:bg-gray-50">
                                  <td className="py-3 px-4 font-mono text-sm text-gray-900">{format(new Date(cf.date), "dd MMM yyyy")}</td>
                                  <td className="py-3 px-4 text-right font-mono text-sm font-semibold text-gray-900">
                                    {formatAbsoluteINR(cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0)))}
                                  </td>
                                </tr>
                              )
                            )) : (
                              <tr>
                                <td colSpan="2" className="py-8 text-center text-gray-500">
                                  <p className="text-sm">No expected cashflows</p>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Expected Summary Footer - Fixed at bottom */}
                      <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 mt-auto">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-sm text-gray-600">Profits:</span>
                            <span className="font-mono font-bold ml-2 text-green-600">
                              {formatAbsoluteINR(
                                expectedCashflows.filter(cf => cf.type !== 'investment').reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0) -
                                expectedCashflows.filter(cf => cf.type === 'investment').reduce((sum, cf) => sum + Math.abs(cf.investment_amount || cf.gross_amount || 0), 0)
                              )}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm text-gray-600">XIRR:</span>
                            <span className="font-mono font-bold ml-2 text-blue-700">
                              {modalData.xirr !== null && modalData.xirr !== undefined ? `${modalData.xirr.toFixed(2)}%` : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* RIGHT COLUMN - Actual Cashflow */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
                      <div className="bg-gradient-to-r from-green-600 to-green-700 px-4 py-3">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                          <Check className="h-4 w-4" />
                          Actual Cashflow
                        </h3>
                      </div>
                      
                      {/* Actual Cashflows Table */}
                      <div className="flex-1 max-h-[300px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                            <tr>
                              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {actualCashflows.length > 0 ? actualCashflows.map((cf, idx) => (
                              cf.type === 'investment' ? (
                                <tr key={idx} className="bg-red-50">
                                  <td className="py-3 px-4 font-mono text-sm text-red-700">{format(new Date(cf.date), "dd MMM yyyy")}</td>
                                  <td className="py-3 px-4 text-right font-mono text-sm font-semibold text-red-600">
                                    -{formatAbsoluteINR(Math.abs(cf.investment_amount || cf.gross_amount || 0))}
                                  </td>
                                </tr>
                              ) : cf.type === 'maturity' ? (
                                <tr key={idx} className={cf.is_repaid ? "bg-green-50" : "bg-yellow-50"}>
                                  <td className={`py-3 px-4 font-mono text-sm ${cf.is_repaid ? "text-green-700" : "text-yellow-700"}`}>{format(new Date(cf.date), "dd MMM yyyy")}</td>
                                  <td className={`py-3 px-4 text-right font-mono text-sm font-semibold ${cf.is_repaid ? "text-green-600" : "text-yellow-600"}`}>
                                    {formatAbsoluteINR(cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0)))}
                                  </td>
                                </tr>
                              ) : (
                                <tr key={idx} className={cf.is_repaid ? "bg-green-50" : "bg-yellow-50"}>
                                  <td className={`py-3 px-4 font-mono text-sm ${cf.is_repaid ? "text-green-700" : "text-yellow-700"}`}>{format(new Date(cf.date), "dd MMM yyyy")}</td>
                                  <td className={`py-3 px-4 text-right font-mono text-sm font-semibold ${cf.is_repaid ? "text-green-600" : "text-yellow-600"}`}>
                                    {formatAbsoluteINR(cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0)))}
                                  </td>
                                </tr>
                              )
                            )) : (
                              <tr>
                                <td colSpan="2" className="py-8 text-center text-gray-500">
                                  <p className="text-sm">No actual cashflow yet</p>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Actual Summary Footer - Fixed at bottom with Profits */}
                      <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 mt-auto">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-sm text-gray-600">Profits:</span>
                            <span className="font-mono font-bold ml-2 text-green-600">
                              {formatAbsoluteINR(
                                actualCashflows.filter(cf => cf.type !== 'investment').reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0) -
                                actualCashflows.filter(cf => cf.type === 'investment').reduce((sum, cf) => sum + Math.abs(cf.investment_amount || cf.gross_amount || 0), 0)
                              )}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm text-gray-600">XIRR:</span>
                            <span className="font-mono font-bold ml-2 text-green-700">
                              {modalData.actual_xirr !== null && modalData.actual_xirr !== undefined ? `${modalData.actual_xirr.toFixed(2)}%` : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                  </div>
                </div>
              )}
              
              {/* Individual Transaction Tab Content */}
              {typeof activeTab === 'number' && modalData.trades[activeTab] && (
                <div className="p-4">
                  {/* Transaction Header */}
                  <div className="px-4 py-3 bg-etihad-gold-50/50 border border-etihad-gold-100 rounded-lg mb-4 flex items-center justify-between flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-6">
                      <div>
                        <span className="text-gray-500">Purchase Date:</span>
                        <span className="font-medium ml-2">{format(new Date(modalData.trades[activeTab].investment_date), "dd MMMM yyyy")}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Units:</span>
                        <span className="font-medium ml-2">{modalData.trades[activeTab].units}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Investment:</span>
                        <span className="font-mono font-medium ml-2">{formatINR(modalData.trades[activeTab].invested_amount)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-gray-500">Expected XIRR:</span>
                        <span className="font-mono font-semibold ml-2 text-green-600">
                          {modalData.trades[activeTab].xirr !== null ? `${modalData.trades[activeTab].xirr.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Actual XIRR:</span>
                        <span className="font-mono font-semibold ml-2 text-purple-600">
                          {modalData.trades[activeTab].actual_xirr !== null ? `${modalData.trades[activeTab].actual_xirr.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Two Column Layout for Individual Transaction */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Expected Cashflows for this trade */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
                      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2">
                        <h3 className="font-semibold text-white text-sm">Expected Cashflow</h3>
                      </div>
                      <div className="flex-1 max-h-[250px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                            <tr>
                              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 uppercase">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(modalData.trades[activeTab].expected_cashflows || []).map((cf, idx) => (
                              cf.type === 'investment' ? (
                                <tr key={idx} className="bg-red-50">
                                  <td className="py-2 px-3 font-mono text-xs text-red-700">{format(new Date(cf.date), "dd MMM yyyy")}</td>
                                  <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-red-600">
                                    -{formatAbsoluteINR(Math.abs(cf.amount || cf.gross_amount || 0))}
                                  </td>
                                </tr>
                              ) : (
                                <tr key={idx} className="bg-white hover:bg-gray-50">
                                  <td className="py-2 px-3 font-mono text-xs text-gray-900">{format(new Date(cf.date), "dd MMM yyyy")}</td>
                                  <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-gray-900">
                                    {formatAbsoluteINR(cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0)))}
                                  </td>
                                </tr>
                              )
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="bg-gray-50 px-4 py-2 border-t border-gray-200 text-sm mt-auto">
                        <span className="text-gray-600">Profits:</span>
                        <span className="font-mono font-bold ml-2 text-green-600">
                          {formatAbsoluteINR(
                            (modalData.trades[activeTab].expected_cashflows || []).filter(cf => cf.type !== 'investment').reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0) -
                            (modalData.trades[activeTab].expected_cashflows || []).filter(cf => cf.type === 'investment').reduce((sum, cf) => sum + Math.abs(cf.amount || cf.gross_amount || 0), 0)
                          )}
                        </span>
                      </div>
                    </div>
                    
                    {/* Actual Cashflow for this trade */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
                      <div className="bg-gradient-to-r from-green-600 to-green-700 px-4 py-2">
                        <h3 className="font-semibold text-white text-sm">Actual Cashflow</h3>
                      </div>
                      <div className="flex-1 max-h-[250px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                            <tr>
                              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 uppercase">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(() => {
                              const actualCfs = modalData.trades[activeTab].actual_cashflows || [];
                              if (actualCfs.length > 0) {
                                return actualCfs.map((cf, idx) => (
                                  cf.type === 'investment' ? (
                                    <tr key={idx} className="bg-red-50">
                                      <td className="py-2 px-3 font-mono text-xs text-red-700">{format(new Date(cf.date), "dd MMM yyyy")}</td>
                                      <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-red-600">
                                        -{formatAbsoluteINR(Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0))}
                                      </td>
                                    </tr>
                                  ) : cf.type === 'maturity' ? (
                                    <tr key={idx} className={cf.is_repaid ? "bg-green-50" : "bg-yellow-50"}>
                                      <td className={`py-2 px-3 font-mono text-xs ${cf.is_repaid ? "text-green-700" : "text-yellow-700"}`}>{format(new Date(cf.date), "dd MMM yyyy")}</td>
                                      <td className={`py-2 px-3 text-right font-mono text-xs font-semibold ${cf.is_repaid ? "text-green-600" : "text-yellow-600"}`}>
                                        {formatAbsoluteINR(cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0)))}
                                      </td>
                                    </tr>
                                  ) : (
                                    <tr key={idx} className={cf.is_repaid ? "bg-green-50" : "bg-yellow-50"}>
                                      <td className={`py-2 px-3 font-mono text-xs ${cf.is_repaid ? "text-green-700" : "text-yellow-700"}`}>{format(new Date(cf.date), "dd MMM yyyy")}</td>
                                      <td className={`py-2 px-3 text-right font-mono text-xs font-semibold ${cf.is_repaid ? "text-green-600" : "text-yellow-600"}`}>
                                        {formatAbsoluteINR(cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0)))}
                                      </td>
                                    </tr>
                                  )
                                ));
                              } else {
                                return (
                                  <tr>
                                    <td colSpan="2" className="py-6 text-center text-gray-500">
                                      <p className="text-xs">No actual cashflow yet</p>
                                    </td>
                                  </tr>
                                );
                              }
                            })()}
                          </tbody>
                        </table>
                      </div>
                      <div className="bg-gray-50 px-4 py-2 border-t border-gray-200 text-sm mt-auto">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-gray-600">Profits:</span>
                            <span className="font-mono font-bold ml-2 text-green-600">
                              {formatAbsoluteINR(
                                (modalData.trades[activeTab].actual_cashflows || []).filter(cf => cf.type !== 'investment').reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0) -
                                (modalData.trades[activeTab].actual_cashflows || []).filter(cf => cf.type === 'investment').reduce((sum, cf) => sum + Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0), 0)
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">XIRR:</span>
                            <span className="font-mono font-bold ml-2 text-green-700">
                              {modalData.trades[activeTab].actual_xirr !== null && modalData.trades[activeTab].actual_xirr !== undefined ? `${modalData.trades[activeTab].actual_xirr.toFixed(2)}%` : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Principal Prepayment Modal */}
      {showPrepaymentModal && prepaymentTrade && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Record Principal Prepayment</h2>
                <p className="text-sm text-gray-500 mt-1">Enter details for early principal repayment</p>
              </div>
              <button 
                onClick={() => setShowPrepaymentModal(false)} 
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-5 space-y-5">
              {/* Trade Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-800 mb-2">{modalData?.bond_name}</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Investment Date:</span>
                    <span className="font-medium ml-2">{format(new Date(prepaymentTrade.investment_date), "MMM dd, yyyy")}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Invested Amount:</span>
                    <span className="font-medium ml-2">{formatINR(prepaymentTrade.invested_amount)}</span>
                  </div>
                </div>
              </div>
              
              {/* Prepayment Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prepayment Date <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="date"
                    value={prepaymentDate}
                    onChange={(e) => setPrepaymentDate(e.target.value)}
                    className="w-full"
                    data-testid="prepayment-date-input"
                  />
                  <p className="text-xs text-gray-500 mt-1">Date when principal was actually repaid</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prepaid Principal Amount <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                    <Input
                      type="number"
                      value={prepaymentAmount}
                      onChange={(e) => setPrepaymentAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="pl-8"
                      data-testid="prepayment-amount-input"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Amount of principal repaid early</p>
                </div>
                
                {/* Percentage Preview */}
                {prepaymentAmount && parseFloat(prepaymentAmount) > 0 && prepaymentTrade?.invested_amount > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4" data-testid="prepayment-percentage-preview">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-green-700 font-medium uppercase">Prepayment Percentage</p>
                        <p className="text-2xl font-bold text-green-700">
                          {((parseFloat(prepaymentAmount) / prepaymentTrade.invested_amount) * 100).toFixed(2)}%
                        </p>
                        <p className="text-xs text-green-600">
                          of total principal (₹{prepaymentTrade.invested_amount?.toLocaleString('en-IN')})
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-green-700 font-medium uppercase">Remaining After</p>
                        <p className="text-lg font-semibold text-green-700">
                          ₹{(prepaymentTrade.invested_amount - parseFloat(prepaymentAmount)).toLocaleString('en-IN')}
                        </p>
                        <p className="text-xs text-green-600">
                          ({(100 - ((parseFloat(prepaymentAmount) / prepaymentTrade.invested_amount) * 100)).toFixed(2)}% remaining)
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (Optional)
                  </label>
                  <Input
                    type="text"
                    value={prepaymentNotes}
                    onChange={(e) => setPrepaymentNotes(e.target.value)}
                    placeholder="Any additional notes..."
                    data-testid="prepayment-notes-input"
                  />
                </div>
              </div>
              
              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-blue-800">
                    <p className="font-medium mb-1">What happens when you record a prepayment?</p>
                    <ul className="list-disc list-inside text-xs space-y-1 text-blue-700">
                      <li>Current cycle interest will be prorated (before & after prepayment date)</li>
                      <li>All future interest payments will be recalculated based on remaining principal</li>
                      <li>Client will receive an email notification with revised schedule</li>
                      <li>Reinvestment tags for affected payments will be marked for review</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-5 border-t border-gray-200 bg-gray-50">
              <Button
                variant="outline"
                onClick={() => setShowPrepaymentModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRecordPrepayment}
                disabled={recordingPrepayment || !prepaymentDate || !prepaymentAmount}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {recordingPrepayment ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Recording...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Record Prepayment
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Trade Details Modal */}
      {tradeDetailsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Trade Details</h2>
                <p className="text-sm text-gray-500 mt-1">{tradeDetailsModal.bond_name}</p>
              </div>
              <button 
                onClick={() => setTradeDetailsModal(null)} 
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Client Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Client Information
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Client Name</p>
                    <p className="text-sm font-medium text-gray-800">{tradeDetailsModal.client_name || selectedClient?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">PAN</p>
                    <p className="text-sm font-mono text-gray-800">{tradeDetailsModal.client_pan || clientDetails?.pan_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Email</p>
                    <p className="text-sm text-gray-800 truncate">{clientDetails?.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Phone</p>
                    <p className="text-sm text-gray-800">{clientDetails?.mobile || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Trade Information */}
              <div className="bg-etihad-gold-50 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-etihad-gold-700 uppercase mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Trade Information
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Units</p>
                    <p className="text-sm font-bold text-gray-800">{tradeDetailsModal.units}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Price/Unit</p>
                    <p className="text-sm font-mono text-gray-800">{formatINR(tradeDetailsModal.calculated_price || 0)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Total Amount</p>
                    <p className="text-sm font-bold text-etihad-gold-600">{formatINR(tradeDetailsModal.total_amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Investment Date</p>
                    <p className="text-sm font-mono text-gray-800">{format(new Date(tradeDetailsModal.investment_date), "dd MMM yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Status</p>
                    <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                      tradeDetailsModal.status === 'approved' 
                        ? 'bg-green-100 text-green-700' 
                        : tradeDetailsModal.status === 'pending'
                        ? 'bg-etihad-gold-100 text-etihad-gold-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {tradeDetailsModal.status?.charAt(0).toUpperCase() + tradeDetailsModal.status?.slice(1)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-blue-700 uppercase mb-3 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payment Details
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">UTR/Reference</span>
                    <span className="text-sm font-mono font-medium text-gray-800">
                      {tradeDetailsModal.payment_reference || '-'}
                    </span>
                  </div>
                  
                  {/* UTR Copy with Eye Icon */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">UTR Copy</span>
                    {tradeDetailsModal.payment_proof_url ? (
                      <a
                        href={tradeDetailsModal.payment_proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md transition-colors"
                      >
                        <Eye className="h-4 w-4" />
                        <span className="text-sm font-medium">View</span>
                      </a>
                    ) : tradeDetailsModal.payment_proof_filename ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-md">
                        <Eye className="h-4 w-4" />
                        <span className="text-sm font-medium truncate max-w-[150px]">{tradeDetailsModal.payment_proof_filename}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400 italic">Not uploaded</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Remarks */}
              {(tradeDetailsModal.payment_notes || tradeDetailsModal.broker_notes) && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-slate-700 uppercase mb-3">Remarks</h3>
                  {tradeDetailsModal.payment_notes && (
                    <p className="text-sm text-gray-700 mb-2">{tradeDetailsModal.payment_notes}</p>
                  )}
                  {tradeDetailsModal.broker_notes && (
                    <p className="text-sm text-blue-600 italic">{tradeDetailsModal.broker_notes}</p>
                  )}
                </div>
              )}

              {/* Repayments Section - Show cashflows for this trade */}
              {(() => {
                // Find holdings for this bond and client to get cashflows
                const tradeHolding = clientDetails?.holdings?.find(h => h.bond_id === tradeDetailsModal.bond_id);
                const tradeCashflows = tradeHolding?.cashflows || [];
                const repaidCashflows = tradeCashflows.filter(cf => cf.is_repaid);
                
                if (tradeCashflows.length === 0) return null;
                
                return (
                  <div className="bg-green-50 rounded-lg p-4">
                    <h3 className="text-xs font-semibold text-green-700 uppercase mb-3 flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Repayments ({repaidCashflows.length}/{tradeCashflows.length})
                    </h3>
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {tradeCashflows.slice(0, 10).map((cf, idx) => (
                        <div 
                          key={idx} 
                          className={`flex justify-between items-center py-2 px-3 rounded text-sm ${
                            cf.is_repaid ? 'bg-green-100' : 'bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {cf.is_repaid ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Clock className="h-4 w-4 text-gray-400" />
                            )}
                            <span className="font-mono text-xs text-gray-600">
                              {format(new Date(cf.date), "dd MMM yy")}
                            </span>
                          </div>
                          <span className={`font-mono font-medium ${cf.is_repaid ? 'text-green-700' : 'text-gray-600'}`}>
                            {formatINR(cf.amount || cf.net_amount || 0)}
                          </span>
                        </div>
                      ))}
                      {tradeCashflows.length > 10 && (
                        <p className="text-xs text-gray-500 text-center py-1">
                          +{tradeCashflows.length - 10} more repayments
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Approval Info - Hide for historical trades */}
              {tradeDetailsModal.approved_at && !tradeDetailsModal.is_historical && (
                <div className="text-center py-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    {tradeDetailsModal.status === 'approved' ? 'Approved' : 'Rejected'} on {format(new Date(tradeDetailsModal.approved_at), "dd MMM yyyy 'at' HH:mm")}
                    {tradeDetailsModal.approved_by_name && ` by ${tradeDetailsModal.approved_by_name}`}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end p-4 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={() => setTradeDetailsModal(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
