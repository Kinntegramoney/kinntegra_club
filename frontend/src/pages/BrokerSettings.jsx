import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Settings, Shield, Users, Building2, FileText, Eye, Edit2, Trash2, Plus, RefreshCw, Check, X, ChevronDown, ChevronRight, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Feature categories for organized display
const FEATURE_CATEGORIES = {
  "opportunities_bonds": { label: "Bond Opportunities", icon: FileText, color: "bg-blue-50 border-blue-200" },
  "opportunities_real_estate": { label: "Real Estate Opportunities", icon: Building2, color: "bg-green-50 border-green-200" },
  "user_sub_broker": { label: "Sub-Broker Management", icon: Users, color: "bg-purple-50 border-purple-200" },
  "user_client": { label: "Client Management", icon: Users, color: "bg-etihad-gold-50 border-etihad-gold-200" },
  "holdings": { label: "Holdings", icon: FileText, color: "bg-indigo-50 border-indigo-200" },
  "logs": { label: "Logs", icon: FileText, color: "bg-gray-50 border-gray-200" },
  "reinvestment": { label: "Reinvestment", icon: RefreshCw, color: "bg-teal-50 border-teal-200" },
  "api_trigger": { label: "API Trigger", icon: Settings, color: "bg-red-50 border-red-200" },
  "tagged_tab": { label: "Tagged Tab", icon: Eye, color: "bg-pink-50 border-pink-200" },
  "analysis": { label: "Analysis Dashboard", icon: FileText, color: "bg-cyan-50 border-cyan-200" },
  "upload": { label: "Bulk Upload", icon: Plus, color: "bg-orange-50 border-orange-200" }
};

// Action labels for display
const ACTION_LABELS = {
  "create": { label: "Create", icon: Plus },
  "edit": { label: "Edit", icon: Edit2 },
  "view": { label: "View", icon: Eye },
  "delete": { label: "Delete", icon: Trash2 },
  "view_all": { label: "View All", icon: Eye },
  "view_tagged": { label: "View Tagged", icon: Eye },
  "view_self": { label: "View Self", icon: Eye },
  "tag_all": { label: "Tag All", icon: Plus },
  "tag_tagged": { label: "Tag Tagged", icon: Plus },
  "approve_reject": { label: "Approve/Reject", icon: Check },
  "trigger": { label: "Trigger", icon: Settings },
  "bulk_upload": { label: "Bulk Upload", icon: Plus }
};

