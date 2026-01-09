/**
 * Logging Utility Module
 *
 * Simple logging utility for server-side operations
 * Provides structured logging for debugging and monitoring
 */

export const logger = {
  info: (message: string, data?: any) => {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] INFO: ${message}`, data || '')
  },

  warn: (message: string, data?: any) => {
    const timestamp = new Date().toISOString()
    console.warn(`[${timestamp}] WARN: ${message}`, data || '')
  },

  error: (message: string, data?: any) => {
    const timestamp = new Date().toISOString()
    console.error(`[${timestamp}] ERROR: ${message}`, data || '')
  },

  debug: (message: string, data?: any) => {
    if (process.env.DEBUG === 'true') {
      const timestamp = new Date().toISOString()
      console.log(`[${timestamp}] DEBUG: ${message}`, data || '')
    }
  }
}
