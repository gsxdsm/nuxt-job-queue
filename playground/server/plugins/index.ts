
export default defineNitroPlugin((nitroApp) => {
    job({
        delay: "10 seconds"
    }).test.testJob({ name: 'Nitro....' })
})

