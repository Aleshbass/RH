# State Management Architecture - Rehabify Health Platform

## Overview

This document outlines the modernized state management architecture for the Rehabify Health platform, implementing **Zustand** for global state management and **TanStack Query** for server state caching and synchronization.

## Architecture Components

### 1. **Zustand Stores** (`/stores/`)

#### Auth Store (`authStore.ts`)

Manages authentication state, user data, and approval status with persistence.

```typescript
interface AuthState {
  user: User | null;
  approvalStatus: ApprovalStatus | null;
  isLoading: boolean;
  error: string | null;

  // Computed properties
  isAuthenticated: boolean;
  isApproved: boolean;
  needsApproval: boolean;
  canAccessDashboard: boolean;
}
```

**Features:**

- ✅ Persistent storage (localStorage)
- ✅ Immutable updates with Immer
- ✅ Computed properties for derived state
- ✅ Type-safe state management

#### Dashboard Store (`dashboardStore.ts`)

Manages dashboard-specific UI state and filters.

```typescript
interface DashboardState {
  activeTab: string;
  sidebarCollapsed: boolean;
  filters: DashboardFilters;
  cachedStats: {
    data: DashboardStats | null;
    timestamp: number | null;
  };
}
```

**Features:**

- ✅ UI state persistence
- ✅ Smart caching with timestamps
- ✅ Filter state management
- ✅ Cache invalidation utilities

### 2. **TanStack Query Integration** (`/hooks/useConvexQuery.ts`)

Enhanced Convex query hook that bridges Convex with TanStack Query for better caching, error handling, and state management.

```typescript
export function useConvexQuery<TData>(
  query: FunctionReference<"query", "public", any, TData>,
  args?: any,
  options?: ConvexQueryOptions<TData>,
): UseQueryResult<TData, ConvexError>;
```

**Features:**

- ✅ Smart caching (5 minutes default)
- ✅ Automatic retry logic
- ✅ User-specific query keys
- ✅ Error handling
- ✅ Loading states
- ✅ Background refetching

#### Specialized Hooks

```typescript
// Dashboard statistics with smart caching
export function useDashboardStats();

// User's patients with search and pagination
export function useMyPatients(searchTerm?: string, limit?: number);

// Appointments with filtering
export function useMyAppointments(filters?: AppointmentFilters);
```

### 3. **Query Provider** (`/providers/QueryProvider.tsx`)

Global TanStack Query configuration with development tools.

**Features:**

- ✅ Global query defaults
- ✅ Error retry strategies
- ✅ React Query DevTools (development only)
- ✅ Cache configuration

## Implementation Benefits

### 🚀 **Performance Improvements**

1. **Smart Caching**

   - Dashboard stats cached for 2 minutes
   - Patient data cached for 5 minutes
   - Appointments cached for 30 seconds
   - Background updates when stale

2. **Reduced API Calls**

   - Query deduplication
   - Background refetching
   - Optimistic updates

3. **Better Loading States**
   - Skeleton components during loading
   - Previous data kept during refetch
   - Error boundaries for failed queries

### 🛡️ **Type Safety**

1. **Strongly Typed Stores**

   - Full TypeScript support
   - Compile-time error checking
   - IntelliSense support

2. **Type-Safe Query Hooks**
   - Inferred return types
   - Parameter validation
   - Error type safety

### 🔄 **State Synchronization**

1. **Automatic Updates**

   - Real-time data synchronization
   - Cross-component state sharing
   - Persistent state across sessions

2. **Optimistic Updates**
   - Immediate UI feedback
   - Rollback on failure
   - Consistent user experience

## Migration Guide

### From Old Architecture

**Before (Direct Convex Queries):**

```typescript
// ❌ Old approach - no caching, complex state management
const user = useQuery(api.users.getMyUser)
const stats = useQuery(api.patients.getDashboardStats)
const patients = useQuery(api.patients.getMyPatients, {})

// Props drilling and type issues
<PhysiotherapistDashboard
  currentUser={user}
  approvalStatus={approvalStatus}
/>
```

