import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { PriceStrategyManager } from "@/components/dashboard/price-strategy-manager";
import { PriceAlertHistory } from "@/components/dashboard/price-alert-history";

export default function Home() {
  return (
    <DashboardShell>
      <div className="max-w-7xl mx-auto space-y-6">
        <DashboardStats />
        <PriceStrategyManager />
        <PriceAlertHistory />
        <RecentActivity />
      </div>
    </DashboardShell>
  );
}
