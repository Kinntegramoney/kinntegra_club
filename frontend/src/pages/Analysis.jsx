import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import Sidebar from '../components/Sidebar';
import PANRegistrationModal from '../components/PANRegistrationModal';
import { 
  FileUp, 
  Download, 
  Trash2, 
  Upload, 
  RefreshCw,
  FileText,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ExternalLink,
  User,
  UserPlus,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  FileDown,
  Link2,
  Copy,
  Check,
  Edit,
  Save,
  X,
  Mail
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Countries list for dropdown
const COUNTRIES = [
  "India", "United Arab Emirates", "United States", "United Kingdom", "Singapore",
  "Canada", "Australia", "Germany", "Oman", "Qatar", "Saudi Arabia", "Bahrain", "Kuwait"
];

const Analysis = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [schemeMasterStatus, setSchemeMasterStatus] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  
  // Upload state - each entry has {file, password}
  const [casEntries, setCasEntries] = useState([{ file: null, password: '' }]);
  const [uploadingCAS, setUploadingCAS] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  
  // Session state - after Step 1
  const [sessionId, setSessionId] = useState(null);
  const [panResults, setPanResults] = useState([]);
  const [editingPanData, setEditingPanData] = useState(null);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  
  // Report generation state
  const [generating, setGenerating] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generatedResults, setGeneratedResults] = useState(null);
  
  // Ref for auto-scrolling to Step 3
  const step3Ref = React.useRef(null);
  
  // Previous analyses visibility
  const [showPreviousAnalyses, setShowPreviousAnalyses] = useState(false);
  
  // Helper functions for managing CAS entries
  const addCasEntry = () => {
    setCasEntries([...casEntries, { file: null, password: '' }]);
  };
  
  const removeCasEntry = (index) => {
    if (casEntries.length > 1) {
      setCasEntries(casEntries.filter((_, i) => i !== index));
    }
  };
  
  const updateCasEntry = (index, field, value) => {
    const updated = [...casEntries];
    updated[index][field] = value;
    setCasEntries(updated);
  };

  useEffect(() => {
    document.title = "Kinntegraa | CAS Analysis";
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

  // Step 1: Upload CAS and extract PANs
  const handleCASUpload = async (e) => {
    e.preventDefault();
    
    const validEntries = casEntries.filter(entry => entry.file && entry.password);
    if (validEntries.length === 0) {
      toast.error('Please add at least one CAS PDF file with password');
      return;
    }
    
    const missingPassword = casEntries.some(entry => entry.file && !entry.password);
    if (missingPassword) {
      toast.error('Please enter password for all selected files');
      return;
    }

    setUploadingCAS(true);
    setProcessingStatus('Uploading CAS PDF(s)...');
    setProcessingProgress(10);
    
    try {
      const formData = new FormData();
      validEntries.forEach((entry) => {
        formData.append('files', entry.file);
        formData.append('passwords', entry.password);
      });

      setProcessingStatus(`Parsing ${validEntries.length} PDF file(s) and extracting PANs...`);
      setProcessingProgress(30);

      const response = await fetch(`${API}/api/analysis/upload-cas-v2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      setProcessingProgress(70);
      const data = await response.json();

      if (response.ok) {
        setProcessingStatus('PANs extracted successfully!');
        setProcessingProgress(100);
        
        setSessionId(data.session_id);
        setPanResults(data.pan_results || []);
        setCurrentStep(2);
        
        toast.success(`Found ${data.total_pans_found} PAN(s): ${data.existing_count} existing, ${data.new_count} new`);
        setCasEntries([{ file: null, password: '' }]);
        
        setTimeout(() => {
          setProcessingStatus('');
          setProcessingProgress(0);
        }, 500);
      } else {
        setProcessingStatus('');
        setProcessingProgress(0);
        toast.error(typeof data.detail === 'string' ? data.detail : 'Failed to analyze CAS file.');
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

  // Open registration modal for a PAN
  const openEditModal = (pan) => {
    const panData = panResults.find(p => p.pan === pan);
    setEditingPanData(panData);
    setShowRegistrationModal(true);
  };

  // Save PAN info from modal
  const handleSavePanInfo = async (pan, formData) => {
    try {
      const response = await fetch(`${API}/api/analysis/session/${sessionId}/pan/${pan}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        // Update local state
        setPanResults(prev => prev.map(p => 
          p.pan === pan ? { ...p, ...formData } : p
        ));
        toast.success('Investor details updated');
      } else {
        toast.error('Failed to update details');
        throw new Error('Failed to save');
      }
    } catch (error) {
      console.error('Error saving:', error);
      throw error;
    }
  };

  // Step 3: Generate Report
  const handleGenerateReport = async () => {
    if (!sessionId) return;
    
    setGenerating(true);
    setProcessingStatus('Creating investors and generating reports...');
    setProcessingProgress(20);
    
    try {
      const response = await fetch(`${API}/api/analysis/session/${sessionId}/generate`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      
      setProcessingProgress(80);
      const data = await response.json();
      
      if (response.ok) {
        setProcessingProgress(100);
        setReportGenerated(true);
        setGeneratedResults(data);
        setPanResults(data.pan_results || panResults);
        
        toast.success(`Report generated! ${data.clients_created} new investor(s) created.`);
        fetchAnalyses();
        
        setTimeout(() => {
          setProcessingStatus('');
          setProcessingProgress(0);
          // Auto-download after report is generated
          triggerDownload();
        }, 500);
      } else {
        toast.error(data.detail || 'Failed to generate report');
        setProcessingStatus('');
        setProcessingProgress(0);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Error generating report');
      setProcessingStatus('');
      setProcessingProgress(0);
    } finally {
      setGenerating(false);
    }
  };

  // Auto-download function
  const triggerDownload = async () => {
    if (!sessionId) return;
    
    setDownloading(true);
    setProcessingStatus('Preparing download...');
    setProcessingProgress(30);
    
    try {
      const response = await fetch(`${API}/api/analysis/session/${sessionId}/download`, {
        headers: getAuthHeaders()
      });
      
      setProcessingProgress(80);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CAS_Reports_${sessionId.substring(0, 8)}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
        setProcessingProgress(100);
        toast.success('Reports downloaded!');
        
        setTimeout(() => {
          setProcessingStatus('');
          setProcessingProgress(0);
        }, 500);
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.detail || 'Failed to download report');
        setProcessingStatus('');
        setProcessingProgress(0);
      }
    } catch (error) {
      console.error('Error downloading:', error);
      toast.error('Error downloading report');
      setProcessingStatus('');
      setProcessingProgress(0);
    } finally {
      setDownloading(false);
    }
  };

  // Step 4: Download Report
  const handleDownloadReport = async () => {
    if (!sessionId) return;
    
    setDownloading(true);
    setProcessingStatus('Generating ZIP file...');
    setProcessingProgress(30);
    
    try {
      const response = await fetch(`${API}/api/analysis/session/${sessionId}/download`, {
        headers: getAuthHeaders()
      });
      
      setProcessingProgress(80);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CAS_Reports_${sessionId.substring(0, 8)}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
        setProcessingProgress(100);
        toast.success('Reports downloaded!');
        
        setTimeout(() => {
          setProcessingStatus('');
          setProcessingProgress(0);
        }, 500);
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.detail || 'Failed to download report');
        setProcessingStatus('');
        setProcessingProgress(0);
      }
    } catch (error) {
      console.error('Error downloading:', error);
      toast.error('Error downloading report');
      setProcessingStatus('');
      setProcessingProgress(0);
    } finally {
      setDownloading(false);
    }
  };

  // Download old analysis
  const handleDownload = async (analysisId, filename) => {
    try {
      setProcessingStatus('Generating reports...');
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
          toast.success('Reports downloaded!');
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
    if (!window.confirm('Are you sure you want to delete this analysis?')) return;

    try {
      const response = await fetch(`${API}/api/analysis/${analysisId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        toast.success('Analysis deleted');
        fetchAnalyses();
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
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const resetToStep1 = () => {
    setCurrentStep(1);
    setSessionId(null);
    setPanResults([]);
    setReportGenerated(false);
    setGeneratedResults(null);
    setEditingPanData(null);
    setShowRegistrationModal(false);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">CAS Analysis</h1>
              <p className="text-sm text-gray-500 mt-1">Upload CAS PDF → Review PANs → Generate Reports</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { fetchAnalyses(); fetchSchemeMasterStatus(); }} className="border-gray-300">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="p-6 max-w-5xl mx-auto">
          {/* Progress Bar */}
          {processingStatus && (
            <div className="mb-6 bg-white border border-etihad-gold-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="h-5 w-5 animate-spin text-etihad-gold-500" />
                <span className="text-gray-700 font-medium">{processingStatus}</span>
              </div>
              <Progress value={processingProgress} className="h-2" />
            </div>
          )}

          {/* Step Progress Indicator - Simplified */}
          <div className="mb-6 flex items-center gap-4 text-sm text-gray-600">
            <span className={`flex items-center gap-2 ${currentStep >= 1 ? 'text-etihad-gold-600 font-medium' : ''}`}>
              {currentStep > 1 ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <span className="w-5 h-5 rounded-full bg-etihad-gold-500 text-white flex items-center justify-center text-xs">1</span>}
              Upload CAS
            </span>
            <span className="text-gray-300">→</span>
            <span className={`flex items-center gap-2 ${currentStep >= 2 ? 'text-etihad-gold-600 font-medium' : ''}`}>
              {currentStep > 2 ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <span className={`w-5 h-5 rounded-full ${currentStep >= 2 ? 'bg-etihad-gold-500' : 'bg-gray-300'} text-white flex items-center justify-center text-xs`}>2</span>}
              Review PANs
            </span>
            <span className="text-gray-300">→</span>
            <span className={`flex items-center gap-2 ${currentStep >= 3 ? 'text-etihad-gold-600 font-medium' : ''}`}>
              {reportGenerated ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <span className={`w-5 h-5 rounded-full ${currentStep >= 3 ? 'bg-etihad-gold-500' : 'bg-gray-300'} text-white flex items-center justify-center text-xs`}>3</span>}
              Generate & Download
            </span>
          </div>

          {/* Step 1: Upload CAS PDF - Always visible */}
          <Card className={`mb-6 border-2 ${currentStep === 1 ? 'border-etihad-gold-400' : 'border-gray-200'} shadow-lg`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${currentStep > 1 ? 'bg-green-500' : 'bg-etihad-gold-500'} text-white`}>
                    {currentStep > 1 ? <CheckCircle2 className="h-5 w-5" /> : '1'}
                  </div>
                  <div>
                    <CardTitle className="text-lg">Upload CAS PDF</CardTitle>
                    <CardDescription>Upload password-protected CAS PDF(s) from CAMS</CardDescription>
                  </div>
                </div>
                {currentStep > 1 && (
                  <Button variant="outline" size="sm" onClick={resetToStep1}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Upload New
                  </Button>
                )}
              </div>
            </CardHeader>
            {currentStep === 1 && (
            <CardContent>
              {/* CAMS Instructions */}
              <div className="mb-6 bg-blue-50 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-blue-800 mb-2">How to get CAS from CAMS:</p>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">1</div>
                  <a href="https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1">
                    Open CAMS Portal <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">2</div>
                  <p className="text-gray-700 text-sm">Select <span className="font-semibold">Detailed Statement</span> → <span className="font-semibold">Specific Period</span></p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0">3</div>
                  <p className="text-gray-700 text-sm">Folio: <span className="font-semibold">With Zero Balance</span> | Password: <span className="font-mono bg-etihad-gold-100 px-1 rounded">kinntegra123</span></p>
                </div>
              </div>

              <form onSubmit={handleCASUpload} className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-700 font-medium">CAS PDF Files</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addCasEntry} className="text-blue-600 border-blue-300 hover:bg-blue-50">
                      <FileUp className="h-4 w-4 mr-1" />
                      Add Another CAS
                    </Button>
                  </div>
                  
                  {casEntries.map((entry, index) => (
                    <div key={index} className="flex gap-3 items-start p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-gray-500 mb-1 block">PDF File {casEntries.length > 1 ? `#${index + 1}` : ''}</Label>
                          <Input type="file" accept=".pdf" onChange={(e) => updateCasEntry(index, 'file', e.target.files[0])} className="bg-white border-gray-300 text-sm" data-testid={`cas-file-${index}`} />
                          {entry.file && (
                            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> {entry.file.name}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500 mb-1 block">Password</Label>
                          <Input type="password" placeholder="PDF password" value={entry.password} onChange={(e) => updateCasEntry(index, 'password', e.target.value)} className="bg-white border-gray-300 text-sm" data-testid={`cas-password-${index}`} />
                        </div>
                      </div>
                      {casEntries.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeCasEntry(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0 mt-5">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                
                <Button type="submit" className="bg-etihad-gold-500 hover:bg-etihad-gold-600 text-white w-full" disabled={uploadingCAS || !casEntries.some(e => e.file && e.password)} data-testid="upload-cas-btn">
                  {uploadingCAS ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" />Upload & Extract PANs</>
                  )}
                </Button>
              </form>

              {schemeMasterStatus?.exists && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-green-700 text-sm">Scheme Master loaded: {schemeMasterStatus.total_schemes?.toLocaleString()} schemes</span>
                </div>
              )}
            </CardContent>
            )}
          </Card>

          {/* Step 2: Review PANs and Generate Report */}
          {currentStep >= 2 && (
            <Card className={`mb-6 border-2 ${currentStep === 2 ? 'border-etihad-gold-400' : 'border-gray-200'} shadow-lg`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${currentStep > 2 ? 'bg-green-500' : 'bg-etihad-gold-500'} text-white`}>
                      {currentStep > 2 ? <CheckCircle2 className="h-5 w-5" /> : '2'}
                    </div>
                    <div>
                      <CardTitle className="text-lg">Review PANs - {panResults.length} Found</CardTitle>
                      <CardDescription>{currentStep > 2 ? 'PAN details verified' : 'Edit investor details before generating report'}</CardDescription>
                    </div>
                  </div>
                  {currentStep === 2 && (
                    <Button variant="outline" size="sm" onClick={resetToStep1}>
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Start Over
                    </Button>
                  )}
                </div>
              </CardHeader>
              {currentStep === 2 && (
              <CardContent>
                {/* PAN Table - Simplified */}
                <div className="border rounded-lg overflow-hidden mb-6">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">PAN</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Name</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Sub-broker</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {panResults.map((pan, idx) => {
                        // Check if required fields are filled for new PANs
                        const isComplete = pan.status === 'existing' || pan.status === 'created' || 
                          (pan.name && pan.email && pan.mobile && pan.country_of_residency);
                        
                        return (
                        <tr key={pan.pan} className={`border-b ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-gray-800">{pan.pan}</span>
                              {/* Show tick if required fields are complete */}
                              {pan.status === 'new' && isComplete && (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{pan.name || '-'}</td>
                          <td className="px-4 py-3 text-gray-600 text-sm">
                            {pan.status === 'existing' ? (pan.linked_subbroker_name || 'Direct') : '-'}
                          </td>
                          <td className="px-4 py-3">
                            {pan.status === 'existing' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                                <Link2 className="h-3 w-3" /> Existing
                              </span>
                            ) : pan.status === 'created' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                                <CheckCircle2 className="h-3 w-3" /> Created
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                                isComplete 
                                  ? 'text-green-700 bg-green-100' 
                                  : 'text-orange-700 bg-orange-100'
                              }`}>
                                {isComplete ? (
                                  <><CheckCircle2 className="h-3 w-3" /> Ready</>
                                ) : (
                                  <><UserPlus className="h-3 w-3" /> Incomplete</>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {/* Only show Edit for new PANs before report is generated */}
                            {pan.status === 'new' && !reportGenerated && (
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => openEditModal(pan.pan)} 
                                className={`h-7 px-3 ${
                                  isComplete 
                                    ? 'text-gray-600 border-gray-300 hover:bg-gray-50' 
                                    : 'text-blue-600 border-blue-300 hover:bg-blue-50'
                                }`}
                              >
                                <Edit className="h-4 w-4 mr-1" />
                                {isComplete ? 'Edit' : 'Fill Details'}
                              </Button>
                            )}
                            {/* Show View Dashboard for created/existing with analysis */}
                            {pan.analysis_id && (
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => navigate(`/analysis/dashboard/${pan.analysis_id}`)} 
                                className="h-7 px-2 text-blue-600 hover:bg-blue-50"
                              >
                                <LayoutDashboard className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            )}
                            {/* No action for existing accounts */}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Proceed to Step 3 Button */}
                {!reportGenerated && (
                  <div className="flex justify-end">
                    <Button 
                      onClick={() => {
                        setCurrentStep(3);
                        // Scroll to Step 3 after a brief delay to allow render
                        setTimeout(() => {
                          step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }}
                      disabled={!panResults.every(p => p.status === 'existing' || (p.name && p.email && p.mobile && p.country_of_residency))}
                      className="bg-etihad-gold-500 hover:bg-etihad-gold-600 text-white"
                    >
                      Proceed to Generate Report
                    </Button>
                  </div>
                )}
              </CardContent>
              )}
            </Card>
          )}

          {/* Step 3: Generate Report & Download */}
          {currentStep >= 3 && (
            <Card ref={step3Ref} className={`mb-6 border-2 ${reportGenerated ? 'border-green-400' : 'border-etihad-gold-400'} shadow-lg`}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${reportGenerated ? 'bg-green-500' : 'bg-etihad-gold-500'} text-white`}>
                    {reportGenerated ? <CheckCircle2 className="h-5 w-5" /> : '3'}
                  </div>
                  <div>
                    <CardTitle className="text-lg">Generate Report & Download</CardTitle>
                    <CardDescription>
                      {reportGenerated 
                        ? 'Report generated! Click download to get the ZIP file.'
                        : 'Create investors and generate analysis reports'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Show setup link info after generation */}
                {reportGenerated && generatedResults && panResults.filter(p => p.setup_info).length > 0 && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Setup Links Sent to New Investors
                    </h4>
                    <p className="text-sm text-blue-700 mb-4">
                      New investors will receive an email with a link to set up their password and PIN. Their User ID is their PAN number.
                    </p>
                    <div className="space-y-2">
                      {panResults.filter(p => p.setup_info).map(pan => (
                        <div key={pan.pan} className="bg-white p-3 rounded border border-blue-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-mono font-semibold">{pan.pan}</span>
                              <span className="text-gray-600 ml-2">({pan.name})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {pan.setup_info.email_sent ? (
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Email sent to {pan.setup_info.email_sent_to}
                                </span>
                              ) : (
                                <span className="text-xs text-orange-600 flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" /> Email pending
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 text-sm text-gray-600">
                            <span className="font-medium">User ID:</span> <span className="font-mono">{pan.setup_info.login_id}</span> (PAN)
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-4">
                  {!reportGenerated ? (
                    <Button 
                      onClick={handleGenerateReport}
                      disabled={generating}
                      className="flex-1 bg-etihad-gold-500 hover:bg-etihad-gold-600 text-white"
                      data-testid="generate-report-btn"
                    >
                      {generating ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating Reports...</>
                      ) : (
                        <><FileText className="h-4 w-4 mr-2" />Generate Reports</>
                      )}
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleDownloadReport}
                      disabled={downloading}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      data-testid="download-report-btn"
                    >
                      {downloading ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Downloading...</>
                      ) : (
                        <><Download className="h-4 w-4 mr-2" />Download</>
                      )}
                    </Button>
                  )}
                </div>
                
                {reportGenerated && (
                  <p className="text-xs text-gray-500 mt-3 text-center">
                    ZIP contains individual folders for each PAN and a consolidated report folder
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Previous Analyses */}
          {analyses.length > 0 && (
            <Card className="border-gray-200">
              <CardHeader className="pb-3 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setShowPreviousAnalyses(!showPreviousAnalyses)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg text-gray-700">Previous Analyses</CardTitle>
                    <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{analyses.length}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    {showPreviousAnalyses ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
                  </Button>
                </div>
              </CardHeader>
              {showPreviousAnalyses && (
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
                          <tr key={analysis.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/analysis/dashboard/${analysis.id}`)}>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-etihad-gold-100 flex items-center justify-center">
                                  <span className="text-etihad-gold-700 text-sm font-semibold">{analysis.client_name?.charAt(0).toUpperCase() || 'C'}</span>
                                </div>
                                <div>
                                  <span className="text-sm font-medium text-gray-800">{analysis.client_name || '-'}</span>
                                  {analysis.client_pan && <p className="text-xs text-gray-500 font-mono">{analysis.client_pan}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-gray-400" />
                                <span className="text-sm text-gray-800 truncate max-w-[250px]">{analysis.filename}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center text-sm text-gray-600">{formatDate(analysis.created_at).split(',')[0]}</td>
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/analysis/dashboard/${analysis.id}`); }} className="text-blue-600 hover:bg-blue-50 h-8 px-2">
                                  <LayoutDashboard className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDownload(analysis.id, analysis.filename); }} className="text-green-600 hover:bg-green-50 h-8 px-2">
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(analysis.id); }} className="text-red-500 hover:bg-red-50 h-8 px-2">
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
              )}
            </Card>
          )}
        </div>
      </div>
      
      {/* PAN Registration Modal */}
      <PANRegistrationModal
        isOpen={showRegistrationModal}
        onClose={() => {
          setShowRegistrationModal(false);
          setEditingPanData(null);
        }}
        panData={editingPanData}
        onSave={handleSavePanInfo}
        sessionId={sessionId}
      />
    </div>
  );
};

export default Analysis;
