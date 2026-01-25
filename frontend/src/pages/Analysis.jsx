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
  Eye,
  LayoutDashboard
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
            <div className="mb-6 bg-white border border-etihad-gold-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="h-5 w-5 animate-spin text-etihad-gold-500" />
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
                  className="h-full bg-etihad-gold-500 transition-all duration-500"
                  style={{ width: currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : '100%' }}
                />
              </div>
              
              {/* Step 1 */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                  currentStep >= 1 ? 'bg-etihad-gold-500' : 'bg-gray-300'
                }`}>
                  {currentStep > 1 ? <CheckCircle2 className="h-6 w-6" /> : '1'}
                </div>
                <span className="text-sm mt-2 font-medium text-gray-700">Select Client</span>
              </div>
              
              {/* Step 2 */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                  currentStep >= 2 ? 'bg-etihad-gold-500' : 'bg-gray-300'
                }`}>
                  {currentStep > 2 ? <CheckCircle2 className="h-6 w-6" /> : '2'}
                </div>
                <span className="text-sm mt-2 font-medium text-gray-700">Upload PDF</span>
              </div>
              
              {/* Step 3 */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                  currentStep >= 3 ? 'bg-etihad-gold-500' : 'bg-gray-300'
                }`}>
                  {currentStep > 3 ? <CheckCircle2 className="h-6 w-6" /> : '3'}
                </div>
                <span className="text-sm mt-2 font-medium text-gray-700">Download Report</span>
              </div>
            </div>
          </div>

          {/* Step 1: Select Client */}
          <Card className={`mb-6 border-2 transition-all ${currentStep === 1 ? 'border-etihad-gold-400 shadow-lg' : 'border-gray-200'}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  currentStep === 1 ? 'bg-etihad-gold-500 text-white' : selectedClient ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
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
                            <div className="w-9 h-9 rounded-full bg-etihad-gold-100 text-etihad-gold-700 flex items-center justify-center font-semibold text-sm">
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
                      <Link to="/broker/admin/clients" className="text-etihad-gold-600 hover:text-etihad-gold-700 font-medium flex items-center gap-1">
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
                    <p className="text-gray-700 text-sm">Folio: <span className="font-semibold">With Zero Balance</span> | Password: <span className="font-mono bg-etihad-gold-100 px-1 rounded">kinntegra123</span></p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Upload CAS PDF */}
          <Card className={`mb-6 border-2 transition-all ${currentStep === 2 && selectedClient ? 'border-etihad-gold-400 shadow-lg' : 'border-gray-200'}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  currentStep === 2 && selectedClient ? 'bg-etihad-gold-500 text-white' : currentStep > 2 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
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
                    className="bg-etihad-gold-500 hover:bg-etihad-gold-600 text-white"
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
                <div className="mt-4 p-3 bg-etihad-gold-50 border border-etihad-gold-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-etihad-gold-600" />
                    <span className="text-etihad-gold-700 text-sm">Scheme Master not uploaded (optional for better NAV mapping)</span>
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
                  <CardTitle className="text-lg">Analysis Dashboard & Report</CardTitle>
                  <CardDescription>Your analysis results, insights, and downloadable reports</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {selectedAnalysis ? (
                <div className="space-y-6">
                  {/* Download Section */}
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
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleDownload(selectedAnalysis.analysis_id || selectedAnalysis.id, selectedAnalysis.filename)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Report
                      </Button>
                    </div>
                  </div>
                  
                  {/* Dashboard Section */}
                  {loadingDashboard ? (
                    <div className="text-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-etihad-gold-500 mb-2" />
                      <p className="text-gray-500">Loading dashboard...</p>
                    </div>
                  ) : dashboardData ? (
                    <div className="space-y-6">
                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                          <div className="flex items-center gap-2 mb-2">
                            <Wallet className="h-5 w-5 text-blue-600" />
                            <span className="text-xs font-medium text-blue-600 uppercase">Total Investment</span>
                          </div>
                          <p className="text-xl font-bold text-blue-900">
                            ₹{(dashboardData.summary?.total_investment || 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}
                          </p>
                        </div>
                        
                        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="h-5 w-5 text-emerald-600" />
                            <span className="text-xs font-medium text-emerald-600 uppercase">Current Value</span>
                          </div>
                          <p className="text-xl font-bold text-emerald-900">
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
                          <p className={`text-xl font-bold ${dashboardData.summary?.total_gains >= 0 ? 'text-green-900' : 'text-red-900'}`}>
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
                          <p className="text-xl font-bold text-purple-900">
                            {dashboardData.summary?.active_schemes || 0}
                          </p>
                          <p className="text-sm text-purple-600">
                            {dashboardData.summary?.total_folios || 0} folios
                          </p>
                        </div>
                      </div>
                      
                      {/* Holdings by Type */}
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
                        
                        {/* Top Advisors */}
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
                  ) : (
                    <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p>Dashboard data not available</p>
                    </div>
                  )}
                  
                  <Button 
                    variant="outline" 
                    onClick={() => { setSelectedAnalysis(null); setSelectedClient(null); setCurrentStep(1); setDashboardData(null); }}
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
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Client</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">File Name</th>
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
                              ? 'bg-etihad-gold-50'
                              : ''
                          }`}
                          onClick={() => { setSelectedAnalysis(analysis); setCurrentStep(3); }}
                        >
                          <td className="py-3 px-3">
                            <div className="group relative">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-etihad-gold-100 flex items-center justify-center">
                                  <span className="text-etihad-gold-700 text-sm font-semibold">
                                    {analysis.client_name?.charAt(0).toUpperCase() || 'C'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-sm font-medium text-gray-800 cursor-help">{analysis.client_name || '-'}</span>
                                  {analysis.client_pan && (
                                    <p className="text-xs text-gray-500 font-mono">{analysis.client_pan}</p>
                                  )}
                                </div>
                              </div>
                              
                              {/* Hover tooltip for Requested By and Sub-Broker */}
                              <div className="absolute left-0 top-full mt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[200px]">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                                      <span className="text-blue-700 text-xs font-semibold">
                                        {analysis.user_name?.charAt(0).toUpperCase() || 'U'}
                                      </span>
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-500">Requested By</p>
                                      <p className="text-sm font-medium text-gray-800">{analysis.user_name || 'Unknown'}</p>
                                    </div>
                                  </div>
                                  {analysis.sub_broker_name && (
                                    <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                                      <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                                        <span className="text-purple-700 text-xs font-semibold">
                                          {analysis.sub_broker_name?.charAt(0).toUpperCase() || 'S'}
                                        </span>
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-500">Sub-Broker</p>
                                        <p className="text-sm font-medium text-gray-800">{analysis.sub_broker_name}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-gray-400" />
                              <span className="text-sm text-gray-800 font-medium truncate max-w-[300px]" title={analysis.filename}>
                                {analysis.filename}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div>
                              <span className="text-sm text-gray-700 block">{formatDate(analysis.created_at).split(',')[0]}</span>
                              <span className="text-xs text-gray-500">{formatDate(analysis.created_at).split(',')[1]}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  window.open(`/analysis/dashboard/${analysis.id}`, '_blank');
                                }}
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 px-2"
                                title="View Dashboard"
                              >
                                <LayoutDashboard className="h-4 w-4" />
                              </Button>
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
