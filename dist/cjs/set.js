"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _observedRemove = require("observed-remove");

var _Parser = require("stream-json/Parser");

var _cids = _interopRequireDefault(require("cids"));

var _StreamArray = require("stream-json/streamers/StreamArray");

var _lruCache = _interopRequireDefault(require("lru-cache"));

var _pQueue = _interopRequireDefault(require("p-queue"));

var _debounce = _interopRequireDefault(require("lodash/debounce"));

var _stream = require("stream");

var _chunkedStreamTransformers = require("@bunchtogether/chunked-stream-transformers");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const notSubscribedRegex = /Not subscribed/;

class IpfsObservedRemoveSet extends _observedRemove.ObservedRemoveSet {
  // eslint-disable-line no-unused-vars

  /**
   * Create an observed-remove CRDT.
   * @param {Object} [ipfs] Object implementing the [core IPFS API](https://github.com/ipfs/interface-ipfs-core#api), most likely a [js-ipfs](https://github.com/ipfs/js-ipfs) or [ipfs-http-client](https://github.com/ipfs/js-ipfs-http-client) object.
   * @param {String} [topic] IPFS pubub topic to use in synchronizing the CRDT.
   * @param {Iterable<V>} [entries=[]] Iterable of initial values
   * @param {Object} [options={}]
   * @param {String} [options.maxAge=5000] Max age of insertion/deletion identifiers
   * @param {String} [options.bufferPublishing=20] Interval by which to buffer 'publish' events
   */
  constructor(ipfs, topic, entries, options = {}) {
    super(entries, options);

    if (!ipfs) {
      throw new Error("Missing required argument 'ipfs'");
    }

    this.chunkPubSub = !!options.chunkPubSub;
    this.ipfs = ipfs;
    this.abortController = new AbortController();
    this.topic = topic;
    this.active = true;
    this.disableSync = !!options.disableSync;
    this.boundHandleQueueMessage = this.handleQueueMessage.bind(this);
    this.boundHandleHashMessage = this.handleHashMessage.bind(this);
    this.readyPromise = this.initIpfs();
    this.remoteHashQueue = [];
    this.syncCache = new _lruCache.default(100);
    this.peersCache = new _lruCache.default({
      max: 100,
      maxAge: 1000 * 60
    });
    this.hasNewPeers = false;
    this.on('add', () => {
      delete this.ipfsHash;
    });
    this.on('delete', () => {
      delete this.ipfsHash;
    });
    this.isLoadingHashes = false;
    this.debouncedIpfsSync = (0, _debounce.default)(this.ipfsSync.bind(this), 1000);
    this.serializeTransform = new _chunkedStreamTransformers.SerializeTransform({
      autoDestroy: false,
      maxChunkSize: 1024 * 512
    });
    this.serializeTransform.on('data', async messageSlice => {
      try {
        await this.ipfs.pubsub.publish(this.topic, messageSlice, {
          signal: this.abortController.signal
        });
      } catch (error) {
        if (error.type !== 'aborted') {
          this.emit('error', error);
        }
      }
    });
    this.serializeTransform.on('error', error => {
      this.emit('error', error);
    });
    this.deserializeTransform = new _chunkedStreamTransformers.DeserializeTransform({
      autoDestroy: false,
      timeout: 10000
    });
    this.deserializeTransform.on('error', error => {
      this.emit('error', error);
    });
    this.deserializeTransform.on('data', message => {
      try {
        const queue = JSON.parse(message.toString('utf8'));
        this.process(queue);
      } catch (error) {
        this.emit('error', error);
      }
    });
    this.hashLoadQueue = new _pQueue.default({});
    this.hashLoadQueue.on('idle', () => {
      if (this.hasNewPeers) {
        this.debouncedIpfsSync();
      }

      this.emit('hashesloaded');
    });
  }
  /**
   * Resolves when IPFS topic subscriptions are confirmed.
   *
   * @name IpfsObservedRemoveSet#readyPromise
   * @type {Promise<void>}
   * @readonly
   */


