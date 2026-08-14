'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const packageJson = require('../package.json')
const sourcePath = path.resolve(
  __dirname,
  `../src-tauri/target/universal-apple-darwin/release/bundle/dmg/ThatSoundsLikeMe_${packageJson.version}_universal.dmg`,
)
const outputDirectory = path.resolve(__dirname, '../dist')
const outputName = `ThatSoundsLikeMe_${packageJson.version}_mac-universal.dmg`
const outputPath = path.join(outputDirectory, outputName)

if (!fs.existsSync(sourcePath)) {
  throw new Error(`The universal signed DMG does not exist: ${sourcePath}`)
}

fs.mkdirSync(outputDirectory, { recursive: true })
fs.copyFileSync(sourcePath, outputPath)

const digest = crypto.createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex')
fs.writeFileSync(`${outputPath}.sha256`, `${digest}  ${outputName}\n`)

process.stdout.write(`${outputPath}\n${outputPath}.sha256\n`)
