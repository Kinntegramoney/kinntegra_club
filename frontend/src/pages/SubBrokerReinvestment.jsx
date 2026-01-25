import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  RefreshCw, Save, Tag, ChevronUp, ChevronDown, Clock, CheckCircle,
  AlertCircle, IndianRupee
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

const PORTFOLIO_OPTIONS = [
  { value: 'wealth', label: 'Wealth' },
  { value: 'tax', label: 'Tax' },
  { value: 'short_term', label: 'Short Term' },
  { value: 'commodities', label: 'Commodities' },
  { value: 'bonds', label: 'Bonds' },
  { value: 'real_estate', label: 'Real Estate' }
];

const TAG_OPTIONS = [
  { value: 'not_tagged', label: 'Not Tagged' },
  { value: 'full', label: 'Full Amount' },
  { value: 'partial', label: 'Partial' },
  { value: 'no_reinvest', label: 'No Reinvest' }
];

export default function SubBrokerReinvestment() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ by_client: [], summary: { total_amount: 0, total_entries: 0 } });
  const [expandedClients, setExpandedClients] = useState({});
  const [localTags, setLocalTags] = useState({});
  const [portfolioCategories, setPortfolioCategories] = useState({});
  const [targetUccs, setTargetUccs] = useState({});
  const [savingEntry, setSavingEntry] = useState(null);
  const [activeTab, setActiveTab] = useState("untagged");

  useEffect(() => {
    document.title = "Kinntegraa | Reinvestment Tagging";
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
    fetchData();
  }, [navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/sub-broker/reinvestment/upcoming`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(response.data);
      
      // Initialize local state from data
      const tags = {};
      const portfolios = {};
      const uccs = {};
      
      response.data?.by_client?.forEach(client => {
        client.entries.forEach(entry => {
          tags[entry.cashflow_id] = entry.reinvestment_tag || 'not_tagged';
          portfolios[entry.cashflow_id] = entry.portfolio_category || '';
          uccs[entry.cashflow_id] = entry.target_ucc || '';
        });
      });
      
      setLocalTags(tags);
      setPortfolioCategories(portfolios);
      setTargetUccs(uccs);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load reinvestment data");
    } finally {
      setLoading(false);
    }
  };

  const toggleClient = (clientId) => {
    setExpandedClients(prev => ({
      ...prev,
      [clientId]: !prev[clientId]
    }));
  };

  const handleTagChange = (cashflowId, tag) => {
    setLocalTags(prev => ({ ...prev, [cashflowId]: tag }));
  };

  const handlePortfolioChange = (cashflowId, portfolio) => {
    setPortfolioCategories(prev => ({ ...prev, [cashflowId]: portfolio }));
  };

  const handleUccChange = (cashflowId, ucc) => {
    setTargetUccs(prev => ({ ...prev, [cashflowId]: ucc }));
  };

  const handleSaveEntry = async (cashflowId) => {
    const tag = localTags[cashflowId];
    const portfolio = portfolioCategories[cashflowId];
    const ucc = targetUccs[cashflowId];
    
    if (tag !== 'not_tagged' && tag !== 'no_reinvest') {
      if (!portfolio) {
        toast.error("Please select a portfolio category");
        return;
      }
      if (!ucc) {
        toast.error("Please select a UCC");
        return;
      }
    }
    
    setSavingEntry(cashflowId);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/reinvestment/tag/${cashflowId}`, 
        {
          reinvestment_tag: tag,
          portfolio_category: portfolio || null,
          target_ucc: ucc || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Tag saved successfully");
      fetchData();
    } catch (error) {
      console.error("Error saving tag:", error);
      toast.error(error.response?.data?.detail || "Failed to save tag");
    } finally {
      setSavingEntry(null);
    }
  };

  const formatCurrency = (amount) => {
    if (!amount) return "₹0";
    return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Filter entries based on tab
  const filterEntries = (entries) => {
    if (activeTab === "untagged") {
      return entries.filter(e => e.reinvestment_tag === 'not_tagged' || !e.reinvestment_tag);
    } else if (activeTab === "tagged") {
      return entries.filter(e => e.reinvestment_tag && e.reinvestment_tag !== 'not_tagged');
    }
    return entries;
  };

  const filteredClients = data.by_client
    .map(client => ({
      ...client,
      entries: filterEntries(client.entries)
    }))
    .filter(client => client.entries.length > 0);

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800" data-testid="reinvestment-title">
                Reinvestment Tagging
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Tag upcoming cashflows for your linked clients
              </p>
            </div>
            <Button variant="outline" onClick={fetchData} data-testid="refresh-btn">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            <div className="bg-gradient-to-r from-etihad-gold-500 to-orange-500 rounded-lg p-4 text-white">
              <p className="text-etihad-gold-100 text-sm">Total Upcoming</p>
              <p className="text-2xl font-bold">{formatCurrency(data.summary?.total_amount)}</p>
              <p className="text-etihad-gold-100 text-xs">{data.summary?.total_entries || 0} entries</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-gray-500 text-sm">Clients with Cashflows</p>
              <p className="text-2xl font-bold text-gray-800">{data.by_client?.length || 0}</p>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setActiveTab("untagged")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "untagged" 
                  ? "bg-etihad-gold-100 text-etihad-gold-700" 
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Untagged
            </button>
            <button
              onClick={() => setActiveTab("tagged")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "tagged" 
                  ? "bg-etihad-gold-100 text-etihad-gold-700" 
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Tagged
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600" />
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-12">
              <Tag className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {activeTab === "untagged" 
                  ? "No untagged cashflows found" 
                  : "No tagged cashflows found"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredClients.map((client) => (
                <div 
                  key={client.client_id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  {/* Client Header */}
                  <button
                    onClick={() => toggleClient(client.client_id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                        {client.client_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'CL'}
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-gray-800">{client.client_name}</p>
                        <p className="text-xs text-gray-500 font-mono">{client.client_pan}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-800">{client.entries.length} entries</p>
                        {client.ucc_list?.length > 0 && (
                          <p className="text-xs text-gray-500">
                            {client.ucc_list.length} UCC{client.ucc_list.length > 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                      {expandedClients[client.client_id] 
                        ? <ChevronUp className="h-5 w-5 text-gray-400" />
                        : <ChevronDown className="h-5 w-5 text-gray-400" />
                      }
                    </div>
                  </button>
                  
                  {/* Expanded Content */}
                  {expandedClients[client.client_id] && (
                    <div className="border-t border-gray-100">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Opportunity</th>
                              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
                              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">UCC</th>
                              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Portfolio</th>
                              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Tag</th>
                              <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {client.entries.map((entry) => (
                              <tr key={entry.cashflow_id} className="hover:bg-gray-50">
                                <td className="py-3 px-4">
                                  <p className="font-medium text-gray-800 truncate max-w-[150px]">
                                    {entry.opportunity_name}
                                  </p>
                                  <p className="text-xs text-gray-500 capitalize">{entry.cashflow_type}</p>
                                </td>
                                <td className="py-3 px-4 text-gray-600">
                                  {formatDate(entry.expected_date)}
                                </td>
                                <td className="py-3 px-4 text-right font-medium text-gray-800">
                                  {formatCurrency(entry.amount)}
                                </td>
                                <td className="py-3 px-4">
                                  <Select
                                    value={targetUccs[entry.cashflow_id] || ""}
                                    onValueChange={(value) => handleUccChange(entry.cashflow_id, value)}
                                  >
                                    <SelectTrigger className="w-[140px] h-8 text-xs">
                                      <SelectValue placeholder="Select UCC" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {client.ucc_list?.length > 0 ? (
                                        client.ucc_list.map((ucc) => (
                                          <SelectItem key={ucc} value={ucc} className="text-xs">
                                            {ucc}
                                          </SelectItem>
                                        ))
                                      ) : (
                                        <SelectItem value="no_ucc" disabled className="text-xs text-gray-400">
                                          No UCC available
                                        </SelectItem>
                                      )}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="py-3 px-4">
                                  <Select
                                    value={portfolioCategories[entry.cashflow_id] || ""}
                                    onValueChange={(value) => handlePortfolioChange(entry.cashflow_id, value)}
                                  >
                                    <SelectTrigger className="w-[120px] h-8 text-xs">
                                      <SelectValue placeholder="Portfolio" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {PORTFOLIO_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="py-3 px-4">
                                  <Select
                                    value={localTags[entry.cashflow_id] || "not_tagged"}
                                    onValueChange={(value) => handleTagChange(entry.cashflow_id, value)}
                                  >
                                    <SelectTrigger className="w-[110px] h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {TAG_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveEntry(entry.cashflow_id)}
                                    disabled={savingEntry === entry.cashflow_id}
                                    className="h-8 px-3 text-xs"
                                  >
                                    {savingEntry === entry.cashflow_id ? (
                                      <RefreshCw className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Save className="h-3 w-3" />
                                    )}
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
