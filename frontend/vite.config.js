import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// [2.37.0] version.json генерируется при каждом билде.
// Клиент сравнивает свой __BUILD_ID__ с серверным buildId, чтобы
// узнать о новой версии без ручного «нажми сюда».
const BUILD_ID = `${Date.now()}`

function versionJsonPlugin(buildId) {
  return {
    name: 'version-json',
    apply: 'build',
    closeBundle() {
      const payload = {
        buildId,
        builtAt: new Date().toISOString(),
      }
      const target = resolve(process.cwd(), 'dist', 'version.json')
      try {
        writeFileSync(target, JSON.stringify(payload))
        console.log(`[version-json] ${buildId} → dist/version.json`)
      } catch (err) {
        console.warn('[version-json] не удалось записать:', err.message)
      }
    },
  }
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [react(), versionJsonPlugin(BUILD_ID)],
})