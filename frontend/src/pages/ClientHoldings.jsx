import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { 
  Wallet, Calendar, Download, ChevronDown, ChevronUp, 
  Check, Clock, X, MapPin, Percent, ChevronRight, 
  ClipboardList, Eye, RefreshCw, IndianRupee, Calculator, FileText, Building2
} from "lucide-react";
import html2pdf from 'html2pdf.js';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { logUserActivity } from "@/utils/activityLogger";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ClientHoldings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [holdings, setHoldings] = useState(null);
  const [realEstateInvestments, setRealEstateInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHolding, setSelectedHolding] = useState(null);
  const [showCashflowModal, setShowCashflowModal] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");
  const [mainTab, setMainTab] = useState("bonds");
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
      const headers = { Authorization: `Bearer ${token}` };
      
      // Fetch both bond holdings and real estate investments in parallel
      const [holdingsRes, realEstateRes] = await Promise.all([
        axios.get(`${API}/client/holdings`, { headers }),
        axios.get(`${API}/client/real-estate-investments`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setHoldings(holdingsRes.data);
      setRealEstateInvestments(realEstateRes.data || []);
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

  // Get consolidated EXPECTED cashflows by date (from bond definition)
  const getExpectedCashflowsByDate = (trades) => {
    if (!trades) return [];
    
    const byDate = {};
    
    trades.forEach(trade => {
      const expectedCfs = trade.expected_cashflows || [];
      expectedCfs.forEach(cf => {
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
            investment_amount: 0,
            transactions: []
          };
        }
        
        if (isInvestment) {
          byDate[cf.date].type = 'investment';
          byDate[cf.date].investment_amount += Math.abs(cf.amount || cf.gross_amount || 0);
          byDate[cf.date].gross_amount += cf.gross_amount || cf.amount || 0;
          byDate[cf.date].net_amount += cf.net_amount || cf.amount || 0;
        } else {
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

  // Download Combined Cashflow PDF (Expected + Actual)
  const downloadCombinedCashflowPDF = async (holdingData, expectedCashflows, actualCashflows) => {
    const formatAmount = (amt) => {
      if (!amt || amt === 0) return '₹0.00';
      return `₹${Math.abs(amt).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

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

    toast.info("Generating PDF...");

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

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Cashflow Report - ${holdingData.bond_name}</title>
      </head>
      <body style="font-family: Arial, Helvetica, sans-serif; padding: 25px 30px; color: #000; background: #fff; font-size: 11px; line-height: 1.5; margin: 0;">
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
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
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
            
            <td style="width: 4%;"></td>
            
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
        
        <div style="font-size: 9px; color: #555; line-height: 1.6; margin-top: 20px; font-style: italic; border-top: 1px solid #ddd; padding-top: 10px;">
          <strong style="color: #000;">Note:</strong> Expected Cashflow shows projected returns based on original investment terms. Actual Cashflow shows realized transactions. Negative values indicate investments (outflows).
        </div>
        
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

      await new Promise(resolve => setTimeout(resolve, 800));

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

  // Download Combined Cashflow Excel (CSV format)
  const downloadCombinedCashflowExcel = async (holdingData, expectedCashflows, actualCashflows) => {
    try {
      toast.info("Generating Excel...");
      
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
      
      let csv = '';
      csv += `Cashflow Report - ${holdingData.bond_name}\n`;
      csv += `Units,${holdingData.total_units || holdingData.units || ''},,,,,,,,,\n`;
      csv += `Generated,${format(new Date(), 'dd-MMM-yy')},,,,,,,,,\n`;
      csv += '\n';
      csv += 'EXPECTED CASHFLOWS,,,,,,,ACTUAL CASHFLOWS,,,\n';
      csv += 'Date,Type,Principal,Interest,Gross Amount,TDS,Net Amount,,,Date,Type,Principal,Interest,Gross Amount,TDS,Net Amount,Status\n';
      
      const maxRows = Math.max(expectedCashflows.length, actualCashflows.length);
      
      for (let i = 0; i < maxRows; i++) {
        const exp = expectedCashflows[i];
        const act = actualCashflows[i];
        
        if (exp) {
          const isInv = exp.type === 'investment';
          const gross = isInv ? -Math.abs(exp.investment_amount || exp.gross_amount || 0) : (exp.gross_amount || ((exp.principal_component || 0) + (exp.interest_component || 0)));
          csv += `${exp.date},${isInv ? 'Investment' : exp.type === 'maturity' ? 'Maturity' : 'Inflow'},${exp.principal_component || 0},${exp.interest_component || 0},${gross},${exp.tds_amount || 0},${exp.net_amount || gross}`;
        } else {
          csv += ',,,,,,,';
        }
        
        csv += ',,,';
        
        if (act) {
          const isInv = act.type === 'investment';
          const gross = isInv ? -Math.abs(act.investment_amount || act.gross_amount || 0) : (act.gross_amount || ((act.principal_component || 0) + (act.interest_component || 0)));
          const status = isInv ? 'Paid' : act.is_repaid ? 'Received' : act.type === 'maturity' ? 'At Maturity' : 'Pending';
          csv += `${act.date},${isInv ? 'Investment' : act.is_prepaid ? 'Prepayment' : act.type === 'maturity' ? 'Maturity' : 'Repayment'},${act.principal_component || 0},${act.interest_component || 0},${gross},${act.tds_amount || 0},${act.net_amount || gross},${status}`;
        }
        
        csv += '\n';
      }
      
      csv += '\n';
      csv += `Expected Total Investment,${expTotalInvestment},,,,,,,,Actual Total Investment,${actTotalInvestment}\n`;
      csv += `Expected Total Returns,${expTotalGross},,,,,,,,Actual Total Returns,${actTotalGross}\n`;
      csv += `Expected Profit,${expProfit},,,,,,,,Actual Profit,${actProfit}\n`;
      csv += `Expected XIRR,${holdingData.xirr?.toFixed(2) || '-'}%,,,,,,,,Actual XIRR,${holdingData.actual_xirr?.toFixed(2) || '-'}%\n`;
      
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

  const downloadHoldingPDF = async (holding) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API}/holdings/${holding.bond_id}/pdf`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${holding.bond_name.replace(/[^a-zA-Z0-9]/g, '_')}_holding_report.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Holding report downloaded");
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast.error("Failed to download holding report");
    }
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
                <p className="text-sm text-gray-500">View your investments and cashflows</p>
              </div>
            </div>
          </div>
          
          {/* Main Tab Navigation */}
          <div className="flex items-center gap-6 mt-4 border-t pt-4">
            <button 
              onClick={() => setMainTab("bonds")}
              className={`pb-2 border-b-2 font-medium transition-colors flex items-center gap-2 ${
                mainTab === "bonds" 
                  ? "border-teal-600 text-teal-700" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="tab-bonds"
            >
              <Wallet className="h-4 w-4" />
              Bonds ({holdings?.holdings?.length || 0})
            </button>
            <button 
              onClick={() => setMainTab("real-estate")}
              className={`pb-2 border-b-2 font-medium transition-colors flex items-center gap-2 ${
                mainTab === "real-estate" 
                  ? "border-teal-600 text-teal-700" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="tab-real-estate"
            >
              <Building2 className="h-4 w-4" />
              Real Estate ({realEstateInvestments.length})
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Bonds Tab Content */}
          {mainTab === "bonds" && (
            <>
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
                                <button 
                                  onClick={() => viewCashflows(holding)} 
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
      </div>

      {/* Cashflow Modal - Side by Side Expected vs Actual (matching Broker view) */}
      {showCashflowModal && selectedHolding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCashflowModal(false)} />
          
          <div className="relative bg-white rounded-xl shadow-2xl w-[95%] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-teal-50 to-emerald-50">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Cashflow Details</h2>
                <p className="text-sm text-gray-600">{selectedHolding.bond_name} • {selectedHolding.total_units} units • Invested: {formatINR(selectedHolding.invested_amount)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const expectedCfs = getExpectedCashflowsByDate(selectedHolding.trades);
                    const actualCfs = getActualCashflowsByDate(selectedHolding.trades);
                    downloadCombinedCashflowPDF(selectedHolding, expectedCfs, actualCfs);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 rounded-lg text-white text-sm font-medium transition-colors"
                  title="Download as PDF"
                  data-testid="download-pdf-btn"
                >
                  <FileText className="h-4 w-4" />
                  PDF
                </button>
                <button
                  onClick={() => {
                    const expectedCfs = getExpectedCashflowsByDate(selectedHolding.trades);
                    const actualCfs = getActualCashflowsByDate(selectedHolding.trades);
                    downloadCombinedCashflowExcel(selectedHolding, expectedCfs, actualCfs);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm font-medium transition-colors"
                  title="Download as Excel (CSV)"
                  data-testid="download-excel-btn"
                >
                  <Download className="h-4 w-4" />
                  Excel
                </button>
                <button onClick={() => setShowCashflowModal(false)} className="p-2 hover:bg-white/50 rounded-full transition-colors" data-testid="close-modal-btn">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>
            
            {/* Tabs: Summary + Individual Transactions */}
            <div className="flex border-b border-gray-200 bg-gray-50 px-4 overflow-x-auto">
              <button
                onClick={() => setActiveTab("summary")}
                className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                  activeTab === "summary" 
                    ? 'border-teal-600 text-teal-700 bg-white' 
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
                const uniqueDates = [...new Set(selectedHolding.trades.map(t => t.investment_date?.split('T')[0]))];
                if (uniqueDates.length <= 1) return null;
                
                return selectedHolding.trades.map((trade, index) => (
                  <button
                    key={trade.trade_id}
                    onClick={() => setActiveTab(index)}
                    className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                      activeTab === index 
                        ? 'border-teal-600 text-teal-700 bg-white' 
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
              {/* Summary Tab Content - Side by Side Layout */}
              {activeTab === "summary" && (
                <div className="p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    
                    {/* LEFT COLUMN - Expected Cashflow */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
                      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Expected Cashflow
                        </h3>
                      </div>
                      
                      <div className="flex-1 max-h-[300px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                            <tr>
                              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(() => {
                              const expectedCashflows = getExpectedCashflowsByDate(selectedHolding.trades);
                              return expectedCashflows.length > 0 ? expectedCashflows.map((cf, idx) => (
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
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Expected Summary Footer */}
                      <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 mt-auto">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-sm text-gray-600">Profits:</span>
                            <span className="font-mono font-bold ml-2 text-green-600">
                              {(() => {
                                const expectedCashflows = getExpectedCashflowsByDate(selectedHolding.trades);
                                const profit = expectedCashflows.filter(cf => cf.type !== 'investment').reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0) -
                                  expectedCashflows.filter(cf => cf.type === 'investment').reduce((sum, cf) => sum + Math.abs(cf.investment_amount || cf.gross_amount || 0), 0);
                                return formatAbsoluteINR(profit);
                              })()}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm text-gray-600">XIRR:</span>
                            <span className="font-mono font-bold ml-2 text-blue-700">
                              {selectedHolding.xirr !== null && selectedHolding.xirr !== undefined ? `${selectedHolding.xirr.toFixed(2)}%` : '-'}
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
                      
                      <div className="flex-1 max-h-[300px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                            <tr>
                              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(() => {
                              const actualCashflows = getActualCashflowsByDate(selectedHolding.trades);
                              return actualCashflows.length > 0 ? actualCashflows.map((cf, idx) => (
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
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Actual Summary Footer */}
                      <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 mt-auto">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-sm text-gray-600">Profits:</span>
                            <span className="font-mono font-bold ml-2 text-green-600">
                              {(() => {
                                const actualCashflows = getActualCashflowsByDate(selectedHolding.trades);
                                const profit = actualCashflows.filter(cf => cf.type !== 'investment').reduce((sum, cf) => sum + (cf.gross_amount || (cf.principal_component || 0) + (cf.interest_component || 0)), 0) -
                                  actualCashflows.filter(cf => cf.type === 'investment').reduce((sum, cf) => sum + Math.abs(cf.investment_amount || cf.gross_amount || 0), 0);
                                return formatAbsoluteINR(profit);
                              })()}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm text-gray-600">XIRR:</span>
                            <span className="font-mono font-bold ml-2 text-green-700">
                              {selectedHolding.actual_xirr !== null && selectedHolding.actual_xirr !== undefined ? `${selectedHolding.actual_xirr.toFixed(2)}%` : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                  </div>
                </div>
              )}
              
              {/* Individual Trade Tab Content - Side by Side Layout per Trade */}
              {typeof activeTab === 'number' && selectedHolding.trades[activeTab] && (
                <div className="p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    
                    {/* Expected Cashflows for this trade */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
                      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
                        <h3 className="font-semibold text-white text-sm">Expected Cashflow</h3>
                      </div>
                      <div className="flex-1 max-h-[300px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                            <tr>
                              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600">Date</th>
                              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(selectedHolding.trades[activeTab].expected_cashflows || []).map((cf, idx) => (
                              <tr key={idx} className={cf.type === 'investment' ? 'bg-red-50' : 'bg-white hover:bg-gray-50'}>
                                <td className={`py-2 px-3 font-mono text-sm ${cf.type === 'investment' ? 'text-red-700' : 'text-gray-900'}`}>
                                  {format(new Date(cf.date), "dd MMM yyyy")}
                                </td>
                                <td className={`py-2 px-3 text-right font-mono text-sm font-semibold ${cf.type === 'investment' ? 'text-red-600' : 'text-gray-900'}`}>
                                  {cf.type === 'investment' ? '-' : ''}{formatAbsoluteINR(cf.type === 'investment' ? Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0) : (cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0))))}
                                </td>
                              </tr>
                            ))}
                            {(!selectedHolding.trades[activeTab].expected_cashflows || selectedHolding.trades[activeTab].expected_cashflows.length === 0) && (
                              <tr>
                                <td colSpan="2" className="py-6 text-center text-gray-500 text-sm">No expected cashflows</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    
                    {/* Actual Cashflow for this trade */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
                      <div className="bg-gradient-to-r from-green-600 to-green-700 px-4 py-3">
                        <h3 className="font-semibold text-white text-sm">Actual Cashflow</h3>
                      </div>
                      <div className="flex-1 max-h-[300px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                            <tr>
                              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600">Date</th>
                              <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(selectedHolding.trades[activeTab].actual_cashflows || []).map((cf, idx) => (
                              <tr key={idx} className={cf.type === 'investment' ? 'bg-red-50' : cf.is_repaid ? 'bg-green-50' : 'bg-yellow-50'}>
                                <td className={`py-2 px-3 font-mono text-sm ${cf.type === 'investment' ? 'text-red-700' : cf.is_repaid ? 'text-green-700' : 'text-yellow-700'}`}>
                                  {format(new Date(cf.date), "dd MMM yyyy")}
                                </td>
                                <td className={`py-2 px-3 text-right font-mono text-sm font-semibold ${cf.type === 'investment' ? 'text-red-600' : cf.is_repaid ? 'text-green-600' : 'text-yellow-600'}`}>
                                  {cf.type === 'investment' ? '-' : ''}{formatAbsoluteINR(cf.type === 'investment' ? Math.abs(cf.investment_amount || cf.gross_amount || cf.amount || 0) : (cf.gross_amount || ((cf.principal_component || 0) + (cf.interest_component || 0))))}
                                </td>
                              </tr>
                            ))}
                            {(!selectedHolding.trades[activeTab].actual_cashflows || selectedHolding.trades[activeTab].actual_cashflows.length === 0) && (
                              <tr>
                                <td colSpan="2" className="py-6 text-center text-gray-500 text-sm">No actual cashflows yet</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
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
