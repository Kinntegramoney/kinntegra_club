import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, TrendingUp } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Opportunities() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bonds, setBonds] = useState([]);
  const [realEstateOpps, setRealEstateOpps] = useState([]);
  const [loading, setLoading] = useState(true);

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
      const [bondsRes, realEstateRes] = await Promise.all([
        axios.get(`${API}/bonds`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/real-estate-opportunities`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setBonds(bondsRes.data);
      setRealEstateOpps(realEstateRes.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  // Categorize by status
  const availableBonds = bonds.filter(b => b.status === 'available');
  const fundedBonds = bonds.filter(b => b.status === 'funded');
  const closedBonds = bonds.filter(b => b.status === 'closed');

  const availableRE = realEstateOpps.filter(r => r.status === 'available');
  const investedRE = realEstateOpps.filter(r => r.status === 'fully_invested');
  const closedRE = realEstateOpps.filter(r => r.status === 'closed');

  // Combined counts
  const availableCount = availableBonds.length + availableRE.length;
  const fundedCount = fundedBonds.length + investedRE.length;
  const closedCount = closedBonds.length + closedRE.length;

  const BondCard = ({ bond, status }) => {
    const unitsAvailable = (bond.total_units || 1) - (bond.units_sold || 0);
    const daysToMaturity = Math.ceil((new Date(bond.end_date) - new Date()) / (1000 * 60 * 60 * 24));

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5 hover:border-amber-500 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-600" />
            <h3 className="text-lg font-semibold text-gray-800">{bond.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-amber-600 border-amber-300">Bond</Badge>
            {status === 'available' && (
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Available</span>
            )}
            {status === 'funded' && (
              <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">Funded</span>
            )}
            {status === 'closed' && (
              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">Closed</span>
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between">
            <span className="text-gray-600">Principal:</span>
            <span className="font-mono font-medium">₹{bond.principal_amount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">IRR:</span>
            <span className="font-mono font-medium text-amber-600">{bond.secondary_irr}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Units:</span>
            <span className="font-mono font-medium">
              {status === 'available' ? `${unitsAvailable} of ${bond.total_units || 1}` : `${bond.total_units || 1} (All)`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Maturity:</span>
            <span className="text-xs">{status === 'closed' ? 'Completed' : `${daysToMaturity} days`}</span>
          </div>
        </div>

        <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`/bonds/${bond.id}`)}>
          View Details
        </Button>
      </div>
    );
  };

  const RealEstateCard = ({ opp, status }) => {
    const investedPercent = opp.total_cost > 0 
      ? Math.round((opp.total_invested || 0) / opp.total_cost * 100) 
      : 0;
    
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    };

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5 hover:border-teal-500 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-teal-600" />
            <h3 className="text-lg font-semibold text-gray-800">{opp.building_name}</h3>
          </div>
          <div className="flex items-center gap-2">
            {opp.property_type === 'off_plan' ? (
              <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Off-Plan</Badge>
            ) : (
              <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-100">Fractional</Badge>
            )}
            {status === 'available' && (
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Available</span>
            )}
            {status === 'invested' && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">Invested</span>
            )}
          </div>
        </div>

        <div className="text-sm text-gray-500 mb-3">
          Unit {opp.unit_no} • {opp.unit_type} • Floor {opp.floor}
        </div>

        {opp.location && (
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
            <MapPin className="h-4 w-4" />
            {opp.location}
          </div>
        )}

        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between">
            <span className="text-gray-600">Total Cost:</span>
            <span className="font-mono font-medium">AED {formatCurrency(opp.total_cost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">DLD Fee:</span>
            <span className="font-mono text-gray-500">{opp.dld_fee_percentage}%</span>
          </div>
          {opp.property_type === 'off_plan' ? (
            <div className="flex justify-between">
              <span className="text-gray-600">Investors:</span>
              <span className="font-mono font-medium text-purple-600">{opp.current_investors} / 4</span>
            </div>
          ) : (
            <div className="flex justify-between">
              <span className="text-gray-600">Invested:</span>
              <span className="font-mono font-medium text-teal-600">{investedPercent}%</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Area:</span>
            <span className="font-mono">{opp.total_area} sqft</span>
          </div>
        </div>

        {/* Payment Progress */}
        {opp.payment_schedule && opp.payment_schedule.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-600">Payment Progress:</span>
              <span className="font-medium text-teal-600">{opp.total_payment_percentage_completed || 0}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-teal-500 h-2 rounded-full" style={{ width: `${opp.total_payment_percentage_completed || 0}%` }} />
            </div>
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`/broker/real-estate/${opp.id}`)}>
          View Details
        </Button>
      </div>
    );
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-800">Opportunities</h1>
          <p className="text-sm text-gray-500 mt-1">All investment opportunities - Bonds and Real Estate</p>
        </div>

        {/* Tabs by Status */}
        <div className="p-8">
          <Tabs defaultValue="available" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="available" className="px-8">
                Available ({availableCount})
              </TabsTrigger>
              <TabsTrigger value="funded" className="px-8">
                Funded/Invested ({fundedCount})
              </TabsTrigger>
              <TabsTrigger value="closed" className="px-8">
                Closed ({closedCount})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="available">
              {loading ? (
                <p className="text-center text-gray-500 py-12">Loading...</p>
              ) : availableCount === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 mb-4">No available opportunities</p>
                  <Button onClick={() => navigate("/broker/admin/bonds")} className="mr-2">Add Bond</Button>
                  <Button onClick={() => navigate("/broker/admin/real-estate")} variant="outline">Add Real Estate</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {availableBonds.map(bond => (
                    <BondCard key={bond.id} bond={bond} status="available" />
                  ))}
                  {availableRE.map(opp => (
                    <RealEstateCard key={opp.id} opp={opp} status="available" />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="funded">
              {loading ? (
                <p className="text-center text-gray-500 py-12">Loading...</p>
              ) : fundedCount === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No funded/invested opportunities yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {fundedBonds.map(bond => (
                    <BondCard key={bond.id} bond={bond} status="funded" />
                  ))}
                  {investedRE.map(opp => (
                    <RealEstateCard key={opp.id} opp={opp} status="invested" />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="closed">
              {loading ? (
                <p className="text-center text-gray-500 py-12">Loading...</p>
              ) : closedCount === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No closed opportunities yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {closedBonds.map(bond => (
                    <BondCard key={bond.id} bond={bond} status="closed" />
                  ))}
                  {closedRE.map(opp => (
                    <RealEstateCard key={opp.id} opp={opp} status="closed" />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
