const fs = require('fs');
const moment = require('moment');
const request = require('request-promise-native');
const Twitter = require('twitter');

let gamePk = null;
let timestamp;
let diffInterval;

const nationalsTeamId = 120;

 
const client = new Twitter({
  consumer_key: '',
  consumer_secret: '',
  access_token_key: '',
  access_token_secret: ''
});

async function getTodaysGame () {
    const todaysGameUrl = `http://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&date=${moment().format('MM/DD/YYYY')}&teamId=${nationalsTeamId}`;
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
        .then(response => {
            const data = JSON.parse(response);
            timestamp = data.metaData.timeStamp;
            console.log('timestamp', timestamp)
            data.liveData.plays.allPlays.forEach(play => {
                const description = play.result.description
                if (description) postTweet(description);
            })
        })
    }
};

function postTweet (status) {
    client.post('statuses/update', {status}, (error, tweet, response) => {
        if (error) console.error('Error posting tweet. ', error);
        fs.appendFileSync(`./mock-data/results/tweet-${timestamp}.txt`, JSON.stringify(tweet), + '\n' + JSON.stringify(response) + '\n');
    });

    fs.appendFileSync('./mock-data/results/results_10-23-2019.txt', status + '\n');
}

async function getDiff () {
    const diffUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live/diffPatch?language=en&startTimecode=${timestamp}`;
    console.log('diffUrl', diffUrl)
    return request(diffUrl)
    .then(async response => {
        const data = JSON.parse(response);
        console.log('data', data)
        // sometimes data is an array but sometimes the data is identical to the live score
        // the callback in getData should be its own function so it can be used here
        // in the cases that data is not an array.
        // to make this work, we will need to be able to determine which plays have already been tweeted.
        // ....ignore this, timestamp just isn't updating, natbe/.
        const diffs = data.map(diffs => diffs.diff)
        console.log('diffs', diffs)
        if (diffs.length) {
            console.log('timestamp', data[0].diff[0].value)
            timestamp = data[data.length-1].diff[0].value;
            console.log('timestamp ', timestamp)
            const result = diffs[0].filter(doesEventHaveDescription);
            const lineScoreUrl = `https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`
            const lineScore = await request(lineScoreUrl)
            const inningStatsText = getInningStatsText(lineScore)
            console.log('inningStatsText', inningStatsText)
            console.log('result', result)
            result.forEach(event => {
                const eventText = event.value + inningStatsText;
                postTweet(eventText);
            })
        }
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
    console.log('event.path: ', event.path)
    console.log('event.value: ', event.value)
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
