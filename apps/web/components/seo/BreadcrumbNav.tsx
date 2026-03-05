import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { JsonLd } from './JsonLd'
import { breadcrumbSchema } from './schemas'

interface BreadcrumbItem {
  name: string
  url: string
}

interface BreadcrumbNavProps {
  items: BreadcrumbItem[]
  className?: string
}

export function BreadcrumbNav({ items, className }: BreadcrumbNavProps) {
  const siteUrl = 'https://restoreassist.com.au'
  const schemaItems = items.map((item) => ({
    name: item.name,
    url: item.url.startsWith('http') ? item.url : `${siteUrl}${item.url}`,
  }))

  return (
    <>
      <JsonLd data={breadcrumbSchema(schemaItems)} />
      <nav aria-label="Breadcrumb" className={className}>
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {items.map((item, index) => {
            const isLast = index === items.length - 1
            return (
              <li key={item.url} className="inline-flex items-center gap-1.5">
                {index > 0 && (
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                )}
                {isLast ? (
                  <span className="font-normal text-foreground" aria-current="page">
                    {item.name}
                  </span>
                ) : (
                  <Link
                    href={item.url}
                    className="hover:text-foreground transition-colors"
                  >
                    {item.name}
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
    </>
  )
}
