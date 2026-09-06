import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(projectRoot, 'dist-single')
const htmlPath = path.join(outputDirectory, 'index.html')

let html = await readFile(htmlPath, 'utf8')

const stylesheetTag = html.match(
  /<link\s+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/,
)
const moduleTag = html.match(
  /<script\s+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/,
)

if (!stylesheetTag?.[0] || !stylesheetTag[1]) {
  throw new Error('Не удалось найти CSS-файл в собранном index.html.')
}

if (!moduleTag?.[0] || !moduleTag[1]) {
  throw new Error('Не удалось найти JavaScript-файл в собранном index.html.')
}

const resolveAsset = (assetPath) =>
  path.join(outputDirectory, assetPath.replace(/^\.\//, '').replace(/^\//, ''))

const [css, javascript] = await Promise.all([
  readFile(resolveAsset(stylesheetTag[1]), 'utf8'),
  readFile(resolveAsset(moduleTag[1]), 'utf8'),
])

html = html
  .replace(stylesheetTag[0], () => `<style>${css}</style>`)
  .replace(
    moduleTag[0],
    () =>
      `<script type="module">${javascript.replaceAll('</script', '<\\/script')}</script>`,
  )

if (html.includes(stylesheetTag[0])) {
  throw new Error('В index.html осталась внешняя ссылка на CSS.')
}

if (html.includes(moduleTag[0])) {
  throw new Error('В index.html осталась внешняя ссылка на JavaScript.')
}

await writeFile(htmlPath, html)

console.log(`Самодостаточный файл создан: ${htmlPath}`)
