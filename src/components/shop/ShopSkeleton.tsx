import { Skeleton } from "@/components/ui/skeleton";

export default function ShopSkeleton() {
  return (
    <div aria-busy="true" aria-label="Dukaanka waa la soo diyaarinayaa" className="min-h-screen bg-background pb-28">
      <header className="bg-primary px-5 py-5 text-primary-foreground">
        <div className="mx-auto flex max-w-xl items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-xl bg-white/20" />
          <Skeleton className="h-8 w-40 rounded-lg bg-white/20" />
          <Skeleton className="ml-auto h-8 w-8 rounded-lg bg-white/20" />
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-8 px-4 py-6">
        <section className="space-y-3">
          <Skeleton className="h-7 w-60 rounded-md" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </section>
        <section className="space-y-4">
          <Skeleton className="h-7 w-44 rounded-md" />
          <div className="flex gap-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-[76px] w-[76px] rounded-full" />
                <Skeleton className="h-3 w-[76px]" />
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-4">
          <Skeleton className="h-7 w-48" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border bg-card p-3">
                <Skeleton className="aspect-square w-full rounded-xl" />
                <Skeleton className="mt-3 h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
                <Skeleton className="mt-3 h-6 w-full" />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
