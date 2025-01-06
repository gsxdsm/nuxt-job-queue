
export default function buildCron() {
    getCronJobQueue().removeAllCronJobs()
    job({
        cron: EVERY.FIVE_SECONDS
    }).test.testJob({ name: 'CRON, every five seconds' })
}
