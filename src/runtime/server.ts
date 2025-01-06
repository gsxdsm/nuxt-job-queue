import Connection from './lib/connection'
import Job from './lib/job'
import { jobWorkers, type Worker } from './lib/worker'
import Queue, { type QueueOptions } from './lib/queue'
import { DEFAULT_QUEUE, CRON_QUEUE } from './lib/enum'

/**
 * @property {string} [cron] - A cron expression that defines the schedule for the job.
 * @property {number | string} [delay] - The delay before the job is executed, can be a number (milliseconds) or a string (e.g., '5m' for 5 minutes).
 * @property {number} [timeout] - The maximum time allowed for the job to complete, can be a number (milliseconds) or a string (e.g., '5m' for 5 minutes).
 * @property {number} [priority] - The priority of the job, with higher numbers indicating higher priority.
 * @property {Object} [retry] - Configuration for retrying the job if it fails.
 * @property {number} [retry.count] - The number of times to retry the job if it fails.
 * @property {number | string} [retry.delay] - The delay between retries, can be a number (milliseconds) or a string (e.g., '5m' for 5 minutes).
 * @property {'linear' | 'exponential'} [retry.strategy] - The strategy for retrying the job, either 'linear' or 'exponential'.
 */
export interface JobOptions {
  cron?: string
  delay?: number | string
  timeout?: number | string
  priority?: number
  retry?: {
    count?: number
    delay?: number | string
    strategy?: 'linear' | 'exponential'
  }
}

export const queues: Record<string, Queue> = {}
export function createQueues(jobDbConnection: Connection) {
  queues[DEFAULT_QUEUE] = jobDbConnection.queue(DEFAULT_QUEUE, {})
  queues[CRON_QUEUE] = jobDbConnection.queue(CRON_QUEUE, {})
}

export function createJobHandler<T>(options: JobOptions) {
  return new Proxy(() => { }, {
    get(_, module: string) {
      return new Proxy(() => { }, {
        get(_, func: string) {
          return (...args: any[]) => {
            //TODO: Eventually add support for per-priority queue
            const targetQueue = options.cron ? queues[CRON_QUEUE] : queues[DEFAULT_QUEUE]
            //const params = { function: func, args: args }
            targetQueue.enqueue(`${module}.${func}`, args, options, function (err: Error | null, job?: Job) {
              if (err) {
                console.log('error:', err)
              } else {
                console.log('success:', job?.data)
              }
            })
          }
        }
      })
    }
  }) as unknown as T
}

type ModuleMap = {
  id: string,
  module: Object
}

export function createWorker(jobDbConnection: Connection, filesWithId: ModuleMap[], queue: string, startWorker: boolean, pollInterval: number, minPriority: number) {
  const worker = jobDbConnection.worker([queue], { interval: pollInterval, minPriority: minPriority })
  filesWithId.forEach(file => {
    Object.entries(file.module).forEach(([symbol, func]) => {
      if (typeof func !== 'function') {
        return
      }
      worker.register({
        [`${file.id}.${symbol}`]: function (args: any[], callback: (arg0?: any, arg1?: any) => void) {
          try {
            (func as (...args: any[]) => void)(...args)
            callback(null, args)
          } catch (err) {
            callback(err)
          }
        }
      })
    })
  })

  worker.on('dequeued', function (data) {
    console.log('Dequeued', data)
  })
  worker.on('failed', function (data) {
    console.log('Failed', data)
  })
  worker.on('complete', function (data) {
    console.log('Complete', data)
  })
  worker.on('error', function (err) {
    console.log('Error', err)
    //worker.stop(undefined)
  })

  jobWorkers[queue] = worker as Worker
  if (startWorker) {
    worker.start()
  }
  return worker
}

export function getDefaultJobQueue(): Queue {
  return queues[DEFAULT_QUEUE]
}

export function getCronJobQueue(): Queue {
  return queues[CRON_QUEUE]
}

export function getJobQueue(name: string): Queue {
  return queues[name]
}

export function stopWorker(queue: string) {
  jobWorkers[queue].stop()
}

export function stopAllWorkers() {
  Object.values(jobWorkers).forEach(worker => worker.stop())
}

export function startWorker(queue: string) {
  jobWorkers[queue].start()
}

export function startAllWorkers() {
  Object.values(jobWorkers).forEach(worker => worker.start())
}