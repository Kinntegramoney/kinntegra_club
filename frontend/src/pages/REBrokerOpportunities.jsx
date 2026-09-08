import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { 
  Building2, Plus, MapPin, Eye, RefreshCw, Search, Pencil, Share2,
  TrendingUp, ChevronLeft, ChevronRight, ChevronDown, Users
} from "lucide-react";
import REBrokerSidebar from "@/components/REBrokerSidebar";
import CreateRealEstateModal from "@/components/CreateRealEstateModal";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function REBrokerOpportunities() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [brokerProfile, setBrokerProfile] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [seedingData, setSeedingData] = useState(false);
  
  // Scroll refs for horizontal scrolling
  const openScrollRef = useRef(null);
  const fundedScrollRef = useRef(null);
  const closedScrollRef = useRef(null);

  useEffect(() => {
    document.title = "Kinntegraa | RE Broker - Opportunities";
    
    const userData = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    
    if (!userData || !token) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "re_broker") {
      toast.error("Access denied.");
      navigate("/login");
      return;
    }
    
    setUser(parsedUser);
    fetchBrokerProfile(token);
    fetchOpportunities(token);
  }, [navigate]);

  const fetchBrokerProfile = async (token) => {
    try {
      const response = await axios.get(`${API}/re-broker/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBrokerProfile(response.data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const fetchOpportunities = useCallback(async (token) => {
    setLoading(true);
    try {
      const tkn = token || localStorage.getItem("token");
      const response = await axios.get(`${API}/real-estate-opportunities`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      const data = response.data;
      // API returns { data: [...], pagination: {...} } format
      setOpportunities(Array.isArray(data) ? data : (data?.data || data?.opportunities || []));
    } catch (error) {
      console.error("Error fetching opportunities:", error);
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleScroll = (ref, direction) => {
    if (ref.current) {
      const scrollAmount = 400;
      ref.current.scrollBy({
        left: direction === 'right' ? scrollAmount : -scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Seed demo data function
  const handleSeedDemoData = async () => {
    setSeedingData(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/re-broker/seed-demo-data`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Demo data created: ${response.data.investors_created} investors, ${response.data.properties_updated} properties updated`);
      fetchOpportunities();
    } catch (error) {
      console.error("Error seeding demo data:", error);
      toast.error("Failed to seed demo data");
    } finally {
      setSeedingData(false);
    }
  };

  // Filter and categorize opportunities
  const filteredOpportunities = opportunities.filter(opp => {
    const query = searchQuery.toLowerCase();
    return (
      opp.building_name?.toLowerCase().includes(query) ||
      opp.developer?.toLowerCase().includes(query) ||
      opp.location?.toLowerCase().includes(query) ||
      opp.unit_no?.toLowerCase().includes(query)
    );
  });

  const openOpportunities = filteredOpportunities.filter(opp => 
    opp.status === 'available' || opp.status === 'open' || !opp.status
  );
  const fundedOpportunities = filteredOpportunities.filter(opp => 
    opp.status === 'funded' || opp.status === 'invested'
  );
  const closedOpportunities = filteredOpportunities.filter(opp => 
    opp.status === 'closed' || opp.status === 'sold'
  );

  const formatCurrency = (amount, currency = 'AED') => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Real Estate Card Component
  const RealEstateCard = ({ opp, status }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    
    const nextImage = () => {
      if (opp.images && opp.images.length > 1) {
        setCurrentImageIndex((prev) => (prev + 1) % opp.images.length);
      }
    };
    
    const prevImage = () => {
      if (opp.images && opp.images.length > 1) {
        setCurrentImageIndex((prev) => (prev - 1 + opp.images.length) % opp.images.length);
      }
    };
    
    const getImageSrc = (img) => {
      if (!img) return '';
      if (typeof img === 'string') return img;
      if (img.data) return `data:${img.content_type || 'image/jpeg'};base64,${img.data}`;
      return img.url || '';
    };

    return (
      <div className="bg-white border border-gray-200 rounded-lg hover:border-teal-500 transition-colors flex flex-col h-full">
        {/* Property Images Carousel */}
        <div className="relative h-44 overflow-hidden rounded-t-lg bg-gray-100 flex-shrink-0">
          {opp.images && opp.images.length > 0 ? (
            <>
              <img 
                src={getImageSrc(opp.images[currentImageIndex])}
                alt={`${opp.building_name} - Image ${currentImageIndex + 1}`}
                className="w-full h-full object-cover transition-opacity duration-300"
                onError={(e) => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="12">No Image</text></svg>'; }}
              />
              
              {opp.images.length > 1 && (
                <>
                  <button 
                    onClick={(e) => { e.stopPropagation(); prevImage(); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors z-10"
                  >
                    <ChevronDown className="h-4 w-4 rotate-90" />
                  </button>
                  
                  <button 
                    onClick={(e) => { e.stopPropagation(); nextImage(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors z-10"
                  >
                    <ChevronDown className="h-4 w-4 -rotate-90" />
                  </button>
                  
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">
                    {currentImageIndex + 1} / {opp.images.length}
                  </div>
                  
                  <div className="absolute bottom-2 right-2 flex gap-1">
                    {opp.images.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(idx); }}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          idx === currentImageIndex ? 'bg-white' : 'bg-white/50'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-50 to-cyan-50">
              <div className="text-center">
                <Building2 className="h-10 w-10 text-teal-300 mx-auto mb-1" />
                <p className="text-[10px] text-teal-400">No images</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Card Content */}
        <div className="p-5 flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                <Building2 className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">{opp.building_name}</h3>
                <p className="text-sm text-gray-500">Unit {opp.unit_no} • Floor {opp.floor || '-'}</p>
                {opp.unit_type && (
                  <p className="text-xs text-teal-600 font-medium">{opp.unit_type}</p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {(() => {
                const pt = (opp.property_type || 'off_plan').toLowerCase();
                const map = {
                  off_plan:  { label: 'Off-Plan',  cls: 'bg-purple-100 text-purple-700 hover:bg-purple-100' },
                  ready:     { label: 'Ready',     cls: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
                  secondary: { label: 'Secondary', cls: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
                  rental:    { label: 'Rental',    cls: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
                };
                const m = map[pt] || map.off_plan;
                return <Badge className={m.cls}>{m.label}</Badge>;
              })()}
              {status === 'available' && (
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Open</span>
              )}
              {status === 'funded' && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">Funded</span>
              )}
              {status === 'closed' && (
                <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">Closed</span>
              )}
            </div>
          </div>

          {/* Property Info Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Size</p>
              <p className="font-semibold text-gray-800">{opp.total_area?.toLocaleString() || '-'} sqft</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Total Cost</p>
              <p className="font-semibold text-teal-700">{formatCurrency(opp.total_cost || opp.total_price)}</p>
            </div>
          </div>

          {/* Price Info */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-blue-50 rounded-lg p-3 cursor-help">
                    <p className="text-xs text-gray-500 mb-1">Price/sqft</p>
                    <p className="font-semibold text-blue-700">
                      {formatCurrency(opp.price_per_sqft || ((opp.total_cost || opp.total_price) / (opp.total_area || 1)))}
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" className="bg-gray-900 text-white border-0 p-3 w-64">
                  <p className="font-medium mb-2 text-gray-200">How it's derived</p>
                  {opp.price_per_sqft ? (
                    <>
                      <div className="flex justify-between py-0.5">
                        <span className="text-gray-400">Entered directly</span>
                        <span>{formatCurrency(opp.price_per_sqft)}/sqft</span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">Set on the property; not derived from Total Cost ÷ Area.</p>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between py-0.5">
                        <span className="text-gray-400">Total Cost</span>
                        <span>{formatCurrency(opp.total_cost || opp.total_price)}</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-gray-400">÷ Total Area</span>
                        <span>{opp.total_area?.toLocaleString() || 0} sqft</span>
                      </div>
                      <div className="border-t border-gray-700 mt-2 pt-2 flex justify-between font-medium">
                        <span>= Price/sqft</span>
                        <span>{formatCurrency((opp.total_cost || opp.total_price || 0) / (opp.total_area || 1))}/sqft</span>
                      </div>
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Expected Sale/sqft</p>
              <p className="font-semibold text-green-700">
                {opp.expected_sale_rate ? formatCurrency(opp.expected_sale_rate) : 'TBD'}
              </p>
            </div>
          </div>

          {/* Sale Date & XIRR Info */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-amber-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Expected Sale Date</p>
              <p className="font-semibold text-amber-700">
                {opp.estimated_sell_date 
                  ? new Date(opp.estimated_sell_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) 
                  : (opp.handover_date 
                    ? opp.handover_date
                    : 'TBD')}
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Expected XIRR</p>
              <p className="font-semibold text-purple-700">
                {opp.expected_xirr ? `${opp.expected_xirr}%` : 'Set sale details'}
              </p>
            </div>
          </div>

          {/* Location */}
          {opp.location && (
            <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
              <MapPin className="h-4 w-4" />
              {opp.location}
            </div>
          )}

          {/* Funded-specific: Investment Status */}
          {status === 'funded' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 text-green-700">
                <TrendingUp className="h-4 w-4" />
                <span className="font-medium text-sm">
                  Fully Invested • {opp.investors?.length || opp.current_investors || 4} participants • 100% committed
                </span>
              </div>
            </div>
          )}

          {/* Funded-specific: Expected Returns */}
          {status === 'funded' && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Expected Sale</p>
                <p className="font-semibold text-emerald-700">
                  {formatCurrency((opp.expected_sale_rate || 0) * (opp.total_area || 0))}
                </p>
              </div>
              <div className="bg-teal-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Projected Profit</p>
                <p className="font-semibold text-teal-700">
                  {formatCurrency(((opp.expected_sale_rate || 0) * (opp.total_area || 0)) - (opp.total_cost || 0))}
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 mt-auto">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={() => navigate(`/re-broker/opportunities/${opp.id}`)}
            >
              <Eye className="h-4 w-4 mr-1" />
              View Details
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              className="px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
              onClick={async () => {
                try {
                  const token = localStorage.getItem("token");
                  const response = await axios.get(`${API}/real-estate-opportunities/${opp.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                  });
                  setEditingProperty(response.data);
                } catch (error) {
                  console.error("Error fetching property details:", error);
                  toast.error("Failed to load property details");
                }
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {status !== 'funded' && (
              <Button 
                variant="outline" 
                size="sm"
                className="px-3 text-teal-600 hover:text-teal-700 hover:bg-teal-50 border-teal-200"
                onClick={() => toast.info("Share feature coming soon")}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <REBrokerSidebar user={user} brokerProfile={brokerProfile} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="ml-12 md:ml-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800" data-testid="page-title">Opportunities</h1>
              <p className="text-sm text-gray-500 mt-1">
                All investment opportunities - Real Estate
              </p>
            </div>
            <div className="flex items-center gap-3">
              {fundedOpportunities.length > 0 && (
                <Button 
                  onClick={handleSeedDemoData}
                  variant="outline"
                  className="border-blue-500 text-blue-600 hover:bg-blue-50 gap-2"
                  disabled={seedingData}
                  data-testid="seed-demo-data-btn"
                >
                  <Users className={`h-4 w-4 ${seedingData ? 'animate-spin' : ''}`} />
                  {seedingData ? 'Seeding...' : 'Add Demo Investors'}
                </Button>
              )}
              <Button 
                onClick={() => setShowAddModal(true)} 
                variant="outline"
                className="border-teal-500 text-teal-600 hover:bg-teal-50 gap-2"
                data-testid="add-real-estate-btn"
              >
                <Plus className="h-4 w-4" />
                Add Real Estate
              </Button>
            </div>
          </div>
        </div>

        {/* Real Estate Tab Content */}
        <div className="p-4 md:p-8">
          {/* Tab Header - Real Estate Only */}
          <div className="mb-6">
            <div className="inline-flex items-center px-4 py-2 bg-white border border-gray-200 rounded-lg">
              <Building2 className="h-4 w-4 mr-2 text-teal-600" />
              <span className="font-medium text-gray-700">Real Estate ({filteredOpportunities.length})</span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-teal-600" />
            </div>
          ) : filteredOpportunities.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border">
              <Building2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No real estate opportunities</p>
              <p className="text-sm text-gray-400 mb-4">Add your first listing to get started</p>
              <Button 
                onClick={() => setShowAddModal(true)} 
                variant="outline"
                className="border-teal-500 text-teal-600 hover:bg-teal-50"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Real Estate
              </Button>
            </div>
          ) : (
            <div className="space-y-10">
              {/* Open Opportunities */}
              {openOpportunities.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4 bg-gradient-to-r from-green-50 to-transparent py-3 px-4 rounded-lg">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <h3 className="text-xl font-bold text-gray-800">Open ({openOpportunities.length})</h3>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => handleScroll(openScrollRef, 'left')}
                      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                    >
                      <ChevronLeft className="h-6 w-6 text-gray-600" />
                    </button>
                    <button
                      onClick={() => handleScroll(openScrollRef, 'right')}
                      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                    >
                      <ChevronRight className="h-6 w-6 text-gray-600" />
                    </button>
                    <div ref={openScrollRef} className="overflow-x-auto pb-4 scrollbar-hide px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                      <div className="flex gap-6" style={{ minWidth: 'max-content' }}>
                        {openOpportunities.map(opp => (
                          <div key={opp.id} className="w-[380px] flex-shrink-0">
                            <RealEstateCard opp={opp} status="available" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Funded Opportunities */}
              {fundedOpportunities.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4 bg-gradient-to-r from-blue-50 to-transparent py-3 px-4 rounded-lg">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <h3 className="text-xl font-bold text-gray-800">Funded ({fundedOpportunities.length})</h3>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => handleScroll(fundedScrollRef, 'left')}
                      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                    >
                      <ChevronLeft className="h-6 w-6 text-gray-600" />
                    </button>
                    <button
                      onClick={() => handleScroll(fundedScrollRef, 'right')}
                      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                    >
                      <ChevronRight className="h-6 w-6 text-gray-600" />
                    </button>
                    <div ref={fundedScrollRef} className="overflow-x-auto pb-4 scrollbar-hide px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                      <div className="flex gap-6" style={{ minWidth: 'max-content' }}>
                        {fundedOpportunities.map(opp => (
                          <div key={opp.id} className="w-[380px] flex-shrink-0">
                            <RealEstateCard opp={opp} status="funded" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Closed Opportunities */}
              {closedOpportunities.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4 bg-gradient-to-r from-gray-100 to-transparent py-3 px-4 rounded-lg">
                    <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                    <h3 className="text-xl font-bold text-gray-800">Closed ({closedOpportunities.length})</h3>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => handleScroll(closedScrollRef, 'left')}
                      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                    >
                      <ChevronLeft className="h-6 w-6 text-gray-600" />
                    </button>
                    <button
                      onClick={() => handleScroll(closedScrollRef, 'right')}
                      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                    >
                      <ChevronRight className="h-6 w-6 text-gray-600" />
                    </button>
                    <div ref={closedScrollRef} className="overflow-x-auto pb-4 scrollbar-hide px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                      <div className="flex gap-6" style={{ minWidth: 'max-content' }}>
                        {closedOpportunities.map(opp => (
                          <div key={opp.id} className="w-[380px] flex-shrink-0">
                            <RealEstateCard opp={opp} status="closed" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Real Estate Modal */}
      {showAddModal && (
        <CreateRealEstateModal 
          onClose={() => setShowAddModal(false)} 
          onSuccess={() => {
            setShowAddModal(false);
            fetchOpportunities();
          }}
        />
      )}

      {/* Edit Real Estate Modal */}
      {editingProperty && (
        <CreateRealEstateModal 
          opportunity={editingProperty}
          onClose={() => setEditingProperty(null)} 
          onSuccess={() => {
            setEditingProperty(null);
            fetchOpportunities();
          }}
        />
      )}
    </div>
  );
}
