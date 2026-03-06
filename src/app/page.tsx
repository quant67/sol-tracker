import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AddressList } from "@/components/dashboard/address-list";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { TrendingUp, Target, Users, Zap } from "lucide-react";

export default function Home() {
  return (
    <DashboardShell>
      <div className="max-w-7xl mx-auto space-y-8 pb-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Monitored"
            value="12"
            increase="+2 today"
            icon={<Target className="w-5 h-5 text-indigo-400" />}
          />
          <StatCard
            label="Today's Signals"
            value="142"
            increase="+12%"
            icon={<Zap className="w-5 h-5 text-amber-400" />}
          />
          <StatCard
            label="Active Bots"
            value="3"
            increase="Running"
            icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
          />
          <StatCard
            label="Community"
            value="2.4k"
            increase="+150"
            icon={<Users className="w-5 h-5 text-indigo-400" />}
          />
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 sticky top-28">
            <AddressList />
          </div>
          <div className="lg:col-span-8">
            <RecentActivity />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function StatCard({ label, value, increase, icon }: { label: string, value: string, increase: string, icon: React.ReactNode }) {
  return (
    <div className="bg-[#0a0a0a] border border-zinc-800/50 p-6 rounded-2xl shadow-xl hover:bg-zinc-900/40 transition-all group overflow-hidden relative">
      <div className="absolute top-0 right-0 w-24 h-24 bg-zinc-800/5 group-hover:bg-indigo-600/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 transition-colors"></div>
      <div className="flex items-center justify-between mb-4 relative">
        <div className="p-2 rounded-xl bg-zinc-900/50 border border-zinc-800/50 shadow-inner">
          {icon}
        </div>
        <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 bg-zinc-900/80 px-2 py-0.5 rounded-full border border-zinc-800/50">
          Stat
        </span>
      </div>
      <h3 className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1">{label}</h3>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold text-zinc-100 tracking-tight">{value}</span>
        <span className="text-xs text-indigo-400 font-medium mb-1.5">{increase}</span>
      </div>
    </div>
  );
}

