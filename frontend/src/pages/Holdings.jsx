import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Search, Download, Mail, Check, X, FileText, Users, TrendingUp, DollarSign, MoreVertical, Eye, Calendar, User, MapPin, Building2, CreditCard, UserCheck, ClipboardList, FileImage, Upload, AlertCircle, CheckCircle, Clock, XCircle, Send, ArrowRight, IndianRupee, RefreshCw, Calculator, ExternalLink, ChevronDown, Filter } from "lucide-react";
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
import * as XLSX from "xlsx";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TradeLogsWithBifurcation, STATUS_CONFIG } from "@/pages/TradeLogs";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Round down to nearest 100
const roundToHundred = (amount) => {
  if (!amount || amount <= 0) return 0;
  return Math.floor(amount / 100) * 100;
};

// Format currency for Indian Rupees
const formatCurrency = (amount) => amount?.toLocaleString('en-IN') || '0';

// XIRR (Newton-Raphson). Accepts [{date:'YYYY-MM-DD', amount:Number}, ...]
// Returns percentage (e.g. 11.50) or null if not solvable.
const computeXirr = (cfs, guess = 0.1) => {
  if (!cfs || cfs.length < 2) return null;
  const hasPos = cfs.some(c => c.amount > 0);
  const hasNeg = cfs.some(c => c.amount < 0);
  if (!hasPos || !hasNeg) return null;
  const sorted = [...cfs].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = new Date(sorted[0].date);
  const years = sorted.map(c => (new Date(c.date) - t0) / (1000 * 60 * 60 * 24 * 365));
  let r = guess;
  for (let iter = 0; iter < 100; iter++) {
    let f = 0, df = 0;
    for (let i = 0; i < sorted.length; i++) {
      const v = sorted[i].amount;
      const t = years[i];
      const denom = Math.pow(1 + r, t);
      if (!isFinite(denom) || denom === 0) return null;
      f += v / denom;
      df -= (t * v) / (denom * (1 + r));
    }
    if (Math.abs(f) < 1e-4) return r * 100;
    if (df === 0) return null;
    const rNew = r - f / df;
    if (!isFinite(rNew)) return null;
    if (Math.abs(rNew - r) < 1e-7) return rNew * 100;
    r = rNew;
  }
  return null;
};

