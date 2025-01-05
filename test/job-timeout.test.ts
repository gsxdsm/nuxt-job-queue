import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Connection from '../src/runtime/lib/connection'
import { DEFAULT_QUEUE } from '../src/runtime/lib/enum'
import { createQueues, createJobHandler, createWorker } from '../src/runtime/server'
import fs from 'fs'
import path from 'path'

const TEST_DB_PATH = './test/data/timeout-test.sqlite'
let jobDbConnection: Connection

describe('Job Timeout Tests', () => {
    beforeAll(() => {
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

    it('should timeout long-running jobs', async () => {
        const testModule = {
            test: {
                longRunningJob: async () => {
                    await new Promise(r => setTimeout(r, 2000))
                    return 'completed'
                }
            }
        }

        const job = createJobHandler<typeof testModule>({ timeout: 1000 })
        await job.test.longRunningJob()

        let failedJob: any = null
        const worker = createWorker(jobDbConnection, [{ id: 'test', module: testModule }], DEFAULT_QUEUE, true, 100, 0)

        worker.on('failed', (data) => {
            failedJob = data
        })

        await new Promise(r => setTimeout(r, 1500))
        expect(failedJob).not.toBeNull()
        expect(failedJob.result).toContain('timeout')
    })

    it('should handle string timeout values', async () => {
        const testModule = {
            test: {
                delayedTimeoutJob: async () => {
                    await new Promise(r => setTimeout(r, 3000))
                }
            }
        }

        const job = createJobHandler<typeof testModule>({ timeout: '2s' })
        await job.test.delayedTimeoutJob()

        let timeoutError = false
        const worker = createWorker(jobDbConnection, [{ id: 'test', module: testModule }], DEFAULT_QUEUE, true, 100, 0)

        worker.on('failed', (data) => {
            if (data.result.includes('timeout')) {
                timeoutError = true
            }
        })

        await new Promise(r => setTimeout(r, 2500))
        expect(timeoutError).toBe(true)
    })
})
