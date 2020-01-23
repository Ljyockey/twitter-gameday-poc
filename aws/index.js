const moment = require("moment-timezone");
const request = require("request-promise-native");

let gamePk = null;
let timestamp;
const postedTweets = [];

exports.handler = async event => await twitterFunction();

async function twitterFunction() {
  // TODO: see if I want to use diffs at all
  if (true) {
    return getTodaysGame().then(_ => {
      if (gamePk) {
        console.log("gamePk", gamePk);
        return getData();
      }
    });
  } else return getDiff();
}

const testTeamId = process.env.TEAM_ID || 671; // Leones del Escogido
const sport = process.env.SPORT || 17; // winter leagues. MLB = 1

async function getTodaysGame() {
  const todaysGameUrl = `http://statsapi.mlb.com/api/v1/schedule/games/?sportId=${sport}&date=${moment().tz('America/Los_Angeles').format(
    "MM/DD/YYYY"
  )}&teamId=${testTeamId}`;
  console.log('todaysGameUrl', todaysGameUrl)
  return request(todaysGameUrl).then(response => {
    const data = JSON.parse(response);
    gamePk = data.dates.length ? data.dates[0].games[0].gamePk : null;
  });
}

async function getData() {
  console.log('=========in getData==========')
  if (gamePk) {
    const liveFeedUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
    return request(liveFeedUrl).then(convertInitialDataToTweets);
  }
}

async function convertInitialDataToTweets(response) {
  const data = JSON.parse(response);
  timestamp = data.metaData.timeStamp;
  console.log("timestamp", timestamp);
  const ap = data.liveData.plays.allPlays.filter(a => !!a.result.description)
  const lineScoreUrl = `https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`;
  const ls = await request(lineScoreUrl);
  const lineScore = JSON.parse(ls)
  const inningStatsText = getInningStatsText(lineScore);
  console.log("inningStatsText", inningStatsText);
  const play = ap[ap.length-1];
  if (play.about.hasOut && !lineScore.outs) return;
  const awayTeamName = data.gameData.teams.away.teamName.toUpperCase();
  const homeTeamName = data.gameData.teams.home.teamName.toUpperCase();
  const description = getDescription(play, lineScore, awayTeamName, homeTeamName)
  const tweetStatus = description + inningStatsText;
  if (description) await postTweet(tweetStatus);
  if (lineScore.outs === 3) await postTweet(`Score Update:\n\n${awayTeamName}: ${lineScore.teams.away.runs}\n${homeTeamName}: ${lineScore.teams.home.runs}`)
}

function getDescription(play, lineScore, away, home) {
  const { result: {description}, about: {halfInning, isScoringPlay} } = play;
  if (!isScoringPlay) return description;
  const scoringTeam = halfInning === 'top' ? away : home
  return `${scoringTeam} SCORE!\n\n${away}: ${lineScore.teams.away.runs}\n${home}: ${lineScore.teams.home.runs}`
}

async function postTweet(status) {
  if (!postedTweets.includes(status)) {
    console.log('=====================status=====================', status)
    const twitterUrl = `https://api.twitter.com/1.1/statuses/update.json?status=${encodeURI(status)}`;
    return await request({
      url: twitterUrl,
      method: 'POST',
      json: true,
      oauth: {
        consumer_key: process.env.TWITTER_CONSUMER_KEY || '',
        consumer_secret: process.env.TWITTER_CONSUMER_SECRET || '',
        token: process.env.TWITTER_ACCESS_TOKEN_KEY || '',
        token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET || ''
      }
    }).then(res => {
      console.log("\n res:" + res + "\n");

      console.log('static: ' + status + "\n");
      postedTweets.push(status);
    }).catch(e => {
      console.log('error with tweet', e.message)
    })

  }
}

async function getDiff() {
  console.log('===============in getDiff============')
  const diffUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live/diffPatch?language=en&startTimecode=${timestamp}`;
  console.log("diffUrl", diffUrl);
  return request(diffUrl).then(async response => {
    const data = JSON.parse(response);
    console.log(response + "\n");
    console.log("data", data);
    // sometimes the data comes back as an array, other times, it duplicates the initial data
    // Current theory: it happens when the inning changes
    if (!data.map) return convertInitialDataToTweets(response);
    const diffs = data.map(diffs => diffs.diff);
    console.log("diffs", diffs);
    if (diffs.length) {
      console.log("first timestamp", data[0].diff[0].value);
      timestamp = data[data.length - 1].diff[0].value;
      console.log("last timestamp ", timestamp);
      // diffs sometimes doesn't duplicate. Will have to loop through diffs
      const result = diffs[0].filter(doesEventHaveDescription);
      const lineScoreUrl = `https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`;
      const lineScore = await request(lineScoreUrl);
      const inningStatsText = getInningStatsText(lineScore);
      console.log("inningStatsText", inningStatsText);
      console.log("result", result);
      result.forEach(event => {
        const eventText = event.value + inningStatsText;
        postTweet(eventText);
      });
    }
  });
}

function getInningStatsText(lineScore) {
  const { currentInning, currentInningOrdinal, inningState, outs } = lineScore;
  if (!currentInning) return "";
  const outsString = outs === 1 ? "out" : "outs";
  return `\n${inningState} of the ${currentInningOrdinal}. ${outs ||
    0} ${outsString}`;
}

function doesEventHaveDescription(event) {
  console.log("event: ", event);
  return event.value && event.path.endsWith("/result/description");
}

// twitterFunction();