// XIRR Calculation - moved outside component for performance
const calculateXIRR = (cashflows, guess = 0.1) => {
  if (!cashflows || cashflows.length < 2) return null;
  
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

// Static currency data - moved outside component
const CURRENCY_RATES = {
  AED: 1, INR: 22.5, USD: 0.27, EUR: 0.25, GBP: 0.21, CNY: 1.97,
  JPY: 40.5, CHF: 0.24, CAD: 0.37, AUD: 0.41, SGD: 0.36, HKD: 2.13,
  SAR: 1.02, KWD: 0.083, QAR: 0.99, BHD: 0.10, OMR: 0.10
};

const CURRENCY_SYMBOLS = {
  AED: 'AED', INR: '₹', USD: '$', EUR: '€', GBP: '£', CNY: '¥',
  JPY: '¥', CHF: 'Fr', CAD: 'C$', AUD: 'A$', SGD: 'S$', HKD: 'HK$',
  SAR: 'ريال', KWD: 'د.ك', QAR: 'ريال', BHD: 'د.ب.', OMR: 'ريال'
};

const AED_TO_INR_CURRENT = 22.5;
const DEPRECIATION_RATE = 0.03;

// Helper function for projected rate - uses actual projected rates if available, falls back to depreciation
const getProjectedRateForDate = (date, projectedRates = null, baseRate = AED_TO_INR_CURRENT, today = new Date()) => {
  const targetDate = new Date(date);
  const targetYear = targetDate.getFullYear();
  
  // If we have projected rates from the API, use them
  if (projectedRates && projectedRates[targetYear]) {
    return projectedRates[targetYear];
  }
  
  // Fallback to depreciation calculation
  const yearsFromNow = (targetDate.getTime() - today.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (yearsFromNow <= 0) return baseRate;
  return baseRate * Math.pow(1 + DEPRECIATION_RATE, yearsFromNow);
};

// Pre-compute property financials - memoizable helper
const computePropertyFinancials = (property, clientResidency, projectedRates = null, currentRate = AED_TO_INR_CURRENT) => {
  const today = new Date();
  
  // Apply share_percentage to get client's portion of the property
  const sharePercentage = (property.share_percentage || 100) / 100;
  
  // Full property values (100% ownership). unit_price is the base cost;
  // DLD + Admin (+ Broker/Other) fees are upfront add-ons charged on Day-0.
  // NOTE: do NOT source fullUnitPrice from `investment_amount` — that field
  // holds the investor's already-share-adjusted slice of `total_cost` and
  // would cause double-adjustment here.
  const fullUnitPrice = property.unit_price || 0;
  const fullDldFee = property.dld_fee || (fullUnitPrice * (property.dld_fee_percentage || 0) / 100) || 0;
  const fullAdminFee = property.admin_fee || 0;
  const fullBrokerFee = property.broker_fee || 0;
  const fullOtherFees = property.other_fees || 0;
  const fullTotalCost = fullUnitPrice + fullDldFee + fullAdminFee + fullBrokerFee + fullOtherFees;
  const fullExpectedSalePrice = property.expected_sale_value || (fullUnitPrice * 1.4);
  
  // Client's actual amounts based on their share
  const unitPriceAed = fullUnitPrice * sharePercentage;
  const dldFeeAed = fullDldFee * sharePercentage;
  const adminFeeAed = fullAdminFee * sharePercentage;
  const brokerFeeAed = fullBrokerFee * sharePercentage;
  const otherFeesAed = fullOtherFees * sharePercentage;
  const upfrontFeesAed = dldFeeAed + adminFeeAed + brokerFeeAed + otherFeesAed;
  const totalCostAed = fullTotalCost * sharePercentage; // Total investment including fees
  const expectedSalePrice = fullExpectedSalePrice * sharePercentage;
  
  // Payment schedule percentages are applied to unit_price (base cost),
  // not to total_cost — fees sit outside the schedule as Day-0 upfront.
  const investmentAmount = unitPriceAed;
  
  const schedule = property.payment_schedule || [];
  
  const investorCurrency = property.investor_currency || property.currency || 
    (clientResidency === 'India' ? 'INR' : 'AED');
  
  const expectedSaleDate = property.expected_sale_date || property.estimated_sell_date 
    ? new Date(property.expected_sale_date || property.estimated_sell_date) 
    : new Date(today.getFullYear() + 3, today.getMonth(), today.getDate());
  
  // Use actual projected rate for sale date year if available
  const saleYear = expectedSaleDate.getFullYear();
  const projectedAedToInrAtSale = projectedRates && projectedRates[saleYear] 
    ? projectedRates[saleYear]
    : (() => {
        const yearsToSale = Math.max(0, (expectedSaleDate.getTime() - today.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        return currentRate * Math.pow(1 + DEPRECIATION_RATE, yearsToSale);
      })();
  
  // Handover date
  const handoverDate = property.handover_date 
    ? new Date(property.handover_date) 
    : (schedule.length > 0 ? new Date(schedule[schedule.length - 1].date) : expectedSaleDate);
  
  const isSellingBeforeCompletion = expectedSaleDate < handoverDate;
  
  // Calculate payments from schedule (apply share percentage to each payment)
  let paidAmountInr = 0, payableAmountInr = 0, paidAmountAed = 0, payableAmountAed = 0;
  let paymentsAfterSaleAed = 0;
  
  schedule.forEach((milestone, i) => {
    // Milestone % applies to unit_price. Day-0 milestone (i===0) also
    // carries the upfront DLD + Admin + Broker + Other fees.
    const baseMilestoneAed = (milestone.percentage / 100) * investmentAmount;
    const milestoneAmountAed = baseMilestoneAed + (i === 0 ? upfrontFeesAed : 0);
    const isPaid = i < (property.payments_completed || 0);
    const milestoneDate = new Date(milestone.date);
    const rateAtMilestone = getProjectedRateForDate(milestone.date, projectedRates, currentRate, today);
    
    if (isPaid) {
      const actualDate = property.actual_payment_dates?.[i] || milestone.date;
      const actualRate = getProjectedRateForDate(actualDate, projectedRates, currentRate, today);
      paidAmountInr += milestoneAmountAed * actualRate;
      paidAmountAed += milestoneAmountAed;
    } else {
      payableAmountInr += milestoneAmountAed * rateAtMilestone;
      payableAmountAed += milestoneAmountAed;
      if (isSellingBeforeCompletion && milestoneDate > expectedSaleDate) {
        paymentsAfterSaleAed += milestoneAmountAed;
      }
    }
  });
  
  // Total investment including DLD and Admin fees (converted to INR at current rate for display)
  const totalInvestmentAed = totalCostAed;
  const totalInvestmentInr = totalCostAed * currentRate; // Use current rate for investment display
  
  // Payment schedule totals (for paid/due breakdown)
  const paidFromScheduleInr = paidAmountInr;
  const payableFromScheduleInr = payableAmountInr;
  
  const netSaleProceedsAed = expectedSalePrice - payableAmountAed;
  const netSaleProceedsInr = netSaleProceedsAed * projectedAedToInrAtSale;
  
  // Property profit in AED (pure property gain without forex)
  const profitFromSaleAed = expectedSalePrice - totalCostAed;
  // Property profit in INR at current rate (without forex impact)
  const profitFromSaleInrNoForex = profitFromSaleAed * currentRate;
  
  // Sale proceeds in INR at projected rate
  const saleProceedsInr = expectedSalePrice * projectedAedToInrAtSale;
  
  // Forex impact calculation
  // Forex benefit on sale = Sale value × (future rate - current rate)
  const forexImpactOnSale = expectedSalePrice * (projectedAedToInrAtSale - currentRate);
  
  // Total profit in INR = Sale proceeds - Total investment at projected rates
  // But for cleaner display: Total Profit = Property Profit (no forex) + Forex Impact
  const totalProfitInr = profitFromSaleInrNoForex + forexImpactOnSale;
  
  const currencyBenefitOnSale = expectedSalePrice * (projectedAedToInrAtSale - currentRate);
  const currencyLossOnPayments = totalInvestmentInr - (investmentAmount * currentRate);
  const netCurrencyImpact = currencyBenefitOnSale - currencyLossOnPayments;
  
  // XIRR Cashflows
  const netSaleValueForXirr = isSellingBeforeCompletion 
    ? (expectedSalePrice - paymentsAfterSaleAed)
    : expectedSalePrice;
  
  const expectedCashflowsInr = [];
  const actualCashflowsInr = [];
  
  schedule.forEach((milestone, i) => {
    const milestoneDate = new Date(milestone.date);
    const baseMilestoneAed = (milestone.percentage / 100) * investmentAmount;
    const milestoneAmountAed = baseMilestoneAed + (i === 0 ? upfrontFeesAed : 0);
    const isPaid = i < (property.payments_completed || 0);
    
    // Expected cashflows
    if (!(isSellingBeforeCompletion && milestoneDate > expectedSaleDate)) {
      const rateAtMilestone = getProjectedRateForDate(milestone.date, projectedRates, currentRate, today);
      expectedCashflowsInr.push({ date: milestone.date, amount: -(milestoneAmountAed * rateAtMilestone) });
    }
    
    // Actual cashflows
    if (!(isSellingBeforeCompletion && !isPaid && milestoneDate > expectedSaleDate)) {
      if (isPaid) {
        const actualDate = property.actual_payment_dates?.[i] || milestone.date;
        const rateAtPayment = getProjectedRateForDate(actualDate, projectedRates, currentRate, today);
        actualCashflowsInr.push({ date: actualDate, amount: -(milestoneAmountAed * rateAtPayment) });
      } else {
        const rateAtMilestone = getProjectedRateForDate(milestone.date, projectedRates, currentRate, today);
        actualCashflowsInr.push({ date: milestone.date, amount: -(milestoneAmountAed * rateAtMilestone) });
      }
    }
  });
  
  expectedCashflowsInr.push({ date: expectedSaleDate.toISOString(), amount: netSaleValueForXirr * projectedAedToInrAtSale });
  actualCashflowsInr.push({ date: expectedSaleDate.toISOString(), amount: netSaleValueForXirr * projectedAedToInrAtSale });
  
  const expectedXirr = calculateXIRR(expectedCashflowsInr);
  const actualXirr = calculateXIRR(actualCashflowsInr);
  
  // Area details
  const totalSqft = property.total_area || property.size || 0;
  const balconyArea = property.balcony_area || 0;
  const apartmentArea = totalSqft - balconyArea;
  
  return {
    // Investment values
    investmentAmount, // Unit price only (for payment schedule calculations)
    totalCostAed, // Total cost including DLD + Admin fees (for display)
    totalInvestmentInr, // Total investment in INR at current rate
    totalInvestmentAed,
    unitPriceAed, dldFeeAed, adminFeeAed, brokerFeeAed, otherFeesAed, upfrontFeesAed,
    
    // Sale values
    expectedSalePrice, saleProceedsInr,
    
    // Payment schedule breakdown
    paidAmountInr, payableAmountInr, paidAmountAed, payableAmountAed,
    paidFromScheduleInr, payableFromScheduleInr,
    
    // Profit calculations
    profitFromSaleAed, // Pure property gain in AED
    profitFromSaleInrNoForex, // Property gain in INR without forex impact (Sale - displayed in Profit column)
    forexImpactOnSale, // Forex impact (displayed in Profit column)
    totalProfitInr, // Total profit = profitFromSaleInrNoForex + forexImpactOnSale
    
    // Other values
    schedule, investorCurrency,
    expectedSaleDate, projectedAedToInrAtSale, handoverDate, isSellingBeforeCompletion,
    paymentsAfterSaleAed, netSaleProceedsAed, netSaleProceedsInr,
    netCurrencyImpact: forexImpactOnSale, // Use forex impact for display
    netSaleValueForXirr, expectedXirr, actualXirr, 
    totalSqft, balconyArea, apartmentArea,
    currentRate: CURRENCY_RATES[investorCurrency] || 1,
    currencySymbol: CURRENCY_SYMBOLS[investorCurrency] || investorCurrency
  };
};

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
          bond_code: trade.bond_code || trade.ucc || trade.target_ucc,
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
              <span className="font-medium text-gray-800">Reinv Logs</span>
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
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">NCD Name</th>
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
                                {cfGroup.bond_code && cfGroup.bond_code !== cfGroup.bond_name && (
                                  <div className="text-xs text-gray-500 font-mono">{cfGroup.bond_code}</div>
                                )}
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

// Trades Tab Content with Sub-tabs (Historical Repayments / Expected Repayments / Investment)
//
// Helpers used by the per-tab "Download" buttons. Builds a small .xlsx with
// one sheet and a Total row, mirroring the totals shown in the UI footer so
// the spreadsheet matches what the user sees on screen.
const _safeName = (s) => (s || 'client').toString().replace(/[^a-z0-9_]+/gi, '_').slice(0, 40);
const _ts = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
};
const _fmtDate = (d) => {
  if (!d) return '';
  try { return format(new Date(d), 'dd-MMM-yy'); } catch { return ''; }
};

const downloadRepaymentsExcel = (rows, selectedClient) => {
  if (!rows?.length) return;
  const sheetRows = rows.map((r, i) => ({
    'Sr No':          i + 1,
    'Repayment Date': _fmtDate(r.repayment_date),
    'NCD Name':       r.bond_name || '',
    'Bond Code':      r.bond_code || '',
    'Principal':      Number(r.principal || 0),
    'Interest':       Number(r.interest || 0),
    'Gross':          Number(r.gross_amount || 0),
    'TDS':            Number(r.tds || 0),
    'Net':            Number(r.net_amount || 0),
  }));
  const totals = rows.reduce((acc, r) => ({
    principal: acc.principal + Number(r.principal || 0),
    interest:  acc.interest  + Number(r.interest  || 0),
    gross:     acc.gross     + Number(r.gross_amount || 0),
    tds:       acc.tds       + Number(r.tds || 0),
    net:       acc.net       + Number(r.net_amount || 0),
  }), { principal: 0, interest: 0, gross: 0, tds: 0, net: 0 });
  sheetRows.push({
    'Sr No': '', 'Repayment Date': 'Total', 'NCD Name': '', 'Bond Code': '',
    'Principal': totals.principal, 'Interest': totals.interest,
    'Gross': totals.gross, 'TDS': totals.tds, 'Net': totals.net,
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), 'Historical Repayments');
  XLSX.writeFile(wb, `historical_repayments_${_safeName(selectedClient?.name || selectedClient?.client_name)}_${_ts()}.xlsx`);
};

const downloadExpectedExcel = (rows, selectedClient) => {
  if (!rows?.length) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sheetRows = rows.map((r, i) => {
    const dt = r.expected_date ? new Date(r.expected_date) : null;
    return {
      'Sr No':         i + 1,
      'Expected Date': _fmtDate(r.expected_date),
      'Overdue?':      (dt && dt.getTime() < today.getTime()) ? 'Yes' : '',
      'NCD Name':      r.bond_name || '',
      'Bond Code':     r.bond_code || '',
      'Type':          r.type || 'repayment',
      'Principal':     Number(r.principal_component || 0),
      'Interest':      Number(r.interest_component || 0),
      'Gross':         Number(r.gross_amount || 0),
      'TDS':           Number(r.tds_amount || 0),
      'Net':           Number(r.net_amount || 0),
    };
  });
  const totals = rows.reduce((acc, r) => ({
    principal: acc.principal + Number(r.principal_component || 0),
    interest:  acc.interest  + Number(r.interest_component  || 0),
    gross:     acc.gross     + Number(r.gross_amount || 0),
    tds:       acc.tds       + Number(r.tds_amount || 0),
    net:       acc.net       + Number(r.net_amount || 0),
  }), { principal: 0, interest: 0, gross: 0, tds: 0, net: 0 });
  sheetRows.push({
    'Sr No': '', 'Expected Date': 'Total', 'Overdue?': '', 'NCD Name': '',
    'Bond Code': '', 'Type': '',
    'Principal': totals.principal, 'Interest': totals.interest,
    'Gross': totals.gross, 'TDS': totals.tds, 'Net': totals.net,
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), 'Expected Repayments');
  XLSX.writeFile(wb, `expected_repayments_${_safeName(selectedClient?.name || selectedClient?.client_name)}_${_ts()}.xlsx`);
};

const TradesTabContent = ({ trades, selectedClient, formatINR, controlledTab = null, onTabChange = null, hideNav = false }) => {
  // When `controlledTab` is provided the parent owns the active-tab state
  // (e.g. when NCD's outer 5-button nav is driving the selection). We still
  // keep an internal fallback so the component works standalone.
  const [internalSubTab, setInternalSubTab] = React.useState("investment");
  const activeSubTab = controlledTab ?? internalSubTab;
  const setActiveSubTab = (v) => {
    if (onTabChange) onTabChange(v);
    if (controlledTab === null) setInternalSubTab(v);
  };
  const [searchTerm, setSearchTerm] = React.useState("");
  const [emailSyncing, setEmailSyncing] = React.useState(false);

  // Blocked unit trades (Investment sub-tab)
  const blockedUnitTrades = trades.filter(t => !t.is_reinvestment_log && t.source !== 'reinvestment');

  // Historical Repayments sub-tab data (fetched from Ncd_Repayments)
  const [repayments, setRepayments] = React.useState([]);
  const [repaymentsLoading, setRepaymentsLoading] = React.useState(false);
  // Expected Repayments sub-tab data (fetched from Ncd_Expected_Repayments)
  const [expected, setExpected] = React.useState([]);
  const [expectedLoading, setExpectedLoading] = React.useState(false);
  // Reinv Logs sub-tab data (fetched from reinvestment_logs, client-filtered)
  const [reinvLogsData, setReinvLogsData] = React.useState([]);
  const [reinvLogsLoading, setReinvLogsLoading] = React.useState(false);

  const fetchRepayments = React.useCallback(async () => {
    if (!selectedClient?.id) { setRepayments([]); return; }
    try {
      setRepaymentsLoading(true);
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/ncd-repayments`, {
        params: { client_id: selectedClient.id, limit: 2000 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setRepayments(res.data?.rows || []);
    } catch (e) {
      setRepayments([]);
    } finally {
      setRepaymentsLoading(false);
    }
  }, [selectedClient?.id]);

  const fetchExpected = React.useCallback(async () => {
    if (!selectedClient?.id) { setExpected([]); return; }
    try {
      setExpectedLoading(true);
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/ncd-expected-repayments`, {
        params: { client_id: selectedClient.id, limit: 2000 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setExpected(res.data?.rows || []);
    } catch (e) {
      setExpected([]);
    } finally {
      setExpectedLoading(false);
    }
  }, [selectedClient?.id]);

  React.useEffect(() => { fetchRepayments(); fetchExpected(); }, [fetchRepayments, fetchExpected]);

  // Reinv Logs — client-filtered view of `reinvestment_logs` (same data that
  // powers Logs → Reinv Logs), so the broker/client can audit every split
  // allocation created for this client directly inside Holdings → Trades.
  const fetchReinvLogs = React.useCallback(async () => {
    if (!selectedClient?.id) { setReinvLogsData([]); return; }
    try {
      setReinvLogsLoading(true);
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/reinvestment-logs`, {
        params: { client_id: selectedClient.id },
        headers: { Authorization: `Bearer ${token}` },
      });
      setReinvLogsData(Array.isArray(res.data) ? res.data : (res.data?.rows || []));
    } catch (e) {
      setReinvLogsData([]);
    } finally {
      setReinvLogsLoading(false);
    }
  }, [selectedClient?.id]);

  React.useEffect(() => {
    if (activeSubTab === 'reinv-logs') fetchReinvLogs();
  }, [activeSubTab, fetchReinvLogs]);

  const handleEmailReader = async () => {
    if (emailSyncing) return;
    setEmailSyncing(true);
    const toastId = toast.loading("Reading repayment emails…");
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(`${API}/ncd-repayments/sync-from-email`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const r = res.data || {};
      const created = r.created ?? r.inserted ?? 0;
      const matched = r.matched ?? r.processed ?? 0;
      toast.success(`Email sync done — ${created} new, ${matched} matched`, { id: toastId });
      await Promise.all([fetchRepayments(), fetchExpected()]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Email sync failed", { id: toastId });
    } finally {
      setEmailSyncing(false);
    }
  };

  // Filter rows based on search term (case-insensitive, across useful fields)
  const q = searchTerm.trim().toLowerCase();
  const matches = (val) => (val || '').toString().toLowerCase().includes(q);
  const filteredRepayments = !q ? repayments : repayments.filter(r =>
    matches(r.bond_name) || matches(r.bond_code) || matches(r.opportunity_id) ||
    matches(r.repayment_date) || matches(r.client_name)
  );
  const filteredExpected = !q ? expected : expected.filter(r =>
    matches(r.bond_name) || matches(r.bond_code) || matches(r.expected_date) || matches(r.type)
  );
  const filteredBlockedUnits = !q ? blockedUnitTrades : blockedUnitTrades.filter(t =>
    matches(t.bond_name) || matches(t.bond_code) || matches(t.ucc) ||
    matches(t.investment_date) || matches(t.payment_reference) || matches(t.status)
  );

  return (
    <div className="space-y-4">
      {/* Sub-tabs + Search Bar + Email Reader.
          When `hideNav` is true (controlled mode) the parent renders the
          5-button NCD nav; we still keep the search/email-reader inline so
          they stay close to the table they affect. */}
      <div className={`flex items-center justify-${hideNav ? 'end' : 'between'} gap-3 ${hideNav ? '' : 'border-b border-gray-200 pb-2'} flex-wrap`}>
        {!hideNav && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveSubTab("investment")}
            data-testid="trades-subtab-investment"
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeSubTab === "investment"
                ? "bg-green-100 text-green-700 border-b-2 border-green-600"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Investment
            </div>
          </button>
          <button
            onClick={() => setActiveSubTab("reinv-logs")}
            data-testid="trades-subtab-reinv-logs"
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeSubTab === "reinv-logs"
                ? "bg-purple-100 text-purple-700 border-b-2 border-purple-600"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
            }`}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Reinv Tag
            </div>
          </button>
          <button
            onClick={() => setActiveSubTab("repayments")}
            data-testid="trades-subtab-repayments"
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeSubTab === "repayments"
                ? "bg-blue-100 text-blue-700 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
            }`}
          >
            <div className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4" />
              Historical Repayments
            </div>
          </button>
          <button
            onClick={() => setActiveSubTab("expected")}
            data-testid="trades-subtab-expected"
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeSubTab === "expected"
                ? "bg-amber-100 text-amber-800 border-b-2 border-amber-600"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Expected Repayments
            </div>
          </button>
        </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              type="text"
              placeholder={activeSubTab === "investment"
                ? "Search by NCD name, bond code, UTR, status…"
                : "Search by NCD name, bond code, date…"}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9 text-sm"
              data-testid="trades-search-input"
            />
          </div>
          {(activeSubTab === "repayments" || activeSubTab === "expected") && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEmailReader}
              disabled={emailSyncing}
              className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700"
              data-testid="trades-email-reader-btn"
              title="Read repayment emails now (in addition to the 10:00 / 18:00 IST scheduled runs)"
            >
              {emailSyncing ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
              {emailSyncing ? 'Reading…' : 'Email Reader'}
            </Button>
          )}
          {activeSubTab === "repayments" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadRepaymentsExcel(filteredRepayments, selectedClient)}
              disabled={!filteredRepayments?.length}
              className="border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700"
              data-testid="repayments-download-btn"
              title="Download visible Historical Repayments as Excel"
            >
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
          )}
          {activeSubTab === "expected" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadExpectedExcel(filteredExpected, selectedClient)}
              disabled={!filteredExpected?.length}
              className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700"
              data-testid="expected-download-btn"
              title="Download visible Expected Repayments as Excel"
            >
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
          )}
        </div>
      </div>

      {/* Historical Repayments Sub-tab Content */}
      {activeSubTab === "repayments" && (
        <RepaymentsTable
          rows={filteredRepayments}
          loading={repaymentsLoading}
          formatINR={formatINR}
        />
      )}

      {/* Expected Repayments Sub-tab Content */}
      {activeSubTab === "expected" && (
        <ExpectedRepaymentsTable
          rows={filteredExpected}
          loading={expectedLoading}
          formatINR={formatINR}
        />
      )}

      {/* Investment (Blocked Units) Sub-tab Content */}
      {activeSubTab === "investment" && (
        <InvestmentTradesTable
          trades={filteredBlockedUnits}
          selectedClient={selectedClient}
          formatINR={formatINR}
        />
      )}

      {/* Reinv Logs Sub-tab Content — mirrors Logs → Reinv Logs but filtered
          to the selected client. Reuses the same `TradeLogsWithBifurcation`
          component so the table layout stays identical. */}
      {activeSubTab === "reinv-logs" && (
        reinvLogsLoading ? (
          <div className="text-center py-12 bg-white rounded-lg border" data-testid="reinv-logs-loading">
            <RefreshCw className="h-8 w-8 text-gray-300 mx-auto mb-3 animate-spin" />
            <p className="text-gray-500">Loading reinvestment logs…</p>
          </div>
        ) : (!reinvLogsData || reinvLogsData.length === 0) ? (
          <div className="text-center py-12 bg-white rounded-lg border" data-testid="reinv-logs-empty">
            <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No reinvestment logs found for this client</p>
            <p className="text-gray-400 text-sm mt-1">Tagged entries approved or submitted will appear here</p>
          </div>
        ) : (
          <TradeLogsWithBifurcation
            logs={(q ? reinvLogsData.filter(l =>
              (l.bond_name || '').toLowerCase().includes(q) ||
              (l.ucc || l.target_ucc || '').toLowerCase().includes(q) ||
              (l.portfolio || l.portfolio_category || '').toLowerCase().includes(q) ||
              (l.approval_status || '').toLowerCase().includes(q)
            ) : reinvLogsData)}
            formatDate={(date) => date ? format(new Date(date), "dd MMM yyyy") : "-"}
            formatCurrency={(amount) => amount?.toLocaleString('en-IN') || '0'}
            getStatusBadge={(status) => {
              const cfg = STATUS_CONFIG[status] || { label: status || '-', color: 'bg-gray-100 text-gray-800' };
              return (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                  {cfg.label}
                </span>
              );
            }}
          />
        )
      )}
    </div>
  );
};

// Repayments Table — sourced from Ncd_Repayments (email-synced)
const RepaymentsTable = ({ rows, loading, formatINR }) => {
  if (loading) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border" data-testid="repayments-loading">
        <RefreshCw className="h-8 w-8 text-gray-300 mx-auto mb-3 animate-spin" />
        <p className="text-gray-500">Loading repayments…</p>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border" data-testid="repayments-empty">
        <IndianRupee className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No repayments found</p>
        <p className="text-gray-400 text-sm mt-1">Email-synced repayments for this client will appear here</p>
      </div>
    );
  }

  const totalGross = rows.reduce((s, r) => s + (r.gross_amount || 0), 0);
  const totalPrincipal = rows.reduce((s, r) => s + (r.principal || 0), 0);
  const totalInterest = rows.reduce((s, r) => s + (r.interest || 0), 0);
  const totalTds = rows.reduce((s, r) => s + (r.tds || 0), 0);
  const totalNet = rows.reduce((s, r) => s + (r.net_amount || 0), 0);

  return (
    <div className="bg-white rounded-lg border border-blue-200 overflow-hidden" data-testid="repayments-table">
      <div className="px-4 py-3 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IndianRupee className="h-5 w-5 text-blue-600" />
          <span className="font-medium text-blue-800">Historical Repayments (from emails)</span>
          <Badge className="bg-blue-100 text-blue-700">{rows.length}</Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-500">Total Gross</p>
            <p className="font-semibold text-blue-700">{formatINR(totalGross)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Total Net</p>
            <p className="font-semibold text-green-700">{formatINR(totalNet)}</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Sr No</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Repayment Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">NCD Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Bond Code</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Principal</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Interest</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Gross</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">TDS</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id || idx} className="border-b hover:bg-gray-50" data-testid={`repayment-row-${idx}`}>
                <td className="px-4 py-3 text-gray-600">{idx + 1}</td>
                <td className="px-4 py-3">
                  {r.repayment_date ? format(new Date(r.repayment_date), "dd-MMM-yy") : 'NA'}
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">{r.bond_name || 'N/A'}</td>
                <td className="px-4 py-3 font-mono text-gray-600">{r.bond_code || 'N/A'}</td>
                <td className="px-4 py-3 text-right font-mono text-blue-700">{formatINR(r.principal || 0)}</td>
                <td className="px-4 py-3 text-right font-mono text-green-700">{formatINR(r.interest || 0)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800">{formatINR(r.gross_amount || 0)}</td>
                <td className="px-4 py-3 text-right font-mono text-amber-700">{formatINR(r.tds || 0)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">{formatINR(r.net_amount || 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr className="font-semibold">
              <td colSpan={4} className="px-4 py-3 text-gray-700">Total</td>
              <td className="px-4 py-3 text-right font-mono text-blue-700">{formatINR(totalPrincipal)}</td>
              <td className="px-4 py-3 text-right font-mono text-green-700">{formatINR(totalInterest)}</td>
              <td className="px-4 py-3 text-right font-mono text-gray-800">{formatINR(totalGross)}</td>
              <td className="px-4 py-3 text-right font-mono text-amber-700">{formatINR(totalTds)}</td>
              <td className="px-4 py-3 text-right font-mono text-green-700">{formatINR(totalNet)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

// Expected Repayments Table — sourced from Ncd_Expected_Repayments
const ExpectedRepaymentsTable = ({ rows, loading, formatINR }) => {
  // Drop rows that are already matched in Historical Repayments — the
  // backend flips `is_repaid=True` once a matching `Ncd_Repayments` row
  // (email-synced actual receipt) exists for the same (bond_code, date).
  // This keeps the Expected tab strictly to entries genuinely still due,
  // so past-dated maturities don't linger here marked "(overdue)" after
  // their email has already landed in the Historical tab.
  const filteredRows = (rows || []).filter(r => !r.is_repaid);
  if (loading) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border" data-testid="expected-loading">
        <RefreshCw className="h-8 w-8 text-gray-300 mx-auto mb-3 animate-spin" />
        <p className="text-gray-500">Loading expected repayments…</p>
      </div>
    );
  }
  if (!filteredRows || filteredRows.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border" data-testid="expected-empty">
        <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No expected repayments</p>
        <p className="text-gray-400 text-sm mt-1">All scheduled repayments have been matched in Historical Repayments</p>
      </div>
    );
  }

  const totalGross = filteredRows.reduce((s, r) => s + (r.gross_amount || 0), 0);
  const totalPrincipal = filteredRows.reduce((s, r) => s + (r.principal_component || 0), 0);
  const totalInterest = filteredRows.reduce((s, r) => s + (r.interest_component || 0), 0);
  const totalTds = filteredRows.reduce((s, r) => s + (r.tds_amount || 0), 0);
  const totalNet = filteredRows.reduce((s, r) => s + (r.net_amount || 0), 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <div className="bg-white rounded-lg border border-amber-200 overflow-hidden" data-testid="expected-table">
      <div className="px-4 py-3 bg-amber-50/50 border-b border-amber-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-600" />
          <span className="font-medium text-amber-800">Expected Repayments (scheduled)</span>
          <Badge className="bg-amber-100 text-amber-700">{filteredRows.length}</Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-500">Total Gross</p>
            <p className="font-semibold text-amber-700">{formatINR(totalGross)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Total Net</p>
            <p className="font-semibold text-green-700">{formatINR(totalNet)}</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Sr No</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Expected Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">NCD Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Bond Code</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Principal</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Interest</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Gross</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">TDS</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Net</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r, idx) => {
              const dt = r.expected_date ? new Date(r.expected_date) : null;
              const isOverdue = dt && dt.getTime() < today.getTime();
              return (
                <tr key={r.id || idx} className={`border-b hover:bg-gray-50 ${isOverdue ? 'bg-rose-50/40' : ''}`} data-testid={`expected-row-${idx}`}>
                  <td className="px-4 py-3 text-gray-600">{idx + 1}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={isOverdue ? 'text-rose-700 font-medium' : ''}>
                      {dt ? format(dt, "dd-MMM-yy") : 'NA'}
                    </span>
                    {isOverdue && <span className="ml-1 text-[10px] text-rose-600">(overdue)</span>}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{r.bond_name || 'N/A'}</td>
                  <td className="px-4 py-3 font-mono text-gray-600">{r.bond_code || 'N/A'}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="text-[10px] capitalize">{r.type || 'repayment'}</Badge></td>
                  <td className="px-4 py-3 text-right font-mono text-blue-700">{formatINR(r.principal_component || 0)}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-700">{formatINR(r.interest_component || 0)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800">{formatINR(r.gross_amount || 0)}</td>
                  <td className="px-4 py-3 text-right font-mono text-amber-700">{formatINR(r.tds_amount || 0)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">{formatINR(r.net_amount || 0)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr className="font-semibold">
              <td colSpan={5} className="px-4 py-3 text-gray-700">Total</td>
              <td className="px-4 py-3 text-right font-mono text-blue-700">{formatINR(totalPrincipal)}</td>
              <td className="px-4 py-3 text-right font-mono text-green-700">{formatINR(totalInterest)}</td>
              <td className="px-4 py-3 text-right font-mono text-gray-800">{formatINR(totalGross)}</td>
              <td className="px-4 py-3 text-right font-mono text-amber-700">{formatINR(totalTds)}</td>
              <td className="px-4 py-3 text-right font-mono text-green-700">{formatINR(totalNet)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">NCD Name</th>
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
              <th className="px-3 py-3 text-left">NCD/UCC</th>
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
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'holdings'; // Get tab from URL (real-estate, bonds, holdings)
  
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
  const [statusFilter, setStatusFilter] = useState("active");
  // NCD sub-tab — Holdings | Investment | Reinv Tag | Historical Repayments | Expected Repayments.
  // "holdings" shows the bond holdings table; the other four delegate to
  // TradesTabContent in controlled mode (it skips its own nav row).
  const [ncdSubTab, setNcdSubTab] = useState("holdings");
  const [clientTypeFilter, setClientTypeFilter] = useState("all"); // "all", "bonds", "real_estate"
  const [openMenu, setOpenMenu] = useState(null);
  const [openTradeMenu, setOpenTradeMenu] = useState(null); // For trades tab three-dot menu
  const [tradeDetailsModal, setTradeDetailsModal] = useState(null); // For trade details modal
  const [modalData, setModalData] = useState(null);
  const [activeTab, setActiveTab] = useState("summary"); // "summary" or trade index
  // Initialize mainTab from URL parameter - map 'real-estate' and 'bonds' to 'holdings' but preserve for subtab
  const [mainTab, setMainTab] = useState(initialTab === 'real-estate' || initialTab === 'bonds' ? initialTab : "holdings");
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

  // Default the Real-Estate currency radio to the client's home currency once
  // their residency loads. User can still flip to AED via the radio button.
  useEffect(() => {
    const residency = clientDetails?.country_of_residency;
    if (!residency) return;
    const homeCode = residency === 'India' ? 'INR' : 'AED';
    setReSelectedCurrency(homeCode);
  }, [clientDetails?.country_of_residency]);
  const [reCurrencyRates, setReCurrencyRates] = useState({ 
    AED: 1, INR: 24.72, USD: 0.27, EUR: 0.25, GBP: 0.21, SGD: 0.36,
    CNY: 1.97, JPY: 40.5, CHF: 0.24, CAD: 0.37, AUD: 0.42, HKD: 2.12,
    SAR: 1.02, KWD: 0.083, QAR: 0.99, BHD: 0.10, OMR: 0.10
  });
  const [reProjectedRates, setReProjectedRates] = useState(null); // Stores {year: rate} mapping
  const [reLoadingRates, setReLoadingRates] = useState(false);
  
  // CAS Analysis state
  const [clientAnalyses, setClientAnalyses] = useState([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);

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

  // Memoized real estate financials - prevents expensive recalculations on every render
  const computedRealEstateData = useMemo(() => {
    if (!clientRealEstate || clientRealEstate.length === 0) return [];
    // Radio-button override: "AED" forces AED display regardless of residency;
    // "home" respects the client's country_of_residency (INR for India, else AED).
    const residency = clientDetails?.country_of_residency;
    const effectiveResidency = reSelectedCurrency === 'AED' ? 'Abroad' : residency;
    // Use projected rates from API if available, otherwise fall back to default
    const currentRate = reCurrencyRates?.INR || AED_TO_INR_CURRENT;
    try {
      return clientRealEstate.map(property => ({
        property,
        financials: computePropertyFinancials(property, effectiveResidency, reProjectedRates, currentRate)
      }));
    } catch (error) {
      console.error('Error computing real estate financials:', error);
      return [];
    }
  }, [clientRealEstate, clientDetails?.country_of_residency, reProjectedRates, reCurrencyRates?.INR, reSelectedCurrency]);

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
    const parsed = JSON.parse(userData);
    setUser(parsed);
    // Clients see their own holdings only — bypass the broker/sub-broker
    // investor loader and auto-select themselves so all the tabs render
    // immediately with the full Holdings parity UI.
    if (parsed?.role === 'client') {
      const clientId = parsed.client_id || parsed.id;
      const selfClient = {
        id: clientId,
        name: parsed.name || '',
        pan: parsed.pan || parsed.login_id || '',
        email: parsed.email || '',
      };
      setClients([selfClient]);
      setSelectedClient(selfClient);
      setLoading(false);
      // Trigger the same data loads handleClientSelect would have fired so
      // the page is populated immediately without a manual Refresh click.
      fetchClientHoldings(clientId);
      fetchClientAnalyses(clientId);
    } else {
      fetchClients();
    }
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
      const response = await axios.get(`${API}/holdings/private-investors`, {
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
        axios.get(`${API}/private-investors/${clientId}`, {
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

  // Fetch CAS Analyses for a client
  const fetchClientAnalyses = async (clientId) => {
    try {
      setLoadingAnalyses(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/analysis/client/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClientAnalyses(response.data || []);
    } catch (error) {
      console.error("Error fetching client analyses:", error);
      setClientAnalyses([]);
    } finally {
      setLoadingAnalyses(false);
    }
  };

  const handleClientSelect = (client) => {
    setSelectedClient(client);
    // Don't reset tab - preserve the current tab selection when selecting new client
    fetchClientHoldings(client.id);
    fetchClientAnalyses(client.id);
  };

  // Auto-fetch INR projected rates when real estate data is loaded
  useEffect(() => {
    if (clientRealEstate && clientRealEstate.length > 0 && !reProjectedRates) {
      // Automatically fetch INR projected rates for accurate calculations
      fetchRECurrencyRates('INR');
    }
  }, [clientRealEstate]);

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
          bond_code: holding.bond_code,  // preserve bond code (→ Deal ID) across the merge
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
          repaid_rows: [],  // Accumulated per-date email repayments (merged from all groups of this bond)
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

      // Accumulate per-date email repayments from every trade group of this bond.
      // Server apportions each row by invested-ratio, so summing across groups
      // reconstructs the full NCD_Repayments total for that date at the
      // consolidated bond level.
      (holding.repaid_rows || []).forEach(r => {
        consolidated[bondId].repaid_rows.push(r);
      });
      
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
        maturity_date: holding.maturity_date,
        prepaid_count: holding.prepaid_count || 0,
        prepaid_amount: holding.prepaid_amount || 0,
        xirr: holding.xirr,
        actual_xirr: holding.actual_xirr,
        cashflows: (holding.cashflows || []).sort((a, b) => new Date(a.date) - new Date(b.date)),
        expected_cashflows: holding.expected_cashflows || [],
        actual_cashflows: holding.actual_cashflows || [],
        // Per-trade repaid_rows from the API (already principal-matched per
        // (bond, investment_date) group on the backend) so the View Details
        // modal can render this trade's actual transaction history without
        // re-apportioning the bond-level totals.
        repaid_rows: holding.repaid_rows || []
      });
      // Copy bond-level maturity (same across trade groups) once
      if (!consolidated[bondId].maturity_date && holding.maturity_date) {
        consolidated[bondId].maturity_date = holding.maturity_date;
      }
    });
    
    Object.values(consolidated).forEach(bond => {
      bond.trades.sort((a, b) => new Date(a.investment_date) - new Date(b.investment_date));
      bond.status = bond.upcoming_expected > 0 ? 'active' : 'fully_repaid';

      // Merge repaid_rows by date (same dates are summed; count is the max
      // across groups, since every trade group carries the same email-level
      // count per date — summing would double-count).
      if (bond.repaid_rows && bond.repaid_rows.length) {
        const byDate = {};
        for (const r of bond.repaid_rows) {
          const key = r.date;
          if (!byDate[key]) byDate[key] = { date: key, principal: 0, interest: 0, gross: 0, tds: 0, count: 0 };
          byDate[key].principal += r.principal || 0;
          byDate[key].interest  += r.interest  || 0;
          byDate[key].gross     += r.gross     || 0;
          byDate[key].tds       += r.tds       || 0;
          byDate[key].count      = Math.max(byDate[key].count, r.count || 0);
        }
        bond.repaid_rows = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
      }
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
  // Filter by maturity-based status (same rule as the Status pill):
  //   Active    → maturity_date > today (or unknown)
  //   Completed → maturity_date <= today
  const filteredHoldings = consolidatedHoldings.filter(h => {
    if (statusFilter === 'all') return true;
    const todayStr = new Date().toISOString().slice(0, 10);
    const matStr = (h.maturity_date || '').slice(0, 10) || (
      (h.trades || [])
        .map(t => (t.maturity_date || '').slice(0, 10))
        .filter(Boolean)
        .sort()
        .pop() || ''
    );
    const isMatured = !!matStr && matStr <= todayStr;
    return statusFilter === 'completed' ? isMatured : !isMatured;
  });

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

  // Get client display value based on filter type.
  // When "All Investors" is selected we intentionally DO NOT sum bonds +
  // real-estate into a single figure — bonds are priced in INR and real
  // estate in AED, so any combined total is misleading. Instead we show the
  // two amounts side by side (or just one when the other is zero).
  const getClientDisplayValue = (client) => {
    if (clientTypeFilter === 'bonds') {
      return formatINR(client.bond_investment || 0);
    }
    if (clientTypeFilter === 'real_estate') {
      return formatAED(client.real_estate_investment || 0);
    }
    // 'all'
    const bondINR = client.bond_investment || 0;
    const reAED = client.real_estate_investment || 0;
    if (bondINR > 0 && reAED > 0) {
      return `${formatINR(bondINR)} • ${formatAED(reAED)}`;
    }
    if (bondINR > 0) return formatINR(bondINR);
    if (reAED > 0) return formatAED(reAED);
    return '—';
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

    // Calculate payment status
    const now = new Date();
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const prevMonthEndStr = prevMonthEnd.toISOString().slice(0, 10);
    
    // Check for prepayments in actual cashflows
    const hasPrepayments = actualCashflows.some(cf => 
      cf.type === 'prepayment' || 
      (cf.type !== 'investment' && (cf.principal_component || 0) > 0 && (cf.interest_component || 0) === 0)
    ) || (holdingData.prepaid_count || 0) > 0 || (holdingData.prepaid_amount || 0) > 0;
    
    const paymentStatus = hasPrepayments ? 'Partly Prepaid' : 'On Time';
    const statusColor = hasPrepayments ? '#d97706' : '#059669';

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
              <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 10px 12px; text-align: center; font-size: 10px; font-weight: bold; color: #333;">NCD Name</th>
              <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 10px 12px; text-align: center; font-size: 10px; font-weight: bold; color: #333;">Units</th>
              <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 10px 12px; text-align: center; font-size: 10px; font-weight: bold; color: #333;">Total Investment</th>
              <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 10px 12px; text-align: center; font-size: 10px; font-weight: bold; color: #333;">Expected XIRR</th>
              <th style="border: 1px solid #999; background-color: #f5f5f5; padding: 10px 12px; text-align: center; font-size: 10px; font-weight: bold; color: #333;">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #999; padding: 12px; text-align: center; font-size: 11px; font-weight: bold; color: #000;">${holdingData.bond_name}</td>
              <td style="border: 1px solid #999; padding: 12px; text-align: center; font-size: 11px; font-weight: bold; color: #000;">${holdingData.total_units || holdingData.units || '-'}</td>
              <td style="border: 1px solid #999; padding: 12px; text-align: center; font-size: 11px; font-weight: bold; color: #000;">${formatAmount(expTotalInvestment)}</td>
              <td style="border: 1px solid #999; padding: 12px; text-align: center; font-size: 11px; font-weight: bold; color: #059669;">${holdingData.xirr?.toFixed(2) || '-'}%</td>
              <td style="border: 1px solid #999; padding: 12px; text-align: center; font-size: 11px; font-weight: bold; color: ${statusColor};">${paymentStatus}</td>
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
      
      // Calculate payment status
      const hasPrepayments = actualCashflows.some(cf => 
        cf.type === 'prepayment' || 
        (cf.type !== 'investment' && (cf.principal_component || 0) > 0 && (cf.interest_component || 0) === 0)
      ) || (holdingData.prepaid_count || 0) > 0 || (holdingData.prepaid_amount || 0) > 0;
      
      const paymentStatus = hasPrepayments ? 'Partly Prepaid' : 'On Time';
      
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
      csv += `Expected XIRR,${holdingData.xirr?.toFixed(2) || '-'}%,,,,,,,,Status,${paymentStatus}\n`;
      
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
      
      <main className="flex-1 min-h-0 overflow-auto">
        {/* Header with Client Selector - Like Data Gathering */}
        <div className="bg-white px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Holdings</h1>
                <p className="text-gray-500 text-sm mt-1">View investor NCD and real estate holdings</p>
              </div>
              
              {/* Client Selector - Inline with header. Hidden for client
                  role — their own profile is auto-selected. */}
              {user.role !== 'client' ? (
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
                    <SelectValue placeholder="Select an investor">
                      {selectedClient ? (
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          {selectedClient.name?.length > 30 
                            ? selectedClient.name.substring(0, 30) + '...' 
                            : selectedClient.name}
                        </span>
                      ) : (
                        <span className="text-gray-500">Select an investor</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Search & Filter inside dropdown */}
                    <div className="p-2 border-b space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search investors..."
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
                          <SelectItem value="all">All Investors</SelectItem>
                          <SelectItem value="bonds">NCD Investors</SelectItem>
                          <SelectItem value="real_estate">Real Estate Investors</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Investor list */}
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
                          {searchQuery ? `No investors matching "${searchQuery}"` : "No investors found"}
                        </div>
                      )}
                    </div>
                  </SelectContent>
                </Select>
                </div>
              ) : (
                /* Read-only identity strip for the logged-in client */
                <div className="flex items-center gap-2 border-l pl-6 text-sm text-gray-600">
                  <Users className="h-4 w-4 text-gray-500" />
                  <span className="font-medium text-gray-800">Viewing as:</span>
                  <span>{selectedClient?.name}</span>
                  {selectedClient?.pan && (
                    <span className="text-xs text-gray-400">· PAN {selectedClient.pan}</span>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={user.role === 'client' ? () => fetchClientHoldings(selectedClient?.id) : fetchClients} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-6">
          {!selectedClient ? (
            <div className="h-[60vh] flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Users className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">Select an investor to view holdings</p>
                <p className="text-sm text-gray-400 mt-1">Use the dropdown above to choose an investor</p>
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
                  NCD
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
                  Real Estate
                </button>
                <button 
                  onClick={() => {
                    setMainTab("analysis");
                    if (selectedClient && clientAnalyses.length === 0) {
                      fetchClientAnalyses(selectedClient.id);
                    }
                  }}
                  className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
                    mainTab === "analysis" 
                      ? "border-etihad-gold-600 text-etihad-gold-700" 
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="tab-analysis"
                >
                  <TrendingUp className="h-4 w-4" />
                  CAS Analysis
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
              
              {/* CAS Analysis Tab Content */}
              {mainTab === "analysis" && (
                <div className="space-y-6">
                  {loadingAnalyses ? (
                    <div className="text-center py-12">
                      <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                      <p className="mt-4 text-gray-500">Loading CAS analyses...</p>
                    </div>
                  ) : clientAnalyses.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <TrendingUp className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p className="font-medium">No CAS analyses found</p>
                      <p className="text-sm mt-2">Upload a CAS PDF to analyze mutual fund holdings</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      {/* Table Header */}
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">File Name</th>
                            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientAnalyses.map((analysis, idx) => (
                            <tr key={analysis.id} className={`border-b ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-gray-400" />
                                  <span className="text-sm text-gray-800 truncate max-w-[300px]" title={analysis.filename}>
                                    {analysis.filename || 'CAS Analysis'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-sm text-gray-600">
                                  {analysis.created_at ? new Date(analysis.created_at).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric'
                                  }) : '-'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open(`/analysis/dashboard/${analysis.id}`, '_blank')}
                                    className="text-blue-600 hover:bg-blue-50 h-8 px-2"
                                    title="View Dashboard"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        const token = localStorage.getItem("token");
                                        const response = await axios.get(`${API}/analysis/${analysis.id}/download`, {
                                          headers: { Authorization: `Bearer ${token}` },
                                          responseType: 'blob'
                                        });
                                        const url = window.URL.createObjectURL(new Blob([response.data]));
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `GapSheet_${selectedClient?.pan_number || 'Report'}.zip`;
                                        document.body.appendChild(a);
                                        a.click();
                                        window.URL.revokeObjectURL(url);
                                        a.remove();
                                        toast.success("Reports downloaded!");
                                      } catch (error) {
                                        toast.error("Failed to download reports");
                                      }
                                    }}
                                    className="text-green-600 hover:bg-green-50 h-8 px-2"
                                    title="Download Reports"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
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
                      {/* Summary Row - Real Estate specific layout */}
                      {(() => {
                        // Calculate totals across all properties using the
                        // memoized financials so fees + share_percentage are
                        // applied consistently with the Holding Report.
                        let totalInvestmentAmount = 0;
                        let totalPaidTillDate = 0;
                        let totalExpectedSale = 0;
                        let paymentsDelayed = 0;
                        let futurePayments = 0;
                        const today = new Date();
                        
                        (computedRealEstateData || []).forEach(({ property, financials }) => {
                          const fin = financials || {};
                          totalInvestmentAmount += fin.totalCostAed || 0;
                          totalPaidTillDate += fin.paidAmountAed || 0;
                          totalExpectedSale += fin.expectedSalePrice || 0;
                          
                          const schedule = property.payment_schedule || [];
                          const sharePct = (property.share_percentage || 100) / 100;
                          const unitPriceShare = (property.unit_price || 0) * sharePct;
                          const upfrontShare = (
                            (property.dld_fee || (property.unit_price || 0) * (property.dld_fee_percentage || 0) / 100) +
                            (property.admin_fee || 0) +
                            (property.broker_fee || 0) +
                            (property.other_fees || 0)
                          ) * sharePct;
                          schedule.forEach((milestone, idx) => {
                            const base = (milestone.percentage / 100) * unitPriceShare;
                            const milestoneAmount = base + (idx === 0 ? upfrontShare : 0);
                            const milestoneDate = new Date(milestone.date);
                            const isPaid = idx < (property.payments_completed || 0);
                            if (isPaid) return; // already counted in paidAmountAed
                            if (milestoneDate < today) {
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
                        
                        const isAedDisplay = reSelectedCurrency === 'AED';
                        const AED_TO_INR = reCurrencyRates?.INR || AED_TO_INR_CURRENT;
                        
                        const formatAmount = (amountAed) => {
                          if (isAedDisplay) {
                            return `AED ${new Intl.NumberFormat('en-AE').format(Math.round(amountAed))}`;
                          }
                          const amount = amountAed * AED_TO_INR;
                          if (amount >= 10000000) {
                            return `₹ ${(amount / 10000000).toFixed(2)} Cr`;
                          } else if (amount >= 100000) {
                            return `₹ ${(amount / 100000).toFixed(2)} L`;
                          }
                          return `₹ ${new Intl.NumberFormat('en-IN').format(Math.round(amount))}`;
                        };
                        
                        return (
                          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                            {/* Top Row: Summary Stats - matching bonds font size */}
                            <div className="flex items-center gap-4 text-xs mb-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Total Investment Amount:</span>
                                <span className="font-mono font-semibold text-gray-800">
                                  {formatAmount(totalInvestmentAmount)}
                                </span>
                              </div>
                              <div className="h-4 w-px bg-gray-200"></div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Expected Sale Amount:</span>
                                <span className="font-mono font-semibold text-blue-600">
                                  {formatAmount(totalExpectedSale)}
                                </span>
                              </div>
                              <div className="h-4 w-px bg-gray-200"></div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Expected Profit on Sale:</span>
                                <span className="font-mono font-semibold text-green-600">
                                  {formatAmount(expectedProfitOnSale)}
                                </span>
                              </div>
                              <div className="h-4 w-px bg-gray-200"></div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Expected Profit/Loss from Currency:</span>
                                <span className={`font-mono font-semibold ${currencyProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {currencyProfitLoss >= 0 ? '+' : ''}{formatAmount(currencyProfitLoss)}
                                </span>
                              </div>
                              <div className="h-4 w-px bg-gray-200"></div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Pending to Invest:</span>
                                <span className="font-mono font-semibold text-red-600">
                                  {formatAmount(pendingToInvest)}
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
                                    <span className="font-mono font-semibold text-green-700">{formatAmount(totalPaidTillDate)}</span>
                                    <span className="text-gray-400">({paidPercent.toFixed(0)}%)</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                                    <span className="text-gray-600">Pending:</span>
                                    <span className="font-mono font-semibold text-blue-700">{formatAmount(pendingToInvest)}</span>
                                    <span className="text-gray-400">({pendingPercent.toFixed(0)}%)</span>
                                  </div>
                                  <span className="text-gray-500">Total: <span className="font-mono font-semibold">{formatAmount(totalInvestmentAmount)}</span></span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      
                      {/* Holding Report Table - Real Estate */}
                      <div className="bg-white rounded-lg border border-gray-200 overflow-visible">
                        {/* Table Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-wrap gap-4">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-5 w-5 text-amber-600" />
                              <h3 className="font-semibold text-gray-800">Holding Report</h3>
                            </div>
                            
                            {/* Currency toggle — AED vs. client's home currency (matches NCD status filter style) */}
                            {(() => {
                              const residency = clientDetails?.country_of_residency;
                              const homeCode = residency === 'India' ? 'INR' : 'AED';
                              return (
                                <div
                                  className="flex items-center gap-4 ml-4 pl-4 border-l border-gray-200"
                                  data-testid="re-holding-currency-toggle"
                                >
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="re-holding-currency"
                                      value="AED"
                                      checked={reSelectedCurrency === 'AED'}
                                      onChange={() => setReSelectedCurrency('AED')}
                                      className="h-3.5 w-3.5 text-etihad-gold-600 focus:ring-etihad-gold-500"
                                      data-testid="re-currency-aed"
                                    />
                                    <span className="text-sm text-gray-600">AED</span>
                                  </label>
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="radio"
                                      name="re-holding-currency"
                                      value="home"
                                      checked={reSelectedCurrency !== 'AED'}
                                      onChange={() => setReSelectedCurrency(homeCode)}
                                      className="h-3.5 w-3.5 text-etihad-gold-600 focus:ring-etihad-gold-500"
                                      data-testid="re-currency-home"
                                    />
                                    <span className="text-sm text-gray-600">Home Currency ({homeCode})</span>
                                  </label>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-3">
                            {/* Download / Email buttons intentionally hidden
                                on the Real Estate tab — those flows are
                                only meaningful for the NCD Holdings Excel
                                report. */}
                          </div>
                        </div>
                        
                        {/* Table */}
                        <div className="overflow-visible">
                          <table className="w-full overflow-visible">
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
                            <tbody className="divide-y divide-gray-100 overflow-visible">
                              {computedRealEstateData.map(({ property, financials }, idx) => {
                                const {
                                  investmentAmount, expectedSalePrice, schedule, investorCurrency,
                                  expectedSaleDate, projectedAedToInrAtSale, handoverDate, isSellingBeforeCompletion,
                                  paidAmountInr, payableAmountInr, paidAmountAed, payableAmountAed,
                                  paymentsAfterSaleAed, totalInvestmentInr, netSaleProceedsAed, netSaleProceedsInr,
                                  profitFromSaleAed, profitFromSaleInrNoForex, forexImpactOnSale, totalProfitInr, 
                                  saleProceedsInr, netCurrencyImpact, totalCostAed, totalInvestmentAed,
                                  paidFromScheduleInr, payableFromScheduleInr, upfrontFeesAed, dldFeeAed, adminFeeAed,
                                  netSaleValueForXirr, expectedXirr, actualXirr, totalSqft, balconyArea, apartmentArea,
                                  currentRate, currencySymbol
                                } = financials;
                                
                                const today = new Date();
                                const projectedAedToInr = projectedAedToInrAtSale;
                                
                                // Current INR rate for display
                                const currentInrRate = reCurrencyRates?.INR || AED_TO_INR_CURRENT;
                                
                                // Helper to get rate for tooltip display - uses projected rates
                                const getRateForDate = (date) => getProjectedRateForDate(date, reProjectedRates, currentInrRate, today);
                                
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
                                
                                // Currency-aware money formatter — follows the AED|Home Currency toggle.
                                const isAedDisplay = reSelectedCurrency === 'AED';
                                const fmtMoneyAed = (aed) => isAedDisplay ? formatAED(aed) : formatINR(aed * currentInrRate);
                                // Sale-dated values must use the projected rate at sale-date when INR is selected.
                                const fmtMoneyAtSale = (aed) => isAedDisplay ? formatAED(aed) : formatINR(aed * projectedAedToInr);
                                
                                return (
                                  <tr key={idx} className="hover:bg-gray-50 overflow-visible">
                                    {/* Property Details - compact */}
                                    <td className="px-2 py-2 overflow-visible">
                                      {(() => {
                                        const rawName = property.building_name || 'Property';
                                        const displayName = rawName
                                          .replace(/Hyde Residences Dubai Hills/i, 'Hyde Residences')
                                          .replace(/25\s*HOURS?\s*HEIMAT\s*DUBAI/i, '25H Heimat');
                                        return (
                                          <p className="font-semibold text-gray-800 text-xs whitespace-nowrap" title={rawName}>
                                            {displayName}
                                          </p>
                                        );
                                      })()}
                                      <p className="text-[10px] text-gray-400">
                                        {property.unit_number || property.apartment_no || 'Unit N/A'} • {property.share_percentage || 100}%
                                      </p>
                                    </td>
                                    
                                    {/* Investment Amount - Total cost including DLD + Admin fees */}
                                    <td className="px-2 py-2 text-right">
                                      <div className="cursor-help group/inv relative">
                                        <p className="font-mono font-semibold text-gray-800 text-xs">{fmtMoneyAed(totalCostAed)}</p>
                                        <p className="text-[10px]">
                                          <span className="text-emerald-600">Paid: {fmtMoneyAed(paidAmountAed)}</span>
                                          <span className="mx-1 text-gray-400">|</span>
                                          <span className="text-blue-600">Due: {fmtMoneyAed(payableAmountAed)}</span>
                                        </p>
                                        {/* Payment Schedule Tooltip - appears on right side to avoid clipping */}
                                        <div className="absolute hidden group-hover/inv:block left-full top-0 ml-2 bg-gray-900 text-white text-[10px] rounded-lg shadow-2xl border border-gray-600" style={{width: '400px', zIndex: 9999}}>
                                          <div className="px-3 py-2 bg-gray-800 rounded-t-lg border-b border-gray-700">
                                            <p className="font-bold text-amber-400">Investment Breakdown</p>
                                            <p className="text-gray-400 text-[9px]">Total: {formatAED(totalCostAed)} @ ₹{currentInrRate.toFixed(2)}/AED</p>
                                          </div>
                                          <div className="p-3 max-h-[350px] overflow-y-auto">
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
                                                  const baseAmt = (milestone.percentage / 100) * investmentAmount;
                                                  const amt = baseAmt + (i === 0 ? (upfrontFeesAed || 0) : 0);
                                                  const isPaid = i < (property.payments_completed || 0);
                                                  const rate = getRateForDate(milestone.date);
                                                  const feeNote = i === 0 && (upfrontFeesAed || 0) > 0
                                                    ? ` (incl. ${formatAED(upfrontFeesAed)} DLD+Admin)` : '';
                                                  return (
                                                    <tr key={i} className={`border-b border-gray-800 ${isPaid ? 'bg-green-900/30' : ''}`}>
                                                      <td className="py-1.5">
                                                        {new Date(milestone.date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}
                                                        {feeNote && <span className="text-[8px] text-amber-300 ml-1">{feeNote}</span>}
                                                      </td>
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
                                                  <td className="text-right py-1.5">{new Intl.NumberFormat('en-IN').format(Math.round(totalCostAed))}</td>
                                                  <td className="text-right py-1.5 text-amber-400">{new Intl.NumberFormat('en-IN').format(Math.round(totalInvestmentInr))}</td>
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
                                        <p className="font-mono font-semibold text-blue-600 text-xs">{fmtMoneyAtSale(expectedSalePrice)}</p>
                                        <p className="text-[10px] text-gray-500">
                                          {isAedDisplay
                                            ? expectedSaleDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
                                            : `@₹${projectedAedToInr.toFixed(2)}/AED • ${expectedSaleDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`}
                                        </p>
                                        {/* Sale Tooltip - appears to right to avoid clipping */}
                                        <div className="absolute hidden group-hover/sale:block left-full top-0 ml-2 bg-gray-900 text-white text-[10px] rounded-lg shadow-2xl border border-gray-600" style={{width: '220px', zIndex: 9999}}>
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
                                    
                                    {/* Total Profit - show Sale (without forex) | Forex */}
                                    <td className="px-2 py-2 text-right">
                                      <div className="cursor-help group relative">
                                        <p className="font-mono font-semibold text-green-600 text-xs">
                                          {isAedDisplay ? formatAED(profitFromSaleAed) : formatINR(totalProfitInr)}
                                        </p>
                                        <p className="text-[10px]">
                                          {isAedDisplay ? (
                                            <span className="text-gray-500">Sale: {formatAED(profitFromSaleAed)}</span>
                                          ) : (
                                            <>
                                              <span className="text-gray-500">Sale: {formatINR(profitFromSaleInrNoForex)}</span>
                                              <span className="mx-1 text-gray-400">|</span>
                                              <span className={forexImpactOnSale >= 0 ? 'text-amber-600' : 'text-red-500'}>
                                                Forex: {forexImpactOnSale >= 0 ? '+' : ''}{formatINR(forexImpactOnSale)}
                                              </span>
                                            </>
                                          )}
                                        </p>
                                        {/* Tooltip - appears to right to avoid clipping */}
                                        <div className="absolute hidden group-hover:block left-full top-0 ml-2 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl border border-gray-700" style={{minWidth: '240px', zIndex: 9999}}>
                                          <p className="font-bold text-amber-400 border-b border-gray-600 pb-1 mb-2">Profit Breakdown</p>
                                          <div className="space-y-1">
                                            <p><span className="text-gray-400">Expected Sale (AED):</span> <span className="float-right">{formatAED(expectedSalePrice)}</span></p>
                                            <p><span className="text-gray-400">Total Cost (AED):</span> <span className="float-right text-red-400">-{formatAED(totalCostAed)}</span></p>
                                            <p className="border-t border-gray-600 pt-1 mt-1">
                                              <span className="text-gray-400">Property Gain (AED):</span> 
                                              <span className="float-right text-green-400">{formatAED(profitFromSaleAed)}</span>
                                            </p>
                                            <p><span className="text-gray-400">@ Current Rate (₹{currentInrRate.toFixed(2)}):</span> <span className="float-right">{formatINR(profitFromSaleInrNoForex)}</span></p>
                                            <p className="border-t border-gray-600 pt-1 mt-1">
                                              <span className="text-gray-400">Forex Impact:</span> 
                                              <span className={`float-right ${forexImpactOnSale >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {forexImpactOnSale >= 0 ? '+' : ''}{formatINR(forexImpactOnSale)}
                                              </span>
                                            </p>
                                            <p className="font-bold text-green-400 border-t border-gray-600 pt-1 mt-1">
                                              Total Profit: <span className="float-right">{formatINR(totalProfitInr)}</span>
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    
                                    {/* Expected XIRR - with schedule tooltip */}
                                    <td className="px-2 py-2 text-center overflow-visible">
                                      <div className="cursor-help group/expxirr relative inline-block">
                                        <span className={`font-mono font-semibold text-xs ${expectedXirr && expectedXirr > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                          {expectedXirr ? `${expectedXirr.toFixed(2)}%` : '-'}
                                        </span>
                                        {/* Schedule Tooltip */}
                                        <div className="absolute hidden group-hover/expxirr:block right-0 bottom-full mb-2 z-[100] bg-gray-900 text-white text-[10px] rounded-lg shadow-2xl border border-gray-600" style={{width: '360px'}}>
                                          <div className="px-3 py-2 bg-gray-800 rounded-t-lg border-b border-gray-700">
                                            <p className="font-bold text-amber-400">XIRR Schedule (Expected)</p>
                                            {isSellingBeforeCompletion && (
                                              <p className="text-orange-400 text-[9px]">Selling before handover - completion payments excluded</p>
                                            )}
                                          </div>
                                          <div className="p-3">
                                            <table className="w-full">
                                              <thead>
                                                <tr className="text-gray-400 border-b border-gray-700">
                                                  <th className="text-left py-1 font-medium">Date</th>
                                                  <th className="text-right py-1 font-medium">AED</th>
                                                  <th className="text-right py-1 font-medium">INR</th>
                                                  <th className="text-center py-1 font-medium">Incl?</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {schedule.map((milestone, i) => {
                                                  const baseAmt = (milestone.percentage / 100) * investmentAmount;
                                                  const amt = baseAmt + (i === 0 ? (upfrontFeesAed || 0) : 0);
                                                  const rate = getRateForDate(milestone.date);
                                                  const milestoneDate = new Date(milestone.date);
                                                  const isExcluded = isSellingBeforeCompletion && milestoneDate > expectedSaleDate;
                                                  return (
                                                    <tr key={i} className={`border-b border-gray-800 ${isExcluded ? 'opacity-40 line-through' : ''}`}>
                                                      <td className="py-1.5">{new Date(milestone.date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}</td>
                                                      <td className="text-right py-1.5 text-red-400">{new Intl.NumberFormat('en-IN').format(Math.round(amt))}</td>
                                                      <td className="text-right py-1.5 text-red-400">{new Intl.NumberFormat('en-IN').format(Math.round(amt * rate))}</td>
                                                      <td className="text-center py-1.5">{isExcluded ? <span className="text-orange-400">✗</span> : <span className="text-green-400">✓</span>}</td>
                                                    </tr>
                                                  );
                                                })}
                                                <tr className="border-b border-gray-700 bg-green-900/30">
                                                  <td className="py-1.5 text-green-400 font-semibold">{expectedSaleDate.toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})} (Sale)</td>
                                                  <td className="text-right py-1.5 text-green-400">+{new Intl.NumberFormat('en-IN').format(Math.round(netSaleValueForXirr))}</td>
                                                  <td className="text-right py-1.5 text-green-400">+{new Intl.NumberFormat('en-IN').format(Math.round(netSaleValueForXirr * projectedAedToInr))}</td>
                                                  <td className="text-center py-1.5"><span className="text-green-400">✓</span></td>
                                                </tr>
                                                {isSellingBeforeCompletion && paymentsAfterSaleAed > 0 && (
                                                  <tr className="border-b border-gray-700 bg-orange-900/20">
                                                    <td colSpan="4" className="py-1.5 text-[9px] text-orange-400">
                                                      Note: {formatAED(paymentsAfterSaleAed)} completion payments deducted from sale (buyer's obligation)
                                                    </td>
                                                  </tr>
                                                )}
                                              </tbody>
                                              <tfoot>
                                                <tr className="font-bold bg-gray-800">
                                                  <td className="py-1.5 text-amber-400">XIRR</td>
                                                  <td colSpan="2" className="text-right py-1.5 text-green-400">{expectedXirr ? `${expectedXirr.toFixed(1)}%` : '-'}</td>
                                                  <td></td>
                                                </tr>
                                              </tfoot>
                                            </table>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    
                                    {/* Actual XIRR - with schedule tooltip */}
                                    <td className="px-2 py-2 text-center overflow-visible">
                                      <div className="cursor-help group/actxirr relative inline-block">
                                        <span className={`font-mono font-semibold text-xs ${actualXirr && actualXirr > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                          {actualXirr ? `${actualXirr.toFixed(2)}%` : '-'}
                                        </span>
                                        {/* Schedule Tooltip */}
                                        <div className="absolute hidden group-hover/actxirr:block right-0 bottom-full mb-2 z-[100] bg-gray-900 text-white text-[10px] rounded-lg shadow-2xl border border-gray-600" style={{width: '380px'}}>
                                          <div className="px-3 py-2 bg-gray-800 rounded-t-lg border-b border-gray-700">
                                            <p className="font-bold text-amber-400">XIRR Schedule (Actual)</p>
                                            <p className="text-gray-400 text-[9px]">{property.payments_completed || 0}/{schedule.length} payments completed</p>
                                            {isSellingBeforeCompletion && (
                                              <p className="text-orange-400 text-[9px]">Selling before handover - completion payments excluded</p>
                                            )}
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
                                                  const baseAmt = (milestone.percentage / 100) * investmentAmount;
                                                  const amt = baseAmt + (i === 0 ? (upfrontFeesAed || 0) : 0);
                                                  const isPaid = i < (property.payments_completed || 0);
                                                  const actualDate = isPaid ? (property.actual_payment_dates?.[i] || milestone.date) : milestone.date;
                                                  const rate = getRateForDate(actualDate);
                                                  const milestoneDate = new Date(milestone.date);
                                                  // Excluded if selling before completion and payment is after sale date and not yet paid
                                                  const isExcluded = isSellingBeforeCompletion && !isPaid && milestoneDate > expectedSaleDate;
                                                  return (
                                                    <tr key={i} className={`border-b border-gray-800 ${isPaid ? 'bg-green-900/30' : ''} ${isExcluded ? 'opacity-40 line-through' : ''}`}>
                                                      <td className="py-1.5">{new Date(actualDate).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}</td>
                                                      <td className="text-right py-1.5 text-red-400">{new Intl.NumberFormat('en-IN').format(Math.round(amt))}</td>
                                                      <td className="text-right py-1.5 text-red-400">{new Intl.NumberFormat('en-IN').format(Math.round(amt * rate))}</td>
                                                      <td className="text-center py-1.5">
                                                        {isExcluded ? <span className="text-orange-400">✗</span> : isPaid ? <span className="text-green-400">✓</span> : <span className="text-gray-500">-</span>}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                                <tr className="border-b border-gray-700 bg-green-900/30">
                                                  <td className="py-1.5 text-green-400 font-semibold">{expectedSaleDate.toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})} (Sale)</td>
                                                  <td className="text-right py-1.5 text-green-400">+{new Intl.NumberFormat('en-IN').format(Math.round(netSaleValueForXirr))}</td>
                                                  <td className="text-right py-1.5 text-green-400">+{new Intl.NumberFormat('en-IN').format(Math.round(netSaleValueForXirr * projectedAedToInr))}</td>
                                                  <td className="text-center py-1.5 text-green-400">+</td>
                                                </tr>
                                                {isSellingBeforeCompletion && paymentsAfterSaleAed > 0 && (
                                                  <tr className="border-b border-gray-700 bg-orange-900/20">
                                                    <td colSpan="4" className="py-1.5 text-[9px] text-orange-400">
                                                      Note: {formatAED(paymentsAfterSaleAed)} completion payments deducted from sale (buyer's obligation)
                                                    </td>
                                                  </tr>
                                                )}
                                              </tbody>
                                              <tfoot>
                                                <tr className="font-bold bg-gray-800">
                                                  <td className="py-1.5 text-amber-400">XIRR</td>
                                                  <td colSpan="2" className="text-right py-1.5 text-green-400">{actualXirr ? `${actualXirr.toFixed(1)}%` : '-'}</td>
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
                                          // Pass client_id and tab when coming from holdings so the details page shows only that client's data and can navigate back correctly
                                          const clientParam = selectedClient ? `&client_id=${selectedClient.id}` : '';
                                          window.location.href = `${prefix}/real-estate/${property.opportunity_id || property.id}?from=holdings&tab=real-estate${clientParam}`;
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
              {/* NCD Sub-tab Navigation — Holdings | Investment | Reinv Tag | Historical Repayments | Expected Repayments */}
              <div className="flex gap-2 flex-wrap border-b border-gray-200 mb-4 pb-2" data-testid="ncd-sub-tabs">
                {[
                  { key: 'holdings',   label: 'Holdings',             color: 'amber',  icon: TrendingUp },
                  { key: 'investment', label: 'Investment',           color: 'green',  icon: CheckCircle },
                  { key: 'reinv-logs', label: 'Reinv Tag',            color: 'purple', icon: TrendingUp },
                  { key: 'repayments', label: 'Historical Repayments', color: 'blue',   icon: IndianRupee },
                  { key: 'expected',   label: 'Expected Repayments',  color: 'amber',  icon: Clock },
                ].map(({ key, label, color, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setNcdSubTab(key)}
                    data-testid={`ncd-subtab-${key}`}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                      ncdSubTab === key
                        ? `bg-${color}-100 text-${color}-700 border-b-2 border-${color}-600`
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
              
              {ncdSubTab !== 'holdings' && (
                <TradesTabContent
                  trades={clientTrades}
                  selectedClient={selectedClient}
                  formatINR={formatINR}
                  controlledTab={ncdSubTab}
                  onTabChange={setNcdSubTab}
                  hideNav
                />
              )}
              
              {ncdSubTab === 'holdings' && (<>
              {/* Summary Section with Repayment Status Chart */}
              <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                {/* Top Row: Summary Stats — wired to the new canonical NCD DB
                    via the same per-holding fields the Excel Summary tab uses
                    (`expected_cashflows` for P/I split + `repaid_*` from the
                    principal-matched per-trade attribution). */}
                {(() => {
                  let sumInvestment = 0;
                  let sumGrossExpected = 0;
                  let sumRepaid = 0;       // P + I (gross of TDS)
                  let sumTds = 0;

                  filteredHoldings.forEach(holding => {
                    sumInvestment += holding.invested_amount || 0;

                    // Gross Expected = lifetime sum of P + I from expected_cashflows
                    // (mirrors `_compute_summary_row_values` on the backend).
                    const allExpectedCashflows = holding.trades?.length > 0
                      ? (holding.trades || []).flatMap(trade => trade.expected_cashflows || [])
                      : (holding.expected_cashflows || []);
                    const expectedGross = allExpectedCashflows
                      .filter(cf => cf.type !== 'investment')
                      .reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0);
                    sumGrossExpected += expectedGross;

                    // Gross Repaid = principal + interest (post-attribution per
                    // trade group on the backend — single source of truth).
                    sumRepaid += (holding.repaid_principal || 0) + (holding.repaid_interest || 0);
                    sumTds   += holding.repaid_tds || 0;
                  });

                  // Profit is derived from the totals — matches Excel Summary's
                  // Profit column = Gross Expected − Investment.
                  const sumProfit = sumGrossExpected - sumInvestment;
                  
                  return (
                    <div className="flex items-center gap-4 text-xs mb-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">Total Investment:</span>
                        <span className="font-mono font-semibold text-gray-800">{formatINR(sumInvestment)}</span>
                      </div>
                      <div className="h-4 w-px bg-gray-200"></div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">Total Gross Expected:</span>
                        <span className="font-mono font-semibold text-emerald-600">{formatINR(sumGrossExpected)}</span>
                      </div>
                      <div className="h-4 w-px bg-gray-200"></div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">Total Gross Profit:</span>
                        <span className={`font-mono font-semibold ${sumProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatINR(sumProfit)}
                        </span>
                      </div>
                      <div className="h-4 w-px bg-gray-200"></div>
                      <div className="flex items-center gap-1.5" data-testid="summary-total-repaid">
                        <span className="text-gray-500">Total Repaid:</span>
                        <span className="font-mono font-semibold text-blue-700">{formatINR(sumRepaid)}</span>
                      </div>
                      <div className="h-4 w-px bg-gray-200"></div>
                      <div className="flex items-center gap-1.5" data-testid="summary-total-tds">
                        <span className="text-gray-500">Total TDS Deducted:</span>
                        <span className="font-mono font-semibold text-amber-700">{formatINR(sumTds)}</span>
                      </div>
                    </div>
                  );
                })()}
                
                {/* Repayment Status Chart */}
                {filteredHoldings.length > 0 && (
                <div className="pt-3 border-t border-gray-100">
                  {(() => {
                    // Total Gross Expected = lifetime sum of P + I from
                    // expected_cashflows. Same logic the stats cards above use,
                    // and matches the Excel Summary tab's Gross Expected column.
                    let totalGrossExpected = 0;
                    filteredHoldings.forEach(holding => {
                      const allExpectedCashflows = holding.trades?.length > 0
                        ? (holding.trades || []).flatMap(trade => trade.expected_cashflows || [])
                        : (holding.expected_cashflows || []);
                      const expectedGross = allExpectedCashflows
                        .filter(cf => cf.type !== 'investment')
                        .reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0);
                      totalGrossExpected += expectedGross;
                    });

                    // Total Received = principal + interest received so far
                    // (post-attribution per trade group on the backend).
                    const totalReceived = filteredHoldings.reduce((sum, h) =>
                      sum + (h.repaid_principal || 0) + (h.repaid_interest || 0), 0);
                    
                    // Outstanding = Total Gross Expected - Received
                    const totalOutstanding = Math.max(0, totalGrossExpected - totalReceived);

                    // Hide "Outstanding" when viewing Completed bonds only —
                    // a completed bond has no future outstanding; the chart
                    // should reflect 100% received.
                    const hideOutstanding = statusFilter === 'completed';

                    // Grand Total is the Total Gross Expected, except when we
                    // are viewing only Completed bonds — then the chart is
                    // based on the actually-received amount so it shows 100%.
                    const grandTotal = hideOutstanding ? totalReceived : totalGrossExpected;
                    const receivedPercent = grandTotal > 0 ? (totalReceived / grandTotal) * 100 : 0;
                    const outstandingPercent = hideOutstanding
                      ? 0
                      : (grandTotal > 0 ? (totalOutstanding / grandTotal) * 100 : 0);
                    
                    return (
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Repayment Status:</span>
                        
                        {/* Compact Progress Bar */}
                        <div className="flex-1 relative h-5 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="absolute left-0 top-0 h-full bg-green-500 transition-all duration-500"
                            style={{ width: `${receivedPercent}%` }}
                          />
                          {!hideOutstanding && (
                            <div 
                              className="absolute top-0 h-full bg-blue-500 transition-all duration-500"
                              style={{ left: `${receivedPercent}%`, width: `${outstandingPercent}%` }}
                            />
                          )}
                        </div>
                        
                        {/* Inline Legend */}
                        <div className="flex items-center gap-4 text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                            <span className="text-gray-600">Received:</span>
                            <span className="font-mono font-semibold text-green-700">{formatINR(totalReceived)}</span>
                            <span className="text-gray-400">({receivedPercent.toFixed(0)}%)</span>
                          </div>
                          {!hideOutstanding && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                              <span className="text-gray-600">Outstanding:</span>
                              <span className="font-mono font-semibold text-blue-700">{formatINR(totalOutstanding)}</span>
                              <span className="text-gray-400">({outstandingPercent.toFixed(0)}%)</span>
                            </div>
                          )}
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
                          checked={statusFilter === 'completed'} 
                          onChange={() => setStatusFilter('completed')} 
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
                
                <div className="overflow-x-auto overflow-y-visible">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-2 px-2 text-[10px] font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 min-w-[220px]">NCD Name</th>
                        <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Investment</th>
                        <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Gross Expected</th>
                        <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Repaid</th>
                        <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Profit</th>
                        <th className="text-center py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Expected XIRR</th>
                        <th className="text-center py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Actual XIRR</th>
                        <th className="text-center py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Status</th>
                        <th className="text-center py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHoldings.map((holding) => {
                        // Check if this holding has prepayments
                        const holdingHasPrepayments = (holding.prepaid_count || 0) > 0 || (holding.prepaid_amount || 0) > 0 ||
                          (holding.trades || []).some(t => (t.prepaid_count || 0) > 0 || (t.prepaid_amount || 0) > 0);
                        
                        // Get all expected cashflows (from secondary market calculator) and sort by date
                        // Support both structures: holding.trades[].expected_cashflows OR holding.expected_cashflows
                        const allExpectedCashflows = holding.trades?.length > 0
                          ? (holding.trades || []).flatMap(trade => trade.expected_cashflows || []).sort((a, b) => new Date(a.date) - new Date(b.date))
                          : (holding.expected_cashflows || []).sort((a, b) => new Date(a.date) - new Date(b.date));
                        
                        // Check if any cashflow has been amended due to prepayment
                        const hasAmendedCashflows = allExpectedCashflows.some(cf => cf.is_prepayment_amended);
                        
                        // ORIGINAL EXPECTED Gross (before any prepayments - use original_gross_amount if available)
                        const originalExpectedGross = allExpectedCashflows
                          .filter(cf => cf.type !== 'investment')
                          .reduce((sum, cf) => {
                            // Use original values if this was amended, otherwise use current values
                            if (cf.is_prepayment_amended && cf.original_gross_amount) {
                              return sum + cf.original_gross_amount;
                            }
                            return sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0));
                          }, 0);
                        
                        // ADJUSTED EXPECTED Gross (after prepayments - use current gross_amount)
                        const expectedGross = allExpectedCashflows
                          .filter(cf => cf.type !== 'investment')
                          .reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0);
                        
                        // Use adjusted expected for profit calculation when there are prepayments
                        // Profit = Repaid - Investment for Completed (matured) bonds
                        //        = Gross Expected - Investment for Active bonds
                        const _matStrRow = (holding.maturity_date || '').slice(0, 10) || (
                          (holding.trades || [])
                            .map(t => (t.maturity_date || '').slice(0, 10))
                            .filter(Boolean)
                            .sort()
                            .pop() || ''
                        );
                        const _todayStrRow = new Date().toISOString().slice(0, 10);
                        const _isMaturedRow = !!_matStrRow && _matStrRow <= _todayStrRow;
                        const repaidPrincipalEarly = holding.repaid_principal || 0;
                        const repaidInterestEarly = holding.repaid_interest || 0;
                        const totalRepaidEarly = holding.gross_repaid || (repaidPrincipalEarly + repaidInterestEarly);
                        const expectedProfit = _isMaturedRow
                          ? (totalRepaidEarly - holding.invested_amount)
                          : (expectedGross - holding.invested_amount);
                        const originalExpectedProfit = _isMaturedRow
                          ? (totalRepaidEarly - holding.invested_amount)
                          : (originalExpectedGross - holding.invested_amount);
                        
                        // ACTUAL Gross (from actual cashflows - sum of repayments made + due)
                        // This changes due to prepayments affecting interest calculations
                        // FIX: Prefer holding-level actual_cashflows (canonical source) to avoid duplicates from flatMap
                        const allActualCashflows = (holding.actual_cashflows && holding.actual_cashflows.length > 0)
                          ? [...holding.actual_cashflows].sort((a, b) => new Date(a.date) - new Date(b.date))
                          : (holding.trades?.length > 0
                            ? (holding.trades || []).flatMap(trade => trade.actual_cashflows || []).sort((a, b) => new Date(a.date) - new Date(b.date))
                            : []);
                        const actualGross = allActualCashflows
                          .filter(cf => cf.type !== 'investment')
                          .reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0);
                        const actualProfit = actualGross - holding.invested_amount;
                        
                        // Difference between Original Expected and Adjusted Expected (due to prepayments)
                        const expectedReduction = hasAmendedCashflows ? (originalExpectedGross - expectedGross) : 0;
                        
                        // Difference due to prepayments (Actual - Adjusted Expected)
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
                        
                        // Calculate payment status: "On Time" or "Partly Prepaid"
                        // Get current date and previous month end
                        const now = new Date();
                        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
                        const prevMonthEndStr = prevMonthEnd.toISOString().slice(0, 10);
                        
                        // Get expected payments up to previous month end (excluding investment)
                        const expectedPaymentsTillPrevMonth = allExpectedCashflows
                          .filter(cf => cf.type !== 'investment' && cf.date <= prevMonthEndStr)
                          .map(cf => ({
                            date: cf.date,
                            amount: cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0)),
                            type: cf.type
                          }));
                        
                        // Get actual payments up to previous month end (excluding investment)
                        const actualPaymentsTillPrevMonth = allActualCashflows
                          .filter(cf => cf.type !== 'investment' && cf.date <= prevMonthEndStr && cf.is_repaid)
                          .map(cf => ({
                            date: cf.date,
                            amount: cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0)),
                            type: cf.type,
                            isPrepayment: cf.type === 'prepayment' || ((cf.principal_component || 0) > 0 && (cf.interest_component || 0) === 0)
                          }));
                        
                        // Check for prepayments (payments with principal > 0 and interest = 0, or type = prepayment)
                        const hasPrepayments = actualPaymentsTillPrevMonth.some(p => p.isPrepayment) || holdingHasPrepayments;
                        
                        // ─────────────────────────────────────────────
                        // Primary status: Active (maturity in future) or Completed
                        // (maturity reached). Driven strictly by NCD_Master.end_date
                        // (shipped as holding.maturity_date). Sub-info — As per / Out of
                        // schedule — is shown in a tooltip, not inline.
                        // ─────────────────────────────────────────────
                        const _todayStr = new Date().toISOString().slice(0, 10);
                        const _matStr = (holding.maturity_date || '').slice(0, 10) || (
                          (holding.trades || [])
                            .map(t => (t.maturity_date || '').slice(0, 10))
                            .filter(Boolean)
                            .sort()
                            .pop() || ''
                        );
                        const isMatured = !!_matStr && _matStr <= _todayStr;

                        let paymentStatus = isMatured ? 'Completed' : 'Active';
                        let statusColor = isMatured
                          ? 'text-purple-600 bg-purple-50'
                          : 'text-green-600 bg-green-50';
                        let scheduleRemark = hasPrepayments ? 'Out of schedule' : 'As per schedule';
                        let scheduleRemarkColor = hasPrepayments ? 'text-amber-600' : 'text-green-600';
                        
                        return (
                        <tr key={holding.bond_id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-2 sticky left-0 bg-white min-w-[220px]">
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p
                                    className="font-medium text-gray-800 text-xs whitespace-normal break-words cursor-help"
                                    data-testid={`scheme-name-${holding.bond_id}`}
                                  >
                                    {holding.bond_name}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent side="top" align="start" className="bg-gray-900 text-white border-0 px-2.5 py-1.5 text-xs">
                                  <span className="text-gray-400">Deal ID: </span>
                                  <span className="font-mono">{holding.bond_code || '—'}</span>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <p className="text-[10px] text-gray-400">{holding.total_units} units</p>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-xs">
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="cursor-help inline-block">{formatNum(holding.invested_amount)}</p>
                                </TooltipTrigger>
                                <TooltipContent side="top" align="end" className="bg-gray-900 text-white border-0 p-0 overflow-hidden">
                                  <div className="px-3 py-2 border-b border-gray-700">
                                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Investment breakdown</p>
                                  </div>
                                  <table className="text-[11px]">
                                    <thead>
                                      <tr className="text-gray-400">
                                        <th className="text-left px-3 py-1.5 font-medium">Date</th>
                                        <th className="text-right px-3 py-1.5 font-medium">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {((holding.trades || []).length > 0
                                        ? holding.trades
                                        : [{ investment_date: holding.investment_date, invested_amount: holding.invested_amount }]
                                      ).map((t, idx) => (
                                        <tr key={idx} className="border-t border-gray-800">
                                          <td className="px-3 py-1 text-gray-200 whitespace-nowrap">
                                            {t.investment_date ? format(new Date(t.investment_date), 'dd MMM yyyy') : '—'}
                                          </td>
                                          <td className="px-3 py-1 text-right font-mono">{formatNum(t.invested_amount || 0)}</td>
                                        </tr>
                                      ))}
                                      <tr className="border-t-2 border-gray-600 bg-gray-800">
                                        <td className="px-3 py-1.5 font-semibold text-gray-100">Total</td>
                                        <td className="px-3 py-1.5 text-right font-mono font-semibold text-gray-100">
                                          {formatNum(holding.invested_amount)}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {/* No difference shown for Investment - it doesn't change */}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-xs overflow-visible">
                            <HoverCard openDelay={100} closeDelay={100}>
                              <HoverCardTrigger asChild>
                                <div className="cursor-help inline-block text-right">
                                  <p className="font-semibold">{formatNum(expectedGross)}</p>
                                  <div className="text-[10px] text-gray-500">
                                    <span title="Principal">P: {formatNum(allExpectedCashflows.filter(cf => cf.type !== 'investment').reduce((sum, cf) => sum + (cf.principal_component || 0), 0))}</span>
                                    <span className="mx-1">|</span>
                                    <span title="Interest">I: {formatNum(allExpectedCashflows.filter(cf => cf.type !== 'investment').reduce((sum, cf) => sum + (cf.interest_component || 0), 0))}</span>
                                  </div>
                                  {hasAmendedCashflows && expectedReduction > 0 && (
                                    <div className="text-[9px] text-amber-600" title={`Original: ₹${formatNum(originalExpectedGross)}`}>
                                      (-{formatNum(expectedReduction)} due to prepay)
                                    </div>
                                  )}
                                </div>
                              </HoverCardTrigger>
                              {/* Expected Cashflow Schedule Tooltip (moved from XIRR) */}
                              {allExpectedCashflows.length > 0 && (
                                <HoverCardContent side="top" align="end" className="w-[320px] p-0 bg-gray-900 text-white border-gray-600">
                                  <div className="px-3 py-2 bg-gray-800 rounded-t-lg border-b border-gray-700">
                                    <p className="font-bold text-amber-400 text-[11px]">Expected Repayments</p>
                                  </div>
                                  <div className="p-3 max-h-64 overflow-y-auto">
                                    <table className="w-full text-[10px]">
                                      <thead>
                                        <tr className="text-gray-400 border-b border-gray-700">
                                          <th className="text-left py-1 font-medium">Date</th>
                                          <th className="text-right py-1 font-medium">Principal</th>
                                          <th className="text-right py-1 font-medium">Interest</th>
                                          <th className="text-right py-1 font-medium">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(() => {
                                          // Group cashflows by date (YYYY-MM-DD) so entries
                                          // falling on the same day (e.g. multiple trades of
                                          // the same bond) render as a single merged row.
                                          const groups = new Map();
                                          for (const cf of allExpectedCashflows) {
                                            const isInv = cf.type === 'investment';
                                            const key = `${isInv ? 'INV::' : 'EXP::'}${(cf.date || '').slice(0, 10)}`;
                                            const p = cf.principal_component || 0;
                                            const i = cf.interest_component || 0;
                                            const t = cf.gross_amount || (p + i);
                                            if (!groups.has(key)) {
                                              groups.set(key, { date: cf.date, isInvestment: isInv, principal: 0, interest: 0, total: 0, count: 0 });
                                            }
                                            const g = groups.get(key);
                                            g.principal += p;
                                            g.interest  += i;
                                            g.total     += t;
                                            g.count     += 1;
                                          }
                                          const merged = Array.from(groups.values()).sort(
                                            (a, b) => new Date(a.date) - new Date(b.date)
                                          );
                                          return (
                                            <>
                                              {merged.map((g, i) => (
                                                <tr key={i} className={`border-b border-gray-800 ${g.isInvestment ? 'bg-red-900/30' : ''}`}>
                                                  <td className="py-1">
                                                    {new Date(g.date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: '2-digit'})}
                                                    {g.count > 1 && <span className="ml-1 text-[9px] text-gray-400">({g.count})</span>}
                                                  </td>
                                                  <td className={`text-right py-1 ${g.isInvestment ? 'text-red-400' : 'text-blue-400'}`}>{g.isInvestment ? '-' : ''}{Math.round(g.principal).toLocaleString('en-IN')}</td>
                                                  <td className={`text-right py-1 ${g.isInvestment ? 'text-red-400' : 'text-green-400'}`}>{g.isInvestment ? '-' : ''}{Math.round(g.interest).toLocaleString('en-IN')}</td>
                                                  <td className={`text-right py-1 font-semibold ${g.isInvestment ? 'text-red-400' : 'text-white'}`}>{g.isInvestment ? '-' : ''}{Math.round(Math.abs(g.total)).toLocaleString('en-IN')}</td>
                                                </tr>
                                              ))}
                                            </>
                                          );
                                        })()}
                                      </tbody>
                                      <tfoot>
                                        <tr className="font-bold bg-gray-800">
                                          <td className="py-1.5 text-amber-400">XIRR</td>
                                          <td colSpan="3" className="text-right py-1.5 text-green-400">{holding.xirr?.toFixed(2) || '-'}%</td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                </HoverCardContent>
                              )}
                            </HoverCard>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-xs overflow-visible">
                            <HoverCard openDelay={100} closeDelay={100}>
                              <HoverCardTrigger asChild>
                                <div className="cursor-help inline-block text-right" data-testid={`repaid-cell-${holding.bond_id}`}>
                                  <p className="text-blue-700 font-semibold">{formatNum(totalRepaid)}</p>
                                  <div className="text-[10px] text-gray-500">
                                    <span title="Principal Repaid">P: {formatNum(repaidPrincipal)}</span>
                                    <span className="mx-1">|</span>
                                    <span title="Interest Repaid">I: {formatNum(repaidInterest)}</span>
                                  </div>
                                </div>
                              </HoverCardTrigger>
                              {/* Repayment History Tooltip — mirrors the Gross Expected style */}
                              {(holding.repaid_rows || []).length > 0 && (
                                <HoverCardContent side="top" align="end" className="w-[320px] p-0 bg-gray-900 text-white border-gray-600">
                                  <div className="px-3 py-2 bg-gray-800 rounded-t-lg border-b border-gray-700">
                                    <p className="font-bold text-blue-400 text-[11px]">Repayment History (from emails)</p>
                                  </div>
                                  <div className="p-3 max-h-64 overflow-y-auto">
                                    <table className="w-full text-[10px]">
                                      <thead>
                                        <tr className="text-gray-400 border-b border-gray-700">
                                          <th className="text-left py-1 font-medium">Date</th>
                                          <th className="text-right py-1 font-medium">Principal</th>
                                          <th className="text-right py-1 font-medium">Interest</th>
                                          <th className="text-right py-1 font-medium">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(holding.repaid_rows || []).map((r, i) => (
                                          <tr key={i} className="border-b border-gray-800">
                                            <td className="py-1">
                                              {new Date(r.date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: '2-digit'})}
                                              {r.count > 1 && <span className="ml-1 text-[9px] text-gray-400">({r.count})</span>}
                                            </td>
                                            <td className="text-right py-1 text-blue-400">{Math.round(r.principal || 0).toLocaleString('en-IN')}</td>
                                            <td className="text-right py-1 text-green-400">{Math.round(r.interest || 0).toLocaleString('en-IN')}</td>
                                            <td className="text-right py-1 font-semibold text-white">{Math.round(r.gross || 0).toLocaleString('en-IN')}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot>
                                        <tr className="font-bold bg-gray-800">
                                          <td className="py-1.5 text-blue-400">Total</td>
                                          <td className="text-right py-1.5 text-blue-400">{Math.round(repaidPrincipal).toLocaleString('en-IN')}</td>
                                          <td className="text-right py-1.5 text-green-400">{Math.round(repaidInterest).toLocaleString('en-IN')}</td>
                                          <td className="text-right py-1.5 text-white">{Math.round(totalRepaid).toLocaleString('en-IN')}</td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                </HoverCardContent>
                              )}
                            </HoverCard>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-xs">
                            <p className={expectedProfit >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{formatNum(expectedProfit)}</p>
                            {(() => {
                              // Informational A | N breakdown (does NOT change the main profit above)
                              // A = Gross interest already received (NCD_Repayments)
                              // N = Balance of future-dated interest still to come
                              const _todayStr = new Date().toISOString().slice(0, 10);
                              const futureInterestBalance = allExpectedCashflows
                                .filter(cf => cf.type !== 'investment')
                                .filter(cf => ((cf.date || '') + '').slice(0, 10) > _todayStr)
                                .reduce((s, cf) => s + (cf.interest_component || 0), 0);
                              return (
                                <div className="text-[10px] text-gray-500">
                                  <span title="Actual = Gross interest already received (from NCD_Repayments)">A: {formatNum(repaidInterest)}</span>
                                  <span className="mx-1">|</span>
                                  <span title="Notional = Balance of interest on future-dated repayments still to be received">N: {formatNum(futureInterestBalance)}</span>
                                </div>
                              );
                            })()}
                            {hasAmendedCashflows && expectedReduction > 0 && (
                              <div className="text-[9px] text-amber-600" title={`Original profit: ₹${formatNum(originalExpectedProfit)}`}>
                                (-{formatNum(expectedReduction)} adj)
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {holding.xirr !== null && holding.xirr !== undefined ? (
                              <span className="font-mono text-xs text-green-600">{holding.xirr.toFixed(2)}%</span>
                            ) : (
                              <span className="text-gray-400 text-[10px]">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center overflow-visible">
                            {(() => {
                              // Build actual-XIRR cashflows on the fly so we can also
                              // show them in a tooltip.
                              // - Investment(s): negative outflows on trade investment_date
                              // - Past repayments: positive inflows from Ncd_Repayments (repaid_rows)
                              // - Future scheduled: positive inflows from the expected
                              //   schedule AFTER today, ONLY IF the bond has not yet matured
                              const todayStr = new Date().toISOString().slice(0, 10);
                              const maturityStr = (holding.trades || [])
                                .map(t => (t.maturity_date || '').slice(0, 10))
                                .filter(Boolean)
                                .sort()
                                .pop() || '';
                              const matured = !!maturityStr && maturityStr <= todayStr;
                              const cfs = [];
                              (holding.trades || []).forEach(t => {
                                if (t.investment_date && (t.invested_amount || t.total_amount)) {
                                  cfs.push({
                                    date: (t.investment_date || '').slice(0, 10),
                                    amount: -(t.invested_amount || t.total_amount || 0),
                                    label: `Investment${t.units ? ` (${t.units}u)` : ''}`,
                                  });
                                }
                              });
                              if (cfs.length === 0 && holding.invested_amount) {
                                cfs.push({
                                  date: ((holding.trades || [])[0]?.investment_date || '').slice(0, 10) || todayStr,
                                  amount: -(holding.invested_amount || 0),
                                  label: 'Investment',
                                });
                              }
                              (holding.repaid_rows || []).forEach(r => {
                                cfs.push({ date: r.date, amount: r.gross || 0, label: 'Actual repayment' });
                              });
                              if (!matured) {
                                allExpectedCashflows
                                  .filter(cf => cf.type !== 'investment' && ((cf.date || '').slice(0, 10)) > todayStr)
                                  .forEach(cf => {
                                    const p = cf.principal_component || 0;
                                    const i = cf.interest_component || 0;
                                    cfs.push({
                                      date: (cf.date || '').slice(0, 10),
                                      amount: cf.gross_amount || (p + i),
                                      label: 'Scheduled',
                                    });
                                  });
                              }
                              const xirrVal = computeXirr(cfs);
                              const displayed = xirrVal !== null ? xirrVal : holding.actual_xirr;
                              // Compare rounded values (2dp) so floating-point noise like
                              // 11.4999999 doesn't flag a holding as amber when it displays
                              // identical to the expected XIRR.
                              const expectedRounded = Math.round(((holding.xirr || 0) + Number.EPSILON) * 100) / 100;
                              const actualRounded   = displayed !== null && displayed !== undefined
                                ? Math.round((displayed + Number.EPSILON) * 100) / 100
                                : null;
                              const isGood = actualRounded !== null && actualRounded >= expectedRounded;
                              return (
                                <HoverCard openDelay={100} closeDelay={100}>
                                  <HoverCardTrigger asChild>
                                    <div className="cursor-help inline-block">
                                      {displayed !== null && displayed !== undefined ? (
                                        <span className={`font-mono text-xs ${isGood ? 'text-green-600' : 'text-amber-600'}`}>
                                          {displayed.toFixed(2)}%
                                        </span>
                                      ) : (
                                        <span className="text-gray-400 text-[10px]">-</span>
                                      )}
                                    </div>
                                  </HoverCardTrigger>
                                  {cfs.length > 0 && (
                                    <HoverCardContent side="top" align="end" className="w-[340px] p-0 bg-gray-900 text-white border-gray-600">
                                      <div className="px-3 py-2 bg-gray-800 rounded-t-lg border-b border-gray-700">
                                        <p className="font-bold text-amber-400 text-[11px]">
                                          Actual Repayments {matured ? '(Matured — actuals only)' : '(Actuals + future scheduled)'}
                                        </p>
                                      </div>
                                      <div className="p-3 max-h-64 overflow-y-auto">
                                        <table className="w-full text-[10px]">
                                          <thead>
                                            <tr className="text-gray-400 border-b border-gray-700">
                                              <th className="text-left py-1 font-medium">Date</th>
                                              <th className="text-left py-1 font-medium">Source</th>
                                              <th className="text-right py-1 font-medium">Amount</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {[...cfs].sort((a, b) => a.date.localeCompare(b.date)).map((c, i) => {
                                              const isInv = c.amount < 0;
                                              const isFuture = (c.date || '') > todayStr;
                                              return (
                                                <tr key={i} className={`border-b border-gray-800 ${isInv ? 'bg-red-900/30' : ''}`}>
                                                  <td className="py-1">
                                                    {new Date(c.date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: '2-digit'})}
                                                  </td>
                                                  <td className={`py-1 ${isFuture && !isInv ? 'text-amber-300' : 'text-gray-300'}`}>
                                                    {c.label}{isFuture && !isInv ? ' (future)' : ''}
                                                  </td>
                                                  <td className={`text-right py-1 font-semibold ${isInv ? 'text-red-400' : (isFuture ? 'text-amber-300' : 'text-green-400')}`}>
                                                    {isInv ? '-' : ''}{Math.round(Math.abs(c.amount)).toLocaleString('en-IN')}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                          <tfoot>
                                            <tr className="font-bold bg-gray-800">
                                              <td className="py-1.5 text-amber-400" colSpan={2}>XIRR</td>
                                              <td className="text-right py-1.5 text-green-400">{displayed !== null && displayed !== undefined ? `${displayed.toFixed(2)}%` : '-'}</td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    </HoverCardContent>
                                  )}
                                </HoverCard>
                              );
                            })()}
                          </td>
                          <td className="py-2 px-2 text-center overflow-visible">
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium cursor-help ${statusColor}`}>
                                    {paymentStatus}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="bg-gray-900 text-white border-gray-700">
                                  <div className="text-[11px]">
                                    <p className="font-semibold">
                                      {paymentStatus}{_matStr ? ` · Maturity ${new Date(_matStr).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})}` : ''}
                                    </p>
                                    <p className={`mt-1 ${hasPrepayments ? 'text-amber-300' : 'text-green-300'}`}>
                                      {scheduleRemark}
                                    </p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
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
              </>)}
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
                <h2 className="text-lg font-semibold text-gray-800">Repayment Details</h2>
                <p className="text-sm text-gray-600">{modalData.bond_name} • {modalData.total_units} units • Invested: {formatINR(modalData.invested_amount)}</p>
              </div>
              <div className="flex items-center gap-2">
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
              
              {/* Individual Transaction Tabs - Show for each investment date */}
              {(() => {
                // Get unique investment dates from trades array
                const trades = modalData.trades || [];
                if (!trades.length) return null;
                
                const uniqueDates = [...new Set(trades.map(t => t.investment_date?.split('T')[0]).filter(Boolean))];
                
                // Show tabs even for single investment date
                return trades.map((trade, index) => (
                  <button
                    key={trade.trade_id || index}
                    onClick={() => setActiveTab(index)}
                    className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                      activeTab === index 
                        ? 'border-etihad-gold-600 text-etihad-gold-700 bg-white' 
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                    data-testid={`trade-tab-${index}`}
                  >
                    <span className="block">{trade.investment_date ? format(new Date(trade.investment_date), "dd MMM yyyy") : 'N/A'}</span>
                    <span className="text-xs text-gray-400">{trade.units} units</span>
                  </button>
                ));
              })()}
            </div>
            
            {/* Tab Content */}
            <div className="flex-1 overflow-auto">
              {/* Summary Tab Content */}
              {activeTab === "summary" && (
                <div className="p-4 space-y-4">
                  {/* ──────────────────────────────────────────────
                       TOP STRIP — same metrics as the outer table row
                      ────────────────────────────────────────────── */}
                  {(() => {
                    const investedTotal = modalData.invested_amount || 0;
                    const grossExpectedTotal = expectedCashflows
                      .filter(cf => cf.type !== 'investment')
                      .reduce((s, cf) => s + (cf.gross_amount || ((cf.principal_component||0)+(cf.interest_component||0))), 0);
                    const grossRepaidTotal = (modalData.repaid_rows || [])
                      .reduce((s, r) => s + (r.gross || 0), 0);
                    // Determine status (Active vs Completed) for profit logic
                    const _todayStrProfit = new Date().toISOString().slice(0, 10);
                    const _matStrProfit = (modalData.maturity_date || '').slice(0, 10) || (
                      (modalData.trades || [])
                        .map(t => (t.maturity_date || '').slice(0, 10))
                        .filter(Boolean)
                        .sort()
                        .pop() || ''
                    );
                    const _isMaturedProfit = !!_matStrProfit && _matStrProfit <= _todayStrProfit;
                    // Profit = Repaid - Investment for Completed bonds, else Gross Expected - Investment
                    const expectedProfitTotal = _isMaturedProfit
                      ? (grossRepaidTotal - investedTotal)
                      : (grossExpectedTotal - investedTotal);
                    const expectedXirrVal = modalData.xirr;

                    // Recompute Actual XIRR (matches the outer table: actuals + future scheduled unless matured)
                    const todayStr = new Date().toISOString().slice(0, 10);
                    const matStr = (modalData.maturity_date || '').slice(0, 10) || (
                      (modalData.trades || [])
                        .map(t => (t.maturity_date || '').slice(0, 10))
                        .filter(Boolean)
                        .sort()
                        .pop() || ''
                    );
                    const isMatured = !!matStr && matStr <= todayStr;
                    const actualXirrCfs = [];
                    (modalData.trades || []).forEach(t => {
                      if (t.investment_date && (t.invested_amount || t.total_amount)) {
                        actualXirrCfs.push({ date: (t.investment_date || '').slice(0,10), amount: -(t.invested_amount || t.total_amount || 0), label: `Investment${t.units ? ` (${t.units}u)` : ''}` });
                      }
                    });
                    if (actualXirrCfs.length === 0 && investedTotal) {
                      actualXirrCfs.push({ date: ((modalData.trades || [])[0]?.investment_date || '').slice(0,10) || todayStr, amount: -investedTotal, label: 'Investment' });
                    }
                    (modalData.repaid_rows || []).forEach(r => actualXirrCfs.push({ date: r.date, amount: r.gross || 0, label: 'Actual repayment' }));
                    if (!isMatured) {
                      expectedCashflows
                        .filter(cf => cf.type !== 'investment' && ((cf.date || '').slice(0,10)) > todayStr)
                        .forEach(cf => {
                          const p = cf.principal_component || 0; const i = cf.interest_component || 0;
                          actualXirrCfs.push({ date: (cf.date || '').slice(0,10), amount: cf.gross_amount || (p+i), label: 'Scheduled' });
                        });
                    }
                    const actualXirrVal = computeXirr(actualXirrCfs);

                    const stat = (label, value, valueClass = 'text-gray-800') => (
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
                        <span className={`text-sm font-semibold font-mono mt-0.5 ${valueClass}`}>{value}</span>
                      </div>
                    );

                    return (
                      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 grid grid-cols-3 md:grid-cols-6 gap-3">
                        {stat('Investment', formatINR(investedTotal))}
                        {stat('Gross Expected', formatINR(grossExpectedTotal))}
                        {stat('Repaid', formatINR(grossRepaidTotal), 'text-blue-700')}
                        {stat('Profit', formatINR(expectedProfitTotal), expectedProfitTotal >= 0 ? 'text-green-600' : 'text-red-600')}
                        {stat('Expected XIRR', expectedXirrVal !== null && expectedXirrVal !== undefined ? `${expectedXirrVal.toFixed(2)}%` : '-', 'text-green-600')}
                        {stat('Actual XIRR', actualXirrVal !== null && actualXirrVal !== undefined ? `${actualXirrVal.toFixed(2)}%` : '-', (actualXirrVal !== null && actualXirrVal !== undefined && Math.round((actualXirrVal + Number.EPSILON) * 100) / 100 >= Math.round(((expectedXirrVal || 0) + Number.EPSILON) * 100) / 100) ? 'text-green-600' : 'text-amber-600')}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    
                    {/* LEFT COLUMN — Expected Repayments (same as Gross Expected tooltip) */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
                      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Expected Repayments
                        </h3>
                      </div>
                      {(() => {
                        // Group cashflows by date — same logic as the Gross Expected tooltip
                        const groups = new Map();
                        for (const cf of expectedCashflows) {
                          const isInv = cf.type === 'investment';
                          const key = `${isInv ? 'INV::' : 'EXP::'}${(cf.date || '').slice(0, 10)}`;
                          const p = cf.principal_component || 0;
                          const i = cf.interest_component || 0;
                          const td = cf.tds_amount || cf.tds || 0;
                          const t = cf.gross_amount || (p + i);
                          if (!groups.has(key)) {
                            groups.set(key, { date: cf.date, isInvestment: isInv, principal: 0, interest: 0, tds: 0, total: 0, count: 0 });
                          }
                          const g = groups.get(key);
                          g.principal += p;
                          g.interest  += i;
                          g.tds       += td;
                          g.total     += t;
                          g.count     += 1;
                        }
                        const merged = Array.from(groups.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
                        return (
                          <>
                            <div className="flex-1 max-h-[340px] overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                                  <tr>
                                    <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Date</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Principal</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Interest</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">TDS</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {merged.length === 0 ? (
                                    <tr><td colSpan="5" className="py-8 text-center text-gray-500">No expected cashflows</td></tr>
                                  ) : merged.map((g, i) => (
                                    <tr key={i} className={g.isInvestment ? 'bg-red-50' : 'bg-white hover:bg-gray-50'}>
                                      <td className={`py-2 px-3 font-mono ${g.isInvestment ? 'text-red-700' : 'text-gray-900'}`}>
                                        {format(new Date(g.date), 'dd MMM yy')}
                                        {g.count > 1 && <span className="ml-1 text-[10px] text-gray-400">({g.count})</span>}
                                      </td>
                                      <td className={`py-2 px-3 text-right font-mono ${g.isInvestment ? 'text-red-600' : 'text-blue-700'}`}>{g.isInvestment ? '-' : ''}{Math.round(g.principal).toLocaleString('en-IN')}</td>
                                      <td className={`py-2 px-3 text-right font-mono ${g.isInvestment ? 'text-red-600' : 'text-green-700'}`}>{g.isInvestment ? '-' : ''}{Math.round(g.interest).toLocaleString('en-IN')}</td>
                                      <td className={`py-2 px-3 text-right font-mono ${g.isInvestment ? 'text-red-600' : 'text-amber-600'}`}>{g.isInvestment ? '-' : ''}{Math.round(g.tds || 0).toLocaleString('en-IN')}</td>
                                      <td className={`py-2 px-3 text-right font-mono font-semibold ${g.isInvestment ? 'text-red-700' : 'text-gray-900'}`}>{g.isInvestment ? '-' : ''}{Math.round(Math.abs(g.total)).toLocaleString('en-IN')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* Sticky XIRR footer */}
                            <div className="bg-gray-50 border-t border-gray-200 px-3 py-2 flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-gray-600 uppercase">Expected XIRR</span>
                              <span className="font-mono text-xs font-bold text-green-700">
                                {modalData.xirr !== null && modalData.xirr !== undefined ? `${modalData.xirr.toFixed(2)}%` : '-'}
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    
                    {/* RIGHT COLUMN — Actual Repayments (same as Actual XIRR tooltip) */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
                      {(() => {
                        const todayStr = new Date().toISOString().slice(0, 10);
                        const matStr = (modalData.maturity_date || '').slice(0, 10) || (
                          (modalData.trades || [])
                            .map(t => (t.maturity_date || '').slice(0, 10))
                            .filter(Boolean)
                            .sort()
                            .pop() || ''
                        );
                        const isMatured = !!matStr && matStr <= todayStr;
                        const cfs = [];
                        (modalData.trades || []).forEach(t => {
                          if (t.investment_date && (t.invested_amount || t.total_amount)) {
                            cfs.push({ date: (t.investment_date || '').slice(0,10), amount: -(t.invested_amount || t.total_amount || 0), principal: 0, interest: 0, tds: 0, total: -(t.invested_amount || t.total_amount || 0), label: `Investment${t.units ? ` (${t.units}u)` : ''}`, kind: 'investment' });
                          }
                        });
                        if (cfs.length === 0 && (modalData.invested_amount || 0) > 0) {
                          cfs.push({ date: ((modalData.trades || [])[0]?.investment_date || '').slice(0,10) || todayStr, amount: -(modalData.invested_amount || 0), principal: 0, interest: 0, tds: 0, total: -(modalData.invested_amount || 0), label: 'Investment', kind: 'investment' });
                        }
                        (modalData.repaid_rows || []).forEach(r => cfs.push({
                          date: r.date,
                          amount: r.gross || 0,
                          principal: r.principal || 0,
                          interest: r.interest || 0,
                          tds: r.tds || 0,
                          total: r.gross || 0,
                          label: 'Actual repayment',
                          kind: 'actual',
                        }));
                        if (!isMatured) {
                          expectedCashflows
                            .filter(cf => cf.type !== 'investment' && ((cf.date || '').slice(0,10)) > todayStr)
                            .forEach(cf => {
                              const p = cf.principal_component || 0;
                              const i = cf.interest_component || 0;
                              const td = cf.tds_amount || cf.tds || 0;
                              const tt = cf.gross_amount || (p + i);
                              cfs.push({
                                date: (cf.date || '').slice(0,10),
                                amount: tt,
                                principal: p,
                                interest: i,
                                tds: td,
                                total: tt,
                                label: 'Scheduled',
                                kind: 'future',
                              });
                            });
                        }
                        const actualXirrVal = computeXirr(cfs);
                        const sorted = [...cfs].sort((a, b) => a.date.localeCompare(b.date));
                        return (
                          <>
                            <div className="bg-gradient-to-r from-green-600 to-green-700 px-4 py-3">
                              <h3 className="font-semibold text-white flex items-center gap-2">
                                <Check className="h-4 w-4" />
                                Actual Repayments
                                <span className="text-[10px] font-normal text-green-100">
                                  {isMatured ? '(Matured — actuals only)' : '(Actuals + future scheduled)'}
                                </span>
                              </h3>
                            </div>
                            <div className="flex-1 max-h-[340px] overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                                  <tr>
                                    <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Date</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Principal</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Interest</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">TDS</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {!sorted.length ? (
                                    <tr><td colSpan="5" className="py-8 text-center text-gray-500">No actual cashflows</td></tr>
                                  ) : sorted.map((c, idx) => {
                                    const isInv = c.kind === 'investment';
                                    const isFut = c.kind === 'future';
                                    const dashIfInv = isInv ? '-' : '';
                                    return (
                                      <tr key={idx} className={isInv ? 'bg-red-50' : isFut ? 'bg-amber-50' : 'bg-white hover:bg-gray-50'}>
                                        <td className={`py-2 px-3 font-mono ${isInv ? 'text-red-700' : isFut ? 'text-amber-700' : 'text-gray-900'}`}>
                                          {format(new Date(c.date), 'dd MMM yy')}
                                          {isFut && <span className="ml-1 text-[9px] text-amber-700">(future)</span>}
                                        </td>
                                        <td className={`py-2 px-3 text-right font-mono ${isInv ? 'text-red-600' : isFut ? 'text-amber-700' : 'text-blue-700'}`}>{dashIfInv}{Math.round(c.principal || 0).toLocaleString('en-IN')}</td>
                                        <td className={`py-2 px-3 text-right font-mono ${isInv ? 'text-red-600' : isFut ? 'text-amber-700' : 'text-green-700'}`}>{dashIfInv}{Math.round(c.interest || 0).toLocaleString('en-IN')}</td>
                                        <td className={`py-2 px-3 text-right font-mono ${isInv ? 'text-red-600' : 'text-amber-600'}`}>{dashIfInv}{Math.round(c.tds || 0).toLocaleString('en-IN')}</td>
                                        <td className={`py-2 px-3 text-right font-mono font-semibold ${isInv ? 'text-red-700' : isFut ? 'text-amber-700' : 'text-gray-900'}`}>{isInv ? '-' : ''}{Math.round(Math.abs(c.total || c.amount || 0)).toLocaleString('en-IN')}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {/* Sticky XIRR footer */}
                            <div className="bg-gray-50 border-t border-gray-200 px-3 py-2 flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-gray-600 uppercase">Actual XIRR</span>
                              <span className={`font-mono text-xs font-bold ${actualXirrVal !== null && actualXirrVal !== undefined && Math.round((actualXirrVal + Number.EPSILON) * 100) / 100 >= Math.round(((modalData.xirr || 0) + Number.EPSILON) * 100) / 100 ? 'text-green-700' : 'text-amber-600'}`}>
                                {actualXirrVal !== null && actualXirrVal !== undefined ? `${actualXirrVal.toFixed(2)}%` : '-'}
                              </span>
                            </div>
                          </>
                        );
                      })()}
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
                        <span className="text-gray-500">Status:</span>
                        <span className={`font-semibold ml-2 px-2 py-0.5 rounded-full text-xs ${
                          (modalData.trades[activeTab].actual_cashflows || []).some(cf => 
                            cf.type === 'prepayment' || 
                            (cf.type !== 'investment' && (cf.principal_component || 0) > 0 && (cf.interest_component || 0) === 0)
                          ) || (modalData.trades[activeTab].prepaid_count || 0) > 0
                            ? 'text-amber-600 bg-amber-50' 
                            : 'text-green-600 bg-green-50'
                        }`}>
                          {(modalData.trades[activeTab].actual_cashflows || []).some(cf => 
                            cf.type === 'prepayment' || 
                            (cf.type !== 'investment' && (cf.principal_component || 0) > 0 && (cf.interest_component || 0) === 0)
                          ) || (modalData.trades[activeTab].prepaid_count || 0) > 0 ? 'Partly Prepaid' : 'On Time'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Two Column Layout for Individual Transaction — SAME template as Summary tab */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {(() => {
                      const trade = modalData.trades[activeTab];
                      const tradeInvested = trade.invested_amount || trade.total_amount || 0;
                      // Per-trade repaid rows come straight from the API
                      // (principal-matched per investment-date group on the
                      // backend), so each tab shows ONLY that trade's actual
                      // transaction history — no pro-rata cross-attribution.
                      const tradeRepaidRows = (trade.repaid_rows || []).map(r => ({
                        date: r.date,
                        principal: r.principal || 0,
                        interest:  r.interest  || 0,
                        tds:       r.tds       || 0,
                        gross:     r.gross     || 0,
                      }));
                      const tradeExpected = trade.expected_cashflows || [];
                      const todayStr = new Date().toISOString().slice(0, 10);
                      const matStr = (trade.maturity_date || modalData.maturity_date || '').slice(0, 10);
                      const isMatured = !!matStr && matStr <= todayStr;

                      // EXPECTED — group by date (principal/interest/tds/total) so columns mirror Actual
                      const groups = new Map();
                      for (const cf of tradeExpected) {
                        const isInv = cf.type === 'investment';
                        const key = `${isInv ? 'INV::' : 'EXP::'}${(cf.date || '').slice(0, 10)}`;
                        const p = cf.principal_component || 0;
                        const i = cf.interest_component || 0;
                        const td = cf.tds_amount || cf.tds || 0;
                        const t = cf.gross_amount || (p + i);
                        if (!groups.has(key)) {
                          groups.set(key, { date: cf.date, isInvestment: isInv, principal: 0, interest: 0, tds: 0, total: 0, count: 0 });
                        }
                        const g = groups.get(key);
                        g.principal += p;
                        g.interest  += i;
                        g.tds       += td;
                        g.total     += t;
                        g.count     += 1;
                      }
                      const expMerged = Array.from(groups.values()).sort((a, b) => new Date(a.date) - new Date(b.date));

                      // ACTUAL — investments + per-trade actual repayments + future scheduled (if not matured)
                      // Each entry carries Principal / Interest / TDS / Total so the table mirrors the Expected panel.
                      const cfs = [];
                      if (trade.investment_date && tradeInvested) {
                        cfs.push({ date: (trade.investment_date || '').slice(0,10), amount: -tradeInvested, principal: 0, interest: 0, tds: 0, total: -tradeInvested, label: 'Investment', kind: 'investment' });
                      }
                      tradeRepaidRows.forEach(r => cfs.push({
                        date: r.date,
                        amount: r.gross || 0,
                        principal: r.principal || 0,
                        interest: r.interest || 0,
                        tds: r.tds || 0,
                        total: r.gross || 0,
                        label: 'Actual repayment',
                        kind: 'actual',
                      }));
                      if (!isMatured) {
                        tradeExpected
                          .filter(cf => cf.type !== 'investment' && ((cf.date || '').slice(0,10)) > todayStr)
                          .forEach(cf => {
                            const p = cf.principal_component || 0;
                            const i = cf.interest_component || 0;
                            const td = cf.tds_amount || cf.tds || 0;
                            const tt = cf.gross_amount || (p + i);
                            cfs.push({
                              date: (cf.date || '').slice(0,10),
                              amount: tt,
                              principal: p,
                              interest: i,
                              tds: td,
                              total: tt,
                              label: 'Scheduled',
                              kind: 'future',
                            });
                          });
                      }
                      const actualXirrVal = computeXirr(cfs);
                      const sortedCfs = [...cfs].sort((a, b) => a.date.localeCompare(b.date));

                      return (<>
                        {/* LEFT — Expected Repayments (mirrors Summary tab) */}
                        <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
                          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
                            <h3 className="font-semibold text-white flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              Expected Repayments
                            </h3>
                          </div>
                          <div className="flex-1 max-h-[340px] overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                                <tr>
                                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Date</th>
                                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Principal</th>
                                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Interest</th>
                                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">TDS</th>
                                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {expMerged.length === 0 ? (
                                  <tr><td colSpan="5" className="py-8 text-center text-gray-500">No expected cashflows</td></tr>
                                ) : expMerged.map((g, i) => (
                                  <tr key={i} className={g.isInvestment ? 'bg-red-50' : 'bg-white hover:bg-gray-50'}>
                                    <td className={`py-2 px-3 font-mono ${g.isInvestment ? 'text-red-700' : 'text-gray-900'}`}>
                                      {format(new Date(g.date), 'dd MMM yy')}
                                      {g.count > 1 && <span className="ml-1 text-[10px] text-gray-400">({g.count})</span>}
                                    </td>
                                    <td className={`py-2 px-3 text-right font-mono ${g.isInvestment ? 'text-red-600' : 'text-blue-700'}`}>{g.isInvestment ? '-' : ''}{Math.round(g.principal).toLocaleString('en-IN')}</td>
                                    <td className={`py-2 px-3 text-right font-mono ${g.isInvestment ? 'text-red-600' : 'text-green-700'}`}>{g.isInvestment ? '-' : ''}{Math.round(g.interest).toLocaleString('en-IN')}</td>
                                    <td className={`py-2 px-3 text-right font-mono ${g.isInvestment ? 'text-red-600' : 'text-amber-600'}`}>{g.isInvestment ? '-' : ''}{Math.round(g.tds || 0).toLocaleString('en-IN')}</td>
                                    <td className={`py-2 px-3 text-right font-mono font-semibold ${g.isInvestment ? 'text-red-700' : 'text-gray-900'}`}>{g.isInvestment ? '-' : ''}{Math.round(Math.abs(g.total)).toLocaleString('en-IN')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="bg-gray-50 border-t border-gray-200 px-3 py-2 flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-gray-600 uppercase">Expected XIRR</span>
                            <span className="font-mono text-xs font-bold text-green-700">
                              {trade.xirr !== null && trade.xirr !== undefined ? `${trade.xirr.toFixed(2)}%` : (modalData.xirr !== null && modalData.xirr !== undefined ? `${modalData.xirr.toFixed(2)}%` : '-')}
                            </span>
                          </div>
                        </div>

                        {/* RIGHT — Actual Repayments (mirrors Summary tab: Date | P | I | TDS | Total) */}
                        <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
                          <div className="bg-gradient-to-r from-green-600 to-green-700 px-4 py-3">
                            <h3 className="font-semibold text-white flex items-center gap-2">
                              <Check className="h-4 w-4" />
                              Actual Repayments
                              <span className="text-[10px] font-normal text-green-100">
                                {isMatured ? '(Matured — actuals only)' : '(Actuals + future scheduled)'}
                              </span>
                            </h3>
                          </div>
                          <div className="flex-1 max-h-[340px] overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                                <tr>
                                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Date</th>
                                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Principal</th>
                                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Interest</th>
                                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">TDS</th>
                                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-600 uppercase">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {sortedCfs.length === 0 ? (
                                  <tr><td colSpan="5" className="py-8 text-center text-gray-500">No actual cashflows</td></tr>
                                ) : sortedCfs.map((c, idx) => {
                                  const isInv = c.kind === 'investment';
                                  const isFut = c.kind === 'future';
                                  const dashIfInv = isInv ? '-' : '';
                                  return (
                                    <tr key={idx} className={isInv ? 'bg-red-50' : isFut ? 'bg-amber-50' : 'bg-white hover:bg-gray-50'}>
                                      <td className={`py-2 px-3 font-mono ${isInv ? 'text-red-700' : isFut ? 'text-amber-700' : 'text-gray-900'}`}>
                                        {format(new Date(c.date), 'dd MMM yy')}
                                        {isFut && <span className="ml-1 text-[9px] text-amber-700">(future)</span>}
                                      </td>
                                      <td className={`py-2 px-3 text-right font-mono ${isInv ? 'text-red-600' : isFut ? 'text-amber-700' : 'text-blue-700'}`}>{dashIfInv}{Math.round(c.principal || 0).toLocaleString('en-IN')}</td>
                                      <td className={`py-2 px-3 text-right font-mono ${isInv ? 'text-red-600' : isFut ? 'text-amber-700' : 'text-green-700'}`}>{dashIfInv}{Math.round(c.interest || 0).toLocaleString('en-IN')}</td>
                                      <td className={`py-2 px-3 text-right font-mono ${isInv ? 'text-red-600' : 'text-amber-600'}`}>{dashIfInv}{Math.round(c.tds || 0).toLocaleString('en-IN')}</td>
                                      <td className={`py-2 px-3 text-right font-mono font-semibold ${isInv ? 'text-red-700' : isFut ? 'text-amber-700' : 'text-gray-900'}`}>{isInv ? '-' : ''}{Math.round(Math.abs(c.total || c.amount || 0)).toLocaleString('en-IN')}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div className="bg-gray-50 border-t border-gray-200 px-3 py-2 flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-gray-600 uppercase">Actual XIRR</span>
                            <span className={`font-mono text-xs font-bold ${actualXirrVal !== null && actualXirrVal !== undefined && Math.round((actualXirrVal + Number.EPSILON) * 100) / 100 >= Math.round(((trade.xirr || modalData.xirr || 0) + Number.EPSILON) * 100) / 100 ? 'text-green-700' : 'text-amber-600'}`}>
                              {actualXirrVal !== null && actualXirrVal !== undefined ? `${actualXirrVal.toFixed(2)}%` : '-'}
                            </span>
                          </div>
                        </div>
                      </>);
                    })()}
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
