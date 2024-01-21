import { useSignal } from '@preact/signals'
import { ComponentChildren } from 'preact'
import { useEffect } from 'preact/hooks'

type Props<T> = {
    data: T[]
    rowHeight: number
    renderRow: (_: T) => ComponentChildren
    overscanCount: number
}

export default function <T>({ data, rowHeight, renderRow, overscanCount }: Props<T>) {
    const offset = useSignal(0)
    const height = useSignal(0)

    // console.log(data.length)

    // first visible row index
    let start = (offset.value / rowHeight) | 0

    let visibleRowCount = (height.value / rowHeight) | 0
    // actual number of visible rows (without overscan)

    // Overscan: render blocks of rows modulo an overscan row count
    // This dramatically reduces DOM writes during scrolling
    if (overscanCount) {
        start = Math.max(0, start - (start % overscanCount))
        visibleRowCount += overscanCount
    }

    // last visible + overscan row index
    const end = start + 1 + visibleRowCount

    // data slice currently in viewport plus overscan items
    const selection = data.slice(start, end)

    useEffect(() => {
        addEventListener('scroll', () => {
            offset.value = scrollY
        })
    }, [])

    return (
        <div
            class='relative overflow-hidden w-full min-h-full'
            style={{ height: data.length * rowHeight }}
        >
            <div
                class='absolute left-0 top-0 h-full w-full visible'
                style={{ top: start * rowHeight }}
            >
                {selection.map(renderRow)}
            </div>
        </div>
    )
}
