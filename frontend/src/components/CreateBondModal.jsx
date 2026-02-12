import { useState } from "react";
import { X, TrendingUp, Plus, Trash2, Calculator, Loader2, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import axios from "axios";
import { format } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CreateBondModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    bond_code: "",
    name: "",
    start_date: "",
    end_date: "",
    principal_amount: "",
    coupon_rate: "",
    primary_irr: "",
    secondary_irr: "",
    interest_payment_frequency: "quarterly",
    total_units: "1",
    minimum_units: "1",
    cutoff_days: "15"
  });

  const [principalPayments, setPrincipalPayments] = useState([{ date: "", percentage: "" }]);
  const [interestPayments, setInterestPayments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [pendingPresentations, setPendingPresentations] = useState([]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addPrincipalPayment = () => {
    setPrincipalPayments([...principalPayments, { date: "", percentage: "" }]);
  };

  const removePrincipalPayment = (index) => {
    if (principalPayments.length > 1) {
      setPrincipalPayments(principalPayments.filter((_, i) => i !== index));
    }
  };

  const updatePrincipalPayment = (index, field, value) => {
    const updated = [...principalPayments];
    updated[index][field] = value;
    setPrincipalPayments(updated);
  };

  const generateInterestSchedule = () => {
    if (!formData.start_date || !formData.end_date || !formData.principal_amount || !formData.coupon_rate) {
      toast.error("Please fill in bond details first");
      return;
    }

    if (principalPayments.length === 0 || principalPayments.some(p => !p.date || !p.percentage)) {
      toast.error("Please add principal payment schedule first");
      return;
    }

    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    const principal = parseFloat(formData.principal_amount);
    const couponRate = parseFloat(formData.coupon_rate) / 100;
    const frequency = formData.interest_payment_frequency;

    let intervalMonths;
    switch (frequency) {
      case "monthly": intervalMonths = 1; break;
      case "quarterly": intervalMonths = 3; break;
      case "semi-annual": intervalMonths = 6; break;
      case "annual": intervalMonths = 12; break;
      case "on_maturity":
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        const totalInterest = principal * couponRate * days / 365;
        setInterestPayments([{ date: format(end, "yyyy-MM-dd"), amount: totalInterest.toFixed(2) }]);
        toast.success("Generated interest payment on maturity");
        return;
      default:
        toast.info("Add payments manually for custom frequency");
        return;
    }

    const sortedPrincipalPayments = [...principalPayments]
      .filter(p => p.date && p.percentage)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const schedule = [];
    let currentDate = new Date(start);
    let lastDate = start;
    let principalPaidSoFar = 0;

    while (currentDate < end) {
      currentDate = new Date(currentDate);
      currentDate.setMonth(currentDate.getMonth() + intervalMonths);
      if (currentDate > end) break;

      const outstandingAtPeriodStart = principal * (1 - principalPaidSoFar / 100);
      const daysDiff = Math.ceil((currentDate - lastDate) / (1000 * 60 * 60 * 24));
      const interestAmount = (outstandingAtPeriodStart * couponRate * daysDiff) / 365;
      
      schedule.push({
        date: format(currentDate, "yyyy-MM-dd"),
        amount: interestAmount > 0 ? interestAmount.toFixed(2) : "0.00"
      });

      sortedPrincipalPayments.forEach(pp => {
        const ppDate = new Date(pp.date);
        if (ppDate > lastDate && ppDate <= currentDate) {
          principalPaidSoFar += parseFloat(pp.percentage);
        }
      });

      lastDate = new Date(currentDate);
    }

    setInterestPayments(schedule);
    toast.success(`Generated ${schedule.length} interest payments`);
  };

  // Handle adding presentations
  const handleAddPresentations = (files) => {
    if (!files || files.length === 0) return;
    
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    const validFiles = Array.from(files).filter(f => 
      allowedTypes.includes(f.type) || 
      f.name.match(/\.(pdf|pptx|ppt|doc|docx)$/i)
    );
    
    if (validFiles.length === 0) {
      toast.error("Please select PDF, PowerPoint, or Word files only");
      return;
    }
    
    if (pendingPresentations.length + validFiles.length > 10) {
      toast.error(`Maximum 10 presentations allowed. Currently have ${pendingPresentations.length}`);
      return;
    }
    
    setPendingPresentations([...pendingPresentations, ...validFiles]);
    toast.success(`Added ${validFiles.length} presentation(s)`);
  };

  // Remove pending presentation
  const removePendingPresentation = (index) => {
    setPendingPresentations(pendingPresentations.filter((_, i) => i !== index));
  };

  // Get file icon based on name
  const getFileIcon = (filename) => {
    if (filename?.endsWith('.pdf')) {
      return <FileText className="h-4 w-4 text-red-500" />;
    }
    if (filename?.match(/\.(pptx?|ppt)$/i)) {
      return <FileText className="h-4 w-4 text-orange-500" />;
    }
    return <FileText className="h-4 w-4 text-blue-500" />;
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.name || !formData.start_date || !formData.end_date || 
        !formData.principal_amount || !formData.coupon_rate || 
        !formData.primary_irr || !formData.secondary_irr) {
      toast.error("Please fill in all bond details");
      return;
    }

    const totalPrincipal = principalPayments.reduce((sum, p) => sum + (parseFloat(p.percentage) || 0), 0);
    if (Math.abs(totalPrincipal - 100) > 0.01) {
      toast.error(`Principal payments must sum to 100%. Current: ${totalPrincipal.toFixed(2)}%`);
      return;
    }

    if (principalPayments.some(p => !p.date || !p.percentage)) {
      toast.error("Please fill in all principal payment dates and percentages");
      return;
    }

    if (interestPayments.length === 0 || interestPayments.some(i => !i.date || !i.amount)) {
      toast.error("Please generate or add interest payments");
      return;
    }

    setSubmitting(true);

    try {
      const bondData = {
        ...formData,
        principal_amount: parseFloat(formData.principal_amount),
        coupon_rate: parseFloat(formData.coupon_rate),
        primary_irr: parseFloat(formData.primary_irr),
        secondary_irr: parseFloat(formData.secondary_irr),
        total_units: parseInt(formData.total_units),
        minimum_units: parseInt(formData.minimum_units) || 1,
        cutoff_days: formData.cutoff_days ? parseInt(formData.cutoff_days) : 15,
        units_sold: 0,
        principal_payments: principalPayments.map(p => ({
          date: p.date,
          percentage: parseFloat(p.percentage)
        })),
        interest_payments: interestPayments.map(i => ({
          date: i.date,
          amount: parseFloat(i.amount)
        }))
      };

      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/bonds`, bondData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const bondId = response.data.id;
      
      // Upload presentations if any
      if (pendingPresentations.length > 0 && bondId) {
        try {
          const formDataUpload = new FormData();
          pendingPresentations.forEach(file => formDataUpload.append('files', file));
          
          await axios.post(`${API}/bonds/${bondId}/presentations`, formDataUpload, {
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data'
            }
          });
          toast.success(`Bond created with ${pendingPresentations.length} presentation(s)!`);
        } catch (presError) {
          console.error("Error uploading presentations:", presError);
          toast.success("Bond created! (Presentations upload failed - you can add them later)");
        }
      } else {
        toast.success("Bond created successfully!");
      }
      
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Error creating bond:", error);
      toast.error(error.response?.data?.detail || "Failed to create bond");
    } finally {
      setSubmitting(false);
    }
  };

  const totalPrincipalPct = principalPayments.reduce((sum, p) => sum + (parseFloat(p.percentage) || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-etihad-gold-500 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-6 w-6" />
            <h2 className="text-xl font-bold">Create New Bond</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b flex">
          <button
            onClick={() => setActiveTab("basic")}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === "basic" ? "border-b-2 border-etihad-gold-500 text-etihad-gold-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Basic Details
          </button>
          <button
            onClick={() => setActiveTab("payments")}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === "payments" ? "border-b-2 border-etihad-gold-500 text-etihad-gold-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Payment Schedule
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit} id="bond-form">
            {activeTab === "basic" && (
              <div className="space-y-6">
                {/* Bond Name & Code */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Bond Name *</Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="e.g., ABC Corp NCD"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="bond_code">Bond Code</Label>
                    <Input
                      id="bond_code"
                      name="bond_code"
                      value={formData.bond_code}
                      onChange={handleInputChange}
                      placeholder="e.g., ABC-NCD-01"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start_date">Start Date *</Label>
                    <Input
                      id="start_date"
                      name="start_date"
                      type="date"
                      value={formData.start_date}
                      onChange={handleInputChange}
                      className="mt-1"
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
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Financial Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="principal_amount">Principal Amount (₹) *</Label>
                    <Input
                      id="principal_amount"
                      name="principal_amount"
                      type="number"
                      value={formData.principal_amount}
                      onChange={handleInputChange}
                      placeholder="1000000"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="coupon_rate">Coupon Rate (%) *</Label>
                    <Input
                      id="coupon_rate"
                      name="coupon_rate"
                      type="number"
                      step="0.01"
                      value={formData.coupon_rate}
                      onChange={handleInputChange}
                      placeholder="12.5"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* IRR */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="primary_irr">Primary IRR (%) *</Label>
                    <Input
                      id="primary_irr"
                      name="primary_irr"
                      type="number"
                      step="0.01"
                      value={formData.primary_irr}
                      onChange={handleInputChange}
                      placeholder="14.5"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="secondary_irr">Secondary IRR (%) *</Label>
                    <Input
                      id="secondary_irr"
                      name="secondary_irr"
                      type="number"
                      step="0.01"
                      value={formData.secondary_irr}
                      onChange={handleInputChange}
                      placeholder="13.0"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Units & Frequency */}
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="total_units">Total Units</Label>
                    <Input
                      id="total_units"
                      name="total_units"
                      type="number"
                      value={formData.total_units}
                      onChange={handleInputChange}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="minimum_units">Min Units</Label>
                    <Input
                      id="minimum_units"
                      name="minimum_units"
                      type="number"
                      value={formData.minimum_units}
                      onChange={handleInputChange}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Interest Frequency</Label>
                    <Select
                      value={formData.interest_payment_frequency}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, interest_payment_frequency: value }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="semi-annual">Semi-Annual</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                        <SelectItem value="on_maturity">On Maturity</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="cutoff_days">Cut-off Days</Label>
                    <Input
                      id="cutoff_days"
                      name="cutoff_days"
                      type="number"
                      value={formData.cutoff_days}
                      onChange={handleInputChange}
                      placeholder="15"
                      className="mt-1"
                      title="Days before payment date to consider as missed for secondary market"
                    />
                    <p className="text-xs text-gray-500 mt-1">For secondary market calc</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "payments" && (
              <div className="space-y-6">
                {/* Principal Payments */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-800">Principal Payments</h3>
                      <p className="text-sm text-gray-500">
                        Total: <span className={totalPrincipalPct === 100 ? "text-green-600" : "text-red-500"}>{totalPrincipalPct.toFixed(2)}%</span> (must be 100%)
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addPrincipalPayment}>
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {principalPayments.map((payment, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <Input
                          type="date"
                          value={payment.date}
                          onChange={(e) => updatePrincipalPayment(index, "date", e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          step="0.01"
                          value={payment.percentage}
                          onChange={(e) => updatePrincipalPayment(index, "percentage", e.target.value)}
                          placeholder="%"
                          className="w-24"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removePrincipalPayment(index)}
                          disabled={principalPayments.length === 1}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Generate Interest Button */}
                <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
                  <Calculator className="h-5 w-5 text-blue-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-800">Auto-generate interest payments</p>
                    <p className="text-xs text-blue-600">Based on principal schedule and coupon rate</p>
                  </div>
                  <Button type="button" variant="outline" onClick={generateInterestSchedule}>
                    Generate
                  </Button>
                </div>

                {/* Interest Payments */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800">Interest Payments ({interestPayments.length})</h3>
                  </div>
                  {interestPayments.length > 0 ? (
                    <div className="border rounded-lg max-h-48 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-gray-600">Date</th>
                            <th className="text-right py-2 px-3 font-medium text-gray-600">Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {interestPayments.map((payment, index) => (
                            <tr key={index}>
                              <td className="py-2 px-3">{payment.date}</td>
                              <td className="py-2 px-3 text-right font-mono">₹{parseFloat(payment.amount).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-gray-50 rounded-lg text-gray-500 text-sm">
                      Click "Generate" above to auto-create interest schedule
                    </div>
                  )}
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end gap-3 bg-gray-50">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            form="bond-form"
            className="bg-etihad-gold-500 hover:bg-etihad-gold-600"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Bond"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
