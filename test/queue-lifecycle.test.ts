import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import Connection from '../src/runtime/lib/connection'
import { DEFAULT_QUEUE } from '../src/runtime/lib/enum'
import fs from 'fs'
import path from 'path'

const TEST_DB_PATH = './test/data/queue-lifecycle.sqlite'
let connection: Connection

describe('Queue Lifecycle Tests', () => {
    beforeAll(() => {
        const dir = path.dirname(TEST_DB_PATH)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        connection = new Connection(TEST_DB_PATH)
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

    it('should manage job lifecycle states', async () => {
        const queue = connection.queue(DEFAULT_QUEUE, {})

        // Test job creation
        let completedJob
        queue.enqueue('test', { foo: 'bar' }, {}, (err, job) => {
            expect(err).toBeNull()
            expect(job?.data.status).toBe('queued')
            completedJob = job
        })

        // Test job completion
        completedJob.complete({ result: 'success' }, (err, job) => {
            expect(err).toBeNull()
            expect(job?.data.status).toBe('complete')
        })
    })

    it('should handle job cancellation', async () => {
        const queue = connection.queue(DEFAULT_QUEUE, {})

        let cancelledJob
        queue.enqueue('test', {}, {}, (err, job) => {
            expect(err).toBeNull()
            cancelledJob = job
        })

        cancelledJob.cancel((err, job) => {
            expect(err).toBeNull()
            expect(job?.data.status).toBe('cancelled')
        })
    })

    it('should handle job failures', async () => {
        const queue = connection.queue(DEFAULT_QUEUE, {})

        let failedJob
        queue.enqueue('test', {}, {}, (err, job) => {
            expect(err).toBeNull()
            failedJob = job
        })

        failedJob.fail(new Error('Test error'), (err, job) => {
            expect(err).toBeNull()
            expect(job?.data.status).toBe('failed')
            expect(job?.data.result).toContain('Test error')
        })
    })
})
