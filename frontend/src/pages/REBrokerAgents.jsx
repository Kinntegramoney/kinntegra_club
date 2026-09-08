import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  Users, Plus, RefreshCw, Search, Edit2, Upload,
  MoreVertical, Mail, KeyRound, UserMinus, Trash2, UserX
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import REBrokerSidebar from "@/components/REBrokerSidebar";
import CreateREAgentModal from "@/components/CreateREAgentModal";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function REBrokerAgents() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [brokerProfile, setBrokerProfile] = useState(null);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    document.title = "Kinntegraa | RE Broker - Agents";
    
    const userData = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    
    if (!userData || !token) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "re_broker") {
      navigate("/login");
      return;
    }
    
    setUser(parsedUser);
    fetchBrokerProfile(token);
    fetchAgents(token);
  }, [navigate]);

  const fetchBrokerProfile = async (token) => {
    try {
      const response = await axios.get(`${API}/re-broker/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBrokerProfile(response.data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const fetchAgents = useCallback(async (token) => {
    setLoading(true);
    try {
      const tkn = token || localStorage.getItem("token");
      const response = await axios.get(`${API}/re-broker/agents`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      const data = response.data;
      setAgents(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching agents:", error);
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredAgents = agents.filter(agent => {
    const query = searchQuery.toLowerCase();
    return (
      agent.name?.toLowerCase().includes(query) ||
      agent.email?.toLowerCase().includes(query) ||
      agent.brn?.toLowerCase().includes(query) ||
      agent.mobile?.toLowerCase().includes(query)
    );
  });

  const handleResendCredentials = async (agent) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/re-broker/agents/${agent.id}/resend-credentials`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Credentials sent to ${agent.email}`);
    } catch (error) {
      toast.error("Failed to resend credentials");
    }
  };

  const handleResetPassword = async (agent) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/re-broker/agents/${agent.id}/reset-password`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Password reset link sent to ${agent.email}`);
    } catch (error) {
      toast.error("Failed to reset password");
    }
  };

  const handleDeactivate = async (agent) => {
    if (!window.confirm(`Deactivate agent "${agent.name}"?`)) return;
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/re-broker/agents/${agent.id}/deactivate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Agent deactivated");
      fetchAgents();
    } catch (error) {
      toast.error("Failed to deactivate agent");
    }
  };

  const handleReactivate = async (agent) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/re-broker/agents/${agent.id}/reactivate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Agent reactivated");
      fetchAgents();
    } catch (error) {
      toast.error("Failed to reactivate agent");
    }
  };

  const handleDelete = async (agent) => {
    if (!window.confirm(`Delete agent "${agent.name}"? This action cannot be undone.`)) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/re-broker/agents/${agent.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Agent deleted");
      fetchAgents();
    } catch (error) {
      toast.error("Failed to delete agent");
    }
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <REBrokerSidebar user={user} brokerProfile={brokerProfile} />
      
      <div className="flex-1 md:ml-0 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="ml-12 md:ml-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800" data-testid="agents-title">
                Agents
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage your real estate agents ({filteredAgents.length} of {agents.length})
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                  data-testid="search-input"
                />
              </div>
              <Button 
                variant="outline" 
                onClick={() => fetchAgents()} 
                data-testid="refresh-btn"
                className="border-gray-300"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                onClick={() => navigate('/re-broker/bulk-upload?tab=agents')}
                variant="outline"
                className="border-purple-300 text-purple-700 hover:bg-purple-50"
                data-testid="bulk-upload-btn"
              >
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
              <Button 
                onClick={() => setShowAddModal(true)}
                className="bg-purple-600 hover:bg-purple-700"
                data-testid="add-agent-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Agent
              </Button>
            </div>
          </div>
        </div>

        {/* Agents Table */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-purple-600" />
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">
                {searchQuery ? "No agents found" : "No agents created yet"}
              </p>
              {!searchQuery && (
                <Button 
                  onClick={() => setShowAddModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 mt-4"
                  data-testid="add-first-agent-btn"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Agent
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Agent Name</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">BRN</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Contact</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Specialization</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((agent) => {
                    const initials = agent.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'AG';
                    const isInactive = agent.status === 'inactive' || agent.is_active === false;

                    return (
                      <tr 
                        key={agent.id} 
                        className={`border-t border-gray-100 hover:bg-gray-50 ${isInactive ? 'opacity-60 bg-gray-50' : ''}`} 
                        data-testid={`agent-row-${agent.id}`}
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm text-white ${
                              isInactive ? 'bg-gray-400' : 'bg-purple-600'
                            }`}>
                              {isInactive ? <UserX className="h-5 w-5" /> : initials}
                            </div>
                            <div>
                              <span className="font-medium block">{agent.name}</span>
                              <span className="text-xs text-gray-500">{agent.agency_name || 'Independent'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 font-mono text-sm">
                          {agent.brn || 'N/A'}
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-sm">{agent.email}</div>
                          <div className="text-xs text-gray-500">{agent.mobile || 'N/A'}</div>
                        </td>
                        <td className="py-4 px-6">
                          {agent.specializations?.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {agent.specializations.slice(0, 2).map((spec, idx) => (
                                <span key={idx} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded">
                                  {spec}
                                </span>
                              ))}
                              {agent.specializations.length > 2 && (
                                <span className="text-xs text-gray-500">+{agent.specializations.length - 2}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          {isInactive ? (
                            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">Inactive</span>
                          ) : (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Active</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-end gap-1">
                            {isInactive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReactivate(agent)}
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                title="Reactivate agent"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {/* handleEdit */}}
                                  title="Edit agent"
                                  data-testid={`edit-agent-${agent.id}`}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" data-testid={`agent-menu-${agent.id}`}>
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem 
                                      onClick={() => handleResendCredentials(agent)}
                                      className="cursor-pointer"
                                    >
                                      <Mail className="h-4 w-4 mr-2" />
                                      Resend Credentials
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleResetPassword(agent)}
                                      className="cursor-pointer"
                                    >
                                      <KeyRound className="h-4 w-4 mr-2" />
                                      Reset Password
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={() => handleDeactivate(agent)}
                                      className="cursor-pointer text-amber-600"
                                    >
                                      <UserMinus className="h-4 w-4 mr-2" />
                                      Deactivate Agent
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleDelete(agent)}
                                      className="cursor-pointer text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete Agent
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </>
                            )}
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
      
      {/* Add Agent Modal */}
      <CreateREAgentModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSuccess={() => {
          fetchAgents();
          toast.success("Agent created successfully!");
        }}
      />
    </div>
  );
}
