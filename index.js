const moment = require('moment-timezone');
const { convertPlayDataToTweets, getTodaysGamePk } = require('./mlb');

let latestArticleTimeStamp;

const getData = async (gamePk) => {
  await getRSSJson('https://www.dodgersnation.com/feed', postArticles);
  if (gamePk) {
    const liveFeedUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
    return req(liveFeedUrl).then(convertPlayDataToTweets);
  }
}

const postArticles = async ({rss: {channel: [c]}}) => {
  const {item: [{link: [link], pubDate: [pubDate], title: [title]}]} = c;
  if (!latestArticleTimeStamp) latestArticleTimeStamp = pubDate;
  const newArticle = moment(latestArticleTimeStamp).isBefore(pubDate);
  if (!newArticle) return;

  latestArticleTimeStamp = pubDate;
  await postTweet(title + '\n' + link);
}

const twitterFunction = async () => getTodaysGamePk().then(getData);

exports.handler = async () => await twitterFunction();
