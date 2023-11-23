import * as sp from '../seisplotjs/seisplotjs_3.1.1_standalone.mjs';
import { Duration } from "../seisplotjs/luxon-types/src/duration"; 
import { DateTime } from '../seisplotjs/luxon-types/index';

const luxon = sp.luxon;

const DEFAULT_DURATION = "P1D";
const SeismogramDisplayData = sp.seismogram.SeismogramDisplayData;
const HelicorderConfig = sp.helicorder.HelicorderConfig;

const MINMAX_URL = "https://eeyore.seis.sc.edu/minmax";
const MSEED_URL = "https://eeyore.seis.sc.edu/mseed";

const QUAKE_START_OFFSET = luxon.Duration.fromObject({ hours: 1 });

const HOURS_PER_LINE = 2;
const RETURN_KEYCODE = 13;
const DEFAULT_FIXED_AMP = 10000;

enum LocCode {
	DOUBLE_0
}

const locCodeList = ['00', '01'];
const orientList = ['Z', 'N/1', 'E/2'];
const bandInstCodeList = ['HN', 'HH', 'LH'];
const netCodeList = ['CO', 'N4'];
const bandCodeList = ['H', 'L'];
const instCodeList = ['H', 'N'];
const stationList = ['BARN', 'BIRD', 'C1SC', 'CASEE', 'CSB', 'HAW', 'HODGE', 'JKYD', 'JSC', 'PAULI', 'SUMMV', 'TEEBA'];

interface FilterConfig {
	type: string,
	lowCut: string,
	highCut: string
}

interface Config {
	netCodeList: string[],
	stationList: string[],
	bandCodeList: string[],
	instCodeList: string[],
	orientationCodeList: string[],
	netCode: string,
	station: string,
	locCode: string,
	bandCode: string,
	instCode: string,
	orientationCode: string,
	altOrientationCode: string,
	endTime: string,
	duration: string,
	doMinMax: boolean,
	amp: string,
	rmean: boolean,
	filter: FilterConfig
}

// Update the HTML date chooser object with the given time and duration (luxon Duration)
//   If either parameter is missing, use the previous value for the parameter, if it exists
// @param time: ISO-formatted luxon time for the date value of the date chooser
// @param duration: luxon Duration for the time value of the date chooser
function updateDateChooser(time: string = state.endTime, duration: string = state.duration) : void {
	const DateTimeChooser = sp.datechooser["DateTimeChooser"];
	// For some reason, the DateTimerChooser variable in sp doesn't register as a class, so we use typeof
	let dateChooser : typeof DateTimeChooser = document.querySelector("sp-datetime");
	if (time && duration) {
		let luxonDateTime : DateTime = sp.util.isoToDateTime(time);
		let luxonDuration : Duration = luxon.Duration.fromISO(duration);
		if (luxonDateTime.isValid && luxonDuration.isValid) {
			dateChooser.updateTime(luxonDateTime.minus(luxonDuration));
			return;
		}
	}
	throw new Error(`[ERROR] updateDateChooser: missing time/duration: ${time}, ${duration}`);
}

function handleFilteringChange(config : Config, type : string, lowCut : string, highCut : string) : void {
	config.filter.type = type;
	config.filter.lowCut = lowCut;
	config.filter.highCut = highCut;

	redraw();
}

function handleAmpChange(config, value) {
	if (value === "max") {
		config.amp = value;
	} else if (typeof value === 'string' && value.endsWith('%')) {
		config.amp = value;
	} else if (Number.isFinite(value)) {
		config.amp = value;
	} else {
		// assume empty/bad value in text box
		console.log(`bad value in amp: ${value}`);
		config.amp = 10000;
		document.querySelector("#amp")
			.querySelector("input#fixedAmpText").value = config.amp;
	}
	updatePageForConfig(config);
	redraw();
}

