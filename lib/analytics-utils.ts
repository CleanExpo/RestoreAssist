/**
 * Analytics Utility Functions
 * Provides calculations for analytics, forecasting, and data transformation
 */

/**
 * Calculate percentage change between two values
 */
export function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

/**
 * Format growth rate for display
 */
export function formatGrowthRate(current: number, previous: number): string {
  const change = calculateGrowthRate(current, previous)
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`
}

/**
 * Simple linear regression for forecasting
 * Returns slope, intercept, and R-squared
 */
export function linearRegression(
  dataPoints: Array<{ x: number; y: number }>
): {
  slope: number
  intercept: number
  rSquared: number
} {
  const n = dataPoints.length
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 }

  const sumX = dataPoints.reduce((sum, p) => sum + p.x, 0)
  const sumY = dataPoints.reduce((sum, p) => sum + p.y, 0)
  const sumXY = dataPoints.reduce((sum, p) => sum + p.x * p.y, 0)
  const sumX2 = dataPoints.reduce((sum, p) => sum + p.x * p.x, 0)

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // Calculate R-squared
  const yMean = sumY / n
  const ssTotal = dataPoints.reduce((sum, p) => sum + Math.pow(p.y - yMean, 2), 0)
  const ssResidual = dataPoints.reduce(
    (sum, p) => sum + Math.pow(p.y - (slope * p.x + intercept), 2),
    0
  )
  const rSquared = ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal

  return { slope, intercept, rSquared }
}

/**
 * Calculate moving average
 */
export function movingAverage(
  data: Array<{ x: number; y: number }>,
  windowSize: number
): Array<{ x: number; y: number }> {
  if (data.length < windowSize) return data

  const result: Array<{ x: number; y: number }> = []

  for (let i = 0; i < data.length; i++) {
    if (i < windowSize - 1) continue

    const window = data.slice(i - windowSize + 1, i + 1)
    const avg = window.reduce((sum, p) => sum + p.y, 0) / windowSize
    result.push({ x: data[i].x, y: avg })
  }

  return result
}

/**
 * Group data by date period
 */
export function groupByDatePeriod(
  data: Array<{
    date: Date
    value: number
  }>,
  period: "day" | "week" | "month"
): Array<{
  date: string
  startDate: Date
  value: number
}> {
  const grouped = new Map<
    string,
    { date: string; startDate: Date; value: number }
  >()

  data.forEach((item) => {
    const d = new Date(item.date)
    let key: string
    let periodDate: Date

    if (period === "day") {
      key = d.toISOString().split("T")[0]
      periodDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    } else if (period === "week") {
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - d.getDay())
      key = weekStart.toISOString().split("T")[0]
      periodDate = weekStart
    } else {
      // month
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      periodDate = new Date(d.getFullYear(), d.getMonth(), 1)
    }

    const existing = grouped.get(key)
    if (existing) {
      grouped.set(key, { ...existing, value: existing.value + item.value })
    } else {
      grouped.set(key, {
        date: key,
        startDate: periodDate,
        value: item.value,
      })
    }
  })

  return Array.from(grouped.values()).sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  )
}

/**
 * Format chart data from database records
 */
export function formatChartData(
  reports: Array<{
    createdAt: Date
    totalCost?: number | null
    hazardType?: string | null
    insuranceType?: string | null
    propertyAddress?: string | null
    status: string
    estimates?: Array<{ totalIncGST?: number | null }> | null
  }>,
  groupBy: "day" | "week" | "month" = "day"
): Array<{
  date: string
  revenue: number
  reportCount: number
}> {
  const grouped = new Map<
    string,
    { date: string; revenue: number; reportCount: number; dateObj: Date }
  >()

  reports.forEach((report) => {
    const d = new Date(report.createdAt)
    let key: string
    let dateObj: Date

    if (groupBy === "day") {
      key = d.toLocaleDateString("en-AU")
      dateObj = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    } else if (groupBy === "week") {
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - d.getDay())
      key = `Week ${Math.ceil((d.getDate() - d.getDay() + 1) / 7)}`
      dateObj = weekStart
    } else {
      // month
      key = d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" })
      dateObj = new Date(d.getFullYear(), d.getMonth(), 1)
    }

    const revenue = report.estimates?.[0]?.totalIncGST || report.totalCost || 0
    const existing = grouped.get(key)

    if (existing) {
      grouped.set(key, {
        ...existing,
        revenue: existing.revenue + revenue,
        reportCount: existing.reportCount + 1,
      })
    } else {
      grouped.set(key, {
        date: key,
        revenue,
        reportCount: 1,
        dateObj,
      })
    }
  })

  return Array.from(grouped.values())
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
    .map(({ dateObj, ...rest }) => rest)
}

/**
 * Aggregate items by field and count
 */
export function aggregateByField<T>(
  items: T[],
  fieldGetter: (item: T) => string | null | undefined,
  valueGetter?: (item: T) => number
): Array<{
  name: string
  count: number
  value?: number
  percentage?: number
}> {
  const aggregated = new Map<
    string,
    { name: string; count: number; value: number }
  >()

  items.forEach((item) => {
    const name = fieldGetter(item) || "Other"
    const value = valueGetter ? valueGetter(item) : 1

    const existing = aggregated.get(name)
    if (existing) {
      aggregated.set(name, {
        ...existing,
        count: existing.count + 1,
        value: existing.value + value,
      })
    } else {
      aggregated.set(name, { name, count: 1, value })
    }
  })

  const total = Array.from(aggregated.values()).reduce((sum, x) => sum + x.count, 0)

  return Array.from(aggregated.values())
    .map((item) => ({
      ...item,
      percentage: (item.count / total) * 100,
    }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Calculate percentiles
 */
export function calculatePercentiles(
  values: number[],
  percentiles: number[] = [50, 75, 95]
): Record<number, number> {
  if (values.length === 0) return {}

  const sorted = [...values].sort((a, b) => a - b)
  const result: Record<number, number> = {}

  percentiles.forEach((p) => {
    const index = (p / 100) * (sorted.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    const weight = index - lower

    if (lower === upper) {
      result[p] = sorted[lower]
    } else {
      result[p] = sorted[lower] * (1 - weight) + sorted[upper] * weight
    }
  })

  return result
}

/**
 * Generate forecast data points
 */
export function generateForecast(
  historicalData: Array<{ x: number; y: number }>,
  daysToForecast: number
): Array<{
  x: number
  y: number
  isProjected: boolean
  confidence: number
}> {
  const regression = linearRegression(historicalData)
  const lastX = historicalData[historicalData.length - 1]?.x || 0
  const lastY = historicalData[historicalData.length - 1]?.y || 0

  const result = [
    ...historicalData.map((p) => ({
      ...p,
      isProjected: false,
      confidence: 1,
    })),
  ]

  // Calculate confidence interval (standard error)
  const residuals = historicalData.map(
    (p) => p.y - (regression.slope * p.x + regression.intercept)
  )
  const rmse = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / historicalData.length)
  const standardError = rmse / Math.sqrt(historicalData.length)

  for (let i = 1; i <= daysToForecast; i++) {
    const x = lastX + i
    const y = regression.slope * x + regression.intercept
    // Confidence decreases as we go further into the future
    const confidence = Math.max(0.3, 1 - i / daysToForecast * 0.5)

    result.push({
      x,
      y: Math.max(0, y), // Prevent negative values
      isProjected: true,
      confidence,
    })
  }

  return result
}

/**
 * Calculate average value safely
 */
export function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Calculate median value
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency = "AUD"): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format number with abbreviations
 */
export function formatNumber(value: number): string {
  if (value >= 1000000) return (value / 1000000).toFixed(1) + "M"
  if (value >= 1000) return (value / 1000).toFixed(1) + "K"
  return value.toFixed(0)
}
