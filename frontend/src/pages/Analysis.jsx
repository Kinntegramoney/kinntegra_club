import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  Upload, 
  FileSpreadsheet,
  RefreshCw,
  FileText,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Clock,
  FolderOpen,
  User,
  UserPlus,
  Search,
  TrendingUp,
  TrendingDown,
  PieChart,
  BarChart3,
  Wallet,
  IndianRupee,
  Building2,
  Users,
  ChevronDown,
  ChevronUp,
  Eye
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const Analysis = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [schemeMasterStatus, setSchemeMasterStatus] = useState(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  
  // Client selection state
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [loadingClients, setLoadingClients] = useState(false);
  
  // Upload state
  const [casFile, setCasFile] = useState(null);
  const [casPassword, setCasPassword] = useState('');
  const [uploadingCAS, setUploadingCAS] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  
  // Dashboard state
  const [dashboardData, setDashboardData] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [showAllHoldings, setShowAllHoldings] = useState(false);

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
    fetchClients();
  }, []);

  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  });

  const fetchClients = async () => {
    try {
      setLoadingClients(true);
      const response = await fetch(`${API}/api/clients`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoadingClients(false);
    }
  };

  const fetchAnalyses = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/api/analysis`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setAnalyses(data);
        if (data.length > 0) {
          setCurrentStep(2);
        }
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
    
    if (!selectedClient) {
      toast.error('Please select a client first');
      return;
    }
    
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
      formData.append('client_id', selectedClient.id);

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
          toast.success(`CAS analyzed for ${selectedClient.name}: ${data.total_folios} folios, ${data.total_transactions} transactions`);
          setCasFile(null);
          setCasPassword('');
          setProcessingStatus('');
          setProcessingProgress(0);
          fetchAnalyses();
          setSelectedAnalysis(data);
          setCurrentStep(3);
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
        a.download = `GapSheet_${filename.replace('.pdf', '')}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
        setProcessingProgress(100);
        setTimeout(() => {
          setProcessingStatus('');
          setProcessingProgress(0);
          toast.success('Gap Sheet reports downloaded!');
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

  const fetchDashboard = async (analysisId) => {
    setLoadingDashboard(true);
    try {
      const response = await fetch(`${API}/api/analysis/${analysisId}/dashboard`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      } else {
        console.error('Failed to fetch dashboard');
        setDashboardData(null);
      }
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      setDashboardData(null);
    } finally {
      setLoadingDashboard(false);
    }
  };

  // Fetch dashboard when analysis is selected
  useEffect(() => {
    if (selectedAnalysis) {
      const id = selectedAnalysis.analysis_id || selectedAnalysis.id;
      if (id) {
        fetchDashboard(id);
      }
    } else {
      setDashboardData(null);
    }
  }, [selectedAnalysis]);

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
          setCurrentStep(1);
        }
      } else {
        toast.error('Failed to delete analysis');
      }
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Error deleting analysis');
    }
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

  // Filter clients based on search query
  const filteredClients = clients.filter(client => {
    if (!clientSearchQuery) return true;
    const query = clientSearchQuery.toLowerCase();
    return (
      client.name?.toLowerCase().includes(query) ||
      client.pan_number?.toLowerCase().includes(query) ||
      client.email?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Portfolio Analysis</h1>
              <p className="text-sm text-gray-500 mt-1">Generate Gap Sheet reports from CAS PDF</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { fetchAnalyses(); fetchSchemeMasterStatus(); fetchClients(); }}
              className="border-gray-300"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="p-6 max-w-5xl mx-auto">
          {/* Progress Bar - Show when processing */}
          {processingStatus && (
            <div className="mb-6 bg-white border border-amber-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                <span className="text-gray-700 font-medium">{processingStatus}</span>
              </div>
              <Progress value={processingProgress} className="h-2" />
            </div>
          )}

          {/* Step Progress Indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-between relative">
              {/* Progress Line */}
              <div className="absolute top-5 left-0 right-0 h-1 bg-gray-200 -z-10">
                <div 
                  className="h-full bg-amber-500 transition-all duration-500"
                  style={{ width: currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : '100%' }}
                />
              </div>
              
              {/* Step 1 */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                  currentStep >= 1 ? 'bg-amber-500' : 'bg-gray-300'
                }`}>
                  {currentStep > 1 ? <CheckCircle2 className="h-6 w-6" /> : '1'}
                </div>
                <span className="text-sm mt-2 font-medium text-gray-700">Select Client</span>
              </div>
              
              {/* Step 2 */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                  currentStep >= 2 ? 'bg-amber-500' : 'bg-gray-300'
                }`}>
                  {currentStep > 2 ? <CheckCircle2 className="h-6 w-6" /> : '2'}
                </div>
                <span className="text-sm mt-2 font-medium text-gray-700">Upload PDF</span>
              </div>
              
              {/* Step 3 */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                  currentStep >= 3 ? 'bg-amber-500' : 'bg-gray-300'
                }`}>
                  {currentStep > 3 ? <CheckCircle2 className="h-6 w-6" /> : '3'}
                </div>
                <span className="text-sm mt-2 font-medium text-gray-700">Download Report</span>
              </div>
            </div>
          </div>

          {/* Step 1: Select Client */}
          <Card className={`mb-6 border-2 transition-all ${currentStep === 1 ? 'border-amber-400 shadow-lg' : 'border-gray-200'}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  currentStep === 1 ? 'bg-amber-500 text-white' : selectedClient ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {selectedClient ? <CheckCircle2 className="h-5 w-5" /> : '1'}
                </div>
                <div>
                  <CardTitle className="text-lg">Select Client</CardTitle>
                  <CardDescription>Choose the client for this CAS analysis (required for billing)</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Selected Client Display */}
              {selectedClient && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">
                        {selectedClient.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">{selectedClient.name}</p>
                        <p className="text-sm text-gray-500">PAN: {selectedClient.pan_number}</p>
                        {selectedClient.linked_subbroker_name && (
                          <p className="text-xs text-blue-600">Sub-Broker: {selectedClient.linked_subbroker_name}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setSelectedClient(null); setCurrentStep(1); }}
                    >
                      Change
                    </Button>
                  </div>
                </div>
              )}

              {/* Client Search & Selection */}
              {!selectedClient && (
                <div className="space-y-4">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by client name, PAN, or email..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {/* Client List */}
                  {loadingClients ? (
                    <div className="text-center py-8 text-gray-500">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Loading clients...
                    </div>
                  ) : filteredClients.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                      <User className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 mb-4">
                        {clients.length === 0 
                          ? "No clients found. Please create a client first." 
                          : "No clients match your search."}
                      </p>
                      <Link to="/broker/admin/clients">
                        <Button variant="outline" className="gap-2">
                          <UserPlus className="h-4 w-4" />
                          Create New Client
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                      {filteredClients.map((client) => (
                        <div
                          key={client.id}
                          className="p-3 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between"
                          onClick={() => { setSelectedClient(client); setCurrentStep(2); }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-semibold text-sm">
                              {client.name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-800 text-sm">{client.name}</p>
                              <p className="text-xs text-gray-500">PAN: {client.pan_number}</p>
                            </div>
                          </div>
                          {client.linked_subbroker_name && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                              {client.linked_subbroker_name}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Create Client Link */}
                  {clients.length > 0 && (
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                      <span>Can't find the client?</span>
                      <Link to="/broker/admin/clients" className="text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1">
                        <UserPlus className="h-4 w-4" />
                        Create New Client
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* CAMS Instructions (collapsed when client selected) */}
              {selectedClient && (
                <div className="mt-4 bg-blue-50 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-blue-800 mb-2">How to get CAS from CAMS:</p>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">1</div>
                    <div>
                      <a 
                        href="https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                      >
                        Open CAMS Portal <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">2</div>
                    <p className="text-gray-700 text-sm">Select <span className="font-semibold">Detailed Statement</span> → <span className="font-semibold">Specific Period</span> (01/01/2000 to Today)</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">3</div>
                    <p className="text-gray-700 text-sm">Folio: <span className="font-semibold">With Zero Balance</span> | Password: <span className="font-mono bg-amber-100 px-1 rounded">kinntegra123</span></p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Upload CAS PDF */}
          <Card className={`mb-6 border-2 transition-all ${currentStep === 2 && selectedClient ? 'border-amber-400 shadow-lg' : 'border-gray-200'}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  currentStep === 2 && selectedClient ? 'bg-amber-500 text-white' : currentStep > 2 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {currentStep > 2 ? <CheckCircle2 className="h-5 w-5" /> : '2'}
                </div>
                <div>
                  <CardTitle className="text-lg">Upload CAS PDF</CardTitle>
                  <CardDescription>Upload the password-protected PDF from CAMS</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedClient ? (
                <div className="text-center py-6 text-gray-500">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p>Please select a client first to upload CAS</p>
                </div>
              ) : (
                <form onSubmit={handleCASUpload} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cas-file" className="text-gray-700 font-medium">CAS PDF File</Label>
                      <div className="mt-2">
                        <Input
                          id="cas-file"
                          type="file"
                          accept=".pdf"
                          onChange={(e) => setCasFile(e.target.files[0])}
                          className="bg-gray-50 border-gray-300"
                        />
                        {casFile && (
                          <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4" /> {casFile.name}
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="cas-password" className="text-gray-700 font-medium">PDF Password</Label>
                      <Input
                        id="cas-password"
                        type="password"
                        placeholder="Enter the password you set on CAMS"
                        value={casPassword}
                        onChange={(e) => setCasPassword(e.target.value)}
                        className="mt-2 bg-gray-50 border-gray-300"
                      />
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="bg-amber-500 hover:bg-amber-600 text-white"
                    disabled={uploadingCAS || !casFile || !casPassword}
                  >
                    {uploadingCAS ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Analyze CAS for {selectedClient.name}
                      </>
                    )}
                  </Button>
                </form>
              )}

              {/* Scheme Master Status */}
              {selectedClient && schemeMasterStatus?.exists ? (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-green-700 text-sm">Scheme Master loaded: {schemeMasterStatus.total_schemes?.toLocaleString()} schemes</span>
                </div>
              ) : selectedClient && user?.role === 'broker' && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <span className="text-amber-700 text-sm">Scheme Master not uploaded (optional for better NAV mapping)</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Download Report / Analysis Results */}
          <Card className={`mb-6 border-2 transition-all ${currentStep === 3 || selectedAnalysis ? 'border-green-400 shadow-lg' : 'border-gray-200'}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  currentStep >= 3 || selectedAnalysis ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {selectedAnalysis ? <CheckCircle2 className="h-5 w-5" /> : '3'}
                </div>
                <div>
                  <CardTitle className="text-lg">Download Gap Sheet Report</CardTitle>
                  <CardDescription>Your analysis results and downloadable reports</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {selectedAnalysis ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-8 w-8 text-green-600" />
                      <div>
                        <p className="font-semibold text-gray-800">{selectedAnalysis.filename}</p>
                        <p className="text-sm text-gray-500">
                          {selectedAnalysis.total_folios || 0} folios • {selectedAnalysis.total_transactions || 0} transactions
                        </p>
                        {selectedAnalysis.client_name && (
                          <p className="text-xs text-blue-600">Client: {selectedAnalysis.client_name}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleDownload(selectedAnalysis.analysis_id || selectedAnalysis.id, selectedAnalysis.filename)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Report
                    </Button>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    onClick={() => { setSelectedAnalysis(null); setSelectedClient(null); setCurrentStep(1); }}
                  >
                    Analyze Another CAS
                  </Button>
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500">
                  <FolderOpen className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p>Upload a CAS PDF to see analysis results here</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Previous Analyses */}
          {analyses.length > 0 && (
            <Card className="border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-gray-700">Previous Analyses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Requested By</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Client</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Sub-Broker</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">File Name</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 uppercase">Folios</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyses.map((analysis) => (
                        <tr 
                          key={analysis.id} 
                          className={`border-b hover:bg-gray-50 cursor-pointer transition-colors ${
                            (selectedAnalysis?.id === analysis.id || selectedAnalysis?.analysis_id === analysis.id)
                              ? 'bg-amber-50'
                              : ''
                          }`}
                          onClick={() => { setSelectedAnalysis(analysis); setCurrentStep(3); }}
                        >
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center">
                                <span className="text-amber-700 text-xs font-semibold">
                                  {analysis.user_name?.charAt(0).toUpperCase() || 'U'}
                                </span>
                              </div>
                              <span className="text-sm font-medium text-gray-800">{analysis.user_name || 'Unknown'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div>
                              <span className="text-sm text-gray-800">{analysis.client_name || '-'}</span>
                              {analysis.client_pan && (
                                <p className="text-xs text-gray-500 font-mono">{analysis.client_pan}</p>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-sm text-gray-600">
                              {analysis.sub_broker_name || '-'}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-gray-400" />
                              <span className="text-sm text-gray-800 font-medium">{analysis.filename}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="text-xs bg-gray-200 px-2 py-1 rounded text-gray-600">
                              {analysis.total_folios || 0}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="text-xs text-gray-500">{formatDate(analysis.created_at)}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleDownload(analysis.id, analysis.filename); }}
                                className="text-green-600 hover:text-green-700 hover:bg-green-50 h-8 px-2"
                                title="Download Report"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleDelete(analysis.id); }}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analysis;