function setupEventHandlers(config) {
	document.querySelector("button#goheli").addEventListener("click", () => {
		document.querySelector("#heli").setAttribute("style", "display: block;");
		document.querySelector("#seismograph").setAttribute("style", "display: none;");
	});
	document.querySelector("button#reload").addEventListener("click", () => {
		const orgDisp = document.querySelector("sp-organized-display");
		const timeRangesToReload = [];
		const dispElements = orgDisp.getDisplayItems();
		dispElements.forEach(orgDispItem => {
			if (orgDispItem.plottype.startsWith(sp.organizeddisplay.SEISMOGRAPH)) {
				const seismograph = orgDispItem.getContainedPlotElements()[0];// as sp.seismograph.Seismograph;
				seismograph.seisData.forEach(sdd => {

					const dispWindow = seismograph.displayTimeRangeForSeisDisplayData(sdd);

					let start = sdd.start;
					let end = sdd.end;
					if (dispWindow.start < sdd.start) { start = dispWindow.start; }
					if (dispWindow.end > sdd.end) { end = dispWindow.end; }
					sdd.timeRange = luxon.Interval.fromDateTimes(start, end);
				});
			}
		});
		loadDataReal(orgDisp.seisData).then(sddList => {
			orgDisp.draw();
		});
	});
	const staDiv = document.querySelector("#scsnStations");
	stationList.forEach(sta => {
		const span = staDiv.appendChild(document.createElement("span"));
		const button = span.appendChild(document.createElement("input"));
		const label = span.appendChild(document.createElement("label"));
		label.textContent = sta;
		button.setAttribute("type", "radio");
		button.setAttribute("class", "shape");
		button.setAttribute("name", "station");
		button.textContent = sta;
		button.value = sta;
		button.checked = sta === config.station;
		button.addEventListener('click', event => {
			config.station = sta;
			loadAndPlot(config);
		});
	});


	const orientDiv = document.querySelector("#orientations");
	orientList.forEach(orient => {
		const span = orientDiv.appendChild(document.createElement("span"));
		const button = span.appendChild(document.createElement("input"));
		const label = span.appendChild(document.createElement("label"));
		label.textContent = orient;
		button.setAttribute("type", "radio");
		button.setAttribute("class", "shape");
		button.setAttribute("name", "orientation");
		button.textContent = orient;
		button.value = orient;
		button.checked = orient === config.orientationCode;
		button.addEventListener('click', event => {
			let newOrientationCode = orient;
			if (newOrientationCode.length > 1) {
				config.altOrientationCode = newOrientationCode.slice(-1);
				config.orientationCode = newOrientationCode.charAt(0);
			} else {
				config.orientationCode = newOrientationCode;
				config.altOrientationCode = "";
			}
			console.log(`click ${config.orientationCode} ${config.altOrientationCode}`);
			loadAndPlot(config);
		});
	});


	const instDiv = document.querySelector("#instruments");
	bandInstCodeList.forEach(bandinst => {
		const span = instDiv.appendChild(document.createElement("span"));
		const button = span.appendChild(document.createElement("input"));
		const label = span.appendChild(document.createElement("label"));
		button.setAttribute("type", "radio");
		button.setAttribute("class", "shape");
		button.setAttribute("name", "instrument");
		let labelName;
		if (bandinst === 'HN') {
			labelName = "Strong Motion";
		} else if (bandinst === 'HH') {
			labelName = "Seismometer";
		} else if (bandinst === 'LH') {
			labelName = "Long Period";
		} else {
			labelName = "UNKNOWN???";
		}
		label.textContent = labelName;
		button.textContent = bandinst;
		button.value = bandinst;
		button.checked = bandinst.charAt(0) === config.bandCode && bandinst.charAt(1) === config.instCode;
		button.addEventListener('click', event => {
			config.bandCode = bandinst.charAt(0);
			config.instCode = bandinst.charAt(1);
			console.log(`click ${config.bandCode}${config.instCode}`);
			loadAndPlot(config);
		});
	});

	const locDiv = document.querySelector("#loccode");
	locCodeList.forEach(loc => {
		const span = locDiv.appendChild(document.createElement("span"));
		const button = span.appendChild(document.createElement("input"));
		const label = span.appendChild(document.createElement("label"));
		label.textContent = loc;
		button.setAttribute("type", "radio");
		button.setAttribute("class", "shape");
		button.setAttribute("name", "loccode");
		button.textContent = loc;
		button.value = loc;
		button.checked = loc === config.locCode;
		button.addEventListener('click', event => {
			config.locCode = locCode;
			console.log(`click ${config.locCode} ${config.bandCode}${config.instCode}`);
			loadAndPlot(config);
		});
	});

	document.querySelector("button#loadNow").addEventListener("click", function (d) {
		config.endTime = getNowTime().toISO();
		console.log(`now ${config.endTime}`);
		updateDateChooser(config);
		loadAndPlot(config);
	});

	document.querySelector("button#loadToday").addEventListener("click", function (d) {
		config.endTime = luxon.DateTime.utc().endOf('day').plus({ millisecond: 1 }).toISO();
		console.log(`today ${config.endTime}`);
		updateDateChooser(config);
		loadAndPlot(config);
	});

	document.querySelector("button#loadPrev").addEventListener("click", function (d) {
		let e = config.endTime;
		if (!e || e === 'now') {
			e = getNowTime();
		} else {
			e = luxon.DateTime.fromISO(e).toUTC();
		}
		config.endTime = e.minus({ days: 1 }).toISO();
		console.log(`prev ${config.endTime}`);
		updateDateChooser(config);
		loadAndPlot(config);
	});

	document.querySelector("button#loadNext").addEventListener("click", function (d) {
		let e = config.endTime;
		if (!e || e === 'now') {
			e = getNowTime();
		} else {
			e = luxon.DateTime.fromISO(e).toUTC();
		}
		config.endTime = e.plus({ day: 1 }).toISO();
		console.log(`next ${config.endTime}`);
		updateDateChooser(config);
		loadAndPlot(config);
	});

	document.querySelector("input#maxAmp").addEventListener("click", function (d) {
		handleAmpChange(config, "max");
	});

	document.querySelector("input#fixedAmp").addEventListener("click", function (d) {
		let value = Number(document.querySelector("input#fixedAmpText").value);
		handleAmpChange(config, value);
	});
	document.querySelector("input#fixedAmpText").addEventListener("keypress", function (e) {
		if (e.keyCode === RETURN_KEYCODE) {
			let value = Number(document.querySelector("input#fixedAmpText").value);
			handleAmpChange(config, value);
		}
	});
	document.querySelector("input#fixedAmpText").addEventListener("change", function (e) {
		let value = Number(document.querySelector("input#fixedAmpText").value);
		handleAmpChange(config, value);
	});

	document.querySelector("input#percentAmp").addEventListener("click", updateAmpPercent);
	document.querySelector("#percentAmpSlider").addEventListener("input", updateAmpPercent);
	function updateAmpPercent() {
		let percStr = `${document.querySelector("input#percentAmpSlider").value}%`;
		document.querySelector("#percentValue").textContent = percStr;
		handleAmpChange(config, percStr);
	}

	document.querySelector("input#minmax").addEventListener("change", () => {
		config.dominmax = document.querySelector("input#minmax").checked;
		loadAndPlot(config).then(() => { enableFiltering(config.heliDataIsMinMax) });
	});
	document.querySelector("input#rmean").addEventListener("change", () => {
		config.rmean = document.querySelector("input#rmean").checked;
		redraw();
	});

	document.querySelector("input#allpass").addEventListener("change", () => {
		handleFilteringChange(config, "allpass",
			document.querySelector("input#lowcut").value,
			document.querySelector("input#highcut").value
		);
	});

	document.querySelector("input#lowpass").addEventListener("change", () => {
		handleFilteringChange(config, "lowpass",
			document.querySelector("input#lowcut").value,
			document.querySelector("input#highcut").value
		);
	});

	document.querySelector("input#bandpass").addEventListener("change", () => {
		handleFilteringChange(config, "bandpass",
			document.querySelector("input#lowcut").value,
			document.querySelector("input#highcut").value
		);
	});

	document.querySelector("input#highpass").addEventListener("change", () => {
		handleFilteringChange(config, "highpass",
			document.querySelector("input#lowcut").value,
			document.querySelector("input#highcut").value
		);
	});

}

