import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Connection from '../src/runtime/lib/connection'
import { DEFAULT_QUEUE, CRON_QUEUE, EVERY } from '../src/runtime/lib/enum'
import { createQueues, createJobHandler, createWorker, getDefaultJobQueue, getCronJobQueue } from '../src/runtime/server'
import fs from 'fs'
import path from 'path'

let jobDbConnection: Connection
const TEST_DB_PATH = './test/data/job-queue-test.sqlite'
describe('Job Queue Tests', async () => {
    beforeAll(async () => {
        // Setup test database
        const dir = path.dirname(TEST_DB_PATH)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        jobDbConnection = new Connection(TEST_DB_PATH)
        createQueues(jobDbConnection)
    })

    afterAll(() => {
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH)
        }
    })

    it('should create default and cron queues', async () => {
        expect(getDefaultJobQueue()).toBeDefined()
        expect(getCronJobQueue()).toBeDefined()
    })

    it('should enqueue and process a basic job', async () => {
        let jobCompleted = false
        const testModule = {
            test: {
                testJob: () => {
                    jobCompleted = true
                }
            }
        }

        createWorker(jobDbConnection, [{ id: 'test', module: testModule.test }], DEFAULT_QUEUE, true, 100, 0)

        const job = createJobHandler<typeof testModule>({})
        await job.test.testJob()


        // Wait for job to complete
        await new Promise(r => setTimeout(r, 1000))
        expect(jobCompleted).toBe(true)
    })

    it('should handle job failures and retries', async () => {
        let attempts = 0
        const testModule = {
            test: {
                failingJob: () => {
                    attempts++
                    throw new Error('Job failed')
                }
            }
        }

        const job = createJobHandler<typeof testModule>({
            retry: {
                count: 3,
                delay: 500,
                strategy: 'linear'
            }
        })
        await job.test.failingJob()

        createWorker(jobDbConnection, [{ id: 'test', module: testModule.test }], DEFAULT_QUEUE, true, 100, 0)

        // Wait for retries
        await new Promise(r => setTimeout(r, 5000))
        expect(attempts).toBe(3)
    })

    it('should schedule and execute cron jobs', async () => {
        let cronExecutions = 0
        const testModule = {
            test: {
                scheduleCronJob: () => {
                    cronExecutions++
                }
            }
        }

        const job = createJobHandler<typeof testModule>({
            cron: EVERY.SECOND
        })
        await job.test.scheduleCronJob()

        createWorker(jobDbConnection, [{ id: 'test', module: testModule.test }], CRON_QUEUE, true, 100, 0)

        // Wait for multiple cron executions
        await new Promise(r => setTimeout(r, 2500))
        expect(cronExecutions).toBeGreaterThan(1)
    })

    it('should respect job priorities', async () => {
        const executionOrder: number[] = []
        const testModule = {
            test: {
                priorityJob: (priority: number) => {
                    executionOrder.push(priority)
                }
            }
        }

        // Create jobs with different priorities
        const job = createJobHandler<typeof testModule>({ priority: 1 })
        await job.test.priorityJob(1)

        const highPriorityJob = createJobHandler<typeof testModule>({ priority: 0 })
        await highPriorityJob.test.priorityJob(0)

        createWorker(jobDbConnection, [{ id: 'test', module: testModule.test }], DEFAULT_QUEUE, true, 100, 0)

        // Wait for jobs to complete
        await new Promise(r => setTimeout(r, 500))
        expect(executionOrder).toEqual([0, 1])
    })
})
