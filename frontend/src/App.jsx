import { lazy, Suspense, useEffect, useRef } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/ui/Toast";
import { TransactionProvider } from "./context/TransactionContext";
import ProtectedRoute from "./components/ProtectedRoute";
import BaseLayout from "./components/layout/BaseLayout";
import LandingPage from "./pages/LandingPage";
const ContactPage = lazy(() => import("./pages/ContactPage"));
const ApiDocsPage = lazy(() => import("./pages/ApiDocsPage"));
const UIKitPage = lazy(() => import("./pages/UIKitPage"));
const DashboardRedirect = lazy(() => import("./pages/DashboardRedirect"));
// Shared across every role (issues #66/#68) — routed once at /assets/:id.
const AssetDetail = lazy(() => import("./pages/AssetDetail"));
const RegistrationPage = lazy(() => import("./pages/RegistrationPage"));

// Admin Pages
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const IdentityLedger = lazy(() => import("./pages/admin/IdentityLedger"));
const RoleAssignment = lazy(() => import("./pages/admin/RoleAssignment"));
const MintAsset = lazy(() => import("./pages/admin/MintAsset"));
const AssetList = lazy(() => import("./pages/admin/AssetList"));
const TransferApprovals = lazy(() => import("./pages/admin/TransferApprovals"));
const PendingRegistrations = lazy(() => import("./pages/admin/PendingRegistrations"));
const QuarantineStation = lazy(() => import("./pages/admin/QuarantineStation"));
const ZoneManager = lazy(() => import("./pages/admin/ZoneManager"));
const RecoveryCenter = lazy(() => import("./pages/admin/RecoveryCenter"));

// Manager Pages
const ManagerDashboard = lazy(() => import("./pages/manager/ManagerDashboard"));
const TeamMembers = lazy(() => import("./pages/manager/TeamMembers"));
const TeamAssets = lazy(() => import("./pages/manager/TeamAssets"));
const InitiateTransfer = lazy(() => import("./pages/manager/InitiateTransfer"));
const BadgeTapSimulator = lazy(() => import("./pages/pacs/BadgeTapSimulator"));
const AccessPasses = lazy(() => import("./pages/manager/AccessPasses"));

// Auditor Pages
const AuditorDashboard = lazy(() => import("./pages/auditor/AuditorDashboard"));
const AuditTrailExplorer = lazy(() => import("./pages/auditor/AuditTrailExplorer"));
const VerificationTool = lazy(() => import("./pages/auditor/VerificationTool"));

// User Pages
const UserDashboard = lazy(() => import("./pages/user/UserDashboard"));
const MyAssets = lazy(() => import("./pages/user/MyAssets"));
const RequestTransferForm = lazy(() => import("./pages/user/RequestTransferForm"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
import ErrorBoundary from "./components/ErrorBoundary";

/**
 * Completes the SPA transition when a nav link lands on "/" carrying a
 * section hash (e.g. clicked from /contact, or a direct "/#features" deep
 * link) — never a full page reload. The target section doesn't exist in
 * the DOM the instant the route changes (LandingPage still has to render),
 * so this polls for it across a bounded number of frames instead of
 * guessing a fixed delay.
 */
function ScrollToHashSection() {
  const location = useLocation();
  const rafRef = useRef(null);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!location.hash) return;

    const id = location.hash.slice(1);
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // ~1s at 60fps — generous for a route+render cycle

    const tryScroll = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
      attempts += 1;
      if (attempts < MAX_ATTEMPTS) {
        rafRef.current = requestAnimationFrame(tryScroll);
      }
    };
    rafRef.current = requestAnimationFrame(tryScroll);

    return () => cancelAnimationFrame(rafRef.current);
  }, [location.pathname, location.hash]);

  return null;
}