function updatePageForConfig(currentConfig) {
	// minmax
	document.querySelector("input#minmax").checked = currentConfig.dominmax;

	// rmean
	document.querySelector("input#rmean").checked = currentConfig.rmean;

	// filtering
	let doAllPass = false;
	let doLowPass = false;
	let doBandPass = false;
	let doHighPass = false;
	if (currentConfig && currentConfig.filter) {
		if (currentConfig.filter.type === "lowpass") {
			doLowPass = "true";
		} else if (currentConfig.filter.type === "bandpass") {
			doBandPass = "true";
		} else if (currentConfig.filter.type === "highpass") {
			doHighPass = "true";
		} else {
			// all pass
			doAllPass = "true";
		}
		document.querySelector("input#allpass").checked = doAllPass;
		document.querySelector("input#lowpass").checked = doLowPass;
		document.querySelector("input#bandpass").checked = doBandPass;
		document.querySelector("input#highpass").checked = doHighPass;

		document.querySelector("input#lowcut").value = currentConfig.filter.lowcut;
		document.querySelector("input#lowcut").textContent = currentConfig.filter.lowcut;
		document.querySelector("input#highcut").value = currentConfig.filter.highcut;
		document.querySelector("input#highcut").textContent = currentConfig.filter.highcut;
	}

	// amp
	document.querySelector("#percentAmp").checked = true;
	document.querySelector("#maxAmp").checked = false;
	document.querySelector("#fixedAmp").checked = false;
	if (currentConfig) {
		if (typeof currentConfig.amp === 'string' && currentConfig.amp.endsWith('%')) {
			let percent = Number(currentConfig.amp.substring(0, currentConfig.amp.length - 1));
			document.querySelector("input#percentAmpSlider").value = percent;
			document.querySelector("#percentAmp").checked = true;
		} else if (currentConfig.amp === "max") {
			document.querySelector("#maxAmp").checked = true;
			currentConfig.amp = "max";
		} else if (Number.isFinite(Number(currentConfig.amp))) {
			document.querySelector("#fixedAmp").checked = true;
			document.querySelector("input#fixedAmpText").value = currentConfig.amp;
			document.querySelector("input#fixedAmpText").textContent = currentConfig.amp;
		} else {
			// default to max?
			document.querySelector("#maxAmp").checked = true;
			currentConfig.amp = "max";
		}

	} else {
		// default to max?
		document.querySelector("#maxAmp").checked = true;
		currentConfig.amp = "max";
	}

	// earthquake query params
	updateEarthquakeQueryParam(currentConfig, 'localMinLat', 31.75);
	updateEarthquakeQueryParam(currentConfig, 'localMaxLat', 35.5);
	updateEarthquakeQueryParam(currentConfig, 'localMinLon', -84);
	updateEarthquakeQueryParam(currentConfig, 'localMaxLon', -78);
	updateEarthquakeQueryParam(currentConfig, 'regionalMaxRadius', 10);
	updateEarthquakeQueryParam(currentConfig, 'regionalMinMag', 4.5);
	updateEarthquakeQueryParam(currentConfig, 'globalMinMag', 6);
	loadAllEarthquakeQueryParams(currentConfig);
};

function updateEarthquakeQueryParam(currentConfig, id, defaultValue) {
	let region = 'global';
	if (id.startsWith('local')) {
		region = 'local';
	} else if (id.startsWith('regional')) {
		region = 'regional';
	} else if (id.startsWith('global')) {
		region = 'global';
	} else {
		throw new Error(`Unknown region for ${id}`);
	}
	if (!Number.isFinite(Number(currentConfig[id]))) {
		currentConfig[id] = defaultValue;
	}
	if (typeof currentConfig[id] !== 'number') {
		currentConfig[id] = parseFloat(currentConfig[id]);
	}
	document.querySelector("div#" + region)
		.querySelector("input#" + id).value = currentConfig[id];
};

function loadAllEarthquakeQueryParams(currentConfig) {
	loadEarthquakeQueryParam(currentConfig, 'localMinLat');
	loadEarthquakeQueryParam(currentConfig, 'localMaxLat');
	loadEarthquakeQueryParam(currentConfig, 'localMinLon');
	loadEarthquakeQueryParam(currentConfig, 'localMaxLon');
	loadEarthquakeQueryParam(currentConfig, 'regionalMaxRadius');
	loadEarthquakeQueryParam(currentConfig, 'regionalMinMag');
	loadEarthquakeQueryParam(currentConfig, 'globalMinMag');
}

function loadEarthquakeQueryParam(currentConfig, id) {
	let region = 'global';
	if (id.startsWith('local')) {
		region = 'local';
	} else if (id.startsWith('regional')) {
		region = 'regional';
	} else if (id.startsWith('global')) {
		region = 'global';
	} else {
		throw new Error(`Unknown region for ${id}`);
	}
	let inputVal = document.querySelector("div#" + region)
		.querySelector("input#" + id).value;
	if (Number.isFinite(Number(inputVal))) {
		currentConfig[id] = parseFloat(inputVal);
	} else {
		throw new Error(`Value for input ${id} is not a valid number: ${inputVal}`);
	}
}

function enableFiltering(heliDataIsMinMax) {
	if (heliDataIsMinMax) {
	}
	document.querySelector("#filtering")
		.querySelector("input#allpass").disabled = heliDataIsMinMax;
	document.querySelector("#filtering")
		.querySelector("input#lowpass").disabled = heliDataIsMinMax;
	document.querySelector("#filtering")
		.querySelector("input#bandpass").disabled = heliDataIsMinMax;
	document.querySelector("#filtering")
		.querySelector("input#highpass").disabled = heliDataIsMinMax;
}

