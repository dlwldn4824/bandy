// 밴디 데모를 Claude Artifact용 HTML 한 파일로 만든다.
// 사용: node scripts/build-bandy-artifact.mjs <출력 파일>
// Artifact는 외부 스크립트를 막으므로 빌드된 JS·CSS를 페이지 안에 직접 넣는다.
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? 'bandy-demo.html'
execSync('npx vite build --config vite.bandy-artifact.config.ts', { stdio: 'inherit' })
const dir = 'dist-bandy-artifact/assets'
const files = readdirSync(dir)
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
const safeJs = js.replace(/<\/script/gi, '<\\/script')
const page = `<title>BANDY 데모</title>
<style>
:root { --page-bg: #ffffff; color-scheme: light }
html, body { background: var(--page-bg) }
${css.replace(/<\/style/gi, '<\\/style')}
</style>
<div id="root"></div>
<script type="module">${safeJs}</script>
`
writeFileSync(out, page)
console.log(`written ${out} (${(page.length / 1024).toFixed(0)} KB)`)
