// @flow

const { ObservedRemoveSet } = require('observed-remove');
const { gzip, gunzip } = require('./lib/gzip');

type Options = {
  maxAge?:number,
  bufferPublishing?:number
};

const notSubscribedRegex = /Not subscribed/;

/**
 * Class representing a IPFS Observed Remove Set
 *
 * Implements all methods and iterators of the native `Set` object and the 'ObservedRemovedSet' class in addition to the following.
 *
 * See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set}
 *
 * See: {@link https://github.com/wehriam/observed-remove#set-api}
 */
class IpfsObservedRemoveSet<T> extends ObservedRemoveSet<T> {
  /**
   * Create an observed-remove set.
   * @param {Object} [ipfs] Object implementing the [core IPFS API](https://github.com/ipfs/interface-ipfs-core#api), most likely a [js-ipfs](https://github.com/ipfs/js-ipfs) or [js-ipfs-api](https://github.com/ipfs/js-ipfs-api) object.
   * @param {String} [topic] IPFS pubub topic to use in synchronizing the set.
   * @param {Iterable<V>} [entries=[]] Iterable of initial values
   * @param {Object} [options={}]
   * @param {String} [options.maxAge=5000] Max age of insertion/deletion identifiers
   * @param {String} [options.bufferPublishing=20] Interval by which to buffer 'publish' events
   */
  constructor(ipfs:Object, topic:string, entries?: Iterable<T>, options?:Options = {}) {
    super(entries, options);
    this.ipfs = ipfs;
    this.topic = topic;
    this.active = true;
    this.boundHandleQueueMessage = this.handleQueueMessage.bind(this);
    this.boundHandleHashMessage = this.handleHashMessage.bind(this);
    this.boundHandleJoinMessage = this.handleJoinMessage.bind(this);
    this.readyPromise = this.initializeIpfs();
    this.sendJoinMessage();
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

  async initializeIpfs():Promise<void> {
    this.ipfsId = (await this.ipfs.id()).id;
    this.on('publish', async (queue) => {
      this.ipfs.pubsub.publish(this.topic, await gzip(JSON.stringify(queue)));
    });
    await this.ipfs.pubsub.subscribe(this.topic, { discover: true }, this.boundHandleQueueMessage);
    await this.ipfs.pubsub.subscribe(`${this.topic}:hash`, { discover: true }, this.boundHandleHashMessage);
    await this.ipfs.pubsub.subscribe(`${this.topic}:join`, { discover: true }, this.boundHandleJoinMessage);
  }

  async sendJoinMessage():Promise<void> {
    try {
      const peerIds = await this.waitForIpfsPeers();
      if (peerIds.length === 0) {
        return;
      }
      const peerId = peerIds[Math.floor(Math.random() * peerIds.length)];
      this.ipfs.pubsub.publish(`${this.topic}:join`, Buffer.from(peerId, 'utf8'));
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
  async ipfsSync():Promise<void> {
    this.ipfs.pubsub.publish(`${this.topic}:hash`, Buffer.from(await this.getIpfsHash(), 'utf8'));
  }

  /**
   * Return a sorted array containing all of the object's insertions and deletions.
   * @return {Array<Array<any>>}
   */
  dump() {
    this.flush();
    const data = super.dump();
    data.sort((x, y) => {
      if (x[0] !== y[0]) {
        return x[0] > y[0] ? -1 : 1;
      }
      if (!!x[1] !== !!y[1]) {
        return x[1] ? 1 : -1;
      }
      return 0;
    });
    return data;
  }

  /**
   * Stores and returns an IPFS hash of the current insertions and deletions
   * @return {Promise<string>}
   */
  async getIpfsHash():Promise<string> {
    const data = this.dump();
    const files = await this.ipfs.files.add(Buffer.from(JSON.stringify(data)));
    return files[0].hash;
  }

  /**
   * Resolves an array of peer ids after one or more IPFS peers connects. Useful for testing.
   * @return {Promise<void>}
   */
  async waitForIpfsPeers():Promise<Array<string>> {
    let peerIds = await this.ipfs.pubsub.peers(this.topic);
    while (this.active && peerIds.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      peerIds = await this.ipfs.pubsub.peers(this.topic);
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
  async shutdown():Promise<void> {
    this.active = false;
    // Catch exceptions here as pubsub is sometimes closed by process kill signals.
    if (this.ipfsId) {
      try {
        this.ipfs.pubsub.unsubscribe(this.topic, this.boundHandleQueueMessage);
      } catch (error) {
        if (!notSubscribedRegex.test(error.message)) {
          throw error;
        }
      }
      try {
        this.ipfs.pubsub.unsubscribe(`${this.topic}:hash`, this.boundHandleHashMessage);
      } catch (error) {
        if (!notSubscribedRegex.test(error.message)) {
          throw error;
        }
      }
      try {
        this.ipfs.pubsub.unsubscribe(`${this.topic}:join`, this.boundHandleJoinMessage);
      } catch (error) {
        if (!notSubscribedRegex.test(error.message)) {
          throw error;
        }
      }
    }
  }

  async handleQueueMessage(message:{from:string, data:Buffer}) {
    if (message.from === this.ipfsId) {
      return;
    }
    const queue = JSON.parse(await gunzip(message.data));
    this.process(queue);
  }

  async handleHashMessage(message:{from:string, data:Buffer}) {
    if (message.from === this.ipfsId) {
      return;
    }
    const remoteHash = message.data.toString('utf8');
    const remoteFiles = await this.ipfs.files.get(remoteHash);
    const queue = JSON.parse(remoteFiles[0].content.toString('utf8'));
    const beforeHash = await this.getIpfsHash();
    this.process(queue);
    const afterHash = await this.getIpfsHash();
    if (beforeHash !== afterHash && afterHash !== remoteHash) {
      this.ipfs.pubsub.publish(`${this.topic}:hash`, Buffer.from(afterHash, 'utf8'));
    }
  }

  async handleJoinMessage(message:{from:string, data:Buffer}) {
    if (message.from === this.ipfsId) {
      return;
    }
    const peerId = message.data.toString('utf8');
    if (this.ipfsId === peerId) {
      this.ipfsSync();
    }
  }
}

module.exports = IpfsObservedRemoveSet;
