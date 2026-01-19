import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import EditBondModal from "@/components/EditBondModal";
import { Plus, Edit2, Trash2, Upload, CheckCircle, Clock, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AdminBonds() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bonds, setBonds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingBond, setEditingBond] = useState(null);
  const [verifyingBond, setVerifyingBond] = useState(null);
  const [verificationFile, setVerificationFile] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  // Set page title
  useEffect(() => {
    document.title = "Kinntegraa | Bonds";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "broker") {
      navigate("/sub-broker/opportunities");
      return;
    }
    
    setUser(parsedUser);
    fetchBonds();
  }, [navigate]);

  const fetchBonds = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/bonds`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBonds(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching bonds:", error);
      setLoading(false);
    }
  };

  const handleDelete = async (bondId, bondName) => {
    if (!window.confirm(`Delete "${bondName}"? This cannot be undone.`)) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/bonds/${bondId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Bond deleted successfully");
      fetchBonds();
    } catch (error) {
      console.error("Error deleting bond:", error);
      toast.error("Failed to delete bond");
    }
  };

  const handleVerifyPricing = async () => {
    if (!verificationFile || !verifyingBond) return;
    
    setVerificationLoading(true);
    setVerificationResult(null);
    
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append('file', verificationFile);
      
      const response = await axios.post(
        `${API}/bonds/${verifyingBond.id}/verify-pricing`,
        formData,
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      
      setVerificationResult(response.data);
      
      if (response.data.verification_passed) {
        toast.success("Price verification passed! Bond is now ACTIVE.");
        fetchBonds();
      } else {
        toast.error(`Price verification failed. ${response.data.summary.mismatched} date(s) mismatched.`);
      }
    } catch (error) {
      console.error("Error verifying pricing:", error);
      toast.error(error.response?.data?.detail || "Failed to verify pricing");
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleActivateBond = async (bondId) => {
    if (!window.confirm("Are you sure you want to manually activate this bond without price verification?")) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/bonds/${bondId}/activate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Bond activated successfully");
      fetchBonds();
    } catch (error) {
      console.error("Error activating bond:", error);
      toast.error("Failed to activate bond");
    }
  };

  const handleDeactivateBond = async (bondId) => {
    if (!window.confirm("Are you sure you want to deactivate this bond?")) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/bonds/${bondId}/deactivate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Bond deactivated successfully");
      fetchBonds();
    } catch (error) {
      console.error("Error deactivating bond:", error);
      toast.error("Failed to deactivate bond");
    }
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800" data-testid="admin-bonds-title">Admin - Bonds</h1>
              <p className="text-sm text-gray-500 mt-1">Manage all bond listings</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => navigate('/broker/bulk-upload?tab=bonds')}
                data-testid="bulk-upload-bonds-btn"
              >
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
              <Button
                onClick={() => navigate("/bonds/create")}
                className="bg-amber-700 hover:bg-amber-800"
                data-testid="add-bond-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Bond
              </Button>
            </div>
          </div>
        </div>

        {/* Bonds Table */}
        <div className="p-8">
          {loading ? (
            <p className="text-center text-gray-500 py-12">Loading...</p>
          ) : bonds.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No bonds created yet</p>
              <Button onClick={() => navigate("/bonds/create")}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Bond
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Bond Name</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Principal</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">IRR</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Units</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bonds.map((bond) => {
                    const unitsAvailable = (bond.total_units || 1) - (bond.units_sold || 0);
                    const isFullyFunded = unitsAvailable === 0;

                    return (
                      <tr key={bond.id} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`bond-row-${bond.id}`}>
                        <td className="py-4 px-6 font-medium">{bond.name}</td>
                        <td className="py-4 px-6 font-mono">₹{bond.principal_amount.toLocaleString()}</td>
                        <td className="py-4 px-6 font-mono text-amber-600">{bond.secondary_irr}%</td>
                        <td className="py-4 px-6 font-mono">{unitsAvailable}/{bond.total_units || 1}</td>
                        <td className="py-4 px-6">
                          {isFullyFunded ? (
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full">Funded</span>
                          ) : (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Available</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingBond(bond)}
                              data-testid={`edit-bond-${bond.id}`}
                              title="Edit bond"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(bond.id, bond.name)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              data-testid={`delete-bond-${bond.id}`}
                              title="Delete bond"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Bond Modal */}
      {editingBond && (
        <EditBondModal
          bond={editingBond}
          onClose={() => setEditingBond(null)}
          onSuccess={() => {
            setEditingBond(null);
            fetchBonds();
          }}
        />
      )}
    </div>
  );
}
