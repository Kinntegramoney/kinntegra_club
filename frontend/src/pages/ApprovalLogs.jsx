import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import ClientSidebar from "@/components/ClientSidebar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  RefreshCw, CheckCircle, XCircle, Clock, Send, 
  User, Users, FileText, Filter, ChevronDown,
  AlertCircle, ArrowRight, Building2
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ACTION_CONFIG = {
  submitted: { icon: Send, color: "text-blue-600", bg: "bg-blue-50", label: "Submitted" },
  broker_approved: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", label: "Broker Approved" },
  broker_rejected: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: "Broker Rejected" },
  client_approved: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50", label: "Client Approved" },
  client_rejected: { icon: XCircle, color: "text-orange-600", bg: "bg-orange-50", label: "Client Rejected" },
  kinntegra_prepared: { icon: Building2, color: "text-purple-600", bg: "bg-purple-50", label: "API Prepared" },
  kinntegra_submitted: { icon: CheckCircle, color: "text-etihad-maroon-600", bg: "bg-indigo-50", label: "API Submitted" },
};

const ENTITY_CONFIG = {
  client: { icon: User, color: "text-etihad-gold-600", label: "Client" },
  reinvestment: { icon: FileText, color: "text-blue-600", label: "Reinvestment" },
};

export default function ApprovalLogs() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    document.title = "Kinntegraa | Approval Logs";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchLogs();
  }, [navigate]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const params = filterType !== "all" ? `?entity_type=${filterType}` : "";
      const response = await axios.get(`${API}/approval-logs${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(response.data);
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast.error("Failed to load approval logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchLogs();
    }
  }, [filterType]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      return format(new Date(dateStr), "MMM dd, yyyy HH:mm");
    } catch {
      return dateStr;
    }
  };

  const getActionConfig = (action) => {
    return ACTION_CONFIG[action] || { 
      icon: AlertCircle, 
      color: "text-gray-600", 
      bg: "bg-gray-50", 
      label: action 
    };
  };

  const getEntityConfig = (type) => {
    return ENTITY_CONFIG[type] || { 
      icon: FileText, 
      color: "text-gray-600", 
      label: type 
    };
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case "broker": return <Users className="h-4 w-4 text-etihad-gold-600" />;
      case "sub_broker": return <User className="h-4 w-4 text-blue-600" />;
      case "client": return <User className="h-4 w-4 text-green-600" />;
      case "system": return <Building2 className="h-4 w-4 text-purple-600" />;
      default: return <User className="h-4 w-4 text-gray-600" />;
    }
  };

  const SidebarComponent = user?.role === "broker" ? Sidebar : 
                          user?.role === "sub_broker" ? SubBrokerSidebar : 
                          ClientSidebar;

  return (
    <div className="min-h-screen bg-gray-50 flex" data-testid="approval-logs-page">
      <SidebarComponent user={user} />

      <div className="flex-1 p-4 md:p-8 md:ml-64">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="page-title">
              Approval Logs
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Track all approval workflow activities
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[160px]" data-testid="filter-select">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="client">Clients</SelectItem>
                <SelectItem value="reinvestment">Reinvestments</SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              onClick={fetchLogs}
              disabled={loading}
              data-testid="refresh-btn"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Logs Timeline */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600 mx-auto mb-3" />
              <p className="text-gray-500">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-600 mb-1">No Logs Found</h3>
              <p className="text-gray-400 text-sm">Approval workflow activities will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {logs.map((log, index) => {
                const actionConfig = getActionConfig(log.action);
                const entityConfig = getEntityConfig(log.entity_type);
                const ActionIcon = actionConfig.icon;
                const EntityIcon = entityConfig.icon;
                
                return (
                  <div 
                    key={log.id || index} 
                    className="p-4 md:p-5 hover:bg-gray-50 transition-colors"
                    data-testid={`log-entry-${index}`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Action Icon */}
                      <div className={`p-2.5 rounded-full ${actionConfig.bg} flex-shrink-0`}>
                        <ActionIcon className={`h-5 w-5 ${actionConfig.color}`} />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`font-semibold ${actionConfig.color}`}>
                            {actionConfig.label}
                          </span>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                          <span className="flex items-center gap-1 text-gray-600">
                            <EntityIcon className={`h-4 w-4 ${entityConfig.color}`} />
                            {entityConfig.label}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-2">
                          <span className="flex items-center gap-1">
                            {getRoleIcon(log.actor_role)}
                            <span className="capitalize">{log.actor_name || log.actor_role}</span>
                          </span>
                          <span>•</span>
                          <span>{formatDate(log.created_at)}</span>
                        </div>
                        
                        {/* Details */}
                        {log.details && Object.keys(log.details).length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {log.details.client_name && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                                Client: {log.details.client_name}
                              </span>
                            )}
                            {log.details.total_amount && (
                              <span className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full">
                                ₹{log.details.total_amount?.toLocaleString('en-IN')}
                              </span>
                            )}
                            {log.details.cashflows_count && (
                              <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                                {log.details.cashflows_count} cashflows
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* Notes */}
                        {log.notes && (
                          <p className="mt-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
                            {log.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