function RouteLoader() {
  return <div className="app-route-loader" role="status" aria-live="polite"><div className="app-route-loader__mark" /><p>Preparing secure workspace…</p></div>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <TransactionProvider>
            <ScrollToHashSection />
            <Suspense fallback={<RouteLoader />}>
            <Routes>
                {/* ── Public Routes ── */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LandingPage autoOpenLogin />} />
                <Route path="/contact" element={<ContactPage />} />
                {/* Public integration reference — deliberately reachable
                    without a wallet, so a BEL integrator can evaluate the API
                    before anyone provisions them an identity. */}
                <Route path="/docs" element={<ApiDocsPage />} />
                {/* Limited (unregistered) session only — the page redirects everyone else */}
                <Route path="/register" element={<RegistrationPage />} />

                {/* ── Protected Area wrapped in BaseLayout ── */}
                <Route element={<ProtectedRoute allowedRoles={["ADMIN", "MANAGER", "AUDITOR", "USER"]} />}>
                  <Route element={<BaseLayout />}>

                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/settings" element={<SettingsPage />} />

                    {/* Shared asset detail — any authenticated role. The API
                        scopes what each caller may read, so the route does not
                        need to. /user/assets/:id is kept as an alias for links
                        already in the wild. */}
                    <Route path="/assets/:id" element={<AssetDetail />} />
                    <Route path="/user/assets/:id" element={<AssetDetail />} />

                    {/* UI Kit — any authenticated role */}
                    <Route path="/ui-kit" element={<UIKitPage />} />

                    {/* Admin-only */}
                    <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
                      <Route path="/admin" element={<AdminDashboard />} />
                      <Route path="/admin/dashboard" element={<AdminDashboard />} />
                      <Route path="/admin/identities" element={<IdentityLedger />} />
                      <Route path="/admin/registrations" element={<PendingRegistrations />} />
                      <Route path="/admin/users" element={<AdminDashboard />} />
                      <Route path="/admin/roles" element={<RoleAssignment />} />
                      <Route path="/admin/mint-asset" element={<MintAsset />} />
                      <Route path="/admin/assets" element={<AssetList />} />
                      <Route path="/admin/transfers" element={<TransferApprovals />} />
                      <Route path="/admin/quarantine" element={<QuarantineStation />} />
                      <Route path="/admin/zones" element={<ZoneManager />} />
                      <Route path="/admin/recovery" element={<RecoveryCenter />} />
                    </Route>

                    {/* Manager / Admin */}
                    <Route element={<ProtectedRoute allowedRoles={["ADMIN", "MANAGER"]} />}>
                      <Route path="/manager/dashboard" element={<ManagerDashboard />} />
                      <Route path="/team" element={<TeamMembers />} />
                      <Route path="/team-assets" element={<TeamAssets />} />
                      <Route path="/transfer/initiate" element={<InitiateTransfer />} />
                      <Route path="/assets/ledger" element={<AssetList />} />
                      <Route path="/transfers" element={<TransferApprovals />} />
                      <Route path="/pacs/simulator" element={<BadgeTapSimulator />} />
                      <Route path="/passes" element={<AccessPasses />} />
                    </Route>

                    {/* Auditor / Admin */}
                    <Route element={<ProtectedRoute allowedRoles={["ADMIN", "AUDITOR"]} />}>
                      <Route path="/auditor/dashboard" element={<AuditorDashboard />} />
                      <Route path="/audit/explorer" element={<AuditTrailExplorer />} />
                      <Route path="/audit/verify" element={<VerificationTool />} />
                      {/* Read-only asset registry for oversight roles. Replaces
                          the old "Read-Only Ledgers" placeholder — the backend
                          already serves auditors the full asset list. */}
                      <Route path="/audit/assets" element={<AssetList />} />
                    </Route>

                    {/* User-only routes */}
                    <Route element={<ProtectedRoute allowedRoles={["USER"]} />}>
                      <Route path="/user/dashboard" element={<UserDashboard />} />
                      <Route path="/my-assets" element={<MyAssets />} />
                      <Route path="/transfer/request" element={<RequestTransferForm />} />
                    </Route>

                  </Route>
                </Route>

                {/* Smart Dashboard Redirect - handles /dashboard for all roles */}
                <Route path="/dashboard" element={<DashboardRedirect />} />

                {/* Fallback */}
                <Route path="*" element={<LandingPage />} />
            </Routes>
            </Suspense>
          </TransactionProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
