import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { 
  Upload, Download, FileSpreadsheet, Users, 
  CheckCircle2, XCircle, AlertCircle, ArrowLeft
} from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function SubBrokerBulkUpload() {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);
  const [user, setUser] = useState(null);
  const [clientUploadType, setClientUploadType] = useState('indian');

  useEffect(() => {
    document.title = "Kinntegraa | Bulk Upload - Private Investors";
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "sub_broker") {
      navigate("/broker/dashboard");
      return;
    }
    setUser(parsedUser);
  }, [navigate]);

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

      // Use sub-broker specific endpoint based on passport type
      const endpoint = clientUploadType === 'indian' 
        ? `${API}/sub-broker/bulk/private-investors-indian`
        : `${API}/sub-broker/bulk/private-investors-foreign`;
      
      const response = await axios.post(endpoint, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      // Map response fields to match expected format
      const created = response.data.created || response.data.success_count || 0;
      const errorsArr = response.data.errors || [];
      
      setResults({
        success_count: created,
        error_count: errorsArr.length,
        errors: errorsArr.map((err, idx) => ({
          row: idx + 2,
          message: typeof err === 'string' ? err : err.message || err
        }))
      });
      
      if (created > 0) {
        toast.success(`${created} private investors uploaded for broker approval!`);
      }
      if (errorsArr.length > 0) {
        toast.error(`${errorsArr.length} records failed`);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Upload failed");
      setResults({ success_count: 0, error_count: 1, errors: [{ row: 0, message: error.response?.data?.detail || error.message }] });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const currentColor = {
    bg: "bg-purple-600",
    light: "bg-purple-50",
    text: "text-purple-600",
    border: "border-purple-200"
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className={`${currentColor.bg} text-white px-8 py-6`}>
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/sub-broker/clients")}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <FileSpreadsheet className="h-7 w-7" />
                Bulk Upload - Private Investors
              </h1>
              <p className="text-white/80 mt-1">Upload multiple private investors. All entries will be sent for broker approval.</p>
            </div>
          </div>
        </div>

        <div className="p-8">
          {/* Info Banner */}
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-900">How it works</h3>
                <ul className="mt-2 text-sm text-blue-800 space-y-1">
                  <li>1. Download the Excel template below</li>
                  <li>2. Fill in the private investor details</li>
                  <li>3. Upload the completed Excel file</li>
                  <li>4. All entries will be sent to the broker for approval</li>
                  <li>5. After broker approval, investors will receive login credentials via email</li>
                </ul>
              </div>
            </div>
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
                    <li>• <strong>Two templates available:</strong></li>
                    <li className="ml-4">🇮🇳 Indian Passport - PAN, Bonds, Real Estate</li>
                    <li className="ml-4">🌍 Foreign Passport - Passport No, Real Estate, GIFT City</li>
                    <li>• Name, Email, Mobile (required)</li>
                    <li>• PAN/Passport Number (required)</li>
                    <li>• City, State, Pincode (optional)</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <Button 
                    onClick={() => downloadTemplate('clients-indian')}
                    className="w-full bg-etihad-gold-600 hover:bg-etihad-gold-700"
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
                    Choose the template that matches your investor&apos;s passport type
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Upload */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className={`text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2`}>
                <Upload className={`h-5 w-5 ${currentColor.text}`} />
                Step 2: Upload Filled Template
              </h2>

              {/* Passport type selector */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                <p className="text-sm font-medium text-gray-700 mb-3">Select passport type for this upload:</p>
                <div className="flex gap-4">
                  <label className={`flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    clientUploadType === 'indian' 
                      ? 'border-etihad-gold-500 bg-etihad-gold-50' 
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
                      <p className="text-2xl font-bold text-green-700 mt-1">{results.success_count || 0}</p>
                      <p className="text-xs text-green-600 mt-1">Sent for broker approval</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-600" />
                        <span className="font-medium text-red-800">Failed</span>
                      </div>
                      <p className="text-2xl font-bold text-red-700 mt-1">{results.error_count || 0}</p>
                    </div>
                  </div>

                  {results.errors && results.errors.length > 0 && (
                    <div className="bg-etihad-gold-50 rounded-lg p-4 border border-etihad-gold-200">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="h-5 w-5 text-etihad-gold-600" />
                        <span className="font-medium text-etihad-gold-800">Errors</span>
                      </div>
                      <ul className="text-sm text-etihad-gold-700 space-y-1 max-h-40 overflow-y-auto">
                        {results.errors.map((error, idx) => (
                          <li key={idx}>• Row {error.row}: {error.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {results.success_count > 0 && (
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-blue-600" />
                        <span className="text-sm text-blue-800">
                          {results.success_count} private investors have been uploaded and are pending broker approval.
                          They will appear in your "Private Investors" list once approved.
                        </span>
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
                <p className="font-medium">Required Fields</p>
                <p>• Name, Email, Mobile</p>
                <p>• PAN (Indian) or Passport No (Foreign)</p>
              </div>
              <div>
                <p className="font-medium">Format Requirements</p>
                <p>• PAN: 10 characters (e.g., ABCDE1234F)</p>
                <p>• Email: Valid email format</p>
              </div>
              <div>
                <p className="font-medium">Approval Process</p>
                <p>• All uploads require broker approval</p>
                <p>• Credentials sent after approval</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
