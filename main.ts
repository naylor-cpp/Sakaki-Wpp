import ClientSocket from './ClientSocket'


async function main(){

 const baileys = new ClientSocket();

 await baileys.start();


} 

main();
