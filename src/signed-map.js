// @flow

const { inflate, deflate } = require('pako');
const SignedObservedRemoveMap = require('observed-remove/dist/signed-map');
const stringify = require('json-stringify-deterministic');

type Options = {
  maxAge?:number,
  bufferPublishing?:number,
  key?: any,
  format?: string,
  disableSync?: boolean
};

const notSubscribedRegex = /Not subscribed/;

class IpfsSignedObservedRemoveMap<K, V> extends SignedObservedRemoveMap<K, V> { // eslint-disable-line no-unused-vars
  /**
   * Create an observed-remove CRDT.
   * @param {Object} [ipfs] Object implementing the [core IPFS API](https://github.com/ipfs/interface-ipfs-core#api), most likely a [js-ipfs](https://github.com/ipfs/js-ipfs) or [ipfs-http-client](https://github.com/ipfs/js-ipfs-http-client) object.
   * @param {String} [topic] IPFS pubub topic to use in synchronizing the CRDT.
   * @param {Iterable<V>} [entries=[]] Iterable of initial values
   * @param {Object} [options={}]
   * @param {String} [options.maxAge=5000] Max age of insertion/deletion identifiers
   * @param {String} [options.bufferPublishing=20] Interval by which to buffer 'publish' events
   */
  constructor(ipfs:Object, topic:string, entries?: Iterable<[K, V, string, string]>, options?:Options = {}) {
    super(entries, options);
    this.ipfs = ipfs;
    this.topic = topic;
    this.active = true;
    this.disableSync = !!options.disableSync;
    this.boundHandleQueueMessage = this.handleQueueMessage.bind(this);
    this.boundHandleHashMessage = this.handleHashMessage.bind(this);
    this.boundHandleJoinMessage = this.handleJoinMessage.bind(this);
    this.readyPromise = this.initializeIpfs();
    this.processingHash = false;
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
  boundHandleJoinMessage: (message:{from:string, data:Buffer}) => Promise<void>;
  ipfsSyncTimeout: TimeoutID;
  processingHash: boolean;

  /**
   * Return a sorted array containing all of the set's insertions and deletions.
   * @return {[Array<*>, Array<*>]>}
   */
  dump() {
    this.flush();
    const [insertQueue, deleteQueue] = super.dump();
    deleteQueue.sort((x, y) => (x[1] > y[1] ? -1 : 1));
    insertQueue.sort((x, y) => (x[1] > y[1] ? -1 : 1));
    return [insertQueue, deleteQueue];
  }

  async loadIpfsHash(hash:string):Promise<void> {
    try {
      const files = await this.ipfs.get(hash);
      const queue = JSON.parse(files[0].content.toString('utf8'));
      this.process(queue);
    } catch (error) {
      if (this.listenerCount('error') > 0) {
        this.emit('error', error);
      } else {
        throw error;
      }
    }
  }

  async initializeIpfs():Promise<void> {
    this.ipfsId = (await this.ipfs.id()).id;
    this.on('publish', async (queue) => {
      if (!this.active) {
        return;
      }
      try {
        const message = Buffer.from(deflate(stringify(queue)));
        await this.ipfs.pubsub.publish(this.topic, message);
      } catch (error) {
        if (this.listenerCount('error') > 0) {
          this.emit('error', error);
        } else {
          throw error;
        }
      }
    });
    await this.ipfs.pubsub.subscribe(this.topic, this.boundHandleQueueMessage, { discover: true });
    if (!this.disableSync) {
      await this.ipfs.pubsub.subscribe(`${this.topic}:hash`, this.boundHandleHashMessage, { discover: true });
      await this.ipfs.pubsub.subscribe(`${this.topic}:join`, this.boundHandleJoinMessage, { discover: true });
      this.sendJoinMessage();
    }
  }

  async sendJoinMessage():Promise<void> {
    try {
      const peerIds = await this.waitForIpfsPeers();
      if (peerIds.length === 0) {
        return;
      }
      await this.ipfs.pubsub.publish(`${this.topic}:join`, Buffer.from(this.ipfsId, 'utf8'));
    } catch (error) {
      // IPFS connection is closed, don't send join
      if (error.code !== 'ECONNREFUSED') {
        throw error;
      }
    }
  }

  /**
   * Publish an IPFS hash of an array containing all of the object's insertions and deletions.
   * @return {Array<Array<any>>}
   */
  ipfsSync():void {
    clearTimeout(this.ipfsSyncTimeout);
    this.ipfsSyncTimeout = setTimeout(() => this._ipfsSync(), 50); // eslint-disable-line no-underscore-dangle
  }

  async _ipfsSync():Promise<void> { // eslint-disable-line no-underscore-dangle
    try {
      const message = await this.getIpfsHash();
      await this.ipfs.pubsub.publish(`${this.topic}:hash`, Buffer.from(message, 'utf8'));
    } catch (error) {
      if (this.listenerCount('error') > 0) {
        this.emit('error', error);
      } else {
        throw error;
      }
    }
  }

  /**
   * Stores and returns an IPFS hash of the current insertions and deletions
   * @return {Promise<string>}
   */
  async getIpfsHash():Promise<string> {
    const data = this.dump();
    const files = await this.ipfs.add(Buffer.from(stringify(data)));
    return files[0].hash;
  }

  /**
   * Resolves an array of peer ids after one or more IPFS peers connects. Useful for testing.
   * @return {Promise<void>}
   */
  async waitForIpfsPeers():Promise<Array<string>> {
    let peerIds = await this.ipfs.pubsub.peers(this.topic);
    while (this.active && peerIds.length === 0) {
      peerIds = await this.ipfs.pubsub.peers(this.topic);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return peerIds;
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
    clearTimeout(this.ipfsSyncTimeout);
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
        try {
          await this.ipfs.pubsub.unsubscribe(`${this.topic}:join`, this.boundHandleJoinMessage);
        } catch (error) {
          if (!notSubscribedRegex.test(error.message)) {
            throw error;
          }
        }
      }
    }
  }

