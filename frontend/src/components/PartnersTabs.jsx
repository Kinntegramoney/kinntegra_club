import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Shared tab switcher shown at the top of both Partners sub-pages.
 * `activeTab` is either "mfd-ria" or "real-estate".
 * Count badges match the Private Investors tab style.
 */
export default function PartnersTabs({ activeTab }) {
  const navigate = useNavigate();
  const [mfdRiaCount, setMfdRiaCount] = useState(0);
  const [realEstateCount, setRealEstateCount] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      axios.get(`${API}/partners`, { headers }).catch(() => ({ data: [] })),
      axios.get(`${API}/re-brokers`, { headers }).catch(() => ({ data: [] })),
    ]).then(([p, r]) => {
      setMfdRiaCount(Array.isArray(p.data) ? p.data.length : 0);
      setRealEstateCount(Array.isArray(r.data) ? r.data.length : 0);
    });
  }, []);

  const tabs = [
    {
      id: "mfd-ria",
      label: "MFD/RIA Partners",
      count: mfdRiaCount,
      path: "/broker/admin/sub-brokers",
    },
    {
      id: "real-estate",
      label: "Real Estate Partners",
      count: realEstateCount,
      path: "/broker/admin/re-brokers",
    },
  ];

  return (
    <div className="bg-white border-b border-gray-200 px-8">
      <div className="flex gap-1" role="tablist" aria-label="Partners type">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              onClick={() => navigate(tab.path)}
              data-testid={`partners-tab-${tab.id}`}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                active
                  ? "border-etihad-gold-600 text-etihad-gold-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
              <span
                className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  active
                    ? "bg-etihad-gold-100 text-etihad-gold-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