  async initIpfs() {
    try {
      const {
        id
      } = await this.ipfs.id({
        signal: this.abortController.signal
      });
      this.ipfsId = id;
    } catch (error) {
      if (error.type !== 'aborted') {
        throw error;
      }

      return;
    }

    this.on('publish', async queue => {
      if (!this.active) {
        return;
      }

      if (this.chunkPubSub) {
        const message = Buffer.from(JSON.stringify(queue));
        this.serializeTransform.write(message);
      } else {
        try {
          const message = Buffer.from(JSON.stringify(queue));
          await this.ipfs.pubsub.publish(this.topic, message, {
            signal: this.abortController.signal
          });
        } catch (error) {
          if (error.type !== 'aborted') {
            this.emit('error', error);
          }
        }
      }
    });

    try {
      await this.ipfs.pubsub.subscribe(this.topic, this.boundHandleQueueMessage, {
        discover: true,
        signal: this.abortController.signal
      });

      if (!this.disableSync) {
        await this.ipfs.pubsub.subscribe(`${this.topic}:hash`, this.boundHandleHashMessage, {
          discover: true,
          signal: this.abortController.signal
        });
        this.waitForPeersThenSendHash();
      }
    } catch (error) {
      if (error.type !== 'aborted') {
        throw error;
      }
    }
  }

  async waitForPeers() {
    while (true) {
      try {
        const peerIds = await this.ipfs.pubsub.peers(this.topic, {
          timeout: 10000,
          signal: this.abortController.signal
        });

        if (this.abortController.signal.aborted) {
          return;
        }

        if (peerIds.length > 0) {
          break;
        }
      } catch (error) {
        if (error.name === 'TimeoutError') {
          continue;
        }

        throw error;
      }
    }

    if (this.disableSync) {
      return;
    }

    while (true) {
      try {
        const peerIds = await this.ipfs.pubsub.peers(`${this.topic}:hash`, {
          timeout: 10000,
          signal: this.abortController.signal
        });

        if (this.abortController.signal.aborted) {
          return;
        }

        if (peerIds.length > 0) {
          break;
        }
      } catch (error) {
        if (error.name === 'TimeoutError') {
          continue;
        }

        throw error;
      }
    }
  }

  async waitForPeersThenSendHash() {
    if (!this.active) {
      return;
    }

    try {
      const peerIds = await this.ipfs.pubsub.peers(this.topic, {
        timeout: 10000,
        signal: this.abortController.signal
      });

      if (peerIds.length > 0) {
        this.debouncedIpfsSync();
      } else {
        await new Promise(resolve => setTimeout(resolve, 10000));
        queueMicrotask(() => {
          this.waitForPeersThenSendHash();
        });
      }
    } catch (error) {
      // IPFS connection is closed or timed out, don't send join
      if (error.type !== 'aborted' && error.code !== 'ECONNREFUSED' && error.name !== 'TimeoutError') {
        this.emit('error', error);
      }

      if (this.active && error.name === 'TimeoutError') {
        queueMicrotask(() => {
          this.waitForPeersThenSendHash();
        });
      }
    }
  }
  /**
   * Publish an IPFS hash of an array containing all of the object's insertions and deletions.
   * @return {Array<Array<any>>}
   */


  async ipfsSync() {
    if (!this.active) {
      return;
    }

    try {
      const hash = await this.getIpfsHash();

      if (!this.active) {
        return;
      }

      if (!this.syncCache.has(hash, true) || this.hasNewPeers) {
        this.hasNewPeers = false;
        this.syncCache.set(hash, true);
        await this.ipfs.pubsub.publish(`${this.topic}:hash`, Buffer.from(hash, 'utf8'), {
          signal: this.abortController.signal
        });
        this.emit('hash', hash);
      }
    } catch (error) {
      if (error.type !== 'aborted') {
        this.emit('error', error);
      }
    }
  }
  /**
   * Return a sorted array containing all of the set's insertions and deletions.
   * @return {[Array<*>, Array<*>]>}
   */


  dump() {
    this.flush();
    const [insertQueue, deleteQueue] = super.dump();
    deleteQueue.sort((x, y) => x[0] > y[0] ? -1 : 1);
    insertQueue.sort((x, y) => x[0] > y[0] ? -1 : 1);
    return [insertQueue, deleteQueue];
  }
  /**
   * Stores and returns an IPFS hash of the current insertions and deletions
   * @return {Promise<string>}
   */


  async getIpfsHash() {
    if (this.ipfsHash) {
      return this.ipfsHash;
    }

    const data = this.dump();
    const file = await this.ipfs.add(Buffer.from(JSON.stringify(data)), {
      wrapWithDirectory: false,
      recursive: false,
      pin: false,
      signal: this.abortController.signal
    });
    this.ipfsHash = file.cid.toString();
    return this.ipfsHash;
  }
  /**
   * Current number of IPFS pubsub peers.
   * @return {number}
   */


