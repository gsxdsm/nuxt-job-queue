
export default defineNitroPlugin((nitroApp) => {
    job({
        delay: "10 seconds"
    }).test.testJob({ name: 'Delayed 10 seconds' })

    job({
        delay: new Date('2025-12-25T00:00:00Z')
    }).test.testJob({ name: 'Delayed to 12/25/25' })
})

