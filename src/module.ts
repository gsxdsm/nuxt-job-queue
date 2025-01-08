import {
  addServerImports,
  addServerPlugin,
  addTemplate,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import fg from 'fast-glob'
import defu from 'defu'
import dedent from 'dedent'
import { relative } from 'node:path'
import * as pathe from 'pathe'
import { createFilter } from '@rollup/pluginutils'
import { getModuleId } from './runtime/transformer'
let jobPatterns: string[]
let cronPatterns: string[]

export interface ModuleOptions {
  jobPaths?: string | string[]
  cronPaths?: string | string[]
  jobClientName?: string
  dbOptions?: {
    connector?: 'sqlite' | 'postgresql' | 'pglite' | 'cloudflare-d1' | 'libsql' | 'libsql-node' | 'libsql-http' | 'libsql-web' | 'bun' | 'bun-sqlite' | 'planetscale'
    options?: any
    url?: string
  }
  workerPollInterval?: number
  nitroTasks?: {
    runWorkersInTasks?: boolean
    workerTaskCron?: string
  }
  defaults?: {
    job?: {
      delay?: number | string,
      timeout?: number | string,
      priority?: number
      retry?: {
        count?: number
        delay?: number | string
        strategy?: string
      }
    }
    cron?: {
      timeout?: number | string,
      priority?: number
      retry?: {
        count?: number
        delay?: number | string
        strategy?: string
      }
    }
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-job-queue',
    configKey: 'jobQueue',
    version: '^3.3.0',
  },
  defaults: {
    jobPaths: ['/server/jobs/', '/server/rpc/'],
    jobClientName: 'job',
    cronPaths: '/server/cron/',
    dbOptions: {
      connector: 'sqlite' as 'sqlite',
      options: { name: 'jobqueue' }
    },
    workerPollInterval: 5000,
    nitroTasks: {
      runWorkersInTasks: false,
      workerTaskCron: '* * * * *',
    },
    defaults: {
      job: {
        delay: 0,
        timeout: 5000,
        priority: 3,
        retry: {
          count: 3,
          delay: 5000,
          strategy: 'exponential',
        },
      },
      cron: {
        timeout: 5000,
        priority: 3,
        retry: {
          count: 3,
          delay: 5000,
          strategy: 'exponential',
        },
      },
    }
  },
  async setup(options, nuxt) {

    const jobPaths = Array.isArray(options.jobPaths) ?
      options.jobPaths.filter(Boolean) as string[] : [options.jobPaths].filter(Boolean) as string[]
    const cronPaths = Array.isArray(options.cronPaths) ?
      options.cronPaths.filter(Boolean) as string[] : [options.cronPaths].filter(Boolean) as string[]

    nuxt.options.runtimeConfig.jobQueue = defu(nuxt.options.runtimeConfig.jobQueue, {
      ...options,
      jobPaths,
      cronPaths
    })

    nuxt.options.nitro.experimental = {
      ...nuxt.options.nitro.experimental,
      database: true
    }


    nuxt.options.nitro.database = {
      ...nuxt.options.nitro.database,
      _jobqueue: {
        ...options.dbOptions,
      }
    }

    const files: string[] = []
    const cronFiles: string[] = []



    jobPatterns = generatePatterns(jobPaths)
    cronPatterns = generatePatterns(cronPaths)
    const jobFilter = createFilter(jobPatterns)
    const cronFilter = createFilter(cronPatterns)

    // Transpile runtime and handler
    const resolver = createResolver(import.meta.url)
    const handlerPath = resolver.resolve(nuxt.options.buildDir, 'job-handler')
    const runtimeDir = resolver.resolve('./runtime')
    nuxt.options.build.transpile.push(runtimeDir, handlerPath)
    nuxt.options.vite ??= {}
    nuxt.options.vite.optimizeDeps ??= {}
    nuxt.options.vite.optimizeDeps.exclude ??= []
    nuxt.options.vite.optimizeDeps.exclude.push('nuxt-job-queue')
    nuxt.hook('builder:watch', async (e, path) => {
      path = relative(
        nuxt.options.rootDir,
        resolve(nuxt.options.rootDir, path)
      )
      if (e === 'change') return
      if (jobFilter(path)) {
        await scanFunctions(files, jobPatterns)
        await nuxt.callHook('builder:generateApp')
      } else if (cronFilter(path)) {
        await scanFunctions(cronFiles, cronPatterns)
        await nuxt.callHook('builder:generateApp')
      }
    })

    await scanFunctions(files, jobPatterns)
    await scanFunctions(cronFiles, cronPatterns)

    addTemplate({
      filename: 'job-handler.ts',
      write: true,
      getContents() {
        const filesWithId = files.map((file) => ({
          file: file.replace(/\.ts$/, ''),
          id: getModuleId(file, options.jobPaths!),
        }))

        const cronFilesWithId = cronFiles.map((file) => ({
          file: file.replace(/\.ts$/, ''),
          id: getModuleId(file, options.cronPaths!),
        }))
        return dedent`
          import { createJobHandler, createQueues, createWorker } from ${JSON.stringify(resolver.resolve(runtimeDir, 'server'))}
          import { DEFAULT_QUEUE, CRON_QUEUE } from ${JSON.stringify(resolver.resolve(runtimeDir, 'lib/enum'))}
          import Connection from ${JSON.stringify(resolver.resolve(runtimeDir, 'lib/connection'))}
          import { type JobOptions } from ${JSON.stringify(resolver.resolve(runtimeDir, 'lib/job'))}
          import defu from 'defu'

          ${filesWithId
            .map((i) => `import * as ${i.id} from ${JSON.stringify(i.file)}`)
            .join('\n')}
          ${cronFilesWithId
            .map((i) => `import * as ${i.id} from ${JSON.stringify(i.file)}`)
            .join('\n')}
            
          export type JobFunction = {
            ${filesWithId.map((i) => `${i.id}: typeof ${i.id}`).join('\n')}
          }
            
          

          // Job function used to schedule jobs
          export const ${options.jobClientName} = (
            options?: JobOptions): JobFunction => {
                let opts = {}
              if (options?.cron){
                opts = defu(options, {
                              timeout: ${options.defaults!.cron!.timeout}, 
                              priority: ${options.defaults!.cron!.priority}, 
                              attempts: {
                                count: ${options.defaults!.cron!.retry!.count}, 
                                delay: ${options.defaults!.cron!.retry!.delay}, 
                                strategy: '${options.defaults!.cron!.retry!.strategy}' 
                              } });
              }else{
                opts = defu(options,  {
                              delay: ${options.defaults!.job!.delay},
                              timeout: ${options.defaults!.job!.timeout}, 
                              priority: ${options.defaults!.job!.priority}, 
                              attempts: {
                                count: ${options.defaults!.job!.retry!.count}, 
                                delay: ${options.defaults!.job!.retry!.delay}, 
                                strategy: '${options.defaults!.job!.retry!.strategy}' 
                              } });
              }
              return createJobHandler<JobFunction>(opts);
            }; 


          export default function initJobQueue(){
            const db = useDatabase("_jobqueue")  
            const jobDbConnection = new Connection(db)
            createQueues(jobDbConnection)
            const filesWithId = [
              ${filesWithId.map((i) => `{ id: '${i.id}', module: ${i.id} }`).join(', ')
          }]

            createWorker(jobDbConnection, filesWithId, DEFAULT_QUEUE,
              ${!options.nitroTasks!.runWorkersInTasks ? 'true' : 'false'}, 
              ${options.workerPollInterval}, 0)

            // Register filesWithId and *not* cronFilesWithId - the actual jobs are in filesWithId
            createWorker(jobDbConnection, filesWithId, CRON_QUEUE,
              ${!options.nitroTasks!.runWorkersInTasks ? 'true' : 'false'}, 
              ${options.workerPollInterval}, 0)

            // Run cron registration jobs
            ${cronFilesWithId
            .map((i) => `${i.id}.default()`)
            .join('\n')}
          }
          
        `
      },
    })


    addServerImports([
      {
        name: 'initJobQueue',
        from: handlerPath
      },
      {
        name: options.jobClientName!,
        from: handlerPath,
      },
      {
        name: 'defineCron',
        from: resolver.resolve(runtimeDir, 'server'),
      },
      {
        name: 'CronOptions',
        from: resolver.resolve(runtimeDir, 'server'),
      },
      {
        name: 'getDefaultJobQueue',
        from: resolver.resolve(runtimeDir, 'server'),
      },
      {
        name: 'getCronJobQueue',
        from: resolver.resolve(runtimeDir, 'server'),
      },
      {
        name: 'getJobQueue',
        from: resolver.resolve(runtimeDir, 'server'),
      },
      {
        name: 'EVERY',
        from: resolver.resolve(runtimeDir, 'lib/enum'),
      }
    ])


    /*nuxt.hook('ready', async nuxt => {
      require(resolver.resolve(nuxt.options.buildDir, 'job-handler')).initJobQueue()
      //initJobQueue()
    })*/

    const { resolve } = createResolver(import.meta.url)
    addServerPlugin(resolver.resolve(handlerPath))

    if (options.nitroTasks!.runWorkersInTasks) {
      nuxt.options.nitro.experimental ||= {}
      nuxt.options.nitro.experimental.tasks = true


      nuxt.options.nitro.tasks = {
        ...nuxt.options.nitro.tasks,
        '_job:runner': {
          handler: resolver.resolve(runtimeDir, 'jobtask'),
        }
      }
      nuxt.options.nitro.scheduledTasks = {
        ...nuxt.options.nitro.scheduledTasks,
        [options.nitroTasks!.workerTaskCron!]: ['_job:runner']
      }
    }

    async function scanFunctions(files: string[], patterns: string[]) {
      files.length = 0
      const updatedFiles = await fg(patterns!, {
        cwd: nuxt.options.rootDir,
        absolute: true,
        onlyFiles: true,
        ignore: ['!**/node_modules', '!**/dist'],
      })
      files.push(...new Set(updatedFiles))
      return files
    }

  },
})
function generatePatterns(paths: (string | undefined)[]) {
  return paths.map((path) => {
    if (!path?.endsWith(pathe.sep)) {
      path = path + pathe.sep
    }
    if (!path.startsWith(pathe.sep)) {
      path = pathe.sep + path
    }
    return `**${path}**/*.{ts,js,mjs}`
  })
}

