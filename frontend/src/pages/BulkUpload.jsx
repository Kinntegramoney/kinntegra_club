import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, Download, FileSpreadsheet, Users, Building2, 
  TrendingUp, CheckCircle2, XCircle, AlertCircle, ArrowLeft, History,
  Database, ExternalLink, RefreshCw, Calendar, FileText, Loader2
} from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function BulkUpload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || "sub-brokers";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);
  
  // Scheme Master state
  const [schemeMasterStatus, setSchemeMasterStatus] = useState(null);
  const [schemeMasterFile, setSchemeMasterFile] = useState(null);
  const [schemeUploading, setSchemeUploading] = useState(false);
  const [schemeProcessingStatus, setSchemeProcessingStatus] = useState('');
  const [schemeProcessingProgress, setSchemeProcessingProgress] = useState(0);
  const [loadingSchemeMaster, setLoadingSchemeMaster] = useState(false);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ["sub-brokers", "clients", "bonds", "real-estate", "historical-trades", "scheme-master"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);
  
  // Fetch scheme master status when tab is scheme-master
  useEffect(() => {
    if (activeTab === 'scheme-master') {
      fetchSchemeMasterStatus();
    }
  }, [activeTab]);

  const fetchSchemeMasterStatus = async () => {
    try {
      setLoadingSchemeMaster(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/analysis/scheme-master/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSchemeMasterStatus(response.data);
    } catch (error) {
      console.error('Error fetching scheme master status:', error);
    } finally {
      setLoadingSchemeMaster(false);
    }
  };

  const handleSchemeMasterUpload = async (e) => {
    e.preventDefault();
    
    if (!schemeMasterFile) {
      toast.error('Please select a scheme master file');
      return;
    }

    setSchemeUploading(true);
    setSchemeProcessingStatus('Uploading BSE Scheme Master...');
    setSchemeProcessingProgress(20);
    
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append('file', schemeMasterFile);

      setSchemeProcessingStatus('Processing scheme data...');
      setSchemeProcessingProgress(50);

      const response = await axios.post(`${API}/analysis/upload-scheme-master`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setSchemeProcessingProgress(90);

      setSchemeProcessingStatus('Scheme master uploaded successfully!');
      setSchemeProcessingProgress(100);
      
      setTimeout(() => {
        toast.success(`${response.data.schemes_added} new schemes added (${response.data.total_schemes_in_file} total in file)`);
        setSchemeMasterFile(null);
        setSchemeProcessingStatus('');
        setSchemeProcessingProgress(0);
        fetchSchemeMasterStatus();
      }, 500);
    } catch (error) {
      console.error('Error uploading scheme master:', error);
      setSchemeProcessingStatus('');
      setSchemeProcessingProgress(0);
      toast.error(error.response?.data?.detail || 'Error uploading file');
    } finally {
      setSchemeUploading(false);
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

  const tabs = [
    { id: "sub-brokers", label: "Sub Brokers", icon: Users, color: "indigo" },
    { id: "clients", label: "Clients", icon: Users, color: "purple" },
    { id: "bonds", label: "Bonds", icon: TrendingUp, color: "green" },
    { id: "real-estate", label: "Real Estate", icon: Building2, color: "orange" },
    { id: "historical-trades", label: "Historical Trades", icon: History, color: "amber" },
    { id: "scheme-master", label: "Scheme Master", icon: Database, color: "blue" }
  ];

  const downloadTemplate = async (type) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/bulk/template/${type}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}_template.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Template downloaded successfully!");
    } catch (error) {
      toast.error("Failed to download template");
    }
  };

  // Client upload type state
  const [clientUploadType, setClientUploadType] = useState('indian');
  
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error("Please upload an Excel file (.xlsx or .xls)");
      return;
    }

    setUploading(true);
    setResults(null);

    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append('file', file);

      // Determine the correct endpoint
      let uploadEndpoint = `${API}/bulk/${activeTab}`;
      if (activeTab === 'clients') {
        uploadEndpoint = `${API}/bulk/clients-${clientUploadType}`;
      }

      const response = await axios.post(uploadEndpoint, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setResults(response.data);
      
      if (response.data.success > 0) {
        toast.success(`Successfully uploaded ${response.data.success} records!`);
      }
      if (response.data.failed > 0) {
        toast.error(`${response.data.failed} records failed`);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Upload failed");
      setResults({ success: 0, failed: 1, errors: [error.message] });
    } finally {
      setUploading(false);
      e.target.value = ''; // Reset file input
    }
  };

  const getTabColor = (tabId) => {
    const colors = {
      "sub-brokers": { bg: "bg-indigo-600", light: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-200" },
      "clients": { bg: "bg-purple-600", light: "bg-purple-50", text: "text-purple-600", border: "border-purple-200" },
      "bonds": { bg: "bg-green-600", light: "bg-green-50", text: "text-green-600", border: "border-green-200" },
      "real-estate": { bg: "bg-orange-600", light: "bg-orange-50", text: "text-orange-600", border: "border-orange-200" },
      "historical-trades": { bg: "bg-amber-700", light: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
      "scheme-master": { bg: "bg-blue-600", light: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" }
    };
    return colors[tabId] || colors["sub-brokers"];
  };

  const currentColor = getTabColor(activeTab);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className={`${currentColor.bg} text-white px-8 py-6`}>
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/broker/opportunities")}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <FileSpreadsheet className="h-7 w-7" />
                Bulk Upload
              </h1>
              <p className="text-white/80 mt-1">Upload multiple records using Excel templates</p>
            </div>
          </div>
        </div>

        <div className="p-8">
          {/* Tabs */}
          <div className="flex gap-2 mb-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setResults(null); }}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === tab.id
                    ? `${getTabColor(tab.id).bg} text-white shadow-lg`
                    : 'bg-white text-gray-600 hover:bg-gray-100 border'
                }`}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Scheme Master Content */}
          {activeTab === "scheme-master" ? (
            <div className="space-y-6">
              {/* Progress Bar - Show when processing */}
              {schemeProcessingStatus && (
                <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm" data-testid="scheme-processing-status">
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                    <span className="text-gray-900 font-medium">{schemeProcessingStatus}</span>
                  </div>
                  <Progress value={schemeProcessingProgress} className="h-2" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-8">
                {/* Left: Current Status */}
                <div className={`${currentColor.light} rounded-xl border ${currentColor.border} p-6`}>
                  <h2 className={`text-lg font-semibold ${currentColor.text} mb-4 flex items-center gap-2`}>
                    <Database className="h-5 w-5" />
                    Current Status
                  </h2>
                  
                  {loadingSchemeMaster ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-lg p-4 text-center border">
                          <div className={`text-2xl font-bold ${schemeMasterStatus?.exists ? 'text-green-600' : 'text-yellow-600'}`}>
                            {schemeMasterStatus?.exists ? (
                              <CheckCircle2 className="h-8 w-8 mx-auto" />
                            ) : (
                              <Database className="h-8 w-8 mx-auto text-gray-400" />
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {schemeMasterStatus?.exists ? 'Available' : 'Not Uploaded'}
                          </p>
                        </div>
                        <div className="bg-white rounded-lg p-4 text-center border">
                          <p className="text-2xl font-bold text-blue-600">
                            {schemeMasterStatus?.total_schemes?.toLocaleString() || 0}
                          </p>
                          <p className="text-sm text-gray-600 mt-1">Total Schemes</p>
                        </div>
                      </div>
                      
                      <div className="bg-white rounded-lg p-4 border">
                        <div className="flex items-center justify-center gap-2 text-gray-700">
                          <Calendar className="h-4 w-4" />
                          <span className="font-medium">
                            {schemeMasterStatus?.last_upload ? formatDate(schemeMasterStatus.last_upload) : 'Never uploaded'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 text-center">Last Updated</p>
                      </div>
                      
                      {schemeMasterStatus?.last_filename && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 bg-white rounded-lg p-3 border">
                          <FileText className="h-4 w-4" />
                          <span>Last file: <strong>{schemeMasterStatus.last_filename}</strong></span>
                        </div>
                      )}
                      
                      <Button 
                        variant="outline"
                        onClick={fetchSchemeMasterStatus}
                        className="w-full"
                        data-testid="refresh-scheme-status-button"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh Status
                      </Button>
                    </div>
                  )}
                </div>

                {/* Right: Upload */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className={`text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2`}>
                    <Upload className={`h-5 w-5 ${currentColor.text}`} />
                    Upload Scheme Master
                  </h2>

                  {/* Download Instructions */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <h4 className="font-medium text-blue-900 mb-2">How to download:</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
                      <li>Visit the BSE StAR MF website</li>
                      <li>Download the Scheme Master file (SCHMSTRPHY.txt)</li>
                      <li>Upload the downloaded file below</li>
                    </ol>
                    <a 
                      href="https://www.bsestarmf.in/RptSchemeMaster.aspx" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open BSE StAR MF - Scheme Master
                    </a>
                  </div>

                  {/* Upload Form */}
                  <form onSubmit={handleSchemeMasterUpload} className="space-y-4">
                    <div>
                      <Label htmlFor="scheme-file" className="text-gray-700">
                        Scheme Master File (.txt)
                      </Label>
                      <Input
                        id="scheme-file"
                        type="file"
                        accept=".txt"
                        onChange={(e) => setSchemeMasterFile(e.target.files[0])}
                        className="mt-1"
                        data-testid="scheme-file-input"
                      />
                      {schemeMasterFile && (
                        <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" />
                          {schemeMasterFile.name} ({(schemeMasterFile.size / 1024 / 1024).toFixed(2)} MB)
                        </p>
                      )}
                    </div>
                    
                    <Button 
                      type="submit" 
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      disabled={schemeUploading || !schemeMasterFile}
                      data-testid="upload-scheme-button"
                    >
                      {schemeUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Scheme Master
                        </>
                      )}
                    </Button>
                  </form>

                  {/* Info Note */}
                  <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                    <strong>Note:</strong> New schemes will be added to the existing database. Duplicate ISINs will be skipped. 
                    Upload monthly for the latest NAV mapping data.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Regular Excel Upload Content */
            <>
              <div className="grid grid-cols-2 gap-8">
                {/* Left: Instructions & Download */}
                <div className={`${currentColor.light} rounded-xl border ${currentColor.border} p-6`}>
                  <h2 className={`text-lg font-semibold ${currentColor.text} mb-4 flex items-center gap-2`}>
                    <Download className="h-5 w-5" />
                    Step 1: Download Template
                  </h2>
                  
                  <div className="space-y-4">
                    <p className="text-gray-600">
                      Download the Excel template, fill in your data, and upload it back.
                    </p>
                    
                    <div className="bg-white rounded-lg p-4 border">
                      <h3 className="font-medium text-gray-800 mb-2">Template includes:</h3>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {activeTab === "sub-brokers" && (
                          <>
                            <li>• Name, PAN, Partner Code, Email, Mobile</li>
                            <li>• Password, PIN for login credentials</li>
                            <li>• Address details (optional)</li>
                            <li>• Sample row for reference</li>
                          </>
                        )}
                        {activeTab === "clients" && (
                          <>
                            <li>• <strong>Two templates available:</strong></li>
                            <li className="ml-4">🇮🇳 Indian Passport - PAN, Bonds, Real Estate</li>
                            <li className="ml-4">🌍 Foreign Passport - Passport No, Real Estate, GIFT City</li>
                            <li>• Bank details required for Bonds (Indian only)</li>
                            <li>• Passport validity required for Real Estate</li>
                            <li>• Emirates ID required for UAE residents</li>
                          </>
                        )}
                        {activeTab === "bonds" && (
                          <>
                            <li>• Bond Code, Name, Principal Amount</li>
                            <li>• Primary/Secondary IRR</li>
                            <li>• Start and Maturity Dates</li>
                            <li>• Auto-generates payment schedules</li>
                          </>
                        )}
                        {activeTab === "real-estate" && (
                          <>
                            <li>• Building, Developer, Unit Details</li>
                            <li>• Pricing: Unit Price, DLD, Admin Fees</li>
                            <li>• Separate sheet for Payment Schedule</li>
                            <li>• Default schedule if none provided</li>
                          </>
                        )}
                        {activeTab === "historical-trades" && (
                          <>
                            <li>• Deal ID (Bond Code) - must exist in system</li>
                            <li>• Investment Date, Investor Name</li>
                            <li>• Units purchased and Purchase Price</li>
                            <li>• Validates against system-calculated price</li>
                            <li>• Creates trade and generates cashflows</li>
                          </>
                        )}
                      </ul>
                    </div>

                    {activeTab === "clients" ? (
                      <div className="space-y-2">
                        <Button 
                          onClick={() => downloadTemplate('clients-indian')}
                          className="w-full bg-amber-600 hover:bg-amber-700"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          🇮🇳 Download Indian Passport Template
                        </Button>
                        <Button 
                          onClick={() => downloadTemplate('clients-foreign')}
                          className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          🌍 Download Foreign Passport Template
                        </Button>
                        <p className="text-xs text-gray-500 text-center mt-2">
                          Choose the template that matches your client&apos;s passport type
                        </p>
                      </div>
                    ) : (
                      <Button 
                        onClick={() => downloadTemplate(activeTab)}
                        className={`w-full ${currentColor.bg} hover:opacity-90`}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download {tabs.find(t => t.id === activeTab)?.label} Template
                      </Button>
                    )}
                  </div>
                </div>

                {/* Right: Upload */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className={`text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2`}>
                    <Upload className={`h-5 w-5 ${currentColor.text}`} />
                    Step 2: Upload Filled Template
                  </h2>

                  {/* Client passport type selector */}
                  {activeTab === "clients" && (
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                      <p className="text-sm font-medium text-gray-700 mb-3">Select passport type for this upload:</p>
                      <div className="flex gap-4">
                        <label className={`flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          clientUploadType === 'indian' 
                            ? 'border-amber-500 bg-amber-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input 
                            type="radio" 
                            name="clientType" 
                            value="indian" 
                            checked={clientUploadType === 'indian'}
                            onChange={(e) => setClientUploadType(e.target.value)}
                            className="sr-only"
                          />
                          <div className="flex items-center gap-2">
                            <span>🇮🇳</span>
                            <span className="font-medium">Indian Passport</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">PAN as Login ID</p>
                        </label>
                        <label className={`flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          clientUploadType === 'foreign' 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input 
                            type="radio" 
                            name="clientType" 
                            value="foreign" 
                            checked={clientUploadType === 'foreign'}
                            onChange={(e) => setClientUploadType(e.target.value)}
                            className="sr-only"
                          />
                          <div className="flex items-center gap-2">
                            <span>🌍</span>
                            <span className="font-medium">Foreign Passport</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Passport No as Login ID</p>
                        </label>
                      </div>
                    </div>
                  )}

                  <label className={`block border-2 border-dashed ${currentColor.border} rounded-xl p-8 text-center cursor-pointer hover:${currentColor.light} transition-colors`}>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                    {uploading ? (
                      <div className="animate-pulse">
                        <div className={`w-16 h-16 ${currentColor.light} rounded-full flex items-center justify-center mx-auto mb-4`}>
                          <FileSpreadsheet className={`h-8 w-8 ${currentColor.text}`} />
                        </div>
                        <p className={`font-medium ${currentColor.text}`}>Uploading...</p>
                        <p className="text-sm text-gray-500 mt-1">Please wait while we process your file</p>
                      </div>
                    ) : (
                      <>
                        <div className={`w-16 h-16 ${currentColor.light} rounded-full flex items-center justify-center mx-auto mb-4`}>
                          <Upload className={`h-8 w-8 ${currentColor.text}`} />
                        </div>
                        <p className="font-medium text-gray-800">Click to upload Excel file</p>
                        <p className="text-sm text-gray-500 mt-1">Supports .xlsx and .xls files</p>
                      </>
                    )}
                  </label>

                  {/* Results */}
                  {results && (
                    <div className="mt-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                            <span className="font-medium text-green-800">Success</span>
                          </div>
                          <p className="text-2xl font-bold text-green-700 mt-1">{results.success}</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-5 w-5 text-red-600" />
                            <span className="font-medium text-red-800">Failed</span>
                          </div>
                          <p className="text-2xl font-bold text-red-700 mt-1">{results.failed}</p>
                        </div>
                      </div>

                      {results.errors && results.errors.length > 0 && (
                        <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertCircle className="h-5 w-5 text-amber-600" />
                            <span className="font-medium text-amber-800">Errors</span>
                          </div>
                          <ul className="text-sm text-amber-700 space-y-1 max-h-40 overflow-y-auto">
                            {results.errors.map((error, idx) => (
                              <li key={idx}>• {error}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {results.created_bonds && results.created_bonds.length > 0 && (
                        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                          <p className="font-medium text-green-800 mb-2">Created Bonds:</p>
                          <div className="flex flex-wrap gap-2">
                            {results.created_bonds.map((bond, idx) => (
                              <Badge key={idx} className="bg-green-100 text-green-700">
                                {bond.code}: {bond.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {results.created_properties && results.created_properties.length > 0 && (
                        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                          <p className="font-medium text-orange-800 mb-2">Created Properties:</p>
                          <div className="flex flex-wrap gap-2">
                            {results.created_properties.map((prop, idx) => (
                              <Badge key={idx} className="bg-orange-100 text-orange-700">
                                {prop.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {results.created_trades && results.created_trades.length > 0 && (
                        <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                          <p className="font-medium text-amber-800 mb-2">Created Trades:</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {results.created_trades.map((trade, idx) => (
                              <div key={idx} className="bg-white rounded p-2 border border-amber-100 text-sm">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <span className="font-medium text-gray-800">{trade.client}</span>
                                    <span className="text-gray-500 mx-2">→</span>
                                    <span className="text-amber-700">{trade.bond}</span>
                                  </div>
                                  <Badge className="bg-amber-100 text-amber-700">{trade.units} units</Badge>
                                </div>
                                <div className="text-gray-500 mt-1">
                                  ₹{trade.amount?.toLocaleString()} on {trade.investment_date}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {results.validation_summary && (
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                          <p className="font-medium text-blue-800 mb-2">Validation Summary:</p>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Total Rows:</span>
                              <span className="ml-2 font-medium">{results.validation_summary.total_rows}</span>
                            </div>
                            <div>
                              <span className="text-green-600">Amount Matched:</span>
                              <span className="ml-2 font-medium text-green-700">{results.validation_summary.matched_amounts}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Tips */}
              <div className="mt-8 bg-blue-50 rounded-xl border border-blue-200 p-6">
                <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Tips for Successful Upload
                </h3>
                <div className="grid grid-cols-3 gap-4 text-sm text-blue-700">
                  <div>
                    <p className="font-medium">Data Validation</p>
                    <p>• Ensure all required fields are filled</p>
                    <p>• Check for duplicate entries (PAN, codes)</p>
                    {activeTab === "historical-trades" && (
                      <p>• Bond codes must exist in the system</p>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">Date Format</p>
                    <p>• Use YYYY-MM-DD format</p>
                    <p>• Or standard Excel date format</p>
                  </div>
                  <div>
                    <p className="font-medium">Limits</p>
                    <p>• Sub Brokers: Max 100 per upload</p>
                    <p>• Bonds: Max 50 per upload</p>
                    <p>• Real Estate: Max 30 per upload</p>
                    {activeTab === "historical-trades" && (
                      <p>• Purchase prices are validated against system calculations</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
