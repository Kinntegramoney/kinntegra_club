import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  RefreshCw, Search, Building2, User, ChevronDown, Download, Mail,
  Eye, MapPin, CreditCard, FileText
} from "lucide-react";
import REBrokerSidebar from "@/components/REBrokerSidebar";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const formatCurrency = (amount, currency = 'AED') => {
  if (!amount) return `${currency} 0`;
  const num = Number(amount);
  if (num >= 10000000) {
    return `${currency} ${(num / 10000000).toFixed(2)} Cr`;
  } else if (num >= 100000) {
    return `${currency} ${(num / 100000).toFixed(2)} L`;
  }
  return `${currency} ${num.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
};

const formatNumber = (amount) => {
  if (!amount) return '0';
  return Number(amount).toLocaleString('en-AE', { maximumFractionDigits: 2 });
};

export default function REBrokerHoldings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [brokerProfile, setBrokerProfile] = useState(null);
  const [investors, setInvestors] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [selectedInvestor, setSelectedInvestor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("real_estate");
  const [holdingFilter, setHoldingFilter] = useState("all");
  const dropdownRef = useRef(null);

  useEffect(() => {
    document.title = "Kinntegraa | RE Broker - Holdings";
    
    const userData = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    
    if (!userData || !token) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "re_broker") {
      navigate("/login");
      return;
    }
    
    setUser(parsedUser);
    fetchBrokerProfile(token);
    fetchInvestors(token);
    fetchHoldings(token);
  }, [navigate]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchBrokerProfile = async (token) => {
    try {
      const response = await axios.get(`${API}/re-broker/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBrokerProfile(response.data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const fetchInvestors = async (token) => {
    try {
      const tkn = token || localStorage.getItem("token");
      const response = await axios.get(`${API}/re-broker/private-investors`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      setInvestors(response.data || []);
    } catch (error) {
      console.error("Error fetching investors:", error);
      setInvestors([]);
    }
  };

  const fetchHoldings = useCallback(async (token) => {
    setLoading(true);
    try {
      const tkn = token || localStorage.getItem("token");
      const response = await axios.get(`${API}/re-broker/holdings`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      const data = response.data;
      setHoldings(Array.isArray(data) ? data : (data?.holdings || []));
    } catch (error) {
      console.error("Error fetching holdings:", error);
      setHoldings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const getInvestorTotalInvestment = (investorId, investorName) => {
    return holdings
      .filter(h => h.investor_id === investorId || h.investor_name === investorName)
      .reduce((sum, h) => sum + (h.investment_amount || 0), 0);
  };

  const filteredInvestors = investors
    .map(inv => ({
      ...inv,
      totalInvestment: getInvestorTotalInvestment(inv.id, inv.name)
    }))
    .filter(inv => {
      const query = searchQuery.toLowerCase();
      return (
        inv.name?.toLowerCase().includes(query) ||
        inv.email?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => b.totalInvestment - a.totalInvestment);

  const investorHoldings = selectedInvestor
    ? holdings.filter(h => h.investor_id === selectedInvestor.id || h.investor_name === selectedInvestor.name)
    : [];

  // Apply filter
  const filteredHoldings = investorHoldings.filter(h => {
    if (holdingFilter === "all") return true;
    if (holdingFilter === "active") return h.status !== "completed" && h.status !== "sold";
    if (holdingFilter === "completed") return h.status === "completed" || h.status === "sold";
    return true;
  });

  // Calculate totals
  const totalInvestment = investorHoldings.reduce((sum, h) => sum + (h.investment_amount || 0), 0);
  const totalGrossExpected = investorHoldings.reduce((sum, h) => sum + (h.expected_sale_amount || 0), 0);
  const totalGrossProfit = investorHoldings.reduce((sum, h) => sum + (h.profit || 0), 0);
  const totalPaid = investorHoldings.reduce((sum, h) => sum + (h.paid_amount || 0), 0);
  const totalOutstanding = totalInvestment - totalPaid;
  const paidPercentage = totalInvestment > 0 ? (totalPaid / totalInvestment) * 100 : 0;

  const handleSelectInvestor = (investor) => {
    setSelectedInvestor(investor);
    setDropdownOpen(false);
    setSearchQuery("");
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <REBrokerSidebar user={user} brokerProfile={brokerProfile} />
      
      <div className="flex-1 md:ml-0 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-6 ml-12 md:ml-0">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-800">Holdings</h1>
                <p className="text-sm text-gray-500 mt-1">View investor real estate holdings</p>
              </div>
              
              {/* Investor Dropdown - positioned near Holdings title */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg hover:border-gray-400 transition-colors min-w-[220px]"
                  data-testid="investor-dropdown"
                >
                  <span className="flex-1 text-left text-gray-700 truncate">
                    {selectedInvestor ? selectedInvestor.name : "Select an investor"}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {dropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-[380px] overflow-hidden">
                    {/* Search Input */}
                    <div className="p-3 border-b border-gray-100">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          type="text"
                          placeholder="Search investors..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9 h-9"
                          autoFocus
                        />
                      </div>
                    </div>

                    {/* All Investors Filter */}
                    <div className="px-3 py-2 border-b border-gray-100">
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                        <span className="text-gray-600">All Investors</span>
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>

                    {/* Investors List */}
                    <div className="max-h-[350px] overflow-y-auto">
                      {filteredInvestors.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">No investors found</div>
                      ) : (
                        filteredInvestors.map((investor) => (
                          <div
                            key={investor.id}
                            className={`flex items-center justify-between px-4 py-3 cursor-pointer border-b border-gray-50 hover:bg-gray-50 ${
                              selectedInvestor?.id === investor.id ? 'bg-amber-50' : ''
                            }`}
                            onClick={() => handleSelectInvestor(investor)}
                          >
                            <div className="flex items-center gap-3">
                              <User className="h-4 w-4 text-gray-400" />
                              <div>
                                <span className="font-semibold text-gray-800">{investor.name}</span>
                                <span className="text-gray-400 text-sm ml-2">({investor.pan || 'N/A'})</span>
                              </div>
                            </div>
                            <span className={`text-sm font-medium ${investor.totalInvestment > 0 ? 'text-gray-700' : 'text-gray-400'}`}>
                              {investor.totalInvestment > 0 ? formatCurrency(investor.totalInvestment) : '—'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <Button variant="outline" onClick={() => { fetchInvestors(); fetchHoldings(); }} data-testid="refresh-btn">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-4 md:p-8">
          {!selectedInvestor ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <User className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">Select an investor to view holdings</p>
                <p className="text-gray-400 text-sm mt-2">Use the dropdown above to choose an investor</p>
              </div>
            </div>
          ) : (
            <div>
              {/* Tabs */}
              <div className="flex items-center gap-6 border-b border-gray-200 mb-6">
                <button
                  onClick={() => setActiveTab("real_estate")}
                  className={`flex items-center gap-2 pb-3 px-1 border-b-2 transition-colors ${
                    activeTab === "real_estate"
                      ? "border-amber-500 text-amber-600 font-medium"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="tab-real-estate"
                >
                  <Building2 className="h-4 w-4" />
                  Real Estate
                </button>
                <button
                  onClick={() => setActiveTab("profile")}
                  className={`flex items-center gap-2 pb-3 px-1 border-b-2 transition-colors ${
                    activeTab === "profile"
                      ? "border-amber-500 text-amber-600 font-medium"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="tab-profile"
                >
                  <User className="h-4 w-4" />
                  Profile
                </button>
              </div>

              {/* Real Estate Tab */}
              {activeTab === "real_estate" && (
                <div>
                  {/* Summary Row */}
                  <div className="flex items-center gap-8 mb-4 text-sm">
                    <div>
                      <span className="text-gray-500">Total Investment: </span>
                      <span className="font-semibold text-gray-800">{formatCurrency(totalInvestment)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Total Gross Expected: </span>
                      <span className="font-semibold text-green-600">{formatCurrency(totalGrossExpected)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Total Gross Profit: </span>
                      <span className="font-semibold text-emerald-600">{formatCurrency(totalGrossProfit)}</span>
                    </div>
                  </div>

                  {/* Repayment Status Bar */}
                  <div className="flex items-center gap-4 mb-6">
                    <span className="text-sm text-gray-500">Repayment Status:</span>
                    <div className="flex-1 max-w-md h-4 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full"
                        style={{ width: `${Math.min(paidPercentage, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Received: {formatCurrency(totalPaid)} ({paidPercentage.toFixed(0)}%)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        Outstanding: {formatCurrency(totalOutstanding)} ({(100 - paidPercentage).toFixed(0)}%)
                      </span>
                      <span className="font-medium">Total: {formatCurrency(totalInvestment)}</span>
                    </div>
                  </div>

                  {/* Holding Report Section */}
                  <div className="bg-white rounded-lg border border-gray-200">
                    {/* Report Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-gray-500" />
                          <span className="font-semibold text-gray-800">Holding Report</span>
                        </div>
                        <div className="flex items-center gap-4 ml-6">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="holdingFilter"
                              checked={holdingFilter === "all"}
                              onChange={() => setHoldingFilter("all")}
                              className="w-4 h-4 text-amber-500"
                            />
                            <span className="text-sm text-gray-600">All</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="holdingFilter"
                              checked={holdingFilter === "active"}
                              onChange={() => setHoldingFilter("active")}
                              className="w-4 h-4 text-amber-500"
                            />
                            <span className="text-sm text-gray-600">Active</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="holdingFilter"
                              checked={holdingFilter === "completed"}
                              onChange={() => setHoldingFilter("completed")}
                              className="w-4 h-4 text-amber-500"
                            />
                            <span className="text-sm text-gray-600">Completed</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" className="text-amber-600 hover:text-amber-700">
                          <Download className="h-4 w-4 mr-1" />
                          DOWNLOAD
                        </Button>
                        <Button variant="ghost" size="sm" className="text-amber-600 hover:text-amber-700">
                          <Mail className="h-4 w-4 mr-1" />
                          EMAIL
                        </Button>
                      </div>
                    </div>

                    {/* Holdings Table */}
                    {filteredHoldings.length === 0 ? (
                      <div className="p-12 text-center">
                        <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No holdings found for this investor</p>
                      </div>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left py-3 px-6 text-xs font-medium text-gray-500 uppercase">Scheme</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Investment</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Repaid</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Gross Expected</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Profit</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Expected XIRR</th>
                            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredHoldings.map((holding) => (
                            <tr key={holding.id} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="py-4 px-6">
                                <div>
                                  <p className="font-medium text-gray-800">{holding.building_name}</p>
                                  <p className="text-xs text-gray-500">Unit {holding.unit_no}</p>
                                </div>
                              </td>
                              <td className="py-4 px-4 text-right font-medium">{formatNumber(holding.investment_amount)}</td>
                              <td className="py-4 px-4 text-right">
                                <span className="text-green-600">{formatNumber(holding.paid_amount || 0)}</span>
                                <p className="text-xs text-gray-400">
                                  P: {formatNumber(holding.paid_amount || 0)} | I: 0
                                </p>
                              </td>
                              <td className="py-4 px-4 text-right">
                                <span className="text-green-600">{formatNumber(holding.expected_sale_amount || 0)}</span>
                                <p className="text-xs text-gray-400">
                                  P: {formatNumber((holding.expected_sale_amount || 0) - (holding.profit || 0))} | I: {formatNumber(holding.profit || 0)}
                                </p>
                              </td>
                              <td className="py-4 px-4 text-right text-green-600 font-medium">
                                {formatNumber(holding.profit || 0)}
                              </td>
                              <td className="py-4 px-4 text-right text-blue-600 font-medium">
                                {holding.expected_xirr || 0}%
                              </td>
                              <td className="py-4 px-4 text-center">
                                <div className="inline-flex flex-col items-center">
                                  <span className={`px-2 py-1 text-xs rounded ${
                                    holding.status === 'funded' || holding.status === 'fully_invested'
                                      ? 'bg-amber-100 text-amber-700'
                                      : holding.status === 'completed' || holding.status === 'sold'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {holding.status === 'funded' ? 'Partly Prepaid' : 
                                     holding.status === 'completed' ? 'Completed' : 'Active'}
                                  </span>
                                  <span className="text-xs text-gray-400 mt-1">
                                    Gross Expected, Profit & XIRR may vary
                                  </span>
                                </div>
                              </td>
                              <td className="py-4 px-4 text-center">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => navigate(`/re-broker/opportunities/${holding.property_id}`)}
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  View Details
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}


              {/* Profile Tab */}
              {activeTab === "profile" && (
                <div className="space-y-6">
                  {/* Personal Details */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center gap-2 mb-6">
                      <User className="h-5 w-5 text-gray-400" />
                      <h3 className="font-semibold text-gray-800">Personal Details</h3>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Full Name</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.name || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">PAN Number</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.pan || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Date of Birth</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.date_of_birth || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Father/Husband Name</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.father_name || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Occupation</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.occupation || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Demat Account No.</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.demat_account || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Email</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.email || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Mobile</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.phone || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Country of Residency</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.country_of_residency || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Passport Type</p>
                        <p className="font-medium text-gray-800 capitalize">{selectedInvestor.passport_type || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Address Details */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center gap-2 mb-6">
                      <MapPin className="h-5 w-5 text-gray-400" />
                      <h3 className="font-semibold text-gray-800">Address Details</h3>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Address Line 1</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.address || selectedInvestor.address_line1 || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Address Line 2</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.address_line2 || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">City</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.city || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">State</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.state || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Pincode</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.pincode || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Country</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.country || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Bank Details */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center gap-2 mb-6">
                      <CreditCard className="h-5 w-5 text-gray-400" />
                      <h3 className="font-semibold text-gray-800">Bank Details</h3>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Bank Name</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.bank_name || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Account Number</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.account_number || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Branch</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.branch || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">IFSC Code</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.ifsc_code || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Account Type</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.account_type || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Passport Details */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-gray-400" />
                        <h3 className="font-semibold text-gray-800">Passport Details</h3>
                      </div>
                      {selectedInvestor.passport_type && (
                        <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs rounded-full capitalize">
                          {selectedInvestor.passport_type}
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Passport Number</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.passport_number || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Valid From</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.passport_valid_from || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Valid Until</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.passport_valid_until || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Country of Issue</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.passport_country_of_issue || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Country of Residency</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.country_of_residency || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Emirates ID (for UAE residents) */}
                  {selectedInvestor.emirates_id && (
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                      <div className="flex items-center gap-2 mb-6">
                        <CreditCard className="h-5 w-5 text-gray-400" />
                        <h3 className="font-semibold text-gray-800">Emirates ID</h3>
                      </div>
                      
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Emirates ID Number</p>
                        <p className="font-medium text-gray-800">{selectedInvestor.emirates_id}</p>
                      </div>
                    </div>
                  )}

                  {/* Linked Agent */}
                  {selectedInvestor.linked_agent_name && (
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                      <div className="flex items-center gap-2 mb-6">
                        <User className="h-5 w-5 text-gray-400" />
                        <h3 className="font-semibold text-gray-800">Linked Agent</h3>
                      </div>
                      
                      <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                        <div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium">
                          {selectedInvestor.linked_agent_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium text-blue-800">{selectedInvestor.linked_agent_name}</p>
                          <p className="text-sm text-blue-600">Real Estate Agent</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
