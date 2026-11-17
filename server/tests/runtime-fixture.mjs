import { parentPort } from 'node:worker_threads';
let count = 0;
parentPort.on('message', async ({args}) => {
 if (args?.[0] === 'crash') process.exit(7);
 if (args?.[0] === 'error') {parentPort.postMessage({error:{message:'original mint error'}}); return;}
 await new Promise(r => setTimeout(r, 20));
 parentPort.postMessage({value: ++count});
});
parentPort.postMessage({ready:true});
