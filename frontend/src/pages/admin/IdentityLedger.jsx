import { useState } from 'react';
import IdentityTable from '../../components/admin/IdentityTable';
import CreateIdentityModal from '../../components/admin/CreateIdentityModal';

export default function IdentityLedger() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleIdentityCreated = () => {
    setIsModalOpen(false);
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-full p-6 sm:p-8 space-y-6 bg-slate-100/60">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-px w-12 bg-gradient-to-r from-[#D4AF37]/60 to-transparent" />
            <span className="text-[10px] font-black tracking-[0.22em] text-[#B8962E] uppercase">
              RESTRICTED — ADMIN CLEARANCE
            </span>
          </div>
          <h1 className="text-2xl font-black text-[#0A1F3D] tracking-wide">Identity Ledger</h1>
          <p className="text-sm text-slate-600 mt-1">Manage sovereign identities and clearance levels</p>
        </div>
      </div>

      {/* Table Section */}
      <IdentityTable
        key={refreshKey}
        onRegisterClick={() => setIsModalOpen(true)}
      />

      {/* Modal */}
      {isModalOpen && (
        <CreateIdentityModal
          onClose={() => setIsModalOpen(false)}
          onSuccess={handleIdentityCreated}
        />
      )}
    </div>
  );
}