import { defineConfig } from '$fresh/server.ts'
import tailwind from '$fresh/plugins/tailwind.ts'
import u from '../utils.ts'

export default defineConfig({
    plugins: [tailwind()],
    server: {
        port: u.getPorts().uiPort,
    },
})
