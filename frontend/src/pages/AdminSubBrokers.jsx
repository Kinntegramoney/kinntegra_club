import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import CreatePartnerModal from "@/components/CreatePartnerModal";
import EditPartnerModal from "@/components/EditPartnerModal";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AdminSubBrokers() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);

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
    fetchPartners();
  }, [navigate]);

  const fetchPartners = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/partners`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPartners(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching partners:", error);
      setLoading(false);
    }
  };

  const handleDelete = async (partnerId, partnerName) => {
    if (!window.confirm(`Delete sub-broker "${partnerName}"? This cannot be undone.`)) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/partners/${partnerId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Sub-broker deleted successfully");
      fetchPartners();
    } catch (error) {
      console.error("Error deleting partner:", error);
      toast.error("Failed to delete sub-broker");
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
              <h1 className="text-2xl font-bold text-gray-800" data-testid="admin-subbrokers-title">Admin - Sub Brokers</h1>
              <p className="text-sm text-gray-500 mt-1">Manage all sub-broker partners</p>
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-amber-700 hover:bg-amber-800"
              data-testid="create-subbroker-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Sub Broker
            </Button>
          </div>
        </div>

        {/* Partners Table */}
        <div className="p-8">
          {loading ? (
            <p className="text-center text-gray-500 py-12">Loading...</p>
          ) : partners.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No sub-brokers created yet</p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Sub Broker
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Partner Name</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Code</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Mobile</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Location</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner) => {
                    const initials = partner.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

                    return (
                      <tr key={partner.id} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`partner-row-${partner.id}`}>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm"
                              style={{ backgroundColor: partner.color || '#78716C' }}
                            >
                              {initials}
                            </div>
                            <span className="font-medium">{partner.name}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 font-mono text-sm">{partner.partner_code}</td>
                        <td className="py-4 px-6 text-sm">{partner.email}</td>
                        <td className="py-4 px-6 text-sm font-mono">{partner.mobile}</td>
                        <td className="py-4 px-6 text-sm">{partner.city}, {partner.state}</td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingPartner(partner)}
                              data-testid={`edit-partner-${partner.id}`}
                              title="Edit sub-broker"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(partner.id, partner.name)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              data-testid={`delete-partner-${partner.id}`}
                              title="Delete sub-broker"
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

      {/* Create Modal */}
      {showCreateModal && (
        <CreatePartnerModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchPartners();
          }}
        />
      )}

      {/* Edit Modal */}
      {editingPartner && (
        <EditPartnerModal
          partner={editingPartner}
          onClose={() => setEditingPartner(null)}
          onSuccess={() => {
            setEditingPartner(null);
            fetchPartners();
          }}
        />
      )}
    </div>
  );
}
