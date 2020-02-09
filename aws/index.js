const moment = require('moment-timezone');
const request = require('request-promise-native');
const {Parser} = require('xml2js');

let gamePk=null, hasPostedFinal=false, latestArticleTimeStamp;
const postedTweets = [];
const testTeamId = process.env.TEAM_ID || 5308; // Away Team - Test
const sport = process.env.SPORT || 22; // college baseball. MLB = 1

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
    gamePk = getGamePk(dates[0] || {});
  });
}

const getData = async () => {
  await getRSSJson('https://www.dodgersnation.com/feed', postArticles);
  if (gamePk) {
    const liveFeedUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
    return req(liveFeedUrl).then(convertPlayDataToTweets);
  }
}

const getGamePk = ({games=[]}) => {
  const liveAndComplete = games
    .filter(g => g.status.statusCode === 'I' || g.status.statusCode === 'F')
    .sort((a, b) => a.status.statusCode !== 'S' && b.status.statusCode !== 'I' ? -1 : 0);
  return liveAndComplete.length ? liveAndComplete[0].gamePk : null;
}

const convertPlayDataToTweets = async data => {
  const {lineScore, plays} = data.liveData;
  const play = plays.allPlays.reverse().find(a => !!a.result.description);
  
  if (!play || (play.about.hasOut && !lineScore.outs)) return;

  const description = getDescription(play, lineScore, data.gameData.teams);
  const inningStatsText = getInningStatsText(lineScore);
  const isLive = data.gameData.status.statusCode === 'I';
  const isComplete = data.gameData.status.statusCode === 'F';

  if (!isComplete) hasPostedFinal = false;
  
  if (description && isLive) {
    const tweetStatus = description + inningStatsText;
    await postTweet(tweetStatus);
  }

  const awayTeamRuns = lineScore.teams.away.runs;
  const homeTeamRuns = lineScore.teams.home.runs;

  if (lineScore.outs === 3 && isLive) {
    const {away, home} = data.gameData.teams;
    const inning = inningStatsText.split('.')[0];
    const tweetStatus = `Score Update:\n\n${away.teamName}: ${awayTeamRuns}\n${home.teamName}: ${homeTeamRuns}\n${inning}`;
    await postTweet(tweetStatus);
  }

  if (isComplete && !hasPostedFinal && postedTweets.length > 1) {
    const {away, home} = data.gameData.teams;
    const tweetStatus = `FINAL SCORE:\n\n${away.teamName}: ${awayTeamRuns}\n${home.teamName}: ${homeTeamRuns}`;
    await postTweet(tweetStatus);
    hasPostedFinal = true;
    postedTweets.length = 0;
  }
}

const getRSSJson = async (url, callback) => 
  request(url).then(feed => parser.parseStringPromise(feed).then(callback).catch(e => console.error('error parsing XML', e)));

const postArticles = async ({rss: {channel: [c]}}) => {
  const {item: [{link: [link], pubDate: [pubDate], title: [title]}]} = c;
  const newArticle = !latestArticleTimeStamp || moment(latestArticleTimeStamp).isBefore(pubDate);
  if (!newArticle) return;

  latestArticleTimeStamp = pubDate;
  await postTweet(title + '\n' + link);
}

const getDescription = (play, lineScore, teams) => {
  const { result: {description}, about: {halfInning, isScoringPlay} } = play;
  if (!isScoringPlay) return description;

  const awayTeamRuns = lineScore.teams.away.runs;
  const homeTeamRuns = lineScore.teams.home.runs;
  const scoringTeam = halfInning === 'top' ? teams.away : teams.home;
  const myTeamScored = scoringTeam.id.toString() === testTeamId.toString();
  const scoreText = myTeamScored 
    ? `${scoringTeam.teamName.toUpperCase()} SCORE!`
    : `${scoringTeam.teamName} score.`;

  return `${scoreText}\n\n${teams.away.teamName}: ${awayTeamRuns}\n${teams.home.teamName}: ${homeTeamRuns}\n`;
}

// encodes all characters encoded with encodeURIComponent, plus: ! ~ * ' ( )
const fullyEncodeURI = value => encodeURIComponent(value)
  .replace(/!/g, '%21')
  .replace(/'/g, '%27')
  .replace(/\(/g, '%28')
  .replace(/\)/g, '%29')
  .replace(/\*/g, '%2a')
  .replace(/~/g, '%7e');

const postTweet = async status => {
  if (postedTweets.includes(status)) return;

  console.log('=====================ENCODED status=====================', fullyEncodeURI(status));
  const url = 'https://api.twitter.com/1.1/statuses/update.json?status=' + fullyEncodeURI(status);

  return request({
    url,
    method: 'POST',
    json: true,
    oauth
  }).then(() => postedTweets.push(status)).catch(e => console.error('error with tweet', e.message));
}

const getInningStatsText = lineScore => {
  const { currentInning, currentInningOrdinal, inningState, outs=0 } = lineScore;
  if (!currentInning) return '';

  const outsString = outs === 1 ? 'out' : 'outs';
  return `\n${inningState} of the ${currentInningOrdinal}. ${outs} ${outsString}`;
}

