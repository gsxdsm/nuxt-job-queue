import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Connection from '../src/runtime/lib/connection'
import { DEFAULT_QUEUE } from '../src/runtime/lib/enum'
import { createQueues, createJobHandler, createWorker } from '../src/runtime/server'
import fs from 'fs'
import { createDatabase } from "db0"
import sqlite from "db0/connectors/better-sqlite3"

const TEST_DB_PATH = './test/data/timeout-test.sqlite'
let jobDbConnection: Connection
const db = createDatabase(sqlite({ path: TEST_DB_PATH }))

describe('Job Timeout Tests', () => {
    beforeAll(() => {
        jobDbConnection = new Connection(db)
        createQueues(jobDbConnection)
    })

    afterAll(() => {
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH)
        }
        if (fs.existsSync(`${TEST_DB_PATH}-shm`)) {
            fs.unlinkSync(`${TEST_DB_PATH}-shm`)
        }
        if (fs.existsSync(`${TEST_DB_PATH}-wal`)) {
            fs.unlinkSync(`${TEST_DB_PATH}-wal`)
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

        let failedJob: any = null
        const worker = createWorker(jobDbConnection, [{ id: 'test', module: testModule.test }], DEFAULT_QUEUE, true, 100, 0)

        worker.on('failed', (data) => {
            failedJob = data
        })

        const job = createJobHandler<typeof testModule>({ timeout: 500 })
        await job.test.longRunningJob()


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

        let timeoutError = false
        const worker = createWorker(jobDbConnection, [{ id: 'test', module: testModule.test }], DEFAULT_QUEUE, true, 100, 0)

        worker.on('failed', (data) => {
            if (data.result.includes('timeout')) {
                timeoutError = true
            }
        })

        const job = createJobHandler<typeof testModule>({ timeout: '1s' })
        await job.test.delayedTimeoutJob()


        await new Promise(r => setTimeout(r, 1500))
        expect(timeoutError).toBe(true)
    })
})
