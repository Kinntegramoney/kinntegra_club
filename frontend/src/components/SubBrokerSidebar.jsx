import { useNavigate, useLocation } from "react-router-dom";
import { TrendingUp, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SubBrokerSidebar({ user }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
            <span className="text-white text-xl font-bold">K</span>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Kinntegraa</p>
            <p className="text-xs text-gray-500">{user?.name}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        <button
          onClick={() => navigate("/sub-broker/opportunities")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
            isActive("/sub-broker/opportunities")
              ? 'bg-amber-50 text-amber-700'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
          data-testid="nav-opportunities"
        >
          <TrendingUp className="h-5 w-5" />
          <span className="font-medium">Opportunities</span>
        </button>
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-200">
        <Button
          onClick={handleLogout}
          variant="ghost"
          className="w-full justify-start text-gray-700 hover:bg-gray-50"
          data-testid="logout-btn"
        >
          <LogOut className="h-5 w-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
}
