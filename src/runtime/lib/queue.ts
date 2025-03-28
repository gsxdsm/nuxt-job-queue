//Based off of https://github.com/sinkhaha/node-sqlite-queue
import { Cron } from 'Croner'
import Job, { type JobOptions } from './job'
import { parseTimeout, parseRetry, parseDelay } from './utils'
import { TABLE_NAME } from './enum'
import { type Database } from "db0"
export interface QueueOptions {
    table?: string
    universal?: boolean
    index?: boolean
    minPriority?: number
    callbacks?: Record<string, any>
}

export default class Queue {
    name: string
    options: QueueOptions
    connection: any
    db: Database
    table: string

    constructor(
        connection: any,
        name: string | undefined = 'default',
        options?: QueueOptions
    ) {
        if (typeof name === 'object' && options === undefined) {
            options = name
            name = undefined
        }

        options || (options = {})
        options.table || (options.table = TABLE_NAME)
        options.universal || (options.universal = false)

        this.name = name || 'default'
        this.options = options

        this.connection = connection
        this.db = this.connection.db
        this.table = options.table

        // Create job table
        const createTableSql = `CREATE TABLE IF NOT EXISTS ${this.table} (id INTEGER PRIMARY KEY ASC AUTOINCREMENT,` +
            `name TEXT,params TEXT,queue TEXT,retry TEXT,timeout INT,delay TIMESTAMP,cron TEXT,` +
            `priority INT,status TEXT,enqueued TIMESTAMP,dequeued TIMESTAMP,ended TIMESTAMP, ` +
            `result TEXT,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,` +
            `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP); `

        this.db.exec(createTableSql)

        // If the index does not exist, create index
        if (options.index !== false) {
            const indexName = 'status_queue_priority'
            const queryIndexSql = `SELECT * FROM sqlite_master WHERE type = 'index' and name = '${indexName}';`
            const createIndexSql = `CREATE INDEX ${indexName} on ${this.table} (status, queue, priority);`

            const stmt = this.db.prepare(queryIndexSql)
            const row = stmt.get()
            if (!row) {
                this.db.exec(createIndexSql)
            }

        }
    }

    async enqueue(
        name: string,
        params: any,
        options: JobOptions,
        callback: (err: Error | null, job?: Job) => void
    ): Promise<void> {
        if (!callback && typeof options === 'function') {
            if (typeof options === 'function') {
                callback = options
                options = {}
            }
            options = {}
        }

        const job = this.job({
            name: name,
            params: params,
            queue: this.name,
            retry: parseRetry(options.retry),
            timeout: parseTimeout(options.timeout),
            delay: Date.now() + parseDelay(options.delay),
            priority: options.priority,
            cron: options.cron,
        })

        await job.enqueue(callback)
    }

    async dequeue(
        options: QueueOptions,
        callback: (err?: Error | null | undefined, job?: Job) => void
    ) {
        const self = this
        try {
            if (callback === undefined) {
                if (typeof options === 'function') {
                    callback = options
                    options = {}
                } else {
                    callback = () => { }
                }
            }

            // Find all tasks
            let querySql = `select * from ${this.table} where status = '${Job.QUEUED}' and delay <= ${Date.now()}`
            if (!this.options.universal) {
                querySql += ` and queue = '${this.name}'`
            }
            if (options.minPriority !== undefined) {
                querySql += ` and priority >= ${options.minPriority}`
            }
            if (options.callbacks !== undefined) {
                const callback_names = Object.keys(options.callbacks)

                const names = callback_names.map((name) => `'${name}'`).join(', ')
                querySql += ` and name in (${names})`
            }
            querySql += ` ORDER BY priority DESC, id ASC LIMIT 1;`

            const stmt = this.db.prepare(querySql)
            const row = await stmt.get() as { id?: number; cron?: string }
            if (row === undefined || row === null) {
                return callback()
            }

            const id = row.id
            if (!id) {
                return callback()
            }
            if (row.cron && row.cron !== '') {
                const cron = new Cron(row.cron)
                const nextRun = cron.nextRun()
                if (nextRun) {
                    const updateSql = `update ${this.table} set delay = ${nextRun.getTime()} where id = ${id} `
                    await this.db.exec(updateSql)
                    this.deserializeJobData(row)
                    callback(null, self.job(Object.assign(row, { nextRun })))
                } else {
                    throw new Error('Invalid cron expression')
                }
            } else {
                const newStatus = Job.DEQUEUED
                const dequeued = Date.now()
                const updateSql = `update ${this.table} set status = '${newStatus}', dequeued=${dequeued} where id = ${id} `

                await this.db.exec(updateSql)
                this.deserializeJobData(row)
                callback(null, self.job(Object.assign(row, { status: newStatus, dequeued })))
            }


        } catch (err) {
            callback(err as Error)
        }
    }

