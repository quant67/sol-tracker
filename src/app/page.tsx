import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";

export default function Home() {
  return (
    <DashboardShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <DashboardStats />
        <RecentActivity />
      </div>
    </DashboardShell>
  );
}
