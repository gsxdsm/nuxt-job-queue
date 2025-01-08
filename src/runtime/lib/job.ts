//Based off of https://github.com/sinkhaha/node-sqlite-queue
import { EventEmitter } from 'events'
import { type Database, type Primitive } from "db0"

/**
 * @property {number} [count] - The number of times to retry the job if it fails.
 * @property {number | string} [delay] - The delay between retries, can be a number (milliseconds) or a string (e.g., '5m' for 5 minutes).
 * @property {'linear' | 'exponential'} [strategy] - The strategy for retrying the job, either 'linear' or 'exponential'.
 */

export interface Retry {
    count?: number
    delay?: number | string
    strategy?: 'linear' | 'exponential'
}

/**
 * @property {string} [cron] - A cron expression that defines the schedule for the job.
 * @property {number | string} [delay] - The delay before the job is executed, can be a number (milliseconds), a string (e.g., '5m' for 5 minutes), or a Date in the future.
 * @property {number} [timeout] - The maximum time allowed for the job to complete, can be a number (milliseconds) or a string (e.g., '5m' for 5 minutes).
 * @property {number} [priority] - The priority of the job, with higher numbers indicating higher priority.
 * @property {Object} [retry] - Configuration for retrying the job if it fails.
 * @property {number} [retry.count] - The number of times to retry the job if it fails.
 * @property {number | string} [retry.delay] - The delay between retries, can be a number (milliseconds) or a string (e.g., '5m' for 5 minutes).
 * @property {'linear' | 'exponential'} [retry.strategy] - The strategy for retrying the job, either 'linear' or 'exponential'.
 */

export interface JobOptions {
    cron?: string
    delay?: number | string | Date
    timeout?: number | string
    priority?: number
    retry?: Retry
}

interface JobData {
    id?: number
    name?: string
    params?: any
    queue?: string
    retry?: any
    timeout?: number
    delay?: number
    priority?: number
    status?: string
    enqueued?: number
    dequeued?: number
    ended?: number
    result?: any
    cron?: string
}

export default class Job extends EventEmitter {
    static QUEUED = 'queued'
    static DEQUEUED = 'dequeued'
    static COMPLETE = 'complete'
    static FAILED = 'failed'
    static CANCELLED = 'cancelled'

    db: Database
    table: string
    data: JobData

    constructor(db: Database, table: string, data?: JobData) {
        super()

        this.db = db
        this.table = table

        if (data) {
            // Convert plain object to JobData type
            Object.setPrototypeOf(data, JobData.prototype)
            this.data = data
        } else {
            this.data = new JobData()
        }
    }


    async enqueue(callback: (err: Error | null, job?: Job) => void) {
        if (this.data.delay === undefined) {
            this.data.delay = Date.now()
        }

        if (this.data.priority === undefined) {
            this.data.priority = 0
        }

        this.data.status = Job.QUEUED
        this.data.enqueued = Date.now()

        await this.save(callback)
    }

    async save(callback: (err: Error | null, job?: Job) => void) {
        const self = this

        if (this.data.cron) {
            //if we have a cron, try to find existing entry
            const selectSql = `SELECT id FROM ${this.table} WHERE name = ? AND params = ? AND queue = ?`
            const stmt = this.db.prepare(selectSql)
            const row = await stmt.get(this.data.name, JSON.stringify(this.data.params), this.data.queue) as { id?: number }
            if (row) {
                this.data.id = row.id
            }
        }

        // If there is an id, update; if not, insert
        const insertOrUpdateSql = `INSERT OR REPLACE INTO ${this.table} (id, name, params, queue, retry, ` +
            ` timeout, delay, cron, priority, status, enqueued,dequeued,ended,result) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) Returning RowId`

        const { id, name, params = '', queue, retry, timeout, delay, cron, priority, status, enqueued, dequeued, ended, result } = this.data
        const values: Primitive[] = [id, name, typeof params === 'object' ? JSON.stringify(params) : params, queue, typeof retry == 'object' ? JSON.stringify(retry) : retry, timeout, delay, cron, priority, status, enqueued, dequeued, ended, result]

        const stmt = this.db.prepare(insertOrUpdateSql)
        const lastId = await stmt.get(...values) as { id?: number }

        if (self.data.id == undefined && lastId) {
            self.data.id = lastId.id
        }

        callback && callback(null, self)
    }


    cancel(callback: (err: Error | null, job?: Job) => void) {
        if (this.data.status !== Job.QUEUED) {
            return callback(new Error('Only queued jobs may be cancelled'))
        }

        this.data.status = Job.CANCELLED
        this.data.ended = Date.now()

        this.save(callback)
    }


    complete(result: any, callback: (err: Error | null, job?: Job) => void) {
        this.data.status = Job.COMPLETE
        this.data.ended = Date.now()
        this.data.result = typeof result === 'object' ? JSON.stringify(result) : result

        this.save(callback)
    }

    fail(err: Error, callback: (err: Error | null, job?: Job) => void) {
        this.data.status = Job.FAILED
        this.data.ended = Date.now()

        const errRst = {
            message: err.message || '',
            stack: err.stack || ''
        }
        this.data.result = JSON.stringify(errRst)

        this.save(callback)
    }

    delay(delay: number, callback: (err: Error | null, job?: Job) => void) {
        this.data.delay = Date.now() + delay

        this.enqueue(callback)
    }
}

class JobData { }