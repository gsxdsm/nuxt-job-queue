//Based off of https://github.com/sinkhaha/node-sqlite-queue
import { EventEmitter } from 'events'

export interface WorkerOptions {
    interval?: number
    callbacks?: Record<string, (params: any, cb: (err: Error | null, result?: any) => void) => void>
    strategies?: Record<string, (retry: any) => number>
    universal?: boolean
    minPriority?: number
}

export class Worker extends EventEmitter {
    private empty: number
    private interval: number
    private callbacks: Record<string, (params: any, cb: (err: Error | null, result?: any) => void) => void>
    private strategies: Record<string, (retry: any) => number>
    private universal: boolean
    private minPriority?: number
    private working: boolean = false
    private pollTimeout: NodeJS.Timeout | null = null

    constructor(private queues: any[] = [], private options: WorkerOptions = {}) {
        super()

        this.empty = 0
        this.interval = options.interval || 5000

        this.callbacks = options.callbacks || {}
        this.strategies = options.strategies || {}
        this.universal = options.universal || false

        // Default retry strategies
        this.strategies.linear || (this.strategies.linear = linear)
        this.strategies.exponential || (this.strategies.exponential = exponential)

        // This worker will only process jobs of this priority or higher
        this.minPriority = options.minPriority
    }

    register(callbacks: Record<string, any>): void {
        for (const name in callbacks) {
            this.callbacks[name] = callbacks[name]
        }
    }

    start(): void {
        if (this.queues.length === 0) {
            setTimeout(this.start.bind(this), this.interval)
            return
        }
        this.working = true
        this.poll()
    }

    stop(callback?: () => void): void {
        function done() {
            if (callback) callback()
        }

        if (!this.working) done()
        this.working = false

        if (this.pollTimeout) {
            clearTimeout(this.pollTimeout)
            this.pollTimeout = null
            return done()
        }

        this.once('stopped', done)
    }

    poll(): void {
        if (!this.working) {
            this.emit('stopped')
            return
        }

        const self = this

        this.dequeue(function (err, job) {
            if (err) {
                self.emit('error', err)
                return
            }

            if (job) {
                self.empty = 0
                self.emit('dequeued', job.data)
                self.work(job)
            } else {
                self.emit('empty')

                if (self.empty < self.queues.length) {
                    self.empty++
                }

                if (self.empty === self.queues.length) {
                    // All queues are empty, wait a bit
                    self.pollTimeout = setTimeout(function () {
                        self.pollTimeout = null
                        self.poll()
                    }, self.interval)
                } else {
                    self.poll()
                }
            }
        })
    }

    dequeue(callback: (err?: Error | null, job?: any) => void): void {
        const queue = this.queues.shift()
        this.queues.push(queue)
        queue.dequeue({ minPriority: this.minPriority, callbacks: this.callbacks }, callback)
    }

    work(job: any): void {
        const self = this
        let finished = false

        let timer: NodeJS.Timeout | undefined

        if (job.data.timeout) {
            timer = setTimeout(function () {
                done(new Error('timeout'))
            }, job.data.timeout)
        }

        function done(err: Error | null, result?: any) {
            // It's possible that this could be called twice in the case that a job times out,
            // but the handler ends up finishing later on
            if (finished) {
                return
            } else {
                finished = true
            }

            timer && clearTimeout(timer)
            self.emit('done', job.data)

            if (err) {
                self.error(job, err, function (err) {
                    if (err) {
                        self.emit('error', err)
                        return
                    }

                    self.emit('failed', job.data)
                    self.poll()
                })
            } else if (!job.data.cron) {
                // Complete non-cron jobs
                job.complete(result, function (err: Error | null) {
                    if (err) {
                        self.emit('error', err)
                        return
                    }

                    self.emit('complete', job.data)
                    self.poll()
                })
            } else {
                self.poll()
            }
        }

        this.process(job.data, done)
    }

    process(data: any, callback: (err: Error | null, result?: any) => void): void {
        const func = this.callbacks[data.name]

        if (!func) {
            callback(new Error('No callback registered for `' + data.name + '`'))
        } else {
            func(data.params, callback)
        }
    }

    error(job: any, err: Error, callback: (err?: Error) => void): void {
        const retry = job.data.retry
        let remaining = 0

        if (retry) {
            remaining = retry.remaining = (retry.remaining || retry.count) - 1
        }

        if (remaining > 0) {
            let strategy = this.strategies[retry.strategy || 'linear']
            if (!strategy) {
                strategy = linear

                console.error('No such retry strategy: `' + retry.strategy + '`')
                console.error('Using linear strategy')
            }

            let wait = 0
            if (retry.delay !== undefined) {
                wait = strategy(retry)
            }

            job.delay(wait, callback)
        } else if (!job.data.cron) {
            job.fail(err, callback)
        }
    }
}

// Strategies
function linear(retry: any): number {
    return retry.delay
}

function exponential(retry: any): number {
    return retry.delay * (retry.count - retry.remaining)
}

export default Worker

export const jobWorkers: Record<string, Worker> = {}