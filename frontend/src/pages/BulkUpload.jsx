import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, Download, FileSpreadsheet, Users, Building2, 
  TrendingUp, CheckCircle2, XCircle, AlertCircle, ArrowLeft
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

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ["sub-brokers", "clients", "bonds", "real-estate"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const tabs = [
    { id: "sub-brokers", label: "Sub Brokers", icon: Users, color: "indigo" },
    { id: "clients", label: "Clients", icon: Users, color: "purple" },
    { id: "bonds", label: "Bonds", icon: TrendingUp, color: "green" },
    { id: "real-estate", label: "Real Estate", icon: Building2, color: "orange" }
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

      const response = await axios.post(`${API}/bulk/${activeTab}`, formData, {
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
      "real-estate": { bg: "bg-orange-600", light: "bg-orange-50", text: "text-orange-600", border: "border-orange-200" }
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
              onClick={() => navigate(-1)}
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
                        <li>• Name, PAN, Email, Mobile</li>
                        <li>• Password, PIN for login credentials</li>
                        <li>• Linked Sub-Broker Code (optional)</li>
                        <li>• Address details (optional)</li>
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
                  </ul>
                </div>

                <Button 
                  onClick={() => downloadTemplate(activeTab)}
                  className={`w-full ${currentColor.bg} hover:opacity-90`}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download {tabs.find(t => t.id === activeTab)?.label} Template
                </Button>
              </div>
            </div>

            {/* Right: Upload */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className={`text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2`}>
                <Upload className={`h-5 w-5 ${currentColor.text}`} />
                Step 2: Upload Filled Template
              </h2>

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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
