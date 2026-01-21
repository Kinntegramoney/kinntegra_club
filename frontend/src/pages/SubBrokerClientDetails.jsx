import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  ArrowLeft, RefreshCw, User, MapPin, Building2, Phone, Mail,
  CreditCard, UserCheck, Calendar, Edit2, Save, X, Clock, CheckCircle, XCircle
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SubBrokerClientDetails() {
  const navigate = useNavigate();
  const { clientId } = useParams();
  const [user, setUser] = useState(null);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedClient, setEditedClient] = useState({});

  useEffect(() => {
    document.title = "Kinntegraa | Client Details";
  }, []);

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
    fetchClientDetails();
  }, [navigate, clientId]);

  const fetchClientDetails = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/sub-broker/clients/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClient(response.data);
      setEditedClient(response.data);
    } catch (error) {
      console.error("Error fetching client:", error);
      toast.error("Failed to load client details");
      navigate("/sub-broker/clients");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setEditedClient(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/sub-broker/clients/${clientId}`, editedClient, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClient(editedClient);
      setEditing(false);
      toast.success("Client details updated successfully");
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error(error.response?.data?.detail || "Failed to update client");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedClient(client);
    setEditing(false);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending_approval':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
            <Clock className="h-4 w-4" />
            Pending Approval
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            <CheckCircle className="h-4 w-4" />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
            <XCircle className="h-4 w-4" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
            {status || 'Active'}
          </span>
        );
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "MMM dd, yyyy");
    } catch {
      return dateStr;
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex" data-testid="client-details-page">
      <SubBrokerSidebar user={user} />

      <div className="flex-1 md:ml-64">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/sub-broker/clients")}
                data-testid="back-btn"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-800" data-testid="page-title">
                  Client Details
                </h1>
                {client && (
                  <p className="text-sm text-gray-500 mt-1">{client.name}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!editing ? (
                <>
                  <Button
                    variant="outline"
                    onClick={fetchClientDetails}
                    data-testid="refresh-btn"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => setEditing(true)}
                    className="bg-amber-600 hover:bg-amber-700"
                    data-testid="edit-btn"
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    data-testid="cancel-btn"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="save-btn"
                  >
                    {saving ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : client ? (
            <div className="space-y-6">
              {/* Status Banner */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-xl">
                    {client.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'CL'}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">{client.name}</h2>
                    <p className="text-sm text-gray-500">PAN: {client.pan_number || client.pan || '-'}</p>
                  </div>
                </div>
                {getStatusBadge(client.approval_status)}
              </div>

              {/* Personal Details */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                  <User className="h-5 w-5 text-amber-600" />
                  <h3 className="font-semibold text-gray-800">Personal Details</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Full Name</Label>
                    {editing ? (
                      <Input
                        value={editedClient.name || ''}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.name || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">PAN Number</Label>
                    <p className="font-mono font-medium text-gray-800 mt-1">{client.pan_number || client.pan || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Date of Birth</Label>
                    {editing ? (
                      <Input
                        type="date"
                        value={editedClient.date_of_birth?.split('T')[0] || ''}
                        onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{formatDate(client.date_of_birth)}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Father/Husband Name</Label>
                    {editing ? (
                      <Input
                        value={editedClient.father_husband_name || ''}
                        onChange={(e) => handleInputChange('father_husband_name', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.father_husband_name || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Email</Label>
                    {editing ? (
                      <Input
                        type="email"
                        value={editedClient.email || ''}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.email || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Mobile</Label>
                    {editing ? (
                      <Input
                        value={editedClient.mobile || ''}
                        onChange={(e) => handleInputChange('mobile', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.mobile || client.phone || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Occupation</Label>
                    {editing ? (
                      <Input
                        value={editedClient.occupation || ''}
                        onChange={(e) => handleInputChange('occupation', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.occupation || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Demat Account No.</Label>
                    {editing ? (
                      <Input
                        value={editedClient.demat_account_no || ''}
                        onChange={(e) => handleInputChange('demat_account_no', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-mono font-medium text-gray-800 mt-1">{client.demat_account_no || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Passport Type</Label>
                    <p className="font-medium text-gray-800 mt-1 capitalize">{client.passport_type || 'Indian'}</p>
                  </div>
                </div>
              </div>

              {/* Address Details */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                  <MapPin className="h-5 w-5 text-amber-600" />
                  <h3 className="font-semibold text-gray-800">Address Details</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Address Line 1</Label>
                    {editing ? (
                      <Input
                        value={editedClient.address_line1 || ''}
                        onChange={(e) => handleInputChange('address_line1', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.address_line1 || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Address Line 2</Label>
                    {editing ? (
                      <Input
                        value={editedClient.address_line2 || ''}
                        onChange={(e) => handleInputChange('address_line2', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.address_line2 || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">City</Label>
                    {editing ? (
                      <Input
                        value={editedClient.city || ''}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.city || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">State</Label>
                    {editing ? (
                      <Input
                        value={editedClient.state || ''}
                        onChange={(e) => handleInputChange('state', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.state || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Pincode</Label>
                    {editing ? (
                      <Input
                        value={editedClient.pincode || ''}
                        onChange={(e) => handleInputChange('pincode', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-mono font-medium text-gray-800 mt-1">{client.pincode || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Country</Label>
                    {editing ? (
                      <Input
                        value={editedClient.country || ''}
                        onChange={(e) => handleInputChange('country', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.country || 'India'}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                  <Building2 className="h-5 w-5 text-amber-600" />
                  <h3 className="font-semibold text-gray-800">Bank Details</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Bank Name</Label>
                    {editing ? (
                      <Input
                        value={editedClient.bank_name || ''}
                        onChange={(e) => handleInputChange('bank_name', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.bank_name || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Account Number</Label>
                    {editing ? (
                      <Input
                        value={editedClient.account_number || ''}
                        onChange={(e) => handleInputChange('account_number', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-mono font-medium text-gray-800 mt-1">{client.account_number || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Branch</Label>
                    {editing ? (
                      <Input
                        value={editedClient.branch || ''}
                        onChange={(e) => handleInputChange('branch', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.branch || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">IFSC Code</Label>
                    {editing ? (
                      <Input
                        value={editedClient.ifsc_code || ''}
                        onChange={(e) => handleInputChange('ifsc_code', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-mono font-medium text-gray-800 mt-1">{client.ifsc_code || '-'}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Nominee Details */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                  <UserCheck className="h-5 w-5 text-amber-600" />
                  <h3 className="font-semibold text-gray-800">Nominee Details</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Nominee Name</Label>
                    {editing ? (
                      <Input
                        value={editedClient.nominee_name || ''}
                        onChange={(e) => handleInputChange('nominee_name', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.nominee_name || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Relationship</Label>
                    {editing ? (
                      <Input
                        value={editedClient.nominee_relationship || ''}
                        onChange={(e) => handleInputChange('nominee_relationship', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.nominee_relationship || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Nominee DOB</Label>
                    {editing ? (
                      <Input
                        type="date"
                        value={editedClient.nominee_dob?.split('T')[0] || ''}
                        onChange={(e) => handleInputChange('nominee_dob', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{formatDate(client.nominee_dob)}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Nominee Mobile</Label>
                    {editing ? (
                      <Input
                        value={editedClient.nominee_mobile || ''}
                        onChange={(e) => handleInputChange('nominee_mobile', e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <p className="font-medium text-gray-800 mt-1">{client.nominee_mobile || '-'}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="bg-gray-100 rounded-xl p-4 text-sm text-gray-500">
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <span>Created: {formatDate(client.created_at)}</span>
                  {client.updated_at && <span>Updated: {formatDate(client.updated_at)}</span>}
                  {client.linked_subbroker_id && <span>Sub-broker Linked</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">Client not found</p>
              <Button className="mt-4" onClick={() => navigate("/sub-broker/clients")}>
                Back to Clients
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
