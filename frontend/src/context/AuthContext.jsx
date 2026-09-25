/**
 * AuthContext — BELTAL / TrustChain sovereign identity layer
 *
 * SIWE flow (connectWallet):
 *  1. eth_requestAccounts   — get user's active wallet address
 *  2. POST /auth/nonce      — receive cryptographic challenge message
 *  3. personal_sign         — officer signs nonce with private key
 *  4. POST /auth/verify     — backend verifies ECDSA, issues JWT
 *
 * Session management:
 *  - JWT persisted in localStorage under key "token"
 *  - Decoded payload re-hydrates user state on every app load
 *  - window.ethereum 'accountsChanged' → auto-logout on wallet switch
 *  - 'beltal:session-expired' (fired by api.js on 401) → auto-logout
 *
 * Connect steps (connectStep state):
 *  'idle' | 'connecting' | 'signing' | 'verifying' | 'done' | 'error'
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { authApi } from '../services/api';

/* ── JWT decode (no dependency) ───────────────────────────────
   Extracts payload from a JWT without verifying the signature.
   Signature verification happens on the backend; this is only
   used to restore user state from the persisted token. */
function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/* ── Shorten wallet address for display ────────────────────── */
export function shortenAddress(address) {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/* ── Portal (landing route) for each backend role ──────────── */
const ROLE_HOME = {
  ADMIN: '/admin/dashboard',
  MANAGER: '/manager/dashboard',
  AUDITOR: '/auditor/dashboard',
  USER: '/user/dashboard',
};

export function roleHomePath(role) {
  return ROLE_HOME[role?.toUpperCase()] ?? null;
}

/* ── Build user object from JWT payload / login response ───────
   Same field names in both. An unregistered wallet's limited
   session has no role (null) — never a default one. */
function userFromPayload(payload) {
  if (!payload) return null;
  return {
    // `sub` is the User id for registered sessions; limited sessions have none
    id: payload.id ?? (payload.isRegistered ? payload.sub : null),
    walletAddress: payload.walletAddress ?? payload.sub,
    role: payload.role?.toUpperCase() ?? null,
    clearanceLevel: payload.clearanceLevel ?? null,
    sbu: payload.sbu ?? null,
    isRegistered: payload.isRegistered ?? false,
    // `name` and `displayName` both exposed: layout components read either
    name: payload.displayName ?? null,
    displayName: payload.displayName ?? null,
    did: payload.did ?? null,
  };
}

/* ── Context ────────────────────────────────────────────────── */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  /* ── State ── */
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('token');
    if (!stored) return null;
    const payload = decodeJwtPayload(stored);
    // Check expiry
    if (payload?.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('token');
      return null;
    }
    return userFromPayload(payload);
  });

  const [connectStep, setConnectStep] = useState('idle');
  // 'idle' | 'connecting' | 'signing' | 'verifying' | 'done' | 'error'
  const [connectError, setConnectError] = useState(null);

  /* Guard against stale closures in event listeners */
  const logoutRef = useRef(null);

  /* ── logout ─────────────────────────────────────────────── */
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setConnectStep('idle');
    setConnectError(null);
    // Navigate to home — handled by callers (SiteHeader / ProtectedRoute)
    // We dispatch an event so any listener (e.g. SiteHeader) can redirect.
    window.dispatchEvent(new CustomEvent('beltal:logout'));
  }, []);

  // Keep the ref fresh so event listeners always call the latest logout
  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  /* ── Listen for 401 session-expired from api.js ─────────── */
  useEffect(() => {
    const handler = () => logoutRef.current?.();
    window.addEventListener('beltal:session-expired', handler);
    return () => window.removeEventListener('beltal:session-expired', handler);
  }, []);

  /* ── Listen for MetaMask account changes ────────────────── */
  useEffect(() => {
    if (!window.ethereum) return;
    const handler = (accounts) => {
      // accounts is [] when the user disconnects, or a different address
      // In both cases we must invalidate the current session
      if (accounts.length === 0 || (user?.walletAddress && accounts[0]?.toLowerCase() !== user.walletAddress.toLowerCase())) {
        logoutRef.current?.();
      }
    };
    window.ethereum.on('accountsChanged', handler);
    return () => window.ethereum.removeListener?.('accountsChanged', handler);
  }, [user?.walletAddress]);

  /* ── Persist a session (login, or registration approval) ─── */
  const applySession = useCallback((jwt, userData) => {
    localStorage.setItem('token', jwt);
    setToken(jwt);
    setUser(userFromPayload(userData));
  }, []);

  /* ── connectWallet — 4-step SIWE ────────────────────────── */
  const connectWallet = useCallback(async () => {
    setConnectError(null);

    /* ── Guard: MetaMask / web3 provider required ── */
    if (!window.ethereum) {
      setConnectError('MetaMask or a compatible Web3 wallet is not installed.');
      setConnectStep('error');
      return;
    }

    try {
      /* Step 1 — Connect: request wallet accounts */
      setConnectStep('connecting');
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });
      const walletAddress = accounts[0];
      if (!walletAddress) throw new Error('No account returned from wallet.');

      /* Step 2 — Nonce: fetch cryptographic challenge from backend */
      // (connectStep stays 'connecting' during nonce fetch — it's fast)
      const { message } = await authApi.getNonce(walletAddress);

      /* Step 3 — Sign: officer signs the nonce message */
      setConnectStep('signing');
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, walletAddress],
      });

      /* Step 4 — Verify: backend verifies ECDSA and issues JWT */
      setConnectStep('verifying');
      const { token: jwt, user: userData } = await authApi.verify(walletAddress, signature);

      applySession(jwt, { ...userData, walletAddress: userData.walletAddress ?? walletAddress });
      setConnectStep('done');
    } catch (err) {
      // User rejected signature (code 4001) — friendly message
      if (err?.code === 4001) {
        setConnectError('Signature request was rejected. Authentication cancelled.');
      } else {
        setConnectError(
          err?.uiMessage || err?.message || 'Authentication failed. Please try again.'
        );
      }
      setConnectStep('error');
    }
  }, [applySession]);

  /* ── Reset connect state (so modal can be re-opened cleanly) */
  const resetConnect = useCallback(() => {
    setConnectStep('idle');
    setConnectError(null);
  }, []);

  /* ── Context value ──────────────────────────────────────── */
  return (
    <AuthContext.Provider
      value={{
        /* Auth state */
        token,
        user,
        isAuthenticated: !!token && !!user,

        /* SIWE connect flow */
        connectWallet,
        connectStep,
        connectError,
        resetConnect,

        /* Session management */
        applySession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);