  async handleQueueMessage(message:{from:string, data:Buffer}) {
    if (!this.active) {
      return;
    }
    if (message.from === this.ipfsId) {
      return;
    }
    try {
      const queue = JSON.parse(Buffer.from(inflate(message.data)).toString('utf8'));
      this.process(queue);
    } catch (error) {
      if (this.listenerCount('error') > 0) {
        this.emit('error', error);
      } else {
        throw error;
      }
    }
  }

  async handleHashMessage(message:{from:string, data:Buffer}) {
    if (message.from === this.ipfsId) {
      return;
    }
    while (this.processingHash) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!this.active) {
      return;
    }
    this.processingHash = true;
    try {
      const remoteHash = message.data.toString('utf8');
      const beforeHash = await this.getIpfsHash();
      if (remoteHash === beforeHash) {
        this.processingHash = false;
        return;
      }
      const remoteFiles = await this.ipfs.get(remoteHash);
      if (!remoteFiles.length === 0) {
        this.processingHash = false;
        return;
      }
      const queue = JSON.parse(remoteFiles[0].content.toString('utf8'));
      this.process(queue);
      const afterHash = await this.getIpfsHash();
      if (beforeHash !== afterHash && afterHash !== remoteHash) {
        await this.ipfs.pubsub.publish(`${this.topic}:hash`, Buffer.from(afterHash, 'utf8'));
      }
      this.processingHash = false;
    } catch (error) {
      this.processingHash = false;
      if (this.listenerCount('error') > 0) {
        this.emit('error', error);
      } else {
        throw error;
      }
    }
  }

  async handleJoinMessage(message:{from:string, data:Buffer}) {
    if (!this.active) {
      return;
    }
    if (message.from === this.ipfsId) {
      return;
    }
    await this.ipfsSync();
  }
}


module.exports = IpfsSignedObservedRemoveMap;
