import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import { 
  Plus, Search, Users, RefreshCw, MoreVertical, 
  Mail, Phone, CheckCircle, XCircle, Eye, KeyRound, Trash2, Edit2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COLORS = [
  { name: "Stone", value: "#78716C" },
  { name: "Slate", value: "#64748B" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Emerald", value: "#10B981" },
  { name: "Gold", value: "#C9A227" },
  { name: "Rose", value: "#F43F5E" },
];

const COUNTRIES = ["India", "United Arab Emirates", "United States", "United Kingdom", "Singapore", "Other"];

export default function SubBrokerAgents() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [partnerInfo, setPartnerInfo] = useState(null);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    pan: "",
    agent_code: "",
    email: "",
    mobile: "",
    color: "#78716C",
    address_line1: "",
    address_line2: "",
    city: "",
    country: "India",
    state: "",
    pincode: "",
  });

  useEffect(() => {
    document.title = "Kinntegraa | My Agents";
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
    fetchPartnerInfo();
    fetchAgents();
  }, [navigate]);

  const fetchPartnerInfo = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/sub-broker/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPartnerInfo(response.data);
    } catch (error) {
      console.error("Error fetching partner info:", error);
    }
  };

  const fetchAgents = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/agents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAgents(response.data || []);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching agents:", error);
      setLoading(false);
    }
  };

  const handleCreateAgent = async () => {
    if (!formData.name || !formData.pan || !formData.agent_code || !formData.email || !formData.mobile) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (formData.pan.length !== 10) {
      toast.error("PAN must be exactly 10 characters");
      return;
    }

    setFormLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Generate password and PIN
      const password = `Agent@${Math.random().toString(36).substring(2, 8)}`;
      const pin = String(Math.floor(1000 + Math.random() * 9000));

      const response = await axios.post(`${API}/agents`, {
        ...formData,
        password,
        pin
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success("Agent created successfully!");
      setCredentials(response.data.credentials);
      setShowCreateModal(false);
      setShowCredentialsModal(true);
      resetForm();
      fetchAgents();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create agent");
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateAgent = async () => {
    if (!editingAgent) return;

    setFormLoading(true);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/agents/${editingAgent.id}`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success("Agent updated successfully!");
      setShowEditModal(false);
      setEditingAgent(null);
      resetForm();
      fetchAgents();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update agent");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteAgent = async (agentId) => {
    if (!confirm("Are you sure you want to delete this agent?")) return;

    try {
      const token = localStorage.getItem("token");
      const response = await axios.delete(`${API}/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.soft_delete) {
        toast.info("Agent marked as inactive (has tagged clients)");
      } else {
        toast.success("Agent deleted successfully!");
      }
      fetchAgents();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete agent");
    }
  };

  const handleResetPassword = async (agentId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/agents/${agentId}/reset-password`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setCredentials({
        password: response.data.new_password,
        pin: response.data.new_pin
      });
      setShowCredentialsModal(true);
      toast.success("Password reset successfully!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to reset password");
    }
  };

  const openEditModal = (agent) => {
    setEditingAgent(agent);
    setFormData({
      name: agent.name || "",
      email: agent.email || "",
      mobile: agent.mobile || "",
      color: agent.color || "#78716C",
      address_line1: agent.address_line1 || "",
      address_line2: agent.address_line2 || "",
      city: agent.city || "",
      state: agent.state || "",
      pincode: agent.pincode || "",
      country: agent.country || "India",
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      pan: "",
      agent_code: "",
      email: "",
      mobile: "",
      color: "#78716C",
      address_line1: "",
      address_line2: "",
      city: "",
      country: "India",
      state: "",
      pincode: "",
    });
  };

  const filteredAgents = agents.filter(agent =>
    agent.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.pan?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.agent_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!partnerInfo?.can_create_agents) {
    return (
      <div className="flex h-screen bg-gray-50">
        <SubBrokerSidebar user={user} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-700">Agent Creation Not Enabled</h2>
            <p className="text-gray-500 mt-2">Contact your broker to enable agent creation permission.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50" data-testid="subbroker-agents-page">
      <SubBrokerSidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800" data-testid="agents-title">My Agents</h1>
              <p className="text-sm text-gray-500 mt-1">Manage your team members and assign investors to them</p>
            </div>
            <Button
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
              className="bg-teal-600 hover:bg-teal-700"
              data-testid="create-agent-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Agent
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* Search Bar */}
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="search-agents"
              />
            </div>
          </div>

          {/* Agents List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-teal-600" />
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-700">No agents yet</h3>
              <p className="text-gray-500 mt-1">Create your first agent to get started</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Code</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Contact</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAgents.map((agent) => (
                    <tr key={agent.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                            style={{ backgroundColor: agent.color || '#78716C' }}
                          >
                            {agent.name?.charAt(0)?.toUpperCase() || 'A'}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">{agent.name}</p>
                            <p className="text-sm text-gray-500">{agent.pan}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline">{agent.agent_code}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <p className="text-sm text-gray-600 flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {agent.email}
                          </p>
                          <p className="text-sm text-gray-600 flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {agent.mobile}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {agent.is_active !== false ? (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-700">
                            <XCircle className="h-3 w-3 mr-1" />
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" data-testid={`agent-actions-${agent.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditModal(agent)}>
                              <Edit2 className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResetPassword(agent.id)}>
                              <KeyRound className="h-4 w-4 mr-2" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteAgent(agent.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Agent Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Agent</DialogTitle>
            <DialogDescription>
              Add a new agent to your team. They will be able to view clients assigned to them.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Full Name"
                  data-testid="agent-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label>PAN *</Label>
                <Input
                  value={formData.pan}
                  onChange={(e) => setFormData({...formData, pan: e.target.value.toUpperCase()})}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  data-testid="agent-pan-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Agent Code *</Label>
                <Input
                  value={formData.agent_code}
                  onChange={(e) => setFormData({...formData, agent_code: e.target.value})}
                  placeholder="AG001"
                  data-testid="agent-code-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="agent@example.com"
                  data-testid="agent-email-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile *</Label>
                <Input
                  value={formData.mobile}
                  onChange={(e) => setFormData({...formData, mobile: e.target.value})}
                  placeholder="9876543210"
                  data-testid="agent-mobile-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setFormData({...formData, color: color.value})}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        formData.color === color.value ? 'border-gray-800 scale-110' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Address (Optional)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Address Line 1</Label>
                  <Input
                    value={formData.address_line1}
                    onChange={(e) => setFormData({...formData, address_line1: e.target.value})}
                    placeholder="Street Address"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Address Line 2</Label>
                  <Input
                    value={formData.address_line2}
                    onChange={(e) => setFormData({...formData, address_line2: e.target.value})}
                    placeholder="Apartment, Suite, etc."
                  />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({...formData, city: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input
                    value={formData.state}
                    onChange={(e) => setFormData({...formData, state: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(country => (
                        <SelectItem key={country} value={country}>{country}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pincode</Label>
                  <Input
                    value={formData.pincode}
                    onChange={(e) => setFormData({...formData, pincode: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateAgent} 
              disabled={formLoading}
              className="bg-teal-600 hover:bg-teal-700"
              data-testid="submit-create-agent"
            >
              {formLoading ? "Creating..." : "Create Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Agent Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
            <DialogDescription>
              Update agent information. PAN and Agent Code cannot be changed.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Full Name"
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="agent@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile *</Label>
                <Input
                  value={formData.mobile}
                  onChange={(e) => setFormData({...formData, mobile: e.target.value})}
                  placeholder="9876543210"
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setFormData({...formData, color: color.value})}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        formData.color === color.value ? 'border-gray-800 scale-110' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Address</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Address Line 1</Label>
                  <Input
                    value={formData.address_line1}
                    onChange={(e) => setFormData({...formData, address_line1: e.target.value})}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Address Line 2</Label>
                  <Input
                    value={formData.address_line2}
                    onChange={(e) => setFormData({...formData, address_line2: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({...formData, city: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input
                    value={formData.state}
                    onChange={(e) => setFormData({...formData, state: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(country => (
                        <SelectItem key={country} value={country}>{country}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pincode</Label>
                  <Input
                    value={formData.pincode}
                    onChange={(e) => setFormData({...formData, pincode: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateAgent} 
              disabled={formLoading}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {formLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Modal */}
      <Dialog open={showCredentialsModal} onOpenChange={setShowCredentialsModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agent Credentials</DialogTitle>
            <DialogDescription>
              Save these credentials securely. The agent will need them to login.
            </DialogDescription>
          </DialogHeader>
          
          {credentials && (
            <div className="space-y-4 py-4">
              {credentials.pan && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Label className="text-xs text-gray-500">PAN (Username)</Label>
                  <p className="font-mono font-semibold">{credentials.pan}</p>
                </div>
              )}
              <div className="p-3 bg-gray-50 rounded-lg">
                <Label className="text-xs text-gray-500">Password</Label>
                <p className="font-mono font-semibold">{credentials.password}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <Label className="text-xs text-gray-500">PIN</Label>
                <p className="font-mono font-semibold">{credentials.pin}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowCredentialsModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
