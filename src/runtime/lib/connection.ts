//Based off of https://github.com/sinkhaha/node-sqlite-queue

import Database from 'better-sqlite3'
import Queue from './queue'
import Worker from './worker'
import Job from './job'
import { TABLE_NAME } from './enum'
import * as pathe from 'pathe'
import * as fs from 'fs'


interface QueueOptions {
    universal?: boolean
    table?: string
    [key: string]: any
}

interface WorkerOptions {
    table?: string
    universal?: boolean
    [key: string]: any
}

export default class Connection {
    private db

    constructor(filename: string, mode?: any) {
        // Ensure the directory exists and if not create it
        const path = pathe.parse(filename)
        const dir = path.dir
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        this.db = new Database(filename, mode)
        this.db.pragma('journal_mode = WAL')

    }

    queue(name: string, options: QueueOptions): Queue {
        return new Queue(this, name, options)
    }

    worker(queues: string | string[] | Queue[], options: WorkerOptions = {}): Worker {
        const table = options.table || TABLE_NAME

        if (queues === '*') {
            options.universal = true
            queues = [this.queue('*', {
                universal: true,
                table: table
            })]
        } else {
            if (!Array.isArray(queues)) {
                queues = [queues]
            }

            queues = queues.map((queue: string | Queue) => {
                if (typeof queue === 'string') {
                    return this.queue(queue, {
                        table: table
                    })
                }
                return queue
            })
        }

        return new Worker(queues, options)
    }

    close(): void {
        this.db.close()
    }

}
