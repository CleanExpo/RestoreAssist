interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
};

export function Logo({ className = '', size = 'md' }: LogoProps) {
  return (
    <img
      src="/assets/logo.png"
      alt="RestoreAssist - Restoration Intelligence"
      className={`${sizeMap[size]} object-contain ${className}`}
    />
  );
}
