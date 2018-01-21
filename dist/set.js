//      

const { ObservedRemoveSet } = require('observed-remove/src');
const { gzip, gunzip } = require('./lib/gzip');

                
                 
                          
  

/**
 * Class representing a IPFS Observed Remove Set
 *
 * Implements all methods and iterators of the native `Set` object and the 'ObservedRemovedSet' class in addition to the following.
 *
 * See: {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set}
 *
 * See: {@link https://github.com/wehriam/observed-remove#set-api}
 */
class IpfsObservedRemoveSet    extends ObservedRemoveSet    {
  /**
   * Create an observed-remove set.
   * @param {Object} [ipfs] Object implementing the [core IPFS API](https://github.com/ipfs/interface-ipfs-core#api), most likely a [js-ipfs](https://github.com/ipfs/js-ipfs) or [js-ipfs-api](https://github.com/ipfs/js-ipfs-api) object.
   * @param {String} [topic] IPFS pubub topic to use in synchronizing the set.
   * @param {Iterable<V>} [entries=[]] Iterable of initial values
   * @param {Object} [options={}]
   * @param {String} [options.maxAge=5000] Max age of insertion/deletion identifiers
   * @param {String} [options.bufferPublishing=20] Interval by which to buffer 'publish' events
   */
  constructor(ipfs       , topic       , entries              , options          = {}) {
    super(entries, options);
    this.ipfs = ipfs;
    this.topic = topic;
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

               
                
                              

  async initializeIpfs()               {
    const ipfsId = (await this.ipfs.id()).id;
    this.on('publish', async (queue) => {
      this.ipfs.pubsub.publish(this.topic, await gzip(JSON.stringify(queue)));
    });
    await this.ipfs.pubsub.subscribe(this.topic, { discover: true }, async (message                           ) => {
      if (message.from === ipfsId) {
        return;
      }
      const queue = JSON.parse(await gunzip(message.data));
      this.process(queue);
    });
    await this.ipfs.pubsub.subscribe(`${this.topic}:hash`, { discover: true }, async (message                           ) => {
      if (message.from === ipfsId) {
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
    });
    await this.ipfs.pubsub.subscribe(`${this.topic}:join`, { discover: true }, async (message                           ) => {
      if (message.from === ipfsId) {
        return;
      }
      const peerId = message.data.toString('utf8');
      if (ipfsId === peerId) {
        this.ipfsSync();
      }
    });
  }

  async sendJoinMessage()               {
    await this.waitForIpfsPeers();
    const peerIds = await this.ipfs.pubsub.peers(this.topic);
    const peerId = peerIds[Math.floor(Math.random() * peerIds.length)];
    this.ipfs.pubsub.publish(`${this.topic}:join`, Buffer.from(peerId, 'utf8'));
  }

  /**
   * Publish an IPFS hash of an array containing all of the object's insertions and deletions.
   * @return {Array<Array<any>>}
   */
  async ipfsSync()               {
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
  async getIpfsHash()                 {
    const data = this.dump();
    const files = await this.ipfs.files.add(Buffer.from(JSON.stringify(data)));
    return files[0].hash;
  }

  /**
   * Resolves after one or more IPFS peers connects. Useful for testing.
   * @return {Promise<void>}
   */
  async waitForIpfsPeers()               {
    let ipfsPeerCount = await this.ipfsPeerCount();
    while (ipfsPeerCount === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      ipfsPeerCount = await this.ipfsPeerCount();
    }
  }

  /**
   * Current number of IPFS pubsub peers.
   * @return {number}
   */
  async ipfsPeerCount()                 {
    const peers = await this.ipfs.pubsub.peers(this.topic);
    return peers.length;
  }
}

module.exports = IpfsObservedRemoveSet;
