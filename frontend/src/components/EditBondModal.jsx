import { useState } from "react";
import axios from "axios";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function EditBondModal({ bond, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: bond.name || "",
    secondary_irr: bond.secondary_irr || "",
    total_units: bond.total_units || 1,
    units_sold: bond.units_sold || 0
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast.error("Bond name is required");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/bonds/${bond.id}`, {
        name: formData.name,
        secondary_irr: parseFloat(formData.secondary_irr),
        total_units: parseInt(formData.total_units),
        units_sold: parseInt(formData.units_sold)
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
      <div className="bg-white rounded-lg w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs text-gray-500 uppercase">Bond Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              data-testid="edit-bond-name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="secondary_irr" className="text-xs text-gray-500 uppercase">Secondary IRR (%)</Label>
            <Input
              id="secondary_irr"
              type="number"
              step="0.01"
              value={formData.secondary_irr}
              onChange={(e) => setFormData({...formData, secondary_irr: e.target.value})}
              data-testid="edit-bond-irr"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="total_units" className="text-xs text-gray-500 uppercase">Total Units</Label>
              <Input
                id="total_units"
                type="number"
                min="1"
                value={formData.total_units}
                onChange={(e) => setFormData({...formData, total_units: e.target.value})}
                data-testid="edit-bond-total-units"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="units_sold" className="text-xs text-gray-500 uppercase">Units Sold</Label>
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

          <div className="pt-4 flex justify-end gap-3">
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
              className="bg-amber-700 hover:bg-amber-800"
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
