import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { TrendingUp, Calendar, DollarSign, Percent, ChevronRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ClientOpportunities() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bonds, setBonds] = useState([]);
  const [realEstateOpportunities, setRealEstateOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);

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
    fetchAllOpportunities();
  }, [navigate]);

  const fetchAllOpportunities = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      // Fetch both bonds and real estate in parallel
      const [bondsRes, realEstateRes] = await Promise.all([
        axios.get(`${API}/client/opportunities`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/real-estate-opportunities`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setBonds(bondsRes.data || []);
      // Filter real estate for available ones
      const availableRE = (realEstateRes.data || []).filter(p => p.status === 'available' || !p.status);
      setRealEstateOpportunities(availableRE);
    } catch (error) {
      console.error("Error fetching opportunities:", error);
      toast.error("Failed to load opportunities");
    } finally {
      setLoading(false);
    }
  };

  const formatINR = (amount) => {
    return `₹ ${amount?.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || 0}`;
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
                Investment Opportunities
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Browse available bonds and real estate opportunities
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-teal-100 text-teal-700 text-sm rounded-full font-medium">
                {bonds.length + realEstateOpportunities.length} Available
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading opportunities...</div>
          ) : (bonds.length === 0 && realEstateOpportunities.length === 0) ? (
            <div className="text-center py-12">
              <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No opportunities available at the moment</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Real Estate Opportunities */}
              {realEstateOpportunities.map((property) => (
                <div
                  key={property.id}
                  className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/real-estate/${property.id}`)}
                  data-testid={`property-card-${property.id}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-blue-600" />
                      <span className="text-xs text-blue-600 font-medium">REAL ESTATE</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  </div>
                  
                  <div className="mb-4">
                    <h3 className="font-semibold text-gray-800 truncate">{property.building_name}</h3>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                      Available
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600">Unit: {property.unit_no}</span>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600">
                        {property.price ? `AED ${property.price.toLocaleString()}` : 'Contact for price'}
                      </span>
                    </div>

                    {property.type && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600">Type: {property.type}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/real-estate/${property.id}`);
                      }}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              ))}

              {/* Bond Opportunities */}
              {bonds.map((bond) => (
                <div
                  key={bond.id}
                  className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/bonds/${bond.id}`)}
                  data-testid={`bond-card-${bond.id}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-amber-600" />
                      <span className="text-xs text-amber-600 font-medium">BOND / NCD</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  </div>

                  <div className="mb-4">
                    <h3 className="font-semibold text-gray-800 truncate">{bond.name}</h3>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                      {bond.units_remaining} units available
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600">
                        {format(new Date(bond.start_date), "MMM dd, yyyy")} - {format(new Date(bond.end_date), "MMM dd, yyyy")}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600">
                        Principal: {formatINR(bond.principal_amount)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <Percent className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600">
                        IRR: {bond.secondary_irr}%
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <Button
                      className="w-full bg-teal-600 hover:bg-teal-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/bonds/${bond.id}`);
                      }}
                    >
                      View Details & Calculate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
