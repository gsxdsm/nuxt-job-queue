import { defineEventHandler, createError } from 'h3'
import { getDefaultJobQueue, getCronJobQueue } from '../../server'

export default defineEventHandler(async (event) => {
    const id = parseInt(event.context.params?.id ?? '')

    if (!id || isNaN(id)) {
        throw createError({
            statusCode: 400,
            message: 'Invalid job ID'
        })
    }

    // Try to delete the job from both queues
    const defaultQueue = getDefaultJobQueue()
    const cronQueue = getCronJobQueue()

    let deleted = false

    // Try default queue first
    try {
        const result = await defaultQueue.removeJob(id)
        if (result.success) {
            deleted = true
        }
    } catch (error) {
        console.error('Error deleting job from default queue:', error)
    }

    // Try cron queue next if not found in default queue
    if (!deleted) {
        try {
            const result = await cronQueue.removeJob(id)

            if (result.success) {
                deleted = true
            }
        } catch (error) {
            console.error('Error deleting job from cron queue:', error)
        }
    }

    if (!deleted) {
        throw createError({
            statusCode: 404,
            message: 'Job not found'
        })
    }

    return { success: true }
})
