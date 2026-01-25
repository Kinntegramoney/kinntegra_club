import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { User, Building2, MapPin, CreditCard, UserCheck, FileText, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ClientProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [clientDetails, setClientDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Kinntegraa | My Profile";
  }, []);

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
    fetchProfile(parsedUser.client_id);
  }, [navigate]);

  const fetchProfile = async (clientId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/clients/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClientDetails(response.data);
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
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
                My Profile
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                View your profile and contact information
              </p>
            </div>
            {clientDetails?.verification_status === 'verified' && (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full font-medium flex items-center gap-1">
                <Check className="h-4 w-4" /> Verified
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading profile...</div>
          ) : !clientDetails ? (
            <div className="text-center py-12">
              <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Profile not found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Personal Details */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                  <User className="h-5 w-5 text-etihad-gold-600" />
                  <h3 className="font-semibold text-gray-800">Personal Details</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Full Name</p>
                    <p className="font-medium text-gray-800">{clientDetails.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">PAN Number</p>
                    <p className="font-mono font-medium text-gray-800">{clientDetails.pan_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Date of Birth</p>
                    <p className="font-medium text-gray-800">
                      {clientDetails.date_of_birth ? format(new Date(clientDetails.date_of_birth), "MMM dd, yyyy") : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Father/Husband Name</p>
                    <p className="font-medium text-gray-800">{clientDetails.father_husband_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Occupation</p>
                    <p className="font-medium text-gray-800">{clientDetails.occupation || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Demat Account No.</p>
                    <p className="font-mono font-medium text-gray-800">{clientDetails.demat_account_no || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Email</p>
                    <p className="font-medium text-gray-800">{clientDetails.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Mobile</p>
                    <p className="font-medium text-gray-800">{clientDetails.mobile || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Country of Residency</p>
                    <p className="font-medium text-gray-800">{clientDetails.country_of_residency || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Passport Type</p>
                    <p className="font-medium text-gray-800 capitalize">{clientDetails.passport_type || 'Indian'}</p>
                  </div>
                </div>
              </div>
              
              {/* Address Details */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                  <MapPin className="h-5 w-5 text-etihad-gold-600" />
                  <h3 className="font-semibold text-gray-800">Address Details</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Address Line 1</p>
                    <p className="font-medium text-gray-800">{clientDetails.address_line1 || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Address Line 2</p>
                    <p className="font-medium text-gray-800">{clientDetails.address_line2 || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">City</p>
                    <p className="font-medium text-gray-800">{clientDetails.city || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">State</p>
                    <p className="font-medium text-gray-800">{clientDetails.state || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Pincode</p>
                    <p className="font-mono font-medium text-gray-800">{clientDetails.pincode || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Country</p>
                    <p className="font-medium text-gray-800">{clientDetails.country || 'India'}</p>
                  </div>
                </div>
              </div>
              
              {/* Bank Details */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                  <Building2 className="h-5 w-5 text-etihad-gold-600" />
                  <h3 className="font-semibold text-gray-800">Bank Details</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Bank Name</p>
                    <p className="font-medium text-gray-800">{clientDetails.bank_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Account Number</p>
                    <p className="font-mono font-medium text-gray-800">{clientDetails.account_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Branch</p>
                    <p className="font-medium text-gray-800">{clientDetails.branch || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">IFSC Code</p>
                    <p className="font-mono font-medium text-gray-800">{clientDetails.ifsc_code || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Account Type</p>
                    <p className="font-medium text-gray-800">{clientDetails.account_type || '-'}</p>
                  </div>
                </div>
              </div>
              
              {/* International Bank Details (NRI) */}
              {(clientDetails.passport_type === 'foreign' || clientDetails.intl_bank_name) && (
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-800">International Bank Details</h3>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded ml-auto">NRI</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Bank Name</p>
                      <p className="font-medium text-gray-800">{clientDetails.intl_bank_name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Account Number</p>
                      <p className="font-mono font-medium text-gray-800">{clientDetails.intl_account_number || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">IBAN</p>
                      <p className="font-mono font-medium text-gray-800">{clientDetails.intl_iban || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">SWIFT Code</p>
                      <p className="font-mono font-medium text-gray-800">{clientDetails.intl_swift_code || '-'}</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Passport Details */}
              {(clientDetails.passport_number || clientDetails.passport_type === 'foreign') && (
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                    <CreditCard className="h-5 w-5 text-etihad-maroon-600" />
                    <h3 className="font-semibold text-gray-800">Passport Details</h3>
                    <span className="text-xs bg-indigo-100 text-etihad-maroon-700 px-2 py-0.5 rounded ml-auto capitalize">{clientDetails.passport_type || 'Indian'}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Passport Number</p>
                      <p className="font-mono font-medium text-gray-800">{clientDetails.passport_number || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Valid From</p>
                      <p className="font-medium text-gray-800">
                        {clientDetails.passport_valid_from ? format(new Date(clientDetails.passport_valid_from), "MMM dd, yyyy") : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Valid Until</p>
                      <p className="font-medium text-gray-800">
                        {clientDetails.passport_valid_until ? format(new Date(clientDetails.passport_valid_until), "MMM dd, yyyy") : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Country of Issue</p>
                      <p className="font-medium text-gray-800">{clientDetails.passport_country_of_issue || '-'}</p>
                    </div>
                    {clientDetails.country_of_residency && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Country of Residency</p>
                        <p className="font-medium text-gray-800">{clientDetails.country_of_residency || '-'}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Emirates ID Details - Shows when country of residency is UAE */}
              {clientDetails.country_of_residency && 
               (clientDetails.country_of_residency.toLowerCase().includes('emirates') || 
                clientDetails.country_of_residency.toLowerCase() === 'uae') && (
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                    <CreditCard className="h-5 w-5 text-teal-600" />
                    <h3 className="font-semibold text-gray-800">Emirates ID Details</h3>
                    <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded ml-auto">UAE Resident</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Emirates ID Number</p>
                      <p className="font-mono font-medium text-gray-800">{clientDetails.emirates_id || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Emirates ID Expiry</p>
                      <p className="font-medium text-gray-800">
                        {clientDetails.emirates_id_expiry ? format(new Date(clientDetails.emirates_id_expiry), "MMM dd, yyyy") : '-'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* UCC List */}
              {clientDetails.ucc_list && clientDetails.ucc_list.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                    <FileText className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold text-gray-800">UCC List</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {clientDetails.ucc_list.map((ucc, idx) => (
                      <span key={idx} className="px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-mono">
                        {ucc}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Nominee Details */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                  <UserCheck className="h-5 w-5 text-etihad-gold-600" />
                  <h3 className="font-semibold text-gray-800">Nominee Details</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Nominee Name</p>
                    <p className="font-medium text-gray-800">{clientDetails.nominee_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Relationship</p>
                    <p className="font-medium text-gray-800">{clientDetails.nominee_relationship || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Date of Birth</p>
                    <p className="font-medium text-gray-800">
                      {clientDetails.nominee_dob ? format(new Date(clientDetails.nominee_dob), "MMM dd, yyyy") : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Mobile</p>
                    <p className="font-medium text-gray-800">{clientDetails.nominee_mobile || '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
