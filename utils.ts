export function formatDuration(miliseconds: number) {
    if (miliseconds < 1000) {
        return `${miliseconds}ms`
    }

    if (miliseconds < 60000) {
        return `${(miliseconds / 1000).toFixed(1)}s`
    }

    return `${(miliseconds / 60000).toFixed(1)}m`
}

export function computeMultiplierMessages(benchmarkIndex: number) {
    if (!Number.isFinite(benchmarkIndex)) return null

    if (benchmarkIndex >= 1300) {
        return 3 + (benchmarkIndex - 1300) / 233
    }
    if (benchmarkIndex >= 800) {
        return 2 + (benchmarkIndex - 800) / 500
    }
    if (benchmarkIndex >= 150) {
        return 1 + (benchmarkIndex - 150) / 650
    }

    return null
}

export function toArray<T>(o: T | T[]): T[] {
    if (Array.isArray(o)) return o
    return [o]
}

export function getPorts() {
    const uiPort = Number(Deno.env.get('UI_PORT'))
    const serverPort = Number(Deno.env.get('SERVER_PORT'))
    const apiPort = Number(Deno.env.get('API_PORT'))

    if (!Number.isFinite(uiPort) || !Number.isFinite(serverPort) || !Number.isFinite(apiPort)) {
        throw new Error('Failed to get ports')
    }

    return { uiPort, serverPort, apiPort }
}

export default {
    formatDuration,
    computeMultiplierMessages,
    toArray,
    getPorts,
}