function getNowTime() {
	let e = luxon.DateTime.utc().endOf('hour').plus({ milliseconds: 1 });
	e.plus({ hours: e.hour % HOURS_PER_LINE });
	return e;
}

function createEmptySavedData(config) {
	const luxDur = luxon.Duration.fromISO(config.duration);

	// stringify end...
	let end = config.endTime;
	if (luxon.DateTime.isDateTime(end)) {
		config.endTime = end.toISO();
	}
	let plotEnd;
	if (luxon.DateTime.isDateTime(end)) {
		plotEnd = end;
	} else if (!end || end.length === 0 || end === 'now') {
		plotEnd = getNowTime();
	} else if (end === 'today') {
		plotEnd = luxon.DateTime.utc().endOf('day').plus(ONE_MILLISECOND);
	} else {
		plotEnd = luxon.DateTime.fromISO(config.endTime).toUTC();
	}
	let timeRange = luxon.Interval.before(plotEnd, luxDur);
	let hash = {
		config: config,
		timeRange: timeRange,
		staCode: config.station,
		bandCode: config.bandCode,
		instCode: config.instCode,
		minMaxInstCode: config.instCode === 'H' ? 'X' : 'Y',
		amp: config.amp ? config.amp : "max",
		netArray: [],
		chanTR: [],
		origData: null,
		seisData: null,
		centerTime: null,

	};
	return hash;
}
function doPlot(config) {
	const heliDiv = document.querySelector('#heli');
	if (config.station && (!heliDiv || window.getComputedStyle(heliDiv) === "none")) {
		document.querySelector("#heli").setAttribute("style", "display: none;");
		document.querySelector("#seismograph").setAttribute("style", "display: block;");
		let hash = createEmptySavedData(config);
		if (hash.chanTR.length === 0) {
			console.log("no data")
		}
		drawSeismograph(hash);
		return Promise.resolve(hash);
	} else {
		return doPlotHeli(config);
	}
}

