# nuxt-job-queue

`nuxt-job-queue` is a self contained job queue for Nuxt. You can use it to run background/scheduled/delayed jobs (functions) in your Nuxt app as well as run cron jobs. It uses a self-contained sqlite database to store the jobs and is designed to be as simple as possible to use. You can run worker processes as part of the Nitro server (for traditional servers), or using Nitro tasks which can be run in a serverless environment. It does not require redis or any other external dependencies. If you need a more robust solution, you should look at [BullMQ](https://docs.bullmq.io/) or [nuxt-concierge](https://github.com/genu/nuxt-concierge).

## Install

```bash
pnpm install nuxt-job-queue
```

```ts
export default defineNuxtConfig({
  modules: ['nuxt-job-queue'],
});
```

## Usage

Export functions in `server/jobs/**/*.{ts,js,mjs}` that you would like to run as jobs. These functions can be called from other server functions as jobs using the following syntax `job().myJob.myFunction()`.


### Jobs

```ts
// server/job/email.ts

export async function sendEmails() {
  const emails = await prisma.emails.findMany();
  for (const email of emails) {
    await sendEmail(email);
  }
}

// server/scheduleEmails.ts
export function scheduleEmails() {
  await job().email.sendEmails();
}
```


The `server/job` part of the path informs the module that this code should be run as a job. The `job()` function is a proxy that will run the function in the job queue. You can also run jobs from the client using the `nuxt-rpc` module.

### Scheduled Jobs (crons)

You can use the `cron` parameter in the job option to schedule a job to run at a specific time. The cron syntax is the same as the [cron package](https://www.npmjs.com/package/cron). You can also use the `EVERY` enum (automatically imported) for a set of common intervals.

```ts

You can schedule cron jobs in `server/cron/**/*.{ts,js,mjs}` files by exporting a default function. All default exports in the `server/cron` directory will be run on startup.

```ts
// server/cron/sendEmails.ts

export default function() {
  job({
    cron: EVERY.HOUR, //or "0 0-23/1 * * *" see lib/enum.ts for more options
  }).email.sendEmails();
}
```

Checkout [the playground example](/playground).

## Custom job options

You can pass custom options to the job function using the `options` parameter. The following options are available:

```ts
export interface JobOptions {
  cron?: string // A cron expression that defines the schedule for the job.
  delay?: number | string // The delay before the job is executed, can be a number (milliseconds) or a string (e.g., '5m' for 5 minutes).
  timeout?: number // The maximum time allowed for the job to complete, can be a number (milliseconds) or a string (e.g., '5m' for 5 minutes).
  priority?: number // The priority of the job, with higher numbers indicating higher priority.
  retry?: {
    count?: number // The number of times to retry the job if it fails.
    delay?: number | string // The delay between retries, can be a number (milliseconds) or a string (e.g., '5m' for 5 minutes).
    strategy?: 'linear' | 'exponential' // The strategy for retrying the job, either 'linear' or 'exponential'.
  }
}
```

## Settings and default

The following config settings (and their defaults) are available:

```ts
  jobQueue: {
    jobPaths: '/server/jobs/', // Path to the directory containing job files
    jobClientName: 'job', // Name of the job client
    cronPaths: '/server/cron/', // Path to the directory containing cron job files
    dbFilePath: './data/db/jobqueue.sqlite', // Path to the SQLite database file
    nitroTasks: {
      runWorkersInTasks: false, // Whether to run workers in Nitro tasks
      workerTaskCron: '*/30 * * * * *', // Cron expression for worker tasks
      workerPollInterval: 5000, // Interval in milliseconds for polling worker tasks
    },
    defaults: {
      job: {
        delay: 0, // Default delay before executing a job (in milliseconds)
        timeout: 5000, // Default timeout for a job (in milliseconds)
        priority: 3, // Default priority for a job
        retry: {
          count: 3, // Default number of retry attempts for a job
          delay: 5000, // Default delay between retries (in milliseconds)
          strategy: 'exponential', // Default exponential backoff retry strategy
        },
      },
      cron: {
        timeout: 5000, // Default timeout for a cron job (in milliseconds)
        priority: 3, // Default priority for a cron job
        retry: {
          count: 3, // Default number of retry attempts for a cron job
          delay: 5000, // Default delay between retries (in milliseconds)
          strategy: 'exponential', // Default exponential backoff retry strategy
        },
      },
    }
  }
```

## Running in a serverless environment
By setting `runWorkersInTasks` to `true`, you can run the worker processes in [Nitro tasks](https://nitro.build/guide/tasks). This is useful for serverless environments where you don't have control over the server process. You can setup your serverless environment to trigger the Nitro task scheduler at a regular interval, which will in turn kick off the worker tasks to pick up and process jobs. Be sure to set the `workerTaskCron` settings to match your serverless environment cron setting (default is every minute). Also see: [Cloudflare cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

```ts
  jobQueue: {
    nitroTasks: {
      runWorkersInTasks: true,
      workerTaskCron: '* * * * *',
      workerPollInterval: 5000,
    },
  }
```



## Why this module
Setting up background jobs, scheduling tasks, and managing retries can be cumbersome and often requires external dependencies like Redis.

Wouldn't it be nice if all of that was automatically handled and all you'd need to do is define your jobs and schedule them? That's where `nuxt-job-queue` comes in. With `nuxt-job-queue`, all exported functions from `server/jobs` files automatically become available to be run as background jobs or scheduled tasks.

This module builds upon the simplicity of [node-sqlite-queue](https://github.com/sinkhaha/node-sqlite-queue) using a self-contained SQLite database and adds first-class Nuxt and typescript support for as well as the ability to run jobs in both traditional and serverless environments without requiring any external dependencies. 

If you need high performance, complex workflows, or more advanced features, you should look at [BullMQ](https://docs.bullmq.io/) or [nuxt-concierge](http://github.com/genu/nuxt-concierge) or [inngest](http://inngest.com).

## Development

- Run `cp playground/.env.example playground/.env`
- Run `pnpm dev:prepare` to generate type stubs.
- Use `pnpm dev` to start [playground](./playground) in development mode.

## Credits

This project is inspired by [node-sqlite-queue](https://github.com/sinkhaha/node-sqlite-queue) and uses much of the queue/worker/job logic from that project.

## License

MIT
