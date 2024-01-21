import { useEffect, useRef } from 'preact/hooks'
import { effect, useComputed, useSignal } from '@preact/signals'

import { EVENTS, STATUS, Message } from '../../types.ts'
import Loading from './Loading.tsx'
import SVGRing from './SVGRing.tsx'
import Virtuallist from './Virtuallist.tsx'
import fzf from '../sdk/fzf.ts'

type Result = {
    timings: { timing: number; image: string }[]
    finalScreenshot: string
    scores: {
        performance: number
        seo: number
        accessibility: number
        bestPractices: number
        pwa: number
    }
}

export default function () {
    const crawledUrls = useSignal<Record<string, string>>({})

    const filteredCrawledUrls = useComputed(() => {
        if (!search.value) {
            return {}
        }
        return Object.fromEntries(
            Object.entries(crawledUrls.value).filter(([id, url]) => {
                return results.value[id] && fzf(search.value.toLowerCase(), url.toLowerCase())
            }),
        )
    })

    const results = useSignal<Record<string, Result>>({})
    const viewingTest = useSignal<string | null>(null)
    const dialog = useRef<HTMLDialogElement>(null)
    const search = useSignal('')

    effect(() => {
        if (search.value) {
            console.log('filtered', filteredCrawledUrls.value)
        }
    })

    useEffect(() => {
        const socket = new WebSocket('ws://localhost:3819')

        console.log('Connecting...')

        socket.onopen = () => {
            console.log('connected')
        }

        socket.onmessage = async event => {
            // console.log(event.data)
            const message = JSON.parse(event.data) as Message

            if (message.event === EVENTS.CRAWL_URLS) {
                if (message.status === STATUS.SUCCESS) {
                    crawledUrls.value = message.data.urls as Record<string, string>
                }
            }

            if (message.event === EVENTS.RUN_TEST) {
                if (message.status === STATUS.SUCCESS) {
                    const id = message.data.id as string

                    const { timings } = await fetch(`http://localhost:8293/timings?id=${id}`).then(
                        r => r.json(),
                    )
                    const { scores } = await fetch(`http://localhost:8293/scores?id=${id}`).then(
                        r => r.json(),
                    )

                    results.value[id] = {
                        timings,
                        finalScreenshot: `http://localhost:8293/screenshot?id=${id}`,
                        scores,
                    }
                    results.value = { ...results.value }
                }
            }
        }

        socket.onclose = () => {
            console.log('disconnected')
        }
    }, [])

    return (
        <>
            <dialog
                ref={dialog}
                class='w-full max-w-3xl h-[600px] backdrop:bg-black/50'
                onClick={e => e.currentTarget.close()}
            >
                {viewingTest.value && (
                    <form method='dialog' class='w-full h-full'>
                        <iframe
                            class='w-full h-full'
                            src={`http://localhost:8293/view?id=${viewingTest.value}`}
                            title='a'
                        />
                    </form>
                )}
            </dialog>

            <div class='p-4 bg-gray-950 min-h-full'>
                <div class='mb-3 bg-gray-900 p-2 rounded'>
                    <input
                        type='text'
                        placeholder='Enter URL'
                        class='py-2 px-3 w-full bg-gray-800 outline-0 rounded-md placeholder:text-gray-600 text-gray-400 text-lg'
                        onInput={e => {
                            search.value = (e.target as HTMLInputElement).value
                        }}
                    />
                </div>
                <ul class='flex flex-col'>
                    <Virtuallist
                        data={Object.entries(
                            search.value ? filteredCrawledUrls.value : crawledUrls.value,
                        )}
                        overscanCount={20}
                        rowHeight={300}
                        renderRow={([id, url]) => {
                            const result = results.value[id]

                            return (
                                <li class='h-[300px] p-4 bg-gray-900 flex flex-col first:rounded-tl-sm first:rounded-tr-rounded-tl-sm last:rounded-bl-rounded-tl-sm last:rounded-br-rounded-tl-sm'>
                                    <span class='text-lg font-medium text-white truncate line-clamp-2 block mb-4 py-1 px-2 bg-gray-800 rounded shrink-0'>
                                        {decodeURIComponent(new URL(url).pathname)}
                                    </span>

                                    {result ? (
                                        <div class='flex'>
                                            <div>
                                                <img
                                                    src={result.finalScreenshot}
                                                    alt=''
                                                    width={100}
                                                    height={150}
                                                />
                                            </div>

                                            <div>
                                                <div class='flex ml-6 gap-6'>
                                                    <SVGRing
                                                        label='Performance'
                                                        percentage={Math.round(
                                                            result.scores.performance * 100,
                                                        )}
                                                    />
                                                    <SVGRing
                                                        label='Accessibility'
                                                        percentage={Math.round(
                                                            result.scores.accessibility * 100,
                                                        )}
                                                    />
                                                    <SVGRing
                                                        label='Best Practices'
                                                        percentage={Math.round(
                                                            result.scores.bestPractices * 100,
                                                        )}
                                                    />
                                                    <SVGRing
                                                        label='SEO'
                                                        percentage={Math.round(
                                                            result.scores.seo * 100,
                                                        )}
                                                    />
                                                </div>

                                                <button
                                                    type='button'
                                                    class='text-white font-medium mt-10 ml-6 bg-white/20 hover:bg-white/10 transition-colors rounded py-2 px-3'
                                                    onClick={() => {
                                                        viewingTest.value = id
                                                        dialog.current?.showModal()
                                                    }}
                                                >
                                                    View test
                                                </button>
                                            </div>

                                            <div class='ml-auto flex gap-3'>
                                                {result.timings.map(({ image, timing }) => (
                                                    <div class='flex flex-col justify-center gap-4'>
                                                        <img
                                                            src={image}
                                                            alt=''
                                                            width={100}
                                                            height={150}
                                                        />
                                                        <span class='text-sm text-white text-center'>
                                                            {timing}
                                                            <span class='text-gray-600'>ms</span>
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <Loading />
                                    )}
                                </li>
                            )
                        }}
                    />
                </ul>
            </div>
        </>
    )
}
