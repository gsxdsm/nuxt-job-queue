import type Worker from "./lib/worker"
import { defineTask } from "nitropack/runtime/internal/task"
import { jobWorkers } from "./lib/worker"

export default defineTask({
    meta: {
        name: "_job:runner",
        description: "Run nuxt jobs",
    },
    run() {
        Object.entries(jobWorkers as Record<string, Worker>).forEach(([, worker]: [string, Worker]) => {
            worker.start()
        })
        return Promise.resolve({ result: undefined })
    }
})

