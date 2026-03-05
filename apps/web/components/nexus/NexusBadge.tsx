import Link from "next/link"

interface NexusBadgeProps {
  variant?: "inline" | "footer"
  darkMode?: boolean
}

export function NexusBadge({ variant = "inline", darkMode = false }: NexusBadgeProps) {
  const isFooter = variant === "footer"

  return (
    <Link
      href="https://unitehub.com.au"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 transition-colors ${
        isFooter ? "text-sm" : "text-xs"
      } ${
        darkMode
          ? "text-[#C4C8CA] hover:text-[#F4F5F6]"
          : "text-[#5A6A7B] hover:text-[#1C2E47]"
      }`}
      style={{
        fontFamily:
          '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <span className="font-medium">Part of</span>
      <span className={`font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}>
        Unite-Group Nexus
      </span>
    </Link>
  )
}
