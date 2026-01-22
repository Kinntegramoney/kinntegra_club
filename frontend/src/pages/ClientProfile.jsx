import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { User, Building2, Phone, Mail, MapPin, CreditCard, Users, Check, Shield } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ClientProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
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
    fetchProfile();
  }, [navigate]);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProfile(response.data);
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const client = profile?.client;
  const broker = profile?.broker;
  const subbroker = profile?.subbroker;

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
            {client?.verification_status === 'verified' && (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full font-medium flex items-center gap-1">
                <Check className="h-4 w-4" /> Verified
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading profile...</div>
          ) : !profile ? (
            <div className="text-center py-12">
              <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Profile not found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Personal Details */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <User className="h-5 w-5 text-teal-600" />
                    Personal Details
                  </h2>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center">
                      <span className="text-2xl font-bold text-teal-700">
                        {client?.name?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-800">{client?.name}</h3>
                      <p className="text-sm text-gray-500 font-mono">{client?.pan_number}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500 uppercase">Email</p>
                        <p className="font-medium">{client?.email || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500 uppercase">Mobile</p>
                        <p className="font-medium">{client?.mobile || '-'}</p>
                      </div>
                    </div>
                    {client?.occupation && (
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Occupation</p>
                          <p className="font-medium">{client.occupation}</p>
                        </div>
                      </div>
                    )}
                    {client?.date_of_birth && (
                      <div className="flex items-center gap-3">
                        <User className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Date of Birth</p>
                          <p className="font-medium">{client.date_of_birth}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Address */}
              {(client?.address_line1 || client?.city) && (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-teal-600" />
                      Address
                    </h2>
                  </div>
                  <div className="p-6">
                    <p className="text-gray-700">
                      {client.address_line1}
                      {client.address_line2 && <>, {client.address_line2}</>}
                    </p>
                    <p className="text-gray-700">
                      {client.city}{client.state && `, ${client.state}`} - {client.pincode}
                    </p>
                    <p className="text-gray-500">{client.country}</p>
                  </div>
                </div>
              )}

              {/* Bank Details */}
              {client?.bank_name && (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-teal-600" />
                      Bank Details
                    </h2>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Bank Name</p>
                      <p className="font-medium">{client.bank_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Account Number</p>
                      <p className="font-mono">
                        {'*'.repeat(Math.max(0, (client.account_number?.length || 0) - 4))}
                        {client.account_number?.slice(-4)}
                      </p>
                    </div>
                    {client.branch && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase">Branch</p>
                        <p className="font-medium">{client.branch}</p>
                      </div>
                    )}
                    {client.ifsc_code && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase">IFSC Code</p>
                        <p className="font-mono">{client.ifsc_code}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Nominee Details */}
              {client?.nominee_name && (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <Users className="h-5 w-5 text-teal-600" />
                      Nominee Details
                    </h2>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Nominee Name</p>
                      <p className="font-medium">{client.nominee_name}</p>
                    </div>
                    {client.nominee_relationship && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase">Relationship</p>
                        <p className="font-medium">{client.nominee_relationship}</p>
                      </div>
                    )}
                    {client.nominee_dob && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase">Date of Birth</p>
                        <p className="font-medium">{client.nominee_dob}</p>
                      </div>
                    )}
                    {client.nominee_pan && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase">PAN Number</p>
                        <p className="font-mono">{client.nominee_pan}</p>
                      </div>
                    )}
                    {client.nominee_address && (
                      <div className="md:col-span-2">
                        <p className="text-xs text-gray-500 uppercase">Address</p>
                        <p className="font-medium">{client.nominee_address}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* UCC Details */}
              {client?.ucc_code && (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <Shield className="h-5 w-5 text-teal-600" />
                      UCC Details
                    </h2>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase">UCC Code</p>
                      <p className="font-mono font-medium">{client.ucc_code}</p>
                    </div>
                    {client.demat_id && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase">Demat ID</p>
                        <p className="font-mono">{client.demat_id}</p>
                      </div>
                    )}
                    {client.dp_id && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase">DP ID</p>
                        <p className="font-mono">{client.dp_id}</p>
                      </div>
                    )}
                    {client.client_id && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase">Client ID</p>
                        <p className="font-mono">{client.client_id}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Broker & Sub-broker Details */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <Shield className="h-5 w-5 text-teal-600" />
                    Your Representatives
                  </h2>
                </div>
                <div className="p-6 space-y-6">
                  {/* Broker */}
                  <div className="flex items-start gap-4 p-4 bg-amber-50 rounded-lg">
                    <div className="w-12 h-12 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-6 w-6 text-amber-700" />
                    </div>
                    <div>
                      <p className="text-xs text-amber-600 uppercase font-medium">Your Broker</p>
                      <p className="text-lg font-semibold text-gray-800">{broker?.name}</p>
                      <div className="mt-2 space-y-1 text-sm text-gray-600">
                        {broker?.email && (
                          <p className="flex items-center gap-2">
                            <Mail className="h-4 w-4" /> {broker.email}
                          </p>
                        )}
                        {broker?.phone && (
                          <p className="flex items-center gap-2">
                            <Phone className="h-4 w-4" /> {broker.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sub-broker */}
                  {subbroker && (
                    <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg">
                      <div className="w-12 h-12 rounded-full bg-blue-200 flex items-center justify-center flex-shrink-0">
                        <Users className="h-6 w-6 text-blue-700" />
                      </div>
                      <div>
                        <p className="text-xs text-blue-600 uppercase font-medium">Your Sub-Broker</p>
                        <p className="text-lg font-semibold text-gray-800">{subbroker?.name}</p>
                        <div className="mt-2 space-y-1 text-sm text-gray-600">
                          {subbroker?.email && (
                            <p className="flex items-center gap-2">
                              <Mail className="h-4 w-4" /> {subbroker.email}
                            </p>
                          )}
                          {subbroker?.phone && (
                            <p className="flex items-center gap-2">
                              <Phone className="h-4 w-4" /> {subbroker.phone}
                            </p>
                          )}
                          {subbroker?.partner_details?.partner_code && (
                            <p className="text-xs text-gray-500 font-mono mt-1">
                              Code: {subbroker.partner_details.partner_code}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
