import lighthouse, { RunnerResult } from 'npm:lighthouse'
import { throttling } from 'npm:lighthouse/core/config/constants.js'
import puppeteer, { Page } from 'https://deno.land/x/puppeteer@16.2.0/mod.ts'
import { abortable } from '$std/async/mod.ts'
import { parseArgs } from '$std/cli/mod.ts'
import { decodeBase64, encodeBase64 } from '$std/encoding/base64.ts'
import * as c from '$std/fmt/colors.ts'
import { globToRegExp } from '$std/path/glob.ts'
import { EVENTS, Message, STATUS, UsefulInfo } from './types.ts'
import u from './utils.ts'

import '$std/dotenv/load.ts'

async function cacheResult(url: string, result: unknown) {
    const id = encodeBase64(url)

    const file = `${testsFolder}/${id}.json`
    await Deno.writeTextFile(file, JSON.stringify(result))

    return id
}

async function getCachedResult({ id, url }: { id?: string; url?: string }) {
    if (!id && !url) throw new Error('No id or url provided')

    if (!id) id = encodeBase64(url as string)

    const file = `${testsFolder}/${id}.json`

    if (!(await exists(file))) return

    return JSON.parse(await Deno.readTextFile(file)) as {
        usefulInfo: UsefulInfo
        html: string
        result: RunnerResult
        benchmarkIndex: number
    }
}

function isPathExcluded(path: string) {
    if (!args.exclude) return false

    const url = new URL(path)
    const finePath = url.pathname + url.search + url.hash

    const paths = args.exclude.split(',')
    return paths.some(i => globToRegExp(i).test(finePath))
}

async function crawlUrls(url: string, page: Page): Promise<string[]> {
    await page.goto(url)
    return await Promise.all(
        (await Promise.all((await page.$$('a')).map(i => i.getProperty('href')))).map(i =>
            i.jsonValue(),
        ),
    )
}

async function crawlUntilLimit(maxUrls: number) {
    const uniqueUrls = new Set<string>([url])
    let i = 0

    while (uniqueUrls.size < maxUrls) {
        const links = await crawlUrls(i === 0 ? url : [...uniqueUrls][i], page)
        for (let link of links) {
            if (!link) continue

            link = link.replace(/\/$/, '')

            if (link.startsWith(url) && !uniqueUrls.has(link) && !isPathExcluded(link)) {
                uniqueUrls.add(link)
            }
        }
        i += 1
    }

    return [...uniqueUrls].slice(0, maxUrls)
}

async function getBenchmarkIndex() {
    const r = await runLighthouseTest(url, 1)

    const benchmarkIndex = r?.lhr?.environment?.benchmarkIndex

    if (!benchmarkIndex) {
        throw new Error('Failed to get benchmark index')
    }

    return benchmarkIndex
}

async function exists(path: string) {
    try {
        await Deno.stat(path)
        return true
    } catch {
        return false
    }
}

async function runLighthouseTest(url: string, cachedBenchmarkIndex: number) {
    return await lighthouse(url, {
        output: ['json', 'html'],
        logLevel: 'error',
        throttling: {
            ...throttling.mobileSlow4G,
            cpuSlowdownMultiplier: cachedBenchmarkIndex,
        },
        port: Number(new URL(browser.wsEndpoint()).port),
    })
}

async function runLouseTest(url: string, cachedBenchmarkIndex: number) {
    console.log(`Running test for ${encodeBase64(url)}`)

    for (let i = 0; i < 5; ++i) {
        const r = await runLighthouseTest(url, cachedBenchmarkIndex)

        const usefulInfo: UsefulInfo = {
            scores: {
                performance: r?.lhr.categories.performance.score,
                seo: r?.lhr.categories.seo.score,
                accessibility: r?.lhr.categories.accessibility.score,
                bestPractices: r?.lhr.categories['best-practices'].score,
                pwa: r?.lhr.categories.pwa.score,
            },
            timings: (
                r?.lhr?.audits['screenshot-thumbnails'].details as unknown as {
                    items: {
                        timing: number
                        timestamp: number
                        data: string
                    }[]
                }
            ).items,
            finalScreenshot: (
                r?.lhr.audits['final-screenshot'].details as unknown as { data: string }
            ).data,
        }

        if (i !== 4 && Object.values(usefulInfo.scores).some(i => !Number.isFinite(i))) continue

        const html = r?.report[1] ?? ''
        const id = await cacheResult(url, {
            usefulInfo,
            html,
            result: r,
            benchmarkIndex: cachedBenchmarkIndex,
        })

        return { id }
    }
}

