import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  ArrowLeft, Download, Loader2, TrendingUp, TrendingDown, 
  PieChart, BarChart3, Wallet, Users, ChevronDown, ChevronUp, Eye
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const AnalysisDashboard = () => {
  const { analysisId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [showAllHoldings, setShowAllHoldings] = useState(false);

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

  const handleDownload = async () => {
    try {
      const response = await fetch(`${API}/api/analysis/${analysisId}/download`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GapSheet_${analysis?.filename?.replace('.pdf', '')}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        toast.success('Report downloaded!');
      } else {
        toast.error('Failed to download report');
      }
    } catch (error) {
      console.error('Error downloading:', error);
      toast.error('Error downloading report');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-amber-500 mx-auto mb-4" />
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
          <Button onClick={handleDownload} className="bg-green-600 hover:bg-green-700">
            <Download className="h-4 w-4 mr-2" />
            Download Report
          </Button>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="max-w-6xl mx-auto p-6">
        {dashboardData ? (
          <div className="space-y-6">
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
                  <PieChart className="h-5 w-5 text-amber-500" />
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
                  <Users className="h-5 w-5 text-amber-500" />
                  Advisor Breakdown
                </h4>
                {dashboardData.advisor_breakdown?.length > 0 ? (
                  <div className="space-y-3">
                    {dashboardData.advisor_breakdown.slice(0, 5).map((advisor, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                            <span className="text-amber-700 text-xs font-bold">{idx + 1}</span>
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
                  <BarChart3 className="h-5 w-5 text-amber-500" />
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
        ) : (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500">Dashboard data not available for this analysis</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisDashboard;
