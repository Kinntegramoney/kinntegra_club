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
      isComplete ? 'bg-emerald-500' : isCurrent ? 'bg-amber-500' : 'bg-gray-300'
    }`}>
      {isComplete ? (
        <CheckCircle2 className="h-5 w-5 text-white" />
      ) : (
        <span className="text-white font-medium">{step}</span>
      )}
    </div>
    <span className={`text-sm font-medium ${isCurrent ? 'text-gray-800' : 'text-gray-500'}`}>
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
    document.title = "Kinntegraa | Analysis";
  }, []);

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
              <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
              <span className="text-gray-700 font-medium">{processingStatus}</span>
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

            {/* How to Request CAS Guide */}
            <Card className="bg-blue-50 border-blue-200 shadow-sm" data-testid="cas-guide-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-blue-800 flex items-center gap-2 text-base">
                  <FileText className="h-5 w-5" />
                  How to Request CAS Statement
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-blue-700 space-y-3">
                <p className="font-medium">Follow these steps to get your CAS from CAMS:</p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>
                    Visit{' '}
                    <a 
                      href="https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-800 font-medium"
                    >
                      CAMS CAS Portal
                    </a>
                  </li>
                  <li>Select Statement Type: <span className="font-semibold">Detailed</span></li>
                  <li>Choose Period: <span className="font-semibold">Specific Period</span>
                    <ul className="list-disc list-inside ml-4 mt-1 text-blue-600">
                      <li>From Date: <span className="font-semibold">01/01/2000</span></li>
                      <li>To Date: <span className="font-semibold">Today's Date</span></li>
                    </ul>
                  </li>
                  <li>Folio Listing: <span className="font-semibold">With Zero Balance</span></li>
                  <li>Email: <span className="font-semibold">Registered email on investments</span></li>
                  <li>Password: <span className="font-semibold bg-blue-100 px-2 py-0.5 rounded">kinntegra123</span></li>
                </ol>
                <div className="bg-blue-100 rounded-lg p-3 mt-3">
                  <p className="text-blue-800 font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    After submission, CAMS will email the CAS PDF to the registered email. Upload that PDF below.
                  </p>
                </div>
              </CardContent>
            </Card>

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
                    <Label htmlFor="cas-file" className="text-gray-700">CAS PDF File</Label>
                    <Input
                      id="cas-file"
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setCasFile(e.target.files[0])}
                      className="mt-1 bg-gray-50 border-gray-300 text-gray-800 file:bg-gray-100 file:text-gray-700 file:border-0"
                      data-testid="cas-file-input"
                    />
                    {casFile && (
                      <p className="text-sm text-emerald-600 mt-1">✓ {casFile.name}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="cas-password" className="text-gray-700">PDF Password</Label>
                    <Input
                      id="cas-password"
                      type="password"
                      placeholder="Enter PDF password"
                      value={casPassword}
                      onChange={(e) => setCasPassword(e.target.value)}
                      className="mt-1 bg-gray-50 border-gray-300 text-gray-800 placeholder:text-gray-400"
                      data-testid="cas-password-input"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white"
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
              <Card className="bg-white border-gray-200 shadow-sm border-l-4 border-l-amber-500" data-testid="selected-analysis-card">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-sm font-bold text-white">2</div>
                      <div>
                        <CardTitle className="text-gray-800">
                          {selectedAnalysis.filename || 'Analysis Result'}
                        </CardTitle>
                        <CardDescription className="text-gray-500">
                          Analyzed on {formatDate(selectedAnalysis.created_at)}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleDownload(selectedAnalysis.analysis_id || selectedAnalysis.id, selectedAnalysis.filename)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      data-testid="download-report-button"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Gap Sheet
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                      <p className="text-2xl font-bold text-indigo-600">
                        {selectedAnalysis.total_folios || Object.keys(selectedAnalysis.parsed_data?.folios || {}).length || 0}
                      </p>
                      <p className="text-sm text-gray-500">Folios</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                      <p className="text-2xl font-bold text-emerald-600">
                        {selectedAnalysis.total_transactions || selectedAnalysis.parsed_data?.total_transactions || 0}
                      </p>
                      <p className="text-sm text-gray-500">Transactions</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                      <p className="text-2xl font-bold text-amber-600">
                        {formatCurrency(selectedAnalysis.portfolio_summary?.total_cost || selectedAnalysis.parsed_data?.portfolio_summary?.total_cost || 0)}
                      </p>
                      <p className="text-sm text-gray-500">Total Cost</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                      <p className="text-2xl font-bold text-purple-600">
                        {formatCurrency(selectedAnalysis.portfolio_summary?.total_value || selectedAnalysis.parsed_data?.portfolio_summary?.total_value || 0)}
                      </p>
                      <p className="text-sm text-gray-500">Current Value</p>
                    </div>
                  </div>
                  
                  {/* Gap Sheet Info */}
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-700">
                      <strong>ZIP Download includes:</strong> Consolidated report + separate files by PAN (Portfolio Performance, Tax View, Advisor View, PAN View, and 8 more sheets)
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Analysis History */}
            <Card className="bg-white border-gray-200 shadow-sm" data-testid="analysis-history-card">
              <CardHeader>
                <CardTitle className="text-gray-800 flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-purple-500" />
                  Analysis History
                </CardTitle>
                <CardDescription className="text-gray-500">
                  Your previous CAS analyses
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : analyses.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-500">No analyses yet</p>
                    <p className="text-sm text-gray-400">Upload a CAS PDF to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {analyses.map((analysis) => (
                      <div 
                        key={analysis.id}
                        className={`bg-gray-50 rounded-lg p-4 hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer ${
                          (selectedAnalysis?.id === analysis.id || selectedAnalysis?.analysis_id === analysis.id) ? 'ring-2 ring-amber-500 bg-amber-50' : ''
                        }`}
                        onClick={() => handleViewDetails(analysis.id)}
                        data-testid={`analysis-item-${analysis.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-800 flex items-center gap-2">
                              <FileText className="h-4 w-4 text-indigo-500" />
                              {analysis.filename}
                            </h4>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
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
                              className="text-gray-500 hover:text-gray-700"
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
                              className="text-emerald-600 hover:text-emerald-700"
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
                              className="text-red-500 hover:text-red-600"
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
        </div>
      </div>
    </div>
  );
};

export default Analysis;
