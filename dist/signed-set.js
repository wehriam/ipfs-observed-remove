//      

                                                                                                  
                                            

const getIpfsClass = require('./mixin');
const SignedObservedRemoveSet                                       = require('observed-remove').SignedObservedRemoveSet;

const IpfsSignedObservedRemoveSet                                                       = getIpfsClass(SignedObservedRemoveSet);

module.exports = IpfsSignedObservedRemoveSet;

