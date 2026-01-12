import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Search, Download, Mail, Check, X, FileText, Users, TrendingUp, DollarSign, MoreVertical, Eye, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import { format } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Holdings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientHoldings, setClientHoldings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openMenu, setOpenMenu] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [activeTab, setActiveTab] = useState("summary"); // "summary" or trade index
  const menuRef = useRef(null);

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
      const response = await axios.get(`${API}/holdings/client/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClientHoldings(response.data);
    } catch (error) {
      console.error("Error fetching holdings:", error);
      toast.error("Failed to load holdings");
    } finally {
      setLoadingHoldings(false);
    }
  };

  const handleClientSelect = (client) => {
    setSelectedClient(client);
    fetchClientHoldings(client.id);
  };

  const handleMarkRepaid = async (cashflowId, isRepaid) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/holdings/cashflow/${cashflowId}/mark-repaid`, 
        { is_repaid: isRepaid },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success(isRepaid ? "Marked as repaid" : "Marked as pending");
      if (selectedClient) {
        fetchClientHoldings(selectedClient.id);
      }
    } catch (error) {
      console.error("Error updating cashflow:", error);
      toast.error("Failed to update repayment status");
    }
  };

  const handleDownloadCSV = async () => {
    if (!selectedClient) return;
    
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/holdings/client/${selectedClient.id}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const blob = new Blob([response.data.csv_content], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.data.filename;
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
      
      consolidated[bondId].trades.push({
        trade_id: holding.trade_id,
        units: holding.units,
        investment_date: holding.investment_date,
        invested_amount: holding.invested_amount,
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
    if (amount >= 10000000) {
      return `₹ ${(amount / 10000000).toFixed(2)} Cr`;
    } else if (amount >= 100000) {
      return `₹ ${(amount / 100000).toFixed(2)} L`;
    }
    return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (!user) return null;

  const SidebarComponent = user.role === 'broker' ? Sidebar : SubBrokerSidebar;
  const consolidatedCashflows = modalData ? getConsolidatedCashflowsByDate(modalData.trades) : [];

  return (
    <div className="flex h-screen bg-gray-50">
      <SidebarComponent user={user} />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Client List Panel */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                data-testid="search-investor"
                placeholder="Search Investor"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500">Loading...</div>
            ) : filteredClients.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No investors found</div>
            ) : (
              filteredClients.map((client) => (
                <div
                  key={client.id}
                  data-testid={`client-item-${client.id}`}
                  onClick={() => handleClientSelect(client)}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedClient?.id === client.id ? 'bg-amber-50 border-l-4 border-l-amber-600' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-medium ${selectedClient?.id === client.id ? 'text-amber-700' : 'text-gray-800'}`}>
                        {client.name}
                      </p>
                      <p className="text-xs text-gray-500 font-mono">({client.pan_number})</p>
                    </div>
                    <FileText className="h-4 w-4 text-gray-400" />
                  </div>
                  {client.total_investment > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      {formatINR(client.total_investment)} invested
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
                <button className="pb-3 border-b-2 border-amber-600 text-amber-700 font-medium">
                  Holdings
                </button>
                <button className="pb-3 text-gray-500 hover:text-gray-700">
                  Profile
                </button>
              </div>
              
              {/* Overview Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="h-5 w-5 text-amber-600" />
                    <h3 className="font-semibold text-gray-800">Overview</h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Investment</span>
                      <span className="font-mono font-medium">{formatINR(clientHoldings.summary.total_investment)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Repaid (Net)</span>
                      <span className="font-mono font-medium text-green-600">{formatINR(clientHoldings.summary.total_repaid)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Upcoming (Expected)</span>
                      <span className="font-mono font-medium text-blue-600">{formatINR(clientHoldings.summary.total_upcoming)}</span>
                    </div>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Allocation</p>
                    <div className="flex items-center gap-4">
                      <div className="relative w-20 h-20">
                        <svg viewBox="0 0 36 36" className="w-20 h-20 transform -rotate-90">
                          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f3f4f6" strokeWidth="3" />
                          <circle 
                            cx="18" cy="18" r="15.5" fill="none" 
                            stroke="#92400e" strokeWidth="3"
                            strokeDasharray={`${(clientHoldings.summary.total_repaid / clientHoldings.summary.total_expected) * 97.5} 97.5`}
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Total Expected</p>
                        <p className="text-xl font-bold text-gray-800">{formatINR(clientHoldings.summary.total_expected)}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-5 w-5 text-amber-600" />
                    <h3 className="font-semibold text-gray-800">Investment by Asset Class</h3>
                  </div>
                  
                  <div className="flex items-center gap-8">
                    <div className="relative w-32 h-32">
                      <svg viewBox="0 0 36 36" className="w-32 h-32 transform -rotate-90">
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f3f4f6" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#92400e" strokeWidth="3" strokeDasharray="97.5 97.5" />
                      </svg>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-amber-700"></div>
                        <span className="text-sm text-gray-600">Corporate Debt</span>
                        <span className="font-mono text-sm font-medium">{formatINR(clientHoldings.summary.total_investment)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-gray-300"></div>
                        <span className="text-sm text-gray-400">Asset Backed Leasing</span>
                        <span className="font-mono text-sm text-gray-400">₹ 0</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                        <span className="text-sm text-gray-400">Invoice Discounting</span>
                        <span className="font-mono text-sm text-gray-400">₹ 0</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                        <span className="text-sm text-gray-400">Venture Debt</span>
                        <span className="font-mono text-sm text-gray-400">₹ 0</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="status" checked={statusFilter === 'all'} onChange={() => setStatusFilter('all')} className="text-amber-600" />
                      <span className="text-sm">All</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="status" checked={statusFilter === 'active'} onChange={() => setStatusFilter('active')} />
                      <span className="text-sm">Active</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="status" checked={statusFilter === 'fully_repaid'} onChange={() => setStatusFilter('fully_repaid')} />
                      <span className="text-sm">Fully repaid</span>
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
                    <Button variant="ghost" size="sm" onClick={handleDownloadCSV} className="text-amber-700 hover:text-amber-800" data-testid="download-holdings-btn">
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
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Scheme Name</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Invested Amount</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Principal Amount</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Interest Amount</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">TDS Amount</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Net Repaid</th>
                        <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHoldings.map((holding) => (
                        <tr key={holding.bond_id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-4 px-4">
                            <p className="font-medium text-gray-800">{holding.bond_name}</p>
                            <p className="text-xs text-gray-500">{holding.total_units} units • {holding.trades.length} transaction(s)</p>
                          </td>
                          <td className="py-4 px-4 text-right font-mono text-sm">{formatINR(holding.invested_amount)}</td>
                          <td className="py-4 px-4 text-right font-mono text-sm">{formatINR(holding.repaid_principal)}</td>
                          <td className="py-4 px-4 text-right font-mono text-sm">{formatINR(holding.repaid_interest)}</td>
                          <td className="py-4 px-4 text-right font-mono text-sm">{formatINR(holding.repaid_tds)}</td>
                          <td className="py-4 px-4 text-right font-mono text-sm text-green-600">{formatINR(holding.net_repaid)}</td>
                          <td className="py-4 px-4 text-center">
                            <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${holding.status === 'fully_repaid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {holding.status === 'fully_repaid' ? 'Fully Repaid' : 'Active'}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-center relative" ref={openMenu === holding.bond_id ? menuRef : null}>
                            <button onClick={() => setOpenMenu(openMenu === holding.bond_id ? null : holding.bond_id)} className="p-1 hover:bg-gray-100 rounded" data-testid={`menu-btn-${holding.bond_id}`}>
                              <MoreVertical className="h-5 w-5 text-gray-500" />
                            </button>
                            
                            {openMenu === holding.bond_id && (
                              <div className="absolute right-4 top-12 z-50 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                                <button onClick={() => openCashflowModal(holding)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" data-testid={`view-cashflows-${holding.bond_id}`}>
                                  <Eye className="h-4 w-4" />
                                  View Future Cashflows
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {filteredHoldings.length === 0 && (
                    <div className="p-8 text-center text-gray-500">No holdings found for selected filter</div>
                  )}
                </div>
              </div>
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
            <div className="flex border-b border-gray-200 bg-gray-50 px-4 overflow-x-auto">
              {/* Summary Tab */}
              <button
                onClick={() => setActiveTab("summary")}
                className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === "summary" 
                    ? 'border-amber-600 text-amber-700 bg-white' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                data-testid="tab-summary"
              >
                <div className="flex items-center gap-2">
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
                  className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === index 
                      ? 'border-amber-600 text-amber-700 bg-white' 
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  data-testid={`trade-tab-${index}`}
                >
                  <span className="block">{format(new Date(trade.investment_date), "MMM dd, yyyy")}</span>
                  <span className="text-xs text-gray-400">{trade.units} units</span>
                </button>
              ))}
            </div>
            
            {/* Tab Content */}
            <div className="flex-1 overflow-auto">
              {/* Summary Tab Content */}
              {activeTab === "summary" && (
                <div className="p-5">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-4 gap-4 mb-5">
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
                  </div>
                  
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
                  <div className="px-4 py-3 bg-amber-50/50 border border-amber-100 rounded-lg mb-5 flex items-center gap-6 text-sm">
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
                  </div>
                  
                  {/* Cashflow Table for this transaction */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Principal</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Interest</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">TDS</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Net Amount</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalData.trades[activeTab].cashflows.map((cf) => (
                          <tr key={cf.id} className={`border-b border-gray-100 ${cf.is_repaid ? 'bg-green-50' : ''}`}>
                            <td className="py-3 px-4 font-mono text-sm">{format(new Date(cf.date), "MMM dd, yyyy")}</td>
                            <td className="py-3 px-4">
                              <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${cf.type === 'interest' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                {cf.type === 'interest' ? 'Interest' : 'Principal'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm">{formatINR(cf.principal_component)}</td>
                            <td className="py-3 px-4 text-right font-mono text-sm">{formatINR(cf.interest_component)}</td>
                            <td className="py-3 px-4 text-right font-mono text-sm text-red-600">{formatINR(cf.tds_amount)}</td>
                            <td className="py-3 px-4 text-right font-mono text-sm font-medium">{formatINR(cf.net_amount)}</td>
                            <td className="py-3 px-4 text-center">
                              {cf.is_repaid ? (
                                <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                                  <Check className="h-3 w-3" /> Repaid
                                </span>
                              ) : (
                                <span className="text-amber-600 text-xs font-medium">Pending</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMarkRepaid(cf.id, !cf.is_repaid)}
                                className={`text-xs ${cf.is_repaid ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}`}
                                data-testid={`mark-repaid-${cf.id}`}
                              >
                                {cf.is_repaid ? <><X className="h-3 w-3 mr-1" /> Undo</> : <><Check className="h-3 w-3 mr-1" /> Mark Repaid</>}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
    </div>
  );
}
