import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { Wallet, TrendingUp, Calendar, Download, ChevronDown, ChevronUp, Check, Clock, X, Building2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ClientHoldings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [holdings, setHoldings] = useState(null);
  const [realEstateHoldings, setRealEstateHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHolding, setSelectedHolding] = useState(null);
  const [showCashflowModal, setShowCashflowModal] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");
  const [mainTab, setMainTab] = useState("bonds");

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "client") {
      navigate("/login");
      return;
    }
    
    setUser(parsedUser);
    fetchHoldings();
    fetchRealEstateHoldings();
  }, [navigate]);

  const fetchHoldings = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/holdings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHoldings(response.data);
    } catch (error) {
      console.error("Error fetching holdings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRealEstateHoldings = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/real-estate-investments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRealEstateHoldings(response.data || []);
    } catch (error) {
      console.error("Error fetching real estate holdings:", error);
    }
  };

  const formatINR = (amount) => {
    return `₹ ${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatAED = (amount) => {
    return `AED ${(amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const handleDownload = async () => {
    try {
      const token = localStorage.getItem("token");
      const userData = JSON.parse(localStorage.getItem("user"));
      
      // Get client_id from user
      const profileRes = await axios.get(`${API}/client/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const response = await axios.get(
        `${API}/holdings/client/${profileRes.data.client.id}/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `holdings_${userData.name.replace(/\s+/g, '_')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Holdings report downloaded");
    } catch (error) {
      console.error("Error downloading:", error);
      toast.error("Failed to download report");
    }
  };

  const viewCashflows = (holding) => {
    setSelectedHolding(holding);
    setActiveTab("summary");
    setShowCashflowModal(true);
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <ClientSidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800" data-testid="page-title">
                My Holdings
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Track your investments and cashflows
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={!holdings || holdings.holdings?.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download Report
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading holdings...</div>
          ) : (
            <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="bonds" className="gap-2">
                  <Wallet className="h-4 w-4" /> Bonds
                  {holdings?.holdings?.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{holdings.holdings.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="real-estate" className="gap-2">
                  <Building2 className="h-4 w-4" /> Real Estate
                  {realEstateHoldings.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{realEstateHoldings.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Bonds Tab */}
              <TabsContent value="bonds">
                {!holdings || holdings.holdings?.length === 0 ? (
                  <div className="text-center py-12">
                    <Wallet className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No bond holdings yet</p>
                    <Button
                      className="mt-4 bg-teal-600 hover:bg-teal-700"
                      onClick={() => navigate("/client/opportunities")}
                    >
                      Browse Bond Opportunities
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-white rounded-lg border border-gray-200 p-5">
                        <p className="text-sm text-gray-500 uppercase tracking-wide">Total Investment</p>
                        <p className="text-2xl font-bold text-gray-800 mt-1">
                          {formatINR(holdings.summary?.total_investment)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-200 p-5">
                        <p className="text-sm text-gray-500 uppercase tracking-wide">Total Repaid (Net)</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">
                    {formatINR(holdings.summary?.total_repaid)}
                  </p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <p className="text-sm text-gray-500 uppercase tracking-wide">Upcoming (Expected)</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">
                    {formatINR(holdings.summary?.total_upcoming)}
                  </p>
                </div>
              </div>

              {/* Holdings Table */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Bond Name</th>
                        <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Units</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Invested</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Repaid</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Upcoming</th>
                        <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.holdings?.map((holding) => (
                        <tr key={holding.trade_id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <span className="font-medium text-gray-800">{holding.bond_name}</span>
                            <br />
                            <span className="text-xs text-gray-500">
                              Invested: {format(new Date(holding.investment_date), "MMM dd, yyyy")}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono">{holding.units}</td>
                          <td className="py-3 px-4 text-right font-mono">{formatINR(holding.invested_amount)}</td>
                          <td className="py-3 px-4 text-right font-mono text-green-600">{formatINR(holding.total_repaid)}</td>
                          <td className="py-3 px-4 text-right font-mono text-blue-600">{formatINR(holding.total_upcoming)}</td>
                          <td className="py-3 px-4 text-center">
                            {holding.status === 'completed' ? (
                              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                                Completed
                              </span>
                            ) : (
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => viewCashflows(holding)}
                            >
                              View Cashflows
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cashflow Modal */}
      <Dialog open={showCashflowModal} onOpenChange={setShowCashflowModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Cashflow Schedule - {selectedHolding?.bond_name}
            </DialogTitle>
          </DialogHeader>
          
          {selectedHolding && (
            <div className="mt-4">
              {/* Summary Info */}
              <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Units</p>
                  <p className="font-semibold">{selectedHolding.units}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Invested</p>
                  <p className="font-semibold">{formatINR(selectedHolding.invested_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Investment Date</p>
                  <p className="font-semibold">
                    {format(new Date(selectedHolding.investment_date), "MMM dd, yyyy")}
                  </p>
                </div>
              </div>

              {/* Cashflows Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-right py-2 px-3">Principal</th>
                      <th className="text-right py-2 px-3">Interest</th>
                      <th className="text-right py-2 px-3">TDS</th>
                      <th className="text-right py-2 px-3">Net Amount</th>
                      <th className="text-center py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedHolding.cashflows?.map((cf, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-2 px-3 font-mono">
                          {format(new Date(cf.date), "MMM dd, yyyy")}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {formatINR(cf.principal_component)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {formatINR(cf.interest_component)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-red-600">
                          -{formatINR(cf.tds_amount)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium">
                          {formatINR(cf.net_amount)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {cf.is_repaid ? (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex items-center justify-center gap-1">
                              <Check className="h-3 w-3" /> Repaid
                            </span>
                          ) : new Date(cf.date) < new Date() ? (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full flex items-center justify-center gap-1">
                              <Clock className="h-3 w-3" /> Due
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                              Upcoming
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
