import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import Sidebar from '../components/Sidebar';
import { 
  FileUp, 
  Download, 
  Trash2, 
  Eye, 
  Upload, 
  FileSpreadsheet,
  RefreshCw,
  FileText,
  Calendar,
  User,
  Database,
  CheckCircle2,
  Loader2,
  AlertCircle
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Step indicator component - moved outside to avoid re-render issues
const StepIndicator = ({ step, title, isComplete, isCurrent }) => (
  <div className="flex items-center gap-3">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
      isComplete ? 'bg-emerald-500' : isCurrent ? 'bg-blue-500' : 'bg-slate-600'
    }`}>
      {isComplete ? (
        <CheckCircle2 className="h-5 w-5 text-white" />
      ) : (
        <span className="text-white font-medium">{step}</span>
      )}
    </div>
    <span className={`text-sm font-medium ${isCurrent ? 'text-white' : 'text-slate-400'}`}>
      {title}
    </span>
  </div>
);

const Analysis = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [schemeMasterStatus, setSchemeMasterStatus] = useState(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  
  // Upload state
  const [casFile, setCasFile] = useState(null);
  const [casPassword, setCasPassword] = useState('');
  const [uploadingCAS, setUploadingCAS] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    fetchAnalyses();
    fetchSchemeMasterStatus();
  }, []);

  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  });

  const fetchAnalyses = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/api/analysis`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setAnalyses(data);
      }
    } catch (error) {
      console.error('Error fetching analyses:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSchemeMasterStatus = async () => {
    try {
      const response = await fetch(`${API}/api/analysis/scheme-master/status`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setSchemeMasterStatus(data);
      }
    } catch (error) {
      console.error('Error fetching scheme master status:', error);
    }
  };

  const handleCASUpload = async (e) => {
    e.preventDefault();
    
    if (!casFile) {
      toast.error('Please select a CAS PDF file');
      return;
    }
    
    if (!casPassword) {
      toast.error('Please enter the PDF password');
      return;
    }

    setUploadingCAS(true);
    setProcessingStatus('Uploading CAS PDF...');
    setProcessingProgress(10);
    
    try {
      const formData = new FormData();
      formData.append('file', casFile);
      formData.append('password', casPassword);

      setProcessingStatus('Parsing PDF and extracting transactions...');
      setProcessingProgress(30);

      const response = await fetch(`${API}/api/analysis/upload-cas`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      setProcessingProgress(70);
      const data = await response.json();

      if (response.ok) {
        setProcessingStatus('Analysis complete!');
        setProcessingProgress(100);
        
        setTimeout(() => {
          toast.success(`CAS analyzed: ${data.total_folios} folios, ${data.total_transactions} transactions`);
          setCasFile(null);
          setCasPassword('');
          setProcessingStatus('');
          setProcessingProgress(0);
          fetchAnalyses();
          setSelectedAnalysis(data);
        }, 500);
      } else {
        setProcessingStatus('');
        setProcessingProgress(0);
        toast.error(data.detail || 'Failed to analyze CAS file. Please check the password.');
      }
    } catch (error) {
      console.error('Error uploading CAS:', error);
      setProcessingStatus('');
      setProcessingProgress(0);
      toast.error('Error uploading file. Please try again.');
    } finally {
      setUploadingCAS(false);
    }
  };

  const handleDownload = async (analysisId, filename) => {
    try {
      setProcessingStatus('Generating Gap Sheet Reports...');
      setProcessingProgress(30);
      
      const response = await fetch(`${API}/api/analysis/${analysisId}/download`, {
        headers: getAuthHeaders()
      });

      setProcessingProgress(80);

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Download as ZIP file containing all reports
        a.download = `GapSheet_${filename.replace('.pdf', '')}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
        setProcessingProgress(100);
        setTimeout(() => {
          setProcessingStatus('');
          setProcessingProgress(0);
          toast.success('Gap Sheet reports downloaded! (ZIP contains separate files by PAN)');
        }, 300);
      } else {
        setProcessingStatus('');
        setProcessingProgress(0);
        toast.error('Failed to download report');
      }
    } catch (error) {
      console.error('Error downloading:', error);
      setProcessingStatus('');
      setProcessingProgress(0);
      toast.error('Error downloading report');
    }
  };

  const handleDelete = async (analysisId) => {
    if (!window.confirm('Are you sure you want to delete this analysis?')) {
      return;
    }

    try {
      const response = await fetch(`${API}/api/analysis/${analysisId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        toast.success('Analysis deleted');
        fetchAnalyses();
        if (selectedAnalysis?.analysis_id === analysisId || selectedAnalysis?.id === analysisId) {
          setSelectedAnalysis(null);
        }
      } else {
        toast.error('Failed to delete analysis');
      }
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Error deleting analysis');
    }
  };

  const handleViewDetails = async (analysisId) => {
    try {
      const response = await fetch(`${API}/api/analysis/${analysisId}`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedAnalysis(data);
      } else {
        toast.error('Failed to load analysis details');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error loading details');
    }
  };

  const getBackPath = () => {
    if (!user) return '/login';
    if (user.role === 'broker') return '/broker/dashboard';
    if (user.role === 'sub_broker') return '/sub-broker/opportunities';
    return '/client/opportunities';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (value) => {
    if (!value) return '₹0';
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)} L`;
    return `₹${value.toLocaleString('en-IN')}`;
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Portfolio Analysis</h1>
              <p className="text-sm text-gray-500 mt-1">Upload CAS PDF and generate Gap Sheet reports</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { fetchAnalyses(); fetchSchemeMasterStatus(); }}
              className="border-gray-300 text-gray-700 hover:bg-gray-100"
              data-testid="refresh-button"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="p-6">
        {/* Progress Bar - Show when processing */}
        {processingStatus && (
          <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4 shadow-sm" data-testid="processing-status">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              <span className="text-white font-medium">{processingStatus}</span>
            </div>
            <Progress value={processingProgress} className="h-2" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Upload Section */}
          <div className="space-y-6">
            {/* Steps Progress */}
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-gray-800 text-lg">Analysis Steps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <StepIndicator 
                  step={1} 
                  title="Upload CAS PDF" 
                  isComplete={analyses.length > 0}
                  isCurrent={true}
                />
                <div className="ml-4 border-l-2 border-gray-300 h-4" />
                <StepIndicator 
                  step={2} 
                  title="Download Gap Sheet" 
                  isComplete={false}
                  isCurrent={selectedAnalysis !== null}
                />
              </CardContent>
            </Card>

            {/* Scheme Master Status - Info only */}
            {!schemeMasterStatus?.exists && user?.role === 'broker' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-700 font-medium">Scheme Master Not Uploaded</p>
                    <p className="text-amber-600 text-sm mt-1">
                      For better NAV mapping, upload the BSE Scheme Master file.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 border-amber-400 text-amber-600 hover:bg-amber-100"
                      onClick={() => navigate('/broker/admin/scheme-master')}
                    >
                      <Database className="h-4 w-4 mr-2" />
                      Go to Admin → Scheme Master
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {schemeMasterStatus?.exists && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Scheme Master: {schemeMasterStatus.total_schemes?.toLocaleString()} schemes
                  </span>
                </div>
              </div>
            )}

            {/* Step 1: CAS Upload */}
            <Card className="bg-white border-gray-200 shadow-sm" data-testid="cas-upload-card">
              <CardHeader>
                <CardTitle className="text-gray-800 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-xs font-bold text-white">1</div>
                  Upload CAS PDF
                </CardTitle>
                <CardDescription className="text-gray-500">
                  Upload your Consolidated Account Statement (password-protected PDF)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCASUpload} className="space-y-4">
                  <div>
                    <Label htmlFor="cas-file" className="text-slate-300">CAS PDF File</Label>
                    <Input
                      id="cas-file"
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setCasFile(e.target.files[0])}
                      className="mt-1 bg-slate-700 border-slate-600 text-white file:bg-slate-600 file:text-white file:border-0"
                      data-testid="cas-file-input"
                    />
                    {casFile && (
                      <p className="text-sm text-emerald-400 mt-1">✓ {casFile.name}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="cas-password" className="text-slate-300">PDF Password</Label>
                    <Input
                      id="cas-password"
                      type="password"
                      placeholder="Enter PDF password"
                      value={casPassword}
                      onChange={(e) => setCasPassword(e.target.value)}
                      className="mt-1 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                      data-testid="cas-password-input"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    disabled={uploadingCAS || !casFile || !casPassword}
                    data-testid="analyze-cas-button"
                  >
                    {uploadingCAS ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Analyze CAS
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Middle & Right Columns - Results */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 2: Selected Analysis Results */}
            {selectedAnalysis && (
              <Card className="bg-slate-800/50 border-slate-700 border-blue-500/50" data-testid="selected-analysis-card">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-sm font-bold text-white">2</div>
                      <div>
                        <CardTitle className="text-white">
                          {selectedAnalysis.filename || 'Analysis Result'}
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                          Analyzed on {formatDate(selectedAnalysis.created_at)}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleDownload(selectedAnalysis.analysis_id || selectedAnalysis.id, selectedAnalysis.filename)}
                      className="bg-emerald-600 hover:bg-emerald-700"
                      data-testid="download-report-button"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Gap Sheet
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-blue-400">
                        {selectedAnalysis.total_folios || Object.keys(selectedAnalysis.parsed_data?.folios || {}).length || 0}
                      </p>
                      <p className="text-sm text-slate-400">Folios</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-emerald-400">
                        {selectedAnalysis.total_transactions || selectedAnalysis.parsed_data?.total_transactions || 0}
                      </p>
                      <p className="text-sm text-slate-400">Transactions</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-amber-400">
                        {formatCurrency(selectedAnalysis.portfolio_summary?.total_cost || selectedAnalysis.parsed_data?.portfolio_summary?.total_cost || 0)}
                      </p>
                      <p className="text-sm text-slate-400">Total Cost</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-purple-400">
                        {formatCurrency(selectedAnalysis.portfolio_summary?.total_value || selectedAnalysis.parsed_data?.portfolio_summary?.total_value || 0)}
                      </p>
                      <p className="text-sm text-slate-400">Current Value</p>
                    </div>
                  </div>
                  
                  {/* Gap Sheet Info */}
                  <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                    <p className="text-sm text-blue-300">
                      <strong>Gap Sheet includes 10 sheets:</strong> Portfolio Performance, Tax View, Advisor View, PAN View, MF Ageing, Mutual Fund Holding, MF Transactions, Accounts, Exit Loads, Other Details
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Analysis History */}
            <Card className="bg-slate-800/50 border-slate-700" data-testid="analysis-history-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-purple-400" />
                  Analysis History
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Your previous CAS analyses
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : analyses.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 mx-auto text-slate-600 mb-3" />
                    <p className="text-slate-400">No analyses yet</p>
                    <p className="text-sm text-slate-500">Upload a CAS PDF to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {analyses.map((analysis) => (
                      <div 
                        key={analysis.id}
                        className={`bg-slate-700/50 rounded-lg p-4 hover:bg-slate-700 transition-colors cursor-pointer ${
                          (selectedAnalysis?.id === analysis.id || selectedAnalysis?.analysis_id === analysis.id) ? 'ring-2 ring-blue-500' : ''
                        }`}
                        onClick={() => handleViewDetails(analysis.id)}
                        data-testid={`analysis-item-${analysis.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-white flex items-center gap-2">
                              <FileText className="h-4 w-4 text-blue-400" />
                              {analysis.filename}
                            </h4>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(analysis.created_at)}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {analysis.user_name}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewDetails(analysis.id);
                              }}
                              className="text-slate-400 hover:text-white"
                              data-testid={`view-analysis-${analysis.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(analysis.id, analysis.filename);
                              }}
                              className="text-emerald-400 hover:text-emerald-300"
                              data-testid={`download-analysis-${analysis.id}`}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(analysis.id);
                              }}
                              className="text-red-400 hover:text-red-300"
                              data-testid={`delete-analysis-${analysis.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Analysis;
