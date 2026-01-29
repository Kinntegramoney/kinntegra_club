import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Notification sound (using Web Audio API for reliability)
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = "sine";
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (e) {
    console.log("Could not play notification sound:", e);
  }
};

export default function NotificationBell({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [lastCounts, setLastCounts] = useState({ approvals: 0, leads: 0 });
  const intervalRef = useRef(null);
  const isFirstLoad = useRef(true);

  const fetchNotifications = useCallback(async () => {
    if (!user || user.role !== 'broker') return;
    
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      // Fetch pending approvals count
      const approvalsResponse = await axios.get(`${API}/approval-workflow/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => ({ data: {} }));
      
      const pendingClients = approvalsResponse.data?.pending_clients?.length || 0;
      const pendingReinvestments = approvalsResponse.data?.pending_reinvestments?.length || 0;
      const pendingTrades = approvalsResponse.data?.pending_trades?.length || 0;
      const totalApprovals = pendingClients + pendingReinvestments + pendingTrades;
      
      // Fetch open leads count
      const leadsResponse = await axios.get(`${API}/leads?status=open`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => ({ data: [] }));
      
      const openLeads = Array.isArray(leadsResponse.data) ? leadsResponse.data.length : 0;
      
      // Build notifications list
      const newNotifications = [];
      
      if (pendingReinvestments > 0) {
        newNotifications.push({
          id: 'reinvestment',
          type: 'approval',
          title: 'Reinvestment Approvals',
          message: `${pendingReinvestments} pending reinvestment${pendingReinvestments > 1 ? 's' : ''}`,
          count: pendingReinvestments,
          link: '/broker/approvals',
          color: 'blue'
        });
      }
      
      if (pendingClients > 0) {
        newNotifications.push({
          id: 'clients',
          type: 'approval',
          title: 'Client Approvals',
          message: `${pendingClients} pending client creation${pendingClients > 1 ? 's' : ''}`,
          count: pendingClients,
          link: '/broker/approvals',
          color: 'amber'
        });
      }
      
      if (pendingTrades > 0) {
        newNotifications.push({
          id: 'trades',
          type: 'approval',
          title: 'Unit Allotments',
          message: `${pendingTrades} pending allotment${pendingTrades > 1 ? 's' : ''}`,
          count: pendingTrades,
          link: '/broker/approvals',
          color: 'green'
        });
      }
      
      if (openLeads > 0) {
        newNotifications.push({
          id: 'leads',
          type: 'lead',
          title: 'Client Interest',
          message: `${openLeads} open lead${openLeads > 1 ? 's' : ''}`,
          count: openLeads,
          link: '/broker/leads',
          color: 'purple'
        });
      }
      
      setNotifications(newNotifications);
      setUnreadCount(totalApprovals + openLeads);
      
      // Play sound if there are new notifications (not on first load)
      if (!isFirstLoad.current) {
        const newApprovals = totalApprovals > lastCounts.approvals;
        const newLeads = openLeads > lastCounts.leads;
        
        if (newApprovals || newLeads) {
          playNotificationSound();
        }
      }
      
      isFirstLoad.current = false;
      setLastCounts({ approvals: totalApprovals, leads: openLeads });
      
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  }, [user, lastCounts]);

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

  const getColorClasses = (color) => {
    const colors = {
      blue: 'bg-blue-100 text-blue-700',
      amber: 'bg-amber-100 text-amber-700',
      green: 'bg-green-100 text-green-700',
      purple: 'bg-purple-100 text-purple-700',
    };
    return colors[color] || colors.blue;
  };

  if (!user || user.role !== 'broker') {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="relative p-2 hover:bg-gray-100 rounded-full"
          data-testid="notification-bell"
        >
          {unreadCount > 0 ? (
            <BellRing className="h-5 w-5 text-amber-600 animate-pulse" />
          ) : (
            <Bell className="h-5 w-5 text-gray-600" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-800">Notifications</h3>
          <p className="text-xs text-gray-500">
            {unreadCount > 0 ? `${unreadCount} pending items` : 'All caught up!'}
          </p>
        </div>
        
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map(notification => (
                <a
                  key={notification.id}
                  href={notification.link}
                  className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{notification.title}</p>
                      <p className="text-xs text-gray-500">{notification.message}</p>
                    </div>
                    <Badge className={getColorClasses(notification.color)}>
                      {notification.count}
                    </Badge>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
        
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-t bg-gray-50">
            <a 
              href="/broker/approvals" 
              className="text-sm text-amber-600 hover:text-amber-700 font-medium"
              onClick={() => setIsOpen(false)}
            >
              View All Approvals →
            </a>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
