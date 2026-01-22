import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { Wallet, TrendingUp, Calendar, Download, ChevronDown, ChevronUp, Check, Clock, X, Building2, MapPin, Percent, ChevronRight, ClipboardList, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ClientHoldings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [holdings, setHoldings] = useState(null);
  const [realEstateHoldings, setRealEstateHoldings] = useState([]);
  const [clientTrades, setClientTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHolding, setSelectedHolding] = useState(null);
  const [showCashflowModal, setShowCashflowModal] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");
  const [mainTab, setMainTab] = useState("bonds");

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "client") {
      navigate("/login");
      return;
    }
    
    setUser(parsedUser);
    fetchHoldings();
    fetchRealEstateHoldings();
    fetchClientTrades();
  }, [navigate]);

  const fetchHoldings = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/holdings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHoldings(response.data);
    } catch (error) {
      console.error("Error fetching holdings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRealEstateHoldings = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/real-estate-investments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRealEstateHoldings(response.data || []);
    } catch (error) {
      console.error("Error fetching real estate holdings:", error);
    }
  };

  const fetchClientTrades = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/trades`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClientTrades(response.data || []);
    } catch (error) {
      console.error("Error fetching client trades:", error);
    }
  };

  const formatINR = (amount) => {
    return `₹ ${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatAED = (amount) => {
    return `AED ${(amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const handleDownload = async () => {
    try {
      const token = localStorage.getItem("token");
      const userData = JSON.parse(localStorage.getItem("user"));
      
      // Get client_id from user
      const profileRes = await axios.get(`${API}/client/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const response = await axios.get(
        `${API}/holdings/client/${profileRes.data.client.id}/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `holdings_${userData.name.replace(/\s+/g, '_')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Holdings report downloaded");
    } catch (error) {
      console.error("Error downloading:", error);
      toast.error("Failed to download report");
    }
  };

  const viewCashflows = (holding) => {
    setSelectedHolding(holding);
    setActiveTab("summary");
    setShowCashflowModal(true);
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <ClientSidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800" data-testid="page-title">
                My Holdings
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Track your investments and cashflows
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={!holdings || holdings.holdings?.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download Report
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading holdings...</div>
          ) : (
            <>
              {/* Header Tabs - Same style as broker Holdings */}
              <div className="flex items-center gap-6 mb-6 border-b border-gray-200">
                <button 
                  onClick={() => setMainTab("bonds")}
                  className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
                    mainTab === "bonds" 
                      ? "border-amber-600 text-amber-700" 
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="tab-bonds"
                >
                  <Wallet className="h-4 w-4" />
                  Bonds
                  {holdings?.holdings?.length > 0 && (
                    <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-700">{holdings.holdings.length}</Badge>
                  )}
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
                  Trades
                  {clientTrades.length > 0 && (
                    <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-700">{clientTrades.length}</Badge>
                  )}
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
                  Real Estate
                  {realEstateHoldings.length > 0 && (
                    <Badge variant="secondary" className="ml-1 bg-teal-100 text-teal-700">{realEstateHoldings.length}</Badge>
                  )}
                </button>
              </div>

              {/* Bonds Tab */}
              {mainTab === "bonds" && (
                !holdings || holdings.holdings?.length === 0 ? (
                  <div className="text-center py-12">
                    <Wallet className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No bond holdings yet</p>
                    <Button
                      className="mt-4 bg-teal-600 hover:bg-teal-700"
                      onClick={() => navigate("/client/opportunities")}
                    >
                      Browse Bond Opportunities
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-white rounded-lg border border-gray-200 p-5">
                        <p className="text-sm text-gray-500 uppercase tracking-wide">Total Investment</p>
                        <p className="text-2xl font-bold text-gray-800 mt-1">
                          {formatINR(holdings.summary?.total_investment)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-200 p-5">
                        <p className="text-sm text-gray-500 uppercase tracking-wide">Total Repaid (Net)</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">
                    {formatINR(holdings.summary?.total_repaid)}
                  </p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <p className="text-sm text-gray-500 uppercase tracking-wide">Upcoming (Expected)</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">
                    {formatINR(holdings.summary?.total_upcoming)}
                  </p>
                </div>
              </div>

              {/* Holdings Table */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Bond Name</th>
                        <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Units</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Invested</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Repaid</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Upcoming</th>
                        <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.holdings?.map((holding) => (
                        <tr key={holding.trade_id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <span className="font-medium text-gray-800">{holding.bond_name}</span>
                            <br />
                            <span className="text-xs text-gray-500">
                              Invested: {format(new Date(holding.investment_date), "MMM dd, yyyy")}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono">{holding.units}</td>
                          <td className="py-3 px-4 text-right font-mono">{formatINR(holding.invested_amount)}</td>
                          <td className="py-3 px-4 text-right font-mono text-green-600">{formatINR(holding.total_repaid)}</td>
                          <td className="py-3 px-4 text-right font-mono text-blue-600">{formatINR(holding.total_upcoming)}</td>
                          <td className="py-3 px-4 text-center">
                            {holding.status === 'completed' ? (
                              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                                Completed
                              </span>
                            ) : (
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => viewCashflows(holding)}
                            >
                              View Cashflows
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
                  </>
                )
              )}

              {/* Trades Tab */}
              {mainTab === "trades" && (
                clientTrades.length === 0 ? (
                  <div className="text-center py-12">
                    <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No trades found</p>
                    <p className="text-sm text-gray-400 mt-2">Your bond trades will appear here</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Bond</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Units</th>
                            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {clientTrades.map((trade) => (
                            <tr key={trade.id} className="hover:bg-gray-50">
                              <td className="py-3 px-4">
                                <p className="text-sm text-gray-800">
                                  {trade.trade_date ? format(new Date(trade.trade_date), "MMM dd, yyyy") : '-'}
                                </p>
                              </td>
                              <td className="py-3 px-4">
                                <p className="font-medium text-gray-800">{trade.bond_name || '-'}</p>
                              </td>
                              <td className="py-3 px-4">
                                <Badge className={trade.trade_type === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                                  {trade.trade_type === 'buy' ? 'Buy' : 'Sell'}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <p className="font-mono font-medium text-gray-800">{formatINR(trade.amount)}</p>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <p className="font-medium text-gray-800">{trade.units || 1}</p>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <Badge className={
                                  trade.status === 'verified' ? 'bg-green-100 text-green-700' :
                                  trade.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                  'bg-gray-100 text-gray-700'
                                }>
                                  {trade.status === 'verified' ? (
                                    <><Check className="h-3 w-3 mr-1" />Verified</>
                                  ) : trade.status === 'pending' ? (
                                    <><Clock className="h-3 w-3 mr-1" />Pending</>
                                  ) : (
                                    trade.status || 'N/A'
                                  )}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate(`/bonds/${trade.bond_id}`)}
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  View
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              )}

              {/* Real Estate Tab */}
              {mainTab === "real-estate" && (
                realEstateHoldings.length === 0 ? (
                  <div className="text-center py-12">
                    <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No real estate holdings yet</p>
                    <Button
                      className="mt-4 bg-teal-600 hover:bg-teal-700"
                      onClick={() => navigate("/client/opportunities")}
                    >
                      Browse Real Estate Opportunities
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Real Estate Summary - Matching Broker View */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Total Properties</p>
                            <p className="text-2xl font-bold text-gray-800">{realEstateHoldings.length}</p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                            <TrendingUp className="h-5 w-5 text-orange-600" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Total Investment</p>
                            <p className="text-2xl font-bold text-gray-800">
                              {formatAED(realEstateHoldings.reduce((sum, h) => sum + (h.my_investment?.amount || h.investment_amount || 0), 0))}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Percent className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Avg Share</p>
                            <p className="text-2xl font-bold text-gray-800">
                              {(realEstateHoldings.reduce((sum, h) => sum + (h.my_investment?.share_percentage || h.share_percentage || 0), 0) / realEstateHoldings.length).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Real Estate Holdings Grid - Matching Broker View */}
                    <div className="space-y-4">
                      {realEstateHoldings.map((property) => {
                        const investment = property.my_investment || {};
                        const sharePercent = investment.share_percentage || property.share_percentage || 0;
                        const investmentAmount = investment.amount || property.investment_amount || 0;
                        const unitPrice = property.total_cost || property.unit_price || 0;
                        const investedDate = investment.invested_at || property.invested_on;
                        const paymentSchedule = property.payment_schedule || [];
                        const completedPayments = paymentSchedule.filter(p => p.is_paid).length;
                        
                        return (
                          <div key={property.id || property.opportunity_id} className="bg-white rounded-xl border border-gray-200 p-6 hover:border-purple-300 transition-colors">
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                                  <Building2 className="h-6 w-6 text-purple-600" />
                                </div>
                                <div>
                                  <h3 className="font-bold text-gray-800 text-lg">{property.building_name}</h3>
                                  <p className="text-sm text-gray-500">
                                    Unit {property.unit_no}{property.floor ? `, ${property.floor}` : ''}
                                  </p>
                                </div>
                              </div>
                              <Badge className={`${property.status === 'fully_invested' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                                {property.status === 'fully_invested' ? 'Fully Allocated' : property.property_type === 'off_plan' ? 'Off-Plan' : 'Ready'}
                              </Badge>
                            </div>
                            
                            {/* Property Details Grid - Like Broker View */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 py-4 border-t border-gray-100">
                              <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wide">Share</p>
                                <p className="font-bold text-purple-600 text-lg">{sharePercent.toFixed(1)}%</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wide">Investment</p>
                                <p className="font-bold text-gray-800">{formatAED(investmentAmount)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wide">Unit Price</p>
                                <p className="font-semibold text-gray-600">{formatAED(unitPrice)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wide">Invested On</p>
                                <p className="font-semibold text-gray-600">
                                  {investedDate ? format(new Date(investedDate), "dd MMM yyyy") : '-'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wide">Payment Progress</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                                    <div 
                                      className="bg-purple-500 h-2 rounded-full" 
                                      style={{ width: `${paymentSchedule.length > 0 ? (completedPayments / paymentSchedule.length) * 100 : 0}%` }} 
                                    />
                                  </div>
                                  <span className="text-sm font-medium text-gray-600">{completedPayments}/{paymentSchedule.length} milestones</span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Action Button */}
                            <div className="flex justify-end pt-4 border-t border-gray-100">
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="gap-2"
                                onClick={() => navigate(`/client/real-estate/${property.id || property.opportunity_id}`)}
                              >
                                <ChevronRight className="h-4 w-4" />
                                View
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )
              )}
            </>
          )}
        </div>
      </div>

      {/* Cashflow Modal */}
      <Dialog open={showCashflowModal} onOpenChange={setShowCashflowModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Cashflow Schedule - {selectedHolding?.bond_name}
            </DialogTitle>
          </DialogHeader>
          
          {selectedHolding && (
            <div className="mt-4">
              {/* Summary Info */}
              <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Units</p>
                  <p className="font-semibold">{selectedHolding.units}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Invested</p>
                  <p className="font-semibold">{formatINR(selectedHolding.invested_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Investment Date</p>
                  <p className="font-semibold">
                    {format(new Date(selectedHolding.investment_date), "MMM dd, yyyy")}
                  </p>
                </div>
              </div>

              {/* Cashflows Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-right py-2 px-3">Principal</th>
                      <th className="text-right py-2 px-3">Interest</th>
                      <th className="text-right py-2 px-3">TDS</th>
                      <th className="text-right py-2 px-3">Net Amount</th>
                      <th className="text-center py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedHolding.cashflows?.map((cf, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-2 px-3 font-mono">
                          {format(new Date(cf.date), "MMM dd, yyyy")}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {formatINR(cf.principal_component)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {formatINR(cf.interest_component)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-red-600">
                          -{formatINR(cf.tds_amount)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium">
                          {formatINR(cf.net_amount)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {cf.is_repaid ? (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex items-center justify-center gap-1">
                              <Check className="h-3 w-3" /> Repaid
                            </span>
                          ) : new Date(cf.date) < new Date() ? (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full flex items-center justify-center gap-1">
                              <Clock className="h-3 w-3" /> Due
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                              Upcoming
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
