import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  FileUp, Download, Trash2, Upload, FileSpreadsheet, RefreshCw,
  FileText, CheckCircle2, Loader2, AlertCircle, Clock, Search, Users
} from "lucide-react";
import { logUserActivity } from "@/utils/activityLogger";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SubBrokerAnalysis() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [loadingClients, setLoadingClients] = useState(false);
  
  // Upload state
  const [casFile, setCasFile] = useState(null);
  const [casPassword, setCasPassword] = useState("");
  const [uploadingCAS, setUploadingCAS] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [processingProgress, setProcessingProgress] = useState(0);

  useEffect(() => {
    document.title = "Kinntegraa | CAS Analysis";
    logUserActivity('analysis', { extra: { action: 'view' } });
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "sub_broker") {
      if (parsedUser.role === "broker") {
        navigate("/analysis");
      } else {
        navigate("/client/opportunities");
      }
      return;
    }
    
    setUser(parsedUser);
    fetchClients();
    fetchAnalyses();
  }, [navigate]);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
  });

  const fetchClients = async () => {
    setLoadingClients(true);
    try {
      const response = await axios.get(`${API}/sub-broker/clients`, getAuthHeaders());
      setClients(response.data.filter(c => c.approval_status === "approved" || !c.approval_status));
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setLoadingClients(false);
    }
  };

  const fetchAnalyses = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/analysis/list`, getAuthHeaders());
      setAnalyses(response.data);
    } catch (error) {
      console.error("Error fetching analyses:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCASUpload = async () => {
    if (!casFile) {
      toast.error("Please select a CAS PDF file");
      return;
    }
    if (!selectedClient) {
      toast.error("Please select a client first");
      return;
    }

    setUploadingCAS(true);
    setProcessingStatus("Uploading CAS file...");
    setProcessingProgress(10);

    try {
      const formData = new FormData();
      formData.append("file", casFile);
      formData.append("client_id", selectedClient.id);
      if (casPassword) {
        formData.append("password", casPassword);
      }

      setProcessingProgress(30);
      setProcessingStatus("Processing CAS data...");

      const response = await axios.post(`${API}/analysis/upload-cas`, formData, {
        ...getAuthHeaders(),
        headers: {
          ...getAuthHeaders().headers,
          "Content-Type": "multipart/form-data"
        }
      });

      setProcessingProgress(100);
      setProcessingStatus("Analysis complete!");
      
      toast.success("CAS analysis completed successfully!");
      
      // Reset form
      setCasFile(null);
      setCasPassword("");
      setSelectedClient(null);
      
      // Refresh analyses list
      fetchAnalyses();
      
    } catch (error) {
      console.error("CAS upload error:", error);
      toast.error(error.response?.data?.detail || "Failed to process CAS file");
    } finally {
      setUploadingCAS(false);
      setTimeout(() => {
        setProcessingStatus("");
        setProcessingProgress(0);
      }, 2000);
    }
  };

  const handleDownloadGapSheet = async (analysisId) => {
    try {
      const response = await axios.get(
        `${API}/analysis/${analysisId}/gap-sheet`,
        {
          ...getAuthHeaders(),
          responseType: "blob"
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `gap_sheet_${analysisId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Gap sheet downloaded successfully");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download gap sheet");
    }
  };

  const handleDeleteAnalysis = async (analysisId) => {
    if (!window.confirm("Delete this analysis? This action cannot be undone.")) return;
    
    try {
      await axios.delete(`${API}/analysis/${analysisId}`, getAuthHeaders());
      toast.success("Analysis deleted");
      fetchAnalyses();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete analysis");
    }
  };

  const filteredClients = clients.filter(client => {
    if (!clientSearchQuery) return true;
    const query = clientSearchQuery.toLowerCase();
    return (
      client.name?.toLowerCase().includes(query) ||
      client.pan?.toLowerCase().includes(query)
    );
  });

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-6">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">CAS Analysis</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload and analyze Consolidated Account Statements for your clients
          </p>
        </div>

        <div className="p-4 md:p-8 space-y-6">
          {/* Upload Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Upload className="h-5 w-5 text-etihad-gold-600" />
              Upload CAS
            </h2>
            
            {/* Step 1: Select Client */}
            <div className="mb-6">
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                Step 1: Select Client
              </Label>
              
              {selectedClient ? (
                <div className="flex items-center justify-between p-3 bg-etihad-gold-50 border border-etihad-gold-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-etihad-gold-500 flex items-center justify-center text-white font-bold">
                      {selectedClient.name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "CL"}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{selectedClient.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{selectedClient.pan}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedClient(null)}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search clients by name or PAN..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  {loadingClients ? (
                    <div className="text-center py-4">
                      <RefreshCw className="h-5 w-5 animate-spin text-gray-400 mx-auto" />
                    </div>
                  ) : filteredClients.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      {clients.length === 0 ? "No approved clients found" : "No clients match your search"}
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                      {filteredClients.slice(0, 10).map((client) => (
                        <button
                          key={client.id}
                          onClick={() => {
                            setSelectedClient(client);
                            setClientSearchQuery("");
                          }}
                          className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left"
                        >
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-etihad-maroon-600 font-medium text-sm">
                            {client.name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "CL"}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800 text-sm">{client.name}</p>
                            <p className="text-xs text-gray-500 font-mono">{client.pan}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Upload File */}
            <div className="mb-6">
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                Step 2: Upload CAS PDF
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setCasFile(e.target.files?.[0] || null)}
                  className="flex-1"
                />
                {casFile && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {casFile.name}
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Password (Optional) */}
            <div className="mb-6">
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                Step 3: PDF Password (if protected)
              </Label>
              <Input
                type="password"
                placeholder="Enter password if the PDF is protected"
                value={casPassword}
                onChange={(e) => setCasPassword(e.target.value)}
                className="max-w-md"
              />
            </div>

            {/* Progress */}
            {processingStatus && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">{processingStatus}</span>
                  <span className="text-sm font-medium text-etihad-gold-600">{processingProgress}%</span>
                </div>
                <Progress value={processingProgress} className="h-2" />
              </div>
            )}

            {/* Upload Button */}
            <Button
              onClick={handleCASUpload}
              disabled={!casFile || !selectedClient || uploadingCAS}
              className="bg-etihad-gold-700 hover:bg-etihad-gold-800"
            >
              {uploadingCAS ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4 mr-2" />
                  Upload & Analyze
                </>
              )}
            </Button>
          </div>

          {/* Previous Analyses */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-etihad-gold-600" />
                Previous Analyses
              </h2>
              <Button variant="outline" size="sm" onClick={fetchAnalyses}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
            
            {loading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600 mx-auto mb-2" />
                <p className="text-gray-500">Loading analyses...</p>
              </div>
            ) : analyses.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No analyses found</p>
                <p className="text-sm text-gray-400">Upload a CAS file to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {analyses.map((analysis) => (
                  <div
                    key={analysis.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                        <FileSpreadsheet className="h-5 w-5 text-etihad-maroon-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">
                          {analysis.client_name || "Analysis"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          {new Date(analysis.created_at).toLocaleDateString()}
                          {analysis.total_schemes && (
                            <span className="ml-2 px-2 py-0.5 bg-white rounded text-gray-600">
                              {analysis.total_schemes} schemes
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadGapSheet(analysis.id)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Gap Sheet
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteAnalysis(analysis.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
