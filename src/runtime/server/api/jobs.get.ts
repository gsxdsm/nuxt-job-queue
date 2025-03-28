import { defineEventHandler } from 'h3'
import { getDefaultJobQueue, getCronJobQueue } from '../../server'
import type Job from '../../lib/job'

export default defineEventHandler(async () => {
    const defaultQueue = getDefaultJobQueue()
    const cronQueue = getCronJobQueue()

    // Get all jobs from all possible statuses
    const jobStatuses = ['queued', 'dequeued', 'complete', 'failed', 'cancelled']
    // Get jobs from default queue
    let defaultJobs: Job[] = [] // Explicitly typed as Job[]
    for (const status of jobStatuses) {
        defaultJobs = defaultJobs.concat(await defaultQueue.getJobsWithStatus(status) as Job[])
    }

    // Get jobs from cron queue
    let cronJobs: Job[] = []
    for (const status of jobStatuses) {
        cronJobs = cronJobs.concat(await cronQueue.getJobsWithStatus(status) as unknown as Job[])
    }

    const transformedJobs = [...defaultJobs, ...cronJobs].map(job => ({
        id: job.data.id,
        name: job.data.name,
        queue: job.data.queue,
        status: job.data.status,
        created_at: job.data.enqueued,
        updated_at: job.data.ended || job.data.dequeued,
        params: job.data.params,
        result: job.data.result,
        priority: job.data.priority,
        cron: job.data.cron,
        delay: job.data.delay,
        timeout: job.data.timeout,
        retry: job.data.retry
    }))

    return {
        jobs: transformedJobs,
        count: transformedJobs.length
    }
})
