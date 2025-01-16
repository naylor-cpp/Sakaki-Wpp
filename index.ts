import { Boom } from '@hapi/boom'
import NodeCache from 'node-cache'
import readline from 'readline'
import makeWASocket, {
	BinaryInfo,
	DisconnectReason, downloadMediaMessage, encodeWAM, fetchLatestBaileysVersion, getAggregateVotesInPollMessage, makeCacheableSignalKeyStore,
	makeInMemoryStore, proto, useMultiFileAuthState, WAMessageContent, WAMessageKey
} from "@whiskeysockets/baileys";
import fs, { writeFile } from 'fs'
import P from 'pino'
import { buffer } from 'stream/consumers';

const logger = P({ timestamp: () => `,"time":"${new Date().toJSON()}"` }, P.destination('./wa-logs.txt'))
logger.level = 'trace'

const useStore = !process.argv.includes('--no-store')
const doReplies = process.argv.includes('--do-reply')
const usePairingCode = process.argv.includes('--use-pairing-code')

// external map to store retry counts of messages when decryption/encryption fails
// keep this out of the socket itself, so as to prevent a message decryption/encryption loop across socket restarts
const msgRetryCounterCache = new NodeCache()

const onDemandMap = new Map<string, string>()

// Read line interface
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text: string) => new Promise<string>((resolve) => rl.question(text, resolve))

// the store maintains the data of the WA connection in memory
// can be written out to a file & read from it
const store = useStore ? makeInMemoryStore({ logger }) : undefined
store?.readFromFile('./baileys_store_multi.json')
// save every 10s
setInterval(() => {
	store?.writeToFile('./baileys_store_multi.json')
}, 10_000)



class Sock {

	public sock: any;
	public state: any;
	public saveCreds: any;
	public messages: any;
	public messageType: any;

	public async Main() {
		try {
			const { state, saveCreds } = await useMultiFileAuthState('src/connect/baileys_auth_info');
			this.saveCreds = state;
			const { version, isLatest } = await fetchLatestBaileysVersion();
			console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

			this.sock = makeWASocket({
				version,
				logger,
				printQRInTerminal: !usePairingCode,
				auth: {
					creds: state.creds,
					/** caching makes the store faster to send/recv messages */
					keys: makeCacheableSignalKeyStore(state.keys, logger),
				},
				msgRetryCounterCache,
				generateHighQualityLinkPreview: true,
				// ignore all broadcast messages -- to receive the same
				// comment the line below out
				// shouldIgnoreJid: jid => isJidBroadcast(jid),
				// implement to handle retries & poll updates
				getMessage: this.getMessage,
			});

			store?.bind(this.sock.ev)

			// Pairing code for Web clients
			if (usePairingCode && !this.sock.authState.creds.registered) {
				// todo move to QR event
				const phoneNumber = await question('Please enter your phone number:\n')
				const code = await this.sock.requestPairingCode(phoneNumber)
				console.log(`Pairing code: ${code}`)
			}

			await this.Connection();


		} catch {

		}
	}//Sock

	private async getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
		if (store) {
			const msg = await store.loadMessage(key.remoteJid!, key.id!)
			return msg?.message || undefined
		}

		// only if store is present
		return proto.Message.fromObject({})
	}






	private async Connection() {
		this.sock.ev.on('connection.update', async (update:any) => {
			const { connection, lastDisconnect } = update
			if (connection === 'close') {
				// reconnect if not logged out
				if ((lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
					this.Main();
				} else {
					console.log('Connection closed. You are logged out.')
				}
			}

			// WARNING: THIS WILL SEND A WAM EXAMPLE AND THIS IS A ****CAPTURED MESSAGE.****
			// DO NOT ACTUALLY ENABLE THIS UNLESS YOU MODIFIED THE FILE.JSON!!!!!
			// THE ANALYTICS IN THE FILE ARE OLD. DO NOT USE THEM.
			// YOUR APP SHOULD HAVE GLOBALS AND ANALYTICS ACCURATE TO TIME, DATE AND THE SESSION
			// THIS FILE.JSON APPROACH IS JUST AN APPROACH I USED, BE FREE TO DO THIS IN ANOTHER WAY.
			// THE FIRST EVENT CONTAINS THE CONSTANT GLOBALS, EXCEPT THE seqenceNumber(in the event) and commitTime
			// THIS INCLUDES STUFF LIKE ocVersion WHICH IS CRUCIAL FOR THE PREVENTION OF THE WARNING
			const sendWAMExample = false;
			if (connection === 'open' && sendWAMExample) {
				/// sending WAM EXAMPLE
				const {
					header: {
						wamVersion,
						eventSequenceNumber,
					},
					events,
				} = JSON.parse(await fs.promises.readFile("./boot_analytics_test.json", "utf-8"))

				const binaryInfo = new BinaryInfo({
					protocolVersion: wamVersion,
					sequence: eventSequenceNumber,
					events: events
				})
				const buffer = encodeWAM(binaryInfo);

				const result = await this.sock.sendWAMBuffer(buffer)
				console.log(result)
			}

			console.log('connection update', update)

		});

		// credentials updated -- save them
		this.sock.ev.on('creds.update', async (update:any) => {
			await this.saveCreds();

		});

		this.Messages();
	}

	private async Messages() {
		this.sock.ev.on('messages.upsert', async (upsert:any) => {
			this.messages = upsert.messages[0];
			const text = this.messages.message?.conversation || this.messages.message?.extendedTextMessage?.text
			console.log(this.messageType);
			this.Sticker();


			console.log(JSON.stringify(this.messages, undefined, 2))

		});


		// messages updated like status delivered, message deleted etc.
		this.sock.ev.on('messages.update', async (update: any) => {
			const msg = update;
			console.log(JSON.stringify(update, undefined, 2))
			for (const { key, update } of msg) {
				if (update.pollUpdates) {
					const pollCreation = await this.getMessage(key)
					if (pollCreation) {
						console.log(
							'got poll update, aggregation: ',
							getAggregateVotesInPollMessage({
								message: pollCreation,
								pollUpdates: update.pollUpdates,
							})
						)
					}
				}
			}
		})

		this.sock.ev.on('message-receipt.update', async (update:any) => {
			console.log(update);
		})

		this.sock.ev.on('messages.reaction', async (update:any) => {
			console.log(update);
		})

	}


	private async void() {
		if (!this.messages.message) return // if there is no text or media message
		this.messageType = Object.keys(this.messages.message)[0]// get what type of message it is -- text, image, video

	}

	private async Sticker() {
		// if the message is an image
		if (this.messageType === 'imageMessage') {
			// download the message
			await this.MediaDownload();
		}

	}

	private async MediaDownload() {
		const buffer = await downloadMediaMessage(
			this.messages,
			'buffer',
			{},
			{
				logger,
				// pass this so that baileys can request a reupload of media
				// that has been deleted
				reuploadRequest: this.sock.updateMediaMessage
			}
		)

	}


} export default Sock;

