import Connection from './lib/connection'
import Job, { type JobOptions, type Retry } from './lib/job'
import { jobWorkers, type Worker } from './lib/worker'
import Queue from './lib/queue'
import { DEFAULT_QUEUE, CRON_QUEUE, CRON_NAME_PREFIX } from './lib/enum'
import { consola } from "consola"

const logger = consola.create({}).withTag("nuxt-job-queue")

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
          return async (...args: any[]) => {
            //TODO: Eventually add support for per-priority queue
            const targetQueue = options.cron ? queues[CRON_QUEUE] : queues[DEFAULT_QUEUE]
            //const params = { function: func, args: args }
            await targetQueue.enqueue(`${module}.${func}`, args, options, function (err: Error | null, job?: Job) {
              if (err) {
                logger.error('error:', err)
              } else {
                logger.debug('success:', job?.data)
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
        [`${file.id}.${symbol}`]: async function (args: any[], callback: (arg0?: any, arg1?: any) => void) {
          try {
            const result = await (func as (...args: any[]) => void)(...args)
            callback(null, result)
          } catch (err) {
            callback(err)
          }
        }
      })
    })
  })

  worker.on('dequeued', function (data) {
    logger.debug('Dequeued', data)
  })
  worker.on('failed', function (data) {
    logger.debug('Failed', data)
  })
  worker.on('complete', function (data) {
    logger.debug('Complete', data)
  })
  worker.on('error', function (err) {
    logger.debug('Error', err)
    //TODO: Explore if we should stop the worker here
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

export interface CronOptions {
  name: string
  cron: string
  timeout?: string | number
  retry?: Retry
  params?: any[]
  removeExisting?: boolean
}

//const cronJobs: Record<string, CronFunction> = {}
export async function defineCron(options: CronOptions, cronFunction: (...args: any) => void) {
  const jobName = `${CRON_NAME_PREFIX}${options.name}`
  if (options.removeExisting) {
    await queues[CRON_QUEUE].removeCronJobNamed(jobName)
  }
  const targetQueue = queues[CRON_QUEUE]
  jobWorkers[CRON_QUEUE].register({
    [`${jobName}`]: async function (args: any[], callback: (arg0?: any, arg1?: any) => void) {
      try {
        const result = await cronFunction(...args)
        callback(null, result)
      } catch (err) {
        callback(err)
      }
    }
  })
  await targetQueue.enqueue(`${jobName}`,
    options.params, options, async function (err: Error | null, job?: Job) {
      if (err) {
        logger.error('error:', err)
      } else {
        logger.debug('success:', job?.data)
      }
    })
}