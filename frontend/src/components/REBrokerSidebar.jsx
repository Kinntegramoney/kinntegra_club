import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  Building2, Wallet, CheckSquare, Users, 
  UserCheck, Upload, LogOut, Menu, X, ChevronLeft, ChevronRight, 
  Bell, CreditCard, LayoutDashboard
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function REBrokerSidebar({ user, brokerProfile }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  // Load collapsed state from localStorage
  useEffect(() => {
    const savedCollapsed = localStorage.getItem("reBrokerSidebarCollapsed");
    if (savedCollapsed !== null) {
      setCollapsed(JSON.parse(savedCollapsed));
    }
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapsed = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem("reBrokerSidebarCollapsed", JSON.stringify(newCollapsed));
  };

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "?");

  // Menu items for RE Broker Admin Module
  const menuItems = [
    { path: "/re-broker/dashboard", label: "Analytics", icon: LayoutDashboard },
    { path: "/re-broker/opportunities", label: "Opportunities", icon: Building2 },
    { path: "/re-broker/holdings", label: "Holdings", icon: Wallet },
    { path: "/re-broker/approvals", label: "Approve", icon: CheckSquare },
    { path: "/re-broker/agents", label: "Agents", icon: Users },
    { path: "/re-broker/private-investors", label: "Private Investors", icon: UserCheck },
    { path: "/re-broker/subscription", label: "Subscription", icon: CreditCard },
    { path: "/re-broker/upload", label: "Upload", icon: Upload },
  ];

  const SidebarContent = ({ isCollapsed = false }) => (
    <>
      {/* Logo/Brand */}
      <div className={`p-4 border-b border-gray-200 ${isCollapsed ? 'px-2' : ''}`}>
        <div className="flex items-center justify-between">
          <button 
            onClick={() => navigate('/re-broker/opportunities')}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
            title="Go to Opportunities"
          >
            <div className="w-10 h-10 overflow-hidden flex-shrink-0">
              <img 
                src="/logo.svg" 
                alt="Kinntegraa" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.target.parentElement.innerHTML = '<span class="text-white text-xl font-bold flex items-center justify-center w-full h-full bg-gradient-to-br from-orange-500 to-etihad-gold-600 rounded-full">K</span>';
                }}
              />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">Kinntegraa RE</p>
                <p className="text-xs text-gray-500 truncate">{user?.name}</p>
              </div>
            )}
          </button>
          {/* Notification Bell - only show when expanded */}
          {!isCollapsed && (
            <button 
              onClick={() => navigate('/re-broker/approvals?tab=private-investors')}
              className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <Bell className="h-5 w-5" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {notificationCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 p-2 space-y-1 overflow-y-auto ${isCollapsed ? 'px-1' : 'px-3'}`}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                active
                  ? 'bg-etihad-gold-50 text-etihad-gold-700'
                  : 'text-gray-700 hover:bg-gray-50'
              } ${isCollapsed ? 'justify-center px-2' : ''}`}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className={`h-5 w-5 flex-shrink-0 ${active ? 'text-etihad-gold-600' : ''}`} />
              {!isCollapsed && <span className="font-medium text-sm">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Logout Button */}
      <div className={`p-3 border-t border-gray-200 ${isCollapsed ? 'px-1' : ''}`}>
        <Button
          onClick={handleLogout}
          variant="ghost"
          className={`w-full text-gray-600 hover:text-red-600 hover:bg-red-50 ${isCollapsed ? 'justify-center px-2' : 'justify-start'}`}
          data-testid="logout-btn"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!isCollapsed && <span className="ml-3">Logout</span>}
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 p-2 bg-white rounded-lg shadow-md border border-gray-200"
        data-testid="mobile-menu-btn"
      >
        <Menu className="h-5 w-5 text-gray-700" />
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div className={`md:hidden fixed inset-y-0 left-0 w-64 bg-white z-50 transform transition-transform duration-300 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1 text-gray-500 hover:text-gray-700"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-col h-full">
          <SidebarContent isCollapsed={false} />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex bg-white border-r border-gray-200 flex-col h-screen sticky top-0 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-56'
      }`}>
        <SidebarContent isCollapsed={collapsed} />
        
        {/* Collapse Toggle Button */}
        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors z-10"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-gray-500" />
          )}
        </button>
      </aside>
    </>
  );
}
