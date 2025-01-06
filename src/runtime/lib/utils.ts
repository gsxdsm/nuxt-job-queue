//Based off of https://github.com/sinkhaha/node-sqlite-queue
import parse from 'parse-duration'
import { type Retry } from './job'

export function parseTimeout(timeout: number | string | undefined): number | undefined {
    return timeout === undefined
        ? undefined
        : parseDelay(timeout)
}

export function parseRetry(retry: Retry | undefined): Retry | undefined {
    if (retry === undefined) {
        return undefined
    }

    if (typeof retry !== 'object') {
        throw new Error('retry must be an object')
    }

    const result = {
        count: retry.count ? parseInt(retry.count.toString(), 10) : 0
    }
    retry.delay = parseDelay(retry.delay)
    if (retry.delay !== undefined) {
        //TODO: Double check this when we have a CRON - since delay will be overwritten
        Object.assign(result, {
            delay: parseInt(retry.delay.toString(), 10),
            strategy: retry.strategy,
        })
    }

    return result
}

export function parseDelay(delay: number | string | undefined): number {
    if (delay && typeof delay === 'string') {
        return parse(delay) || 0
    } else if (delay && typeof delay === 'number') {
        return delay
    } else {
        return 0
    }
}