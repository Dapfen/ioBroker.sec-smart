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
const { stringify } = require("querystring");

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
		this.subscribeStates("*");
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

		this.setDevices();
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
		if (splitState[3] == "Info" && splitState[4] == "name" && state.ack === false) {
			this.getState(splitState[2] + ".Info.id",(err, deviceState) => {
				if (err) {
					this.log.error(JSON.stringify(err));
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

		if (splitState[4] == "mode" && state.ack === false) {
			this.getState(splitState[2] + ".Info.id",(err, deviceState) => {
				if (err) {
					this.log.error(JSON.stringify(err));
				} else {
					const deviceId = deviceState.val;
					if(deviceId) {
						const areaSelected = splitState[3];
						if (this.changeAreaData(deviceId, areaSelected, state.val)) {
							this.setState(id, {val: state.val, ack: true});
						}
					}
				}
			});
		}
		if (splitState[3].slice(0,13) == "Settings_area" && splitState[4].slice(0,5) == "timer" && state.ack === false) {
			this.getState(splitState[2] + ".Info.id",(err, deviceState) => {
				if (err) {
					this.log.error(JSON.stringify(err));
				} else {
					const deviceId = deviceState.val;
					if(deviceId) {
						const areaSelected = splitState[3];
						const changedState = splitState[4];
						this.changeAreaTimers(deviceId, areaSelected, changedState, state.val);
					}
				}
			});
		}

		if (splitState[3] == "Settings_General" && state.ack === false) {
			this.getState(splitState[2] + ".Info.id",(err, deviceState) => {
				if (err) {
					this.log.error(JSON.stringify(err));
				} else {
					const deviceId = deviceState.val;
					const changedState = splitState[4];
					if(deviceId) {
						this.changeSettings(deviceId, changedState, state.val);
					}
				}
			});
		}


		//		if (state) {
		//			// The state was changed
		//			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		//		} else {
		//			// The state was deleted
		//			this.log.info(`state ${id} deleted`);
		//		}
	}

	async changeSettings(id, changedState, stateVal){
		if (changedState == "FilterResetIntervall" || changedState == "FilterRemainingTimeReset"){
			try {
				const filterResetIntervall = await this.getStateAsync("Gateway " + id + ".Settings_General.FilterResetIntervall");
				const filterRemainingTimeReset = await this.getStateAsync("Gateway " + id + ".Settings_General.FilterRemainingTimeReset");
				if(changedState == "FilterResetIntervall") {
					switch (true){
						case (Number(filterResetIntervall.val) < 90):
							stateVal = 90;
							filterResetIntervall.val = 90;
							break;
						case (Number(filterResetIntervall.val) > 270):
							stateVal = 270;
							filterResetIntervall.val = 270;
							break;
					}
				}
				const setResetTimerJson = {
					"filter":{
						"maxRunTime": filterResetIntervall.val,
						"reset": filterRemainingTimeReset.val
					}
				};
				this.secApiClient.put("/devices/" + id + "/settings/filter", setResetTimerJson);
				let newValue;
				if(changedState == "FilterResetIntervall") {
					newValue = stateVal;
				} else {
					newValue = false;
				}
				this.setState("Gateway "+ id + ".Settings_General." + changedState, {val: newValue, ack: true});
				return true;
			} catch (err) {
				this.log.error(err);
			}
		}
		if (changedState == "Humidity" || changedState == "CO2"){
			try {
				const newHumidity = await this.getStateAsync("Gateway " + id + ".Settings_General.Humidity");
				const newCO2 = await this.getStateAsync("Gateway " + id + ".Settings_General.CO2");
				const setCO2_HumidityJson = {
					"thresholds":{
						"humidity": newHumidity.val,
						"co2": newCO2.val
					}
				};
				this.secApiClient.put("/devices/" + id + "/settings/thresholds", setCO2_HumidityJson);
				this.setState("Gateway "+ id + ".Settings_General." + changedState, {val: stateVal, ack: true});
				return true;
			} catch (err) {
				this.log.error(err);
			}
		}
		if (changedState == "SleepTime"){
			try {
				const newSleepTime = await this.getStateAsync("Gateway " + id + ".Settings_General.SleepTime");
				switch (true){
					case (Number(newSleepTime.val) < 10):
						stateVal = 10;
						newSleepTime.val = 10;
						break;
					case (Number(newSleepTime.val) > 250):
						stateVal = 250;
						newSleepTime.val = 250;
						break;
				}
				const setSleepTimeJson = {
					"sleepTime": newSleepTime.val
				};
				this.secApiClient.put("/devices/" + id + "/settings/sleep-time", setSleepTimeJson);
				this.setState("Gateway "+ id + ".Settings_General." + changedState, {val: stateVal, ack: true});
				return true;
			} catch (err) {
				this.log.error(err);
			}
		}
		if (changedState == "SummerMode"){
			try {
				const newSummerMode = await this.getStateAsync("Gateway " + id + ".Settings_General.SummerMode");
				const setSummerModeJson = {
					"summermode": newSummerMode.val
				};
				this.secApiClient.put("/devices/" + id + "/settings/summermode", setSummerModeJson);
				this.setState("Gateway "+ id + ".Settings_General." + changedState, {val: stateVal, ack: true});
				return true;
			} catch (err) {
				this.log.error(err);
			}
		}
	}

	async changeDeviceName(id, name) {
		try {
			this.secApiClient.put("/devices/" + id + "/name", {"name": name});
			return true;
		} catch (err) {
			this.log.error(err);
		}
	}

	async changeAreaData(id, area, mode) {
		try {
			const areaId = parseInt(area.slice(-1));
			this.secApiClient.put("/devices/" + id + "/areas/mode", {"areaid": areaId, "mode": mode});
			return true;
		} catch (err) {
			this.log.error(err);
		}
	}

	async changeAreaTimers(id, area, changedState, stateVal) {
		try {
			const areaId = parseInt(area.slice(-1));
			const areaNameApi = area.slice(-5);
			const areasInfoResponse = await this.secApiClient.get("/devices/" + id + "/areas");
			if (areasInfoResponse.status === 200) {
				const apiTimers = areasInfoResponse.data[areaNameApi]["timers"];
				let newTimerJSON = '{"areaid":'+ areaId + ',"timers":{';
				let timerCount = 1;
				for (const key in apiTimers) {
					const appTimerActive = await this.getStateAsync("Gateway "+ id + "." + area + "." + "timer" + timerCount + "_active");
					const appTimerMode = await this.getStateAsync("Gateway "+ id + "." + area + "." + "timer" + timerCount + "_mode");
					const appTimerTime = await this.getStateAsync("Gateway "+ id + "." + area + "." + "timer" + timerCount + "_time");
					newTimerJSON = newTimerJSON + '"timer' + timerCount + '":{';
					if (apiTimers[key]["active"] == appTimerActive.val){
						newTimerJSON = newTimerJSON + '"active":' + apiTimers[key]["active"] + ",";
					} else {
						newTimerJSON = newTimerJSON + '"active":' + appTimerActive.val + ",";
					}
					if (apiTimers[key]["mode"] == appTimerMode.val){
						newTimerJSON = newTimerJSON + '"mode":"' + apiTimers[key]["mode"] + '",';
					} else {
						newTimerJSON = newTimerJSON + '"mode":"' + appTimerMode.val + '",';
					}
					if (apiTimers[key]["time"] == appTimerTime.val){
						newTimerJSON = newTimerJSON + '"time":"' + apiTimers[key]["time"] + '"';
					} else {
						newTimerJSON = newTimerJSON + '"time":"' + appTimerTime.val + '"';
					}
					timerCount++;
					newTimerJSON = newTimerJSON + "},";
				}
				newTimerJSON = newTimerJSON.slice(0, -1);
				newTimerJSON = newTimerJSON + "}}";
				newTimerJSON = JSON.parse(newTimerJSON);
				this.secApiClient.put("/devices/" + id + "/areas/timeprogram", newTimerJSON);
				this.setState("Gateway "+ id + ".Settings_area" + areaId + "." + changedState, {val: stateVal, ack: true});
				return true;
			}
			else {
				return false;
			}
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

	// Add/update devices
	async setDevices() {
		try {
			const deviceInfoResponse = await this.secApiClient.get("/devices");

			if (deviceInfoResponse.status === 200) {
				this.setState("info.connection", true, true);
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
					// create Info channel
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
					// add/update state for device infos
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
						"write": false
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
						"write": false
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
						"write": true
					});

					await this.setStateAsync("Gateway " + device.deviceid + ".Info.id", {val: device.deviceid, ack: true});
					await this.setStateAsync("Gateway " + device.deviceid + ".Info.type", {val: device.type, ack: true});
					await this.setStateAsync("Gateway " + device.deviceid + ".Info.name", {val: device.name, ack: true});

					this.setAreas(device.deviceid);
					this.setSettings(device.deviceid);
					this.setTelemetry(device.deviceid);
					this.setSetup(device.deviceid);
				}
			}
		} catch (err) {
			this.log.error(err);
		}
	}

	// add/update channels for areas
	async setAreas(id) {
		try {
			const areasInfoResponse = await this.secApiClient.get("/devices/" + id + "/areas");

			if (areasInfoResponse.status === 200) {
				const areasInfo = areasInfoResponse.data;

				for(const i in areasInfo)
					this.setArea(id, i, areasInfoResponse.data[i]);
			}
		} catch (err) {
			this.log.error(err);
		}
	}

	
	// Add/update datapoints in areas
	async setArea(id, area, data) {
		await this.createChannelAsync("Gateway " + id, "Settings_" + area, {
			name:{
				"en": "Area data",
				"de": "Bereichsdaten",
				"ru": "Областные данные",
				"pt": "Dados de área",
				"nl": "Area data",
				"fr": "Données sur les zones",
				"it": "Dati dell'area",
				"es": "Datos de zona",
				"pl": "Obszar",
				"uk": "Об'єм даних",
				"zh-cn": "区域数据"
			}});
		await this.createStateAsync("Gateway " + id, "Settings_" + area, "label", {
			"name": {
				"en": "Area label",
				"de": "Bereichsbezeichnung",
				"ru": "Area этикетка",
				"pt": "Rótulo de área",
				"nl": "Area label",
				"fr": "Étiquette de zone",
				"it": "Etichetta di area",
				"es": "Etiqueta de zona",
				"pl": "Label",
				"uk": "Плоский ярлик",
				"zh-cn": "区域标签"
			},
			"role": "text",
			"type": "string",
			"read": true,
			"write": false
		});
		await this.createStateAsync("Gateway " + id, "Settings_" + area, "mode", {
			"name": {
				"en": "Area mode",
				"de": "Bereichsmodus",
				"ru": "Режим зоны",
				"pt": "Modo de área",
				"nl": "Area mode",
				"fr": "Mode zone",
				"it": "Modalità area",
				"es": "Modo de zona",
				"pl": "Tryb miejski",
				"uk": "Режим роботи",
				"zh-cn": "区域模式"
			},
			"role": "text",
			"type": "string",
			"read": true,
			"write": true,
			"states":{
				"Fans off":"Fans off",
				"Manual 1":"Manual 1",
				"Manual 2":"Manual 2",
				"Manual 3":"Manual 3",
				"Manual 4":"Manual 4",
				"Manual 5":"Manual 5",
				"Manual 6":"Manual 6",
				"Boost ventilation":"Boost ventilation",
				"Humidity regulation":"Humidity regulation",
				"CO2 regulation":"CO2 regulation",
				"Timed program":"Timed program",
				"Snooze":"Snooze",
				"INACTIVE":"INACTIVE"
			}
		});
		await this.setStateAsync("Gateway " + id + "." + "Settings_" + area + ".label", {val: data.label, ack: true});
		await this.setStateAsync("Gateway " + id + "." + "Settings_" + area + ".mode", {val: data.mode, ack: true});

		for(const i in data.timers)
			this.setTimers(id, area, i, data.timers[i]);
	}

	// Add/Update datapoints timers in areas
	async setTimers(id, area, timer, data) {
		await this.createStateAsync("Gateway " + id,  "Settings_" + area, timer + "_active", {
			"name": {
				"en": "Timer status",
				"de": "Timing-Status",
				"ru": "Статус таймера",
				"pt": "Status do temporizador",
				"nl": "Timer status",
				"fr": "État du temps",
				"it": "Stato del timer",
				"es": "Estado del tiempo",
				"pl": "Status Timaru",
				"uk": "Статус на сервери",
				"zh-cn": "时间状况"
			},
			"role": "state",
			"type": "boolean",
			"read": true,
			"write": true
		});
		await this.createStateAsync("Gateway " + id, "Settings_" + area, timer + "_mode", {
			"name": {
				"en": "Timer mode",
				"de": "Timer-Modus",
				"ru": "Таймерный режим",
				"pt": "Modo de temporização",
				"nl": "Timer mode",
				"fr": "Mode Timer",
				"it": "Modalità Timer",
				"es": "Modo de temporizador",
				"pl": "Timber",
				"uk": "Режим таймера",
				"zh-cn": "时间模式"
			},
			"role": "text",
			"type": "string",
			"read": true,
			"write": true,
			"states": {
				"Fans off":"Fans off",
				"Manual 1":"Manual 1",
				"Manual 2":"Manual 2",
				"Manual 3":"Manual 3",
				"Manual 4":"Manual 4",
				"Manual 5":"Manual 5",
				"Manual 6":"Manual 6",
				"Boost ventilation":"Boost ventilation",
				"Humidity regulation":"Humidity regulation",
				"CO2 regulation":"CO2 regulation",
				"Timed program":"Timed program",
				"Snooze":"Snooze",
				"INACTIVE":"INACTIVE"
			}
		});
		await this.createStateAsync("Gateway " + id, "Settings_" + area, timer + "_time", {
			"name": {
				"en": "Timer status",
				"de": "Timing-Status",
				"ru": "Статус таймера",
				"pt": "Status do temporizador",
				"nl": "Timer status",
				"fr": "État du temps",
				"it": "Stato del timer",
				"es": "Estado del tiempo",
				"pl": "Status Timaru",
				"uk": "Статус на сервери",
				"zh-cn": "时间状况"
			},
			"role": "text",
			"type": "string",
			"read": true,
			"write": true
		});

		await this.setStateAsync("Gateway " + id + "." + "Settings_" + area + "." + timer +"_active", {val: data.active, ack: true});
		await this.setStateAsync("Gateway " + id + "." + "Settings_" + area + "." + timer +"_mode", {val: data.mode, ack: true});
		await this.setStateAsync("Gateway " + id + "." + "Settings_" + area + "." + timer +"_time", {val: data.time, ack: true});
	}


	// Add/Update settings
	async setSettings(id) {
		try {
			const SettingsResponse = await this.secApiClient.get("/devices/" + id + "/settings");
			if (SettingsResponse.status === 200) {
				this.setSettingsData(id, SettingsResponse.data);
			}
		} catch (err) {
			this.log.error(err);
		}
	}
	async setSettingsData(id, SettingsData) {
		await this.createChannelAsync("Gateway " + id, "Settings_General", {
			"name": {
				"en": "Settings",
				"de": "Einstellungen",
				"ru": "Настройки",
				"pt": "Configurações",
				"nl": "Setting",
				"fr": "Réglages",
				"it": "Impostazioni impostazioni",
				"es": "Ajustes",
				"pl": "Setting",
				"uk": "Налаштування",
				"zh-cn": "确定"
			},
		});
		await this.createStateAsync("Gateway " + id, "Settings_General", "FilterResetIntervall", {
			"name": {
				"en": "Filter change intervall",
				"de": "Filterwechselintervall",
				"ru": "Фильтр изменить интервал",
				"pt": "Intervalo de mudança de filtro",
				"nl": "Filter verandering inval",
				"fr": "Intervalle de changement de filtre",
				"it": "Intervallo di cambio filtro",
				"es": "Intervalo de cambio de filtro",
				"pl": "Przesunięcie graniczne",
				"uk": "Інтервал зміни фільтра",
				"zh-cn": "B. 瓦利的改变"
			},
			"role": "text",
			"type": "number",
			"read": true,
			"min": 90,
			"max": 270,
			"step": 10,
			"write": true
		});
		await this.createStateAsync("Gateway " + id, "Settings_General", "FilterRemainingTimeReset", {
			"name": {
				"en": "reset filter remaining time",
				"de": "Restlaufzeit Filter zurücksetzen",
				"ru": "сброс фильтра оставшееся время",
				"pt": "redefinir o tempo restante do filtro",
				"nl": "filter overgebleven tijd",
				"fr": "reset filter temps restant",
				"it": "reset filtro tempo rimanente",
				"es": "filtro restante tiempo",
				"pl": "filtry resetowe",
				"uk": "скидання фільтра, що залишився час",
				"zh-cn": "时间过长"
			},
			"role": "text",
			"type": "boolean",
			"read": true,
			"write": true
		});
		await this.createStateAsync("Gateway " + id, "Settings_General", "CO2", {
			"name": {
				"en": "Actual sensor value of CO² in ppm.",
				"de": "Tatsächlicher Sensorwert von CO2 in ppm.",
				"ru": "Фактическое значение датчика CO2 в ppm.",
				"pt": "Valor de sensor real de CO2 em ppm.",
				"nl": "Actuele sensorwaarde van CO2 in ppm.",
				"fr": "Valeur réelle du capteur de CO2 en ppm.",
				"it": "Valore effettivo del sensore di CO2 in ppm.",
				"es": "Valor sensor real de CO2 en ppm.",
				"pl": "Wartość czujnika CO2 w ppm.",
				"uk": "Фактичне значення датчика CO2 в ppm.",
				"zh-cn": "CO2的实际传感器,ppm。."
			},
			"role": "text",
			"type": "number",
			"read": true,
			"write": true
		});
		await this.createStateAsync("Gateway " + id, "Settings_General", "Humidity", {
			"name": {
				"en": "Actual sensor value of humidity",
				"de": "Tatsächlicher Sensorwert der Luftfeuchtigkeit",
				"ru": "Фактическое значение датчика влажности",
				"pt": "Valor do sensor real da umidade",
				"nl": "Actuele sensorwaarde van vochtigheid",
				"fr": "Valeur réelle du capteur d ' humidité",
				"it": "Valore effettivo del sensore di umidità",
				"es": "Valor sensor real de humedad",
				"pl": "Aktualna wartość czujnika wilgotności",
				"uk": "Фактичне значення датчика вологості",
				"zh-cn": "湿度的实际传感"
			},
			"role": "text",
			"type": "number",
			"read": true,
			"write": true
		});
		await this.createStateAsync("Gateway " + id, "Settings_General", "SleepTime", {
			"name": {
				"en": "Sleep Time",
				"de": "Zeit für Schlafmodus",
				"ru": "Время сна",
				"pt": "Tempo de sono",
				"nl": "Slaap",
				"fr": "Temps de sommeil",
				"it": "Tempo di sonno",
				"es": "Hora de dormir",
				"pl": "Sleep Time (ang.)",
				"uk": "Час сну",
				"zh-cn": "时间"
			},
			"role": "text",
			"type": "number",
			"min": 10,
			"max": 250,
			"read": true,
			"write": true
		});
		await this.createStateAsync("Gateway " + id, "Settings_General", "DeviceTime", {
			"name": {
				"en": "Device Time",
				"de": "Zeit des Geräts",
				"ru": "Время устройства",
				"pt": "Tempo do dispositivo",
				"nl": "Device Time",
				"fr": "Heure",
				"it": "Tempo del dispositivo",
				"es": "Tiempo de dispositivo",
				"pl": "Data czasu",
				"uk": "Час пристрою",
				"zh-cn": "时间"
			},
			"role": "text",
			"type": "string",
			"read": true,
			"write": false
		});
		await this.createStateAsync("Gateway " + id, "Settings_General", "DeviceDate", {
			"name": {
				"en": "Device Date",
				"de": "Datum des Gerätes",
				"ru": "Дата устройства",
				"pt": "Data do dispositivo",
				"nl": "Vertaling:",
				"fr": "Date du dispositif",
				"it": "Data del dispositivo",
				"es": "Fecha del dispositivo",
				"pl": "Device Date",
				"uk": "Дата пристрою",
				"zh-cn": "目 录"
			},
			"role": "text",
			"type": "string",
			"read": true,
			"write": false
		});
		await this.createStateAsync("Gateway " + id, "Settings_General", "SummerMode", {
			"name": {
				"en": "Sommer modus",
				"de": "Sommermodus",
				"ru": "Sommer модус",
				"pt": "Sommer modus",
				"nl": "Sommer modus",
				"fr": "Sommer modus",
				"it": "Sommer modus",
				"es": "Sommer modus",
				"pl": "Sommer modus",
				"uk": "Соммер модус",
				"zh-cn": "中小企业"
			},
			"role": "state",
			"type": "boolean",
			"read": true,
			"write": true
		});
		const setResetFalse = false;
		await this.setStateAsync("Gateway " + id + ".Settings_General" + ".FilterResetIntervall", {val: SettingsData.filter.maxRunTime, ack: true});
		await this.setStateAsync("Gateway " + id + ".Settings_General" + ".FilterRemainingTimeReset", {val: setResetFalse, ack: true});
		await this.setStateAsync("Gateway " + id + ".Settings_General" + ".CO2", {val: SettingsData.thresholds.co2, ack: true});
		await this.setStateAsync("Gateway " + id + ".Settings_General" + ".Humidity", {val: SettingsData.thresholds.humidity, ack: true});
		await this.setStateAsync("Gateway " + id + ".Settings_General" + ".SleepTime", {val: SettingsData.sleepTime, ack: true});
		await this.setStateAsync("Gateway " + id + ".Settings_General" + ".DeviceTime", {val: SettingsData.deviceTime.time, ack: true});
		await this.setStateAsync("Gateway " + id + ".Settings_General" + ".DeviceDate", {val: SettingsData.deviceTime.date, ack: true});
		//funktioniert noch nicht set sommermode
		await this.setStateAsync("Gateway " + id + ".Settings_General" + ".SummerMode", {val: SettingsData.summermode, ack: true});
	}
	// Add/Update telemetry data
	async setTelemetry(id) {
		try {
			const TelemetryResponse = await this.secApiClient.get("/devices/" + id + "/telemetry");
			if (TelemetryResponse.status === 200) {
				this.setTelemetryData(id, TelemetryResponse.data);
			}
		} catch (err) {
			this.log.error(err);
		}
	}
	async setTelemetryData(id, TelemetryData) {
		await this.createChannelAsync("Gateway " + id, "Info_Telemetry", {
			"name": {
				"en": "Telemetry",
				"de": "Telemetrie",
				"ru": "Телеметрия",
				"pt": "Telemetria",
				"nl": "Telemetrie",
				"fr": "Télémétrie",
				"it": "Telemetria",
				"es": "Telemetría",
				"pl": "Telemetria",
				"uk": "Телеметрія",
				"zh-cn": "电话测量"
			},
		});
		await this.createStateAsync("Gateway " + id, "Info_Telemetry", "restFilterTime", {
			"name": {
				"en": "Remaining filter run time in days",
				"de": "Rest Filterlaufzeit in Tagen",
				"ru": "Оставшееся время запуска фильтра в днях",
				"pt": "Permanecendo tempo de execução do filtro em dias",
				"nl": "Weer filtertijd in dagen",
				"fr": "Durée du filtre restante en jours",
				"it": "Mantenere il tempo di funzionamento del filtro in giorni",
				"es": "Permanecer el tiempo de funcionamiento del filtro en días",
				"pl": "Zmniejszenie filtra trwa w ciągu kilku dni",
				"uk": "Термін дії фільтра в день",
				"zh-cn": "时间过长。"
			},
			"role": "text",
			"type": "number",
			"read": true,
			"write": false
		});
		await this.createStateAsync("Gateway " + id, "Info_Telemetry", "CO2", {
			"name": {
				"en": "Actual sensor value of CO² in ppm",
				"de": "Tatsächlicher Sensorwert von CO2 in ppm",
				"ru": "Фактическое значение датчика CO2 в ppm",
				"pt": "Valor do sensor real de CO2 em ppm",
				"nl": "Actuele sensorwaarde van CO2 in ppm",
				"fr": "Valeur réelle du capteur de CO2 en ppm",
				"it": "Valore effettivo del sensore di CO2 in ppm",
				"es": "Valor sensor real de CO2 en ppm",
				"pl": "Wartość czujnika CO2 w ppm",
				"uk": "Фактичне значення датчика CO2 в ppm",
				"zh-cn": "CO2的实际传感器,ppm"
			},
			"role": "text",
			"type": "number",
			"read": true,
			"write": false
		});
		await this.createStateAsync("Gateway " + id, "Info_Telemetry", "humidity", {
			"name": {
				"en": "Actual sensor value of humidity in %",
				"de": "Tatsächlicher Sensorwert der Luftfeuchtigkeit in %",
				"ru": "Фактическое значение датчика влажности в %",
				"pt": "Valor do sensor real da umidade em %",
				"nl": "Actuele sensorwaarde van vochtigheid in %",
				"fr": "Valeur réelle de l'humidité en %",
				"it": "Valore effettivo del sensore di umidità in %",
				"es": "Valor sensor real de humedad en %",
				"pl": "Aktualna wartość czujnika wilgotności w %",
				"uk": "Фактичне значення датчика вологості в %",
				"zh-cn": "湿度的实际传感"
			},
			"role": "text",
			"type": "number",
			"read": true,
			"write": false
		});
		await this.createStateAsync("Gateway " + id, "Info_Telemetry", "tempInside", {
			"name": {
				"en": "Actual sensor value of room temperature in °C",
				"de": "Tatsächlicher Sensorwert der Raumtemperatur in °C",
				"ru": "Фактическое значение датчика комнатной температуры в °C",
				"pt": "Valor do sensor real da temperatura ambiente em °C",
				"nl": "Actuele sensorwaarde van kamertemperatuur in het centrum",
				"fr": "Valeur réelle de la température ambiante en °C",
				"it": "Valore effettivo del sensore della temperatura ambiente in °C",
				"es": "Valor sensor real de temperatura ambiente en °C",
				"pl": "Wartość czujnika temperatury pomieszczeń w °C",
				"uk": "Фактичне значення датчика температури приміщення в °C",
				"zh-cn": "°C室温度的实际传感器"
			},
			"role": "text",
			"type": "string",
			"read": true,
			"write": false
		});
		await this.createStateAsync("Gateway " + id, "Info_Telemetry", "tempOutside", {
			"name": {
				"en": "Actual sensor value of outside temperature in °C",
				"de": "Ist-Sensorwert der Außentemperatur in °C",
				"ru": "Фактическое значение датчика наружной температуры в °C",
				"pt": "Valor do sensor real da temperatura exterior em °C",
				"nl": "Actuele sensorwaarde van buitenste temperatuur in °C",
				"fr": "Valeur réelle de la température extérieure en °C",
				"it": "Valore effettivo del sensore della temperatura esterna in °C",
				"es": "Valor sensor real de la temperatura exterior en °C",
				"pl": "Wartość czujnika zewnętrznego w temperaturze °C",
				"uk": "Фактичне значення датчика зовнішньої температури в °C",
				"zh-cn": "°C外部温度的实际传感器"
			},
			"role": "text",
			"type": "string",
			"read": true,
			"write": false
		});
		await this.createStateAsync("Gateway " + id, "Info_Telemetry", "uptime", {
			"name": {
				"en": "Uptime of the SEC Smart system",
				"de": "Bisherige Laufzeit des SEC Smart Systems",
				"ru": "Uptime системы SEC Smart",
				"pt": "Tempo de funcionamento do sistema SEC Smart",
				"nl": "Quality over Quantity (QoQ) Releases Vertaling:",
				"fr": "Temps de mise à jour du système intelligent SEC",
				"it": "Tempo di avanzamento del sistema SEC Smart",
				"es": "Tiempo de actualización del sistema SEC Smart",
				"pl": "System SEC Smart",
				"uk": "Час роботи системи SEC Smart",
				"zh-cn": "ECSmart系统的时间"
			},
			"role": "text",
			"type": "string",
			"read": true,
			"write": false
		});
		await this.setStateAsync("Gateway " + id + ".Info_Telemetry" + ".restFilterTime", {val: TelemetryData.restFilterTime, ack: true});
		await this.setStateAsync("Gateway " + id + ".Info_Telemetry" + ".CO2", {val: TelemetryData.co2, ack: true});
		await this.setStateAsync("Gateway " + id + ".Info_Telemetry" + ".humidity", {val: TelemetryData.humidity, ack: true});
		await this.setStateAsync("Gateway " + id + ".Info_Telemetry" + ".tempInside", {val: TelemetryData.Ti, ack: true});
		await this.setStateAsync("Gateway " + id + ".Info_Telemetry" + ".tempOutside", {val: TelemetryData.Ta, ack: true});
		this.log.info(TelemetryData.uptime);
		const uptimeSplit = TelemetryData.uptime.split(".");
		const uptimeTimeSplit = uptimeSplit[2].split(":");
		let uptimeConverted = uptimeSplit[0];
		const uptimeYear = (uptimeSplit[0] > 1) ? " Jahre " : " Jahr ";
		const uptimeDay = (uptimeSplit[1] > 1) ? " Tage " : " Tag ";
		const uptimeHour = (uptimeTimeSplit[0] > 1) ? " Stunden " : " Stunde ";
		const uptimeMinute = (uptimeTimeSplit[1] > 1) ? " Minuten " : " Minute ";
		uptimeConverted = uptimeSplit[0] + uptimeYear + uptimeSplit[1] + uptimeDay + uptimeTimeSplit[0] + uptimeHour + uptimeTimeSplit[1] + uptimeMinute;
		this.log.info(uptimeConverted);
		await this.setStateAsync("Gateway " + id + ".Info_Telemetry" + ".uptime", {val: uptimeConverted, ack: true});
	}

	async setSetup(id) {
		try {
			const SetupResponse = await this.secApiClient.get("/devices/" + id + "/setup");
			if (SetupResponse.status === 200) {
				this.setSetupData(id, SetupResponse.data);
			}
		} catch (err) {
			this.log.error(err);
		}
	}

	async setSetupData(id, setupData) {
		await this.createChannelAsync("Gateway " + id, "Setup_fans", {
			"name": {
				"en": "Returns the device subobject setup for the URL-encoded device ID.",
				"de": "Gibt den Geräte-Setup für die Geräte-ID zurück.",
				"ru": "Возвращает установку подобъектов устройства для URL-кодированного устройства ID.",
				"pt": "Retorna a configuração subobjeto do dispositivo para o ID do dispositivo codificado por URL.",
				"nl": "Verwijdert het apparaat onderobject voor de URL-gecodeerde apparaat ID.",
				"fr": "Renvoie la configuration de sous-objet de l'appareil pour l'ID de périphérique codé par URL.",
				"it": "Restituisce la configurazione subobject del dispositivo per l'ID del dispositivo codificato dall'URL.",
				"es": "Devuelve la configuración subobjeto del dispositivo para el ID del dispositivo codificado por URL.",
				"pl": "Powraca podobiznę podobizną dla URL-encoded device ID.",
				"uk": "Повертає налаштування підоб'єкта пристрою для ідентифікатора URL-кодованого пристрою.",
				"zh-cn": "恢复化解装置的装置分包。."
			},
		});

		const systemInfo = setupData.systems;
		for(const i in systemInfo) {
			this.setSystemsSetup(id, i, systemInfo[i]);
		}
		const areaInfo = setupData.areas;
		for(const i in areaInfo) {
			this.setAreaSetup(id, i, areaInfo[i]);
		}
		await this.createChannelAsync("Gateway " + id, "Setup_inputDi", {
			"name": {
				"en": "Set up the configuration for the digital input.",
				"de": "Richten Sie die Konfiguration für den digitalen Eingang ein.",
				"ru": "Настройте конфигурацию для цифрового входа.",
				"pt": "Configure a configuração para a entrada digital.",
				"nl": "Zet de configuratie op voor de digitale input.",
				"fr": "Configuration de l'entrée numérique.",
				"it": "Impostare la configurazione per l'ingresso digitale.",
				"es": "Configurar la configuración para la entrada digital.",
				"pl": "Ustanowić konfigurację wejściówki cyfrowej.",
				"uk": "Налаштування цифрового входу.",
				"zh-cn": "建立数字投入组合。."
			},
		});
		await this.createStateAsync("Gateway " + id, "Setup_inputDi", "function", {
			"name": {
				"en": "Response when triggered by digital input",
				"de": "Antwort beim Auslösen durch digitale Eingabe",
				"ru": "Ответ при запуске цифрового входа",
				"pt": "Resposta quando acionado por entrada digital",
				"nl": "Verantwoording toen de digitale input",
				"fr": "Réponse lorsque déclenchée par l'entrée numérique",
				"it": "Risposta quando attivato da ingresso digitale",
				"es": "Respuesta cuando se activa por entrada digital",
				"pl": "Response kiedy sprowadza się wejściem cyfrowym",
				"uk": "Відповідь при запуску цифрового введення",
				"zh-cn": "数字投入引起的反应"
			},
			"role": "text",
			"type": "string",
			"read": true,
			"write": true,
			"states": {
				"None":"None",
				"Set fan stage 0":"Set fan stage 0",
				"Set fan stage 1":"Set fan stage 1",
				"Set fan stage 2":"Set fan stage 2",
				"Set fan stage 3":"Set fan stage 3",
				"Set fan stage 4":"Set fan stage 4",
				"Set fan stage 5":"Set fan stage 5",
				"Set fan stage 6":"Set fan stage 6",
				"Set boost ventilation":"Set boost ventilation",
				"Set to snooze":"Set to snooze",
				"Set to automatic timer":"",
				"Set to CO2":"Set to CO2",
				"Set to humidity":"Set to humidity",
				"Reset filter":"Reset filter",
				"Keep fan stage 0":"Keep fan stage 0",
				"Keep fan stage 1":"Keep fan stage 1",
				"Keep fan stage 2":"Keep fan stage 2",
				"Keep fan stage 3":"Keep fan stage 3",
				"Keep fan stage 4":"Keep fan stage 4",
				"Keep fan stage 5":"Keep fan stage 5",
				"Keep fan stage 6":"Keep fan stage 6",
				"Keep boost ventilation":"Keep boost ventilation",
				"Keep at automatic timer":"Keep at automatic timer",
				"Keep at CO2":"Keep at CO2",
				"Keep at humidity":"Keep at humidity"
			}
		});
		await this.setStateAsync("Gateway " + id + ".Setup_inputDi" + ".function", {val: setupData.inputDi.function, ack: true});

		const areaDigitalInput = setupData.inputDi.areas;
		for(const i in areaDigitalInput) {
			this.setDigitalInput(id, i, areaDigitalInput[i]);
		}
		await this.createChannelAsync("Gateway " + id, "Setup_outputDo", {
			"name": {
				"en": "Set up the configuration for the digital output.",
				"de": "Richten Sie die Konfiguration für den digitalen Ausgang ein.",
				"ru": "Настройте конфигурацию для цифрового вывода.",
				"pt": "Configure a configuração para a saída digital.",
				"nl": "Zet de configuratie op voor de digitale uitput.",
				"fr": "Configuration de la sortie numérique.",
				"it": "Impostare la configurazione per l'output digitale.",
				"es": "Configurar la configuración para la salida digital.",
				"pl": "Ustanowić konfigurację cyfrowej produkcji.",
				"uk": "Налаштування цифрового виходу.",
				"zh-cn": "建立数字产出组合。."
			},
		});
		await this.createStateAsync("Gateway " + id, "Setup_outputDo", "function", {
			"name": {
				"en": "Response to signal via digital output",
				"de": "Antwort auf das Signal über den digitalen Ausgang",
				"ru": "Ответ на сигнал через цифровой выход",
				"pt": "Resposta ao sinal via saída digital",
				"nl": "Vertaling:",
				"fr": "Réponse au signal via la sortie numérique",
				"it": "Risposta al segnale tramite uscita digitale",
				"es": "Respuesta a la señal mediante salida digital",
				"pl": "Odpowiedzi do sygnału za pośrednictwem cyfrowej produkcji",
				"uk": "Відповідь на сигнал через цифровий вихід",
				"zh-cn": "通过数字产出对信号的反应"
			},
			"role": "text",
			"type": "string",
			"read": true,
			"write": true,
			"states": {
				"None":"None",
				"Fan stage 0 active":"Fan stage 0 active",
				"Fan stage 1 active":"Fan stage 1 active",
				"Fan stage 2 active":"Fan stage 2 active",
				"Fan stage 3 active":"Fan stage 3 active",
				"Fan stage 4 active":"Fan stage 4 active",
				"Fan stage 5 active":"Fan stage 5 active",
				"Fan stage 6 active":"Fan stage 6 active",
				"Boost ventilation active":"Boost ventilation active",
				"Snooze mode active":"Snooze mode active",
				"All areas fan stage 0":"All areas fan stage 0",
				"Automatic timer active":"Automatic timer active",
				"CO2 active":"CO2 active",
				"Humidity active":"Humidity active",
				"Filter exhausted":"Filter exhausted",
				"General message":"General message",
				"General error":"General error"
			}
		});
		await this.setStateAsync("Gateway " + id + ".Setup_outputDo" + ".function", {val: setupData.outputDo.function, ack: true});
		const areaDigitalOutput = setupData.outputDo.areas;
		for(const i in areaDigitalOutput) {
			this.setDigitalOutput(id, i, areaDigitalOutput[i]);
		}

		await this.createChannelAsync("Gateway " + id, "Setup_inputAi", {
			"name": {
				"en": "Set up the configuration for the analog input.",
				"de": "Richten Sie die Konfiguration für den analogen Eingang ein.",
				"ru": "Настройте конфигурацию для аналогового входа.",
				"pt": "Configure a configuração para a entrada analógica.",
				"nl": "Zet de configuratie op voor de analog input.",
				"fr": "Configuration de l'entrée analogique.",
				"it": "Impostare la configurazione per l'ingresso analogico.",
				"es": "Configurar la configuración para la entrada analógica.",
				"pl": "Ustanowić konfigurację dla sygnału analogowego.",
				"uk": "Встановити конфігурацію для аналогового введення.",
				"zh-cn": "设立类似投入的组合。."
			},
		});
		await this.createStateAsync("Gateway " + id, "Setup_inputAi", "function", {
			"name": {
				"en": "Response to signal via digital output",
				"de": "Antwort auf das Signal über den digitalen Ausgang",
				"ru": "Ответ на сигнал через цифровой выход",
				"pt": "Resposta ao sinal via saída digital",
				"nl": "Vertaling:",
				"fr": "Réponse au signal via la sortie numérique",
				"it": "Risposta al segnale tramite uscita digitale",
				"es": "Respuesta a la señal mediante salida digital",
				"pl": "Odpowiedzi do sygnału za pośrednictwem cyfrowej produkcji",
				"uk": "Відповідь на сигнал через цифровий вихід",
				"zh-cn": "通过数字产出对信号的反应"
			},
			"role": "text",
			"type": "string",
			"read": true,
			"write": true,
			"states": {
				"None":"None",
				"Fan stage":"Fan stage", 
				"Humidity":"Humidity", 
				"CO2":"CO2", 
				"Ti":"Ti", 
				"Ta":"Ta"
			}
		});
		await this.createStateAsync("Gateway " + id, "Setup_inputAi", "functionType", {
			"name": {
				"en": "function type",
				"de": "Funktionart",
				"ru": "тип функции",
				"pt": "tipo de função",
				"nl": "functionerend type",
				"fr": "type de fonction",
				"it": "tipo di funzione",
				"es": "tipo de función",
				"pl": "typename",
				"uk": "тип функції",
				"zh-cn": "功能类型"
			},
			"role": "text",
			"type": "string",
			"read": true,
			"write": true,
			"states": {
				"0-10 V":"0-10 V",
				"4-20 mA":"4-20 mA"
			}
		});
		await this.createStateAsync("Gateway " + id, "Setup_inputAi", "curvePara_x_lower", {
			"name": {
				"en": "Analog input value in % for the lower setpoint",
				"de": "Analoger Eingangswert in % für den unteren Sollwert",
				"ru": "Аналоговая входная стоимость в % для нижней точки",
				"pt": "Valor de entrada analógico em % para o setpoint inferior",
				"nl": "Analog input waarde in % voor de lagere instelling",
				"fr": "Valeur d'entrée analogique en % pour le paramètre inférieur",
				"it": "Valore di ingresso analogico in % per il setpoint inferiore",
				"es": "Valor de entrada analógico en % para el punto inferior",
				"pl": "Analog wejściowy w % dla niższych punktów końcowych",
				"uk": "Значення аналогового введення в % для нижньої точки",
				"zh-cn": "低定点投入值"
			},
			"role": "text",
			"type": "number",
			"min": 0,
			"max": 50,
			"read": true,
			"write": true,
		});
		await this.createStateAsync("Gateway " + id, "Setup_inputAi", "curvePara_x_upper", {
			"name": {
				"en": "Analog input value in % for the upper setpoint",
				"de": "Analoger Eingangswert in % für den oberen Sollwert",
				"ru": "Аналоговая входная стоимость в % для верхней точки",
				"pt": "Valor de entrada analógico em % para o setpoint superior",
				"nl": "Analog input waarde in % voor de upper setpoint",
				"fr": "Valeur d'entrée analogique en % pour le paramètre supérieur",
				"it": "Valore di ingresso analogico in % per il setpoint superiore",
				"es": "Valor de entrada analógico en % para el punto superior",
				"pl": "Analog wejściowy % dla górnego punktu startowego",
				"uk": "Значення аналогового введення в % для верхньої точки",
				"zh-cn": "高点投入值"
			},
			"role": "text",
			"type": "number",
			"min": 50,
			"max": 100,
			"read": true,
			"write": true,
		});
		await this.createStateAsync("Gateway " + id, "Setup_inputAi", "curvePara_yFanLevel_lower", {
			"name": {
				"en": "Fanlevel to apply at lower setpoint",
				"de": "Fanlevel zur Anwendung im unteren Sollwert",
				"ru": "Fanlevel для подачи заявки на более низкую точку",
				"pt": "Nível de ventilador para aplicar em setpoint inferior",
				"nl": "Fanlevel om te solliciteren op lagere set",
				"fr": "Fanlevel to apply at lower setpoint",
				"it": "Livello di ventilatore da applicare al punto più basso",
				"es": "Nivel de abanico para aplicar en el punto inferior",
				"pl": "Fanpozycja na niższym zbiorze",
				"uk": "Вентилятор для застосування в нижньому точках",
				"zh-cn": "低级申请"
			},
			"role": "text",
			"type": "number",
			"min": 0,
			"max": 3,
			"read": true,
			"write": true,
		});
		await this.createStateAsync("Gateway " + id, "Setup_inputAi", "curvePara_yFanLevel_upper", {
			"name": {
				"en": "Fanlevel to apply at upper setpoint",
				"de": "Fanlevel zur Anwendung im oberen Sollwert",
				"ru": "Fanlevel для подачи заявки на верхней точке",
				"pt": "Nível de ventilador para aplicar no setpoint superior",
				"nl": "Fanlevel om zich te melden bij Upper setpoint",
				"fr": "Fanlevel to apply at upper setpoint",
				"it": "Livello di ventilatore da applicare al punto superiore",
				"es": "Nivel de abanico para aplicar en el punto superior",
				"pl": "Fanpozycja na górnym zbiorze",
				"uk": "Вентилятор для застосування в верхній точці",
				"zh-cn": "申请上级"
			},
			"role": "text",
			"type": "number",
			"min": 3,
			"max": 6,
			"read": true,
			"write": true,
		});
		await this.createStateAsync("Gateway " + id, "Setup_inputAi", "curvePara_yHumidity_lower", {
			"name": {
				"en": "Humidity value in % for humidity regulation mode to apply at lower setpoint",
				"de": "Luftfeuchtigkeitswert in % für Feuchtigkeitsregulierungsmodus auf niedrigerem Sollwert",
				"ru": "Значение влажности в % для режима регулирования влажности, чтобы применить на более низкой точке",
				"pt": "Valor da umidade em % para o modo de regulação da umidade aplicar-se no ponto de ajuste inferior",
				"nl": "Humidity waarde in % voor nederigheidsregeling om te solliciteren op lagere set",
				"fr": "Valeur d ' humidité en % pour le mode de régulation de l ' humidité à appliquer à un point inférieur",
				"it": "Valore di umidità in % per la modalità di regolazione dell'umidità da applicare al punto più basso",
				"es": "Valor de humedad en % para el modo de regulación de humedad para aplicar en el punto inferior",
				"pl": "Wartość w trybie wilgotności w trybie regulacji wilgotności w temperaturze % w trybie regulacji wilgotności do stosowania w niższych wartościach ustawodawczych",
				"uk": "Значення вологості в % для режиму регулювання вологості для застосування при нижчій точковій точці",
				"zh-cn": "湿度管理模式的50%的湿度"
			},
			"role": "text",
			"type": "number",
			"min": 0,
			"max": 50,
			"read": true,
			"write": true,
		});
		await this.createStateAsync("Gateway " + id, "Setup_inputAi", "curvePara_yHumidity_upper", {
			"name": {
				"en": "Humidity value in % for humidity regulation mode to apply at upper setpoint",
				"de": "Feuchtewert in % für Feuchteregelungsart, die sich auf den oberen Sollwert bezieht",
				"ru": "Значение влажности в % для режима регулирования влажности, чтобы применить на верхней точке",
				"pt": "Valor da umidade em % para o modo de regulação da umidade aplicar no ponto de ajuste superior",
				"nl": "Humiditeitswaarde in % voor nederigheidsregeling om toe te passen bij het opstellen van",
				"fr": "Valeur de l ' humidité en % pour le mode de régulation de l ' humidité à appliquer au niveau supérieur",
				"it": "Valore di umidità in % per la modalità di regolazione dell'umidità da applicare al punto superiore",
				"es": "Valor de humedad en % para el modo regulación de humedad para aplicar en el punto superior",
				"pl": "Wartość w % dla regulacji wilgotności w trybie regulacji wilgotności dostosowuje się w górnym punkcie setpoint",
				"uk": "Значення вологості в % для режиму регулювання вологості наносити на верхню точку",
				"zh-cn": "湿度管理模式的50%的湿度"
			},
			"role": "text",
			"type": "number",
			"min": 50,
			"max": 100,
			"read": true,
			"write": true,
		});
		await this.createStateAsync("Gateway " + id, "Setup_inputAi", "curvePara_yCo2_lower", {
			"name": {
				"en": "CO² value in ppm for CO² regulation mode to apply at lower setpoint",
				"de": "CO2-Wert in ppm für CO2-Regelungsmodus auf niedrigeren Sollwert",
				"ru": "Значение CO2 в ppm для режима регулирования CO2 для применения на более низкой точке",
				"pt": "Valor de CO2 em ppm para o modo de regulação de CO2 para aplicar em setpoint inferior",
				"nl": "CO2 waarde in ppm voor CO2 regelgevingsmodus om te solliciteren op lagere set",
				"fr": "Valeur CO2 en ppm pour le mode de régulation CO2 à appliquer à un point de réglage inférieur",
				"it": "Valore di CO2 in ppm per la modalità di regolazione CO2 da applicare al punto più basso",
				"es": "Valor de CO2 en ppm para el modo de regulación de CO2 para aplicar en punto inferior",
				"pl": "Wartość CO2 w trybie regulacji CO2",
				"uk": "CO2 значення в ppm для режиму регулювання CO2 на нижню точку",
				"zh-cn": "CO2 条例模式ppm中的CO2价值"
			},
			"role": "text",
			"type": "number",
			"min": 0,
			"max": 1500,
			"read": true,
			"write": true,
		});
		await this.createStateAsync("Gateway " + id, "Setup_inputAi", "curvePara_yCo2_upper", {
			"name": {
				"en": "CO² value in ppm for CO² regulation mode to apply at upper setpoint",
				"de": "CO2 -Wert in ppm für CO2 -Regelungsmodus für den oberen Sollwert",
				"ru": "Значение CO2 в ppm для режима регулирования CO2, чтобы применить на верхней точке",
				"pt": "Valor de CO2 em ppm para o modo de regulação de CO2 para aplicar no setpoint superior",
				"nl": "CO2-waarde in ppm voor CO2 regelgevingsmodus om te solliciteren op het hoogste punt",
				"fr": "Valeur CO2 en ppm pour le mode de régulation du CO2 à appliquer au point de réglage supérieur",
				"it": "Valore di CO2 in ppm per la modalità di regolazione di CO2 da applicare al punto più alto",
				"es": "Valor de CO2 en ppm para el modo de regulación de CO2 para aplicar en el punto superior",
				"pl": "Wartość CO2 w trybie regulacji CO2",
				"uk": "CO2 значення в ppm для режиму регулювання CO2, щоб застосувати в верхній частині",
				"zh-cn": "CO2 公司2条例模式ppm中的CO2价值"
			},
			"role": "text",
			"type": "number",
			"min": 1500,
			"max": 5000,
			"read": true,
			"write": true,
		});
		await this.createStateAsync("Gateway " + id, "Setup_inputAi", "curvePara_yTemp_lower", {
			"name": {
				"en": "Lower setpoint in °C for linear curve when used for an analog temperature sensor",
				"de": "Unterer Sollwert in °C für lineare Kurve bei Verwendung eines analogen Temperatursensors",
				"ru": "Более низкая установка в °C для линейной кривой при использовании для аналогового датчика температуры",
				"pt": "Setpoint inferior em °C para curva linear quando usado para um sensor de temperatura analógico",
				"nl": "Lower setpoint in therci for lineaire curve wanneer gebruikt voor een analogische temperatuursensor",
				"fr": "Réglage inférieur en °C pour courbe linéaire lorsqu ' il est utilisé pour un capteur de température analogique",
				"it": "Setpoint inferiore in °C per curva lineare quando utilizzato per un sensore di temperatura analogico",
				"es": "Punto de ajuste inferior en °C para curva lineal cuando se utiliza para un sensor de temperatura analógica",
				"pl": "Dolny punkt startowy w °C dla krzywej liniowej przy użyciu analogowego czujnika temperatury",
				"uk": "Нижня точка встановлення в °C для лінійної кривої при використанні для аналогового датчика температури",
				"zh-cn": "使用模拟温度传感器的蒸气曲线的°C"
			},
			"role": "text",
			"type": "number",
			"min": -50,
			"max": 0,
			"read": true,
			"write": true,
		});
		await this.createStateAsync("Gateway " + id, "Setup_inputAi", "curvePara_yTemp_upper", {
			"name": {
				"en": "Upper setpoint in °C for linear curve when used for an analog temperature sensor",
				"de": "Oberer Sollwert in °C für lineare Kurve bei Verwendung eines analogen Temperatursensors",
				"ru": "Верхняя установка в °C для линейной кривой при использовании для аналогового датчика температуры",
				"pt": "Ponto de ajuste superior em °C para curva linear quando usado para um sensor de temperatura analógico",
				"nl": "Upper setpoint in theologie voor lineaire curve als gebruikt voor een analogische temperatuursensor",
				"fr": "Réglage supérieur en °C pour courbe linéaire lorsqu ' il est utilisé pour un capteur de température analogique",
				"it": "Setpoint superiore in °C per curva lineare quando utilizzato per un sensore di temperatura analogico",
				"es": "Punto superior en °C para curva lineal cuando se utiliza para un sensor de temperatura analógica",
				"pl": "Górny punkt startowy w °C dla krzywej liniowej przy użyciu analogowego czujnika temperatury",
				"uk": "Верхня точка встановлення в °C для лінійної кривої при використанні для аналогового датчика температури",
				"zh-cn": "使用模拟温度传感器的线曲线上级点"
			},
			"role": "text",
			"type": "number",
			"min": 0,
			"max": 50,
			"read": true,
			"write": true,
		});
		await this.setStateAsync("Gateway " + id + ".Setup_inputAi" + ".function", {val: setupData.inputAi.function, ack: true});
		await this.setStateAsync("Gateway " + id + ".Setup_inputAi" + ".functionType", {val: setupData.inputAi.functionType, ack: true});
		await this.setStateAsync("Gateway " + id + ".Setup_inputAi" + ".curvePara_x_lower", {val: setupData.inputAi.curveParameters.x.lower, ack: true});
		await this.setStateAsync("Gateway " + id + ".Setup_inputAi" + ".curvePara_x_upper", {val: setupData.inputAi.curveParameters.x.upper, ack: true});
		await this.setStateAsync("Gateway " + id + ".Setup_inputAi" + ".curvePara_yFanLevel_lower", {val: setupData.inputAi.curveParameters.yFanlevel.lower, ack: true});
		await this.setStateAsync("Gateway " + id + ".Setup_inputAi" + ".curvePara_yFanLevel_upper", {val: setupData.inputAi.curveParameters.yFanlevel.upper, ack: true});
		await this.setStateAsync("Gateway " + id + ".Setup_inputAi" + ".curvePara_yHumidity_lower", {val: setupData.inputAi.curveParameters.yHumidity.lower, ack: true});
		await this.setStateAsync("Gateway " + id + ".Setup_inputAi" + ".curvePara_yHumidity_upper", {val: setupData.inputAi.curveParameters.yHumidity.upper, ack: true});
		await this.setStateAsync("Gateway " + id + ".Setup_inputAi" + ".curvePara_yCo2_lower", {val: setupData.inputAi.curveParameters.yCo2.lower, ack: true});
		await this.setStateAsync("Gateway " + id + ".Setup_inputAi" + ".curvePara_yCo2_upper", {val: setupData.inputAi.curveParameters.yCo2.upper, ack: true});
		await this.setStateAsync("Gateway " + id + ".Setup_inputAi" + ".curvePara_yTemp_lower", {val: setupData.inputAi.curveParameters.yTemp.lower, ack: true});
		await this.setStateAsync("Gateway " + id + ".Setup_inputAi" + ".curvePara_yTemp_upper", {val: setupData.inputAi.curveParameters.yTemp.upper, ack: true});
		const areaAnalogInput = setupData.outputDo.areas;
		for(const i in areaAnalogInput) {
			this.setAnalogInput(id, i, areaAnalogInput[i]);
		}
	}

	async setSystemsSetup(id, system, data) {
		try {
			const systemId = parseInt(system.slice(-1));
			await this.createStateAsync("Gateway " + id, "Setup_fans", "system" + systemId + "_type", {
				"name": {
					"en": "Remaining filter run time in days",
					"de": "Rest Filterlaufzeit in Tagen",
					"ru": "Оставшееся время запуска фильтра в днях",
					"pt": "Permanecendo tempo de execução do filtro em dias",
					"nl": "Weer filtertijd in dagen",
					"fr": "Durée du filtre restante en jours",
					"it": "Mantenere il tempo di funzionamento del filtro in giorni",
					"es": "Permanecer el tiempo de funcionamiento del filtro en días",
					"pl": "Zmniejszenie filtra trwa w ciągu kilku dni",
					"uk": "Термін дії фільтра в день",
					"zh-cn": "时间过长。"
				},
				"role": "text",
				"type": "string",
				"read": true,
				"write": true,
				"states": {
					"None":"None",
					"SEVi160":"SEVi160",
					"SEVi200":"SEVi200",
					"SEVi160D Mini Exhaust":"SEVi160D Mini Exhaust",
					"SEVi160D Mini":"SEVi160D Mini",
					"SEVi160 S":"SEVi160 S",
					"SEVi160 Eco":"SEVi160 Eco",
					"SEVi160 PRO-S":"SEVi160 PRO-S",
					"SEVi160 PRO-ECO":"SEVi160 PRO-ECO",
					"SEVi160D Mini PRO Exh":"SEVi160D Mini PRO Exh",
					"SEVi160D Mini PRO":"SEVi160D Mini PRO",
					"Configurable Device":"Configurable Device",
				}
			});
			await this.createStateAsync("Gateway " + id, "Setup_fans", "system" + systemId + "_installedOnArea", {
				"name": {
					"en": "installed in area",
					"de": "installiert im Bereich",
					"ru": "установленный в зоне",
					"pt": "instalado na área",
					"nl": "geïnstalleerd in de buurt",
					"fr": "installé dans la zone",
					"it": "installato in area",
					"es": "instalado en la zona",
					"pl": "zainstalowany na obszarze",
					"uk": "встановлена в зоні",
					"zh-cn": "在该地区安装"
				},
				"role": "text",
				"type": "string",
				"read": true,
				"write": true,
			});
			await this.setStateAsync("Gateway " + id + ".Setup_fans" + ".system" + systemId + "_type", {val: data.type, ack: true});
			await this.setStateAsync("Gateway " + id + ".Setup_fans" + ".system" + systemId + "_installedOnArea", {val: data.installed, ack: true});
		} catch (err) {
			this.log.error(err);
		}
	}
	async setAreaSetup(id, area, data) {
		try {
			const areaId = parseInt(area.slice(-1));
			await this.createStateAsync("Gateway " + id, "Setup_fans", "area" + areaId, {
				"name": {
					"en": "Function of the fan per area",
					"de": "Funktion des Lüfters pro Bereich",
					"ru": "Функция вентилятора на зону",
					"pt": "Função do ventilador por área",
					"nl": "Vertaling:",
					"fr": "Fonction du ventilateur par zone",
					"it": "Funzione del ventilatore per area",
					"es": "Función del ventilador por área",
					"pl": "Function of the fan per area (ang.)",
					"uk": "Функції вентилятора на область",
					"zh-cn": "B. 每一地区狂热的功能"
				},
				"role": "text",
				"type": "string",
				"read": true,
				"write": true,
				"states": {
					"Supply and exhaust air":"Supply and exhaust air",
					"Only supply air":"Only supply air",
					"Only exhaust air":"Only exhaust air",
				}
			});
			await this.setStateAsync("Gateway " + id + ".Setup_fans" + ".area" + areaId, {val: data, ack: true});
		} catch (err) {
			this.log.error(err);
		}
	}
	async setDigitalInput(id, area, data) {
		try {
			const areaId = parseInt(area.slice(-1));
			await this.createStateAsync("Gateway " + id, "Setup_inputDi", "area" + areaId + "_inputDi", {
				"name": {
					"en": "Allocation of a digital input signal to an area",
					"de": "Zuordnung eines digitalen Eingangssignals zu einem Bereich",
					"ru": "Распределение цифрового входного сигнала в зону",
					"pt": "Alocação de um sinal de entrada digital para uma área",
					"nl": "Vertaling:",
					"fr": "Allocation d'un signal d'entrée numérique à une zone",
					"it": "Distribuzione di un segnale di ingresso digitale in un'area",
					"es": "Asignación de una señal de entrada digital a un área",
					"pl": "Przydzielanie sygnału wejściowego do obszaru",
					"uk": "Розміщення цифрового сигналу в область",
					"zh-cn": "向一个地区分配数字投入信号"
				},
				"role": "state",
				"type": "boolean",
				"read": true,
				"write": true,
			});
			await this.setStateAsync("Gateway " + id + ".Setup_inputDi" + ".area" + areaId + "_inputDi", {val: data, ack: true});
		} catch (err) {
			this.log.error(err);
		}
	}
	async setDigitalOutput(id, area, data) {
		try {
			const areaId = parseInt(area.slice(-1));
			await this.createStateAsync("Gateway " + id, "Setup_outputDo", "area" + areaId + "_outputDo", {
				"name": {
					"en": "Allocation of a digital output signal from an area",
					"de": "Zuordnung eines digitalen Ausgangssignals aus einem Bereich",
					"ru": "Распределение цифрового выходного сигнала из области",
					"pt": "Alocação de um sinal de saída digital de uma área",
					"nl": "Vertaling:",
					"fr": "Répartition d'un signal de sortie numérique depuis une zone",
					"it": "Distribuzione di un segnale di uscita digitale da un'area",
					"es": "Asignación de una señal de salida digital desde un área",
					"pl": "Alokacja cyfrowego sygnału wyjściowego z obszaru",
					"uk": "Розміщення цифрового вихідного сигналу з області",
					"zh-cn": "从一个地区分配数字产出信号"
				},
				"role": "state",
				"type": "boolean",
				"read": true,
				"write": true,
			});
			await this.setStateAsync("Gateway " + id + ".Setup_outputDo" + ".area" + areaId + "_outputDo", {val: data, ack: true});
		} catch (err) {
			this.log.error(err);
		}
	}
	async setAnalogInput(id, area, data) {
		try {
			const areaId = parseInt(area.slice(-1));
			await this.createStateAsync("Gateway " + id, "Setup_inputAi", "area" + areaId + "_inputAi", {
				"name": {
					"en": "Allocation of a analog input signal to an area",
					"de": "Zuordnung eines analogen Eingangssignals zu einem Bereich",
					"ru": "Распределение аналогового входного сигнала в зону",
					"pt": "Alocação de um sinal de entrada analógico para uma área",
					"nl": "Vertaling:",
					"fr": "Allocation d'un signal d'entrée analogique à une zone",
					"it": "Distribuzione di un segnale di ingresso analogico a un'area",
					"es": "Asignación de una señal de entrada analógica a una zona",
					"pl": "Przydzielanie analogowego sygnału wejściowego do obszaru",
					"uk": "Розподіл аналогових вхідних сигналів на область",
					"zh-cn": "向一个地区分配类似的投入信号"
				},
				"role": "state",
				"type": "boolean",
				"read": true,
				"write": true,
			});
			await this.setStateAsync("Gateway " + id + ".Setup_inputAi" + ".area" + areaId + "_inputAi", {val: data, ack: true});
		} catch (err) {
			this.log.error(err);
		}
	}

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