function doPlotHeli(config) {
	document.querySelector("#heli").setAttribute("style", "display: block;");
	document.querySelector("#seismograph").setAttribute("style", "display: none;");
	const ONE_MILLISECOND = luxon.Duration.fromMillis(1);

	let nowHour = sp.util.isoToDateTime("now").endOf('hour').plus({ milliseconds: 1 });
	let hash = createEmptySavedData(config);

	if (!config.station) {
		return Promise.resolve(hash);
	}
	if (!config.duration) {
		config.duration = DEFAULT_DURATION;
	}
	history.pushState(config, "title");

	hash.heli = document.querySelector("sp-helicorder");
	if (hash.heli) {
		// draw empty SDD so clear existing and fix labels
		hash.heli.heliConfig.fixedTimeScale = hash.timeRange;
		hash.heli.seisData = [];
		hash.heli.draw();
	}

	clearMessages();
	showMessage(`...loading ${config.netCode}.${config.station}.`);

	let netCodeQuery = netCodeList.join();
	let staCodeQuery = stationList.join();
	let locCodeQuery = config.locCode;
	let chanCodeQuery = [];
	bandCodeList.forEach(bc => {
		instCodeList.forEach(ic => chanCodeQuery.push(`${bc}${ic}?`));
	});
	chanCodeQuery = chanCodeQuery.join();
	document.querySelector("span.textNetCode").textContent = "";
	document.querySelector("span.textStaCode").textContent = "";
	document.querySelector("span.textLocCode").textContent = "";
	document.querySelector("span.textChanCode").textContent = "";
	document.querySelector("span.startTime").textContent =
		`${hash.timeRange.start.toFormat('(ooo), MMM d, yyyy HH:mm')}  [GMT]`;
	document.querySelector("span.endTime").textContent =
		`${hash.timeRange.end.toFormat('(ooo), MMM d, yyyy HH:mm')} [GMT]`;
	let channelPromise;
	if (true) {
		// default load from fdsnws
		let channelQuery = new sp.fdsnstation.StationQuery()
			.nodata(404)
			.networkCode(netCodeQuery)
			.stationCode(staCodeQuery)
			.locationCode(locCodeQuery)
			.channelCode(chanCodeQuery)
			.startTime(hash.timeRange.start)
			.endTime(hash.timeRange.start.plus(sp.luxon.Duration.fromMillis(3600 * 1000)));
		channelPromise = channelQuery.queryChannels();
	} else {
		// or load from local stationxml file
		const fetchInitOptions = sp.util.defaultFetchInitObj(sp.util.XML_MIME);
		const url = "metadata.staxml";
		channelPromise = sp.util.doFetchWithTimeout(url, fetchInitOptions)
			.then(function (response) {
				if (response.status === 200 || response.status === 0) {
					return response.text();
				} else {
					// no data
					throw new Error("No data");
				}
			}).then(rawXmlText => {
				const rawXml = new DOMParser().parseFromString(rawXmlText, "text/xml");
				return sp.stationxml.parseStationXml(rawXml);
			});
	}
	return channelPromise
		.catch(e => {
			showError(`Error Loading Data, retrying... ${e}`);
			return new Promise(resolve => setTimeout(resolve, 2000, channelQuery.queryChannels()));
		})
		.then(netArray => {
			if (netArray.length === 0) {
				showError("No channels found");
				hash.seisData = null;
				hash.origData = null;
			}
			let chanTR = [];
			hash.chanTR = chanTR;
			hash.netArray = netArray;
			const matchChannels = sp.stationxml.findChannels(netArray,
				'.*', config.station, config.locCode, `${config.bandCode}${config.instCode}[${config.orientationCode}${config.altOrientationCode}]`);
			console.log(`search sta: ${config.station}`)
			console.log(`search loc: ${config.locCode}`)
			console.log(`search channels:  ${config.bandCode}${config.instCode}[${config.orientationCode}${config.altOrientationCode}]`)
			if (matchChannels.length === 0) {
				console.log(`WARN: found no channels`);
			}
			for (let c of matchChannels) {
				if (c.channelCode.endsWith(config.orientationCode) || (config.altOrientationCode && c.channelCode.endsWith(config.altOrientationCode))) {
					chanTR.push(sp.seismogram.SeismogramDisplayData.fromChannelAndTimeWindow(c, hash.timeRange));
				}
			}
			const firstChan = chanTR[0];
			if (firstChan) {
				document.querySelector("span.textNetCode").textContent = firstChan.networkCode;
				document.querySelector("span.textStaCode").textContent = firstChan.stationCode;
				document.querySelector("span.textLocCode").textContent = firstChan.locationCode;
				document.querySelector("span.textChanCode").textContent = firstChan.channelCode;
			}
			hash.heli = document.querySelector("sp-helicorder");
			if (hash.heli) {
				// draw empty SDD so clear existing and fix labels
				hash.heli.heliConfig.fixedTimeScale = hash.timeRange;
				hash.heli.seisData = chanTR;
				hash.heli.draw();
			}
			return hash;
		}).then(hash => {
			let chantrList;
			let minMaxSddList = [];
			let rawDataList = [];
			hash.chanTR
				.filter(sdd => sdd.startTime < luxon.DateTime.utc())
				.forEach(sdd => {
					if (hash.config.dominmax && sdd.networkCode === 'CO' && sdd.sourceId.bandCode === 'H') {
						minMaxSddList.push(sdd);
					} else {
						rawDataList.push(sdd);
					}
				});
			let minMaxPromise = Promise.resolve([]);
			let rawDataPromise = Promise.resolve([]);
			if (hash.config.dominmax && minMaxSddList.length > 0) {
				let minMaxQ = new sp.mseedarchive.MSeedArchive(
					MINMAX_URL, "%n/%s/%Y/%j/%n.%s.%l.%c.%Y.%j.%H");
				minMaxSddList = minMaxSddList.map(ct => {
					let chanCode = "L" + hash.minMaxInstCode + ct.channel.channelCode.charAt(2);
					let fake = new sp.stationxml.Channel(ct.channel.station, chanCode, ct.channel.locationCode);
					fake.sampleRate = 2;
					hash.heliDataIsMinMax = true;
					return sp.seismogram.SeismogramDisplayData.fromChannelAndTimeWindow(fake, ct.timeRange);
				}).filter(sdd => !!sdd);
				minMaxPromise = minMaxQ.loadSeismograms(minMaxSddList);
			} else if (rawDataList.length > 0) {
				rawDataPromise = loadDataReal(rawDataList);
				hash.heliDataIsMinMax = false;
			} else {
				showError("No channels match selections");
			}
			return Promise.all([hash, rawDataPromise, minMaxPromise]).then(hArr => {
				hArr[0].minMaxSddList = hArr[2];
				hArr[0].chantrList = hArr[1].concat(hArr[2]);
				return hArr[0];
			});
		}).then(hash => {
			console.log(`concat hash ${hash.chantrList.length}`);
			hash.chantrList.forEach(sdd => console.log(`  ${sdd}: ${!!sdd.seismogram}`))
			let gotData = hash.minMaxSddList.reduce((acc, cur) => acc || !!cur.seismogram, false)
				|| hash.chantrList.reduce((acc, cur) => acc || !!cur.seismogram, false);
			if (!gotData) {
				showError("No Data Found MSeedArchive");
				console.log("min max data from miniseedArchive found none");
				if (false && hash.chanTR.length > 0) {
					let dsQ = new sp.fdsndataselect.DataSelectQuery()
						.nodata(404);
					hash.chantrList = dsQ.postQuerySeismograms(hash.chanTR);
					hash.query = dsQ;
				} else {
					hash.chantrList = [];
					hash.query = null;
				}
			}
			return Promise.all([hash, hash.chantrList]).then(hArr => {
				hArr[0].chantrList = hArr[1];
				return hArr[0];
			});
		}).then(hash => {
			let minMaxSeismogram = null;
			hash.chantrList.forEach(ctr => {
				if (ctr.channel.channelCode === `L${hash.minMaxInstCode}${hash.config.orientationCode}` || ctr.channel.channelCode === `L${hash.minMaxInstCode}${hash.config.altOrientationCode}`) {
					minMaxSeismogram = ctr.seismogram;
				} else if (ctr.channel.channelCode === `${hash.bandCode}${hash.instCode}${hash.config.orientationCode}` || ctr.channel.channelCode === `${hash.bandCode}${hash.instCode}${hash.config.altOrientationCode}`) {
					minMaxSeismogram = ctr.seismogram;
					document.querySelector("span.textChanCode").textContent = ctr.channel.channelCode;
				} else {
					throw new Error(`Cannot find trace ends with L${hash.minMaxInstCode}${hash.config.orientationCode} or L${hash.minMaxInstCode}${hash.config.altOrientationCode} or ${hash.bandCode}${hash.instCode}${hash.config.orientationCode}`);
				}
			});
			if (!minMaxSeismogram) {
				showError("No Data Found DataSelect");
			} else {
				hash.origData = SeismogramDisplayData.fromSeismogram(minMaxSeismogram);
				let nowMarker = { markertype: 'predicted', name: "now", time: luxon.DateTime.utc() };
				hash.origData.addMarkers(nowMarker);
				hash.seisData = hash.origData;
				redrawHeli(hash);
				return queryEarthquakes(hash);
			}
			return hash;
		}).catch(err => {
			console.log(err);
			console.assert(false, err);
		});
};

