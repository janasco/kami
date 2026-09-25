import { copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const dist = resolve(process.cwd(), 'dist')
await copyFile(resolve(dist, 'index.html'), resolve(dist, '404.html'))
console.log('Copied dist/index.html to dist/404.html for GitHub Pages SPA fallback')
