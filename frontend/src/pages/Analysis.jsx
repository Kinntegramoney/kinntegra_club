import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  FileUp, 
  Download, 
  Trash2, 
  Eye, 
  Upload, 
  FileSpreadsheet,
  ChevronLeft,
  RefreshCw,
  FileText,
  Calendar,
  User,
  Database,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const Analysis = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [schemeMasterStatus, setSchemeMasterStatus] = useState(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  
  // Step-by-step wizard
  const [currentStep, setCurrentStep] = useState(1);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  
  // Upload form state
  const [casFile, setCasFile] = useState(null);
  const [casPassword, setCasPassword] = useState('');
  const [schemeMasterFile, setSchemeMasterFile] = useState(null);
  const [uploadingCAS, setUploadingCAS] = useState(false);
  const [uploadingSchemeMaster, setUploadingSchemeMaster] = useState(false);

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
          setCurrentStep(3); // Move to results step
        }, 500);
      } else {
        setProcessingStatus('');
        setProcessingProgress(0);
        toast.error(data.detail || 'Failed to analyze CAS file');
      }
    } catch (error) {
      console.error('Error uploading CAS:', error);
      setProcessingStatus('');
      setProcessingProgress(0);
      toast.error('Error uploading file');
    } finally {
      setUploadingCAS(false);
    }
  };

  const handleSchemeMasterUpload = async (e) => {
    e.preventDefault();
    
    if (!schemeMasterFile) {
      toast.error('Please select a scheme master file');
      return;
    }

    setUploadingSchemeMaster(true);
    setProcessingStatus('Uploading BSE Scheme Master...');
    setProcessingProgress(20);
    
    try {
      const formData = new FormData();
      formData.append('file', schemeMasterFile);

      setProcessingStatus('Processing scheme data...');
      setProcessingProgress(50);

      const response = await fetch(`${API}/api/analysis/upload-scheme-master`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      setProcessingProgress(90);
      const data = await response.json();

      if (response.ok) {
        setProcessingStatus('Scheme master uploaded!');
        setProcessingProgress(100);
        
        setTimeout(() => {
          toast.success(`${data.schemes_added} new schemes added`);
          setSchemeMasterFile(null);
          setProcessingStatus('');
          setProcessingProgress(0);
          fetchSchemeMasterStatus();
        }, 500);
      } else {
        setProcessingStatus('');
        setProcessingProgress(0);
        toast.error(data.detail || 'Failed to upload scheme master');
      }
    } catch (error) {
      console.error('Error uploading scheme master:', error);
      setProcessingStatus('');
      setProcessingProgress(0);
      toast.error('Error uploading file');
    } finally {
      setUploadingSchemeMaster(false);
    }
  };

  const handleDownload = async (analysisId, filename) => {
    try {
      setProcessingStatus('Generating Gap Sheet Excel...');
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
        a.download = `GapSheet_${filename.replace('.pdf', '')}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
        setProcessingProgress(100);
        setTimeout(() => {
          setProcessingStatus('');
          setProcessingProgress(0);
          toast.success('Gap Sheet downloaded successfully!');
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

  // Step indicator component
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate(getBackPath())}
                className="text-slate-400 hover:text-white"
                data-testid="back-button"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-white">Portfolio Analysis</h1>
                <p className="text-sm text-slate-400">Upload CAS PDF and generate Gap Sheet reports</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { fetchAnalyses(); fetchSchemeMasterStatus(); }}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              data-testid="refresh-button"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Bar - Show when processing */}
        {processingStatus && (
          <div className="mb-6 bg-slate-800/50 border border-slate-700 rounded-lg p-4" data-testid="processing-status">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              <span className="text-white font-medium">{processingStatus}</span>
            </div>
            <Progress value={processingProgress} className="h-2" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Step-by-Step Wizard */}
          <div className="space-y-6">
            {/* Steps Progress */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-4">
                <CardTitle className="text-white text-lg">Analysis Steps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <StepIndicator 
                  step={1} 
                  title="Upload CAS PDF" 
                  isComplete={analyses.length > 0}
                  isCurrent={currentStep === 1}
                />
                <div className="ml-4 border-l-2 border-slate-600 h-4" />
                <StepIndicator 
                  step={2} 
                  title="Upload BSE Scheme Master" 
                  isComplete={schemeMasterStatus?.exists}
                  isCurrent={currentStep === 2}
                />
                <div className="ml-4 border-l-2 border-slate-600 h-4" />
                <StepIndicator 
                  step={3} 
                  title="Download Gap Sheet" 
                  isComplete={false}
                  isCurrent={currentStep === 3}
                />
              </CardContent>
            </Card>

            {/* Step 1: CAS Upload */}
            <Card className="bg-slate-800/50 border-slate-700" data-testid="cas-upload-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">1</div>
                  Upload CAS PDF
                </CardTitle>
                <CardDescription className="text-slate-400">
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

            {/* Step 2: Scheme Master Upload */}
            <Card className="bg-slate-800/50 border-slate-700" data-testid="scheme-master-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold">2</div>
                  BSE Scheme Master
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Upload BSE scheme master file for accurate NAV mapping
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Download Link */}
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-sm text-slate-300 mb-2">Download the latest scheme master from:</p>
                  <a 
                    href="https://www.bsestarmf.in/RptSchemeMaster.aspx" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                  >
                    <ExternalLink className="h-4 w-4" />
                    BSE StAR MF - Scheme Master
                  </a>
                </div>

                {/* Status */}
                <div className="bg-slate-700/50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Status:</span>
                    <span className={schemeMasterStatus?.exists ? "text-emerald-400" : "text-yellow-400"}>
                      {schemeMasterStatus?.exists ? "✓ Available" : "⚠ Not Uploaded"}
                    </span>
                  </div>
                  {schemeMasterStatus?.exists && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Total Schemes:</span>
                        <span className="text-white">{schemeMasterStatus.total_schemes?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Last Upload:</span>
                        <span className="text-white">{formatDate(schemeMasterStatus.last_upload)}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Upload Form - Broker Only */}
                {user?.role === 'broker' && (
                  <form onSubmit={handleSchemeMasterUpload} className="space-y-3">
                    <div>
                      <Label htmlFor="scheme-file" className="text-slate-300">Scheme Master File (.txt)</Label>
                      <Input
                        id="scheme-file"
                        type="file"
                        accept=".txt"
                        onChange={(e) => setSchemeMasterFile(e.target.files[0])}
                        className="mt-1 bg-slate-700 border-slate-600 text-white file:bg-slate-600 file:text-white file:border-0"
                        data-testid="scheme-file-input"
                      />
                      {schemeMasterFile && (
                        <p className="text-sm text-emerald-400 mt-1">✓ {schemeMasterFile.name}</p>
                      )}
                    </div>
                    <Button 
                      type="submit" 
                      variant="outline"
                      className="w-full border-emerald-600 text-emerald-400 hover:bg-emerald-600/20"
                      disabled={uploadingSchemeMaster || !schemeMasterFile}
                      data-testid="upload-scheme-button"
                    >
                      {uploadingSchemeMaster ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Database className="h-4 w-4 mr-2" />
                          Upload Scheme Master
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Middle & Right Columns - Results */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 3: Selected Analysis Results */}
            {selectedAnalysis && (
              <Card className="bg-slate-800/50 border-slate-700 border-blue-500/50" data-testid="selected-analysis-card">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-sm font-bold text-white">3</div>
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
                      <strong>Gap Sheet includes:</strong> Portfolio Performance, Tax View, Advisor View, PAN View, MF Ageing, Mutual Fund Holding, MF Transactions, Accounts, Exit Loads, Other Details
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
