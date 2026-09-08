import { useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ACCENT = {
  orange: {
    bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-600",
    dash: "border-orange-300 hover:border-orange-500", dashIcon: "text-orange-400",
    btn: "bg-orange-600 hover:bg-orange-700",
    note: "bg-orange-50 border-orange-200 text-orange-800",
  },
  blue: {
    bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-600",
    dash: "border-blue-300 hover:border-blue-500", dashIcon: "text-blue-400",
    btn: "bg-blue-600 hover:bg-blue-700",
    note: "bg-blue-50 border-blue-200 text-blue-800",
  },
  teal: {
    bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-600",
    dash: "border-teal-300 hover:border-teal-500", dashIcon: "text-teal-400",
    btn: "bg-teal-600 hover:bg-teal-700",
    note: "bg-teal-50 border-teal-200 text-teal-800",
  },
};

const CATEGORY_COPY = {
  "real-estate-invoices": {
    title: "Download Real Estate Invoices Template",
    bullets: [
      "Deal ID, PAN, Milestone Date",
      "Invoice Number / Invoice Date / Due Date",
      "Amount Due (AED), Notes",
      "PDF Filename (for Step 3 matching)",
    ],
    convention: "<DealID>_<PAN>_<InvoiceNumber>.pdf",
    note: "Creates one invoice row per line. Attach PDFs in Step 3 using the filename convention above.",
  },
  "investor-payment-details": {
    title: "Download Investor Payment Details Template",
    bullets: [
      "Deal ID, PAN, Milestone Date",
      "Transfer Date, Currency (AED/INR/USD/EUR/GBP)",
      "Home Currency Amount, AED Amount",
      "Notes, PDF Filename",
    ],
    convention: "<DealID>_<PAN>_<TransferDate>.pdf",
    note: "Records one investor payment per line. SWIFT copies attach in Step 3.",
  },
  "investor-payment-receipts": {
    title: "Download Investor Payment Receipts Template",
    bullets: [
      "Deal ID, PAN, Milestone Date",
      "Receipt Number / Receipt Date",
      "Payment Amount (AED), Paid On",
      "Notes, PDF Filename",
    ],
    convention: "<DealID>_<PAN>_<ReceiptNumber>.pdf",
    note: "Creates one developer receipt row per line. Attach receipt PDFs in Step 3.",
  },
};

/**
 * Bulk uploader for one of: real-estate-invoices, investor-payment-details,
 * investor-payment-receipts. Laid out to match the NCD / MFD-RIA template
 * cards (colored Step-1 card on the left, white drop-zone card on the right).
 */
export default function RealEstateBulkPanel({ category, accent = "orange", onIngested }) {
  const fileRef = useRef(null);
  const pdfRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [ingestResult, setIngestResult] = useState(null);
  const [attachResult, setAttachResult] = useState(null);

  const theme = ACCENT[accent] || ACCENT.orange;
  const copy = CATEGORY_COPY[category];

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/bulk/template/${category}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${category}_template.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not download template");
    }
  };

  const handleUploadExcel = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setBusy(true);
      setIngestResult(null);
      const token = localStorage.getItem("token");
      const fd = new FormData();
      fd.append("file", f);
      const res = await axios.post(`${API}/bulk/${category}`, fd, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      setIngestResult(res.data);
      if (res.data.success > 0) toast.success(`Step 2 done — ${res.data.success} row(s) created`);
      if (res.data.failed > 0) toast.error(`${res.data.failed} row(s) failed`);
      if (res.data.success > 0 && onIngested) onIngested();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleAttachPdfs = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    try {
      setPdfBusy(true);
      setAttachResult(null);
      const token = localStorage.getItem("token");
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await axios.post(`${API}/bulk/${category}/attach-pdfs`, fd, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      setAttachResult(res.data);
      if (res.data.matched > 0) toast.success(`Step 3 done — ${res.data.matched} file(s) attached`);
      if ((res.data.errors || []).length) toast.error(`${res.data.errors.length} unmatched`);
      if (res.data.matched > 0 && onIngested) onIngested();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Attach failed");
    } finally {
      setPdfBusy(false);
      if (pdfRef.current) pdfRef.current.value = "";
    }
  };

  return (
    <div className="grid grid-cols-2 gap-8 mb-6" data-testid={`${category}-bulk-panel`}>
      {/* Step 1 — Download Template */}
      <div className={`${theme.bg} rounded-xl border ${theme.border} p-6`}>
        <h2 className={`text-lg font-semibold ${theme.text} mb-4 flex items-center gap-2`}>
          <Download className="h-5 w-5" />
          Step 1: Download Template
        </h2>

        <div className="space-y-4">
          <p className="text-gray-600">
            Download the Excel template, fill in your rows and upload it in Step 2.
          </p>

          <div className="bg-white rounded-lg p-4 border">
            <h3 className="font-medium text-gray-800 mb-2">Template includes:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              {copy.bullets.map((b, i) => <li key={i}>• {b}</li>)}
            </ul>
          </div>

          <Button
            onClick={handleDownloadTemplate}
            className={`w-full ${theme.btn}`}
            data-testid={`${category}-bulk-template-btn`}
          >
            <Download className="h-4 w-4 mr-2" />
            {copy.title}
          </Button>
        </div>
      </div>

      {/* Step 2 + Step 3 — Upload Excel + Upload PDFs */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        {/* Step 2 */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Upload className={`h-5 w-5 ${theme.text}`} />
            Step 2: Upload Filled Template
          </h2>

          <div
            className={`border-2 border-dashed ${theme.dash} rounded-xl p-6 text-center transition-colors cursor-pointer`}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleUploadExcel}
              className="hidden"
              data-testid={`${category}-bulk-excel-input`}
            />
            {busy ? (
              <Loader2 className={`h-10 w-10 mx-auto ${theme.dashIcon} mb-3 animate-spin`} />
            ) : (
              <FileSpreadsheet className={`h-10 w-10 mx-auto ${theme.dashIcon} mb-3`} />
            )}
            <p className="text-gray-600 font-medium">
              {busy ? "Uploading…" : "Click to upload Excel file"}
            </p>
            <p className="text-sm text-gray-500 mt-1">Supports .xlsx and .xls files</p>
          </div>

          {ingestResult && (
            <div className="mt-3 text-xs space-y-1">
              <div className="flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{ingestResult.success} row(s) inserted</span>
              </div>
              {ingestResult.failed > 0 && (
                <div className="flex items-start gap-1 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                  <div className="flex-1">
                    <div>{ingestResult.failed} failed</div>
                    <ul className="list-disc list-inside text-[11px] text-amber-600 max-h-28 overflow-auto">
                      {(ingestResult.errors || []).map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 3 */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Upload className={`h-5 w-5 ${theme.text}`} />
            Step 3: Upload PDFs
          </h2>

          <div
            className={`border-2 border-dashed ${theme.dash} rounded-xl p-6 text-center transition-colors cursor-pointer`}
            onClick={() => pdfRef.current?.click()}
          >
            <input
              ref={pdfRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={handleAttachPdfs}
              className="hidden"
              data-testid={`${category}-bulk-pdf-input`}
            />
            {pdfBusy ? (
              <Loader2 className={`h-10 w-10 mx-auto ${theme.dashIcon} mb-3 animate-spin`} />
            ) : (
              <Upload className={`h-10 w-10 mx-auto ${theme.dashIcon} mb-3`} />
            )}
            <p className="text-gray-600 font-medium">
              {pdfBusy ? "Attaching…" : "Click to upload one or more PDFs"}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Filename convention:&nbsp;
              <code className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                {copy.convention}
              </code>
            </p>
          </div>

          {attachResult && (
            <div className="mt-3 text-xs space-y-1">
              <div className="flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{attachResult.matched} file(s) attached</span>
              </div>
              {(attachResult.errors || []).length > 0 && (
                <div className="flex items-start gap-1 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                  <div className="flex-1">
                    <div>{attachResult.errors.length} unmatched</div>
                    <ul className="list-disc list-inside text-[11px] text-amber-600 max-h-28 overflow-auto">
                      {attachResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`${theme.note} border rounded-lg p-3 text-sm`}>
          <strong>Note:</strong> {copy.note}
        </div>
      </div>
    </div>
  );
}
