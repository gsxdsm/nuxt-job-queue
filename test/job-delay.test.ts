import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Connection from '../src/runtime/lib/connection'
import { DEFAULT_QUEUE } from '../src/runtime/lib/enum'
import { createQueues, createJobHandler, createWorker } from '../src/runtime/server'
import fs from 'fs'
import path from 'path'

const TEST_DB_PATH = './test/data/delay-test.sqlite'
let jobDbConnection: Connection

describe('Delayed Job Tests', () => {
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
        if (fs.existsSync(`${TEST_DB_PATH}-shm`)) {
            fs.unlinkSync(`${TEST_DB_PATH}-shm`)
        }
        if (fs.existsSync(`${TEST_DB_PATH}-wal`)) {
            fs.unlinkSync(`${TEST_DB_PATH}-wal`)
        }
    })

    it('should respect numeric delay values', async () => {
        const executionTimes: number[] = []
        const testModule = {
            test: {
                delayedJob: () => {
                    executionTimes.push(Date.now())
                }
            }
        }

        createWorker(jobDbConnection, [{ id: 'test', module: testModule.test }], DEFAULT_QUEUE, true, 100, 0)
        const startTime = Date.now()
        const job = createJobHandler<typeof testModule>({ delay: 1000 })
        await job.test.delayedJob()

        await new Promise(r => setTimeout(r, 2000))
        expect(executionTimes[0]).toBeGreaterThan(startTime + 900) // Allow small margin
    })

    it('should handle string delay formats', async () => {
        const executed: boolean[] = []
        const testModule = {
            test: {
                stringDelayJob: () => {
                    executed.push(true)
                }
            }
        }

        createWorker(jobDbConnection, [{ id: 'test', module: testModule.test }], DEFAULT_QUEUE, true, 100, 0)

        const job = createJobHandler<typeof testModule>({ delay: '2s' })
        await job.test.stringDelayJob()

        await new Promise(r => setTimeout(r, 1000))
        expect(executed.length).toBe(0)

        await new Promise(r => setTimeout(r, 2200))
        expect(executed.length).toBe(1)
    })

    it('should handle a future date delay', async () => {
        const executed: boolean[] = []
        const testModule = {
            test: {
                dateDelayJob: () => {
                    executed.push(true)
                }
            }
        }
        createWorker(jobDbConnection, [{ id: 'test', module: testModule.test }], DEFAULT_QUEUE, true, 100, 0)
        const futureDate = new Date(Date.now() + 3000) // 3 seconds from now
        const job = createJobHandler<typeof testModule>({ delay: futureDate })
        await job.test.dateDelayJob()

        // Job should not execute before futureDate
        await new Promise(r => setTimeout(r, 1500))
        expect(executed.length).toBe(0)

        // After futureDate passes
        await new Promise(r => setTimeout(r, 2000))
        expect(executed.length).toBe(1)
    })
})
