import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import CreateClientModal from "@/components/CreateClientModal";
import { Plus, Edit2, Trash2, Link2, Unlink, TrendingUp, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AdminClients() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [partners, setPartners] = useState([]);
  const [bonds, setBonds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [linkingClient, setLinkingClient] = useState(null);
  const [allocatingClient, setAllocatingClient] = useState(null);

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
    fetchData();
  }, [navigate]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      const [clientsRes, partnersRes, bondsRes] = await Promise.all([
        axios.get(`${API}/clients`, { headers }),
        axios.get(`${API}/partners`, { headers }),
        axios.get(`${API}/bonds`, { headers })
      ]);
      
      setClients(clientsRes.data);
      setPartners(partnersRes.data);
      setBonds(bondsRes.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  const handleDelete = async (clientId, clientName) => {
    if (!window.confirm(`Delete client "${clientName}"? This cannot be undone.`)) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/clients/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Client deleted successfully");
      fetchData();
    } catch (error) {
      console.error("Error deleting client:", error);
      toast.error("Failed to delete client");
    }
  };

  const handleLinkSubbroker = async (clientId, subbrokerId) => {
    try {
      const token = localStorage.getItem("token");
      
      if (subbrokerId) {
        await axios.post(`${API}/clients/${clientId}/link-subbroker?subbroker_id=${subbrokerId}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Client linked to sub-broker");
      } else {
        await axios.post(`${API}/clients/${clientId}/unlink-subbroker`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Client unlinked from sub-broker");
      }
      
      setLinkingClient(null);
      fetchData();
    } catch (error) {
      console.error("Error linking client:", error);
      toast.error(error.response?.data?.detail || "Failed to link client");
    }
  };

  const handleAllocateBond = async (clientId, bondId, unitsBlocked) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/clients/${clientId}/allocate-bond`, {
        bond_id: bondId,
        units_blocked: parseInt(unitsBlocked),
        units_paid: 0,
        status: "blocked"
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Bond allocated to client");
      setAllocatingClient(null);
      fetchData();
    } catch (error) {
      console.error("Error allocating bond:", error);
      toast.error(error.response?.data?.detail || "Failed to allocate bond");
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.pan_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSubbrokerName = (subbrokerId) => {
    const partner = partners.find(p => p.id === subbrokerId);
    return partner ? partner.name : null;
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
              <h1 className="text-2xl font-bold text-gray-800" data-testid="admin-clients-title">Admin - Clients</h1>
              <p className="text-sm text-gray-500 mt-1">Manage client accounts and bond allocations</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  data-testid="search-clients"
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Button
                onClick={() => setShowCreateModal(true)}
                className="bg-amber-700 hover:bg-amber-800"
                data-testid="create-client-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Client
              </Button>
            </div>
          </div>
        </div>

        {/* Clients Table */}
        <div className="p-8">
          {loading ? (
            <p className="text-center text-gray-500 py-12">Loading...</p>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">
                {searchQuery ? "No clients found" : "No clients created yet"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Client
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Client Name</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">PAN</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Contact</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Linked Sub-Broker</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Bond Allocations</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => {
                    const initials = client.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                    const linkedSubbroker = getSubbrokerName(client.linked_subbroker_id);
                    const allocations = client.bond_allocations || [];

                    return (
                      <tr key={client.id} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`client-row-${client.id}`}>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-medium text-sm">
                              {initials}
                            </div>
                            <div>
                              <span className="font-medium block">{client.name}</span>
                              <span className="text-xs text-gray-500">{client.city}, {client.state}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 font-mono text-sm">{client.pan_number}</td>
                        <td className="py-4 px-6">
                          <div className="text-sm">{client.email}</div>
                          <div className="text-xs text-gray-500">{client.mobile}</div>
                        </td>
                        <td className="py-4 px-6">
                          {linkingClient === client.id ? (
                            <div className="flex items-center gap-2">
                              <Select 
                                defaultValue={client.linked_subbroker_id || ""} 
                                onValueChange={(v) => handleLinkSubbroker(client.id, v)}
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">Unlink</SelectItem>
                                  {partners.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button variant="ghost" size="sm" onClick={() => setLinkingClient(null)}>
                                Cancel
                              </Button>
                            </div>
                          ) : linkedSubbroker ? (
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                                {linkedSubbroker}
                              </span>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setLinkingClient(client.id)}
                                title="Change link"
                              >
                                <Link2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setLinkingClient(client.id)}
                              data-testid={`link-subbroker-${client.id}`}
                            >
                              <Link2 className="h-3 w-3 mr-1" />
                              Link
                            </Button>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          {allocations.length > 0 ? (
                            <div className="space-y-1">
                              {allocations.slice(0, 2).map((alloc, idx) => (
                                <div key={idx} className="text-xs">
                                  <span className="font-medium">{alloc.bond_name?.slice(0, 20)}...</span>
                                  <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                                    alloc.status === 'fully_paid' ? 'bg-green-100 text-green-700' :
                                    alloc.status === 'partial_paid' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {alloc.units_paid}/{alloc.units_blocked} paid
                                  </span>
                                </div>
                              ))}
                              {allocations.length > 2 && (
                                <span className="text-xs text-gray-400">+{allocations.length - 2} more</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">No allocations</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAllocatingClient(client)}
                              title="Allocate bond"
                              data-testid={`allocate-bond-${client.id}`}
                            >
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/broker/admin/clients/${client.id}`)}
                              title="View/Edit client"
                              data-testid={`view-client-${client.id}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(client.id, client.name)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete client"
                              data-testid={`delete-client-${client.id}`}
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
        <CreateClientModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchData();
          }}
          subbrokers={partners}
        />
      )}

      {/* Allocate Bond Modal */}
      {allocatingClient && (
        <AllocateBondModal
          client={allocatingClient}
          bonds={bonds}
          onClose={() => setAllocatingClient(null)}
          onAllocate={handleAllocateBond}
        />
      )}
    </div>
  );
}


// Allocate Bond Modal Component
function AllocateBondModal({ client, bonds, onClose, onAllocate }) {
  const [selectedBond, setSelectedBond] = useState("");
  const [unitsBlocked, setUnitsBlocked] = useState(1);

  const selectedBondData = bonds.find(b => b.id === selectedBond);
  const unitsAvailable = selectedBondData 
    ? (selectedBondData.total_units || 1) - (selectedBondData.units_sold || 0)
    : 0;

  const handleSubmit = () => {
    if (!selectedBond) {
      toast.error("Please select a bond");
      return;
    }
    if (unitsBlocked < 1 || unitsBlocked > unitsAvailable) {
      toast.error(`Units must be between 1 and ${unitsAvailable}`);
      return;
    }
    onAllocate(client.id, selectedBond, unitsBlocked);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">Allocate Bond to {client.name}</h2>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-gray-500 uppercase">Select Bond</label>
            <Select value={selectedBond} onValueChange={setSelectedBond}>
              <SelectTrigger data-testid="select-bond-allocation">
                <SelectValue placeholder="Choose a bond..." />
              </SelectTrigger>
              <SelectContent>
                {bonds.filter(b => ((b.total_units || 1) - (b.units_sold || 0)) > 0).map(bond => (
                  <SelectItem key={bond.id} value={bond.id}>
                    {bond.name} ({(bond.total_units || 1) - (bond.units_sold || 0)} units available)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedBondData && (
            <>
              <div className="bg-gray-50 p-4 rounded-lg text-sm">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Principal:</span>
                  <span className="font-mono">₹{selectedBondData.principal_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">IRR:</span>
                  <span className="font-mono text-amber-600">{selectedBondData.secondary_irr}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Available:</span>
                  <span className="font-mono">{unitsAvailable} units</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-500 uppercase">Units to Block</label>
                <Input
                  type="number"
                  min={1}
                  max={unitsAvailable}
                  value={unitsBlocked}
                  onChange={(e) => setUnitsBlocked(parseInt(e.target.value) || 1)}
                  data-testid="units-blocked-input"
                />
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleSubmit}
            disabled={!selectedBond}
            className="bg-amber-700 hover:bg-amber-800"
            data-testid="confirm-allocation-btn"
          >
            Allocate Bond
          </Button>
        </div>
      </div>
    </div>
  );
}
