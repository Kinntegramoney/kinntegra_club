import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Calendar, Tag, Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import { format } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ReinvestmentTagging() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeMonth, setActiveMonth] = useState(0);
  const [savingId, setSavingId] = useState(null);
  const [localTags, setLocalTags] = useState({});

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    setUser(JSON.parse(userData));
    fetchData();
  }, [navigate]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/reinvestment/upcoming`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(response.data);
      
      // Initialize local tags
      const tags = {};
      response.data.months.forEach(month => {
        month.items.forEach(item => {
          tags[item.cashflow_id] = item.reinvestment_tag;
        });
      });
      setLocalTags(tags);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load reinvestment data");
      setLoading(false);
    }
  };

  const handleTagChange = (cashflowId, tag) => {
    setLocalTags(prev => ({ ...prev, [cashflowId]: tag }));
  };

  const handleSave = async (cashflowId) => {
    setSavingId(cashflowId);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/reinvestment/tag/${cashflowId}`, 
        { reinvestment_tag: localTags[cashflowId] },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success("Tag saved successfully");
    } catch (error) {
      console.error("Error saving tag:", error);
      toast.error("Failed to save tag");
    } finally {
      setSavingId(null);
    }
  };

  const formatINR = (amount) => {
    return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const getTagLabel = (tag) => {
    switch(tag) {
      case 'principal': return 'Principal';
      case 'interest': return 'Interest';
      case 'net_amount': return 'Net Amount';
      default: return 'Not Tagged';
    }
  };

  const getTagColor = (tag) => {
    switch(tag) {
      case 'principal': return 'bg-purple-100 text-purple-700';
      case 'interest': return 'bg-blue-100 text-blue-700';
      case 'net_amount': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  if (!user) return null;

  const SidebarComponent = user.role === 'broker' ? Sidebar : SubBrokerSidebar;

  return (
    <div className="flex h-screen bg-gray-50">
      <SidebarComponent user={user} />
      
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Tag className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-800">Upcoming Reinvestment Tagging</h1>
                <p className="text-sm text-gray-500">Next 6 Months</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              Loading...
            </div>
          ) : !data || data.total_upcoming === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No upcoming repayments in the next 6 months</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Month Tabs */}
              <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
                {data.months.map((month, index) => (
                  <button
                    key={month.name}
                    onClick={() => setActiveMonth(index)}
                    className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeMonth === index 
                        ? 'border-amber-600 text-amber-700 bg-white' 
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                    data-testid={`month-tab-${index}`}
                  >
                    <span className="block">{month.name}</span>
                    <span className={`text-xs ${activeMonth === index ? 'text-amber-500' : 'text-gray-400'}`}>
                      {month.count} items
                    </span>
                  </button>
                ))}
              </div>
              
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Investor</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Opportunity</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount Invested</th>
                      <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Expected Date</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Principal Net</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Interest Net</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Net Amount</th>
                      <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Reinvestment Tag</th>
                      <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months[activeMonth]?.items.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-gray-500">
                          No upcoming repayments for {data.months[activeMonth]?.name}
                        </td>
                      </tr>
                    ) : (
                      data.months[activeMonth]?.items.map((item) => (
                        <tr key={item.cashflow_id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <p className="font-medium text-gray-800">{item.client_name}</p>
                            <p className="text-xs text-gray-500 font-mono">{item.client_pan}</p>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-amber-50 text-amber-700">
                              {item.bond_name?.slice(0, 20) || item.bond_id}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-sm">{formatINR(item.amount_invested)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-sm">{format(new Date(item.expected_date), "dd-MMM-yyyy")}</span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-sm">{formatINR(item.principal_net)}</td>
                          <td className="py-3 px-4 text-right font-mono text-sm">{formatINR(item.interest_net)}</td>
                          <td className="py-3 px-4 text-right font-mono text-sm font-medium">{formatINR(item.net_amount)}</td>
                          <td className="py-3 px-4 text-center">
                            <select
                              value={localTags[item.cashflow_id] || 'not_tagged'}
                              onChange={(e) => handleTagChange(item.cashflow_id, e.target.value)}
                              className={`px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer ${getTagColor(localTags[item.cashflow_id])}`}
                              data-testid={`tag-select-${item.cashflow_id}`}
                            >
                              <option value="not_tagged">Not Tagged</option>
                              <option value="principal">Principal</option>
                              <option value="interest">Interest</option>
                              <option value="net_amount">Net Amount</option>
                            </select>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              size="sm"
                              onClick={() => handleSave(item.cashflow_id)}
                              disabled={savingId === item.cashflow_id}
                              className="bg-amber-700 hover:bg-amber-800 text-white"
                              data-testid={`save-btn-${item.cashflow_id}`}
                            >
                              {savingId === item.cashflow_id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Save className="h-4 w-4 mr-1" />
                                  Save
                                </>
                              )}
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Summary Footer */}
              {data.months[activeMonth]?.items.length > 0 && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-end gap-8 text-sm">
                  <div>
                    <span className="text-gray-500">Total Principal:</span>
                    <span className="font-mono font-medium ml-2">
                      {formatINR(data.months[activeMonth].items.reduce((sum, i) => sum + i.principal_net, 0))}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Total Interest:</span>
                    <span className="font-mono font-medium ml-2">
                      {formatINR(data.months[activeMonth].items.reduce((sum, i) => sum + i.interest_net, 0))}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Total Net:</span>
                    <span className="font-mono font-medium ml-2 text-green-600">
                      {formatINR(data.months[activeMonth].items.reduce((sum, i) => sum + i.net_amount, 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