function queryEarthquakes(hash) {
	return Promise.resolve(hash).then(hash => {
		let quakeStart = hash.timeRange.start.minus(QUAKE_START_OFFSET);
		let localQuakesQuery = new sp.fdsnevent.EventQuery();
		localQuakesQuery
			.minMag(0)
			.startTime(quakeStart)
			.endTime(hash.timeRange.end)
			.minLat(hash.config.localMinLat)
			.maxLat(hash.config.localMaxLat)
			.minLon(hash.config.localMinLon)
			.maxLon(hash.config.localMaxLon);
		const localQuakes = localQuakesQuery.query();
		return Promise.all([hash, localQuakes]).then(hArr => {
			hArr[0].localQuakes = hArr[1];
			return hArr[0];
		});
	}).then(hash => {
		// replace each local quake from the big query with one queried by
		// public id, this also gets analyst "picks"
		const redoLocalQuakes = hash.localQuakes.map(q => {
			let quakeQuery = new sp.fdsnevent.EventQuery();
			quakeQuery.eventId(q.eventId);
			return quakeQuery.query().then(qlist => {
				if (qlist && qlist.length > 0) {
					// assume only one, use first
					return qlist[0];
				} else {
					// server didn't find, oh well
					return q;
				}
			});
		});

		return Promise.all([hash, Promise.all(redoLocalQuakes)]).then(hArr => {
			hArr[0].localQuakes = hArr[1];
			return hArr[0];
		});
	}).then(hash => {
		let quakeStart = hash.timeRange.start.minus(QUAKE_START_OFFSET);
		let regionalQuakesQuery = new sp.fdsnevent.EventQuery();
		regionalQuakesQuery
			.startTime(quakeStart)
			.endTime(hash.timeRange.end)
			.latitude(33)
			.longitude(-81)
			.maxRadius(hash.config.regionalMaxRadius)
			.minMag(hash.config.regionalMinMag);
		const regionalQuakes = regionalQuakesQuery.query();
		return Promise.all([hash, regionalQuakes]).then(hArr => {
			hArr[0].regionalQuakes = hArr[1];
			return hArr[0];
		});
	}).then(hash => {
		let quakeStart = hash.timeRange.start.minus(QUAKE_START_OFFSET);
		let globalQuakesQuery = new sp.fdsnevent.EventQuery();
		globalQuakesQuery
			.startTime(quakeStart)
			.endTime(hash.timeRange.end)
			.minMag(hash.config.globalMinMag);
		const globalQuakes = globalQuakesQuery.query();
		return Promise.all([hash, globalQuakes]).then(hArr => {
			hArr[0].globalQuakes = hArr[1];
			return hArr[0];
		});
	}).catch(e => {
		showError(`Error Loading Earthquake Data: ${e}`);
		throw e;
	}).then(hash => {
		hash.quakes = [];
		if (hash.localQuakes.length > 0) hash.quakes = hash.localQuakes;
		if (hash.regionalQuakes.length > 0) hash.quakes = hash.quakes.concat(hash.regionalQuakes);
		if (hash.globalQuakes.length > 0) hash.quakes = hash.quakes.concat(hash.globalQuakes);
		if (hash.seisData) {
			hash.seisData.addQuake(hash.quakes);
		}
		return Promise.resolve(hash);
	}).then(hash => {
		let traveltimes = [];
		let mystation = hash.chanTR[0].channel.station;
		hash.quakes.forEach(quake => {
			let ttresult = new sp.traveltime.TraveltimeQuery()
				.evdepth(quake.depth > 0 ? quake.depth / 1000 : 0)
				.evlat(quake.latitude).evlon(quake.longitude)
				.stalat(mystation.latitude).stalon(mystation.longitude)
				.phases('p,P,PKP,PKIKP,Pdiff,s,S,Sdiff,PKP,SKS,SKIKS,PP,SS')
				.query()
				.then(function (ttimes) {
					let firstP = null;
					let firstS = null;
					for (let p = 0; p < ttimes.arrivals.length; p++) {
						if ((ttimes.arrivals[p].phase.startsWith('P') || ttimes.arrivals[p].phase.startsWith('p')) && (!firstP || firstP.time > ttimes.arrivals[p])) {
							firstP = ttimes.arrivals[p];
						}
						if ((ttimes.arrivals[p].phase.startsWith('S') || ttimes.arrivals[p].phase.startsWith('s')) && (!firstS || firstS.time > ttimes.arrivals[p])) {
							firstS = ttimes.arrivals[p];
						}
					}
					return {
						quake: quake,
						firstP: firstP,
						firstPTime: quake.time.plus({ seconds: firstP.time }),
						firstS: firstS,
						firstSTime: quake.time.plus({ seconds: firstS.time }),
						ttimes: ttimes
					};
				});
			traveltimes.push(ttresult);
		});
		return Promise.all([hash, Promise.all(traveltimes)]).then(hArr => {
			hArr[0].traveltimes = hArr[1];
			return hArr[0];
		});
	}).then(hash => {
		let mystation = hash.chanTR[0].channel.station;
		let markers = [];
		hash.quakes.forEach(quake => {
			let distaz = sp.distaz.distaz(mystation.latitude, mystation.longitude, quake.latitude, quake.longitude);
			markers.push({
				markertype: 'predicted',
				name: `M${quake.magnitude.mag} ${quake.time.toFormat('HH:mm')}`,
				time: quake.time,
				link: `https://earthquake.usgs.gov/earthquakes/eventpage/${quake.eventId}/executive`,
				description: `${quake.time.toISO()}
${quake.latitude.toFixed(2)}/${quake.longitude.toFixed(2)} ${(quake.depth / 1000).toFixed(2)} km
${quake.description}
${quake.magnitude}
${distaz.delta.toFixed(2)} deg to ${mystation.stationCode}
`

			});
			if (quake.arrivals) {
				quake.arrivals.forEach(arrival => {
					if (arrival && arrival.pick.stationCode == hash.staCode) {
						markers.push({ markertype: 'pick', name: arrival.phase, time: arrival.pick.time });
					}
				});
			}
		});

		hash.traveltimes.forEach(tt => {
			markers.push({ markertype: 'predicted', name: tt.firstP.phase, time: tt.firstPTime });
			markers.push({ markertype: 'predicted', name: tt.firstS.phase, time: tt.firstSTime });
		});
		markers.push({ markertype: 'predicted', name: "now", time: luxon.DateTime.utc() });
		if (hash.seisData) {
			hash.seisData.addMarkers(markers);
			hash.heli.draw();
		} else {

		}
		return hash;
	});
}

