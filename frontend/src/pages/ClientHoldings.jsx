import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { 
  Wallet, Calendar, Download, ChevronDown, ChevronUp, 
  Check, Clock, X, MapPin, Percent, ChevronRight, 
  ClipboardList, Eye, RefreshCw, IndianRupee, Calculator, FileText
} from "lucide-react";
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
import { logUserActivity } from "@/utils/activityLogger";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ClientHoldings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [holdings, setHoldings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedHolding, setSelectedHolding] = useState(null);
  const [showCashflowModal, setShowCashflowModal] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedBonds, setExpandedBonds] = useState({});

  // Log user activity
  useEffect(() => {
    logUserActivity('holdings');
  }, []);

  useEffect(() => {
    document.title = "Kinntegraa | My Holdings";
  }, []);

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

  // Consolidate holdings by bond for summary view
  const getConsolidatedHoldings = useCallback(() => {
    if (!holdings?.holdings) return [];
    
    const consolidated = {};
    
    holdings.holdings.forEach(holding => {
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
          status: 'active',
          trades: []
        };
      }
      
      // Accumulate totals
      consolidated[bondId].total_units += holding.units || 0;
      consolidated[bondId].invested_amount += holding.invested_amount || 0;
      consolidated[bondId].total_principal += holding.total_principal || 0;
      consolidated[bondId].total_interest_gross += holding.total_interest_gross || 0;
      consolidated[bondId].total_tds += holding.total_tds || 0;
      consolidated[bondId].repaid_principal += holding.repaid_principal || 0;
      consolidated[bondId].repaid_interest += holding.repaid_interest || 0;
      consolidated[bondId].repaid_tds += holding.repaid_tds || 0;
      consolidated[bondId].net_repaid += holding.net_repaid || 0;
      consolidated[bondId].upcoming_expected += holding.upcoming_expected || 0;
      consolidated[bondId].prepaid_count += holding.prepaid_count || 0;
      consolidated[bondId].prepaid_amount += holding.prepaid_amount || 0;
      
      // XIRR - use first available
      if (holding.xirr !== null && holding.xirr !== undefined) {
        if (consolidated[bondId].xirr === null) {
          consolidated[bondId].xirr = holding.xirr;
        }
      }
      if (holding.actual_xirr !== null && holding.actual_xirr !== undefined) {
        if (consolidated[bondId].actual_xirr === null) {
          consolidated[bondId].actual_xirr = holding.actual_xirr;
        }
      }
      
      // Add trade entry
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
    
    // Sort trades and determine status
    Object.values(consolidated).forEach(bond => {
      bond.trades.sort((a, b) => new Date(a.investment_date) - new Date(b.investment_date));
      bond.status = bond.upcoming_expected > 0 ? 'active' : 'fully_repaid';
    });
    
    return Object.values(consolidated);
  }, [holdings]);

  const consolidatedHoldings = getConsolidatedHoldings();
  const filteredHoldings = consolidatedHoldings.filter(h => 
    statusFilter === 'all' || h.status === statusFilter
  );

  const formatINR = (amount) => {
    if (!amount || amount === 0) return '₹0';
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    let formatted;
    if (absAmount >= 10000000) {
      formatted = `₹${(absAmount / 10000000).toFixed(2)} Cr`;
    } else if (absAmount >= 100000) {
      formatted = `₹${(absAmount / 100000).toFixed(2)} L`;
    } else if (absAmount >= 1000) {
      formatted = `₹${(absAmount / 1000).toFixed(2)} K`;
    } else {
      formatted = `₹${absAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return isNegative ? `-${formatted}` : formatted;
  };

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

  const toggleBondExpand = (bondId) => {
    setExpandedBonds(prev => ({
      ...prev,
      [bondId]: !prev[bondId]
    }));
  };

  const viewCashflows = (holding) => {
    setSelectedHolding(holding);
    setActiveTab("summary");
    setShowCashflowModal(true);
  };

  // Calculate totals for summary
  const totalReceived = filteredHoldings.reduce((sum, h) => sum + (h.net_repaid || 0), 0);
  const totalOutstanding = filteredHoldings.reduce((sum, h) => sum + (h.upcoming_expected || 0), 0);
  const grandTotal = totalReceived + totalOutstanding;
  const receivedPercent = grandTotal > 0 ? (totalReceived / grandTotal) * 100 : 0;

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-100">
        <ClientSidebar user={user} />
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <ClientSidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-100 rounded-lg">
                <Wallet className="h-6 w-6 text-teal-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800" data-testid="holdings-title">My Holdings</h1>
                <p className="text-sm text-gray-500">View your bond investments and cashflows</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {!holdings || holdings.holdings?.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border">
              <Wallet className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No bond holdings yet</p>
              <p className="text-sm text-gray-400 mt-2">Your bond investments will appear here</p>
              <Button
                className="mt-4 bg-teal-600 hover:bg-teal-700"
                onClick={() => navigate("/client/opportunities")}
              >
                Browse Bond Opportunities
              </Button>
            </div>
          ) : (
            <>
              {/* Summary Stats Bar */}
                <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                  <div className="flex flex-wrap items-center gap-4 text-xs mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">Total Investment:</span>
                      <span className="font-mono font-semibold text-gray-800">{formatINR(holdings.summary?.total_investment)}</span>
                    </div>
                    <div className="h-4 w-px bg-gray-200"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">Total Gross Expected:</span>
                      <span className="font-mono font-semibold text-emerald-600">{formatINR(holdings.summary?.total_expected || (holdings.summary?.total_investment + holdings.summary?.total_profit))}</span>
                    </div>
                    <div className="h-4 w-px bg-gray-200"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">Total Gross Profit:</span>
                      <span className={`font-mono font-semibold ${(holdings.summary?.total_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatINR(holdings.summary?.total_profit)}
                      </span>
                    </div>
                    <div className="h-4 w-px bg-gray-200"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500">Outstanding Principal:</span>
                      <span className="font-mono font-semibold text-blue-600">{formatINR(
                        filteredHoldings.reduce((sum, h) => sum + (h.total_principal - h.repaid_principal), 0)
                      )}</span>
                    </div>
                  </div>
                  
                  {/* Repayment Status Progress Bar */}
                  {filteredHoldings.length > 0 && (
                    <div className="pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Repayment Status:</span>
                        
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
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Holdings Table - Aligned with Broker View */}
                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-5 w-5 text-teal-600" />
                        <h3 className="font-semibold text-gray-800">Holding Report</h3>
                      </div>
                      
                      {/* Status Filter */}
                      <div className="flex items-center gap-4 ml-4 pl-4 border-l border-gray-200">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input 
                            type="radio" 
                            name="holdingStatus" 
                            checked={statusFilter === 'all'} 
                            onChange={() => setStatusFilter('all')} 
                            className="h-3.5 w-3.5 text-teal-600 focus:ring-teal-500" 
                          />
                          <span className="text-sm text-gray-600">All</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input 
                            type="radio" 
                            name="holdingStatus" 
                            checked={statusFilter === 'active'} 
                            onChange={() => setStatusFilter('active')} 
                            className="h-3.5 w-3.5 text-teal-600 focus:ring-teal-500" 
                          />
                          <span className="text-sm text-gray-600">Active</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input 
                            type="radio" 
                            name="holdingStatus" 
                            checked={statusFilter === 'fully_repaid'} 
                            onChange={() => setStatusFilter('fully_repaid')} 
                            className="h-3.5 w-3.5 text-teal-600 focus:ring-teal-500" 
                          />
                          <span className="text-sm text-gray-600">Completed</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full">
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
                          // Get all expected cashflows
                          const allExpectedCashflows = (holding.trades || []).flatMap(trade => trade.expected_cashflows || []);
                          // EXPECTED Gross (sum of expected inflows)
                          const expectedGross = allExpectedCashflows
                            .filter(cf => cf.type !== 'investment')
                            .reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0);
                          const expectedProfit = expectedGross - holding.invested_amount;
                          
                          // ACTUAL Gross (from actual cashflows)
                          const allActualCashflows = (holding.trades || []).flatMap(trade => trade.actual_cashflows || []);
                          const actualGross = allActualCashflows
                            .filter(cf => cf.type !== 'investment')
                            .reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0);
                          const actualProfit = actualGross - holding.invested_amount;
                          
                          // Difference due to prepayments
                          const grossDifference = actualGross - expectedGross;
                          const profitDifference = actualProfit - expectedProfit;
                          
                          // Format number with commas (Indian format)
                          const formatNum = (num) => num.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                          
                          // Format difference in brackets
                          const formatDiff = (num) => `(${Math.abs(num).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;
                          
                          // Show difference row if there's a significant change
                          const showDifference = Math.abs(grossDifference) > 1;
                          
                          // Use actualGross if available, otherwise fallback to expected
                          const displayGross = actualGross > 0 ? actualGross : expectedGross;
                          const displayProfit = actualGross > 0 ? actualProfit : expectedProfit;
                          
                          return (
                            <tr key={holding.bond_id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-2 px-2 sticky left-0 bg-white">
                                <p className="font-medium text-gray-800 text-xs truncate max-w-[120px]" title={holding.bond_name}>{holding.bond_name}</p>
                                <p className="text-[10px] text-gray-400">{holding.total_units} units</p>
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-xs">
                                <p>{formatNum(holding.invested_amount)}</p>
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-xs">
                                <p>{formatNum(displayGross)}</p>
                                {showDifference && <p className="text-[10px] text-red-600">{formatDiff(grossDifference)}</p>}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-xs">
                                <p className={displayProfit >= 0 ? 'text-green-600' : 'text-red-600'}>{formatNum(displayProfit)}</p>
                                {showDifference && <p className="text-[10px] text-red-600">{formatDiff(profitDifference)}</p>}
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
                                <div className="flex items-center justify-center gap-1">
                                  <button 
                                    onClick={() => viewCashflows(holding)} 
                                    className="px-2 py-1 text-[10px] font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 transition-colors"
                                  >
                                    View
                                  </button>
                                  <button 
                                    onClick={() => downloadHoldingPDF(holding)} 
                                    className="px-2 py-1 text-[10px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                                  >
                                    <Download className="h-3 w-3" />
                                  </button>
                                </div>
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
      </div>

      {/* Cashflow Modal */}
      <Dialog open={showCashflowModal} onOpenChange={setShowCashflowModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-teal-600" />
              {selectedHolding?.bond_name} - Cashflows
            </DialogTitle>
          </DialogHeader>
          
          {selectedHolding && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500">Total Units</p>
                  <p className="font-semibold">{selectedHolding.total_units}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Invested</p>
                  <p className="font-semibold">{formatINR(selectedHolding.invested_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Expected XIRR</p>
                  <p className="font-semibold text-emerald-600">
                    {selectedHolding.xirr ? `${selectedHolding.xirr.toFixed(2)}%` : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Actual XIRR</p>
                  <p className="font-semibold text-purple-600">
                    {selectedHolding.actual_xirr ? `${selectedHolding.actual_xirr.toFixed(2)}%` : '-'}
                  </p>
                </div>
              </div>

              {/* Tabs for each tranche */}
              {selectedHolding.trades && selectedHolding.trades.length > 0 && (
                <div>
                  <div className="flex gap-2 border-b mb-4">
                    <button
                      onClick={() => setActiveTab("summary")}
                      className={`px-3 py-2 text-sm font-medium border-b-2 ${
                        activeTab === "summary" 
                          ? "border-teal-600 text-teal-700" 
                          : "border-transparent text-gray-500"
                      }`}
                    >
                      Summary
                    </button>
                    {selectedHolding.trades.map((trade, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveTab(idx)}
                        className={`px-3 py-2 text-sm font-medium border-b-2 ${
                          activeTab === idx 
                            ? "border-teal-600 text-teal-700" 
                            : "border-transparent text-gray-500"
                        }`}
                      >
                        {format(new Date(trade.investment_date), 'dd MMM yy')}
                      </button>
                    ))}
                  </div>

                  {activeTab === "summary" ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>Select a tranche to view detailed cashflows</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left py-2 px-3">Date</th>
                            <th className="text-left py-2 px-3">Type</th>
                            <th className="text-right py-2 px-3">Principal</th>
                            <th className="text-right py-2 px-3">Interest</th>
                            <th className="text-right py-2 px-3">TDS</th>
                            <th className="text-right py-2 px-3">Net Amount</th>
                            <th className="text-center py-2 px-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {selectedHolding.trades[activeTab]?.cashflows?.map((cf, idx) => (
                            <tr key={idx} className={cf.is_repaid ? 'bg-green-50/50' : ''}>
                              <td className="py-2 px-3">{format(new Date(cf.date), 'dd MMM yyyy')}</td>
                              <td className="py-2 px-3 capitalize">{cf.type?.replace('_', ' ') || 'Payment'}</td>
                              <td className="py-2 px-3 text-right font-mono">{formatAbsoluteINR(cf.principal_component)}</td>
                              <td className="py-2 px-3 text-right font-mono">{formatAbsoluteINR(cf.interest_component)}</td>
                              <td className="py-2 px-3 text-right font-mono text-red-600">{formatAbsoluteINR(cf.tds_amount)}</td>
                              <td className="py-2 px-3 text-right font-mono font-semibold">{formatAbsoluteINR(cf.net_amount)}</td>
                              <td className="py-2 px-3 text-center">
                                {cf.is_repaid ? (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                    Received
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                                    Pending
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
