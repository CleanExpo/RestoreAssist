interface LogoProps {
  size?: number;
  variant?: 'full' | 'icon';
  className?: string;
}

export function Logo({ size = 120, variant = 'full', className = '' }: LogoProps) {
  // Increase size by 30% twice (1.3 * 1.3 = 1.69, so 69% larger total)
  const adjustedSize = Math.round(size * 1.69);

  return (
    <img
      src="/assets/logo.png"
      alt="RestoreAssist - Restoration Intelligence"
      className={`rounded-full object-cover ${className}`}
      style={{
        width: adjustedSize,
        height: adjustedSize,
        backgroundColor: 'transparent'
      }}
    />
  );
}

// Compact horizontal logo for navigation
export function LogoCompact({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Logo size={40} variant="icon" />
      <div className="flex flex-col">
        <span className="text-sm font-bold text-primary leading-tight tracking-wide">
          RestoreAssist
        </span>
        <span className="text-xs font-semibold text-muted-foreground leading-tight tracking-wide">
          RESTORATION INTELLIGENCE
        </span>
      </div>
    </div>
  );
}

// Simple text-only logo
export function LogoText({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xl font-bold text-primary">RestoreAssist</span>
      <div className="h-6 w-px bg-border" />
      <span className="text-sm text-muted-foreground">Restoration Intelligence</span>
    </div>
  );
}
