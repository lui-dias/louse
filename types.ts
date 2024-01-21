export enum EVENTS {
    GET_BENCHMARK_INDEX = 'Get Benchmark Index',
    CRAWL_URLS = 'Crawl Urls',
    RUN_TEST = 'Run Test',
    GET_TEST_RESULTS = 'Get Test Results',
}

export enum STATUS {
    IN_PROGRESS = 'In Progress',
    SUCCESS = 'Success',
    ERROR = 'Error',
}

export type UsefulInfo = {
    scores: {
        performance: number | null | undefined
        seo: number | null | undefined
        accessibility: number | null | undefined
        bestPractices: number | null | undefined
        pwa: number | null | undefined
    }
    timings: {
        timing: number
        timestamp: number
        data: string
    }[]
    finalScreenshot: string
}

export type Message = {
    event: EVENTS
    status: STATUS
    data: Record<string, unknown>
}
