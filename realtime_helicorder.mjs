import * as seisplotjs from "./seisplotjs_3.0.0-alpha.1_standalone.mjs";
/**
 * First attempt at recreating the helicorders on pnsn.org as a "realtime" display with scaling
 */

/**
 * Configs
 */
const netCode = "UW";
const staCode = "JCW";
const locCode = "";
const chanCode = "EHZ";
// IRIS data ringserver, replace with PNSN eventually
const dataLinkUrl = seisplotjs.datalink.IRIS_RINGSERVER_URL;
const plotTimeSpan = 60; //size of plot in minutes
// plot start would be changeable when looking at past data
const plotStart = seisplotjs.luxon.DateTime.utc()
  .endOf("hour")
  .plus({ milliseconds: 1 }); // make sure it includes whole hour
const isLive = false; // old data not live
// pattern used to get data from IRIS
const matchPattern = `${netCode}_${staCode}_${locCode}_${chanCode}/MSEED`;

/**
 * Time stuff
 */
if (plotStart.hour % 2 === 1) {
  plotStart.plus({ hours: 1 });
} // I don't remember why I did this
let duration = seisplotjs.luxon.Duration.fromDurationLike({
  minute: plotTimeSpan,
});

// Time window for plot, from plotStart to plotStart + duration
const timeWindow = seisplotjs.luxon.Interval.before(plotStart, duration);

// Luxon Config for display
const luxOpts = {
  suppressMilliseconds: true,
  suppressSeconds: true,
};

/** Add text to page */
document.querySelector("span#starttime").textContent =
  timeWindow.start.toISO(luxOpts);
document.querySelector("span#endtime").textContent =
  timeWindow.end.toISO(luxOpts);
seisplotjs.d3
  .select("span#channel")
  .text(`${netCode}.${staCode}.${locCode}.${chanCode}`);

/**
 * Helicorder configuration
 */
let heliConfig = new seisplotjs.helicorder.HelicorderConfig(timeWindow);
heliConfig.wheelZoom = false;
heliConfig.isYAxisNice = false;
// heliConfig.linkedTimeScale.offset = seisplotjs.luxon.Duration.fromMillis(-1*duration.toMillis());
// heliConfig.linkedTimeScale.duration = duration;
// heliConfig.linkedAmplitudeScale = new seisplotjs.scale.IndividualAmplitudeScale();
// heliConfig.doGain = true;
// heliConfig.centeredAmp = false;
heliConfig.fixedAmplitudeScale = [-2500, 0];
heliConfig.title = `Helicorder for ${matchPattern}`;

/**
 * Helicorder Set Up
 */
let numPackets = 0;
let paused = false;
let stopped = true;
let realtimeDiv = document.querySelector("div#realtime");
let helicorder;
let streamStart;

const currentTimeDiv = document.querySelector("span#currentTime");

// Update time for display
setInterval(() => {
  currentTimeDiv.textContent = seisplotjs.luxon.DateTime.utc();
}, 1000);

/**
 * Backfill data to fill in plot from start time to current
 */
const query = new seisplotjs.fdsndataselect.DataSelectQuery();
query
  .networkCode(netCode)
  .stationCode(staCode)
  .locationCode(locCode)
  .channelCode(chanCode)
  .timeWindow(timeWindow);
query
  .querySeismograms()
  .then((seisArray) => {
    let seisData = seisplotjs.seismogram.SeismogramDisplayData.fromSeismogram(
      seisArray[0]
    );
    const lastPacket = seisArray[0];
    streamStart = lastPacket.endTime;
    // create helicorder
    helicorder = new seisplotjs.helicorder.Helicorder(seisData, heliConfig);
    // add to page
    realtimeDiv.append(helicorder);
    // draw seismogram
    helicorder.draw();
    // start live data connection
    toggleConnect();
  })
  .catch(function (error) {
    console.assert(false, error);
  });

const errorFn = function (error) {
  console.assert(false, error);
  // if (datalink) {datalink.close();}
  seisplotjs.d3.select("p#error").text("Error: " + error);
};

/* processes packets & adds to helicorder */
const packetHandler = function (packet) {
  if (packet.isMiniseed()) {
    numPackets++;
    seisplotjs.d3.select("span#numPackets").text(numPackets);
    let seisSegment = seisplotjs.miniseed.createSeismogramSegment(
      packet.asMiniseed()
    );

    if (helicorder) {
      helicorder.appendSegment(seisSegment);
    }

    // Marker that indicates the current time, should move along instead of redraw
    let nowMarker = {
      markertype: "predicted",
      name: "now",
      time: seisplotjs.luxon.DateTime.utc(),
    };
    helicorder.seisData[0].addMarkers(nowMarker);
  } else {
    console.log(`not a mseed packet: ${packet.streamId}`);
  }
};

/** Connection to IRIS data */
const datalink = new seisplotjs.datalink.DataLinkConnection(
  dataLinkUrl,
  packetHandler,
  errorFn
);

/* Set up buttons */
seisplotjs.d3.select("button#pause").on("click", function (d) {
  togglePause();
});

let togglePause = function () {
  paused = !paused;
  if (paused) {
    seisplotjs.d3.select("button#pause").text("Play");
  } else {
    seisplotjs.d3.select("button#pause").text("Pause");
  }
};

seisplotjs.d3.select("button#disconnect").on("click", function (d) {
  toggleConnect();
});

/* wire up buttons to toggle connection*/
let toggleConnect = function () {
  stopped = !stopped;
  if (stopped) {
    if (datalink) {
      datalink.endStream();
      datalink.close();
    }
    seisplotjs.d3.select("button#disconnect").text("Reconnect");
  } else {
    if (datalink) {
      datalink
        .connect()
        .then((serverId) => {
          console.log(`id response: ${serverId}`);
          return datalink.match(matchPattern);
        })
        .then((response) => {
          console.log(`match response: ${response}`);
          return datalink.positionAfter(streamStart);
        })
        .catch((error) => {
          if (
            error.cause.value === 0 &&
            error.cause.message === "Packet not found"
          ) {
          } else {
          }
        })
        .then((response) => {
          return datalink.stream();
        })
        .catch(function (error) {
          seisplotjs.d3
            .select("div#debug")
            .append("p")
            .html("Error: " + error);
          console.assert(false, error);
        });
    }
    seisplotjs.d3.select("button#disconnect").text("Disconnect");
  }
};
