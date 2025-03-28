import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Connection from '../src/runtime/lib/connection'
import { DEFAULT_QUEUE } from '../src/runtime/lib/enum'
import { createQueues, createJobHandler, createWorker } from '../src/runtime/server'
import fs from 'fs'
import { createDatabase } from "db0"
import sqlite from "db0/connectors/node-sqlite"

const TEST_DB_PATH = './test/data/retry-test.sqlite'
let jobDbConnection: Connection
const db = createDatabase(sqlite({ path: TEST_DB_PATH }))

describe('Retry Strategy Tests', () => {
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

    it('should use linear retry strategy', async () => {
        const retryTimes: number[] = []
        const testModule = {
            test: {
                linearRetryJob: () => {
                    retryTimes.push(Date.now())
                    throw new Error('Forced failure')
                }
            }
        }

        createWorker(jobDbConnection, [{ id: 'test', module: testModule.test }], DEFAULT_QUEUE, true, 100, 0)

        const job = createJobHandler<typeof testModule>({
            retry: {
                count: 3,
                delay: 500,
                strategy: 'linear'
            }
        })
        await job.test.linearRetryJob()


        await new Promise(r => setTimeout(r, 2000))

        // Check intervals between retries are roughly equal
        const intervals = retryTimes.slice(1).map((time, i) => time - retryTimes[i])
        const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length

        intervals.forEach(interval => {
            expect(Math.abs(interval - avgInterval)).toBeLessThan(200) // Allow 200ms variance
        })
    })

    it('should use exponential retry strategy', async () => {
        const retryTimes: number[] = []
        const testModule = {
            test: {
                expRetryJob: () => {
                    retryTimes.push(Date.now())
                    throw new Error('Forced failure')
                }
            }
        }

        createWorker(jobDbConnection, [{ id: 'test', module: testModule.test }], DEFAULT_QUEUE, true, 100, 0)

        const job = createJobHandler<typeof testModule>({
            retry: {
                count: 3,
                delay: 200,
                strategy: 'exponential'
            }
        })
        await job.test.expRetryJob()

        await new Promise(r => setTimeout(r, 2000))

        const intervals = retryTimes.slice(1).map((time, i) => time - retryTimes[i])
        // Each retry should take progressively longer
        expect(intervals[1]).toBeGreaterThan(intervals[0])
        expect(intervals[2]).toBeGreaterThan(intervals[1])
    })
})
