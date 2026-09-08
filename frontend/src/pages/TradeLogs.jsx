import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import * as XLSX from "xlsx";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import ClientSidebar from "@/components/ClientSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  Search, Download, Calendar, Filter, RefreshCw,
  CheckCircle, XCircle, Clock, Users, Activity,
  ChevronDown, ChevronUp, Eye, MoreVertical, ChevronLeft, ChevronRight,
  TrendingUp, Pencil, Ban, FileText, Plus, X, Bell, Mail
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import React from "react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Sortable column header. Parent owns sortConfig ({key, dir}) and onSort(key).
// Click to toggle direction; clicking a different column resets to desc.
const SortTh = ({ keyName, sortConfig, onSort, children, className = "", alignClass = "text-left" }) => {
  const active = sortConfig?.key === keyName;
  const dir = active ? sortConfig.dir : null;
  const iconClass = "inline-block h-3 w-3 ml-1 transition-opacity";
  const showIcon = (active ? 'opacity-100' : 'opacity-40 group-hover:opacity-80');
  return (
    <th
      onClick={() => onSort && onSort(keyName)}
      className={`${alignClass} ${className} cursor-pointer select-none group hover:bg-gray-100 transition-colors`}
      data-testid={`sort-th-${keyName}`}
    >
      <span className="inline-flex items-center">
        {children}
        {dir === 'asc'
          ? <ChevronUp className={`${iconClass} ${showIcon}`} />
          : dir === 'desc'
            ? <ChevronDown className={`${iconClass} ${showIcon}`} />
            : <ChevronDown className={`${iconClass} ${showIcon}`} />}
      </span>
    </th>
  );
};

// Round down to nearest 100
const roundToHundred = (amount) => {
  if (!amount || amount <= 0) return 0;
  return Math.floor(amount / 100) * 100;
};

