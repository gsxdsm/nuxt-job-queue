export default function buildCron() {
    // Setup a named CRON job
    defineCron({
        name: "test-cron",
        cron: EVERY.FIVE_SECONDS,
        params: ["myarg", 56],
    },
        (myarg: string, arg2: number) => {
            console.log("CRON, every five seconds - ", myarg, arg2)
        }
    )

    // Setup individual job with a cron parameter
    job({
        cron: EVERY.FIVE_SECONDS,
    }).test.testJob({
        name: "world"
    })
}