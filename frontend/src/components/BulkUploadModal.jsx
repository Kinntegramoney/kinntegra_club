import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, Download, CheckCircle, XCircle, AlertCircle, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function BulkUploadModal({ onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
        toast.error("Please select an Excel file (.xlsx or .xls)");
        return;
      }
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      if (!droppedFile.name.endsWith('.xlsx') && !droppedFile.name.endsWith('.xls')) {
        toast.error("Please select an Excel file (.xlsx or .xls)");
        return;
      }
      setFile(droppedFile);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    setUploading(true);
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("file", file);

      const response = await axios.post(`${API}/clients/bulk-upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        }
      });

      setResult(response.data);
      
      if (response.data.successful > 0) {
        toast.success(`Successfully created ${response.data.successful} clients`);
        onSuccess();
      }
      
      if (response.data.failed > 0) {
        toast.warning(`${response.data.failed} rows failed to import`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error.response?.data?.detail || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/clients/bulk-upload/template`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'client_upload_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Template downloaded");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download template");
    }
  };

  const resetUpload = () => {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Bulk Upload Clients</h2>
              <p className="text-sm text-gray-500">Import clients from Excel file</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            data-testid="close-modal-btn"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!result ? (
            <>
              {/* Download Template */}
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-blue-800 font-medium">Need the template?</p>
                    <p className="text-sm text-blue-600 mt-1">
                      Download our Excel template with the correct column format for bulk upload.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadTemplate}
                      className="mt-3 text-blue-700 border-blue-300 hover:bg-blue-100"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Template
                    </Button>
                  </div>
                </div>
              </div>

              {/* File Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  file 
                    ? 'border-green-300 bg-green-50' 
                    : 'border-gray-300 hover:border-amber-400 hover:bg-amber-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="file-input"
                />
                
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                      <FileSpreadsheet className="h-8 w-8 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{file.name}</p>
                      <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        resetUpload();
                      }}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                      <Upload className="h-8 w-8 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">Drop your Excel file here</p>
                      <p className="text-sm text-gray-500">or click to browse</p>
                    </div>
                    <p className="text-xs text-gray-400">Supports .xlsx and .xls files</p>
                  </div>
                )}
              </div>

              {/* Expected Columns Info */}
              <div className="mt-6">
                <p className="text-sm font-medium text-gray-700 mb-2">Expected columns:</p>
                <div className="flex flex-wrap gap-2">
                  {['Name', 'Pan Number', 'Contact Number', 'Email Address', 'Partner Code', 'City', 'State', 'Pincode', 'Bank Account Number', 'IFSC'].map((col) => (
                    <span key={col} className={`px-2 py-1 text-xs rounded ${col === 'Partner Code' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {col}
                    </span>
                  ))}
                  <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded">+ more...</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  <span className="text-blue-600">Partner Code</span> is optional - if provided, clients will be auto-linked to the corresponding sub-broker.
                </p>
              </div>
            </>
          ) : (
            /* Results View */
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-800">{result.total_rows}</p>
                  <p className="text-sm text-gray-500">Total Rows</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{result.successful}</p>
                  <p className="text-sm text-green-600">Successful</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{result.failed}</p>
                  <p className="text-sm text-red-600">Failed</p>
                </div>
              </div>

              {/* Success Message */}
              {result.successful > 0 && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Successfully created {result.successful} clients
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      Client portal credentials: Password = Last 4 chars of PAN + "1234", PIN = "1234"
                    </p>
                  </div>
                </div>
              )}

              {/* Errors List */}
              {result.errors.length > 0 && (
                <div className="border border-red-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="font-medium text-red-800">Errors ({result.errors.length})</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {result.errors.slice(0, 20).map((err, idx) => (
                      <div key={idx} className="px-4 py-2 border-b border-gray-100 last:border-0">
                        <p className="text-sm">
                          <span className="text-gray-500">Row {err.row}:</span>{' '}
                          <span className="text-red-600">{err.error}</span>
                        </p>
                      </div>
                    ))}
                    {result.errors.length > 20 && (
                      <div className="px-4 py-2 text-sm text-gray-500">
                        ... and {result.errors.length - 20} more errors
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Created Clients Preview */}
              {result.created_clients.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <span className="font-medium text-gray-700">Created Clients (showing first 10)</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {result.created_clients.slice(0, 10).map((client, idx) => (
                      <div key={idx} className="px-4 py-2 border-b border-gray-100 last:border-0 flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-gray-800">{client.name}</span>
                          {client.linked_subbroker && (
                            <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">
                              → {client.linked_subbroker}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 font-mono">{client.pan}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Another */}
              <Button
                variant="outline"
                onClick={resetUpload}
                className="w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Upload Another File
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="bg-amber-700 hover:bg-amber-800"
              data-testid="upload-btn"
            >
              {uploading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload & Import
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
