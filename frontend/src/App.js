import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "@/pages/Login";
import BrokerDashboard from "@/pages/BrokerDashboard";
import SubBrokerDashboard from "@/pages/SubBrokerDashboard";
import Partners from "@/pages/Partners";
import CreateBond from "@/pages/CreateBond";
import BondDetails from "@/pages/BondDetails";
import { Toaster } from "@/components/ui/sonner";

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const user = localStorage.getItem("user");
  const token = localStorage.getItem("token");
  
  if (!user || !token) {
    return <Navigate to="/login" replace />;
  }
  
  const parsedUser = JSON.parse(user);
  if (allowedRoles && !allowedRoles.includes(parsedUser.role)) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
          
          {/* Broker Routes */}
          <Route 
            path="/broker/dashboard" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <BrokerDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/partners" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <Partners />
              </ProtectedRoute>
            } 
          />
          
          {/* Sub-Broker Routes */}
          <Route 
            path="/sub-broker/dashboard" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <SubBrokerDashboard />
              </ProtectedRoute>
            } 
          />
          
          {/* Shared Routes */}
          <Route 
            path="/bonds/create" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <CreateBond />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/bonds/:id" 
            element={
              <ProtectedRoute allowedRoles={["broker", "sub_broker"]}>
                <BondDetails />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </div>
  );
}

export default App;