
export default function buildCron() {
    getCronJobQueue().removeAllCronJobs()
    job({
        cron: EVERY.FIVE_SECONDS
    }).test.testJob({ name: 'CRON, every five seconds' })

    getCronJobQueue().getCronJobs().forEach(cronJob => {
        console.log(`Cron job: ${cronJob.data.name} - ${cronJob.data.cron} - ${cronJob.data.params}`)
    })
}
