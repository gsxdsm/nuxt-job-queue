export function testJob(data: { name: string }) {
    console.log(`Hello ${data.name}!`)
    return `Hello ${data.name}...!`
}

