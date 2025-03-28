import { defineEventHandler, createError } from 'h3'
import { getDefaultJobQueue, getCronJobQueue } from '../../server'

export default defineEventHandler(async (event) => {
    const id = parseInt(event.context.params?.id || '')

    if (!id || isNaN(id)) {
        throw createError({
            statusCode: 400,
            message: 'Invalid job ID'
        })
    }

    // Try to reset the job in both queues
    const defaultQueue = getDefaultJobQueue()
    const cronQueue = getCronJobQueue()

    // Try default queue first
    try {
        const result = await defaultQueue.retryFailedJob(id)
        if (result) {
            return result
        }
    } catch (error) {
        console.error('Error retrying job in default queue:', error)
    }

    // Try cron queue next
    try {
        const result = await cronQueue.retryFailedJob(id)
        if (result) {
            return result
        }
    } catch (error) {
        console.error('Error retrying job in cron queue:', error)
    }

    throw createError({
        statusCode: 404,
        message: 'Failed job not found or could not be retried'
    })
})


