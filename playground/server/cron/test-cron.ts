
export default function buildCron() {
    getCronJobQueue().removeAllCronJobs()
    job({
        cron: EVERY.FIVE_SECONDS
    }).test.testJob({ name: 'Every five seconds FROM CRON DIRECTORY Nitro....' })
}
