import { useState, useEffect } from 'react';
import { assetApi } from '../services/api';

/**
 * Loads one asset with its transfer history. The asset endpoint returns the
 * asset together with its transfer requests, so a single call covers both.
 * `asset` is null when the asset does not exist (or is not visible to the
 * caller); any other failure is reported through `error`.
 */
export default function useAssetDetail(id) {
  const [state, setState] = useState({ id: null, asset: null, error: null });

  useEffect(() => {
    let cancelled = false;
    assetApi
      .getById(id)
      .then((asset) => {
        if (!cancelled) setState({ id, asset, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to fetch asset detail', err);
        const missing = err?.response?.status === 404 || err?.response?.status === 403;
        setState({ id, asset: null, error: missing ? null : err.uiMessage || 'The asset could not be loaded.' });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return {
    asset: state.asset,
    history: state.asset?.transferRequests || [],
    error: state.error,
    // Still loading until a result has arrived for the current id.
    loading: state.id !== id,
  };
}
