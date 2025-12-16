/**
 * Production-ready logger for Digital Ocean
 * Ensures logs are visible in production environment
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogContext {
  [key: string]: any
}

class Logger {
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const contextStr = context ? ` ${JSON.stringify(context)}` : ''
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`
  }

  info(message: string, context?: LogContext): void {
    const formatted = this.formatMessage('info', message, context)
    console.log(formatted)
  }

  warn(message: string, context?: LogContext): void {
    const formatted = this.formatMessage('warn', message, context)
    console.warn(formatted)
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = {
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : String(error)
    }
    const formatted = this.formatMessage('error', message, errorContext)
    console.error(formatted)
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      const formatted = this.formatMessage('debug', message, context)
      console.log(formatted)
    }
  }

  // API-specific logging methods
  apiRequest(method: string, path: string, userId?: string, context?: LogContext): void {
    this.info(`API Request: ${method} ${path}`, {
      method,
      path,
      userId: userId || 'anonymous',
      ...context
    })
  }

  apiResponse(method: string, path: string, status: number, duration: number, context?: LogContext): void {
    this.info(`API Response: ${method} ${path} ${status}`, {
      method,
      path,
      status,
      duration: `${duration}ms`,
      ...context
    })
  }

  apiError(method: string, path: string, error: Error | unknown, context?: LogContext): void {
    this.error(`API Error: ${method} ${path}`, error, {
      method,
      path,
      ...context
    })
  }
}

export const logger = new Logger()

