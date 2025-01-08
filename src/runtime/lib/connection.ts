//Based off of https://github.com/sinkhaha/node-sqlite-queue
import Queue from './queue'
import Worker from './worker'
import { TABLE_NAME } from './enum'
import { type Database } from "db0"

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

    constructor(database: Database) {
        // Ensure the directory exists and if not create it
        /*const path = pathe.parse(filename)
        const dir = path.dir
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }*/

        this.db = database
        this.db.exec('PRAGMA journal_mode = WAL')
        //this.db.pragma('journal_mode = WAL')

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
        //this.db.close()
    }

}
