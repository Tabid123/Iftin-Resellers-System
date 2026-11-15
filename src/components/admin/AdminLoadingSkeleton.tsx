import { Skeleton } from '@/components/ui/skeleton';

/** Keep the admin content area occupied while access or data is being checked. */
export function AdminDetailSkeleton() {
  return (
    <div role="status" aria-label="Xogta waa la soo akhrinayaa" aria-busy="true" className="space-y-4 px-1 py-3">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map(n => (
          <div key={n} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        ))}
      </div>
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        {[0, 1, 2].map(n => (
          <div key={n} className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Xogta iyo oggolaanshaha ayaa la hubinayaa...</span>
    </div>
  );
}

/** First-load dashboard skeleton; existing cards remain visible on refetch. */
export function AdminDashboardSkeleton() {
  return (
    <div role="status" aria-label="Dashboard-ka waa la soo akhrinayaa" aria-busy="true" className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3, 4, 5].map(n => (
          <div key={n} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-9 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map(n => <Skeleton key={n} className="h-36 w-full rounded-lg" />)}
        </div>
      </div>
      <span className="sr-only">Fadlan sug inta xogta dashboard-ka la soo akhrinayo.</span>
    </div>
  );
}
