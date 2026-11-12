/**
 * HTTPS requests that survive a DNS server which can't find R2 (seen 2026-11-12: the laptop's
 * Wi-Fi DNS couldn't resolve *.r2.cloudflarestorage.com while 1.1.1.1 / 8.8.8.8 could). The
 * normal lookup is tried first; on failure the host is resolved through public DNS instead.
 * Node built-ins only.
 */

import { lookup as systemLookup, Resolver } from 'node:dns'
import { createWriteStream } from 'node:fs'
import http from 'node:http'
import https from 'node:https'

const fallback = new Resolver()
fallback.setServers((process.env.LEARN_VIDEO_DNS || '1.1.1.1,8.8.8.8').split(',').map((s) => s.trim()))

function resilientLookup(hostname, options, callback) {
  systemLookup(hostname, options, (err, address, family) => {
    if (!err) return callback(null, address, family)
    fallback.resolve4(hostname, (err4, addresses) => {
      if (err4 || !addresses?.length) return callback(err)
      if (options?.all) return callback(null, addresses.map((a) => ({ address: a, family: 4 })))
      callback(null, addresses[0], 4)
    })
  })
}

/**
 * request(url, { method, headers, body, toFile }) → { status, headers, text?, bytes? }.
 * `toFile` streams the response body to a path (large source videos).
 */
export function request(url, { method = 'GET', headers = {}, body, toFile } = {}) {
  const target = new URL(url)
  const lib = target.protocol === 'http:' ? http : https
  return new Promise((resolve, reject) => {
    const req = lib.request(
      target,
      { method, headers: body ? { 'Content-Length': Buffer.byteLength(body), ...headers } : headers, lookup: resilientLookup },
      (res) => {
        if (toFile && res.statusCode >= 200 && res.statusCode < 300) {
          const out = createWriteStream(toFile)
          res.pipe(out)
          out.on('finish', () => resolve({ status: res.statusCode, headers: res.headers }))
          out.on('error', reject)
          res.on('error', reject)
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const bytes = Buffer.concat(chunks)
          resolve({ status: res.statusCode, headers: res.headers, bytes, text: bytes.toString('utf8') })
        })
        res.on('error', reject)
      }
    )
    req.setTimeout(10 * 60 * 1000, () => req.destroy(new Error('request timed out')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}