**After (Zustand + TanStack Query):**

```typescript
// ✅ New approach - smart caching, centralized state
const { user } = useAuthStore()
const { data: stats, isLoading } = useDashboardStats()
const { data: patients } = useMyPatients()

// Clean component without props
<PhysiotherapistDashboardV2 />
```

### Component Updates

1. **Replace Direct Convex Queries**

   ```typescript
   // Replace
   const data = useQuery(api.some.query, args);

   // With
   const { data, isLoading, error } = useConvexQuery(api.some.query, args);
   ```

2. **Use Zustand Stores**

   ```typescript
   // Replace component props
   const { user, isAuthenticated } = useAuthStore();
   const { filters, updateFilters } = useDashboardStore();
   ```

3. **Implement Loading States**
   ```typescript
   if (isLoading) return <Skeleton />
   if (error) return <ErrorComponent />
   ```

## Best Practices

### 1. **Store Design**

- Keep stores focused and cohesive
- Use computed properties for derived state
- Implement proper TypeScript interfaces
- Use Immer for immutable updates

### 2. **Query Management**

- Set appropriate cache times based on data freshness needs
- Use query keys that include user context
- Implement proper error handling
- Use background refetching for better UX

### 3. **Component Structure**

- Separate data fetching from presentation
- Use skeleton components for loading states
- Implement error boundaries
- Keep components focused on single responsibilities

### 4. **Performance Optimization**

- Use `keepPreviousData` for pagination
- Implement query prefetching for predictable navigation
- Use selective subscriptions to prevent unnecessary re-renders
- Cache expensive computations

## Development Tools

### React Query DevTools

Available in development mode at the bottom-right corner:

- Query inspection
- Cache visualization
- Network request monitoring
- Performance metrics

### Zustand DevTools

Browser extension support for:

- State inspection
- Time-travel debugging
- Action logging
- State persistence monitoring

## File Structure

```
stores/
  ├── authStore.ts          # Authentication & user state
  ├── dashboardStore.ts     # Dashboard UI & filters
  └── onboardingStore.ts    # Existing onboarding state

hooks/
  ├── useConvexQuery.ts     # Enhanced Convex queries
  └── use-mobile.ts         # Existing mobile detection

providers/
  └── QueryProvider.tsx     # TanStack Query configuration

components/
  └── dashboard/
      └── physiotherapist/
          ├── PhysiotherapistDashboard.tsx      # Legacy (to be deprecated)
          └── PhysiotherapistDashboardV2.tsx    # New implementation
```

## Next Steps

1. **Immediate Actions**

   - Install dependencies: `zustand`, `immer`, `@tanstack/react-query-devtools`
   - Update existing components to use new hooks
   - Implement error boundaries

2. **Phase 1: Core Components**

   - Migrate PhysiotherapistDashboard ✅
   - Migrate ReportsPage ✅
   - Update AppointmentsPage
   - Update PatientsPage

3. **Phase 2: Clinic Owner & Admin**

   - Migrate ClinicOwnerDashboard
   - Update AdminDashboard
   - Implement role-based state management

4. **Phase 3: Advanced Features**
   - Real-time subscriptions
   - Offline support
   - Advanced caching strategies
   - Performance monitoring

## Troubleshooting

### Common Issues

1. **Hydration Errors**

   - Ensure stores are properly initialized
   - Use `hasHydrated` flag for SSR compatibility

2. **Cache Invalidation**

   - Use query client methods for manual invalidation
   - Implement proper query key strategies

3. **Type Errors**
   - Ensure proper TypeScript configuration
   - Use type assertions sparingly
   - Implement proper error boundaries

### Performance Monitoring

Monitor these metrics:

- Query cache hit rate
- Average query response time
- Component re-render frequency
- Memory usage patterns

---

This architecture provides a solid foundation for scalable, maintainable, and performant state management in the Rehabify Health platform.
