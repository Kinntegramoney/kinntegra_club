import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import CreateRealEstateModal from "@/components/CreateRealEstateModal";
import EditBondModal from "@/components/EditBondModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, TrendingUp, Plus, Pencil } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Opportunities() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bonds, setBonds] = useState([]);
  const [realEstateOpps, setRealEstateOpps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRealEstateModal, setShowRealEstateModal] = useState(false);
  const [editingBond, setEditingBond] = useState(null);
  const [editingRealEstate, setEditingRealEstate] = useState(null);

  // Set page title
  useEffect(() => {
    document.title = "Kinntegraa | Opportunities";
  }, []);

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

  // Real Estate: available OR partially_invested should show in "Open" section
  const availableRE = realEstateOpps.filter(r => r.status === 'available' || r.status === 'partially_invested');
  const investedRE = realEstateOpps.filter(r => r.status === 'fully_invested');
  const closedRE = realEstateOpps.filter(r => r.status === 'closed' || r.status === 'sold');

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

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate(`/bonds/${bond.id}`)}>
            View Details
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
            onClick={(e) => { e.stopPropagation(); setEditingBond(bond); }}
            title="Edit Bond"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const RealEstateCard = ({ opp, status }) => {
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    };

    // Cost breakdown for tooltip
    const costBreakdown = [
      { label: "Unit Price", value: opp.unit_price },
      { label: "DLD Fee", value: opp.dld_fee },
      { label: "Admin Fee", value: opp.admin_fee },
      { label: "Brokerage", value: opp.broker_fee },
      { label: "Other Fees", value: opp.other_fees },
    ].filter(item => item.value > 0);

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5 hover:border-teal-500 transition-colors">
        {/* Header - Property Name */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <Building2 className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">{opp.building_name}</h3>
              <p className="text-sm text-gray-500">Unit {opp.unit_no} • Floor {opp.floor}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Off-Plan</Badge>
            {status === 'available' && (
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Available</span>
            )}
            {status === 'invested' && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">Invested</span>
            )}
          </div>
        </div>

        {/* Property Info Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Size/Type */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Size</p>
            <p className="font-semibold text-gray-800">{opp.unit_type}</p>
            <p className="text-sm text-gray-600">{opp.total_area} sqft</p>
          </div>
          
          {/* Total Cost with Tooltip */}
          <div className="bg-gray-50 rounded-lg p-3 relative group cursor-help">
            <p className="text-xs text-gray-500 mb-1">Total Cost <span className="text-orange-500">*</span></p>
            <p className="font-semibold text-teal-700">AED {formatCurrency(opp.total_cost)}</p>
            
            {/* Tooltip on hover */}
            <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white text-xs rounded-lg p-3 w-48 -right-2 top-full mt-1 shadow-lg">
              <p className="font-medium mb-2 text-gray-200">Cost Breakdown</p>
              {costBreakdown.map((item, idx) => (
                <div key={idx} className="flex justify-between py-0.5">
                  <span className="text-gray-400">{item.label}</span>
                  <span>AED {formatCurrency(item.value)}</span>
                </div>
              ))}
              <div className="border-t border-gray-700 mt-2 pt-2 flex justify-between font-medium">
                <span>Total</span>
                <span>AED {formatCurrency(opp.total_cost)}</span>
              </div>
              {/* Tooltip arrow */}
              <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 transform rotate-45"></div>
            </div>
          </div>
        </div>

        {/* Location if present */}
        {opp.location && (
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
            <MapPin className="h-4 w-4" />
            {opp.location}
          </div>
        )}

        {/* Interest & Investors */}
        <div className="flex items-center justify-between mb-4 py-3 border-t border-b border-gray-100">
          <div className="text-center flex-1">
            <p className="text-xs text-gray-500">Interested</p>
            <p className="font-bold text-amber-600">{opp.interested_count || 0}</p>
          </div>
          <div className="w-px h-8 bg-gray-200"></div>
          <div className="text-center flex-1">
            <p className="text-xs text-gray-500">Investors</p>
            <p className="font-bold text-purple-600">{opp.current_investors || 0} <span className="text-gray-400 font-normal">/ 4</span></p>
          </div>
        </div>

        {/* Payment Progress - only show if payments exist */}
        {opp.payment_schedule && opp.payment_schedule.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-500">Payment Progress</span>
              <span className="font-medium text-teal-600">{opp.total_payment_percentage_completed || 0}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${opp.total_payment_percentage_completed || 0}%` }} />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate(`/broker/real-estate/${opp.id}`)}>
            View Details
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
            onClick={(e) => { e.stopPropagation(); setEditingRealEstate(opp); }}
            title="Edit Property"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header with Add Buttons */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Opportunities</h1>
              <p className="text-sm text-gray-500 mt-1">All investment opportunities - Bonds and Real Estate</p>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                onClick={() => navigate("/bonds/create")} 
                className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Bonds
              </Button>
              <Button 
                onClick={() => setShowRealEstateModal(true)} 
                variant="outline"
                className="border-teal-500 text-teal-600 hover:bg-teal-50 gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Real Estate
              </Button>
            </div>
          </div>
        </div>

        {/* Edit Bond Modal */}
        {editingBond && (
          <EditBondModal 
            bond={editingBond}
            onClose={() => setEditingBond(null)} 
            onSuccess={() => { setEditingBond(null); fetchData(); }}
          />
        )}

        {/* Real Estate Modal */}
        {showRealEstateModal && (
          <CreateRealEstateModal 
            onClose={() => setShowRealEstateModal(false)} 
            onSuccess={fetchData}
          />
        )}

        {/* Edit Real Estate Modal */}
        {editingRealEstate && (
          <CreateRealEstateModal 
            opportunity={editingRealEstate}
            onClose={() => setEditingRealEstate(null)} 
            onSuccess={() => { setEditingRealEstate(null); fetchData(); }}
          />
        )}

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
