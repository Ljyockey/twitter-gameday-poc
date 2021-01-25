const { postTweet, req } = require('./helpers');
const { getCustomPromo } = require('./promos');

let hasPostedFinal=false;

const sport = process.env.SPORT || 1; // MLB
const testTeamId = process.env.TEAM_ID || 119; // Dodgers

const convertPlayDataToTweets = async data => {
  const {linescore, plays} = data.liveData;
  const play = plays.allPlays.reverse().find(a => !!a.result.description);
  
  if (!play || (play.about.hasOut && !linescore.outs)) return;

  const {away, home} = data.gameData.teams;

  const description = getDescription(play, linescore, data.gameData.teams);
  const inningStatsText = getInningStatsText(linescore);
  const hashtags = await getHashtags(away.id, home.id);
  const isLive = data.gameData.status.abstractGameCode === 'L';
  const isComplete = data.gameData.status.abstractGameCode === 'F';
  const isBetweenInnings = linescore.outs === 3 && isLive;

  if (!isComplete) hasPostedFinal = false;
  
  if (description && isLive) {
    const tweetStatus = description + '\n\n' + inningStatsText + '\n\n' + hashtags;
    await postTweet(tweetStatus);
  }

  const awayTeamRuns = linescore.teams.away.runs;
  const homeTeamRuns = linescore.teams.home.runs;

  if (isBetweenInnings) {
    const inning = inningStatsText.split(' | ')[0];
    const tweetStatus = `${hashtags} ${inning} Score Update:\n\n${away.teamName}: ${awayTeamRuns}\n${home.teamName}: ${homeTeamRuns}\n`;
    const dateTimeData = {startTime: data.gameData.datetime.dateTime, tz: data.gameData.venue.timeZone.id};
    const promo = await getCustomPromo(linescore, dateTimeData);

    await postTweet(tweetStatus + promo);
  }

  if (isComplete && !hasPostedFinal && postedTweets.length > 1) {
    const tweetStatus = `${hashtags} Final Score:\n\n${away.teamName}: ${awayTeamRuns}\n${home.teamName}: ${homeTeamRuns}`;
    await postTweet(tweetStatus);
    hasPostedFinal = true;
    postedTweets.length = 0;
    customPromos.length = 0;
  }
}

const getDescription = (play, linescore, teams) => {
  const { result: {description}, about: {halfInning, isScoringPlay} } = play;
  if (!isScoringPlay) return description;

  const awayTeamRuns = linescore.teams.away.runs;
  const homeTeamRuns = linescore.teams.home.runs;
  const scoringTeam = halfInning === 'top' ? teams.away : teams.home;
  const myTeamScored = scoringTeam.id.toString() === testTeamId.toString();
  const scoreText = myTeamScored 
    ? `${scoringTeam.teamName.toUpperCase()} SCORE!`
    : `${scoringTeam.teamName} score.`;

  return `${scoreText}\n${description}\n\n${teams.away.teamName}: ${awayTeamRuns}\n${teams.home.teamName}: ${homeTeamRuns}`;
}

const getGamePk = ({games=[]}) => {
  const liveAndComplete = games
    .filter(g => g.status.abstractGameCode === 'L' || g.status.abstractGameCode === 'F')
    .sort((_a, b) => b.status.abstractGameCode !== 'L' ? -1 : 0);
  return liveAndComplete.length ? liveAndComplete[0].gamePk : null;
}

const getHashtags = async (awayId, homeId) => {
  const teamUrl = 'http://statsapi.mlb.com/api/v1/teams/';
  const {teams: [awayData]} = await req(teamUrl + awayId);
  const {teams: [homeData]} = await req(teamUrl + homeId);

  return `#${awayData.abbreviation}vs${homeData.abbreviation}`;
}

const getInningStatsText = linescore => {
  const { currentInning, currentInningOrdinal, inningState, outs=0 } = linescore;
  if (!currentInning) return '';

  const outsString = outs === 1 ? 'out' : 'outs';
  return `${inningState} of the ${currentInningOrdinal} | ${outs} ${outsString}`;
}

const getTodaysGamePk = async () => {
  const todayLA = moment().tz('America/Los_Angeles').format('MM/DD/YYYY');
  const todaysGameUrl = `http://statsapi.mlb.com/api/v1/schedule/games/?sportId=${sport}&date=${todayLA}&teamId=${testTeamId}`;

  return req(todaysGameUrl).then(({dates}) => {
    return getGamePk(dates[0] || {});
  });
}

module.exports = {
    convertPlayDataToTweets,
    getTodaysGamePk
}