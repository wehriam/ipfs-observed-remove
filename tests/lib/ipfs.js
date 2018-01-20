// @flow

const DaemonFactory = require('ipfsd-ctl');

const daemonFactory = DaemonFactory.create({ type: 'go' });

const getIpfsNode = module.exports.getIpfsNode = async (bootstrap:Array<string> = []) => {
  const [daemon, ipfs] = await new Promise((resolve, reject) => {
    const options = {
      disposable: true,
      args: ['--enable-pubsub-experiment'],
      config: {
        Bootstrap: bootstrap,
        Discovery: {
          MDNS: {
            Interval: 1,
            Enabled: true,
          },
        },
      },
    };
    daemonFactory.spawn(options, (error, ipfsd) => {
      if (error) {
        reject(error);
      } else {
        resolve([ipfsd, ipfsd.api]);
      }
    });
  });
  ipfs.stopNode = async () => {
    await new Promise((resolve, reject) => {
      daemon.stop((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  };
  return ipfs;
};

module.exports.getSwarm = async (count:number) => {
  const nodes = await Promise.all(Array.from({ length: count }, getIpfsNode));
  if (count > 1) {
    let connectedNodes = 0;
    while (connectedNodes < count) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      connectedNodes = 0;
      await Promise.all(nodes.map(async (node) => { // eslint-disable-line no-loop-func
        const peers = await node.swarm.peers();
        if (peers.length >= count - 1) {
          connectedNodes += 1;
        }
      }));
    }
  }
  const stopSwarm = async () => {
    await Promise.all(nodes.map((node) => node.stopNode()));
  };
  return [nodes, stopSwarm];
};

