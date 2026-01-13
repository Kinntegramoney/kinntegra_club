import { useState, useRef } from "react";
import { 
  X, Building2, MapPin, DollarSign, Ruler, Calendar, Upload, 
  Image, Trash2, Info, Plus, Percent, CalendarDays
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
    property_type: opportunity?.property_type || "off_plan",
    
    // Pricing
    unit_price: opportunity?.unit_price || "",
    
    // DLD Fees
    dld_fee_percentage: opportunity?.dld_fee_percentage || 4,
    dld_fee_amount: opportunity?.dld_fee_amount || "",
    
    // Admin Fees
    admin_fee_percentage: opportunity?.admin_fee_percentage || 0,
    admin_fee_amount: opportunity?.admin_fee_amount || "",
    
    // Other Fees
    broker_fee: opportunity?.broker_fee || "",
    other_fees: opportunity?.other_fees || "",
    
    // Area
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
    amenities: opportunity?.amenities?.join(", ") || "",
    handover_date: opportunity?.handover_date || "",
    description: opportunity?.description || ""
  });

  // Payment Schedule (like principal repayments)
  const [paymentSchedule, setPaymentSchedule] = useState(
    opportunity?.payment_schedule?.map(p => ({
      date: p.date,
      percentage: p.percentage,
      description: p.description || ""
    })) || []
  );

  const [images, setImages] = useState([]);
  const [existingImages, setExistingImages] = useState(opportunity?.images || []);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");

  // Calculate totals
  const calculateDldFee = () => {
    if (formData.dld_fee_amount) return parseFloat(formData.dld_fee_amount);
    const price = parseFloat(formData.unit_price) || 0;
    return price * (parseFloat(formData.dld_fee_percentage) || 0) / 100;
  };

  const calculateAdminFee = () => {
    if (formData.admin_fee_amount) return parseFloat(formData.admin_fee_amount);
    const price = parseFloat(formData.unit_price) || 0;
    return price * (parseFloat(formData.admin_fee_percentage) || 0) / 100;
  };

  const calculateTotalCost = () => {
    const price = parseFloat(formData.unit_price) || 0;
    const dld = calculateDldFee();
    const admin = calculateAdminFee();
    const broker = parseFloat(formData.broker_fee) || 0;
    const other = parseFloat(formData.other_fees) || 0;
    return price + dld + admin + broker + other;
  };

  const getTotalPaymentPercentage = () => {
    return paymentSchedule.reduce((sum, p) => sum + (parseFloat(p.percentage) || 0), 0);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Payment Schedule Methods
  const addPaymentMilestone = () => {
    setPaymentSchedule(prev => [...prev, { date: "", percentage: "", description: "" }]);
  };

  const updatePaymentMilestone = (index, field, value) => {
    setPaymentSchedule(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removePaymentMilestone = (index) => {
    setPaymentSchedule(prev => prev.filter((_, i) => i !== index));
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    const totalImages = existingImages.length + images.length + files.length;
    
    if (totalImages > 12) {
      toast.error(`Maximum 12 images allowed. You can add ${12 - existingImages.length - images.length} more.`);
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const validFiles = files.filter(f => validTypes.includes(f.type));
    
    if (validFiles.length !== files.length) {
      toast.warning("Some files were skipped. Only JPEG, PNG, WebP, and GIF are allowed.");
    }

    const newImages = validFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name
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
      console.error("Error removing image:", error);
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

    // Validate payment schedule totals 100% for off-plan
    if (formData.property_type === 'off_plan' && paymentSchedule.length > 0) {
      const totalPercent = getTotalPaymentPercentage();
      if (Math.abs(totalPercent - 100) > 0.01) {
        toast.error(`Payment schedule must total 100%. Current: ${totalPercent.toFixed(1)}%`);
        return;
      }
    }

    setLoading(true);
    
    try {
      const token = localStorage.getItem("token");
      
      const payload = {
        building_name: formData.building_name,
        unit_no: formData.unit_no,
        property_type: formData.property_type,
        unit_price: parseFloat(formData.unit_price),
        dld_fee_percentage: parseFloat(formData.dld_fee_percentage) || 4,
        dld_fee_amount: formData.dld_fee_amount ? parseFloat(formData.dld_fee_amount) : null,
        admin_fee_percentage: parseFloat(formData.admin_fee_percentage) || 0,
        admin_fee_amount: formData.admin_fee_amount ? parseFloat(formData.admin_fee_amount) : null,
        broker_fee: parseFloat(formData.broker_fee) || 0,
        other_fees: parseFloat(formData.other_fees) || 0,
        total_area: parseFloat(formData.total_area),
        carpet_area: parseFloat(formData.carpet_area),
        balcony_area: parseFloat(formData.balcony_area) || 0,
        unit_type: formData.unit_type,
        floor: parseInt(formData.floor),
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
        amenities: formData.amenities ? formData.amenities.split(",").map(a => a.trim()).filter(Boolean) : [],
        handover_date: formData.handover_date || null,
        description: formData.description || null
      };

      let opportunityId;

      if (isEditing) {
        await axios.put(`${API}/real-estate-opportunities/${opportunity.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        opportunityId = opportunity.id;
        toast.success("Opportunity updated successfully");
      } else {
        const response = await axios.post(`${API}/real-estate-opportunities`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        opportunityId = response.data.id;
        toast.success("Opportunity created successfully");
      }

      // Upload new images if any
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
        toast.success(`${images.length} images uploaded`);
      }

      onSuccess();
    } catch (error) {
      console.error("Error:", error);
      toast.error(error.response?.data?.detail || "Failed to save opportunity");
    } finally {
      setLoading(false);
    }
  };

  const totalCost = calculateTotalCost();
  const dldFee = calculateDldFee();
  const adminFee = calculateAdminFee();

  const sections = [
    { id: "basic", label: "Basic Info", icon: Building2 },
    { id: "fees", label: "DLD & Fees", icon: DollarSign },
    { id: "area", label: "Area", icon: Ruler },
    { id: "payments", label: "Payment Schedule", icon: CalendarDays },
    { id: "sale", label: "Sale Settings", icon: Calendar },
    { id: "images", label: "Images", icon: Image }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <Building2 className="h-5 w-5 text-teal-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                {isEditing ? "Edit Real Estate Opportunity" : "Add Real Estate Opportunity"}
              </h2>
              <p className="text-sm text-gray-500">Fill in the property details</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="flex border-b border-gray-200 px-6 overflow-x-auto">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                activeSection === section.id
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <section.icon className="h-4 w-4" />
              {section.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {/* Basic Info Section */}
          {activeSection === "basic" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="building_name">Building/Project Name *</Label>
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
                    placeholder="e.g., 1501-A"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="property_type">Property Type *</Label>
                  <Select value={formData.property_type} onValueChange={(v) => handleChange("property_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off_plan">Off-Plan (Max 4 Investors)</SelectItem>
                      <SelectItem value="fractional">Fractional (Max $50K/investor)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="unit_type">Unit Type *</Label>
                  <Select value={formData.unit_type} onValueChange={(v) => handleChange("unit_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Studio">Studio</SelectItem>
                      <SelectItem value="1BR">1 Bedroom</SelectItem>
                      <SelectItem value="2BR">2 Bedroom</SelectItem>
                      <SelectItem value="3BR">3 Bedroom</SelectItem>
                      <SelectItem value="Penthouse">Penthouse</SelectItem>
                      <SelectItem value="Villa">Villa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="developer_name">Developer Name</Label>
                  <Input
                    id="developer_name"
                    value={formData.developer_name}
                    onChange={(e) => handleChange("developer_name", e.target.value)}
                    placeholder="e.g., Emaar Properties"
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

              {/* Type Info */}
              <div className={`p-4 rounded-lg ${formData.property_type === 'off_plan' ? 'bg-purple-50 border border-purple-200' : 'bg-amber-50 border border-amber-200'}`}>
                <div className="flex items-start gap-3">
                  <Info className={`h-5 w-5 flex-shrink-0 mt-0.5 ${formData.property_type === 'off_plan' ? 'text-purple-600' : 'text-amber-600'}`} />
                  <div>
                    {formData.property_type === 'off_plan' ? (
                      <>
                        <p className="font-medium text-purple-800">Off-Plan Property</p>
                        <p className="text-sm text-purple-600 mt-1">Maximum 4 investors. Each gets 25% share. Payment schedule required.</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-amber-800">Fractional Investment</p>
                        <p className="text-sm text-amber-600 mt-1">Maximum $50,000 USD (~183,500 AED) per investor.</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DLD & Fees Section */}
          {activeSection === "fees" && (
            <div className="space-y-6">
              {/* Unit Price */}
              <div>
                <Label htmlFor="unit_price">Unit Price (AED) *</Label>
                <Input
                  id="unit_price"
                  type="number"
                  value={formData.unit_price}
                  onChange={(e) => handleChange("unit_price", e.target.value)}
                  placeholder="e.g., 2000000"
                  required
                />
              </div>

              {/* DLD Fees Section */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h4 className="font-medium text-blue-800 mb-3 flex items-center gap-2">
                  <Percent className="h-4 w-4" /> DLD Fee (Dubai Land Department)
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dld_fee_percentage">DLD Fee %</Label>
                    <Input
                      id="dld_fee_percentage"
                      type="number"
                      step="0.1"
                      value={formData.dld_fee_percentage}
                      onChange={(e) => handleChange("dld_fee_percentage", e.target.value)}
                      placeholder="4"
                    />
                  </div>
                  <div>
                    <Label htmlFor="dld_fee_amount">Or Fixed Amount (AED)</Label>
                    <Input
                      id="dld_fee_amount"
                      type="number"
                      value={formData.dld_fee_amount}
                      onChange={(e) => handleChange("dld_fee_amount", e.target.value)}
                      placeholder="Leave empty to use %"
                    />
                  </div>
                </div>
                <p className="text-sm text-blue-600 mt-2">
                  Calculated: AED {dldFee.toLocaleString()}
                </p>
              </div>

              {/* Admin Fees Section */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <h4 className="font-medium text-green-800 mb-3 flex items-center gap-2">
                  <Percent className="h-4 w-4" /> Admin Fee
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="admin_fee_percentage">Admin Fee %</Label>
                    <Input
                      id="admin_fee_percentage"
                      type="number"
                      step="0.1"
                      value={formData.admin_fee_percentage}
                      onChange={(e) => handleChange("admin_fee_percentage", e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin_fee_amount">Or Fixed Amount (AED)</Label>
                    <Input
                      id="admin_fee_amount"
                      type="number"
                      value={formData.admin_fee_amount}
                      onChange={(e) => handleChange("admin_fee_amount", e.target.value)}
                      placeholder="Leave empty to use %"
                    />
                  </div>
                </div>
                <p className="text-sm text-green-600 mt-2">
                  Calculated: AED {adminFee.toLocaleString()}
                </p>
              </div>

              {/* Other Fees */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="broker_fee">Broker Fee (AED)</Label>
                  <Input
                    id="broker_fee"
                    type="number"
                    value={formData.broker_fee}
                    onChange={(e) => handleChange("broker_fee", e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label htmlFor="other_fees">Other Fees (AED)</Label>
                  <Input
                    id="other_fees"
                    type="number"
                    value={formData.other_fees}
                    onChange={(e) => handleChange("other_fees", e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Total Summary */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="font-medium text-gray-700 mb-3">Cost Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Unit Price</span><span>{(parseFloat(formData.unit_price) || 0).toLocaleString()} AED</span></div>
                  <div className="flex justify-between text-blue-600"><span>DLD Fee ({formData.dld_fee_percentage}%)</span><span>{dldFee.toLocaleString()} AED</span></div>
                  <div className="flex justify-between text-green-600"><span>Admin Fee ({formData.admin_fee_percentage}%)</span><span>{adminFee.toLocaleString()} AED</span></div>
                  <div className="flex justify-between"><span>Broker Fee</span><span>{(parseFloat(formData.broker_fee) || 0).toLocaleString()} AED</span></div>
                  <div className="flex justify-between"><span>Other Fees</span><span>{(parseFloat(formData.other_fees) || 0).toLocaleString()} AED</span></div>
                  <div className="flex justify-between pt-2 border-t font-semibold text-base">
                    <span>Total Investment</span>
                    <span className="text-teal-600">{totalCost.toLocaleString()} AED</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Area Section */}
          {activeSection === "area" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="total_area">Total Area (sq.ft) *</Label>
                  <Input id="total_area" type="number" value={formData.total_area} onChange={(e) => handleChange("total_area", e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="carpet_area">Carpet Area (sq.ft) *</Label>
                  <Input id="carpet_area" type="number" value={formData.carpet_area} onChange={(e) => handleChange("carpet_area", e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="balcony_area">Balcony Area (sq.ft)</Label>
                  <Input id="balcony_area" type="number" value={formData.balcony_area} onChange={(e) => handleChange("balcony_area", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="floor">Floor Number *</Label>
                  <Input id="floor" type="number" value={formData.floor} onChange={(e) => handleChange("floor", e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="parking_spaces">Parking Spaces</Label>
                  <Input id="parking_spaces" type="number" value={formData.parking_spaces} onChange={(e) => handleChange("parking_spaces", e.target.value)} />
                </div>
              </div>

              <div>
                <Label htmlFor="amenities">Amenities (comma-separated)</Label>
                <Input id="amenities" value={formData.amenities} onChange={(e) => handleChange("amenities", e.target.value)} placeholder="Pool, Gym, Concierge" />
              </div>
            </div>
          )}

          {/* Payment Schedule Section */}
          {activeSection === "payments" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-800">Payment Schedule</h3>
                  <p className="text-sm text-gray-500">Define payment milestones with dates and percentages</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addPaymentMilestone}>
                  <Plus className="h-4 w-4 mr-1" /> Add Milestone
                </Button>
              </div>

              {paymentSchedule.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  <CalendarDays className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No payment milestones added</p>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addPaymentMilestone}>
                    <Plus className="h-4 w-4 mr-1" /> Add First Milestone
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentSchedule.map((payment, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1 grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">Payment Date</Label>
                          <Input
                            type="date"
                            value={payment.date}
                            onChange={(e) => updatePaymentMilestone(idx, "date", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Percentage (%)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={payment.percentage}
                            onChange={(e) => updatePaymentMilestone(idx, "percentage", e.target.value)}
                            placeholder="e.g., 20"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Description</Label>
                          <Input
                            value={payment.description}
                            onChange={(e) => updatePaymentMilestone(idx, "description", e.target.value)}
                            placeholder="e.g., Booking"
                          />
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removePaymentMilestone(idx)} className="text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Total Percentage */}
              {paymentSchedule.length > 0 && (
                <div className={`p-4 rounded-lg ${Math.abs(getTotalPaymentPercentage() - 100) < 0.01 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Total Payment Percentage</span>
                    <span className={`text-lg font-bold ${Math.abs(getTotalPaymentPercentage() - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                      {getTotalPaymentPercentage().toFixed(1)}%
                    </span>
                  </div>
                  {formData.property_type === 'off_plan' && Math.abs(getTotalPaymentPercentage() - 100) > 0.01 && (
                    <p className="text-sm text-red-600 mt-1">Off-plan properties require payment schedule to total 100%</p>
                  )}
                </div>
              )}

              {/* Calculated Amounts */}
              {paymentSchedule.length > 0 && parseFloat(formData.unit_price) > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="font-medium text-gray-700 mb-3">Payment Amounts (Based on Unit Price)</h4>
                  <div className="space-y-2 text-sm">
                    {paymentSchedule.filter(p => p.date && p.percentage).map((p, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-gray-600">{p.description || `Payment ${idx + 1}`} ({p.percentage}%)</span>
                        <span className="font-medium">{((parseFloat(formData.unit_price) || 0) * parseFloat(p.percentage) / 100).toLocaleString()} AED</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sale Settings Section */}
          {activeSection === "sale" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="expected_sale_rate">Expected Sale Rate (AED/sqft)</Label>
                <Input
                  id="expected_sale_rate"
                  type="number"
                  value={formData.expected_sale_rate}
                  onChange={(e) => handleChange("expected_sale_rate", e.target.value)}
                  placeholder="e.g., 2500"
                />
                {formData.expected_sale_rate && formData.total_area && (
                  <p className="text-sm text-teal-600 mt-1">
                    Estimated Sale Value: AED {(parseFloat(formData.expected_sale_rate) * parseFloat(formData.total_area)).toLocaleString()}
                  </p>
                )}
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

              <div>
                <Label htmlFor="eligible_to_sell_after_percentage">Eligible to Sell After (% payments completed)</Label>
                <Input
                  id="eligible_to_sell_after_percentage"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={formData.eligible_to_sell_after_percentage}
                  onChange={(e) => handleChange("eligible_to_sell_after_percentage", e.target.value)}
                  placeholder="100"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Property becomes eligible to sell after this % of payments are made
                </p>
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

          {/* Images Section */}
          {activeSection === "images" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Property Images</Label>
                  <p className="text-sm text-gray-500">Upload up to 12 images</p>
                </div>
                <span className="text-sm text-gray-500">{existingImages.length + images.length} / 12</span>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors"
              >
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
                <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">Click to upload or drag and drop</p>
              </div>

              {existingImages.length > 0 && (
                <div>
                  <Label className="mb-2 block">Existing Images</Label>
                  <div className="grid grid-cols-4 gap-3">
                    {existingImages.map((img) => (
                      <div key={img.id} className="relative group">
                        <img src={`data:${img.content_type};base64,${img.data}`} alt={img.filename} className="w-full h-24 object-cover rounded-lg" />
                        <button type="button" onClick={() => removeExistingImage(img.id)} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {images.length > 0 && (
                <div>
                  <Label className="mb-2 block">New Images</Label>
                  <div className="grid grid-cols-4 gap-3">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative group">
                        <img src={img.preview} alt={img.name} className="w-full h-24 object-cover rounded-lg" />
                        <button type="button" onClick={() => removeImage(idx)} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          <div>
            {activeSection !== "basic" && (
              <Button type="button" variant="ghost" onClick={() => {
                const idx = sections.findIndex(s => s.id === activeSection);
                if (idx > 0) setActiveSection(sections[idx - 1].id);
              }}>
                ← Previous
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {activeSection !== "images" ? (
              <Button type="button" onClick={() => {
                const idx = sections.findIndex(s => s.id === activeSection);
                if (idx < sections.length - 1) setActiveSection(sections[idx + 1].id);
              }} className="bg-teal-600 hover:bg-teal-700">
                Next →
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading} className="bg-teal-600 hover:bg-teal-700">
                {loading ? "Saving..." : isEditing ? "Update" : "Create"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
