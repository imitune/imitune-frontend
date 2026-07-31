'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const packageJson = require('../package.json')
const appPath = path.resolve(
  __dirname,
  '../src-tauri/target/universal-apple-darwin/release/bundle/macos/ThatSoundsLikeMe.app',
)
const outputDirectory = path.resolve(__dirname, '../dist')
const outputPath = path.join(
  outputDirectory,
  `ThatSoundsLikeMe-${packageJson.version}-mac-universal.zip`,
)

if (!fs.existsSync(appPath)) {
  throw new Error(`The universal application bundle does not exist: ${appPath}`)
}

fs.mkdirSync(outputDirectory, { recursive: true })
fs.rmSync(outputPath, { force: true })

const result = spawnSync(
  '/usr/bin/ditto',
  ['-c', '-k', '--sequesterRsrc', '--keepParent', path.basename(appPath), outputPath],
  { cwd: path.dirname(appPath), stdio: 'inherit' },
)
if (result.status !== 0) {
  throw new Error(`ditto exited with status ${result.status}`)
}
process.stdout.write(`${outputPath}\n`)
