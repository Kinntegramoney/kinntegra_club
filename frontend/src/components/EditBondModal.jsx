import { useState, useEffect } from "react";
import axios from "axios";
import { X, Upload, FileText, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function EditBondModal({ bond, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: "",
    bond_code: "",
    issuer: "",
    principal_amount: "",
    coupon_rate: "",
    primary_irr: "",
    secondary_irr: "",
    start_date: "",
    end_date: "",
    interest_payment_frequency: "quarterly",
    total_units: 1,
    units_sold: 0,
    face_value: "",
    description: "",
    calculator_file: null
  });
  const [loading, setLoading] = useState(false);
  const [presentations, setPresentations] = useState([]);
  const [uploadingPresentations, setUploadingPresentations] = useState(false);
  const [deletingPresentation, setDeletingPresentation] = useState(null);

  // Prefill form with bond data
  useEffect(() => {
    if (bond) {
      setFormData({
        name: bond.name || "",
        bond_code: bond.bond_code || "",
        issuer: bond.issuer || "",
        principal_amount: bond.principal_amount || "",
        coupon_rate: bond.coupon_rate || "",
        primary_irr: bond.primary_irr || "",
        secondary_irr: bond.secondary_irr || "",
        start_date: bond.start_date ? bond.start_date.split('T')[0] : "",
        end_date: bond.end_date ? bond.end_date.split('T')[0] : "",
        interest_payment_frequency: bond.interest_payment_frequency || "quarterly",
        total_units: bond.total_units || 1,
        units_sold: bond.units_sold || 0,
        face_value: bond.face_value || "",
        description: bond.description || "",
        calculator_file: null
      });
      setPresentations(bond.presentations || []);
    }
  }, [bond]);

  // Upload presentations
  const handlePresentationUpload = async (files) => {
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
      toast.error("Please upload PDF, PowerPoint, or Word files only");
      return;
    }
    
    if (presentations.length + validFiles.length > 10) {
      toast.error(`Maximum 10 presentations allowed. Currently have ${presentations.length}`);
      return;
    }
    
    setUploadingPresentations(true);
    try {
      const token = localStorage.getItem("token");
      const formDataUpload = new FormData();
      validFiles.forEach(file => formDataUpload.append('files', file));
      
      const response = await axios.post(`${API}/bonds/${bond.id}/presentations`, formDataUpload, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setPresentations([...presentations, ...response.data.presentations]);
      toast.success(`Uploaded ${response.data.presentations.length} presentation(s)`);
    } catch (error) {
      console.error("Error uploading presentations:", error);
      toast.error(error.response?.data?.detail || "Failed to upload presentations");
    } finally {
      setUploadingPresentations(false);
    }
  };

  // Delete presentation
  const handleDeletePresentation = async (presentationId) => {
    setDeletingPresentation(presentationId);
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/bonds/${bond.id}/presentations/${presentationId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPresentations(presentations.filter(p => p.id !== presentationId));
      toast.success("Presentation deleted");
    } catch (error) {
      console.error("Error deleting presentation:", error);
      toast.error(error.response?.data?.detail || "Failed to delete presentation");
    } finally {
      setDeletingPresentation(null);
    }
  };

  // Get file icon based on type
  const getFileIcon = (contentType, filename) => {
    if (contentType?.includes('pdf') || filename?.endsWith('.pdf')) {
      return <FileText className="h-4 w-4 text-red-500" />;
    }
    if (contentType?.includes('presentation') || filename?.match(/\.(pptx?|ppt)$/i)) {
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
    
    if (!formData.name) {
      toast.error("Bond name is required");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // If there's a calculator file, upload it first
      let calculatorFileUrl = bond?.calculator_file_url;
      let extractedCutoffDays = bond?.cutoff_days || 15;
      
      if (formData.calculator_file) {
        const fileFormData = new FormData();
        fileFormData.append('file', formData.calculator_file);
        fileFormData.append('bond_id', bond.id);
        
        const uploadResponse = await axios.post(`${API}/bonds/upload-calculator`, fileFormData, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        });
        
        calculatorFileUrl = uploadResponse.data.file_url;
        extractedCutoffDays = uploadResponse.data.cutoff_days || 15;
        toast.success(`Calculator uploaded. Cut-off days: ${extractedCutoffDays}`);
      }
      
      await axios.put(`${API}/bonds/${bond.id}`, {
        name: formData.name,
        bond_code: formData.bond_code,
        issuer: formData.issuer,
        principal_amount: parseFloat(formData.principal_amount) || 0,
        coupon_rate: parseFloat(formData.coupon_rate) || 0,
        primary_irr: parseFloat(formData.primary_irr) || 0,
        secondary_irr: parseFloat(formData.secondary_irr) || 0,
        start_date: formData.start_date,
        end_date: formData.end_date,
        interest_payment_frequency: formData.interest_payment_frequency,
        total_units: parseInt(formData.total_units) || 1,
        units_sold: parseInt(formData.units_sold) || 0,
        face_value: parseFloat(formData.face_value) || 0,
        description: formData.description,
        cutoff_days: extractedCutoffDays,
        calculator_file_url: calculatorFileUrl
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Bond updated successfully");
      onSuccess();
    } catch (error) {
      console.error("Error updating bond:", error);
      toast.error(error.response?.data?.detail || "Failed to update bond");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-gray-800">Edit Bond</h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600"
            data-testid="close-edit-bond-modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-700 border-b pb-2">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name">Bond Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  data-testid="edit-bond-name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="bond_code">Bond Code</Label>
                <Input
                  id="bond_code"
                  value={formData.bond_code}
                  onChange={(e) => setFormData({...formData, bond_code: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="issuer">Issuer</Label>
                <Input
                  id="issuer"
                  value={formData.issuer}
                  onChange={(e) => setFormData({...formData, issuer: e.target.value})}
                />
              </div>
            </div>
          </div>

          {/* Financial Details */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-700 border-b pb-2">Financial Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="principal_amount">Principal Amount (₹)</Label>
                <Input
                  id="principal_amount"
                  type="number"
                  value={formData.principal_amount}
                  onChange={(e) => setFormData({...formData, principal_amount: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="face_value">Face Value per Unit (₹)</Label>
                <Input
                  id="face_value"
                  type="number"
                  value={formData.face_value}
                  onChange={(e) => setFormData({...formData, face_value: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="coupon_rate">Coupon Rate (%)</Label>
                <Input
                  id="coupon_rate"
                  type="number"
                  step="0.01"
                  value={formData.coupon_rate}
                  onChange={(e) => setFormData({...formData, coupon_rate: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="primary_irr">Primary IRR (%)</Label>
                <Input
                  id="primary_irr"
                  type="number"
                  step="0.01"
                  value={formData.primary_irr}
                  onChange={(e) => setFormData({...formData, primary_irr: e.target.value})}
                  data-testid="edit-bond-primary-irr"
                />
              </div>
              <div>
                <Label htmlFor="secondary_irr">Secondary IRR (%)</Label>
                <Input
                  id="secondary_irr"
                  type="number"
                  step="0.01"
                  value={formData.secondary_irr}
                  onChange={(e) => setFormData({...formData, secondary_irr: e.target.value})}
                  data-testid="edit-bond-irr"
                />
              </div>
              <div>
                <Label htmlFor="interest_payment_frequency">Interest Frequency</Label>
                <Select 
                  value={formData.interest_payment_frequency} 
                  onValueChange={(v) => setFormData({...formData, interest_payment_frequency: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
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
            </div>
          </div>

          {/* Excel Calculator Upload */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-700 border-b pb-2">Pricing Calculator</h3>
            <div className="space-y-3">
              {bond?.calculator_file_url && (
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-green-800">Calculator Uploaded</p>
                      <p className="text-xs text-green-600">Cut-off Days: {bond?.cutoff_days || 15}</p>
                    </div>
                  </div>
                  <a 
                    href={bond.calculator_file_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-green-700 hover:text-green-900 underline"
                  >
                    Download
                  </a>
                </div>
              )}
              <div>
                <Label htmlFor="calculator_file">{bond?.calculator_file_url ? 'Update Calculator (Excel)' : 'Upload Pricing Calculator (Excel)'}</Label>
                <Input
                  id="calculator_file"
                  type="file"
                  accept=".xlsx,.xlsm,.xls"
                  onChange={(e) => setFormData({...formData, calculator_file: e.target.files[0]})}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload the Excel pricing calculator. System will auto-extract cut-off days.
                </p>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-700 border-b pb-2">Timeline</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="end_date">Maturity Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                />
              </div>
            </div>
          </div>

          {/* Units */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-700 border-b pb-2">Units & Availability</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="total_units">Total Units</Label>
                <Input
                  id="total_units"
                  type="number"
                  min="1"
                  value={formData.total_units}
                  onChange={(e) => setFormData({...formData, total_units: e.target.value})}
                  data-testid="edit-bond-total-units"
                />
              </div>
              <div>
                <Label htmlFor="units_sold">Units Sold</Label>
                <Input
                  id="units_sold"
                  type="number"
                  min="0"
                  max={formData.total_units}
                  value={formData.units_sold}
                  onChange={(e) => setFormData({...formData, units_sold: e.target.value})}
                  data-testid="edit-bond-units-sold"
                />
              </div>
            </div>
            <div className="bg-gray-50 p-3 rounded-md text-sm">
              <span className="text-gray-600">Available Units: </span>
              <span className="font-semibold text-green-600">
                {(parseInt(formData.total_units) || 0) - (parseInt(formData.units_sold) || 0)}
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-700 border-b pb-2">Additional Info</h3>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                rows={3}
                placeholder="Enter bond description or notes..."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 flex justify-end gap-3 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-etihad-gold-700 hover:bg-etihad-gold-800"
              data-testid="save-bond-btn"
            >
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
