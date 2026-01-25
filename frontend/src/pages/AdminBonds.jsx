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
      // Handle both old format (array) and new paginated format
      const data = Array.isArray(response.data) 
        ? response.data 
        : (response.data?.data || []);
      setBonds(data);
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
                className="bg-etihad-gold-700 hover:bg-etihad-gold-800"
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
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Listing</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bonds.map((bond) => {
                    const unitsAvailable = (bond.total_units || 1) - (bond.units_sold || 0);
                    const isFullyFunded = unitsAvailable === 0;
                    const listingStatus = bond.listing_status || 'pending';
                    const isActive = listingStatus === 'active';

                    return (
                      <tr key={bond.id} className={`border-t border-gray-100 hover:bg-gray-50 ${!isActive ? 'bg-etihad-gold-50/30' : ''}`} data-testid={`bond-row-${bond.id}`}>
                        <td className="py-4 px-6">
                          <div>
                            <span className="font-medium">{bond.name}</span>
                            <span className="text-xs text-gray-400 ml-2">({bond.bond_code})</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 font-mono">₹{bond.principal_amount?.toLocaleString()}</td>
                        <td className="py-4 px-6 font-mono text-etihad-gold-600">{bond.secondary_irr}%</td>
                        <td className="py-4 px-6 font-mono">{unitsAvailable}/{bond.total_units || 1}</td>
                        <td className="py-4 px-6">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                              <CheckCircle className="h-3 w-3" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-etihad-gold-100 text-etihad-gold-700 text-xs rounded-full">
                              <Clock className="h-3 w-3" />
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          {isFullyFunded ? (
                            <span className="px-2 py-1 bg-etihad-gold-100 text-etihad-gold-700 text-xs rounded-full">Funded</span>
                          ) : (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Available</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-end gap-1">
                            {!isActive && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setVerifyingBond(bond);
                                  setVerificationFile(null);
                                  setVerificationResult(null);
                                }}
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                data-testid={`verify-bond-${bond.id}`}
                                title="Verify Pricing"
                              >
                                <FileSpreadsheet className="h-4 w-4" />
                              </Button>
                            )}
                            {isActive && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeactivateBond(bond.id)}
                                className="text-etihad-gold-600 hover:text-etihad-gold-700 hover:bg-etihad-gold-50"
                                data-testid={`deactivate-bond-${bond.id}`}
                                title="Deactivate bond"
                              >
                                <Clock className="h-4 w-4" />
                              </Button>
                            )}
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

      {/* Price Verification Modal */}
      {verifyingBond && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Verify Bond Pricing</h2>
                <p className="text-sm text-gray-500">{verifyingBond.name} ({verifyingBond.bond_code})</p>
              </div>
              <button 
                onClick={() => {
                  setVerifyingBond(null);
                  setVerificationFile(null);
                  setVerificationResult(null);
                }} 
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-800 mb-2">Instructions</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Upload an Excel file with pricing data for the next 2 months</li>
                  <li>• Excel should have columns: <strong>Date</strong> and <strong>Price</strong> (or Expected Price)</li>
                  <li>• System will compare each date&apos;s calculated price with your expected price</li>
                  <li>• <strong>All prices must match exactly</strong> for the bond to be activated</li>
                </ul>
              </div>

              {/* File Upload */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Upload Verification Excel
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setVerificationFile(e.target.files[0])}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-etihad-gold-50 file:text-etihad-gold-700 hover:file:bg-etihad-gold-100"
                  data-testid="verification-file-input"
                />
                {verificationFile && (
                  <p className="text-sm text-green-600">Selected: {verificationFile.name}</p>
                )}
              </div>

              {/* Verify Button */}
              <div className="flex gap-3">
                <Button
                  onClick={handleVerifyPricing}
                  disabled={!verificationFile || verificationLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="verify-pricing-btn"
                >
                  {verificationLoading ? "Verifying..." : "Verify Pricing"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleActivateBond(verifyingBond.id)}
                  className="text-etihad-gold-600 border-etihad-gold-300 hover:bg-etihad-gold-50"
                  data-testid="manual-activate-btn"
                >
                  Activate Without Verification
                </Button>
              </div>

              {/* Verification Results */}
              {verificationResult && (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className={`p-4 rounded-lg border ${verificationResult.verification_passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {verificationResult.verification_passed ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <span className="text-red-600 text-xl">✗</span>
                      )}
                      <h3 className={`font-semibold ${verificationResult.verification_passed ? 'text-green-800' : 'text-red-800'}`}>
                        {verificationResult.verification_passed ? 'Verification Passed!' : 'Verification Failed'}
                      </h3>
                    </div>
                    <p className={`text-sm ${verificationResult.verification_passed ? 'text-green-700' : 'text-red-700'}`}>
                      {verificationResult.message}
                    </p>
                    <div className="mt-2 flex gap-4 text-sm">
                      <span className={verificationResult.verification_passed ? 'text-green-700' : 'text-gray-600'}>
                        Total Dates: {verificationResult.summary.total_dates_checked}
                      </span>
                      <span className="text-green-600">
                        Matched: {verificationResult.summary.matched}
                      </span>
                      {verificationResult.summary.mismatched > 0 && (
                        <span className="text-red-600">
                          Mismatched: {verificationResult.summary.mismatched}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Detailed Results Table */}
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Row</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Date</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">Expected</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">System</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">Diff</th>
                          <th className="text-center py-2 px-3 font-medium text-gray-600">Match</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verificationResult.comparison_details.map((item, idx) => (
                          <tr key={idx} className={`border-t ${item.match ? '' : 'bg-red-50'}`}>
                            <td className="py-2 px-3 text-gray-500">{item.row}</td>
                            <td className="py-2 px-3">{item.date}</td>
                            <td className="py-2 px-3 text-right font-mono">
                              {item.expected_price?.toLocaleString() || '-'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">
                              {item.system_price?.toLocaleString() || '-'}
                            </td>
                            <td className={`py-2 px-3 text-right font-mono ${item.difference !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {item.difference !== undefined ? item.difference.toLocaleString() : (item.error || '-')}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {item.match ? (
                                <CheckCircle className="h-4 w-4 text-green-600 inline" />
                              ) : (
                                <span className="text-red-600">✗</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setVerifyingBond(null);
                  setVerificationFile(null);
                  setVerificationResult(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
