/* global describe, it, before, after, beforeEach, afterEach */

'use strict'

const assert = require('assert')
const fs = require('fs')
const mkdirp = require('mkdirp')
const nock = require('nock')
const path = require('path')
const rimraf = require('rimraf')

const DatLibrarian = require('.')
const { name } = require('./package.json')

const NOCK_DIR = '.nock'
const RECORD_TESTS = !!process.env.RECORD_TESTS

const recordOrLoadNocks = function () {
  const titles = []
  let test = this.currentTest
  while (test.parent) {
    titles.unshift(test.title)
    if (test.parent) { test = test.parent }
  }
  const dir = path.join(NOCK_DIR, ...titles.slice(0, -1))
  const name = `${titles.slice(-1)[0]}.json`
  this._currentNock = { titles, dir, name }
  if (RECORD_TESTS) {
    nock.recorder.rec({
      output_objects: true,
      dont_print: true
    })
  } else {
    try {
      nock.load(path.join(dir, encodeURIComponent(name)))
    } catch (error) {
      if (error.code === 'ENOENT') {
        // no nock
      } else {
        throw error
      }
    }
  }
}

const concludeNocks = function () {
  if (RECORD_TESTS) {
    // save http requests for future nocking
    const { dir, name } = this._currentNock
    const fixturePath = path.join(dir, encodeURIComponent(name))
    const nockCallObjects = nock.recorder.play()
    mkdirp.sync(dir)
    fs.writeFileSync(fixturePath, JSON.stringify(nockCallObjects), 'utf8')
    nock.restore()
    nock.recorder.clear()
  }
}

describe(name, function () {
  this.timeout(0) // haha, THE NETWORK
  const dir = 'fixtures'
  const link = 'garbados.hashbase.io'

  before(function () {
    nock.disableNetConnect()
    this.librarian = new DatLibrarian({ dir })
  })

  after(async function () {
    await this.librarian.close()
    rimraf.sync(dir)
  })

  beforeEach(function () {
    recordOrLoadNocks.call(this)
  })

  afterEach(async function () {
    concludeNocks.call(this)
  })

  it('should exist', function () {
    assert(this.librarian)
  })

  it('should handle new archives by link', function () {
    return this.librarian.add(link)
  })

  it('should have the new archive in its cache', function () {
    return this.librarian.get(link).then((archive) => {
      const key = archive.key.toString('hex')
      assert(this.librarian.keys.includes(key))
    })
  })

  it('should fail to retrieve archives it has not got', function () {
    // provide a valid link that is not in the cache
    return this.librarian.get('pfrazee.hashbase.io')
      .then(() => {
        throw new Error('electron is a strange omen')
      })
      .catch((e) => {
        assert.strictEqual(e.message, 'not found')
      })
  })

  it('should remove the archive', function () {
    return this.librarian.remove(link).then(() => {
      assert.strictEqual(this.librarian.keys.length, 0)
    })
  })

  it('should re-add, close, and re-load', function () {
    return this.librarian.add(link).then(() => {
      return this.librarian.close()
    }).then(() => {
      return this.librarian.load()
    }).then(() => {
      assert.strictEqual(this.librarian.keys.length, 1)
    })
  })
})
