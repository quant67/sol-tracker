import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { PriceStrategyManager } from "@/components/dashboard/price-strategy-manager";
import { PriceAlertHistory } from "@/components/dashboard/price-alert-history";
import { StrategyBacktestPanel } from "@/components/dashboard/strategy-backtest-panel";

export default function Home() {
  return (
    <DashboardShell>
      <div className="max-w-7xl mx-auto space-y-6">
        <DashboardStats />
        <PriceStrategyManager />
        <StrategyBacktestPanel />
        <PriceAlertHistory />
        <RecentActivity />
      </div>
    </DashboardShell>
  );
}
