import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  Upload, Users, UserCheck, Building2, FileUp, 
  Download, CheckCircle, AlertCircle, X, RefreshCw 
} from "lucide-react";
import REBrokerSidebar from "@/components/REBrokerSidebar";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function REBrokerUpload() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [brokerProfile, setBrokerProfile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);
  
  // Get active tab from URL or default to "agents"
  const activeTab = searchParams.get("tab") || "agents";

  useEffect(() => {
    document.title = "Kinntegraa | RE Broker - Upload";
    
    const userData = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    
    if (!userData || !token) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "re_broker") {
      navigate("/login");
      return;
    }
    
    setUser(parsedUser);
    fetchBrokerProfile(token);
  }, [navigate]);

  const fetchBrokerProfile = async (token) => {
    try {
      const response = await axios.get(`${API}/re-broker/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBrokerProfile(response.data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const setActiveTab = (tab) => {
    setSearchParams({ tab });
    setUploadResult(null);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
      toast.error("Please upload a CSV or Excel file");
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("file", file);

      let endpoint = "";
      switch (activeTab) {
        case "agents":
          endpoint = `${API}/re-broker/bulk-upload-agents`;
          break;
        case "private-investors":
          endpoint = `${API}/re-broker/bulk-upload-investors`;
          break;
        case "real-estate":
          endpoint = `${API}/re-broker/bulk-upload-properties`;
          break;
        default:
          throw new Error("Invalid upload type");
      }

      const response = await axios.post(endpoint, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        }
      });

      setUploadResult({
        success: true,
        message: response.data.message || "Upload successful",
        processed: response.data.processed || 0,
        failed: response.data.failed || 0,
        errors: response.data.errors || []
      });
      toast.success("Upload completed successfully!");
    } catch (error) {
      console.error("Upload error:", error);
      setUploadResult({
        success: false,
        message: error.response?.data?.detail || "Upload failed. Please check your file format.",
        errors: error.response?.data?.errors || []
      });
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const downloadTemplate = (type) => {
    // Generate sample template based on type
    let csvContent = "";
    let filename = "";
    
    switch (type) {
      case "agents":
        csvContent = "name,email,phone,area,status\nJohn Doe,john@example.com,+971501234567,Dubai Marina,active";
        filename = "agents_template.csv";
        break;
      case "private-investors":
        csvContent = "name,email,phone,id_number,nationality\nJane Smith,jane@example.com,+971502345678,ID123456,UAE";
        filename = "investors_template.csv";
        break;
      case "real-estate":
        csvContent = "building_name,unit_no,location,developer,total_price,total_area,expected_roi,status\nBurj Residence,A101,Downtown Dubai,Emaar,5000000,1500,8,available";
        filename = "properties_template.csv";
        break;
      default:
        return;
    }

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success(`Template downloaded: ${filename}`);
  };

  const tabConfig = {
    agents: {
      icon: Users,
      title: "Agents",
      description: "Bulk upload your real estate agents",
      color: "purple"
    },
    "private-investors": {
      icon: UserCheck,
      title: "Private Investors",
      description: "Bulk upload private investors for real estate",
      color: "blue"
    },
    "real-estate": {
      icon: Building2,
      title: "Real Estate",
      description: "Bulk upload real estate opportunities",
      color: "etihad-gold"
    }
  };

  const currentTab = tabConfig[activeTab] || tabConfig.agents;
  const TabIcon = currentTab.icon;

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <REBrokerSidebar user={user} brokerProfile={brokerProfile} />
      
      <div className="flex-1 md:ml-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="ml-12 md:ml-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Upload className="h-6 w-6 text-green-600" />
                Bulk Upload
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Upload data in bulk using CSV or Excel files
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b px-4 md:px-8">
          <div className="flex gap-1">
            {Object.entries(tabConfig).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === key
                      ? `border-${config.color}-500 text-${config.color}-600`
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  data-testid={`tab-${key}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {config.title}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          <div className="max-w-2xl mx-auto">
            {/* Upload Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="text-center mb-6">
                <div className={`w-16 h-16 bg-${currentTab.color}-100 rounded-full flex items-center justify-center mx-auto mb-4`}>
                  <TabIcon className={`h-8 w-8 text-${currentTab.color}-600`} />
                </div>
                <h2 className="text-lg font-semibold text-gray-800">{currentTab.title}</h2>
                <p className="text-sm text-gray-500 mt-1">{currentTab.description}</p>
              </div>

              {/* Upload Area */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  uploading ? "border-gray-300 bg-gray-50" : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".csv,.xlsx"
                  className="hidden"
                  disabled={uploading}
                  data-testid="file-input"
                />
                
                {uploading ? (
                  <div className="flex flex-col items-center">
                    <RefreshCw className="h-10 w-10 text-gray-400 animate-spin mb-3" />
                    <p className="text-gray-600">Processing your file...</p>
                  </div>
                ) : (
                  <>
                    <FileUp className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 mb-2">
                      Drag and drop your file here, or
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="browse-btn"
                    >
                      Browse Files
                    </Button>
                    <p className="text-xs text-gray-400 mt-3">
                      Supported formats: CSV, Excel (.xlsx)
                    </p>
                  </>
                )}
              </div>

              {/* Download Template */}
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <p className="text-sm text-gray-500">Need a template?</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadTemplate(activeTab)}
                  data-testid="download-template-btn"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>

              {/* Upload Result */}
              {uploadResult && (
                <div className={`mt-4 p-4 rounded-lg ${
                  uploadResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                }`}>
                  <div className="flex items-start gap-3">
                    {uploadResult.success ? (
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className={`font-medium ${uploadResult.success ? "text-green-800" : "text-red-800"}`}>
                        {uploadResult.message}
                      </p>
                      {uploadResult.success && (
                        <p className="text-sm text-green-600 mt-1">
                          Processed: {uploadResult.processed} | Failed: {uploadResult.failed}
                        </p>
                      )}
                      {uploadResult.errors?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm font-medium text-red-700">Errors:</p>
                          <ul className="text-sm text-red-600 list-disc list-inside mt-1">
                            {uploadResult.errors.slice(0, 5).map((err, idx) => (
                              <li key={idx}>{err}</li>
                            ))}
                            {uploadResult.errors.length > 5 && (
                              <li>...and {uploadResult.errors.length - 5} more errors</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setUploadResult(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-800 mb-3">Upload Instructions</h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
                  Download the template file for the correct format
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
                  Fill in the data following the template structure
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
                  Upload the completed file (CSV or Excel format)
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
                  Review the upload results and fix any errors if needed
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
