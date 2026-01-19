import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Share2, Building2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SubBrokerOpportunities() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bonds, setBonds] = useState([]);
  const [realEstateOpportunities, setRealEstateOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all"); // "all", "bonds", "real-estate"

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
    fetchAllOpportunities();
  }, [navigate]);

  const fetchAllOpportunities = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      // Fetch both bonds and real estate in parallel
      const [bondsRes, realEstateRes] = await Promise.all([
        axios.get(`${API}/bonds`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/real-estate-opportunities`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setBonds(bondsRes.data || []);
      setRealEstateOpportunities(realEstateRes.data || []);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching opportunities:", error);
      setLoading(false);
    }
  };

  const handleShareBond = (bond) => {
    const shareText = `Investment Opportunity: ${bond.name}\n\nPrincipal: ₹${bond.principal_amount.toLocaleString()}\nIRR: ${bond.secondary_irr}%\nUnits Available: ${(bond.total_units || 1) - (bond.units_sold || 0)}\n\nView details and calculate returns!`;
    
    if (navigator.share) {
      navigator.share({
        title: bond.name,
        text: shareText
      }).catch(() => {
        navigator.clipboard.writeText(shareText);
        toast.success("Bond details copied to clipboard!");
      });
    } else {
      navigator.clipboard.writeText(shareText);
      toast.success("Bond details copied to clipboard!");
    }
  };

  const handleShareRealEstate = (property) => {
    const shareText = `Real Estate Opportunity: ${property.building_name}\n\nUnit: ${property.unit_no}\nPrice: ${property.price ? `AED ${property.price.toLocaleString()}` : 'Contact for price'}\nType: ${property.type || 'N/A'}\n\nView details!`;
    
    if (navigator.share) {
      navigator.share({
        title: property.building_name,
        text: shareText
      }).catch(() => {
        navigator.clipboard.writeText(shareText);
        toast.success("Property details copied to clipboard!");
      });
    } else {
      navigator.clipboard.writeText(shareText);
      toast.success("Property details copied to clipboard!");
    }
  };

  // Categorize bonds using backend-calculated status
  const availableBonds = bonds.filter(b => b.status === 'available');
  const fundedBonds = bonds.filter(b => b.status === 'funded');
  const closedBonds = bonds.filter(b => b.status === 'closed');

  // Categorize real estate by status
  const availableRealEstate = realEstateOpportunities.filter(p => p.status === 'available' || !p.status);
  const soldRealEstate = realEstateOpportunities.filter(p => p.status === 'sold');

  // Combined counts
  const totalAvailable = availableBonds.length + availableRealEstate.length;
  const totalFunded = fundedBonds.length + soldRealEstate.length;
  const totalClosed = closedBonds.length;

  const BondCard = ({ bond, status }) => {
    const unitsAvailable = (bond.total_units || 1) - (bond.units_sold || 0);
    const daysToMaturity = Math.ceil((new Date(bond.end_date) - new Date()) / (1000 * 60 * 60 * 24));

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5 hover:border-amber-500 transition-colors" data-testid={`bond-card-${bond.id}`}>
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-800">{bond.name}</h3>
          {status === 'available' && (
            <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              Available
            </span>
          )}
          {status === 'funded' && (
            <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
              Funded
            </span>
          )}
          {status === 'closed' && (
            <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
              Closed
            </span>
          )}
        </div>

        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between">
            <span className="text-gray-600">Principal:</span>
            <span className="font-mono font-medium">₹{bond.principal_amount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">IRR (Gross):</span>
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
            <span className="text-xs">
              {status === 'closed' ? 'Completed' : `${daysToMaturity} days`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/bonds/${bond.id}`)}
            data-testid={`calculate-btn-${bond.id}`}
          >
            Calculate
          </Button>
          {status === 'available' && (
            <Button
              size="sm"
              onClick={() => handleShareBond(bond)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid={`share-btn-${bond.id}`}
            >
              <Share2 className="h-4 w-4 mr-1" />
              Share
            </Button>
          )}
        </div>
      </div>
    );
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <SubBrokerSidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-800" data-testid="subbroker-opportunities-title">Opportunities</h1>
          <p className="text-sm text-gray-500 mt-1">Share these investment opportunities with your clients</p>
        </div>

        {/* Tabs */}
        <div className="p-8">
          <Tabs defaultValue="available" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="available" className="px-8" data-testid="tab-available">
                Available ({availableBonds.length})
              </TabsTrigger>
              <TabsTrigger value="funded" className="px-8" data-testid="tab-funded">
                Funded ({fundedBonds.length})
              </TabsTrigger>
              <TabsTrigger value="closed" className="px-8" data-testid="tab-closed">
                Closed ({closedBonds.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="available">
              {loading ? (
                <p className="text-center text-gray-500 py-12">Loading...</p>
              ) : availableBonds.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No available opportunities at the moment</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {availableBonds.map(bond => (
                    <BondCard key={bond.id} bond={bond} status="available" />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="funded">
              {loading ? (
                <p className="text-center text-gray-500 py-12">Loading...</p>
              ) : fundedBonds.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No funded bonds yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {fundedBonds.map(bond => (
                    <BondCard key={bond.id} bond={bond} status="funded" />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="closed">
              {loading ? (
                <p className="text-center text-gray-500 py-12">Loading...</p>
              ) : closedBonds.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No closed bonds yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {closedBonds.map(bond => (
                    <BondCard key={bond.id} bond={bond} status="closed" />
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