export default function BrokerSettings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  // Set page title
  useEffect(() => {
    document.title = "Kinntegraa | Settings";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "broker") {
      toast.error("Only brokers can access settings");
      navigate("/sub-broker/dashboard");
      return;
    }
    
    setUser(parsedUser);
    fetchPermissions();
  }, [navigate]);

  const fetchPermissions = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/role-permissions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPermissions(response.data.permissions);
      
      // Expand all categories by default
      const expanded = {};
      response.data.permissions.forEach(p => {
        expanded[p.feature] = true;
      });
      setExpandedCategories(expanded);
    } catch (error) {
      console.error("Error fetching permissions:", error);
      toast.error("Failed to load permissions");
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (feature) => {
    setExpandedCategories(prev => ({
      ...prev,
      [feature]: !prev[feature]
    }));
  };

  const updatePermission = (feature, action, role, value) => {
    setPermissions(prev => prev.map(p => {
      if (p.feature === feature && p.action === action) {
        return { ...p, [role]: value };
      }
      return p;
    }));
    setHasChanges(true);
  };

  const savePermissions = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/role-permissions`, {
        permissions: permissions
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Permissions saved successfully!");
      setHasChanges(false);
    } catch (error) {
      console.error("Error saving permissions:", error);
      toast.error(error.response?.data?.detail || "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    if (!window.confirm("Are you sure you want to reset all permissions to default? This cannot be undone.")) {
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/role-permissions/reset`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPermissions(response.data.permissions);
      toast.success("Permissions reset to default!");
      setHasChanges(false);
    } catch (error) {
      console.error("Error resetting permissions:", error);
      toast.error("Failed to reset permissions");
    } finally {
      setSaving(false);
    }
  };

  // Group permissions by feature
  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.feature]) {
      acc[perm.feature] = [];
    }
    acc[perm.feature].push(perm);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-100">
        <Sidebar user={user} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-etihad-gold-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-etihad-gold-100 rounded-lg">
                  <Settings className="h-6 w-6 text-etihad-gold-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-800">Role Permissions</h1>
                  <p className="text-sm text-gray-500">Manage access control for different user roles</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={resetToDefault}
                  disabled={saving}
                  className="text-gray-600"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset to Default
                </Button>
                <Button
                  onClick={savePermissions}
                  disabled={saving || !hasChanges}
                  className="bg-etihad-gold-600 hover:bg-etihad-gold-700"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
          
          {/* Role Legend */}
          <div className="px-6 py-3 bg-gray-50 border-t flex items-center gap-6">
            <span className="text-sm text-gray-500">Roles:</span>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-etihad-gold-500"></div>
              <span className="text-sm font-medium">Broker</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-sm font-medium">Sub-Broker</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm font-medium">Client</span>
            </div>
            {hasChanges && (
              <span className="ml-auto text-sm text-etihad-gold-600 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-etihad-gold-500 animate-pulse"></span>
                Unsaved changes
              </span>
            )}
          </div>
        </div>

        {/* Permissions Grid */}
        <div className="p-6 space-y-4">
          {Object.entries(groupedPermissions).map(([feature, perms]) => {
            const category = FEATURE_CATEGORIES[feature] || { label: feature, icon: Shield, color: "bg-gray-50 border-gray-200" };
            const CategoryIcon = category.icon;
            const isExpanded = expandedCategories[feature];
            
            return (
              <div key={feature} className={`rounded-xl border ${category.color} overflow-hidden`}>
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(feature)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CategoryIcon className="h-5 w-5 text-gray-600" />
                    <span className="font-semibold text-gray-800">{category.label}</span>
                    <span className="text-xs text-gray-500 bg-white/80 px-2 py-0.5 rounded-full">
                      {perms.length} permissions
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                </button>
                
                {/* Permissions Table */}
                {isExpanded && (
                  <div className="bg-white border-t">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-etihad-gold-600 uppercase">Broker</th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-blue-600 uppercase">Sub-Broker</th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-green-600 uppercase">Client</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {perms.map((perm, idx) => {
                          const actionInfo = ACTION_LABELS[perm.action] || { label: perm.action, icon: Shield };
                          const ActionIcon = actionInfo.icon;
                          
                          return (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <ActionIcon className="h-4 w-4 text-gray-400" />
                                  <span className="font-medium text-gray-700">{actionInfo.label}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">
                                {perm.description || "-"}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Switch
                                  checked={perm.broker}
                                  onCheckedChange={(checked) => updatePermission(feature, perm.action, 'broker', checked)}
                                  className="data-[state=checked]:bg-etihad-gold-500"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Switch
                                  checked={perm.sub_broker}
                                  onCheckedChange={(checked) => updatePermission(feature, perm.action, 'sub_broker', checked)}
                                  className="data-[state=checked]:bg-blue-500"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Switch
                                  checked={perm.client}
                                  onCheckedChange={(checked) => updatePermission(feature, perm.action, 'client', checked)}
                                  className="data-[state=checked]:bg-green-500"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Quick Reference */}
        <div className="px-6 pb-6">
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Shield className="h-5 w-5 text-gray-400" />
              Quick Reference
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-etihad-gold-50 rounded-lg p-3">
                <p className="font-semibold text-etihad-gold-700 mb-1">Broker</p>
                <p className="text-gray-600">Full access to all features. Can manage permissions, users, and all data.</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="font-semibold text-blue-700 mb-1">Sub-Broker</p>
                <p className="text-gray-600">Can view opportunities, manage tagged clients, and view their assigned holdings.</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <p className="font-semibold text-green-700 mb-1">Client</p>
                <p className="text-gray-600">Can view their own data, holdings, and approve/reject tagged requests.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
