// The local installer pins the Node executable into the compiled hook.
export const NODE=typeof __THREADRAIL_NODE__==='string'?__THREADRAIL_NODE__:'node';
