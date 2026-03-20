import {useState, useEffect, lazy, Suspense} from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { navLinks } from '../config/navigation';
import AdminLayout from '../components/layout/AdminLayout';
import { Link } from 'react-router-dom';
import MfaSetupModal from '../components/MfaSetupModal';
//import RedemptionWidget from '../components/RedemptionWidget';
const RedemptionWidget = lazy(() => import('../components/RedemptionWidget'));

import { ArrowRight } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const { features } = useApp();
  const [showMfaModal, setShowMfaModal] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('mfa_enabled') === 'false') {
      setShowMfaModal(true);
    }
  }, []);

  const activeNavCards = navLinks.filter(link => {
    if (link.path === '/') return false;
    const hasRole = link.requiredRoles.includes(user?.role);
    const hasAlliance = !link.requiresAlliance || user?.allianceId;
    const isFeatureEnabled = !link.featureKey || features[link.featureKey] !== false;

    return hasRole && hasAlliance && isFeatureEnabled;
  });

  return (
      <AdminLayout title="Command Dashboard">
        <div className="p-6 space-y-8 max-w-[1600px] mx-auto">

          {/* 1. DYNAMIC NAVIGATION GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {activeNavCards.map(link => {
              const Icon = link.icon;
              return (
                  <Link key={link.path} to={link.path} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl hover:border-blue-500 transition-all group relative overflow-hidden flex flex-col justify-center">
                    <Icon size={40} className="text-gray-700 group-hover:text-blue-500 mb-4 transition-colors" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">{link.name}</h3>
                    {link.description && (
                        <p className="text-[10px] text-gray-500 font-bold uppercase mt-1 leading-tight">{link.description}</p>
                    )}
                    <ArrowRight size={16} className="absolute right-4 bottom-4 text-gray-800 group-hover:text-blue-500 transition-colors" />
                  </Link>
              );
            })}
          </div>

          {/* 2. CONDITIONAL REDEMPTION WIDGET */}
          {features.GiftCodes &&
          <Suspense>
              <RedemptionWidget />
          </Suspense>
          }
        </div>

        {showMfaModal && <MfaSetupModal onClose={() => setShowMfaModal(false)} isForced={true} />}
      </AdminLayout>
  );
}