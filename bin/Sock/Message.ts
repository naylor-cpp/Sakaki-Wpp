import { AnyMessageContent, delay } from "@whiskeysockets/baileys";
import Sock from "../..";


class Message extends Sock {

	constructor() {
		super();
	}

	private async Typing(jid: string) {
		await this.sock.presenceSubscribe(jid)
		await delay(500)
		await this.sock.sendPresenceUpdate('composing', jid)
		await delay(2000)
		await this.sock.sendPresenceUpdate('paused', jid)
	}



	public async sendText(jid: string, text: any) {
		await this.Typing(jid);
		await this.sock.sendMessage(jid, { text: text })
	}

	public async sendTextQuoted(jid: string, text: any, message: any) {
		await this.Typing(jid);
		await this.sock.sendMessage(
			jid,
			{ text: text },
			{ quoted: message }
		)
	}


	public async sendSticker(jid:string) {
		await this.Typing(jid);
		await this.sendSticker
	}

} export default Message;
