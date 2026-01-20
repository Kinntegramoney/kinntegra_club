import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, ArrowRight, Upload, FileSpreadsheet, Check, AlertCircle, Calculator, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CreateBondNew() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [calculatedPrice, setCalculatedPrice] = useState(null);
  
  // Step 1: Basic bond details
  const [formData, setFormData] = useState({
    bond_code: "",
    name: "",
    isin: "",
    start_date: "",
    end_date: "",
    principal_amount: "",
    coupon_rate: "",
    primary_irr: "",
    secondary_irr: "",
    total_units: "1",
    minimum_units: "1",
    cutoff_days: "15",
    description: ""
  });
  
  // Step 2: Cashflows (from Excel upload)
  const [cashflows, setCashflows] = useState([]);
  const [parsedBondParams, setParsedBondParams] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState("");
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  // File upload handling
  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    if (!file.name.match(/\.(xlsx|xls|xlsm)$/i)) {
      toast.error("Please upload an Excel file (.xlsx, .xls, .xlsm)");
      return;
    }
    
    setUploadingFile(true);
    setUploadedFileName(file.name);
    
    try {
      const token = localStorage.getItem("token");
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);
      
      const response = await axios.post(`${API}/bonds/parse-cashflow-excel`, formDataUpload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        }
      });
      
      if (response.data.success) {
        setCashflows(response.data.cashflows);
        setParsedBondParams(response.data.bond_params);
        
        // Auto-fill form data from parsed params if available
        const params = response.data.bond_params;
        if (params) {
          setFormData(prev => ({
            ...prev,
            name: params.bond_name || prev.name,
            isin: params.isin || prev.isin,
            start_date: params.bond_start_date || prev.start_date,
            end_date: params.bond_maturity_date || prev.end_date,
            principal_amount: params.face_value ? String(params.face_value) : prev.principal_amount,
            coupon_rate: params.coupon_rate ? String(params.coupon_rate * 100) : prev.coupon_rate,
            primary_irr: params.primary_irr ? String(params.primary_irr) : prev.primary_irr,
            secondary_irr: params.client_irr ? String(params.client_irr * 100) : prev.secondary_irr
          }));
        }
        
        toast.success(`Parsed ${response.data.cashflows.length} cashflows from Excel`);
      }
    } catch (error) {
      console.error("Error parsing Excel:", error);
      toast.error(error.response?.data?.detail || "Failed to parse Excel file");
      setUploadedFileName("");
    } finally {
      setUploadingFile(false);
    }
  }, []);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"]
    },
    maxFiles: 1
  });
  
  // Download template
  const downloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/bonds/cashflow-template`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'bond_cashflow_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Template downloaded!");
    } catch (error) {
      console.error("Error downloading template:", error);
      toast.error("Failed to download template");
    } finally {
      setDownloadingTemplate(false);
    }
  };
  
  // Calculate price preview
  const calculatePrice = async () => {
    if (cashflows.length === 0) {
      toast.error("Please upload cashflow Excel first");
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/bonds/calculate-price`, {
        face_value: parseFloat(formData.principal_amount) || 100000,
        client_irr: (parseFloat(formData.secondary_irr) || 11) / 100,
        bond_start_date: formData.start_date,
        investment_date: new Date().toISOString().split("T")[0],
        bond_maturity_date: formData.end_date,
        cashflows: cashflows,
        cutoff_days: parseInt(formData.cutoff_days) || 15
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setCalculatedPrice(response.data);
      toast.success(`Calculated price: ₹${response.data.price_per_unit?.toLocaleString()}`);
    } catch (error) {
      console.error("Error calculating price:", error);
      toast.error(error.response?.data?.detail || "Failed to calculate price");
    }
  };
  
  // Clear cashflows
  const clearCashflows = () => {
    setCashflows([]);
    setParsedBondParams(null);
    setUploadedFileName("");
    setCalculatedPrice(null);
  };
  
  // Submit bond
  const handleSubmit = async () => {
    if (!formData.name || !formData.start_date || !formData.end_date || !formData.principal_amount) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    if (cashflows.length === 0) {
      toast.error("Please upload cashflow Excel in Step 2");
      return;
    }
    
    setSubmitting(true);
    
    try {
      const token = localStorage.getItem("token");
      const bondData = {
        bond_code: formData.bond_code || `BOND-${Date.now()}`,
        name: formData.name,
        isin: formData.isin || "",
        start_date: formData.start_date,
        end_date: formData.end_date,
        principal_amount: parseFloat(formData.principal_amount),
        coupon_rate: parseFloat(formData.coupon_rate) || 0,
        primary_irr: parseFloat(formData.primary_irr) || 0,
        secondary_irr: parseFloat(formData.secondary_irr) || 0,
        total_units: parseInt(formData.total_units) || 1,
        minimum_units: parseInt(formData.minimum_units) || 1,
        cutoff_days: parseInt(formData.cutoff_days) || 15,
        description: formData.description || "",
        cashflows_per_unit: cashflows,
        principal_payments: [],
        interest_payments: [],
        interest_payment_frequency: "custom"
      };
      
      await axios.post(`${API}/bonds`, bondData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Bond created successfully!");
      navigate("/admin/bonds");
    } catch (error) {
      console.error("Error creating bond:", error);
      toast.error(error.response?.data?.detail || "Failed to create bond");
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/bonds")} data-testid="back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Create New Bond</h1>
            <p className="text-slate-600">Step {step} of 2: {step === 1 ? "Basic Details" : "Cashflow Upload"}</p>
          </div>
        </div>
        
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${step >= 1 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}>
              {step > 1 ? <Check className="w-5 h-5" /> : "1"}
            </div>
            <span className={`font-medium ${step >= 1 ? "text-blue-600" : "text-slate-400"}`}>Basic Details</span>
          </div>
          <div className={`w-20 h-1 mx-2 ${step >= 2 ? "bg-blue-600" : "bg-slate-200"}`} />
          <div className="flex items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${step >= 2 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}>
              2
            </div>
            <span className={`font-medium ${step >= 2 ? "text-blue-600" : "text-slate-400"}`}>Cashflow Upload</span>
          </div>
        </div>
        
        {/* Step 1: Basic Details */}
        {step === 1 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6" data-testid="step-1-form">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">Bond Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="bond_code">Bond Code</Label>
                <Input
                  id="bond_code"
                  name="bond_code"
                  value={formData.bond_code}
                  onChange={handleInputChange}
                  placeholder="e.g., CDUCIC01"
                  data-testid="bond-code-input"
                />
              </div>
              
              <div>
                <Label htmlFor="isin">ISIN</Label>
                <Input
                  id="isin"
                  name="isin"
                  value={formData.isin}
                  onChange={handleInputChange}
                  placeholder="e.g., INE0BSV07047"
                  data-testid="isin-input"
                />
              </div>
              
              <div className="md:col-span-2">
                <Label htmlFor="name">Bond Name *</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g., UC Inclusive Credit Private Limited"
                  required
                  data-testid="bond-name-input"
                />
              </div>
              
              <div>
                <Label htmlFor="start_date">Start Date *</Label>
                <Input
                  id="start_date"
                  name="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={handleInputChange}
                  required
                  data-testid="start-date-input"
                />
              </div>
              
              <div>
                <Label htmlFor="end_date">Maturity Date *</Label>
                <Input
                  id="end_date"
                  name="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={handleInputChange}
                  required
                  data-testid="end-date-input"
                />
              </div>
              
              <div>
                <Label htmlFor="principal_amount">Face Value per Unit *</Label>
                <Input
                  id="principal_amount"
                  name="principal_amount"
                  type="number"
                  value={formData.principal_amount}
                  onChange={handleInputChange}
                  placeholder="e.g., 500000"
                  required
                  data-testid="principal-input"
                />
              </div>
              
              <div>
                <Label htmlFor="coupon_rate">Coupon Rate (%)</Label>
                <Input
                  id="coupon_rate"
                  name="coupon_rate"
                  type="number"
                  step="0.01"
                  value={formData.coupon_rate}
                  onChange={handleInputChange}
                  placeholder="e.g., 12.5"
                  data-testid="coupon-rate-input"
                />
              </div>
              
              <div>
                <Label htmlFor="primary_irr">Primary IRR (%)</Label>
                <Input
                  id="primary_irr"
                  name="primary_irr"
                  type="number"
                  step="0.01"
                  value={formData.primary_irr}
                  onChange={handleInputChange}
                  placeholder="e.g., 13.24"
                  data-testid="primary-irr-input"
                />
              </div>
              
              <div>
                <Label htmlFor="secondary_irr">Client IRR (%) *</Label>
                <Input
                  id="secondary_irr"
                  name="secondary_irr"
                  type="number"
                  step="0.01"
                  value={formData.secondary_irr}
                  onChange={handleInputChange}
                  placeholder="e.g., 11"
                  data-testid="secondary-irr-input"
                />
              </div>
              
              <div>
                <Label htmlFor="total_units">Total Units</Label>
                <Input
                  id="total_units"
                  name="total_units"
                  type="number"
                  value={formData.total_units}
                  onChange={handleInputChange}
                  placeholder="1"
                  data-testid="total-units-input"
                />
              </div>
              
              <div>
                <Label htmlFor="minimum_units">Minimum Units</Label>
                <Input
                  id="minimum_units"
                  name="minimum_units"
                  type="number"
                  value={formData.minimum_units}
                  onChange={handleInputChange}
                  placeholder="1"
                  data-testid="min-units-input"
                />
              </div>
              
              <div>
                <Label htmlFor="cutoff_days">Record Date Cutoff (days)</Label>
                <Input
                  id="cutoff_days"
                  name="cutoff_days"
                  type="number"
                  value={formData.cutoff_days}
                  onChange={handleInputChange}
                  placeholder="15"
                  data-testid="cutoff-days-input"
                />
              </div>
              
              <div className="md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Bond description..."
                  rows={3}
                  data-testid="description-input"
                />
              </div>
            </div>
            
            <div className="flex justify-end mt-8">
              <Button onClick={() => setStep(2)} className="gap-2" data-testid="next-step-btn">
                Next: Upload Cashflows
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
        
        {/* Step 2: Cashflow Upload */}
        {step === 2 && (
          <div className="space-y-6" data-testid="step-2-form">
            {/* Upload Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Upload Cashflow Excel</h2>
              <p className="text-sm text-slate-600 mb-4">
                Upload an Excel file containing the bond&apos;s cashflow schedule. The file should have columns for Date, Principal Repayment, and Interest Repayment.
              </p>
              
              {!uploadedFileName ? (
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-blue-400"
                  }`}
                  data-testid="dropzone"
                >
                  <input {...getInputProps()} />
                  {uploadingFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
                      <p className="text-slate-600">Parsing Excel file...</p>
                    </div>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-slate-700 font-medium">
                        {isDragActive ? "Drop the Excel file here" : "Drag & drop Excel file here"}
                      </p>
                      <p className="text-sm text-slate-500 mt-1">or click to browse</p>
                      <p className="text-xs text-slate-400 mt-2">Supports .xlsx, .xls, .xlsm</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <Check className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-green-800">{uploadedFileName}</p>
                      <p className="text-sm text-green-600">{cashflows.length} cashflows parsed</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearCashflows} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Remove
                  </Button>
                </div>
              )}
            </div>
            
            {/* Cashflows Preview */}
            {cashflows.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Cashflow Preview</h2>
                  <Button variant="outline" size="sm" onClick={calculatePrice} className="gap-2" data-testid="calculate-price-btn">
                    <Calculator className="w-4 h-4" />
                    Calculate Price
                  </Button>
                </div>
                
                {calculatedPrice && (
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Calculator className="w-5 h-5 text-blue-600" />
                      <span className="font-semibold text-blue-900">Price Calculation</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-blue-600">Price per Unit</p>
                        <p className="font-bold text-blue-900">₹{calculatedPrice.price_per_unit?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-blue-600">Total Interest</p>
                        <p className="font-semibold text-blue-800">₹{calculatedPrice.total_interest?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-blue-600">Total Payout</p>
                        <p className="font-semibold text-blue-800">₹{calculatedPrice.total_payout?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-blue-600">Payments</p>
                        <p className="font-semibold text-blue-800">{calculatedPrice.num_payments}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-medium text-slate-600">#</th>
                        <th className="text-left py-2 px-3 font-medium text-slate-600">Date</th>
                        <th className="text-right py-2 px-3 font-medium text-slate-600">Principal</th>
                        <th className="text-right py-2 px-3 font-medium text-slate-600">Interest</th>
                        <th className="text-right py-2 px-3 font-medium text-slate-600">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashflows.slice(0, 10).map((cf, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                          <td className="py-2 px-3">{cf.date}</td>
                          <td className="py-2 px-3 text-right">₹{cf.principal?.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right">₹{cf.interest?.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right font-medium">₹{cf.total?.toLocaleString()}</td>
                        </tr>
                      ))}
                      {cashflows.length > 10 && (
                        <tr className="bg-slate-50">
                          <td colSpan={5} className="py-2 px-3 text-center text-slate-500">
                            ... and {cashflows.length - 10} more payments
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 font-semibold">
                        <td colSpan={2} className="py-2 px-3">Total</td>
                        <td className="py-2 px-3 text-right">₹{cashflows.reduce((sum, cf) => sum + (cf.principal || 0), 0).toLocaleString()}</td>
                        <td className="py-2 px-3 text-right">₹{cashflows.reduce((sum, cf) => sum + (cf.interest || 0), 0).toLocaleString()}</td>
                        <td className="py-2 px-3 text-right">₹{cashflows.reduce((sum, cf) => sum + (cf.total || 0), 0).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
            
            {/* Navigation */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-2" data-testid="prev-step-btn">
                <ArrowLeft className="w-4 h-4" />
                Back to Details
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={submitting || cashflows.length === 0}
                className="gap-2"
                data-testid="submit-bond-btn"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Create Bond
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