function loadDataReal(sddList) {
	console.log(`loading real data...`)
	let mseedQ = new sp.mseedarchive.MSeedArchive(
		MSEED_URL,
		"%n/%s/%Y/%j/%n.%s.%l.%c.%Y.%j.%H");
	let beforeNowChanTR = sddList.map(ct => {
		if (ct.startTime > luxon.DateTime.utc()) {
			// seis in the future
			return null;
		}
		return ct;
	}).filter(sdd => !!sdd);
	let CO_sddList = beforeNowChanTR.filter(sdd => sdd.networkCode === 'CO');
	let other_sddList = beforeNowChanTR.filter(sdd => sdd.networkCode !== 'CO');
	const dsQuery = new sp.fdsndataselect.DataSelectQuery();
	return Promise.all([
		mseedQ.loadSeismograms(beforeNowChanTR),
		dsQuery.postQuerySeismograms(other_sddList),
	]).then(parr => parr[0].concat(parr[1]))
		.then(sddList => { console.log(`real dta : ${sddList.length}`); return sddList; })
}

function filterData(config, origData) {
	let inData = origData;
	let outData = inData;
	if (config.rmean) {
		let rmeanSeis = sp.filter.rMean(outData.seismogram);
		outData = outData.cloneWithNewSeismogram(rmeanSeis);
	}
	if (config.filter.type === "allpass") {
	} else {
		let butterworth;
		let filterStyle;
		if (config.filter.type == "lowpass") {
			filterStyle = sp.filter.LOW_PASS;
		} else if (config.filter.type === "bandpass") {
			filterStyle = sp.filter.BAND_PASS;
		} else if (config.filter.type === "highpass") {
			filterStyle = sp.filter.HIGH_PASS;
		}
		butterworth = sp.filter.createButterworth(
			2, // poles
			filterStyle,
			Number.parseFloat(config.filter.lowcut), // low corner
			Number.parseFloat(config.filter.highcut), // high corner not used
			1 / outData.seismogram.sampleRate // delta (period)
		);
		const fitLine = sp.filter.lineFit(outData.seismogram);
		let filteredSeis = sp.filter.removeTrend(outData.seismogram, fitLine);
		//filteredSeis = sp.taper.taper(filteredSeis);
		filteredSeis = sp.filter.applyFilter(butterworth, filteredSeis);
		outData = outData.cloneWithNewSeismogram(filteredSeis);
	}
	return outData;
}

function redrawHeli(hash) {
	if (!hash.heli) {
		hash.heli = document.querySelector("sp-helicorder");
	}
	if (!hash.heliDataIsMinMax) {
		hash.seisData = filterData(hash.config, hash.origData);
	}

	if (hash.seisData) {
		hash.station = hash.seisData.stationCode;
		let heliConfig = new HelicorderConfig(hash.timeRange);
		heliConfig.markerFlagpoleBase = 'center';
		heliConfig.detrendLines = true;
		heliConfig.lineSeisConfig.markerFlagpoleBase = 'center';
		updateHeliAmpConfig(hash, heliConfig);
		clearMessages();
		hash.heli.seisData = hash.seisData;
		hash.heli.heliConfig = heliConfig;
		hash.heli.addEventListener("helimousemove", hEvent => {
			const mouseTimeSpan = document.querySelector("#mousetime")
			if (mouseTimeSpan) {
				mouseTimeSpan.textContent = `${hEvent.detail.time.toISO()}`;
			}
		});
		hash.heli.addEventListener("heliclick", hEvent => {
			hash.centerTime = hEvent.detail.time;
			const hwValue = document.querySelector("#clickinterval").value;
			let dur;
			if (!Number.isNaN(Number.parseFloat(hwValue))) {
				// assume seconds
				dur = luxon.Duration.fromMillis(1000 * Number.parseFloat(hwValue));
			} else {
				dur = luxon.Duration.fromISO(hwValue);
			}
			if (dur.toMillis() > 0) {
				hash.halfWidth = luxon.Duration.fromMillis(dur.toMillis() / 2);
			}
			if (hash.station) {
				drawSeismograph(hash);
			} else {
				console.log(`no station in hash: ${hash.station}`)
			}
		});
	} else {
		showMessage("No Data.")
	}
	return hash;
}

function updateHeliAmpConfig(hash, heliConfig) {
	if (hash.config.amp === 'max') {
		heliConfig.fixedAmplitudeScale = [0, 0];
		heliConfig.maxVariation = 0;
	} else if (typeof hash.config.amp === 'string' && hash.config.amp.endsWith('%')) {
		heliConfig.fixedAmplitudeScale = [0, 0];
		const percent = Number(hash.config.amp.substring(0, hash.config.amp.length - 1)) / 100;
		heliConfig.maxVariation = percent * (hash.seisData.max - hash.seisData.mean);
	} else if (Number.isFinite(hash.config.amp)) {
		heliConfig.fixedAmplitudeScale = [0, 0];
		heliConfig.maxVariation = hash.config.amp;
	} else {
		heliConfig.fixedAmplitudeScale = [0, 0];
		heliConfig.maxVariation = 0;
	}
}

