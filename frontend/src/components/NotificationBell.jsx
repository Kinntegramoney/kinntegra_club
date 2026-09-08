import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function NotificationBell({ user }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [displayCount, setDisplayCount] = useState(0); // Count shown on badge
  const [isOpen, setIsOpen] = useState(false);
  const [hasBeenViewed, setHasBeenViewed] = useState(false);
  const intervalRef = useRef(null);

  // Generate a signature for current notifications to detect changes
  const getNotificationSignature = (notifs) => {
    return notifs.map(n => `${n.id}:${n.count}`).sort().join('|');
  };

  // Check if notifications have changed since last view
  const checkForNewNotifications = useCallback((newNotifications, totalCount) => {
    // Get read notifications from localStorage
    const readNotifications = JSON.parse(localStorage.getItem('read_notifications') || '{}');
    
    // Calculate unread count (new items that haven't been read)
    let unreadTotal = 0;
    for (const notification of newNotifications) {
      const readCount = readNotifications[notification.id] || 0;
      // If current count is greater than read count, there are new items
      const newItems = Math.max(0, notification.count - readCount);
      unreadTotal += newItems;
    }
    
    // Always show the total pending count (not just new items)
    setDisplayCount(totalCount);
  }, []);

  // Handle when popover is opened - DON'T clear counts here, just mark as seen
  const handleOpenChange = (open) => {
    setIsOpen(open);
    // Don't clear displayCount when opening - count persists until notifications are actually handled
  };
  
  // Mark a specific notification as read/viewed
  const markNotificationAsRead = (notificationId) => {
    const readNotifications = JSON.parse(localStorage.getItem('read_notifications') || '{}');
    // Store the current count for this notification type
    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
      readNotifications[notificationId] = notification.count;
      localStorage.setItem('read_notifications', JSON.stringify(readNotifications));
      
      // Recalculate display count excluding read notifications
      const newDisplayCount = notifications.reduce((sum, n) => {
        const readCount = readNotifications[n.id] || 0;
        // Only count if current count is greater than what was read
        return sum + Math.max(0, n.count - readCount);
      }, 0);
      setDisplayCount(newDisplayCount);
    }
  };

  const fetchNotifications = useCallback(async () => {
    if (!user || user.role !== 'broker') return;
    
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      const newNotifications = [];
      let totalCount = 0;
      
      // Fetch pending approvals count
      const approvalsResponse = await axios.get(`${API}/approval-workflow/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => ({ data: {} }));
      
      const pendingClients = approvalsResponse.data?.pending_clients?.length || 0;
      const pendingReinvestments = approvalsResponse.data?.pending_reinvestments?.length || 0;
      const pendingTrades = approvalsResponse.data?.pending_trades?.length || 0;
      
      // Add reinvestment approvals
      if (pendingReinvestments > 0) {
        newNotifications.push({
          id: 'reinvestment',
          type: 'approval',
          title: 'Reinvestment Approvals',
          message: `${pendingReinvestments} pending reinvestment${pendingReinvestments > 1 ? 's' : ''}`,
          count: pendingReinvestments,
          link: '/broker/approvals?tab=reinvestment_bonds&highlight=true',
          color: 'blue'
        });
        totalCount += pendingReinvestments;
      }
      
      // Add client approvals
      if (pendingClients > 0) {
        newNotifications.push({
          id: 'clients',
          type: 'approval',
          title: 'Client Approvals',
          message: `${pendingClients} pending client creation${pendingClients > 1 ? 's' : ''}`,
          count: pendingClients,
          link: '/broker/approvals?tab=client_creation&highlight=true',
          color: 'amber'
        });
        totalCount += pendingClients;
      }
      
      // Add unit allotment approvals
      if (pendingTrades > 0) {
        newNotifications.push({
          id: 'trades',
          type: 'approval',
          title: 'Unit Allotments',
          message: `${pendingTrades} pending allotment${pendingTrades > 1 ? 's' : ''}`,
          count: pendingTrades,
          link: '/broker/approvals?tab=allotment_bonds&highlight=true',
          color: 'green'
        });
        totalCount += pendingTrades;
      }
      
      // Fetch open leads (Client Interest) count
      const leadsResponse = await axios.get(`${API}/leads?status=open`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => ({ data: [] }));
      
      const openLeads = Array.isArray(leadsResponse.data) ? leadsResponse.data.length : 0;
      
      if (openLeads > 0) {
        newNotifications.push({
          id: 'leads',
          type: 'lead',
          title: 'Client Interest',
          message: `${openLeads} open lead${openLeads > 1 ? 's' : ''}`,
          count: openLeads,
          link: '/broker/approvals?tab=interests&highlight=true',
          color: 'pink'
        });
        totalCount += openLeads;
      }
      
      // Fetch pending RE Brokers count
      const reBrokersResponse = await axios.get(`${API}/re-brokers?stage=applied`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => ({ data: [] }));
      
      const pendingREBrokers = Array.isArray(reBrokersResponse.data) ? reBrokersResponse.data.length : 0;
      
      if (pendingREBrokers > 0) {
        newNotifications.push({
          id: 're_brokers',
          type: 'approval',
          title: 'RE Broker Applications',
          message: `${pendingREBrokers} pending application${pendingREBrokers > 1 ? 's' : ''}`,
          count: pendingREBrokers,
          link: '/broker/approvals?tab=re_brokers&highlight=true',
          color: 'teal'
        });
        totalCount += pendingREBrokers;
      }
      
      // Fetch pending MFD/RIA count
      const mfdResponse = await axios.get(`${API}/sub-brokers/pending-approval`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => ({ data: [] }));
      
      const pendingMFD = Array.isArray(mfdResponse.data) ? mfdResponse.data.length : 0;
      
      if (pendingMFD > 0) {
        newNotifications.push({
          id: 'mfd_ria',
          type: 'approval',
          title: 'MFD/RIA Applications',
          message: `${pendingMFD} pending application${pendingMFD > 1 ? 's' : ''}`,
          count: pendingMFD,
          link: '/broker/approvals?tab=mfd_ria&highlight=true',
          color: 'purple'
        });
        totalCount += pendingMFD;
      }
      
      // Fetch pending KYC verifications count
      const kycResponse = await axios.get(`${API}/broker/pending-kyc-verifications`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => ({ data: [] }));
      
      const pendingKYC = Array.isArray(kycResponse.data) ? kycResponse.data.length : 0;
      
      if (pendingKYC > 0) {
        newNotifications.push({
          id: 'kyc_verification',
          type: 'approval',
          title: 'KYC Verifications',
          message: `${pendingKYC} pending verification${pendingKYC > 1 ? 's' : ''}`,
          count: pendingKYC,
          link: '/broker/approvals?tab=client_creation&highlight=true',
          color: 'cyan'
        });
        totalCount += pendingKYC;
      }
      
      // Fetch pending RE payments count
      const rePaymentsResponse = await axios.get(`${API}/real-estate/untagged-payments`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => ({ data: [] }));
      
      const pendingREPayments = Array.isArray(rePaymentsResponse.data) ? rePaymentsResponse.data.length : 0;
      
      if (pendingREPayments > 0) {
        newNotifications.push({
          id: 'payment_real_estate',
          type: 'approval',
          title: 'RE Payment Tagging',
          message: `${pendingREPayments} payment${pendingREPayments > 1 ? 's' : ''} need tagging`,
          count: pendingREPayments,
          link: '/broker/approvals?tab=payment_real_estate&highlight=true',
          color: 'orange'
        });
        totalCount += pendingREPayments;
      }
      
      // Note: MFD/RIA bulk verification is NOT included here as it's handled 
      // directly on the MFD/RIA Partners page, not through the approvals workflow
      
      // Fetch new CRM leads (from public signup, unassigned)
      const crmLeadsResponse = await axios.get(`${API}/crm/leads?stage=leads`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => ({ data: [] }));
      
      const newCrmLeads = Array.isArray(crmLeadsResponse.data) 
        ? crmLeadsResponse.data.filter(l => l.source === 'public_signup' && !l.advisor_id).length 
        : 0;
      
      if (newCrmLeads > 0) {
        newNotifications.push({
          id: 'crm_leads',
          type: 'crm_lead',
          title: 'New Registrations',
          message: `${newCrmLeads} new prospect${newCrmLeads > 1 ? 's' : ''} from signup`,
          count: newCrmLeads,
          link: '/broker/crm-leads?stage=leads&highlight=true',
          color: 'teal'
        });
        totalCount += newCrmLeads;
      }
      
      // Fetch email notifications (untaggable entries)
      const emailNotifResponse = await axios.get(`${API}/notifications/email-untaggable`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => ({ data: { count: 0 } }));
      
      const untaggableEmails = emailNotifResponse.data?.count || 0;
      
      if (untaggableEmails > 0) {
        newNotifications.push({
          id: 'email_untaggable',
          type: 'email',
          title: 'Email Entries Need Tagging',
          message: `${untaggableEmails} email${untaggableEmails > 1 ? 's' : ''} require manual client match`,
          count: untaggableEmails,
          link: '/broker/reinvestment?tab=email&highlight=true',
          color: 'red'
        });
        totalCount += untaggableEmails;
      }
      
      setNotifications(newNotifications);
      setUnreadCount(totalCount);
      checkForNewNotifications(newNotifications, totalCount);
      
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  }, [user, checkForNewNotifications]);

  useEffect(() => {
    // Initial fetch
    fetchNotifications();
    
    // Poll every 30 seconds
    intervalRef.current = setInterval(fetchNotifications, 30000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchNotifications]);

  const handleNotificationClick = (notification) => {
    // Mark this notification as read before navigating
    markNotificationAsRead(notification.id);
    setIsOpen(false);
    navigate(notification.link);
  };

  const getColorClasses = (color) => {
    const colors = {
      blue: 'bg-blue-100 text-blue-700',
      amber: 'bg-amber-100 text-amber-700',
      green: 'bg-green-100 text-green-700',
      purple: 'bg-purple-100 text-purple-700',
      red: 'bg-red-100 text-red-700',
      teal: 'bg-teal-100 text-teal-700',
      pink: 'bg-pink-100 text-pink-700',
      cyan: 'bg-cyan-100 text-cyan-700',
      orange: 'bg-orange-100 text-orange-700',
      indigo: 'bg-indigo-100 text-indigo-700',
    };
    return colors[color] || colors.blue;
  };

  if (!user || user.role !== 'broker') {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="relative p-2 hover:bg-gray-100 rounded-full"
          data-testid="notification-bell"
        >
          {displayCount > 0 ? (
            <BellRing className="h-5 w-5 text-amber-600 animate-pulse" />
          ) : (
            <Bell className="h-5 w-5 text-gray-600" />
          )}
          {displayCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
              {displayCount > 99 ? '99+' : displayCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-800">Notifications</h3>
          <p className="text-xs text-gray-500">
            {unreadCount > 0 ? `${unreadCount} pending items` : 'All caught up!'}
          </p>
        </div>
        
        <div className="p-4">
          {unreadCount === 0 ? (
            <div className="text-center text-gray-500 py-4">
              <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No pending items</p>
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-2xl font-bold text-amber-600">{unreadCount}</p>
              <p className="text-sm text-gray-600 mt-1">pending approval{unreadCount !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
        
        <div className="px-4 py-3 border-t bg-gray-50 text-center">
          <button 
            onClick={() => { setIsOpen(false); navigate('/broker/approvals'); }}
            className="text-sm text-amber-600 hover:text-amber-700 font-medium"
          >
            View All Approvals →
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
