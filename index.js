import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'


class Sock { 

    public sock;
  
    private async main () {
           this.sock = makeWASocket({
        // can provide additional config here
               printQRInTerminal: true
    });
} // Main

    private async connection () { 
      this.sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect)
            // reconnect if not logged out
            if(shouldReconnect) {
                connectToWhatsApp()
            }
        } else if(connection === 'open') {
            console.log('opened connection')
        }
    });
} //Connection  


public async Messages () {   
   this.sock.ev.on('messages.upsert', m => {
        console.log(JSON.stringify(m, undefined, 2))

        console.log('replying to', m.messages[0].key.remoteJid)
        await sock.sendMessage(m.messages[0].key.remoteJid!, { text: 'Hello there!' })
    })
} // Messages

    

 } module.exports = Sock;




