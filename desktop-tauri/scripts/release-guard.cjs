'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function hasEnvironmentValue(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0
}

function hasMacSigningIdentity() {
  if (hasEnvironmentValue('APPLE_SIGNING_IDENTITY')) return true
  try {
    const identities = execFileSync(
      'security',
      ['find-identity', '-v', '-p', 'codesigning'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return identities.includes('Developer ID Application:')
  } catch {
    return false
  }
}

function hasMacNotarizationCredentials() {
  const apiKey = ['APPLE_API_KEY', 'APPLE_API_ISSUER', 'APPLE_API_KEY_PATH'].every(hasEnvironmentValue)
  const appleId = ['APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID'].every(hasEnvironmentValue)
  return apiKey || appleId
}

function guardMac() {
  if (!hasMacSigningIdentity()) {
    throw new Error('A Developer ID Application certificate or APPLE_SIGNING_IDENTITY is required.')
  }
  if (!hasMacNotarizationCredentials()) {
    throw new Error('Apple notarization credentials are required for a MuseHub release.')
  }
}

function guardWindows() {
  const configPath = path.resolve(__dirname, '../src-tauri/tauri.windows.release.conf.json')
  if (!fs.existsSync(configPath)) {
    throw new Error('Create src-tauri/tauri.windows.release.conf.json from the provided example.')
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const windows = config?.bundle?.windows
  if (!windows?.signCommand && !windows?.certificateThumbprint) {
    throw new Error('The Windows release config must define signCommand or certificateThumbprint.')
  }
  if (windows?.certificateThumbprint === 'REPLACE_WITH_CERTIFICATE_THUMBPRINT') {
    throw new Error('Replace the example Windows certificate thumbprint before building.')
  }
  if (windows?.certificateThumbprint && windows?.digestAlgorithm !== 'sha256') {
    throw new Error('The Windows release must use the SHA-256 digest algorithm.')
  }
  if (windows?.certificateThumbprint && !windows?.timestampUrl) {
    throw new Error('The Windows release must configure a trusted timestamp URL.')
  }
}

try {
  const platform = process.argv[2]
  if (platform === 'mac') guardMac()
  else if (platform === 'win') guardWindows()
  else throw new Error('Usage: node scripts/release-guard.cjs <mac|win>')
  process.stdout.write(`Release credentials are configured for ${platform}.\n`)
} catch (error) {
  process.stderr.write(`Release build blocked: ${error.message}\n`)
  process.exitCode = 1
}
