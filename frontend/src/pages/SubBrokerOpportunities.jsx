import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Share2, Building2, TrendingUp, MapPin } from "lucide-react";
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
  // Real estate: available OR partially_invested should show as "Open" (can still add more investors)
  const availableRealEstate = realEstateOpportunities.filter(p => 
    p.status === 'available' || p.status === 'partially_invested' || !p.status
  );
  const fundedRealEstate = realEstateOpportunities.filter(p => 
    p.status === 'fully_invested' || p.status === 'sold'
  );

  // Combined counts
  const totalAvailable = availableBonds.length + availableRealEstate.length;
  const totalFunded = fundedBonds.length + fundedRealEstate.length;
  const totalClosed = closedBonds.length;

  const BondCard = ({ bond, status }) => {
    const unitsAvailable = (bond.total_units || 1) - (bond.units_sold || 0);
    const daysToMaturity = Math.ceil((new Date(bond.end_date) - new Date()) / (1000 * 60 * 60 * 24));

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5 hover:border-amber-500 transition-colors" data-testid={`bond-card-${bond.id}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-600" />
            <h3 className="text-lg font-semibold text-gray-800">{bond.name}</h3>
          </div>
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

        <div className="text-xs text-amber-600 font-medium mb-2">BOND / NCD</div>

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

  const RealEstateCard = ({ property, status }) => {
    // Determine display status based on actual property status
    const displayStatus = property.status === 'partially_invested' ? 'Partially Invested' :
                          property.status === 'fully_invested' ? 'Fully Invested' :
                          property.status === 'sold' ? 'Sold' :
                          property.status === 'funded' ? 'Funded' :
                          status === 'funded' ? 'Funded' :
                          'Available';
    
    const isAvailable = status === 'available';
    const statusColor = isAvailable ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700';
    const isOffPlan = property.property_type === 'off_plan';
    
    // Calculate payment progress
    const paymentProgress = property.total_payment_percentage_completed || 0;
    
    // Format currency
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
    };
    
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all" data-testid={`property-card-${property.id}`}>
        {/* Header with Building Name, Unit, Floor and Status Badges */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="h-5 w-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-800 truncate">{property.building_name}</h3>
              <p className="text-sm text-gray-500">Unit {property.unit_no} • Floor {property.floor || 'N/A'}</p>
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end flex-shrink-0">
            {isOffPlan && (
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                Off-Plan
              </span>
            )}
            <span className={`px-2 py-0.5 ${statusColor} text-xs font-medium rounded-full`}>
              {displayStatus}
            </span>
          </div>
        </div>

        {/* Size and Total Cost Row */}
        <div className="grid grid-cols-2 gap-4 mb-3 py-3 border-y border-gray-100">
          <div>
            <p className="text-xs text-gray-500 mb-1">Size</p>
            <p className="font-semibold text-gray-800">{property.unit_type || 'N/A'}</p>
            <p className="text-xs text-gray-500">{property.total_area || 0} sqft</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Total Cost*</p>
            <p className="font-semibold text-teal-600">AED {formatCurrency(property.total_cost || property.unit_price)}</p>
          </div>
        </div>

        {/* Location */}
        {property.location && (
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
            <MapPin className="h-4 w-4 text-gray-400" />
            <span className="truncate">{property.location}</span>
          </div>
        )}

        {/* Interested, Investors, Payment Progress */}
        <div className="grid grid-cols-3 gap-2 py-3 border-t border-gray-100">
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">Interested</p>
            <p className="font-semibold text-gray-800">{property.interested_count || 0}</p>
          </div>
          <div className="text-center border-x border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Investors</p>
            <p className="font-semibold text-purple-600">
              {property.current_investors || 0}/{isOffPlan ? 4 : property.max_investors || 10}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">Payment Progress</p>
            <p className="font-semibold text-gray-800">{paymentProgress}%</p>
          </div>
        </div>

        {/* Payment Progress Bar */}
        {property.payment_schedule && property.payment_schedule.length > 0 && (
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
            <div 
              className="bg-teal-500 h-1.5 rounded-full transition-all" 
              style={{ width: `${paymentProgress}%` }}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mt-3">
          <Button
            className="flex-1 bg-teal-600 hover:bg-teal-700"
            onClick={() => navigate(`/real-estate/${property.id}`)}
            data-testid={`view-property-btn-${property.id}`}
          >
            View Details
          </Button>
          {status === 'available' && (
            <Button
              variant="outline"
              onClick={() => handleShareRealEstate(property)}
              data-testid={`share-property-btn-${property.id}`}
            >
              <Share2 className="h-4 w-4" />
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
                Available ({totalAvailable})
              </TabsTrigger>
              <TabsTrigger value="funded" className="px-8" data-testid="tab-funded">
                Funded/Sold ({totalFunded})
              </TabsTrigger>
              <TabsTrigger value="closed" className="px-8" data-testid="tab-closed">
                Closed ({totalClosed})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="available">
              {loading ? (
                <p className="text-center text-gray-500 py-12">Loading...</p>
              ) : totalAvailable === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No available opportunities at the moment</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Real Estate Properties */}
                  {availableRealEstate.map(property => (
                    <RealEstateCard key={property.id} property={property} status="available" />
                  ))}
                  {/* Bonds */}
                  {availableBonds.map(bond => (
                    <BondCard key={bond.id} bond={bond} status="available" />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="funded">
              {loading ? (
                <p className="text-center text-gray-500 py-12">Loading...</p>
              ) : totalFunded === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No funded/sold opportunities yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Funded/Sold Real Estate */}
                  {fundedRealEstate.map(property => (
                    <RealEstateCard key={property.id} property={property} status="funded" />
                  ))}
                  {/* Funded Bonds */}
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
