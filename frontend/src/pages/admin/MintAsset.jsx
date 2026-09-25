import { useNavigate } from 'react-router-dom';
import MintAssetModal from '../../components/admin/MintAssetModal';

// Route wrapper around the shared mint dialog; closing it returns to the ledger.
export default function MintAsset() {
  const navigate = useNavigate();
  return <MintAssetModal onClose={() => navigate('/admin/assets')} />;
}
