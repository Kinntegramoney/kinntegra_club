import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FileText, Download, Trash2, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import RealEstateBulkPanel from "./RealEstateBulkPanel";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Panel for one of the three Real-Estate upload categories. Uploads happen via
 * the 2-step bulk flow (RealEstateBulkPanel). This component then lists every
 * row currently in the category's dedicated Mongo collection and lets the user
 * download or delete each one.
 */
export default function RealEstateUploadPanel({
  category,
  title,
  description,
  accent = "orange",
}) {
  const [uploads, setUploads] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleDownload = async (u) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/real-estate-uploads/${u.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      });
      const blob = new Blob([res.data], {
        type: res.headers["content-type"] || "application/octet-stream",
      });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = u.original_filename || `${u.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) {
      let detail = err?.response?.data;
      if (detail instanceof Blob) {
        try { detail = JSON.parse(await detail.text())?.detail; } catch { detail = null; }
      } else if (typeof detail === "object") {
        detail = detail?.detail;
      }
      toast.error(detail || "Failed to download file");
    }
  };

  const fmtAED = (n) =>
    n == null || isNaN(n) ? "—" : `AED ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 })}`;

  const fetchUploads = async () => {
    try {
      setLoadingList(true);
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/real-estate-uploads`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { category },
      });
      setUploads(res.data?.rows || []);
    } catch (e) {
      setUploads([]);
    } finally {
      setLoadingList(false);
    }
  };
  useEffect(() => { fetchUploads(); /* eslint-disable-next-line */ }, [category, refreshKey]);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this uploaded file?")) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/real-estate-uploads/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Deleted");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6" data-testid={`${category}-panel`}>
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
      </div>

      {/* Step-based bulk upload (Excel data + PDF attach) */}
      <RealEstateBulkPanel
        category={category}
        accent={accent}
        onIngested={() => setRefreshKey((k) => k + 1)}
      />

      {/* Uploaded files table */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700">Uploaded Files</h4>
          <Button variant="outline" size="sm" onClick={fetchUploads}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loadingList ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {loadingList ? (
          <p className="text-center text-gray-400 text-sm py-6">Loading…</p>
        ) : uploads.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-6">No files uploaded yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">#</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Deal ID</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Investor</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Milestone</th>
                  {category === "real-estate-invoices" && (
                    <>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Invoice #</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Amount Due</th>
                    </>
                  )}
                  {category === "investor-payment-details" && (
                    <>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Transfer Date</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">AED Amount</th>
                    </>
                  )}
                  {category === "investor-payment-receipts" && (
                    <>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Receipt #</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Payment Amount</th>
                    </>
                  )}
                  <th className="text-left px-3 py-2 font-medium text-gray-600">File</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Uploaded</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u, idx) => (
                  <tr key={u.id} className="border-b hover:bg-gray-50" data-testid={`${category}-row-${idx}`}>
                    <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                    <td className="px-3 py-2 text-gray-800 whitespace-nowrap">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                        {u.opportunity_deal_id || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{u.investor_name || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {u.milestone_date ? format(new Date(u.milestone_date), "dd-MMM-yyyy") : '-'}
                      {u.milestone_description && <span className="text-gray-500"> — {u.milestone_description}</span>}
                    </td>
                    {category === "real-estate-invoices" && (
                      <>
                        <td className="px-3 py-2 text-gray-700">{u.invoice_number || '-'}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmtAED(u.amount_due)}</td>
                      </>
                    )}
                    {category === "investor-payment-details" && (
                      <>
                        <td className="px-3 py-2 text-gray-700">
                          {u.transfer_date ? format(new Date(u.transfer_date), "dd-MMM-yyyy") : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmtAED(u.aed_amount)}</td>
                      </>
                    )}
                    {category === "investor-payment-receipts" && (
                      <>
                        <td className="px-3 py-2 text-gray-700">{u.receipt_number || '-'}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmtAED(u.payment_amount)}</td>
                      </>
                    )}
                    <td className="px-3 py-2">
                      {u.pdf_uploaded ? (
                        <div className="flex items-center gap-2 text-gray-800">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span className="truncate max-w-[180px]" title={u.original_filename}>
                            {u.original_filename}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-amber-600">No PDF attached</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {u.uploaded_at ? format(new Date(u.uploaded_at), "dd-MMM-yy HH:mm") : '-'}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {u.pdf_uploaded && (
                        <button
                          onClick={() => handleDownload(u)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs mr-3"
                        >
                          <Download className="h-3 w-3" /> Download
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 text-xs"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