async function getCachedBenchmarkIndex() {
    let cachedBenchmarkIndex =
        (await exists(`${louseFolder}/benchmarkIndex`)) &&
        Number(await Deno.readTextFile(`${Deno.env.get('HOME')}/.cache/louse/benchmarkIndex`))

    if (!cachedBenchmarkIndex) {
        const indexes = []

        await page.goto(url)
        for (let i = 0; i < 5; ++i) {
            indexes.push(await getBenchmarkIndex())
        }

        const benchmarkIndexAvg = indexes.reduce((a, b) => a + b, 0) / indexes.length
        const benchmarkIndex = u.computeMultiplierMessages(benchmarkIndexAvg)

        if (!benchmarkIndex) throw new Error('Could not get benchmarkIndex')
        cachedBenchmarkIndex = benchmarkIndex

        await Deno.mkdir(louseFolder, { recursive: true })
        await Deno.writeTextFile(`${louseFolder}/benchmarkIndex`, String(benchmarkIndex))
    }

    return cachedBenchmarkIndex
}

async function createWebsocket(
    port: number,
    fn: (socket: WebSocket, request: Request, response: Response) => void,
) {
    const conn = Deno.listen({ port })

    while (true) {
        const httpConn = Deno.serveHttp(await conn.accept())
        const e = await httpConn.nextRequest()

        if (e) {
            const { socket, response } = Deno.upgradeWebSocket(e.request)

            fn(socket, e.request, response)

            e.respondWith(response)
        }
    }
}

async function isURLAlive(url: string) {
    try {
        await fetch(url)
        return true
    } catch {
        return false
    }
}

async function startCrawl() {
    await createWebsocket(3819, (socket, request, response) => {
        function send(message: Message) {
            socket.send(JSON.stringify(message))
        }

        async function onOpen() {
            console.log('Connected')

            send({
                event: EVENTS.GET_BENCHMARK_INDEX,
                status: STATUS.IN_PROGRESS,
                data: {},
            })
            const cachedBenchmarkIndex = await getCachedBenchmarkIndex()

            send({
                event: EVENTS.GET_BENCHMARK_INDEX,
                status: STATUS.SUCCESS,
                data: {
                    benchmarkIndex: cachedBenchmarkIndex,
                },
            })

            send({
                event: EVENTS.CRAWL_URLS,
                status: STATUS.IN_PROGRESS,
                data: {},
            })

            const urls = Object.fromEntries(
                (await crawlUntilLimit(maxUrls)).map(i => [encodeBase64(i), i]),
            )

            send({
                event: EVENTS.CRAWL_URLS,
                status: STATUS.SUCCESS,
                data: {
                    urls,
                },
            })

            const testsIds = [] as string[]

            for (const [id, url] of Object.entries(urls)) {
                if (!(await getCachedResult({ id }))) {
                    send({
                        event: EVENTS.RUN_TEST,
                        status: STATUS.IN_PROGRESS,
                        data: { url, id },
                    })

                    await runLouseTest(url, cachedBenchmarkIndex)
                }

                console.log(`End test for: ${id}`)

                send({
                    event: EVENTS.RUN_TEST,
                    status: STATUS.SUCCESS,
                    data: { id },
                })

                testsIds.push(id)
            }
        }

        const c = new AbortController()

        socket.onopen = async () => {
            try {
                console.log('Aborted')
                await abortable(onOpen(), c.signal)
            } catch {
                //
            }
        }

        socket.onmessage = async m => {
            const message = JSON.parse(m.data) as Message

            if (message.event === EVENTS.GET_TEST_RESULTS) {
                const id = message.data.id as string

                const data = await getCachedResult({ id })

                send({
                    event: EVENTS.GET_TEST_RESULTS,
                    status: STATUS.SUCCESS,
                    data: { id, data },
                })
            }
        }

        socket.onclose = () => {
            c.abort()
            console.log('Closed')
        }

        socket.onerror = e => {
            console.log('Error ', e)
        }
    })
}

