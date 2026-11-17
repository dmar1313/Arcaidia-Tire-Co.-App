import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import {
  Bell,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Plus,
  ShieldCheck,
  Tag,
  UserCircle,
  Users,
} from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { BrandLogo, DEFAULT_SHOP_NAME } from './components/BrandLogo';
import { CompanyStaffExportsView } from './components/CompanyStaffExportsView';
import { CustomersVehiclesView } from './components/CustomersVehiclesView';
import { DashboardBoard } from './components/DashboardBoard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PriceListView } from './components/PriceListView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { TiresView } from './components/TiresView';
import { WorkOrderModal } from './components/WorkOrderModal';
import {
  auth,
  db,
  emailToStaffId,
  formatAppError,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from './lib/firebase';
import {
  dispatchStaffPushNotification,
  getStaffNotificationPermission,
  playBayChime,
  requestStaffNotificationPermission,
} from './lib/notifications';
import {
  claimAndCreateShop,
  markNotificationRead,
  quickUpdateWorkOrderStatus,
  saveCompanyProfile,
  type ActorInfo,
} from './lib/shopService';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  type CompanyProfile,
  type Customer,
  type PriceAuditEntry,
  type ServiceCatalogItem,
  type StaffMember,
  type StaffNotification,
  type StaffRole,
  type TireInventoryItem,
  type Vehicle,
  type WorkOrder,
  type WorkOrderStatus,
} from './types';

type NavTab = 'board' | 'orders' | 'customers' | 'prices' | 'tires' | 'company';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">
            <h1 className="text-lg font-bold text-slate-900">Something went wrong</h1>
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {formatAppError(this.state.error)}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Reload Shop Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ShopWorkspace />
    </AppErrorBoundary>
  );
}

