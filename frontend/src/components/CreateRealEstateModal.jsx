import { useState, useRef } from "react";
import { 
  X, Building2, DollarSign, Ruler, Calendar, Upload, 
  Image, Trash2, Plus, CalendarDays, FileText, Box
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CreateRealEstateModal({ opportunity, onClose, onSuccess }) {
  const isEditing = !!opportunity;
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    // Basic Info
    building_name: opportunity?.building_name || "",
    unit_no: opportunity?.unit_no || "",
    
    // Pricing (AED)
    unit_price: opportunity?.unit_price || "",
    
    // DLD Fee (percentage of unit price)
    dld_fee_percentage: opportunity?.dld_fee_percentage || 4,
    
    // Admin Fee (absolute amount - paid upfront with booking)
    admin_fee: opportunity?.admin_fee || "",
    
    // Other Fees (handle both field names for backward compatibility)
    broker_fee: opportunity?.broker_fee ?? opportunity?.brokerage_fee ?? "",
    other_fees: opportunity?.other_fees || "",
    
    // Developer Discount
    developer_discount: opportunity?.developer_discount || "",
    developer_discount_percentage: opportunity?.developer_discount_percentage || "",
    
    // Unit Selling Fee (% of selling price, 0-2.5%) - handle both field names
    unit_selling_fee_percentage: opportunity?.unit_selling_fee_percentage ?? opportunity?.selling_fee_percentage ?? "",
    
    // Area (sqft)
    total_area: opportunity?.total_area || "",
    carpet_area: opportunity?.carpet_area || "",
    balcony_area: opportunity?.balcony_area || "",
    
    // Unit Details
    unit_type: opportunity?.unit_type || "1BR",
    floor: opportunity?.floor || "",
    parking_spaces: opportunity?.parking_spaces || 0,
    
    // Sale Settings
    expected_sale_rate: opportunity?.expected_sale_rate || "",
    estimated_sell_date: opportunity?.estimated_sell_date || "",
    eligible_to_sell_after_percentage: opportunity?.eligible_to_sell_after_percentage || 100,
    
    // Optional
    developer_name: opportunity?.developer_name || "",
    location: opportunity?.location || "",
    handover_date: opportunity?.handover_date || "",
    description: opportunity?.description || "",
    
    // 3D View
    view_3d_url: opportunity?.view_3d_url || ""
  });

  // Payment Schedule - percentages based on unit price only
  const [paymentSchedule, setPaymentSchedule] = useState(
    opportunity?.payment_schedule?.map(p => ({
      date: p.date,
      percentage: p.percentage,
      description: p.description || ""
    })) || []
  );

  const [images, setImages] = useState([]);
  const [existingImages, setExistingImages] = useState(opportunity?.images || []);
  const [presentations, setPresentations] = useState([]);
  const [existingPresentations, setExistingPresentations] = useState(opportunity?.presentations || []);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");

  // Calculate totals
  const unitPrice = parseFloat(formData.unit_price) || 0;
  const dldFeePercentage = parseFloat(formData.dld_fee_percentage) || 0;
  const dldFee = unitPrice * dldFeePercentage / 100;  // DLD is % of unit price
  const adminFee = parseFloat(formData.admin_fee) || 0;  // Admin is absolute
  const brokerFee = parseFloat(formData.broker_fee) || 0;
  const otherFees = parseFloat(formData.other_fees) || 0;
  
  // Total cost = Unit Price + all fees
  const totalCost = unitPrice + dldFee + adminFee + brokerFee + otherFees;
  
  // Upfront amount (paid with booking) = DLD + Admin Fee
  const upfrontAmount = dldFee + adminFee;

  // Payment schedule total percentage
  const getTotalPaymentPercentage = () => {
    return paymentSchedule.reduce((sum, p) => sum + (parseFloat(p.percentage) || 0), 0);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Payment Schedule handlers
  const addPaymentMilestone = () => {
    setPaymentSchedule(prev => [...prev, { date: "", percentage: "", description: "" }]);
  };

  const updatePaymentMilestone = (index, field, value) => {
    setPaymentSchedule(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated; // Don't sort here - sorting is done during render
    });
  };

  // Image handlers
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const totalImages = images.length + existingImages.length + files.length;
    
    if (totalImages > 12) {
      toast.error("Maximum 12 images allowed");
      return;
    }

    const newImages = files.map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    setImages(prev => [...prev, ...newImages]);
  };

  const removeImage = (index) => {
    setImages(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const removeExistingImage = async (imageId) => {
    if (!isEditing) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/real-estate-opportunities/${opportunity.id}/images/${imageId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setExistingImages(prev => prev.filter(img => img.id !== imageId));
      toast.success("Image removed");
    } catch (error) {
      toast.error("Failed to remove image");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.building_name || !formData.unit_no || !formData.unit_price || 
        !formData.total_area || !formData.carpet_area || !formData.floor) {
      toast.error("Please fill all required fields");
      return;
    }

    // Validate payment schedule totals 100%
    if (paymentSchedule.length > 0) {
      const totalPercent = getTotalPaymentPercentage();
      if (Math.abs(totalPercent - 100) > 0.01) {
        toast.error(`Payment schedule must total 100%. Current: ${totalPercent.toFixed(1)}%`);
        return;
      }
    }

    // Validate unit selling fee percentage
    const sellingFeePercent = parseFloat(formData.unit_selling_fee_percentage) || 0;
    if (sellingFeePercent < 0 || sellingFeePercent > 2.5) {
      toast.error("Unit Selling Fee must be between 0% and 2.5%");
      return;
    }

    setLoading(true);
    
    try {
      const token = localStorage.getItem("token");
      
      const payload = {
        building_name: formData.building_name,
        unit_no: formData.unit_no,
        unit_price: parseFloat(formData.unit_price),
        dld_fee_percentage: parseFloat(formData.dld_fee_percentage) || 4,  // DLD as percentage
        admin_fee: parseFloat(formData.admin_fee) || 0,  // Admin as absolute
        broker_fee: parseFloat(formData.broker_fee) || 0,
        other_fees: parseFloat(formData.other_fees) || 0,
        developer_discount: parseFloat(formData.developer_discount) || 0,
        developer_discount_percentage: parseFloat(formData.developer_discount_percentage) || 0,
        unit_selling_fee_percentage: parseFloat(formData.unit_selling_fee_percentage) || 0,
        total_area: parseFloat(formData.total_area),
        carpet_area: parseFloat(formData.carpet_area),
        balcony_area: parseFloat(formData.balcony_area) || 0,
        unit_type: formData.unit_type,
        floor: String(formData.floor),  // Backend expects string
        parking_spaces: parseInt(formData.parking_spaces) || 0,
        payment_schedule: paymentSchedule.filter(p => p.date && p.percentage).map(p => ({
          date: p.date,
          percentage: parseFloat(p.percentage),
          description: p.description || null
        })),
        expected_sale_rate: formData.expected_sale_rate ? parseFloat(formData.expected_sale_rate) : null,
        estimated_sell_date: formData.estimated_sell_date || null,
        eligible_to_sell_after_percentage: parseFloat(formData.eligible_to_sell_after_percentage) || 100,
        developer_name: formData.developer_name || null,
        location: formData.location || null,
        handover_date: formData.handover_date || null,
        description: formData.description || null
      };

      let opportunityId;

      if (isEditing) {
        await axios.put(`${API}/real-estate-opportunities/${opportunity.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        opportunityId = opportunity.id;
        toast.success("Property updated successfully");
      } else {
        const response = await axios.post(`${API}/real-estate-opportunities`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        opportunityId = response.data.id;
        toast.success("Property created successfully");
      }

      // Upload images if any
      if (images.length > 0) {
        const formDataImages = new FormData();
        images.forEach(img => {
          formDataImages.append('files', img.file);
        });

        await axios.post(`${API}/real-estate-opportunities/${opportunityId}/images`, formDataImages, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        });
      }

      // Upload presentations if any
      if (presentations.length > 0) {
        const formDataPresentations = new FormData();
        presentations.forEach(pres => {
          formDataPresentations.append('files', pres.file);
        });

        await axios.post(`${API}/real-estate-opportunities/${opportunityId}/presentations`, formDataPresentations, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        });
      }

      onSuccess();
    } catch (error) {
      const errorDetail = error.response?.data?.detail;
      // Handle Pydantic validation errors (array of objects)
      if (Array.isArray(errorDetail)) {
        const errorMsg = errorDetail.map(e => `${e.loc?.join('.')}: ${e.msg}`).join(', ');
        toast.error(errorMsg || "Validation error");
      } else {
        toast.error(errorDetail || "Failed to save property");
      }
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amt) => new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0 }).format(amt || 0);

  const sections = [
    { id: "basic", label: "Basic Info", icon: Building2 },
    { id: "fees", label: "Pricing & Fees", icon: DollarSign },
    { id: "area", label: "Area & Details", icon: Ruler },
    { id: "payments", label: "Payment Schedule", icon: CalendarDays },
    { id: "sale", label: "Sale Settings", icon: Calendar },
    { id: "images", label: "Images", icon: Image },
    { id: "presentations", label: "Presentations", icon: FileText },
    { id: "3dview", label: "3D View", icon: Box }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header - Fixed */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Building2 className="h-5 w-5 text-orange-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                {isEditing ? "Edit Property" : "Add Off-Plan Property"}
              </h2>
              <p className="text-sm text-gray-500">Fill in the property details</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Section Tabs - Fixed */}
        <div className="flex-shrink-0 flex border-b border-gray-200 px-6 overflow-x-auto bg-white">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                activeSection === section.id
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <section.icon className="h-4 w-4" />
              <span className="text-sm font-medium">{section.label}</span>
            </button>
          ))}
        </div>

        {/* Form Content - Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 min-h-0">
          {/* Basic Info Section */}
          {activeSection === "basic" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="building_name">Building Name *</Label>
                  <Input
                    id="building_name"
                    value={formData.building_name}
                    onChange={(e) => handleChange("building_name", e.target.value)}
                    placeholder="e.g., Marina Heights Tower"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="unit_no">Unit Number *</Label>
                  <Input
                    id="unit_no"
                    value={formData.unit_no}
                    onChange={(e) => handleChange("unit_no", e.target.value)}
                    placeholder="e.g., 2501"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="unit_type">Unit Type *</Label>
                  <Select value={formData.unit_type} onValueChange={(v) => handleChange("unit_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Studio">Studio</SelectItem>
                      <SelectItem value="1BR">1 Bedroom</SelectItem>
                      <SelectItem value="2BR">2 Bedroom</SelectItem>
                      <SelectItem value="3BR">3 Bedroom</SelectItem>
                      <SelectItem value="4BR">4 Bedroom</SelectItem>
                      <SelectItem value="Penthouse">Penthouse</SelectItem>
                      <SelectItem value="Townhouse">Townhouse</SelectItem>
                      <SelectItem value="Villa">Villa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="floor">Floor *</Label>
                  <Input
                    id="floor"
                    type="number"
                    value={formData.floor}
                    onChange={(e) => handleChange("floor", e.target.value)}
                    placeholder="e.g., 25"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="parking_spaces">Parking Spaces</Label>
                  <Input
                    id="parking_spaces"
                    type="number"
                    min="0"
                    value={formData.parking_spaces}
                    onChange={(e) => handleChange("parking_spaces", e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="developer_name">Developer</Label>
                  <Input
                    id="developer_name"
                    value={formData.developer_name}
                    onChange={(e) => handleChange("developer_name", e.target.value)}
                    placeholder="e.g., Emaar"
                  />
                </div>
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => handleChange("location", e.target.value)}
                    placeholder="e.g., Dubai Marina"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="Property description..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Pricing & Fees Section */}
          {activeSection === "fees" && (
            <div className="space-y-6">
              {/* Unit Price */}
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <Label htmlFor="unit_price" className="text-orange-800 font-medium">Unit Price (AED) *</Label>
                <Input
                  id="unit_price"
                  type="number"
                  value={formData.unit_price}
                  onChange={(e) => handleChange("unit_price", e.target.value)}
                  placeholder="e.g., 2000000"
                  className="mt-2 text-lg"
                  required
                />
                <p className="text-sm text-orange-600 mt-1">Base price of the property</p>
              </div>

              {/* Upfront Fees - DLD + Admin (paid with booking) */}
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <h4 className="text-red-800 font-medium mb-3">Upfront Fees (Paid with Booking)</h4>
                <p className="text-xs text-red-600 mb-3">DLD and Admin fees are paid upfront along with the booking amount</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dld_fee_percentage" className="text-blue-800">DLD Fee (%)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        id="dld_fee_percentage"
                        type="number"
                        step="0.1"
                        value={formData.dld_fee_percentage}
                        onChange={(e) => handleChange("dld_fee_percentage", e.target.value)}
                        placeholder="4"
                        className="w-24"
                      />
                      <span className="text-gray-500">%</span>
                      <span className="text-blue-600 font-medium ml-2">= AED {formatCurrency(dldFee)}</span>
                    </div>
                    <p className="text-xs text-blue-500 mt-1">% of Unit Price</p>
                  </div>
                  <div>
                    <Label htmlFor="admin_fee" className="text-green-800">Admin Fee (AED)</Label>
                    <Input
                      id="admin_fee"
                      type="number"
                      value={formData.admin_fee}
                      onChange={(e) => handleChange("admin_fee", e.target.value)}
                      placeholder="e.g., 10000"
                      className="mt-1"
                    />
                    <p className="text-xs text-green-500 mt-1">Absolute amount</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-red-200 flex justify-between text-sm font-medium">
                  <span className="text-red-700">Total Upfront (with Booking)</span>
                  <span className="text-red-800">AED {formatCurrency(upfrontAmount)}</span>
                </div>
              </div>

              {/* Other Fees */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                  <Label htmlFor="broker_fee" className="text-amber-800 font-medium">Brokerage Fee (AED)</Label>
                  <Input
                    id="broker_fee"
                    type="number"
                    value={formData.broker_fee}
                    onChange={(e) => handleChange("broker_fee", e.target.value)}
                    placeholder="e.g., 40000"
                    className="mt-2"
                  />
                </div>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <Label htmlFor="other_fees" className="text-gray-800 font-medium">Other Fees (AED)</Label>
                  <Input
                    id="other_fees"
                    type="number"
                    value={formData.other_fees}
                    onChange={(e) => handleChange("other_fees", e.target.value)}
                    placeholder="e.g., 5000"
                    className="mt-2"
                  />
                </div>
              </div>

              {/* Developer Discount */}
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                <Label className="text-emerald-800 font-medium">Developer Discount</Label>
                <p className="text-xs text-emerald-600 mb-3">Any discount offered by the developer</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="developer_discount" className="text-sm text-gray-600">Discount Amount (AED)</Label>
                    <Input
                      id="developer_discount"
                      type="number"
                      value={formData.developer_discount}
                      onChange={(e) => handleChange("developer_discount", e.target.value)}
                      placeholder="e.g., 50000"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="developer_discount_percentage" className="text-sm text-gray-600">Or Discount %</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        id="developer_discount_percentage"
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={formData.developer_discount_percentage}
                        onChange={(e) => handleChange("developer_discount_percentage", e.target.value)}
                        placeholder="e.g., 5"
                      />
                      <span className="text-emerald-600">%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Unit Selling Fee */}
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <Label htmlFor="unit_selling_fee_percentage" className="text-purple-800 font-medium">
                  Unit Selling Fee (% of Selling Price)
                </Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    id="unit_selling_fee_percentage"
                    type="number"
                    step="0.1"
                    min="0"
                    max="2.5"
                    value={formData.unit_selling_fee_percentage}
                    onChange={(e) => handleChange("unit_selling_fee_percentage", e.target.value)}
                    placeholder="0 - 2.5"
                    className="w-32"
                  />
                  <span className="text-purple-600">%</span>
                </div>
                <p className="text-xs text-purple-600 mt-1">Fee charged when property is sold (0% - 2.5%)</p>
              </div>

              {/* Total Summary */}
              <div className="bg-gray-100 rounded-lg p-4">
                <h4 className="font-medium text-gray-700 mb-3">Cost Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Unit Price</span>
                    <span className="font-medium">AED {formatCurrency(unitPrice)}</span>
                  </div>
                  <div className="flex justify-between text-blue-600">
                    <span>DLD Fee</span>
                    <span className="font-medium">AED {formatCurrency(dldFee)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Admin Fee</span>
                    <span className="font-medium">AED {formatCurrency(adminFee)}</span>
                  </div>
                  <div className="flex justify-between text-amber-600">
                    <span>Brokerage</span>
                    <span className="font-medium">AED {formatCurrency(brokerFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Other Fees</span>
                    <span className="font-medium">AED {formatCurrency(otherFees)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-300 font-bold text-lg">
                    <span>Total Cost</span>
                    <span className="text-orange-600">AED {formatCurrency(totalCost)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Area & Details Section */}
          {activeSection === "area" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="total_area">Total Area (sqft) *</Label>
                  <Input
                    id="total_area"
                    type="number"
                    value={formData.total_area}
                    onChange={(e) => handleChange("total_area", e.target.value)}
                    placeholder="e.g., 1500"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="carpet_area">Carpet Area (sqft) *</Label>
                  <Input
                    id="carpet_area"
                    type="number"
                    value={formData.carpet_area}
                    onChange={(e) => handleChange("carpet_area", e.target.value)}
                    placeholder="e.g., 1200"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="balcony_area">Balcony Area (sqft)</Label>
                  <Input
                    id="balcony_area"
                    type="number"
                    value={formData.balcony_area}
                    onChange={(e) => handleChange("balcony_area", e.target.value)}
                    placeholder="e.g., 200"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="handover_date">Expected Handover Date</Label>
                <Input
                  id="handover_date"
                  type="date"
                  value={formData.handover_date}
                  onChange={(e) => handleChange("handover_date", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Payment Schedule Section */}
          {activeSection === "payments" && (
            <div className="space-y-4">
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <p className="text-sm text-red-700">
                  <strong>Important:</strong> DLD Fee (AED {formatCurrency(dldFee)}) + Admin Fee (AED {formatCurrency(adminFee)}) = <strong>AED {formatCurrency(upfrontAmount)}</strong> will be paid <strong>upfront with the booking amount</strong>.
                </p>
              </div>
              
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <p className="text-sm text-orange-700">
                  <strong>Payment Schedule:</strong> Percentages below are based on <strong>Unit Price (AED {formatCurrency(unitPrice)})</strong> only. 
                  The upfront fees (DLD + Admin) are NOT included in these percentages.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Payment Milestones</h3>
                  <p className="text-sm text-gray-500">
                    Total: {getTotalPaymentPercentage().toFixed(1)}% 
                    {Math.abs(getTotalPaymentPercentage() - 100) > 0.01 && (
                      <span className="text-red-500 ml-2">(must equal 100%)</span>
                    )}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addPaymentMilestone}>
                  <Plus className="h-4 w-4 mr-1" /> Add Milestone
                </Button>
              </div>

              {/* Note about auto-sorting */}
              {paymentSchedule.length > 1 && (
                <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                  ℹ️ Milestones are automatically sorted by date
                </p>
              )}

              {paymentSchedule.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
                  <CalendarDays className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No payment milestones added</p>
                  <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addPaymentMilestone}>
                    Add First Milestone
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentSchedule
                    .map((milestone, originalIdx) => ({ ...milestone, originalIdx }))
                    .sort((a, b) => {
                      if (!a.date) return 1;
                      if (!b.date) return -1;
                      return new Date(a.date) - new Date(b.date);
                    })
                    .map((milestone, displayIdx) => (
                      <div key={milestone.originalIdx} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm ${
                          displayIdx === 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {displayIdx + 1}
                        </div>
                        <div className="flex-1 grid grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs">Date {displayIdx === 0 && <span className="text-red-500">(First = Booking)</span>}</Label>
                            <Input
                              type="date"
                              value={milestone.date}
                              onChange={(e) => updatePaymentMilestone(milestone.originalIdx, "date", e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Percentage</Label>
                            <div className="relative">
                              <Input
                                type="number"
                                step="0.1"
                                value={milestone.percentage}
                                onChange={(e) => updatePaymentMilestone(milestone.originalIdx, "percentage", e.target.value)}
                                placeholder="e.g., 20"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Description</Label>
                            <Input
                              value={milestone.description}
                              onChange={(e) => updatePaymentMilestone(milestone.originalIdx, "description", e.target.value)}
                              placeholder={displayIdx === 0 ? "Booking" : "e.g., Construction"}
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPaymentSchedule(prev => prev.filter((_, i) => i !== milestone.originalIdx));
                          }}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  }
                </div>
              )}

              {/* Payment Amount Preview */}
              {paymentSchedule.length > 0 && unitPrice > 0 && (
                <div className="bg-gray-100 rounded-lg p-4 mt-4">
                  <h4 className="font-medium text-gray-700 mb-3">Payment Amount Preview (Sorted by Date)</h4>
                  <div className="space-y-2 text-sm">
                    {paymentSchedule
                      .filter(p => p.percentage)
                      .sort((a, b) => {
                        if (!a.date) return 1;
                        if (!b.date) return -1;
                        return new Date(a.date) - new Date(b.date);
                      })
                      .map((milestone, idx) => {
                        const pct = parseFloat(milestone.percentage) || 0;
                        const amount = unitPrice * pct / 100;
                        const isFirstPayment = idx === 0;
                        const formattedDate = milestone.date ? new Date(milestone.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                        return (
                          <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-200 last:border-0">
                            <div>
                              <span className="font-medium">{idx + 1}. {milestone.description || `Payment ${idx + 1}`}</span>
                              <span className="text-gray-500 ml-2">({pct}%)</span>
                              {formattedDate && <span className="text-gray-400 ml-2 text-xs">{formattedDate}</span>}
                            </div>
                            <div className="text-right">
                              <span className="font-medium">AED {formatCurrency(amount)}</span>
                              {isFirstPayment && upfrontAmount > 0 && (
                                <span className="text-red-600 ml-2">+ {formatCurrency(upfrontAmount)}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    <div className="pt-2 mt-2 border-t-2 border-gray-300">
                      <div className="flex justify-between font-bold">
                        <span>Total (Unit Price)</span>
                        <span>AED {formatCurrency(unitPrice)}</span>
                      </div>
                      {upfrontAmount > 0 && (
                        <p className="text-xs text-red-600 mt-1">
                          * First payment includes DLD + Admin = AED {formatCurrency(upfrontAmount)} (paid upfront)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sale Settings Section */}
          {activeSection === "sale" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="expected_sale_rate">Expected Sale Rate (AED/sqft)</Label>
                  <Input
                    id="expected_sale_rate"
                    type="number"
                    value={formData.expected_sale_rate}
                    onChange={(e) => handleChange("expected_sale_rate", e.target.value)}
                    placeholder="e.g., 2800"
                  />
                </div>
                <div>
                  <Label htmlFor="estimated_sell_date">Estimated Sell Date</Label>
                  <Input
                    id="estimated_sell_date"
                    type="date"
                    value={formData.estimated_sell_date}
                    onChange={(e) => handleChange("estimated_sell_date", e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="eligible_to_sell_after_percentage">Eligible to Sell After (%)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="eligible_to_sell_after_percentage"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.eligible_to_sell_after_percentage}
                    onChange={(e) => handleChange("eligible_to_sell_after_percentage", e.target.value)}
                    className="w-32"
                  />
                  <span className="text-gray-500">% of payments completed</span>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-sm text-gray-600">
                  <strong>Note:</strong> Expected Profit and XIRR calculations will be shown in the property details page after creation.
                </p>
              </div>
            </div>
          )}

          {/* Images Section */}
          {activeSection === "images" && (
            <div className="space-y-4">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-orange-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">Click to upload images</p>
                <p className="text-sm text-gray-400">Max 12 images (PNG, JPG)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>

              {(images.length > 0 || existingImages.length > 0) && (
                <div className="grid grid-cols-4 gap-4">
                  {existingImages.map((img, idx) => (
                    <div key={`existing-${idx}`} className="relative group">
                      <img src={img.url} alt="" className="w-full h-24 object-cover rounded-lg" />
                      <button
                        type="button"
                        onClick={() => removeExistingImage(img.id)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {images.map((img, idx) => (
                    <div key={`new-${idx}`} className="relative group">
                      <img src={img.preview} alt="" className="w-full h-24 object-cover rounded-lg" />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Presentations Section */}
          {activeSection === "presentations" && (
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h3 className="font-medium text-blue-800 mb-2">Property Presentations</h3>
                <p className="text-sm text-blue-600">Upload brochures, floor plans, or presentation files (PDF, PPT, PPTX). These will be available for download by clients and sub-brokers.</p>
              </div>
              
              <label className="block border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.ppt,.pptx,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files);
                    const totalPresentations = presentations.length + existingPresentations.length + files.length;
                    if (totalPresentations > 10) {
                      toast.error("Maximum 10 presentation files allowed");
                      return;
                    }
                    const newPresentations = files.map(file => ({
                      file,
                      name: file.name,
                      size: file.size,
                      type: file.type
                    }));
                    setPresentations([...presentations, ...newPresentations]);
                  }}
                />
                <Upload className="h-10 w-10 text-blue-400 mx-auto mb-2" />
                <p className="text-gray-600">Click to upload presentations</p>
                <p className="text-sm text-gray-400">PDF, PPT, PPTX, DOC, DOCX (Max 10 files)</p>
              </label>
              
              {(presentations.length > 0 || existingPresentations.length > 0) && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Uploaded Files:</p>
                  {existingPresentations.map((pres, idx) => (
                    <div key={`existing-pres-${idx}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="font-medium text-gray-800">{pres.filename || pres.name}</p>
                          <p className="text-xs text-gray-500">{(pres.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (opportunity?.id && pres.id) {
                            try {
                              await axios.delete(`${API}/real-estate-opportunities/${opportunity.id}/presentations/${pres.id}`, {
                                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                              });
                              toast.success("Presentation deleted");
                            } catch (err) {
                              toast.error("Failed to delete presentation");
                              return;
                            }
                          }
                          setExistingPresentations(existingPresentations.filter((_, i) => i !== idx));
                        }}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {presentations.map((pres, idx) => (
                    <div key={`new-pres-${idx}`} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="font-medium text-gray-800">{pres.name}</p>
                          <p className="text-xs text-gray-500">{(pres.size / 1024).toFixed(1)} KB • New</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPresentations(presentations.filter((_, i) => i !== idx))}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>

        {/* Footer - Fixed */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {loading ? "Saving..." : isEditing ? "Update Property" : "Create Property"}
          </Button>
        </div>
      </div>
    </div>
  );
}
