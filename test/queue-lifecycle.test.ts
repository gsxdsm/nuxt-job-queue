import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import Connection from '../src/runtime/lib/connection'
import { DEFAULT_QUEUE } from '../src/runtime/lib/enum'
import fs from 'fs'
import { createDatabase } from "db0"
import sqlite from "db0/connectors/better-sqlite3"

const TEST_DB_PATH = './test/data/queue-lifecycle.sqlite'
let connection: Connection
const db = createDatabase(sqlite({ path: TEST_DB_PATH }))

describe('Queue Lifecycle Tests', () => {
    beforeAll(() => {
        connection = new Connection(db)
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
        await queue.enqueue('test', { foo: 'bar' }, {}, (err, job) => {
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
        await queue.enqueue('test', {}, {}, (err, job) => {
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
        await queue.enqueue('test', {}, {}, (err, job) => {
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
