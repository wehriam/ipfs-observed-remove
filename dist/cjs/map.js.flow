// @flow

import ObservedRemoveMap from 'observed-remove/map';
import { parser as jsonStreamParser } from 'stream-json/Parser';
import CID from 'cids';
import { streamArray as jsonStreamArray } from 'stream-json/streamers/StreamArray';
import LruCache from 'lru-cache';
import PQueue from 'p-queue';
import debounce from 'lodash/debounce';
import { Readable } from 'stream';
import {
  SerializeTransform,
  DeserializeTransform,
} from '@bunchtogether/chunked-stream-transformers';

type Options = {
  maxAge?:number,
  bufferPublishing?:number,
  key?: any,
  disableSync?: boolean,
  chunkPubSub?: boolean
};

const notSubscribedRegex = /Not subscribed/;

export default class IpfsObservedRemoveMap<K, V> extends ObservedRemoveMap<K, V> { // eslint-disable-line no-unused-vars
  /**
   * Create an observed-remove CRDT.
   * @param {Object} [ipfs] Object implementing the [core IPFS API](https://github.com/ipfs/interface-ipfs-core#api), most likely a [js-ipfs](https://github.com/ipfs/js-ipfs) or [ipfs-http-client](https://github.com/ipfs/js-ipfs-http-client) object.
   * @param {String} [topic] IPFS pubub topic to use in synchronizing the CRDT.
   * @param {Iterable<V>} [entries=[]] Iterable of initial values
   * @param {Object} [options={}]
   * @param {String} [options.maxAge=5000] Max age of insertion/deletion identifiers
   * @param {String} [options.bufferPublishing=20] Interval by which to buffer 'publish' events
   * @param {boolean} [options.chunkPubSub=false] Chunk pubsub messages for values greater than 1 MB
   */
  constructor(ipfs:Object, topic:string, entries?: Iterable<[K, V]>, options?:Options = {}) {
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
    this.syncCache = new LruCache(100);
    this.peersCache = new LruCache({
      max: 100,
      maxAge: 1000 * 60,
    });
    this.hasNewPeers = false;
    this.on('set', () => {
      delete this.ipfsHash;
    });
    this.on('delete', () => {
      delete this.ipfsHash;
    });
    this.isLoadingHashes = false;
    this.debouncedIpfsSync = debounce(this.ipfsSync.bind(this), 1000);
    this.serializeTransform = new SerializeTransform({
      autoDestroy: false,
      maxChunkSize: 1024 * 512,
    });
    this.serializeTransform.on('data', async (messageSlice) => {
      try {
        await this.ipfs.pubsub.publish(this.topic, messageSlice, { signal: this.abortController.signal });
      } catch (error) {
        if (error.type !== 'aborted') {
          this.emit('error', error);
        }
      }
    });
    this.serializeTransform.on('error', (error) => {
      this.emit('error', error);
    });
    this.deserializeTransform = new DeserializeTransform({
      autoDestroy: false,
      timeout: 10000,
    });
    this.deserializeTransform.on('error', (error) => {
      this.emit('error', error);
    });
    this.deserializeTransform.on('data', (message) => {
      try {
        const queue = JSON.parse(message.toString('utf8'));
        this.process(queue);
      } catch (error) {
        this.emit('error', error);
      }
    });
    this.hashLoadQueue = new PQueue({});
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

  declare ipfs: Object;
  declare topic: string;
  declare readyPromise: Promise<void>;
  declare active: boolean;
  declare ipfsId: string;
  declare disableSync: boolean;
  declare boundHandleQueueMessage: (message:{from:string, data:Buffer}) => Promise<void>;
  declare boundHandleHashMessage: (message:{from:string, data:Buffer}) => Promise<void>;
  declare db: Object;
  declare ipfsHash: string | void;
  declare syncCache: LruCache;
  declare peersCache: LruCache;
  declare hasNewPeers: boolean;
  declare isLoadingHashes: boolean;
  declare debouncedIpfsSync: () => Promise<void>;
  declare abortController: AbortController;
  declare chunkPubSub: boolean;
  declare serializeTransform: SerializeTransform;
  declare deserializeTransform: DeserializeTransform;
  declare hashLoadQueue: PQueue;

  async initIpfs() {
    try {
      const { id } = await this.ipfs.id({ signal: this.abortController.signal });
      this.ipfsId = id;
    } catch (error) {
      if (error.type !== 'aborted') {
        throw error;
      }
      return;
    }
    this.on('publish', async (queue) => {
      if (!this.active) {
        return;
      }
      if (this.chunkPubSub) {
        const message = Buffer.from(JSON.stringify(queue));
        this.serializeTransform.write(message);
      } else {
        try {
          const message = Buffer.from(JSON.stringify(queue));
          await this.ipfs.pubsub.publish(this.topic, message, { signal: this.abortController.signal });
        } catch (error) {
          if (error.type !== 'aborted') {
            this.emit('error', error);
          }
        }
      }
    });
    try {
      await this.ipfs.pubsub.subscribe(this.topic, this.boundHandleQueueMessage, { discover: true, signal: this.abortController.signal });
      if (!this.disableSync) {
        await this.ipfs.pubsub.subscribe(`${this.topic}:hash`, this.boundHandleHashMessage, { discover: true, signal: this.abortController.signal });
        this.waitForPeersThenSendHash();
      }
    } catch (error) {
      if (error.type !== 'aborted') {
        throw error;
      }
    }
  }

  async waitForPeers():Promise<void> {
    while (true) {
      try {
        const peerIds = await this.ipfs.pubsub.peers(this.topic, { timeout: 10000, signal: this.abortController.signal });
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
        const peerIds = await this.ipfs.pubsub.peers(`${this.topic}:hash`, { timeout: 10000, signal: this.abortController.signal });
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

  async waitForPeersThenSendHash():Promise<void> {
    if (!this.active) {
      return;
    }

    try {
      const peerIds = await this.ipfs.pubsub.peers(this.topic, { timeout: 10000, signal: this.abortController.signal });
      if (peerIds.length > 0) {
        this.debouncedIpfsSync();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 10000));
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
        this.syncCache.set(hash, true);
        await this.ipfs.pubsub.publish(`${this.topic}:hash`, Buffer.from(hash, 'utf8'), { signal: this.abortController.signal });
        this.emit('hash', hash);
      }
      this.hasNewPeers = false;
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
    deleteQueue.sort((x, y) => (x[0] > y[0] ? -1 : 1));
    insertQueue.sort((x, y) => (x[0] > y[0] ? -1 : 1));
    return [insertQueue, deleteQueue];
  }

  /**
   * Stores and returns an IPFS hash of the current insertions and deletions
   * @return {Promise<string>}
   */
  async getIpfsHash():Promise<string> {
    if (this.ipfsHash) {
      return this.ipfsHash;
    }

    const data = this.dump();
    const file = await this.ipfs.add(Buffer.from(JSON.stringify(data)), { wrapWithDirectory: false, recursive: false, pin: false, signal: this.abortController.signal });
    this.ipfsHash = file.cid.toString();
    return this.ipfsHash;
  }

  /**
   * Current number of IPFS pubsub peers.
   * @return {number}
   */
  async ipfsPeerCount():Promise<number> {
    const peerIds = await this.ipfs.pubsub.peers(this.topic, { signal: this.abortController.signal });
    return peerIds.length;
  }

  /**
   * Gracefully shutdown
   * @return {void}
   */
  async shutdown(): Promise<void> {
    this.active = false;
    // Catch exceptions here as pubsub is sometimes closed by process kill signals.
    if (this.ipfsId) {
      try {
        const unsubscribeAbortController = new AbortController();
        const timeout = setTimeout(() => {
          unsubscribeAbortController.abort();
        }, 5000);
        await this.ipfs.pubsub.unsubscribe(this.topic, this.boundHandleQueueMessage, { signal: unsubscribeAbortController.signal });
        if (!this.disableSync) {
          await this.ipfs.pubsub.unsubscribe(`${this.topic}:hash`, this.boundHandleHashMessage, { signal: unsubscribeAbortController.signal });
        }
        clearTimeout(timeout);
      } catch (error) {
        if (!notSubscribedRegex.test(error.message)) {
          this.abortController.abort();
          throw error;
        }
      }
    }
    this.abortController.abort();
    await this.deserializeTransform.onIdle();
    this.serializeTransform.destroy();
    this.deserializeTransform.destroy();
  }

  handleQueueMessage(message:{from:string, data:Buffer}) {
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

  handleHashMessage(message:{from:string, data:Buffer}) {
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

  async loadIpfsHash(hash:string) {
    // $FlowFixMe
    const stream = Readable.from(this.ipfs.cat(new CID(hash), { timeout: 30000, signal: this.abortController.signal })); // eslint-disable-line new-cap
    const parser = jsonStreamParser();
    const streamArray = jsonStreamArray();
    const pipeline = stream.pipe(parser);
    let arrayDepth = 0;
    let streamState = 0;
    let insertions = [];
    let deletions = [];
    streamArray.on('data', ({ value }) => {
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
        stream.on('error', (error) => {
          reject(error);
        });
        streamArray.on('error', (error) => {
          reject(error);
        });
        pipeline.on('error', (error) => {
          reject(error);
        });
        pipeline.on('end', () => {
          resolve();
        });
        pipeline.on('data', (data) => {
          const { name } = data;
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

