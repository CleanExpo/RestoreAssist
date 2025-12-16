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
    try {
      const timestamp = new Date().toISOString()
      let contextStr = ''
      if (context) {
        try {
          contextStr = ` ${JSON.stringify(context)}`
        } catch (e) {
          contextStr = ` [context serialization failed]`
        }
      }
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`
    } catch (e) {
      return `[LOGGER ERROR] ${message}`
    }
  }

  info(message: string, context?: LogContext): void {
    try {
      const formatted = this.formatMessage('info', message, context)
      console.log(formatted)
    } catch (e) {
      console.log(`[LOGGER] ${message}`)
    }
  }

  warn(message: string, context?: LogContext): void {
    try {
      const formatted = this.formatMessage('warn', message, context)
      console.warn(formatted)
    } catch (e) {
      console.warn(`[LOGGER] ${message}`)
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    try {
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
    } catch (e) {
      console.error(`[LOGGER] ${message}`, error)
    }
  }

  debug(message: string, context?: LogContext): void {
    try {
      if (process.env.NODE_ENV === 'development') {
        const formatted = this.formatMessage('debug', message, context)
        console.log(formatted)
      }
    } catch (e) {
      // Silently fail in debug mode
    }
  }

  // API-specific logging methods
  apiRequest(method: string, path: string, userId?: string, context?: LogContext): void {
    try {
      this.info(`API Request: ${method} ${path}`, {
        method,
        path,
        userId: userId || 'anonymous',
        ...context
      })
    } catch (e) {
      // Silently fail - don't break the request
    }
  }

  apiResponse(method: string, path: string, status: number, duration: number, context?: LogContext): void {
    try {
      this.info(`API Response: ${method} ${path} ${status}`, {
        method,
        path,
        status,
        duration: `${duration}ms`,
        ...context
      })
    } catch (e) {
      // Silently fail - don't break the response
    }
  }

  apiError(method: string, path: string, error: Error | unknown, context?: LogContext): void {
    try {
      this.error(`API Error: ${method} ${path}`, error, {
        method,
        path,
        ...context
      })
    } catch (e) {
      console.error(`[LOGGER] API Error: ${method} ${path}`, error)
    }
  }
}

export const logger = new Logger()

