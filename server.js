const MLBStatsAPI = require('mlb-stats-api');
const mlbStats = new MLBStatsAPI();
const fs = require('fs');

const gamePk = '599366'

async function getData () {
    const result = await mlbStats.getGamePlayByPlay({pathParams: {gamePk}})
    fs.writeFile('./mock-data/play-by-play.json', JSON.stringify(result.data))
    console.log(result.data);
}

getData();