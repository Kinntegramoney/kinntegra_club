import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Search, Download, Mail, Check, X, FileText, Users, TrendingUp, DollarSign, MoreVertical, Eye, Calendar, User, MapPin, Building2, CreditCard, UserCheck, ClipboardList, FileImage, Upload, AlertCircle } from "lucide-react";
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
  const [modalData, setModalData] = useState(null);
  const [activeTab, setActiveTab] = useState("summary"); // "summary" or trade index
  const [mainTab, setMainTab] = useState("holdings"); // "holdings", "trades", or "profile"
  const menuRef = useRef(null);
  
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
      const [holdingsRes, clientRes, tradesRes, realEstateRes] = await Promise.all([
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
        }).catch(() => ({ data: [] })) // Handle if endpoint doesn't exist yet
      ]);
      setClientHoldings(holdingsRes.data);
      setClientDetails(clientRes.data);
      // Sort trades by created_at date (most recent first)
      const sortedTrades = (tradesRes.data || []).sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
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

  const openCashflowModal = (holding) => {
    setModalData(holding);
    setActiveTab("summary");
    setOpenMenu(null);
  };

  const closeModal = () => {
    setModalData(null);
    setActiveTab("summary");
  };

  // Get consolidated cashflows by date (for Summary tab)
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
          is_repaid: cf.is_repaid
        });
        byDate[cf.date].cashflow_ids.push(cf.id);
        if (!cf.is_repaid) {
          byDate[cf.date].all_repaid = false;
        }
      });
    });
    
    return Object.values(byDate).sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  // Consolidate holdings by bond_id
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
          trades: []
        };
      }
      
      consolidated[bondId].total_units += holding.units;
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
      
      // Use the XIRR from the holding if available
      if (holding.xirr !== null && holding.xirr !== undefined) {
        // If multiple trades, we'll use the weighted average or just take the first non-null
        if (consolidated[bondId].xirr === null) {
          consolidated[bondId].xirr = holding.xirr;
        }
      }
      
      consolidated[bondId].trades.push({
        trade_id: holding.trade_id,
        units: holding.units,
        investment_date: holding.investment_date,
        invested_amount: holding.invested_amount,
        prepaid_count: holding.prepaid_count || 0,
        prepaid_amount: holding.prepaid_amount || 0,
        xirr: holding.xirr,
        cashflows: holding.cashflows.sort((a, b) => new Date(a.date) - new Date(b.date))
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
    if (amount >= 10000000) {
      return `₹ ${(amount / 10000000).toFixed(2)} Cr`;
    } else if (amount >= 100000) {
      return `₹ ${(amount / 100000).toFixed(2)} L`;
    } else if (amount >= 1000) {
      return `₹ ${(amount / 1000).toFixed(2)} K`;
    }
    return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (!user) return null;

  const SidebarComponent = user.role === 'broker' ? Sidebar : user.role === 'client' ? ClientSidebar : SubBrokerSidebar;
  const consolidatedCashflows = modalData ? getConsolidatedCashflowsByDate(modalData.trades) : [];

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
                    selectedClient?.id === client.id ? 'bg-amber-50 border-l-4 border-l-amber-600' : ''
                  }`}
                >
                  <p className={`font-medium text-sm truncate ${selectedClient?.id === client.id ? 'text-amber-700' : 'text-gray-800'}`}>
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
                      ? "border-amber-600 text-amber-700" 
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
                      ? "border-amber-600 text-amber-700" 
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
                      ? "border-amber-600 text-amber-700" 
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
                      ? "border-amber-600 text-amber-700" 
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="tab-profile"
                >
                  Profile
                </button>
              </div>
              
              {/* Profile Tab Content */}
              {mainTab === "profile" && clientDetails && (
                <div className="space-y-6">
                  {/* Personal Details */}
                  <div className="bg-white rounded-lg border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                      <User className="h-5 w-5 text-amber-600" />
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
                      <MapPin className="h-5 w-5 text-amber-600" />
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
                      <Building2 className="h-5 w-5 text-amber-600" />
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
                        <CreditCard className="h-5 w-5 text-indigo-600" />
                        <h3 className="font-semibold text-gray-800">Passport Details</h3>
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded ml-auto capitalize">{clientDetails.passport_type || 'Indian'}</span>
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
                      <UserCheck className="h-5 w-5 text-amber-600" />
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
              
              {/* Trades Tab Content */}
              {mainTab === "trades" && (
                <div className="space-y-4">
                  {clientTrades.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                      <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">No trades found for this client</p>
                    </div>
                  ) : (
                    clientTrades.map((trade) => (
                      <div
                        key={trade.id}
                        className="bg-white rounded-lg border border-gray-200 p-4 md:p-6"
                        data-testid={`trade-card-${trade.id}`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-4">
                          <div>
                            <h3 className="font-semibold text-base md:text-lg truncate">{trade.bond_name}</h3>
                            <p className="text-xs md:text-sm text-gray-500">
                              Created by {trade.created_by_name} ({trade.created_by_role === 'sub_broker' ? 'Sub-Broker' : trade.created_by_role === 'client' ? 'Client' : 'Broker'})
                            </p>
                          </div>
                          {trade.status === 'pending' ? (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium">Pending</span>
                          ) : trade.status === 'approved' ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Approved</span>
                          ) : (
                            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">Rejected</span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-4">
                          <div>
                            <p className="text-xs text-gray-500 uppercase">Trade Date</p>
                            <p className="font-mono text-sm">{format(new Date(trade.created_at), "dd-MMM-yyyy")}</p>
                            <p className="font-mono text-xs text-gray-400">{format(new Date(trade.created_at), "HH:mm")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase">Units</p>
                            <p className="font-mono font-bold text-base md:text-lg">{trade.units}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase">Price/Unit</p>
                            <p className="font-mono text-sm">₹{trade.calculated_price?.toLocaleString('en-IN')}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase">Total</p>
                            <p className="font-mono font-bold text-amber-600 text-sm md:text-base">₹{trade.total_amount?.toLocaleString('en-IN')}</p>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <p className="text-xs text-gray-500 uppercase">Investment Date</p>
                            <p className="font-mono text-sm">{format(new Date(trade.investment_date), "dd-MMM-yyyy")}</p>
                          </div>
                        </div>

                        {(trade.payment_reference || trade.payment_notes || trade.payment_proof_filename) && (
                          <div className="bg-gray-50 p-3 rounded-md mb-4">
                            <p className="text-xs text-gray-500 uppercase mb-2 font-medium">Payment Details</p>
                            <div className="space-y-1 text-sm">
                              {trade.payment_reference && (
                                <p><span className="text-gray-500">Reference:</span> <span className="font-mono">{trade.payment_reference}</span></p>
                              )}
                              {trade.payment_proof_filename && (
                                <p className="flex items-center gap-2">
                                  <FileImage className="h-4 w-4 text-green-600" />
                                  <span className="text-gray-500">Proof:</span> 
                                  <span className="text-green-700 truncate max-w-[200px]">{trade.payment_proof_filename}</span>
                                </p>
                              )}
                              {trade.payment_notes && (
                                <p><span className="text-gray-500">Notes:</span> {trade.payment_notes}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {trade.broker_notes && (
                          <div className="bg-blue-50 p-3 rounded-md mb-4">
                            <p className="text-xs text-blue-600 uppercase mb-1">Broker Notes</p>
                            <p className="text-sm">{trade.broker_notes}</p>
                          </div>
                        )}

                        {trade.approved_at && (
                          <div className="text-xs text-gray-500 pt-3 border-t border-gray-200">
                            {trade.status === 'approved' ? 'Approved' : 'Rejected'} on {format(new Date(trade.approved_at), "MMM dd, yyyy 'at' HH:mm")}
                            {trade.approved_by_name && ` by ${trade.approved_by_name}`}
                          </div>
                        )}
                      </div>
                    ))
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
                        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg p-5 text-white">
                          <p className="text-amber-100 text-sm">Total Investment</p>
                          <p className="text-2xl font-bold">
                            AED {new Intl.NumberFormat('en-AE').format(
                              clientRealEstate.reduce((sum, re) => sum + (re.investment_amount || 0), 0)
                            )}
                          </p>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg p-5 text-white">
                          <p className="text-indigo-100 text-sm">Avg Share</p>
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
              {/* Compact Summary Bar */}
              <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">Total Investment:</span>
                      <span className="font-mono font-semibold text-gray-800">{formatINR(clientHoldings.summary.total_investment)}</span>
                    </div>
                    <div className="h-4 w-px bg-gray-200"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">Total Net Expected:</span>
                      <span className="font-mono font-semibold text-emerald-600">{formatINR(clientHoldings.summary.total_expected)}</span>
                    </div>
                    <div className="h-4 w-px bg-gray-200"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">Total O/S Principal:</span>
                      <span className="font-mono font-semibold text-blue-600">{formatINR(clientHoldings.summary.total_upcoming)}</span>
                    </div>
                    <div className="h-4 w-px bg-gray-200"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">Total O/S & Pending TDS:</span>
                      <span className="font-mono font-semibold text-red-500">{formatINR(clientHoldings.summary.total_tds - clientHoldings.summary.total_repaid_tds || 0)}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="status" checked={statusFilter === 'all'} onChange={() => setStatusFilter('all')} className="text-amber-600 h-3 w-3" />
                      <span>All</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="status" checked={statusFilter === 'active'} onChange={() => setStatusFilter('active')} className="h-3 w-3" />
                      <span>Active</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="status" checked={statusFilter === 'fully_repaid'} onChange={() => setStatusFilter('fully_repaid')} className="h-3 w-3" />
                      <span>Repaid</span>
                    </label>
                  </div>
                </div>
              </div>
              
              {/* Holding Report Table */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-amber-600" />
                    <h3 className="font-semibold text-gray-800">Holding Report</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={handleDownloadExcel} className="text-amber-700 hover:text-amber-800" data-testid="download-holdings-btn">
                      <Download className="h-4 w-4 mr-2" />
                      DOWNLOAD
                    </Button>
                    <Button variant="ghost" size="sm" className="text-gray-500">
                      <Mail className="h-4 w-4 mr-2" />
                      EMAIL
                    </Button>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-2 px-2 text-[10px] font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">Scheme</th>
                        <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Investment</th>
                        <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Net Expected</th>
                        <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">O/S Principal</th>
                        <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">O/S Interest</th>
                        <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">O/S TDS</th>
                        <th className="text-center py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">XIRR</th>
                        <th className="text-center py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Status</th>
                        <th className="text-center py-2 px-1 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHoldings.map((holding) => {
                        const totalNetExpected = holding.total_principal + holding.total_interest_gross - holding.total_tds;
                        const osPrincipal = holding.total_principal - holding.repaid_principal;
                        const osInterest = holding.total_interest_gross - holding.repaid_interest;
                        const osTds = holding.total_tds - holding.repaid_tds;
                        
                        return (
                        <tr key={holding.bond_id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-2 sticky left-0 bg-white">
                            <p className="font-medium text-gray-800 text-xs truncate max-w-[120px]" title={holding.bond_name}>{holding.bond_name}</p>
                            <p className="text-[10px] text-gray-400">{holding.total_units} units</p>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-xs">{formatINR(holding.invested_amount)}</td>
                          <td className="py-2 px-2 text-right font-mono text-xs text-emerald-600">{formatINR(totalNetExpected)}</td>
                          <td className="py-2 px-2 text-right font-mono text-xs text-blue-600">{formatINR(osPrincipal)}</td>
                          <td className="py-2 px-2 text-right font-mono text-xs text-blue-600">{formatINR(osInterest)}</td>
                          <td className="py-2 px-2 text-right font-mono text-xs text-red-500">{formatINR(osTds)}</td>
                          <td className="py-2 px-2 text-center">
                            {holding.xirr !== null && holding.xirr !== undefined ? (
                              <span className={`font-mono text-xs font-semibold ${holding.xirr >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {holding.xirr.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-gray-400 text-[10px]">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${holding.status === 'fully_repaid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {holding.status === 'fully_repaid' ? 'Repaid' : 'Active'}
                            </span>
                          </td>
                          <td className="py-2 px-1 text-center relative" ref={openMenu === holding.bond_id ? menuRef : null}>
                            <button onClick={() => setOpenMenu(openMenu === holding.bond_id ? null : holding.bond_id)} className="p-0.5 hover:bg-gray-100 rounded" data-testid={`menu-btn-${holding.bond_id}`}>
                              <MoreVertical className="h-4 w-4 text-gray-400" />
                            </button>
                            
                            {openMenu === holding.bond_id && (
                              <div className="absolute right-4 top-8 z-50 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                                <button onClick={() => openCashflowModal(holding)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50" data-testid={`view-cashflows-${holding.bond_id}`}>
                                  <Eye className="h-3 w-3" />
                                  View Cashflows
                                </button>
                              </div>
                            )}
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
          
          <div className="relative bg-white rounded-xl shadow-2xl w-[90%] max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Future Cashflows</h2>
                <p className="text-sm text-gray-600">{modalData.bond_name} • {modalData.total_units} units total</p>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-white/50 rounded-full transition-colors" data-testid="close-modal-btn">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            {/* Tabs: Summary + Individual Transactions */}
            <div className="flex border-b border-gray-200 bg-gray-50 px-4 overflow-x-auto min-h-[72px]">
              {/* Summary Tab */}
              <button
                onClick={() => setActiveTab("summary")}
                className={`px-5 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                  activeTab === "summary" 
                    ? 'border-amber-600 text-amber-700 bg-white' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                data-testid="tab-summary"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4" />
                  <span>Summary by Date</span>
                </div>
                <span className="text-xs text-gray-400 block">All transactions clubbed</span>
              </button>
              
              {/* Individual Transaction Tabs */}
              {modalData.trades.map((trade, index) => (
                <button
                  key={trade.trade_id}
                  onClick={() => setActiveTab(index)}
                  className={`px-5 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                    activeTab === index 
                      ? 'border-amber-600 text-amber-700 bg-white' 
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  data-testid={`trade-tab-${index}`}
                >
                  <span className="block mb-1">{format(new Date(trade.investment_date), "MMM dd, yyyy")}</span>
                  <span className="text-xs text-gray-400 block">{trade.units} units</span>
                </button>
              ))}
            </div>
            
            {/* Tab Content */}
            <div className="flex-1 overflow-auto">
              {/* Summary Tab Content */}
              {activeTab === "summary" && (
                <div className="p-5">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 uppercase">Total Investment</p>
                      <p className="text-lg font-semibold text-gray-800">{formatINR(modalData.invested_amount)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-xs text-green-600 uppercase">Total Net Expected</p>
                      <p className="text-lg font-semibold text-green-700">
                        {formatINR(consolidatedCashflows.reduce((sum, cf) => sum + cf.net_amount, 0))}
                      </p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-xs text-blue-600 uppercase">Transactions</p>
                      <p className="text-lg font-semibold text-blue-700">{modalData.trades.length}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-4">
                      <p className="text-xs text-amber-600 uppercase">Payment Dates</p>
                      <p className="text-lg font-semibold text-amber-700">{consolidatedCashflows.length}</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-xs text-purple-600 uppercase">XIRR</p>
                      <p className="text-lg font-semibold text-purple-700">
                        {modalData.xirr !== null && modalData.xirr !== undefined ? `${modalData.xirr.toFixed(2)}%` : '-'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Outstanding Principal & Interest Section */}
                  <div className="mb-5 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Principal & Interest Breakdown
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white rounded-lg p-3 border border-slate-100">
                        <p className="text-xs text-slate-500 uppercase mb-1">Outstanding Principal</p>
                        <p className="text-lg font-semibold text-slate-800">
                          {formatINR((modalData.total_principal || 0) - (modalData.repaid_principal || 0))}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Repaid: {formatINR(modalData.repaid_principal || 0)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-slate-100">
                        <p className="text-xs text-slate-500 uppercase mb-1">Outstanding Interest</p>
                        <p className="text-lg font-semibold text-emerald-600">
                          {formatINR((modalData.total_interest_gross || 0) - (modalData.repaid_interest || 0))}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Repaid: {formatINR(modalData.repaid_interest || 0)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-slate-100">
                        <p className="text-xs text-slate-500 uppercase mb-1">Pending TDS</p>
                        <p className="text-lg font-semibold text-red-600">
                          {formatINR((modalData.total_tds || 0) - (modalData.repaid_tds || 0))}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Deducted: {formatINR(modalData.repaid_tds || 0)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-slate-100">
                        <p className="text-xs text-slate-500 uppercase mb-1">Total Outstanding</p>
                        <p className="text-lg font-semibold text-blue-600">
                          {formatINR(modalData.upcoming_expected || 0)}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Received: {formatINR(modalData.net_repaid || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Prepaid Summary (if any) */}
                  {modalData.prepaid_count > 0 && (
                    <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Check className="h-5 w-5 text-blue-600" />
                        <span className="font-semibold text-blue-800">Prepaid Bonds Detected</span>
                      </div>
                      <p className="text-sm text-blue-700">
                        {modalData.prepaid_count} payment(s) received early • Total Prepaid: {formatINR(modalData.prepaid_amount)}
                      </p>
                    </div>
                  )}
                  
                  {/* Consolidated Cashflows Table */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Repayment Date</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Transactions</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Principal</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Interest</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">TDS</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Net Amount</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consolidatedCashflows.map((cf, idx) => (
                          <tr key={idx} className={`border-b border-gray-100 ${cf.all_repaid ? 'bg-green-50' : ''}`}>
                            <td className="py-3 px-4">
                              <span className="font-mono text-sm font-medium">{format(new Date(cf.date), "MMM dd, yyyy")}</span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">
                                {cf.transactions.length} txn(s)
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm">{formatINR(cf.principal_component)}</td>
                            <td className="py-3 px-4 text-right font-mono text-sm">{formatINR(cf.interest_component)}</td>
                            <td className="py-3 px-4 text-right font-mono text-sm text-red-600">{formatINR(cf.tds_amount)}</td>
                            <td className="py-3 px-4 text-right font-mono text-sm font-medium">{formatINR(cf.net_amount)}</td>
                            <td className="py-3 px-4 text-center">
                              {cf.all_repaid ? (
                                <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                                  <Check className="h-3 w-3" /> All Repaid
                                </span>
                              ) : (
                                <span className="text-amber-600 text-xs font-medium">
                                  {cf.transactions.filter(t => t.is_repaid).length}/{cf.transactions.length} Repaid
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Summary Footer */}
                  <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end gap-8 text-sm">
                    <div>
                      <span className="text-gray-500">Total Principal:</span>
                      <span className="font-mono font-medium ml-2">{formatINR(modalData.total_principal)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Total Interest:</span>
                      <span className="font-mono font-medium ml-2">{formatINR(modalData.total_interest_gross)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Total TDS:</span>
                      <span className="font-mono font-medium ml-2 text-red-600">{formatINR(modalData.total_tds)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Upcoming:</span>
                      <span className="font-mono font-medium ml-2 text-blue-600">{formatINR(modalData.upcoming_expected)}</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Individual Transaction Tab Content */}
              {typeof activeTab === 'number' && modalData.trades[activeTab] && (
                <div className="p-5">
                  {/* Transaction Summary */}
                  <div className="px-4 py-3 bg-amber-50/50 border border-amber-100 rounded-lg mb-5 flex items-center justify-between flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-6">
                      <div>
                        <span className="text-gray-500">Purchase Date:</span>
                        <span className="font-medium ml-2">{format(new Date(modalData.trades[activeTab].investment_date), "MMMM dd, yyyy")}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Units:</span>
                        <span className="font-medium ml-2">{modalData.trades[activeTab].units}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Invested:</span>
                        <span className="font-medium ml-2">{formatINR(modalData.trades[activeTab].invested_amount)}</span>
                      </div>
                      {modalData.trades[activeTab].xirr !== null && modalData.trades[activeTab].xirr !== undefined && (
                        <div>
                          <span className="text-gray-500">XIRR:</span>
                          <span className={`font-medium ml-2 ${modalData.trades[activeTab].xirr >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {modalData.trades[activeTab].xirr.toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                    {modalData.trades[activeTab].prepaid_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-blue-700 text-xs font-medium bg-blue-100 px-2 py-1 rounded">
                        {modalData.trades[activeTab].prepaid_count} Prepaid
                      </span>
                    )}
                  </div>
                  
                  {/* Amended Interest Notice */}
                  {modalData.trades[activeTab].cashflows.some(cf => cf.is_amended) && (
                    <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="flex items-center gap-2 text-orange-800 text-sm font-medium">
                        <AlertCircle className="h-4 w-4" />
                        Interest Amended Due to Principal Prepayment
                      </div>
                      <p className="text-xs text-orange-600 mt-1">
                        Some interest payments have been recalculated based on reduced outstanding principal. Original amounts shown in brackets.
                      </p>
                    </div>
                  )}
                  
                  {/* Cashflow Table for this transaction */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Principal</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Interest</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">TDS</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Net Amount</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Tentative Date</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actual Paid</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalData.trades[activeTab].cashflows.map((cf) => (
                          <tr key={cf.id} className={`border-b border-gray-100 ${cf.is_amended ? 'bg-orange-50' : cf.is_prepaid ? 'bg-blue-50' : cf.is_repaid ? 'bg-green-50' : ''}`}>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${cf.type === 'interest' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                  {cf.type === 'interest' ? 'Interest' : 'Principal'}
                                </span>
                                {cf.is_amended && (
                                  <span className="inline-block px-1.5 py-0.5 text-xs font-medium rounded bg-orange-200 text-orange-700" title={cf.amendment_reason}>
                                    Amended
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm">{formatINR(cf.principal_component)}</td>
                            <td className="py-3 px-4 text-right font-mono text-sm">
                              {cf.is_amended && cf.original_interest_component ? (
                                <div>
                                  <span className="font-medium">{formatINR(cf.interest_component)}</span>
                                  <span className="text-xs text-gray-400 line-through block">({formatINR(cf.original_interest_component)})</span>
                                </div>
                              ) : (
                                formatINR(cf.interest_component)
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm text-red-600">
                              {cf.is_amended && cf.original_tds_amount ? (
                                <div>
                                  <span>{formatINR(cf.tds_amount)}</span>
                                  <span className="text-xs text-gray-400 line-through block">({formatINR(cf.original_tds_amount)})</span>
                                </div>
                              ) : (
                                formatINR(cf.tds_amount)
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm font-medium">
                              {cf.is_amended && cf.original_net_amount ? (
                                <div>
                                  <span>{formatINR(cf.net_amount)}</span>
                                  <span className="text-xs text-gray-400 line-through block">({formatINR(cf.original_net_amount)})</span>
                                </div>
                              ) : (
                                formatINR(cf.net_amount)
                              )}
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-sm text-gray-600">
                              {format(new Date(cf.date), "MMM dd, yyyy")}
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-sm">
                              {cf.is_repaid && cf.repaid_date ? (
                                <span className={cf.is_prepaid ? 'text-blue-600 font-medium' : 'text-green-600'}>
                                  {format(new Date(cf.repaid_date), "MMM dd, yyyy")}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {cf.is_prepaid ? (
                                <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-medium bg-blue-100 px-2 py-0.5 rounded">
                                  <Check className="h-3 w-3" /> Prepaid
                                  {cf.days_early > 0 && <span className="text-blue-500">({cf.days_early}d early)</span>}
                                </span>
                              ) : cf.is_repaid ? (
                                <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                                  <Check className="h-3 w-3" /> Repaid
                                </span>
                              ) : cf.is_amended ? (
                                <span className="text-orange-600 text-xs font-medium">Amended</span>
                              ) : (
                                <span className="text-amber-600 text-xs font-medium">Pending</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMarkRepaid(cf.id, !cf.is_repaid)}
                                  className={`text-xs ${cf.is_repaid ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}`}
                                  data-testid={`mark-repaid-${cf.id}`}
                                >
                                  {cf.is_repaid ? <><X className="h-3 w-3 mr-1" /> Undo</> : <><Check className="h-3 w-3 mr-1" /> Repaid</>}
                                </Button>
                                {cf.is_amended && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRevertAmendment(cf.id)}
                                    className="text-xs text-orange-600 hover:text-orange-700"
                                    title="Revert to original amount"
                                  >
                                    Revert
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Record Prepayment Button */}
                  <div className="mt-4 flex justify-between items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPrepaymentModal(modalData.trades[activeTab])}
                      className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                    >
                      <DollarSign className="h-4 w-4" />
                      Record Principal Prepayment
                    </Button>
                  </div>
                  
                  {/* Transaction Summary Footer */}
                  <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end gap-8 text-sm">
                    <div>
                      <span className="text-gray-500">Total Principal:</span>
                      <span className="font-mono font-medium ml-2">
                        {formatINR(modalData.trades[activeTab].cashflows.reduce((sum, cf) => sum + cf.principal_component, 0))}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Total Interest:</span>
                      <span className="font-mono font-medium ml-2">
                        {formatINR(modalData.trades[activeTab].cashflows.reduce((sum, cf) => sum + cf.interest_component, 0))}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Total TDS:</span>
                      <span className="font-mono font-medium ml-2 text-red-600">
                        {formatINR(modalData.trades[activeTab].cashflows.reduce((sum, cf) => sum + cf.tds_amount, 0))}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Total Net:</span>
                      <span className="font-mono font-medium ml-2 text-green-600">
                        {formatINR(modalData.trades[activeTab].cashflows.reduce((sum, cf) => sum + cf.net_amount, 0))}
                      </span>
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
    </div>
  );
}
