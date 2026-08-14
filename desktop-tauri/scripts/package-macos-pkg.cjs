'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const packageJson = require('../package.json')
const appPath = path.resolve(
  __dirname,
  '../src-tauri/target/universal-apple-darwin/release/bundle/macos/ThatSoundsLikeMe.app',
)
const outputDirectory = path.resolve(__dirname, '../dist')
const outputName = `ThatSoundsLikeMe_${packageJson.version}_mac-universal.pkg`
const outputPath = path.join(outputDirectory, outputName)
const profile = process.env.APPLE_NOTARY_KEYCHAIN_PROFILE?.trim()

function run(command, args, options = {}) {
  return execFileSync(command, args, { stdio: 'inherit', ...options })
}

function findInstallerIdentity() {
  const identities = execFileSync('security', ['find-identity', '-v'], { encoding: 'utf8' })
  const configured = process.env.APPLE_INSTALLER_SIGNING_IDENTITY?.trim()
  if (configured) {
    if (!identities.includes(configured)) {
      throw new Error(`The configured Developer ID Installer identity is not installed: ${configured}`)
    }
    return configured
  }

  const matches = [...identities.matchAll(/"(Developer ID Installer:[^"]+)"/g)].map(
    (match) => match[1],
  )
  if (matches.length !== 1) {
    throw new Error(
      `Expected one Developer ID Installer identity, found ${matches.length}. Set APPLE_INSTALLER_SIGNING_IDENTITY explicitly.`,
    )
  }
  return matches[0]
}

function verifyApplicationBundle() {
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])

  const signature = spawnSync('codesign', ['-dv', '--verbose=4', appPath], {
    encoding: 'utf8',
  })
  const signatureDetails = `${signature.stdout ?? ''}${signature.stderr ?? ''}`
  if (signature.status !== 0 || !signatureDetails.includes('Authority=Developer ID Application:')) {
    throw new Error('The application bundle is not signed with a Developer ID Application identity.')
  }
  if (!signatureDetails.includes('flags=0x10000(runtime)')) {
    throw new Error('The application bundle is not signed with the hardened runtime enabled.')
  }

  const architectures = execFileSync(
    'lipo',
    ['-archs', path.join(appPath, 'Contents/MacOS/thatsoundslikeme-tauri')],
    { encoding: 'utf8' },
  )
  if (!architectures.includes('arm64') || !architectures.includes('x86_64')) {
    throw new Error(`The application bundle is not universal: ${architectures.trim()}`)
  }
}

if (!fs.existsSync(appPath)) {
  throw new Error(`The signed universal application bundle does not exist: ${appPath}`)
}
if (!profile) {
  throw new Error('APPLE_NOTARY_KEYCHAIN_PROFILE must name a validated notarytool profile.')
}

const installerIdentity = findInstallerIdentity()
fs.mkdirSync(outputDirectory, { recursive: true })
fs.rmSync(outputPath, { force: true })
fs.rmSync(`${outputPath}.sha256`, { force: true })

verifyApplicationBundle()
run('productbuild', [
  '--sign',
  installerIdentity,
  '--component',
  appPath,
  '/Applications',
  outputPath,
])
run('pkgutil', ['--check-signature', outputPath])

const notarization = JSON.parse(
  execFileSync(
    'xcrun',
    [
      'notarytool',
      'submit',
      outputPath,
      '--keychain-profile',
      profile,
      '--wait',
      '--output-format',
      'json',
    ],
    { encoding: 'utf8' },
  ),
)
if (notarization.status !== 'Accepted') {
  throw new Error(
    `Apple notarization did not accept the PKG (submission ${notarization.id}, status ${notarization.status}).`,
  )
}
process.stdout.write(`Apple notarization accepted: ${notarization.id}\n`)

run('xcrun', ['stapler', 'staple', outputPath])
run('xcrun', ['stapler', 'validate', outputPath])
run('pkgutil', ['--check-signature', outputPath])
run('spctl', ['--assess', '--type', 'install', '--verbose=4', outputPath])

const digest = crypto.createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex')
fs.writeFileSync(`${outputPath}.sha256`, `${digest}  ${outputName}\n`)

process.stdout.write(`${outputPath}\n${outputPath}.sha256\n`)
