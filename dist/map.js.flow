// @flow

const { inflate, deflate } = require('pako');
const ObservedRemoveMap = require('observed-remove/dist/map');
const { parser: jsonStreamParser } = require('stream-json/Parser');
const { streamArray: jsonStreamArray } = require('stream-json/streamers/StreamArray');
const LruCache = require('lru-cache');

type Options = {
  maxAge?:number,
  bufferPublishing?:number,
  key?: any,
  format?: string,
  disableSync?: boolean
};

const notSubscribedRegex = /Not subscribed/;

class IpfsObservedRemoveMap<K, V> extends ObservedRemoveMap<K, V> { // eslint-disable-line no-unused-vars
  /**
   * Create an observed-remove CRDT.
   * @param {Object} [ipfs] Object implementing the [core IPFS API](https://github.com/ipfs/interface-ipfs-core#api), most likely a [js-ipfs](https://github.com/ipfs/js-ipfs) or [ipfs-http-client](https://github.com/ipfs/js-ipfs-http-client) object.
   * @param {String} [topic] IPFS pubub topic to use in synchronizing the CRDT.
   * @param {Iterable<V>} [entries=[]] Iterable of initial values
   * @param {Object} [options={}]
   * @param {String} [options.maxAge=5000] Max age of insertion/deletion identifiers
   * @param {String} [options.bufferPublishing=20] Interval by which to buffer 'publish' events
   */
  constructor(ipfs:Object, topic:string, entries?: Iterable<[K, V]>, options?:Options = {}) {
    super(entries, options);
    if (!ipfs) {
      throw new Error("Missing required argument 'ipfs'");
    }
    this.ipfs = ipfs;
    this.topic = topic;
    this.active = true;
    this.disableSync = !!options.disableSync;
    this.boundHandleQueueMessage = this.handleQueueMessage.bind(this);
    this.boundHandleHashMessage = this.handleHashMessage.bind(this);
    this.readyPromise = this.initIpfs();
    this.remoteHashQueue = [];
    this.syncCache = new LruCache(100);
    this.on('set', () => {
      delete this.ipfsHash;
    });
    this.on('delete', () => {
      delete this.ipfsHash;
    });
    this.isLoadingHashes = false;
  }

  /**
   * Resolves when IPFS topic subscriptions are confirmed.
   *
   * @name IpfsObservedRemoveSet#readyPromise
   * @type {Promise<void>}
   * @readonly
   */

  ipfs: Object;
  topic: string;
  readyPromise: Promise<void>;
  active: boolean;
  ipfsId: string;
  disableSync: boolean;
  boundHandleQueueMessage: (message:{from:string, data:Buffer}) => Promise<void>;
  boundHandleHashMessage: (message:{from:string, data:Buffer}) => Promise<void>;
  db: Object;
  ipfsHash: string | void;
  syncCache: LruCache;
  ipfsSyncTimeout: TimeoutID;
  remoteHashQueue: Array<string>;
  isLoadingHashes: boolean;

  async initIpfs() {
    const out = await this.ipfs.id();
    this.ipfsId = out.id;
    this.on('publish', async (queue) => {
      if (!this.active) {
        return;
      }
      try {
        const message = Buffer.from(deflate(JSON.stringify(queue)));
        await this.ipfs.pubsub.publish(this.topic, message);
      } catch (error) {
        this.emit('error', error);
      }
    });
    await this.ipfs.pubsub.subscribe(this.topic, this.boundHandleQueueMessage, { discover: true });
    if (!this.disableSync) {
      await this.ipfs.pubsub.subscribe(`${this.topic}:hash`, this.boundHandleHashMessage, { discover: true });
      this.waitForPeersThenSendHash();
    }
  }

  async waitForPeersThenSendHash():Promise<void> {
    try {
      const peerIds = await this.ipfs.pubsub.peers(this.topic, { timeout: 10000 });
      if (peerIds.length === 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      this.ipfsSync();
    } catch (error) {
      // IPFS connection is closed, don't send join
      if (error.code !== 'ECONNREFUSED') {
        this.emit('error', error);
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
      if (!this.syncCache.has(hash, true)) {
        this.syncCache.set(hash, true);
        await this.ipfs.pubsub.publish(`${this.topic}:hash`, Buffer.from(hash, 'utf8'));
        this.emit('hash', hash);
      }
    } catch (error) {
      this.emit('error', error);
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
    const files = await this.ipfs.add(Buffer.from(JSON.stringify(data)));
    this.ipfsHash = files[0].hash;
    return this.ipfsHash;
  }

  /**
   * Current number of IPFS pubsub peers.
   * @return {number}
   */
  async ipfsPeerCount():Promise<number> {
    const peerIds = await this.ipfs.pubsub.peers(this.topic);
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
        await this.ipfs.pubsub.unsubscribe(this.topic, this.boundHandleQueueMessage);
      } catch (error) {
        if (!notSubscribedRegex.test(error.message)) {
          throw error;
        }
      }
      if (!this.disableSync) {
        try {
          await this.ipfs.pubsub.unsubscribe(`${this.topic}:hash`, this.boundHandleHashMessage);
        } catch (error) {
          if (!notSubscribedRegex.test(error.message)) {
            throw error;
          }
        }
      }
    }
  }

  handleQueueMessage(message:{from:string, data:Buffer}) {
    if (message.from === this.ipfsId) {
      return;
    }
    if (!this.active) {
      return;
    }
    try {
      const queue = JSON.parse(Buffer.from(inflate(message.data)).toString('utf8'));
      this.process(queue);
    } catch (error) {
      this.emit('error', error);
    }
  }

  handleHashMessage(message:{from:string, data:Buffer}) {
    if (!this.active) {
      return;
    }
    if (message.from === this.ipfsId) {
      return;
    }
    const remoteHash = message.data.toString('utf8');
    this.remoteHashQueue.push(remoteHash);
    this.loadIpfsHashes();
  }

  async loadIpfsHashes() {
    if (this.isLoadingHashes) {
      return;
    }
    this.isLoadingHashes = true;
    try {
      while (this.remoteHashQueue.length > 0 && this.active && this.isLoadingHashes) {
        const remoteHash = this.remoteHashQueue.pop();
        if (this.syncCache.has(remoteHash)) {
          continue;
        }
        this.syncCache.set(remoteHash, true);
        await this.loadIpfsHash(remoteHash);
      }
    } catch (error) {
      this.emit('error', error);
    }
    this.isLoadingHashes = false;
    this.ipfsSync();
  }

  async loadIpfsHash(hash:string) {
    const stream = this.ipfs.catReadableStream(hash);
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
      this.emit('error', error);
      return;
    }
    this.process([insertions, deletions]);
  }
}


module.exports = IpfsObservedRemoveMap;