function drawSeismograph(hash) {
	console.log(`draw seis for ${hash.station}`);
	document.querySelector("#heli").setAttribute("style", "display: none;");
	const seismographDiv = document.querySelector("#seismograph");
	seismographDiv.setAttribute("style", "display: block;");

	// let friendChannels = Array.from(sp.stationxml.allChannels(hash.netArray));
	let friendChannels = Array.from(sp.stationxml.allChannels(hash.netArray));
	friendChannels = friendChannels.filter(ch => ch.station.stationCode === hash.station);

	// let friendChannels = [];
	// hash.stationList.forEach(sta => {
	//   let staChans = Array.from(sp.stationxml.findChannels(hash.netArray,
	//                                                 hash.chanTR[0].networkCode,
	//                                                 sta,
	//                                                 hash.chanTR[0].locationCode,
	//                                                 hash.chanTR[0].channelCode.slice(0,2)+".",
	//                                               ));
	//   friendChannels = friendChannels.concat(staChans);
	// });

	let halfWidth = hash.halfWidth;
	if (!halfWidth) { halfWidth = sp.luxon.Duration.fromISO("PT5M"); }
	const seismographDisp = seismographDiv.querySelector("sp-organized-display");
	const interval = sp.luxon.Interval.fromDateTimes(hash.centerTime.minus(halfWidth), hash.centerTime.plus(halfWidth));
	const overlapQuakes = hash.traveltimes.filter(tt => {
		const lastArrival = tt.ttimes.arrivals.reduce((acc, cur) => acc.time > cur.time ? acc : cur);
		const quakeInterval = sp.luxon.Interval.after(tt.quake.time, { seconds: lastArrival.time });
		return interval.overlaps(quakeInterval);
	}).map(tt => tt.quake);
	let sddList = friendChannels.map(channel => {
		let sdd = sp.seismogram.SeismogramDisplayData.fromChannelAndTimeWindow(channel, interval);
		sdd.addMarkers(hash.seisData.markerList);
		sdd.quakeList = overlapQuakes;
		return sdd;
	});
	let seismographConfig = new sp.seismographconfig.SeismographConfig();
	seismographConfig.linkedAmplitudeScale = new sp.scale.IndividualAmplitudeScale();

	seismographDisp.seismographConfig = seismographConfig;
	seismographDisp.seisData = sddList;
	seismographDisp.draw();

	seismographDisp.addEventListener("seismousemove", sEvt => {
		const mouseTimeSpan = document.querySelector("#mousetime")
		if (mouseTimeSpan) {
			if (sEvt.detail.time) {
				mouseTimeSpan.textContent = sEvt.detail.time.toISO();
			} else {
				mouseTimeSpan.textContent = sEvt.detail.relative_time.toISO();
			}
		}
	});

	return loadDataReal(seismographDisp.seisData).then((sddList) => {
		console.log(`data loaded, before filter: ${sddList.length}`)
		let filtSddList = sddList.map(sdd => filterData(hash.config, sdd));
		// looks dumb, but recalcs time and amp
		seismographDisp.seisData = filtSddList;
		return sddList;
	});
}

function showError(msg) {
	showMessage(msg);
	document.querySelector("#messagesParent").setAttribute("open", true);
}
function showMessage(msg) {
	let msgText = document.querySelector("#messages").appendChild(document.createElement("h3"));
	msgText.setAttribute("class", "error");
	msgText.textContent = msg;
}
function clearMessages() {
	document.querySelector("#messages").innerHTML = "";
	document.querySelector("#messagesParent").setAttribute("open", false);
}

// state preserved for browser history
// also see near bottom where we check if page history has state obj and use that
let state : Config = {
	orientationCodeList: ['Z', 'N', 'E', '1', '2'],
	netCode: 'CO',
	station: null,
	locCode: '00',
	bandCode: "H",
	instCode: "H",
	orientationCode: 'Z',
	altOrientationCode: "",
	endTime: "now",
	duration: 'P1D',
	doMinMax: true,
	amp: "max",
	rmean: false,
	filter: {
		type: "allpass",
		lowCut: '1.0',
		highCut: '10.0',
	},
};
state.station = 'BIRD';

let savedData = {
	config: state
};

function loadAndPlot(config) {
	updatePageForConfig(config);
	doPlot(config).then(hash => {
		if (hash) {
			savedData = hash;
		}
	});
};

function redraw() {
	if (window.getComputedStyle(document.querySelector('#heli')).display === "none") {
		drawSeismograph(savedData);
	} else {
		if (savedData && savedData.seisData) {
			// already have data
			redrawHeli(savedData);
		} else {
			loadAndPlot(state);
		}
	}
}


// Check browser state, in case of back or forward buttons
let currentState = window.history.state;

if (currentState) {
	updatePageForConfig(currentState);
	if (currentState.station) {
		console.log(`load existing state: ${JSON.stringify(currentState, null, 2)}`);
		state = currentState;
		loadAndPlot(state);
	}
} else {
	loadAndPlot(state);
}
// also register for events that change state
window.onpopstate = function (event) {
	if (event.state && event.state.station) {
		console.log(`onpopstate event: ${JSON.stringify(event.state, null, 2)}`);
		state = event.state;
		updatePageForConfig(state);
		loadAndPlot(state);
	}
};

let chooserEnd;
if (state.endTime) {
	if (state.endTime === "now") {
		chooserEnd = getNowTime();
	} else {
		chooserEnd = sp.util.isoToDateTime(state.endTime);
	}
} else {
	state.endTime = "now";
	chooserEnd = luxon.DateTime.utc();
}
const chooserStart = chooserEnd.minus(luxon.Duration.fromISO(state.duration));

let throttleRedisplay = null;
let throttleRedisplayDelay = 500;

let dateChooser = document.querySelector("sp-datetime");
dateChooser.time = chooserStart;
dateChooser.updateCallback = time => {
	if (throttleRedisplay) {
		window.clearTimeout(throttleRedisplay);
	}
	throttleRedisplay = window.setTimeout(() => {
		let updatedTime = time.plus(luxon.Duration.fromISO(state.duration));
		state.endTime = updatedTime.toISO();
		loadAndPlot(state);
	}, throttleRedisplayDelay);
};


setupEventHandlers(state, loadAndPlot, redraw);


document.querySelector("button#refreshEarthquakes").addEventListener("click", () => {
	loadAllEarthquakeQueryParams(state);
	loadAndPlot(state);
});
