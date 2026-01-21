import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { 
  Plus, Search, RefreshCw, Users, UserPlus, CheckCircle, Clock, 
  XCircle, Eye, Mail, Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SubBrokerClients() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // New client form
  const [newClient, setNewClient] = useState({
    name: "",
    pan: "",
    email: "",
    phone: "",
    bank_name: "",
    account_number: "",
    ifsc_code: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
    notes: ""
  });

  useEffect(() => {
    document.title = "Kinntegraa | My Clients";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "sub_broker") {
      navigate("/broker/dashboard");
      return;
    }
    
    setUser(parsedUser);
    fetchClients();
  }, [navigate]);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/sub-broker/clients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClients(response.data);
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async () => {
    if (!newClient.name || !newClient.pan) {
      toast.error("Name and PAN are required");
      return;
    }
    
    if (newClient.pan.length !== 10) {
      toast.error("PAN must be 10 characters");
      return;
    }
    
    setCreating(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/sub-broker/clients`, newClient, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Client created! Pending broker approval.");
      setShowCreateModal(false);
      setNewClient({
        name: "",
        pan: "",
        email: "",
        phone: "",
        bank_name: "",
        account_number: "",
        ifsc_code: "",
        address: "",
        city: "",
        state: "",
        pincode: "",
        country: "India",
        notes: ""
      });
      fetchClients();
    } catch (error) {
      console.error("Error creating client:", error);
      toast.error(error.response?.data?.detail || "Failed to create client");
    } finally {
      setCreating(false);
    }
  };

  const filteredClients = clients.filter(client => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      client.name?.toLowerCase().includes(query) ||
      client.pan?.toLowerCase().includes(query) ||
      client.email?.toLowerCase().includes(query) ||
      client.phone?.includes(query)
    );
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case "approved":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
            <CheckCircle className="h-3 w-3" /> Approved
          </span>
        );
      case "pending_approval":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full">
            <Clock className="h-3 w-3" /> Pending
          </span>
        );
      case "rejected":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
            <XCircle className="h-3 w-3" /> Rejected
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
            Active
          </span>
        );
    }
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800" data-testid="subbroker-clients-title">
                My Clients
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage your linked clients ({filteredClients.length} total)
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={fetchClients}
                data-testid="refresh-clients-btn"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                onClick={() => setShowCreateModal(true)}
                className="bg-amber-700 hover:bg-amber-800"
                data-testid="create-client-btn"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Client
              </Button>
            </div>
          </div>
          
          {/* Search */}
          <div className="mt-4 relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by name, PAN, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="client-search-input"
            />
          </div>
        </div>

        {/* Clients List */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">No clients linked yet</p>
              <Button onClick={() => setShowCreateModal(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Your First Client
              </Button>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No clients match your search</p>
              <Button variant="outline" onClick={() => setSearchQuery("")}>
                Clear Search
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredClients.map((client) => (
                <div 
                  key={client.id} 
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all"
                  data-testid={`client-card-${client.id}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                        {client.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'CL'}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800">{client.name}</h3>
                        <p className="text-sm text-gray-500 font-mono">{client.pan}</p>
                      </div>
                    </div>
                    {getStatusBadge(client.approval_status)}
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    {client.email && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <span>{client.phone}</span>
                      </div>
                    )}
                  </div>
                  
                  {client.ucc_list && client.ucc_list.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">UCCs:</p>
                      <div className="flex flex-wrap gap-1">
                        {client.ucc_list.map((ucc, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded font-mono">
                            {ucc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => navigate(`/sub-broker/clients/${client.id}`)}
                      data-testid={`view-client-${client.id}`}
                    >
                      <Eye className="h-4 w-4 mr-1" /> View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Client Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription>
              Create a new client. The client will be active after broker approval.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={newClient.name}
                  onChange={(e) => setNewClient({...newClient, name: e.target.value})}
                  placeholder="Enter full name"
                />
              </div>
              <div>
                <Label htmlFor="pan">PAN *</Label>
                <Input
                  id="pan"
                  value={newClient.pan}
                  onChange={(e) => setNewClient({...newClient, pan: e.target.value.toUpperCase()})}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({...newClient, email: e.target.value})}
                  placeholder="client@email.com"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({...newClient, phone: e.target.value})}
                  placeholder="9876543210"
                />
              </div>
            </div>
            
            {/* Bank Details */}
            <div className="border-t pt-4 mt-2">
              <h4 className="font-medium text-gray-700 mb-3">Bank Details</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bank_name">Bank Name</Label>
                  <Input
                    id="bank_name"
                    value={newClient.bank_name}
                    onChange={(e) => setNewClient({...newClient, bank_name: e.target.value})}
                    placeholder="HDFC Bank"
                  />
                </div>
                <div>
                  <Label htmlFor="account_number">Account Number</Label>
                  <Input
                    id="account_number"
                    value={newClient.account_number}
                    onChange={(e) => setNewClient({...newClient, account_number: e.target.value})}
                    placeholder="1234567890"
                  />
                </div>
              </div>
              <div className="mt-3">
                <Label htmlFor="ifsc_code">IFSC Code</Label>
                <Input
                  id="ifsc_code"
                  value={newClient.ifsc_code}
                  onChange={(e) => setNewClient({...newClient, ifsc_code: e.target.value.toUpperCase()})}
                  placeholder="HDFC0001234"
                  className="max-w-xs"
                />
              </div>
            </div>
            
            {/* Address */}
            <div className="border-t pt-4 mt-2">
              <h4 className="font-medium text-gray-700 mb-3">Address</h4>
              <div>
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  value={newClient.address}
                  onChange={(e) => setNewClient({...newClient, address: e.target.value})}
                  placeholder="123 Main Street, Apt 4B"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={newClient.city}
                    onChange={(e) => setNewClient({...newClient, city: e.target.value})}
                    placeholder="Mumbai"
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={newClient.state}
                    onChange={(e) => setNewClient({...newClient, state: e.target.value})}
                    placeholder="Maharashtra"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <Label htmlFor="pincode">Pincode</Label>
                  <Input
                    id="pincode"
                    value={newClient.pincode}
                    onChange={(e) => setNewClient({...newClient, pincode: e.target.value})}
                    placeholder="400001"
                  />
                </div>
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={newClient.country}
                    onChange={(e) => setNewClient({...newClient, country: e.target.value})}
                    placeholder="India"
                  />
                </div>
              </div>
            </div>
            
            {/* Notes */}
            <div className="border-t pt-4 mt-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input
                id="notes"
                value={newClient.notes}
                onChange={(e) => setNewClient({...newClient, notes: e.target.value})}
                placeholder="Any additional notes..."
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateClient} 
              disabled={creating}
              className="bg-amber-700 hover:bg-amber-800"
            >
              {creating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create Client
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