function ShopWorkspace() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [myStaffDoc, setMyStaffDoc] = useState<StaffMember | null | undefined>(undefined);
  const [shopInitialized, setShopInitialized] = useState<boolean | undefined>(undefined);
  const [claimingShop, setClaimingShop] = useState(false);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [tires, setTires] = useState<TireInventoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [priceAuditLog, setPriceAuditLog] = useState<PriceAuditEntry[]>([]);
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);

  const [activeTab, setActiveTab] = useState<NavTab>('board');
  const [viewAsMechanic, setViewAsMechanic] = useState(false);
  const [showAlertsDrawer, setShowAlertsDrawer] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [chimeEnabled, setChimeEnabled] = useState(true);

  const [modalOrderId, setModalOrderId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [prefillCustomer, setPrefillCustomer] = useState<Customer | null>(null);
  const [prefillVehicle, setPrefillVehicle] = useState<Vehicle | null>(null);

  // Quick onboarding state for first-time setup
  const [quickShopName, setQuickShopName] = useState(DEFAULT_SHOP_NAME);
  const [quickShopPhone, setQuickShopPhone] = useState('');
  const [quickTaxRate, setQuickTaxRate] = useState('7.0');
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);

  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const notifBootstrappedRef = useRef(false);
  const effectiveRoleRef = useRef<StaffRole>('mechanic');
  const chimeEnabledRef = useRef<boolean>(true);

  useEffect(() => {
    testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user) {
        setMyStaffDoc(undefined);
      }
    });
    return unsub;
  }, []);

  const isBootstrapAdmin =
    !!authUser?.email &&
    authUser.emailVerified &&
    authUser.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;

  // Step 1: Resolve current user's staff record & shop initialization status
  useEffect(() => {
    if (!authReady || !authUser || !authUser.email || !authUser.emailVerified) {
      setMyStaffDoc(undefined);
      setShopInitialized(undefined);
      return;
    }
    const staffId = emailToStaffId(authUser.email);
    const path = `staff/${staffId}`;
    const unsubStaff = onSnapshot(
      doc(db, 'staff', staffId),
      (snap) => {
        setMyStaffDoc(snap.exists() ? (snap.data() as StaffMember) : null);
      },
      (err) => {
        if (!isBootstrapAdmin) {
          setMyStaffDoc(null);
        } else {
          handleFirestoreError(err, OperationType.GET, path);
        }
      }
    );

    const unsubStatus = onSnapshot(
      doc(db, 'shop_status', 'default'),
      (snap) => {
        setShopInitialized(snap.exists());
      },
      () => {
        setShopInitialized(false);
      }
    );

    return () => {
      unsubStaff();
      unsubStatus();
    };
  }, [authReady, authUser, isBootstrapAdmin]);

  const isAuthorizedStaff = useMemo(() => {
    if (!authUser || !authUser.emailVerified) return false;
    if (isBootstrapAdmin) return true;
    return !!myStaffDoc && myStaffDoc.active === true;
  }, [authUser, isBootstrapAdmin, myStaffDoc]);

  const actualRole: StaffRole = useMemo(() => {
    if (isBootstrapAdmin) return 'management';
    if (myStaffDoc?.active && myStaffDoc.role === 'management') return 'management';
    return 'mechanic';
  }, [isBootstrapAdmin, myStaffDoc]);

  const effectiveRole: StaffRole =
    actualRole === 'management' && viewAsMechanic ? 'mechanic' : actualRole;

  useEffect(() => {
    effectiveRoleRef.current = effectiveRole;
  }, [effectiveRole]);

  useEffect(() => {
    chimeEnabledRef.current = chimeEnabled;
  }, [chimeEnabled]);

  const actor: ActorInfo | null = useMemo(() => {
    if (!authUser) return null;
    return {
      uid: authUser.uid,
      name: myStaffDoc?.name || authUser.displayName || authUser.email || 'Staff',
      email: authUser.email || '',
      role: actualRole,
    };
  }, [authUser, myStaffDoc, actualRole]);

  // Step 2: Attach Firestore real-time listeners once authorized and not mid-claim
  useEffect(() => {
    if (!isAuthorizedStaff || claimingShop) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        doc(db, 'company', 'default'),
        (snap) => {
          setCompany(snap.exists() ? (snap.data() as CompanyProfile) : null);
        },
        (err) => handleFirestoreError(err, OperationType.GET, 'company/default')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'staff'), orderBy('name', 'asc')),
        (snap) => setStaff(snap.docs.map((d) => d.data() as StaffMember)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'staff')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'services'), orderBy('name', 'asc')),
        (snap) => setServices(snap.docs.map((d) => d.data() as ServiceCatalogItem)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'services')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'tires'), orderBy('tireSize', 'asc')),
        (snap) => setTires(snap.docs.map((d) => d.data() as TireInventoryItem)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'tires')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'customers'), orderBy('name', 'asc')),
        (snap) => setCustomers(snap.docs.map((d) => d.data() as Customer)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'customers')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'vehicles'), orderBy('createdAt', 'desc')),
        (snap) => setVehicles(snap.docs.map((d) => d.data() as Vehicle)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'vehicles')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'work_orders'), orderBy('createdAt', 'desc')),
        { includeMetadataChanges: true },
        (snap) => {
          setWorkOrders(
            snap.docs.map((d) => ({
              ...(d.data() as WorkOrder),
              hasPendingWrites: d.metadata.hasPendingWrites,
            }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'work_orders')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'price_audit_log'), orderBy('createdAt', 'desc'), limit(50)),
        (snap) => setPriceAuditLog(snap.docs.map((d) => d.data() as PriceAuditEntry)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'price_audit_log')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'staff_notifications'), orderBy('createdAt', 'desc'), limit(30)),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as StaffNotification);
          setNotifications(list);

          if (!notifBootstrappedRef.current) {
            list.forEach((n) => seenNotifIdsRef.current.add(n.id));
            notifBootstrappedRef.current = true;
            return;
          }

          for (const n of list) {
            if (!seenNotifIdsRef.current.has(n.id)) {
              seenNotifIdsRef.current.add(n.id);
              const isFromSelf = n.createdByUid === authUser?.uid;
              const matchesRole =
                n.targetRole === 'all' || n.targetRole === effectiveRoleRef.current;
              if (!isFromSelf && matchesRole) {
                dispatchStaffPushNotification(n.title, n.body, n.id);
                if (chimeEnabledRef.current) playBayChime();
              }
            }
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'staff_notifications')
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [isAuthorizedStaff, claimingShop, authUser?.uid]);

  const modalOrder = useMemo(
    () => (modalOrderId ? workOrders.find((w) => w.id === modalOrderId) || null : null),
    [workOrders, modalOrderId]
  );

  const pendingWritesCount = useMemo(
    () => workOrders.filter((w) => w.hasPendingWrites).length,
    [workOrders]
  );

  const relevantNotifications = useMemo(() => {
    if (!authUser) return [];
    return notifications.filter(
      (n) => n.targetRole === 'all' || n.targetRole === effectiveRole
    );
  }, [notifications, authUser, effectiveRole]);

  const unreadCount = useMemo(() => {
    if (!authUser) return 0;
    return relevantNotifications.filter((n) => !n.readByUids?.includes(authUser.uid)).length;
  }, [relevantNotifications, authUser]);

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(formatAppError(err, 'Sign-in failed.'));
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setViewAsMechanic(false);
  };

  const handleQuickStatus = async (wo: WorkOrder, nextStatus: WorkOrderStatus) => {
    if (!actor) return;
    await quickUpdateWorkOrderStatus(wo, nextStatus, { ...actor, role: effectiveRole });
  };

  const handleQuickOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actor || !quickShopName.trim()) return;
    setOnboardingSaving(true);
    setOnboardError(null);
    try {
      await saveCompanyProfile(
        {
          shopName: quickShopName,
          address: '',
          cityStateZip: '',
          phone: quickShopPhone,
          email: actor.email,
          iowaTaxRate: Number(quickTaxRate) || 7.0,
          workOrderPrefix: 'WO-',
          nextOrderNumber: 1001,
          receiptFooter: 'Thank you for your business. Torque lug nuts after 50 miles.',
        },
        actor.uid,
        !company,
        { name: actor.name, email: actor.email }
      );
    } catch (err) {
      setOnboardError(formatAppError(err, 'Unable to save shop profile.'));
    } finally {
      setOnboardingSaving(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading shop workspace…</p>
      </div>
    );
  }

  if (!authUser) {
    return <AuthGate mode="login" authError={authError} onSignIn={handleSignIn} />;
  }

  if (!authUser.email || !authUser.emailVerified) {
    return (
      <AuthGate
        mode="unauthorized"
        userEmail={authUser.email}
        userDisplayName={authUser.displayName}
        authError="A verified Google email address is required to access shop records."
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />
    );
  }

  if (!isBootstrapAdmin && (myStaffDoc === undefined || shopInitialized === undefined)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-500">Verifying staff access…</p>
      </div>
    );
  }

  if (!isAuthorizedStaff || !actor || claimingShop) {
    return (
      <AuthGate
        mode={shopInitialized ? 'unauthorized' : 'create_shop'}
        userEmail={authUser.email}
        userDisplayName={authUser.displayName}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onCreateShop={async (payload) => {
          if (!authUser.email) return;
          setClaimingShop(true);
          try {
            await claimAndCreateShop({
              ownerName: payload.ownerName,
              ownerEmail: authUser.email,
              ownerUid: authUser.uid,
              shopName: payload.shopName,
              phone: payload.phone,
              iowaTaxRate: payload.iowaTaxRate,
            });
          } finally {
            setClaimingShop(false);
          }
        }}
      />
    );
  }

  const isMechanicView = effectiveRole === 'mechanic';

  const navItems: Array<{ id: NavTab; label: string; shortLabel: string; icon: React.ReactNode }> = [
    {
      id: 'board',
      label: isMechanicView ? 'Bay Board' : "Today's Board",
      shortLabel: isMechanicView ? 'Bay' : 'Board',
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      id: 'orders',
      label: 'All Work Orders',
      shortLabel: 'Orders',
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      id: 'customers',
      label: 'Customers & Vehicles',
      shortLabel: 'Vehicles',
      icon: <Users className="h-4 w-4" />,
    },
    {
      id: 'prices',
      label: isMechanicView ? 'Price List (Locked)' : 'Price List',
      shortLabel: 'Prices',
      icon: <Tag className="h-4 w-4" />,
    },
    {
      id: 'tires',
      label: 'Tires',
      shortLabel: 'Tires',
      icon: <LifeBuoy className="h-4 w-4" />,
    },
    ...(!isMechanicView
      ? [
          {
            id: 'company' as NavTab,
            label: 'Team, Shop & Exports',
            shortLabel: 'Team',
            icon: <Building2 className="h-4 w-4" />,
          },
        ]
      : []),
  ];

  const activeBoardCount = workOrders.filter(
    (wo) => wo.status !== 'paid' && wo.status !== 'voided'
  ).length;
  const readyPickupCount = workOrders.filter((wo) => wo.status === 'ready').length;
  const waitingPartsCount = workOrders.filter((wo) => wo.status === 'waiting_on_parts').length;

  const effectiveTab: NavTab =
    isMechanicView && activeTab === 'company' ? 'board' : activeTab;

  const activeTitle =
    navItems.find((n) => n.id === effectiveTab)?.label ||
    (isMechanicView ? 'Bay Board' : "Today's Board");

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F7F6F2] text-[#111111] flex flex-col md:flex-row">
      {/* Desktop Sidebar — Arcadia Classic Charcoal & Crimson */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-[#0F0F10] text-neutral-100 border-r border-neutral-800 z-30">
        <div className="px-4 py-3 flex flex-col items-start justify-center border-b border-[#E5E3DC] bg-white border-t-2 border-t-[#C81E2B]">
          <BrandLogo size="md" />
          {company?.shopName &&
            company.shopName.trim().toLowerCase() !== DEFAULT_SHOP_NAME.toLowerCase() && (
              <span className="mt-1 text-xs font-semibold text-slate-700 truncate max-w-full">
                {company.shopName}
              </span>
            )}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          <div>
            <p className="px-3 mb-2 text-[10px] font-semibold tracking-wider uppercase text-neutral-500">
              Shop
            </p>
            <div className="space-y-1">
              {navItems.map((item) => {
                const active = effectiveTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#C81E2B] text-white'
                        : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className={active ? 'text-white' : 'text-neutral-400'}>
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.id === 'board' && activeBoardCount > 0 && (
                      <span
                        className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                          active ? 'bg-black/25 text-white' : 'bg-white/10 text-neutral-300'
                        }`}
                      >
                        {activeBoardCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-white/10">
            <p className="px-3 mb-2 text-[10px] font-semibold tracking-wider uppercase text-neutral-500">
              At a Glance
            </p>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setActiveTab('board')}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-neutral-300 hover:bg-white/5 transition-colors"
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">Ready to Pick Up</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-neutral-200 bg-white/10 px-1.5 py-0.5 rounded-md">
                  {readyPickupCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('board')}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-neutral-300 hover:bg-white/5 transition-colors"
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">Waiting on Parts</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-neutral-200 bg-white/10 px-1.5 py-0.5 rounded-md">
                  {waitingPartsCount}
                </span>
              </button>
            </div>
          </div>
        </nav>

        <div className="p-3 border-t border-white/10 space-y-2.5">
          {actualRole === 'management' && (
            <button
              type="button"
              onClick={() => setViewAsMechanic((v) => !v)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                viewAsMechanic
                  ? 'bg-[#C81E2B]/20 border-[#C81E2B]/50 text-red-200'
                  : 'bg-white/5 border-white/15 border-dashed text-neutral-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                {viewAsMechanic ? 'Mechanic View Active' : 'Preview Mechanic View'}
              </span>
            </button>
          )}

          <div className="px-2 py-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAlertsDrawer(false);
                setShowProfileDrawer((s) => !s);
              }}
              className="min-w-0 text-left hover:opacity-85 transition-opacity"
              title="View signed-in profile"
            >
              <p className="text-xs font-semibold text-white truncate">{actor.name}</p>
              <p className="text-[11px] text-neutral-400 truncate">{actor.email}</p>
              <p className="text-[10px] font-medium text-neutral-400 capitalize">
                {effectiveRole}
                {isBootstrapAdmin ? ' · Owner' : ''}
              </p>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 shrink-0"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div
        className={`flex-1 min-w-0 md:pl-60 flex flex-col min-h-screen pb-24 md:pb-8 ${
          showCreateModal || modalOrder ? 'print:hidden' : ''
        }`}
      >
        {/* Top Bar */}
        <header className="sticky top-0 z-20 h-14 md:h-16 bg-white/95 backdrop-blur-sm border-b border-[#E5E3DC] px-3 sm:px-4 md:px-6 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="md:hidden shrink-0">
              <BrandLogo size="sm" />
            </div>
            <h1 className="hidden sm:block text-base md:text-lg font-bold tracking-tight text-[#111111] truncate">
              {activeTitle}
            </h1>
            {viewAsMechanic && (
              <span className="hidden sm:inline text-xs font-medium text-[#C81E2B]">
                · Bay Preview
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="hidden sm:block">
              <PWAInstallButton />
            </div>

            {/* Staff Alerts Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowProfileDrawer(false);
                  setShowAlertsDrawer((s) => !s);
                }}
                className="relative p-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="Staff Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-[#C81E2B] text-[10px] font-bold text-white flex items-center justify-center font-mono">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showAlertsDrawer && (
                <div className="fixed inset-x-3 top-16 sm:inset-x-auto sm:absolute sm:right-0 sm:top-auto sm:mt-2 sm:w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-40 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">
                      Staff Bay Alerts ({effectiveRole})
                    </span>
                    <div className="flex items-center gap-2">
                      {getStaffNotificationPermission() === 'default' && (
                        <button
                          type="button"
                          onClick={() => requestStaffNotificationPermission()}
                          className="text-[11px] font-medium text-[#C81E2B] hover:text-[#A61722]"
                        >
                          Enable Push
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowAlertsDrawer(false)}
                        className="text-xs text-slate-500 hover:text-slate-900"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {relevantNotifications.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500">
                        No staff alerts yet. Mechanics are pinged on new jobs; management is pinged
                        when jobs are marked Ready.
                      </p>
                    ) : (
                      relevantNotifications.map((n) => {
                        const isUnread = !n.readByUids?.includes(authUser.uid);
                        return (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              markNotificationRead(n.id, authUser.uid, n.readByUids || []);
                              const matched = workOrders.find((w) => w.id === n.workOrderId);
                              if (matched) {
                                setModalOrderId(matched.id);
                                setShowAlertsDrawer(false);
                              }
                            }}
                            className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                              isUnread ? 'bg-red-50/40' : ''
                            }`}
                          >
                            <p className="text-xs font-semibold text-slate-900">{n.title}</p>
                            <p className="text-xs text-slate-600 mt-0.5">{n.body}</p>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Signed-In Profile / Account Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowAlertsDrawer(false);
                  setShowProfileDrawer((s) => !s);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 min-h-[40px]"
                aria-label="My Profile & Account"
                title="My Profile & Account"
              >
                <UserCircle className="h-4 w-4 text-slate-600 shrink-0" />
                <span className="hidden sm:inline text-xs font-medium max-w-[120px] truncate">
                  {actor.name}
                </span>
              </button>

              {showProfileDrawer && (
                <div className="fixed inset-x-3 top-16 sm:inset-x-auto sm:absolute sm:right-0 sm:top-auto sm:mt-2 sm:w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/60">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserCircle className="h-5 w-5 text-[#C81E2B] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{actor.name}</p>
                        <p className="text-[11px] text-slate-600 font-mono truncate">
                          {actor.email}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowProfileDrawer(false)}
                      className="text-xs text-slate-500 hover:text-slate-900 shrink-0"
                    >
                      Close
                    </button>
                  </div>

                  <div className="p-4 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Access Level</span>
                      <span className="font-semibold text-slate-900 capitalize">
                        {actualRole === 'management'
                          ? isBootstrapAdmin
                            ? 'Management · Shop Owner'
                            : 'Management'
                          : 'Mechanic'}
                      </span>
                    </div>
                    {viewAsMechanic && actualRole === 'management' && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Active View</span>
                        <span className="font-medium text-[#C81E2B]">Mechanic Bay Preview</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Bay / Specialty</span>
                      <span className="font-medium text-slate-800">
                        {myStaffDoc?.baySpecialty || (isBootstrapAdmin ? 'Owner / Management' : '—')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Shop</span>
                      <span className="font-medium text-slate-800 truncate max-w-[170px]">
                        {company?.shopName || DEFAULT_SHOP_NAME}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Google Verification</span>
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {authUser.emailVerified ? 'Verified' : 'Unverified'}
                      </span>
                    </div>

                    {actualRole === 'management' && (
                      <button
                        type="button"
                        onClick={() => {
                          setViewAsMechanic((v) => !v);
                          setShowProfileDrawer(false);
                        }}
                        className={`w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors min-h-[38px] ${
                          viewAsMechanic
                            ? 'bg-red-50 border-red-200 text-red-800'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {viewAsMechanic ? 'Exit Mechanic View' : 'Preview Mechanic View'}
                      </button>
                    )}

                    <div className="sm:hidden pt-1">
                      <PWAInstallButton />
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                    {actualRole === 'management' && (
                      <button
                        type="button"
                        onClick={() => {
                          setViewAsMechanic(false);
                          setActiveTab('company');
                          setShowProfileDrawer(false);
                        }}
                        className="text-xs font-medium text-slate-700 hover:text-slate-900"
                      >
                        Shop &amp; Staff Settings
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileDrawer(false);
                        handleSignOut();
                      }}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setPrefillCustomer(null);
                setPrefillVehicle(null);
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 sm:px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New Work Order</span>
              <span className="sm:hidden">New Job</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6">
          {/* First-time Shop Setup Card (only shown when company/default does not exist yet) */}
          {!company && actualRole === 'management' && activeTab === 'board' && (
            <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Set up your shop profile
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure your shop name for PDF receipts and Iowa sales tax rate.
                </p>
                {onboardError && (
                  <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {onboardError}
                  </p>
                )}
              </div>
              <form onSubmit={handleQuickOnboard} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                    Shop Name *
                    <input
                      type="text"
                      required
                      placeholder="e.g., Arcadia Tire Co."
                      value={quickShopName}
                      onChange={(e) => setQuickShopName(e.target.value)}
                      className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    Shop Phone
                    <input
                      type="tel"
                      placeholder="(515) 555-0190"
                      value={quickShopPhone}
                      onChange={(e) => setQuickShopPhone(e.target.value)}
                      className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    Iowa Tax (%)
                    <input
                      type="number"
                      step="0.01"
                      value={quickTaxRate}
                      onChange={(e) => setQuickTaxRate(e.target.value)}
                      className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono"
                    />
                  </label>
                  <div className="sm:col-span-4 flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={onboardingSaving}
                      className="rounded-lg bg-[#C81E2B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#A61722] min-h-[40px]"
                    >
                      {onboardingSaving ? 'Setting up…' : 'Save & Launch Shop'}
                    </button>
                  </div>
              </form>
            </section>
          )}

          {effectiveTab === 'board' && (
            <DashboardBoard
              workOrders={workOrders}
              effectiveRole={effectiveRole}
              onSelectOrder={(wo) => setModalOrderId(wo.id)}
              onCreateOrder={() => {
                setPrefillCustomer(null);
                setPrefillVehicle(null);
                setShowCreateModal(true);
              }}
              onQuickStatus={handleQuickStatus}
            />
          )}

          {effectiveTab === 'orders' && (
            <DashboardBoard
              workOrders={workOrders}
              effectiveRole={effectiveRole}
              onSelectOrder={(wo) => setModalOrderId(wo.id)}
              onCreateOrder={() => {
                setPrefillCustomer(null);
                setPrefillVehicle(null);
                setShowCreateModal(true);
              }}
              onQuickStatus={handleQuickStatus}
              compactMode
            />
          )}

          {effectiveTab === 'customers' && (
            <CustomersVehiclesView
              customers={customers}
              vehicles={vehicles}
              actor={actor}
              onCreateOrderForVehicle={(customer, vehicle) => {
                setPrefillCustomer(customer);
                setPrefillVehicle(vehicle);
                setShowCreateModal(true);
              }}
            />
          )}

          {effectiveTab === 'prices' && (
            <PriceListView
              services={services}
              priceAuditLog={priceAuditLog}
              effectiveRole={effectiveRole}
              actor={actor}
            />
          )}

          {effectiveTab === 'tires' && (
            <TiresView
              tires={tires}
              effectiveRole={effectiveRole}
              actor={actor}
            />
          )}

          {effectiveTab === 'company' && !isMechanicView && (
            <CompanyStaffExportsView
              company={company}
              staff={staff}
              customers={customers}
              vehicles={vehicles}
              workOrders={workOrders}
              services={services}
              actor={actor}
              effectiveRole={effectiveRole}
              myStaffDoc={myStaffDoc}
              isBootstrapAdmin={isBootstrapAdmin}
              emailVerified={authUser.emailVerified}
              onSignOut={handleSignOut}
              chimeEnabled={chimeEnabled}
              onToggleChime={setChimeEnabled}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation (4 concise destinations, >= 44px hitboxes + safe-area inset) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0F0F10] border-t border-neutral-800 grid grid-cols-5 pb-safe"
      >
        {(isMechanicView
          ? [navItems[0], navItems[1], navItems[2], navItems[4], navItems[3]]
          : [navItems[0], navItems[2], navItems[4], navItems[3], navItems[5]]
        ).map((item) => {
          const active =
            effectiveTab === item.id ||
            (!isMechanicView && item.id === 'board' && effectiveTab === 'orders');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center min-h-[56px] py-1.5 transition-colors ${
                active ? 'text-[#FF4754]' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {item.icon}
              <span className="text-[11px] font-medium mt-1">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Work Order Create / Edit / Receipt Modal */}
      {(showCreateModal || modalOrder) && (
        <WorkOrderModal
          existingOrder={modalOrder}
          initialCustomer={prefillCustomer}
          initialVehicle={prefillVehicle}
          customers={customers}
          vehicles={vehicles}
          services={services}
          tires={tires}
          company={company}
          actor={actor}
          effectiveRole={effectiveRole}
          onClose={() => {
            setShowCreateModal(false);
            setModalOrderId(null);
            setPrefillCustomer(null);
            setPrefillVehicle(null);
          }}
        />
      )}

      <OfflineIndicator pendingCount={pendingWritesCount} />
    </div>
  );
}
