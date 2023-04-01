"use strict";

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
// const fs = require("fs");

const axios = require("axios");

class SecSmart extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "sec-smart",
		});

		this.secApiClient = null;

		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// Reset the connection indicator during startup
		this.setState("info.connection", false, true);

		if (!this.config.apiUrl) {
			this.log.error("API URL is empty - please check instance configuration");
		}

		if (!this.config.apiToken) {
			this.log.error("API Token is empty - please check instance configuration");
		}

		if (this.config.apiUrl && this.config.apiToken) {
			this.secApiClient = axios.create({
				baseURL: `${this.config.apiUrl}`,
				headers: {"Authorization": "Bearer "+ this.config.apiToken},
				timeout: 1000,
				responseType: "json",
				responseEncoding: "utf8"
			});

		}

		try {
			const deviceInfoResponse = await this.secApiClient.get("/devices");

			if (deviceInfoResponse.status === 200) {
				const deviceInfo = deviceInfoResponse.data;
				for (const device of deviceInfo) {
					await this.setObjectNotExistsAsync("Gateway " + device.deviceid, {
						type: "device",
						common: {
							name: {
								"en": "Device",
								"de": "Gerät",
								"ru": "Устройства",
								"pt": "Dispositivo",
								"nl": "Vernietiging",
								"fr": "Dispositif",
								"it": "Dispositivo",
								"es": "Dispositivo",
								"pl": "Device",
								"uk": "Пристрої",
								"zh-cn": "证人"
							},
							type: "string",
							role: "text"
						},
						native: {}
					});
					await this.createChannelAsync("Gateway " + device.deviceid, "Info", {
						name:{
							"en": "Device information",
							"de": "Informationen zum Gerät",
							"ru": "Информация об устройстве",
							"pt": "InformaÃ§Ãμes do dispositivo",
							"nl": "Vernietig informatie",
							"fr": "Information sur les dispositifs",
							"it": "Informazioni sul dispositivo",
							"es": "Información sobre dispositivos",
							"pl": "Data dostępu",
							"uk": "Інформація про пристрій",
							"zh-cn": "证人信息"
						}});
					await this.createStateAsync("Gateway " + device.deviceid, "Info", "id", {
						"name": {
							"en": "Device id",
							"de": "Geräte-ID",
							"ru": "Устройство id",
							"pt": "Id do dispositivo",
							"nl": "Vernietiging",
							"fr": "Appareil id",
							"it": "Dispositivo id",
							"es": "Dispositivo id",
							"pl": "Device id (ang.)",
							"uk": "Пристрої id",
							"zh-cn": "Device id"
						},
						"role": "text",
						"type": "string",
						"read": true,
						"write": false,
						"def": device.deviceid
					});
					await this.createStateAsync("Gateway " + device.deviceid, "Info", "type", {
						"name": {
							"en": "Device type",
							"de": "Gerätetyp",
							"ru": "Тип устройства",
							"pt": "Tipo de dispositivo",
							"nl": "Device type",
							"fr": "Type de dispositif",
							"it": "Tipo di dispositivo",
							"es": "Tipo de dispositivo",
							"pl": "Device type",
							"uk": "Тип пристрою",
							"zh-cn": "2. 证人类型"
						},
						"role": "text",
						"type": "string",
						"read": true,
						"write": false,
						"def": device.type
					});
					await this.createStateAsync("Gateway " + device.deviceid, "Info", "name", {
						"name": {
							"en": "Device name",
							"de": "Bezeichnung des Geräts",
							"ru": "Наименование устройства",
							"pt": "Nome do dispositivo",
							"nl": "Devicenaam",
							"fr": "Nom du dispositif",
							"it": "Nome del dispositivo",
							"es": "Nombre del dispositivo",
							"pl": "Device name",
							"uk": "Назва пристрою",
							"zh-cn": "证人姓名"
						},
						"role": "text",
						"type": "string",
						"read": true,
						"write": true,
						"def": device.name
					});
					this.subscribeStates("Gateway " + device.deviceid + ".Info.name");
				}
			}
		} catch (err) {
			this.log.error(err);
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);

			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		const splitState = id.split(".");
		this.log.info(state.ack);
		if (splitState[3] == "Info" && splitState[4] == "name" && state.ack === false) {
			this.getState(splitState[2] + ".Info.id",(err, deviceState) => {
				if (err) {
					this.log.error(err);
				} else {
					const deviceId = deviceState.val;
					if(deviceId) {
						if(this.changeDeviceName(deviceId, state.val)) {
							this.setState(id, {val: state.val, ack: true});
						}
					}
				}
			});
		}
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	changeDeviceName(id, name) {
		try {
			const deviceName = this.secApiClient.put("/devices/" + id + "/name", {"name": name});
			return true;
		} catch (err) {
			this.log.error(err);
		}
	}
	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new SecSmart(options);
} else {
	// otherwise start the instance directly
	new SecSmart();
}