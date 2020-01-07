const express = require('express');
const fs = require('fs');
const moment = require('moment');
const request = require('request-promise-native');
const Twitter = require('twitter');

const app = express();
const port = process.env.PORT || 8080;

let gamePk = null;
let timestamp;
let diffInterval;
const postedTweets = [];

const testTeamId = process.env.TEAM_ID || 671; // Leones del Escogido
const sport = process.env.SPORT || 17; // winter leagues. MLB = 1

 
const client = new Twitter({
    consumer_key: process.env.TWITTER_CONSUMER_KEY || '',
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET || '',
    access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY || '',
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET || ''
  });

async function getTodaysGame () {
    const todaysGameUrl = `http://statsapi.mlb.com/api/v1/schedule/games/?sportId=${sport}&date=${moment().format('MM/DD/YYYY')}&teamId=${testTeamId}`;
    return request(todaysGameUrl)
    .then(response => {
        const data = JSON.parse(response);
        gamePk = data.dates.length ? data.dates[0].games[0].gamePk : null;
    })
}

async function getData () {
    if (gamePk) {
        const liveFeedUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
        return request(liveFeedUrl)
        .then(convertInitialDataToTweets)
    }
};

function convertInitialDataToTweets(response) {
    const data = JSON.parse(response);
    timestamp = data.metaData.timeStamp;
    console.log('timestamp', timestamp)
    data.liveData.plays.allPlays.forEach(play => {
        const description = play.result.description
        if (description) postTweet(description);
    })
}

function postTweet (status) {
    if (!postedTweets.includes(status)) {
        client.post('statuses/update', {status}, (error, tweet, response) => {
            if (error) console.error('Error posting tweet. ', error);
            fs.appendFileSync(`./mock-data/results/tweet-${timestamp}.txt`, JSON.stringify(tweet) + '\n' + JSON.stringify(response) + '\n');

            postedTweets.push(status);
        });

        fs.appendFileSync('./mock-data/results/results_10-23-2019.txt', status + '\n');
    };
}

async function getDiff () {
    const diffUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live/diffPatch?language=en&startTimecode=${timestamp}`;
    console.log('diffUrl', diffUrl)
    return request(diffUrl)
    .then(async response => {
        const data = JSON.parse(response);
        fs.appendFileSync(`./mock-data/results/diff-${timestamp}.json`, response + '\n');
        console.log('data', data)
        // sometimes the data comes back as an array, other times, it duplicates the initial data
        // Current theory: it happens when the inning changes
        if (!data.map) return convertInitialDataToTweets(response);
        const diffs = data.map(diffs => diffs.diff)
        console.log('diffs', diffs)
        if (diffs.length) {
            console.log('first timestamp', data[0].diff[0].value)
            timestamp = data[data.length-1].diff[0].value;
            console.log('last timestamp ', timestamp)
            // diffs sometimes doesn't duplicate. Will have to loop through diffs
            const result = diffs[0].filter(doesEventHaveDescription);
            const lineScoreUrl = `https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`
            const lineScore = await request(lineScoreUrl);
            const inningStatsText = getInningStatsText(lineScore);
            console.log('inningStatsText', inningStatsText);
            console.log('result', result);
            result.forEach(event => {
                const eventText = event.value + inningStatsText;
                postTweet(eventText);
            });
        };
    })
}

function getInningStatsText(lineScore) {
    const lsp = JSON.parse(lineScore)
    const {currentInning, currentInningOrdinal, inningState, outs} = lsp;
    if (!currentInning) return '';
    const outsString = outs === 1 ? 'out' : 'outs';
    return ` ${inningState} of the ${currentInningOrdinal}. ${outs || 0} ${outsString}`;
}

function doesEventHaveDescription (event) {
    console.log('event: ', event);
    return event.value && event.path.endsWith('/result/description');
};

function setupTodaysGameFeed () {
    return getTodaysGame()
    .then(_ => {
        if (gamePk) {
            console.log('gamePk', gamePk)
            getData();
            diffInterval = setInterval(getDiff, 30000);
        }
    })
}

setupTodaysGameFeed();

app.listen(port, () => console.log(`App listening on port ${port}!`));