// Investment Logs Table - Matching Tagged (Pending) design with bifurcation
const InvestmentLogsTable = ({ logs, onModify, onCancel, formatDate, formatCurrency }) => {
  // Group logs by client, then by cashflow for bifurcation
  const clientGroups = {};
  
  logs.forEach(log => {
    const clientId = log.client_id || 'unknown';
    if (!clientGroups[clientId]) {
      clientGroups[clientId] = {
        client_id: clientId,
        client_name: log.client_name || 'Unknown',
        entries: []
      };
    }
    clientGroups[clientId].entries.push(log);
  });

  // Group entries by cashflow_id for bifurcation
  const groupByCashflow = (entries) => {
    const cashflowGroups = {};
    entries.forEach(entry => {
      const cfId = entry.cashflow_id || entry.id;
      if (!cashflowGroups[cfId]) {
        cashflowGroups[cfId] = {
          cashflow_id: cfId,
          bond_name: entry.bond_name,
          bond_code: entry.bond_code,
          date: entry.expected_date,
          allocations: [],
          total_net_amount: entry.total_cashflow_net_amount || 0,
          total_round_down_amount: 0,
          primary_entry: entry
        };
      }
      const roundDownAmt = entry.amount || roundToHundred(entry.net_amount || 0);
      cashflowGroups[cfId].allocations.push({
        ...entry,
        round_down_amount: roundDownAmt
      });
      // Only add to investment total if entry has a valid portfolio (not "none")
      const portfolioValue = entry.portfolio || entry.portfolio_category || '';
      const hasValidPortfolio = portfolioValue && portfolioValue.toLowerCase() !== 'none';
      if (hasValidPortfolio) {
        cashflowGroups[cfId].total_round_down_amount += roundDownAmt;
      }
      if (!cashflowGroups[cfId].total_net_amount) {
        cashflowGroups[cfId].total_net_amount += (entry.net_amount || 0);
      }
    });
    // Sort allocations by index
    Object.values(cashflowGroups).forEach(cf => {
      cf.allocations.sort((a, b) => (a.allocation_index || 0) - (b.allocation_index || 0));
    });
    return cashflowGroups;
  };

  return (
    <div className="space-y-4">
      {Object.values(clientGroups).map(clientGroup => {
        const cashflowGroups = groupByCashflow(clientGroup.entries);
        const totalNet = Object.values(cashflowGroups).reduce((sum, cf) => sum + (cf.total_net_amount || 0), 0);
        const totalRoundDown = Object.values(cashflowGroups).reduce((sum, cf) => sum + cf.total_round_down_amount, 0);
        
        return (
          <div key={clientGroup.client_id} className="bg-white rounded-lg border border-green-200 overflow-hidden">
            {/* Client Header */}
            <div className="px-4 py-3 flex items-center justify-between bg-green-50/50 border-b border-green-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{clientGroup.client_name}</h3>
                  <p className="text-sm text-gray-500">{Object.keys(cashflowGroups).length} approved investments</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-gray-500">Net Repayment</p>
                  <p className="font-semibold text-gray-800">₹{formatCurrency(totalNet)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Investment Amt</p>
                  <p className="font-semibold text-green-700">₹{formatCurrency(totalRoundDown)}</p>
                </div>
              </div>
            </div>
            
            {/* Table with two-level headers */}
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th colSpan="3" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-blue-50">
                      Repayment Details
                    </th>
                    <th colSpan="4" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-green-50">
                      Investment Details
                    </th>
                    <th rowSpan="2" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200">
                      Status
                    </th>
                    <th rowSpan="2" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200">
                      Actions
                    </th>
                  </tr>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Date of Repayment</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Bond Name</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Net Amount</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200">Date of Investment</th>
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
                    const primaryEntry = cfGroup.primary_entry;
                    
                    return (
                      <React.Fragment key={cfIdx}>
                        {allocations.map((alloc, allocIdx) => {
                          const isFirst = allocIdx === 0;
                          const investmentDate = alloc.mf_investment_date || alloc.investment_date;
                          const isNonePortfolio = (alloc.portfolio || '').toLowerCase() === 'none';
                          
                          return (
                            <tr 
                              key={`${cfIdx}-${allocIdx}`}
                              className={`
                                ${hasMultiple && isFirst ? 'border-t-2 border-t-green-400' : ''}
                                ${hasMultiple ? 'bg-green-50/30' : 'hover:bg-gray-50'}
                              `}
                            >
                              {/* Date of Repayment - merged */}
                              {isFirst && (
                                <td 
                                  className={`px-3 py-2 border border-gray-200 align-middle ${hasMultiple ? 'border-l-4 border-l-green-400' : ''}`}
                                  rowSpan={hasMultiple ? rowCount : 1}
                                >
                                  <span className="whitespace-nowrap font-medium text-gray-800">
                                    {formatDate(cfGroup.date)}
                                  </span>
                                </td>
                              )}
                              
                              {/* Bond Name - merged */}
                              {isFirst && (
                                <td 
                                  className="px-3 py-2 border border-gray-200 align-middle"
                                  rowSpan={hasMultiple ? rowCount : 1}
                                >
                                  <div className="font-medium text-gray-800">{cfGroup.bond_name}</div>
                                  {cfGroup.bond_code && <div className="text-xs text-gray-500">({cfGroup.bond_code})</div>}
                                </td>
                              )}
                              
                              {/* Net Amount - per allocation */}
                              <td className="px-3 py-2 text-right font-mono text-gray-800 border border-gray-200">
                                ₹{formatCurrency(alloc.net_amount || 0)}
                              </td>
                              
                              {/* Date of Investment */}
                              <td className="px-3 py-2 border border-gray-200">
                                {investmentDate ? formatDate(investmentDate) : '-'}
                              </td>
                              
                              {/* Portfolio */}
                              <td className="px-3 py-2 border border-gray-200">
                                <Badge className={`text-xs capitalize ${isNonePortfolio ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
                                  {alloc.portfolio || '-'}
                                </Badge>
                              </td>
                              
                              {/* UCC - show "-" if portfolio is "none" (residual amounts) */}
                              <td className="px-3 py-2 border border-gray-200">
                                <Badge variant="outline" className="text-xs font-mono">
                                  {(alloc.portfolio && alloc.portfolio.toLowerCase() !== 'none') 
                                    ? (alloc.ucc || alloc.target_ucc || '-') 
                                    : '-'}
                                </Badge>
                              </td>
                              
                              {/* Amount */}
                              <td className="px-3 py-2 text-right font-mono text-green-700 font-semibold border border-gray-200">
                                ₹{formatCurrency(alloc.round_down_amount || 0)}
                              </td>
                              
                              {/* Status - merged */}
                              {isFirst && (
                                <td 
                                  className="px-3 py-2 text-center border border-gray-200 align-middle"
                                  rowSpan={hasMultiple ? rowCount : 1}
                                >
                                  {primaryEntry.approval_status === 'submitted' || primaryEntry.api_submitted ? (
                                    <Badge className="bg-green-100 text-green-700 text-xs">
                                      <CheckCircle className="h-3 w-3 mr-1 inline" />
                                      Submitted
                                    </Badge>
                                  ) : primaryEntry.approval_status === 'cancellation_pending' ? (
                                    <Badge className="bg-red-100 text-red-700 text-xs">
                                      <Clock className="h-3 w-3 mr-1 inline" />
                                      Cancel Pending
                                    </Badge>
                                  ) : primaryEntry.approval_status === 'edit_pending' ? (
                                    <Badge className="bg-amber-100 text-amber-700 text-xs">
                                      <Pencil className="h-3 w-3 mr-1 inline" />
                                      Edit Pending
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-teal-100 text-teal-700 text-xs">
                                      <CheckCircle className="h-3 w-3 mr-1 inline" />
                                      Approved
                                    </Badge>
                                  )}
                                </td>
                              )}
                              
                              {/* Actions - merged */}
                              {isFirst && (
                                <td 
                                  className="px-3 py-2 text-center border border-gray-200 align-middle"
                                  rowSpan={hasMultiple ? rowCount : 1}
                                >
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => onModify(primaryEntry)}
                                      className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    >
                                      <Pencil className="h-3 w-3 mr-1" />
                                      Modify
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => onCancel(primaryEntry)}
                                      className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <Ban className="h-3 w-3 mr-1" />
                                      Cancel
                                    </Button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        
                        {/* Total row for multi-allocation */}
                        {hasMultiple && (
                          <tr className="bg-green-100/50 border-b-2 border-b-green-400">
                            <td colSpan="2" className="px-3 py-2 text-right font-semibold text-gray-700 border border-gray-200">
                              Total for {cfGroup.bond_name}:
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-gray-800 border border-gray-200">
                              ₹{formatCurrency(cfGroup.total_net_amount || 0)}
                            </td>
                            <td colSpan="3" className="border border-gray-200"></td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-green-700 border border-gray-200">
                              ₹{formatCurrency(cfGroup.total_round_down_amount || 0)}
                            </td>
                            <td colSpan="2" className="border border-gray-200"></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              
              {/* Client Total */}
              <div className="mt-3 p-3 bg-green-100 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-green-800">Total for {clientGroup.client_name}</span>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-green-700">Net Repayment</p>
                      <p className="font-bold text-green-800">₹{formatCurrency(totalNet)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-green-700">Investment Amount</p>
                      <p className="font-bold text-green-800 text-lg">₹{formatCurrency(totalRoundDown)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Trade Logs Table with Bifurcation - For reinvestment tagging logs
export const TradeLogsWithBifurcation = ({ logs, formatDate, formatCurrency, getStatusBadge, onResendApproval, resendingId }) => {
  // Filter only reinvestment tagging logs that have cashflow_id. Accept
  // both legacy "reinvestment_tag" rows (single allocation) and the newer
  // "reinvestment_tag_split" rows (one per UCC/portfolio split).
  const isReinvTag = (t) => t === 'reinvestment_tag' || t === 'reinvestment_tag_split';
  const reinvLogs = logs.filter(log => isReinvTag(log.type) && log.cashflow_id);
  const otherLogs = logs.filter(log => !isReinvTag(log.type) || !log.cashflow_id);
  
  // Group reinvestment logs by client, then by cashflow for bifurcation
  const clientGroups = {};
  
  reinvLogs.forEach(log => {
    const clientId = log.client_id || log.client_name || 'unknown';
    if (!clientGroups[clientId]) {
      clientGroups[clientId] = {
        client_id: clientId,
        client_name: log.client_name || 'Unknown',
        entries: []
      };
    }
    clientGroups[clientId].entries.push(log);
  });

  // Group entries by cashflow_id for bifurcation
  const groupByCashflow = (entries) => {
    const cashflowGroups = {};
    entries.forEach(entry => {
      const cfId = entry.cashflow_id || entry.id;
      if (!cashflowGroups[cfId]) {
        cashflowGroups[cfId] = {
          cashflow_id: cfId,
          bond_name: entry.bond_name,
          date: entry.expected_date || entry.date,
          allocations: [],
          total_net_amount: entry.total_cashflow_net_amount || 0,
          total_round_down_amount: 0,
          primary_entry: entry
        };
      }
      const roundDownAmt = entry.amount || roundToHundred(entry.net_amount || 0);
      cashflowGroups[cfId].allocations.push({
        ...entry,
        round_down_amount: roundDownAmt
      });
      // Only add to investment total if entry has a valid portfolio (not "none")
      const portfolioValue = entry.portfolio || entry.portfolio_category || '';
      const hasValidPortfolio = portfolioValue && portfolioValue.toLowerCase() !== 'none';
      if (hasValidPortfolio) {
        cashflowGroups[cfId].total_round_down_amount += roundDownAmt;
      }
      if (!cashflowGroups[cfId].total_net_amount) {
        cashflowGroups[cfId].total_net_amount += (entry.net_amount || entry.amount || 0);
      }
    });
    // Sort allocations by index
    Object.values(cashflowGroups).forEach(cf => {
      cf.allocations.sort((a, b) => (a.allocation_index || 0) - (b.allocation_index || 0));
    });
    return cashflowGroups;
  };

  // Check if we have any grouped entries to show
  const hasGroupedEntries = Object.keys(clientGroups).length > 0;

  return (
    <div className="space-y-4">
      {/* Grouped Reinvestment Entries with Bifurcation */}
      {hasGroupedEntries && Object.values(clientGroups).map(clientGroup => {
        const cashflowGroups = groupByCashflow(clientGroup.entries);
        const totalNet = Object.values(cashflowGroups).reduce((sum, cf) => sum + (cf.total_net_amount || 0), 0);
        const totalRoundDown = Object.values(cashflowGroups).reduce((sum, cf) => sum + cf.total_round_down_amount, 0);
        
        return (
          <div key={clientGroup.client_id} className="bg-white rounded-lg border border-purple-200 overflow-hidden">
            {/* Client Header */}
            <div className="px-4 py-3 flex items-center justify-between bg-purple-50/50 border-b border-purple-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                  <Users className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <h4 className="font-medium text-gray-800">{clientGroup.client_name}</h4>
                  <p className="text-xs text-gray-500">{clientGroup.entries.length} entries</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-gray-500">Total Net Amount</p>
                  <p className="font-semibold text-gray-800">₹{formatCurrency(totalNet)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Investment Amt</p>
                  <p className="font-semibold text-purple-700">₹{formatCurrency(totalRoundDown)}</p>
                </div>
              </div>
            </div>
            
            {/* Bifurcated Table */}
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
                    <th rowSpan="2" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200">
                      Tagged By
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
                        {/* Spacer row between consecutive cashflow groups for
                            breathing room in the bifurcated view. */}
                        {cfIdx > 0 && (
                          <tr aria-hidden="true" className="h-3 bg-transparent">
                            <td colSpan="9" className="border-0 p-0"></td>
                          </tr>
                        )}
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
                                    {formatDate(cfGroup.date)}
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
                                ₹{formatCurrency(alloc.net_amount || alloc.amount || 0)}
                              </td>
                              
                              {/* Investment Date — hidden for residual ("None") rows since no reinvestment is placed */}
                              <td className="px-3 py-2 border border-gray-200">
                                <span className="whitespace-nowrap text-gray-700">
                                  {(alloc.portfolio && alloc.portfolio.toLowerCase() !== 'none') && (alloc.mf_investment_date || alloc.investment_date)
                                    ? formatDate(alloc.mf_investment_date || alloc.investment_date)
                                    : '-'}
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
                                    ? (alloc.ucc || '-') 
                                    : '-'}
                                </Badge>
                              </td>
                              
                              {/* Amount (Round Down) — residual rows show "-" since no money is actually invested */}
                              <td className="px-3 py-2 text-right font-mono text-purple-700 font-semibold border border-gray-200">
                                {(alloc.portfolio && alloc.portfolio.toLowerCase() !== 'none')
                                  ? `₹${formatCurrency(alloc.round_down_amount || alloc.amount || 0)}`
                                  : '-'}
                              </td>
                              
                              {/* Status - merged */}
                              {isFirst && (
                                <td 
                                  className="px-3 py-2 text-center border border-gray-200 align-middle"
                                  rowSpan={hasMultiple ? rowCount : 1}
                                >
                                  <div className="flex flex-col items-center gap-1.5">
                                    {getStatusBadge(alloc.status || alloc.approval_status || 'pending')}
                                    {/* Show "Resend" only while awaiting client approval */}
                                    {(alloc.status === 'pending' || alloc.approval_status === 'pending') && onResendApproval && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onResendApproval(cfGroup.cashflow_id, alloc.client_name, alloc.bond_name)}
                                        disabled={resendingId === cfGroup.cashflow_id}
                                        className="h-7 px-2 text-[11px] text-blue-600 border-blue-200 hover:bg-blue-50"
                                        data-testid={`resend-approval-${cfGroup.cashflow_id}`}
                                      >
                                        <Mail className="h-3 w-3 mr-1" />
                                        {resendingId === cfGroup.cashflow_id ? 'Sending…' : 'Resend'}
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              )}
                              
                              {/* Tagged By - merged */}
                              {isFirst && (
                                <td 
                                  className="px-3 py-2 text-center border border-gray-200 align-middle"
                                  rowSpan={hasMultiple ? rowCount : 1}
                                >
                                  <span className="text-sm text-gray-600">{alloc.advisor || alloc.tagged_by_name || '-'}</span>
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
                              ₹{formatCurrency(cfGroup.total_net_amount)}
                            </td>
                            <td colSpan="3" className="border border-gray-200"></td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-purple-700 border border-gray-200">
                              ₹{formatCurrency(cfGroup.total_round_down_amount)}
                            </td>
                            <td colSpan="2" className="border border-gray-200"></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              
              {/* Client Total */}
              <div className="mt-3 p-3 bg-purple-100 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-purple-800">Total for {clientGroup.client_name}</span>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-purple-700">Net Amount</p>
                      <p className="font-bold text-purple-800">₹{formatCurrency(totalNet)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-purple-700">Investment Amount</p>
                      <p className="font-bold text-purple-800 text-lg">₹{formatCurrency(totalRoundDown)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      
      {/* Other logs (non-reinvestment) shown in flat table */}
      {otherLogs.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Client Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">UCC</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Type</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Portfolio</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Advisor</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {otherLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{log.client_name}</div>
                      {log.bond_name && (
                        <div className="text-xs text-gray-500">{log.bond_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">{log.ucc}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(log.date)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${
                        log.trade_type?.startsWith("Reinv") ? "text-purple-600" : "text-blue-600"
                      }`}>
                        {log.trade_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800 text-right font-mono">
                      ₹{formatCurrency(log.amount || 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{log.portfolio?.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.advisor}</td>
                    <td className="px-4 py-3 text-center">
                      {getStatusBadge(log.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Empty state */}
      {logs.length === 0 && (
        <div className="px-4 py-12 text-center text-gray-500">
          No logs found
        </div>
      )}
    </div>
  );
};

// Investment Table - Shows approved trades (blocked units) in a flat table sorted by date
const InvestmentFlatTable = ({ logs, formatDate, formatCurrency, sortConfig, onSort, onViewTimeline, onEditTrade }) => {
  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <CheckCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No blocked unit investments found</p>
        <p className="text-gray-400 text-sm mt-1">Approved investments will appear here</p>
      </div>
    );
  }

  // Sort according to sortConfig (clickable column headers)
  const sortedLogs = [...logs].sort((a, b) => {
    const { key, dir } = sortConfig || { key: 'investment_date', dir: 'desc' };
    const aV = a[key]; const bV = b[key];
    // Date fields
    if (key === 'investment_date' || key === 'created_at') {
      const aT = aV ? new Date(aV).getTime() : 0;
      const bT = bV ? new Date(bV).getTime() : 0;
      return dir === 'asc' ? aT - bT : bT - aT;
    }
    // Numeric fields
    if (key === 'units' || key === 'total_amount') {
      const aN = Number(aV) || 0; const bN = Number(bV) || 0;
      return dir === 'asc' ? aN - bN : bN - aN;
    }
    // String fields
    const aS = (aV ?? '').toString().toLowerCase();
    const bS = (bV ?? '').toString().toLowerCase();
    if (aS < bS) return dir === 'asc' ? -1 : 1;
    if (aS > bS) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  // Calculate totals
  const totalUnits = sortedLogs.reduce((sum, t) => sum + (t.units || 0), 0);
  const totalAmount = sortedLogs.reduce((sum, t) => sum + (t.total_amount || 0), 0);

  // Format currency with rupee symbol (aligned with Holdings > Investment)
  const formatWithRupee = (amount) => `₹${(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  // Status badge — mirrors Holdings > Trades > Investment
  const renderStatusBadge = (status) => {
    if (status === 'approved') return <Badge className="bg-green-100 text-green-700 text-xs">Approved</Badge>;
    if (status === 'pending') return <Badge className="bg-amber-100 text-amber-700 text-xs">Pending</Badge>;
    return <Badge className="bg-gray-100 text-gray-700 text-xs">{status || 'N/A'}</Badge>;
  };

  return (
    <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
      {/* Header — identical to Holdings > Investment */}
      <div className="px-4 py-3 bg-green-50/50 border-b border-green-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="font-medium text-green-800">Investment (Blocked Units)</span>
          <Badge className="bg-green-100 text-green-700">{sortedLogs.length}</Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-500">Total Units</p>
            <p className="font-semibold text-gray-800">{totalUnits}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Total Amount</p>
            <p className="font-semibold text-green-700">{formatWithRupee(totalAmount)}</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Sr No</th>
              <SortTh alignClass="text-left" sortConfig={sortConfig} onSort={onSort} keyName="client_name" className="px-4 py-3 font-medium text-gray-600">Client Name</SortTh>
              <SortTh alignClass="text-left" sortConfig={sortConfig} onSort={onSort} keyName="bond_name" className="px-4 py-3 font-medium text-gray-600">NCD Name</SortTh>
              <SortTh alignClass="text-left" sortConfig={sortConfig} onSort={onSort} keyName="investment_date" className="px-4 py-3 font-medium text-gray-600">Investment Date</SortTh>
              <SortTh alignClass="text-left" sortConfig={sortConfig} onSort={onSort} keyName="bond_code" className="px-4 py-3 font-medium text-gray-600">Deal ID</SortTh>
              <SortTh alignClass="text-center" sortConfig={sortConfig} onSort={onSort} keyName="units" className="px-4 py-3 font-medium text-gray-600">Units</SortTh>
              <SortTh alignClass="text-right" sortConfig={sortConfig} onSort={onSort} keyName="total_amount" className="px-4 py-3 font-medium text-gray-600">Amount</SortTh>
              <th className="text-left px-4 py-3 font-medium text-gray-600">UTR Reference</th>
              <SortTh alignClass="text-center" sortConfig={sortConfig} onSort={onSort} keyName="status" className="px-4 py-3 font-medium text-gray-600">Status</SortTh>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Timeline</th>
            </tr>
          </thead>
          <tbody>
            {sortedLogs.map((trade, idx) => (
              <tr key={trade.id || idx} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600">{idx + 1}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{trade.client_name || 'N/A'}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{trade.bond_name || 'N/A'}</td>
                <td className="px-4 py-3">
                  {trade.investment_date ? format(new Date(trade.investment_date), "dd-MMM-yy") : 'NA'}
                </td>
                <td className="px-4 py-3 font-mono text-gray-600">{trade.bond_code || trade.ucc || 'N/A'}</td>
                <td className="px-4 py-3 text-center font-mono">{trade.units || 0}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">
                  {formatWithRupee(trade.total_amount)}
                </td>
                <td className="px-4 py-3 font-mono text-gray-600">{trade.payment_reference || 'N/A'}</td>
                <td className="px-4 py-3 text-center">{renderStatusBadge(trade.status)}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewTimeline && onViewTimeline(trade)}
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 px-2"
                      data-testid={`investment-timeline-${trade.id}`}
                    >
                      <Activity className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
                    {onEditTrade && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditTrade(trade)}
                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 h-8 px-2"
                        data-testid={`investment-edit-${trade.id}`}
                        title="Edit / correct units, amount, UTR or investment date"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-etihad-gold-100 text-etihad-gold-800" },
  // "Approved" and "Submitted" are functionally the same for the Reinv Logs
  // viewer — both mean the reinvestment has been signed off by the client.
  // Kinntegra-success (`submitted`) vs. client-signed-off-only (`approved`)
  // is a backend nuance users don't care about, so we render both as
  // "Submitted" with the same colour.
  approved: { label: "Submitted", color: "bg-blue-100 text-blue-800" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800" },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-800" },
  broker_approved: { label: "Broker Approved", color: "bg-green-100 text-green-800" },
  broker_rejected: { label: "Broker Rejected", color: "bg-red-100 text-red-800" },
  client_approved: { label: "Submitted", color: "bg-blue-100 text-blue-800" },
  client_rejected: { label: "Client Rejected", color: "bg-orange-100 text-orange-800" },
  completed: { label: "Submitted", color: "bg-blue-100 text-blue-800" },
  approved_no_reinvest: { label: "No Reinvestment", color: "bg-gray-100 text-gray-700" },
};

const PAGE_SECTIONS = {
  'holdings': 'Holdings',
  'opportunities': 'Opportunities',
  'real-estate-details': 'Real Estate Details',
  'real-estate-investments': 'Real Estate Investments',
  'bond-details': 'Bond Details',
  'dashboard': 'Dashboard',
  'clients': 'Clients',
  'client-details': 'Client Details',
  'profile': 'Profile',
  'analysis': 'Analysis',
  'leads': 'Lead Management',
  'reinvestment': 'Reinvestment Tagging',
  'reinvestment-approvals': 'Reinvestment Approvals',
  'trade-verification': 'Trade Verification',
};


// Broker-only edit modal for an existing trade row. Used to correct
// data-entry mistakes (e.g. 10 units instead of 1). On save, the
// backend regenerates downstream expected repayments + holding
// cashflows and appends to the trade's edit_history audit log.
const EditTradeModal = ({ trade, saving, onClose, onSave }) => {
  const [units, setUnits] = useState(trade?.units ?? "");
  const [amount, setAmount] = useState(trade?.total_amount ?? trade?.amount ?? "");
  const [utr, setUtr] = useState(trade?.payment_reference || trade?.utr_reference || "");
  const [invDate, setInvDate] = useState(
    trade?.investment_date
      ? new Date(trade.investment_date).toISOString().slice(0, 10)
      : ""
  );
  const [notes, setNotes] = useState("");

  if (!trade) return null;

  const submit = () => {
    onSave({
      units: units === "" ? null : Number(units),
      amount: amount === "" ? null : Number(amount),
      utr_reference: utr,
      investment_date: invDate,
      notes,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" data-testid="edit-trade-modal">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b">
          <h3 className="text-base font-semibold text-gray-900">Edit Investment</h3>
          <p className="text-xs text-gray-500 mt-1">
            {trade.client_name} · {trade.bond_name}
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Units</label>
            <input
              type="number"
              step="any"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
              data-testid="edit-trade-units-input"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Amount (INR)</label>
            <input
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
              data-testid="edit-trade-amount-input"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">UTR Reference</label>
            <input
              type="text"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
              data-testid="edit-trade-utr-input"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Investment Date</label>
            <input
              type="date"
              value={invDate}
              onChange={(e) => setInvDate(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
              data-testid="edit-trade-date-input"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Reason / Note (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Corrected units entered as 10 by mistake; should be 1"
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
              data-testid="edit-trade-notes-input"
            />
          </div>
          <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
            Saving will overwrite the trade and regenerate the expected repayments and holding cashflows for this investor. The change is recorded in the trade&apos;s Timeline.
          </div>
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving} data-testid="edit-trade-cancel-btn">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={saving}
            className="bg-amber-600 hover:bg-amber-700"
            data-testid="edit-trade-save-btn"
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
};


export default function TradeLogs() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("investment"); // "investment", "repayments", "trades", "activity", "notifications"
  
  // Trade logs state
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // User activity state
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const [activityDateFrom, setActivityDateFrom] = useState("");
  const [activityDateTo, setActivityDateTo] = useState("");
  const [activityRoleFilter, setActivityRoleFilter] = useState("all");
  const [activitySectionFilter, setActivitySectionFilter] = useState("all");
  const [activityTotalPages, setActivityTotalPages] = useState(1);
  
  // Investment logs state (client-approved reinvestments)
  const [investmentLogs, setInvestmentLogs] = useState([]);
  const [investmentLoading, setInvestmentLoading] = useState(false);
  const [investmentSearchQuery, setInvestmentSearchQuery] = useState("");
  const [investmentSubTab, setInvestmentSubTab] = useState("blocked_units"); // 'blocked_units' or 'reinvestment'
  const [blockedUnitsLogs, setBlockedUnitsLogs] = useState([]); // Blocked units trades
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [selectedInvestment, setSelectedInvestment] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [modifyFormData, setModifyFormData] = useState({});
  const [processingAction, setProcessingAction] = useState(false);
  
  // Sync missing logs state
  const [syncingLogs, setSyncingLogs] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  
  // Per-trade timeline modal state
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineData, setTimelineData] = useState(null);
  
  // Resend approval email state
  const [resendingId, setResendingId] = useState(null);

  // Broker-only inline trade edit
  const [editingTrade, setEditingTrade] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  
  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsTotal, setNotificationsTotal] = useState(0);
  const [notificationPage, setNotificationPage] = useState(1);

  // Repayments state (all clients — sourced from Ncd_Repayments)
  const [allRepayments, setAllRepayments] = useState([]);
  const [allRepaymentsLoading, setAllRepaymentsLoading] = useState(false);
  const [repaymentSearch, setRepaymentSearch] = useState("");
  const [emailSyncing, setEmailSyncing] = useState(false);
  
  const handleEmailSync = async () => {
    if (emailSyncing) return;
    setEmailSyncing(true);
    const toastId = toast.loading("Reading repayment emails…");
    try {
      const res = await axios.post(
        `${API}/ncd-repayments/sync-from-email`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      const r = res.data || {};
      const created = r.created ?? r.inserted ?? 0;
      const skipped = r.skipped ?? 0;
      const matched = r.matched ?? r.processed ?? 0;
      toast.success(
        `Email sync done — ${created} new, ${matched} matched${skipped ? `, ${skipped} skipped` : ''}`,
        { id: toastId }
      );
      await fetchAllRepayments();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Email sync failed",
        { id: toastId }
      );
    } finally {
      setEmailSyncing(false);
    }
  };

  // Sort configuration per tab — clicking column header updates this.
  // dir: 'asc' | 'desc'
  const [sortConfig, setSortConfig] = useState({
    trades: { key: 'date', dir: 'desc' },
    investment: { key: 'investment_date', dir: 'desc' },
    repayments: { key: 'repayment_date', dir: 'desc' },
    activity: { key: 'timestamp', dir: 'desc' },
  });
  const applySort = (tab, key) => setSortConfig(c => {
    const curr = c[tab];
    const nextDir = curr.key === key ? (curr.dir === 'asc' ? 'desc' : 'asc') : 'desc';
    return { ...c, [tab]: { key, dir: nextDir } };
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [activityPage, setActivityPage] = useState(1);
  const [investmentPage, setInvestmentPage] = useState(1);

  useEffect(() => {
    document.title = "Kinntegraa | Logs";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchLogs();
  }, [navigate]);

  // Fetch activity logs when switching to activity tab
  useEffect(() => {
    if (activeTab === "activity" && user) {
      fetchActivityLogs();
    }
  }, [activeTab, activityPage, activityRoleFilter, activitySectionFilter, activityDateFrom, activityDateTo]);

  // Fetch notifications when switching to notifications tab
  useEffect(() => {
    if (activeTab === "notifications" && user) {
      fetchNotifications();
    }
  }, [activeTab, notificationPage]);

  // Fetch all repayments when switching to repayments tab
  useEffect(() => {
    if (activeTab === "repayments" && user) {
      fetchAllRepayments();
    }
  }, [activeTab]);

  const fetchAllRepayments = async () => {
    setAllRepaymentsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/ncd-repayments`, {
        params: { limit: 5000 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setAllRepayments(res.data?.rows || []);
    } catch (e) {
      toast.error("Failed to load repayments");
      setAllRepayments([]);
    } finally {
      setAllRepaymentsLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Fetch reinvestment approval logs and reinvestment tagging logs ONLY
      // Regular trades are shown in Holdings page, not in Trade Logs
      const [reinvestmentRes, reinvestmentTaggingRes] = await Promise.all([
        axios.get(`${API}/approval-logs?entity_type=reinvestment`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
        axios.get(`${API}/reinvestment/logs`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }))
      ]);

      const reinvestmentLogs = (reinvestmentRes.data || []).map(log => ({
        id: log.id,
        type: "reinvestment",
        client_name: log.entity_name || log.client_name || "N/A",
        ucc: log.ucc || "-",
        date: log.created_at,
        trade_type: "Reinvestment",
        amount: log.amount || 0,
        portfolio: log.portfolio_category || "-",
        advisor: log.performed_by_name || "-",
        status: log.action || log.status || "pending",
        details: log.details,
      }));

      // New reinvestment tagging logs
      const taggingLogs = (reinvestmentTaggingRes.data || []).map(log => {
        let typeLabel = 'Reinv';
        const tag = log.reinvestment_tag || log.tag || '';
        if (tag === 'principal') typeLabel = 'Reinv-Principal';
        else if (tag === 'interest') typeLabel = 'Reinv-Interest';
        else if (tag === 'both') typeLabel = 'Reinv-Both';
        else if (tag === 'none') typeLabel = 'Reinv-None';
        else if (tag === 'custom') typeLabel = 'Reinv-Custom';
        else if (tag) typeLabel = `Reinv-${tag.charAt(0).toUpperCase() + tag.slice(1)}`;
        
        return {
          id: log.id,
          type: "reinvestment_tag",
          cashflow_id: log.cashflow_id,  // Critical for bifurcation grouping
          client_id: log.client_id,
          client_name: log.client_name || "N/A",
          ucc: log.ucc || log.target_ucc || "-",
          date: log.expected_date || log.created_at,
          trade_type: typeLabel,
          amount: log.amount || log.net_amount || 0,
          net_amount: log.net_amount || log.amount || 0,
          portfolio: log.portfolio_category || log.portfolio || "-",
          advisor: log.tagged_by_name || "-",
          tagged_by_name: log.tagged_by_name,
          status: log.approval_status || "pending",
          approval_status: log.approval_status,
          bond_name: log.bond_name,
          expected_date: log.expected_date,
          mf_investment_date: log.mf_investment_date,
          investment_date: log.mf_investment_date || log.investment_date,
          allocation_index: log.allocation_index || 0,
          total_cashflow_net_amount: log.total_cashflow_net_amount,
          is_past_date: log.is_past_date,
          client_approved: log.client_approved,
        };
      });

      setLogs([...reinvestmentLogs, ...taggingLogs].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
      ));
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast.error("Failed to load logs");
    } finally {
      setLoading(false);
    }
  };

  // Sync missing reinvestment logs from holding_cashflows
  const handleSyncMissingLogs = async () => {
    if (!window.confirm("This will sync all missing reinvestment log entries. Continue?")) {
      return;
    }
    
    setSyncingLogs(true);
    setSyncResult(null);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(`${API}/reinvestment/sync-missing-logs`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSyncResult(res.data);
      toast.success(`Synced ${res.data.created_count} missing log entries`);
      
      // Refresh logs after sync
      fetchLogs();
    } catch (error) {
      console.error("Error syncing logs:", error);
      toast.error(error.response?.data?.detail || "Failed to sync missing logs");
    } finally {
      setSyncingLogs(false);
    }
  };

  // Export all reinvestment logs as CSV
  const handleExportAllLogs = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/reinvestment/export-all-logs-csv`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `reinvestment_logs_${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("CSV downloaded successfully");
    } catch (error) {
      console.error("Error exporting logs:", error);
      toast.error("Failed to export logs");
    }
  };

  const fetchActivityLogs = async () => {
    setActivityLoading(true);
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({
        page: activityPage,
        limit: itemsPerPage,
      });
      
      if (activityRoleFilter !== 'all') params.append('user_role', activityRoleFilter);
      if (activitySectionFilter !== 'all') params.append('page_section', activitySectionFilter);
      if (activityDateFrom) params.append('date_from', activityDateFrom);
      if (activityDateTo) params.append('date_to', activityDateTo);
      
      const res = await axios.get(`${API}/activity-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setActivityLogs(res.data.logs || []);
      setActivityTotalPages(res.data.total_pages || 1);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      if (error.response?.status === 403) {
        toast.error("You don't have permission to view activity logs");
      } else {
        toast.error("Failed to load activity logs");
      }
    } finally {
      setActivityLoading(false);
    }
  };

  // Resend client-approval email for a pending reinvestment tag
  const handleResendApproval = async (cashflowId, clientName, bondName) => {
    if (!cashflowId) return;
    if (!window.confirm(`Resend the client approval link${clientName ? ` to ${clientName}` : ''}${bondName ? ` for ${bondName}` : ''}?`)) return;
    setResendingId(cashflowId);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${API}/reinvestment/resend-approval/${cashflowId}`,
        null,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = res.data || {};
      toast.success(
        `Approval link resent${data.client_email ? ` to ${data.client_email}` : ''}.`
      );
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to resend approval email");
    } finally {
      setResendingId(null);
    }
  };

  // Open per-trade timeline modal
  const handleViewTimeline = async (trade) => {
    if (!trade?.id) return;
    setTimelineOpen(true);
    setTimelineLoading(true);
    setTimelineData(null);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/trades/${trade.id}/timeline`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTimelineData(res.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to load timeline");
      setTimelineOpen(false);
    } finally {
      setTimelineLoading(false);
    }
  };

  // Save inline trade edit (broker-only)
  const handleSaveTradeEdit = async (payload) => {
    if (!editingTrade?.id) return;
    setEditSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.put(
        `${API}/trades/${editingTrade.id}/admin-edit`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const changedKeys = Object.keys(res.data?.changes || {});
      if (changedKeys.length === 0) {
        toast.message("No changes detected");
      } else {
        toast.success(`Trade updated (${changedKeys.join(", ")})`);
      }
      setEditingTrade(null);
      fetchInvestmentLogs();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update trade");
    } finally {
      setEditSaving(false);
    }
  };

  // Fetch investment logs (client-approved reinvestments)
  const fetchInvestmentLogs = async () => {
    setInvestmentLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Fetch reinvestment logs (approved)
      const reinvestmentRes = await axios.get(`${API}/reinvestment/approved-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvestmentLogs(reinvestmentRes.data || []);
      
      // Fetch blocked units (approved trades)
      const tradesRes = await axios.get(`${API}/trades?status=approved`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBlockedUnitsLogs(tradesRes.data || []);
    } catch (error) {
      console.error("Error fetching investment logs:", error);
      toast.error("Failed to load investment logs");
    } finally {
      setInvestmentLoading(false);
    }
  };

  // Fetch investment logs when switching to investment tab
  useEffect(() => {
    if (activeTab === "investment" && user) {
      fetchInvestmentLogs();
    }
  }, [activeTab, user]);

  // Fetch notifications history
  const fetchNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const skip = (notificationPage - 1) * 50;
      
      const response = await axios.get(`${API}/notifications/all-history?limit=50&skip=${skip}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setNotifications(response.data.notifications || []);
      setNotificationsTotal(response.data.total || 0);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      toast.error("Failed to load notifications");
    } finally {
      setNotificationsLoading(false);
    }
  };

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/notifications/mark-all-read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("All notifications marked as read");
      fetchNotifications();
    } catch (error) {
      console.error("Error marking notifications as read:", error);
      toast.error("Failed to mark notifications as read");
    }
  };

  // Handle cancel investment (requires client approval)
  const handleCancelInvestment = async () => {
    if (!selectedInvestment) return;
    setProcessingAction(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/reinvestment/cancel/${selectedInvestment.id}`,
        { reason: cancelReason },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success("Cancellation request sent to client for approval");
      setShowCancelModal(false);
      setCancelReason("");
      setSelectedInvestment(null);
      fetchInvestmentLogs();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to request cancellation");
    } finally {
      setProcessingAction(false);
    }
  };

  // Handle modify investment (requires client re-approval)
  const handleModifyInvestment = async () => {
    if (!selectedInvestment) return;
    setProcessingAction(true);
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/reinvestment/edit/${selectedInvestment.id}`,
        modifyFormData,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success("Modification request sent to client for re-approval");
      setShowModifyModal(false);
      setModifyFormData({});
      setSelectedInvestment(null);
      fetchInvestmentLogs();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to request modification");
    } finally {
      setProcessingAction(false);
    }
  };

  // Open cancel modal
  const openCancelModal = (investment) => {
    setSelectedInvestment(investment);
    setCancelReason("");
    setShowCancelModal(true);
  };

  // Open modify modal
  const openModifyModal = (investment, group = null) => {
    setSelectedInvestment(investment);
    // Store the group data for multi-allocation editing
    const groupData = group || { 
      entries: [investment], 
      total_net_amount: investment.net_amount || investment.amount 
    };
    
    // Build allocations from group entries
    const allocations = groupData.entries.map((entry, idx) => ({
      id: `alloc-${idx}`,
      ucc: entry.ucc || entry.target_ucc || '',
      amount: entry.amount || '',
      portfolio: entry.portfolio || entry.portfolio_category || 'wealth',
      tag: entry.reinvestment_tag || entry.tag || 'both'
    }));
    
    setModifyFormData({
      reinvestment_tag: investment.reinvestment_tag || investment.tag || 'both',
      portfolio_category: investment.portfolio_category || investment.portfolio || 'wealth',
      target_ucc: investment.target_ucc || investment.ucc || '',
      reason: '',
      total_amount: groupData.total_net_amount || investment.net_amount || investment.amount || 0,
      allocations: allocations
    });
    setShowModifyModal(true);
  };
  
  // Add allocation to modify form
  const addModifyAllocation = () => {
    setModifyFormData(prev => ({
      ...prev,
      allocations: [...prev.allocations, {
        id: `alloc-${Date.now()}`,
        ucc: '',
        amount: '',
        portfolio: 'wealth',
        tag: prev.reinvestment_tag || 'both'
      }]
    }));
  };
  
  // Remove allocation from modify form
  const removeModifyAllocation = (index) => {
    setModifyFormData(prev => ({
      ...prev,
      allocations: prev.allocations.filter((_, i) => i !== index)
    }));
  };
  
  // Update allocation in modify form
  const updateModifyAllocation = (index, field, value) => {
    setModifyFormData(prev => ({
      ...prev,
      allocations: prev.allocations.map((alloc, i) => 
        i === index ? { ...alloc, [field]: field === 'amount' ? (value === '' ? '' : Number(value)) : value } : alloc
      )
    }));
  };
  
  // Get allocation total for modify form
  const getModifyAllocationTotal = () => {
    return modifyFormData.allocations?.reduce((sum, alloc) => sum + (Number(alloc.amount) || 0), 0) || 0;
  };

  const filteredInvestmentLogs = investmentLogs.filter(log => {
    if (investmentSearchQuery) {
      const query = investmentSearchQuery.toLowerCase();
      return log.client_name?.toLowerCase().includes(query) || 
             log.bond_name?.toLowerCase().includes(query) ||
             log.target_ucc?.toLowerCase().includes(query);
    }
    return true;
  });

  // Compare helper: handles dates (ISO strings), numbers, and strings.
  const cmp = (a, b, dir) => {
    const asNum = (v) => (typeof v === 'number' ? v : NaN);
    const aN = asNum(a); const bN = asNum(b);
    if (!isNaN(aN) && !isNaN(bN)) return dir === 'asc' ? aN - bN : bN - aN;
    // Try date parsing
    const aD = a ? new Date(a).getTime() : NaN;
    const bD = b ? new Date(b).getTime() : NaN;
    if (!isNaN(aD) && !isNaN(bD)) return dir === 'asc' ? aD - bD : bD - aD;
    const aS = (a ?? '').toString().toLowerCase();
    const bS = (b ?? '').toString().toLowerCase();
    if (aS < bS) return dir === 'asc' ? -1 : 1;
    if (aS > bS) return dir === 'asc' ? 1 : -1;
    return 0;
  };

  const filteredLogs = logs.filter(log => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!log.client_name?.toLowerCase().includes(query) && 
          !log.ucc?.toLowerCase().includes(query)) {
        return false;
      }
    }
    
    if (dateFrom && new Date(log.date) < new Date(dateFrom)) return false;
    if (dateTo && new Date(log.date) > new Date(dateTo)) return false;
    if (statusFilter !== "all" && log.status !== statusFilter) return false;
    
    return true;
  }).sort((a, b) => {
    const { key, dir } = sortConfig.trades;
    return cmp(a[key], b[key], dir);
  });

  const filteredActivityLogs = activityLogs.filter(log => {
    if (activitySearchQuery) {
      const query = activitySearchQuery.toLowerCase();
      if (!log.user_name?.toLowerCase().includes(query) && 
          !log.page_section?.toLowerCase().includes(query) &&
          !log.bond_name?.toLowerCase().includes(query) &&
          !log.property_name?.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => {
    const { key, dir } = sortConfig.activity;
    return cmp(a[key], b[key], dir);
  });

  // Pagination calculations for trade logs
  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFrom, dateTo, statusFilter]);

  useEffect(() => {
    setActivityPage(1);
  }, [activitySearchQuery, activityDateFrom, activityDateTo, activityRoleFilter, activitySectionFilter]);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const goToActivityPage = (page) => {
    if (page >= 1 && page <= activityTotalPages) {
      setActivityPage(page);
    }
  };

  const getPageNumbers = (current, total) => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (total <= maxVisiblePages) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      if (current <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(total);
      } else if (current >= total - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = total - 3; i <= total; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = current - 1; i <= current + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(total);
      }
    }
    return pages;
  };

  const handleDownload = () => {
    const headers = ["Client Name", "UCC", "Date", "Type", "Amount", "Portfolio", "Advisor", "Status"];
    const csvContent = [
      headers.join(","),
      ...filteredLogs.map(log => [
        `"${log.client_name}"`,
        log.ucc,
        format(new Date(log.date), "dd/MM/yyyy"),
        log.trade_type,
        log.amount,
        log.portfolio,
        log.advisor,
        log.status
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trade_logs_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const handleActivityDownload = () => {
    const headers = ["User Name", "Role", "Page Section", "Timestamp", "Bond/Property", "Client Viewed"];
    const csvContent = [
      headers.join(","),
      ...filteredActivityLogs.map(log => [
        `"${log.user_name || 'N/A'}"`,
        log.user_role,
        log.page_section,
        log.timestamp ? format(new Date(log.timestamp), "dd/MM/yyyy HH:mm") : '-',
        log.bond_name || log.property_name || '-',
        log.viewed_client_name || '-'
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity_logs_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  // Top-right "Download" button — produces a SINGLE .xlsx with one sheet
  // per tab (Investment, Historical Repayments, Reinv Logs, User
  // Activities, Notifications). Pulls the freshest data for every tab so
  // the user does not need to click into each tab first.
  const handleDownloadAllTabs = async () => {
    const toastId = toast.loading("Building Excel workbook…");
    try {
      const token = localStorage.getItem("token");
      const authHdr = { headers: { Authorization: `Bearer ${token}` } };
      const fmtDate = (d) => d ? format(new Date(d), "dd/MM/yyyy") : "-";
      const fmtDT = (d) => d ? format(new Date(d), "dd/MM/yyyy HH:mm") : "-";
      const num = (v) => (v === null || v === undefined || v === "") ? "" : Number(v);

      // Fetch everything in parallel so the workbook reflects the current
      // server state, not whatever happens to be cached in component state.
      const [tradesRes, reinvApprovedRes, repaymentsRes, activitiesRes,
             notificationsRes, reinvAllLogsRes] = await Promise.all([
        axios.get(`${API}/trades?status=approved`, authHdr).catch(() => ({ data: [] })),
        axios.get(`${API}/reinvestment/approved-logs`, authHdr).catch(() => ({ data: [] })),
        axios.get(`${API}/ncd-repayments`, authHdr).catch(() => ({ data: { rows: [] } })),
        axios.get(`${API}/activity-logs?limit=1000`, authHdr).catch(() => ({ data: { logs: [] } })),
        axios.get(`${API}/notifications/all-history?limit=1000`, authHdr).catch(() => ({ data: { notifications: [] } })),
        axios.get(`${API}/reinvestment/logs`, authHdr).catch(() => ({ data: [] })),
      ]);

      const wb = XLSX.utils.book_new();

      // 1) Investment (Blocked Units)
      const blocked = tradesRes.data || [];
      const investmentRows = blocked.map(t => ({
        "Client Name":     t.client_name || "",
        "UCC":             t.ucc || "",
        "Bond / Deal":     t.bond_name || t.deal_name || "",
        "Bond Code":       t.bond_code || t.isin || "",
        "Units Blocked":   num(t.units_blocked ?? t.units),
        "Face Value":      num(t.face_value),
        "Amount":          num(t.amount),
        "Trade Date":      fmtDate(t.trade_date || t.created_at),
        "Approved Date":   fmtDate(t.approved_at),
        "Approval Status": t.approval_status || t.status || "",
        "Approved By":     t.approved_by || "",
        "Portfolio":       t.portfolio || "",
        "Advisor":         t.advisor || "",
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(investmentRows.length ? investmentRows : [{ Info: "No investment records." }]),
        "Investment"
      );

      // 2) Historical Repayments
      const reps = repaymentsRes.data?.rows || repaymentsRes.data || [];
      const repaymentRows = reps.map(r => ({
        "Client Name":      r.client_name || "",
        "UCC":              r.ucc || "",
        "Bond / Deal":      r.bond_name || r.deal_name || "",
        "Bond Code":        r.bond_code || r.isin || "",
        "Repayment Date":   fmtDate(r.repayment_date || r.date),
        "Principal":        num(r.principal_amount ?? r.principal),
        "Interest":         num(r.interest_amount ?? r.interest),
        "Other":            num(r.other_amount),
        "Total Amount":     num(r.total_amount ?? r.amount),
        "Source":           r.source || "",
        "Email Subject":    r.email_subject || "",
        "Received At":      fmtDT(r.received_at || r.created_at),
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(repaymentRows.length ? repaymentRows : [{ Info: "No repayments yet." }]),
        "Historical Repayments"
      );

      // 3) Reinv Logs — combined: approved reinvestment + all reinvestment tagging logs
      const reinvApproved = (reinvApprovedRes.data || []).map(l => ({
        "Stage":          "Approved",
        "Client Name":    l.client_name || "",
        "UCC":            l.ucc || "",
        "Bond / Deal":    l.bond_name || l.deal_name || "",
        "Bond Code":      l.bond_code || "",
        "Expected Date":  fmtDate(l.expected_date),
        "Amount":         num(l.amount),
        "Reinv Tag":      l.reinvestment_tag || "",
        "Approval":       l.approval_status || "",
        "Approved Date":  fmtDate(l.approved_at),
        "Notes":          l.notes || "",
      }));
      const reinvAll = (reinvAllLogsRes.data || []).map(l => ({
        "Stage":          l.status || l.stage || "Pending",
        "Client Name":    l.client_name || "",
        "UCC":            l.ucc || "",
        "Bond / Deal":    l.bond_name || l.deal_name || "",
        "Bond Code":      l.bond_code || "",
        "Expected Date":  fmtDate(l.expected_date || l.date),
        "Amount":         num(l.amount),
        "Reinv Tag":      l.reinvestment_tag || "",
        "Approval":       l.approval_status || "",
        "Approved Date":  fmtDate(l.approved_at),
        "Notes":          l.notes || "",
      }));
      const reinvCombined = [...reinvApproved, ...reinvAll];
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(reinvCombined.length ? reinvCombined : [{ Info: "No reinvestment logs." }]),
        "Reinv Logs"
      );

      // 4) User Activities
      const acts = activitiesRes.data?.logs || activitiesRes.data || [];
      const activityRows = acts.map(a => ({
        "User Name":      a.user_name || "",
        "Role":           a.user_role || "",
        "Page / Section": a.page_section || "",
        "Action":         a.action || "",
        "Bond / Property":a.bond_name || a.property_name || "",
        "Client Viewed":  a.viewed_client_name || "",
        "Timestamp":      fmtDT(a.timestamp),
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(activityRows.length ? activityRows : [{ Info: "No activity logs." }]),
        "User Activities"
      );

      // 5) Notifications
      const notifs = notificationsRes.data?.notifications || notificationsRes.data || [];
      const notifRows = notifs.map(n => ({
        "Title":          n.title || "",
        "Message":        n.message || n.body || "",
        "Type":           n.type || n.category || "",
        "Channel":        n.channel || "",
        "Recipient":      n.recipient || n.user_name || "",
        "Read":           n.read ? "Yes" : "No",
        "Created At":     fmtDT(n.created_at || n.timestamp),
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(notifRows.length ? notifRows : [{ Info: "No notifications." }]),
        "Notifications"
      );

      const stamp = format(new Date(), "yyyy-MM-dd_HHmm");
      XLSX.writeFile(wb, `kinntegraa_logs_${stamp}.xlsx`);
      toast.success("Excel workbook downloaded", { id: toastId });
    } catch (err) {
      console.error("Workbook download failed", err);
      toast.error("Failed to build Excel workbook", { id: toastId });
    }
  };

  const getSidebar = () => {
    if (user?.role === "broker") return <Sidebar user={user} />;
    if (user?.role === "sub_broker") return <SubBrokerSidebar user={user} />;
    return <ClientSidebar user={user} />;
  };

  const getStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || { label: status, color: "bg-gray-100 text-gray-800" };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getRoleBadge = (role) => {
    const colors = {
      broker: 'bg-purple-100 text-purple-800',
      sub_broker: 'bg-blue-100 text-blue-800',
      client: 'bg-green-100 text-green-800',
    };
    const labels = {
      broker: 'Broker',
      sub_broker: 'Sub-Broker',
      client: 'Client',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[role] || 'bg-gray-100 text-gray-800'}`}>
        {labels[role] || role}
      </span>
    );
  };

  // Only show activity tab for broker and sub-broker
  const showActivityTab = user?.role === 'broker' || user?.role === 'sub_broker';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {getSidebar()}
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800">Logs</h1>
                <p className="text-sm text-gray-500">View all transaction, approval, and user activity logs</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Sync Missing Logs - Only for Broker */}
                {user?.role === 'broker' && activeTab === 'trades' && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleSyncMissingLogs}
                    disabled={syncingLogs}
                    className="border-purple-300 text-purple-700 hover:bg-purple-50"
                    data-testid="sync-missing-logs-btn"
                  >
                    {syncingLogs ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Sync Missing Logs
                      </>
                    )}
                  </Button>
                )}
                {/* Export All Logs CSV - Only for Broker */}
                {user?.role === 'broker' && activeTab === 'trades' && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleExportAllLogs}
                    className="border-green-300 text-green-700 hover:bg-green-50"
                    data-testid="export-all-logs-btn"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Export CSV
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={activeTab === 'trades' ? fetchLogs : fetchActivityLogs}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
                <Button size="sm" onClick={handleDownloadAllTabs} className="bg-blue-600 hover:bg-blue-700" data-testid="download-all-tabs-btn">
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>
            </div>
          </div>
          
          {/* Tabs */}
          {showActivityTab && (
            <div className="px-6 border-t">
              <div className="flex gap-6">
                <button
                  onClick={() => setActiveTab("investment")}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1 ${
                    activeTab === "investment"
                      ? "border-green-600 text-green-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="investment-logs-tab"
                >
                  <TrendingUp className="h-4 w-4" />
                  Investment
                </button>
                <button
                  onClick={() => setActiveTab("repayments")}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1 ${
                    activeTab === "repayments"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="repayments-tab"
                >
                  <FileText className="h-4 w-4" />
                  Historical Repayments
                </button>
                <button
                  onClick={() => setActiveTab("trades")}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === "trades"
                      ? "border-etihad-gold-600 text-etihad-gold-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="trade-logs-tab"
                >
                  Reinv Logs
                </button>
                <button
                  onClick={() => setActiveTab("activity")}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1 ${
                    activeTab === "activity"
                      ? "border-etihad-gold-600 text-etihad-gold-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="user-activity-tab"
                >
                  <Activity className="h-4 w-4" />
                  User Activities
                </button>
                <button
                  onClick={() => setActiveTab("notifications")}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1 ${
                    activeTab === "notifications"
                      ? "border-purple-600 text-purple-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid="notifications-tab"
                >
                  <Bell className="h-4 w-4" />
                  Notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Trade Logs Tab Content */}
        {activeTab === "trades" && (
          <>
            {/* Filters */}
            <div className="px-6 py-4 bg-white border-b">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-36 h-9"
                    placeholder="From"
                  />
                  <span className="text-gray-400">to</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-36 h-9"
                    placeholder="To"
                  />
                </div>
                
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by client name or UCC..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sync Result Banner */}
            {syncResult && (
              <div className="mx-6 mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-purple-800">Sync Completed</h4>
                    <p className="text-sm text-purple-600">
                      Created {syncResult.created_count} new entries | Skipped {syncResult.skipped_count} (already existed) | Total checked: {syncResult.total_checked}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSyncResult(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {syncResult.created_entries && syncResult.created_entries.length > 0 && (
                  <div className="mt-2 text-sm text-purple-700">
                    <p className="font-medium">Recent entries created:</p>
                    <ul className="list-disc list-inside mt-1">
                      {syncResult.created_entries.slice(0, 5).map((e, i) => (
                        <li key={i}>{e.client_name} - {e.portfolio} - ₹{e.amount?.toLocaleString('en-IN')} - {e.status}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Trade Logs Content */}
            <div className="p-6">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <TradeLogsWithBifurcation 
                  logs={paginatedLogs}
                  formatDate={(date) => date ? format(new Date(date), "dd MMM yyyy") : "-"}
                  formatCurrency={(amount) => amount?.toLocaleString('en-IN') || '0'}
                  getStatusBadge={getStatusBadge}
                  onResendApproval={handleResendApproval}
                  resendingId={resendingId}
                />
              )}
              
              {/* Pagination Controls */}
              {totalPages > 1 && !loading && (
                <div className="px-4 py-3 mt-4 border rounded-lg bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span>Show</span>
                    <Select value={itemsPerPage.toString()} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
                      <SelectTrigger className="w-16 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                    <span>entries</span>
                    <span className="ml-2 text-gray-400">|</span>
                    <span className="ml-2">
                      Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    {getPageNumbers(currentPage, totalPages).map((page, idx) => (
                      page === '...' ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">...</span>
                      ) : (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => goToPage(page)}
                          className={`h-8 w-8 p-0 ${currentPage === page ? 'bg-etihad-gold-600 hover:bg-etihad-gold-700' : ''}`}
                        >
                          {page}
                        </Button>
                      )
                    ))}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Show total when pagination not needed */}
              {totalPages <= 1 && totalItems > 0 && !loading && (
                <div className="px-4 py-3 mt-4 border rounded-lg bg-gray-50 text-sm text-gray-600">
                  Showing {totalItems} {totalItems === 1 ? 'entry' : 'entries'}
                </div>
              )}
            </div>
          </>
        )}

        {/* User Activity Tab Content */}
        {activeTab === "activity" && (
          <>
            {/* Activity Filters */}
            <div className="px-6 py-4 bg-white border-b">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <Input
                    type="date"
                    value={activityDateFrom}
                    onChange={(e) => setActivityDateFrom(e.target.value)}
                    className="w-36 h-9"
                    placeholder="From"
                  />
                  <span className="text-gray-400">to</span>
                  <Input
                    type="date"
                    value={activityDateTo}
                    onChange={(e) => setActivityDateTo(e.target.value)}
                    className="w-36 h-9"
                    placeholder="To"
                  />
                </div>
                
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by user name or section..."
                    value={activitySearchQuery}
                    onChange={(e) => setActivitySearchQuery(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                
                <Select value={activityRoleFilter} onValueChange={setActivityRoleFilter}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="sub_broker">Sub-Broker</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={activitySectionFilter} onValueChange={setActivitySectionFilter}>
                  <SelectTrigger className="w-44 h-9">
                    <SelectValue placeholder="All Sections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    <SelectItem value="holdings">Holdings</SelectItem>
                    <SelectItem value="opportunities">Opportunities</SelectItem>
                    <SelectItem value="real-estate-details">Real Estate Details</SelectItem>
                    <SelectItem value="bond-details">Bond Details</SelectItem>
                    <SelectItem value="dashboard">Dashboard</SelectItem>
                    <SelectItem value="profile">Profile</SelectItem>
                    <SelectItem value="clients">Clients</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Activity Logs Content */}
            <div className="p-6">
              {activityLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="bg-white rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <SortTh alignClass="text-left" sortConfig={sortConfig.activity} onSort={(k) => applySort('activity', k)} keyName="user_name" className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">User</SortTh>
                          <SortTh alignClass="text-left" sortConfig={sortConfig.activity} onSort={(k) => applySort('activity', k)} keyName="user_role" className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Role</SortTh>
                          <SortTh alignClass="text-left" sortConfig={sortConfig.activity} onSort={(k) => applySort('activity', k)} keyName="page_section" className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Page Section</SortTh>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Details</th>
                          <SortTh alignClass="text-left" sortConfig={sortConfig.activity} onSort={(k) => applySort('activity', k)} keyName="timestamp" className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Timestamp</SortTh>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredActivityLogs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                              <Activity className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                              <p>No activity logs found</p>
                              <p className="text-xs mt-1">User visits will appear here as they navigate the platform</p>
                            </td>
                          </tr>
                        ) : (
                          filteredActivityLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-800">{log.user_name || 'Unknown'}</div>
                              </td>
                              <td className="px-4 py-3">
                                {getRoleBadge(log.user_role)}
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium">
                                  {PAGE_SECTIONS[log.page_section] || log.page_section}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {log.bond_name && (
                                  <div>Bond: <span className="font-medium">{log.bond_name}</span></div>
                                )}
                                {log.property_name && (
                                  <div>Property: <span className="font-medium">{log.property_name}</span></div>
                                )}
                                {log.viewed_client_name && (
                                  <div>Client: <span className="font-medium">{log.viewed_client_name}</span></div>
                                )}
                                {log.metadata?.action && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    Action: <span className="capitalize">{log.metadata.action}</span>
                                  </div>
                                )}
                                {!log.bond_name && !log.property_name && !log.viewed_client_name && !log.metadata?.action && '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {log.timestamp ? (
                                  <>
                                    <div>{format(new Date(log.timestamp), "dd MMM yyyy")}</div>
                                    <div className="text-xs text-gray-400">{format(new Date(log.timestamp), "HH:mm:ss")}</div>
                                  </>
                                ) : '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Activity Pagination Controls */}
                  {activityTotalPages > 1 && (
                    <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>Page {activityPage} of {activityTotalPages}</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToActivityPage(activityPage - 1)}
                          disabled={activityPage === 1}
                          className="h-8 w-8 p-0"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        
                        {getPageNumbers(activityPage, activityTotalPages).map((page, idx) => (
                          page === '...' ? (
                            <span key={`activity-ellipsis-${idx}`} className="px-2 text-gray-400">...</span>
                          ) : (
                            <Button
                              key={`activity-page-${page}`}
                              variant={activityPage === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => goToActivityPage(page)}
                              className={`h-8 w-8 p-0 ${activityPage === page ? 'bg-etihad-gold-600 hover:bg-etihad-gold-700' : ''}`}
                            >
                              {page}
                            </Button>
                          )
                        ))}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToActivityPage(activityPage + 1)}
                          disabled={activityPage === activityTotalPages}
                          className="h-8 w-8 p-0"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {/* Show total when pagination not needed */}
                  {activityTotalPages <= 1 && filteredActivityLogs.length > 0 && (
                    <div className="px-4 py-3 border-t bg-gray-50 text-sm text-gray-600">
                      Showing {filteredActivityLogs.length} {filteredActivityLogs.length === 1 ? 'entry' : 'entries'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Investment Logs Tab Content */}
        {activeTab === "investment" && (
          <>
            {/* Investment Filters */}
            <div className="px-6 py-4 bg-white border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-gray-800">Investment (Blocked Units)</span>
                  <Badge className="bg-green-100 text-green-700 text-xs">{blockedUnitsLogs.length}</Badge>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="relative max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by client, bond or Deal ID..."
                      value={investmentSearchQuery}
                      onChange={(e) => setInvestmentSearchQuery(e.target.value)}
                      className="pl-9 h-9 w-64"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchInvestmentLogs}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>

            {/* Investment Content */}
            <div className="p-6">
              {investmentLoading ? (
                <div className="bg-white rounded-lg border p-8 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-green-600 mx-auto mb-3" />
                  <p className="text-gray-500">Loading investments...</p>
                </div>
              ) : (
                <InvestmentFlatTable 
                  logs={blockedUnitsLogs.filter(log => 
                    !investmentSearchQuery || 
                    log.client_name?.toLowerCase().includes(investmentSearchQuery.toLowerCase()) ||
                    log.bond_name?.toLowerCase().includes(investmentSearchQuery.toLowerCase()) ||
                    log.bond_code?.toLowerCase().includes(investmentSearchQuery.toLowerCase())
                  )}
                  formatDate={(date) => date ? format(new Date(date), "dd MMM yyyy") : '-'}
                  formatCurrency={(amount) => (amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  sortConfig={sortConfig.investment}
                  onSort={(k) => applySort('investment', k)}
                  onViewTimeline={handleViewTimeline}
                  onEditTrade={user?.role === 'broker' ? (trade) => setEditingTrade(trade) : null}
                />
              )}
            </div>
          </>
        )}

        {/* Notifications Tab Content */}
        {activeTab === "notifications" && (
          <>
            {/* Notifications Header */}
            <div className="px-6 py-4 bg-white border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-purple-600" />
                  <span className="text-sm text-gray-500">
                    {notificationsTotal > 0 ? `${notificationsTotal} total notifications` : 'No notifications yet'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleMarkAllRead}
                    disabled={notificationsLoading || notifications.length === 0}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Mark All Read
                  </Button>
                  <Button variant="outline" size="sm" onClick={fetchNotifications}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>

            {/* Notifications Content */}
            <div className="p-6">
              {notificationsLoading ? (
                <div className="bg-white rounded-lg border p-8 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-3" />
                  <p className="text-gray-500">Loading notifications...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="bg-white rounded-lg border p-8 text-center">
                  <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No notifications found</p>
                  <p className="text-gray-400 text-sm mt-1">Notifications will appear here when actions occur</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notif) => (
                    <div 
                      key={notif.id} 
                      className={`bg-white rounded-lg border p-4 hover:shadow-sm transition-shadow ${
                        !notif.read ? 'border-l-4 border-l-purple-500' : ''
                      }`}
                      data-testid={`notification-item-${notif.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {!notif.read && (
                              <Badge className="bg-purple-100 text-purple-700 text-xs">New</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 font-medium">{notif.message || notif.content || notif.title || 'No message'}</p>
                          {notif.for_user_name && (
                            <p className="text-xs text-gray-400 mt-1">
                              For: {notif.for_user_name}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-gray-400">
                            {notif.created_at ? format(new Date(notif.created_at), "dd MMM yyyy") : '-'}
                          </p>
                          <p className="text-xs text-gray-400">
                            {notif.created_at ? format(new Date(notif.created_at), "HH:mm") : ''}
                          </p>
                        </div>
                      </div>
                      {notif.link && (
                        <Button
                          variant="link"
                          size="sm"
                          className="text-purple-600 p-0 h-auto mt-2"
                          onClick={() => navigate(notif.link)}
                        >
                          View Details →
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination for notifications */}
              {notificationsTotal > 50 && !notificationsLoading && (
                <div className="px-4 py-3 mt-4 border rounded-lg bg-gray-50 flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Showing {Math.min((notificationPage - 1) * 50 + 1, notificationsTotal)}-{Math.min(notificationPage * 50, notificationsTotal)} of {notificationsTotal}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNotificationPage(p => Math.max(1, p - 1))}
                      disabled={notificationPage === 1}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="px-3 text-sm">Page {notificationPage}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNotificationPage(p => p + 1)}
                      disabled={notificationPage * 50 >= notificationsTotal}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Repayments Tab Content (all clients) */}
        {activeTab === "repayments" && (
          <>
            {/* Header with search and refresh */}
            <div className="px-6 py-4 bg-white border-b">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <span className="text-sm text-gray-500">
                    {allRepaymentsLoading
                      ? 'Loading…'
                      : `${allRepayments.length} total repayment${allRepayments.length === 1 ? '' : 's'}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-80">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <Input
                      type="text"
                      placeholder="Search by client, PAN, NCD, bond code, date…"
                      value={repaymentSearch}
                      onChange={(e) => setRepaymentSearch(e.target.value)}
                      className="pl-8 h-9 text-sm"
                      data-testid="repayments-search-input"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEmailSync}
                    disabled={emailSyncing}
                    className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700"
                    data-testid="repayments-email-reader-btn"
                    title="Read repayment emails now (in addition to the 10:00 / 18:00 IST scheduled runs)"
                  >
                    {emailSyncing ? (
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4 mr-1" />
                    )}
                    {emailSyncing ? 'Reading…' : 'Email Reader'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={fetchAllRepayments} data-testid="repayments-refresh-btn">
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>

            {/* Repayments Table */}
            <div className="p-6">
              {allRepaymentsLoading ? (
                <div className="bg-white rounded-lg border p-8 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                  <p className="text-gray-500">Loading repayments...</p>
                </div>
              ) : (() => {
                const q = (repaymentSearch || '').trim().toLowerCase();
                const matches = (v) => (v || '').toString().toLowerCase().includes(q);
                const { key: sKey, dir: sDir } = sortConfig.repayments;
                const filtered = (!q ? allRepayments : allRepayments.filter(r =>
                  matches(r.client_name) || matches(r.client_pan) || matches(r.client_email) ||
                  matches(r.bond_name) || matches(r.bond_code) || matches(r.opportunity_id) ||
                  matches(r.repayment_date) || matches(r.resolution_status)
                )).slice().sort((a, b) => {
                  const aV = a[sKey]; const bV = b[sKey];
                  if (sKey === 'repayment_date') {
                    const aT = aV ? new Date(aV).getTime() : 0;
                    const bT = bV ? new Date(bV).getTime() : 0;
                    return sDir === 'asc' ? aT - bT : bT - aT;
                  }
                  if (['principal', 'interest', 'gross_amount', 'tds', 'net_amount'].includes(sKey)) {
                    const aN = Number(aV) || 0; const bN = Number(bV) || 0;
                    return sDir === 'asc' ? aN - bN : bN - aN;
                  }
                  const aS = (aV ?? '').toString().toLowerCase();
                  const bS = (bV ?? '').toString().toLowerCase();
                  if (aS < bS) return sDir === 'asc' ? -1 : 1;
                  if (aS > bS) return sDir === 'asc' ? 1 : -1;
                  return 0;
                });
                if (filtered.length === 0) {
                  return (
                    <div className="bg-white rounded-lg border p-8 text-center" data-testid="repayments-empty-all">
                      <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No repayments found</p>
                      <p className="text-gray-400 text-sm mt-1">Email-synced repayments will appear here</p>
                    </div>
                  );
                }
                const totals = filtered.reduce((acc, r) => ({
                  principal: acc.principal + (r.principal || 0),
                  interest: acc.interest + (r.interest || 0),
                  gross: acc.gross + (r.gross_amount || 0),
                  tds: acc.tds + (r.tds || 0),
                  net: acc.net + (r.net_amount || 0),
                }), { principal: 0, interest: 0, gross: 0, tds: 0, net: 0 });
                const fmt = (n) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return (
                  <div className="bg-white rounded-lg border border-blue-200 overflow-hidden" data-testid="repayments-table-all">
                    {/* Header — aligned with Holdings > Trades > Repayments */}
                    <div className="px-4 py-3 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <span className="font-medium text-blue-800">Historical Repayments (from emails)</span>
                        <Badge className="bg-blue-100 text-blue-700">{filtered.length}</Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Total Gross</p>
                          <p className="font-semibold text-blue-700">₹{fmt(totals.gross)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Total Net</p>
                          <p className="font-semibold text-green-700">₹{fmt(totals.net)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-4 py-3 font-medium text-gray-600">Sr No</th>
                            <SortTh alignClass="text-left" sortConfig={sortConfig.repayments} onSort={(k) => applySort('repayments', k)} keyName="repayment_date" className="px-4 py-3 font-medium text-gray-600">Repayment Date</SortTh>
                            <SortTh alignClass="text-left" sortConfig={sortConfig.repayments} onSort={(k) => applySort('repayments', k)} keyName="client_name" className="px-4 py-3 font-medium text-gray-600">Client</SortTh>
                            <SortTh alignClass="text-left" sortConfig={sortConfig.repayments} onSort={(k) => applySort('repayments', k)} keyName="client_pan" className="px-4 py-3 font-medium text-gray-600">PAN</SortTh>
                            <SortTh alignClass="text-left" sortConfig={sortConfig.repayments} onSort={(k) => applySort('repayments', k)} keyName="bond_name" className="px-4 py-3 font-medium text-gray-600">NCD Name</SortTh>
                            <SortTh alignClass="text-left" sortConfig={sortConfig.repayments} onSort={(k) => applySort('repayments', k)} keyName="bond_code" className="px-4 py-3 font-medium text-gray-600">Bond Code</SortTh>
                            <SortTh alignClass="text-right" sortConfig={sortConfig.repayments} onSort={(k) => applySort('repayments', k)} keyName="principal" className="px-4 py-3 font-medium text-gray-600">Principal</SortTh>
                            <SortTh alignClass="text-right" sortConfig={sortConfig.repayments} onSort={(k) => applySort('repayments', k)} keyName="interest" className="px-4 py-3 font-medium text-gray-600">Interest</SortTh>
                            <SortTh alignClass="text-right" sortConfig={sortConfig.repayments} onSort={(k) => applySort('repayments', k)} keyName="gross_amount" className="px-4 py-3 font-medium text-gray-600">Gross</SortTh>
                            <SortTh alignClass="text-right" sortConfig={sortConfig.repayments} onSort={(k) => applySort('repayments', k)} keyName="tds" className="px-4 py-3 font-medium text-gray-600">TDS</SortTh>
                            <SortTh alignClass="text-right" sortConfig={sortConfig.repayments} onSort={(k) => applySort('repayments', k)} keyName="net_amount" className="px-4 py-3 font-medium text-gray-600">Net</SortTh>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((r, idx) => (
                            <tr key={r.id || idx} className="border-b hover:bg-gray-50" data-testid={`all-repayment-row-${idx}`}>
                              <td className="px-4 py-3 text-gray-600">{idx + 1}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {r.repayment_date ? format(new Date(r.repayment_date), "dd-MMM-yy") : 'NA'}
                              </td>
                              <td className="px-4 py-3 font-medium text-gray-800">{r.client_name || <span className="text-gray-400 italic">Unknown</span>}</td>
                              <td className="px-4 py-3 font-mono text-gray-600">{r.client_pan || '-'}</td>
                              <td className="px-4 py-3 font-medium text-gray-800">{r.bond_name || r.issuer_name_from_subject || 'N/A'}</td>
                              <td className="px-4 py-3 font-mono text-gray-600">{r.bond_code || '-'}</td>
                              <td className="px-4 py-3 text-right font-mono text-blue-700">₹{fmt(r.principal)}</td>
                              <td className="px-4 py-3 text-right font-mono text-green-700">₹{fmt(r.interest)}</td>
                              <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800">₹{fmt(r.gross_amount)}</td>
                              <td className="px-4 py-3 text-right font-mono text-amber-700">₹{fmt(r.tds)}</td>
                              <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">₹{fmt(r.net_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                          <tr className="font-semibold">
                            <td colSpan={6} className="px-4 py-3 text-gray-700">Total</td>
                            <td className="px-4 py-3 text-right font-mono text-blue-700">₹{fmt(totals.principal)}</td>
                            <td className="px-4 py-3 text-right font-mono text-green-700">₹{fmt(totals.interest)}</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-800">₹{fmt(totals.gross)}</td>
                            <td className="px-4 py-3 text-right font-mono text-amber-700">₹{fmt(totals.tds)}</td>
                            <td className="px-4 py-3 text-right font-mono text-green-700">₹{fmt(totals.net)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}

        {/* Cancel Investment Modal */}
        <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Ban className="h-5 w-5" />
                Cancel Investment
              </DialogTitle>
              <DialogDescription>
                This investment has been approved by the client. Cancellation will require client re-approval.
              </DialogDescription>
            </DialogHeader>
            
            {selectedInvestment && (
              <div className="py-4 space-y-4">
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Client</span>
                    <span className="font-medium">{selectedInvestment.client_name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">NCD</span>
                    <span className="font-medium">{selectedInvestment.bond_name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Amount</span>
                    <span className="font-medium">₹{(selectedInvestment.amount || selectedInvestment.net_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Reason for cancellation</Label>
                  <Textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Enter reason..."
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancelModal(false)} disabled={processingAction}>
                Back
              </Button>
              <Button 
                onClick={handleCancelInvestment} 
                disabled={processingAction}
                className="bg-red-600 hover:bg-red-700"
              >
                {processingAction ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Ban className="h-4 w-4 mr-2" />
                )}
                Request Cancellation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modify Investment Modal - Multi-allocation form */}
        <Dialog open={showModifyModal} onOpenChange={setShowModifyModal}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-amber-600" />
                Modify Investment
              </DialogTitle>
              <DialogDescription>
                Modify allocations. Changes will require client re-approval.
              </DialogDescription>
            </DialogHeader>
            
            {selectedInvestment && (
              <div className="flex-1 overflow-auto py-4 space-y-4">
                {/* Entry Header */}
                <div className="bg-gray-50 rounded-lg p-4 border">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-medium">{selectedInvestment.bond_name}</div>
                      <div className="text-sm text-gray-500">
                        {selectedInvestment.client_name} • {selectedInvestment.expected_date ? format(new Date(selectedInvestment.expected_date), "dd MMM yyyy") : 'N/A'}
                      </div>
                    </div>
                    <Badge className="bg-amber-100 text-amber-700">
                      {modifyFormData.reinvestment_tag?.charAt(0).toUpperCase() + modifyFormData.reinvestment_tag?.slice(1) || 'Both'}
                    </Badge>
                  </div>
                  
                  {/* Total Amount */}
                  <div className="text-center p-3 bg-white rounded-lg border">
                    <div className="text-xs text-gray-500 uppercase">Total Net Amount</div>
                    <div className="text-xl font-bold text-gray-800">
                      ₹{(modifyFormData.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
                
                {/* Allocation Status */}
                {(() => {
                  const allocTotal = getModifyAllocationTotal();
                  const totalAmount = roundToHundred(modifyFormData.total_amount || 0);
                  const isBalanced = Math.abs(allocTotal - totalAmount) < 1;
                  const remaining = totalAmount - allocTotal;
                  
                  return (
                    <div className={`px-4 py-2 text-xs flex items-center justify-between rounded-lg ${isBalanced ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      <span>
                        Allocated: ₹{allocTotal.toLocaleString('en-IN')} / ₹{totalAmount.toLocaleString('en-IN')} (Round-down)
                        {!isBalanced && ` (₹${Math.abs(remaining).toLocaleString('en-IN')} ${remaining > 0 ? 'remaining' : 'over'})`}
                      </span>
                      {isBalanced && <CheckCircle className="h-4 w-4" />}
                    </div>
                  );
                })()}
                
                {/* Allocations */}
                <div className="space-y-3">
                  {modifyFormData.allocations?.map((alloc, index) => (
                    <div key={alloc.id} className="bg-white rounded-lg border p-3">
                      <div className="flex items-start gap-3">
                        {/* Allocation Number */}
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-medium">
                          {index + 1}
                        </div>
                        
                        {/* Allocation Fields */}
                        <div className="flex-1 grid grid-cols-3 gap-3">
                          {/* UCC */}
                          <div>
                            <Label className="text-[10px] text-gray-500 mb-1 block">UCC</Label>
                            <Input
                              value={alloc.ucc}
                              onChange={(e) => updateModifyAllocation(index, 'ucc', e.target.value.toUpperCase())}
                              className="h-8 text-xs"
                              placeholder="Enter UCC"
                            />
                          </div>
                          
                          {/* Amount */}
                          <div>
                            <Label className="text-[10px] text-gray-500 mb-1 block">Amount (₹) <span className="text-gray-400">(multiples of 100)</span></Label>
                            <Input
                              type="number"
                              step="100"
                              value={alloc.amount}
                              onChange={(e) => updateModifyAllocation(index, 'amount', e.target.value)}
                              className="h-8 text-xs"
                              placeholder="Enter amount"
                            />
                          </div>
                          
                          {/* Portfolio */}
                          <div>
                            <Label className="text-[10px] text-gray-500 mb-1 block">Portfolio</Label>
                            <Select 
                              value={alloc.portfolio} 
                              onValueChange={(v) => updateModifyAllocation(index, 'portfolio', v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="wealth">Wealth</SelectItem>
                                <SelectItem value="tax">Tax</SelectItem>
                                <SelectItem value="short_term">Short Term</SelectItem>
                                <SelectItem value="commodities">Commodities</SelectItem>
                                <SelectItem value="bonds">NCD</SelectItem>
                                <SelectItem value="real_estate">Real Estate</SelectItem>
                                <SelectItem value="none">None</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        
                        {/* Remove Button */}
                        {modifyFormData.allocations.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeModifyAllocation(index)}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {/* Add Allocation Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addModifyAllocation}
                    className="w-full border-dashed"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Another Allocation
                  </Button>
                </div>
                
                {/* Reason */}
                <div>
                  <Label className="text-sm font-medium">Reason for change</Label>
                  <Textarea
                    value={modifyFormData.reason || ''}
                    onChange={(e) => setModifyFormData(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder="Enter reason..."
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowModifyModal(false)} disabled={processingAction}>
                Cancel
              </Button>
              <Button 
                onClick={handleModifyInvestment} 
                disabled={processingAction || getModifyAllocationTotal() === 0}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {processingAction ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Pencil className="h-4 w-4 mr-2" />
                )}
                Request Modification
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Per-Trade Audit Timeline Modal */}
        <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" data-testid="trade-timeline-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                Trade Timeline
              </DialogTitle>
              <DialogDescription>
                Lifecycle history for this allotment — block, broker approval, cashflow generation and downstream events.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-1">
              {timelineLoading ? (
                <div className="py-12 text-center text-gray-500">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-600" />
                  Loading timeline…
                </div>
              ) : timelineData ? (
                <div className="space-y-4">
                  {/* Trade summary header */}
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Bond</p>
                      <p className="font-medium text-gray-800">{timelineData.bond_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Client</p>
                      <p className="font-medium text-gray-800">{timelineData.client_name || '—'}</p>
                      {timelineData.client_pan && (
                        <p className="text-xs text-gray-500 font-mono">{timelineData.client_pan}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Units · Amount</p>
                      <p className="font-medium text-gray-800 font-mono">
                        {timelineData.units || 0} · ₹{Number(timelineData.total_amount || 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Status</p>
                      <Badge className={
                        timelineData.status === 'approved' ? 'bg-green-100 text-green-700' :
                        timelineData.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        timelineData.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }>
                        {timelineData.status || '—'}
                      </Badge>
                    </div>
                    {timelineData.payment_reference && (
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500">UTR</p>
                        <p className="font-mono text-gray-700 inline-flex items-center gap-2">
                          {timelineData.payment_reference}
                          {timelineData.payment_proof_url && (
                            <a href={timelineData.payment_proof_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs">
                              <FileText className="h-3 w-3" /> Proof
                            </a>
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Vertical timeline */}
                  {timelineData.events && timelineData.events.length > 0 ? (
                    <ol className="relative border-l-2 border-blue-100 ml-3 pl-5 space-y-4">
                      {timelineData.events.map((ev, idx) => {
                        const dotColor = ev.type === 'rejected' ? 'bg-red-500'
                          : ev.type === 'approved' ? 'bg-green-500'
                          : ev.type === 'cashflows_generated' ? 'bg-blue-500'
                          : ev.type === 'client_approved' ? 'bg-emerald-500'
                          : 'bg-gray-400';
                        const Icon = ev.type === 'rejected' ? XCircle
                          : ev.type === 'approved' ? CheckCircle
                          : ev.type === 'cashflows_generated' ? TrendingUp
                          : ev.type === 'client_approved' ? CheckCircle
                          : Clock;
                        return (
                          <li key={idx} data-testid={`timeline-event-${ev.type}`}>
                            <span className={`absolute -left-[9px] flex items-center justify-center w-4 h-4 rounded-full ${dotColor} ring-4 ring-white`}>
                              <Icon className="h-2.5 w-2.5 text-white" />
                            </span>
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="font-medium text-gray-800">{ev.label}</p>
                              <p className="text-xs text-gray-500 whitespace-nowrap">
                                {ev.at ? format(new Date(ev.at), "dd MMM yyyy, HH:mm") : '—'}
                              </p>
                            </div>
                            <p className="text-sm text-gray-600">
                              by <span className="font-medium">{ev.actor_name || 'Unknown'}</span>
                              {ev.actor_role ? <span className="text-xs text-gray-500"> · {ev.actor_role.replace(/_/g, ' ')}</span> : null}
                            </p>
                            {ev.detail && (
                              <p className="text-sm text-gray-700 mt-1 bg-white border border-gray-100 rounded px-2 py-1 inline-block max-w-full">
                                {ev.detail}
                              </p>
                            )}
                            {ev.utr && (
                              <p className="text-xs text-gray-500 mt-0.5 font-mono">UTR: {ev.utr}</p>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <div className="py-8 text-center text-gray-500 text-sm">No timeline events recorded yet.</div>
                  )}

                  {/* Cashflow summary footer */}
                  {timelineData.cashflows_count > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                      <p className="font-medium text-blue-800 mb-1 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        {timelineData.cashflows_count} expected repayment row(s) generated
                      </p>
                      {timelineData.first_expected_date && (
                        <p className="text-xs text-blue-700">
                          First repayment expected on{" "}
                          <span className="font-mono">
                            {format(new Date(timelineData.first_expected_date.split('T')[0]), "dd MMM yyyy")}
                          </span>
                          {timelineData.last_expected_date && (
                            <>
                              {" · last on "}
                              <span className="font-mono">
                                {format(new Date(timelineData.last_expected_date.split('T')[0]), "dd MMM yyyy")}
                              </span>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setTimelineOpen(false)} data-testid="timeline-close-btn">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Broker-only inline edit modal */}
        {editingTrade && (
          <EditTradeModal
            trade={editingTrade}
            saving={editSaving}
            onClose={() => setEditingTrade(null)}
            onSave={handleSaveTradeEdit}
          />
        )}
      </div>
    </div>
  );
}
