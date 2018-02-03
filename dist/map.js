//      

                                                                                      
                                            

const getIpfsClass = require('./mixin');
const ObservedRemoveMap                                    = require('observed-remove').ObservedRemoveMap;

const IpfsObservedRemoveMap                                                    = getIpfsClass(ObservedRemoveMap);

module.exports = IpfsObservedRemoveMap;

