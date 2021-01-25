const {Parser} = require('xml2js');
const request = require('request-promise-native');

const postedTweets = [];

const parser = new Parser();

const oauth = {
    consumer_key: process.env.TWITTER_CONSUMER_KEY || '',
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET || '',
    token: process.env.TWITTER_ACCESS_TOKEN_KEY || '',
    token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET || ''
}

// encodes all characters encoded with encodeURIComponent, plus: ! ~ * ' ( )
const fullyEncodeURI = value => encodeURIComponent(value)
  .replace(/!/g, '%21')
  .replace(/'/g, '%27')
  .replace(/\(/g, '%28')
  .replace(/\)/g, '%29')
  .replace(/\*/g, '%2a')
  .replace(/~/g, '%7e');

const getRSSJson = async (url, callback) => 
  request(url).then(feed => parser.parseStringPromise(feed).then(callback).catch(e => console.error('error parsing XML', e)));

const postTweet = async status => {
    if (postedTweets.includes(status)) return;
  
    const url = 'https://api.twitter.com/1.1/statuses/update.json?status=' + fullyEncodeURI(status);
  
    return request({
      url,
      method: 'POST',
      json: true,
      oauth
    }).then(() => postedTweets.push(status)).catch(e => console.error('error with tweet', e.message));
}

const req = async url => await request(url, {json: true});

module.exports = {
    fullyEncodeURI,
    getRSSJson,
    postTweet,
    req
};