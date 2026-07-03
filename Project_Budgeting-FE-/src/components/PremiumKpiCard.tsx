import React from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface PremiumKpiCardProps {
  title: string;
  value: string | number;
  change?: number;
  isLoading?: boolean;
  icon?: React.ReactNode;
  sparklineData?: number[];
  formatter?: (val: any) => string;
}

export const PremiumKpiCard: React.FC<PremiumKpiCardProps> = ({
  title,
  value,
  change = 0,
  isLoading = false,
  icon,
  sparklineData = [10, 15, 8, 12, 20, 16, 25],
  formatter = (val) => String(val),
}) => {
  // Safe parsing of sparkline data into recharts format
  const chartData = sparklineData.map((val, idx) => ({ id: idx, value: val }));

  if (isLoading) {
    return (
      <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm animate-pulse h-[135px] flex flex-col justify-between">
        <div className="flex justify-between items-start">
          <div className="space-y-2 w-2/3">
            <div className="h-4 bg-slate-100 rounded w-3/4"></div>
            <div className="h-7 bg-slate-100 rounded w-1/2"></div>
          </div>
          <div className="w-10 h-10 bg-slate-100 rounded-xl"></div>
        </div>
        <div className="h-3 bg-slate-100 rounded w-1/3"></div>
      </div>
    );
  }

  const isPositive = change >= 0;

  return (
    <div className="relative overflow-hidden bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-premium group flex flex-col justify-between h-[135px]">
      {/* Background Sparkline Chart */}
      <div className="absolute inset-x-0 bottom-0 h-12 w-full opacity-20 group-hover:opacity-35 transition-premium pointer-events-none">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={1.5}
              fill={`url(#grad-${title.replace(/\s+/g, '')})`}
              dot={false}
              isAnimationActive={true}
              animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Content */}
      <div className="relative z-10 flex justify-between items-start">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
          <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
            {typeof value === 'number' ? formatter(value) : value}
          </h3>
        </div>
        {icon && (
          <div className="p-2.5 bg-slate-50 rounded-xl text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-premium border border-slate-100">
            {icon}
          </div>
        )}
      </div>

      {/* Footer Percentage Change */}
      <div className="relative z-10 flex items-center gap-1 mt-2">
        {change !== 0 ? (
          <>
            <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
              isPositive 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                : 'bg-rose-50 text-rose-700 border border-rose-100'
            }`}>
              {isPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              )}
              {Math.abs(change)}%
            </span>
            <span className="text-[11px] text-slate-400 font-medium">vs last month</span>
          </>
        ) : (
          <span className="text-[11px] text-slate-400 font-medium">Stable this month</span>
        )}
      </div>
    </div>
  );
};
