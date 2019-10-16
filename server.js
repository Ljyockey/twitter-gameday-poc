const request = require('request-promise-native');
const MLBStatsAPI = require('mlb-stats-api');
const mlbStats = new MLBStatsAPI();
const fs = require('fs');

const gamePk = '599359';
let timestamp = '20191015_221641';

const apiUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
const diffUrl = `https://statsapi.mlb.com/api/v1.1/game/599359/feed/live/diffPatch?language=en&startTimecode=${timestamp}`

async function getData () {
    return request(apiUrl)
    .then(response => {
        const data = JSON.parse(response);
        timestamp = data.metaData.timeStamp
        console.log('timeStamp', timestamp)
        data.liveData.plays.allPlays.forEach(play => {
            fs.appendFile('./mock-data/results.txt', play.result.description + '\n')
        })
    })
}

async function getDiff () {
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
            console.log('result', result)
            result.forEach(event => {
                fs.appendFile('./mock-data/results.txt', event.value + '\n')
            })
        }
    })
}

function doesEventHaveDescription (event) {
    return event.path.endsWith('/description');
};

getData();

setInterval(getDiff, 30000);
