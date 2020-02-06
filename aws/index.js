const moment = require('moment-timezone');
const request = require('request-promise-native');
const {Parser} = require('xml2js');

let gamePk=null, latestArticleTimeStamp;
const postedTweets = [];
const testTeamId = process.env.TEAM_ID || 671; // Leones del Escogido
const sport = process.env.SPORT || 17; // winter leagues. MLB = 1

const oauth = {
  consumer_key: process.env.TWITTER_CONSUMER_KEY || '',
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET || '',
  token: process.env.TWITTER_ACCESS_TOKEN_KEY || '',
  token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET || ''
}

const parser = new Parser();

const req = url => await request(url, {json: true});

exports.handler = async () => await twitterFunction();

const twitterFunction = async () => getTodaysGame().then(getData);

const getTodaysGame = async () => {
  const todayLA = moment().tz('America/Los_Angeles').format('MM/DD/YYYY');
  const todaysGameUrl = `http://statsapi.mlb.com/api/v1/schedule/games/?sportId=${sport}&date=${todayLA}&teamId=${testTeamId}`;
  console.log('todaysGameUrl', todaysGameUrl)

  return req(todaysGameUrl).then(({dates}) => {
    gamePk = dates.length ? dates[0].games[0].gamePk : null;
  });
}

const getData = async () => {
  await getRSSJson('https://lorem-rss.herokuapp.com/feed?unit=minute&interval=60', postArticles);
  console.log('gamePk', gamePk);
  if (gamePk) {
    const liveFeedUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
    return req(liveFeedUrl).then(convertPlayDataToTweets);
  }
}

const convertPlayDataToTweets = async data => {
  const play = data.liveData.plays.allPlays.reverse().find(a => !!a.result.description);
  const lineScoreUrl = `https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`;
  const lineScore = await req(lineScoreUrl);
  
  if (!play || (play.about.hasOut && !lineScore.outs)) return;

  const getTeamName = homeOrAway => data.gameData.teams[homeOrAway].teamName.toUpperCase();
  const awayTeamName = getTeamName('away');
  const homeTeamName = getTeamName('home');
  const description = getDescription(play, lineScore, awayTeamName, homeTeamName);
  
  if (description) {
    const inningStatsText = getInningStatsText();
    const tweetStatus = description + inningStatsText;
    await postTweet(tweetStatus);
  }

  if (lineScore.outs === 3) {
    const tweetStatus = `Score Update:\n\n${awayTeamName}: ${lineScore.teams.away.runs}\n${homeTeamName}: ${lineScore.teams.home.runs}\n${inningStatsText}`;
    await postTweet(tweetStatus);
  }
}

const getRSSJson = async (url, callback) => request(url).then(feed => parser.parseStringPromise(feed).then(callback).catch(e => console.error('error parsing XML', e)));

const postArticles = async ({rss: {channel: [c]}}) => {
  const {pubDate: [pubDate], item: [item]} = c;
  const newArticle = !latestArticleTimeStamp || moment(latestArticleTimeStamp).isBefore(pubDate);
  if (!newArticle) return;

  latestArticleTimeStamp = pubDate;
  await postTweet('Lorem Ipsum RSS Test - ' + moment(pubDate).format('MM-DD-YYYY') + '\n' + item.description[0]);
}

const getDescription = (play, lineScore, away, home) => {
  const { result: {description}, about: {halfInning, isScoringPlay} } = play;
  if (!isScoringPlay) return description;

  const scoringTeam = halfInning === 'top' ? away : home;
  return `${scoringTeam} SCORE!\n\n${away}: ${lineScore.teams.away.runs}\n${home}: ${lineScore.teams.home.runs}`;
}

const postTweet = async status => {
  if (postedTweets.includes(status)) return;

  console.log('=====================status=====================', status);
  console.log('=====================ENCODED status=====================', encodeURIComponent(status).replace(/!/g, '%21'));
  const url = 'https://api.twitter.com/1.1/statuses/update.json?status=' + encodeURIComponent(status).replace(/!/g, '%21');

  return request({
    url,
    method: 'POST',
    json: true,
    oauth
  }).then(() => postedTweets.push(status)).catch(e => console.log('error with tweet', e.message));
}

const getInningStatsText = lineScore => {
  const { currentInning, currentInningOrdinal, inningState, outs=0 } = lineScore;
  if (!currentInning) return '';

  const outsString = outs === 1 ? 'out' : 'outs';
  return `\n${inningState} of the ${currentInningOrdinal}. ${outs} ${outsString}`;
}

