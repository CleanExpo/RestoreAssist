/**
 * Cron Job: Cleanup Expired Files from Cloudinary
 *
 * Removes files that have exceeded their TTL (time to live).
 * Checks the context metadata for expiry dates and deletes expired files.
 *
 * Schedule: Runs daily at 2:00 AM
 */

import { getFilesByTag, deleteFile } from '@/lib/cloudinary'

export async function cleanupExpiredFiles() {
  console.log('[Cron] Starting expired files cleanup...')

  const stats = {
    checked: 0,
    deleted: 0,
    errors: 0,
    skipped: 0
  }

  // Tags for temporary files that may have TTL
  const temporaryTags = ['temporary', 'export', 'attachment', 'preview']

  try {
    for (const tag of temporaryTags) {
      try {
        // Get all files with this tag
        const files = await getFilesByTag(tag, 'raw')

        for (const file of files) {
          stats.checked++

          // Check if file has TTL context
          if (file.context && file.context.custom) {
            const context = file.context.custom
            const expiresAt = context.expires_at

            if (expiresAt) {
              const expiryDate = new Date(expiresAt)
              const now = new Date()

              // If file has expired, delete it
              if (now > expiryDate) {
                try {
                  console.log(`[Cron] Deleting expired file: ${file.publicId} (expired: ${expiresAt})`)
                  await deleteFile(file.publicId, 'raw')
                  stats.deleted++
                } catch (deleteError) {
                  console.error(`[Cron] Error deleting file ${file.publicId}:`, deleteError)
                  stats.errors++
                }
              } else {
                stats.skipped++
              }
            } else {
              // No expiry date - skip
              stats.skipped++
            }
          } else {
            // No context - skip
            stats.skipped++
          }
        }
      } catch (tagError) {
        console.error(`[Cron] Error processing tag "${tag}":`, tagError)
        stats.errors++
      }
    }

    console.log('[Cron] Expired files cleanup completed:', stats)

    return {
      success: true,
      stats
    }
  } catch (error) {
    console.error('[Cron] Fatal error in cleanup job:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stats
    }
  }
}

/**
 * Cleanup old files by age (for files without TTL)
 * @param daysOld - Delete files older than this many days
 * @param tags - Tags to filter by
 */
export async function cleanupOldFiles(daysOld: number = 90, tags: string[] = ['temporary']) {
  console.log(`[Cron] Starting old files cleanup (${daysOld}+ days)...`)

  const stats = {
    checked: 0,
    deleted: 0,
    errors: 0,
    skipped: 0
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)

  try {
    for (const tag of tags) {
      try {
        const files = await getFilesByTag(tag, 'raw')

        for (const file of files) {
          stats.checked++

          const createdDate = new Date(file.createdAt)

          if (createdDate < cutoffDate) {
            try {
              console.log(`[Cron] Deleting old file: ${file.publicId} (created: ${file.createdAt})`)
              await deleteFile(file.publicId, 'raw')
              stats.deleted++
            } catch (deleteError) {
              console.error(`[Cron] Error deleting file ${file.publicId}:`, deleteError)
              stats.errors++
            }
          } else {
            stats.skipped++
          }
        }
      } catch (tagError) {
        console.error(`[Cron] Error processing tag "${tag}":`, tagError)
        stats.errors++
      }
    }

    console.log(`[Cron] Old files cleanup completed (${daysOld}+ days):`, stats)

    return {
      success: true,
      stats
    }
  } catch (error) {
    console.error('[Cron] Fatal error in old files cleanup:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stats
    }
  }
}
