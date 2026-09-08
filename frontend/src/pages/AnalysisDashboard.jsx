import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  ArrowLeft, Download, Loader2, TrendingUp, TrendingDown, 
  PieChart, BarChart3, Wallet, Users, ChevronDown, ChevronUp, Eye,
  Receipt, Search, Filter, AlertTriangle
} from "lucide-react";
import { Input } from "@/components/ui/input";

const API = process.env.REACT_APP_BACKEND_URL;

const AnalysisDashboard = () => {
  const { analysisId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [showAllHoldings, setShowAllHoldings] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [transactionFilter, setTransactionFilter] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('all');

  useEffect(() => {
    document.title = "Kinntegraa | Analysis Dashboard";
    fetchData();
  }, [analysisId]);

  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch analysis details
      const analysisRes = await fetch(`${API}/api/analysis/${analysisId}`, {
        headers: getAuthHeaders()
      });
      
      if (analysisRes.ok) {
        const analysisData = await analysisRes.json();
        setAnalysis(analysisData);
      }

      // Fetch dashboard data
      const dashboardRes = await fetch(`${API}/api/analysis/${analysisId}/dashboard`, {
        headers: getAuthHeaders()
      });
      
      if (dashboardRes.ok) {
        const data = await dashboardRes.json();
        setDashboardData(data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (allPans = false) => {
    try {
      setDownloading(true);
      toast.info('Generating report... This may take 30-60 seconds.', { duration: 5000 });
      
      const url = allPans 
        ? `${API}/api/analysis/${analysisId}/download?all_pans=true`
        : `${API}/api/analysis/${analysisId}/download`;
      
      const response = await fetch(url, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        const suffix = allPans ? '_AllPANs' : `_${analysis?.client_pan || ''}`;
        a.download = `CAS_Reports${suffix}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();
        toast.success('Report downloaded!');
      } else {
        const errorText = await response.text();
        console.error('Download failed:', response.status, errorText);
        toast.error('Failed to download report');
      }
    } catch (error) {
      console.error('Error downloading:', error);
      toast.error('Error downloading report');
    } finally {
      setDownloading(false);
    }
  };

  // Get all transactions from the analysis data
  const allTransactions = useMemo(() => {
    // Transactions are stored in parsed_data.transactions
    const transactions = analysis?.parsed_data?.transactions || analysis?.transactions || [];
    // Filter by client_pan if available
    const clientPan = analysis?.client_pan?.toUpperCase();
    if (clientPan) {
      return transactions.filter(t => t.pan?.toUpperCase() === clientPan);
    }
    return transactions;
  }, [analysis]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    let filtered = allTransactions;
    
    // Filter by search term
    if (transactionFilter) {
      const search = transactionFilter.toLowerCase();
      filtered = filtered.filter(t => 
        t.scheme?.toLowerCase().includes(search) ||
        t.transaction_type?.toLowerCase().includes(search) ||
        t.folio?.toLowerCase().includes(search) ||
        t.date?.toLowerCase().includes(search)
      );
    }
    
    // Filter by transaction type
    if (transactionTypeFilter !== 'all') {
      filtered = filtered.filter(t => {
        const type = t.transaction_type?.toLowerCase() || '';
        switch(transactionTypeFilter) {
          case 'purchase':
            return type.includes('purchase') || type.includes('sip');
          case 'redemption':
            return type.includes('redemption') || type.includes('switch out');
          case 'switch':
            return type.includes('switch');
          case 'dividend':
            return type.includes('dividend') || type.includes('idcw');
          case 'other':
            return !type.includes('purchase') && !type.includes('redemption') && 
                   !type.includes('switch') && !type.includes('dividend') && 
                   !type.includes('sip') && !type.includes('idcw');
          default:
            return true;
        }
      });
    }
    
    return filtered;
  }, [allTransactions, transactionFilter, transactionTypeFilter]);

  // Get unique transaction types for filter
  const transactionTypes = useMemo(() => {
    const types = new Set();
    allTransactions.forEach(t => {
      if (t.transaction_type) {
        types.add(t.transaction_type);
      }
    });
    return Array.from(types).sort();
  }, [allTransactions]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-etihad-gold-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => window.close()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Close
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Analysis Dashboard</h1>
              {analysis && (
                <p className="text-sm text-gray-500">
                  {analysis.client_name} • {analysis.filename}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="group relative">
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleDownload(false)} 
                  className="bg-green-600 hover:bg-green-700"
                  disabled={downloading}
                  title={`Download reports for ${analysis?.client_pan || 'this client'} only`}
                >
                  {downloading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download (This PAN)
                    </>
                  )}
                </Button>
                <Button 
                  onClick={() => handleDownload(true)} 
                  variant="outline"
                  className="border-green-600 text-green-600 hover:bg-green-50"
                  disabled={downloading}
                  title="Download reports for ALL PANs in the CAS file"
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Users className="h-4 w-4 mr-2" />
                      Download (All PANs)
                    </>
                  )}
                </Button>
              </div>
              {/* Report Contents Tooltip */}
              <div className="absolute right-0 top-full mt-2 w-80 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-4">
                <h4 className="font-semibold text-gray-800 mb-2 text-sm">Reports Included in ZIP:</h4>
                <div className="space-y-2 text-xs text-gray-600">
                  <div className="border-b pb-2">
                    <p className="font-medium text-gray-700">Consolidated Reports:</p>
                    <ul className="list-disc list-inside ml-1 mt-1 space-y-0.5">
                      <li>GapSheet_Consolidated.xlsx</li>
                      <li>PotentialSellReport_Consolidated.xlsx</li>
                      <li>Stocklist_Consolidated.xlsx</li>
                      <li>Benchmark_Comparison.xlsx</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">PAN-wise Folders:</p>
                    <p className="text-gray-500 ml-1 mt-1">Each PAN gets a separate folder with:</p>
                    <ul className="list-disc list-inside ml-1 mt-1 space-y-0.5">
                      <li>GapSheet_[PAN].xlsx</li>
                      <li>PotentialSellReport_[PAN].xlsx</li>
                      <li>Stocklist_[PAN].xlsx</li>
                      <li>Benchmark_Comparison_[PAN].xlsx</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="max-w-6xl mx-auto p-6">
        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'summary' 
                ? 'border-etihad-gold-500 text-etihad-gold-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <PieChart className="h-4 w-4 inline mr-2" />
            Summary
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'transactions' 
                ? 'border-etihad-gold-500 text-etihad-gold-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Receipt className="h-4 w-4 inline mr-2" />
            Transactions ({allTransactions.length})
          </button>
        </div>

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by scheme, folio, date..."
                    value={transactionFilter}
                    onChange={(e) => setTransactionFilter(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="min-w-[150px]">
                <select
                  value={transactionTypeFilter}
                  onChange={(e) => setTransactionTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-etihad-gold-500"
                >
                  <option value="all">All Types</option>
                  <option value="purchase">Purchase/SIP</option>
                  <option value="redemption">Redemption</option>
                  <option value="switch">Switch</option>
                  <option value="dividend">Dividend/IDCW</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            {/* Transaction Stats */}
            <div className="flex gap-4 mb-4 text-sm text-gray-600">
              <span>Showing {filteredTransactions.length} of {allTransactions.length} transactions</span>
            </div>

            {/* Transactions Table with 6 Fixed Columns */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-gray-900 text-white sticky top-0">
                  <tr>
                    <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider border-r border-gray-700">Date</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider border-r border-gray-700">Transaction</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider border-r border-gray-700">Amount (INR)</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider border-r border-gray-700">Units</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider border-r border-gray-700">Price (INR)</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold uppercase tracking-wider">Unit Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-500">
                        {allTransactions.length === 0 
                          ? "No transactions found in this analysis" 
                          : "No transactions match your filters"}
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.slice(0, 500).map((trans, idx) => (
                      <React.Fragment key={idx}>
                        {/* Scheme header row when scheme changes */}
                        {(idx === 0 || trans.scheme !== filteredTransactions[idx - 1]?.scheme) && (
                          <tr className="bg-blue-50">
                            <td colSpan={6} className="py-2 px-3 text-sm font-semibold text-blue-800">
                              {trans.scheme || 'Unknown Scheme'} 
                              <span className="ml-2 text-xs font-normal text-blue-600">
                                (Folio: {trans.folio || 'N/A'})
                              </span>
                            </td>
                          </tr>
                        )}
                        {/* Transaction row */}
                        <tr className={`hover:bg-gray-50 ${trans.is_redemption ? 'bg-red-50/30' : ''}`}>
                          <td className="py-2 px-3 text-sm font-mono border-r border-gray-100">
                            {trans.date || '-'}
                          </td>
                          <td className="py-2 px-3 text-sm border-r border-gray-100">
                            <span className={`${
                              trans.is_redemption ? 'text-red-600' : 
                              trans.transaction_type?.toLowerCase().includes('purchase') ? 'text-green-600' : 
                              'text-gray-700'
                            }`}>
                              {trans.transaction_type || '-'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-sm font-mono text-right border-r border-gray-100">
                            {trans.amount != null && trans.amount !== 0 
                              ? `₹${trans.amount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` 
                              : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="py-2 px-3 text-sm font-mono text-right border-r border-gray-100">
                            {trans.units != null && trans.units !== 0 
                              ? trans.units.toLocaleString('en-IN', {minimumFractionDigits: 3, maximumFractionDigits: 3}) 
                              : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="py-2 px-3 text-sm font-mono text-right border-r border-gray-100">
                            {trans.nav != null && trans.nav !== 0 
                              ? `₹${trans.nav.toLocaleString('en-IN', {minimumFractionDigits: 4, maximumFractionDigits: 4})}` 
                              : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="py-2 px-3 text-sm font-mono text-right font-semibold">
                            {trans.balance != null && trans.balance !== 0 
                              ? trans.balance.toLocaleString('en-IN', {minimumFractionDigits: 3, maximumFractionDigits: 3}) 
                              : <span className="text-gray-300">-</span>}
                          </td>
                        </tr>
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
              {filteredTransactions.length > 500 && (
                <div className="text-center py-4 text-sm text-gray-500 bg-gray-50 border-t">
                  Showing first 500 transactions. Download the report for complete data.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Summary Tab */}
        {activeTab === 'summary' && dashboardData && (
          <div className="space-y-6">
            {/* No Active Holdings Message */}
            {dashboardData.summary?.active_schemes === 0 && dashboardData.summary?.total_current_value === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-amber-800 mb-2">No Active Holdings</h3>
                <p className="text-amber-600">
                  This client has no active mutual fund holdings. All investments appear to have been redeemed.
                </p>
                <p className="text-amber-500 text-sm mt-2">
                  Switch to the "Transactions" tab to view historical transaction data.
                </p>
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="h-5 w-5 text-blue-600" />
                  <span className="text-xs font-medium text-blue-600 uppercase">Total Investment</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">
                  ₹{(dashboardData.summary?.total_investment || 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}
                </p>
              </div>
              
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-600 uppercase">Current Value</span>
                </div>
                <p className="text-2xl font-bold text-emerald-900">
                  ₹{(dashboardData.summary?.total_current_value || 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}
                </p>
              </div>
              
              <div className={`bg-gradient-to-br ${dashboardData.summary?.total_gains >= 0 ? 'from-green-50 to-green-100 border-green-200' : 'from-red-50 to-red-100 border-red-200'} rounded-xl p-4 border`}>
                <div className="flex items-center gap-2 mb-2">
                  {dashboardData.summary?.total_gains >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  )}
                  <span className={`text-xs font-medium uppercase ${dashboardData.summary?.total_gains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    Total Gains
                  </span>
                </div>
                <p className={`text-2xl font-bold ${dashboardData.summary?.total_gains >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                  ₹{Math.abs(dashboardData.summary?.total_gains || 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}
                </p>
                <p className={`text-sm ${dashboardData.summary?.gain_percentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {dashboardData.summary?.gain_percentage >= 0 ? '+' : ''}{dashboardData.summary?.gain_percentage?.toFixed(2)}%
                </p>
              </div>
              
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <PieChart className="h-5 w-5 text-purple-600" />
                  <span className="text-xs font-medium text-purple-600 uppercase">Active Schemes</span>
                </div>
                <p className="text-2xl font-bold text-purple-900">
                  {dashboardData.summary?.active_schemes || 0}
                </p>
                <p className="text-sm text-purple-600">
                  {dashboardData.summary?.total_folios || 0} folios
                </p>
              </div>
            </div>
            
            {/* Holdings by Type & Advisor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-etihad-gold-500" />
                  Holdings by Asset Type
                </h4>
                <div className="space-y-3">
                  {Object.entries(dashboardData.holdings_by_type || {}).map(([type, value]) => {
                    const total = Object.values(dashboardData.holdings_by_type || {}).reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? (value / total * 100) : 0;
                    const colors = {
                      Equity: { bg: 'bg-blue-500', light: 'bg-blue-100' },
                      Debt: { bg: 'bg-green-500', light: 'bg-green-100' },
                      Hybrid: { bg: 'bg-purple-500', light: 'bg-purple-100' },
                      Other: { bg: 'bg-gray-500', light: 'bg-gray-100' }
                    };
                    return (
                      <div key={type} className="flex items-center gap-3">
                        <div className="w-20 text-sm font-medium text-gray-700">{type}</div>
                        <div className={`flex-1 h-6 ${colors[type]?.light || 'bg-gray-100'} rounded-full overflow-hidden`}>
                          <div 
                            className={`h-full ${colors[type]?.bg || 'bg-gray-500'} rounded-full transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="w-24 text-right">
                          <span className="text-sm font-semibold text-gray-800">₹{(value/100000).toFixed(1)}L</span>
                          <span className="text-xs text-gray-500 ml-1">({pct.toFixed(0)}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-etihad-gold-500" />
                  Advisor Breakdown
                </h4>
                {dashboardData.advisor_breakdown?.length > 0 ? (
                  <div className="space-y-3">
                    {dashboardData.advisor_breakdown.slice(0, 5).map((advisor, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-etihad-gold-100 flex items-center justify-center">
                            <span className="text-etihad-gold-700 text-xs font-bold">{idx + 1}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{advisor.name || 'Direct'}</p>
                            <p className="text-xs text-gray-500">{advisor.schemes_count} scheme(s)</p>
                          </div>
                        </div>
                        <span className="font-semibold text-gray-700">
                          ₹{(advisor.invested/100000).toFixed(1)}L
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm text-center py-4">No advisor data available</p>
                )}
              </div>
            </div>
            
            {/* Top Holdings */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-etihad-gold-500" />
                  {showAllHoldings ? 'All Holdings' : 'Top 10 Holdings'}
                </h4>
                {dashboardData.all_holdings?.length > 10 && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowAllHoldings(!showAllHoldings)}
                  >
                    {showAllHoldings ? (
                      <>
                        <ChevronUp className="h-4 w-4 mr-1" />
                        Show Less
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-1" />
                        View All ({dashboardData.all_holdings.length})
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Scheme</th>
                      <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Units</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">NAV</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllHoldings ? dashboardData.all_holdings : dashboardData.top_holdings)?.map((holding, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-3">
                          <p className="text-sm font-medium text-gray-800" title={holding.full_name}>{holding.name}</p>
                          <p className="text-xs text-gray-500">Folio: {holding.folio}</p>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            holding.type === 'Equity' ? 'bg-blue-100 text-blue-700' :
                            holding.type === 'Debt' ? 'bg-green-100 text-green-700' :
                            holding.type === 'Hybrid' ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {holding.type}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-sm font-mono">{holding.units?.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-3 text-right text-sm font-mono">{holding.nav ? `₹${holding.nav}` : '-'}</td>
                        <td className="py-3 px-3 text-right text-sm font-semibold text-gray-800">
                          ₹{holding.value?.toLocaleString('en-IN', {maximumFractionDigits: 0})}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* No Dashboard Data State */}
        {activeTab === 'summary' && !dashboardData && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500">Dashboard data not available for this analysis</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisDashboard;
