import { memo } from 'react';

/** Tarjeta de estadística simple, compartida entre el perfil propio y el
 *  perfil ajeno para que ambos se vean idénticos. */
export const StatCard = memo(function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-3 rounded-lg bg-card border border-border">
      <span className="text-2xl-s font-display font-bold text-accent">{value}</span>
      <span className="text-xs-s text-muted text-center leading-tight">{label}</span>
    </div>
  );
});
