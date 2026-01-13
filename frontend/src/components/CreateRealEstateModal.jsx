import { useState, useRef } from "react";
import { 
  X, Building2, MapPin, DollarSign, Ruler, Calendar, Upload, 
  Image, Trash2, Info, Plus, Car, Layers
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
    dld_fee: opportunity?.dld_fee || "",
    admin_fee: opportunity?.admin_fee || "",
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
    
    // Investment
    time_frame_days: opportunity?.time_frame_days || "",
    
    // Optional
    developer_name: opportunity?.developer_name || "",
    location: opportunity?.location || "",
    amenities: opportunity?.amenities?.join(", ") || "",
    handover_date: opportunity?.handover_date || "",
    payment_plan: opportunity?.payment_plan || "",
    description: opportunity?.description || ""
  });

  const [images, setImages] = useState([]);
  const [existingImages, setExistingImages] = useState(opportunity?.images || []);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");

  // Calculate totals
  const calculateTotalCost = () => {
    const price = parseFloat(formData.unit_price) || 0;
    const dld = parseFloat(formData.dld_fee) || 0;
    const admin = parseFloat(formData.admin_fee) || 0;
    const broker = parseFloat(formData.broker_fee) || 0;
    const other = parseFloat(formData.other_fees) || 0;
    return price + dld + admin + broker + other;
  };

  const calculateFractionalUnits = () => {
    const total = calculateTotalCost();
    const units = Math.ceil(total / 500);
    const adjustedTotal = units * 500;
    return { units, adjustedTotal, adjustment: adjustedTotal - total };
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    const totalImages = existingImages.length + images.length + files.length;
    
    if (totalImages > 12) {
      toast.error(`Maximum 12 images allowed. You can add ${12 - existingImages.length - images.length} more.`);
      return;
    }

    // Validate file types
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const validFiles = files.filter(f => validTypes.includes(f.type));
    
    if (validFiles.length !== files.length) {
      toast.warning("Some files were skipped. Only JPEG, PNG, WebP, and GIF are allowed.");
    }

    // Create preview URLs
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
        !formData.total_area || !formData.carpet_area || !formData.floor || 
        !formData.time_frame_days) {
      toast.error("Please fill all required fields");
      return;
    }

    setLoading(true);
    
    try {
      const token = localStorage.getItem("token");
      
      const payload = {
        building_name: formData.building_name,
        unit_no: formData.unit_no,
        property_type: formData.property_type,
        unit_price: parseFloat(formData.unit_price),
        dld_fee: parseFloat(formData.dld_fee) || 0,
        admin_fee: parseFloat(formData.admin_fee) || 0,
        broker_fee: parseFloat(formData.broker_fee) || 0,
        other_fees: parseFloat(formData.other_fees) || 0,
        total_area: parseFloat(formData.total_area),
        carpet_area: parseFloat(formData.carpet_area),
        balcony_area: parseFloat(formData.balcony_area) || 0,
        unit_type: formData.unit_type,
        floor: parseInt(formData.floor),
        parking_spaces: parseInt(formData.parking_spaces) || 0,
        time_frame_days: parseInt(formData.time_frame_days),
        developer_name: formData.developer_name || null,
        location: formData.location || null,
        amenities: formData.amenities ? formData.amenities.split(",").map(a => a.trim()).filter(Boolean) : [],
        handover_date: formData.handover_date || null,
        payment_plan: formData.payment_plan || null,
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
  const fractionalInfo = formData.property_type === 'fractional' ? calculateFractionalUnits() : null;

  const sections = [
    { id: "basic", label: "Basic Info", icon: Building2 },
    { id: "pricing", label: "Pricing", icon: DollarSign },
    { id: "area", label: "Area & Details", icon: Ruler },
    { id: "investment", label: "Investment", icon: Calendar },
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
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
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
                  <Select 
                    value={formData.property_type} 
                    onValueChange={(v) => handleChange("property_type", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off_plan">Off-Plan (Max 4 Investors)</SelectItem>
                      <SelectItem value="fractional">Fractional (Units of 500 AED)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="unit_type">Unit Type *</Label>
                  <Select 
                    value={formData.unit_type} 
                    onValueChange={(v) => handleChange("unit_type", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                    placeholder="e.g., Dubai Marina, Dubai"
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

              {/* Property Type Info */}
              <div className={`p-4 rounded-lg ${formData.property_type === 'off_plan' ? 'bg-purple-50 border border-purple-200' : 'bg-amber-50 border border-amber-200'}`}>
                <div className="flex items-start gap-3">
                  <Info className={`h-5 w-5 flex-shrink-0 mt-0.5 ${formData.property_type === 'off_plan' ? 'text-purple-600' : 'text-amber-600'}`} />
                  <div>
                    {formData.property_type === 'off_plan' ? (
                      <>
                        <p className="font-medium text-purple-800">Off-Plan Property</p>
                        <p className="text-sm text-purple-600 mt-1">
                          Maximum 4 investors allowed. Each investor gets 25% share of the property.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-amber-800">Fractional Investment</p>
                        <p className="text-sm text-amber-600 mt-1">
                          Total cost will be divided into units of 500 AED. Each unit can be purchased by different investors.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pricing Section */}
          {activeSection === "pricing" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                <div>
                  <Label htmlFor="dld_fee">DLD Fee (AED)</Label>
                  <Input
                    id="dld_fee"
                    type="number"
                    value={formData.dld_fee}
                    onChange={(e) => handleChange("dld_fee", e.target.value)}
                    placeholder="Dubai Land Department fee"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="admin_fee">Admin Fee (AED)</Label>
                  <Input
                    id="admin_fee"
                    type="number"
                    value={formData.admin_fee}
                    onChange={(e) => handleChange("admin_fee", e.target.value)}
                    placeholder="Administrative charges"
                  />
                </div>
                <div>
                  <Label htmlFor="broker_fee">Broker Fee (AED)</Label>
                  <Input
                    id="broker_fee"
                    type="number"
                    value={formData.broker_fee}
                    onChange={(e) => handleChange("broker_fee", e.target.value)}
                    placeholder="Broker commission"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="other_fees">Other Fees (AED)</Label>
                <Input
                  id="other_fees"
                  type="number"
                  value={formData.other_fees}
                  onChange={(e) => handleChange("other_fees", e.target.value)}
                  placeholder="Any additional fees"
                />
              </div>

              {/* Total Calculation */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="font-medium text-gray-700 mb-3">Cost Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Unit Price</span>
                    <span>{(parseFloat(formData.unit_price) || 0).toLocaleString()} AED</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">DLD Fee</span>
                    <span>{(parseFloat(formData.dld_fee) || 0).toLocaleString()} AED</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Admin Fee</span>
                    <span>{(parseFloat(formData.admin_fee) || 0).toLocaleString()} AED</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Broker Fee</span>
                    <span>{(parseFloat(formData.broker_fee) || 0).toLocaleString()} AED</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Other Fees</span>
                    <span>{(parseFloat(formData.other_fees) || 0).toLocaleString()} AED</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold text-base">
                    <span>Total Investment</span>
                    <span className="text-teal-600">{totalCost.toLocaleString()} AED</span>
                  </div>
                </div>

                {formData.property_type === 'fractional' && fractionalInfo && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h5 className="font-medium text-amber-700 mb-2">Fractional Units Calculation</h5>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Unit Value</span>
                        <span>500 AED</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Total Units</span>
                        <span className="font-medium">{fractionalInfo.units}</span>
                      </div>
                      {fractionalInfo.adjustment > 0 && (
                        <div className="flex justify-between text-amber-600">
                          <span>Adjustment (rounded up)</span>
                          <span>+{fractionalInfo.adjustment.toFixed(2)} AED</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold">
                        <span>Adjusted Total</span>
                        <span>{fractionalInfo.adjustedTotal.toLocaleString()} AED</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Area & Details Section */}
          {activeSection === "area" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="total_area">Total Area (sq.ft) *</Label>
                  <Input
                    id="total_area"
                    type="number"
                    value={formData.total_area}
                    onChange={(e) => handleChange("total_area", e.target.value)}
                    placeholder="Total gross area"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="carpet_area">Carpet Area (sq.ft) *</Label>
                  <Input
                    id="carpet_area"
                    type="number"
                    value={formData.carpet_area}
                    onChange={(e) => handleChange("carpet_area", e.target.value)}
                    placeholder="Usable living space"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="balcony_area">Balcony Area (sq.ft)</Label>
                  <Input
                    id="balcony_area"
                    type="number"
                    value={formData.balcony_area}
                    onChange={(e) => handleChange("balcony_area", e.target.value)}
                    placeholder="Balcony space"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="floor">Floor Number *</Label>
                  <Input
                    id="floor"
                    type="number"
                    value={formData.floor}
                    onChange={(e) => handleChange("floor", e.target.value)}
                    placeholder="e.g., 15"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="parking_spaces">Parking Spaces</Label>
                  <Input
                    id="parking_spaces"
                    type="number"
                    value={formData.parking_spaces}
                    onChange={(e) => handleChange("parking_spaces", e.target.value)}
                    placeholder="Number of parking spots"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="amenities">Amenities (comma-separated)</Label>
                <Input
                  id="amenities"
                  value={formData.amenities}
                  onChange={(e) => handleChange("amenities", e.target.value)}
                  placeholder="e.g., Pool, Gym, Concierge, Beach Access"
                />
              </div>

              {/* Area Ratio Display */}
              {parseFloat(formData.carpet_area) > 0 && parseFloat(formData.balcony_area) > 0 && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Layers className="h-5 w-5" />
                    <span className="font-medium">Balcony to Carpet Ratio</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-800 mt-1">
                    {((parseFloat(formData.balcony_area) / parseFloat(formData.carpet_area)) * 100).toFixed(1)}%
                  </p>
                  <p className="text-sm text-blue-600">
                    {parseFloat(formData.balcony_area)} sqft balcony for {parseFloat(formData.carpet_area)} sqft carpet area
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Investment Section */}
          {activeSection === "investment" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="time_frame_days">Investment Time Frame (Days) *</Label>
                <Input
                  id="time_frame_days"
                  type="number"
                  value={formData.time_frame_days}
                  onChange={(e) => handleChange("time_frame_days", e.target.value)}
                  placeholder="e.g., 365"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Number of days for the investment period
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

              <div>
                <Label htmlFor="payment_plan">Payment Plan Details</Label>
                <Textarea
                  id="payment_plan"
                  value={formData.payment_plan}
                  onChange={(e) => handleChange("payment_plan", e.target.value)}
                  placeholder="e.g., 20% down payment, 40% during construction, 40% on handover"
                  rows={3}
                />
              </div>

              {/* Investment Summary */}
              <div className={`p-4 rounded-lg border ${formData.property_type === 'off_plan' ? 'bg-purple-50 border-purple-200' : 'bg-amber-50 border-amber-200'}`}>
                <h4 className={`font-medium mb-3 ${formData.property_type === 'off_plan' ? 'text-purple-800' : 'text-amber-800'}`}>
                  Investment Summary
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Property Type</span>
                    <span className="font-medium">{formData.property_type === 'off_plan' ? 'Off-Plan' : 'Fractional'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Investment</span>
                    <span className="font-medium">{totalCost.toLocaleString()} AED</span>
                  </div>
                  {formData.property_type === 'off_plan' ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Max Investors</span>
                        <span className="font-medium">4</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Per Investor (25%)</span>
                        <span className="font-medium">{(totalCost / 4).toLocaleString()} AED</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Unit Value</span>
                        <span className="font-medium">500 AED</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Units Available</span>
                        <span className="font-medium">{fractionalInfo?.units || 0}</span>
                      </div>
                    </>
                  )}
                  {formData.time_frame_days && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Investment Period</span>
                      <span className="font-medium">{formData.time_frame_days} days</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Images Section */}
          {activeSection === "images" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Property Images</Label>
                  <p className="text-sm text-gray-500">
                    Upload up to 12 images (JPEG, PNG, WebP, GIF)
                  </p>
                </div>
                <span className="text-sm text-gray-500">
                  {existingImages.length + images.length} / 12
                </span>
              </div>

              {/* Upload Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">Click to upload or drag and drop</p>
                <p className="text-sm text-gray-400 mt-1">Max 12 images allowed</p>
              </div>

              {/* Existing Images */}
              {existingImages.length > 0 && (
                <div>
                  <Label className="mb-2 block">Existing Images</Label>
                  <div className="grid grid-cols-4 gap-3">
                    {existingImages.map((img) => (
                      <div key={img.id} className="relative group">
                        <img
                          src={`data:${img.content_type};base64,${img.data}`}
                          alt={img.filename}
                          className="w-full h-24 object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => removeExistingImage(img.id)}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New Images Preview */}
              {images.length > 0 && (
                <div>
                  <Label className="mb-2 block">New Images to Upload</Label>
                  <div className="grid grid-cols-4 gap-3">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={img.preview}
                          alt={img.name}
                          className="w-full h-24 object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <span className="absolute bottom-1 left-1 right-1 bg-black/60 text-white text-xs px-1 py-0.5 rounded truncate">
                          {img.name}
                        </span>
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
          <div className="text-sm text-gray-500">
            {activeSection !== "basic" && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  const idx = sections.findIndex(s => s.id === activeSection);
                  if (idx > 0) setActiveSection(sections[idx - 1].id);
                }}
              >
                ← Previous
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {activeSection !== "images" ? (
              <Button
                type="button"
                onClick={() => {
                  const idx = sections.findIndex(s => s.id === activeSection);
                  if (idx < sections.length - 1) setActiveSection(sections[idx + 1].id);
                }}
                className="bg-teal-600 hover:bg-teal-700"
              >
                Next →
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-teal-600 hover:bg-teal-700"
              >
                {loading ? "Saving..." : isEditing ? "Update Opportunity" : "Create Opportunity"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
