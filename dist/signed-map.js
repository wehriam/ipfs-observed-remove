//      

const { gzip, gunzip } = require('./lib/gzip');
const { SignedObservedRemoveMap } = require('observed-remove');

                
                 
                           
            
                 
  

const notSubscribedRegex = /Not subscribed/;

class IpfsSignedObservedRemoveMap       extends SignedObservedRemoveMap       { // eslint-disable-line no-unused-vars
  /**
   * Create an observed-remove CRDT.
   * @param {Object} [ipfs] Object implementing the [core IPFS API](https://github.com/ipfs/interface-ipfs-core#api), most likely a [js-ipfs](https://github.com/ipfs/js-ipfs) or [js-ipfs-api](https://github.com/ipfs/js-ipfs-api) object.
   * @param {String} [topic] IPFS pubub topic to use in synchronizing the CRDT.
   * @param {Iterable<V>} [entries=[]] Iterable of initial values
   * @param {Object} [options={}]
   * @param {String} [options.maxAge=5000] Max age of insertion/deletion identifiers
   * @param {String} [options.bufferPublishing=20] Interval by which to buffer 'publish' events
   */
  constructor(ipfs       , topic       , entries                                   , options          = {}) {
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

  async loadIpfsHash(hash       )               {
    const files = await this.ipfs.files.get(hash);
    const queue = JSON.parse(files[0].content.toString('utf8'));
    this.process(queue);
  }

  async initializeIpfs()               {
    this.ipfsId = (await this.ipfs.id()).id;
    this.on('publish', async (queue) => {
      try {
        const message = await gzip(JSON.stringify(queue));
        await this.ipfs.pubsub.publish(this.topic, message);
      } catch (error) {
        if (this.listenerCount('error') > 0) {
          this.emit('error', error);
        } else {
          throw error;
        }
      }
    });
    await this.ipfs.pubsub.subscribe(this.topic, { discover: true }, this.boundHandleQueueMessage);
    await this.ipfs.pubsub.subscribe(`${this.topic}:hash`, { discover: true }, this.boundHandleHashMessage);
    await this.ipfs.pubsub.subscribe(`${this.topic}:join`, { discover: true }, this.boundHandleJoinMessage);
  }

  async sendJoinMessage()               {
    try {
      const peerIds = await this.waitForIpfsPeers();
      if (peerIds.length === 0) {
        return;
      }
      const peerId = peerIds[Math.floor(Math.random() * peerIds.length)];
      await this.ipfs.pubsub.publish(`${this.topic}:join`, Buffer.from(peerId, 'utf8'));
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
  async ipfsSync()               {
    const message = await this.getIpfsHash();
    await this.ipfs.pubsub.publish(`${this.topic}:hash`, Buffer.from(message, 'utf8'));
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
   * Resolves an array of peer ids after one or more IPFS peers connects. Useful for testing.
   * @return {Promise<void>}
   */
  async waitForIpfsPeers()                        {
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
  async ipfsPeerCount()                 {
    const peerIds = await this.ipfs.pubsub.peers(this.topic);
    return peerIds.length;
  }

  /**
   * Gracefully shutdown
   * @return {void}
   */
  shutdown()       {
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

  async handleQueueMessage(message                           ) {
    try {
      if (message.from === this.ipfsId) {
        return;
      }
      const queue = JSON.parse(await gunzip(message.data));
      this.process(queue);
    } catch (error) {
      if (this.listenerCount('error') > 0) {
        this.emit('error', error);
      } else {
        throw error;
      }
    }
  }

  async handleHashMessage(message                           ) {
    try {
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
        await this.ipfs.pubsub.publish(`${this.topic}:hash`, Buffer.from(afterHash, 'utf8'));
      }
    } catch (error) {
      if (this.listenerCount('error') > 0) {
        this.emit('error', error);
      } else {
        throw error;
      }
    }
  }

  async handleJoinMessage(message                           ) {
    try {
      if (message.from === this.ipfsId) {
        return;
      }
      const peerId = message.data.toString('utf8');
      if (this.ipfsId === peerId) {
        await this.ipfsSync();
      }
    } catch (error) {
      if (this.listenerCount('error') > 0) {
        this.emit('error', error);
      } else {
        throw error;
      }
    }
  }
}


module.exports = IpfsSignedObservedRemoveMap;