    private deserializeJobData(row: any) {
        if (row.params && typeof row.params === 'string') {
            row.params = JSON.parse(row.params)
        }
        if (row.retry && typeof row.retry === 'string') {
            row.retry = JSON.parse(row.retry)
        }
    }

    async get(
        id: number,
        callback: (err?: Error, job?: Job) => void
    ): Promise<void> {
        try {
            const self = this

            let querySql = `select * from ${this.table} where id = ${id}`
            if (!this.options.universal) {
                querySql += ` queue = '${this.name}'`
            }
            const stmt = this.db.prepare(querySql)
            const rows = await stmt.all() as any[]

            rows.map((row: any) => {
                const job = new Job(self.db, self.table, row)
                callback(undefined, job)
            })
        } catch (err) {
            callback(err as Error)
        }
        return Promise.resolve()
    }

    job(data: any): Job {
        return new Job(this.db, this.table, data)
    }

    async removeAllCronJobs(): Promise<{ success: boolean }> {
        try {
            const stmt = this.db.prepare(`DELETE FROM ${this.table} WHERE cron IS NOT NULL`)
            return await stmt.run()
        } catch (e) {
            console.log(e)
            return { success: false }
        }
    }

    async removeJob(id: number): Promise<{ success: boolean }> {
        try {
            const stmt = this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`)
            return await stmt.run(id)
        } catch (e) {
            console.log(e)
            return { success: false }
        }
    }

    async removeCronJobNamed(name: string): Promise<void> {
        const stmt = this.db.prepare(`DELETE FROM ${this.table} WHERE name = ? AND cron IS NOT NULL`)
        await stmt.run(name)
    }

    async removeJobsNamed(name: string): Promise<void> {
        const stmt = this.db.prepare(`DELETE FROM ${this.table} WHERE name = ?`)
        await stmt.run(name)
    }

    async removeAllJobs(): Promise<void> {
        const stmt = this.db.prepare(`DELETE FROM ${this.table}`)
        await stmt.run()
    }

    async removeAllCompletedJobs(): Promise<void> {
        const stmt = this.db.prepare(`DELETE FROM ${this.table} WHERE status = '${Job.COMPLETE}'`)
        await stmt.run()
    }
    async removeAllFailedJobs(): Promise<void> {
        const stmt = this.db.prepare(`DELETE FROM ${this.table} WHERE status = '${Job.FAILED}'`)
        stmt.run()
    }
    async removeAllQueuedJobs(): Promise<void> {
        const stmt = this.db.prepare(`DELETE FROM ${this.table} WHERE status = '${Job.QUEUED}'`)
        await stmt.run()
    }
    async removeAllCancelledJobs(): Promise<void> {
        const stmt = this.db.prepare(`DELETE FROM ${this.table} WHERE status = '${Job.CANCELLED}'`)
        await stmt.run()
    }

    async getJobsWithStatus(status: string): Promise<Job[]> {
        const stmt = this.db.prepare(`SELECT * FROM ${this.table} WHERE status = ?`)
        const rows = await stmt.all(status)
        return rows.map((row: any) => this.job(row))
    }

    async getJob(name: string): Promise<Job> {
        const stmt = this.db.prepare(`SELECT * FROM ${this.table} WHERE name = ?`)
        const row = await stmt.get(name)
        return this.job(row)
    }

    async getCronJob(): Promise<Job> {
        const stmt = this.db.prepare(`SELECT * FROM ${this.table} WHERE cron IS NOT NULL`)
        const row = await stmt.get()
        return this.job(row)
    }

    async getCronJobs(): Promise<Job[]> {
        const stmt = this.db.prepare(`SELECT * FROM ${this.table} WHERE cron IS NOT NULL`)
        const rows = await stmt.all()
        return rows.map((row: any) => this.job(row))
    }

    async getJobs(): Promise<Job[]> {
        const stmt = this.db.prepare(`SELECT * FROM ${this.table}`)
        const rows = await stmt.all()
        return rows.map((row: any) => this.job(row))
    }

    /**
     * Retry a failed job by ID
     * @param id The job ID to retry
     * @returns Object indicating success and which queue the job was found in, or null if not found
     */
    async retryFailedJob(id: number): Promise<{ success: boolean; queue: string } | null> {
        const stmt = this.db.prepare(
            `UPDATE ${this.table} SET status = '${Job.QUEUED}', dequeued = NULL, ended = NULL, result = NULL 
             WHERE id = ? AND status = '${Job.FAILED}'`
        )
        const result = await stmt.run(id)

        if (result.success) {
            return { success: true, queue: this.name }
        }

        return null
    }
}



