import ClientSocket from "../../../ClientSocket";
import { delay, AnyMessageConten } from '@whiskeysockets/baileys';


class ClientSend { 

 public client:any;

 construtor(){
	super();
	this.client = client
 }


 public async Typing(msg: AnyMessageConten    t, jid: string) {                                 await this.client.presenceSubscribe(jid)
    await delay(500)
    await this.client.sendPresenceUpdate('composing', jid    )
    await delay(2000)
    await this.client.sendPresenceUpdate('paused', jid)

			
 }


 public async sendMessage(msg: AnyMessageConten, jid: string){
  await this.Typing();
  await this.client.sendMessage(jid, msg);
 }


}
  export default ClientSend;
