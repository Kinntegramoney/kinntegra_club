import { useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, XCircle,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Bulk upload for Real Estate Investors. Mirrors the NCD / MFD-RIA template
 * card pattern: colored Step-1 card on the left, white dashed drop-zone on
 * the right. Uploaded rows land in `Real_Estate_Master.investors` and are
 * mirrored to the `Real_Estate_Investor` collection server-side.
 */
export default function RealEstateInvestorBulkUpload() {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState(null);

  const handleDownloadTemplate = async () => {
    try {
      setDownloading(true);
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/bulk-upload/real-estate-investors/template`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "REAL_ESTATE_INVESTOR_Template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Failed to download template");
    } finally {
      setDownloading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      setResult(null);
      const token = localStorage.getItem("token");
      const form = new FormData();
      form.append("file", file);
      const res = await axios.post(`${API}/bulk-upload/real-estate-investors`, form, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      setResult(res.data);
      if (res.data.success > 0) toast.success(`${res.data.success} investor(s) added`);
      if (res.data.errors > 0) toast.error(`${res.data.errors} row(s) failed`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Bulk upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="grid grid-cols-2 gap-8" data-testid="re-investors-bulk-panel">
      {/* Step 1 — Download Template */}
      <div className="bg-teal-50 rounded-xl border border-teal-200 p-6">
        <h2 className="text-lg font-semibold text-teal-600 mb-4 flex items-center gap-2">
          <Download className="h-5 w-5" />
          Step 1: Download Template
        </h2>

        <div className="space-y-4">
          <p className="text-gray-600">
            Download the Excel template, fill one row per investor allocation,
            and upload it back in Step 2.
          </p>

          <div className="bg-white rounded-lg p-4 border">
            <h3 className="font-medium text-gray-800 mb-2">Template includes:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Building Name, Unit No</li>
              <li>• Client PAN (resolved to an existing investor)</li>
              <li>• Share Percentage, Amount, Units</li>
              <li>• Invested At (YYYY-MM-DD)</li>
            </ul>
          </div>

          <Button
            onClick={handleDownloadTemplate}
            disabled={downloading}
            className="w-full bg-teal-600 hover:bg-teal-700"
            data-testid="re-investors-bulk-template-btn"
          >
            {downloading
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparing…</>
              : <><Download className="h-4 w-4 mr-2" /> Download Real Estate Investors Template</>}
          </Button>
        </div>
      </div>

      {/* Step 2 — Upload Filled Template */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Upload className="h-5 w-5 text-teal-600" />
          Step 2: Upload Filled Template
        </h2>

        <div
          className="border-2 border-dashed border-teal-300 rounded-xl p-8 text-center hover:border-teal-500 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleUpload}
            className="hidden"
            data-testid="re-investors-bulk-file-input"
          />
          {uploading
            ? <Loader2 className="h-12 w-12 mx-auto text-teal-400 mb-4 animate-spin" />
            : <Upload className="h-12 w-12 mx-auto text-teal-400 mb-4" />}
          <p className="text-gray-600 font-medium">
            {uploading ? "Uploading…" : "Click to upload Excel file"}
          </p>
          <p className="text-sm text-gray-500 mt-1">Supports .xlsx and .xls files</p>
        </div>

        <div className="mt-6 bg-teal-50 border border-teal-200 rounded-lg p-3 text-sm text-teal-800">
          <strong>Note:</strong> Rows are added to{" "}
          <code className="text-xs bg-white px-1 rounded">Real_Estate_Master.investors</code>{" "}
          and mirrored to <code className="text-xs bg-white px-1 rounded">Real_Estate_Investor</code>.
        </div>

        {/* Summary + row-level results */}
        {result && (
          <div className="mt-6 border-t pt-5">
            <div className="flex items-center gap-4 mb-3">
              <div className="flex items-center gap-1.5 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600">Processed:</span>
                <span className="font-semibold">{result.processed}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-gray-600">Success:</span>
                <span className="font-semibold text-green-700">{result.success}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <XCircle className="h-4 w-4 text-red-600" />
                <span className="text-gray-600">Errors:</span>
                <span className="font-semibold text-red-700">{result.errors}</span>
              </div>
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto rounded border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Row</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Building</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Unit</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">PAN</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.rows || []).map((r, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-500">{r.row}</td>
                      <td className="px-3 py-2 text-gray-800">{r.building_name || '-'}</td>
                      <td className="px-3 py-2 text-gray-800">{r.unit_no || '-'}</td>
                      <td className="px-3 py-2 font-mono text-gray-600">{r.client_pan || '-'}</td>
                      <td className="px-3 py-2">
                        {r.status === 'ok'
                          ? <span className="inline-block bg-green-100 text-green-700 rounded px-2 py-0.5">OK</span>
                          : r.status === 'error'
                            ? <span className="inline-block bg-red-100 text-red-700 rounded px-2 py-0.5">Error</span>
                            : <span className="inline-block bg-gray-100 text-gray-600 rounded px-2 py-0.5">{r.status}</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {r.error ? r.error : (r.status === 'ok' ? `Share ${r.share_percentage}%, Amount ${r.amount?.toLocaleString?.()}` : '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
