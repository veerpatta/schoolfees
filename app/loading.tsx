import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(127,29,29,0.12),_transparent_28%),linear-gradient(180deg,_#f8f4ea_0%,_#f6f6f5_45%,_#eef2f7_100%)] px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <RouteLoading
          badgeLabel="Starting"
          title="Loading the fee admin workspace"
          description="The app is preparing the internal school workspace and checking the current session."
        />
      </div>
    </main>
  );
}
