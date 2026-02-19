import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Search, Download, Mail, Check, X, FileText, Users, TrendingUp, DollarSign, MoreVertical, Eye, Calendar, User, MapPin, Building2, CreditCard, UserCheck, ClipboardList, FileImage, Upload, AlertCircle, CheckCircle, Clock, XCircle, Send, ArrowRight, IndianRupee, RefreshCw, Calculator, ExternalLink, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import ClientSidebar from "@/components/ClientSidebar";
import HorizontalPaymentTimeline from "@/components/HorizontalPaymentTimeline";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import React from "react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Round down to nearest 100
const roundToHundred = (amount) => {
  if (!amount || amount <= 0) return 0;
  return Math.floor(amount / 100) * 100;
};

// Format currency for Indian Rupees
const formatCurrency = (amount) => amount?.toLocaleString('en-IN') || '0';

// Bifurcated Trades Table Component - Groups trades by cashflow for split allocations
const BifurcatedTradesTable = ({ trades, selectedClient, formatINR, showOnlyReinvestment = false }) => {
  // Filter reinvestment logs that have cashflow_id for grouping
  const reinvTrades = trades.filter(t => t.is_reinvestment_log || t.cashflow_id);
  
  // Group reinvestment trades by cashflow_id for bifurcation
  const groupByCashflow = (tradesToGroup) => {
    const cashflowGroups = {};
    tradesToGroup.forEach(trade => {
      const cfId = trade.cashflow_id || trade.id;
      if (!cashflowGroups[cfId]) {
        cashflowGroups[cfId] = {
          cashflow_id: cfId,
          bond_name: trade.bond_name,
          date: trade.expected_date || trade.investment_date,
          allocations: [],
          total_amount: 0,
          total_round_down_amount: 0,
          client_name: trade.client_name || selectedClient?.name
        };
      }
      const roundDownAmt = trade.total_amount || roundToHundred(trade.net_amount || 0);
      const portfolioValue = trade.portfolio || '';
      const hasValidPortfolio = portfolioValue && portfolioValue.toLowerCase() !== 'none';
      cashflowGroups[cfId].allocations.push({
        ...trade,
        round_down_amount: roundDownAmt
      });
      cashflowGroups[cfId].total_amount += (trade.net_amount || trade.total_amount || 0);
      // Only add to investment total if trade has a valid portfolio (not "none")
      if (hasValidPortfolio) {
        cashflowGroups[cfId].total_round_down_amount += roundDownAmt;
      }
    });
    // Sort allocations by index
    Object.values(cashflowGroups).forEach(cf => {
      cf.allocations.sort((a, b) => (a.allocation_index || 0) - (b.allocation_index || 0));
    });
    return cashflowGroups;
  };

  const cashflowGroups = groupByCashflow(reinvTrades);
  const hasGroupedTrades = Object.keys(cashflowGroups).length > 0;

  const getStatusBadge = (status) => {
    if (status === 'pending' || status === 'pending_broker_approval') {
      return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-medium">Pending</span>;
    } else if (status === 'approved' || status === 'submitted' || status === 'client_approved') {
      return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] rounded font-medium">Approved</span>;
    } else if (status === 'rejected') {
      return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] rounded font-medium">Rejected</span>;
    }
    return <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] rounded font-medium">{status}</span>;
  };

  const getTradeTypeLabel = (trade) => {
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

  return (
    <div className="space-y-4">
      {/* Grouped Reinvestment Trades with Bifurcation */}
      {hasGroupedTrades && (
        <div className="bg-white rounded-lg border border-purple-200 overflow-hidden">
          <div className="px-4 py-3 bg-purple-50/50 border-b border-purple-100">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              <span className="font-medium text-gray-800">Reinvestment Trades</span>
              <span className="text-xs text-gray-500">({reinvTrades.length} entries)</span>
            </div>
          </div>
          
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th colSpan="3" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-blue-50">
                    Repayment Details
                  </th>
                  <th colSpan="4" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-purple-50">
                    Investment Details
                  </th>
                  <th rowSpan="2" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200">
                    Status
                  </th>
                </tr>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Date</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Bond Name</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Net Amount</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Inv. Date</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Portfolio</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">UCC</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Amount</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(cashflowGroups).map((cfGroup, cfIdx) => {
                  const allocations = cfGroup.allocations;
                  const hasMultiple = allocations.length > 1;
                  const rowCount = allocations.length;
                  
                  return (
                    <React.Fragment key={cfGroup.cashflow_id}>
                      {allocations.map((alloc, allocIdx) => {
                        const isFirst = allocIdx === 0;
                        
                        return (
                          <tr 
                            key={`${cfGroup.cashflow_id}-${allocIdx}`}
                            className={`
                              ${hasMultiple ? (isFirst ? 'border-t-2 border-t-purple-400' : '') : ''}
                              ${hasMultiple ? 'bg-purple-50/30' : 'hover:bg-gray-50'}
                            `}
                          >
                            {/* Date - merged */}
                            {isFirst && (
                              <td 
                                className={`px-3 py-2 border border-gray-200 align-middle ${hasMultiple ? 'border-l-4 border-l-purple-400' : ''}`}
                                rowSpan={hasMultiple ? rowCount : 1}
                              >
                                <span className="whitespace-nowrap font-medium text-gray-800">
                                  {cfGroup.date ? format(new Date(cfGroup.date), "dd MMM yyyy") : '-'}
                                </span>
                              </td>
                            )}
                            
                            {/* Bond Name - merged */}
                            {isFirst && (
                              <td 
                                className="px-3 py-2 border border-gray-200 align-middle"
                                rowSpan={hasMultiple ? rowCount : 1}
                              >
                                <div className="font-medium text-gray-800">{cfGroup.bond_name || 'N/A'}</div>
                              </td>
                            )}
                            
                            {/* Net Amount - per allocation */}
                            <td className="px-3 py-2 text-right font-mono text-gray-800 border border-gray-200">
                              {formatINR(alloc.net_amount || alloc.total_amount || 0)}
                            </td>
                            
                            {/* Investment Date */}
                            <td className="px-3 py-2 border border-gray-200">
                              <span className="whitespace-nowrap text-gray-700">
                                {alloc.mf_investment_date || alloc.investment_date ? format(new Date(alloc.mf_investment_date || alloc.investment_date), "dd MMM yyyy") : '-'}
                              </span>
                            </td>
                            
                            {/* Portfolio */}
                            <td className="px-3 py-2 border border-gray-200">
                              <Badge className="bg-purple-100 text-purple-700 text-xs capitalize">
                                {alloc.portfolio || '-'}
                              </Badge>
                            </td>
                            
                            {/* UCC - show "-" if portfolio is "none" (residual amounts) */}
                            <td className="px-3 py-2 border border-gray-200">
                              <Badge variant="outline" className="text-xs font-mono">
                                {(alloc.portfolio && alloc.portfolio.toLowerCase() !== 'none') 
                                  ? (alloc.ucc || alloc.target_ucc || alloc.bond_code || '-') 
                                  : '-'}
                              </Badge>
                            </td>
                            
                            {/* Amount (Round Down) */}
                            <td className="px-3 py-2 text-right font-mono text-purple-700 font-semibold border border-gray-200">
                              {formatINR(alloc.round_down_amount || alloc.total_amount || 0)}
                            </td>
                            
                            {/* Status - merged */}
                            {isFirst && (
                              <td 
                                className="px-3 py-2 text-center border border-gray-200 align-middle"
                                rowSpan={hasMultiple ? rowCount : 1}
                              >
                                {getStatusBadge(alloc.status || alloc.approval_status || 'pending')}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      
                      {/* Total row for multi-allocation */}
                      {hasMultiple && (
                        <tr className="bg-purple-100/50 border-b-2 border-b-purple-400">
                          <td colSpan="2" className="px-3 py-2 text-right font-semibold text-gray-700 border border-gray-200">
                            Total for {cfGroup.bond_name}:
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-gray-800 border border-gray-200">
                            {formatINR(cfGroup.total_amount)}
                          </td>
                          <td colSpan="3" className="border border-gray-200"></td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-purple-700 border border-gray-200">
                            {formatINR(cfGroup.total_round_down_amount)}
                          </td>
                          <td className="border border-gray-200"></td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Empty state for reinvestment trades */}
      {reinvTrades.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border">
          <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No reinvestment trades found</p>
        </div>
      )}
    </div>
  );
};

// Trades Tab Content with Sub-tabs (Reinvestment Trades / Investment)
const TradesTabContent = ({ trades, selectedClient, formatINR }) => {
  const [activeSubTab, setActiveSubTab] = React.useState("reinvestment");
  
  // Separate reinvestment trades (from reinvestment logs) and blocked unit trades
  const reinvestmentTrades = trades.filter(t => t.is_reinvestment_log);
  const blockedUnitTrades = trades.filter(t => !t.is_reinvestment_log);
  
  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setActiveSubTab("reinvestment")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeSubTab === "reinvestment"
              ? "bg-purple-100 text-purple-700 border-b-2 border-purple-600"
              : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
          }`}
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Reinvestment Trades
            <span className="px-2 py-0.5 bg-purple-200 text-purple-800 text-xs rounded-full">
              {reinvestmentTrades.length}
            </span>
          </div>
        </button>
        <button
          onClick={() => setActiveSubTab("investment")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeSubTab === "investment"
              ? "bg-green-100 text-green-700 border-b-2 border-green-600"
              : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Investment
            <span className="px-2 py-0.5 bg-green-200 text-green-800 text-xs rounded-full">
              {blockedUnitTrades.length}
            </span>
          </div>
        </button>
      </div>
      
      {/* Reinvestment Trades Sub-tab Content */}
      {activeSubTab === "reinvestment" && (
        <BifurcatedTradesTable 
          trades={reinvestmentTrades}
          selectedClient={selectedClient}
          formatINR={formatINR}
          showOnlyReinvestment={true}
        />
      )}
      
      {/* Investment (Blocked Units) Sub-tab Content */}
      {activeSubTab === "investment" && (
        <InvestmentTradesTable 
          trades={blockedUnitTrades}
          selectedClient={selectedClient}
          formatINR={formatINR}
        />
      )}
    </div>
  );
};

// Investment Trades Table (Blocked Units)
const InvestmentTradesTable = ({ trades, selectedClient, formatINR }) => {
  if (trades.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border">
        <CheckCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No blocked unit investments found</p>
        <p className="text-gray-400 text-sm mt-1">Approved investments will appear here</p>
      </div>
    );
  }

  const totalUnits = trades.reduce((sum, t) => sum + (t.units || 0), 0);
  const totalAmount = trades.reduce((sum, t) => sum + (t.total_amount || 0), 0);

  return (
    <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
      <div className="px-4 py-3 bg-green-50/50 border-b border-green-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="font-medium text-green-800">Investment (Blocked Units)</span>
          <Badge className="bg-green-100 text-green-700">{trades.length}</Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-500">Total Units</p>
            <p className="font-semibold text-gray-800">{totalUnits}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Total Amount</p>
            <p className="font-semibold text-green-700">₹{formatINR(totalAmount)}</p>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Sr No</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Bond Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Investment Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Deal ID</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Units</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">UTR Reference</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, idx) => (
              <tr key={trade.id || idx} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600">{idx + 1}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{trade.bond_name || 'N/A'}</td>
                <td className="px-4 py-3">
                  {trade.investment_date ? format(new Date(trade.investment_date), "dd-MMM-yy") : 'NA'}
                </td>
                <td className="px-4 py-3 font-mono text-gray-600">{trade.bond_code || trade.ucc || 'N/A'}</td>
                <td className="px-4 py-3 text-center font-mono">{trade.units || 0}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">
                  ₹{formatINR(trade.total_amount || 0)}
                </td>
                <td className="px-4 py-3 font-mono text-gray-600">{trade.payment_reference || 'N/A'}</td>
                <td className="px-4 py-3 text-center">
                  {trade.status === 'approved' ? (
                    <Badge className="bg-green-100 text-green-700 text-xs">Approved</Badge>
                  ) : trade.status === 'pending' ? (
                    <Badge className="bg-amber-100 text-amber-700 text-xs">Pending</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-700 text-xs">{trade.status || 'N/A'}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Other Trades Table (flat table for non-reinvestment trades)
const OtherTradesTable = ({ trades, selectedClient, formatINR }) => {
  const getStatusBadge = (status) => {
    if (status === 'pending' || status === 'pending_broker_approval') {
      return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-medium">Pending</span>;
    } else if (status === 'approved' || status === 'submitted' || status === 'client_approved') {
      return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] rounded font-medium">Approved</span>;
    } else if (status === 'rejected') {
      return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] rounded font-medium">Rejected</span>;
    }
    return <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] rounded font-medium">{status}</span>;
  };

  const getTradeTypeLabel = (trade) => {
    const tag = trade.reinvestment_tag || '';
    if (tag === 'principal') return 'Principal';
    if (tag === 'interest') return 'Interest';
    if (trade.is_historical) return 'Principal';
    return trade.trade_type || 'Investment';
  };

  if (trades.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border">
        <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No other trades found</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="bg-gray-50 border-b text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-3 text-left">Client Name</th>
              <th className="px-3 py-3 text-left">Bond/UCC</th>
              <th className="px-3 py-3 text-left">Date</th>
              <th className="px-3 py-3 text-left">Type</th>
              <th className="px-3 py-3 text-right">Amount</th>
              <th className="px-3 py-3 text-left">Portfolio</th>
              <th className="px-3 py-3 text-left">Advisor</th>
              <th className="px-3 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {trades.map((trade) => (
              <tr key={trade.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-3 text-sm font-medium text-gray-800 whitespace-nowrap">
                  {trade.client_name || selectedClient?.name}
                </td>
                <td className="px-3 py-3">
                  <div className="text-sm font-medium text-gray-800">{trade.bond_name || 'N/A'}</div>
                  <div className="text-xs font-mono text-gray-500">{trade.bond_code || '-'}</div>
                </td>
                <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                  {trade.investment_date ? format(new Date(trade.investment_date), "dd MMM yyyy") : '-'}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className="text-xs font-medium text-blue-600">
                    {getTradeTypeLabel(trade)}
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
                  {getStatusBadge(trade.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

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
  const [clientTypeFilter, setClientTypeFilter] = useState("all"); // "all", "bonds", "real_estate"
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

  // Currency state for Real Estate payment timeline
  const [reSelectedCurrency, setReSelectedCurrency] = useState("AED");
  const [reCurrencyRates, setReCurrencyRates] = useState({ 
    AED: 1, INR: 24.72, USD: 0.27, EUR: 0.25, GBP: 0.21, SGD: 0.36,
    CNY: 1.97, JPY: 40.5, CHF: 0.24, CAD: 0.37, AUD: 0.42, HKD: 2.12,
    SAR: 1.02, KWD: 0.083, QAR: 0.99, BHD: 0.10, OMR: 0.10
  });
  const [reProjectedRates, setReProjectedRates] = useState(null); // Stores {year: rate} mapping
  const [reLoadingRates, setReLoadingRates] = useState(false);

  // Fetch currency rates for Real Estate - now includes projected rates by year
  const fetchRECurrencyRates = async (currency) => {
    if (currency === "AED") {
      setReCurrencyRates(prev => ({ ...prev, AED: 1 }));
      setReProjectedRates(null);
      return;
    }
    
    setReLoadingRates(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/currency/projected-rates`, {
        params: { target: currency, years_ahead: 10 },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data && res.data.current_rate) {
        setReCurrencyRates(prev => ({ ...prev, [currency]: res.data.current_rate }));
        
        // Build year-to-rate mapping from projected_rates
        if (res.data.projected_rates && res.data.projected_rates.length > 0) {
          const ratesByYear = {};
          res.data.projected_rates.forEach(p => {
            ratesByYear[p.year] = p.rate;
          });
          setReProjectedRates(ratesByYear);
        }
      }
    } catch (error) {
      console.error("Error fetching currency rates:", error);
      // Use default rates
      const defaults = { 
        INR: 24.72, USD: 0.27, EUR: 0.25, GBP: 0.21, SGD: 0.36,
        CNY: 1.97, JPY: 40.5, CHF: 0.24, CAD: 0.37, AUD: 0.42, HKD: 2.12,
        SAR: 1.02, KWD: 0.083, QAR: 0.99, BHD: 0.10, OMR: 0.10
      };
      setReCurrencyRates(prev => ({ ...prev, [currency]: defaults[currency] || 1 }));
      setReProjectedRates(null);
    } finally {
      setReLoadingRates(false);
    }
  };

  const handleRECurrencyChange = (currency) => {
    setReSelectedCurrency(currency);
    if (currency !== "AED") {
      fetchRECurrencyRates(currency);
    }
  };

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
        cashflow_id: log.cashflow_id,  // Critical for bifurcation grouping
        client_id: log.client_id,
        client_name: log.client_name,
        client_pan: log.client_pan,
        bond_id: log.bond_id,
        bond_name: log.bond_name,
        bond_code: log.ucc || log.target_ucc || log.bond_code,
        ucc: log.ucc,  // Preserve original ucc field
        target_ucc: log.ucc || log.target_ucc,
        units: log.units || 0,
        total_amount: log.net_amount || log.total_amount || 0,
        net_amount: log.net_amount || log.amount,
        calculated_price: log.net_amount ? Math.round(log.net_amount / (log.units || 1)) : 0,
        investment_date: log.expected_date || log.created_at,
        expected_date: log.expected_date,
        mf_investment_date: log.mf_investment_date,
        allocation_index: log.allocation_index || 0,
        created_at: log.created_at,
        status: log.approval_status || 'approved',
        approval_status: log.approval_status,
        reinvestment_tag: log.reinvestment_tag,
        is_historical: log.is_past_date || true,
        portfolio: log.portfolio_category || log.portfolio || 'Wealth',
        created_by_name: log.tagged_by_name,
        tagged_by_name: log.tagged_by_name,
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
          gross_repaid: 0,
          net_repaid: 0,
          gross_upcoming: 0,
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
      consolidated[bondId].gross_repaid += holding.gross_repaid || ((holding.repaid_principal || 0) + (holding.repaid_interest || 0));
      consolidated[bondId].net_repaid += holding.net_repaid;
      consolidated[bondId].gross_upcoming += holding.gross_upcoming || holding.upcoming_expected || 0;
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

  const filteredClients = clients.filter(c => {
    // Search filter
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.pan_number.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Client type filter
    let matchesType = true;
    if (clientTypeFilter === 'bonds') {
      matchesType = c.has_bonds === true;
    } else if (clientTypeFilter === 'real_estate') {
      matchesType = c.has_real_estate === true;
    }
    // 'all' shows everyone
    
    return matchesSearch && matchesType;
  });

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

  // Format AED amounts
  const formatAED = (amount) => {
    if (!amount || amount === 0) return 'AED 0';
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    let formatted;
    if (absAmount >= 1000000) {
      formatted = `AED ${(absAmount / 1000000).toFixed(2)}M`;
    } else if (absAmount >= 1000) {
      formatted = `AED ${(absAmount / 1000).toFixed(2)}K`;
    } else {
      formatted = `AED ${absAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return isNegative ? `-${formatted}` : formatted;
  };

  // Get client display value based on filter type
  // AED to INR conversion rate (approximate - will be updated to use live rate)
  const AED_TO_INR_RATE = 22.75;
  
  const getClientDisplayValue = (client) => {
    if (clientTypeFilter === 'bonds') {
      // Show only bond investment in INR
      return formatINR(client.bond_investment || 0);
    } else if (clientTypeFilter === 'real_estate') {
      // Show only real estate investment in AED
      return formatAED(client.real_estate_investment || 0);
    } else {
      // 'all' - show combined value in INR (convert AED to INR)
      const bondINR = client.bond_investment || 0;
      const realEstateINR = (client.real_estate_investment || 0) * AED_TO_INR_RATE;
      return formatINR(bondINR + realEstateINR);
    }
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

  // Download Combined Cashflow PDF (Expected + Actual) - Clean Table Design with Borders
  const downloadCombinedCashflowPDF = async (holdingData, expectedCashflows, actualCashflows) => {
    const formatAmount = (amt) => {
      if (!amt || amt === 0) return '₹0.00';
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

    // Build Expected Cashflow rows with inline styles
    const expectedRows = expectedCashflows.map((cf, idx) => {
      const isInvestment = cf.type === 'investment';
      const isMaturity = cf.type === 'maturity';
      const amount = isInvestment 
        ? Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0)
        : (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0));
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f9f9f9';
      const textColor = isInvestment ? '#cc0000' : '#000000';
      const fontWeight = isInvestment || isMaturity ? 'bold' : 'normal';
      return `
        <tr style="background-color: ${rowBg};">
          <td style="border: 1px solid #999; padding: 8px 10px; text-align: left;">${format(new Date(cf.date), 'dd MMM yyyy')}</td>
          <td style="border: 1px solid #999; padding: 8px 10px; text-align: left;">${isInvestment ? 'Investment' : isMaturity ? 'Maturity' : 'Interest Payment'}</td>
          <td style="border: 1px solid #999; padding: 8px 10px; text-align: right; color: ${textColor}; font-weight: ${fontWeight};">${isInvestment ? '-' : ''}${formatAmount(amount)}</td>
        </tr>
      `;
    }).join('');

    // Build Actual Cashflow rows with inline styles
    const actualRows = actualCashflows.length > 0 ? actualCashflows.map((cf, idx) => {
      const isInvestment = cf.type === 'investment';
      const isMaturity = cf.type === 'maturity';
      const isReceived = cf.is_repaid;
      const amount = isInvestment 
        ? Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0)
        : (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0));
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f9f9f9';
      const status = isInvestment ? 'Paid' : isReceived ? 'Received' : isMaturity ? 'At Maturity' : 'Pending';
      const textColor = isInvestment ? '#cc0000' : isReceived ? '#059669' : '#ca8a04';
      const fontWeight = isInvestment || isMaturity ? 'bold' : 'normal';
      return `
        <tr style="background-color: ${rowBg};">
          <td style="border: 1px solid #999; padding: 8px 10px; text-align: left;">${format(new Date(cf.date), 'dd MMM yyyy')}</td>
          <td style="border: 1px solid #999; padding: 8px 10px; text-align: left;">${status}</td>
          <td style="border: 1px solid #999; padding: 8px 10px; text-align: right; color: ${textColor}; font-weight: ${fontWeight};">${isInvestment ? '-' : ''}${formatAmount(amount)}</td>
        </tr>
      `;
    }).join('') : `<tr><td colspan="3" style="border: 1px solid #999; padding: 20px; text-align: center; color: #9ca3af;">No actual cashflow yet</td></tr>`;

    // Build HTML for PDF - Clean table design with solid borders
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Cashflow Report - ${holdingData.bond_name}</title>
      </head>
      <body style="font-family: Arial, Helvetica, sans-serif; padding: 25px 30px; color: #000; background: #fff; font-size: 11px; line-height: 1.5; margin: 0;">
        
        <!-- Header Summary Table - 5 columns -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
          <thead>
            <tr>
              <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 10px 12px; text-align: center; font-size: 10px; font-weight: bold; color: #333;">Bond Name</th>
              <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 10px 12px; text-align: center; font-size: 10px; font-weight: bold; color: #333;">Units</th>
              <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 10px 12px; text-align: center; font-size: 10px; font-weight: bold; color: #333;">Total Investment</th>
              <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 10px 12px; text-align: center; font-size: 10px; font-weight: bold; color: #333;">Expected XIRR</th>
              <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 10px 12px; text-align: center; font-size: 10px; font-weight: bold; color: #333;">Actual XIRR</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #999; padding: 12px; text-align: center; font-size: 11px; font-weight: bold; color: #000;">${holdingData.bond_name}</td>
              <td style="border: 1px solid #999; padding: 12px; text-align: center; font-size: 11px; font-weight: bold; color: #000;">${holdingData.total_units || holdingData.units || '-'}</td>
              <td style="border: 1px solid #999; padding: 12px; text-align: center; font-size: 11px; font-weight: bold; color: #000;">${formatAmount(expTotalInvestment)}</td>
              <td style="border: 1px solid #999; padding: 12px; text-align: center; font-size: 11px; font-weight: bold; color: #059669;">${holdingData.xirr?.toFixed(2) || '-'}%</td>
              <td style="border: 1px solid #999; padding: 12px; text-align: center; font-size: 11px; font-weight: bold; color: #7c3aed;">${holdingData.actual_xirr?.toFixed(2) || '-'}%</td>
            </tr>
          </tbody>
        </table>
        
        <!-- Two Column Layout for Expected and Actual -->
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <!-- Expected Cashflow Column -->
            <td style="width: 48%; vertical-align: top; padding-right: 10px;">
              <div style="font-size: 13px; font-weight: bold; margin-bottom: 12px; color: #000; text-align: center; background: #f0fdf4; padding: 10px; border: 1px solid #86efac;">Expected Cashflow</div>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                <thead>
                  <tr>
                    <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: bold; color: #000;">Date</th>
                    <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: bold; color: #000;">Description</th>
                    <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 8px 10px; text-align: right; font-size: 10px; font-weight: bold; color: #000;">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  ${expectedRows}
                  <!-- Total Row -->
                  <tr style="background-color: #f0f0f0;">
                    <td colspan="2" style="border: 1px solid #999; padding: 10px; text-align: left; font-weight: bold;">Total Returns</td>
                    <td style="border: 1px solid #999; padding: 10px; text-align: right; font-weight: bold; color: #059669;">${formatAmount(expTotalGross)}</td>
                  </tr>
                  <tr style="background-color: #ecfdf5;">
                    <td colspan="2" style="border: 1px solid #999; padding: 10px; text-align: left; font-weight: bold;">Profit</td>
                    <td style="border: 1px solid #999; padding: 10px; text-align: right; font-weight: bold; color: #047857;">${formatAmount(expProfit)}</td>
                  </tr>
                </tbody>
              </table>
            </td>
            
            <!-- Spacer -->
            <td style="width: 4%;"></td>
            
            <!-- Actual Cashflow Column -->
            <td style="width: 48%; vertical-align: top; padding-left: 10px;">
              <div style="font-size: 13px; font-weight: bold; margin-bottom: 12px; color: #000; text-align: center; background: #f5f3ff; padding: 10px; border: 1px solid #c4b5fd;">Actual Cashflow</div>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                <thead>
                  <tr>
                    <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: bold; color: #000;">Date</th>
                    <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: bold; color: #000;">Status</th>
                    <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 8px 10px; text-align: right; font-size: 10px; font-weight: bold; color: #000;">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  ${actualRows}
                  <!-- Total Row -->
                  <tr style="background-color: #f0f0f0;">
                    <td colspan="2" style="border: 1px solid #999; padding: 10px; text-align: left; font-weight: bold;">Total Returns</td>
                    <td style="border: 1px solid #999; padding: 10px; text-align: right; font-weight: bold; color: #7c3aed;">${formatAmount(actTotalGross)}</td>
                  </tr>
                  <tr style="background-color: #f5f3ff;">
                    <td colspan="2" style="border: 1px solid #999; padding: 10px; text-align: left; font-weight: bold;">Profit</td>
                    <td style="border: 1px solid #999; padding: 10px; text-align: right; font-weight: bold; color: #7c3aed;">${formatAmount(actProfit)}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </table>
        
        <!-- Note -->
        <div style="font-size: 9px; color: #555; line-height: 1.6; margin-top: 20px; font-style: italic; border-top: 1px solid #ddd; padding-top: 10px;">
          <strong style="color: #000;">Note:</strong> Expected Cashflow shows projected returns based on original investment terms. Actual Cashflow shows realized transactions. Negative values indicate investments (outflows).
        </div>
        
        <!-- Footer -->
        <div style="margin-top: 15px; text-align: center; font-size: 8px; color: #9ca3af; padding-top: 10px; border-top: 1px solid #eee;">
          Generated by Kinntegraa · ${format(new Date(), 'dd MMM yyyy HH:mm')} · This is a system generated report
        </div>
      </body>
      </html>
    `;

    try {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position: fixed; left: -9999px; top: 0; width: 1100px; height: 1500px; border: none;';
      document.body.appendChild(iframe);
      
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // Wait longer for styles to render
      await new Promise(resolve => setTimeout(resolve, 800));

      const html2pdf = (await import('html2pdf.js')).default;
      
      await html2pdf()
        .set({
          margin: [12, 12, 12, 12],
          filename: `Cashflow_Report_${holdingData.bond_name?.replace(/\s+/g, '_') || 'Report'}_${format(new Date(), 'yyyyMMdd')}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { 
            scale: 3, 
            useCORS: true, 
            logging: false,
            letterRendering: true,
            backgroundColor: '#ffffff',
            windowWidth: 1100,
            onclone: function(clonedDoc) {
              clonedDoc.body.style.webkitPrintColorAdjust = 'exact';
            }
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

  return (
    <div className="flex min-h-screen bg-gray-50">
      <SidebarComponent user={user} />
      
      <main className="flex-1 overflow-auto">
        {/* Header with Client Selector - Like Data Gathering */}
        <div className="bg-white px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Holdings</h1>
                <p className="text-gray-500 text-sm mt-1">View client bond and real estate holdings</p>
              </div>
              
              {/* Client Selector - Inline with header */}
              <div className="flex items-center gap-3 border-l pl-6">
                {/* Client Selector Dropdown */}
                <Select 
                  value={selectedClient?.id || ""} 
                  onValueChange={(value) => {
                    const client = clients.find(c => c.id === value);
                    if (client) handleClientSelect(client);
                  }}
                >
                  <SelectTrigger className="w-72 h-9">
                    <SelectValue placeholder="Select a client">
                      {selectedClient ? (
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          {selectedClient.name?.length > 30 
                            ? selectedClient.name.substring(0, 30) + '...' 
                            : selectedClient.name}
                        </span>
                      ) : (
                        <span className="text-gray-500">Select a client</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Search & Filter inside dropdown */}
                    <div className="p-2 border-b space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search clients..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-8 h-8 text-sm"
                          data-testid="search-investor"
                        />
                      </div>
                      <Select value={clientTypeFilter} onValueChange={setClientTypeFilter}>
                        <SelectTrigger className="h-8 text-xs" data-testid="client-type-filter">
                          <SelectValue placeholder="Filter by type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Clients</SelectItem>
                          <SelectItem value="bonds">Bond Clients</SelectItem>
                          <SelectItem value="real_estate">Real Estate Clients</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Client list */}
                    <div className="max-h-[350px] overflow-y-auto">
                      {loading ? (
                        <div className="px-2 py-4 text-sm text-gray-500 text-center">Loading...</div>
                      ) : filteredClients.length > 0 ? (
                        filteredClients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            <div className="flex items-center justify-between w-full gap-4">
                              <span className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-gray-400" />
                                <span className="truncate max-w-[150px]">{client.name}</span>
                                <span className="text-xs text-gray-400">({client.pan_number})</span>
                              </span>
                              <span className="text-xs font-medium text-gray-600">
                                {getClientDisplayValue(client)}
                              </span>
                            </div>
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-4 text-sm text-gray-500 text-center">
                          {searchQuery ? `No clients matching "${searchQuery}"` : "No clients found"}
                        </div>
                      )}
                    </div>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <Button variant="outline" size="sm" onClick={fetchClients} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-6">
          {!selectedClient ? (
            <div className="h-[60vh] flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Users className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">Select a client to view holdings</p>
                <p className="text-sm text-gray-400 mt-1">Use the dropdown above to choose a client</p>
              </div>
            </div>
          ) : loadingHoldings ? (
            <div className="h-[60vh] flex items-center justify-center text-gray-500">
              <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600" />
            </div>
          ) : clientHoldings ? (
            <div>
              {/* Header Tabs */}
              <div className="flex items-center gap-6 mb-6 border-b border-gray-200 bg-white -mx-6 px-6 -mt-6 pt-4">
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
              
              {/* Trades Tab Content - With Sub-tabs */}
              {mainTab === "trades" && (
                <TradesTabContent 
                  trades={clientTrades}
                  selectedClient={selectedClient}
                  formatINR={formatINR}
                />
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
                      {/* Summary Row - Real Estate specific layout */}
                      {(() => {
                        // Calculate totals across all properties
                        let totalInvestmentAmount = 0;
                        let totalPaidTillDate = 0;
                        let totalExpectedSale = 0;
                        let paymentsDelayed = 0;
                        let futurePayments = 0;
                        const today = new Date();
                        
                        clientRealEstate.forEach(property => {
                          const investmentAmount = property.investment_amount || 0;
                          totalInvestmentAmount += investmentAmount;
                          totalExpectedSale += property.expected_sale_value || (investmentAmount * 1.4);
                          
                          const schedule = property.payment_schedule || [];
                          schedule.forEach((milestone, idx) => {
                            const milestoneAmount = (milestone.percentage / 100) * investmentAmount;
                            const milestoneDate = new Date(milestone.date);
                            const isPaid = idx < (property.payments_completed || 0);
                            
                            if (isPaid) {
                              totalPaidTillDate += milestoneAmount;
                            } else if (milestoneDate < today) {
                              paymentsDelayed += milestoneAmount;
                            } else {
                              futurePayments += milestoneAmount;
                            }
                          });
                        });
                        
                        const pendingToInvest = totalInvestmentAmount - totalPaidTillDate;
                        const expectedProfitOnSale = totalExpectedSale - totalInvestmentAmount;
                        const currencyProfitLoss = 0;
                        
                        // Percentages for the investment bar
                        const paidPercent = totalInvestmentAmount > 0 ? (totalPaidTillDate / totalInvestmentAmount) * 100 : 0;
                        const pendingPercent = 100 - paidPercent;
                        
                        const formatAmount = (amount) => {
                          if (amount >= 10000000) {
                            return `₹ ${(amount / 10000000).toFixed(2)} Cr`;
                          } else if (amount >= 100000) {
                            return `₹ ${(amount / 100000).toFixed(2)} L`;
                          }
                          return `₹ ${new Intl.NumberFormat('en-IN').format(Math.round(amount))}`;
                        };
                        
                        const AED_TO_INR = 22.5;
                        
                        return (
                          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                            {/* Top Row: Summary Stats - matching bonds font size */}
                            <div className="flex items-center gap-4 text-xs mb-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Total Investment Amount:</span>
                                <span className="font-mono font-semibold text-gray-800">
                                  {formatAmount(totalInvestmentAmount * AED_TO_INR)}
                                </span>
                              </div>
                              <div className="h-4 w-px bg-gray-200"></div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Expected Sale Amount:</span>
                                <span className="font-mono font-semibold text-blue-600">
                                  {formatAmount(totalExpectedSale * AED_TO_INR)}
                                </span>
                              </div>
                              <div className="h-4 w-px bg-gray-200"></div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Expected Profit on Sale:</span>
                                <span className="font-mono font-semibold text-green-600">
                                  {formatAmount(expectedProfitOnSale * AED_TO_INR)}
                                </span>
                              </div>
                              <div className="h-4 w-px bg-gray-200"></div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Expected Profit/Loss from Currency:</span>
                                <span className={`font-mono font-semibold ${currencyProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {currencyProfitLoss >= 0 ? '+' : ''}{formatAmount(currencyProfitLoss * AED_TO_INR)}
                                </span>
                              </div>
                              <div className="h-4 w-px bg-gray-200"></div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Pending to Invest:</span>
                                <span className="font-mono font-semibold text-red-600">
                                  {formatAmount(pendingToInvest * AED_TO_INR)}
                                </span>
                              </div>
                            </div>
                            
                            {/* Total Investment Status Bar - shows paid till date */}
                            <div className="pt-3 border-t border-gray-100">
                              <div className="flex items-center gap-4">
                                <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Total Investment:</span>
                                
                                {/* Progress Bar */}
                                <div className="flex-1 relative h-5 bg-gray-100 rounded-full overflow-hidden">
                                  <div 
                                    className="absolute left-0 top-0 h-full bg-green-500 transition-all duration-500"
                                    style={{ width: `${paidPercent}%` }}
                                  />
                                  <div 
                                    className="absolute top-0 h-full bg-blue-500 transition-all duration-500"
                                    style={{ left: `${paidPercent}%`, width: `${pendingPercent}%` }}
                                  />
                                </div>
                                
                                {/* Inline Legend */}
                                <div className="flex items-center gap-4 text-xs whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                                    <span className="text-gray-600">Paid Till Date:</span>
                                    <span className="font-mono font-semibold text-green-700">{formatAmount(totalPaidTillDate * AED_TO_INR)}</span>
                                    <span className="text-gray-400">({paidPercent.toFixed(0)}%)</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                                    <span className="text-gray-600">Pending:</span>
                                    <span className="font-mono font-semibold text-blue-700">{formatAmount(pendingToInvest * AED_TO_INR)}</span>
                                    <span className="text-gray-400">({pendingPercent.toFixed(0)}%)</span>
                                  </div>
                                  <span className="text-gray-500">Total: <span className="font-mono font-semibold">{formatAmount(totalInvestmentAmount * AED_TO_INR)}</span></span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      
                      {/* Holding Report Table - Real Estate */}
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        {/* Table Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-200">
                          <div className="flex items-center gap-3">
                            <Building2 className="h-5 w-5 text-amber-600" />
                            <h3 className="text-lg font-semibold text-gray-800">Holding Report</h3>
                          </div>
                          <div className="flex items-center gap-4">
                            <Button variant="outline" size="sm" className="gap-2">
                              <Download className="h-4 w-4" />
                              DOWNLOAD
                            </Button>
                            <Button variant="outline" size="sm" className="gap-2">
                              <Mail className="h-4 w-4" />
                              EMAIL
                            </Button>
                          </div>
                        </div>
                        
                        {/* Table */}
                        <div>
                          <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Property</th>
                                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Investment</th>
                                <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Area</th>
                                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Sale Amount</th>
                                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Profit</th>
                                <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Exp XIRR</th>
                                <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Act XIRR</th>
                                <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {clientRealEstate.map((property, idx) => {
                                const investmentAmount = property.investment_amount || 0;
                                const expectedSalePrice = property.expected_sale_value || (investmentAmount * 1.4);
                                const schedule = property.payment_schedule || [];
                                const today = new Date();
                                
                                // Get investor's currency preference from allocation or use client's residency
                                const investorCurrency = property.investor_currency || property.currency || 
                                  (clientDetails?.country_of_residency === 'India' ? 'INR' : 'AED');
                                
                                // Currency conversion rates (AED base)
                                const currencyRates = {
                                  AED: 1,
                                  INR: 22.5,
                                  USD: 0.27,
                                  EUR: 0.25,
                                  GBP: 0.21,
                                  CNY: 1.97,
                                  JPY: 40.5,
                                  CHF: 0.24,
                                  CAD: 0.37,
                                  AUD: 0.41,
                                  SGD: 0.36,
                                  HKD: 2.13,
                                  SAR: 1.02,
                                  KWD: 0.083,
                                  QAR: 0.99,
                                  BHD: 0.10,
                                  OMR: 0.10
                                };
                                
                                const currencySymbols = {
                                  AED: 'AED', INR: '₹', USD: '$', EUR: '€', GBP: '£', 
                                  CNY: '¥', JPY: '¥', CHF: 'Fr', CAD: 'C$', AUD: 'A$',
                                  SGD: 'S$', HKD: 'HK$', SAR: 'ريال', KWD: 'د.ك', 
                                  QAR: 'ريال', BHD: 'د.ب.', OMR: 'ريال'
                                };
                                
                                const currentRate = currencyRates[investorCurrency] || 1;
                                const currencySymbol = currencySymbols[investorCurrency] || investorCurrency;
                                
                                // Calculate paid and payable amounts
                                let paidTillDate = 0;
                                let payableInFuture = 0;
                                const actualPaymentDates = [];
                                const expectedPaymentDates = [];
                                
                                schedule.forEach((milestone, i) => {
                                  const milestoneAmount = (milestone.percentage / 100) * investmentAmount;
                                  const milestoneDate = new Date(milestone.date);
                                  
                                  if (i < (property.payments_completed || 0)) {
                                    paidTillDate += milestoneAmount;
                                    // Use actual payment date if available, else milestone date
                                    actualPaymentDates.push({
                                      date: property.actual_payment_dates?.[i] || milestone.date,
                                      amount: -milestoneAmount // Outflow
                                    });
                                  } else {
                                    payableInFuture += milestoneAmount;
                                    // For future payments, use milestone date
                                    actualPaymentDates.push({
                                      date: milestone.date,
                                      amount: -milestoneAmount
                                    });
                                  }
                                  
                                  // Expected dates from developer schedule
                                  expectedPaymentDates.push({
                                    date: milestone.date,
                                    amount: -milestoneAmount
                                  });
                                });
                                
                                // Apartment size details
                                const totalSqft = property.total_area || property.size || 0;
                                const balconyArea = property.balcony_area || 0;
                                const apartmentArea = totalSqft - balconyArea;
                                
                                // Currency depreciation calculation
                                const AED_TO_INR_CURRENT = 22.5;
                                const expectedSaleDate = property.expected_sale_date || property.estimated_sell_date 
                                  ? new Date(property.expected_sale_date || property.estimated_sell_date) 
                                  : new Date(today.getFullYear() + 3, today.getMonth(), today.getDate());
                                const yearsToSale = Math.max(0, (expectedSaleDate.getTime() - today.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                                
                                // INR depreciation rate ~3% per year against AED
                                const depreciationRate = 0.03;
                                
                                // Projected AED to INR rate at sale date
                                const projectedAedToInrAtSale = AED_TO_INR_CURRENT * Math.pow(1 + depreciationRate, yearsToSale);
                                
                                // Helper function to get projected rate for a specific date
                                const getProjectedRateForDate = (date, baseRate = AED_TO_INR_CURRENT) => {
                                  const targetDate = new Date(date);
                                  const yearsFromNow = (targetDate.getTime() - today.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
                                  // If date is in the past, use current rate (or could fetch historical)
                                  if (yearsFromNow <= 0) return baseRate;
                                  // Apply depreciation rate for future dates
                                  return baseRate * Math.pow(1 + depreciationRate, yearsFromNow);
                                };
                                
                                // Calculate amounts with projected rates for each payment milestone
                                let paidAmountInr = 0;  // Actual INR spent (at payment date rates)
                                let payableAmountInr = 0;  // Future INR to be spent (at future rates)
                                let paidAmountAed = 0;
                                let payableAmountAed = 0;
                                
                                const paymentDetails = schedule.map((milestone, i) => {
                                  const milestoneAmountAed = (milestone.percentage / 100) * investmentAmount;
                                  const isPaid = i < (property.payments_completed || 0);
                                  const milestoneDate = new Date(milestone.date);
                                  const rateAtMilestone = getProjectedRateForDate(milestone.date);
                                  
                                  if (isPaid) {
                                    // For paid amounts, use the actual payment date rate
                                    const actualDate = property.actual_payment_dates?.[i] || milestone.date;
                                    const actualRate = getProjectedRateForDate(actualDate);
                                    paidAmountInr += milestoneAmountAed * actualRate;
                                    paidAmountAed += milestoneAmountAed;
                                  } else {
                                    // For future payments, use projected rate at that date
                                    payableAmountInr += milestoneAmountAed * rateAtMilestone;
                                    payableAmountAed += milestoneAmountAed;
                                  }
                                  
                                  return {
                                    ...milestone,
                                    amount: milestoneAmountAed,
                                    projectedRate: rateAtMilestone,
                                    amountInr: milestoneAmountAed * rateAtMilestone,
                                    isPaid
                                  };
                                });
                                
                                // Total investment cost in INR (what client actually pays/will pay)
                                const totalInvestmentInr = paidAmountInr + payableAmountInr;
                                
                                // SCENARIO: Client sells BEFORE completion (remaining payable deducted from sale)
                                // Net Sale Proceeds in AED = Sale Price - Remaining Payable
                                const netSaleProceedsAed = expectedSalePrice - payableAmountAed;
                                
                                // Sale proceeds converted to INR at sale date rate
                                const saleProceedsInr = expectedSalePrice * projectedAedToInrAtSale;
                                
                                // If selling before completion:
                                // - Client has paid: paidAmountAed (cost in INR: paidAmountInr)
                                // - Remaining payable: payableAmountAed (will be deducted from sale)
                                // - Net they receive: (expectedSalePrice - payableAmountAed) in AED, converted at sale date
                                const netSaleProceedsInr = netSaleProceedsAed * projectedAedToInrAtSale;
                                
                                // Profit Calculation:
                                // If client completes all payments: Profit = Sale INR - Total Investment INR
                                // If client sells before completion: Profit = Net Sale INR - Already Paid INR
                                
                                // Property gain in AED (base currency)
                                const profitFromSaleAed = expectedSalePrice - investmentAmount;
                                
                                // Total Profit in INR considering timing of payments:
                                // = What client receives (at sale date rate) - What client paid (at payment date rates)
                                const totalProfitInr = netSaleProceedsInr - paidAmountInr;
                                
                                // Currency benefit = Difference due to rate changes
                                // If all payments were made today: investmentAmount * AED_TO_INR_CURRENT
                                // Actual cost spread over time: totalInvestmentInr (higher due to depreciation)
                                // But sale also benefits: saleProceedsInr vs expectedSalePrice * AED_TO_INR_CURRENT
                                const currencyBenefitOnSale = expectedSalePrice * (projectedAedToInrAtSale - AED_TO_INR_CURRENT);
                                const currencyLossOnPayments = totalInvestmentInr - (investmentAmount * AED_TO_INR_CURRENT);
                                const netCurrencyImpact = currencyBenefitOnSale - currencyLossOnPayments;
                                
                                // For display purposes
                                const paidAmountProjected = paidAmountInr;
                                const payableAmountProjected = payableAmountInr;
                                const totalInvestmentProjected = totalInvestmentInr;
                                const projectedAedToInr = projectedAedToInrAtSale;
                                
                                // XIRR Calculation with Forex impact - all amounts in INR with projected rates
                                const calculateXIRR = (cashflows, guess = 0.1) => {
                                  if (cashflows.length < 2) return null;
                                  
                                  const dates = cashflows.map(cf => new Date(cf.date));
                                  const amounts = cashflows.map(cf => cf.amount);
                                  
                                  // Newton-Raphson method
                                  let rate = guess;
                                  for (let iter = 0; iter < 100; iter++) {
                                    let npv = 0;
                                    let dnpv = 0;
                                    const firstDate = dates[0];
                                    
                                    for (let i = 0; i < amounts.length; i++) {
                                      const years = (dates[i] - firstDate) / (365.25 * 24 * 60 * 60 * 1000);
                                      const pv = amounts[i] / Math.pow(1 + rate, years);
                                      npv += pv;
                                      dnpv -= years * amounts[i] / Math.pow(1 + rate, years + 1);
                                    }
                                    
                                    const newRate = rate - npv / dnpv;
                                    if (Math.abs(newRate - rate) < 0.0001) {
                                      return newRate * 100;
                                    }
                                    rate = newRate;
                                  }
                                  return rate * 100;
                                };
                                
                                // Expected XIRR: Calculate in INR with projected forex rates
                                // Outflows: Each payment in INR at projected rate for that date
                                // Inflow: Sale proceeds in INR at projected rate for sale date
                                const expectedCashflowsInr = [];
                                schedule.forEach((milestone, i) => {
                                  const milestoneAmountAed = (milestone.percentage / 100) * investmentAmount;
                                  const rateAtMilestone = getProjectedRateForDate(milestone.date);
                                  expectedCashflowsInr.push({
                                    date: milestone.date,
                                    amount: -(milestoneAmountAed * rateAtMilestone) // Outflow in INR
                                  });
                                });
                                // Add sale inflow in INR at projected sale date rate
                                expectedCashflowsInr.push({
                                  date: expectedSaleDate.toISOString(),
                                  amount: expectedSalePrice * projectedAedToInrAtSale // Inflow in INR
                                });
                                
                                // Actual XIRR: Based on actual payments made (if any) + future projections
                                const actualCashflowsInr = [];
                                schedule.forEach((milestone, i) => {
                                  const milestoneAmountAed = (milestone.percentage / 100) * investmentAmount;
                                  const isPaid = i < (property.payments_completed || 0);
                                  if (isPaid) {
                                    const actualDate = property.actual_payment_dates?.[i] || milestone.date;
                                    const rateAtPayment = getProjectedRateForDate(actualDate);
                                    actualCashflowsInr.push({
                                      date: actualDate,
                                      amount: -(milestoneAmountAed * rateAtPayment)
                                    });
                                  } else {
                                    const rateAtMilestone = getProjectedRateForDate(milestone.date);
                                    actualCashflowsInr.push({
                                      date: milestone.date,
                                      amount: -(milestoneAmountAed * rateAtMilestone)
                                    });
                                  }
                                });
                                actualCashflowsInr.push({
                                  date: expectedSaleDate.toISOString(),
                                  amount: expectedSalePrice * projectedAedToInrAtSale
                                });
                                
                                const expectedXirr = calculateXIRR(expectedCashflowsInr);
                                const actualXirr = calculateXIRR(actualCashflowsInr);
                                
                                // Format functions
                                const formatINR = (amount) => {
                                  if (Math.abs(amount) >= 10000000) {
                                    return `₹${(amount / 10000000).toFixed(2)} Cr`;
                                  } else if (Math.abs(amount) >= 100000) {
                                    return `₹${(amount / 100000).toFixed(2)} L`;
                                  }
                                  return `₹${new Intl.NumberFormat('en-IN').format(Math.round(amount))}`;
                                };
                                
                                const formatAED = (amount) => {
                                  return `AED ${new Intl.NumberFormat('en-AE').format(Math.round(amount))}`;
                                };
                                
                                return (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    {/* Property Details - compact */}
                                    <td className="px-2 py-2">
                                      <p className="font-semibold text-gray-800 text-xs">{property.building_name || 'Property'}</p>
                                      <p className="text-[10px] text-gray-400">
                                        {property.unit_number || property.apartment_no || 'Unit N/A'} • {property.share_percentage || 100}%
                                      </p>
                                    </td>
                                    
                                    {/* Investment Amount - with payment schedule tooltip */}
                                    <td className="px-2 py-2 text-right">
                                      <div className="cursor-help group/inv relative">
                                        <p className="font-mono font-semibold text-gray-800 text-xs">{formatINR(totalInvestmentProjected)}</p>
                                        <p className="text-[10px]">
                                          <span className="text-emerald-600">Paid: {formatINR(paidAmountProjected)}</span>
                                          <span className="mx-1 text-gray-400">|</span>
                                          <span className="text-blue-600">Due: {formatINR(payableAmountProjected)}</span>
                                        </p>
                                        {/* Payment Schedule Tooltip */}
                                        <div className="absolute hidden group-hover/inv:block left-0 bottom-full mb-2 z-[100] bg-gray-900 text-white text-[10px] rounded-lg shadow-2xl border border-gray-600" style={{width: '380px'}}>
                                          <div className="px-3 py-2 bg-gray-800 rounded-t-lg border-b border-gray-700">
                                            <p className="font-bold text-amber-400">Payment Schedule</p>
                                          </div>
                                          <div className="p-3">
                                            <table className="w-full">
                                              <thead>
                                                <tr className="text-gray-400 border-b border-gray-700">
                                                  <th className="text-left py-1 font-medium">Date</th>
                                                  <th className="text-right py-1 font-medium">AED</th>
                                                  <th className="text-right py-1 font-medium">INR</th>
                                                  <th className="text-center py-1 font-medium">Status</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {schedule.map((milestone, i) => {
                                                  const amt = (milestone.percentage / 100) * investmentAmount;
                                                  const isPaid = i < (property.payments_completed || 0);
                                                  const rate = getProjectedRateForDate(milestone.date);
                                                  return (
                                                    <tr key={i} className={`border-b border-gray-800 ${isPaid ? 'bg-green-900/30' : ''}`}>
                                                      <td className="py-1.5">{new Date(milestone.date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}</td>
                                                      <td className="text-right py-1.5">{new Intl.NumberFormat('en-IN').format(Math.round(amt))}</td>
                                                      <td className="text-right py-1.5 text-amber-400">{new Intl.NumberFormat('en-IN').format(Math.round(amt * rate))}</td>
                                                      <td className="text-center py-1.5">{isPaid ? <span className="text-green-400">✓ Paid</span> : <span className="text-gray-500">Pending</span>}</td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                              <tfoot>
                                                <tr className="font-bold bg-gray-800">
                                                  <td className="py-1.5 text-amber-400">Total</td>
                                                  <td className="text-right py-1.5">{new Intl.NumberFormat('en-IN').format(Math.round(investmentAmount))}</td>
                                                  <td className="text-right py-1.5 text-amber-400">{new Intl.NumberFormat('en-IN').format(Math.round(totalInvestmentProjected))}</td>
                                                  <td className="text-center py-1.5 text-gray-400">{property.payments_completed || 0}/{schedule.length}</td>
                                                </tr>
                                              </tfoot>
                                            </table>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    
                                    {/* Apartment Size */}
                                    <td className="px-2 py-2 text-center">
                                      <p className="font-mono font-semibold text-gray-800 text-xs">{totalSqft.toLocaleString()} sqft</p>
                                      <p className="text-[10px] text-gray-500">
                                        Apt: {apartmentArea.toLocaleString()} | Balcony: {balconyArea.toLocaleString()}
                                      </p>
                                    </td>
                                    
                                    {/* Expected Sale Amount */}
                                    <td className="px-2 py-2 text-right">
                                      <div className="cursor-help group/sale relative">
                                        <p className="font-mono font-semibold text-blue-600 text-xs">{formatINR(expectedSalePrice * projectedAedToInr)}</p>
                                        <p className="text-[10px] text-gray-500">
                                          @₹{projectedAedToInr.toFixed(2)}/AED • {expectedSaleDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                        </p>
                                        {/* Sale Tooltip */}
                                        <div className="absolute hidden group-hover/sale:block right-0 bottom-full mb-2 z-[100] bg-gray-900 text-white text-[10px] rounded-lg shadow-2xl border border-gray-600" style={{width: '220px'}}>
                                          <div className="px-3 py-2 bg-gray-800 rounded-t-lg border-b border-gray-700">
                                            <p className="font-bold text-amber-400">Sale Projection</p>
                                          </div>
                                          <div className="p-3 space-y-1">
                                            <div className="flex justify-between"><span className="text-gray-400">Sale (AED):</span><span>{formatAED(expectedSalePrice)}</span></div>
                                            <div className="flex justify-between"><span className="text-gray-400">Sale Date:</span><span>{expectedSaleDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                                            <div className="flex justify-between"><span className="text-gray-400">Rate @Sale:</span><span>₹{projectedAedToInr.toFixed(2)}/AED</span></div>
                                            <div className="flex justify-between"><span className="text-gray-400">Current Rate:</span><span>₹{AED_TO_INR_CURRENT}/AED</span></div>
                                            <div className="flex justify-between border-t border-gray-700 pt-1 mt-1"><span className="text-gray-400">Sale (INR):</span><span className="text-green-400 font-bold">{formatINR(expectedSalePrice * projectedAedToInr)}</span></div>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    
                                    {/* Total Profit - show Sale | Forex */}
                                    <td className="px-2 py-2 text-right">
                                      <div className="cursor-help group relative">
                                        <p className="font-mono font-semibold text-green-600 text-xs">{formatINR(totalProfitInr)}</p>
                                        <p className="text-[10px]">
                                          <span className="text-gray-500">Sale: {formatINR(profitFromSaleAed * projectedAedToInr)}</span>
                                          <span className="mx-1 text-gray-400">|</span>
                                          <span className={netCurrencyImpact >= 0 ? 'text-amber-600' : 'text-red-500'}>
                                            Forex: {netCurrencyImpact >= 0 ? '+' : ''}{formatINR(netCurrencyImpact)}
                                          </span>
                                        </p>
                                        {/* Tooltip with clear breakdown */}
                                        <div className="absolute hidden group-hover:block right-0 top-full mt-1 z-50 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl border border-gray-700" style={{minWidth: '220px'}}>
                                          <p className="font-bold text-amber-400 border-b border-gray-600 pb-1 mb-2">Profit Breakdown</p>
                                          <div className="space-y-1">
                                            <p><span className="text-gray-400">Property Gain (AED):</span> <span className="float-right">{formatAED(profitFromSaleAed)}</span></p>
                                            <p><span className="text-gray-400">Sale Proceeds (INR):</span> <span className="float-right">{formatINR(saleProceedsInr)}</span></p>
                                            <p><span className="text-gray-400">Total Invested (INR):</span> <span className="float-right text-red-400">-{formatINR(totalInvestmentInr)}</span></p>
                                            <p className="border-t border-gray-600 pt-1 mt-1">
                                              <span className="text-gray-400">Forex Impact:</span> 
                                              <span className={`float-right ${netCurrencyImpact >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {netCurrencyImpact >= 0 ? '+' : ''}{formatINR(netCurrencyImpact)}
                                              </span>
                                            </p>
                                            <p className="font-bold text-green-400 border-t border-gray-600 pt-1 mt-1">
                                              Net Profit: <span className="float-right">{formatINR(totalProfitInr)}</span>
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    
                                    {/* Expected XIRR - with schedule tooltip */}
                                    <td className="px-2 py-2 text-center">
                                      <div className="cursor-help group/expxirr relative inline-block">
                                        <span className={`font-mono font-semibold text-xs ${expectedXirr && expectedXirr > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                          {expectedXirr ? `${expectedXirr.toFixed(2)}%` : '-'}
                                        </span>
                                        {/* Schedule Tooltip */}
                                        <div className="absolute hidden group-hover/expxirr:block right-0 bottom-full mb-2 z-[100] bg-gray-900 text-white text-[10px] rounded-lg shadow-2xl border border-gray-600" style={{width: '340px'}}>
                                          <div className="px-3 py-2 bg-gray-800 rounded-t-lg border-b border-gray-700">
                                            <p className="font-bold text-amber-400">XIRR Schedule (Expected)</p>
                                          </div>
                                          <div className="p-3">
                                            <table className="w-full">
                                              <thead>
                                                <tr className="text-gray-400 border-b border-gray-700">
                                                  <th className="text-left py-1 font-medium">Date</th>
                                                  <th className="text-right py-1 font-medium">AED</th>
                                                  <th className="text-right py-1 font-medium">INR</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {schedule.map((milestone, i) => {
                                                  const amt = (milestone.percentage / 100) * investmentAmount;
                                                  const rate = getProjectedRateForDate(milestone.date);
                                                  return (
                                                    <tr key={i} className="border-b border-gray-800">
                                                      <td className="py-1.5">{new Date(milestone.date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}</td>
                                                      <td className="text-right py-1.5 text-red-400">{new Intl.NumberFormat('en-IN').format(Math.round(amt))}</td>
                                                      <td className="text-right py-1.5 text-red-400">{new Intl.NumberFormat('en-IN').format(Math.round(amt * rate))}</td>
                                                    </tr>
                                                  );
                                                })}
                                                <tr className="border-b border-gray-700 bg-green-900/30">
                                                  <td className="py-1.5 text-green-400 font-semibold">{expectedSaleDate.toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})} (Sale)</td>
                                                  <td className="text-right py-1.5 text-green-400">-{new Intl.NumberFormat('en-IN').format(Math.round(expectedSalePrice))}</td>
                                                  <td className="text-right py-1.5 text-green-400">-{new Intl.NumberFormat('en-IN').format(Math.round(expectedSalePrice * projectedAedToInr))}</td>
                                                </tr>
                                              </tbody>
                                              <tfoot>
                                                <tr className="font-bold bg-gray-800">
                                                  <td className="py-1.5 text-amber-400">XIRR</td>
                                                  <td className="text-right py-1.5">{(() => {
                                                    const cf = schedule.map(m => ({ date: m.date, amount: -((m.percentage / 100) * investmentAmount) }));
                                                    cf.push({ date: expectedSaleDate.toISOString(), amount: expectedSalePrice });
                                                    const x = calculateXIRR(cf);
                                                    return x ? `${x.toFixed(1)}%` : '-';
                                                  })()}</td>
                                                  <td className="text-right py-1.5 text-green-400">{expectedXirr ? `${expectedXirr.toFixed(1)}%` : '-'}</td>
                                                </tr>
                                              </tfoot>
                                            </table>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    
                                    {/* Actual XIRR - with schedule tooltip */}
                                    <td className="px-2 py-2 text-center">
                                      <div className="cursor-help group/actxirr relative inline-block">
                                        <span className={`font-mono font-semibold text-xs ${actualXirr && actualXirr > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                          {actualXirr ? `${actualXirr.toFixed(2)}%` : '-'}
                                        </span>
                                        {/* Schedule Tooltip */}
                                        <div className="absolute hidden group-hover/actxirr:block right-0 bottom-full mb-2 z-[100] bg-gray-900 text-white text-[10px] rounded-lg shadow-2xl border border-gray-600" style={{width: '360px'}}>
                                          <div className="px-3 py-2 bg-gray-800 rounded-t-lg border-b border-gray-700">
                                            <p className="font-bold text-amber-400">XIRR Schedule (Actual)</p>
                                            <p className="text-gray-400 text-[9px]">{property.payments_completed || 0}/{schedule.length} payments completed</p>
                                          </div>
                                          <div className="p-3">
                                            <table className="w-full">
                                              <thead>
                                                <tr className="text-gray-400 border-b border-gray-700">
                                                  <th className="text-left py-1 font-medium">Date</th>
                                                  <th className="text-right py-1 font-medium">AED</th>
                                                  <th className="text-right py-1 font-medium">INR</th>
                                                  <th className="text-center py-1 font-medium">Status</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {schedule.map((milestone, i) => {
                                                  const amt = (milestone.percentage / 100) * investmentAmount;
                                                  const isPaid = i < (property.payments_completed || 0);
                                                  const actualDate = isPaid ? (property.actual_payment_dates?.[i] || milestone.date) : milestone.date;
                                                  const rate = getProjectedRateForDate(actualDate);
                                                  return (
                                                    <tr key={i} className={`border-b border-gray-800 ${isPaid ? 'bg-green-900/30' : ''}`}>
                                                      <td className="py-1.5">{new Date(actualDate).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}</td>
                                                      <td className="text-right py-1.5 text-red-400">{new Intl.NumberFormat('en-IN').format(Math.round(amt))}</td>
                                                      <td className="text-right py-1.5 text-red-400">{new Intl.NumberFormat('en-IN').format(Math.round(amt * rate))}</td>
                                                      <td className="text-center py-1.5">{isPaid ? <span className="text-green-400">✓</span> : <span className="text-gray-500">-</span>}</td>
                                                    </tr>
                                                  );
                                                })}
                                                <tr className="border-b border-gray-700 bg-green-900/30">
                                                  <td className="py-1.5 text-green-400 font-semibold">{expectedSaleDate.toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})} (Sale)</td>
                                                  <td className="text-right py-1.5 text-green-400">-{new Intl.NumberFormat('en-IN').format(Math.round(expectedSalePrice))}</td>
                                                  <td className="text-right py-1.5 text-green-400">-{new Intl.NumberFormat('en-IN').format(Math.round(expectedSalePrice * projectedAedToInr))}</td>
                                                  <td className="text-center py-1.5 text-gray-500">-</td>
                                                </tr>
                                              </tbody>
                                              <tfoot>
                                                <tr className="font-bold bg-gray-800">
                                                  <td className="py-1.5 text-amber-400">XIRR</td>
                                                  <td className="text-right py-1.5">{(() => {
                                                    const cf = schedule.map((m, i) => {
                                                      const isPaid = i < (property.payments_completed || 0);
                                                      return { date: isPaid ? (property.actual_payment_dates?.[i] || m.date) : m.date, amount: -((m.percentage / 100) * investmentAmount) };
                                                    });
                                                    cf.push({ date: expectedSaleDate.toISOString(), amount: expectedSalePrice });
                                                    const x = calculateXIRR(cf);
                                                    return x ? `${x.toFixed(1)}%` : '-';
                                                  })()}</td>
                                                  <td className="text-right py-1.5 text-green-400">{actualXirr ? `${actualXirr.toFixed(1)}%` : '-'}</td>
                                                  <td></td>
                                                </tr>
                                              </tfoot>
                                            </table>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    
                                    {/* Action - compact */}
                                    <td className="px-2 py-2 text-center">
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        className="bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 text-xs px-2 py-1"
                                        onClick={() => {
                                          const prefix = user?.role === 'broker' ? '/broker' : user?.role === 'sub_broker' ? '/sub-broker' : '/client';
                                          window.location.href = `${prefix}/real-estate/${property.opportunity_id || property.id}?from=holdings`;
                                        }}
                                      >
                                        View
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
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
                    // Use GROSS values for consistency (principal + interest, before TDS)
                    // gross_repaid = repaid_principal + repaid_interest (what was actually received gross)
                    // gross_upcoming = upcoming future principal + interest (what's still due gross)
                    const totalReceived = filteredHoldings.reduce((sum, h) => {
                      // Use gross_repaid if available, otherwise calculate from components
                      const grossRepaid = h.gross_repaid || ((h.repaid_principal || 0) + (h.repaid_interest || 0));
                      return sum + grossRepaid;
                    }, 0);
                    const totalOutstanding = filteredHoldings.reduce((sum, h) => {
                      // Use gross_upcoming if available, otherwise use upcoming_expected
                      return sum + (h.gross_upcoming || h.upcoming_expected || 0);
                    }, 0);
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
                        <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Repaid</th>
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
                        
                        // Repaid amounts (principal + interest)
                        const repaidPrincipal = holding.repaid_principal || 0;
                        const repaidInterest = holding.repaid_interest || 0;
                        const totalRepaid = repaidPrincipal + repaidInterest;
                        
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
                            <p className="text-blue-700 font-semibold">{formatNum(totalRepaid)}</p>
                            <div className="text-[10px] text-gray-500">
                              <span title="Principal Repaid">P: {formatNum(repaidPrincipal)}</span>
                              <span className="mx-1">|</span>
                              <span title="Interest Repaid">I: {formatNum(repaidInterest)}</span>
                            </div>
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
      </main>
      
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
