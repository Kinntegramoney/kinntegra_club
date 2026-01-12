import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import CreateBond from "@/pages/CreateBond";
import BondDetails from "@/pages/BondDetails";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bonds/create" element={<CreateBond />} />
          <Route path="/bonds/:id" element={<BondDetails />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </div>
  );
}

export default App;