  async ipfsPeerCount() {
    const peerIds = await this.ipfs.pubsub.peers(this.topic, {
      signal: this.abortController.signal
    });
    return peerIds.length;
  }
  /**
   * Gracefully shutdown
   * @return {void}
   */


  async shutdown() {
    this.active = false; // Catch exceptions here as pubsub is sometimes closed by process kill signals.

    if (this.ipfsId) {
      try {
        const unsubscribeAbortController = new AbortController();
        const timeout = setTimeout(() => {
          unsubscribeAbortController.abort();
        }, 5000);
        await this.ipfs.pubsub.unsubscribe(this.topic, this.boundHandleQueueMessage, {
          signal: unsubscribeAbortController.signal
        });

        if (!this.disableSync) {
          await this.ipfs.pubsub.unsubscribe(`${this.topic}:hash`, this.boundHandleHashMessage, {
            signal: unsubscribeAbortController.signal
          });
        }

        clearTimeout(timeout);
      } catch (error) {
        if (!notSubscribedRegex.test(error.message)) {
          this.abortController.abort();
          this.abortController = new AbortController();
          throw error;
        }
      }
    }

    this.abortController.abort();
    this.abortController = new AbortController();
  }

  handleQueueMessage(message) {
    if (message.from === this.ipfsId) {
      return;
    }

    if (!this.active) {
      return;
    }

    if (this.chunkPubSub) {
      this.deserializeTransform.write(message.data);
    } else {
      try {
        const queue = JSON.parse(Buffer.from(message.data).toString('utf8'));
        this.process(queue);
      } catch (error) {
        this.emit('error', error);
      }
    }
  }

  handleHashMessage(message) {
    if (!this.active) {
      return;
    }

    if (message.from === this.ipfsId) {
      return;
    }

    if (!this.peersCache.has(message.from)) {
      this.hasNewPeers = true;
      this.peersCache.set(message.from, true);
    }

    const remoteHash = Buffer.from(message.data).toString('utf8');

    if (this.syncCache.has(remoteHash)) {
      return;
    }

    this.syncCache.set(remoteHash, true);

    try {
      this.hashLoadQueue.add(() => this.loadIpfsHash(remoteHash));
    } catch (error) {
      this.emit('error', error);
    }
  }

  async loadIpfsHash(hash) {
    // $FlowFixMe
    const stream = _stream.Readable.from(this.ipfs.cat(new _cids.default(hash), {
      timeout: 30000,
      signal: this.abortController.signal
    }));

    const parser = (0, _Parser.parser)();
    const streamArray = (0, _StreamArray.streamArray)();
    const pipeline = stream.pipe(parser);
    let arrayDepth = 0;
    let streamState = 0;
    let insertions = [];
    let deletions = [];
    streamArray.on('data', ({
      value
    }) => {
      if (streamState === 1) {
        insertions.push(value);
      } else if (streamState === 3) {
        deletions.push(value);
      }

      if (insertions.length + deletions.length < 1000) {
        return;
      }

      const i = insertions;
      const d = deletions;
      insertions = [];
      deletions = [];
      this.process([i, d], true);
    });

    try {
      await new Promise((resolve, reject) => {
        stream.on('error', error => {
          reject(error);
        });
        streamArray.on('error', error => {
          reject(error);
        });
        pipeline.on('error', error => {
          reject(error);
        });
        pipeline.on('end', () => {
          resolve();
        });
        pipeline.on('data', data => {
          const {
            name
          } = data;

          if (name === 'startArray') {
            arrayDepth += 1;

            if (arrayDepth === 2) {
              streamState += 1;
            }
          }

          if (streamState === 1 || streamState === 3) {
            streamArray.write(data);
          }

          if (name === 'endArray') {
            if (arrayDepth === 2) {
              streamState += 1;
            }

            arrayDepth -= 1;
          }
        });
      });
    } catch (error) {
      if (error.type !== 'aborted') {
        this.emit('error', error);
      }

      return;
    }

    this.process([insertions, deletions]);
  }

}

exports.default = IpfsObservedRemoveSet;
//# sourceMappingURL=set.js.map