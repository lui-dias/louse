import { useEffect, useId } from 'preact/hooks'

type Props = {
    percentage: number
    label: string
}

export default function ({ percentage, label }: Props) {
    const id = useId()

    const color = percentage < 50 ? 'red' : percentage < 90 ? 'yellow' : 'green'

    const circumference = 2 * Math.PI * 15

    useEffect(() => {
        const circle = document.getElementById(id) as HTMLElement
        circle.style.strokeDasharray = `${(percentage * circumference) / 100} ${circumference}`
        circle.classList.remove('opacity-0')
    }, [percentage])

    return (
        <>
            <div class='relative w-20 h-20 flex flex-col'>
                <svg
                    viewBox='0 0 32 32'
                    class='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full fill-red-600/30'
                    style={{
                        fill:
                            color === 'red'
                                ? '#ffe9e9'
                                : color === 'yellow'
                                  ? '#fff6e9'
                                  : '#e4f9ee',
                    }}
                >
                    <title>a</title>
                    <circle cx='16' cy='16' r='15' />
                </svg>

                <svg
                    viewBox='0 0 32 32'
                    class='circle-front w-full h-full fill-none stroke-red-500 origin-center opacity-0'
                    id={id}
                    style={{
                        strokeDasharray: `0 ${(percentage * circumference) / 100}`,
                        stroke:
                            color === 'red'
                                ? '#ff3333'
                                : color === 'yellow'
                                  ? '#ffaa33'
                                  : '#00cc66',
                    }}
                >
                    <title>a</title>
                    <circle cx='16' cy='16' r='14' />
                </svg>

                <span
                    class='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-medium text-xl'
                    style={{
                        color:
                            color === 'red'
                                ? '#CC0000'
                                : color === 'yellow'
                                  ? '#C33300'
                                  : '#008800',
                    }}
                >
                    {percentage}
                </span>

                <span class='text-gray-500 font-medium absolute left-1/2 -bottom-6 -translate-x-1/2 text-sm whitespace-nowrap'>
                    {label}
                </span>
            </div>
        </>
    )
}
