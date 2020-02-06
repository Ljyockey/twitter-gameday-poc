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

const req = async url => await request(url, {json: true});

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

  const description = getDescription(play, lineScore, data.gameData.teams);
  const inningStatsText = getInningStatsText(lineScore);
  
  if (description) {
    const tweetStatus = description + inningStatsText;
    await postTweet(tweetStatus);
  }

  if (lineScore.outs === 3) {
    const {away, home} = data.gameData.teams;
    const tweetStatus = `Score Update:\n\n${away.teamName}: ${lineScore.teams.away.runs}\n${home.teamName}: ${lineScore.teams.home.runs}\n${inningStatsText}`;
    await postTweet(tweetStatus);
  }
}

const getRSSJson = async (url, callback) => request(url).then(feed => parser.parseStringPromise(feed).then(callback).catch(e => console.error('error parsing XML', e)));

const postArticles = async ({rss: {channel: [c]}}) => {
  const {item: [{description: [description], pubDate: [pubDate], title: [title]}]} = c;
  const newArticle = !latestArticleTimeStamp || moment(latestArticleTimeStamp).isBefore(pubDate);
  if (!newArticle) return;

  latestArticleTimeStamp = pubDate;
  await postTweet('Lorem Ipsum RSS Test - \n' + title + '\n' + description);
}

const getDescription = (play, lineScore, teams) => {
  const { result: {description}, about: {halfInning, isScoringPlay} } = play;
  if (!isScoringPlay) return description;

  const scoringTeam = halfInning === 'top' ? teams.away : teams.home;
  const myTeamScored = scoringTeam.id.toString() === testTeamId.toString();
  const scoreText = myTeamScored 
    ? `${scoringTeam.teamName.toUpperCase()} SCORE!`
    : `${scoringTeam.teamName} score.`;

  return `${scoreText}\n\n${away}: ${lineScore.teams.away.runs}\n${home}: ${lineScore.teams.home.runs}\n`;
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