async function startAPI() {
    Deno.serve(
        {
            port: apiPort,
        },
        async (req: Request) => {
            const { pathname, searchParams } = new URL(req.url)

            if (pathname.startsWith('/view')) {
                const id = searchParams.get('id') as string
                const data = await getCachedResult({ id })

                if (!data) throw new Error('Not found')

                return new Response(data.html, {
                    headers: {
                        'Content-Type': 'text/html',
                        ...CORS,
                    },
                })
            }

            if (pathname.startsWith('/timings')) {
                const id = searchParams.get('id') as string
                const data = await getCachedResult({ id })

                if (!data) throw new Error('Not found')

                return new Response(
                    JSON.stringify({
                        timings: data.usefulInfo.timings.map(({ timing }, i) => ({
                            image: `http://localhost:${apiPort}/timing?id=${id}&index=${i}`,
                            timing,
                        })),
                    }),
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            ...CORS,
                            ...CACHE,
                        },
                    },
                )
            }

            if (pathname.startsWith('/timing')) {
                const id = searchParams.get('id') as string
                const index = Number(searchParams.get('index'))

                const data = await getCachedResult({ id })

                if (!data) throw new Error('Not found')

                const image = decodeBase64(
                    data.usefulInfo.timings[Number(index)].data.replace(
                        'data:image/jpeg;base64,',
                        '',
                    ),
                )

                return new Response(image, {
                    headers: {
                        'Content-Type': 'image/jpeg',
                        ...CORS,
                        ...CACHE,
                    },
                })
            }

            if (pathname.startsWith('/screenshot')) {
                const id = searchParams.get('id') as string

                const data = await getCachedResult({ id })

                if (!data) throw new Error('Not found')

                const image = decodeBase64(
                    data.usefulInfo.finalScreenshot.replace('data:image/jpeg;base64,', ''),
                )

                return new Response(image, {
                    headers: {
                        'Content-Type': 'image/jpeg',
                        ...CORS,
                        ...CACHE,
                    },
                })
            }

            if (pathname.startsWith('/scores')) {
                const id = searchParams.get('id') as string
                const data = await getCachedResult({ id })

                if (!data) throw new Error('Not found')

                return new Response(JSON.stringify({ scores: data.usefulInfo.scores }), {
                    headers: {
                        'Content-Type': 'application/json',
                        ...CORS,
                    },
                })
            }

            return new Response(null, {
                status: 404,
            })
        },
    )
}

async function startUI() {
    await new Deno.Command(Deno.execPath(), {
        args: ['task', 'start'],
        cwd: `${Deno.cwd()}/ui`,
        stdout: 'null',
        stderr: 'null',
        stdin: 'null',
    })
        .spawn()
        .output()
}

// ------------------------------------------------------------------------------
// ------------------------------------------------------------------------------
// ------------------------------------------------------------------------------
// ------------------------------------------------------------------------------
// ------------------------------------------------------------------------------

const args = parseArgs(Deno.args, {
    string: ['max-urls', 'exclude'],
    boolean: ['view', 'reload-benchmark', 'reload-tests'],
})

const {
    _: [_url],
} = args

const url = _url as string

if (!url) {
    console.error('No url provided')
    Deno.exit(1)
}

const maxUrls = args['max-urls'] ? parseInt(args['max-urls']) : 200
const browser = await puppeteer.launch({
    executablePath: Deno.env.get('CHROME_PATH'),
})
const page = await browser.newPage()

const louseFolder = `${
    Deno.build.os === 'windows' ? Deno.env.get('LOCALAPPDATA') : `${Deno.env.get('HOME')}/.cache`
}/louse`

const testsFolder = `${louseFolder}/tests`

if (!(await isURLAlive(url))) {
    console.error('Server is Down! :(')
    Deno.exit(1)
}

const { uiPort, serverPort, apiPort } = u.getPorts()

if (args['reload-benchmark-index'] && (await exists(`${louseFolder}/benchmarkIndex`))) {
    await Deno.remove(`${louseFolder}/benchmarkIndex`)
}

if (args['reload-tests'] && (await exists(testsFolder))) {
    await Deno.remove(testsFolder, { recursive: true })
}

await Deno.mkdir(louseFolder, { recursive: true })
await Deno.mkdir(testsFolder, { recursive: true })

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
}

const CACHE = {
    'Cache-Control': 'public, max-age=86400',
}

startUI()
startAPI()

if (args.exclude) {
    console.log(`Excluding: ${c.blue(args.exclude.split(',').join(', '))}`)
}
console.log(`UI started at: ${c.blue(`http://localhost:${uiPort}`)}`)
console.log(`Server started at: ${c.blue(`ws://127.0.0.1:${serverPort}`)}`)
console.log(`API started at: ${c.blue(`http://localhost:${apiPort}`)}`)
await startCrawl()
