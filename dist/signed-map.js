//      

                                                                                                  
                                            

const getIpfsClass = require('./mixin');
const SignedObservedRemoveMap                                          = require('observed-remove').SignedObservedRemoveMap;

const IpfsSignedObservedRemoveMap                                                          = getIpfsClass(SignedObservedRemoveMap);

module.exports = IpfsSignedObservedRemoveMap;

