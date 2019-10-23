const request = require('request-promise-native');
const moment = require('moment');
const fs = require('fs');

let gamePk = null;
let timestamp;
let diffInterval;

const nationalsTeamId = 120;




async function getTodaysGame () {
    const todaysGameUrl = `http://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&date=${moment().format('MM/DD/YYYY')}&teamId=${nationalsTeamId}`;
    return request(todaysGameUrl)
    .then(response => {
        const data = JSON.parse(response);
        console.log('response', response)
        gamePk = data.dates.length ? data.dates[0].games[0].gamePk : null;
    })
}

async function getData () {
    if (gamePk) {
        const liveFeedUrl = `https://statsapi.mlb.com/api/v1/game/${gamePk}/feed/live`;
        return request(liveFeedUrl)
        .then(response => {
            const data = JSON.parse(response);
            timestamp = data.metaData.timeStamp;
            data.liveData.plays.allPlays.forEach(play => {
                fs.appendFile('./mock-data/results_10-23-2019.txt', play.result.description + '\n');
            })
        })
    }
}

async function getDiff () {
    const diffUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live/diffPatch?language=en&startTimecode=${timestamp}`;
    return request(diffUrl)
    .then(response => {
        const data = JSON.parse(response);
        console.log('data', data)
        const diffs = data.map(diffs => diffs.diff)
        console.log('diffs', diffs)
        if (data.length) {
            console.log('timestamp', data[0].diff[0].value)
            timestamp = data[data.length-1].diff[0].value;
            const result = [];
            data.forEach(group => {
                group.diff.filter(doesEventHaveDescription).forEach(d => {
                    result.push(d);
                });
            });
            const lineScoreUrl = `https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`
            const lineScore = await request(lineScoreUrl)
            const inningStatsText = getInningStatsText(lineScore)
            console.log('result', result)
            result.forEach(event => {
                fs.appendFile('./mock-data/results_10-23-2019.txt', event.value + inningStatsText + '\n')
            })
        }
    })
}

function getInningStatsText(lineScore) {
    const {currentInning, currentInningOrdinal, inningState, outs} = lineScore;
    if (!currentInning) return '';
    const outsString = outs === 1 ? 'out' : 'outs';
    return ` ${inningState} of the ${currentInningOrdinal}. ${outs || 0} ${outsString}`;
}

function doesEventHaveDescription (event) {
    return event.path.endsWith('/description');
};

function setupTodaysGameFeed () {
    return getTodaysGame()
    .then(_ => {
        if (gamePk) {
            console.log('gamePk', gamePk)
            console.log('timestamp', timestamp)
            getData();
            diffInterval = setInterval(getDiff, 30000);
        }
    })
}

setupTodaysGameFeed();
