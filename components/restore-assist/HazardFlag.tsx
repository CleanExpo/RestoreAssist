"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type HazardLevel = "critical" | "warning" | "info";

interface HazardFlagProps {
  level: HazardLevel;
  title: string;
  description: string;
  className?: string;
}

const levelConfig = {
  critical: {
    icon: XCircle,
    className: "border-red-600 bg-red-50 text-red-900",
    iconClassName: "text-red-600",
    title: "STOP WORK",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-amber-600 bg-amber-50 text-amber-900",
    iconClassName: "text-amber-600",
    title: "WARNING",
  },
  info: {
    icon: Info,
    className: "border-blue-600 bg-blue-50 text-blue-900",
    iconClassName: "text-blue-600",
    title: "NOTICE",
  },
};

export function HazardFlag({ level, title, description, className }: HazardFlagProps) {
  const config = levelConfig[level];
  const Icon = config.icon;

  return (
    <Alert className={cn("border-2", config.className, className)}>
      <Icon className={cn("h-5 w-5", config.iconClassName)} />
      <AlertTitle className="font-bold text-lg">
        {config.title}: {title}
      </AlertTitle>
      <AlertDescription className="mt-2 text-base">{description}</AlertDescription>
    </Alert>
  );
}

interface HazardListProps {
  hazards: Array<{
    id: string;
    level: HazardLevel;
    title: string;
    description: string;
  }>;
  className?: string;
}

export function HazardList({ hazards, className }: HazardListProps) {
  if (hazards.length === 0) return null;

  // Sort by level: critical first, then warning, then info
  const sortedHazards = [...hazards].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.level] - order[b.level];
  });

  return (
    <div className={cn("space-y-4", className)}>
      {sortedHazards.map((hazard) => (
        <HazardFlag
          key={hazard.id}
          level={hazard.level}
          title={hazard.title}
          description={hazard.description}
        />
      ))}
    </div>
  );
}
