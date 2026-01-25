import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  Database, 
  Upload, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2,
  Calendar,
  FileText,
  Loader2
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const AdminSchemeMaster = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [schemeMasterStatus, setSchemeMasterStatus] = useState(null);
  const [schemeMasterFile, setSchemeMasterFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    fetchSchemeMasterStatus();
  }, []);

  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  });

  const fetchSchemeMasterStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/api/analysis/scheme-master/status`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setSchemeMasterStatus(data);
      }
    } catch (error) {
      console.error('Error fetching scheme master status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!schemeMasterFile) {
      toast.error('Please select a scheme master file');
      return;
    }

    setUploading(true);
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
        setProcessingStatus('Scheme master uploaded successfully!');
        setProcessingProgress(100);
        
        setTimeout(() => {
          toast.success(`${data.schemes_added} new schemes added (${data.total_schemes_in_file} total in file)`);
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
      setUploading(false);
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

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <main className="flex-1 overflow-auto p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Scheme Master Management</h1>
            <p className="text-gray-600 mt-1">
              Upload and manage BSE Scheme Master file for mutual fund NAV mapping
            </p>
          </div>

          {/* Progress Bar - Show when processing */}
          {processingStatus && (
            <div className="mb-6 bg-white border rounded-lg p-4 shadow-sm" data-testid="processing-status">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <span className="text-gray-900 font-medium">{processingStatus}</span>
              </div>
              <Progress value={processingProgress} className="h-2" />
            </div>
          )}

          <div className="grid gap-6">
            {/* Current Status Card */}
            <Card data-testid="scheme-master-status-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-blue-600" />
                  Current Status
                </CardTitle>
                <CardDescription>
                  Scheme master database information
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gray-50 rounded-lg p-4 text-center">
                        <div className={`text-2xl font-bold ${schemeMasterStatus?.exists ? 'text-green-600' : 'text-etihad-gold-600'}`}>
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
                      <div className="bg-gray-50 rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-blue-600">
                          {schemeMasterStatus?.total_schemes?.toLocaleString() || 0}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">Total Schemes</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-4 text-center col-span-2">
                        <div className="flex items-center justify-center gap-2 text-gray-700">
                          <Calendar className="h-4 w-4" />
                          <span className="font-medium">
                            {schemeMasterStatus?.last_upload ? formatDate(schemeMasterStatus.last_upload) : 'Never uploaded'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">Last Updated</p>
                      </div>
                    </div>
                    
                    {schemeMasterStatus?.last_filename && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                        <FileText className="h-4 w-4" />
                        <span>Last file: <strong>{schemeMasterStatus.last_filename}</strong></span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upload Card */}
            <Card data-testid="scheme-master-upload-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-green-600" />
                  Upload Scheme Master
                </CardTitle>
                <CardDescription>
                  Download the latest scheme master from BSE and upload it here
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Download Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
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
                    className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open BSE StAR MF - Scheme Master
                  </a>
                </div>

                {/* Upload Form */}
                <form onSubmit={handleUpload} className="space-y-4">
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
                  
                  <div className="flex gap-3">
                    <Button 
                      type="submit" 
                      className="bg-green-600 hover:bg-green-700"
                      disabled={uploading || !schemeMasterFile}
                      data-testid="upload-scheme-button"
                    >
                      {uploading ? (
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
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={fetchSchemeMasterStatus}
                      data-testid="refresh-status-button"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Status
                    </Button>
                  </div>
                </form>

                {/* Info Note */}
                <div className="bg-etihad-gold-50 border border-etihad-gold-200 rounded-lg p-3 text-sm text-etihad-gold-800">
                  <strong>Note:</strong> New schemes will be added to the existing database. Duplicate ISINs will be skipped. 
                  Upload monthly for the latest NAV mapping data.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminSchemeMaster;
