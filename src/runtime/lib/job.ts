//Based off of https://github.com/sinkhaha/node-sqlite-queue
import { EventEmitter } from 'events'

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

    db: any
    table: string
    data: JobData

    constructor(db: any, table: string, data?: JobData) {
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


    enqueue(callback: (err: Error | null, job?: Job) => void) {
        if (this.data.delay === undefined) {
            this.data.delay = Date.now()
        }

        if (this.data.priority === undefined) {
            this.data.priority = 0
        }

        this.data.status = Job.QUEUED
        this.data.enqueued = Date.now()

        this.save(callback)
    }

    save(callback: (err: Error | null, job?: Job) => void) {
        const self = this

        if (this.data.cron) {
            //if we have a cron, try to find existing entry
            const selectSql = `SELECT id FROM ${this.table} WHERE name = ? AND params = ? AND queue = ?`
            const stmt = this.db.prepare(selectSql)
            const row = stmt.get(this.data.name, JSON.stringify(this.data.params), this.data.queue)
            if (row) {
                this.data.id = row.id
            }
        }


        // If there is an id, update; if not, insert
        const insertOrUpdateSql = `INSERT OR REPLACE INTO ${this.table} (id, name, params, queue, retry, ` +
            ` timeout, delay, cron, priority, status, enqueued,dequeued,ended,result) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`

        const { id, name, params = '', queue, retry, timeout, delay, cron, priority, status, enqueued, dequeued, ended, result } = this.data
        const values = [id, name, typeof params === 'object' ? JSON.stringify(params) : params, queue, typeof retry == 'object' ? JSON.stringify(retry) : retry, timeout, delay, cron, priority, status, enqueued, dequeued, ended, result]

        const stmt = this.db.prepare(insertOrUpdateSql)
        const lastId = stmt.run(values)

        if (self.data.id == undefined && lastId) {
            self.data.id = lastId
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